import { collectReferences, ID_PATTERN, isContentCopyField, rewriteEntityReferences, rewriteRelationReferences, validateCurrentProject, validateProject } from '../domain/model';
import { dialogueContentHash } from '../domain/production';
import { sealAuthorAlternative } from '../domain/authorAlternativeIntegrity';
import type { AuthorAlternative, ContentState, Entity, EntityKind, ProjectContent, ProjectData, ProjectSnapshot, Relation, SavedView } from '../domain/types';
import { attachmentMetadata, validateAsset, verifySnapshotHashes, verifyWorlds, worldSnapshotContents, type PreparedScenario } from './archive';
import { checkCancelled, StorageError } from './errors';
import { equalJson, jsonBytes, sha256 } from './json';

export type ImportIdRole = 'project' | 'relation' | 'snapshot' | 'view' | 'operation' | 'alternative' | 'alternative_version' | 'alternative_receipt' | 'block' | 'alias' | 'trigger' | 'map_pin' | 'runtime_item' | 'public_id' | 'reuse_binding' | `entity:${EntityKind}`;
export interface ImportId { id: string; role: ImportIdRole; ownerId?: string }
export interface MappedImportConflict { id: string; kind: 'project' | 'entity' | 'relation' | 'snapshot' | 'view' | 'alternative'; existing: unknown; incoming: unknown }
export interface MappedImportChange { id: string; kind: MappedImportConflict['kind']; action: 'add' | 'update' | 'keep'; sourceId?: string; fields: string[] }
export interface CrossProjectImportOptions {
  idMap: Readonly<Record<string, string>>;
  resolutions?: Readonly<Record<string, 'existing' | 'incoming'>>;
  /** Includes already installed worlds needed by the destination, in addition to archive worlds. */
  knownWorlds?: Record<string, ProjectData>;
  loadAsset?: (hash: string) => Promise<Uint8Array | undefined> | Uint8Array | undefined;
  signal?: AbortSignal;
}
export interface CrossProjectImportPlan {
  sourceProjectId: string; targetProjectId: string; targetRevision: string; sourceContentHash: string;
  idMap: Record<string, string>; mappedProject: ProjectData;
  conflicts: MappedImportConflict[]; unresolved: string[]; changes: MappedImportChange[];
  /** Current-content preview. Its history retains the destination's opaque editing token. */
  candidate?: ProjectData;
  assets: { provided: string[]; reused: string[]; missing: string[]; byteSize: number };
  warnings: string[];
}

