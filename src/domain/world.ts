import type { Alias, Condition, Entity, ID, NamePolicyMap, ProjectContent, ProjectData, ProjectSnapshot, RuntimeContext, Tick, TruthValue, TypedValue, Validity, WorldReference } from './types';
import { collectReferences, collectRelationReferences, createEntity, emptyRuntimeState, newId } from './model';
import { immutableReferenceVersion } from './maintenance';
import { evaluateCondition } from './conditions';
import { compareTicks, isTick, parseTick, sameCalendarDefinition } from './time';
import { equalJson, jsonBytes, sha256 } from '../storage/json';

/** These predicates are authored explicitly by the world-history form, never guessed from prose. */
export const WORLD_PREDICATES = {
  location: 'location', ownership: 'owner', membership: 'member_of', displayName: 'display_name',
  placeState: 'place_state', control: 'controlled_by', identity: 'identity', appearance: 'appearance_exception',
} as const;
export const WORLD_PREDICATE_LABELS: Record<string, string> = { location: '現在地', owner: '所有者', member_of: '所属', display_name: '場所の名称', place_state: '破壊・再建などの状態', controlled_by: '支配組織', identity: '正体', appearance_exception: '回想・記録・復活などの意図' };
export interface WorldPoint { at?: Tick | null; context?: RuntimeContext; presentationIds?: ID[] }
export interface ValidityAssessment { value: TruthValue; reasons: string[] }
function combine(values: TruthValue[]): TruthValue { return values.includes('false') ? 'false' : values.includes('unknown') ? 'unknown' : 'true'; }
function hasRuntimeInput(condition: Condition): boolean {
  if (condition.op === 'constant') return false;
  if (condition.op === 'not') return hasRuntimeInput(condition.child);
  if (condition.op === 'all' || condition.op === 'any') return condition.children.some(hasRuntimeInput);
  return true;
}
/** Half-open world periods and three-valued route/presentation assessment used by all RB03 views. */
export function assessWorldValidity(validity: Validity | null | undefined, point: WorldPoint = {}): ValidityAssessment {
  if (!validity) return { value: 'true', reasons: [] };
  const values: TruthValue[] = [], reasons: string[] = [];
  if (validity.worldRange && (validity.worldRange.start !== null || validity.worldRange.end !== null)) {
    if (!point.at || !isTick(point.at)) { values.push('unknown'); reasons.push('世界時点が未選択です。'); }
    else { const range = validity.worldRange; values.push(range.start && compareTicks(point.at, range.start) < 0 || range.end && compareTicks(point.at, range.end) >= 0 ? 'false' : 'true'); }
  }
  if (validity.routeCondition) {
    if (!point.context && hasRuntimeInput(validity.routeCondition)) { values.push('unknown'); reasons.push('経路・状態の値が未選択です。'); }
    else try { const result = evaluateCondition(validity.routeCondition, point.context ?? { state: emptyRuntimeState('world-view') }); values.push(result.value); reasons.push(...result.reasons); }
    catch (error) { values.push('unknown'); reasons.push(error instanceof Error ? error.message : '経路条件を確認できません。'); }
  }
  if (validity.presentationAnchor) {
    if (!point.presentationIds) { values.push('unknown'); reasons.push('提示位置が未選択です。'); }
    else values.push(point.presentationIds.includes(validity.presentationAnchor.entityId) ? 'true' : 'false');
  }
  return { value: combine(values), reasons: [...new Set(reasons)] };
}

