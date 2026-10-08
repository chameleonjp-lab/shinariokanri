import type { Entity, ID, ProjectData, RichText, TypedValue } from './types';
import { dialogueContentHash } from './production';
import { collectReferences, validateProject } from './model';
import { strToU8, zipSync } from 'fflate';
import { createProjection, PROJECTION_FIELDS } from './projection';
import type { ProjectedBlock, ProjectedEntity, ProjectionIssue, ProjectionOmission, PublicProjection, PublicValue } from './projection';

export type ExportProfile = 'reader' | 'runtime_json' | 'localization' | 'production' | 'consultation' | 'playable_preview';
export interface ExportArtifact { filename: string; mimeType: string; content: string; bytes?: Uint8Array<ArrayBuffer> }
/** Preview is private author information. Only artifact.content is the deliverable. */
export interface ExportPreview {
  profile: ExportProfile;
  sourceRevision: string;
  includedCount: number;
  omissions: ProjectionOmission[];
  warnings: string[];
  assetCount: number;
  assetBytesIncluded: false;
}
export type ExportResult =
  | { ok: true; artifact: ExportArtifact; artifacts: ExportArtifact[]; preview: ExportPreview }
  | { ok: false; issues: ProjectionIssue[]; preview?: ExportPreview };
export interface RuntimeExportProfile {
  profileId: string;
  profileVersion: string;
  schemaVersion: '1.0.0';
  supportedNodeTypes: readonly string[];
  supportedConditions: readonly string[];
  supportedEffects: readonly string[];
  externalContracts: readonly string[];
  assetTypes: readonly string[];
  omissions: readonly string[];
}
export const GENERIC_RUNTIME_PROFILE: Readonly<RuntimeExportProfile> = Object.freeze({
  profileId: 'scenario-runtime', profileVersion: '1.0.0', schemaVersion: '1.0.0',
  supportedNodeTypes: Object.freeze(['scene', 'choice', 'automatic', 'call', 'entry', 'exit', 'terminal']),
  supportedConditions: Object.freeze(['constant', 'all', 'any', 'not', 'compare', 'item', 'known', 'visited', 'external']),
  supportedEffects: Object.freeze(['set', 'add', 'grant', 'consume', 'move', 'assert', 'mark_seen', 'reset']),
  externalContracts: Object.freeze(['boolean', 'integer', 'enum']),
  assetTypes: Object.freeze(['image/png', 'image/jpeg', 'image/gif', 'image/webp', 'audio/wav', 'audio/mpeg', 'application/pdf']),
  omissions: Object.freeze(['author_notes', 'rejected_and_alternate_records', 'private_names_and_aliases', 'original_source_ids_unless_explicitly_approved', 'asset_bytes', 'playtest_traces']),
});
export const PLAYABLE_PREVIEW_PROFILE: Readonly<RuntimeExportProfile> = Object.freeze({
  ...GENERIC_RUNTIME_PROFILE,
  supportedNodeTypes: Object.freeze(['scene', 'choice', 'automatic', 'entry', 'exit', 'terminal']),
  supportedConditions: Object.freeze(['constant', 'all', 'any', 'not', 'compare', 'visited']),
  supportedEffects: Object.freeze(['set', 'add', 'reset', 'mark_seen']),
  externalContracts: Object.freeze([]), assetTypes: Object.freeze([]),
});
export interface ExportOptions {
  profile: ExportProfile;
  projectionProfileId: ID;
  /** Exactly one version selector is required; never fall back from a snapshot to live text. */
  targetRevision?: string;
  targetVersionId?: ID;
  readerFormat?: 'markdown' | 'html';
  writingMode?: 'horizontal' | 'vertical';
  runtimeProfile?: RuntimeExportProfile;
  sourceLanguage?: string;
  /** Filters production deliverables by authored task assignment; identity IDs stay private. */
  assigneeId?: ID;
  consultationContext?: { focusIds?: ID[]; beforeValues?: Record<ID, TypedValue>; afterValues?: Record<ID, TypedValue> };
}
const record = (value: unknown): Record<string, unknown> | undefined => value !== null && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : undefined;
const has = (value: Record<string, unknown>, key: string) => Object.prototype.hasOwnProperty.call(value, key);
const revisionPattern = /^(?:0|[1-9][0-9]*)$/;

function canonical(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  return `{${Object.entries(value).filter(([, child]) => child !== undefined).sort(([left], [right]) => left < right ? -1 : left > right ? 1 : 0).map(([key, child]) => `${JSON.stringify(key)}:${canonical(child)}`).join(',')}}`;
}
async function hash(value: unknown): Promise<string> {
  const bytes = new TextEncoder().encode(canonical(value));
  return [...new Uint8Array(await crypto.subtle.digest('SHA-256', bytes))].map(value => value.toString(16).padStart(2, '0')).join('');
}

async function selectSource(project: ProjectData, options: ExportOptions): Promise<{ ok: true; project: ProjectData } | { ok: false; issues: ProjectionIssue[] }> {
  if ((options.targetRevision === undefined) === (options.targetVersionId === undefined)) return { ok: false, issues: [{ code: 'VALIDATION_FAILED', message: '出力する正本の版を一つ指定してください。' }] };
  if (options.targetRevision !== undefined) {
    if (!revisionPattern.test(options.targetRevision) || options.targetRevision !== project.revision) return { ok: false, issues: [{ code: 'VALIDATION_FAILED', message: '選択した版と出力元の版が一致しません。対象版を読み直してください。' }] };
    return { ok: true, project };
  }
  const snapshot = project.snapshots.find(snapshot => snapshot.id === options.targetVersionId);
  if (!snapshot || snapshot.content.projectId !== project.projectId) return { ok: false, issues: [{ code: 'REFERENCE_INVALID', message: '選択した公開版の保存内容が見つかりません。', entityId: options.targetVersionId }] };
  // Private checkpoints, reviews and anchors can reference another pinned version.
  // Keep only that immutable dependency closure for validation, never live content.
  const dependencies: ProjectData['snapshots'] = [];
  const pending = [snapshot], visited = new Set<ID>();
  while (pending.length) {
    const dependency = pending.pop()!;
    if (visited.has(dependency.id)) continue;
    visited.add(dependency.id);
    if (project.snapshots.filter(candidate => candidate.id === dependency.id).length !== 1 || dependency.content.projectId !== project.projectId) return { ok: false, issues: [{ code: 'REFERENCE_INVALID', message: '保存版の依存内容を一意に確認できません。', entityId: dependency.id }] };
    if (await hash(dependency.content) !== dependency.contentHash) return { ok: false, issues: [{ code: 'VALIDATION_FAILED', message: '保存版の内容hashが一致しないため出力を停止しました。', entityId: dependency.id }] };
    dependencies.push(dependency);
    for (const entity of dependency.content.entities) for (const reference of collectReferences(entity)) if (reference.scope === 'snapshot') {
      const target = project.snapshots.find(candidate => candidate.id === reference.id);
      if (target && !visited.has(target.id)) pending.push(target);
    }
  }
  return { ok: true, project: { ...structuredClone(snapshot.content), snapshots: dependencies, history: [] } };
}

