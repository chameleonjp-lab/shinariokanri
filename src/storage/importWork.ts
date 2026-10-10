import type {ProjectContent, ProjectData} from '../domain/types';
import {validateProject} from '../domain/model';
import {validateProjectIntegrity} from '../domain/projectRecordValidation';
import {verifySnapshotHashes, verifyWorlds, type PreparedScenario} from './archiveData';
import {cloneProject} from './clone';
import {collectImportIds, planCrossProjectImport, type CrossProjectImportPlan, type ImportId} from './importMapping';
import type {ImportConflict} from './store';
import {projectWithRecoveryHistory, validateRecovery, type PortableRecovery} from './recovery';
import {validateSyncRecovery, type NativeSyncRecovery} from './syncRecovery';
import {equalJson, jsonBytes, sha256, validateJsonValue} from './json';
import {checkCancelled, StorageError} from './errors';

export type ImportWorkStep = 'structure' | 'worlds' | 'hashes' | 'integrity' | 'recovery' | 'sync_recovery' | 'ids' | 'clone' | 'map_recovery' | 'rehash_recovery' | 'mapped_plan' | 'merge_conflicts' | 'merge' | 'combine_history';
export interface ImportWork {
  step: ImportWorkStep; project: ProjectData; worlds: Record<string, ProjectContent>;
  recovery?: PortableRecovery; syncRecovery?: NativeSyncRecovery[]; idMap?: Record<string, string>;
  target?: ProjectData; resolutions?: Record<string, 'existing' | 'incoming'>;
  knownWorlds?: Record<string, ProjectData>;
  mapped?: {source: PreparedScenario; knownWorlds: Record<string, ProjectData>};
}
export interface ImportWorkResult {
  project?: ProjectData; recovery?: PortableRecovery; syncRecovery?: NativeSyncRecovery[];
  ids?: ImportId[]; cloned?: {project: ProjectData; idMap: Record<string, string>};
  mappedPlan?: CrossProjectImportPlan; conflicts?: ImportConflict[]; history?: ProjectData['history'];
}

/** The same pure checks and transformations run in Node or the browser worker.
 * No database, account authority or mutable target is available here. */
export async function runImportWork(work: ImportWork, signal?: AbortSignal, loadAsset?: (hash: string) => Promise<Uint8Array | undefined> | Uint8Array | undefined): Promise<ImportWorkResult> {
  checkCancelled(signal);
  const {project, worlds, recovery} = work;
  let result: ImportWorkResult = {};
  switch (work.step) {
    case 'structure': {
      const validation = validateProject(project, {worldSnapshots: worlds});
      if (!validation.ok) throw Object.assign(new StorageError('VALIDATION_FAILED', validation.issues.map(issue => `${issue.path}: ${issue.message}`).join('\n')), {issues: validation.issues});
      validateJsonValue(validation.value);
      result.project = validation.value;
      break;
    }
    case 'worlds': verifyWorlds([project], work.knownWorlds ?? {}); break;
    case 'hashes': await verifySnapshotHashes([project]); break;
    case 'integrity': {
      const issues = await validateProjectIntegrity(project, {worldSnapshots: worlds}, project.history.length > 0);
      if (issues.length) throw Object.assign(new StorageError('VALIDATION_FAILED', issues.map(issue => `${issue.path}: ${issue.message}`).join('\n')), {issues});
      break;
    }
    case 'recovery': result.recovery = await validateRecovery(recovery, project, worlds, signal); break;
    case 'sync_recovery': result.syncRecovery = await validateSyncRecovery(work.syncRecovery, worlds, signal); break;
    case 'ids': result.ids = collectImportIds(projectWithRecoveryHistory(project, recovery)); break;
    case 'clone': result.cloned = await cloneProject(projectWithRecoveryHistory(project, recovery)); break;
    case 'mapped_plan': {
      if (!work.mapped || !work.target || !work.idMap) throw new StorageError('IMPORT_CONFLICT', '別作品の統合候補と全IDの明示対応が必要です。');
      const source = work.mapped.source;
      result.mappedPlan = await planCrossProjectImport({...source, project: projectWithRecoveryHistory(source.project, source.recovery)}, work.target, {
        idMap: work.idMap, resolutions: work.resolutions, knownWorlds: work.mapped.knownWorlds, loadAsset, signal,
      });
      break;
    }
    case 'merge_conflicts':
      if (!work.target) throw new StorageError('NOT_FOUND', '統合先がありません。');
      result.conflicts = mergeImportConflicts(work.target, project); break;
    case 'merge':
      if (!work.target) throw new StorageError('NOT_FOUND', '統合先がありません。');
      result.project = mergeImportProjects(work.target, project, work.resolutions ?? {}); break;
    case 'combine_history': {
      if (!work.target) throw new StorageError('NOT_FOUND', '統合先がありません。');
      const operations = new Map(work.target.history.map(command => [command.operationId, command]));
      for (const command of project.history) {
        const previous = operations.get(command.operationId);
        if (previous && !equalJson(previous, command)) throw new StorageError('IMPORT_CONFLICT', '同じ操作IDに異なる履歴があります。', command.operationId);
        if (!previous) operations.set(command.operationId, structuredClone(command));
      }
      result.history = [...operations.values()]; break;
    }
    case 'map_recovery': {
      if (!recovery || !work.idMap) throw new StorageError('IMPORT_CONFLICT', '復元する送信待ち操作の明示ID対応が不足しています。');
      const history = new Map(project.history.map(record => [record.operationId, record]));
      const pending: PortableRecovery['pending'] = [];
      for (const item of recovery.pending) {
        checkCancelled(signal);
        const operationId = work.idMap[item.operationId], command = history.get(operationId);
        if (!operationId || !command) throw new StorageError('IMPORT_CONFLICT', '復元する送信待ち操作の明示ID対応が不足しています。', item.operationId);
        pending.push({operationId, command, commandHash: await sha256(jsonBytes(command)), origin: item.origin ?? {projectId: recovery.projectId, operationId: item.operationId, serverRevision: recovery.serverRevision}});
      }
      result.recovery = {...recovery, projectId: project.projectId, sourceRevision: project.revision, pending};
      break;
    }
    case 'rehash_recovery': {
      if (!recovery) throw new StorageError('VALIDATION_FAILED', '送信待ち復元情報がありません。');
      const history = new Map(project.history.map(record => [record.operationId, record]));
      const pending: PortableRecovery['pending'] = [];
      for (const item of recovery.pending) {
        checkCancelled(signal);
        const command = history.get(item.operationId) ?? item.command;
        pending.push({...item, command, commandHash: await sha256(jsonBytes(command))});
      }
      result.recovery = {...recovery, projectId: project.projectId, sourceRevision: project.revision, pending};
      break;
    }
    default: throw new StorageError('FORMAT_UNSUPPORTED', '読み込みの検査工程が未対応です。');
  }
  checkCancelled(signal);
  return result;
}

