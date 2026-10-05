import { resolveTime } from './time';
import { getEntitiesByKind } from './model';
import type { AuthorAlternative, AlternativeApplyReceipt, AlternativeVersion, StructurePlan, Entity, EntityKind, ID, ProjectData, ProjectSnapshot, ProjectContent, RichText, SceneData, Status } from './types';
export type { AuthorAlternative, AlternativeApplyReceipt, AlternativeVersion, StructurePlan } from './types';

export type StoryLaneAxis = 'character' | 'organization' | 'place' | 'chapter' | 'thread';
export type ArcOrder = 'presentation' | 'world';

export interface StoryLane {
  id: string;
  label: string;
  kind: EntityKind | 'unassigned';
  sceneIds: ID[];
  /** Describes why a canonical scene appears in this view; it is not saved as a new relation. */
  sceneRoles: Record<ID, string[]>;
}

export interface CharacterArcEntry {
  scene: Entity<'scene'>;
  chapterId: ID | null;
  presentationIndex: number;
  worldTicks: string[];
  before: { purpose: RichText | null; conflict: RichText | null };
  after: { change: RichText | null; newInformation: RichText | null };
  /** True when involvement comes from an event participant, rather than only POV or an evidence link. */
  evidencedInWorld: boolean;
}

export interface CharacterArc {
  character: Entity<'character'>;
  goals: Entity<'goal'>[];
  entries: CharacterArcEntry[];
  order: ArcOrder;
}

export interface TensionPoint {
  sceneId: ID;
  sceneName: string;
  value: number | null;
  importance: number | null;
  index: number;
}

export interface TensionProfile {
  points: TensionPoint[];
  measuredCount: number;
  missingCount: number;
  importanceMeasuredCount: number;
}

export interface ChapterReadingEntry {
  chapterId: ID | null;
  scene: Entity<'scene'>;
}

export interface StructureTemplate {
  id: string;
  name: string;
  description: string;
  beats: string[];
}

/** A user-authored structure plan saved with an alternative version. */
export const STRUCTURE_TEMPLATES: readonly StructureTemplate[] = [
  { id: 'three-part', name: '三部構成', description: '導入・展開・結末を並べる出発点です。', beats: ['導入', '展開', '結末'] },
  { id: 'kishotenketsu', name: '起承転結', description: '起・承・転・結の順で場面を見直す出発点です。', beats: ['起', '承', '転', '結'] },
  { id: 'five-beat', name: '五段階', description: '提示・発端・上昇・転換・帰結を並べる出発点です。', beats: ['提示', '発端', '上昇', '転換', '帰結'] },
];

export interface StructureOrderPreview {
  before: ID[];
  after: ID[];
  assignments: Array<{ beat: string; sceneId: ID }>;
  unassignedSceneIds: ID[];
}

function active<T extends Entity>(entities: readonly Entity[], kind: T['kind']): T[] {
  return entities.filter((entity): entity is T => entity.kind === kind && !entity.deletedAt && entity.status !== 'rejected');
}

/** Keep the native lazy-history capability attached to the original array identity. */
function editableProjectCopy(project: ProjectData): ProjectData {
  const { history: _history, ...content } = project;
  return { ...structuredClone(content), history: project.history };
}

export function orderedChapters(project: ProjectData): Entity<'chapter'>[] {
  return active<Entity<'chapter'>>(project.entities, 'chapter');
}

function canonicalPresentationScenes(project: ProjectData, chapterId?: ID, includeRejected = true): Entity<'scene'>[] {
  const chapters = project.entities.filter((entity): entity is Entity<'chapter'> => entity.kind === 'chapter' && !entity.deletedAt && (includeRejected || entity.status !== 'rejected'));
  const scenes = project.entities.filter((entity): entity is Entity<'scene'> => entity.kind === 'scene' && !entity.deletedAt && (includeRejected || entity.status !== 'rejected'));
  if (!includeRejected && chapterId && !chapters.some(chapter => chapter.id === chapterId)) return [];
  const byId = new Map(scenes.map(scene => [scene.id, scene]));
  const assigned = new Set<ID>();
  const selected: Entity<'scene'>[] = [];
  for (const chapter of chapters) {
    if (chapterId && chapter.id !== chapterId) continue;
    for (const sceneId of chapter.data.sceneIds) {
      const scene = byId.get(sceneId);
      if (scene && !assigned.has(scene.id)) { selected.push(scene); assigned.add(scene.id); }
    }
  }
  const remaining = scenes.filter(scene => !assigned.has(scene.id) && (chapterId ? scene.data.chapterId === chapterId : true));
  return [...selected, ...remaining];
}

export function orderedScenes(project: ProjectData, chapterId?: ID): Entity<'scene'>[] {
  return canonicalPresentationScenes(project, chapterId, false);
}

