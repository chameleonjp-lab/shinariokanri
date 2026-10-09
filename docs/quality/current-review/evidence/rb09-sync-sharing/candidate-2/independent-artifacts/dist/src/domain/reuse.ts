import type { ContentAnchor, Entity, ID, ProjectContent, ProjectData, ProjectSnapshot, Reuse, RuntimeContext, ValidationIssue } from './types';
import { collectReferences, newId, rewriteEntityReferences } from './model';
import { adoptedRecord } from './adoption';
import { canonicalJson, jsonBytes, sha256 } from '../storage/json';

type Reusable = Entity<'scene'> | Entity<'flow_node'>;
export interface ReuseOrigin { entityId: ID; sourceVersionId: ID; ownerId: ID; bindings: Record<ID, ID>; graphId?: ID; chapterId?: ID }
const origins = new WeakMap<ProjectContent, Map<ID, ReuseOrigin>>(), canonical = new WeakMap<ProjectContent, ProjectContent>();
export const reuseOrigin = (project: ProjectContent, id: ID) => origins.get(project)?.get(id);
export const reuseAuthorContent = <T extends ProjectContent>(project: T): T => (canonical.get(project) ?? project) as T;
const reusable = (entity: Entity): entity is Reusable => entity.kind === 'scene' || entity.kind === 'flow_node';
function fixedReferenceVersion(record: Entity, path: string): ID | undefined {
  let current: unknown = record;
  for (const key of path.replace(/\[(\d+)\]/g, '.$1').split('.')) {
    if (!current || typeof current !== 'object') return;
    if ('sourceVersionId' in current && typeof current.sourceVersionId === 'string') return current.sourceVersionId;
    current = (current as Record<string, unknown>)[key];
  }
}
function fail(message: string): never { throw Object.assign(new Error(`REFERENCE_INVALID: ${message}`), { issues: [{ code: 'REFERENCE_INVALID', path: 'reuse', message }] }); }
function ownedContentIds(value: unknown): ID[] {
  if (Array.isArray(value)) return value.flatMap(ownedContentIds);
  if (!value || typeof value !== 'object') return [];
  const record = value as Record<string, unknown>;
  const own = typeof record.id === 'string' && ('text' in record && 'kind' in record || 'audienceHolderIds' in record || 'eventKey' in record || 'x' in record && 'y' in record) ? [record.id] : [];
  return [...own, ...Object.values(record).flatMap(ownedContentIds)];
}
function moduleRecords(content: ProjectContent, sourceId: ID, versionId?: ID): Entity[] {
  const byId = new Map(content.entities.filter(adoptedRecord).map(entity => [entity.id, entity]));
  const blocks = new Map(content.entities.flatMap(entity => ownedContentIds(entity.data).map(id => [id, entity.id] as const)));
  const disclosures = new Map<ID, Entity<'disclosure'>[]>();
  for (const entity of byId.values()) if (entity.kind === 'disclosure') disclosures.set(entity.data.anchor.entityId, [...(disclosures.get(entity.data.anchor.entityId) ?? []), entity]);
  const queue = [sourceId], visited = new Set<ID>(), result: Entity[] = [];
  for (let offset = 0; offset < queue.length; offset++) {
    const id = queue[offset]; if (visited.has(id)) continue; visited.add(id);
    const record = byId.get(id); if (!record) fail('共通元の依存情報が存在しないか、不採用です。'); result.push(record);
    for (const disclosure of disclosures.get(id) ?? []) queue.push(disclosure.id);
    for (const reference of collectReferences(record)) {
      // Ownership belongs to the use site; a scene reference does not clone its parent chapter.
      if (record.kind === 'scene' && reference.path === 'data.chapterId') continue;
      if (fixedReferenceVersion(record, reference.path)) continue;
      if (!['entity', 'record', 'presentation', 'block'].includes(reference.scope)) continue;
      const dependency = byId.has(reference.id) ? reference.id : blocks.get(reference.id);
      if (dependency) queue.push(dependency);
    }
    if (result.length > 100000) fail('共通元の依存情報が100,000件を超えています。');
  }
  return result;
}
const idsOf = (records: Entity[]) => [...new Set(records.flatMap(entity => [entity.id, ...ownedContentIds(entity.data)]))];
const same = (left: unknown, right: unknown) => canonicalJson(left) === canonicalJson(right);
function compatibleShared(source: Entity, target: Entity | undefined, bindings: Record<ID, ID>) {
  return !!target && ['variable', 'item', 'character', 'place', 'group', 'assertion', 'external_contract'].includes(source.kind) && target.kind === source.kind && adoptedRecord(target) && source.status === target.status && source.name === target.name && same(rewriteEntityReferences(source, bindings).data, target.data);
}
function rewriteEmbeddedIds(value: unknown, bindings: Record<ID, ID>): void {
  if (Array.isArray(value)) { value.forEach(item => rewriteEmbeddedIds(item, bindings)); return; }
  if (!value || typeof value !== 'object') return;
  const record = value as Record<string, unknown>;
  if (typeof record.id === 'string' && ('text' in record && 'kind' in record || 'audienceHolderIds' in record || 'eventKey' in record || 'x' in record && 'y' in record)) record.id = bindings[record.id] ?? record.id;
  Object.values(record).forEach(item => rewriteEmbeddedIds(item, bindings));
}
function mapRecord(record: Entity, bindings: Record<ID, ID>, projectId: ID, versionId?: ID): Entity {
  const copy = rewriteEntityReferences(record, bindings); copy.id = bindings[record.id] ?? record.id; copy.projectId = projectId; rewriteEmbeddedIds(copy.data, bindings);
  // Explicit links to another fixed edition retain that edition's namespace.
  for (const reference of collectReferences(record)) if (fixedReferenceVersion(record, reference.path)) {
    const parts = reference.path.replace(/\[(\d+)\]/g, '.$1').split('.'); let current = copy as unknown as Record<string, unknown>;
    for (const key of parts.slice(0, -1)) current = current[key] as Record<string, unknown>;
    current[parts.at(-1)!] = reference.id;
  }
  return copy;
}

