import type {CommandRecord, ContentState, ProjectData} from '../domain/types';
import {worldSnapshotContents, verifyWorlds, type PreparedScenario} from './archiveData';
import {checkCancelled, StorageError} from './errors';
import {freezeCapturedImportWork, type ImportWork, type ImportWorkResult, type ImportWorkStep} from './importWork';
import type {PortableRecovery} from './recovery';
import type {NativeSyncRecovery} from './syncRecovery';

export interface NewImportInput {
  project: ProjectData; recovery?: PortableRecovery; syncRecovery?: NativeSyncRecovery[];
  worlds: PreparedScenario['worlds']; knownWorlds: Record<string, ProjectData>;
  manifestProjectId: string; mode: 'new' | 'clone';
}
export interface NewImportFinalization {
  before: ContentState; after: ContentState; now: string; idMap?: Record<string, string>;
}
export interface NewImportCallbacks {
  stage(step: ImportWorkStep): void | Promise<void>;
  preview(): Promise<void>;
  assets(): Promise<void>;
  finalize(input: NewImportFinalization): Promise<CommandRecord>;
}
export interface NewImportResult {
  project: ProjectData; recovery?: PortableRecovery; syncRecovery: NativeSyncRecovery[];
  worlds: {id: string; project: ProjectData}[]; now: string; idMap?: Record<string, string>;
}
type Run = (work: ImportWork) => Promise<ImportWorkResult>;
const content = ({history: _history, ...state}: ProjectData): ContentState => state;

/** One private worker graph, with every original validation stage in its
 * original order. Only preview/asset checks and audit construction cross to
 * the store; no database mutation or authority is available in this worker. */
export async function runNewImportWork(input: NewImportInput, callbacks: NewImportCallbacks, run: Run,
  signal?: AbortSignal): Promise<NewImportResult> {
  const worldContents = worldSnapshotContents(input.knownWorlds);
  const work = async (step: ImportWorkStep, project: ProjectData, extra: Partial<ImportWork> = {}, report = true) => {
    checkCancelled(signal);
    if (report) await callbacks.stage(step);
    checkCancelled(signal);
    return run(freezeCapturedImportWork({step, project, worlds: worldContents, ...extra}));
  };
  let project = (await work('structure', input.project)).project!;
  let recovery = input.recovery ? (await work('recovery', project, {recovery: input.recovery})).recovery! : undefined;
  await work('ids', project, {recovery});
  verifyWorlds([project, ...Object.values(input.worlds)], input.knownWorlds);
  if (input.manifestProjectId !== project.projectId) throw new StorageError('VALIDATION_FAILED', '読み込み候補とmanifestの作品IDが一致しません。');
  await callbacks.preview();
  checkCancelled(signal);
  let idMap: Record<string, string> | undefined;
  if (input.mode === 'clone') {
    const cloned = (await work('clone', project, {recovery})).cloned!;
    idMap = cloned.idMap;
    recovery = recovery ? (await work('map_recovery', cloned.project, {worlds: {}, recovery, idMap}, false)).recovery! : undefined;
    const historyIds = new Set(project.history.map(command => idMap![command.operationId]));
    project = {...cloned.project, history: cloned.project.history.filter(command => historyIds.has(command.operationId))};
  }
  await callbacks.assets();
  await work('hashes', project);
  await work('integrity', project);
  const worlds: NewImportResult['worlds'] = [];
  for (const [id, world] of Object.entries(input.worlds)) worlds.push({id, project: (await work('structure', world)).project!});
  const now = new Date().toISOString();
  const before: ContentState = {...content(project), entities: [], relations: [], snapshots: [], views: [], revision: '0'};
  if (project.authorAlternatives?.length) before.authorAlternatives = []; else delete before.authorAlternatives;
  if (input.mode === 'clone') project = {...project, revision: (BigInt(project.revision) + 1n).toString()};
  project = (await work('structure', project)).project!;
  const command = await callbacks.finalize({before, after: content(project), now, idMap});
  if (input.mode === 'clone') project = {...project, history: [...project.history, command]};
  if (recovery) recovery = (await work('rehash_recovery', project, {recovery})).recovery!;
  project = (await work('structure', project)).project!;
  await work('integrity', project);
  if (recovery) recovery = (await work('recovery', project, {recovery: {...recovery, projectId: project.projectId, sourceRevision: project.revision}})).recovery!;
  const syncRecovery = input.syncRecovery ? (await work('sync_recovery', project, {syncRecovery: input.syncRecovery})).syncRecovery! : [];
  checkCancelled(signal);
  return {project, recovery, syncRecovery, worlds, now, idMap};
}
