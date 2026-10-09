import type { EntityKind, ProjectData } from './types';

/** Author-only diagnostics. Never include these or idMap in a reader response. */
export interface ProjectionIssue {
  code: 'VALIDATION_FAILED' | 'REFERENCE_INVALID' | 'FORBIDDEN' | 'EXPORT_UNSUPPORTED' | 'PUBLIC_TEXT_REQUIRED';
  message: string;
  entityId?: string;
  field?: string;
}
export interface ProjectionOmission { entityId: string; field?: string; reason: string }
export type PublicValue = null | boolean | number | string | PublicValue[] | { [key: string]: PublicValue };
export interface ProjectedBlock {
  id: string;
  kind: 'paragraph' | 'heading' | 'list_item' | 'quote';
  text: string;
  ruby?: { start: number; end: number; text: string }[];
  links?: { start: number; end: number; targetId: string; blockId?: string; lineId?: string; sourceVersionId?:string; targetStart?:number; targetEnd?:number }[];
}
export interface ProjectedEntity { id: string; kind: EntityKind; name: string; status: string; data: Record<string, PublicValue> }
export interface ProjectedRelation { id: string; fromId: string; toId: string; relationType: string; direction: 'forward' | 'symmetric'; evidenceIds: string[]; validity?:PublicValue }
export interface ProjectionSearchEntry { entityId: string; kind: EntityKind; name: string; text: string; normalized: string }
export interface ProjectedCalendar { id: string; name: string; kind: 'gregorian' | 'repeating'; originLabel: string; ticksPerDay: string; years?: { months: { name: string; days: number }[] }[] }
export interface PublicProjection {
  format: 'scenario-projection';
  formatVersion: '1.0.0';
  title: string;
  mainStart?:string;
  calendars: ProjectedCalendar[];
  entities: ProjectedEntity[];
  relations: ProjectedRelation[];
  searchIndex: ProjectionSearchEntry[];
  versions?:{id:string;projection:PublicProjection}[];
}
export type ProjectionResult =
  | { ok: true; projection: PublicProjection; omissions: ProjectionOmission[]; idMap: Record<string, string> }
  | { ok: false; issues: ProjectionIssue[]; omissions: ProjectionOmission[] };
export interface ProjectionOptions {
  /** Executable output must reject a removed dependency instead of changing behavior. */
  strictReferences?: boolean;
  /** Reader and production output never promote draft/alternate content. */
  confirmedOnly?: boolean;
  /** The caller must load and verify this snapshot before projecting it. */
  targetVersionId?: string;
  versionTargets?:Record<string,{publicVersionId:string;idMap:Record<string,string>}>;
}

type ObjectValue = Record<string, unknown>;
type SourceRecord = { id: string; projectId: string; kind: EntityKind; name: string; status: string; deletedAt?: string | null; data: ObjectValue };
type FieldRule =
  | { type: 'text' | 'datetime' | 'rich' | 'ref' | 'version_ref' | 'refs' | 'number' | 'boolean' | 'time' | 'condition' | 'typed' | 'typeds' | 'allowed' | 'trigger' | 'participants' | 'pins' | 'anchor' | 'transitions' | 'semver' | 'expression' | 'resets' | 'exclusions' | 'validity' | 'scope' | 'exception' | 'exceptions' | 'alternatives' | 'camera' | 'parameters' | 'public_strings' | 'real_date' | 'estimate' }
  | { type: 'enum'; values: readonly string[] };
const text: FieldRule = { type: 'text' }, rich: FieldRule = { type: 'rich' }, ref: FieldRule = { type: 'ref' }, refs: FieldRule = { type: 'refs' };
const number: FieldRule = { type: 'number' }, boolean: FieldRule = { type: 'boolean' }, time: FieldRule = { type: 'time' };
const condition: FieldRule = { type: 'condition' }, typed: FieldRule = { type: 'typed' };
const oneOf = (...values: string[]): FieldRule => ({ type: 'enum', values });

/** All output fields are enumerated here. Unknown fields are never copied. */
export const PROJECTION_FIELDS: Readonly<Partial<Record<EntityKind, Readonly<Record<string, FieldRule>>>>> = Object.freeze({
  character: { reading: text, summary: rich, body: rich, birth: time, death: time },
  group: { groupType: oneOf('display', 'faction', 'plot_thread', 'category'), members: refs, parentId: ref, summary: rich },
  event: { summary: rich, time, laneRole: oneOf('common', 'participants', 'both'), participants: { type: 'participants' }, locationId: ref, itemIds: refs },
  place: { parentId: ref, reading: text, body: rich, mapIds: refs },
  item: { itemMode: oneOf('type', 'instance'), typeId: ref, body: rich },
  note: { body: rich, attachmentIds: refs },
  chapter: { sceneIds: refs, summary: rich },
  scene: { summary: rich, body: rich, eventIds: refs, dialogueLineIds: refs, chapterId: ref, threadIds: refs, povId: ref, blockIds: refs, tension: number, importance: number },
  goal: { ownerId: ref, description: rich, changes: refs, evidenceSceneIds: refs },
  flow_node: { nodeType: oneOf('scene', 'choice', 'automatic', 'call', 'entry', 'exit', 'terminal'), sceneId: ref, childGraphId: ref, terminalReason: text, trigger: { type: 'trigger' }, gate: condition, executionPolicy: oneOf('manual_choice', 'first_match', 'all_match'), fallbackId: ref, shownInformationIds: refs },
  flow_edge: { fromId: ref, toId: ref, edgeType: oneOf('choice', 'automatic', 'call_return'), label: text, condition, effectIds: refs, priority: number, choiceLineId: ref },
  flow_graph: { nodeIds: refs, edgeIds: refs, entryIds: refs, exitIds: refs, parentGraphId: ref,parameters:{type:'parameters'} },
  dialogue_line: { text: rich, speakerId: ref, choiceEdgeId: ref, cueIds: refs },
  quest: { key: text, stateVariableId: ref, description: rich, flowIds: refs, transitionRules: { type: 'transitions' } },
  lore: { body: rich, assertionIds: refs, reading: text },
  variable: { key: text, valueType: oneOf('boolean', 'integer', 'enum'), scope: oneOf('scene', 'chapter', 'character', 'run', 'across_runs'), initial: typed, allowed: { type: 'allowed' }, ownerId: ref, externalContractId: ref, externalUseDeclared: boolean, description: rich, derived:{type:'expression'},resetRules:{type:'resets'},exclusions:{type:'exclusions'}, transitionRules: { type: 'transitions' } },
  effect: { operation: oneOf('set', 'add', 'grant', 'consume', 'move', 'assert', 'mark_seen', 'reset'), targetId: ref, value: typed, condition, instanceId: ref, reason: text, exceptionDetails:{type:'exception'} },
  assertion: { subjectId: ref, predicate: text, value: typed, truthKind: oneOf('author_truth', 'testimony', 'belief', 'hypothesis'), holderId: ref, sourceIds: refs, evidenceLocation: { type: 'anchor' }, reason: text, validity:{type:'validity'} },
  foreshadow: { question: rich, intent: rich, truthAssertionIds: refs, clueIds: refs, payoffIds: refs, requiredInfo: refs, alternativeInfo:{type:'alternatives'},deadline:{type:'scope'},exceptions:{type:'exceptions'}, presentationDeadline: { type: 'anchor' }, resolutionPolicy: oneOf('this_work', 'sequel', 'intentional_open', 'red_herring', 'undecided', 'rejected') },
  disclosure: { foreshadowId: ref, anchor: { type: 'anchor' }, stage: oneOf('hint', 'suspicion', 'reinforce', 'reveal', 'alternative'), role: oneOf('clue', 'payoff'), targetScope:{type:'scope'},condition, knowledgeEffects: refs },
  attachment: { displayName: text },
  source: { accessedAt:{type:'datetime'},excerptLocation:text,attachmentId:ref,sourceType: oneOf('web', 'file', 'book', 'observation'), locator: text, interpretation: rich, redistributionAllowed: boolean },
  cue: { anchor: { type: 'anchor' }, cueType: text, attachmentId: ref, speakerId: ref, expression: text, waitMs: number,mediaTime:number,camera:{type:'camera'} },
  storyboard_frame: { anchor: { type: 'anchor' }, mediaStartMs: number, mediaEndMs: number, referenceAssetId: ref, finalAssetId: ref, cueIds: refs, caption: rich },
  localization: { sourceLineId: ref, language: text, text: rich, stage: oneOf('draft', 'reviewed', 'needs_review'), recordingIds: refs },
  recording: { sourceLineId: ref, language: text, translationId: ref, attachmentId: ref, stage: oneOf('planned', 'recorded', 'reviewed', 'needs_review') },
  terminology: { canonical: text, reading: text,variants:{type:'public_strings'},validity:{type:'validity'},exceptions:{type:'exceptions'}, language: text, usageNotes: rich, voiceOwnerId: ref },
  voice_rule:{characterId:ref,validity:{type:'validity'},firstPerson:text,addressing:text,phrasing:text,examples:rich,exceptions:{type:'exceptions'}},
  map: { placeId: ref, coordinateSystem: oneOf('normalized'), attachmentId: ref, parentMapId: ref, pins: { type: 'pins' } },
  travel_route: { fromPlaceId: ref, toPlaceId: ref, direction: oneOf('one_way', 'two_way'), method: text },
  collection: { mode: oneOf('fixed'), memberIds: refs },
  gameplay_spec: { sceneId: ref, action: rich, mechanic:text,tutorial:rich,reward:typed,questId: ref, taskIds: refs,intentionalDifference:text },
  production_task: { deadline:{type:'real_date'},estimate:{type:'estimate'},blockingReason:text,targetIds: refs, stage: oneOf('writing', 'review', 'implementation', 'translation', 'recording', 'verification', 'publication'), progress: oneOf('todo', 'doing', 'done', 'needs_review'), dependsOn: refs },
  media_variant: { medium: oneOf('game', 'novel', 'video', 'audio', 'promotion', 'custom'),baseSnapshotId:{type:'version_ref'},previousVariantId:ref,releaseAt:{type:'datetime'}, body: rich, sourceIds: refs, needsReview: boolean },
  external_contract: { key: text, owner: oneOf('tool', 'game'), inputType: oneOf('boolean', 'integer', 'enum'), outputType: oneOf('boolean', 'integer', 'enum'), missingPolicy: oneOf('unknown', 'block'), description: rich, version: { type: 'semver' }, stubValues: { type: 'typeds' } },
});
export const PROJECTABLE_KINDS = Object.freeze(Object.keys(PROJECTION_FIELDS) as EntityKind[]);
const BEHAVIOR_REFS = new Set(['fromId', 'toId', 'effectIds', 'nodeIds', 'edgeIds', 'entryIds', 'exitIds', 'childGraphId', 'fallbackId', 'targetId', 'instanceId', 'stateVariableId', 'externalContractId', 'shownInformationIds', 'knowledgeEffects']);
const FORBIDDEN_FIELDS = new Set(['handoffReceipt','authorNotes', 'aliases', 'quotedText', 'originLineIds', 'replacedByLineIds', 'lineage', 'customValues', 'assetPath', 'licenseNote', 'history', 'query', 'sourceHash']);
const BLOCK_KINDS = new Set(['paragraph', 'heading', 'list_item', 'quote']);
const ASSET_TYPES: Record<string, string> = { 'image/png': 'png', 'image/jpeg': 'jpg', 'image/gif': 'gif', 'image/webp': 'webp', 'audio/wav': 'wav', 'audio/mpeg': 'mp3', 'application/pdf': 'pdf', 'video/mp4':'mp4','video/webm':'webm','video/ogg':'ogv','audio/ogg':'ogg','text/plain':'txt','application/json':'json','application/octet-stream':'bin' };
const TICK = /^(?:0|-[1-9][0-9]{0,37}|[1-9][0-9]{0,37})$/;
const object = (value: unknown): ObjectValue | undefined => value !== null && typeof value === 'object' && !Array.isArray(value) ? value as ObjectValue : undefined;
const own = (value: ObjectValue | undefined, key: string): unknown => value && Object.prototype.hasOwnProperty.call(value, key) ? value[key] : undefined;
const hasOwn = (value: object, key: string): boolean => Object.prototype.hasOwnProperty.call(value, key);
const empty = (value: unknown): boolean => value == null || value === '' || (Array.isArray(value) && value.length === 0);
const integer = (value: unknown): value is number => typeof value === 'number' && Number.isSafeInteger(value);