/** A derived execution view. Its namespace is persisted in the reuse declaration,
 * but borrowed records are never appended to the author's document or snapshots. */
export function resolveReuseContent<T extends ProjectContent>(project: T, snapshots: readonly ProjectSnapshot[], ancestors: ID[] = []): T {
  if (origins.has(project) || !project.entities.some(entity => adoptedRecord(entity) && reusable(entity) && entity.data.reuse && entity.data.reuse.mode !== 'clone')) return project;
  const entities = new Map(project.entities.map(entity => [entity.id, entity])), metadata = new Map<ID, ReuseOrigin>();
  const authorIds = new Set([...project.entities.flatMap(entity => [entity.id, ...ownedContentIds(entity.data)]), ...project.relations.map(relation => relation.id), ...project.views.map(view => view.id), project.projectId]);
  const worlds = new Map(project.worldReferences.map(reference => [reference.projectId, reference]));
  for (const owner of project.entities) {
    if (!adoptedRecord(owner) || !reusable(owner) || !owner.data.reuse || owner.data.reuse.mode === 'clone') continue;
    const reuse = owner.data.reuse, snapshot = snapshots.find(item => item.id === reuse.pinnedSnapshotId);
    if (!snapshot || snapshot.content.projectId !== project.projectId) fail('共通元の固定版がありません。');
    if (ancestors.includes(snapshot.id) || ancestors.length >= 32) fail('共通元の固定参照が循環しているか、32段を超えています。');
    const sourceContent = resolveReuseContent(snapshot.content, snapshots, [...ancestors, snapshot.id]);
    const source = sourceContent.entities.find(entity => entity.id === reuse.sourceId && adoptedRecord(entity));
    if (!source || source.kind !== owner.kind || !reusable(source)) fail('共通元の種類が一致しないか、固定版で不採用です。');
    const records = moduleRecords(sourceContent, source.id, snapshot.id), sourceIds = idsOf(records), bindings = reuse.bindings;
    if (!bindings || bindings[source.id] !== owner.id || sourceIds.length !== Object.keys(bindings).length || sourceIds.some(id => !bindings[id]) || new Set(Object.values(bindings)).size !== sourceIds.length) fail('共通元のID対応が欠落・重複しています。対象版を確認して再設定してください。');
    for (const [original, useId] of Object.entries(bindings)) if (useId !== owner.id && authorIds.has(useId)) {
      const declaration = records.find(record => record.id === original);
      if (original !== useId || !declaration || !compatibleShared(declaration, entities.get(useId), bindings)) fail('共通元の実行用IDが現在稿のレコード・段落・関係と衝突しています。ID対応を確認し直してください。');
    }
    const allowed = new Set(Object.keys(source.data).filter(field => !['reuse', 'chapterId'].includes(field)));
    if (reuse.mode === 'reference' && reuse.overrideFields.length || reuse.overrideFields.some(field => !allowed.has(field))) fail('上書き対象が不正です。宣言したフィールドだけを上書きしてください。');
    for (const reference of sourceContent.worldReferences) { const old = worlds.get(reference.projectId); if (old && !same(old, reference)) fail('共通元と使用先が同じ世界の異なる固定版を要求しています。適用する版を明示して揃えてください。'); worlds.set(reference.projectId, reference); }
    const sourceGraph = sourceContent.entities.find(entity => entity.kind === 'flow_graph' && source.kind === 'flow_node' && entity.data.nodeIds.includes(source.id));
    const sourceScene = source.kind === 'scene' ? source : sourceContent.entities.find(entity => source.kind === 'flow_node' && entity.id === source.data.sceneId && entity.kind === 'scene');
    for (const record of records) {
      const mapped = mapRecord(record, bindings, project.projectId, snapshot.id), id = mapped.id, existing = entities.get(id);
      if (id !== owner.id && existing) {
        if (record.id !== id || !compatibleShared(record, existing, bindings)) fail('共通元の実行用IDが現在稿と衝突しています。対応を再確認してください。');
        continue;
      }
      const priorOrigin = reuseOrigin(sourceContent, record.id);
      const originBindings = priorOrigin ? Object.fromEntries(Object.entries(priorOrigin.bindings).flatMap(([original, intermediate]) => bindings[intermediate] ? [[original, bindings[intermediate]]] : [])) : bindings;
      metadata.set(id, { entityId: priorOrigin?.entityId ?? record.id, sourceVersionId: priorOrigin?.sourceVersionId ?? snapshot.id, ownerId: owner.id, bindings: originBindings, graphId: sourceGraph ? bindings[sourceGraph.id] ?? sourceGraph.id : undefined, chapterId: sourceScene?.kind === 'scene' && sourceScene.data.chapterId ? bindings[sourceScene.data.chapterId] ?? sourceScene.data.chapterId : undefined });
      if (id === owner.id) {
        const data = { ...mapped.data } as Record<string, unknown>;
        delete data.reuse;
        for (const field of reuse.overrideFields) { if (Object.hasOwn(owner.data, field)) data[field] = structuredClone((owner.data as unknown as Record<string, unknown>)[field]); else delete data[field]; }
        if (owner.kind === 'scene') data.chapterId = owner.data.chapterId ?? null;
        entities.set(id, { ...owner, data } as unknown as Entity);
      } else entities.set(id, mapped);
    }
    if (entities.size > 100000) fail('再利用を解決した実行情報が100,000件を超えています。');
  }
  const allIds = new Set<ID>();
  for (const id of [...entities.values()].flatMap(entity => [entity.id, ...ownedContentIds(entity.data)]).concat(project.relations.map(relation => relation.id), project.views.map(view => view.id))) {
    if (allIds.has(id)) fail('再利用先どうしでレコード・段落等のIDが衝突しています。ID対応を確認し直してください。');
    allIds.add(id);
  }
  const view = { ...project, entities: [...entities.values()], worldReferences: [...worlds.values()] };
  origins.set(view, metadata); canonical.set(view, project); return view;
}