/** Captures the input before hashing, so editing during an export cannot mix versions. */
export async function exportProject(input: ProjectData, options: ExportOptions): Promise<ExportResult> {
  try { return await exportCapturedProject(input, structuredClone(options)); }
  catch { return { ok: false, issues: [{ code: 'VALIDATION_FAILED', message: '出力に必要な情報または参照が不正です。作品を確認してください。' }] }; }
}
async function exportCapturedProject(input: ProjectData, options: ExportOptions): Promise<ExportResult> {
  let captured: ProjectData;
  try { captured = structuredClone(input); } catch { return { ok: false, issues: [{ code: 'VALIDATION_FAILED', message: '作品の出力内容を固定できませんでした。' }] }; }
  const selected = await selectSource(captured, options);
  if (!selected.ok) return selected;
  const project = selected.project;
  const sourceValidation = validateProject(project);
  if (!sourceValidation.ok) return { ok: false, issues: sourceValidation.issues.map(issue => ({ code: issue.code === 'REFERENCE_INVALID' ? 'REFERENCE_INVALID' as const : 'VALIDATION_FAILED' as const, message: issue.message, field: issue.path })) };
  const policyEntity = project.entities.find((entity): entity is Entity<'projection_profile'> => entity.id === options.projectionProfileId && entity.kind === 'projection_profile' && !entity.deletedAt);
  if (policyEntity?.data.sourceVersionId != null && policyEntity.data.sourceVersionId !== options.targetVersionId && policyEntity.data.sourceVersionId !== project.revision) return { ok: false, issues: [{ code: 'VALIDATION_FAILED', message: 'この公開範囲が対象とする版と、選択した版が一致しません。', entityId: policyEntity.id, field: 'sourceVersionId' }] };
  const executable = options.profile === 'runtime_json' || options.profile === 'playable_preview';
  const result = createProjection(project, options.projectionProfileId, { strictReferences: executable, confirmedOnly: options.profile !== 'consultation', targetVersionId: options.targetVersionId });
  const preview: ExportPreview = {
    profile: options.profile, sourceRevision: project.revision, includedCount: result.ok ? result.projection.entities.length : 0,
    omissions: result.omissions, warnings: ['公開用の文面は作者が内容を確認してください。文章から秘密を自動で判定する機能ではありません。'],
    assetCount: result.ok ? result.projection.entities.filter(entity => entity.kind === 'attachment').length : 0, assetBytesIncluded: false,
  };
  if (!result.ok) return { ok: false, issues: result.issues, preview };
  const projection = result.projection;
  const policy = policyEntity!.data;
  const publicVersionLabel = policy.publicVersionLabel ?? '公開版';
  const artifact = (filename: string, mimeType: string, content: string): ExportArtifact => ({ filename, mimeType, content });
  const succeed = (artifacts: ExportArtifact[]): ExportResult => ({ ok: true, artifact: artifacts[0], artifacts, preview });
  if (preview.assetCount) preview.warnings.push('この出力に素材bytesは含まれません。素材の対応と取得状況は別に確認してください。');
  if (projection.calendars.length) preview.warnings.push('公開用の暦・月・原点のラベルは匿名の表記に置き換えます。tickと暦の数値定義は保持します。');
  switch (options.profile) {
    case 'reader': {
      const format = options.readerFormat ?? 'markdown';
      return succeed([artifact(`reader.${format === 'html' ? 'html' : 'md'}`, format === 'html' ? 'text/html;charset=utf-8' : 'text/markdown;charset=utf-8', format === 'html' ? renderReaderHtml(projection, publicVersionLabel, options.writingMode ?? 'horizontal') : renderReaderMarkdown(projection, publicVersionLabel))]);
    }
    case 'runtime_json': {
      const runtimeProfile = options.runtimeProfile ?? GENERIC_RUNTIME_PROFILE;
      const issues = validateRuntimeExport(project, projection, result.idMap, policy, runtimeProfile);
      if (issues.length) return { ok: false, issues, preview };
      const contentVersionId = `sha256:${await hash(projection)}`;
      const payload = {
        format: 'scenario-runtime', formatVersion: '1.0.0', profile: publicRuntimeProfile(runtimeProfile), title: projection.title, versionLabel: publicVersionLabel, contentVersionId,
        hashScope: 'public_projection',
        entities: projection.entities, relations: projection.relations, calendars: projection.calendars,
        flow: { graphs: byKind(projection, 'flow_graph'), nodes: byKind(projection, 'flow_node'), edges: byKind(projection, 'flow_edge') },
        dialogue: byKind(projection, 'dialogue_line'), scenes: byKind(projection, 'scene'), characters: byKind(projection, 'character'),
        variables: byKind(projection, 'variable'), effects: byKind(projection, 'effect'), items: byKind(projection, 'item'), assertions: byKind(projection, 'assertion'),
        quests: byKind(projection, 'quest'), disclosures: byKind(projection, 'disclosure'), cues: byKind(projection, 'cue'),
        externalContracts: byKind(projection, 'external_contract'), assets: byKind(projection, 'attachment'),
        externalEvidence: 'not_included', assetBytesIncluded: false,
      };
      return succeed([artifact('runtime.json', 'application/json;charset=utf-8', JSON.stringify(payload, null, 2))]);
    }
    case 'localization': case 'production': {
      const issues = stableIdIssues(result.idMap, policy);
      for (const entity of projection.entities) if (entity.kind === 'localization' || entity.kind === 'recording') {
        if (typeof entity.data.sourceLineId !== 'string' || !projection.entities.some(line => line.kind === 'dialogue_line' && line.id === entity.data.sourceLineId)) issues.push({ code: 'REFERENCE_INVALID', message: '翻訳・収録の元台詞を公開範囲に含めてください。', field: 'sourceLineId' });
        if (typeof entity.data.language !== 'string' || !validLanguage(entity.data.language)) issues.push({ code: 'VALIDATION_FAILED', message: '翻訳・収録の公開用言語コードを指定してください。', field: 'language' });
      }
      if (issues.length) return { ok: false, issues, preview };
      const language = options.sourceLanguage ?? 'ja';
      if (!validLanguage(language)) return { ok: false, issues: [{ code: 'VALIDATION_FAILED', message: '有効な言語コードを指定してください。', field: 'sourceLanguage' }], preview };
      let assigned: Set<ID> | undefined;
      if (options.assigneeId) {
        assigned = new Set(project.entities.filter(entity => entity.kind === 'production_task' && !entity.deletedAt && !['rejected', 'alternate'].includes(entity.status) && entity.data.assigneeId === options.assigneeId).flatMap(entity => entity.kind === 'production_task' ? entity.data.targetIds : []));
        for (const id of [...assigned]) { const target = project.entities.find(entity => entity.id === id); if (target?.kind === 'scene') target.data.dialogueLineIds?.forEach(lineId => assigned!.add(lineId)); }
        if (!assigned.size) return { ok: false, issues: [{ code: 'REFERENCE_INVALID', message: 'この担当者に対応する制作タスクの対象がありません。対象版・担当・公開範囲を確認してください。' }], preview };
      }
      const exportedLines = await localizedLines(project, projection, result.idMap, language, assigned);
      if (assigned && !exportedLines.length) return { ok: false, issues: [{ code: 'REFERENCE_INVALID', message: '担当の台詞・翻訳・収録が公開範囲にありません。公開範囲を確認してください。' }], preview };
      if (assigned) preview.warnings.push('作者が指定した制作タスクの担当範囲へ絞っています。担当者の識別情報は公開ファイルへ含めません。');
      const selectedLineIds = new Set(exportedLines.map(line => line.lineId));
      const assetIds = new Set(exportedLines.flatMap(line => line.recordings.flatMap(recording => recording.attachmentId ? [recording.attachmentId] : [])));
      for (const line of byKind(projection, 'dialogue_line').filter(line => selectedLineIds.has(line.id))) for (const cue of byKind(projection, 'cue').filter(cue => Array.isArray(line.data.cueIds) && line.data.cueIds.includes(cue.id))) if (typeof cue.data.attachmentId === 'string') assetIds.add(cue.data.attachmentId);
      const payload = { format: 'scenario-localization', formatVersion: '1.0.0', title: projection.title, versionLabel: publicVersionLabel, hashScope: 'projected_line', lines: exportedLines, terminology: byKind(projection, 'terminology'), assets: byKind(projection, 'attachment').filter(asset => !assigned || assetIds.has(asset.id)), assetBytesIncluded: false };
      preview.warnings.push('台詞hashは公開用本文・ルビ・話者・演出から計算します。作者原稿のhashは公開ファイルに含めません。');
      return succeed([
        artifact('localization.json', 'application/json;charset=utf-8', JSON.stringify(payload, null, 2)),
        artifact('localization.md', 'text/markdown;charset=utf-8', renderLocalizationMarkdown(projection.title, publicVersionLabel, exportedLines)),
      ]);
    }
    case 'consultation': {
      const context = consultationContext(projection, project, result.idMap, policy, options.consultationContext);
      if (!context.ok) return { ok: false, issues: context.issues, preview };
      const content = `${renderReaderMarkdown(projection, publicVersionLabel)}\n## 相談の対象\n\n${context.markdown}\n## 参照ID\n\n${projection.entities.map(entity => `- ${escapeMarkdown(entity.id)}: ${escapeMarkdown(entity.name)} (${escapeMarkdown(entity.kind)})`).join('\n')}\n\nこのファイルは手動で持ち出す相談資料です。取り込んだ提案は作者別案として扱います。\n`;
      return succeed([artifact('consultation.md', 'text/markdown;charset=utf-8', content)]);
    }
    case 'playable_preview': {
      const issues = validateRuntimeExport(project, projection, result.idMap, policy, PLAYABLE_PREVIEW_PROFILE);
      issues.push(...validatePlayableSubset(project, projection, result.idMap));
      if (issues.length) return { ok: false, issues, preview };
      const output = await buildPlayableArchive(projection, publicVersionLabel);
      preview.warnings.push('簡易試遊は対応した状態・条件・効果だけを実行します。実ゲームでの確認結果を示すものではありません。');
      return succeed([output]);
    }
    default: return { ok: false, issues: [{ code: 'EXPORT_UNSUPPORTED', message: 'この出力目的には対応していません。' }], preview };
  }
}