/** A read-through projection. An explicit path preserves its order and can revisit the same canonical scene. */
export function buildChapterReadingSequence(project: ProjectData, chapterIds?: readonly ID[], scenePath?: readonly ID[]): ChapterReadingEntry[] {
  const allScenes = new Map<ID, Entity<'scene'>>(project.entities.filter((entity): entity is Entity<'scene'> => entity.kind === 'scene').map(scene => [scene.id, scene]));
  const scenes = new Map<ID, Entity<'scene'>>(active<Entity<'scene'>>(project.entities, 'scene').map(scene => [scene.id, scene]));
  if (scenePath) return scenePath.map(sceneId => {
    const scene = scenes.get(sceneId);
    if (!scene) throw new Error(allScenes.get(sceneId)?.status === 'rejected' ? '明示した読み通し経路に不採用の場面があります。' : '明示した読み通し経路の場面が見つかりません。');
    return { chapterId: scene.data.chapterId ?? null, scene };
  });
  const chapters = orderedChapters(project);
  if (chapterIds?.some(id => !chapters.some(chapter => chapter.id === id))) throw new Error('選択した章が見つからないか、不採用です。');
  const chosen = new Set(chapterIds ?? chapters.map(chapter => chapter.id));
  const sequence: ChapterReadingEntry[] = [];
  const emitted = new Set<ID>();
  for (const chapter of chapters) if (chosen.has(chapter.id)) {
    for (const scene of orderedScenes(project, chapter.id)) if (!emitted.has(scene.id)) {
      sequence.push({ chapterId: chapter.id, scene }); emitted.add(scene.id);
    }
  }
  for (const scene of canonicalPresentationScenes(project, undefined, false)) {
    if (!emitted.has(scene.id) && (!scene.data.chapterId || chosen.has(scene.data.chapterId))) {
      sequence.push({ chapterId: scene.data.chapterId ?? null, scene }); emitted.add(scene.id);
    }
  }
  return sequence;
}

/** Presentation moves update only chapter membership/order, never event times or scene event links. */
export function moveScenePresentation(project: ProjectData, sceneId: ID, toChapterId: ID | null, targetIndex: number): ProjectData {
  const next = editableProjectCopy(project);
  const scene = next.entities.find((entity): entity is Entity<'scene'> => entity.id === sceneId && entity.kind === 'scene' && !entity.deletedAt);
  if (!scene) throw new Error('場面が見つかりません。');
  const destination = toChapterId ? next.entities.find((entity): entity is Entity<'chapter'> => entity.id === toChapterId && entity.kind === 'chapter' && !entity.deletedAt) : undefined;
  if (toChapterId && !destination) throw new Error('移動先の章が見つかりません。');

  for (const entity of next.entities) if (entity.kind === 'chapter') entity.data.sceneIds = entity.data.sceneIds.filter(id => id !== sceneId);
  if (destination) {
    const index = Math.max(0, Math.min(Math.trunc(targetIndex), destination.data.sceneIds.length));
    destination.data.sceneIds.splice(index, 0, sceneId);
    scene.data.chapterId = destination.id;
  } else scene.data.chapterId = null;
  return next;
}

export function moveSceneWithinPresentation(project: ProjectData, chapterId: ID, sceneId: ID, delta: -1 | 1): ProjectData {
  const chapter = project.entities.find((entity): entity is Entity<'chapter'> => entity.id === chapterId && entity.kind === 'chapter' && !entity.deletedAt);
  const index = chapter?.data.sceneIds.indexOf(sceneId) ?? -1;
  if (!chapter || index < 0) throw new Error('章内の場面を確認できません。');
  const nextIndex = index + delta;
  if (nextIndex < 0 || nextIndex >= chapter.data.sceneIds.length) return editableProjectCopy(project);
  const order = [...chapter.data.sceneIds]; [order[index], order[nextIndex]] = [order[nextIndex], order[index]];
  const next = editableProjectCopy(project), target = next.entities.find(entity => entity.id === chapterId && entity.kind === 'chapter');
  if (target?.kind === 'chapter') target.data.sceneIds = order;
  return next;
}

/** Chapter order follows canonical entity order so no world-time field is touched. */
export function moveChapterPresentation(project: ProjectData, chapterId: ID, delta: -1 | 1): ProjectData {
  const next = editableProjectCopy(project), positions = next.entities.flatMap((entity, index) => entity.kind === 'chapter' && !entity.deletedAt ? [index] : []);
  const chapterIndex = positions.findIndex(index => next.entities[index]?.id === chapterId);
  const targetIndex = chapterIndex + delta;
  if (chapterIndex < 0 || targetIndex < 0 || targetIndex >= positions.length) return next;
  const chapters = positions.map(index => next.entities[index]);
  [chapters[chapterIndex], chapters[targetIndex]] = [chapters[targetIndex], chapters[chapterIndex]];
  positions.forEach((position, index) => { next.entities[position] = chapters[index]!; });
  return next;
}

