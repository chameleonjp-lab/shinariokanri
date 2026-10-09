import type { AuthorAlternative, AlternativeVersion, StructurePlan } from './writingWorkspace';
import type { Entity, ProjectContent, ProjectSnapshot } from './types';

export interface AuthorAlternativeIntegrityIssue { path: string; message: string }
export interface AuthorAlternativeContentCheck { ok: boolean; issues?: Array<{ path?: string; message: string }> }
export interface AuthorAlternativeIntegrityOptions {
  /** Each branch content is validated as an independent ProjectContent/entity index. */
  validateContent: (content: ProjectContent) => AuthorAlternativeContentCheck | Promise<AuthorAlternativeContentCheck>;
  snapshotIds?: ReadonlySet<string>;
  snapshots?: readonly ProjectSnapshot[];
  reservedIds?: ReadonlySet<string>;
  maxAlternatives?: number;
  maxVersionsPerAlternative?: number;
  maxBytesPerAlternative?: number;
  maxBytesTotal?: number;
}

const HASH = /^[0-9a-f]{64}$/;
const REVISION = /^(0|[1-9][0-9]*)$/;
const BRANCH_STATUSES = new Set(['active', 'provisional', 'needs_review', 'rejected', 'accepted']);
const RECEIPT_SCOPES = new Set(['project', 'entity', 'relation', 'presentation']);
const BLOCKED_KEYS = new Set(['__proto__', 'prototype', 'constructor']);
const DEFAULT_LIMITS = { alternatives: 100, versions: 500, branchBytes: 8_000_000, totalBytes: 16_000_000 };

function stableJson(value: unknown, ancestors = new Set<object>(), depth = 0): string {
  if (depth > 100) throw new Error('内容の階層が上限を超えています。');
  if (value === null || typeof value === 'boolean' || typeof value === 'string') return JSON.stringify(value);
  if (typeof value === 'number' && Number.isFinite(value)) return JSON.stringify(value);
  if (!value || typeof value !== 'object' || ancestors.has(value)) throw new Error('SHA-256対象が通常のJSON値ではありません。');
  const prototype = Object.getPrototypeOf(value);
  if (!Array.isArray(value) && prototype !== Object.prototype && prototype !== null) throw new Error('SHA-256対象に未対応の値があります。');
  ancestors.add(value);
  const json = Array.isArray(value)
    ? `[${value.map(item => stableJson(item, ancestors, depth + 1)).join(',')}]`
    : `{${Object.keys(value).sort().map(key => {
      if (BLOCKED_KEYS.has(key)) throw new Error('JSONに未対応の項目名があります。');
      return `${JSON.stringify(key)}:${stableJson((value as Record<string, unknown>)[key], ancestors, depth + 1)}`;
    }).join(',')}}`;
  ancestors.delete(value);
  return json;
}

export async function authorAlternativeSha256(value: unknown): Promise<string> {
  const bytes = new TextEncoder().encode(stableJson(value));
  const digest = await globalThis.crypto.subtle.digest('SHA-256', bytes);
  return Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, '0')).join('');
}

function branchPayload(alternative: AuthorAlternative): Omit<AuthorAlternative, 'integrityHash'> {
  const { integrityHash: _integrityHash, ...payload } = alternative;
  return payload;
}

/** Re-seal after any branch metadata, version, structure plan, or application-receipt update. */
export async function sealAuthorAlternative(input: AuthorAlternative): Promise<AuthorAlternative> {
  const alternative = structuredClone(input);
  alternative.baseContentHash = await authorAlternativeSha256(alternative.baseContent);
  for (const version of alternative.versions) version.contentHash = await authorAlternativeSha256({ content: version.content, structurePlan: version.structurePlan ?? null });
  delete alternative.integrityHash;
  alternative.integrityHash = await authorAlternativeSha256(branchPayload(alternative));
  return alternative;
}