/** Enumerates owned IDs in current content, immutable editions and restoration history, never prose. */
export function collectImportIds(project: ProjectData): ImportId[] {
  const found = new Map<string, ImportId>();
  const bindings: { id: string; ownerId: string }[] = [];
  const copiedBlocks: { id: string; ownerId: string }[] = [];
  const runtimeItems = new Set<string>();
  const add = (id: string, role: ImportIdRole, ownerId?: string) => {
    const old = found.get(id);
    if (old && (old.role !== role || old.ownerId !== ownerId)) throw new StorageError('IMPORT_CONFLICT', '同じIDが別の種別・所有者で使われています。', id);
    found.set(id, { id, role, ...(ownerId ? { ownerId } : {}) });
  };
  const declarations = (value: unknown, ownerId: string, contentCopy = false) => {
    if (Array.isArray(value)) { value.forEach(item => declarations(item, ownerId, contentCopy)); return; }
    if (!value || typeof value !== 'object') return;
    const record = value as Record<string, unknown>;
    if (typeof record.id === 'string') {
      const role: ImportIdRole = 'kind' in record && 'text' in record ? 'block' : 'audienceHolderIds' in record ? 'alias' : 'eventKey' in record ? 'trigger' : 'x' in record && 'y' in record ? 'map_pin' : (() => { throw new StorageError('IMPORT_CONFLICT', '未対応の埋込IDです。', record.id as string); })();
      if (contentCopy && role === 'block') copiedBlocks.push({ id: record.id, ownerId });
      else add(record.id, role, ownerId);
    }
    if (typeof record.instanceId === 'string' && 'quantity' in record && 'consumed' in record) runtimeItems.add(record.instanceId);
    if(typeof record.sourceVersionId==='string'&&typeof record.profileId==='string'&&typeof record.publicVersionId==='string')add(record.publicVersionId,'public_id');
    if (record.mode === 'anonymize' && typeof record.publicId === 'string') add(record.publicId, 'public_id');
    for (const [key, item] of Object.entries(record)) {
      if (key === 'publicIds' && item && typeof item === 'object') for (const id of Object.values(item)) if (typeof id === 'string') add(id, 'public_id');
      if (key === 'bindings' && item && typeof item === 'object' && !Array.isArray(item)) for (const id of Object.values(item)) if (typeof id === 'string') bindings.push({ id, ownerId });
      declarations(item, ownerId, contentCopy || isContentCopyField(key));
    }
  };
  const state = (content: ProjectContent | ContentState) => {
    add(content.projectId, 'project');
    for (const entity of content.entities) {
      add(entity.id, entity.kind === 'snapshot' ? 'snapshot' : `entity:${entity.kind}`);
      if (entity.deletionOperationId) add(entity.deletionOperationId, 'operation');
      declarations(entity.data, entity.id);
    }
    for (const relation of content.relations) { add(relation.id, 'relation'); if (relation.deletionOperationId) add(relation.deletionOperationId, 'operation'); }
    for (const view of content.views) add(view.id, 'view');
    if ('authorAlternatives' in content && Array.isArray(content.authorAlternatives)) for (const alternative of content.authorAlternatives as AuthorAlternative[]) {
      add(alternative.id, 'alternative', alternative.projectId);
      for (const version of alternative.versions) add(version.id, 'alternative_version', alternative.id);
      for (const receipt of alternative.applyReceipts) add(receipt.id, 'alternative_receipt', alternative.id);
      state(alternative.baseContent);
      for (const version of alternative.versions) state(version.content);
    }
    if ('snapshots' in content) for (const snapshot of content.snapshots) { add(snapshot.id, 'snapshot'); state(snapshot.content); }
  };
  state(project);
  for (const command of project.history) { add(command.operationId, 'operation'); state(command.before); state(command.after); }
  // Source paragraphs can be copied into approval policies before their source
  // entity appears. Resolve them against the complete canonical declaration set.
  // Public-only paragraphs still own IDs; an earlier public copy is not canonical.
  const canonicalBlockIds = new Set([...found.values()].filter(item => item.role === 'block').map(item => item.id));
  for (const block of copiedBlocks) if (!canonicalBlockIds.has(block.id)) add(block.id, 'block', block.ownerId);
  // Declared individual items and aggregate type quantities use their entity ID in runtime.
  // Generated instances own independent IDs; they must still reject other roles.
  for (const id of runtimeItems) if (found.get(id)?.role !== 'entity:item') add(id, 'runtime_item');
  for (const binding of bindings) if (!found.has(binding.id)) add(binding.id, 'reuse_binding', binding.ownerId);
  return [...found.values()];
}

function validationError(issues: { path: string; message: string }[]): StorageError {
  return Object.assign(new StorageError('VALIDATION_FAILED', issues.map(issue => `${issue.path}: ${issue.message}`).join('\n'), issues[0]?.path), { issues });
}
function validateMap(source: ProjectData, target: ProjectData, input: Readonly<Record<string, string>>): Record<string, string> {
  if (source.projectId === target.projectId) throw new StorageError('IMPORT_CONFLICT', '同じ作品はIDを維持して統合してください。');
  const owned = new Map(collectImportIds(source).map(item => [item.id, item]));
  const destination = new Map(collectImportIds(target).map(item => [item.id, item]));
  const result: Record<string, string> = {}, targets = new Set<string>();
  for (const sourceId of Object.keys(input)) if (!owned.has(sourceId)) throw new StorageError('IMPORT_CONFLICT', '対応表に作品外・未知のIDがあります。固定世界のIDは変更できません。', sourceId);
  for (const [id, item] of owned) {
    const mapped = Object.hasOwn(input, id) ? input[id] : undefined;
    if (!mapped || !ID_PATTERN.test(mapped)) throw new StorageError('IMPORT_CONFLICT', '全ローカルIDの明示対応が必要です。', id);
    if (targets.has(mapped)) throw new StorageError('IMPORT_CONFLICT', '複数の元IDを同じIDへ統合できません。対応を一対一にしてください。', id);
    targets.add(mapped); result[id] = mapped;
    const existing = destination.get(mapped);
    if (existing && existing.role !== item.role) throw new StorageError('IMPORT_CONFLICT', '対応先の種別が異なります。', id);
    if (existing && (item.role === 'operation' || item.role === 'snapshot')) throw new StorageError(item.role === 'snapshot' ? 'IMMUTABLE_SNAPSHOT' : 'OPERATION_CONFLICT', '復元履歴・不変版は既存IDを上書きできません。新しい対応IDを選んでください。', id);
  }
  if (result[source.projectId] !== target.projectId) throw new StorageError('IMPORT_CONFLICT', '元projectIdの対応先を対象作品にしてください。', source.projectId);
  for (const [id, item] of owned) {
    const existing = destination.get(result[id]);
    if (item.ownerId && existing?.ownerId && result[item.ownerId] !== existing.ownerId) throw new StorageError('IMPORT_CONFLICT', '段落・別名などの対応先が対応した所有者に属していません。', id);
  }
  return result;
}

