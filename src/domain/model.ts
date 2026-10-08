import { resolvePinnedWorlds } from './pinnedWorlds';
import { resolveReuseContent, reuseValidationIssues } from './reuse';
import { FORMAT_VERSION } from './types';
import type { Alias, CalendarDefinition, Condition, Entity, EntityDataMap, EntityKind, Expression, ID, PresentationConditionResult, ProjectContent, ProjectData, Relation, RelationTypeDefinition, RichText, RuntimeState, TimeSpec, TypedValue, ValidationIssue, ValidationResult, Validity } from './types';
import { GREGORIAN_CALENDAR, compareTicks, isTick, parseTick, validateCalendar, validateEventTimes, sameCalendarDefinition } from './time';
import { validateTemplateAssignments, validateTemplateDefinition } from './templates';

export const KIND_LABELS: Record<EntityKind, string> = {
  character: '人物', group: 'グループ', event: '出来事', place: '場所', item: '物品', note: 'メモ', chapter: '章', scene: '場面', goal: '目標',
  flow_node: '進行ノード', flow_edge: '進行線', flow_graph: '分岐図', dialogue_line: '台詞', quest: 'クエスト', lore: '設定', variable: '状態変数',
  effect: '効果', assertion: '事実・認識', foreshadow: '伏線', disclosure: '手掛かり・回収', checkpoint: '途中開始点', trace: '試読記録', attachment: '添付素材',
  source: '資料・出所', cue: '演出', storyboard_frame: '絵コンテ', localization: '翻訳', recording: '収録', terminology: '用語', map: '地図', travel_route: '移動経路',
  template: '雛形', collection: '一覧', review: 'レビュー', creative_brief: '企画', decision: '制作判断', gameplay_spec: 'ゲーム仕様', production_task: '制作タスク',
  media_variant: '媒体版', voice_rule: '口調', external_contract: '外部契約', snapshot: '公開版', projection_profile: '公開投影',
};
export const ENTITY_KINDS = Object.keys(KIND_LABELS) as EntityKind[];
export const STATUSES = ['confirmed', 'provisional', 'needs_review', 'rejected', 'alternate'] as const;
export const SCOPES = ['scene', 'chapter', 'character', 'run', 'across_runs'] as const;
export const RELATION_TYPES: RelationTypeDefinition[] = [
  { key: 'trust', label: '信頼', fromKinds: ['character'], toKinds: ['character'], allowSelf: false, allowSymmetric: false },
  { key: 'causes', label: '因果', fromKinds: ['event'], toKinds: ['event'], allowSelf: false, allowSymmetric: false },
  { key: 'requires', label: '前提', fromKinds: ENTITY_KINDS, toKinds: ENTITY_KINDS, allowSelf: false, allowSymmetric: false },
  { key: 'foreshadow_payoff', label: '手掛かり→回収', fromKinds: ['disclosure'], toKinds: ['disclosure'], allowSelf: false, allowSymmetric: false },
  { key: 'parent_of', label: '親子', fromKinds: ['character'], toKinds: ['character'], allowSelf: false, allowSymmetric: false },
  { key: 'event_foreshadow', label: '出来事の予告', fromKinds: ['event'], toKinds: ['event'], allowSelf: false, allowSymmetric: false },
  { key: 'event_payoff', label: '出来事の回収', fromKinds: ['event'], toKinds: ['event'], allowSelf: false, allowSymmetric: false },
  { key: 'mentor_of', label: '師弟', fromKinds: ['character'], toKinds: ['character'], allowSelf: false, allowSymmetric: false },
  { key: 'bloodline', label: '血統', fromKinds: ['character'], toKinds: ['character'], allowSelf: false, allowSymmetric: false },
  { key: 'related', label: '関連', fromKinds: ENTITY_KINDS, toKinds: ENTITY_KINDS, allowSelf: false, allowSymmetric: true },
  { key: 'reference', label: '参照', fromKinds: ENTITY_KINDS, toKinds: ENTITY_KINDS, allowSelf: true, allowSymmetric: false },
];
export const RELATION_LABELS = Object.fromEntries(RELATION_TYPES.map(type => [type.key, type.label])) as Record<string, string>;
export const ID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
export const REVISION_PATTERN = /^(?:0|[1-9][0-9]*)$/;
export const emptyValidity = (): Validity => ({ worldRange: null, routeCondition: null, presentationAnchor: null });
export const newId = (): ID => crypto.randomUUID();
export function textToRichText(text: string): RichText { return text === '' ? [] : text.split('\n').map(line => ({ id: newId(), kind: 'paragraph', text: line })); }
export function richTextToPlainText(text: RichText | null | undefined): string { return (text ?? []).map(block => block.text).join('\n'); }
export function getEntity<K extends EntityKind = EntityKind>(project: Pick<ProjectData, 'entities'>, id: ID): Entity<K> | undefined { return project.entities.find(entity => entity.id === id && !entity.deletedAt) as Entity<K> | undefined; }
export function getEntitiesByKind<K extends EntityKind>(project: Pick<ProjectData, 'entities'>, kind: K): Entity<K>[] { return project.entities.filter(entity => entity.kind === kind && !entity.deletedAt) as Entity<K>[]; }
export function defaultData<K extends EntityKind>(kind: K): EntityDataMap[K] {
  // A required reference stays null in an unsaved editor draft; no fake ID is generated.
  const unknown: TypedValue = { type: 'unknown', value: null, reason: '未入力' };
  const data: Record<EntityKind, unknown> = {
    character: { reading: '', aliases: [], summary: [], body: [], authorNotes: [], goals: [], voiceRules: [] },
    group: { groupType: 'display', members: [], parentId: null, summary: [] },
    event: { summary: [], time: { mode: 'unknown', reason: '' }, laneRole: 'common', participants: [], locationId: null, itemIds: [], authorNotes: [], constraints: [] },
    place: { parentId: null, reading: '', aliases: [], body: [], mapIds: [], changes: [] },
    item: { itemMode: 'type', typeId: null, body: [], properties: null, changes: [] },
    note: { body: [], attachmentIds: [], convertedToIds: [], originNoteId: null },
    chapter: { sceneIds: [], summary: [], authorNotes: [], structureRole: '' },
    scene: { summary: [], body: [], authorNotes: [], eventIds: [], chapterId: null, threadIds: [], povId: null, goals: [], conflicts: [], results: [], newInformation: [], tension: null, importance: null, blockIds: [] },
    goal: { ownerId: null, description: [], changes: [], evidenceSceneIds: [], validity: emptyValidity() },
    flow_node: { nodeType: 'choice', sceneId: null, childGraphId: null, terminalReason: '', gate: { op: 'constant', value: true }, executionPolicy: 'manual_choice', fallbackId: null },
    flow_edge: { fromId: null, toId: { unresolved: { label: '', reason: '未完成' } }, edgeType: 'choice', label: '', condition: { op: 'constant', value: true }, effectIds: [], priority: 0, choiceLineId: null },
    flow_graph: { nodeIds: [], edgeIds: [], entryIds: [], exitIds: [], parentGraphId: null, parameters: [] },
    dialogue_line: { text: [], speakerId: null, choiceEdgeId: null, cueIds: [], originLineIds: [] },
    quest: { key: '', stateVariableId: null, description: [], flowIds: [], transitionRules: [], gameplaySpecIds: [] },
    lore: { body: [], assertionIds: [], sourceIds: [], reading: '', aliases: [] },
    variable: { key: '', valueType: 'boolean', scope: 'run', initial: unknown, allowed: { values: [false, true] }, description: [], ownerId: null, externalContractId: null, resetRules: [], transitionRules: [], externalUseDeclared: false },
    effect: { operation: 'set', targetId: null, value: unknown, condition: { op: 'constant', value: true }, instanceId: null, reason: '' },
    assertion: { subjectId: null, predicate: '', value: unknown, truthKind: 'author_truth', holderId: null, sourceIds: [], evidenceLocation: null, validity: emptyValidity(), reason: '' },
    foreshadow: { question: [], intent: [], resolutionPolicy: 'undecided', truthAssertionIds: [], clueIds: [], payoffIds: [], requiredInfo: [], deadline: null, exceptions: [] },
    disclosure: { foreshadowId: null, anchor: { entityId: null }, stage: 'hint', role: 'clue', condition: { op: 'constant', value: true }, knowledgeEffects: [], targetScope: null },
    checkpoint: { contentVersionId: null, runtimeState: emptyRuntimeState(''), origin: 'partial', traceId: null },
    trace: { contentVersionId: null, startCheckpointId: null, steps: [], seed: '', engineVersion: '1.0.0', externalMode: 'stub' },
    attachment: { mediaType: '', contentHash: '', byteSize: 0, assetPath: '', displayName: '', stage: 'reference', revisionHistory: [] },
    source: { sourceType: 'web', locator: '', accessedAt: null, excerptLocation: '', interpretation: [], attachmentId: null, redistributionAllowed: false },
    cue: { anchor: { entityId: null }, cueType: '', attachmentId: null, speakerId: null, expression: '', waitMs: null, camera: null, mediaTime: null, stage: '' },
    storyboard_frame: { anchor: { entityId: null }, mediaStartMs: 0, mediaEndMs: null, referenceAssetId: null, finalAssetId: null, cueIds: [], caption: [] },
    localization: { sourceLineId: null, language: '', sourceHash: '', text: [], stage: 'draft', reviewedBy: null, recordingIds: [] },
    recording: { sourceLineId: null, language: '', sourceHash: '', translationId: null, attachmentId: null, notes: [], stage: 'planned', reviewedBy: null },
    terminology: { canonical: '', reading: '', variants: [], language: null, usageNotes: [], validity: emptyValidity(), exceptions: [], voiceOwnerId: null },
    map: { placeId: null, coordinateSystem: 'normalized', attachmentId: null, parentMapId: null, pins: [] },
    travel_route: { fromPlaceId: null, toPlaceId: null, direction: 'one_way', method: '', minimumTicks: null, maximumTicks: null, evidence: [], validity: emptyValidity() },
    template: { targetKind: 'character', fields: [], description: '', version: '0', defaults: {} },
    collection: { mode: 'fixed', memberIds: [], query: null, sort: { field: 'name', direction: 'asc' } },
    review: { target: null, targetVersionId: null, body: [], stage: 'open', assigneeId: null, quotedText: '', resolution: [] },
    creative_brief: { targetAudience: [], experience: [], theme: [], tone: [], scope: [], deliverableIds: [], decisionIds: [] },
    decision: { subject: '', reason: [], targetVersionId: null, outcome: 'deferred', priority: '', requirementIds: [], reviewIds: [] },
    gameplay_spec: { sceneId: null, action: [], mechanic: '', tutorial: [], reward: null, questId: null, taskIds: [], intentionalDifference: '' },
    production_task: { targetIds: [], stage: 'writing', progress: 'todo', assigneeId: null, deadline: null, dependsOn: [], estimate: null, blockingReason: '' },
    media_variant: { medium: 'novel', baseSnapshotId: null, body: [], releaseAt: null, projectionProfileId: null, sourceIds: [], needsReview: false },
    voice_rule: { characterId: null, validity: emptyValidity(), firstPerson: '', addressing: '', phrasing: '', examples: [], exceptions: [] },
    external_contract: { key: '', owner: 'tool', inputType: 'boolean', outputType: 'boolean', missingPolicy: 'unknown', description: [], stubValues: [], adapterProfileIds: [], version: '1.0.0' },
    snapshot: { versionLabel: '', contentHash: '', immutable: true, parentVersionIds: [], releasedAt: null, referencedWorldVersionIds: [] },
    projection_profile: { audience: '', includedIds: [], namePolicy: { mode: 'exclude' }, allowedKinds: [], excludedFields: ['authorNotes'], routeScope: null, includeAuthorNotes: false, publicTitle: '', publicTexts: {}, allowedRelationIds: [], idPolicy: 'remap' },
  };
  if (!(kind in data)) throw new RangeError('未対応の情報種別です。');
  return data[kind] as EntityDataMap[K];
}
export function createEntity<K extends EntityKind>(projectId: ID, kind: K, name = '', data?: Partial<EntityDataMap[K]>): Entity<K> {
  const now = new Date().toISOString();
  return { id: newId(), projectId, kind, revision: '0', name, status: 'provisional', visibility: 'private', createdAt: now, updatedAt: now, customValues: {}, data: { ...defaultData(kind), ...data } } as Entity<K>;
}
export function createProject(name = '新しい作品'): ProjectData {
  return { projectId: newId(), name, formatVersion: FORMAT_VERSION, revision: '0', calendarId: GREGORIAN_CALENDAR.id, mainStart: '0', calendars: [structuredClone(GREGORIAN_CALENDAR)], worldReferences: [], entities: [], relations: [], snapshots: [], history: [], views: [] };
}
export function emptyRuntimeState(contentVersionId: ID): RuntimeState { return { contentVersionId, variableValues: {}, itemInstances: [], assertions: [], seenIds: [], visitCounts: {}, onceTriggers: [], rngSeed: 'scenario-1', rngPosition: 0, callStack: [], presentationPosition: null, loopNumber: 0, provenance: 'full_play' }; }
export function createDemoProject(): ProjectData {
  const project = createProject('霧の門 — サンプル作品'), id = project.projectId;
  const ao = createEntity(id, 'character', 'アオ', { reading: 'あお', summary: textToRichText('消えた父を探す、記録係の少女。') });
  const guard = createEntity(id, 'character', '門番', { reading: 'もんばん', summary: textToRichText('霧の門を守る人物。本名はまだ明かされていない。') });
  const gate = createEntity(id, 'place', '霧の門', { reading: 'きりのもん', body: textToRichText('町の北端。夜になると扉の文字が浮かび上がる。') });
  const event = createEntity(id, 'event', '父が鍵を隠した日', { summary: textToRichText('父は古い鍵を記録庫へ残した。'), time: { mode: 'instant', at: '-10', calendarId: project.calendarId }, laneRole: 'common', locationId: gate.id });
  const key = createEntity(id, 'variable', '鍵を持っている', { key: 'has_key', valueType: 'boolean', initial: { type: 'boolean', value: false } });
  const affection = createEntity(id, 'variable', '門番からの信頼', { key: 'guard_trust', valueType: 'integer', initial: { type: 'integer', value: 0 }, allowed: { min: -10, max: 10 } });
  const scene1 = createEntity(id, 'scene', '古い記録', { summary: textToRichText('アオは記録庫で、父の筆跡を見つける。'), body: textToRichText('「まだ、ここにいたんだね」\n埃に埋もれた本の間から、小さな鍵が落ちた。'), eventIds: [event.id], povId: ao.id, tension: 3 });
  const scene2 = createEntity(id, 'scene', '霧の門', { summary: textToRichText('鍵を得た道と、記録を飛ばした道が合流する。'), body: textToRichText('門番は掌を差し出した。\n「扉は、記憶を持つ者にしか開かない」'), povId: ao.id, tension: 7 });
  const chapter = createEntity(id, 'chapter', '第一章　残された記憶', { sceneIds: [scene1.id, scene2.id], summary: textToRichText('古い記録を読むかどうかで、門の先に進めるかが変わる。') });
  scene1.data.chapterId = chapter.id; scene2.data.chapterId = chapter.id;
  const entry = createEntity(id, 'flow_node', '記録を読むか', { nodeType: 'choice', executionPolicy: 'manual_choice' });
  const read = createEntity(id, 'flow_node', '古い記録を提示', { nodeType: 'automatic', sceneId: scene1.id, executionPolicy: 'first_match' });
  const merge = createEntity(id, 'flow_node', '同じ門へ合流', { nodeType: 'choice', sceneId: scene2.id, executionPolicy: 'manual_choice' });
  const reveal = createEntity(id, 'flow_node', '門の先へ', { nodeType: 'terminal', terminalReason: '鍵を使い、父の足跡をたどる。' });
  const stay = createEntity(id, 'flow_node', '町へ戻る', { nodeType: 'terminal', terminalReason: '手掛かりを探し直す、意図した別の結末。' });
  const setKey = createEntity(id, 'effect', '鍵を得る', { operation: 'set', targetId: key.id, value: { type: 'boolean', value: true } });
  const gainTrust = createEntity(id, 'effect', '信頼が増える', { operation: 'add', targetId: affection.id, value: { type: 'integer', value: 1 } });
  const question = createEntity(id, 'foreshadow', '門を開く鍵はどこか', { question: textToRichText('門を開く鍵はどこか？'), intent: textToRichText('父の記録と門の意味を結ぶ。'), resolutionPolicy: 'this_work' });
  const clue = createEntity(id, 'disclosure', '鍵の記録', { foreshadowId: question.id, anchor: { entityId: read.id }, role: 'clue', stage: 'hint' });
  const payoff = createEntity(id, 'disclosure', '門の真相', { foreshadowId: question.id, anchor: { entityId: reveal.id }, role: 'payoff', stage: 'reveal' });
  question.data.clueIds = [clue.id]; question.data.payoffIds = [payoff.id]; question.data.requiredInfo = [clue.id];
  const seeClue = createEntity(id, 'effect', '手掛かりを提示', { operation: 'mark_seen', targetId: clue.id, value: null });
  const seePayoff = createEntity(id, 'effect', '真相を提示', { operation: 'mark_seen', targetId: payoff.id, value: null });
  const edges: Entity<'flow_edge'>[] = [
    createEntity(id, 'flow_edge', '鍵と記録を調べる', { fromId: entry.id, toId: read.id, label: '鍵と記録を調べる', effectIds: [setKey.id, gainTrust.id, seeClue.id] }),
    createEntity(id, 'flow_edge', '記録を飛ばす', { fromId: entry.id, toId: merge.id, label: '記録を飛ばす' }),
    createEntity(id, 'flow_edge', '門へ向かう', { fromId: read.id, toId: merge.id, edgeType: 'automatic', priority: 1 }),
    createEntity(id, 'flow_edge', '鍵で門を開く', { fromId: merge.id, toId: reveal.id, label: '鍵で門を開く', condition: { op: 'compare', variableId: key.id, comparator: 'eq', value: { type: 'boolean', value: true } }, effectIds: [seePayoff.id] }),
    createEntity(id, 'flow_edge', '町へ戻る', { fromId: merge.id, toId: stay.id, label: '町へ戻る' }),
  ];
  const graph = createEntity(id, 'flow_graph', '霧の門の分岐', { nodeIds: [entry.id, read.id, merge.id, reveal.id, stay.id], edgeIds: edges.map(e => e.id), entryIds: [entry.id], exitIds: [reveal.id, stay.id] });
  const line = createEntity(id, 'dialogue_line', '', { speakerId: guard.id, text: textToRichText('扉は、記憶を持つ者にしか開かない。') });
  const task = createEntity(id, 'production_task', '門の場面を見直す', { targetIds: [scene2.id], stage: 'review', progress: 'todo' });
  project.entities = [ao, guard, gate, event, key, affection, scene1, scene2, chapter, entry, read, merge, reveal, stay, setKey, gainTrust, question, clue, payoff, seeClue, seePayoff, ...edges, graph, line, task];
  project.entities.forEach(entity => { entity.status = 'confirmed'; });
  project.relations = [{ id: newId(), projectId: id, revision: '0', fromId: ao.id, toId: guard.id, relationType: 'trust', direction: 'forward', validity: emptyValidity(), evidenceIds: [scene2.id], status: 'provisional', visibility: 'private' }];
  return project;
}