/** Pure, fail-closed projection. Public prose is supplied by the author; this is not a text redactor. */
export function createProjection(project: ProjectData, profileId: string, options: ProjectionOptions = {}): ProjectionResult {
  const issues: ProjectionIssue[] = [], omissions: ProjectionOmission[] = [];
  if (!project || !Array.isArray(project.entities) || !Array.isArray(project.relations) || project.entities.some(entity => !entity || typeof entity.id !== 'string' || !object(entity.data))) return { ok: false, issues: [{ code: 'VALIDATION_FAILED', message: '作品の公開元データが不正です。' }], omissions };
  const fail = (code: ProjectionIssue['code'], message: string, entityId?: string, field?: string) => { issues.push({ code, message, ...(entityId ? { entityId } : {}), ...(field ? { field } : {}) }); };
  const omit = (entityId: string, reason: string, field?: string) => { omissions.push({ entityId, reason, ...(field ? { field } : {}) }); };
  const source = new Map<string, SourceRecord>();
  for (const entity of project.entities) {
    if (source.has(entity.id)) fail('VALIDATION_FAILED', '同じIDの情報が重複しています。', entity.id);
    source.set(entity.id, entity as unknown as SourceRecord);
  }
  const profile = source.get(profileId);
  if (!profile || profile.kind !== 'projection_profile' || profile.projectId !== project.projectId || profile.deletedAt) {
    return { ok: false, issues: [{ code: 'REFERENCE_INVALID', message: 'この作品の公開範囲を選んでください。', entityId: profileId }], omissions };
  }
  const policy = profile.data;
  if (policy.sourceVersionId != null && policy.sourceVersionId !== options.targetVersionId && policy.sourceVersionId !== project.revision) fail('VALIDATION_FAILED', '公開範囲が固定された版と出力元の版が一致しません。', profileId, 'sourceVersionId');
  if (object(policy.routeScope)?.targetSnapshotId != null && object(policy.routeScope)!.targetSnapshotId !== options.targetVersionId) fail('VALIDATION_FAILED', '公開範囲の対象snapshotを読み込んでください。', profileId, 'routeScope.targetSnapshotId');
  if (policy.idPolicy != null && !['remap', 'preserve'].includes(String(policy.idPolicy))) fail('VALIDATION_FAILED', '公開IDの方式が不正です。', profileId, 'idPolicy');
  if (policy.includeAuthorNotes === true) fail('FORBIDDEN', '公開用出力に作者メモは含められません。', profileId, 'includeAuthorNotes');
  const title = own(policy, 'publicTitle');
  if (typeof title !== 'string' || !title.trim()) fail('PUBLIC_TEXT_REQUIRED', '作者が確認した公開用の作品名を指定してください。', profileId, 'publicTitle');
  const includedIds = own(policy, 'includedIds'), allowedKinds = own(policy, 'allowedKinds');
  if (!Array.isArray(includedIds) || includedIds.some(id => typeof id !== 'string') || new Set(includedIds).size !== includedIds.length) fail('VALIDATION_FAILED', '公開するIDを重複のない一覧で指定してください。', profileId, 'includedIds');
  if (!Array.isArray(allowedKinds) || allowedKinds.length === 0 || allowedKinds.some(kind => typeof kind !== 'string' || !hasOwn(PROJECTION_FIELDS, kind))) fail('EXPORT_UNSUPPORTED', '公開可能な種類だけを明示的に選んでください。', profileId, 'allowedKinds');
  const publicTexts = object(own(policy, 'publicTexts')) ?? {};
  const publicIds = object(own(policy, 'publicIds')) ?? {};
  const namePolicies = object(own(policy, 'namePolicy'));
  const scopeIds = scopedEntityIds(source, policy, project.projectId, publicTexts, fail);
  const statuses = Array.isArray(policy.includedStatuses) ? policy.includedStatuses : ['confirmed'];
  if (statuses.some(status => !['confirmed', 'provisional', 'needs_review'].includes(String(status)))) fail('FORBIDDEN', '没案と作者別案は公開対象にできません。', profileId, 'includedStatuses');
  const selected: SourceRecord[] = [];
  const names = new Map<string, string>();
  const explicitPublicIds = new Map<string, string>();
  const included = new Set<string>(Array.isArray(includedIds) ? includedIds : []);
  // Selection is a set; the chosen content version owns the presentation order.
  const orderedIds = [...source.keys()].filter(id => included.has(id));
  for (const id of included) if (!source.has(id)) orderedIds.push(id);
  for (const id of orderedIds) {
    const entity = source.get(id);
    if (!entity || entity.projectId !== project.projectId) { fail('REFERENCE_INVALID', '作品内にない情報が公開範囲に含まれています。', id); continue; }
    if (scopeIds && !scopeIds.has(id)) { omit(id, '指定した章またはグラフの範囲外'); continue; }
    if (entity.deletedAt || !statuses.includes(entity.status) || (options.confirmedOnly && entity.status !== 'confirmed')) { omit(id, '削除済み、未確定、没案または別案'); continue; }
    if (!Array.isArray(allowedKinds) || !allowedKinds.includes(entity.kind)) { omit(id, '許可されていない種類'); continue; }
    if (!hasOwn(PROJECTION_FIELDS, entity.kind)) { fail('EXPORT_UNSUPPORTED', 'この種類の安全な投影は未対応です。', id); continue; }
    if (['scene', 'flow_node'].includes(entity.kind) && object(entity.data.reuse)?.mode !== undefined && object(entity.data.reuse)?.mode !== 'clone') { fail('EXPORT_UNSUPPORTED', '固定共通元と使用先を合わせた公開範囲・公開名・本文を確認する出力は未対応です。再利用を省略した出力は作成できません。', id, 'reuse'); continue; }
    const byEntityId = object(own(namePolicies, 'byEntityId'));
    const namePolicy = object(own(byEntityId, id)) ?? object(own(namePolicies, 'defaultPolicy')) ?? (typeof namePolicies?.mode === 'string' ? namePolicies : undefined);
    if (namePolicy?.mode === 'exclude') { omit(id, '作者が非公開を選択'); continue; }
    let publicName: unknown;
    if (namePolicy?.mode === 'replace') publicName = namePolicy.replacement;
    else if (namePolicy?.mode === 'anonymize') { publicName = namePolicy.publicName; if (typeof namePolicy.publicId === 'string') explicitPublicIds.set(id, namePolicy.publicId); }
    else if (namePolicy?.mode === 'alias') {
      const aliases = Array.isArray(entity.data.aliases) ? entity.data.aliases : [];
      const alias = aliases.map(object).find(value => value?.id === namePolicy.aliasId);
      publicName = alias?.text;
    } else if (entity.name === '') publicName = '';
    if (typeof publicName !== 'string' || (entity.name !== '' && !publicName.trim())) { fail('PUBLIC_TEXT_REQUIRED', 'この情報の公開名または公開別名を指定してください。', id, 'namePolicy'); continue; }
    names.set(id, publicName);
    selected.push(entity);
  }
  const idMap: Record<string, string> = Object.create(null) as Record<string, string>;
  const emittedIds = new Set<string>();
  let sequence = 0;
  const addId = (id: string) => {
    if (Object.prototype.hasOwnProperty.call(idMap, id)) return;
    const candidate = explicitPublicIds.get(id) ?? own(publicIds, id) ?? (policy.idPolicy === 'preserve' ? id : `public-${String(++sequence).padStart(6, '0')}`);
    if (typeof candidate !== 'string' || !/^[a-zA-Z0-9][a-zA-Z0-9._-]{0,127}$/.test(candidate) || emittedIds.has(candidate)) { fail('VALIDATION_FAILED', '公開IDが不正、または重複しています。', id, 'publicIds'); return; }
    idMap[id] = candidate; emittedIds.add(candidate);
  };
  selected.forEach(entity => addId(entity.id));
  // Public block IDs belong to the author-provided documents, never to hidden source documents.
  const allowedFields = object(own(policy, 'allowedFields'));
  const excludedFields = Array.isArray(policy.excludedFields) ? policy.excludedFields : [];
  const publicBlockIds = new Set<string>();
  const publicBlockOwners=new Map<string,string>(),sourceBlockOwners=new Map<string,string>();
  for (const entity of selected) {
    for(const value of Object.values(entity.data))if(Array.isArray(value))for(const raw of value){const block=object(raw);if(typeof block?.id==='string'&&typeof block.text==='string')sourceBlockOwners.set(block.id,entity.id);}
    const fields = object(own(publicTexts, entity.id));
    const schema = PROJECTION_FIELDS[entity.kind]!;
    const explicit = own(allowedFields, entity.kind);
    for (const [field, rule] of Object.entries(schema)) if (rule.type === 'rich' && (!Array.isArray(explicit) || explicit.includes(field)) && !excludedFields.includes(field) && !excludedFields.includes(`${entity.kind}.${field}`) && Array.isArray(own(fields, field))) {
      for (const block of fields![field] as unknown[]) {
        const record = object(block);
        if (typeof record?.id === 'string') {
          if (source.has(record.id) || publicBlockIds.has(record.id)) fail('VALIDATION_FAILED', '公開文の段落IDが他の情報と重複しています。', entity.id, field);
          else { publicBlockIds.add(record.id);publicBlockOwners.set(record.id,entity.id); addId(record.id); }
        }
      }
    }
    const trigger = object(entity.data.trigger);
    if (entity.kind === 'flow_node' && typeof trigger?.id === 'string') addId(trigger.id);
  }
  const selectedIds = new Set(selected.map(entity => entity.id));
  const blockSources=object(policy.blockSources)??{};
  for(const [publicBlock,sourceBlock]of Object.entries(blockSources)){if(typeof sourceBlock!=='string'||!publicBlockIds.has(publicBlock)||!idMap[publicBlock]||sourceBlockOwners.get(sourceBlock)!==publicBlockOwners.get(publicBlock)){fail('REFERENCE_INVALID','公開段落の元ID対応が不正です。',profileId,'blockSources');continue;}if(idMap[sourceBlock]&&idMap[sourceBlock]!==idMap[publicBlock]){fail('REFERENCE_INVALID','同じ原段落に複数の公開位置が指定されています。',profileId,'blockSources');continue;}idMap[sourceBlock]=idMap[publicBlock];}
  const calendars: ProjectedCalendar[] = [], calendarIds = new Map<string, string>();
  const publicCalendarId = (value: unknown, entity: SourceRecord, field: string): string | undefined => {
    if (typeof value !== 'string') { fail('REFERENCE_INVALID', '日時が使う暦を指定してください。', entity.id, field); return undefined; }
    if (calendarIds.has(value)) return calendarIds.get(value);
    const sourceCalendar = project.calendars.find(calendar => calendar.id === value);
    if (!sourceCalendar || !['gregorian', 'repeating'].includes(sourceCalendar.kind) || !TICK.test(sourceCalendar.ticksPerDay) || BigInt(sourceCalendar.ticksPerDay) <= 0n) { fail('REFERENCE_INVALID', '日時が使う暦を安全に出力できません。', entity.id, field); return undefined; }
    let publicId = `public-calendar-${calendars.length + 1}`;
    while (emittedIds.has(publicId)) publicId += '-calendar';
    emittedIds.add(publicId);
    const calendar: ProjectedCalendar = { id: publicId, name: `暦${calendars.length + 1}`, kind: sourceCalendar.kind, originLabel: '原点', ticksPerDay: sourceCalendar.ticksPerDay };
    if (sourceCalendar.kind === 'repeating') {
      if (!Array.isArray(sourceCalendar.years) || !sourceCalendar.years.length || sourceCalendar.years.length > 400) { fail('EXPORT_UNSUPPORTED', '繰り返し暦の周期を安全に出力できません。', entity.id, field); return undefined; }
      calendar.years = [];
      for (const year of sourceCalendar.years) {
        if (!Array.isArray(year.months) || !year.months.length || year.months.length > 24 || year.months.some(month => !integer(month.days) || month.days < 1 || month.days > 400)) { fail('EXPORT_UNSUPPORTED', '繰り返し暦の月を安全に出力できません。', entity.id, field); return undefined; }
        calendar.years.push({ months: year.months.map((month, index) => ({ name: `月${index + 1}`, days: month.days })) });
      }
    }
    calendarIds.set(value, publicId); calendars.push(calendar);
    return publicId;
  };
  const reference = (value: unknown, entity: SourceRecord, field: string, mandatory = false): string | undefined => {
    if (value == null) return undefined;
    if (typeof value === 'string' && selectedIds.has(value) && Object.prototype.hasOwnProperty.call(idMap, value)) return idMap[value];
    if (typeof value === 'string' && Object.prototype.hasOwnProperty.call(idMap, value) && field.includes('block')) return idMap[value];
    if (mandatory || options.strictReferences) fail('REFERENCE_INVALID', '公開範囲にない参照先が必要です。範囲または代替文を見直してください。', entity.id, field);
    else omit(entity.id, '公開範囲にない参照を除外', field);
    return undefined;
  };
  const mapEnum = (value: unknown, variableId: string, entity: SourceRecord, field: string): string | undefined => {
    const replacements = object(own(object(own(policy, 'publicValues')), variableId));
    const replacement = typeof value === 'string' ? own(replacements, value) : undefined;
    if (typeof replacement !== 'string') { fail('PUBLIC_TEXT_REQUIRED', '列挙値の公開用表記を指定してください。', entity.id, field); return undefined; }
    return replacement;
  };
  const typedValue = (value: unknown, variableId: string, entity: SourceRecord, field: string): PublicValue | undefined => {
    if (typeof value === 'string' && entity.kind === 'assertion') { const mapped = reference(value, entity, field, true); return mapped; }
    const input = object(value);
    if (!input) { fail('VALIDATION_FAILED', '型付きの値が必要です。', entity.id, field); return undefined; }
    if (input.type === 'boolean' && typeof input.value === 'boolean') return { type: 'boolean', value: input.value };
    if (input.type === 'integer' && integer(input.value)) return { type: 'integer', value: input.value };
    if (input.type === 'enum') { const mapped = mapEnum(input.value, variableId, entity, field); return mapped === undefined ? undefined : { type: 'enum', value: mapped }; }
    if (input.type === 'ref') { const mapped = reference(input.value, entity, field, true); return mapped ? { type: 'ref', value: mapped } : undefined; }
    fail('EXPORT_UNSUPPORTED', '未確定値や自由文字列の値は安全な制作出力に対応していません。', entity.id, field);
    return undefined;
  };
  const conditionValue = (input: unknown, entity: SourceRecord, field: string): PublicValue | undefined => {
    let nodes = 0;
    const visit = (value: unknown, depth: number): PublicValue | undefined => {
      const ast = object(value);
      if (!ast || depth > 16 || ++nodes > 256) { fail('EXPORT_UNSUPPORTED', '条件の形または深さが対応範囲を超えています。', entity.id, field); return undefined; }
      const requiredRef = (key: string) => reference(ast[key], entity, `${field}.${key}`, true);
      switch (ast.op) {
        case 'constant': if (typeof ast.value === 'boolean') return { op: 'constant', value: ast.value }; break;
        case 'all': case 'any': {
          if (!Array.isArray(ast.children) || ast.children.length === 0) break;
          const children = ast.children.map(child => visit(child, depth + 1));
          return children.every(child => child !== undefined) ? { op: ast.op, children: children as PublicValue[] } : undefined;
        }
        case 'not': { const child = visit(ast.child, depth + 1); return child === undefined ? undefined : { op: 'not', child }; }
        case 'compare': {
          const variableId = requiredRef('variableId');
          const variable = typeof ast.variableId === 'string' ? source.get(ast.variableId) : undefined;
          const comparator = ast.comparator;
          if (!variable || variable.kind !== 'variable' || !['eq', 'ne', 'lt', 'le', 'gt', 'ge', 'in'].includes(String(comparator))) break;
          let compared: PublicValue | undefined;
          if (comparator === 'in' && Array.isArray(ast.value)) {
            const values = ast.value.map(item => typedValue(item, variable.id, entity, field));
            if (values.every(item => item !== undefined)) compared = values as PublicValue[];
          } else compared = typedValue(ast.value, variable.id, entity, field);
          if (variableId && compared !== undefined) return { op: 'compare', variableId, comparator: String(comparator), value: compared };
          return undefined;
        }
        case 'item': { const itemId = requiredRef('itemId'); if (itemId && integer(ast.quantity) && ast.quantity >= 0) return { op: 'item', itemId, quantity: ast.quantity }; break; }
        case 'known': { const assertionId = requiredRef('assertionId'), holderId = requiredRef('holderId'); if (assertionId && holderId) return { op: 'known', assertionId, holderId }; return undefined; }
        case 'visited': { const entityId = requiredRef('entityId'); if (entityId && integer(ast.count) && ast.count >= 0) return { op: 'visited', entityId, count: ast.count }; break; }
        case 'external': { const contractId = requiredRef('contractId'); if (contractId) return { op: 'external', contractId }; return undefined; }
      }
      fail('EXPORT_UNSUPPORTED', 'この条件は対応先で安全に表せません。', entity.id, field);
      return undefined;
    };
    return visit(input, 1);
  };
  const publicField = (entity: SourceRecord, field: string): unknown => own(object(own(publicTexts, entity.id)), field);
  const textValue = (entity: SourceRecord, field: string): string | undefined => {
    const value = publicField(entity, field);
    if (typeof value === 'string') return value;
    if (!empty(entity.data[field])) fail('PUBLIC_TEXT_REQUIRED', '原文の安全性は自動判定できません。公開用の文面を指定するか、この項目を除外してください。', entity.id, field);
    return undefined;
  };
  const anchorValue = (value: unknown, entity: SourceRecord, field: string): PublicValue | undefined => {
    const input = object(value); if (!input) { fail('VALIDATION_FAILED', '本文位置が不正です。', entity.id, field); return undefined; }
    if (input.positionStatus === 'unresolved') { if (options.strictReferences) fail('REFERENCE_INVALID', '公開する本文位置の再リンクが必要です。', entity.id, field); else omit(entity.id, '位置不明の本文参照を除外', field); return undefined; }
    const fixed=input.sourceVersionId&&input.sourceVersionId!==project.projectId&&input.sourceVersionId!==options.targetVersionId?options.versionTargets?.[String(input.sourceVersionId)]:undefined;
    if(input.sourceVersionId&&input.sourceVersionId!==project.projectId&&input.sourceVersionId!==options.targetVersionId&&!fixed){fail('EXPORT_UNSUPPORTED','別の固定版を指す位置には、その版の公開範囲確認が必要です。黙って現在位置へ移しません。',entity.id,field);return undefined;}
    const targetMap=fixed?.idMap??idMap,targetId=fixed?targetMap[String(input.entityId)]:reference(input.entityId, entity, field, true); if (!targetId){fail('REFERENCE_INVALID','引用固定版の公開対象がありません。',entity.id,field);return undefined;}
    const output: Record<string, PublicValue> = { entityId: targetId,...fixed?{sourceVersionId:fixed.publicVersionId}:{} };
    for (const key of ['blockId', 'lineId']) if (input[key] != null) {
      const sourceId = input[key];
      if (typeof sourceId !== 'string' || !Object.prototype.hasOwnProperty.call(targetMap, sourceId)) { if (options.strictReferences) fail('REFERENCE_INVALID', '公開文に存在しない位置への参照です。', entity.id, field); else omit(entity.id, '非公開の本文位置を除外', field); return undefined; }
      output[key] = targetMap[sourceId];
    }
    if (integer(input.start) && integer(input.end) && input.start >= 0 && input.end >= input.start) { output.start = input.start; output.end = input.end; }
    return output;
  };
  const richValue = (entity: SourceRecord, field: string): PublicValue | undefined => {
    const input = publicField(entity, field);
    if (typeof input === 'string') return [{ id: `${idMap[entity.id]}.${field}`, kind: 'paragraph', text: input }];
    if (!Array.isArray(input)) { if (!empty(entity.data[field])) fail('PUBLIC_TEXT_REQUIRED', '公開用の本文を指定してください。原文の秘密は自動で除けません。', entity.id, field); return undefined; }
    const output: PublicValue[] = [];
    for (const raw of input) {
      const block = object(raw);
      if (!block || typeof block.id !== 'string' || !idMap[block.id] || !BLOCK_KINDS.has(String(block.kind)) || typeof block.text !== 'string') { fail('VALIDATION_FAILED', '公開文の段落が不正です。', entity.id, field); continue; }
      const projected: Record<string, PublicValue> = { id: idMap[block.id], kind: String(block.kind), text: block.text };
      if (Array.isArray(block.unresolvedAnnotations) && block.unresolvedAnnotations.length) omit(entity.id, '再リンク待ちの本文注記を除外', field);
      const length = [...block.text].length;
      const validRange = (range: ObjectValue): boolean => integer(range.start) && integer(range.end) && range.start >= 0 && range.end > range.start && range.end <= length;
      if (Array.isArray(block.ruby)) {
        const ruby: PublicValue[] = [];
        for (const rawRuby of block.ruby) { const range = object(rawRuby); if (!range || !validRange(range) || typeof range.text !== 'string') { fail('VALIDATION_FAILED', '公開文のルビ範囲が不正です。', entity.id, field); continue; } ruby.push({ start: range.start as number, end: range.end as number, text: range.text }); }
        projected.ruby = ruby;
      }
      if (Array.isArray(block.links)) {
        const links: PublicValue[] = [];
        for (const rawLink of block.links) {
          const range = object(rawLink);
          if (!range || !validRange(range)) { fail('VALIDATION_FAILED', '公開文のリンク範囲が不正です。', entity.id, field); continue; }
          const target = object(range.target) ?? range;
          if (target.positionStatus === 'unresolved') { if (options.strictReferences) fail('REFERENCE_INVALID', '公開文のリンク先位置の再リンクが必要です。', entity.id, field); else omit(entity.id, '位置不明のリンクを除外', field); continue; }
          const fixed=target.sourceVersionId&&target.sourceVersionId!==project.projectId&&target.sourceVersionId!==options.targetVersionId?options.versionTargets?.[String(target.sourceVersionId)]:undefined,targetMap=fixed?.idMap??idMap;
          if(target.sourceVersionId&&target.sourceVersionId!==project.projectId&&target.sourceVersionId!==options.targetVersionId&&!fixed){fail('EXPORT_UNSUPPORTED','公開リンクには別の固定版の公開確認が必要です。現在位置へ代用しません。',entity.id,field);continue;}
          const targetId = fixed?targetMap[String(target.targetId??target.entityId)]:reference(target.targetId ?? target.entityId, entity, `${field}.links`);
          if (!targetId) continue;
          const link: Record<string, PublicValue> = { start: range.start as number, end: range.end as number, targetId };
          if(target.sourceVersionId)link.sourceVersionId=fixed?.publicVersionId??'public-project';if(integer(target.start)&&integer(target.end)){link.targetStart=target.start;link.targetEnd=target.end;}
          let valid = true;
          for (const key of ['blockId', 'lineId']) if (target[key] != null) {
            const origin = target[key]; if (typeof origin !== 'string' || !Object.prototype.hasOwnProperty.call(targetMap, origin)) { if (options.strictReferences) fail('REFERENCE_INVALID', '公開文に存在しない位置へのリンクです。', entity.id, field); else omit(entity.id, '非公開の位置へのリンクを除外', field); valid = false; break; }
            link[key] = targetMap[origin];
          }
          if (valid) links.push(link);
        }
        if (links.length) projected.links = links;
      }
      output.push(projected);
    }
    return output;
  };
  const behaviorText=(entity:SourceRecord,field:string):string=>{const value=textValue(entity,field);return value??'';};
  const scopeValue=(value:unknown,entity:SourceRecord,field:string):PublicValue|undefined=>{
    const input=object(value);if(!input||input.projectId!==project.projectId){fail('REFERENCE_INVALID','対象作品の範囲を公開先へ対応できません。',entity.id,field);return;}
    const output:Record<string,PublicValue>={projectId:'public-project'};
    for(const key of ['graphId','chapterId'])if(input[key]!=null){const mapped=reference(input[key],entity,field,true);if(!mapped)return;output[key]=mapped;}
    if(input.targetSnapshotId!=null){if(input.targetSnapshotId!==project.projectId&&input.targetSnapshotId!==options.targetVersionId){fail('EXPORT_UNSUPPORTED','別版限定の範囲を現在版へ代用しません。',entity.id,field);return;}output.targetSnapshotId='public-project';}
    if(input.routeCondition!=null){const mapped=conditionValue(input.routeCondition,entity,field);if(!mapped)return;output.routeCondition=mapped;}return output;
  };
  const validityValue=(value:unknown,entity:SourceRecord,field:string):PublicValue|undefined=>{const input=object(value);if(!input)return;let range:PublicValue=null;if(input.worldRange!=null){const raw=object(input.worldRange);if(!raw||['start','end'].some(key=>raw[key]!==null&&(typeof raw[key]!=='string'||!TICK.test(String(raw[key]))))){fail('VALIDATION_FAILED','期間の整数tickが不正です。',entity.id,field);return;}range={start:raw.start as string|null,end:raw.end as string|null};}const route=input.routeCondition==null?null:conditionValue(input.routeCondition,entity,field),anchor=input.presentationAnchor==null?null:anchorValue(input.presentationAnchor,entity,field);if(route===undefined||anchor===undefined)return;return {worldRange:range,routeCondition:route,presentationAnchor:anchor};};
  const exceptionValue=(value:unknown,entity:SourceRecord,field:string):PublicValue|undefined=>{const input=object(value);if(!input)return;const target=scopeValue(input.targetScope,entity,field),validity=validityValue(input.validity,entity,field);if(!target||!validity||!Array.isArray(input.evidenceIds))return;const evidence=input.evidenceIds.map(id=>reference(id,entity,field,true));if(evidence.some(id=>!id))return;const reason=behaviorText(entity,'exceptionReason');if(!reason.trim()){fail('PUBLIC_TEXT_REQUIRED','有限例外の公開用理由を指定してください。',entity.id,field);return;}return {reason,targetScope:target,validity,evidenceIds:evidence as string[]};};
  const expressionValue=(value:unknown,entity:SourceRecord,field:string,depth=0):PublicValue|undefined=>{if(depth>64){fail('EXPORT_UNSUPPORTED','算出式の上限を超えています。',entity.id,field);return;}const input=object(value);if(!input)return;if(input.op==='value'){const mapped=typedValue(input.value,entity.id,entity,field);return mapped?{op:'value',value:mapped}:undefined;}if(input.op==='variable'){const id=reference(input.variableId,entity,field,true);return id?{op:'variable',variableId:id}:undefined;}if(['add','subtract','multiply'].includes(String(input.op))){const left=expressionValue(input.left,entity,field,depth+1),right=expressionValue(input.right,entity,field,depth+1);return left&&right?{op:String(input.op),left,right}:undefined;}if(input.op==='if'){const condition=conditionValue(input.condition,entity,field),yes=expressionValue(input.then,entity,field,depth+1),no=expressionValue(input.else,entity,field,depth+1);return condition&&yes&&no?{op:'if',condition,then:yes,else:no}:undefined;}return conditionValue(input,entity,field);};
  const serialize = (entity: SourceRecord, field: string, rule: FieldRule): PublicValue | undefined => {
    const value = entity.data[field];
    if (rule.type === 'text') return textValue(entity, field);
    if (rule.type === 'rich') return richValue(entity, field);
    if (value == null) return undefined;
    switch (rule.type) {
      case 'public_strings':{if(Array.isArray(value)&&!value.length)return [];let approved:unknown;try{approved=JSON.parse(String(publicField(entity,field)));}catch{}if(Array.isArray(approved)&&approved.every(item=>typeof item==='string'))return approved;fail('PUBLIC_TEXT_REQUIRED','公開用の文字列一覧をJSON文章で指定してください。',entity.id,field);return;}
      case 'real_date':{const input=object(value);if(input&&typeof input.date==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(input.date)&&typeof input.timeZone==='string')return {date:input.date,timeZone:input.timeZone};break;}
      case 'estimate':{const input=object(value);let assumptions:unknown;try{assumptions=JSON.parse(String(publicField(entity,'estimateAssumptions')));}catch{}const source=publicField(entity,'estimateSource'),unit=publicField(entity,'estimateUnit');if(!input||!Array.isArray(assumptions)||assumptions.some(item=>typeof item!=='string')||typeof source!=='string'||typeof unit!=='string'){fail('PUBLIC_TEXT_REQUIRED','見積の公開用仮定と出所を指定してください。',entity.id,field);return;}const scope=scopeValue(input.scope,entity,field);if(!scope)return;return {unit,assumptions:assumptions as string[],source,unknownCount:Number(input.unknownCount),scope,...input.value!=null?{value:Number(input.value)}:{},...input.range?{range:input.range as PublicValue}:{},...input.speed!=null?{speed:Number(input.speed)}:{}};}
      case 'parameters':{if(!Array.isArray(value))break;const approved=publicField(entity,'parameters');let names:unknown;try{names=typeof approved==='string'?JSON.parse(approved):undefined;}catch{}if(value.length&&!object(names)){fail('PUBLIC_TEXT_REQUIRED','公開用の引数名をkey→公開keyのJSON文章で指定してください。',entity.id,field);return;}const output:PublicValue[]=[];for(const raw of value){const input=object(raw),key=input&&own(object(names),String(input.key));if(!input||typeof key!=='string'||!/^[-_.a-zA-Z0-9]{1,128}$/.test(key)||!['boolean','integer','enum'].includes(String(input.type))){fail('PUBLIC_TEXT_REQUIRED','引数の公開名と型を確認してください。',entity.id,field);return;}const initial=input.default==null?undefined:typedValue(input.default,entity.id,entity,field);if(input.default!=null&&!initial)return;output.push({key,type:String(input.type),...initial?{default:initial}:{}});}return output;}
      case 'expression':return expressionValue(value,entity,field);
      case 'scope':return scopeValue(value,entity,field);
      case 'validity':return validityValue(value,entity,field);
      case 'exception':return exceptionValue(value,entity,field);
      case 'exceptions':{if(!Array.isArray(value))break;const mapped=value.map(item=>exceptionValue(item,entity,field));return mapped.every(item=>item!==undefined)?mapped as PublicValue[]:undefined;}
      case 'resets':{if(!Array.isArray(value))break;const output:PublicValue[]=[];for(const raw of value){const input=object(raw);if(!input||!['scene_end','chapter_end','run_end','new_loop','full_reset'].includes(String(input.on)))break;const mapped=typedValue(input.value,entity.id,entity,field);if(!mapped)return;output.push({on:String(input.on),value:mapped,reason:behaviorText(entity,'resetReason')});}if(output.length!==value.length)break;return output;}
      case 'exclusions':{if(!Array.isArray(value))break;const output:PublicValue[]=[];for(const raw of value){const input=object(raw);if(!input)return;const variableId=reference(input.variableId,entity,field,true),current=typedValue(input.value,entity.id,entity,field),other=typedValue(input.otherValue,String(input.variableId),entity,field),exceptions=input.exceptions==null?[]:Array.isArray(input.exceptions)?input.exceptions.map(item=>exceptionValue(item,entity,field)):undefined;if(!variableId||!current||!other||!exceptions||exceptions.some(item=>!item))return;const reason=behaviorText(entity,'exclusionReason');if(!reason.trim()){fail('PUBLIC_TEXT_REQUIRED','相互排他の公開用理由を指定してください。',entity.id,field);return;}output.push({variableId,value:current,otherValue:other,reason,exceptions:exceptions as PublicValue[]});}return output;}
      case 'alternatives':{const input=object(value);if(!input)break;const output:Record<string,PublicValue>={};for(const [key,ids] of Object.entries(input)){const id=reference(key,entity,field,true);if(!id||!Array.isArray(ids))return;const mapped=ids.map(item=>reference(item,entity,field,true));if(mapped.some(item=>!item))return;output[id]=mapped as string[];}return output;}
      case 'camera':{const approved=publicField(entity,field);let input:unknown;try{input=typeof approved==='string'?JSON.parse(approved):undefined;}catch{break;}const camera=object(input);if(!camera){fail('PUBLIC_TEXT_REQUIRED','公開用カメラ指定をJSON文章で指定してください。',entity.id,field);return;}const output:Record<string,PublicValue>={};for(const [key,item] of Object.entries(camera)){if(!['shot','angle','movement','durationMs'].includes(key)||!(typeof item==='string'||typeof item==='number'&&Number.isFinite(item)&&item>=0)){fail('EXPORT_UNSUPPORTED','カメラの指定項目を安全に表せません。',entity.id,field);return;}output[key]=item;}return output;}
      case 'ref': return reference(value, entity, field, BEHAVIOR_REFS.has(field));
      case 'refs': {
        if (!Array.isArray(value)) break;
        return value.map(id => reference(id, entity, field, options.strictReferences && BEHAVIOR_REFS.has(field))).filter((id): id is string => id !== undefined);
      }
      case 'number': if (typeof value === 'number' && Number.isFinite(value)) return value; break;
      case 'boolean': if (typeof value === 'boolean') return value; break;
      case 'enum': if (typeof value === 'string' && rule.values.includes(value)) return value; break;
      case 'condition': return conditionValue(value, entity, field);
      case 'typed': return typedValue(value, entity.kind === 'effect' && typeof entity.data.targetId === 'string' ? entity.data.targetId : entity.id, entity, field);
      case 'typeds': {
        if (!Array.isArray(value)) break;
        const output = value.map(item => typedValue(item, entity.id, entity, field));
        return output.every(item => item !== undefined) ? output as PublicValue[] : undefined;
      }
      case 'semver': if (typeof value === 'string' && /^(?:0|[1-9][0-9]*)\.(?:0|[1-9][0-9]*)\.(?:0|[1-9][0-9]*)$/.test(value)) return value; break;
      case 'allowed': {
        const input = object(value); if (!input) break;
        const output: Record<string, PublicValue> = {};
        if (input.min !== undefined || input.max !== undefined) { if (!integer(input.min) || !integer(input.max) || input.min > input.max) break; output.min = input.min; output.max = input.max; }
        if (Array.isArray(input.values)) {
          const values = input.values.map(item => typeof item === 'string' ? mapEnum(item, entity.id, entity, field) : typeof item === 'boolean' || integer(item) ? item : undefined);
          if (values.some(item => item === undefined)) break;
          if (new Set(values).size !== values.length) { fail('VALIDATION_FAILED', '公開列挙値が重複しています。', entity.id, field); return undefined; }
          output.values = values as PublicValue[];
        }
        return output;
      }
      case 'time': {
        const input = object(value); if (!input) break;
        const output: Record<string, PublicValue> = { mode: String(input.mode) };
        if (['instant', 'interval', 'uncertain'].includes(String(input.mode))) {
          const fields = input.mode === 'instant' ? ['at'] : input.mode === 'interval' ? ['start', 'end'] : ['earliest', 'latest'];
          for (const key of fields) { if (typeof input[key] !== 'string' || !TICK.test(input[key])) { fail('VALIDATION_FAILED', '世界日時のtickが不正です。', entity.id, field); return undefined; } output[key] = input[key]; }
          const calendarId = publicCalendarId(input.calendarId, entity, field); if (!calendarId) return undefined;
          output.calendarId = calendarId;
          if (input.mode === 'uncertain') output.precision = textValue(entity, 'precision') ?? '';
          return output;
        }
        if (input.mode === 'unknown') { const reason = publicField(entity, 'reason'); return { mode: 'unknown', reason: typeof reason === 'string' ? reason : '' }; }
        if (input.mode === 'relative') {
          const anchorEventId = reference(input.anchorEventId, entity, field, true);
          if (anchorEventId && ['start', 'end'].includes(String(input.anchorPoint)) && typeof input.minOffset === 'string' && TICK.test(input.minOffset) && typeof input.maxOffset === 'string' && TICK.test(input.maxOffset)) return { mode: 'relative', anchorEventId, anchorPoint: String(input.anchorPoint), minOffset: input.minOffset, maxOffset: input.maxOffset };
        }
        break;
      }
      case 'participants': {
        if (!Array.isArray(value)) break;
        const output: PublicValue[] = [];
        for (const raw of value) { const participant = object(raw); if (!participant) continue; const characterId = reference(participant.characterId, entity, field); if (!characterId) continue; if (!['actor', 'witness', 'mentioned', 'informed', 'custom'].includes(String(participant.role))) { fail('VALIDATION_FAILED', '参加役割が不正です。', entity.id, field); continue; } output.push({ characterId, role: String(participant.role) }); }
        return output;
      }
      case 'pins': {
        if (!Array.isArray(value)) break;
        const output: PublicValue[] = [];
        for (const raw of value) { const pin = object(raw); if (!pin) continue; const placeId = reference(pin.placeId, entity, field); if (!placeId) continue; if (typeof pin.x !== 'number' || typeof pin.y !== 'number' || pin.x < 0 || pin.x > 1 || pin.y < 0 || pin.y > 1) { fail('VALIDATION_FAILED', '地図座標が不正です。', entity.id, field); continue; } output.push({ placeId, x: pin.x, y: pin.y }); }
        return output;
      }
      case 'datetime': if(typeof value==='string'&&Number.isFinite(Date.parse(value)))return value;break;
      case 'version_ref': {const fixed=options.versionTargets?.[String(value)];if(!fixed){fail('EXPORT_UNSUPPORTED','媒体の元固定版の公開範囲を確認してください。',entity.id,field);return undefined;}return fixed.publicVersionId;}
      case 'anchor': return anchorValue(value, entity, field);
      case 'trigger': {
        const input = object(value); if (!input || !['enter', 'talk', 'battle_result', 'manual', 'custom'].includes(String(input.event)) || !['once', 'repeatable'].includes(String(input.repeat))) break;
        const eventKey = textValue(entity, 'eventKey');
        if (typeof input.eventKey === 'string' && input.eventKey && eventKey === undefined) { fail('PUBLIC_TEXT_REQUIRED', '外部イベント名の公開表記を指定してください。', entity.id, 'eventKey'); return undefined; }
        const deadline = input.deadline != null ? serialize({ ...entity, data: { ...entity.data, deadline: input.deadline } }, 'deadline', time) : undefined;
        if (input.deadline != null && deadline === undefined) return undefined;
        const output: Record<string, PublicValue> = { event: String(input.event), repeat: String(input.repeat), eventKey: eventKey ?? '' };
        if (typeof input.id === 'string' && idMap[input.id]) output.id = idMap[input.id];
        if (input.scope != null) { if (!['scene', 'chapter', 'character', 'run', 'across_runs'].includes(String(input.scope))) break; output.scope = String(input.scope); }
        if (deadline !== undefined) output.deadline = deadline;
        return output;
      }
      case 'transitions': {
        if (!Array.isArray(value)) break;
        const output: PublicValue[] = [];
        const variableId = entity.kind === 'quest' && typeof entity.data.stateVariableId === 'string' ? entity.data.stateVariableId : entity.id;
        for (const raw of value) {
          const transition = object(raw); if (!transition) { fail('VALIDATION_FAILED', '状態遷移の形が不正です。', entity.id, field); continue; }
          const from = typedValue(transition.from, variableId, entity, field), to = typedValue(transition.to, variableId, entity, field);
          const details=transition.exceptionDetails?exceptionValue(transition.exceptionDetails,entity,field):undefined;if(transition.exception===true&&!details){fail('EXPORT_UNSUPPORTED','理由・範囲・期限・根拠のある例外を公開範囲へ含めてください。',entity.id,field);continue;}
          if(from!==undefined&&to!==undefined)output.push({from,to,...(details?{exception:true,exceptionDetails:details}:{})});
        }
        return output;
      }
    }
    fail('EXPORT_UNSUPPORTED', 'この項目は対応先で安全に表せません。', entity.id, field);
    return undefined;
  };
  const entities: ProjectedEntity[] = [];
  for (const entity of selected) {
    const schema = PROJECTION_FIELDS[entity.kind]!;
    const explicit = own(allowedFields, entity.kind);
    const fields = Array.isArray(explicit) ? explicit : Object.keys(schema);
    const output: Record<string, PublicValue> = {};
    for (const field of fields) {
      if (typeof field !== 'string' || FORBIDDEN_FIELDS.has(field) || !hasOwn(schema, field)) { fail('FORBIDDEN', '許可されていない項目を公開しようとしています。', entity.id, String(field)); continue; }
      if (excludedFields.includes(field) || excludedFields.includes(`${entity.kind}.${field}`)) { omit(entity.id, '作者が項目を除外', field); continue; }
      const value = serialize(entity, field, schema[field]); if (value !== undefined) output[field] = value;
    }
    for (const field of Object.keys(entity.data)) if (!fields.includes(field) || !hasOwn(schema, field)) omit(entity.id, FORBIDDEN_FIELDS.has(field) ? '作者情報・秘密の項目を除外' : '公開を許可していない項目を除外', field);
    if (entity.kind === 'attachment') {
      const approved = Array.isArray(policy.approvedAttachmentIds) && policy.approvedAttachmentIds.includes(entity.id);
      const provenance = typeof entity.data.provenanceId === 'string' ? source.get(entity.data.provenanceId) : undefined;
      if (!approved || (provenance && provenance.data.redistributionAllowed !== true)) fail('FORBIDDEN', '添付の再配布許可を確認してください。', entity.id);
      const mediaType = entity.data.mediaType;
      if (typeof mediaType !== 'string' || !ASSET_TYPES[mediaType]) fail('EXPORT_UNSUPPORTED', 'この素材形式は公開出力に対応していません。', entity.id, 'mediaType');
      else { output.mediaType = mediaType; output.assetPath = `assets/${idMap[entity.id]}.${ASSET_TYPES[mediaType]}`; }
      if (typeof entity.data.contentHash !== 'string' || !/^[a-f0-9]{64}$/.test(entity.data.contentHash) || !integer(entity.data.byteSize) || entity.data.byteSize < 0) fail('VALIDATION_FAILED', '素材のhashとサイズが不正です。', entity.id);
      else { output.contentHash = entity.data.contentHash; output.byteSize = entity.data.byteSize; output.bytesIncluded = false; }
    }
    if (entity.kind === 'source' && entity.data.sourceType === 'web' && typeof output.locator === 'string') {
      try { const url = new URL(output.locator); if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) throw new Error(); } catch { fail('FORBIDDEN', '公開資料のURLは認証情報を含まないHTTP/HTTPSにしてください。', entity.id, 'locator'); }
    }
    entities.push({ id: idMap[entity.id], kind: entity.kind, name: names.get(entity.id)!, status: entity.status, data: output });
  }
  const relations: ProjectedRelation[] = [];
  const relationIds = Array.isArray(policy.allowedRelationIds) ? policy.allowedRelationIds : [];
  const relationSource = new Map(project.relations.map(relation => [relation.id, relation]));
  for (const rawId of relationIds) {
    if (typeof rawId !== 'string') { fail('VALIDATION_FAILED', '関係の公開IDが不正です。', profileId, 'allowedRelationIds'); continue; }
    const relation = relationSource.get(rawId);
    if (!relation || relation.projectId !== project.projectId) { fail('REFERENCE_INVALID', '作品内にない関係が公開範囲に含まれています。', rawId); continue; }
    if (!selectedIds.has(relation.fromId) || !selectedIds.has(relation.toId) || relation.status !== 'confirmed' || relation.deletedAt) { omit(rawId, '非公開の始点・終点、削除済みまたは未確定の関係'); continue; }
    const publicRelationType = own(object(own(publicTexts, rawId)), 'relationType');
    if (typeof publicRelationType !== 'string' || !publicRelationType) { fail('PUBLIC_TEXT_REQUIRED', '公開用の関係名を指定してください。', rawId, 'relationType'); continue; }
    addId(rawId);
    const validity=validityValue(relation.validity,{id:rawId,projectId:project.projectId,kind:'note',name:'',status:relation.status,data:{}},'validity');
    relations.push({ ...validity?{validity}:{},id: idMap[rawId], fromId: idMap[relation.fromId], toId: idMap[relation.toId], relationType: publicRelationType, direction: relation.direction, evidenceIds: relation.evidenceIds.filter(id => selectedIds.has(id)).map(id => idMap[id]) });
  }
  if (issues.length) return { ok: false, issues, omissions };
  const projection: PublicProjection = { format: 'scenario-projection', formatVersion: '1.0.0', title: title as string, mainStart:project.mainStart, calendars, entities, relations, searchIndex: [] };
  projection.searchIndex = buildProjectionSearchIndex(projection);
  return { ok: true, projection, omissions, idMap };
}