function rewriteDeclarations(value: unknown, idMap: Record<string, string>): void {
  if (Array.isArray(value)) { value.forEach(item => rewriteDeclarations(item, idMap)); return; }
  if (!value || typeof value !== 'object') return;
  const record = value as Record<string, unknown>;
  if (typeof record.id === 'string') record.id = idMap[record.id] ?? record.id;
  if (typeof record.instanceId === 'string' && 'quantity' in record && 'consumed' in record) record.instanceId = idMap[record.instanceId] ?? record.instanceId;
  if (record.mode === 'anonymize' && typeof record.publicId === 'string') record.publicId = idMap[record.publicId] ?? record.publicId;
  if (record.publicIds && typeof record.publicIds === 'object') for (const [key, id] of Object.entries(record.publicIds)) if (typeof id === 'string') (record.publicIds as Record<string, string>)[key] = idMap[id] ?? id;
  if (Array.isArray(record.onceTriggers)) record.onceTriggers = record.onceTriggers.map(value => typeof value === 'string' ? value.replace(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/g, id => idMap[id] ?? id) : value);
  for (const item of Object.values(record)) rewriteDeclarations(item, idMap);
}

function rewriteLocalEntity(entity: Entity, idMap: Record<string, string>): Entity {
  const mapped = rewriteEntityReferences(entity, idMap);
  // Actor and calendar IDs have external scopes even if their spelling equals an owned record ID.
  for (const reference of collectReferences(entity)) if (reference.scope === 'identity' || reference.scope === 'calendar') {
    const parts = reference.path.replace(/\[(\d+)\]/g, '.$1').split('.').filter(Boolean), field = parts.pop()!;
    if (field === '$key') throw new StorageError('IMPORT_CONFLICT', '外部参照をkeyにした未知の辞書は対応表で変換できません。', reference.path);
    let cursor = mapped as unknown as Record<string, unknown>;
    for (const part of parts) cursor = cursor[part] as Record<string, unknown>;
    cursor[field] = reference.id;
  }
  return mapped;
}

function rewriteBranchValue(value: unknown, idMap: Record<string, string>, key = '', parent?: Record<string, unknown>): unknown {
  const lookup = (id: string) => idMap[id] ?? id;
  if (typeof value === 'string') {
    if (key === 'onceTriggers') return value.replace(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/g, lookup);
    if (key === 'id' || key === 'operationId' || /(?:Id|Ids)$/.test(key) || key === 'value' && parent?.type === 'ref') return lookup(value);
    return value;
  }
  if (Array.isArray(value)) return value.map(item => rewriteBranchValue(item, idMap, key, parent));
  if (!value || typeof value !== 'object') return value;
  const record = value as Record<string, unknown>;
  if ('kind' in record && 'data' in record && 'projectId' in record) {
    const entity = rewriteLocalEntity(record as unknown as Entity, idMap);
    rewriteDeclarations(entity.data, idMap);
    return entity;
  }
  if ('relationType' in record && 'fromId' in record && 'toId' in record) return rewriteRelationReferences(record as unknown as Relation, idMap);
  const keyedByReference = ['variableValues', 'visitCounts', 'publicTexts', 'publicIds', 'byEntityId'].includes(key);
  return Object.fromEntries(Object.entries(record).map(([name, item]) => [keyedByReference ? lookup(name) : name, rewriteBranchValue(item, idMap, name, record)]));
}