function presentationState(project: ProjectContent | ProjectData) {
  return {
    chapterOrder: project.entities.filter((entity): entity is Entity<'chapter'> => entity.kind === 'chapter' && !entity.deletedAt).map(chapter => chapter.id),
    chapters: project.entities.filter((entity): entity is Entity<'chapter'> => entity.kind === 'chapter' && !entity.deletedAt).map(chapter => ({ id: chapter.id, sceneIds: [...chapter.data.sceneIds] })),
    scenes: project.entities.filter((entity): entity is Entity<'scene'> => entity.kind === 'scene' && !entity.deletedAt).map(scene => ({ id: scene.id, chapterId: scene.data.chapterId ?? null })),
  };
}

function eventIdsForScene(scene: Entity<'scene'>, eventMap: Map<ID, Entity<'event'>>): Entity<'event'>[] {
  return scene.data.eventIds.flatMap(id => { const event = eventMap.get(id); return event ? [event] : []; });
}

export function buildStoryLanes(project: ProjectData, axis: StoryLaneAxis): StoryLane[] {
  const scenes = canonicalPresentationScenes(project, undefined, true), events = getEntitiesByKind(project, 'event');
  const eventMap = new Map(events.map(event => [event.id, event]));
  const characters = getEntitiesByKind(project, 'character'), groups = getEntitiesByKind(project, 'group');
  const places = getEntitiesByKind(project, 'place'), chapters = getEntitiesByKind(project, 'chapter');
  let lanes: StoryLane[];

  if (axis === 'chapter') lanes = chapters.map(chapter => ({ id: chapter.id, label: chapter.name || '名称未設定の章', kind: 'chapter', sceneIds: [], sceneRoles: {} }));
  else if (axis === 'thread') lanes = groups.filter(group => group.data.groupType === 'plot_thread').map(group => ({ id: group.id, label: group.name || '名称未設定の筋', kind: 'group', sceneIds: [], sceneRoles: {} }));
  else if (axis === 'organization') lanes = groups.filter(group => group.data.groupType === 'faction').map(group => ({ id: group.id, label: group.name || '名称未設定の組織', kind: 'group', sceneIds: [], sceneRoles: {} }));
  else if (axis === 'place') lanes = places.map(place => ({ id: place.id, label: place.name || '名称未設定の場所', kind: 'place', sceneIds: [], sceneRoles: {} }));
  else lanes = characters.map(character => ({ id: character.id, label: character.name || '名称未設定の人物', kind: 'character', sceneIds: [], sceneRoles: {} }));

  const laneById = new Map(lanes.map(lane => [lane.id, lane]));
  for (const scene of scenes) {
    const sceneEvents = eventIdsForScene(scene, eventMap);
    const destinations = new Map<ID, string[]>();
    if (axis === 'chapter') {
      const chapterIds = chapters.filter(chapter => chapter.data.sceneIds.includes(scene.id)).map(chapter => chapter.id);
      const preferred = scene.data.chapterId && laneById.has(scene.data.chapterId) ? scene.data.chapterId : chapterIds[0];
      if (preferred) destinations.set(preferred, ['章の提示順']);
    } else if (axis === 'thread') {
      for (const threadId of scene.data.threadIds ?? []) if (laneById.has(threadId)) destinations.set(threadId, ['この筋に含む場面']);
    } else if (axis === 'place') {
      for (const event of sceneEvents) if (event.data.locationId && laneById.has(event.data.locationId)) {
        const roles = destinations.get(event.data.locationId) ?? [];
        destinations.set(event.data.locationId, [...new Set([...roles, `出来事「${event.name || '名称未設定'}」の場所`])]);
      }
    } else if (axis === 'organization') {
      for (const event of sceneEvents) for (const participant of event.data.participants ?? []) {
        for (const group of groups) if (group.data.groupType === 'faction' && laneById.has(group.id) && (group.data.members ?? []).includes(participant.characterId)) {
          const roles = destinations.get(group.id) ?? [];
          destinations.set(group.id, [...new Set([...roles, `${participant.role === 'actor' ? '当事者' : participant.role === 'witness' ? '目撃者' : '参加人物'}を通じた出来事`])]);
        }
      }
    } else {
      if (scene.data.povId && laneById.has(scene.data.povId)) destinations.set(scene.data.povId, ['視点人物']);
      for (const event of sceneEvents) for (const participant of event.data.participants ?? []) if (laneById.has(participant.characterId)) {
        const roles = destinations.get(participant.characterId) ?? [];
        destinations.set(participant.characterId, [...new Set([...roles, `${event.name || '出来事'} · ${participant.role}`])]);
      }
    }
    for (const [laneId, roles] of destinations) {
      const lane = laneById.get(laneId);
      if (!lane) continue;
      lane.sceneIds.push(scene.id);
      lane.sceneRoles[scene.id] = roles;
    }
  }

  const assigned = new Set(lanes.flatMap(lane => lane.sceneIds));
  const unassigned = scenes.filter(scene => !assigned.has(scene.id));
  if (unassigned.length) lanes.push({ id: `unassigned:${axis}`, label: '未配置・関係未設定', kind: 'unassigned', sceneIds: unassigned.map(scene => scene.id), sceneRoles: Object.fromEntries(unassigned.map(scene => [scene.id, ['ここから関連付けを確認']])) });
  return lanes;
}