function isRecord(value: unknown): value is Record<string, unknown> { return !!value && typeof value === 'object' && !Array.isArray(value); }
function dateIsValid(value: unknown): value is string { return typeof value === 'string' && Number.isFinite(Date.parse(value)); }
function issue(issues: AuthorAlternativeIntegrityIssue[], path: string, message: string) { issues.push({ path, message }); }

function collectStructurePlanIssues(plan: StructurePlan, content: ProjectContent, path: string, issues: AuthorAlternativeIntegrityIssue[]) {
  if (typeof plan.templateId !== 'string' || !plan.templateId.trim()) issue(issues, `${path}.templateId`, '構成雛形IDが必要です。');
  if (!Array.isArray(plan.beatLabels) || plan.beatLabels.length > 100 || plan.beatLabels.some(label => typeof label !== 'string' || !label.trim())) issue(issues, `${path}.beatLabels`, '構成の役割は空でない文章を100件以内で指定してください。');
  else if (new Set(plan.beatLabels).size !== plan.beatLabels.length) issue(issues, `${path}.beatLabels`, '構成の役割名は重複できません。');
  const chapter = content.entities.find((entity): entity is Entity<'chapter'> => entity.kind === 'chapter' && entity.id === plan.chapterId && !entity.deletedAt);
  if (!chapter) issue(issues, `${path}.chapterId`, '構成計画の章が別案に存在しません。');
  if (!isRecord(plan.assignments)) { issue(issues, `${path}.assignments`, '場面の割り当てが不正です。'); return; }
  const labels = new Set(Array.isArray(plan.beatLabels) ? plan.beatLabels : []), assigned = new Set<string>();
  for (const [beat, sceneId] of Object.entries(plan.assignments)) {
    if (!labels.has(beat)) issue(issues, `${path}.assignments.${beat}`, '定義されていない構成の役割です。');
    if (typeof sceneId !== 'string' || assigned.has(sceneId)) issue(issues, `${path}.assignments.${beat}`, '同じ場面を複数の役割へ割り当てられません。');
    assigned.add(sceneId as string);
    if (!content.entities.some((entity): entity is Entity<'scene'> => entity.kind === 'scene' && entity.id === sceneId && !entity.deletedAt)) issue(issues, `${path}.assignments.${beat}`, '割り当てる場面が別案に存在しません。');
    if (chapter && typeof sceneId === 'string' && !chapter.data.sceneIds.includes(sceneId)) issue(issues, `${path}.assignments.${beat}`, '場面は対象の章に所属していません。');
  }
}

export function validateStructurePlan(plan: StructurePlan, content: ProjectContent): string[] {
  const issues: AuthorAlternativeIntegrityIssue[] = [];
  collectStructurePlanIssues(plan, content, 'structurePlan', issues);
  return issues.map(item => item.message);
}