function pathValue(value: unknown, path: readonly string[]): unknown {
  return path.reduce<unknown>((current, key) => current && typeof current === 'object' ? (current as Record<string, unknown>)[key] : undefined, value);
}

function setPathValue<T extends object>(value: T, path: readonly string[], item: unknown): T {
  const copy = structuredClone(value) as Record<string, unknown>;
  let cursor = copy;
  for (const key of path.slice(0, -1)) {
    if (!cursor[key] || typeof cursor[key] !== 'object') cursor[key] = {};
    cursor = cursor[key] as Record<string, unknown>;
  }
  if (path.length) {
    const key = path[path.length - 1]!;
    if (item === undefined) delete cursor[key]; else cursor[key] = structuredClone(item);
  }
  return copy as T;
}

/** Receipt values are interpreted in the declared owner schema, never by UUID spelling alone. */
function mapPatchValue(
  value: unknown,
  patch: AuthorAlternative['applyReceipts'][number]['patches'][number],
  alternative: AuthorAlternative,
  selectedVersionContent: ProjectContent,
  idMap: Record<string, string>,
): unknown {
  if (patch.scope === 'presentation' && value && typeof value === 'object' && !Array.isArray(value)) {
    const state = structuredClone(value) as Record<string, unknown>;
    const lookup = (id: unknown) => typeof id === 'string' ? idMap[id] ?? id : id;
    if (Array.isArray(state.chapterOrder)) state.chapterOrder = state.chapterOrder.map(lookup);
    if (Array.isArray(state.chapters)) state.chapters = state.chapters.map(item => {
      if (!item || typeof item !== 'object') return item;
      const chapter = item as Record<string, unknown>;
      return { ...chapter, id: lookup(chapter.id), sceneIds: Array.isArray(chapter.sceneIds) ? chapter.sceneIds.map(lookup) : chapter.sceneIds };
    });
    if (Array.isArray(state.scenes)) state.scenes = state.scenes.map(item => {
      if (!item || typeof item !== 'object') return item;
      const scene = item as Record<string, unknown>;
      return { ...scene, id: lookup(scene.id), chapterId: lookup(scene.chapterId) };
    });
    return state;
  }

  if (patch.scope === 'entity' && patch.itemId) {
    const owner = selectedVersionContent.entities.find(entity => entity.id === patch.itemId)
      ?? alternative.baseContent.entities.find(entity => entity.id === patch.itemId);
    if (patch.path.length === 0 && value && typeof value === 'object' && 'kind' in value && 'data' in value) {
      const mapped = rewriteLocalEntity(value as Entity, idMap);
      rewriteDeclarations(mapped.data, idMap);
      return mapped;
    }
    if (owner && patch.path.length) {
      const withPatch = setPathValue(owner, patch.path, value);
      const mapped = rewriteLocalEntity(withPatch, idMap);
      rewriteDeclarations(mapped.data, idMap);
      return pathValue(mapped, patch.path);
    }
  }

  if (patch.scope === 'relation' && patch.itemId) {
    const owner = selectedVersionContent.relations.find(relation => relation.id === patch.itemId)
      ?? alternative.baseContent.relations.find(relation => relation.id === patch.itemId);
    if (patch.path.length === 0 && value && typeof value === 'object' && 'relationType' in value) return rewriteRelationReferences(value as Relation, idMap);
    if (owner && patch.path.length) return pathValue(rewriteRelationReferences(setPathValue(owner, patch.path, value), idMap), patch.path);
  }

  if (patch.scope === 'project' && patch.path[0] === 'worldReferences') return structuredClone(value);
  if (patch.scope === 'project' && patch.path.length === 1 && patch.path[0] === 'calendarId' && typeof value === 'string') return idMap[value] ?? value;
  if (patch.scope === 'project' && patch.path.length === 1 && patch.path[0] === 'calendars' && Array.isArray(value)) {
    return value.map(calendar => calendar && typeof calendar === 'object' ? { ...(calendar as Record<string, unknown>), id: typeof (calendar as Record<string, unknown>).id === 'string' ? idMap[(calendar as Record<string, unknown>).id as string] ?? (calendar as Record<string, unknown>).id : (calendar as Record<string, unknown>).id } : calendar);
  }
  return rewriteBranchValue(value, idMap, patch.path.at(-1) ?? '');
}