export function assertionReference(value: TypedValue | ID): ID | undefined { return typeof value === 'string' ? value : value.type === 'ref' ? value.value : undefined; }
export function assertionValueLabel(value: TypedValue | ID, index: Map<ID, Entity>): string {
  const reference = assertionReference(value);
  if (reference) return index.get(reference)?.name || '参照先未確認';
  return typeof value !== 'string' && value.type === 'unknown' ? `不明 · ${value.reason}` : typeof value !== 'string' ? String(value.value) : value;
}
export interface WorldStateCandidate { assertion: Entity<'assertion'>; assessment: ValidityAssessment; targetId?: ID }
export interface WorldStateResult { candidates: WorldStateCandidate[]; definite: WorldStateCandidate[]; status: 'known' | 'multiple' | 'possible' | 'unknown'; reason?: string }
function assessStateCandidates(assertions: Entity<'assertion'>[], point: WorldPoint, holderId?: ID): WorldStateResult {
  const candidates = assertions.filter(entity => holderId ? entity.data.truthKind !== 'author_truth' && entity.data.holderId === holderId : entity.data.truthKind === 'author_truth').map(assertion => ({ assertion, assessment: assessWorldValidity(assertion.data.validity, point), targetId: assertionReference(assertion.data.value) })).filter(candidate => candidate.assessment.value !== 'false');
  const definite = candidates.filter(candidate => candidate.assessment.value === 'true');
  const unique = new Set(definite.map(candidate => candidate.targetId ? `ref:${candidate.targetId}` : JSON.stringify(candidate.assertion.data.value)));
  return { candidates, definite, status: !candidates.length ? 'unknown' : unique.size > 1 ? 'multiple' : candidates.some(candidate => candidate.assessment.value === 'unknown') ? 'possible' : 'known', ...(!candidates.length ? { reason: 'この時点・経路の情報は登録されていません。' } : {}) };
}
/** Testimony/beliefs remain separate from author truth unless an explicit holder is requested. */
export function worldStateCandidates(project: Pick<ProjectContent, 'entities'>, subjectId: ID, predicate: string, point: WorldPoint = {}, holderId?: ID): WorldStateResult {
  return assessStateCandidates(project.entities.filter((entity): entity is Entity<'assertion'> => entity.kind === 'assertion' && !entity.deletedAt && entity.data.subjectId === subjectId && entity.data.predicate === predicate), point, holderId);
}
/** Index once for maps/history lists instead of repeatedly scanning an 88,000-record world. */
export function createWorldAssessment(project: Pick<ProjectContent, 'entities'>, point: WorldPoint = {}) {
  const index = new Map<string, Entity<'assertion'>[]>(), cache = new Map<string, WorldStateResult>();
  for (const entity of project.entities) if (entity.kind === 'assertion' && !entity.deletedAt) { const key = `${entity.data.subjectId}:${entity.data.predicate}`, entries = index.get(key) ?? []; entries.push(entity); index.set(key, entries); }
  return { stateCandidates(subjectId: ID, predicate: string, holderId?: ID, selectedPoint: WorldPoint = point): WorldStateResult { const key = `${subjectId}:${predicate}:${holderId ?? ''}`, previous = selectedPoint === point ? cache.get(key) : undefined; if (previous) return previous; const result = assessStateCandidates(index.get(`${subjectId}:${predicate}`) ?? [], selectedPoint, holderId); if (selectedPoint === point) cache.set(key, result); return result; } };
}

export interface DisplayNameAssessment { name: string; candidates: Alias[]; status: 'known' | 'multiple' | 'unknown'; reasons: string[] }
/** Reader labels never fall back to the author's real name or reveal a count of withheld aliases. */
export function worldDisplayName(entity: Entity, point: WorldPoint & { holderId?: ID; publicOnly?: boolean } = {}): DisplayNameAssessment {
  if (!point.holderId && !point.publicOnly) return { name: entity.name, candidates: [], status: 'known', reasons: [] };
  const aliases = 'aliases' in entity.data ? entity.data.aliases ?? [] : [];
  const allowed = aliases.filter(alias => point.publicOnly ? alias.isPublicDefault && alias.audienceHolderIds.length === 0 : alias.isPublicDefault && alias.audienceHolderIds.length === 0 || !!point.holderId && alias.audienceHolderIds.includes(point.holderId));
  const active = allowed.filter(alias => assessWorldValidity(alias.validity, point).value === 'true');
  const names = [...new Set(active.map(alias => alias.text))];
  return names.length === 1 ? { name: names[0], candidates: active, status: 'known', reasons: [] } : names.length > 1 ? { name: '表示名を選択してください', candidates: active, status: 'multiple', reasons: ['この時点と認識者で複数の表示名が有効です。'] } : { name: '公開名未選択', candidates: [], status: 'unknown', reasons: ['公開する名前を作者が指定してください。'] };
}
/** The canonical projection remains responsible for secret stripping; this only authors its policy. */
export function setPublicAliasPolicy(profile: Entity<'projection_profile'>, targetId: ID, aliasId: ID): Entity<'projection_profile'> {
  const current = profile.data.namePolicy;
  const policy: NamePolicyMap = 'mode' in current ? { defaultPolicy: current, byEntityId: {} } : { ...current, byEntityId: { ...current.byEntityId } };
  return { ...profile, data: { ...profile.data, namePolicy: { ...policy, byEntityId: { ...policy.byEntityId, [targetId]: { mode: 'alias', aliasId } } } } };
}