function sceneWorldTicks(scene: Entity<'scene'>, events: Entity<'event'>[]): string[] {
  const referenced = eventIdsForScene(scene, new Map(events.map(event => [event.id, event])));
  return referenced.flatMap(event => {
    const resolved = resolveTime(event.data.time, events, [event.id]);
    return resolved.status === 'resolved' ? [resolved.earliest] : [];
  }).sort((a, b) => BigInt(a) < BigInt(b) ? -1 : BigInt(a) > BigInt(b) ? 1 : 0);
}

export function buildCharacterArc(project: ProjectData, characterId: ID, order: ArcOrder = 'presentation'): CharacterArc | undefined {
  const character = project.entities.find((entity): entity is Entity<'character'> => entity.id === characterId && entity.kind === 'character' && !entity.deletedAt);
  if (!character) return undefined;
  const scenes = getEntitiesByKind(project, 'scene'), events = getEntitiesByKind(project, 'event');
  const goals = project.entities.filter((entity): entity is Entity<'goal'> => entity.kind === 'goal' && !entity.deletedAt && entity.data.ownerId === characterId);
  const eventIds = new Set(events.filter(event => (event.data.participants ?? []).some(participant => participant.characterId === characterId)).map(event => event.id));
  const evidenceSceneIds = new Set(goals.flatMap(goal => goal.data.evidenceSceneIds ?? []));
  const sceneIndex = new Map(orderedScenes(project).map((scene, index) => [scene.id, index]));
  const entries = scenes.filter(scene => scene.data.povId === characterId || scene.data.eventIds.some(id => eventIds.has(id)) || evidenceSceneIds.has(scene.id)).map(scene => {
    const worldTicks = sceneWorldTicks(scene, events);
    const eventParticipation = scene.data.eventIds.some(id => eventIds.has(id));
    return {
      scene,
      chapterId: scene.data.chapterId ?? null,
      presentationIndex: sceneIndex.get(scene.id) ?? Number.MAX_SAFE_INTEGER,
      worldTicks,
      before: { purpose: scene.data.goals ?? null, conflict: scene.data.conflicts ?? null },
      after: { change: scene.data.results ?? null, newInformation: scene.data.newInformation ?? null },
      evidencedInWorld: eventParticipation,
    };
  });
  entries.sort((a, b) => order === 'presentation'
    ? a.presentationIndex - b.presentationIndex || a.scene.name.localeCompare(b.scene.name)
    : compareWorldTimes(a.worldTicks, b.worldTicks) || a.presentationIndex - b.presentationIndex);
  return { character, goals, entries, order };
}

function compareWorldTimes(a: string[], b: string[]): number {
  if (a.length && b.length) return BigInt(a[0]!) < BigInt(b[0]!) ? -1 : BigInt(a[0]!) > BigInt(b[0]!) ? 1 : 0;
  if (a.length) return -1;
  if (b.length) return 1;
  return 0;
}

export function buildTensionProfile(project: ProjectData, sceneIds: readonly ID[]): TensionProfile {
  const byId = new Map(getEntitiesByKind(project, 'scene').map(scene => [scene.id, scene]));
  const points = sceneIds.flatMap((id, index) => {
    const scene = byId.get(id);
    return scene ? [{ sceneId: scene.id, sceneName: scene.name || '名称未設定の場面', value: typeof scene.data.tension === 'number' ? scene.data.tension : null, importance: typeof scene.data.importance === 'number' ? scene.data.importance : null, index }] : [];
  });
  return { points, measuredCount: points.filter(point => point.value !== null).length, missingCount: points.filter(point => point.value === null).length, importanceMeasuredCount: points.filter(point => point.importance !== null).length };
}