export interface DomainReference { id: ID; path: string; kinds?: EntityKind[]; scope: 'entity' | 'relation' | 'record' | 'projection_record' | 'presentation' | 'block' | 'alias' | 'snapshot' | 'project' | 'calendar' | 'identity' }
type Field = { schema: Schema; required?: boolean; nullable?: boolean };
export type Schema =
  | { type: 'text'; min?: number; max?: number; maxBytes?: number }
  | { type: 'number'; integer?: boolean; min?: number; max?: number }
  | { type: 'boolean' | 'id' | 'tick' | 'revision' | 'datetime' | 'date' | 'hash' | 'safe_path' | 'custom' | 'typed' | 'time' | 'condition' | 'expression' | 'name_policy' | 'json' }
  | { type: 'enum'; values: readonly (string | boolean | null)[] }
  | { type: 'ref'; kinds?: EntityKind[]; scope?: DomainReference['scope'] }
  | { type: 'richtext'; max?: number }
  | { type: 'array'; item: Schema; min?: number; max?: number; unique?: boolean }
  | { type: 'object'; fields: Record<string, Field> }
  | { type: 'record'; value: Schema; key?: Schema }
  | { type: 'union'; choices: Schema[] }
  | { type: 'query' };
const txt = (min = 0, max?: number): Schema => ({ type: 'text', min, max, maxBytes: 1024 * 1024 });
const short: Schema = txt(0, 128), key: Schema = txt(1, 128);
const num = (min?: number, max?: number, integer = false): Schema => ({ type: 'number', min, max, integer });
const bool: Schema = { type: 'boolean' }, idSchema: Schema = { type: 'id' }, tick: Schema = { type: 'tick' }, typed: Schema = { type: 'typed' };
const en = (...values: (string | boolean | null)[]): Schema => ({ type: 'enum', values });
const ref = (...kinds: EntityKind[]): Schema => ({ type: 'ref', kinds: kinds.length ? kinds : undefined, scope: 'entity' });
const scopedRef = (scope: DomainReference['scope']): Schema => ({ type: 'ref', scope });
const arr = (item: Schema, unique = false, min?: number, max?: number): Schema => ({ type: 'array', item, unique, min, max });
const refs = (...kinds: EntityKind[]): Schema => arr(ref(...kinds), true);
const obj = (fields: Record<string, Field>): Schema => ({ type: 'object', fields });
const req = (schema: Schema): Field => ({ schema, required: true });
const opt = (schema: Schema): Field => ({ schema, nullable: true });
const optionalValue = (schema: Schema): Field => ({ schema, nullable: false });
const rich: Schema = { type: 'richtext' }, summary: Schema = { type: 'richtext', max: 2048 };
const cond: Schema = { type: 'condition' }, time: Schema = { type: 'time' };
const record = (value: Schema, recordKey?: Schema): Schema => ({ type: 'record', value, key: recordKey });
const union = (...choices: Schema[]): Schema => ({ type: 'union', choices });
const anchor = obj({ entityId: req(ref()), blockId: opt(scopedRef('block')), lineId: opt(ref('dialogue_line')), start: opt(num(0, undefined, true)), end: opt(num(0, undefined, true)), sourceVersionId: opt(scopedRef('snapshot')), positionStatus: opt(en('unresolved')), positionReason: opt(txt(1)), quotedText: opt(txt()) });
const unresolvedTextAnnotation = union(obj({ kind: req(en('ruby')), originalText: req(txt()), reason: req(txt(1)), reading: req(txt()) }), obj({ kind: req(en('link')), originalText: req(txt()), reason: req(txt(1)), target: req(anchor) }));
const nullableValidity = obj({ worldRange: { schema: obj({ start: { schema: tick, required: true, nullable: true }, end: { schema: tick, required: true, nullable: true } }), required: true, nullable: true }, routeCondition: { schema: cond, required: true, nullable: true }, presentationAnchor: { schema: anchor, required: true, nullable: true } });
const targetScope = obj({ projectId: req(scopedRef('project')), graphId: opt(ref('flow_graph')), chapterId: opt(ref('chapter')), routeCondition: opt(cond), targetSnapshotId: opt(scopedRef('snapshot')) });
const alias = obj({ id: req(idSchema), text: req(txt(1, 128)), reading: req(short), validity: req(nullableValidity), audienceHolderIds: req(refs('character')), isPublicDefault: req(bool) });
const exception = obj({ reason: req(txt(1)), targetScope: req(targetScope), validity: req(nullableValidity), evidenceIds: req(refs()) });
const transition = obj({ from: req(typed), to: req(typed), reason: opt(txt()), exception: opt(bool), exceptionDetails: opt(exception) });
const resetRule = obj({ on: req(en('scene_end', 'chapter_end', 'run_end', 'new_loop', 'full_reset')), value: req(typed), reason: opt(txt()) });
const allowed = obj({ min: opt(num(undefined, undefined, true)), max: opt(num(undefined, undefined, true)), values: opt(arr(union(txt(), bool), true)) });
const trigger = obj({ id: opt(idSchema), event: req(en('enter', 'talk', 'battle_result', 'manual', 'custom')), eventKey: req(txt()), repeat: req(en('once', 'repeatable')), scope: opt(en(...SCOPES)), deadline: opt(time) });
const reuse = obj({ mode: req(en('reference', 'clone', 'override')), sourceId: req(ref()), pinnedSnapshotId: req(scopedRef('snapshot')), overrideFields: req(arr(txt(1), true)), bindings: opt(record(idSchema, idSchema)) });
const unresolved = obj({ unresolved: req(obj({ label: req(txt()), reason: req(txt(1)) })) });
const runtimeItem = obj({ instanceId: req(idSchema), typeId: req(ref('item')), quantity: req(num(0, undefined, true)), ownerId: opt(ref('character', 'group')), locationId: opt(ref('place')), consumed: req(bool), reason: opt(txt()) });
const runtimeAssertion = obj({ assertionId: req(ref('assertion')), holderId: opt(ref('character')), truth: req(en('true', 'false', 'unknown')), sourceEffectId: opt(ref('effect')) });
const presentationResult = obj({ targetId: req(ref('flow_node', 'flow_edge', 'disclosure')), value: req(en('true', 'false', 'unknown')), reasons: req(arr(txt())) });
const callFrame = obj({ graphId: req(ref('flow_graph')), returnNodeId: req(ref('flow_node')), parameters: req(record(typed, key)) });
const runtime = obj({ contentVersionId: req(scopedRef('snapshot')), variableValues: req(record(typed, ref('variable'))), itemInstances: req(arr(runtimeItem)), assertions: req(arr(runtimeAssertion)), seenIds: req(arr(scopedRef('presentation'), true)), visitCounts: req(record(num(0, undefined, true), ref())), onceTriggers: req(arr(txt(1), true)), rngSeed: req(txt(1)), rngPosition: req(num(0, undefined, true)), callStack: req(arr(callFrame)), presentationPosition: opt(ref('flow_node')), loopNumber: req(num(0, undefined, true)), provenance: req(en('full_play', 'partial', 'imported', 'stub')), resetCauses: opt(arr(obj({ variableId: req(ref('variable')), on: req(en('scene_end', 'chapter_end', 'run_end', 'new_loop', 'full_reset')), before: req(typed), after: req(typed), reason: req(txt()) }))) });
const readingOccurrence = obj({ entityId: req(ref('scene')), occurrenceId: req(txt(1, 256)), before: req(runtime), after: req(runtime), presentationState: opt(runtime), conditionResults: req(arr(presentationResult)), externalValues: opt(record(typed, ref('external_contract'))), worldTick: opt(tick) });
const readingPath = obj({ chapterIds: req(refs('chapter')), sceneIds: req(arr(ref('scene'))), occurrences: req(arr(readingOccurrence)) });
const groupCoverage = obj({ checked: req(num(0, undefined, true)), total: req(num(0, undefined, true)) });
const coverageCount = obj({ byProvenance: opt(record(groupCoverage, en('full_play', 'partial', 'imported', 'stub'))), byExternalMode: opt(record(groupCoverage, en('internal', 'stub', 'actual', 'mixed'))), checked: req(num(0, undefined, true)), total: req(num(0, undefined, true)), excluded: opt(num(0, undefined, true)), unknown: opt(num(0, undefined, true)) });
const coverage = obj(Object.fromEntries(['scenes', 'dialogue', 'choices', 'conditionTrue', 'conditionFalse', 'declaredTests'].map(field => [field, req(coverageCount)])));
const fieldDefinition = obj({ key: req(key), label: req(txt(1, 128)), type: req(en('text', 'number', 'boolean', 'enum', 'date', 'ref')), required: req(bool), nullable: req(bool), default: { schema: { type: 'custom' }, required: true, nullable: true }, allowedValues: opt(arr(txt(), true)), targetKinds: opt(arr(en(...ENTITY_KINDS), true)), help: opt(txt()) });
const estimate = obj({ value: opt(num(0)), range: opt(obj({ min: req(num(0)), max: req(num(0)) })), unit: req(txt(1)), assumptions: req(arr(txt())), scope: req(targetScope), unknownCount: req(num(0, undefined, true)), source: req(txt()), speed: opt(num(Number.MIN_VALUE)) });
const publicText = obj({
  ...Object.fromEntries(['summary', 'body', 'text', 'description', 'question', 'intent', 'caption', 'usageNotes', 'interpretation'].map(field => [field, opt(rich)])),
  ...Object.fromEntries(['label', 'reading', 'terminalReason', 'reason', 'key', 'canonical', 'language', 'locale', 'sourceHash', 'expression', 'method', 'locator', 'predicate', 'cueType', 'precision', 'displayName', 'relationType', 'eventKey'].map(field => [field, opt(txt())])),
});