function byKind(projection: PublicProjection, kind: ProjectedEntity['kind']): ProjectedEntity[] { return projection.entities.filter(entity => entity.kind === kind); }
function publicRuntimeProfile(profile: RuntimeExportProfile): RuntimeExportProfile {
  return { profileId: profile.profileId, profileVersion: profile.profileVersion, schemaVersion: profile.schemaVersion,
    supportedNodeTypes: [...profile.supportedNodeTypes], supportedConditions: [...profile.supportedConditions], supportedEffects: [...profile.supportedEffects],
    externalContracts: [...profile.externalContracts], assetTypes: [...profile.assetTypes], omissions: [...GENERIC_RUNTIME_PROFILE.omissions] };
}
function stableIdIssues(idMap: Record<string, string>, policy: Entity<'projection_profile'>['data']): ProjectionIssue[] {
  return policy.idPolicy !== 'preserve' && Object.keys(idMap).some(id => !policy.publicIds?.[id])
    ? [{ code: 'EXPORT_UNSUPPORTED', message: '制作出力には安定した公開IDを全対象へ指定するか、選択した正本IDの公開を明示してください。', field: 'publicIds' }]
    : [];
}
function presentationDisclosures(project: ProjectData, idMap: Record<string, string>): Entity<'disclosure'>[] {
  const anchors = new Set<ID>();
  for (const entity of project.entities) if (entity.kind === 'flow_node' && has(idMap, entity.id)) {
    anchors.add(entity.id);
    if (entity.data.sceneId) anchors.add(entity.data.sceneId);
  }
  // Arrival anchors target the active node or its scene. Retain every such
  // dependency conservatively, including anchors with a blockId or lineId.
  return project.entities.filter((entity): entity is Entity<'disclosure'> => entity.kind === 'disclosure' && !entity.deletedAt && entity.status !== 'rejected' && anchors.has(entity.data.anchor.entityId));
}
const SAFE_RUNTIME_OMISSIONS: Readonly<Record<string, readonly string[]>> = {
  character: ['aliases', 'authorNotes', 'goals', 'voiceRules'], group: [], event: ['authorNotes', 'constraints'], place: ['aliases', 'changes'], item: ['changes'],
  scene: ['authorNotes', 'goals', 'conflicts', 'results', 'newInformation'], chapter: ['authorNotes', 'structureRole'], dialogue_line: ['originLineIds', 'replacedByLineIds', 'lineage'],
  variable: [], flow_node: [], flow_edge: [], flow_graph: [], effect: [], assertion: ['reason', 'validity'], foreshadow: ['exceptions', 'deadline'], disclosure: ['targetScope'],
  attachment: ['assetPath', 'licenseNote', 'provenanceId', 'stage', 'revisionHistory', 'mediaType', 'contentHash', 'byteSize'], source: ['accessedAt', 'excerptLocation', 'attachmentId'],
  cue: ['stage'], quest: ['gameplaySpecIds'], lore: ['aliases', 'sourceIds'], recording: ['sourceHash', 'notes', 'reviewedBy'], localization: ['sourceHash', 'reviewedBy'],
};
function validateRuntimeExport(project: ProjectData, projection: PublicProjection, idMap: Record<string, string>, policy: Entity<'projection_profile'>['data'], profile: RuntimeExportProfile): ProjectionIssue[] {
  const issues: ProjectionIssue[] = [];
  const fail = (message: string, entityId?: string, field?: string) => { issues.push({ code: 'EXPORT_UNSUPPORTED', message, ...(entityId ? { entityId } : {}), ...(field ? { field } : {}) }); };
  if (profile.profileId !== 'scenario-runtime' || profile.schemaVersion !== '1.0.0' || profile.profileVersion !== '1.0.0') fail('この制作出力は汎用scenario-runtime 1.0.0専用です。未実装のゲームエンジンへ直接変換できません。');
  for (const field of ['supportedNodeTypes', 'supportedConditions', 'supportedEffects', 'externalContracts', 'assetTypes'] as const) if (!Array.isArray(profile[field]) || profile[field].some(value => !GENERIC_RUNTIME_PROFILE[field].includes(value))) fail('対応先の機能一覧に未対応の種類が含まれています。', undefined, field);
  const included = new Set(Object.keys(idMap));
  issues.push(...stableIdIssues(idMap, policy));
  for (const disclosure of presentationDisclosures(project, idMap)) {
    if (disclosure.data.anchor.positionStatus === 'unresolved') fail('提示位置が不明な開示があります。本文へ再リンクしてから実行用出力を作成してください。', disclosure.id, 'anchor');
    if (!disclosure.data.knowledgeEffects?.length) continue;
    const emitted = projection.entities.find(entity => entity.id === idMap[disclosure.id]);
    const effects = emitted?.data.knowledgeEffects;
    if (!emitted || !Array.isArray(effects) || effects.length !== disclosure.data.knowledgeEffects.length || disclosure.data.knowledgeEffects.some((id, index) => !idMap[id] || effects[index] !== idMap[id])) fail('提示時に状態を変える開示と効果が公開範囲から除かれています。制作の動作を保持できないため出力を停止しました。', disclosure.id, 'knowledgeEffects');
  }
  for (const entity of project.entities) {
    if (!included.has(entity.id)) continue;
    const projected = projection.entities.find(projected => projected.id === idMap[entity.id])!;
    const schema = PROJECTION_FIELDS[entity.kind] ?? {};
    const data = entity.data as unknown as Record<string, unknown>;
    if (Object.keys(entity.customValues).length && ['flow_node', 'flow_edge', 'flow_graph', 'variable', 'effect', 'quest'].includes(entity.kind)) fail('制作処理に追加したカスタム項目の意味を対応先で表せません。', entity.id, 'customValues');
    for (const [field, value] of Object.entries(data)) {
      if (value == null || value === '' || (Array.isArray(value) && !value.length)) continue;
      if (!(field in schema) && !SAFE_RUNTIME_OMISSIONS[entity.kind]?.includes(field)) fail('この制作処理の項目は未対応です。黙って省略せず出力を停止しました。', entity.id, field);
    }
    const required: Record<string, string[]> = {
      flow_node: ['nodeType'], flow_edge: ['fromId', 'toId', 'edgeType'], flow_graph: ['nodeIds', 'edgeIds', 'entryIds', 'exitIds'],
      variable: ['key', 'valueType', 'scope', 'initial', 'allowed'], effect: ['operation', 'targetId'], external_contract: ['key', 'owner', 'inputType', 'outputType', 'missingPolicy'],
      dialogue_line: ['text'], quest: ['key', 'stateVariableId'], item: ['itemMode'], assertion: ['subjectId', 'predicate', 'value', 'truthKind'], disclosure: ['foreshadowId', 'anchor', 'stage', 'role'],
    };
    for (const field of required[entity.kind] ?? []) if (!has(projected.data, field)) fail('制作に必要な項目が公開範囲から除かれています。', entity.id, field);
    // Omitting an optional author field is safe; omitting a present behavior field is not.
    const behaviorFields = new Set(['condition', 'gate', 'trigger', 'executionPolicy', 'fallbackId', 'effectIds', 'knowledgeEffects', 'sceneId', 'childGraphId', 'parentGraphId', 'choiceLineId', 'dialogueLineIds', 'blockIds', 'priority', 'initial', 'allowed', 'ownerId', 'externalContractId', 'transitionRules', 'value', 'instanceId', 'cueIds', 'stateVariableId']);
    for (const [field, value] of Object.entries(data)) if (behaviorFields.has(field) && value != null && !(Array.isArray(value) && !value.length) && !has(projected.data, field)) fail('分岐や状態の動作を変える項目を除外できません。', entity.id, field);
    if (entity.kind === 'flow_node') {
      if (!profile.supportedNodeTypes.includes(entity.data.nodeType)) fail('このノード種類を対応先で表せません。', entity.id, 'nodeType');
      if (entity.data.nodeType === 'terminal' && !projected.data.terminalReason) fail('公開用の終端理由を指定してください。', entity.id, 'terminalReason');
      if (entity.data.nodeType === 'call' && !projected.data.childGraphId) fail('呼び出すグラフの公開参照が必要です。', entity.id, 'childGraphId');
    }
    if (entity.kind === 'flow_edge' && typeof entity.data.toId !== 'string') fail('未完成の分岐先を制作出力には含められません。', entity.id, 'toId');
    if (entity.kind === 'effect' && !profile.supportedEffects.includes(entity.data.operation)) fail('この効果を対応先で表せません。', entity.id, 'operation');
    if (entity.kind === 'variable') {
      if (entity.data.initial.type === 'unknown' || entity.data.initial.type !== entity.data.valueType) fail('変数の初期値を正しい型で確定してください。', entity.id, 'initial');
      if (entity.data.initial.type === 'enum' && !(entity.data.allowed.values ?? []).includes(entity.data.initial.value)) fail('初期値が許可列挙に含まれていません。', entity.id, 'initial');
      if (entity.data.initial.type === 'integer' && (entity.data.initial.value < (entity.data.allowed.min ?? -2147483648) || entity.data.initial.value > (entity.data.allowed.max ?? 2147483647))) fail('変数の初期値が許可範囲から外れています。', entity.id, 'initial');
      if (entity.data.valueType === 'enum' && !entity.data.allowed.values?.length) fail('列挙変数の許可値を指定してください。', entity.id, 'allowed');
      if (entity.data.externalContractId && !projection.entities.some(candidate => candidate.id === idMap[entity.data.externalContractId!] && candidate.kind === 'external_contract')) fail('外部値の契約が公開範囲にありません。', entity.id, 'externalContractId');
    }
    if (entity.kind === 'external_contract' && (!profile.externalContracts.includes(entity.data.inputType) || !profile.externalContracts.includes(entity.data.outputType))) fail('この外部値の型を対応先で表せません。', entity.id);
    if (entity.kind === 'attachment' && !profile.assetTypes.includes(entity.data.mediaType)) fail('この素材形式を対応先で表せません。', entity.id, 'mediaType');
    for (const field of ['gate', 'condition']) if (data[field] != null) checkConditionCapability(data[field], profile, message => fail(message, entity.id, field));
  }
  if (!byKind(projection, 'flow_graph').length) fail('制作出力には公開されたフローグラフが必要です。');
  const keys = byKind(projection, 'variable').map(variable => variable.data.key);
  if (new Set(keys).size !== keys.length) fail('公開用の変数キーが重複しています。', undefined, 'key');
  return issues;
}
function checkConditionCapability(input: unknown, profile: RuntimeExportProfile, fail: (message: string) => void, depth = 1): void {
  const ast = record(input);
  if (!ast || depth > 16 || typeof ast.op !== 'string' || !profile.supportedConditions.includes(ast.op)) { fail('この条件を対応先で表せません。'); return; }
  if (Array.isArray(ast.children)) ast.children.forEach(child => checkConditionCapability(child, profile, fail, depth + 1));
  if (ast.child != null) checkConditionCapability(ast.child, profile, fail, depth + 1);
}

