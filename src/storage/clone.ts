import type { CommandRecord, Entity, Relation, ProjectContent, ProjectData } from '../domain/types';
import { newId, rewriteEntityReferences, rewriteRelationReferences } from '../domain/model';
import { sealAuthorAlternative } from '../domain/authorAlternativeIntegrity';
import { canonicalJson, jsonBytes, sha256 } from './json';
import { StorageError } from './errors';

const copy = <T>(value: T): T => structuredClone(value);
function freeze<T>(value: T, seen = new WeakSet<object>()): T {
  if (value && typeof value === 'object' && !seen.has(value)) {
    seen.add(value);
    for (const key of Object.keys(value)) {
      const child = (value as Record<string, unknown>)[key];
      if (child && typeof child === 'object') freeze(child, seen);
    }
    Object.freeze(value);
  }
  return value;
}

export async function cloneProject(input: ProjectData): Promise<{ project: ProjectData; idMap: Record<string, string> }> {
  const idMap: Record<string, string> = { [input.projectId]: newId() };
  const declarations = new WeakSet<object>();
  const collect = (value: unknown) => {
    if (!value || typeof value !== 'object' || declarations.has(value)) return;
    declarations.add(value);
    if (Array.isArray(value)) return value.forEach(collect);
    for (const [key, item] of Object.entries(value)) {
      if (['id', 'operationId', 'instanceId', 'deletionOperationId'].includes(key) && typeof item === 'string' && /^[0-9a-f-]{36}$/.test(item)) idMap[item] ??= newId();
      if (key === 'bindings' && item && typeof item === 'object' && !Array.isArray(item)) for (const id of Object.values(item)) if (typeof id === 'string' && /^[0-9a-f-]{36}$/.test(id)) idMap[id] ??= newId();
      collect(item);
    }
  };
  collect(input);
  const originalEntities = new Map<string, Entity>(), originalRelations = new Map<string, Relation>();
  const owners = new WeakSet<object>();
  const collectOwners = (value: unknown) => {
    if (!value || typeof value !== 'object' || owners.has(value)) return;
    owners.add(value);
    // Reverse the traversal and keep the first owner, preserving the original
    // last-occurrence choice without revisiting every shared historic subtree.
    if (Array.isArray(value)) { for (let index=value.length-1;index>=0;index--) collectOwners(value[index]); return; }
    const record = value as Record<string, unknown>;
    const children=Object.values(record);for (let index=children.length-1;index>=0;index--) collectOwners(children[index]);
    if (typeof record.id === 'string' && 'kind' in record && 'data' in record && 'projectId' in record && !originalEntities.has(record.id)) originalEntities.set(record.id, record as unknown as Entity);
    if (typeof record.id === 'string' && 'relationType' in record && 'fromId' in record && 'toId' in record && !originalRelations.has(record.id)) originalRelations.set(record.id, record as unknown as Relation);
  };
  collectOwners(input);
  const readPath = (value: unknown, path: string[]): unknown => path.reduce<unknown>((current, segment) => current && typeof current === 'object' ? (current as Record<string, unknown>)[segment] : undefined, value);
  const writePath = (value: Record<string, unknown>, path: string[], item: unknown): void => {
    let cursor = value;
    for (const segment of path.slice(0, -1)) {
      if (!cursor[segment] || typeof cursor[segment] !== 'object') cursor[segment] = {};
      cursor = cursor[segment] as Record<string, unknown>;
    }
    if (path.length) cursor[path[path.length - 1]!] = structuredClone(item);
  };
  const rewriteDeclarations = (value: unknown): void => {
    if (Array.isArray(value)) { value.forEach(rewriteDeclarations); return; }
    if (!value || typeof value !== 'object') return;
    const record = value as Record<string, unknown>;
    if (typeof record.id === 'string') record.id = idMap[record.id] ?? record.id;
    if (typeof record.instanceId === 'string' && 'quantity' in record && 'consumed' in record) record.instanceId = idMap[record.instanceId] ?? record.instanceId;
    if (record.mode === 'anonymize' && typeof record.publicId === 'string') record.publicId = idMap[record.publicId] ?? record.publicId;
    if (record.publicIds && typeof record.publicIds === 'object') for (const [key, id] of Object.entries(record.publicIds)) if (typeof id === 'string') (record.publicIds as Record<string, string>)[key] = idMap[id] ?? id;
    for (const item of Object.values(record)) rewriteDeclarations(item);
  };
  const rewrittenValues = new WeakMap<object, Map<string, unknown>>();
  const rewrite = (value: unknown, key = '', parent?: Record<string, unknown>): unknown => {
    if (!value || typeof value !== 'object') return rewriteValue(value,key,parent);
    // Dictionary keys, paths and ref-valued arrays have different contracts.
    // Share only occurrences rewritten under the same interpretation.
    let context=key;
    if (Array.isArray(value)) {
      if (key==='value') context+=parent?.type==='ref'?':ref':':literal';
      if (key==='key' && parent && typeof parent.scope==='string' && Array.isArray(parent.path)) context+=canonicalJson([parent.scope,parent.itemId??null,parent.path]);
      if (key==='publicId') context+=parent && typeof parent.entityId==='string' && typeof parent.sourceVersionId==='string'?':citation':':local';
    }
    const cache=rewrittenValues.get(value)??new Map<string,unknown>();
    if (cache.has(context)) return cache.get(context);
    const result=rewriteValue(value,key,parent);cache.set(context,result);rewrittenValues.set(value,cache);return result;
  };
  const rewriteValue = (value: unknown, key = '', parent?: Record<string, unknown>): unknown => {
    if (typeof value === 'string') {
      if (key === 'onceTriggers') return value.replace(/[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}/g, id => idMap[id] ?? id);
      if (key === 'key' && parent && typeof parent.scope === 'string' && Array.isArray(parent.path)) return [parent.scope, typeof parent.itemId === 'string' ? idMap[parent.itemId] ?? parent.itemId : '', ...parent.path.map(part => String(part))].map(part => encodeURIComponent(part)).join(':');
      if(key==='publicId'&&parent&&typeof parent.entityId==='string'&&typeof parent.sourceVersionId==='string')return value;
      return (/(?:Id|Ids)$/.test(key) || ['id', 'operationId'].includes(key) || key === 'value' && parent?.type === 'ref') && idMap[value] ? idMap[value] : value;
    }
    if (key === 'importOrigin' && value && typeof value === 'object') { const origin = value as NonNullable<CommandRecord['importOrigin']>; return { ...origin, importOperationId: idMap[origin.importOperationId] ?? origin.importOperationId }; }
    if (key === 'path' && Array.isArray(value)) return [...value];
    if (key === 'assignments' && value && typeof value === 'object' && !Array.isArray(value)) return Object.fromEntries(Object.entries(value as Record<string, unknown>).map(([beat, sceneId]) => [beat, typeof sceneId === 'string' ? idMap[sceneId] ?? sceneId : sceneId]));
    if (Array.isArray(value)) return value.map(item => rewrite(item, key, parent));
    if (value && typeof value === 'object') {
      const source = value as Record<string, unknown>;
      if (['entity', 'relation', 'project', 'presentation'].includes(String(source.scope)) && Array.isArray(source.path) && source.before && source.after && 'present' in (source.before as object) && 'present' in (source.after as object)) {
        const scope = String(source.scope), path = source.path as string[], oldItemId = typeof source.itemId === 'string' ? source.itemId : undefined;
        const itemId = oldItemId ? idMap[oldItemId] ?? oldItemId : undefined;
        const mappedPath = [...path];
        const remapValue = (raw: unknown): unknown => {
          if (scope === 'entity' && oldItemId && originalEntities.has(oldItemId) && path.length) {
            const owner = structuredClone(originalEntities.get(oldItemId)!);
            writePath(owner as unknown as Record<string, unknown>, path, raw);
            const rewrittenOwner = rewriteEntityReferences(owner, idMap);
            rewrittenOwner.id = idMap[owner.id] ?? owner.id; rewrittenOwner.projectId = idMap[owner.projectId] ?? owner.projectId;
            if (rewrittenOwner.deletionOperationId) rewrittenOwner.deletionOperationId = idMap[rewrittenOwner.deletionOperationId] ?? rewrittenOwner.deletionOperationId;
            rewriteDeclarations(rewrittenOwner.data);
            return readPath(rewrittenOwner, path);
          }
          if (scope === 'relation' && oldItemId && originalRelations.has(oldItemId) && path.length) {
            const owner = structuredClone(originalRelations.get(oldItemId)!);
            writePath(owner as unknown as Record<string, unknown>, path, raw);
            const rewrittenOwner = rewriteRelationReferences(owner, idMap);
            rewrittenOwner.id = idMap[owner.id] ?? owner.id; rewrittenOwner.projectId = idMap[owner.projectId] ?? owner.projectId;
            return readPath(rewrittenOwner, path);
          }
          if (scope === 'project' && path[0] === 'worldReferences') return structuredClone(raw);
          if (scope === 'presentation' && raw && typeof raw === 'object' && !Array.isArray(raw)) {
            const presentation = structuredClone(raw) as Record<string, unknown>;
            if (Array.isArray(presentation.chapterOrder)) presentation.chapterOrder = presentation.chapterOrder.map(id => typeof id === 'string' ? idMap[id] ?? id : id);
            return rewrite(presentation);
          }
          const leaf = path.at(-1) ?? '';
          return rewrite(raw, leaf);
        };
        const remapSide = (side: unknown) => {
          const snapshot = structuredClone(side) as Record<string, unknown>;
          if (snapshot.present === true) snapshot.value = remapValue(snapshot.value);
          return snapshot;
        };
        const patch: Record<string, unknown> = { ...source, ...(itemId ? { itemId } : {}), path: mappedPath, before: remapSide(source.before), after: remapSide(source.after) };
        patch.key = [scope, itemId ?? '', ...mappedPath].map(part => encodeURIComponent(part)).join(':');
        return patch;
      }
      const keyedByReference = ['variableValues', 'visitCounts', 'publicTexts', 'publicIds', 'byEntityId', 'bindings'].includes(key);
      const rewritten = Object.fromEntries(Object.entries(value).map(([name, item]) => [keyedByReference ? idMap[name] ?? name : name, ['idMap', 'bindings'].includes(key) && typeof item === 'string' ? idMap[item] ?? item : rewrite(item, name, value as Record<string, unknown>)]));
      if ('kind' in rewritten && 'data' in rewritten && 'projectId' in rewritten) return rewriteEntityReferences(rewritten as Entity, idMap);
      if ('relationType' in rewritten && 'fromId' in rewritten && 'toId' in rewritten) return rewriteRelationReferences(rewritten as unknown as Relation, idMap);
      if (Array.isArray(rewritten.patches) && Array.isArray(rewritten.selectedChangeKeys)) rewritten.selectedChangeKeys = rewritten.patches.map((patch: { key: string }) => patch.key).sort();
      return rewritten;
    }
    return value;
  };
  const project = rewrite(input) as ProjectData;
  const snapshots = new Map<string, Array<Record<string, unknown>>>();
  const collectedSnapshots = new WeakSet<object>();
  const collectSnapshots = (value: unknown): void => {
    if (!value || typeof value !== 'object' || collectedSnapshots.has(value)) return;
    collectedSnapshots.add(value);
    if (Array.isArray(value)) { value.forEach(collectSnapshots); return; }
    const record = value as Record<string, unknown>;
    if (typeof record.id === 'string' && record.content && typeof record.content === 'object' && 'versionLabel' in record && 'contentHash' in record) {
      const copies = snapshots.get(record.id) ?? []; copies.push(record); snapshots.set(record.id, copies);
    }
    Object.values(record).forEach(collectSnapshots);
  };
  collectSnapshots(project);
  const snapshotHashes = new Map<string, string>(), activeSnapshots = new Set<string>();
  const hashSnapshot = async (id: string): Promise<string> => {
    const cached = snapshotHashes.get(id); if (cached) return cached;
    const copies = snapshots.get(id); if (!copies?.length) throw new StorageError('HASH_MISMATCH', '参照したsnapshotがclone後に見つかりません。', id);
    if (activeSnapshots.has(id)) throw new StorageError('HASH_MISMATCH', 'snapshotの内容hashに循環があります。', id);
    activeSnapshots.add(id);
    for (const copy of copies) {
      const content = copy.content as ProjectContent;
      for (const entity of content.entities) if (entity.kind === 'snapshot' && snapshots.has(entity.id)) entity.data.contentHash = await hashSnapshot(entity.id);
    }
    const hash = await sha256(jsonBytes(copies[0]!.content));
    for (const copy of copies) copy.contentHash = hash;
    snapshotHashes.set(id, hash); activeSnapshots.delete(id); return hash;
  };
  for (const id of snapshots.keys()) await hashSnapshot(id);
  const refreshedSnapshots = new WeakSet<object>();
  const refreshSnapshotReferences = (value: unknown): void => {
    if (!value || typeof value !== 'object' || refreshedSnapshots.has(value)) return;
    refreshedSnapshots.add(value);
    if (Array.isArray(value)) { value.forEach(refreshSnapshotReferences); return; }
    const record = value as Record<string, unknown>;
    if (record.kind === 'snapshot' && typeof record.id === 'string' && record.data && typeof record.data === 'object') {
      const contentHash = snapshotHashes.get(record.id);
      if (contentHash) (record.data as Record<string, unknown>).contentHash = contentHash;
    }
    Object.values(record).forEach(refreshSnapshotReferences);
  };
  refreshSnapshotReferences(project);
  const resealed = new Set<object>();
  const resealRetainedBranches = async (value: unknown): Promise<void> => {
    if (!value || typeof value !== 'object' || resealed.has(value)) return;
    resealed.add(value);
    if (Array.isArray(value)) { for (const item of value) await resealRetainedBranches(item); return; }
    const record = value as Record<string, unknown>;
    if (Array.isArray(record.authorAlternatives)) record.authorAlternatives = await Promise.all((record.authorAlternatives as ProjectData['authorAlternatives'] ?? []).map(sealAuthorAlternative));
    for (const item of Object.values(record)) await resealRetainedBranches(item);
  };
  await resealRetainedBranches(project);
  // The current image is independently editable; only immutable historic
  // values may share bodies. Never share a clone with its original input.
  const {history:_history,snapshots:_snapshots,authorAlternatives:_alternatives,...current}=project;
  const result={...project,...copy(current)};freeze(result.history);
  for (const snapshot of result.snapshots) freeze(snapshot);
  return { project:result, idMap };
}