export function mergeImportConflicts(existing: ProjectData, incoming: ProjectData): ImportConflict[] {
  const conflicts: ImportConflict[] = [];
  for (const field of ['name', 'calendarId', 'mainStart', 'calendars', 'worldReferences'] as const) if (!equalJson(existing[field], incoming[field])) conflicts.push({ id: `project.${field}`, kind: 'project', existing: existing[field], incoming: incoming[field] });
  for (const [field, kind] of [['entities', 'entity'], ['relations', 'relation'], ['snapshots', 'snapshot'], ['views', 'view'], ['authorAlternatives', 'alternative']] as const) {
    const map = new Map<string, unknown>((existing[field] ?? []).map(item => [item.id, item]));
    for (const item of incoming[field] ?? []) if (map.has(item.id) && !equalJson(map.get(item.id), item)) conflicts.push({ id: item.id, kind, existing: map.get(item.id), incoming: item });
  }
  return conflicts;
}

export function mergeImportProjects(existing: ProjectData, incoming: ProjectData, resolutions: Record<string, 'existing' | 'incoming'>): ProjectData {
  const conflicts = mergeImportConflicts(existing, incoming);
  for (const conflict of conflicts) {
    if (!resolutions[conflict.id]) throw new StorageError('IMPORT_CONFLICT', '同じID・異なる内容の競合があります。採用する内容を選択してください。', conflict.id);
    if (conflict.kind === 'snapshot' && resolutions[conflict.id] !== 'existing') throw new StorageError('IMMUTABLE_SNAPSHOT', '既存snapshotは別の内容へ置き換えられません。', conflict.id);
    if (conflict.kind === 'alternative' && resolutions[conflict.id] !== 'existing') throw new StorageError('IMPORT_CONFLICT', '保存済み作者別案のIDへ別の履歴を上書きできません。', conflict.id);
  }
  const next = structuredClone(existing);
  for (const field of ['name', 'calendarId', 'mainStart', 'calendars', 'worldReferences'] as const) if (resolutions[`project.${field}`] === 'incoming') (next as unknown as Record<string, unknown>)[field] = structuredClone(incoming[field]);
  for (const field of ['entities', 'relations', 'snapshots', 'views', 'authorAlternatives'] as const) {
    const map = new Map<string, unknown>((existing[field] ?? []).map(item => [item.id, item]));
    for (const item of incoming[field] ?? []) if (!map.has(item.id) || resolutions[item.id] === 'incoming') map.set(item.id, structuredClone(item));
    (next as unknown as Record<string, unknown>)[field] = [...map.values()];
  }
  return next;
}