export function previewStructureOrder(template: StructureTemplate, chapter: Entity<'chapter'>, assignments: Readonly<Record<string, ID>>): StructureOrderPreview {
  const used = new Set<ID>(), rows: StructureOrderPreview['assignments'] = [];
  for (const beat of template.beats) {
    const sceneId = assignments[beat];
    if (sceneId && chapter.data.sceneIds.includes(sceneId) && !used.has(sceneId)) { rows.push({ beat, sceneId }); used.add(sceneId); }
  }
  const after = [...rows.map(row => row.sceneId), ...chapter.data.sceneIds.filter(id => !used.has(id))];
  return { before: [...chapter.data.sceneIds], after, assignments: rows, unassignedSceneIds: chapter.data.sceneIds.filter(id => !used.has(id)) };
}

export function applyStructureOrderPreview(project: ProjectData, chapterId: ID, preview: StructureOrderPreview): ProjectData {
  const next = editableProjectCopy(project), chapter = next.entities.find((entity): entity is Entity<'chapter'> => entity.id === chapterId && entity.kind === 'chapter');
  if (!chapter || JSON.stringify(chapter.data.sceneIds) !== JSON.stringify(preview.before)) throw new Error('章の提示順がプレビュー後に変わりました。差分を確認し直してください。');
  if (new Set(preview.after).size !== preview.after.length || preview.after.some(id => !chapter.data.sceneIds.includes(id))) throw new Error('雛形の順序にこの章以外の場面が含まれています。');
  chapter.data.sceneIds = [...preview.after];
  return next;
}

export function projectContent(project: ProjectData | ProjectContent): ProjectContent {
  const { history: _history, snapshots: _snapshots, ...rawContent } = project as ProjectData;
  const content = structuredClone(rawContent) as ProjectContent;
  // Alternatives belong at ProjectData level; branch content must stay non-recursive.
  delete (content as unknown as Record<string, unknown>).authorAlternatives;
  return content;
}

function contentAtSnapshot(project: ProjectData, snapshotId?: ID | null): ProjectContent {
  if (!snapshotId) return projectContent(project);
  const snapshot: ProjectSnapshot | undefined = project.snapshots.find(candidate => candidate.id === snapshotId);
  if (!snapshot || snapshot.content.projectId !== project.projectId) throw new Error('指定した公開版が見つかりません。');
  return projectContent(snapshot.content);
}

export function forkAuthorAlternative(project: ProjectData, name: string, options: { snapshotId?: ID | null; now?: string; id?: ID } = {}): AuthorAlternative {
  const cleanName = name.trim();
  if (!cleanName) throw new Error('別案の名前を入力してください。');
  const content = contentAtSnapshot(project, options.snapshotId);
  const now = options.now ?? new Date().toISOString(), id = options.id ?? globalThis.crypto.randomUUID();
  const version: AlternativeVersion = { id: globalThis.crypto.randomUUID(), parentVersionId: null, label: '分岐した時点', createdAt: now, content: structuredClone(content) };
  return { id, projectId: project.projectId, name: cleanName, status: 'active', baseRevision: content.revision, sourceSnapshotId: options.snapshotId ?? null, baseContent: structuredClone(content), versions: [version], headVersionId: version.id, applyReceipts: [], createdAt: now, updatedAt: now };
}

export function headAlternativeContent(alternative: AuthorAlternative): ProjectContent {
  const head = alternative.versions.find(version => version.id === alternative.headVersionId);
  if (!head) throw new Error('別案の現在版が見つかりません。');
  return structuredClone(head.content);
}

export function appendAlternativeVersion(alternative: AuthorAlternative, content: ProjectData | ProjectContent, label = '別案の編集', now: string = new Date().toISOString(), versionId: ID = globalThis.crypto.randomUUID(), structurePlan?: StructurePlan): AuthorAlternative {
  const normalized = projectContent(content);
  if (normalized.projectId !== alternative.projectId) throw new Error('別の作品の内容をこの別案へ保存できません。');
  if (!alternative.versions.some(version => version.id === alternative.headVersionId)) throw new Error('別案の現在版が見つかりません。');
  const version: AlternativeVersion = { id: versionId, parentVersionId: alternative.headVersionId, label: label.trim() || '別案の編集', createdAt: now, content: normalized,
    ...(structurePlan ? { structurePlan: structuredClone(structurePlan) } : {}) };
  return { ...structuredClone(alternative), versions: [...alternative.versions, version], headVersionId: version.id, updatedAt: now };
}

export function rollbackAlternativeHead(alternative: AuthorAlternative, versionId: ID, now = new Date().toISOString()): AuthorAlternative {
  const restored = alternative.versions.find(version => version.id === versionId);
  if (!restored) throw new Error('戻す別案の版が見つかりません。');
  return appendAlternativeVersion(alternative, restored.content, `「${restored.label}」から復元`, now, globalThis.crypto.randomUUID(), restored.structurePlan);
}