export function reuseTargetAnchor(project: ProjectContent, anchor: ContentAnchor): ContentAnchor {
  // The caller explicitly chose this edition and its original namespace.
  if (anchor.sourceVersionId) return anchor;
  const origin = reuseOrigin(project, anchor.entityId); if (!origin) return anchor;
  const owner = reuseAuthorContent(project).entities.find(entity => entity.id === anchor.entityId);
  if (!anchor.blockId && !anchor.lineId && owner && reusable(owner) && owner.data.reuse?.mode === 'override' && owner.data.reuse.overrideFields.includes('body')) return anchor;
  const reverse = new Map(Object.entries(origin.bindings).map(([source, use]) => [use, source]));
  // A local override owns its new paragraphs/lines; only inherited positions open the source pin.
  if (anchor.blockId && !reverse.has(anchor.blockId) || anchor.lineId && !reverse.has(anchor.lineId)) return anchor;
  return { ...anchor, entityId: origin.entityId, sourceVersionId: origin.sourceVersionId, ...(anchor.blockId ? { blockId: reverse.get(anchor.blockId) ?? anchor.blockId } : {}), ...(anchor.lineId ? { lineId: reverse.get(anchor.lineId) ?? anchor.lineId } : {}) };
}
export function reuseRuleContexts(project: ProjectContent, base: NonNullable<RuntimeContext['ruleContext']>): NonNullable<RuntimeContext['ruleContexts']> {
  return Object.fromEntries([...(origins.get(project) ?? [])].map(([id, origin]) => [id, {
    ...base,
    // Qualifiers and the actual use site must be compared in the same namespace.
    // Mapping only the declaration would reject its unchanged permitted graph/chapter.
    graphId: base.graphId ? origin.bindings[base.graphId] ?? base.graphId : undefined,
    chapterId: base.chapterId ? origin.bindings[base.chapterId] ?? base.chapterId : undefined,
    sourceVersionId: origin.sourceVersionId, anchorBindings: origin.bindings,
  }]));
}
/** Fixed author anchors keep their real namespace. Only the originating borrowed
 * declaration translates them while evaluating an occurrence of that module. */