function getPath(value: unknown, path: readonly string[]): unknown {
  return path.reduce<unknown>((current, key) => current && typeof current === 'object' ? (current as Record<string, unknown>)[key] : undefined, value);
}
function presentationSnapshot(content: ProjectContent) {
  return {
    chapterOrder: content.entities.filter((entity): entity is Entity<'chapter'> => entity.kind === 'chapter' && !entity.deletedAt).map(chapter => chapter.id),
    chapters: content.entities.filter((entity): entity is Entity<'chapter'> => entity.kind === 'chapter' && !entity.deletedAt).map(chapter => ({ id: chapter.id, sceneIds: [...chapter.data.sceneIds] })),
    scenes: content.entities.filter((entity): entity is Entity<'scene'> => entity.kind === 'scene' && !entity.deletedAt).map(scene => ({ id: scene.id, chapterId: scene.data.chapterId ?? null })),
  };
}
export function receiptPatchValue(content: ProjectContent, receipt: AuthorAlternative['applyReceipts'][number]['patches'][number]): unknown {
  if (receipt.scope === 'presentation') return presentationSnapshot(content);
  if (receipt.scope === 'project') return getPath(content, receipt.path);
  const collection = receipt.scope === 'entity' ? content.entities : content.relations;
  const target = collection.find(item => item.id === receipt.itemId);
  // Storage keeps removed records as tombstones for audit. Receipt patches describe
  // logical presence in authored content, so a tombstone represents absence.
  if (!target || target.deletedAt) return undefined;
  return receipt.path.length ? getPath(target, receipt.path) : target;
}
function validateReceipt(receipt: AuthorAlternative['applyReceipts'][number], versions: ReadonlyMap<string, AlternativeVersion>, sourceSnapshotId: string | null | undefined, path: string, issues: AuthorAlternativeIntegrityIssue[]) {
  if (!receipt || typeof receipt !== 'object') { issue(issues, path, '正本採用記録が不正です。'); return; }
  if (!dateIsValid(receipt.createdAt)) issue(issues, `${path}.createdAt`, '採用日時が不正です。');
  const version = versions.get(receipt.alternativeVersionId ?? '');
  if (!version) issue(issues, `${path}.alternativeVersionId`, '採用元の別案版が見つかりません。');
  if ((receipt.sourceSnapshotId ?? null) !== (sourceSnapshotId ?? null)) issue(issues, `${path}.sourceSnapshotId`, '採用記録の分岐元固定版が別案と一致しません。');
  if (!REVISION.test(receipt.fromCanonicalRevision) || !receipt.appliedRevision || !REVISION.test(receipt.appliedRevision)) issue(issues, path, '採用元と採用先の正本版番号が必要です。');
  else if (BigInt(receipt.appliedRevision) <= BigInt(receipt.fromCanonicalRevision)) issue(issues, `${path}.appliedRevision`, '採用先の正本版は採用元より新しくなければなりません。');
  if (!Array.isArray(receipt.selectedChangeKeys) || !receipt.selectedChangeKeys.length || new Set(receipt.selectedChangeKeys).size !== receipt.selectedChangeKeys.length) issue(issues, `${path}.selectedChangeKeys`, '採用対象の差分キーが必要です。');
  if (!Array.isArray(receipt.patches) || !receipt.patches.length) { issue(issues, `${path}.patches`, '採用した差分がありません。'); return; }
  const patchKeys = new Set<string>();
  receipt.patches.forEach((patch, index) => {
    const patchPath = `${path}.patches[${index}]`;
    if (!patch || typeof patch.key !== 'string' || patchKeys.has(patch.key)) issue(issues, `${patchPath}.key`, '差分キーが不正または重複しています。');
    patchKeys.add(patch.key);
    if (!RECEIPT_SCOPES.has(patch.scope) || !Array.isArray(patch.path) || patch.path.some(part => typeof part !== 'string') || typeof patch.label !== 'string') issue(issues, patchPath, '差分の対象が不正です。');
    if (typeof patch.before?.present !== 'boolean' || typeof patch.after?.present !== 'boolean') issue(issues, patchPath, '差分の前後値の有無が不正です。');
    const expectedKey = [patch.scope, patch.itemId ?? '', ...(patch.path ?? [])].map(part => encodeURIComponent(part)).join(':');
    if (patch.key !== expectedKey) issue(issues, `${patchPath}.key`, '差分キーが保存した範囲と一致しません。');
    if (patch.scope === 'presentation' && (patch.itemId || patch.path?.length !== 1 || patch.path[0] !== 'all')) issue(issues, patchPath, '提示順差分の範囲が不正です。');
    if (patch.before?.present === false && Object.hasOwn(patch.before, 'value') || patch.after?.present === false && Object.hasOwn(patch.after, 'value')) issue(issues, patchPath, '値がない差分に値を含められません。');
    if (patch.before?.present === true && !Object.hasOwn(patch.before, 'value') || patch.after?.present === true && !Object.hasOwn(patch.after, 'value')) issue(issues, patchPath, '値がある差分には値を含めてください。');
    if (version && patch.after && typeof patch.after.present === 'boolean') {
      const expected = receiptPatchValue(version.content, patch);
      const expectedPresent = expected !== undefined;
      if (patch.after.present !== expectedPresent) issue(issues, `${patchPath}.after`, '採用後の有無が参照した別案版と一致しません。');
      else if (expectedPresent) {
        try { if (stableJson(patch.after.value) !== stableJson(expected)) issue(issues, `${patchPath}.after.value`, '採用後の値が参照した別案版と一致しません。'); }
        catch (error) { issue(issues, `${patchPath}.after.value`, error instanceof Error ? error.message : '採用後の値を別案版と比較できません。'); }
      }
    }
  });
  if (Array.isArray(receipt.selectedChangeKeys) && !sameStrings(receipt.selectedChangeKeys, [...patchKeys])) issue(issues, `${path}.selectedChangeKeys`, '採用対象キーと保存した差分内容が一致しません。');
}