export interface AlternativeChange {
  key: string;
  scope: 'project' | 'entity' | 'relation' | 'presentation';
  itemId?: ID;
  path: string[];
  label: string;
  kind: 'add' | 'remove' | 'replace';
  baseValue: unknown;
  canonicalValue: unknown;
  alternativeValue: unknown;
  conflict: boolean;
}

function jsonEqual(a: unknown, b: unknown): boolean { return JSON.stringify(a) === JSON.stringify(b); }
function changeKey(scope: string, id: string | undefined, path: readonly string[]) { return [scope, id ?? '', ...path].map(part => encodeURIComponent(part)).join(':'); }

function fieldValue(scope: AlternativeChange['scope'], content: ProjectContent, itemId: ID | undefined, path: string[]): unknown {
  if (scope === 'presentation') return presentationState(content);
  if (scope === 'project') return path.reduce<unknown>((value, key) => value && typeof value === 'object' ? (value as Record<string, unknown>)[key] : undefined, content as unknown);
  const collection = scope === 'entity' ? content.entities : content.relations;
  const item = collection.find(candidate => candidate.id === itemId);
  if (!item) return undefined;
  return path.reduce<unknown>((value, key) => value && typeof value === 'object' ? (value as Record<string, unknown>)[key] : undefined, item as unknown);
}

function addValueChange(changes: AlternativeChange[], scope: AlternativeChange['scope'], itemId: ID | undefined, path: string[], label: string, baseValue: unknown, canonicalValue: unknown, alternativeValue: unknown) {
  if (jsonEqual(baseValue, alternativeValue) || jsonEqual(canonicalValue, alternativeValue)) return;
  const kind = baseValue === undefined ? 'add' : alternativeValue === undefined ? 'remove' : 'replace';
  changes.push({ key: changeKey(scope, itemId, path), scope, ...(itemId ? { itemId } : {}), path, label, kind, baseValue: structuredClone(baseValue), canonicalValue: structuredClone(canonicalValue), alternativeValue: structuredClone(alternativeValue), conflict: !jsonEqual(canonicalValue, baseValue) && !jsonEqual(canonicalValue, alternativeValue) });
}

function entityMap(content: ProjectContent) { return new Map(content.entities.map(entity => [entity.id, entity])); }