/** A scope can narrow an ID allowlist; it never adds an ID the author did not approve. */
function scopedEntityIds(source: Map<string, SourceRecord>, policy: ObjectValue, projectId: string, publicTexts: ObjectValue, fail: (code: ProjectionIssue['code'], message: string, entityId?: string, field?: string) => void): Set<string> | undefined {
  const scope = object(policy.routeScope);
  if (!scope) return undefined;
  if (scope.projectId !== projectId) { fail('REFERENCE_INVALID', '公開範囲が別の作品を参照しています。', undefined, 'routeScope'); return new Set(); }
  if (scope.routeCondition != null) { fail('EXPORT_UNSUPPORTED', '条件付き経路の安全な公開範囲は未対応です。IDまたは章・グラフで限定してください。', undefined, 'routeScope.routeCondition'); return new Set(); }
  if (scope.chapterId != null && scope.graphId != null) { fail('EXPORT_UNSUPPORTED', '章とグラフの範囲は一度に一つ選んでください。', undefined, 'routeScope'); return new Set(); }
  if (scope.chapterId == null && scope.graphId == null) return undefined;
  const rootId = scope.chapterId ?? scope.graphId;
  const root = typeof rootId === 'string' ? source.get(rootId) : undefined;
  if (!root || root.projectId !== projectId || root.kind !== (scope.chapterId != null ? 'chapter' : 'flow_graph') || root.deletedAt) { fail('REFERENCE_INVALID', '公開範囲の章またはグラフが見つかりません。', typeof rootId === 'string' ? rootId : undefined, 'routeScope'); return new Set(); }
  const approved = new Set(Array.isArray(policy.includedIds) ? policy.includedIds.filter((id): id is string => typeof id === 'string') : []);
  const narrative = new Set<string>();
  const scenes = new Set<string>();
  if (root.kind === 'chapter') {
    narrative.add(root.id);
    for (const entity of source.values()) if (entity.kind === 'scene' && (entity.data.chapterId === root.id || (Array.isArray(root.data.sceneIds) && root.data.sceneIds.includes(entity.id)))) scenes.add(entity.id);
  } else {
    const graphs: SourceRecord[] = [root], visitedGraphs = new Set<string>();
    while (graphs.length) {
      const graph = graphs.pop()!; if (visitedGraphs.has(graph.id)) continue;
      visitedGraphs.add(graph.id); narrative.add(graph.id);
      for (const value of [...Array.isArray(graph.data.nodeIds) ? graph.data.nodeIds : [], ...Array.isArray(graph.data.edgeIds) ? graph.data.edgeIds : []]) if (typeof value === 'string') narrative.add(value);
      for (const value of Array.isArray(graph.data.nodeIds) ? graph.data.nodeIds : []) {
        const node = typeof value === 'string' ? source.get(value) : undefined;
        if (!node || node.kind !== 'flow_node') continue;
        if (typeof node.data.sceneId === 'string') scenes.add(node.data.sceneId);
        const child = typeof node.data.childGraphId === 'string' ? source.get(node.data.childGraphId) : undefined;
        if (child?.kind === 'flow_graph' && approved.has(child.id)) graphs.push(child);
      }
    }
  }
  const eligible = (entity: SourceRecord): boolean => {
    if (entity.kind === 'scene') return scenes.has(entity.id);
    if (['flow_graph', 'flow_node', 'flow_edge'].includes(entity.kind)) return root.kind === 'flow_graph' && narrative.has(entity.id);
    if (entity.kind === 'chapter') return root.kind === 'chapter' ? entity.id === root.id : [...scenes].some(id => source.get(id)?.data.chapterId === entity.id);
    return true;
  };
  const result = new Set<string>(), queue = [...narrative, ...scenes];
  const enqueue = (value: unknown) => { if (typeof value === 'string' && approved.has(value)) queue.push(value); };
  const conditionRefs = (value: unknown, depth = 1) => {
    const ast = object(value); if (!ast || depth > 16) return;
    for (const field of ['variableId', 'itemId', 'assertionId', 'holderId', 'entityId', 'contractId']) enqueue(ast[field]);
    if (Array.isArray(ast.children)) ast.children.forEach(child => conditionRefs(child, depth + 1));
    if (ast.child) conditionRefs(ast.child, depth + 1);
  };
  while (queue.length) {
    const id = queue.pop()!;
    if (result.has(id) || !approved.has(id)) continue;
    const entity = source.get(id); if (!entity || !eligible(entity)) continue;
    result.add(id);
    for (const [field, rule] of Object.entries(PROJECTION_FIELDS[entity.kind] ?? {})) {
      if (field === 'parentId' || field === 'parentGraphId') continue;
      const value = entity.data[field];
      if (rule.type === 'ref') enqueue(value);
      else if (rule.type === 'refs' && Array.isArray(value)) value.forEach(enqueue);
      else if (rule.type === 'condition') conditionRefs(value);
      else if (rule.type === 'typed' && object(value)?.type === 'ref') enqueue(object(value)?.value);
      else if (rule.type === 'time') enqueue(object(value)?.anchorEventId);
      else if (rule.type === 'anchor') { enqueue(object(value)?.entityId); enqueue(object(value)?.lineId); }
      else if (rule.type === 'participants' && Array.isArray(value)) value.forEach(value => enqueue(object(value)?.characterId));
      else if (rule.type === 'pins' && Array.isArray(value)) value.forEach(value => enqueue(object(value)?.placeId));
      else if (rule.type === 'rich') {
        const document = own(object(own(publicTexts, entity.id)), field);
        if (Array.isArray(document)) for (const block of document) if (Array.isArray(object(block)?.links)) for (const link of object(block)!.links as unknown[]) {
          const target = object(object(link)?.target) ?? object(link);
          enqueue(target?.entityId ?? target?.targetId); enqueue(target?.lineId);
        }
      }
    }
  }
  return result;
}