/** Field registry doubles as the reference walker; text is never searched for UUIDs. */
export const ENTITY_SCHEMAS: Record<EntityKind, Schema> = {
  character: obj({ reading: opt(short), aliases: opt(arr(alias)), summary: opt(summary), body: opt(rich), authorNotes: opt(rich), birth: opt(time), death: opt(time), goals: opt(refs('goal')), voiceRules: opt(refs('voice_rule')) }),
  group: obj({ groupType: req(en('display', 'faction', 'plot_thread', 'category')), members: opt(refs()), parentId: opt(ref('group')), summary: opt(summary) }),
  event: obj({ summary: req(summary), time: req(time), laneRole: req(en('common', 'participants', 'both')), participants: opt(arr(obj({ characterId: req(ref('character')), role: req(en('actor', 'witness', 'mentioned', 'informed', 'custom')), evidenceIds: opt(refs()), knowledgeEffectIds: opt(refs('effect')) }))), locationId: opt(ref('place')), itemIds: opt(refs('item')), authorNotes: opt(rich), constraints: opt(arr(union(obj({ type: req(en('before', 'same_start')), targetEventId: req(ref('event')) }), obj({ type: req(en('end_gap')), targetEventId: req(ref('event')), minimumTicks: req(tick), maximumTicks: req(tick) })))) }),
  place: obj({ parentId: opt(ref('place')), reading: opt(short), aliases: opt(arr(alias)), body: opt(rich), mapIds: opt(refs('map')), changes: opt(refs('assertion')) }),
  item: obj({ itemMode: req(en('type', 'instance')), typeId: opt(ref('item')), body: opt(rich), properties: opt({ type: 'custom' }), changes: opt(refs('assertion')) }),
  note: obj({ body: req(rich), attachmentIds: opt(refs('attachment')), convertedToIds: opt(refs()), originNoteId: opt(ref('note')) }),
  chapter: obj({ sceneIds: req(refs('scene')), summary: opt(summary), authorNotes: opt(rich), structureRole: opt(short) }),
  scene: obj({ summary: req(summary), body: req(rich), authorNotes: req(rich), eventIds: req(refs('event')), dialogueLineIds: opt(refs('dialogue_line')), chapterId: opt(ref('chapter')), threadIds: opt(refs('group')), povId: opt(ref('character')), goals: opt(rich), conflicts: opt(rich), results: opt(rich), newInformation: opt(rich), tension: opt(num(0, 10)), importance: opt(num(0, 10)), blockIds: opt(arr(scopedRef('block'), true)), reuse: opt(reuse) }),
  goal: obj({ ownerId: req(ref('character', 'group')), description: req(rich), changes: opt(refs('assertion')), evidenceSceneIds: opt(refs('scene')), validity: opt(nullableValidity) }),
  flow_node: obj({ nodeType: req(en('scene', 'choice', 'automatic', 'call', 'entry', 'exit', 'terminal')), sceneId: opt(ref('scene')), childGraphId: opt(ref('flow_graph')), terminalReason: opt(txt()), trigger: opt(trigger), gate: opt(cond), executionPolicy: opt(en('manual_choice', 'first_match', 'all_match')), fallbackId: opt(ref('flow_node')), reuse: opt(reuse) }),
  flow_edge: obj({ fromId: req(ref('flow_node')), toId: req(union(ref('flow_node'), unresolved)), edgeType: req(en('choice', 'automatic', 'call_return')), label: opt(txt()), condition: opt(cond), effectIds: opt(refs('effect')), priority: opt(num(undefined, undefined, true)), choiceLineId: opt(ref('dialogue_line')) }),
  flow_graph: obj({ nodeIds: req(refs('flow_node')), edgeIds: req(refs('flow_edge')), entryIds: req(refs('flow_node')), exitIds: req(refs('flow_node')), parentGraphId: opt(ref('flow_graph')), parameters: opt(arr(obj({ key: req(key), type: req(en('boolean', 'integer', 'enum')), default: opt(typed) }))) }),
  dialogue_line: obj({ text: req(rich), speakerId: opt(ref('character')), choiceEdgeId: opt(ref('flow_edge')), cueIds: opt(refs('cue')), originLineIds: opt(refs('dialogue_line')), claimAssertionIds: opt(refs('assertion')), assertionIntent: opt(en('statement', 'lie', 'misunderstanding', 'quotation')), assertionReason: opt(txt()) }),
  quest: obj({ key: req(key), stateVariableId: req(ref('variable')), description: opt(rich), flowIds: opt(refs('flow_graph')), transitionRules: opt(arr(transition)), gameplaySpecIds: opt(refs('gameplay_spec')) }),
  lore: obj({ body: req(rich), assertionIds: opt(refs('assertion')), sourceIds: opt(refs('source')), reading: opt(short), aliases: opt(arr(alias)) }),
  variable: obj({ key: req(key), valueType: req(en('boolean', 'integer', 'enum')), scope: req(en(...SCOPES)), initial: req(typed), allowed: req(allowed), description: opt(rich), ownerId: opt(ref('character')), derived: opt({ type: 'expression' }), externalContractId: opt(ref('external_contract')), resetRules: opt(arr(resetRule)), transitionRules: opt(arr(transition)), exclusions: opt(arr(obj({ variableId: req(ref('variable')), value: req(typed), otherValue: req(typed), reason: req(txt(1)), exceptions: opt(arr(exception)) }))), externalUseDeclared: opt(bool) }),
  effect: obj({ operation: req(en('set', 'add', 'grant', 'consume', 'move', 'assert', 'mark_seen', 'reset')), targetId: req(ref()), value: opt(typed), condition: opt(cond), instanceId: opt(ref('item')), reason: opt(txt()), exceptionDetails: opt(exception) }),
  assertion: obj({ subjectId: req(ref()), predicate: req(txt(1, 128)), value: req(union(typed, ref())), truthKind: req(en('author_truth', 'testimony', 'belief', 'hypothesis')), holderId: opt(ref('character')), sourceIds: opt(refs('source', 'assertion', 'event', 'scene', 'dialogue_line')), evidenceLocation: opt(anchor), validity: opt(nullableValidity), reason: opt(txt()) }),
  foreshadow: obj({ question: req(rich), intent: req(rich), resolutionPolicy: req(en('this_work', 'sequel', 'intentional_open', 'red_herring', 'undecided', 'rejected')), truthAssertionIds: opt(refs('assertion')), clueIds: opt(refs('disclosure')), payoffIds: opt(refs('disclosure')), requiredInfo: opt(refs('disclosure', 'assertion')), alternativeInfo: opt(record(refs('disclosure', 'assertion'), ref('disclosure', 'assertion'))), deadline: opt(targetScope), exceptions: opt(arr(exception)) }),
  disclosure: obj({ foreshadowId: req(ref('foreshadow')), anchor: req(anchor), stage: req(en('hint', 'suspicion', 'reinforce', 'reveal', 'alternative')), role: req(en('clue', 'payoff')), condition: opt(cond), knowledgeEffects: opt(refs('effect')), targetScope: opt(targetScope) }),
  checkpoint: obj({ contentVersionId: req(scopedRef('snapshot')), runtimeState: req(runtime), presentationState: opt(runtime), presentationResults: opt(arr(presentationResult)), contentRevision: opt({ type: 'revision' }), origin: opt(en('full_play', 'partial', 'imported')), traceId: opt(ref('trace')) }),
  trace: obj({ contentVersionId: req(scopedRef('snapshot')), startCheckpointId: req(ref('checkpoint')), steps: req(arr(obj({ nodeId: req(ref('flow_node')), edgeIds: req(refs('flow_edge')), before: req(runtime), after: req(runtime), presentationState: opt(runtime), conditionResults: opt(arr(presentationResult)), operation: opt(en('advance', 'stub')), occurrenceId: opt(txt()), worldTick: opt(tick), externalMode: opt(en('stub', 'actual', 'mixed')), externalValues: opt(record(typed, ref('external_contract'))) }))), contentRevision: opt({ type: 'revision' }), initialExternalValues: opt(record(typed, ref('external_contract'))), initialWorldTick: opt(tick), seed: opt(txt()), engineVersion: opt(txt()), externalMode: opt(en('stub', 'actual', 'mixed')), coverage: opt(coverage), regressionDeclarations: opt(obj({ projectRevision: req({ type: 'revision' }), traceIds: req(refs('trace')) })), mode: opt(en('flow', 'chapters', null)), readingPath: opt(union(readingPath, en(null))) }),
  attachment: obj({ mediaType: req(txt(1, 128)), contentHash: req({ type: 'hash' }), byteSize: req(num(0, 32 * 1024 * 1024, true)), assetPath: req({ type: 'safe_path' }), displayName: opt(txt()), provenanceId: opt(ref('source')), licenseNote: opt(txt()), stage: opt(en('reference', 'temporary', 'final')), revisionHistory: opt(refs('attachment')) }),
  source: obj({ sourceType: req(en('web', 'file', 'book', 'observation')), locator: req(txt(1)), accessedAt: opt({ type: 'datetime' }), excerptLocation: opt(txt()), interpretation: opt(rich), attachmentId: opt(ref('attachment')), redistributionAllowed: opt(bool) }),
  cue: obj({ anchor: req(anchor), cueType: req(txt(1, 128)), attachmentId: opt(ref('attachment')), speakerId: opt(ref('character')), expression: opt(txt()), waitMs: opt(num(0, undefined, true)), camera: opt({ type: 'custom' }), mediaTime: opt(num(0, undefined, true)), stage: opt(short) }),
  storyboard_frame: obj({ anchor: req(anchor), mediaStartMs: req(num(0, undefined, true)), mediaEndMs: opt(num(0, undefined, true)), referenceAssetId: opt(ref('attachment')), finalAssetId: opt(ref('attachment')), cueIds: opt(refs('cue')), caption: opt(rich) }),
  localization: obj({ sourceLineId: req(ref('dialogue_line')), language: req(txt(1, 128)), sourceHash: req({ type: 'hash' }), text: req(rich), stage: opt(en('draft', 'reviewed', 'needs_review')), reviewedBy: opt(scopedRef('identity')), recordingIds: opt(refs('recording')) }),
  recording: obj({ sourceLineId: req(ref('dialogue_line')), language: req(txt(1, 128)), sourceHash: req({ type: 'hash' }), translationId: opt(ref('localization')), attachmentId: opt(ref('attachment')), notes: opt(rich), stage: opt(en('planned', 'recorded', 'reviewed', 'needs_review')), reviewedBy: opt(scopedRef('identity')) }),
  terminology: obj({ canonical: req(txt(1, 128)), reading: req(short), variants: opt(arr(short, true)), language: opt(short), usageNotes: opt(rich), validity: opt(nullableValidity), exceptions: opt(arr(exception)), voiceOwnerId: opt(ref('character')) }),
  map: obj({ placeId: req(ref('place')), coordinateSystem: req(en('normalized')), attachmentId: opt(ref('attachment')), parentMapId: opt(ref('map')), pins: opt(arr(obj({ id: req(idSchema), placeId: req(ref('place')), x: req(num(0, 1)), y: req(num(0, 1)), label: opt(txt()) }))) }),
  travel_route: obj({ fromPlaceId: req(ref('place')), toPlaceId: req(ref('place')), direction: req(en('one_way', 'two_way')), method: opt(txt()), minimumTicks: opt(tick), maximumTicks: opt(tick), evidence: opt(refs()), validity: opt(nullableValidity) }),
  template: obj({ targetKind: req(en(...ENTITY_KINDS)), fields: req(arr(fieldDefinition)), description: opt(txt()), version: opt({ type: 'revision' }), defaults: opt(record({ type: 'custom' }, key)) }),
  collection: obj({ purpose: opt(en('regression')), mode: req(en('dynamic', 'fixed')), query: opt({ type: 'query' }), memberIds: opt(refs()), sort: opt(obj({ field: req(en('name', 'createdAt', 'updatedAt', 'kind')), direction: req(en('asc', 'desc')) })) }),
  review: obj({ target: req(union(anchor, ref())), targetVersionId: req(scopedRef('snapshot')), body: req(rich), stage: req(en('open', 'fixed', 'verified')), assigneeId: opt(scopedRef('identity')), quotedText: opt(txt()), resolution: opt(rich) }),
  creative_brief: obj({ targetAudience: req(rich), experience: req(rich), theme: req(rich), tone: req(rich), scope: req(rich), deliverableIds: opt(refs()), decisionIds: opt(refs('decision')) }),
  decision: obj({ subject: req(txt(1)), reason: req(rich), targetVersionId: req(scopedRef('snapshot')), outcome: req(en('accepted', 'rejected', 'deferred')), priority: opt(short), requirementIds: opt(arr(short, true)), reviewIds: opt(refs('review')) }),
  gameplay_spec: obj({ sceneId: req(ref('scene')), action: req(rich), mechanic: opt(txt()), tutorial: opt(rich), reward: opt(typed), questId: opt(ref('quest')), taskIds: opt(refs('production_task')), intentionalDifference: opt(txt()) }),
  production_task: obj({ targetIds: req(refs()), stage: req(en('writing', 'review', 'implementation', 'translation', 'recording', 'verification', 'publication')), progress: req(en('todo', 'doing', 'done', 'needs_review')), assigneeId: opt(scopedRef('identity')), deadline: opt(obj({ date: req({ type: 'date' }), timeZone: req(txt(1, 128)) })), dependsOn: opt(refs('production_task')), estimate: opt(estimate), blockingReason: opt(txt()) }),
  media_variant: obj({ medium: req(en('game', 'novel', 'video', 'audio', 'promotion', 'custom')), baseSnapshotId: req(scopedRef('snapshot')), body: opt(rich), releaseAt: opt({ type: 'datetime' }), projectionProfileId: opt(ref('projection_profile')), sourceIds: opt(refs()), needsReview: opt(bool) }),
  voice_rule: obj({ characterId: req(ref('character')), validity: req(nullableValidity), firstPerson: opt(short), addressing: opt(txt()), phrasing: opt(txt()), examples: opt(rich), exceptions: opt(arr(exception)) }),
  external_contract: obj({ key: req(key), owner: req(en('tool', 'game')), inputType: req(txt(1, 128)), outputType: req(txt(1, 128)), missingPolicy: req(en('unknown', 'block')), description: opt(rich), stubValues: opt(arr(typed)), adapterProfileIds: opt(refs('projection_profile')), version: opt(short) }),
  snapshot: obj({ versionLabel: req(txt(1, 128)), contentHash: req({ type: 'hash' }), immutable: req(en(true)), parentVersionIds: opt(arr(scopedRef('snapshot'), true)), releasedAt: opt({ type: 'datetime' }), referencedWorldVersionIds: opt(arr(scopedRef('snapshot'), true)) }),
  projection_profile: obj({ audience: req(txt(1, 128)), includedIds: req(refs()), namePolicy: req({ type: 'name_policy' }), allowedKinds: opt(arr(en(...ENTITY_KINDS), true)), excludedFields: opt(arr(txt(1), true)), routeScope: opt(targetScope), includeAuthorNotes: opt(bool), publicTitle: opt(txt()), publicTexts: opt(record(publicText, scopedRef('record'))), allowedFields: opt(record(arr(txt(1), true), en(...ENTITY_KINDS))), allowedRelationIds: opt(arr(scopedRef('relation'), true)), idPolicy: opt(en('remap', 'preserve')), publicIds: opt(record(idSchema, scopedRef('projection_record'))), sourceVersionId: opt(scopedRef('snapshot')), publicValues: opt(record(record(txt(), txt()), ref('variable', 'external_contract', 'assertion'))), includedStatuses: opt(arr(en(...STATUSES), true)), publicVersionLabel: opt(txt()), approvedAttachmentIds: opt(refs('attachment')) }),
};