export function reuseExecutionAnchor(project: ProjectContent, anchor: ContentAnchor, declarationId: ID): ContentAnchor {
  const origin = reuseOrigin(project, declarationId);
  if (!origin || anchor.sourceVersionId !== origin.sourceVersionId) return anchor;
  return { ...anchor, entityId: origin.bindings[anchor.entityId] ?? anchor.entityId, ...(anchor.blockId ? { blockId: origin.bindings[anchor.blockId] ?? anchor.blockId } : {}), ...(anchor.lineId ? { lineId: origin.bindings[anchor.lineId] ?? anchor.lineId } : {}) };
}

export async function verifyReusePins(content: ProjectContent, snapshots: readonly ProjectSnapshot[]): Promise<void> {
  const pins = new Set<ID>(), queue = [content];
  for (let cursor = 0; cursor < queue.length; cursor++) for (const entity of queue[cursor].entities) if (adoptedRecord(entity) && reusable(entity) && entity.data.reuse && entity.data.reuse.mode !== 'clone') {
    const pin = entity.data.reuse.pinnedSnapshotId; if (pins.has(pin)) continue; pins.add(pin);
    const snapshot = snapshots.find(item => item.id === pin);
    if (!snapshot || await sha256(jsonBytes(snapshot.content)) !== snapshot.contentHash) fail('共通元の依存固定版がないか、内容hashが一致しません。');
    queue.push(snapshot.content); if (pins.size > 100000) fail('共通元の依存固定版が100,000件を超えています。');
  }
}