function pinnedKey(reference: WorldReference): string { return JSON.stringify([reference.projectId, reference.immutableSnapshotId, reference.contentHash]); }
function pinnedSnapshotIndex(worlds: ProjectData[]): Map<string, ProjectSnapshot> {
  const index = new Map<string, ProjectSnapshot>();
  for (const world of worlds) for (const snapshot of world.snapshots) if (snapshot.content.projectId === world.projectId) {
    const key = pinnedKey({ projectId: world.projectId, immutableSnapshotId: snapshot.id, contentHash: snapshot.contentHash });
    if (!index.has(key)) index.set(key, snapshot);
  }
  return index;
}
/** Resolve the exact immutable version across drafts and separately stored registry envelopes. */
export function findPinnedWorldSnapshot(worlds: ProjectData[], reference: WorldReference): ProjectSnapshot | undefined {
  return pinnedSnapshotIndex(worlds).get(pinnedKey(reference));
}
function pinnedClosure(references: WorldReference[], index: Map<string, ProjectSnapshot>): { snapshots: ProjectSnapshot[]; missing: WorldReference[] } {
  const snapshots: ProjectSnapshot[] = [], missing: WorldReference[] = [], seen = new Set<string>(), queue = [...references];
  for (let cursor = 0; cursor < queue.length; cursor++) {
    const reference = queue[cursor], key = pinnedKey(reference); if (seen.has(key)) continue; seen.add(key);
    const snapshot = index.get(key); if (!snapshot) { missing.push(reference); continue; }
    snapshots.push(snapshot); queue.push(...snapshot.content.worldReferences);
  }
  return { snapshots, missing };
}
function mergePinnedContent(project: ProjectContent, snapshots: ProjectSnapshot[]): ProjectContent {
  const entities = [...project.entities], relations = [...project.relations], calendars = [...project.calendars];
  const seenEntities = new Set(entities.map(entity => entity.id)), seenRelations = new Set(relations.map(relation => relation.id)), seenCalendars = new Set(calendars.map(calendar => calendar.id));
  for (const snapshot of snapshots) {
    for (const entity of snapshot.content.entities) if (!seenEntities.has(entity.id)) { entities.push(entity); seenEntities.add(entity.id); }
    for (const relation of snapshot.content.relations) if (!seenRelations.has(relation.id)) { relations.push(relation); seenRelations.add(relation.id); }
    for (const calendar of snapshot.content.calendars) if (!seenCalendars.has(calendar.id)) { calendars.push(calendar); seenCalendars.add(calendar.id); }
  }
  return { ...project, entities, relations, calendars };
}
/** Follow frozen references transitively. Current editing drafts never replace pinned content. */
export function effectiveWorldContent(project: ProjectData, worlds: ProjectData[]): ProjectContent {
  const { history: _history, snapshots: _snapshots, ...content } = project;
  return mergePinnedContent(content, pinnedClosure(project.worldReferences, pinnedSnapshotIndex(worlds)).snapshots);
}