function mappedStructurePlan(plan: NonNullable<AuthorAlternative['versions'][number]['structurePlan']>, lookup: (id: string) => string) {
  return { ...structuredClone(plan), chapterId: lookup(plan.chapterId), templateId: lookup(plan.templateId), assignments: Object.fromEntries(Object.entries(plan.assignments).map(([beat, id]) => [beat, lookup(id)])) };
}

export async function mapImportedProject(source: ProjectData, target: ProjectData, idMap: Record<string, string>, signal?: AbortSignal): Promise<ProjectData> {
  const lookup = (id: string) => idMap[id] ?? id;
  const state = async <T extends ProjectContent | ContentState>(input: T): Promise<T> => {
    checkCancelled(signal);
    const content = structuredClone(input);
    content.projectId = lookup(input.projectId);
    content.entities = input.entities.map(entity => { const mapped = rewriteLocalEntity(entity, idMap); mapped.id = lookup(entity.id); mapped.projectId = lookup(entity.projectId); rewriteDeclarations(mapped.data, idMap); if (mapped.deletionOperationId) mapped.deletionOperationId = lookup(mapped.deletionOperationId); return mapped; });
    content.relations = input.relations.map(relation => ({ ...rewriteRelationReferences(relation, idMap), id: lookup(relation.id), projectId: lookup(relation.projectId), ...(relation.deletionOperationId ? { deletionOperationId: lookup(relation.deletionOperationId) } : {}) }));
    content.views = input.views.map(view => ({ ...structuredClone(view), id: lookup(view.id), entityIds: view.entityIds.map(lookup) }));
    // Approved hashes include speaker/cue references. Translate only approvals matching their exact old content.
    for (let index = 0; index < input.entities.length; index++) {
      const original = input.entities[index], mapped = content.entities[index];
      if ((original.kind === 'localization' || original.kind === 'recording') && (mapped.kind === 'localization' || mapped.kind === 'recording')) {
        const oldLine = input.entities.find((entity): entity is Entity<'dialogue_line'> => entity.kind === 'dialogue_line' && entity.id === original.data.sourceLineId);
        const newLine = content.entities.find((entity): entity is Entity<'dialogue_line'> => entity.kind === 'dialogue_line' && entity.id === mapped.data.sourceLineId);
        if (oldLine && newLine && original.data.sourceHash === await dialogueContentHash({ ...source, ...input }, oldLine)) mapped.data.sourceHash = await dialogueContentHash({ ...source, ...content }, newLine);
      }
    }
    const sourceAlternatives = 'authorAlternatives' in input ? (input as ContentState).authorAlternatives : undefined;
    if (Array.isArray(sourceAlternatives)) {
      const mappedAlternatives = await Promise.all(sourceAlternatives.map(async (alternative): Promise<AuthorAlternative> => {
        const branch = structuredClone(alternative);
        branch.id = lookup(alternative.id); branch.projectId = lookup(alternative.projectId);
        branch.sourceSnapshotId = alternative.sourceSnapshotId ? lookup(alternative.sourceSnapshotId) : null;
        branch.baseContent = await state(alternative.baseContent);
        branch.versions = await Promise.all(alternative.versions.map(async version => ({ ...structuredClone(version), id: lookup(version.id), parentVersionId: version.parentVersionId ? lookup(version.parentVersionId) : null,
          content: await state(version.content), ...(version.structurePlan ? { structurePlan: mappedStructurePlan(version.structurePlan, lookup) } : {}) })));
        branch.headVersionId = lookup(alternative.headVersionId);
        branch.applyReceipts = alternative.applyReceipts.map(receipt => {
          const selectedVersionContent = alternative.versions.find(version => version.id === receipt.alternativeVersionId)?.content ?? alternative.baseContent;
          const patches = receipt.patches.map(patch => {
            const itemId = patch.itemId ? lookup(patch.itemId) : undefined, path = [...patch.path];
            const key = [patch.scope, itemId ?? '', ...path].map(part => encodeURIComponent(part)).join(':');
            return { ...structuredClone(patch), key, ...(itemId ? { itemId } : {}), path,
              before: { ...structuredClone(patch.before), ...(patch.before.present ? { value: mapPatchValue(patch.before.value, patch, alternative, selectedVersionContent, idMap) } : {}) },
              after: { ...structuredClone(patch.after), ...(patch.after.present ? { value: mapPatchValue(patch.after.value, patch, alternative, selectedVersionContent, idMap) } : {}) } };
          });
          return { ...structuredClone(receipt), id: lookup(receipt.id), alternativeVersionId: receipt.alternativeVersionId ? lookup(receipt.alternativeVersionId) : undefined,
            sourceSnapshotId: receipt.sourceSnapshotId ? lookup(receipt.sourceSnapshotId) : null, patches, selectedChangeKeys: patches.map(patch => patch.key).sort() };
        });
        return sealAuthorAlternative(branch);
      }));
      (content as ContentState).authorAlternatives = mappedAlternatives;
    }
    if ('snapshots' in content && 'snapshots' in input) content.snapshots = await Promise.all(input.snapshots.map(async snapshot => ({ ...structuredClone(snapshot), id: lookup(snapshot.id), content: await state(snapshot.content) })));
    return content;
  };
  const project: ProjectData = { ...await state(source), history: await Promise.all(source.history.map(async command => ({ ...structuredClone(command), operationId: lookup(command.operationId), projectId: lookup(command.projectId), targetIds: command.targetIds.map(lookup), before: await state(command.before), after: await state(command.after), ...(command.compensatesOperationId ? { compensatesOperationId: lookup(command.compensatesOperationId) } : {}), ...(command.importOrigin ? { importOrigin: { ...command.importOrigin, importOperationId: lookup(command.importOrigin.importOperationId) } } : {}), ...(command.idMap ? { idMap: Object.fromEntries(Object.entries(command.idMap).map(([oldId, currentId]) => [oldId, lookup(currentId)])) } : {}) }))) };
  const snapshots = new Map<string, ProjectSnapshot>();
  const visitStates = (callback: (state: ProjectContent | ContentState) => void) => {
    const visit = (content: ProjectContent | ContentState) => {
      callback(content);
      if ('snapshots' in content) for (const snapshot of content.snapshots) visit(snapshot.content);
      if ('authorAlternatives' in content && Array.isArray(content.authorAlternatives)) for (const alternative of content.authorAlternatives as AuthorAlternative[]) {
        visit(alternative.baseContent); for (const version of alternative.versions) visit(version.content);
      }
    };
    visit(project); for (const command of project.history) { visit(command.before); visit(command.after); }
  };
  visitStates(content => { if ('snapshots' in content) for (const snapshot of content.snapshots) snapshots.set(snapshot.id, snapshot); });
  const hashes = new Map<string, string>(), active = new Set<string>();
  const refresh = async (snapshot: ProjectSnapshot): Promise<string> => {
    if (hashes.has(snapshot.id)) return hashes.get(snapshot.id)!;
    if (active.has(snapshot.id)) throw new StorageError('HASH_MISMATCH', '版の内容hashに循環参照があります。', snapshot.id);
    active.add(snapshot.id);
    for (const entity of snapshot.content.entities) if (entity.kind === 'snapshot' && snapshots.has(entity.id)) entity.data.contentHash = await refresh(snapshots.get(entity.id)!);
    const hash = await sha256(jsonBytes(snapshot.content)); hashes.set(snapshot.id, hash); active.delete(snapshot.id); return hash;
  };
  for (const snapshot of snapshots.values()) await refresh(snapshot);
  visitStates(content => { for (const entity of content.entities) if (entity.kind === 'snapshot' && hashes.has(entity.id)) entity.data.contentHash = hashes.get(entity.id)!; if ('snapshots' in content) for (const snapshot of content.snapshots) { snapshot.contentHash = hashes.get(snapshot.id)!; for (const entity of snapshot.content.entities) if (entity.kind === 'snapshot' && hashes.has(entity.id)) entity.data.contentHash = hashes.get(entity.id)!; } });
  const resealBranches = async (content: ProjectContent | ContentState) => {
    if ('authorAlternatives' in content && Array.isArray(content.authorAlternatives)) content.authorAlternatives = await Promise.all((content.authorAlternatives as AuthorAlternative[]).map(sealAuthorAlternative));
  };
  for (const content of [project as ContentState, ...project.history.flatMap(command => [command.before, command.after])]) await resealBranches(content);
  // Binding an incoming record to an existing identity keeps the destination's immutable creation time.
  const existing = new Map(target.entities.map(entity => [entity.id, entity]));
  project.entities = project.entities.map(entity => existing.has(entity.id) ? { ...entity, createdAt: existing.get(entity.id)!.createdAt } as Entity : entity);
  return project;
}