function publicStrings(value: PublicValue): string[] {
  if (typeof value === 'string') return [value];
  if (Array.isArray(value)) return value.flatMap(publicStrings);
  if (value && typeof value === 'object') return Object.entries(value).filter(([key]) => ['text', 'reading', 'summary', 'body', 'description', 'label', 'canonical'].includes(key)).flatMap(([, child]) => publicStrings(child));
  return [];
}
export function buildProjectionSearchIndex(projection: Pick<PublicProjection, 'entities'>): ProjectionSearchEntry[] {
  return projection.entities.map(entity => {
    const text = [entity.name, ...publicStrings(entity.data)].join('\n');
    return { entityId: entity.id, kind: entity.kind, name: entity.name, text, normalized: text.normalize('NFKC').toLocaleLowerCase('ja') };
  });
}
/** Only accepts a projection. Searching the author project is a different operation. */
export function searchProjection(projection: PublicProjection, query: string): ProjectionSearchEntry[] {
  const normalized = query.normalize('NFKC').toLocaleLowerCase('ja').trim();
  return normalized ? projection.searchIndex.filter(entry => entry.normalized.includes(normalized)) : [];
}

export interface ProjectionSnapshot { id: string; sourceRevision: string; createdAt: string; immutable: true; contentHash: string; projection: PublicProjection }
export type DeepReadonly<T> = T extends readonly (infer V)[] ? readonly DeepReadonly<V>[] : T extends object ? { readonly [K in keyof T]: DeepReadonly<T[K]> } : T;
function freeze<T>(value: T): DeepReadonly<T> {
  if (value && typeof value === 'object') { for (const child of Object.values(value)) freeze(child); Object.freeze(value); }
  return value as DeepReadonly<T>;
}
/** Caller supplies identity/time. A released projection never aliases mutable author data. */
export async function createProjectionSnapshot(projection: PublicProjection, options: { id: string; sourceRevision: string; createdAt: string }): Promise<DeepReadonly<ProjectionSnapshot>> {
  if (!options.id || !/^(?:0|[1-9][0-9]*)$/.test(options.sourceRevision) || !Number.isFinite(Date.parse(options.createdAt))) throw new Error('VALIDATION_FAILED: snapshotのID・対象版・日時を指定してください。');
  const content = structuredClone(projection);
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(JSON.stringify(content)));
  const contentHash = [...new Uint8Array(digest)].map(value => value.toString(16).padStart(2, '0')).join('');
  return freeze({ ...options, immutable: true as const, contentHash, projection: content });
}