const isObject = (value: unknown): value is Record<string, unknown> => !!value && typeof value === 'object' && !Array.isArray(value) && (Object.getPrototypeOf(value) === Object.prototype || Object.getPrototypeOf(value) === null);
const utf8Bytes = (value: string): number => new TextEncoder().encode(value).byteLength;
function validUnicode(value: string): boolean {
  for (let i = 0; i < value.length; i++) {
    const code = value.charCodeAt(i);
    if (code >= 0xd800 && code <= 0xdbff) { const next = value.charCodeAt(++i); if (!(next >= 0xdc00 && next <= 0xdfff)) return false; }
    else if (code >= 0xdc00 && code <= 0xdfff) return false;
  }
  return true;
}
function addIssue(issues: ValidationIssue[], path: string, message: string, code: ValidationIssue['code'] = 'VALIDATION_FAILED'): void { if (issues.length < 256) issues.push({ code, path, message }); }
function validDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00Z`); return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
}
function conditionSchema(value: Record<string, unknown>): Schema | undefined {
  switch (value.op) {
    case 'constant': return obj({ op: req(en('constant')), value: req(bool) });
    case 'all': case 'any': return obj({ op: req(en('all', 'any')), children: req(arr(cond, false, 1, 256)) });
    case 'not': return obj({ op: req(en('not')), child: req(cond) });
    case 'compare': return obj({ op: req(en('compare')), variableId: req(ref('variable')), comparator: req(en('eq', 'ne', 'lt', 'le', 'gt', 'ge', 'in')), value: req(value.comparator === 'in' ? arr(typed, false, 1, 256) : typed) });
    case 'item': return obj({ op: req(en('item')), itemId: req(ref('item')), quantity: req(num(1, undefined, true)) });
    case 'known': return obj({ op: req(en('known')), assertionId: req(ref('assertion')), holderId: req(ref('character')) });
    case 'visited': return obj({ op: req(en('visited')), entityId: req(ref()), count: req(num(1, undefined, true)) });
    case 'external': return obj({ op: req(en('external')), contractId: req(ref('external_contract')) });
    default: return undefined;
  }
}
function expressionSchema(value: Record<string, unknown>): Schema | undefined {
  const expression: Schema = { type: 'expression' };
  switch (value.op) {
    case 'value': return obj({ op: req(en('value')), value: req(typed) });
    case 'variable': return obj({ op: req(en('variable')), variableId: req(ref('variable')) });
    case 'add': case 'subtract': case 'multiply': return obj({ op: req(en('add', 'subtract', 'multiply')), left: req(expression), right: req(expression) });
    case 'if': return obj({ op: req(en('if')), condition: req(cond), then: req(expression), else: req(expression) });
    default: return conditionSchema(value);
  }
}
function timeSchema(value: Record<string, unknown>): Schema | undefined {
  const calendarId = req(scopedRef('calendar'));
  switch (value.mode) {
    case 'instant': return obj({ mode: req(en('instant')), at: req(tick), calendarId });
    case 'interval': return obj({ mode: req(en('interval')), start: req(tick), end: req(tick), calendarId });
    case 'uncertain': return obj({ mode: req(en('uncertain')), earliest: req(tick), latest: req(tick), calendarId, precision: req(txt()) });
    case 'relative': return obj({ mode: req(en('relative')), anchorEventId: req(ref('event')), anchorPoint: req(en('start', 'end')), minOffset: req(tick), maxOffset: req(tick) });
    case 'unknown': return obj({ mode: req(en('unknown')), reason: req(txt()) });
    default: return undefined;
  }
}
function querySchema(value: Record<string, unknown>): Schema | undefined {
  switch (value.op) {
    case 'all': case 'any': return obj({ op: req(en('all', 'any')), children: req(arr({ type: 'query' }, false, 1, 256)) });
    case 'kind': return obj({ op: req(en('kind')), value: req(en(...ENTITY_KINDS)) });
    case 'text': return obj({ op: req(en('text')), value: req(txt()) });
    case 'status': return obj({ op: req(en('status')), value: req(en(...STATUSES)) });
    case 'participant': return obj({ op: req(en('participant')), characterId: req(ref('character')) });
    case 'production': return obj({ op: req(en('production')), value: req(en('todo', 'doing', 'done', 'needs_review')) });
    case 'chapter': return obj({ op: req(en('chapter')), chapterId: req(ref('chapter')) });
    case 'foreshadow': return obj({
      op: req(en('foreshadow')),
      foreshadowId: optionalValue(ref('foreshadow')),
      resolutionPolicy: optionalValue(en('this_work', 'sequel', 'intentional_open', 'red_herring', 'undecided', 'rejected')),
      role: optionalValue(en('clue', 'payoff')),
      stage: optionalValue(en('hint', 'suspicion', 'reinforce', 'reveal', 'alternative')),
    });
    default: return undefined;
  }
}
function namePolicySchema(value: Record<string, unknown>): Schema | undefined {
  if (!('mode' in value)) {
    const policy = union(...['alias', 'replace', 'exclude', 'anonymize'].map(mode => namePolicySchema({ mode })!));
    return obj({ defaultPolicy: opt(policy), byEntityId: opt(record(policy, ref())) });
  }
  switch (value.mode) {
    case 'alias': return obj({ mode: req(en('alias')), aliasId: req(scopedRef('alias')) });
    case 'replace': return obj({ mode: req(en('replace')), replacement: req(txt(1, 128)) });
    case 'exclude': return obj({ mode: req(en('exclude')) });
    case 'anonymize': return obj({ mode: req(en('anonymize')), publicId: req(idSchema), publicName: req(txt(1, 128)) });
    default: return undefined;
  }
}
interface AstBudget { counter: { count: number }; depth: number }
function walk(schema: Schema, value: unknown, path: string, issues: ValidationIssue[], references: DomainReference[], depth = 0, ast?: AstBudget): void {
  if (issues.length >= 256) return;
  if (depth > 32) { addIssue(issues, path, '構造の深さが上限32を超えています。', 'IMPORT_LIMIT'); return; }
  const fail = (message: string): void => addIssue(issues, path, message);
  switch (schema.type) {
    case 'json': {
      const visit = (item: unknown, itemPath: string, level: number, seen: Set<object>): void => {
        if (level > 100) { addIssue(issues, itemPath, 'JSON階層の上限を超えています。', 'IMPORT_LIMIT'); return; }
        if (item === null || typeof item === 'string' || typeof item === 'boolean') return;
        if (typeof item === 'number' && Number.isFinite(item)) return;
        if (!item || typeof item !== 'object' || seen.has(item)) { addIssue(issues, itemPath, '通常のJSON値を指定してください。'); return; }
        seen.add(item);
        if (Array.isArray(item)) item.forEach((child, index) => visit(child, `${itemPath}[${index}]`, level + 1, seen));
        else if (Object.getPrototypeOf(item) === Object.prototype || Object.getPrototypeOf(item) === null) {
          for (const [key, child] of Object.entries(item)) {
            if (['__proto__', 'prototype', 'constructor'].includes(key)) addIssue(issues, `${itemPath}.${key}`, '予約済みのキーは使えません。');
            else visit(child, `${itemPath}.${key}`, level + 1, seen);
          }
        } else addIssue(issues, itemPath, '通常のJSONオブジェクトを指定してください。');
        seen.delete(item);
      };
      visit(value, path, 0, new Set()); return;
    }
    case 'text': {
      if (typeof value !== 'string') { fail('文字列を入力してください。'); return; }
      if (!validUnicode(value)) fail('文字列に不正なUnicodeがあります。');
      const count = [...value].length;
      if (schema.min !== undefined && count < schema.min) fail(`${schema.min}文字以上で入力してください。`);
      if (schema.max !== undefined && count > schema.max) fail(`${schema.max}文字以内で入力してください。`);
      if (schema.maxBytes !== undefined && utf8Bytes(value) > schema.maxBytes) fail('本文が1 MiBの上限を超えています。');
      return;
    }
    case 'number':
      if (typeof value !== 'number' || !Number.isFinite(value) || (schema.integer && !Number.isSafeInteger(value))) fail(schema.integer ? '安全な範囲の整数を入力してください。' : '有限の数値を入力してください。');
      else if ((schema.min !== undefined && value < schema.min) || (schema.max !== undefined && value > schema.max)) fail('数値が許容範囲外です。');
      return;
    case 'boolean': if (typeof value !== 'boolean') fail('真偽値を指定してください。'); return;
    case 'enum': if (!schema.values.includes(value as string | boolean | null)) fail('宣言された値を選んでください。'); return;
    case 'id': if (typeof value !== 'string' || !ID_PATTERN.test(value)) fail('小文字のUUIDを指定してください。'); return;
    case 'ref': {
      const valid = typeof value === 'string' && (schema.scope === 'calendar' ? value.length > 0 : ID_PATTERN.test(value));
      if (!valid) fail(schema.scope === 'calendar' ? '暦IDが必要です。' : '参照先は小文字UUIDです。');
      else references.push({ id: value as string, path, kinds: schema.kinds, scope: schema.scope ?? 'entity' });
      return;
    }
    case 'tick': if (!isTick(value)) fail('tickは38桁以内の正規整数文字列です。'); return;
    case 'revision': if (typeof value !== 'string' || !REVISION_PATTERN.test(value)) fail('revisionは0以上の整数文字列です。'); return;
    case 'datetime':
      if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}T(?:[01][0-9]|2[0-3]):[0-5][0-9]:[0-5][0-9](?:\.\d+)?(?:Z|\+00:00)$/.test(value) || !Number.isFinite(Date.parse(value)) || !validDate(value.slice(0, 10))) fail('UTCのRFC 3339日時を指定してください。');
      return;
    case 'date': if (typeof value !== 'string' || !validDate(value)) fail('実在するYYYY-MM-DD形式の日付を指定してください。'); return;
    case 'hash': if (typeof value !== 'string' || !/^[0-9a-f]{64}$/.test(value)) fail('SHA-256は小文字16進数64文字です。'); return;
    case 'safe_path':
      if (typeof value !== 'string' || !value || value.startsWith('/') || value.includes('\\') || value.includes('\0') || /^[a-zA-Z]:/.test(value) || value.split('/').some(part => !part || part === '.' || part === '..') || /[\u0000-\u001f\u007f]/.test(value)) fail('安全な相対パスを指定してください。');
      return;
    case 'array': {
      if (!Array.isArray(value)) { fail('配列を指定してください。'); return; }
      if (value.length > (schema.max ?? 100_000) || (schema.min !== undefined && value.length < schema.min)) { fail('配列の件数が許容範囲外です。'); return; }
      if (schema.unique && new Set(value.map(item => typeof item === 'object' ? JSON.stringify(item) : item)).size !== value.length) fail('同じ値を集合内で重複保存できません。');
      value.forEach((item, i) => walk(schema.item, item, `${path}[${i}]`, issues, references, depth + 1, ast)); return;
    }
    case 'object': {
      if (!isObject(value)) { fail('オブジェクトを指定してください。'); return; }
      for (const field of Object.keys(value)) if (!Object.hasOwn(schema.fields, field)) addIssue(issues, `${path}.${field}`, '未知の項目は保存できません。');
      for (const [field, definition] of Object.entries(schema.fields)) {
        const item = value[field], fieldPath = `${path}.${field}`;
        if (item === undefined) { if (definition.required) addIssue(issues, fieldPath, '必須項目です。'); continue; }
        if (item === null && definition.nullable) continue;
        walk(definition.schema, item, fieldPath, issues, references, depth + 1, ast);
      }
      return;
    }
    case 'record':
      if (!isObject(value)) { fail('項目の辞書を指定してください。'); return; }
      for (const [field, item] of Object.entries(value)) {
        if (['__proto__', 'prototype', 'constructor'].includes(field)) { addIssue(issues, `${path}.${field}`, '予約済みのキーは使えません。'); continue; }
        if (schema.key) walk(schema.key, field, `${path}.${field}.$key`, issues, references, depth + 1, ast);
        walk(schema.value, item, `${path}.${field}`, issues, references, depth + 1, ast);
      }
      return;
    case 'union': {
      let shortest: ValidationIssue[] | undefined;
      for (const choice of schema.choices) {
        const branchIssues: ValidationIssue[] = [], branchRefs: DomainReference[] = [];
        walk(choice, value, path, branchIssues, branchRefs, depth + 1, ast);
        if (!branchIssues.length) { references.push(...branchRefs); return; }
        if (!shortest || branchIssues.length < shortest.length) shortest = branchIssues;
      }
      issues.push(...(shortest ?? [{ code: 'VALIDATION_FAILED' as const, path, message: '対応する型ではありません。' }])); return;
    }
    case 'typed': {
      if (!isObject(value)) { fail('型と値を指定してください。'); return; }
      let valueSchema: Schema;
      switch (value.type) {
        case 'boolean': valueSchema = bool; break;
        case 'integer': valueSchema = num(undefined, undefined, true); break;
        case 'enum': case 'text': valueSchema = txt(); break;
        case 'ref': valueSchema = ref(); break;
        case 'unknown': walk(obj({ type: req(en('unknown')), value: { schema: txt(), required: true, nullable: true }, reason: req(txt()) }), value, path, issues, references, depth + 1, ast); if (value.value !== null) fail('未定値のvalueはnullです。'); return;
        default: fail('未知の値型です。'); return;
      }
      walk(obj({ type: req(en(value.type as string)), value: req(valueSchema) }), value, path, issues, references, depth + 1, ast); return;
    }
    case 'custom':
      if (value === null) return;
      if (typeof value === 'string') walk(txt(), value, path, issues, references, depth, ast);
      else if (typeof value === 'number') walk(num(), value, path, issues, references, depth, ast);
      else if (typeof value === 'boolean') return;
      else if (isObject(value) && value.type === 'ref') walk(obj({ type: req(en('ref')), value: req(ref()) }), value, path, issues, references, depth + 1, ast);
      else if (isObject(value) && value.type === 'date') walk(obj({ type: req(en('date')), value: req({ type: 'date' }) }), value, path, issues, references, depth + 1, ast);
      else fail('カスタム値は文字列・数値・真偽・日付・参照またはnullです。');
      return;
    case 'richtext': {
      const span = { start: req(num(0, undefined, true)), end: req(num(0, undefined, true)) };
      const blockSchema = obj({ id: req(idSchema), kind: req(en('paragraph', 'heading', 'list_item', 'quote')), text: req(txt()), ruby: opt(arr(obj({ ...span, text: req(txt()) }))), links: opt(arr(obj({ ...span, target: req(anchor) }))), unresolvedAnnotations: opt(arr(unresolvedTextAnnotation)) });
      walk(arr(blockSchema), value, path, issues, references, depth + 1, ast);
      if (!Array.isArray(value)) return;
      let bytes = 0, chars = 0; const blockIds = new Set<string>();
      value.forEach((block: unknown, i) => {
        if (!isObject(block) || typeof block.text !== 'string') return;
        bytes += utf8Bytes(block.text); chars += [...block.text].length;
        if (typeof block.id === 'string') { if (blockIds.has(block.id)) addIssue(issues, `${path}[${i}].id`, '段落IDが重複しています。'); blockIds.add(block.id); }
        if (Array.isArray(block.unresolvedAnnotations)) for (const annotation of block.unresolvedAnnotations) if (isObject(annotation)) for (const field of ['originalText', 'reason', 'reading']) if (typeof annotation[field] === 'string') bytes += utf8Bytes(annotation[field] as string);
        for (const field of ['ruby', 'links']) if (Array.isArray(block[field])) (block[field] as unknown[]).forEach((range, j) => {
          if (!isObject(range)) return;
          if (typeof range.start === 'number' && typeof range.end === 'number' && (range.start >= range.end || range.end > [...(block.text as string)].length)) addIssue(issues, `${path}[${i}].${field}[${j}]`, '文字範囲はコードポイントで数え、本文内の半開区間を指定してください。');
          if (typeof range.text === 'string') bytes += utf8Bytes(range.text);
        });
      });
      if (bytes > 1024 * 1024) fail('本文フィールドが1 MiBを超えています。');
      if (schema.max !== undefined && chars > schema.max) fail(`要約は${schema.max}文字以内です。`);
      return;
    }
    case 'condition': case 'expression': {
      const budget = ast ?? { counter: { count: 0 }, depth: 0 }; budget.counter.count++;
      if (budget.counter.count > 256 || budget.depth >= 16) { fail('条件・式は深さ16、ノード256までです。'); return; }
      if (!isObject(value)) { fail('条件・式は型付きASTで指定してください。'); return; }
      const definition = schema.type === 'condition' ? conditionSchema(value) : expressionSchema(value);
      if (!definition) { fail('未知の条件・式opです。'); return; }
      walk(definition, value, path, issues, references, 0, { counter: budget.counter, depth: budget.depth + 1 }); return;
    }
    case 'time': {
      if (!isObject(value)) { fail('日時はTimeSpecで指定してください。'); return; }
      const definition = timeSchema(value); if (!definition) { fail('未知の日時modeです。'); return; }
      const before = issues.length; walk(definition, value, path, issues, references, depth + 1, ast);
      if (issues.length === before) {
        if (value.mode === 'interval' && compareTicks(value.start as string, value.end as string) >= 0) fail('期間はstart < endの半開区間です。');
        if (value.mode === 'uncertain' && compareTicks(value.earliest as string, value.latest as string) > 0) fail('earliestはlatest以下です。');
        if (value.mode === 'relative' && compareTicks(value.minOffset as string, value.maxOffset as string) > 0) fail('minOffsetはmaxOffset以下です。');
      }
      return;
    }
    case 'query': case 'name_policy': {
      if (!isObject(value)) { fail('型付きのオブジェクトを指定してください。'); return; }
      const definition = schema.type === 'query' ? querySchema(value) : namePolicySchema(value);
      if (!definition) { fail('未知の規則です。'); return; }
      const before = issues.length;
      walk(definition, value, path, issues, references, depth + 1, ast);
      if (schema.type === 'query' && value.op === 'foreshadow' && issues.length === before
        && !['foreshadowId', 'resolutionPolicy', 'role', 'stage'].some(field => value[field] !== undefined && value[field] !== null)) {
        addIssue(issues, path, '伏線検索には対象・回収方針・開示役割・段階のいずれかを指定してください。');
      }
      return;
    }
  }
}

const commonFields: Record<string, Field> = { id: req(idSchema), projectId: req(scopedRef('project')), kind: req(en(...ENTITY_KINDS)), revision: req({ type: 'revision' }), name: req(short), status: req(en(...STATUSES)), visibility: req(en('private', 'team', 'projection')), retainIfUnreferenced: opt(bool), projectionProfileId: opt(ref('projection_profile')), templateId: opt(ref('template')), createdAt: req({ type: 'datetime' }), updatedAt: req({ type: 'datetime' }), deletedAt: opt({ type: 'datetime' }), deletionOperationId: opt(idSchema), customValues: req(record({ type: 'custom' }, key)) };
const relationSchema = obj({ id: req(idSchema), projectId: req(scopedRef('project')), revision: req({ type: 'revision' }), fromId: req(ref()), toId: req(ref()), relationType: req(txt(1, 128)), direction: req(en('forward', 'symmetric')), validity: req(nullableValidity), evidenceIds: req(refs()), status: req(en(...STATUSES)), visibility: req(en('private', 'team', 'projection')), projectionProfileId: opt(ref('projection_profile')), deletedAt: opt({ type: 'datetime' }), deletionOperationId: opt(idSchema) });
function entitySchema(kind: EntityKind): Schema { return obj({ ...commonFields, kind: req(en(kind)), data: req(ENTITY_SCHEMAS[kind]) }); }
function simpleValidate<T>(schema: Schema, value: unknown, path: string): ValidationResult<T> { const issues: ValidationIssue[] = []; walk(schema, value, path, issues, []); return issues.length ? { ok: false, issues } : { ok: true, value: value as T }; }
export function validateCondition(input: unknown, path = 'condition'): ValidationResult<Condition> { return simpleValidate(cond, input, path); }
export function validateExpression(input: unknown, path = 'expression'): ValidationResult<Expression> { return simpleValidate({ type: 'expression' }, input, path); }
export function validateTypedValue(input: unknown, path = 'value'): ValidationResult<TypedValue> { return simpleValidate(typed, input, path); }
export function validateTimeSpec(input: unknown, path = 'time'): ValidationResult<TimeSpec> { return simpleValidate(time, input, path); }
export function validateRuntimeState(input: unknown, path = 'runtimeState'): ValidationResult<RuntimeState> {
  const result = simpleValidate<RuntimeState>(runtime, input, path); if (!result.ok) return result;
  const issues: ValidationIssue[] = [], ids = new Set<ID>(), assertions = new Set<string>();
  result.value.itemInstances.forEach((item, i) => {
    if (ids.has(item.instanceId)) addIssue(issues, `${path}.itemInstances[${i}].instanceId`, '物品個体のIDが重複しています。'); ids.add(item.instanceId);
    if ((item.ownerId && item.locationId) || (item.consumed && item.quantity !== 0) || (!item.consumed && item.quantity < 1)) addIssue(issues, `${path}.itemInstances[${i}]`, '物品の所在・所有・消費状態・数量が不整合です。');
  });
  result.value.assertions.forEach((assertion, i) => { const key = `${assertion.assertionId}/${assertion.holderId}`; if (assertions.has(key)) addIssue(issues, `${path}.assertions[${i}]`, '同じ人物・事実の認識が重複しています。'); assertions.add(key); });
  return issues.length ? { ok: false, issues } : result;
}
/** Optional legacy evidence may be absent; supplied initial evidence must be complete and consistent. */
export function validateInitialPresentationResults(state: RuntimeState, input: unknown, entities: readonly Entity[], path = 'presentationResults'): ValidationIssue[] {
  const checked = simpleValidate<PresentationConditionResult[]>(arr(presentationResult), input, path);
  if (!checked.ok) return checked.issues;
  const issues: ValidationIssue[] = [], seen = new Set(state.seenIds), observed = new Set<ID>();
  const node = entities.find((entity): entity is Entity<'flow_node'> => entity.kind === 'flow_node' && entity.id === state.presentationPosition && !entity.deletedAt && entity.status !== 'rejected');
  const eligible = entities.filter((entity): entity is Entity<'disclosure'> => {
    if (entity.kind !== 'disclosure' || entity.deletedAt || entity.status === 'rejected' || !node || !seen.has(node.id)) return false;
    const anchor = entity.data.anchor;
    return anchor.positionStatus !== 'unresolved' && (anchor.entityId === node.id || anchor.entityId === node.data.sceneId)
      && (!anchor.blockId || seen.has(anchor.blockId)) && (!anchor.lineId || seen.has(anchor.lineId));
  });
  const targets = new Set(eligible.map(disclosure => disclosure.id));
  checked.value.forEach((result, index) => {
    const location = `${path}[${index}]`;
    if (observed.has(result.targetId)) addIssue(issues, `${location}.targetId`, '初期提示の条件結果が重複しています。');
    observed.add(result.targetId);
    if (!targets.has(result.targetId)) addIssue(issues, `${location}.targetId`, '初期提示の対象ではない開示の条件結果です。', 'REFERENCE_INVALID');
    if (result.value === 'unknown') addIssue(issues, `${location}.value`, '未確認の開示条件では初期提示を完了できません。');
    if (result.value === 'true' && !seen.has(result.targetId)) addIssue(issues, `${location}.value`, '提示した条件結果と既読の証跡が一致しません。');
    if (result.value === 'false' && seen.has(result.targetId) && state.provenance === 'full_play') addIssue(issues, `${location}.value`, '提示済みの開示を初期条件のfalseで取り消すことはできません。');
  });
  for (const disclosure of eligible) if (!observed.has(disclosure.id)) addIssue(issues, path, '初期提示の開示条件結果が不足しています。');
  return issues;
}
export function validateEffectData(input: unknown, path = 'effect'): ValidationResult<EntityDataMap['effect']> { return simpleValidate(ENTITY_SCHEMAS.effect, input, path); }
export function validateEntity(input: unknown, path = 'entity'): ValidationResult<Entity> {
  if (!isObject(input) || !ENTITY_KINDS.includes(input.kind as EntityKind)) return { ok: false, issues: [{ code: 'VALIDATION_FAILED', path: `${path}.kind`, message: '未対応の情報種別です。' }] };
  const result = simpleValidate<Entity>(entitySchema(input.kind as EntityKind), input, path);
  if (!result.ok) return result;
  const issues: ValidationIssue[] = []; validateLocalRules(result.value, path, issues);
  return issues.length ? { ok: false, issues } : result;
}
export function validateRelation(input: unknown, path = 'relation'): ValidationResult<Relation> { return simpleValidate(relationSchema, input, path); }

export function validateVariableValue(variable: Entity<'variable'>, value: TypedValue, path = 'value', allowUnknown = true): ValidationIssue[] {
  const issues: ValidationIssue[] = [], data = variable.data;
  if (value.type === 'unknown') { if (!allowUnknown) addIssue(issues, path, '未定の値はこの操作で使えません。', 'CONDITION_UNKNOWN'); return issues; }
  if (value.type !== data.valueType) { addIssue(issues, path, '状態変数の宣言型と値の型が一致しません。'); return issues; }
  if (value.type === 'integer') {
    const min = data.allowed.min ?? -2_147_483_647, max = data.allowed.max ?? 2_147_483_647;
    if (!Number.isSafeInteger(value.value) || value.value < min || value.value > max) addIssue(issues, path, '状態変数の値が宣言した整数範囲外です。');
  }
  if ((value.type === 'enum' || value.type === 'boolean') && data.allowed.values && !data.allowed.values.includes(value.value)) addIssue(issues, path, '状態変数の値が許容集合にありません。');
  return issues;
}
function validateLocalRules(entity: Entity, path: string, issues: ValidationIssue[]): void {
  const issue = (field: string, message: string): void => addIssue(issues, `${path}.${field}`, message);
  const unnamed: EntityKind[] = ['dialogue_line', 'effect', 'assertion', 'disclosure', 'cue', 'storyboard_frame', 'localization', 'recording', 'checkpoint', 'trace'];
  if (!unnamed.includes(entity.kind) && !entity.name.trim()) issue('name', '名称を入力してください。');
  if (entity.visibility === 'projection' && !entity.projectionProfileId) issue('projectionProfileId', '公開投影の対象プロファイルを指定してください。');
  if (entity.deletedAt && !entity.deletionOperationId) issue('deletionOperationId', '削除には削除操作IDが必要です。');
  if (!entity.deletedAt && entity.deletionOperationId) issue('deletionOperationId', '削除されていない情報に削除操作IDは保存できません。');
  for (const customKey of Object.keys(entity.customValues)) {
    const schema = ENTITY_SCHEMAS[entity.kind];
    if (Object.hasOwn(commonFields, customKey) || (schema.type === 'object' && Object.hasOwn(schema.fields, customKey))) issue(`customValues.${customKey}`, '標準項目とカスタム項目のキーが衝突しています。');
  }
  switch (entity.kind) {
    case 'event':
      for (const [index, constraint] of (entity.data.constraints ?? []).entries()) if (constraint.type === 'end_gap' && compareTicks(constraint.minimumTicks, constraint.maximumTicks) > 0) issue(`data.constraints[${index}]`, '日時差の最小値は最大値以下です。');
      break;
    case 'item': if (entity.data.itemMode === 'instance' && !entity.data.typeId) issue('data.typeId', '物品の個体には種類への参照が必要です。'); break;
    case 'flow_node':
      if (entity.data.nodeType === 'terminal' && !entity.data.terminalReason?.trim()) issue('data.terminalReason', '意図した終端には終了理由が必要です。');
      if (entity.data.nodeType === 'call' && !entity.data.childGraphId) issue('data.childGraphId', '呼出ノードには子分岐図が必要です。');
      break;
    case 'variable': {
      const data = entity.data;
      if (data.scope === 'character' && !data.ownerId) issue('data.ownerId', '人物scopeには所有人物が必要です。');
      if (data.valueType === 'integer') {
        if (data.allowed.values) issue('data.allowed.values', '整数には集合ではなくmin/maxを指定してください。');
        if ((data.allowed.min ?? -2_147_483_647) > (data.allowed.max ?? 2_147_483_647)) issue('data.allowed', '整数の最小値は最大値以下です。');
      } else {
        if (data.allowed.min != null || data.allowed.max != null) issue('data.allowed', 'この型に数値範囲は設定できません。');
        if (data.valueType === 'enum' && (!data.allowed.values?.length || data.allowed.values.some(value => typeof value !== 'string' || !value))) issue('data.allowed.values', 'enumには空でない文字列の候補集合が必要です。');
        if (data.valueType === 'boolean' && data.allowed.values?.some(value => typeof value !== 'boolean')) issue('data.allowed.values', 'booleanの候補は真偽値です。');
      }
      issues.push(...validateVariableValue(entity, data.initial, `${path}.data.initial`));
      for (const [i, rule] of (data.resetRules ?? []).entries()) issues.push(...validateVariableValue(entity, rule.value, `${path}.data.resetRules[${i}].value`));
      if (new Set((data.resetRules ?? []).map(rule => rule.on)).size !== (data.resetRules ?? []).length) issue('data.resetRules', '同じ終了時点の初期化規則は一つにしてください。');
      for (const [i, rule] of (data.transitionRules ?? []).entries()) {
        issues.push(...validateVariableValue(entity, rule.from, `${path}.data.transitionRules[${i}].from`, false), ...validateVariableValue(entity, rule.to, `${path}.data.transitionRules[${i}].to`, false));
        if (rule.exception && !rule.reason?.trim()) issue(`data.transitionRules[${i}].reason`, '例外遷移には理由が必要です。');
      }
      for (const [i, rule] of (data.exclusions ?? []).entries()) {
        issues.push(...validateVariableValue(entity, rule.value, `${path}.data.exclusions[${i}].value`, false));
        if (!rule.reason.trim()) issue(`data.exclusions[${i}].reason`, '相互排他には理由が必要です。');
      }
      break;
    }
    case 'effect':
      if (['set', 'add', 'move'].includes(entity.data.operation) && (!entity.data.value || entity.data.value.type === 'unknown')) issue('data.value', 'この効果には既知の入力値が必要です。');
      if (entity.data.operation === 'add' && entity.data.value?.type !== 'integer') issue('data.value', 'addはinteger値だけを使えます。');
      if (entity.data.operation === 'move' && entity.data.value?.type !== 'ref') issue('data.value', 'moveには所在・所有先のref値が必要です。');
      if (entity.data.operation === 'consume' && !entity.data.reason?.trim()) issue('data.reason', '消費・破壊には理由が必要です。');
      if (['grant', 'consume'].includes(entity.data.operation) && entity.data.value != null && (entity.data.value.type !== 'integer' || entity.data.value.value < 1)) issue('data.value', '物品数量は正のintegerです。');
      if (entity.data.operation === 'assert' && entity.data.value != null && entity.data.value.type !== 'boolean') issue('data.value', 'assertの真偽入力はbooleanです。');
      break;
    case 'assertion':
      if (entity.data.truthKind === 'belief' && !entity.data.holderId) issue('data.holderId', 'beliefには認識を持つ人物が必要です。');
      if (entity.data.truthKind === 'testimony' && !entity.data.sourceIds?.length) issue('data.sourceIds', 'testimonyには出所が必要です。');
      break;
    case 'storyboard_frame': if (entity.data.mediaEndMs != null && entity.data.mediaEndMs < entity.data.mediaStartMs) issue('data.mediaEndMs', '演出の終了は開始以上です。'); break;
    case 'travel_route':
      if ((entity.data.minimumTicks != null && parseTick(entity.data.minimumTicks) < 0n) || (entity.data.maximumTicks != null && parseTick(entity.data.maximumTicks) < 0n)) issue('data', '移動所要時間は0以上です。');
      if (entity.data.minimumTicks != null && entity.data.maximumTicks != null && compareTicks(entity.data.minimumTicks, entity.data.maximumTicks) > 0) issue('data.maximumTicks', '最大所要時間は最小以上です。');
      break;
    case 'collection':
      if (entity.data.purpose === 'regression' && entity.data.mode !== 'fixed') issue('data.mode', '回帰経路集合は宣言した固定経路の集合です。');
      if (entity.data.mode === 'dynamic' && !entity.data.query) issue('data.query', '動的一覧には型付き検索条件が必要です。');
      if (entity.data.mode === 'fixed' && !Array.isArray(entity.data.memberIds)) issue('data.memberIds', '固定一覧にはID配列が必要です。');
      break;
    case 'template': {
      issues.push(...validateTemplateDefinition(entity.data, `${path}.data`));
      break;
    }
    case 'production_task':
      if (entity.data.deadline) { try { new Intl.DateTimeFormat('ja', { timeZone: entity.data.deadline.timeZone }); } catch { issue('data.deadline.timeZone', '有効なタイムゾーンを指定してください。'); } }
      if (entity.data.estimate) {
        const estimate = entity.data.estimate;
        if ((estimate.value == null) === (estimate.range == null)) issue('data.estimate', '見積もりはvalueまたはrangeの一つです。');
        if (estimate.range && estimate.range.min > estimate.range.max) issue('data.estimate.range', '見積範囲が逆転しています。');
        if (['reading_minutes', 'playing_minutes'].includes(estimate.unit) && !estimate.speed) issue('data.estimate.speed', '本文量からの時間見積もりには速度が必要です。');
      }
      break;
    case 'localization': case 'recording': if (!/^[a-z]{2,3}(?:-[A-Za-z0-9]{2,8})*$/.test(entity.data.language)) issue('data.language', '言語コードを指定してください（例: ja、en-US）。'); break;
  }
  validateNestedRanges(entity.data, `${path}.data`, issues);
}
function validateNestedRanges(value: unknown, path: string, issues: ValidationIssue[], depth = 0): void {
  if (depth > 32 || !value || typeof value !== 'object') return;
  if (Array.isArray(value)) { value.forEach((item, i) => validateNestedRanges(item, `${path}[${i}]`, issues, depth + 1)); return; }
  const object = value as Record<string, unknown>;
  if ('worldRange' in object && isObject(object.worldRange)) {
    const range = object.worldRange; if (isTick(range.start) && isTick(range.end) && compareTicks(range.start, range.end) >= 0) addIssue(issues, `${path}.worldRange`, '有効期間はstart < endの半開区間です。');
  }
  if ('entityId' in object && typeof object.start === 'number' && typeof object.end === 'number' && object.start >= object.end) addIssue(issues, path, '位置の文字範囲はstart < endです。');
  for (const [field, item] of Object.entries(object)) validateNestedRanges(item, `${path}.${field}`, issues, depth + 1);
}
export function collectReferences(entity: Entity): DomainReference[] { const references: DomainReference[] = []; walk(entitySchema(entity.kind), entity, '', [], references); return references.map(reference => ({ ...reference, path: reference.path.replace(/^\./, '') })); }
export function collectRelationReferences(relation: Relation): DomainReference[] { const references: DomainReference[] = []; walk(relationSchema, relation, '', [], references); return references.map(reference => ({ ...reference, path: reference.path.replace(/^\./, '') })); }
function pathParts(path: string): string[] { return path.replace(/\[(\d+)\]/g, '.$1').split('.').filter(Boolean); }
function rewritePaths<T>(source: T, references: DomainReference[], idMap: Map<ID, ID> | Record<ID, ID>): T {
  const copy = structuredClone(source), lookup = (id: ID): ID | undefined => idMap instanceof Map ? idMap.get(id) : Object.hasOwn(idMap, id) ? idMap[id] : undefined;
  // Rewrite values while their old paths still exist, then move inner dictionary keys.
  const ordered = [...references].sort((a, b) => {
    const aKey = a.path.endsWith('.$key'), bKey = b.path.endsWith('.$key');
    return Number(aKey) - Number(bKey) || (aKey ? pathParts(b.path).length - pathParts(a.path).length : 0);
  });
  for (const reference of ordered) {
    const replacement = lookup(reference.id); if (!replacement) continue;
    const parts = pathParts(reference.path), dictionaryKey = parts.at(-1) === '$key';
    if (dictionaryKey) parts.pop();
    const field = parts.pop(); if (!field) continue;
    let cursor = copy as unknown as Record<string, unknown>;
    for (const part of parts) cursor = cursor[part] as Record<string, unknown>;
    if (dictionaryKey) {
      if (replacement === field) continue;
      if (Object.hasOwn(cursor, replacement)) throw new Error('REFERENCE_INVALID: 参照の統合で辞書キーが衝突します。保持する内容を選んでください。');
      cursor[replacement] = cursor[field]; delete cursor[field];
    }
    else cursor[field] = replacement;
  }
  return copy;
}
export function rewriteEntityReferences<K extends EntityKind>(entity: Entity<K>, idMap: Map<ID, ID> | Record<ID, ID>): Entity<K> {
  const copy = rewritePaths(entity, collectReferences(entity), idMap), lookup = (id: ID) => (idMap instanceof Map ? idMap.get(id) : idMap[id]) ?? id;
  if ((entity.kind === 'scene' || entity.kind === 'flow_node') && entity.data.reuse?.bindings && (copy.kind === 'scene' || copy.kind === 'flow_node') && copy.data.reuse) copy.data.reuse.bindings = Object.fromEntries(Object.entries(entity.data.reuse.bindings).map(([source, target]) => [lookup(source), lookup(target)]));
  return copy;
}
export function rewriteRelationReferences(relation: Relation, idMap: Map<ID, ID> | Record<ID, ID>): Relation { return rewritePaths(relation, collectRelationReferences(relation), idMap); }

export interface ProjectValidationOptions { worlds?: ProjectContent[]; worldSnapshots?: Record<ID, ProjectContent>; relationTypes?: RelationTypeDefinition[]; runtime?: boolean }
const worldReferenceSchema = obj({ projectId: req(idSchema), immutableSnapshotId: req(idSchema), contentHash: req({ type: 'hash' }) });
const viewSchema = obj({ id: req(idSchema), name: req(txt(1, 128)), view: req(txt(1)), entityIds: req(refs()), settings: req(record(union(txt(), num(), bool, en(null)), key)) });
const projectHeaderFields: Record<string, Field> = { projectId: req(idSchema), name: req(txt(1, 128)), formatVersion: req(en(FORMAT_VERSION)), revision: req({ type: 'revision' }), calendarId: req(txt(1)), mainStart: req(tick), worldReferences: req(arr(worldReferenceSchema)) };
const projectContentKeys = [...Object.keys(projectHeaderFields), 'calendars', 'entities', 'relations', 'views'];
const projectKeys = [...projectContentKeys, 'authorAlternatives'];
const alternativesSchema: Schema = arr({ type: 'json' }, false, 0, 100);
function validateActiveRecordNamespace(project: ProjectContent, worlds: ProjectContent[], path: string, issues: ValidationIssue[]): void {
  const pinnedProjects = new Set<ID>(), activeProjects = new Set<ID>([project.projectId]), ids = new Set<ID>();
  project.worldReferences.forEach((reference, index) => {
    if (pinnedProjects.has(reference.projectId)) addIssue(issues, `${path}.worldReferences[${index}]`, '同じ世界の複数の版を同時に参照すると、IDの参照先が曖昧になります。一つの固定版を選んでください。', 'REFERENCE_INVALID');
    pinnedProjects.add(reference.projectId);
  });
  const contexts = [{ content: project, location: path }, ...worlds.map(world => {
    const referenceIndex = project.worldReferences.findIndex(reference => reference.projectId === world.projectId);
    return { content: world, location: `${path}.worldReferences[${referenceIndex}]` };
  })];
  const calendars = new Map<string, CalendarDefinition>();
  for (const [index, { content, location }] of contexts.entries()) {
    if (index > 0) {
      if (activeProjects.has(content.projectId)) addIssue(issues, location, '同じ作品・世界の複数の内容が現在の参照範囲に含まれています。固定版を一つにしてください。', 'REFERENCE_INVALID');
      activeProjects.add(content.projectId);
    }
    for (const [calendarIndex, calendar] of content.calendars.entries()) {
      const previous = calendars.get(calendar.id);
      if (previous && !sameCalendarDefinition(previous, calendar)) addIssue(issues, `${location}.calendars[${calendarIndex}].id`, '同じ暦IDに異なる定義があります。固定版の日時を読み替えず、暦IDを明示して対応付けてください。', 'REFERENCE_INVALID');
      calendars.set(calendar.id, calendar);
    }
    for (const [collection, records] of [['entities', content.entities], ['relations', content.relations]] as const) records.forEach((record, recordIndex) => {
      const recordPath = `${location}.${collection}[${recordIndex}]`;
      if (ids.has(record.id)) addIssue(issues, `${recordPath}.id`, '現在の作品と参照中の共通世界でentity・relationのIDが衝突しています。曖昧な参照は保存できません。', 'REFERENCE_INVALID');
      ids.add(record.id);
      if (record.projectId !== content.projectId) addIssue(issues, `${recordPath}.projectId`, '参照範囲のレコードが所属する作品・世界と一致しません。', 'REFERENCE_INVALID');
    });
  }
}
interface ValidationReuse { previous: ProjectData; references: WeakMap<Entity, DomainReference[]> }
function validateContent(input: unknown, path: string, options: ProjectValidationOptions, snapshotIds: Set<ID>, versionContents: Map<ID, ProjectContent> = new Map(), reuse?: ValidationReuse): ValidationResult<ProjectContent> {
  const issues: ValidationIssue[] = [];
  if (!isObject(input)) return { ok: false, issues: [{ code: 'VALIDATION_FAILED', path, message: '作品はオブジェクトです。' }] };
  for (const field of Object.keys(input)) if (!projectContentKeys.includes(field)) addIssue(issues, `${path}.${field}`, '作品に未知の項目があります。');
  const header = Object.fromEntries(Object.keys(projectHeaderFields).filter(field => Object.hasOwn(input, field)).map(field => [field, input[field]]));
  walk(obj(projectHeaderFields), header, path, issues, []);
  if (input.formatVersion !== FORMAT_VERSION) addIssue(issues, `${path}.formatVersion`, '対応していない形式版です。', 'FORMAT_UNSUPPORTED');
  const arrays = ['entities', 'relations', 'calendars', 'views'];
  for (const field of arrays) if (!Array.isArray(input[field])) addIssue(issues, `${path}.${field}`, '必須の配列です。');
  if (issues.length) return { ok: false, issues };
  const entities = input.entities as unknown[], relations = input.relations as unknown[], calendars = input.calendars as unknown[];
  if (entities.length + relations.length > 100_000) return { ok: false, issues: [{ code: 'IMPORT_LIMIT', path, message: 'entityとrelationの合計は100,000件までです。' }] };
  const previousEntities = new Map(reuse?.previous.entities.map(entity => [entity.id, entity])), previousRelations = new Map(reuse?.previous.relations.map(relation => [relation.id, relation]));
  entities.forEach((entity, i) => { if (reuse && isObject(entity) && previousEntities.get(entity.id as ID) === entity) return; const result = validateEntity(entity, `${path}.entities[${i}]`); if (!result.ok) issues.push(...result.issues); });
  relations.forEach((relation, i) => { if (reuse && isObject(relation) && Object.is(previousRelations.get(relation.id as ID), relation)) return; const result = validateRelation(relation, `${path}.relations[${i}]`); if (!result.ok) issues.push(...result.issues); });
  calendars.forEach((calendar, i) => { const result = validateCalendar(calendar, `${path}.calendars[${i}]`); if (!result.ok) issues.push(...result.issues); });
  const viewRefs: DomainReference[] = []; walk(arr(viewSchema), input.views, `${path}.views`, issues, viewRefs);
  if (issues.length) return { ok: false, issues: issues.slice(0, 256) };
  const project = input as unknown as ProjectContent;
  const reusableSnapshots = [...versionContents].map(([id, content]) => ({ id, content, contentHash: '', createdAt: '', versionLabel: '' }));
  issues.push(...reuseValidationIssues(project, reusableSnapshots, path));
  if (issues.length) return { ok: false, issues: issues.slice(0, 256) };
  const executionProject = project.entities.some(entity => (entity.kind === 'scene' || entity.kind === 'flow_node') && entity.data.reuse?.bindings) ? resolveReuseContent(project, reusableSnapshots) : project;
  const allowedWorldIds = new Set(executionProject.worldReferences.map(reference => reference.projectId));
  const closure = options.worldSnapshots ? resolvePinnedWorlds(executionProject, options.worldSnapshots) : undefined;
  if (closure) for (const message of closure.errors) addIssue(issues, `${path}.worldReferences`, message, 'REFERENCE_INVALID');
  const worlds = closure?.worlds ?? (options.worlds ?? []).filter(world => allowedWorldIds.has(world.projectId));
  if (entities.length + relations.length + worlds.reduce((count, world) => count + world.entities.length + world.relations.length, 0) > 100_000) addIssue(issues, path, '参照世界を含むレコード数が100,000件を超えています。', 'IMPORT_LIMIT');
  // Validate before constructing maps: a world record must never overwrite a local ID.
  // Each historical content calls this independently with its own pinned worlds.
  validateActiveRecordNamespace(project, worlds, path, issues);
  if (executionProject !== project) validateActiveRecordNamespace(executionProject, worlds, `${path}.reuse`, issues);
  if (issues.length) return { ok: false, issues: issues.slice(0, 256) };
  const allEntities = [...executionProject.entities, ...worlds.flatMap(world => world.entities)], entityMap = new Map(allEntities.map(entity => [entity.id, entity]));
  const relationMap = new Map([...project.relations, ...worlds.flatMap(world => world.relations)].map(relation => [relation.id, relation]));
  const allCalendarIds = new Set([...project.calendars, ...worlds.flatMap(world => world.calendars)].map(calendar => calendar.id));
  const ids = new Set<string>();
  for (const [collection, records] of [['entities', project.entities], ['relations', project.relations]] as const) records.forEach((record, i) => {
    if (ids.has(record.id)) addIssue(issues, `${path}.${collection}[${i}].id`, 'entityとrelationのIDは作品内で一意です。'); ids.add(record.id);
    if (record.projectId !== project.projectId) addIssue(issues, `${path}.${collection}[${i}].projectId`, 'レコードが別の作品に属しています。', 'REFERENCE_INVALID');
  });
  const calendarIds = project.calendars.map(calendar => calendar.id);
  if (new Set(calendarIds).size !== calendarIds.length) addIssue(issues, `${path}.calendars`, '暦IDが重複しています。');
  if (!calendarIds.includes(project.calendarId)) addIssue(issues, `${path}.calendarId`, '作品の暦が定義されていません。', 'REFERENCE_INVALID');
  const worldKeys = project.worldReferences.map(world => `${world.projectId}/${world.immutableSnapshotId}`);
  if (new Set(worldKeys).size !== worldKeys.length || project.worldReferences.some(world => world.projectId === project.projectId)) addIssue(issues, `${path}.worldReferences`, '共通世界参照の重複または自己参照があります。');
  const blocks = new Map<ID, { entityId: ID; text: string }>(), aliases = new Map<ID, { entityId: ID; alias: Alias }>();
  for (const entity of allEntities) collectContentIds(entity.data, entity.id, blocks, aliases, issues, `${path}.entities.${entity.id}.data`);
  const projectionIds = new Set<ID>([...entityMap.keys(), ...relationMap.keys(), ...blocks.keys()]);
  for (const entity of allEntities) {
    if (entity.kind === 'flow_node' && entity.data.trigger?.id) projectionIds.add(entity.data.trigger.id);
    if (entity.kind === 'projection_profile') for (const publicFields of Object.values(entity.data.publicTexts ?? {})) for (const field of Object.values(publicFields)) if (Array.isArray(field)) for (const block of field) if (isObject(block) && typeof block.id === 'string') projectionIds.add(block.id);
  }
  const worldVersionDependencies = worlds.flatMap(world => [...world.entities.flatMap(collectReferences), ...world.relations.flatMap(collectRelationReferences)])
    .filter(reference => reference.scope === 'snapshot' && options.worldSnapshots?.[reference.id] && worlds.some(world => world.projectId === options.worldSnapshots?.[reference.id].projectId)).map(reference => reference.id);
  const knownVersions = new Set([...snapshotIds, ...worldVersionDependencies, project.projectId, ...allEntities.filter(entity => entity.kind === 'snapshot').map(entity => entity.id), ...(closure?.references ?? executionProject.worldReferences).map(world => world.immutableSnapshotId)]);
  const knownProjects = new Set([project.projectId, ...(closure?.references ?? executionProject.worldReferences).map(world => world.projectId)]);
  type ReferenceIndex = { entities: Map<ID, Entity>; relations: Map<ID, Relation>; blocks: Map<ID, { entityId: ID; text: string }>; calendars: Set<string>; projects: Set<ID> };
  const currentIndex: ReferenceIndex = { entities: entityMap, relations: relationMap, blocks, calendars: allCalendarIds, projects: knownProjects }, versionIndexes = new Map<ID, ReferenceIndex>();
  function versionIndex(versionId: ID): ReferenceIndex | undefined {
    if (versionId === project.projectId && !project.entities.some(entity => (entity.kind === 'scene' || entity.kind === 'flow_node') && entity.data.reuse?.bindings)) return currentIndex;
    const cached = versionIndexes.get(versionId); if (cached) return cached;
    const rawContent = versionId === project.projectId ? project : versionContents.get(versionId) ?? options.worldSnapshots?.[versionId]; if (!rawContent) return undefined;
    let content = rawContent;
    try { if (content.entities.some(entity => (entity.kind === 'scene' || entity.kind === 'flow_node') && entity.data.reuse?.bindings)) content = resolveReuseContent(content, reusableSnapshots); } catch { return undefined; }
    const versionClosure = options.worldSnapshots ? resolvePinnedWorlds(content, options.worldSnapshots) : undefined;
    if (versionClosure) for (const message of versionClosure.errors) addIssue(issues, `${path}.versions.${versionId}.worldReferences`, message, 'REFERENCE_INVALID');
    const pinnedWorlds = versionClosure?.worlds ?? (options.worlds ?? []).filter(world => content.worldReferences.some(reference => reference.projectId === world.projectId));
    const before = issues.length; validateActiveRecordNamespace(content, pinnedWorlds, `${path}.versions.${versionId}`, issues);
    if (issues.length !== before) return undefined;
    const records = [...content.entities, ...pinnedWorlds.flatMap(world => world.entities)], versionBlocks = new Map<ID, { entityId: ID; text: string }>();
    for (const record of records) if (isObject(record)) collectContentIds(record.data, record.id, versionBlocks, new Map(), [], 'version');
    const index = { entities: new Map(records.filter(record => isObject(record)).map(record => [record.id, record])), relations: new Map([...content.relations, ...pinnedWorlds.flatMap(world => world.relations)].filter(record => isObject(record)).map(record => [record.id, record])), blocks: versionBlocks, calendars: new Set([...content.calendars, ...pinnedWorlds.flatMap(world => world.calendars)].map(calendar => calendar.id)), projects: new Set([content.projectId, ...pinnedWorlds.map(world => world.projectId)]) };
    versionIndexes.set(versionId, index); return index;
  }
  function inspect(reference: DomainReference, prefix = '', index = currentIndex): void {
    const location = prefix ? `${prefix}.${reference.path}` : reference.path;
    let exists = true;
    if (reference.scope === 'entity') {
      const target = index.entities.get(reference.id); exists = !!target;
      if (target && reference.kinds && !reference.kinds.includes(target.kind)) addIssue(issues, location, `参照先の種類は${reference.kinds.map(kind => KIND_LABELS[kind]).join(' / ')}です。`, 'REFERENCE_INVALID');
      if (target && options.runtime && target.deletedAt) addIssue(issues, location, '削除済み情報は実行用出力で参照できません。', 'REFERENCE_INVALID');
    } else if (reference.scope === 'relation') exists = index.relations.has(reference.id);
    else if (reference.scope === 'record') exists = index.entities.has(reference.id) || index.relations.has(reference.id);
    else if (reference.scope === 'projection_record') exists = projectionIds.has(reference.id);
    else if (reference.scope === 'presentation') exists = index.entities.has(reference.id) || index.blocks.has(reference.id);
    else if (reference.scope === 'calendar') exists = index.calendars.has(reference.id);
    else if (reference.scope === 'project') exists = index.projects.has(reference.id);
    else if (reference.scope === 'snapshot') exists = knownVersions.has(reference.id);
    else if (reference.scope === 'block') exists = index.blocks.has(reference.id);
    else if (reference.scope === 'alias') exists = aliases.has(reference.id);
    if (!exists) addIssue(issues, location, '参照先が存在しないか、指定した作品・共通世界の範囲外です。', 'REFERENCE_INVALID');
  }
  const referencesFor = (entity: Entity): DomainReference[] => {
    if (!reuse || previousEntities.get(entity.id) !== entity) return collectReferences(entity);
    const cached = reuse.references.get(entity);
    if (cached) return cached;
    const references = collectReferences(entity); reuse.references.set(entity, references); return references;
  };
  project.entities.forEach((entity, i) => {
    const prefix = `${path}.entities[${i}]`;
    for (const reference of referencesFor(entity)) {
      const parts = pathParts(reference.path), parent = parts.slice(0, -1).reduce<unknown>((object, field) => object && typeof object === 'object' ? (object as Record<string, unknown>)[field] : undefined, entity);
      const reuseVersion = (entity.kind === 'scene' || entity.kind === 'flow_node') && entity.data.reuse && reference.path === 'data.reuse.sourceId' ? entity.data.reuse.pinnedSnapshotId : undefined;
      const anchorVersion = reuseVersion ?? (isObject(parent) && typeof parent.entityId === 'string' && typeof parent.sourceVersionId === 'string' ? parent.sourceVersionId
        : entity.kind === 'review' && reference.path.startsWith('data.target.') ? entity.data.targetVersionId : undefined);
      const usesVersion = entity.kind === 'checkpoint' && (reference.path.startsWith('data.runtimeState.') || reference.path.startsWith('data.presentationState.') || reference.path.startsWith('data.presentationResults['))
        || entity.kind === 'trace' && (reference.path.startsWith('data.steps[') || reference.path.startsWith('data.initialExternalValues.') || reference.path.startsWith('data.readingPath.'));
      if (anchorVersion || usesVersion && (entity.kind === 'checkpoint' || entity.kind === 'trace')) {
        const version = anchorVersion ?? ((entity.kind === 'checkpoint' || entity.kind === 'trace') ? entity.data.contentVersionId : project.projectId), index = versionIndex(version);
        if (!index) { addIssue(issues, anchorVersion ? entity.kind === 'review' ? `${prefix}.data.targetVersionId` : `${prefix}.${parts.slice(0, -1).join('.')}.sourceVersionId` : `${prefix}.data.contentVersionId`, '参照する固定版の本文がありません。', 'REFERENCE_INVALID'); continue; }
        inspect(reference, prefix, index);
      } else inspect(reference, prefix);
    }
  });
  project.relations.forEach((relation, i) => collectRelationReferences(relation).forEach(reference => inspect(reference, `${path}.relations[${i}]`)));
  viewRefs.forEach(reference => inspect(reference));
  const relationTypes = options.relationTypes ?? RELATION_TYPES;
  project.relations.forEach((relation, i) => {
    const location = `${path}.relations[${i}]`, type = relationTypes.find(candidate => candidate.key === relation.relationType), from = entityMap.get(relation.fromId), to = entityMap.get(relation.toId);
    if (!type) addIssue(issues, `${location}.relationType`, '関係の種類が辞書に定義されていません。');
    else {
      if (from && !type.fromKinds.includes(from.kind)) addIssue(issues, `${location}.fromId`, 'この関係で許されない始点種類です。', 'REFERENCE_INVALID');
      if (to && !type.toKinds.includes(to.kind)) addIssue(issues, `${location}.toId`, 'この関係で許されない終点種類です。', 'REFERENCE_INVALID');
      if (relation.fromId === relation.toId && !type.allowSelf) addIssue(issues, location, 'この関係は自己関係を許しません。');
      if (relation.direction === 'symmetric' && !type.allowSymmetric) addIssue(issues, `${location}.direction`, 'この関係は対称ではありません。');
    }
    if (relation.deletedAt && !relation.deletionOperationId) addIssue(issues, `${location}.deletionOperationId`, '削除には操作IDが必要です。');
    validateNestedRanges(relation.validity, `${location}.validity`, issues);
  });
  let affectedIds: Set<ID> | undefined;
  if (reuse && JSON.stringify(project.worldReferences) === JSON.stringify(reuse.previous.worldReferences) && JSON.stringify(project.calendars) === JSON.stringify(reuse.previous.calendars)) {
    affectedIds = new Set([...project.entities.filter(entity => previousEntities.get(entity.id) !== entity).map(entity => entity.id), ...project.relations.filter(relation => previousRelations.get(relation.id) !== relation).map(relation => relation.id)]);
    for (const id of previousEntities.keys()) if (!entityMap.has(id)) affectedIds.add(id);
    for (const id of previousRelations.keys()) if (!relationMap.has(id)) affectedIds.add(id);
  }
  validateCrossEntityRules(project, entityMap, aliases, knownVersions, blocks, issues, path, options, versionIndex, affectedIds ? entity => previousEntities.get(entity.id) !== entity || referencesFor(entity).some(reference => affectedIds!.has(reference.id)) : undefined);
  return issues.length ? { ok: false, issues: issues.slice(0, 256) } : { ok: true, value: project };
}
function collectContentIds(value: unknown, owner: ID, blocks: Map<ID, { entityId: ID; text: string }>, aliases: Map<ID, { entityId: ID; alias: Alias }>, issues: ValidationIssue[], path: string, depth = 0): void {
  if (depth > 32 || !value || typeof value !== 'object') return;
  if (Array.isArray(value)) { value.forEach((child, i) => collectContentIds(child, owner, blocks, aliases, issues, `${path}[${i}]`, depth + 1)); return; }
  const object = value as Record<string, unknown>;
  if (typeof object.id === 'string' && typeof object.text === 'string' && ['paragraph', 'heading', 'list_item', 'quote'].includes(object.kind as string)) {
    if (blocks.has(object.id)) addIssue(issues, `${path}.id`, '本文ブロックIDが重複しています。');
    blocks.set(object.id, { entityId: owner, text: object.text });
  }
  if (typeof object.id === 'string' && 'isPublicDefault' in object) {
    if (aliases.has(object.id)) addIssue(issues, `${path}.id`, '別名IDが重複しています。');
    aliases.set(object.id, { entityId: owner, alias: object as unknown as Alias });
  }
  for (const [key, child] of Object.entries(object)) {
    // Trace/checkpoint values and projection public text are copies, not canonical blocks.
    if (['runtimeState', 'before', 'after', 'publicTexts'].includes(key)) continue;
    collectContentIds(child, owner, blocks, aliases, issues, `${path}.${key}`, depth + 1);
  }
}
function cycleIssues(nodes: Entity[], edges: (entity: Entity) => ID[], issues: ValidationIssue[], path: string, label: string): void {
  const index = new Map(nodes.map(node => [node.id, node])), colors = new Map<ID, number>();
  for (const node of nodes) {
    if (colors.get(node.id)) continue;
    const stack: { id: ID; ids: ID[]; cursor: number }[] = [{ id: node.id, ids: edges(node), cursor: 0 }]; colors.set(node.id, 1);
    while (stack.length) {
      const current = stack[stack.length - 1];
      if (current.cursor >= current.ids.length) { colors.set(current.id, 2); stack.pop(); continue; }
      const nextId = current.ids[current.cursor++], next = index.get(nextId); if (!next) continue;
      if (colors.get(nextId) === 1) { addIssue(issues, `${path}.entities.${current.id}.data`, `${label}に循環があります。`); continue; }
      if (!colors.get(nextId)) { colors.set(nextId, 1); stack.push({ id: nextId, ids: edges(next), cursor: 0 }); }
    }
  }
}
type AnchorIndex = { entities: Map<ID, Entity>; blocks: Map<ID, { entityId: ID; text: string }> };
function validateCrossEntityRules(project: ProjectContent, entityMap: Map<ID, Entity>, aliases: Map<ID, { entityId: ID; alias: Alias }>, knownVersions: Set<ID>, blocks: Map<ID, { entityId: ID; text: string }>, issues: ValidationIssue[], path: string, options: ProjectValidationOptions, resolveVersion: (version: ID) => AnchorIndex | undefined, affected?: (entity: Entity) => boolean): void {
  const keys = new Map<string, ID>(), translationKeys = new Set<string>();
  // Assignments also depend on a template's whole field set, including new fields.
  // Keep this check identical in full imports and incremental local saves.
  if (project.entities.some(entity => !!entity.templateId && !entity.deletedAt)) issues.push(...validateTemplateAssignments(project, path, [...entityMap.values()]));
  project.entities.forEach((entity, i) => {
    const location = `${path}.entities[${i}]`;
    if (entity.deletedAt) return;
    if (entity.kind === 'variable' || entity.kind === 'quest' || entity.kind === 'external_contract') {
      const unique = `${entity.kind}/${entity.kind === 'variable' ? `${entity.data.scope}/${entity.data.ownerId ?? ''}/` : ''}${entity.data.key}`;
      if (keys.has(unique)) addIssue(issues, `${location}.data.key`, '同じスコープでキーが重複しています。'); keys.set(unique, entity.id);
    }
    if (entity.kind === 'localization') {
      const unique = `${entity.data.sourceLineId}/${entity.data.language}/${entity.data.sourceHash}`;
      if (translationKeys.has(unique)) addIssue(issues, location, '同じ台詞・言語・原文版の翻訳が重複しています。'); translationKeys.add(unique);
    }
    // Namespace/key uniqueness, reference existence and graph-wide checks always run.
    // Value/anchor rules only need unchanged records when one of their dependencies changed.
    // Checkpoint/trace evidence also depends on the eligible record set, including newly added IDs.
    if (affected && !affected(entity) && entity.kind !== 'checkpoint' && entity.kind !== 'trace') return;
    if (entity.kind === 'template') issues.push(...validateTemplateDefinition(entity.data, `${location}.data`, entityMap));
    if (entity.kind === 'item' && entity.data.itemMode === 'instance') {
      const type = entity.data.typeId ? entityMap.get(entity.data.typeId) : undefined;
      if (type?.kind === 'item' && type.data.itemMode !== 'type') addIssue(issues, `${location}.data.typeId`, '個体のtypeIdは物品種類を参照してください。', 'REFERENCE_INVALID');
    }
    if (entity.kind === 'quest') {
      const variable = entityMap.get(entity.data.stateVariableId);
      if (variable?.kind === 'variable') for (const [j, rule] of (entity.data.transitionRules ?? []).entries()) issues.push(...validateVariableValue(variable, rule.from, `${location}.data.transitionRules[${j}].from`, false), ...validateVariableValue(variable, rule.to, `${location}.data.transitionRules[${j}].to`, false));
    }
    if (entity.kind === 'variable') for (const [j, rule] of (entity.data.exclusions ?? []).entries()) {
      const other = entityMap.get(rule.variableId);
      if (other?.kind === 'variable') issues.push(...validateVariableValue(other, rule.otherValue, `${location}.data.exclusions[${j}].otherValue`, false));
    }
    if (entity.kind === 'collection' && entity.data.purpose === 'regression') for (const [j, id] of (entity.data.memberIds ?? []).entries()) {
      const trace = entityMap.get(id);
      if (trace && trace.kind !== 'trace') addIssue(issues, `${location}.data.memberIds[${j}]`, '回帰経路集合には保存した試読記録を指定してください。', 'REFERENCE_INVALID');
    }
    if (entity.kind === 'effect') {
      const target = entityMap.get(entity.data.targetId), operation = entity.data.operation;
      if (target && ['set', 'add', 'reset'].includes(operation)) {
        if (target.kind !== 'variable') addIssue(issues, `${location}.data.targetId`, '状態更新効果は状態変数を参照してください。', 'REFERENCE_INVALID');
        else {
          if (target.data.derived) addIssue(issues, `${location}.data.targetId`, '算出状態へ直接代入できません。');
          if (operation === 'add' && target.data.valueType !== 'integer') addIssue(issues, `${location}.data.targetId`, 'addはinteger状態だけです。');
          if (entity.data.value && operation !== 'add') issues.push(...validateVariableValue(target, entity.data.value, `${location}.data.value`));
        }
      }
      if (target && ['grant', 'consume', 'move'].includes(operation) && target.kind !== 'item') addIssue(issues, `${location}.data.targetId`, '物品効果は物品を参照してください。', 'REFERENCE_INVALID');
      if (target?.kind === 'item' && ['grant', 'consume', 'move'].includes(operation) && entity.data.instanceId) {
        const instance = entityMap.get(entity.data.instanceId);
        if (instance?.kind === 'item' && (instance.data.itemMode !== 'instance' || (target.data.itemMode === 'type' ? instance.data.typeId !== target.id : instance.id !== target.id))) addIssue(issues, `${location}.data.instanceId`, '指定した個体が効果の対象物品に属していません。', 'REFERENCE_INVALID');
      }
      if (target && operation === 'assert' && target.kind !== 'assertion') addIssue(issues, `${location}.data.targetId`, '認識効果は事実・認識を参照してください。', 'REFERENCE_INVALID');
      if (operation === 'move' && entity.data.value?.type === 'ref') {
        const destination = entityMap.get(entity.data.value.value); if (destination && !['character', 'group', 'place'].includes(destination.kind)) addIssue(issues, `${location}.data.value`, '物品の移動先は人物・グループ・場所です。', 'REFERENCE_INVALID');
      }
    }
    if (entity.kind === 'flow_graph') {
      for (const entry of [...entity.data.entryIds, ...entity.data.exitIds]) if (!entity.data.nodeIds.includes(entry)) addIssue(issues, `${location}.data`, '入口・出口はその分岐図のノード集合に含めてください。');
      for (const edgeId of entity.data.edgeIds) {
        const edge = entityMap.get(edgeId); if (edge?.kind !== 'flow_edge') continue;
        if (!entity.data.nodeIds.includes(edge.data.fromId) || (typeof edge.data.toId === 'string' && !entity.data.nodeIds.includes(edge.data.toId))) addIssue(issues, `${location}.data.edgeIds`, '進行線の始点・終点は同じ分岐図内に置いてください。');
      }
      const parameterKeys = (entity.data.parameters ?? []).map(parameter => parameter.key); if (new Set(parameterKeys).size !== parameterKeys.length) addIssue(issues, `${location}.data.parameters`, '引数のキーが重複しています。');
    }
    if (entity.kind === 'flow_edge' && options.runtime && typeof entity.data.toId !== 'string') addIssue(issues, `${location}.data.toId`, '未完成の分岐先は実行用出力できません。', 'EXPORT_UNSUPPORTED');
    if (entity.kind === 'variable' && options.runtime && entity.data.initial.type === 'unknown' && !entity.data.derived) addIssue(issues, `${location}.data.initial`, '初期値が未定です。', 'CONDITION_UNKNOWN');
    validateConditionTypesInValue(entity.data, location, entityMap, issues);
    if (entity.kind === 'review' && typeof entity.data.target === 'object') {
      validateAnchors(entity.data.target, `${location}.data.target`, entityMap, blocks, issues, 0, resolveVersion, entity.data.targetVersionId);
      validateAnchors({ ...entity.data, target: null }, `${location}.data`, entityMap, blocks, issues, 0, resolveVersion);
    } else validateAnchors(entity.data, `${location}.data`, entityMap, blocks, issues, 0, resolveVersion);
    if (entity.kind === 'projection_profile') {
      const policy = entity.data.namePolicy;
      if ('mode' in policy && policy.mode === 'alias') {
        const alias = aliases.get(policy.aliasId); if (alias && !entity.data.includedIds.includes(alias.entityId)) addIssue(issues, `${location}.data.namePolicy`, '別名は投影対象の本体に属している必要があります。');
      } else if (!('mode' in policy)) for (const [targetId, specific] of Object.entries(policy.byEntityId ?? {})) {
        if (specific.mode === 'alias' && aliases.get(specific.aliasId)?.entityId !== targetId) addIssue(issues, `${location}.data.namePolicy.byEntityId.${targetId}`, '別名が指定した本体に属していません。');
      }
    }
    if (entity.kind === 'checkpoint' && (!knownVersions.has(entity.data.runtimeState.contentVersionId) || entity.data.runtimeState.contentVersionId !== entity.data.contentVersionId)) addIssue(issues, `${location}.data.runtimeState.contentVersionId`, '途中開始の状態と対象版が一致しません。');
    if (entity.kind === 'checkpoint') {
      const result = validateRuntimeState(entity.data.runtimeState, `${location}.data.runtimeState`); if (!result.ok) issues.push(...result.issues);
      if (entity.data.presentationState && (entity.data.presentationState.contentVersionId !== entity.data.contentVersionId || entity.data.presentationState.presentationPosition !== entity.data.runtimeState.presentationPosition || entity.data.presentationState.provenance !== entity.data.runtimeState.provenance)) addIssue(issues, `${location}.data.presentationState`, '提示前の観測状態と開始点・対象版・由来が一致しません。');
      if (entity.data.presentationResults != null) {
        const version = resolveVersion(entity.data.contentVersionId);
        if (version) issues.push(...validateInitialPresentationResults({ ...entity.data.runtimeState, provenance: entity.data.origin ?? 'partial' }, entity.data.presentationResults, [...version.entities.values()], `${location}.data.presentationResults`));
      }
    }
    if (entity.kind === 'trace') {
      const trace = entity.data as typeof entity.data & { mode?: 'flow' | 'chapters' | null; readingPath?: import('./types').ReadingPath | null };
      if (trace.mode === 'chapters') {
        if (!trace.readingPath) addIssue(issues, `${location}.data.readingPath`, '章読み通しには提示経路が必要です。');
        if (trace.steps.length) addIssue(issues, `${location}.data.steps`, '章読み通しとフロー遷移を混在させられません。');
      } else if (trace.readingPath != null) addIssue(issues, `${location}.data.readingPath`, '提示経路はmode:chaptersの記録に指定してください。');
      trace.steps.forEach((step, index) => {
        for (const [field, state] of [['before', step.before], ['after', step.after]] as const) { const result = validateRuntimeState(state, `${location}.data.steps[${index}].${field}`); if (!result.ok) issues.push(...result.issues); }
        if (step.presentationState && (step.presentationState.contentVersionId !== trace.contentVersionId || step.presentationState.presentationPosition !== step.after.presentationPosition || step.presentationState.provenance !== step.after.provenance)) addIssue(issues, `${location}.data.steps[${index}].presentationState`, '提示前の観測状態と提示先・対象版・由来が一致しません。');
      });
      trace.readingPath?.occurrences.forEach((occurrence, index) => {
        for (const [field, state] of [['before', occurrence.before], ['after', occurrence.after]] as const) { const result = validateRuntimeState(state, `${location}.data.readingPath.occurrences[${index}].${field}`); if (!result.ok) issues.push(...result.issues); }
      });
    }
  });
  for (const kind of ['place', 'group', 'flow_graph', 'map'] as const) cycleIssues(project.entities.filter(entity => entity.kind === kind && !entity.deletedAt), entity => {
    if (entity.kind === 'place' || entity.kind === 'group') return entity.data.parentId ? [entity.data.parentId] : [];
    if (entity.kind === 'flow_graph') return entity.data.parentGraphId ? [entity.data.parentGraphId] : [];
    if (entity.kind === 'map') return entity.data.parentMapId ? [entity.data.parentMapId] : [];
    return [];
  }, issues, path, `${KIND_LABELS[kind]}の階層`);
  cycleIssues(project.entities.filter(entity => entity.kind === 'production_task' && !entity.deletedAt), entity => entity.kind === 'production_task' ? entity.data.dependsOn ?? [] : [], issues, path, '制作依存');
  cycleIssues(project.entities.filter(entity => entity.kind === 'variable' && !entity.deletedAt), entity => entity.kind === 'variable' && entity.data.derived ? expressionReferences(entity.data.derived) : [], issues, path, '算出状態');
  cycleIssues(project.entities.filter(entity => entity.kind === 'flow_graph' && !entity.deletedAt), entity => entity.kind === 'flow_graph' ? entity.data.nodeIds.flatMap(nodeId => { const node = entityMap.get(nodeId); return node?.kind === 'flow_node' && node.data.childGraphId ? [node.data.childGraphId] : []; }) : [], issues, path, '分岐図の呼出階層');
  issues.push(...validateEventTimes([...entityMap.values()].filter((entity): entity is Entity<'event'> => entity.kind === 'event' && !entity.deletedAt)));
  const automaticPriority = new Map<string, ID>();
  for (const entity of project.entities) if (entity.kind === 'flow_edge' && entity.data.edgeType === 'automatic' && !entity.deletedAt) {
    const priorityKey = `${entity.data.fromId}/${entity.data.priority ?? 0}`;
    if (automaticPriority.has(priorityKey)) addIssue(issues, `${path}.entities.${entity.id}.data.priority`, '同じ始点の自動候補で優先順位が重複しています。'); automaticPriority.set(priorityKey, entity.id);
  }
}
function expressionReferences(expression: Expression): ID[] {
  const references: DomainReference[] = []; walk({ type: 'expression' }, expression, '', [], references); return references.filter(reference => reference.kinds?.includes('variable')).map(reference => reference.id);
}
function validateConditionTypesInValue(value: unknown, path: string, entities: Map<ID, Entity>, issues: ValidationIssue[], depth = 0): void {
  if (depth > 32 || !value || typeof value !== 'object') return;
  if (Array.isArray(value)) { value.forEach((child, i) => validateConditionTypesInValue(child, `${path}[${i}]`, entities, issues, depth + 1)); return; }
  const object = value as Record<string, unknown>;
  if (object.op === 'compare') {
    const variable = entities.get(object.variableId as ID);
    if (variable?.kind === 'variable') {
      const comparator = object.comparator as string, values = (Array.isArray(object.value) ? object.value : [object.value]) as TypedValue[];
      if (['lt', 'le', 'gt', 'ge'].includes(comparator) && variable.data.valueType !== 'integer') addIssue(issues, `${path}.comparator`, '順序比較はintegerにだけ使えます。');
      values.forEach((item, i) => { if (item.type !== 'unknown' && item.type !== variable.data.valueType) addIssue(issues, `${path}.value${values.length > 1 ? `[${i}]` : ''}`, '比較値の型が状態変数と一致しません。'); });
    }
  }
  for (const [field, child] of Object.entries(object)) validateConditionTypesInValue(child, `${path}.${field}`, entities, issues, depth + 1);
}
function validateAnchors(value: unknown, path: string, entities: Map<ID, Entity>, blocks: Map<ID, { entityId: ID; text: string }>, issues: ValidationIssue[], depth = 0, resolveVersion?: (version: ID) => AnchorIndex | undefined, defaultVersion?: ID): void {
  if (depth > 32 || !value || typeof value !== 'object') return;
  if (Array.isArray(value)) { value.forEach((child, i) => validateAnchors(child, `${path}[${i}]`, entities, blocks, issues, depth + 1, resolveVersion, defaultVersion)); return; }
  const object = value as Record<string, unknown>;
  if (typeof object.entityId === 'string') {
    if (object.positionStatus === 'unresolved' && (!object.positionReason || object.start != null || object.end != null)) addIssue(issues, path, '位置不明には理由を付け、確定した文字範囲を外してください。');
    if (object.positionStatus !== 'unresolved' && (object.positionReason != null || object.quotedText != null)) addIssue(issues, path, '位置不明の理由・引用は位置不明状態と一緒に保存してください。');
    const version = typeof object.sourceVersionId === 'string' ? object.sourceVersionId : defaultVersion, index = version && resolveVersion ? resolveVersion(version) : undefined;
    const entityIndex = index?.entities ?? entities, blockIndex = index?.blocks ?? blocks;
    let targetText: string | undefined;
    if (typeof object.blockId === 'string') {
      const block = blockIndex.get(object.blockId);
      if (block && block.entityId !== object.entityId) addIssue(issues, `${path}.blockId`, '段落は指定した情報に属していません。', 'REFERENCE_INVALID');
      targetText = block?.text;
    }
    if (typeof object.lineId === 'string') {
      const line = entityIndex.get(object.lineId); if (line?.kind === 'dialogue_line') targetText = richTextToPlainText(line.data.text);
    }
    if (typeof object.start === 'number' || typeof object.end === 'number') {
      if (typeof object.start !== 'number' || typeof object.end !== 'number') addIssue(issues, path, '文字範囲はstart/endを対で指定してください。');
      if (targetText === undefined) addIssue(issues, path, '文字範囲には本文ブロックまたは台詞への参照が必要です。');
      else if (typeof object.end === 'number' && object.end > [...targetText].length) addIssue(issues, `${path}.end`, '文字範囲が参照元の本文を超えています。');
    }
  }
  for (const [field, child] of Object.entries(object)) if (!['publicTexts', 'before', 'after', 'runtimeState'].includes(field)) validateAnchors(child, `${path}.${field}`, entities, blocks, issues, depth + 1, resolveVersion);
}
export function validateProject(input: unknown, options: ProjectValidationOptions = {}): ValidationResult<ProjectData> {
  if (!isObject(input)) return { ok: false, issues: [{ code: 'VALIDATION_FAILED', path: 'project', message: '作品はオブジェクトです。' }] };
  const issues: ValidationIssue[] = [];
  for (const field of Object.keys(input)) if (![...projectKeys, 'snapshots', 'history'].includes(field)) addIssue(issues, `project.${field}`, '作品に未知の項目があります。');
  if (!Array.isArray(input.snapshots)) addIssue(issues, 'project.snapshots', '必須の配列です。');
  if (!Array.isArray(input.history)) addIssue(issues, 'project.history', '必須の配列です。');
  const snapshotIds = new Set<ID>((Array.isArray(input.snapshots) ? input.snapshots : []).flatMap(snapshot => isObject(snapshot) && typeof snapshot.id === 'string' ? [snapshot.id] : []));
  if (Object.hasOwn(input, 'authorAlternatives')) walk(alternativesSchema, input.authorAlternatives, 'project.authorAlternatives', issues, []);
  const content = Object.fromEntries(projectContentKeys.filter(field => Object.hasOwn(input, field)).map(field => [field, input[field]]));
  const validated = validateContent(content, 'project', options, snapshotIds, snapshotContentMap(input.snapshots)); if (!validated.ok) issues.push(...validated.issues);
  if (issues.length) return { ok: false, issues: issues.slice(0, 256) };
  const project = input as unknown as ProjectData;
  validateSnapshotCollection(project.snapshots, 'project.snapshots', project.projectId, options, issues);
  const historyIds = new Set<ID>();
  project.history.forEach((command, i) => {
    const path = `project.history[${i}]`, raw = command as unknown;
    if (!isObject(raw)) { addIssue(issues, path, '履歴はコマンドです。'); return; }
    const commandMeta = obj({ operationId: req(idSchema), projectId: req(idSchema), baseRevision: req({ type: 'revision' }), revision: req({ type: 'revision' }), targetIds: req(arr(idSchema, true)), reason: req(txt()), createdAt: req({ type: 'datetime' }), compensatesOperationId: opt(idSchema), idMap: opt(record(idSchema, idSchema)) });
    for (const field of Object.keys(raw)) if (field !== 'before' && field !== 'after' && commandMeta.type === 'object' && !Object.hasOwn(commandMeta.fields, field)) addIssue(issues, `${path}.${field}`, 'コマンドに未知の項目があります。');
    walk(commandMeta, Object.fromEntries(Object.entries(raw).filter(([field]) => field !== 'before' && field !== 'after')), path, issues, []);
    if (historyIds.has(command.operationId)) addIssue(issues, `${path}.operationId`, '履歴の操作IDが重複しています。'); historyIds.add(command.operationId);
    if (command.projectId !== project.projectId) addIssue(issues, `${path}.projectId`, '履歴が別の作品に属しています。');
    for (const field of ['before', 'after'] as const) {
      if (!isObject(raw[field])) { addIssue(issues, `${path}.${field}`, '変更前後の内容を保持してください。'); continue; }
      const state = raw[field] as Record<string, unknown>;
      if (!Array.isArray(state.snapshots)) addIssue(issues, `${path}.${field}.snapshots`, '復元に必要な公開版配列が必要です。');
      if (Object.hasOwn(state, 'authorAlternatives')) walk(alternativesSchema, state.authorAlternatives, `${path}.${field}.authorAlternatives`, issues, []);
      const historical = Object.fromEntries(Object.entries(state).filter(([key]) => key !== 'snapshots' && key !== 'authorAlternatives'));
      const historicalIds = new Set<ID>((Array.isArray(state.snapshots) ? state.snapshots : []).flatMap(item => isObject(item) && typeof item.id === 'string' ? [item.id] : []));
      const result = validateContent(historical, `${path}.${field}`, options, historicalIds, snapshotContentMap(state.snapshots)); if (!result.ok) issues.push(...result.issues);
      else if (result.value.projectId !== project.projectId) addIssue(issues, `${path}.${field}.projectId`, '履歴の内容が別の作品に属しています。');
      if (Array.isArray(state.snapshots)) validateSnapshotCollection(state.snapshots, `${path}.${field}.snapshots`, project.projectId, options, issues);
    }
  });
  return issues.length ? { ok: false, issues: issues.slice(0, 256) } : { ok: true, value: project };
}
/** Current content for an edit of previously verified storage. Imports still use validateProject. */
export function validateCurrentProject(input: ProjectData, options: ProjectValidationOptions = {}, reuse?: ValidationReuse): ValidationResult<ProjectData> {
  const issues: ValidationIssue[] = [];
  for (const field of Object.keys(input)) if (![...projectKeys, 'snapshots', 'history'].includes(field)) addIssue(issues, `project.${field}`, '作品に未知の項目があります。');
  if (!Array.isArray(input.snapshots) || !Array.isArray(input.history)) addIssue(issues, 'project', '公開版と履歴の配列が必要です。');
  if (Object.hasOwn(input, 'authorAlternatives')) walk(alternativesSchema, input.authorAlternatives, 'project.authorAlternatives', issues, []);
  if (issues.length) return { ok: false, issues };
  const ids = new Set(input.snapshots.map(snapshot => snapshot.id));
  const content = Object.fromEntries(projectContentKeys.filter(field => Object.hasOwn(input, field)).map(field => [field, (input as unknown as Record<string, unknown>)[field]]));
  const result = validateContent(content, 'project', options, ids, snapshotContentMap(input.snapshots), reuse);
  return result.ok ? { ok: true, value: input } : result;
}
function validateSnapshotCollection(snapshots: unknown[], path: string, projectId: ID, options: ProjectValidationOptions, issues: ValidationIssue[]): void {
  const ids = new Set<ID>(snapshots.flatMap(snapshot => isObject(snapshot) && typeof snapshot.id === 'string' ? [snapshot.id] : [])), duplicates = new Set<ID>(), contents = snapshotContentMap(snapshots);
  snapshots.forEach((snapshot, i) => {
    const location = `${path}[${i}]`;
    if (!isObject(snapshot)) { addIssue(issues, location, '公開版はオブジェクトです。'); return; }
    const metadata = obj({ id: req(idSchema), versionLabel: req(txt(1, 128)), contentHash: req({ type: 'hash' }), createdAt: req({ type: 'datetime' }) });
    for (const field of Object.keys(snapshot)) if (!['id', 'versionLabel', 'contentHash', 'createdAt', 'content'].includes(field)) addIssue(issues, `${location}.${field}`, '公開版に未知の項目があります。');
    walk(metadata, Object.fromEntries(Object.entries(snapshot).filter(([field]) => field !== 'content')), location, issues, []);
    if (typeof snapshot.id === 'string') {
      if (duplicates.has(snapshot.id)) addIssue(issues, `${location}.id`, '公開版のIDが重複しています。'); duplicates.add(snapshot.id);
      if (snapshot.id === projectId) addIssue(issues, `${location}.id`, '公開版IDは作品IDと別にしてください。');
    }
    const result = validateContent(snapshot.content, `${location}.content`, options, ids, contents);
    if (!result.ok) issues.push(...result.issues);
    else if (result.value.projectId !== projectId) addIssue(issues, `${location}.content.projectId`, '公開版が別の作品に属しています。');
  });
}
function snapshotContentMap(snapshots: unknown): Map<ID, ProjectContent> {
  if (!Array.isArray(snapshots)) return new Map();
  return new Map(snapshots.flatMap(snapshot => isObject(snapshot) && typeof snapshot.id === 'string' && isObject(snapshot.content) && ['entities', 'relations', 'calendars', 'worldReferences'].every(key => Array.isArray((snapshot.content as Record<string, unknown>)[key]) && ((snapshot.content as Record<string, unknown>)[key] as unknown[]).every(isObject)) ? [[snapshot.id, snapshot.content as unknown as ProjectContent]] : []));
}

type JsonSchema = Record<string, unknown>;
/** Portable structural schema. Cross-record rules remain in validateProject. */
export function toJsonSchema(): JsonSchema {
  const reference = (name: string): JsonSchema => ({ $ref: `#/$defs/${name}` });
  function convert(schema: Schema): JsonSchema {
    switch (schema.type) {
      case 'text': return { type: 'string', ...(schema.min != null ? { minLength: schema.min } : {}), ...(schema.max != null ? { maxLength: schema.max } : {}) };
      case 'number': return { type: schema.integer ? 'integer' : 'number', ...(schema.min != null ? { minimum: schema.min } : schema.integer ? { minimum: Number.MIN_SAFE_INTEGER } : {}), ...(schema.max != null ? { maximum: schema.max } : schema.integer ? { maximum: Number.MAX_SAFE_INTEGER } : {}) };
      case 'boolean': return { type: 'boolean' };
      case 'json': return {};
      case 'enum': return { enum: schema.values };
      case 'id': return reference('ID');
      case 'ref': return { ...(schema.scope === 'calendar' ? { type: 'string', minLength: 1 } : reference('ID')), ...(schema.kinds || schema.scope ? { $comment: JSON.stringify({ ...(schema.kinds ? { targetKinds: schema.kinds } : {}), ...(schema.scope ? { referenceScope: schema.scope } : {}) }) } : {}) };
      case 'tick': return reference('Tick');
      case 'revision': return reference('Revision');
      case 'datetime': return { type: 'string', format: 'date-time', pattern: '^\\d{4}-\\d{2}-\\d{2}T(?:[01][0-9]|2[0-3]):[0-5][0-9]:[0-5][0-9](?:\\.\\d+)?(?:Z|\\+00:00)$' };
      case 'date': return { type: 'string', format: 'date' };
      case 'hash': return { type: 'string', pattern: '^[0-9a-f]{64}$' };
      case 'safe_path': return { type: 'string', minLength: 1, pattern: '^(?!/)(?![a-zA-Z]:)(?!.*[\\\\\\u0000-\\u001f\\u007f])(?!.*(?:^|/)\\.\\.?(?:/|$))(?!.*//)(?!.*\\/$).+$' };
      case 'array': return { type: 'array', items: convert(schema.item), ...(schema.min != null ? { minItems: schema.min } : {}), maxItems: schema.max ?? 100_000, ...(schema.unique ? { uniqueItems: true } : {}) };
      case 'object': return { type: 'object', properties: Object.fromEntries(Object.entries(schema.fields).map(([name, field]) => [name, field.nullable ? { anyOf: [convert(field.schema), { type: 'null' }] } : convert(field.schema)])), required: Object.entries(schema.fields).filter(([, field]) => field.required).map(([name]) => name), additionalProperties: false };
      case 'record': return { type: 'object', additionalProperties: convert(schema.value), ...(schema.key ? { propertyNames: convert(schema.key) } : {}) };
      case 'union': return { anyOf: schema.choices.map(convert) };
      case 'richtext': return reference('RichText');
      case 'custom': return reference('CustomValue');
      case 'typed': return reference('TypedValue');
      case 'time': return reference('TimeSpec');
      case 'condition': return reference('Condition');
      case 'expression': return reference('Expression');
      case 'name_policy': return reference('NamePolicy');
      case 'query': return reference('Query');
    }
  }
  const conditionalDefinitions = ['constant', 'all', 'any', 'not', 'compare', 'item', 'known', 'visited', 'external'].map(op => {
    const definition = convert(conditionSchema({ op, comparator: 'eq' })!); (definition.properties as Record<string, JsonSchema>).op = { const: op }; return definition;
  });
  conditionalDefinitions.push(convert(conditionSchema({ op: 'compare', comparator: 'in' })!));
  // Separate comparison operators to avoid an ambiguous oneOf branch for `in`.
  const compareDefinition = conditionalDefinitions[4] as { properties: Record<string, unknown> }; compareDefinition.properties.comparator = { enum: ['eq', 'ne', 'lt', 'le', 'gt', 'ge'] };
  const inDefinition = conditionalDefinitions.at(-1) as { properties: Record<string, unknown> }; inDefinition.properties.comparator = { const: 'in' };
  const span = { start: req(num(0, undefined, true)), end: req(num(0, undefined, true)) };
  const block = obj({ id: req(idSchema), kind: req(en('paragraph', 'heading', 'list_item', 'quote')), text: req(txt()), ruby: opt(arr(obj({ ...span, text: req(txt()) }))), links: opt(arr(obj({ ...span, target: req(anchor) }))), unresolvedAnnotations: opt(arr(unresolvedTextAnnotation)) });
  const calendarCommon = { id: req(txt(1)), name: req(txt(1)), originLabel: req(txt()), ticksPerDay: req(tick) };
  const calendar = union(obj({ ...calendarCommon, kind: req(en('gregorian')) }), obj({ ...calendarCommon, kind: req(en('repeating')), years: req(arr(obj({ months: req(arr(obj({ name: req(txt(1)), days: req(num(1, 400, true)) }), false, 1, 24)) }), false, 1, 400)) }));
  const defs: Record<string, JsonSchema> = {
    ID: { type: 'string', pattern: ID_PATTERN.source }, Tick: { type: 'string', pattern: '^(?:0|-[1-9][0-9]{0,37}|[1-9][0-9]{0,37})$' }, Revision: { type: 'string', pattern: REVISION_PATTERN.source },
    RichText: convert(arr(block)), CustomValue: { anyOf: [{ type: ['string', 'number', 'boolean', 'null'] }, convert(obj({ type: req(en('ref')), value: req(ref()) })), convert(obj({ type: req(en('date')), value: req({ type: 'date' }) }))] },
    TypedValue: { oneOf: [convert(obj({ type: req(en('boolean')), value: req(bool) })), convert(obj({ type: req(en('integer')), value: req(num(undefined, undefined, true)) })), convert(obj({ type: req(en('enum', 'text')), value: req(txt()) })), convert(obj({ type: req(en('ref')), value: req(ref()) })), convert(obj({ type: req(en('unknown')), value: req(en(null)), reason: req(txt()) }))] },
    TimeSpec: { oneOf: ['instant', 'interval', 'uncertain', 'relative', 'unknown'].map(mode => convert(timeSchema({ mode })!)) },
    Condition: { oneOf: conditionalDefinitions }, Expression: { anyOf: [reference('Condition'), ...['value', 'variable', 'add', 'subtract', 'multiply', 'if'].map(op => convert(expressionSchema({ op })!))] },
    NamePolicy: { anyOf: [...['alias', 'replace', 'exclude', 'anonymize'].map(mode => convert(namePolicySchema({ mode })!)), convert(namePolicySchema({})!)] },
    Query: { oneOf: ['all', 'any', 'kind', 'text', 'status', 'participant', 'production', 'chapter', 'foreshadow'].map(op => {
      const definition = convert(querySchema({ op })!); (definition.properties as Record<string, JsonSchema>).op = { const: op };
      // Ajv strictRequired checks required keys against properties declared in
      // the same subschema. The value constraints live on the query branch,
      // so repeat an unconstrained declaration here solely for that check.
      if (op === 'foreshadow') definition.anyOf = ['foreshadowId', 'resolutionPolicy', 'role', 'stage'].map(field => ({ properties: { [field]: {} }, required: [field] }));
      return definition;
    }) },
    Calendar: convert(calendar), Relation: convert(relationSchema), WorldReference: convert(worldReferenceSchema), SavedView: convert(viewSchema),
    Entity: { oneOf: ENTITY_KINDS.map(kind => reference(`Entity_${kind}`)) },
  };
  for (const kind of ENTITY_KINDS) defs[`Entity_${kind}`] = convert(entitySchema(kind));
  const arbitraryValue = {};
  const valueSnapshot = { type: 'object', properties: { present: { type: 'boolean' }, value: arbitraryValue }, required: ['present'], additionalProperties: false };
  defs.AlternativePatch = { type: 'object', properties: { key: { type: 'string', minLength: 1 }, scope: { enum: ['project', 'entity', 'relation', 'presentation'] }, itemId: reference('ID'), path: { type: 'array', items: { type: 'string' } }, label: { type: 'string' }, before: valueSnapshot, after: valueSnapshot }, required: ['key', 'scope', 'path', 'label', 'before', 'after'], additionalProperties: false };
  defs.AlternativeApplyReceipt = { type: 'object', properties: { id: reference('ID'), createdAt: { type: 'string', format: 'date-time' }, alternativeVersionId: reference('ID'), sourceSnapshotId: { anyOf: [reference('ID'), { type: 'null' }] }, selectedChangeKeys: { type: 'array', items: { type: 'string' }, minItems: 1, uniqueItems: true }, fromCanonicalRevision: reference('Revision'), appliedRevision: reference('Revision'), patches: { type: 'array', items: reference('AlternativePatch'), minItems: 1 } }, required: ['id', 'createdAt', 'alternativeVersionId', 'sourceSnapshotId', 'selectedChangeKeys', 'fromCanonicalRevision', 'appliedRevision', 'patches'], additionalProperties: false };
  defs.StructurePlan = { type: 'object', properties: { chapterId: reference('ID'), templateId: { type: 'string', minLength: 1 }, beatLabels: { type: 'array', items: { type: 'string', minLength: 1 }, maxItems: 100 }, assignments: { type: 'object', additionalProperties: reference('ID') } }, required: ['chapterId', 'templateId', 'beatLabels', 'assignments'], additionalProperties: false };
  defs.AlternativeVersion = { type: 'object', properties: { id: reference('ID'), parentVersionId: { anyOf: [reference('ID'), { type: 'null' }] }, label: { type: 'string', minLength: 1 }, createdAt: { type: 'string', format: 'date-time' }, content: reference('ProjectContent'), contentHash: { type: 'string', pattern: '^[0-9a-f]{64}$' }, structurePlan: reference('StructurePlan') }, required: ['id', 'parentVersionId', 'label', 'createdAt', 'content', 'contentHash'], additionalProperties: false };
  defs.AuthorAlternative = { type: 'object', properties: { id: reference('ID'), projectId: reference('ID'), name: { type: 'string', minLength: 1 }, status: { enum: ['active', 'provisional', 'needs_review', 'rejected', 'accepted'] }, baseRevision: reference('Revision'), sourceSnapshotId: { anyOf: [reference('ID'), { type: 'null' }] }, baseContent: reference('ProjectContent'), baseContentHash: { type: 'string', pattern: '^[0-9a-f]{64}$' }, versions: { type: 'array', items: reference('AlternativeVersion'), minItems: 1, maxItems: 500 }, headVersionId: reference('ID'), applyReceipts: { type: 'array', items: reference('AlternativeApplyReceipt') }, integrityHash: { type: 'string', pattern: '^[0-9a-f]{64}$' }, createdAt: { type: 'string', format: 'date-time' }, updatedAt: { type: 'string', format: 'date-time' } }, required: ['id', 'projectId', 'name', 'status', 'baseRevision', 'sourceSnapshotId', 'baseContent', 'baseContentHash', 'versions', 'headVersionId', 'applyReceipts', 'integrityHash', 'createdAt', 'updatedAt'], additionalProperties: false };
  const traceSchema = defs.Entity_trace as JsonSchema;
  traceSchema.allOf = [{ if: { properties: { data: { type: 'object', properties: { mode: { const: 'chapters' } }, required: ['mode'] } }, required: ['data'] }, then: { properties: { data: { type: 'object', properties: { readingPath: { not: { type: 'null' } }, steps: { type: 'array', maxItems: 0 } }, required: ['readingPath'] } }, required: ['data'] }, else: { properties: { data: { type: 'object', properties: { readingPath: { type: 'null' } } } }, required: ['data'] } }];
  const content = convert(obj({ ...projectHeaderFields, calendars: req(arr(calendar)), entities: req(arr(ref())), relations: req(arr(relationSchema)), views: req(arr(viewSchema)) }));
  const contentProperties = content.properties as Record<string, JsonSchema>; contentProperties.entities = { type: 'array', items: reference('Entity'), maxItems: 100_000 };
  defs.ProjectContent = content;
  defs.ProjectSnapshot = convert(obj({ id: req(idSchema), versionLabel: req(txt(1, 128)), contentHash: req({ type: 'hash' }), createdAt: req({ type: 'datetime' }) }));
  (defs.ProjectSnapshot.properties as Record<string, JsonSchema>).content = reference('ProjectContent'); (defs.ProjectSnapshot.required as string[]).push('content');
  defs.ContentState = { ...content, properties: { ...contentProperties, snapshots: { type: 'array', items: reference('ProjectSnapshot') }, authorAlternatives: { type: 'array', items: reference('AuthorAlternative'), maxItems: 100 } }, required: [...content.required as string[], 'snapshots'] };
  defs.CommandRecord = convert(obj({ operationId: req(idSchema), projectId: req(idSchema), baseRevision: req({ type: 'revision' }), revision: req({ type: 'revision' }), targetIds: req(arr(idSchema, true)), reason: req(txt()), createdAt: req({ type: 'datetime' }), compensatesOperationId: opt(idSchema), idMap: opt(record(idSchema, idSchema)) }));
  Object.assign(defs.CommandRecord.properties as Record<string, JsonSchema>, { before: reference('ContentState'), after: reference('ContentState') }); (defs.CommandRecord.required as string[]).push('before', 'after');
  return { $schema: 'https://json-schema.org/draft/2020-12/schema', $id: `https://shinariokanri.local/schema/project-${FORMAT_VERSION}.json`, title: 'Scenario project 1.0.0', description: 'Structural contract. validateProject additionally checks references, scopes, cycles, ranges, Unicode spans, comparison types and effect inputs. UTF-8 byte limits and SHA-256 integrity require executable validators.', ...content, properties: { ...contentProperties, snapshots: { type: 'array', items: reference('ProjectSnapshot') }, history: { type: 'array', items: reference('CommandRecord') }, authorAlternatives: { type: 'array', items: reference('AuthorAlternative'), maxItems: 100 } }, required: [...content.required as string[], 'snapshots', 'history'], $defs: defs };
}