const headerFields = ['name', 'calendarId', 'mainStart', 'calendars', 'worldReferences'] as const;
function mergePreview(target: ProjectData, incoming: ProjectData, resolutions: CrossProjectImportOptions['resolutions']): Pick<CrossProjectImportPlan, 'candidate' | 'conflicts' | 'unresolved' | 'changes'> {
  const conflicts: MappedImportConflict[] = [], changes: MappedImportChange[] = [];
  // A copy of content keeps the immutable lazy-history capability supplied by ScenarioStore.
  const candidate: ProjectData = { ...structuredClone({ ...target, history: [] }), history: target.history };
  for (const field of headerFields) if (!equalJson(target[field], incoming[field])) {
    const id = `project.${field}`;
    conflicts.push({ id, kind: 'project', existing: target[field], incoming: incoming[field] });
    const useIncoming = resolutions?.[id] === 'incoming';
    if (useIncoming) (candidate as unknown as Record<string, unknown>)[field] = structuredClone(incoming[field]);
    changes.push({ id, kind: 'project', action: useIncoming ? 'update' : 'keep', fields: [field] });
  }
  for (const [field, kind] of [['entities', 'entity'], ['relations', 'relation'], ['snapshots', 'snapshot'], ['views', 'view']] as const) {
    const previous = new Map<string, Entity | Relation | ProjectSnapshot | SavedView>(target[field].map(item => [item.id, item]));
    for (const item of incoming[field]) {
      const old = previous.get(item.id), differs = old && !equalJson(old, item);
      if (differs) conflicts.push({ id: item.id, kind, existing: old, incoming: item });
      if (!old || resolutions?.[item.id] === 'incoming') previous.set(item.id, structuredClone(item));
      const fields = Object.keys(item).filter(key => !old || !equalJson((old as unknown as Record<string, unknown>)[key] ?? null, (item as unknown as Record<string, unknown>)[key] ?? null));
      changes.push({ id: item.id, kind, action: !old ? 'add' : differs && resolutions?.[item.id] === 'incoming' ? 'update' : 'keep', fields });
    }
    (candidate as unknown as Record<string, unknown>)[field] = [...previous.values()];
  }
  const alternatives = new Map((target.authorAlternatives ?? []).map(alternative => [alternative.id, alternative]));
  for (const alternative of incoming.authorAlternatives ?? []) {
    const old = alternatives.get(alternative.id);
    if (old && !equalJson(old, alternative)) {
      conflicts.push({ id: alternative.id, kind: 'alternative', existing: old, incoming: alternative });
      if (resolutions?.[alternative.id] === 'incoming') throw new StorageError('IMPORT_CONFLICT', '保存済み作者別案のIDへ別の履歴を上書きできません。新しいIDへ対応してください。', alternative.id);
      changes.push({ id: alternative.id, kind: 'alternative', action: 'keep', fields: [] });
    } else if (!old) {
      alternatives.set(alternative.id, structuredClone(alternative));
      changes.push({ id: alternative.id, kind: 'alternative', action: 'add', fields: ['name', 'baseContent', 'versions', 'applyReceipts'] });
    } else changes.push({ id: alternative.id, kind: 'alternative', action: 'keep', fields: [] });
  }
  if (alternatives.size || 'authorAlternatives' in target || 'authorAlternatives' in incoming) candidate.authorAlternatives = [...alternatives.values()];
  const unresolved = conflicts.filter(conflict => !resolutions?.[conflict.id]).map(conflict => conflict.id);
  for (const conflict of conflicts) if (conflict.kind === 'snapshot' && resolutions?.[conflict.id] === 'incoming') throw new StorageError('IMMUTABLE_SNAPSHOT', '既存版を別の内容に置き換えられません。', conflict.id);
  return { conflicts, unresolved, changes, ...(!unresolved.length ? { candidate } : {}) };
}