/** Diff only branch-authored changes; world dates stay independent from presentation ordering. */
export function diffAuthorAlternative(alternative: AuthorAlternative, canonical: ProjectData): AlternativeChange[] {
  if (canonical.projectId !== alternative.projectId) throw new Error('別の作品とは比較できません。');
  const base = alternative.baseContent, branch = headAlternativeContent(alternative), canonicalContent = projectContent(canonical);
  const changes: AlternativeChange[] = [];

  for (const key of ['name', 'calendarId', 'mainStart', 'calendars', 'worldReferences'] as const) {
    addValueChange(changes, 'project', undefined, [key], ({ name: '作品名', calendarId: '標準暦', mainStart: '本編開始時点', calendars: '暦の定義', worldReferences: '参照する世界版' } as Record<string, string>)[key], base[key], canonicalContent[key], branch[key]);
  }

  const baseEntities = entityMap(base), branchEntities = entityMap(branch), currentEntities = entityMap(canonicalContent);
  const skipEntityFields = new Set(['id', 'projectId', 'kind', 'revision', 'createdAt', 'updatedAt']);
  for (const id of new Set([...baseEntities.keys(), ...branchEntities.keys()])) {
    const before = baseEntities.get(id), after = branchEntities.get(id), current = currentEntities.get(id);
    if (!before || !after) {
      addValueChange(changes, 'entity', id, [], `${before?.name ?? after?.name ?? '情報'} · 情報全体`, before, current, after);
      continue;
    }
    const fields = new Set([...Object.keys(before), ...Object.keys(after)]);
    for (const field of fields) {
      if (skipEntityFields.has(field) || field === 'data' || field === 'customValues') continue;
      const baseValue = (before as unknown as Record<string, unknown>)[field], branchValue = (after as unknown as Record<string, unknown>)[field], currentValue = current && (current as unknown as Record<string, unknown>)[field];
      addValueChange(changes, 'entity', id, [field], `${after.name} · ${field}`, baseValue, currentValue, branchValue);
    }
    const beforeData = before.data as unknown as Record<string, unknown>, afterData = after.data as unknown as Record<string, unknown>, currentData = current?.data as unknown as Record<string, unknown> | undefined;
    for (const field of new Set([...Object.keys(beforeData), ...Object.keys(afterData)])) {
      if (before.kind === 'chapter' && field === 'sceneIds' || before.kind === 'scene' && field === 'chapterId') continue;
      addValueChange(changes, 'entity', id, ['data', field], `${after.name} · ${field}`, beforeData[field], currentData?.[field], afterData[field]);
    }
    const beforeCustom = before.customValues, afterCustom = after.customValues, currentCustom = current?.customValues;
    for (const key of new Set([...Object.keys(beforeCustom), ...Object.keys(afterCustom)])) addValueChange(changes, 'entity', id, ['customValues', key], `${after.name} · 独自項目 ${key}`, beforeCustom[key], currentCustom?.[key], afterCustom[key]);
  }

  const baseRelations = new Map(base.relations.map(relation => [relation.id, relation])), branchRelations = new Map(branch.relations.map(relation => [relation.id, relation])), currentRelations = new Map(canonicalContent.relations.map(relation => [relation.id, relation]));
  for (const id of new Set([...baseRelations.keys(), ...branchRelations.keys()])) {
    const before = baseRelations.get(id), after = branchRelations.get(id), current = currentRelations.get(id);
    if (!before || !after) { addValueChange(changes, 'relation', id, [], '関係 · 全体', before, current, after); continue; }
    for (const field of new Set([...Object.keys(before), ...Object.keys(after)])) {
      if (['id', 'projectId', 'revision'].includes(field)) continue;
      const baseValue = (before as unknown as Record<string, unknown>)[field], branchValue = (after as unknown as Record<string, unknown>)[field], currentValue = current && (current as unknown as Record<string, unknown>)[field];
      addValueChange(changes, 'relation', id, [field], `関係 ${before.fromId.slice(-6)} → ${before.toId.slice(-6)} · ${field}`, baseValue, currentValue, branchValue);
    }
  }

  const basePresentation = presentationState(base), branchPresentation = presentationState(branch), currentPresentation = presentationState(canonicalContent);
  if (!jsonEqual(basePresentation, branchPresentation) && !jsonEqual(currentPresentation, branchPresentation)) changes.push({
    key: changeKey('presentation', undefined, ['all']), scope: 'presentation', path: ['all'], label: '章と場面の提示順', kind: 'replace', baseValue: basePresentation, canonicalValue: currentPresentation, alternativeValue: branchPresentation, conflict: !jsonEqual(currentPresentation, basePresentation),
  });

  return changes.sort((a, b) => a.label.localeCompare(b.label) || a.key.localeCompare(b.key));
}

function setObjectPath<T extends object>(target: T, path: string[], value: unknown): T {
  const copy = structuredClone(target) as Record<string, unknown>;
  let cursor = copy;
  for (const segment of path.slice(0, -1)) {
    if (!cursor[segment] || typeof cursor[segment] !== 'object') cursor[segment] = {};
    cursor = cursor[segment] as Record<string, unknown>;
  }
  if (path.length) {
    if (value === undefined) delete cursor[path[path.length - 1]!];
    else cursor[path[path.length - 1]!] = structuredClone(value);
  }
  return copy as T;
}

function applyPresentationState(content: ProjectContent, state: ReturnType<typeof presentationState>): ProjectContent {
  const next = structuredClone(content);
  const chapterById = new Map(next.entities.filter((entity): entity is Entity<'chapter'> => entity.kind === 'chapter').map(chapter => [chapter.id, chapter]));
  for (const chapter of chapterById.values()) chapter.data.sceneIds = state.chapters.find(item => item.id === chapter.id)?.sceneIds.filter(id => next.entities.some(entity => entity.kind === 'scene' && entity.id === id)) ?? [];
  for (const entity of next.entities) if (entity.kind === 'scene') entity.data.chapterId = state.scenes.find(item => item.id === entity.id)?.chapterId ?? null;
  const desired = state.chapterOrder.flatMap(id => { const chapter = chapterById.get(id); return chapter ? [chapter] : []; });
  const chapterPositions = next.entities.flatMap((entity, index) => entity.kind === 'chapter' && !entity.deletedAt ? [index] : []);
  chapterPositions.forEach((position, index) => { if (desired[index]) next.entities[position] = desired[index]!; });
  return next;
}

function setContentValue(content: ProjectContent, change: AlternativeChange, value: unknown): ProjectContent {
  if (change.scope === 'presentation') return applyPresentationState(content, value as ReturnType<typeof presentationState>);
  if (change.scope === 'project') return setObjectPath(content, change.path, value);
  const field = change.scope === 'entity' ? 'entities' : 'relations';
  const values = [...content[field]] as Array<Entity | ProjectData['relations'][number]>;
  const index = values.findIndex(item => item.id === change.itemId);
  if (!change.path.length) {
    if (value === undefined) { if (index >= 0) values.splice(index, 1); }
    else if (index < 0) values.push(structuredClone(value) as Entity | ProjectData['relations'][number]);
    else values[index] = structuredClone(value) as Entity | ProjectData['relations'][number];
  } else if (index >= 0) values[index] = setObjectPath(values[index]!, change.path, value);
  else if (value !== undefined) throw new Error(`差分の対象が見つかりません: ${change.itemId}`);
  return { ...content, [field]: values } as ProjectContent;
}