const escapeHtml = (value: string): string => value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
const escapeMarkdown = (value: string): string => escapeHtml(value).replace(/([\\`*_[\]{}()#+.!|~>-])/g, '\\$1');
function blocks(value: PublicValue | undefined): ProjectedBlock[] { return Array.isArray(value) ? value as unknown as ProjectedBlock[] : []; }
function blockHtml(block: ProjectedBlock, markdown = false): string {
  const escape = markdown ? escapeMarkdown : escapeHtml;
  const letters = [...block.text];
  let position = 0, output = '';
  for (const ruby of [...block.ruby ?? []].sort((left, right) => left.start - right.start)) {
    if (ruby.start < position || ruby.end > letters.length) continue;
    output += escape(letters.slice(position, ruby.start).join(''));
    output += `<ruby>${escape(letters.slice(ruby.start, ruby.end).join(''))}<rt>${escape(ruby.text)}</rt></ruby>`;
    position = ruby.end;
  }
  output += escape(letters.slice(position).join(''));
  for (const link of block.links ?? []) output += ` <a href="#${escapeHtml(link.blockId ?? link.lineId ?? link.targetId)}">関連</a>`;
  return output;
}
function readingEntities(projection: PublicProjection): ProjectedEntity[] {
  const scenes = new Map(byKind(projection, 'scene').map(scene => [scene.id, scene]));
  const order: ProjectedEntity[] = [], seen = new Set<string>();
  const add = (entity: ProjectedEntity) => { if (!seen.has(entity.id)) { seen.add(entity.id); order.push(entity); } };
  for (const chapter of byKind(projection, 'chapter')) { add(chapter); for (const id of Array.isArray(chapter.data.sceneIds) ? chapter.data.sceneIds : []) if (typeof id === 'string' && scenes.has(id)) add(scenes.get(id)!); }
  for (const entity of projection.entities) if (['scene', 'dialogue_line', 'character', 'event', 'place', 'item', 'note', 'lore', 'goal', 'terminology', 'media_variant'].includes(entity.kind)) add(entity);
  return order;
}
function entityDocuments(entity: ProjectedEntity): [string, ProjectedBlock[]][] {
  return ['body', 'text', 'summary', 'description', 'usageNotes'].filter(field => blocks(entity.data[field]).length).map(field => [field, blocks(entity.data[field])]);
}
export function renderReaderMarkdown(projection: PublicProjection, versionLabel = '公開版'): string {
  const output = [`# ${escapeMarkdown(projection.title)}`, '', `対象版: ${escapeMarkdown(versionLabel)}`, ''];
  for (const entity of readingEntities(projection)) {
    output.push(`<a id="${escapeHtml(entity.id)}"></a>`, `## ${escapeMarkdown(entity.name || entity.kind)}`, '');
    if (entity.status !== 'confirmed') output.push(`採用状態: ${escapeMarkdown(entity.status)}`, '');
    for (const [field, document] of entityDocuments(entity)) {
      if (field === 'summary' && entityDocuments(entity).length > 1) output.push('### 要約', '');
      for (const block of document) {
        output.push(`<a id="${escapeHtml(block.id)}"></a>`);
        const prefix = block.kind === 'heading' ? '### ' : block.kind === 'quote' ? '> ' : block.kind === 'list_item' ? '- ' : '';
        // The only embedded HTML is our fixed ruby/link template; user text is escaped.
        output.push(`${prefix}${block.ruby?.length || block.links?.length ? blockHtml(block, true) : escapeMarkdown(block.text)}`, '');
      }
    }
  }
  return `${output.join('\n')}\n`;
}
export function renderReaderHtml(projection: PublicProjection, versionLabel = '公開版', writingMode: 'horizontal' | 'vertical' = 'horizontal'): string {
  const sections = readingEntities(projection).map(entity => `<section id="${escapeHtml(entity.id)}"><h2>${escapeHtml(entity.name || entity.kind)}</h2>${entityDocuments(entity).map(([, document]) => document.map(block => {
    const tag = block.kind === 'heading' ? 'h3' : block.kind === 'quote' ? 'blockquote' : 'p';
    return `<${tag} id="${escapeHtml(block.id)}">${blockHtml(block)}</${tag}>`;
  }).join('')).join('')}</section>`).join('\n');
  return `<!doctype html>\n<html lang="ja"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; base-uri 'none'; form-action 'none'"><title>${escapeHtml(projection.title)}</title><style>body{font-family:serif;line-height:1.9;margin:2rem;overflow-wrap:anywhere;${writingMode === 'vertical' ? 'writing-mode:vertical-rl;' : ''}}section{margin-block:2rem}rt{font-size:.55em}</style></head><body><h1>${escapeHtml(projection.title)}</h1><p>対象版: ${escapeHtml(versionLabel)}</p>${sections}</body></html>\n`;
}

function validLanguage(value: string): boolean { try { return value.length < 64 && Intl.getCanonicalLocales(value).length === 1; } catch { return false; } }
interface ExportedLine {
  lineId: string; language: string; speakerId: string | null; sourceHash: string; text: PublicValue;
  translations: { id: string; language: string; text: PublicValue; stage: string }[];
  recordings: { id: string; language: string; attachmentId: string | null; stage: string }[];
}
async function localizedLines(project: ProjectData, projection: PublicProjection, idMap: Record<string, string>, language: string, assigned?: ReadonlySet<ID>): Promise<ExportedLine[]> {
  const lines: ExportedLine[] = [];
  for (const line of byKind(projection, 'dialogue_line')) {
    const original = project.entities.find((entity): entity is Entity<'dialogue_line'> => entity.kind === 'dialogue_line' && idMap[entity.id] === line.id)!;
    const assignedLine = assigned?.has(original.id);
    if (assigned && !assignedLine && !project.entities.some(entity => (entity.kind === 'localization' || entity.kind === 'recording') && entity.data.sourceLineId === original.id && assigned.has(entity.id))) continue;
    const allowed = (publicId: string) => !assigned || assignedLine || project.entities.some(entity => idMap[entity.id] === publicId && assigned.has(entity.id));
    const originalHash = await dialogueContentHash(project, original);
    const sourceHash = await hash({ text: blocks(line.data.text).map(block => ({ kind: block.kind, text: block.text, ruby: block.ruby ?? [] })), speakerId: line.data.speakerId ?? null, cues: byKind(projection, 'cue').filter(cue => Array.isArray(line.data.cueIds) && line.data.cueIds.includes(cue.id)).map(cue => cue.data) });
    const translations = byKind(projection, 'localization').filter(translation => translation.data.sourceLineId === line.id && allowed(translation.id)).map(translation => {
      const source = project.entities.find((entity): entity is Entity<'localization'> => entity.kind === 'localization' && idMap[entity.id] === translation.id)!;
      return { id: translation.id, language: String(translation.data.language ?? ''), text: translation.data.text ?? [], stage: source.data.sourceHash !== originalHash ? 'needs_review' : String(translation.data.stage ?? 'draft') };
    });
    const recordings = byKind(projection, 'recording').filter(recording => recording.data.sourceLineId === line.id && allowed(recording.id)).map(recording => {
      const source = project.entities.find((entity): entity is Entity<'recording'> => entity.kind === 'recording' && idMap[entity.id] === recording.id)!;
      return { id: recording.id, language: String(recording.data.language ?? ''), attachmentId: typeof recording.data.attachmentId === 'string' ? recording.data.attachmentId : null, stage: source.data.sourceHash !== originalHash ? 'needs_review' : String(recording.data.stage ?? 'planned') };
    });
    lines.push({ lineId: line.id, language, speakerId: typeof line.data.speakerId === 'string' ? line.data.speakerId : null, sourceHash, text: line.data.text ?? [], translations, recordings });
  }
  return lines;
}
function renderLocalizationMarkdown(title: string, versionLabel: string, lines: ExportedLine[]): string {
  const plain = (value: PublicValue) => blocks(value).map(block => block.text).join('\n');
  const cell = (value: string) => escapeMarkdown(value).replace(/\r?\n/g, '<br>');
  const output = [`# ${escapeMarkdown(title)} 翻訳・収録用`, '', `対象版: ${escapeMarkdown(versionLabel)}`, '', '| 台詞ID | 言語 | 公開原文hash | 原稿 | 状態 |', '| --- | --- | --- | --- | --- |'];
  for (const line of lines) {
    output.push(`| ${cell(line.lineId)} | ${cell(line.language)} | ${line.sourceHash} | ${cell(plain(line.text))} | 原文 |`);
    for (const translation of line.translations) output.push(`| ${cell(line.lineId)} | ${cell(translation.language)} | ${line.sourceHash} | ${cell(plain(translation.text))} | ${cell(translation.stage)} |`);
  }
  return `${output.join('\n')}\n`;
}

function consultationContext(projection: PublicProjection, project: ProjectData, idMap: Record<string, string>, policy: Entity<'projection_profile'>['data'], context?: ExportOptions['consultationContext']): { ok: true; markdown: string } | { ok: false; issues: ProjectionIssue[] } {
  const issues: ProjectionIssue[] = [], output: string[] = [];
  for (const id of context?.focusIds ?? []) {
    const visible = projection.entities.find(entity => entity.id === idMap[id]);
    if (!visible) issues.push({ code: 'REFERENCE_INVALID', message: '相談の対象が公開範囲にありません。', entityId: id });
    else output.push(`- ${escapeMarkdown(visible.id)}: ${escapeMarkdown(visible.name)}`);
  }
  for (const [label, values] of [['前の状態', context?.beforeValues], ['後の状態', context?.afterValues]] as const) if (values) {
    output.push('', `### ${label}`, '');
    for (const [id, value] of Object.entries(values)) {
      const source = project.entities.find((entity): entity is Entity<'variable'> => entity.id === id && entity.kind === 'variable');
      const visible = projection.entities.find(entity => entity.id === idMap[id] && entity.kind === 'variable');
      if (!source || !visible) { issues.push({ code: 'REFERENCE_INVALID', message: '公開範囲にない状態を相談へ含められません。', entityId: id }); continue; }
      let displayed: string | undefined;
      if (value.type !== 'unknown' && value.type !== source.data.valueType) { issues.push({ code: 'VALIDATION_FAILED', message: '相談用の状態値と変数の型が一致しません。', entityId: id }); continue; }
      if (value.type === 'boolean' && typeof value.value === 'boolean') displayed = String(value.value);
      else if (value.type === 'integer' && Number.isSafeInteger(value.value) && value.value >= (source.data.allowed.min ?? -2147483648) && value.value <= (source.data.allowed.max ?? 2147483647)) displayed = String(value.value);
      else if (value.type === 'enum' && source.data.allowed.values?.includes(value.value)) displayed = policy.publicValues?.[id]?.[value.value];
      else if (value.type === 'unknown') displayed = '未確定';
      if (displayed === undefined) { issues.push({ code: 'PUBLIC_TEXT_REQUIRED', message: '状態値の公開用表記がありません。', entityId: id }); continue; }
      output.push(`- ${escapeMarkdown(visible.name || String(visible.data.key ?? visible.id))}: ${escapeMarkdown(displayed)}`);
    }
  }
  if (!output.length) output.push('選択した公開範囲の設定と本文。前後の状態は未指定。');
  const unresolved = projection.entities.filter(entity => entity.status !== 'confirmed');
  if (unresolved.length) output.push('', '### 未確定事項', '', ...unresolved.map(entity => `- ${escapeMarkdown(entity.id)}: ${escapeMarkdown(entity.name)} (${escapeMarkdown(entity.status)})`));
  return issues.length ? { ok: false, issues } : { ok: true, markdown: output.join('\n') };
}

export interface ConsultationProposal { source: string; targetRevision: string; candidate: Entity<'note'> }
/** Manual import creates an alternate candidate; applying it is a separate author command. */
export function createConsultationProposal(project: ProjectData, input: { id: ID; blockId: ID; text: string; source: string; targetRevision: string; createdAt: string }): ConsultationProposal {
  const idPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
  const occupied = new Set<string>(), visited = new Set<object>();
  const findIds = (value: unknown): void => {
    if (!value || typeof value !== 'object' || visited.has(value)) return;
    visited.add(value);
    if (Array.isArray(value)) value.forEach(findIds);
    else { const object = value as Record<string, unknown>; if (typeof object.id === 'string') occupied.add(object.id); Object.values(object).forEach(findIds); }
  };
  findIds(project);
  const knownRevision = input.targetRevision === project.revision || project.snapshots.some(snapshot => snapshot.content.revision === input.targetRevision) || project.history.some(command => command.baseRevision === input.targetRevision || command.revision === input.targetRevision);
  if (!idPattern.test(input.id) || !idPattern.test(input.blockId) || input.id === input.blockId || occupied.has(input.id) || occupied.has(input.blockId) || !input.text.trim() || new TextEncoder().encode(input.text).byteLength > 1024 * 1024 || !input.source.trim() || input.source.length > 2048 || !revisionPattern.test(input.targetRevision) || !knownRevision || !Number.isFinite(Date.parse(input.createdAt))) throw new Error('VALIDATION_FAILED: 提案の出所・対象版・ID・本文を確認してください。');
  const body: RichText = [{ id: input.blockId, kind: 'paragraph', text: input.text }];
  return {
    source: input.source, targetRevision: input.targetRevision,
    candidate: { id: input.id, projectId: project.projectId, kind: 'note', revision: '0', name: '相談からの提案', status: 'alternate', visibility: 'private', createdAt: input.createdAt, updatedAt: input.createdAt,
      customValues: { consultationSource: input.source, consultationTargetRevision: input.targetRevision }, data: { body, attachmentIds: [], convertedToIds: [] } },
  };
}

function validatePlayableSubset(project: ProjectData, projection: PublicProjection, idMap: Record<string, string>): ProjectionIssue[] {
  const issues: ProjectionIssue[] = [];
  const fail = (message: string, field?: string, entityId?: string) => { issues.push({ code: 'EXPORT_UNSUPPORTED', message, ...(field ? { field } : {}), ...(entityId ? { entityId } : {}) }); };
  const graphs = byKind(projection, 'flow_graph');
  if (graphs.length !== 1 || !Array.isArray(graphs[0]?.data.entryIds) || graphs[0].data.entryIds.length !== 1) fail('持ち出す簡易試遊には、開始位置が一つの単一グラフが必要です。', 'entryIds');
  for (const node of byKind(projection, 'flow_node')) {
    if (node.data.trigger != null) fail('宣言したきっかけの入力を伴う処理は、持ち出す簡易試遊では未対応です。', 'trigger');
    if (node.data.executionPolicy === 'all_match') fail('全候補を同時に実行する分岐は、持ち出す簡易試遊では未対応です。', 'executionPolicy');
    const policy = node.data.executionPolicy ?? (node.data.nodeType === 'automatic' ? 'first_match' : 'manual_choice');
    const outgoing = byKind(projection, 'flow_edge').filter(edge => edge.data.fromId === node.id);
    if (policy === 'first_match' && new Set(outgoing.map(edge => edge.data.priority ?? 0)).size !== outgoing.length) fail('自動分岐の優先値が重複しているため簡易試遊を作成できません。', 'priority');
  }
  for (const edge of byKind(projection, 'flow_edge')) if (edge.data.edgeType === 'call_return') fail('呼び出しから戻る分岐は、持ち出す簡易試遊では未対応です。', 'edgeType');
  if (byKind(projection, 'cue').length || byKind(projection, 'storyboard_frame').length) fail('演出・収録を再生する処理は、持ち出す簡易試遊では未対応です。');
  const dependencies = new Set(presentationDisclosures(project, idMap).map(entity => entity.id));
  for (const disclosure of presentationDisclosures(project, idMap)) if (disclosure.data.anchor.positionStatus === 'unresolved') fail('提示位置が不明な開示があります。本文へ再リンクしてから簡易試遊を作成してください。', 'anchor', disclosure.id);
  for (const entity of project.entities) if (entity.kind === 'disclosure' && !entity.deletedAt && entity.status !== 'rejected' && entity.data.knowledgeEffects?.length && (has(idMap, entity.id) || dependencies.has(entity.id))) {
    // An excluded disclosure can still change a selected scene's state on arrival.
    // The portable interpreter does not implement those arrival effects.
    fail('提示時の開示効果は、持ち出す簡易試遊では未対応です。開示を省略して動作を変えず、出力を停止しました。', 'knowledgeEffects', entity.id);
  }
  return issues;
}

/** Fixed, self-contained interpreter. Story strings are parsed as JSON and rendered with textContent. */
const PLAYABLE_SCRIPT = String.raw`(() => {
  'use strict';
  const data = JSON.parse(document.getElementById('scenario-data').textContent);
  const entities = new Map(data.entities.map(entity => [entity.id, entity]));
  const ofKind = kind => data.entities.filter(entity => entity.kind === kind);
  const nodes = ofKind('flow_node'), edges = ofKind('flow_edge'), variables = ofKind('variable');
  const variableById = new Map(variables.map(variable => [variable.id, variable]));
  const graph = ofKind('flow_graph')[0];
  const clone = value => JSON.parse(JSON.stringify(value));
  const message = document.getElementById('message'), choices = document.getElementById('choices');
  const scene = document.getElementById('scene'), heading = document.getElementById('node-name'), stateView = document.getElementById('state');
  const history = [];
  let state;
  document.getElementById('title').textContent = data.title;
  document.getElementById('version').textContent = data.versionLabel;
  const contains = (list, id) => list.includes(id);
  function present(candidate, nodeId) {
    candidate.presentationPosition = nodeId;
    candidate.visitCounts[nodeId] = (candidate.visitCounts[nodeId] || 0) + 1;
    if (!contains(candidate.seenIds, nodeId)) candidate.seenIds.push(nodeId);
    const node = entities.get(nodeId);
    if (!node || node.kind !== 'flow_node') throw Error('進行先が見つかりません。');
    for (const edge of edges.filter(edge => edge.data.fromId === nodeId)) if (edge.data.choiceLineId && !contains(candidate.seenIds, edge.data.choiceLineId)) candidate.seenIds.push(edge.data.choiceLineId);
    if (node.data.sceneId) {
      const sceneId = node.data.sceneId;
      candidate.visitCounts[sceneId] = (candidate.visitCounts[sceneId] || 0) + 1;
      if (!contains(candidate.seenIds, sceneId)) candidate.seenIds.push(sceneId);
      const content = entities.get(sceneId);
      for (const block of content && content.data.body || []) if (!contains(candidate.seenIds, block.id)) candidate.seenIds.push(block.id);
      for (const blockId of content && content.data.blockIds || []) if (!contains(candidate.seenIds, blockId)) candidate.seenIds.push(blockId);
    }
    return candidate;
  }
  function initialState() {
    const values = Object.create(null);
    for (const variable of variables) values[variable.id] = clone(variable.data.initial);
    return present({ contentVersionId: data.contentVersionId, variableValues: values, itemInstances: [], assertions: [], seenIds: [], visitCounts: Object.create(null), onceTriggers: [], rngSeed: 'preview-fixed', rngPosition: 0, callStack: [], loopNumber: 0, provenance: 'full_play', steps: 0 }, graph.data.entryIds[0]);
  }
  function evaluate(ast, candidate) {
    if (!ast) return true;
    switch (ast.op) {
      case 'constant': return ast.value;
      case 'all': return ast.children.every(child => evaluate(child, candidate));
      case 'any': return ast.children.some(child => evaluate(child, candidate));
      case 'not': return !evaluate(ast.child, candidate);
      case 'visited': return (candidate.visitCounts[ast.entityId] || 0) >= ast.count;
      case 'compare': {
        const actual = candidate.variableValues[ast.variableId];
        if (!actual || actual.type === 'unknown') throw Error('状態値が未確認です。');
        const wanted = ast.comparator === 'in' ? ast.value : [ast.value];
        if (wanted.some(value => value.type !== actual.type)) throw Error('条件と状態の型が一致しません。');
        const expected = wanted[0].value;
        switch (ast.comparator) {
          case 'eq': return actual.value === expected;
          case 'ne': return actual.value !== expected;
          case 'lt': return actual.value < expected;
          case 'le': return actual.value <= expected;
          case 'gt': return actual.value > expected;
          case 'ge': return actual.value >= expected;
          case 'in': return wanted.some(value => value.value === actual.value);
        }
      }
    }
    throw Error('未対応の条件があるため停止しました。');
  }
  function same(left, right) { return left.type === right.type && left.value === right.value; }
  function checkValue(variable, value) {
    if (!value || value.type !== variable.data.valueType) throw Error('状態の型が一致しません。');
    const allowed = variable.data.allowed;
    if (value.type === 'boolean' && typeof value.value !== 'boolean') throw Error('真偽値が不正です。');
    if (value.type === 'integer' && (!Number.isSafeInteger(value.value) || value.value < (allowed.min === undefined ? -2147483648 : allowed.min) || value.value > (allowed.max === undefined ? 2147483647 : allowed.max))) throw Error('状態が許可範囲を超えています。変更は適用されません。');
    if (value.type === 'enum' && !allowed.values.includes(value.value)) throw Error('列挙値が許可範囲にありません。');
  }
  function applyEffect(candidate, id) {
    const entity = entities.get(id);
    if (!entity || entity.kind !== 'effect') throw Error('効果が見つかりません。');
    const effect = entity.data;
    if (!evaluate(effect.condition, candidate)) return;
    if (effect.operation === 'mark_seen') {
      if (!contains(candidate.seenIds, effect.targetId)) candidate.seenIds.push(effect.targetId);
      return;
    }
    const variable = variableById.get(effect.targetId);
    if (!variable) throw Error('更新する状態が見つかりません。');
    const before = candidate.variableValues[effect.targetId];
    let next;
    if (effect.operation === 'reset') next = clone(effect.value || variable.data.initial);
    else if (effect.operation === 'set') next = clone(effect.value);
    else if (effect.operation === 'add') {
      if (before.type !== 'integer' || effect.value.type !== 'integer') throw Error('加算には整数の状態と入力が必要です。');
      next = { type: 'integer', value: before.value + effect.value.value };
    } else throw Error('未対応の効果があるため停止しました。');
    checkValue(variable, next);
    if (effect.operation !== 'reset' && !same(before, next)) {
      const quests = ofKind('quest').filter(quest => quest.data.stateVariableId === variable.id);
      const rules = (variable.data.transitionRules || []).concat(...quests.map(quest => quest.data.transitionRules || []));
      if ((rules.length || quests.length) && !rules.some(rule => same(rule.from, before) && same(rule.to, next)) && !(effect.reason || '').trim()) throw Error('許可された状態遷移ではありません。変更は適用されません。');
    }
    candidate.variableValues[effect.targetId] = next;
  }
  function available(node) {
    if (!evaluate(node.data.gate, state)) return [];
    return edges.filter(edge => edge.data.fromId === node.id && evaluate(edge.data.condition, state));
  }
  function advance(edgeId, fallback) {
    try {
      if (state.steps >= 10000) throw Error('移動の上限に達しました。戻るか、初期値から開始してください。');
      const node = entities.get(state.presentationPosition);
      const candidates = available(node);
      const policy = node.data.executionPolicy || (node.data.nodeType === 'automatic' ? 'first_match' : 'manual_choice');
      const selected = fallback ? undefined : candidates.find(edge => edge.id === edgeId);
      if (fallback ? candidates.length || !node.data.fallbackId : !selected) throw Error('この選択肢では進めません。');
      if (!fallback && policy === 'first_match' && candidates.slice().sort((left, right) => (left.data.priority || 0) - (right.data.priority || 0))[0].id !== edgeId) throw Error('最初の有効候補を選んでください。');
      const next = clone(state);
      for (const id of selected && selected.data.effectIds || []) applyEffect(next, id);
      next.steps += 1;
      present(next, fallback ? node.data.fallbackId : selected.data.toId);
      history.push(clone(state)); state = next;
      render();
    } catch (error) { message.textContent = error.message; }
  }
  function render() {
    const node = entities.get(state.presentationPosition);
    heading.textContent = node.name;
    scene.replaceChildren(); choices.replaceChildren(); message.textContent = '';
    const content = entities.get(node.data.sceneId);
    for (const block of content && (content.data.body || content.data.summary) || []) {
      const paragraph = document.createElement(block.kind === 'heading' ? 'h3' : 'p');
      paragraph.id = block.id; paragraph.textContent = block.text; scene.appendChild(paragraph);
    }
    stateView.textContent = JSON.stringify(state, null, 2);
    document.getElementById('undo').disabled = history.length === 0;
    if (node.data.nodeType === 'terminal' || node.data.nodeType === 'exit') { message.textContent = node.data.terminalReason || '終了'; return; }
    if (state.steps >= 10000) { message.textContent = '移動の上限に達しました。'; return; }
    try {
      const candidates = available(node);
      const policy = node.data.executionPolicy || (node.data.nodeType === 'automatic' ? 'first_match' : 'manual_choice');
      const shown = policy === 'first_match' ? candidates.slice().sort((left, right) => (left.data.priority || 0) - (right.data.priority || 0)).slice(0, 1) : candidates;
      for (const edge of shown) {
        const button = document.createElement('button'); button.type = 'button';
        const line = entities.get(edge.data.choiceLineId);
        button.textContent = edge.data.label || line && (line.data.text || []).map(block => block.text).join('\n') || edge.name || '次へ';
        button.addEventListener('click', () => advance(edge.id, false)); choices.appendChild(button);
      }
      if (!shown.length && node.data.fallbackId) {
        const button = document.createElement('button'); button.type = 'button'; button.textContent = '代替の進行先へ'; button.addEventListener('click', () => advance(undefined, true)); choices.appendChild(button);
      } else if (!shown.length) message.textContent = '有効な選択肢がありません。意図した終端とは別の停止です。';
    } catch (error) { message.textContent = error.message; }
  }
  document.getElementById('undo').addEventListener('click', () => { if (history.length) { state = history.pop(); render(); } });
  document.getElementById('restart').addEventListener('click', () => { history.length = 0; state = initialState(); render(); });
  state = initialState(); render();
})();`;

async function buildPlayableArchive(projection: PublicProjection, versionLabel: string): Promise<ExportArtifact> {
  const payload = { format: 'scenario-playable-preview', formatVersion: '1.0.0', profile: publicRuntimeProfile(PLAYABLE_PREVIEW_PROFILE), title: projection.title, versionLabel,
    contentVersionId: `sha256:${await hash(projection)}`, entities: projection.entities, calendars: projection.calendars, externalEvidence: 'not_included', assetBytesIncluded: false, transitionLimit: 10000 };
  const json = JSON.stringify(payload, null, 2);
  const embeddedJson = json.replace(/</g, '\\u003c').replace(/>/g, '\\u003e').replace(/&/g, '\\u0026');
  const scriptDigest = new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(PLAYABLE_SCRIPT)));
  const scriptHash = btoa(String.fromCharCode(...scriptDigest));
  const html = `<!doctype html>\n<html lang="ja"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src 'sha256-${scriptHash}'; style-src 'unsafe-inline'; base-uri 'none'; form-action 'none'"><title>${escapeHtml(projection.title)} 簡易試遊</title><style>body{font-family:system-ui,sans-serif;max-width:48rem;margin:2rem auto;padding:0 1rem;line-height:1.8;color:#202624}button{font:inherit;margin:.3rem;padding:.55rem 1rem;cursor:pointer}button:focus-visible{outline:3px solid #17765a}#message{min-height:2rem}pre{white-space:pre-wrap;overflow-wrap:anywhere;font-size:.85rem}</style></head><body><h1 id="title"></h1><p>対象版: <span id="version"></span></p><p>対応した分岐と状態による簡易試遊です。実ゲームでの確認結果を示すものではありません。</p><main><h2 id="node-name"></h2><div id="scene"></div><p id="message" role="status" aria-live="polite"></p><div id="choices"></div><p><button id="undo" type="button">戻る</button><button id="restart" type="button">初期値から再開</button></p><details><summary>試遊の値・訪問記録</summary><pre id="state"></pre></details></main><script type="application/json" id="scenario-data">${embeddedJson}</script><script>${PLAYABLE_SCRIPT}</script></body></html>\n`;
  const readme = '簡易試遊 1.0.0\nZIPを展開しindex.htmlをブラウザーで開いてください。通信は不要です。\n対応:単一開始グラフ、手動選択/優先候補、定数/論理/比較/訪問条件、boolean/integer/enumのset/add/resetと既読。\n戻る操作は状態値・既読・訪問回数・現在位置を一緒に復元します。初期値から再開は全状態を初期化します。\n外部ゲーム処理、呼出、トリガー、全候補実行、物品・認識処理、演出・素材再生は未対応です。該当機能を含む作品は出力時に拒否します。\nこのファイルは作者の正本を更新しません。実ゲームで確認した証跡は含まれません。\n';
  const files: Record<string, Uint8Array> = { 'index.html': strToU8(html), 'runtime.json': strToU8(json), 'README.txt': strToU8(readme) };
  const manifestFiles = await Promise.all(Object.entries(files).map(async ([path, bytes]) => ({ path, byteSize: bytes.byteLength, sha256: [...new Uint8Array(await crypto.subtle.digest('SHA-256', new Uint8Array(bytes)))].map(value => value.toString(16).padStart(2, '0')).join('') })));
  files['manifest.json'] = strToU8(JSON.stringify({ format: 'scenario-playable-package', formatVersion: '1.0.0', files: manifestFiles, contentVersionId: payload.contentVersionId, externalEvidence: 'not_included', assetBytesIncluded: false }, null, 2));
  return { filename: 'playable-preview.zip', mimeType: 'application/zip', content: '', bytes: new Uint8Array(zipSync(files, { level: 6 })) };
}