/** Isolated, non-mutating review. Atomic commit belongs to ScenarioStore's existing import transaction. */
export async function planCrossProjectImport(source: PreparedScenario, target: ProjectData, options: CrossProjectImportOptions): Promise<CrossProjectImportPlan> {
  checkCancelled(options.signal);
  const worlds = { ...(options.knownWorlds ?? {}) };
  for (const [id, world] of Object.entries(source.worlds)) {
    if (worlds[id] && !equalJson(worlds[id], world)) throw new StorageError('IMMUTABLE_SNAPSHOT', '固定世界IDと内容が衝突します。', id);
    worlds[id] = world;
  }
  const worldSnapshots = worldSnapshotContents(worlds);
  const checked = validateProject(source.project, { worldSnapshots }); if (!checked.ok) throw validationError(checked.issues);
  const checkedTarget = validateProject(target, { worldSnapshots }); if (!checkedTarget.ok) throw validationError(checkedTarget.issues);
  if (source.manifest.projectId !== source.project.projectId) throw new StorageError('VALIDATION_FAILED', 'manifestと作品のIDが一致しません。');
  verifyWorlds([source.project, target, ...Object.values(worlds)], worlds);
  await verifySnapshotHashes([source.project, target, ...Object.values(worlds)]);
  for (const [id, resolution] of Object.entries(options.resolutions ?? {})) if (!['existing', 'incoming'].includes(resolution)) throw new StorageError('IMPORT_CONFLICT', '競合の採用方法が未対応です。', id);
  const idMap = validateMap(source.project, target, options.idMap);
  const mappedProject = await mapImportedProject(source.project, target, idMap, options.signal);
  const mapped = validateProject(mappedProject, { worldSnapshots }); if (!mapped.ok) throw validationError(mapped.issues);
  await verifySnapshotHashes([mappedProject]);
  const metadata = new Map<string, ReturnType<typeof attachmentMetadata>[number]>();
  for (const project of [source.project, ...Object.values(source.worlds)]) for (const attachment of attachmentMetadata(project)) {
    const old = metadata.get(attachment.contentHash);
    if (old && !equalJson(old, attachment)) throw new StorageError('ASSET_INVALID', '同じ素材hashのメタデータが一致しません。', attachment.assetPath);
    metadata.set(attachment.contentHash, attachment);
  }
  const provided = new Map<string, Uint8Array>();
  for (const asset of source.assets) {
    checkCancelled(options.signal);
    const declared = metadata.get(asset.contentHash);
    if (!declared || declared.assetPath !== asset.path || declared.mediaType !== asset.mediaType) throw new StorageError('ASSET_INVALID', '素材bytesの宣言と添付が一致しません。', asset.path);
    validateAsset(asset.path, asset.mediaType, asset.bytes);
    if (asset.bytes.byteLength !== declared.byteSize || await sha256(asset.bytes) !== asset.contentHash) throw new StorageError('HASH_MISMATCH', '素材bytes・サイズ・hashが一致しません。', asset.path);
    if (provided.has(asset.contentHash)) throw new StorageError('ASSET_INVALID', '素材bytesが重複しています。', asset.path);
    provided.set(asset.contentHash, asset.bytes);
  }
  const reused: string[] = [], missing: string[] = [];
  for (const [hash, attachment] of metadata) if (!provided.has(hash)) {
    const bytes = await options.loadAsset?.(hash); checkCancelled(options.signal);
    if (!bytes) { missing.push(hash); continue; }
    validateAsset(attachment.assetPath, attachment.mediaType, bytes);
    if (bytes.byteLength !== attachment.byteSize || await sha256(bytes) !== hash) throw new StorageError('HASH_MISMATCH', '端末内の素材bytesが宣言と一致しません。', attachment.assetPath);
    reused.push(hash);
  }
  if (source.manifest.assetMode === 'embedded' && missing.length) throw new StorageError('ASSET_MISSING', '完全復元に必要な素材が不足しています。', missing[0]);
  const preview = mergePreview(target, mappedProject, options.resolutions);
  const reverse = new Map(Object.entries(idMap).map(([original, mapped]) => [mapped, original]));
  for (const change of preview.changes) if (reverse.has(change.id)) change.sourceId = reverse.get(change.id);
  if (preview.candidate) { const result = validateCurrentProject(preview.candidate, { worldSnapshots }); if (!result.ok) throw validationError(result.issues); }
  checkCancelled(options.signal);
  return { sourceProjectId: source.project.projectId, targetProjectId: target.projectId, targetRevision: target.revision, sourceContentHash: await sha256(jsonBytes(source.project)), idMap, mappedProject, ...preview,
    assets: { provided: [...provided.keys()], reused, missing, byteSize: source.assets.reduce((sum, asset) => sum + asset.bytes.length, 0) }, warnings: [...source.warnings] };
}