function sameStrings(left: readonly string[], right: readonly string[]): boolean { return left.length === right.length && [...left].sort().every((value, index) => value === [...right].sort()[index]); }

/**
 * Checks branch metadata and each content image independently. `validateContent` must call the normal
 * ProjectContent validator for every image so branch entities get a fresh, isolated ID/reference index.
 */
export async function validateAuthorAlternatives(projectId: string, input: unknown, options: AuthorAlternativeIntegrityOptions): Promise<AuthorAlternativeIntegrityIssue[]> {
  const issues: AuthorAlternativeIntegrityIssue[] = [];
  const limits = { alternatives: options.maxAlternatives ?? DEFAULT_LIMITS.alternatives, versions: options.maxVersionsPerAlternative ?? DEFAULT_LIMITS.versions,
    branchBytes: options.maxBytesPerAlternative ?? DEFAULT_LIMITS.branchBytes, totalBytes: options.maxBytesTotal ?? DEFAULT_LIMITS.totalBytes };
  if (!Array.isArray(input)) return [{ path: 'authorAlternatives', message: '作者別案は配列で指定してください。' }];
  if (input.length > limits.alternatives) issue(issues, 'authorAlternatives', `作者別案は${limits.alternatives}件までです。`);
  const globalIds = new Set<string>(options.reservedIds ?? []), branchIds = new Set<string>();
  let totalBytes = 0;
  for (const [branchIndex, raw] of input.entries()) {
    const path = `authorAlternatives[${branchIndex}]`;
    if (!isRecord(raw)) { issue(issues, path, '作者別案の記録が不正です。'); continue; }
    const alternative = raw as unknown as AuthorAlternative;
    if (typeof alternative.id !== 'string' || branchIds.has(alternative.id) || globalIds.has(alternative.id)) issue(issues, `${path}.id`, '別案IDが不正または重複しています。');
    if (typeof alternative.id === 'string') { branchIds.add(alternative.id); globalIds.add(alternative.id); }
    if (alternative.projectId !== projectId) issue(issues, `${path}.projectId`, '別案が別の作品を参照しています。');
    if (typeof alternative.name !== 'string' || !alternative.name.trim()) issue(issues, `${path}.name`, '別案名が必要です。');
    if (!BRANCH_STATUSES.has(alternative.status)) issue(issues, `${path}.status`, '別案の状態が不正です。');
    if (!dateIsValid(alternative.createdAt) || !dateIsValid(alternative.updatedAt)) issue(issues, path, '別案の作成日時または更新日時が不正です。');
    if (!REVISION.test(alternative.baseRevision)) issue(issues, `${path}.baseRevision`, '分岐元の版番号が不正です。');
    if (alternative.sourceSnapshotId != null && options.snapshotIds && !options.snapshotIds.has(alternative.sourceSnapshotId)) issue(issues, `${path}.sourceSnapshotId`, '分岐元の固定版が見つかりません。');
    if (!isRecord(alternative.baseContent) || alternative.baseContent.projectId !== projectId || alternative.baseContent.revision !== alternative.baseRevision) issue(issues, `${path}.baseContent`, '分岐元の内容・作品ID・版番号が一致しません。');
    if (isRecord(alternative.baseContent) && Object.hasOwn(alternative.baseContent, 'authorAlternatives')) issue(issues, `${path}.baseContent.authorAlternatives`, '別案の内容へ別案一覧を再帰保存できません。');
    if (isRecord(alternative.baseContent)) {
      if (alternative.sourceSnapshotId) {
        const source = options.snapshots?.find(snapshot => snapshot.id === alternative.sourceSnapshotId);
        if (!source) issue(issues, `${path}.sourceSnapshotId`, '分岐元の固定版本文がありません。');
        else {
          try { if (stableJson(source.content) !== stableJson(alternative.baseContent)) issue(issues, `${path}.baseContent`, '固定版から分岐した別案は、固定版本文をそのまま保持してください。'); }
          catch (error) { issue(issues, `${path}.baseContent`, error instanceof Error ? error.message : '固定版本文と分岐元を比較できません。'); }
        }
      }
      const result = await options.validateContent(alternative.baseContent as unknown as ProjectContent);
      if (!result.ok) (result.issues ?? []).forEach(detail => issue(issues, `${path}.baseContent${detail.path ? `.${detail.path}` : ''}`, detail.message));
      if (HASH.test(alternative.baseContentHash ?? '')) {
        try { if (await authorAlternativeSha256(alternative.baseContent) !== alternative.baseContentHash) issue(issues, `${path}.baseContentHash`, '分岐元の内容SHA-256が一致しません。'); }
        catch (error) { issue(issues, `${path}.baseContentHash`, error instanceof Error ? error.message : '分岐元の内容hashを確認できません。'); }
      } else issue(issues, `${path}.baseContentHash`, '分岐元の内容SHA-256がありません。');
    }

    if (!Array.isArray(alternative.versions) || !alternative.versions.length || alternative.versions.length > limits.versions) {
      issue(issues, `${path}.versions`, `別案の版は1〜${limits.versions}件で指定してください。`); continue;
    }
    const versions = alternative.versions as AlternativeVersion[], versionById = new Map<string, AlternativeVersion>(), versionIndex = new Map<string, number>();
    for (const [versionIndexValue, version] of versions.entries()) {
      const versionPath = `${path}.versions[${versionIndexValue}]`;
      if (!version || typeof version.id !== 'string' || versionById.has(version.id) || globalIds.has(version.id)) issue(issues, `${versionPath}.id`, '別案版IDが不正または重複しています。');
      if (typeof version?.id === 'string') { versionById.set(version.id, version); versionIndex.set(version.id, versionIndexValue); globalIds.add(version.id); }
      if (typeof version?.label !== 'string' || !version.label.trim() || !dateIsValid(version.createdAt)) issue(issues, versionPath, '別案版の名前または作成日時が不正です。');
      if (!isRecord(version?.content) || version.content.projectId !== projectId) { issue(issues, `${versionPath}.content`, '別案版の作品IDが一致しません。'); continue; }
      if (Object.hasOwn(version.content, 'authorAlternatives')) issue(issues, `${versionPath}.content.authorAlternatives`, '別案版へ別案一覧を再帰保存できません。');
      const result = await options.validateContent(version.content as ProjectContent);
      if (!result.ok) (result.issues ?? []).forEach(detail => issue(issues, `${versionPath}.content${detail.path ? `.${detail.path}` : ''}`, detail.message));
      if (version.structurePlan) collectStructurePlanIssues(version.structurePlan, version.content as ProjectContent, `${versionPath}.structurePlan`, issues);
      try {
        const digest = await authorAlternativeSha256({ content: version.content, structurePlan: version.structurePlan ?? null });
        if (!HASH.test(version.contentHash ?? '') || version.contentHash !== digest) issue(issues, `${versionPath}.contentHash`, '別案版の内容SHA-256がありません、または一致しません。');
      } catch (error) { issue(issues, `${versionPath}.contentHash`, error instanceof Error ? error.message : '別案版の内容hashを確認できません。'); }
    }
    const roots = versions.filter(version => version.parentVersionId === null);
    if (roots.length !== 1) issue(issues, `${path}.versions`, '別案履歴には親のない開始版が一つ必要です。');
    if (roots[0]) {
      try { if (stableJson(roots[0].content) !== stableJson(alternative.baseContent)) issue(issues, `${path}.versions`, '開始版は分岐元の内容を保持してください。'); }
      catch (error) { issue(issues, `${path}.versions`, error instanceof Error ? error.message : '開始版と分岐元の内容を比較できません。'); }
    }
    let lastTime = Number.NEGATIVE_INFINITY;
    for (const [versionIndexValue, version] of versions.entries()) {
      const versionPath = `${path}.versions[${versionIndexValue}]`, time = Date.parse(version.createdAt);
      if (Number.isFinite(time) && time < lastTime) issue(issues, `${versionPath}.createdAt`, '別案の版は作成順に並べてください。');
      if (Number.isFinite(time)) lastTime = time;
      if (version.parentVersionId !== null) {
        const parentPosition = versionIndex.get(version.parentVersionId ?? '');
        if (parentPosition === undefined || parentPosition >= versionIndexValue) issue(issues, `${versionPath}.parentVersionId`, '別案版の親が存在しないか、作成順の後にあります。');
      }
    }
    const visited = new Set<string>(), active = new Set<string>();
    const checkCycle = (id: string) => {
      if (active.has(id)) { issue(issues, `${path}.versions`, '別案版の親子関係に循環があります。'); return; }
      if (visited.has(id)) return;
      active.add(id);
      const parent = versionById.get(id)?.parentVersionId;
      if (parent) checkCycle(parent);
      active.delete(id); visited.add(id);
    };
    versionById.forEach((_version, id) => checkCycle(id));
    if (alternative.headVersionId !== versions.at(-1)?.id) issue(issues, `${path}.headVersionId`, '別案の現在版は履歴の最後の版でなければなりません。');
    if (!Array.isArray(alternative.applyReceipts)) issue(issues, `${path}.applyReceipts`, '正本採用履歴が不正です.');
    else {
      const receiptIds = new Set<string>();
      let priorRevision = -1n;
      alternative.applyReceipts.forEach((receipt, index) => {
        const receiptPath = `${path}.applyReceipts[${index}]`;
        if (receiptIds.has(receipt.id) || globalIds.has(receipt.id)) issue(issues, `${receiptPath}.id`, '採用記録IDが重複しています。');
        receiptIds.add(receipt.id); globalIds.add(receipt.id);
        validateReceipt(receipt, versionById, alternative.sourceSnapshotId, receiptPath, issues);
        if (REVISION.test(receipt.appliedRevision ?? '')) {
          const revision = BigInt(receipt.appliedRevision!);
          if (revision <= priorRevision) issue(issues, `${receiptPath}.appliedRevision`, '正本採用履歴は版の昇順で並べてください。');
          priorRevision = revision;
        }
      });
    }
    try {
      const payload = branchPayload(alternative);
      if (!HASH.test(alternative.integrityHash ?? '') || await authorAlternativeSha256(payload) !== alternative.integrityHash) issue(issues, `${path}.integrityHash`, '作者別案全体のSHA-256がありません、または一致しません。');
    } catch (error) { issue(issues, `${path}.integrityHash`, error instanceof Error ? error.message : '作者別案のhashを確認できません。'); }
    try {
      const bytes = new TextEncoder().encode(stableJson(alternative)).byteLength;
      totalBytes += bytes;
      if (bytes > limits.branchBytes) issue(issues, path, `別案は${limits.branchBytes} bytesまでです。`);
    } catch (error) { issue(issues, path, error instanceof Error ? error.message : '別案をJSON化できません。'); }
  }
  if (totalBytes > limits.totalBytes) issue(issues, 'authorAlternatives', `作者別案全体は${limits.totalBytes} bytesまでです。`);
  return issues;
}