export async function prepareReuse(project: ProjectData, request: { ownerId: ID; sourceId: ID; snapshotId?: ID; mode: Reuse['mode']; overrideFields?: string[] }) {
  request = structuredClone(request);
  const editingHistory = project.history, captured = structuredClone({ ...project, history: [] });
  project = { ...captured, history: editingHistory };
  const owner = captured.entities.find(entity => entity.id === request.ownerId && adoptedRecord(entity));
  if (!owner || !reusable(owner)) fail('再利用する使用先の場面・ノードがありません。');
  const { snapshots: _snapshots, history: _history, authorAlternatives: _variants, ...content } = captured;
  const fixedContent = structuredClone(content);
  const snapshot = request.snapshotId ? captured.snapshots.find(item => item.id === request.snapshotId) : { id: newId(), content: fixedContent, contentHash: await sha256(jsonBytes(fixedContent)), createdAt: new Date().toISOString(), versionLabel: `共通元の固定版 ${captured.revision}` };
  if (!snapshot || await sha256(jsonBytes(snapshot.content)) !== snapshot.contentHash) fail('共通元の固定版hashが一致しません。');
  const snapshots = request.snapshotId ? captured.snapshots : [...captured.snapshots, snapshot];
  await verifyReusePins(snapshot.content, snapshots);
  const sourceContent = resolveReuseContent(snapshot.content, snapshots), source = sourceContent.entities.find(entity => entity.id === request.sourceId && adoptedRecord(entity));
  if (!source || source.kind !== owner.kind || !reusable(source) || source.id === owner.id) fail('共通元は使用先とは別の、同じ種類の採用中情報を選んでください。');
  const records = moduleRecords(sourceContent, source.id, snapshot.id), bindings = Object.fromEntries(idsOf(records).map(id => [id, id === source.id ? owner.id : newId()]));
  const prior = owner.data.reuse;
  if (prior?.sourceId === source.id && prior.bindings) for (const id of Object.keys(bindings)) if (id !== source.id && prior.bindings[id] && prior.bindings[id] !== id) bindings[id] = prior.bindings[id];
  if (request.mode !== 'clone') {
    // Share only unchanged declarations after all internal references match.
    for (let pass = 0; pass < records.length; pass++) {
      let changed = false;
      for (const record of records) {
        if (record.id === source.id || bindings[record.id] === record.id) continue;
        const target = captured.entities.find(entity => entity.id === record.id);
        if (compatibleShared(record, target, bindings)) { bindings[record.id] = record.id; changed = true; }
      }
      if (!changed) break;
    }
  }
  const reuse: Reuse = { mode: request.mode, sourceId: source.id, pinnedSnapshotId: snapshot.id, overrideFields: request.overrideFields ?? [], ...(request.mode !== 'clone' ? { bindings } : {}) };
  let replacement: Entity = { ...owner, data: { ...owner.data, reuse } } as Entity, additions: Entity[] = [];
  if (request.mode === 'clone') {
    additions = records.filter(record => record.id !== source.id).map(record => { const copy = mapRecord(record, bindings, project.projectId, snapshot.id); copy.revision = '0'; return copy; });
    replacement = { ...owner, data: { ...mapRecord(source, bindings, project.projectId, snapshot.id).data, ...(owner.kind === 'scene' ? { chapterId: owner.data.chapterId ?? null } : {}), reuse } } as Entity;
  }
  const candidate = { ...project, entities: [...project.entities.map(entity => entity.id === owner.id ? replacement : entity), ...additions], snapshots };
  if (request.mode !== 'clone') resolveReuseContent(candidate, snapshots);
  const beforePin = prior ? captured.snapshots.find(item => item.id === prior.pinnedSnapshotId) : undefined;
  if (prior && (!beforePin || await sha256(jsonBytes(beforePin.content)) !== beforePin.contentHash)) fail('比較する更新前の固定版がないか、内容hashが一致しません。');
  if (beforePin) await verifyReusePins(beforePin.content, snapshots);
  const beforeContent = beforePin ? resolveReuseContent(beforePin.content, snapshots) : undefined;
  const before = beforeContent?.entities.find(entity => entity.id === prior?.sourceId);
  const fields = before ? [...new Set([...Object.keys(before.data), ...Object.keys(source.data)])].filter(field => !same((before.data as unknown as Record<string, unknown>)[field] ?? null, (source.data as unknown as Record<string, unknown>)[field] ?? null)) : Object.keys(source.data);
  const oldRecords = beforeContent && prior ? moduleRecords(beforeContent, prior.sourceId, beforePin!.id) : [];
  const dependencyChanges = [...new Set([...oldRecords.map(record => record.id), ...records.map(record => record.id)])].flatMap(id => {
    if (id === source.id) return [];
    const old = oldRecords.find(record => record.id === id), next = records.find(record => record.id === id);
    const before = old ? { kind: old.kind, name: old.name, status: old.status, data: old.data } : null, after = next ? { kind: next.kind, name: next.name, status: next.status, data: next.data } : null;
    return same(before, after) ? [] : [{ id, name: next?.name ?? old?.name ?? '', before, after }];
  });
  const diffs = fields.map(field => ({ field, before: (before?.data as unknown as Record<string, unknown> | undefined)?.[field] ?? null, after: (source.data as unknown as Record<string, unknown>)[field] ?? null, ...(reuse.overrideFields.includes(field) ? { overrideValue: (owner.data as unknown as Record<string, unknown>)[field] ?? null } : {}) }));
  return { candidate, owner: replacement, fields, diffs, dependencyChanges, overriddenConflicts: fields.filter(field => reuse.overrideFields.includes(field)), users: project.entities.filter(entity => reusable(entity) && entity.data.reuse?.sourceId === source.id).map(entity => entity.id), sourceVersionId: snapshot.id };
}

export function reuseValidationIssues(project: ProjectContent, snapshots: readonly ProjectSnapshot[], path: string): ValidationIssue[] {
  if (!project.entities.some(entity => reusable(entity) && entity.data.reuse?.bindings)) return [];
  try { resolveReuseContent(project, snapshots); return []; } catch (error) { return [{ code: 'REFERENCE_INVALID', path: `${path}.reuse`, message: (error as Error).message }]; }
}