export interface AlternativeApplyResult { project: ProjectData; receipt: AlternativeApplyReceipt }

export function applyAlternativeChanges(canonical: ProjectData, alternative: AuthorAlternative, _changes: readonly AlternativeChange[], selectedKeys: ReadonlySet<string>, now: string = new Date().toISOString(), receiptId: ID = globalThis.crypto.randomUUID()): AlternativeApplyResult {
  // The preview list is UI data and may be stale or tampered with. Rebuild the diff
  // against the exact canonical revision passed to the atomic commit path.
  const currentChanges = diffAuthorAlternative(alternative, canonical);
  if ([...selectedKeys].some(key => !currentChanges.some(change => change.key === key))) throw new Error('選択した差分は現在の別案・正本から確認できません。内容を比較し直してください。');
  const selected = currentChanges.filter(change => selectedKeys.has(change.key));
  if (!selected.length) throw new Error('採用する変更を選んでください。');
  if (selected.some(change => change.conflict)) throw new Error('分岐元の後に正本が更新された項目があります。競合を確認し、別案の最新内容へ取り込んでください。');
  let content = projectContent(canonical);
  const patches: AlternativeApplyReceipt['patches'] = [];
  for (const change of [...selected].sort((a, b) => (a.scope === 'presentation' ? 1 : 0) - (b.scope === 'presentation' ? 1 : 0))) {
    const before = fieldValue(change.scope, content, change.itemId, change.path);
    const after = change.alternativeValue;
    patches.push({ key: change.key, scope: change.scope, ...(change.itemId ? { itemId: change.itemId } : {}), path: [...change.path], label: change.label, before: before === undefined ? { present: false } : { present: true, value: structuredClone(before) }, after: after === undefined ? { present: false } : { present: true, value: structuredClone(after) } });
    content = setContentValue(content, change, change.alternativeValue);
  }
  if (content.projectId !== canonical.projectId) throw new Error('別案のprojectIdは変更できません。');
  const { history: _history, ...canonicalWithoutHistory } = canonical;
  const project = { ...structuredClone(canonicalWithoutHistory), ...content, snapshots: canonical.snapshots, history: canonical.history };
  return { project, receipt: { id: receiptId, createdAt: now, alternativeVersionId: alternative.headVersionId,
    sourceSnapshotId: alternative.sourceSnapshotId ?? null, selectedChangeKeys: [...selectedKeys].sort(), fromCanonicalRevision: canonical.revision, patches } };
}

export function rollbackAlternativeApplication(canonical: ProjectData, receipt: AlternativeApplyReceipt): ProjectData {
  let content = projectContent(canonical);
  // Roll back in the opposite order of adoption. In particular, presentation
  // snapshots can include entities added earlier in the receipt, so restore
  // presentation before removing those newly adopted entities.
  for (const patch of [...receipt.patches].reverse()) {
    const change: AlternativeChange = { ...patch, baseValue: patch.before.value, canonicalValue: patch.before.value, alternativeValue: patch.after.value, kind: 'replace', conflict: false };
    const current = fieldValue(change.scope, content, change.itemId, change.path);
    const expected = patch.after.present ? patch.after.value : undefined;
    if (!jsonEqual(current, expected)) throw new Error(`適用後に同じ項目が変更されています。上書きせず取消を中止しました: ${change.label}`);
    content = setContentValue(content, change, patch.before.present ? patch.before.value : undefined);
  }
  const { history: _history, ...canonicalWithoutHistory } = canonical;
  return { ...structuredClone(canonicalWithoutHistory), ...content, snapshots: canonical.snapshots, history: canonical.history };
}

export function recordAlternativeApplication(alternative: AuthorAlternative, receipt: AlternativeApplyReceipt, savedRevision: string): AuthorAlternative {
  const savedReceipt: AlternativeApplyReceipt = { ...structuredClone(receipt), appliedRevision: savedRevision };
  return { ...structuredClone(alternative), applyReceipts: [...alternative.applyReceipts, savedReceipt], updatedAt: receipt.createdAt };
}

export const WRITING_STATUS_LABELS: Record<Status, string> = { confirmed: '確定', provisional: '仮', needs_review: '要確認', rejected: '没', alternate: '別案' };