export interface WorldVersionDifference { id: ID; kind: 'entity' | 'relation' | 'calendar'; change: 'added' | 'changed' | 'removed'; before?: unknown; after?: unknown; beforeSnapshotId?: ID; afterSnapshotId?: ID }
export interface WorldVersionPreview { candidate: ProjectData; reference: WorldReference; differences: WorldVersionDifference[]; affectedIds: ID[]; brokenReferenceIds: ID[]; canApply: boolean }
export async function previewWorldVersion(project: ProjectData, world: ProjectData, snapshotId: ID, adoptedIds: ID[] = [], worlds: ProjectData[] = []): Promise<WorldVersionPreview> {
  if (world.projectId === project.projectId) throw new Error('作品自身を共通世界として参照できません。');
  const sources = [world, ...worlds], index = pinnedSnapshotIndex(sources), next = sources.filter(source => source.projectId === world.projectId).flatMap(source => source.snapshots).find(snapshot => snapshot.id === snapshotId);
  if (!next || next.content.projectId !== world.projectId || await sha256(jsonBytes(next.content)) !== next.contentHash) throw new Error('選択した共通世界版が存在しないか、内容のhashが一致しません。');
  const current = project.worldReferences.find(reference => reference.projectId === world.projectId), previous = current ? index.get(pinnedKey(current)) : undefined;
  if (current && !previous) throw new Error('現在固定している共通世界版がありません。改訂差分を確認するため、旧版を保持してください。');
  if (previous && await sha256(jsonBytes(previous.content)) !== previous.contentHash) throw new Error('旧世界版の内容のhashが一致しません。差分を確定できません。');
  const previousClosure = pinnedClosure(previous?.content.worldReferences ?? [], index), nextClosure = pinnedClosure(next.content.worldReferences, index);
  if (previousClosure.missing.length || nextClosure.missing.length) throw new Error('共通世界が固定して参照する別の世界版がありません。改訂差分を確認するため、すべての固定版を保持してください。');
  for (const snapshot of [...previousClosure.snapshots, ...nextClosure.snapshots]) if (await sha256(jsonBytes(snapshot.content)) !== snapshot.contentHash) throw new Error('参照先の固定世界版の内容のhashが一致しません。');
  const calendarDefinitions = new Map(project.calendars.map(calendar => [calendar.id, calendar]));
  for (const snapshot of [next, ...nextClosure.snapshots]) for (const calendar of snapshot.content.calendars) { const existing = calendarDefinitions.get(calendar.id); if (existing && !sameCalendarDefinition(existing, calendar)) throw new Error(`同じ暦ID「${calendar.id}」に異なる規則があります。作品と固定世界の暦ID・規則を確認してください。`); calendarDefinitions.set(calendar.id, calendar); }
  const beforeContent = previous ? mergePinnedContent(previous.content, previousClosure.snapshots) : undefined, afterContent = mergePinnedContent(next.content, nextClosure.snapshots);
  const versionIds = (snapshots: ProjectSnapshot[]) => { const versions = new Map<string, ID>(); for (const snapshot of snapshots) for (const [kind, records] of [['entity', snapshot.content.entities], ['relation', snapshot.content.relations], ['calendar', snapshot.content.calendars]] as const) for (const record of records) if (!versions.has(`${kind}:${record.id}`)) versions.set(`${kind}:${record.id}`, snapshot.id); return versions; };
  const beforeVersions = versionIds(previous ? [previous, ...previousClosure.snapshots] : []), afterVersions = versionIds([next, ...nextClosure.snapshots]);
  const differences: WorldVersionDifference[] = [];
  for (const [kind, before, after] of [['entity', beforeContent?.entities ?? [], afterContent.entities], ['relation', beforeContent?.relations ?? [], afterContent.relations], ['calendar', beforeContent?.calendars ?? [], afterContent.calendars]] as const) {
    const a = new Map<string, unknown>(before.filter(value => !('deletedAt' in value) || !value.deletedAt).map(value => [value.id, value])), b = new Map<string, unknown>(after.filter(value => !('deletedAt' in value) || !value.deletedAt).map(value => [value.id, value]));
    for (const [id, value] of b) if (!a.has(id) || !equalJson(a.get(id), value)) differences.push({ id, kind, change: a.has(id) ? 'changed' : 'added', before: a.get(id), after: value, beforeSnapshotId: beforeVersions.get(`${kind}:${id}`), afterSnapshotId: afterVersions.get(`${kind}:${id}`) });
    for (const [id, value] of a) if (!b.has(id)) differences.push({ id, kind, change: 'removed', before: value, beforeSnapshotId: beforeVersions.get(`${kind}:${id}`) });
  }
  const changed = new Set(differences.map(difference => difference.id)), removed = new Set(differences.filter(difference => difference.change === 'removed').map(difference => difference.id)), affectedIds = new Set<ID>(), broken = new Set<ID>();
  for (const entity of project.entities) if (!entity.deletedAt) for (const reference of collectReferences(entity)) {
    if (immutableReferenceVersion(entity, reference)) continue;
    if (changed.has(reference.id)) affectedIds.add(entity.id);
    if (removed.has(reference.id)) broken.add(entity.id);
  }
  for (const relation of project.relations) if (!relation.deletedAt) for (const reference of collectRelationReferences(relation)) { if (immutableReferenceVersion(relation, reference)) continue; if (changed.has(reference.id)) affectedIds.add(relation.id); if (removed.has(reference.id)) broken.add(relation.id); }
  const ids = new Set(next.content.entities.filter(entity => !entity.deletedAt).map(entity => entity.id));
  if (adoptedIds.some(id => !ids.has(id))) throw new Error('採用する設定・人物は選択した世界版から選んでください。');
  const reference: WorldReference = { projectId: world.projectId, immutableSnapshotId: next.id, contentHash: next.contentHash };
  const viewKey = `world-adoption:${world.projectId}`, existingView = project.views.find(view => view.view === viewKey);
  const adoption = { id: existingView?.id ?? newId(), name: `${world.name}の採用設定`, view: viewKey, entityIds: [...new Set(adoptedIds)], settings: { worldProjectId: world.projectId, snapshotId: next.id } };
  const candidate = { ...project, worldReferences: [...project.worldReferences.filter(item => item.projectId !== world.projectId), reference], views: existingView ? project.views.map(view => view.id === existingView.id ? adoption : view) : [...project.views, adoption] };
  for (const view of candidate.views) for (const id of view.entityIds) { if (changed.has(id)) affectedIds.add(view.id); if (removed.has(id)) broken.add(view.id); }
  return { candidate, reference, differences, affectedIds: [...affectedIds], brokenReferenceIds: [...broken], canApply: broken.size === 0 };
}
export async function createWorldSnapshot(project: ProjectData, label: string): Promise<ProjectData> {
  const { history: _history, snapshots: _snapshots, ...content } = structuredClone(project);
  const id = newId(), contentHash = await sha256(jsonBytes(content)), versionLabel = label.trim() || `世界版 ${project.revision}`;
  const snapshot: ProjectSnapshot = { id, contentHash, versionLabel, createdAt: new Date().toISOString(), content };
  const metadata = { ...createEntity(project.projectId, 'snapshot', versionLabel, { versionLabel, contentHash, immutable: true }), id };
  return { ...project, snapshots: [...project.snapshots, snapshot], entities: [...project.entities, metadata] };
}

/** A place and one of its containing areas describe compatible locations. */
export function compatibleLocations(a: ID, b: ID, index: Map<ID, Entity>): boolean {
  const contains = (child: ID, parent: ID) => { const visited = new Set<ID>(); let current: ID | undefined = child; while (current && !visited.has(current)) { if (current === parent) return true; visited.add(current); const entity = index.get(current); current = entity?.kind === 'place' ? entity.data.parentId ?? undefined : undefined; } return false; };
  return contains(a, b) || contains(b, a);
}
export function worldPeriodsOverlap(a: Validity | null | undefined, b: Validity | null | undefined): boolean {
  const x = a?.worldRange, y = b?.worldRange;
  return !(x?.end && y?.start && parseTick(x.end) <= parseTick(y.start) || y?.end && x?.start && parseTick(y.end) <= parseTick(x.start));
}
