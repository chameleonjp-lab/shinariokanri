import type {ProjectContent, ProjectData} from '../domain/types';
import {ENTITY_KINDS, ENTITY_SCHEMAS, RELATION_TYPES, SCOPES, STATUSES, validateProject} from '../domain/model';
import {createProjectValidationSession, validateProjectIntegrity} from '../domain/projectRecordValidation';
import {captureImmutablePlainData, freezeCapturedPlainData} from '../domain/immutablePlainData';
import {createImmutableRecordInterningSession, internImmutableRecords} from '../domain/internImmutableRecords';
import {verifySnapshotHashes, verifyWorlds, type PreparedScenario} from './archiveData';
import {cloneProject} from './clone';
import {collectImportIds, createNativeWorkerImportIdCollector, planCrossProjectImport, type CrossProjectImportPlan, type ImportId} from './importMapping';
import type {ImportConflict} from './store';
import {createRecoveryValidationSession, projectWithRecoveryHistory, validateRecovery, type PortableRecovery} from './recovery';
import {validateSyncRecovery, type NativeSyncRecovery} from './syncRecovery';
import {createSharedArrayJsonEncoder} from './sharedArrayJson';
import {equalJson, isValidUnicode, jsonBytes, sha256, validateJsonValue} from './json';
import {checkCancelled, StorageError} from './errors';

export type ImportWorkStep = 'full_read' | 'structure' | 'worlds' | 'hashes' | 'integrity' | 'recovery' | 'sync_recovery' | 'ids' | 'clone' | 'map_recovery' | 'rehash_recovery' | 'mapped_plan' | 'merge_conflicts' | 'merge' | 'combine_history';
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

const immutableImportValidationSteps: ReadonlySet<ImportWorkStep> = new Set([
  'full_read', 'structure', 'integrity', 'recovery', 'ids', 'hashes', 'map_recovery', 'rehash_recovery',
]);

const maximumGuardRecordPairs = 100_000, maximumGuardArrayPairs = 128;
type RecoveryValidationSession = ReturnType<typeof createRecoveryValidationSession>;

function isTypedValidationRecord(value: object): boolean {
  const row = value as Record<string, unknown>;
  return typeof row.id === 'string' && typeof row.projectId === 'string'
    && (typeof row.kind === 'string' && !!row.data && typeof row.data === 'object'
      || typeof row.relationType === 'string' && typeof row.fromId === 'string' && typeof row.toId === 'string');
}

type CapturedGraphArrayEdge = 'other' | 'entities' | 'relations' | 'calendars';

/** Compare only already-owned immutable graphs. Cache completed typed-record
 * pairs and at most 128 arrays first compared through entity, relation, or
 * calendar edges; unselected edges do not add arrays to the memo. */
export function createCapturedGraphComparer(): (left: unknown, right: unknown) => boolean {
  const completedPairs = new WeakMap<object, WeakSet<object>>();
  let recordPairs = 0, arrayPairs = 0;
  const hasPair = (left: object, right: object) => completedPairs.get(left)?.has(right) ?? false;
  const rememberPair = (left: object, right: object, array: boolean, record: boolean, cacheArray: boolean) => {
    if (record ? recordPairs >= maximumGuardRecordPairs : array ? !cacheArray || arrayPairs >= maximumGuardArrayPairs : true) return;
    let rights = completedPairs.get(left);
    if (!rights) { rights = new WeakSet<object>(); completedPairs.set(left, rights); }
    rights.add(right);
    if (record) recordPairs++; else if (array) arrayPairs++;
  };
  const same = (left: unknown, right: unknown, depth = 0, arrayEdge: CapturedGraphArrayEdge = 'other'): boolean => {
    if (Object.is(left, right)) return true;
    if (!left || !right || typeof left !== 'object' || typeof right !== 'object' || depth > 128) return false;
    const leftArray = Array.isArray(left), rightArray = Array.isArray(right);
    if (leftArray !== rightArray || Object.getPrototypeOf(left) !== Object.getPrototypeOf(right)) return false;
    if (hasPair(left, right)) return true;
    const leftKeys = Reflect.ownKeys(left), rightKeys = Reflect.ownKeys(right);
    if (leftKeys.length !== rightKeys.length) return false;
    for (let index = 0; index < leftKeys.length; index++) {
      const key = leftKeys[index];
      if (key !== rightKeys[index]) return false;
      const leftDescriptor = Object.getOwnPropertyDescriptor(left, key), rightDescriptor = Object.getOwnPropertyDescriptor(right, key);
      if (!leftDescriptor || !rightDescriptor || leftDescriptor.enumerable !== rightDescriptor.enumerable
        || !Object.hasOwn(leftDescriptor, 'value') || !Object.hasOwn(rightDescriptor, 'value')
        || !same(leftDescriptor.value, rightDescriptor.value, depth + 1,
          key === 'entities' || key === 'relations' || key === 'calendars' ? key : 'other')) return false;
    }
    const cacheArray = leftArray && (arrayEdge === 'entities' || arrayEdge === 'relations' || arrayEdge === 'calendars');
    rememberPair(left, right, leftArray, isTypedValidationRecord(left), cacheArray);
    return true;
  };
  return same;
}

type WorkerValidationContext = {
  worldSnapshots: Record<string, ProjectContent>;
  schemas: typeof ENTITY_SCHEMAS;
  kinds: typeof ENTITY_KINDS;
  statuses: typeof STATUSES;
  scopes: typeof SCOPES;
  relationTypes: typeof RELATION_TYPES;
};

function isReusableContextGraph(input: unknown, active = new WeakSet<object>(), complete = new WeakSet<object>(), depth = 0): boolean {
  if (depth > 128) return false;
  if (input === undefined || input === null || typeof input === 'boolean') return true;
  if (typeof input === 'string') return isValidUnicode(input);
  if (typeof input === 'number') return Number.isFinite(input);
  if (typeof input !== 'object') return false;
  if (active.has(input)) return false;
  if (complete.has(input)) return true;
  const array = Array.isArray(input), prototype = Object.getPrototypeOf(input);
  if (array ? prototype !== Array.prototype : prototype !== Object.prototype && prototype !== null) return false;
  const keys = Reflect.ownKeys(input);
  if (keys.some(key => typeof key !== 'string' || !isValidUnicode(key) || ['__proto__', 'constructor', 'prototype'].includes(key))) return false;
  if (array && (keys.length !== input.length + 1 || keys.some(key => key !== 'length' && (!/^(0|[1-9]\d*)$/.test(String(key)) || Number(key) >= input.length)))) return false;
  active.add(input);
  for (const key of keys as string[]) {
    if (array && key === 'length') continue;
    const descriptor = Object.getOwnPropertyDescriptor(input, key);
    if (!descriptor?.enumerable || !Object.hasOwn(descriptor, 'value') || !isReusableContextGraph(descriptor.value, active, complete, depth + 1)) {
      active.delete(input); return false;
    }
  }
  active.delete(input); complete.add(input); return true;
}

function captureWorkerValidationContext(worlds: Record<string, ProjectContent>): WorkerValidationContext | undefined {
  const captured = captureImmutablePlainData({worldSnapshots: worlds, schemas: ENTITY_SCHEMAS, kinds: ENTITY_KINDS,
    statuses: STATUSES, scopes: SCOPES, relationTypes: RELATION_TYPES});
  return captured.captured && isReusableContextGraph(captured.value) ? captured.value : undefined;
}

type WorkerValidationSlot = {
  validationProject: ProjectData;
  context: WorkerValidationContext;
  session: RecoveryValidationSession;
};
type WorkerValidationTicket = {
  readonly validationProject?: ProjectData;
  session(worlds?: Record<string, ProjectContent>): RecoveryValidationSession;
  commit(validationProject: ProjectData): void;
};

function createWorkerValidationReuse(): {
  acquire(project: ProjectData, worlds: Record<string, ProjectContent>): WorkerValidationTicket | undefined;
  clear(): void;
} {
  let slot: WorkerValidationSlot | undefined, generation = 0;
  const clear = () => { slot = undefined; generation++; };
  const acquire = (project: ProjectData, worlds: Record<string, ProjectContent>): WorkerValidationTicket | undefined => {
    const context = captureWorkerValidationContext(worlds);
    if (!context) { clear(); return undefined; }
    if (slot) {
      const equal = createCapturedGraphComparer();
      if (equal(slot.context, context)) {
        const current = slot;
        const previousHistory = Object.getOwnPropertyDescriptor(current.validationProject, 'history')?.value;
        const incomingHistory = Object.getOwnPropertyDescriptor(project, 'history')?.value;
        const projectId = Object.getOwnPropertyDescriptor(project, 'projectId')?.value;
        const sameProject = projectId === current.validationProject.projectId;
        let matchedHistory = sameProject && Array.isArray(previousHistory) && Array.isArray(incomingHistory)
          && previousHistory.length > 0 && incomingHistory.length >= previousHistory.length;
        // Populate bounded proofs from recurring history before the separately
        // editable current image. IDs alone never establish correspondence.
        if (matchedHistory) for (let index = 0; index < previousHistory.length; index++) {
          if (!equal(previousHistory[index], incomingHistory[index])) { matchedHistory = false; break; }
        }
        const sameRevision = Object.getOwnPropertyDescriptor(project, 'revision')?.value === current.validationProject.revision;
        if (sameProject && sameRevision && Array.isArray(incomingHistory) && incomingHistory.length === current.validationProject.history.length
          && equal(current.validationProject, project)) {
          return {validationProject: current.validationProject, session: () => current.session, commit: (_validationProject: ProjectData) => undefined};
        }
        if (matchedHistory) {
          // Borrow only a completely equal immutable prefix for private
          // validation. Every command and the new current image still enter
          // the same full validator; publications keep the incoming topology.
          const history: ProjectData['history'] = [];
          for (let index = 0; index < incomingHistory.length; index++) Object.defineProperty(history, index, {
            value: index < previousHistory.length ? previousHistory[index] : incomingHistory[index], enumerable: true,
          });
          const validationProject = replaceCapturedDataField(project, 'history', Object.freeze(history));
          if (validationProject) {
            const ticketGeneration = generation;
            return {validationProject, session: () => current.session, commit: validated => {
              if (generation === ticketGeneration && slot === current) slot = {validationProject: validated, context, session: current.session};
            }};
          }
        }
      }
      clear();
    }
    const ticketGeneration = generation;
    let candidateSession: RecoveryValidationSession | undefined;
    return {
      session: sessionWorlds => {
        candidateSession ??= createRecoveryValidationSession(sessionWorlds ?? context.worldSnapshots);
        return candidateSession;
      },
      commit: validationProject => {
        if (candidateSession && generation === ticketGeneration) slot = {validationProject, context, session: candidateSession};
      },
    };
  };
  return {acquire, clear};
}

function replaceCapturedDataField<T extends object>(source: T, field: string, replacement: unknown): T | undefined {
  const array = Array.isArray(source);
  const copy: object = array ? new Array((source as unknown[]).length) : Object.create(Object.getPrototypeOf(source));
  let replaced = false;
  for (const key of Reflect.ownKeys(source)) {
    if (array && key === 'length') continue;
    const descriptor = Object.getOwnPropertyDescriptor(source, key);
    if (typeof key !== 'string' || !descriptor || !Object.hasOwn(descriptor, 'value')) return undefined;
    const value = key === field ? (replaced = true, replacement) : descriptor.value;
    Object.defineProperty(copy, key, {value, enumerable: descriptor.enumerable, writable: false, configurable: false});
  }
  if (!replaced) return undefined;
  return Object.freeze(copy) as T;
}

function recoveryWithCanonicalHistory(input: unknown, project: ProjectData): PortableRecovery | undefined {
  if (!input || typeof input !== 'object' || Array.isArray(input)) return undefined;
  const recovery = input as PortableRecovery;
  if (!Array.isArray(recovery.pending)) return undefined;
  const history = new Map(project.history.map(command => [command.operationId, command]));
  const same = createCapturedGraphComparer(), pending: PortableRecovery['pending'] = [];
  for (const item of recovery.pending) {
    if (!item || typeof item !== 'object' || Array.isArray(item)) return undefined;
    const command = history.get(item.operationId);
    if (!command || !same(item.command, command)) return undefined;
    const canonicalItem = replaceCapturedDataField(item, 'command', command);
    if (!canonicalItem) return undefined;
    pending.push(canonicalItem);
  }
  return replaceCapturedDataField(recovery, 'pending', Object.freeze(pending));
}

/** Freeze only private transport copies whose work is read-only validation.
 * Result-bearing transformations retain their existing mutable/frozen output
 * contracts and continue on the original path. Unsupported graphs are left
 * wholly untouched by freezeCapturedPlainData's all-or-none proof. */
export function freezeCapturedImportWork(work: ImportWork): ImportWork {
  if (immutableImportValidationSteps.has(work.step)) freezeCapturedPlainData(work);
  return work;
}

/** Return a mutable copy without exposing aliases introduced only for private validation/encoding. */
function cloneMutableCaptured<T>(input: T): T {
  const copies = new WeakMap<object, object>();
  const copy = (value: unknown): unknown => {
    if (!value || typeof value !== 'object') return value;
    const existing = copies.get(value); if (existing) return existing;
    const array = Array.isArray(value), output: unknown[] | Record<string, unknown> = array ? new Array((value as unknown[]).length) : Object.create(Object.getPrototypeOf(value));
    copies.set(value, output);
    for (const key of Reflect.ownKeys(value)) {
      if (array && key === 'length') continue;
      const descriptor = Object.getOwnPropertyDescriptor(value, key);
      if (typeof key !== 'string' || !descriptor || !Object.hasOwn(descriptor, 'value')) throw new TypeError('Captured plain data changed shape before mutable clone');
      Object.defineProperty(output, key, {value: copy(descriptor.value), enumerable: descriptor.enumerable, writable: true, configurable: true});
    }
    return output;
  };
  return copy(input) as T;
}

type CapturedPublisher = <T>(value: T) => T;
function publishWorkerCaptured<T>(value: T): T { return value; }

/** The same pure checks and transformations run in Node or the browser worker.
 * No database, account authority or mutable target is available here. */
async function runImportWorkCore(work: ImportWork, signal: AbortSignal | undefined,
  loadAsset: ((hash: string) => Promise<Uint8Array | undefined> | Uint8Array | undefined) | undefined,
  publishCaptured: CapturedPublisher, workerReuse?: ReturnType<typeof createWorkerValidationReuse>,
  nativeWorkerMessage = false, intern = internImmutableRecords): Promise<ImportWorkResult> {
  checkCancelled(signal);
  const {project, worlds, recovery} = work;
  let result: ImportWorkResult = {};
  let commitValidation: (() => void) | undefined;
  switch (work.step) {
    case 'full_read': {
      // One read owns the complete manuscript and exact fixed dependencies.
      // Only successful proofs over this private immutable capture can share
      // structural work; unsupported graphs retain the uncached checks.
      const owned = intern(captureImmutablePlainData({project, worlds, knownWorlds: work.knownWorlds ?? {}}).value);
      const validation = createProjectValidationSession({worldSnapshots: owned.worlds});
      const structural = validation.validate(owned.project);
      if (!structural.ok) throw Object.assign(new StorageError('VALIDATION_FAILED', structural.issues.map(issue => `${issue.path}: ${issue.message}`).join('\n')), {issues: structural.issues});
      validateJsonValue(structural.value);
      checkCancelled(signal);
      verifyWorlds([owned.project], owned.knownWorlds);
      checkCancelled(signal);
      await verifySnapshotHashes([owned.project]);
      checkCancelled(signal);
      const issues = await validation.integrity(owned.project, owned.project.history.length > 0);
      if (issues.length) throw Object.assign(new StorageError('VALIDATION_FAILED', issues.map(issue => `${issue.path}: ${issue.message}`).join('\n')), {issues});
      // The caller retains its private database image. Sending the entire
      // history back would add a discarded transfer without a new proof.
      break;
    }
    case 'structure': {
      const captured = captureImmutablePlainData(project);
      if (captured.captured) {
        // Each imported image owns a fresh full validation scope. Worker input
        // is an untrusted mutable DTO; only the private capture can share
        // record/content checks across its current, snapshots, and history.
        const ticket = workerReuse?.acquire(captured.value, worlds);
        if (workerReuse && !ticket) workerReuse.clear();
        const validationProject = ticket?.validationProject ?? intern(captured.value);
        const validation = ticket?.session() ?? createProjectValidationSession({worldSnapshots: worlds});
        const structural = validation.validate(validationProject);
        if (!structural.ok) throw Object.assign(new StorageError('VALIDATION_FAILED', structural.issues.map(issue => `${issue.path}: ${issue.message}`).join('\n')), {issues: structural.issues});
        validateJsonValue(structural.value);
        if (ticket) commitValidation = () => ticket.commit(validationProject);
        // Publish the pre-intern capture: the public runner clones it to keep
        // its mutable contract; the worker runner lets postMessage clone it.
        result.project = publishCaptured(captured.value);
      } else {
        // Unsupported own-data graphs retain the complete uncached validator.
        workerReuse?.clear();
        const validation = validateProject(project, {worldSnapshots: worlds});
        if (!validation.ok) throw Object.assign(new StorageError('VALIDATION_FAILED', validation.issues.map(issue => `${issue.path}: ${issue.message}`).join('\n')), {issues: validation.issues});
        validateJsonValue(validation.value);
        result.project = validation.value;
      }
      break;
    }
    case 'worlds': verifyWorlds([project], work.knownWorlds ?? {}); break;
    case 'hashes': await verifySnapshotHashes([project]); break;
    case 'integrity': {
      const captured = captureImmutablePlainData({project, worlds});
      let issues: Awaited<ReturnType<typeof validateProjectIntegrity>>;
      if (captured.captured) {
        const ticket = workerReuse?.acquire(captured.value.project, captured.value.worlds);
        if (workerReuse && !ticket) workerReuse.clear();
        const owned = ticket?.validationProject ? undefined : intern(captured.value);
        const validationProject = ticket?.validationProject ?? owned!.project;
        const validation = ticket?.session(owned?.worlds) ?? createProjectValidationSession({worldSnapshots: owned!.worlds});
        issues = await validation.integrity(validationProject, validationProject.history.length > 0);
        if (!issues.length && ticket) commitValidation = () => ticket.commit(validationProject);
      } else {
        workerReuse?.clear();
        issues = await validateProjectIntegrity(project, {worldSnapshots: worlds}, project.history.length > 0);
      }
      if (issues.length) throw Object.assign(new StorageError('VALIDATION_FAILED', issues.map(issue => `${issue.path}: ${issue.message}`).join('\n')), {issues});
      break;
    }
    case 'recovery': {
      const captured = captureImmutablePlainData({project, recovery, worlds});
      if (captured.captured) {
        const ticket = workerReuse?.acquire(captured.value.project, captured.value.worlds);
        if (workerReuse && !ticket) workerReuse.clear();
        if (ticket?.validationProject) {
          const reusableRecovery = captured.value.recovery
            ? recoveryWithCanonicalHistory(captured.value.recovery, ticket.validationProject) : undefined;
          if (reusableRecovery) {
            await ticket.session().recoveryForInspection(reusableRecovery, ticket.validationProject, signal);
          } else {
            // A pending-only command or any command difference follows the
            // existing fresh validation path. The old proof scope is discarded.
            workerReuse?.clear();
            const owned = intern(captured.value);
            await validateRecovery(owned.recovery, owned.project, owned.worlds, signal);
          }
        } else {
          if (ticket) workerReuse?.clear();
          const owned = intern(captured.value);
          await validateRecovery(owned.recovery, owned.project, owned.worlds, signal);
        }
        result.recovery = publishCaptured(captured.value.recovery!);
      } else {
        workerReuse?.clear();
        result.recovery = await validateRecovery(recovery, project, worlds, signal);
      }
      break;
    }
    case 'sync_recovery': result.syncRecovery = await validateSyncRecovery(work.syncRecovery, worlds, signal); break;
    case 'ids': {
      if (!nativeWorkerMessage) {
        // Preserve the original direct/Node capture path, but never use the
        // native Worker memo collector for callers outside MessageEvent data.
        const captured = captureImmutablePlainData({project, recovery});
        if (captured.captured) {
          const owned = intern(captured.value);
          result.ids = collectImportIds(projectWithRecoveryHistory(owned.project, owned.recovery));
        } else result.ids = collectImportIds(projectWithRecoveryHistory(project, recovery));
        break;
      }
      // Check the inherited reads and intrinsics used by projectWithRecoveryHistory
      // before that merge can inject values outside the native message graph.
      const collectNativeIds = createNativeWorkerImportIdCollector();
      if (!collectNativeIds) {
        const legacyCapture = captureImmutablePlainData({project, recovery});
        if (legacyCapture.captured) {
          const legacyOwned = intern(legacyCapture.value);
          result.ids = collectImportIds(projectWithRecoveryHistory(legacyOwned.project, legacyOwned.recovery));
        } else result.ids = collectImportIds(projectWithRecoveryHistory(project, recovery));
        break;
      }
      const captured = captureImmutablePlainData({project, recovery});
      if (!captured.captured) {
        result.ids = collectImportIds(projectWithRecoveryHistory(project, recovery));
        break;
      }
      const owned = intern(captured.value);
      // Capture the one merge for the memo collector; if proof fails, traverse
      // that same merge through the legacy path without repeating inherited reads.
      const merged = projectWithRecoveryHistory(owned.project, owned.recovery);
      const mergedCaptured = captureImmutablePlainData(merged);
      result.ids = mergedCaptured.captured ? collectNativeIds(mergedCaptured.value) : collectImportIds(merged);
      break;
    }
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
      const captured = captureImmutablePlainData({project, recovery, idMap: work.idMap});
      if (captured.captured) {
        const owned = intern(captured.value), history = new Map(captured.value.project.history.map(record => [record.operationId, record]));
        const hashHistory = new Map(owned.project.history.map(record => [record.operationId, record]));
        const pending: PortableRecovery['pending'] = [], encodeCommand = createSharedArrayJsonEncoder();
        for (const item of captured.value.recovery.pending) {
          checkCancelled(signal);
          const operationId = captured.value.idMap[item.operationId], command = history.get(operationId), hashCommand = hashHistory.get(operationId);
          if (!operationId || !command || !hashCommand) throw new StorageError('IMPORT_CONFLICT', '復元する送信待ち操作の明示ID対応が不足しています。', item.operationId);
          pending.push({operationId, command, commandHash: await sha256(encodeCommand(hashCommand)), origin: item.origin ?? {projectId: captured.value.recovery.projectId, operationId: item.operationId, serverRevision: captured.value.recovery.serverRevision}});
        }
        result.recovery = publishCaptured({...captured.value.recovery, projectId: captured.value.project.projectId, sourceRevision: captured.value.project.revision, pending});
      } else {
        const history = new Map(project.history.map(record => [record.operationId, record]));
        const pending: PortableRecovery['pending'] = [];
        for (const item of recovery.pending) {
          checkCancelled(signal);
          const operationId = work.idMap[item.operationId], command = history.get(operationId);
          if (!operationId || !command) throw new StorageError('IMPORT_CONFLICT', '復元する送信待ち操作の明示ID対応が不足しています。', item.operationId);
          pending.push({operationId, command, commandHash: await sha256(jsonBytes(command)), origin: item.origin ?? {projectId: recovery.projectId, operationId: item.operationId, serverRevision: recovery.serverRevision}});
        }
        result.recovery = {...recovery, projectId: project.projectId, sourceRevision: project.revision, pending};
      }
      break;
    }
    case 'rehash_recovery': {
      if (!recovery) throw new StorageError('VALIDATION_FAILED', '送信待ち復元情報がありません。');
      const captured = captureImmutablePlainData({project, recovery});
      if (captured.captured) {
        const owned = intern(captured.value), history = new Map(captured.value.project.history.map(record => [record.operationId, record]));
        const hashHistory = new Map(owned.project.history.map(record => [record.operationId, record]));
        const pending: PortableRecovery['pending'] = [], encodeCommand = createSharedArrayJsonEncoder();
        for (const [index, item] of captured.value.recovery.pending.entries()) {
          checkCancelled(signal);
          const hashItem = owned.recovery.pending[index]!;
          const command = history.get(item.operationId) ?? item.command, hashCommand = hashHistory.get(hashItem.operationId) ?? hashItem.command;
          pending.push({...item, command, commandHash: await sha256(encodeCommand(hashCommand))});
        }
        result.recovery = publishCaptured({...captured.value.recovery, projectId: captured.value.project.projectId, sourceRevision: captured.value.project.revision, pending});
      } else {
        const history = new Map(project.history.map(record => [record.operationId, record]));
        const pending: PortableRecovery['pending'] = [];
        for (const item of recovery.pending) {
          checkCancelled(signal);
          const command = history.get(item.operationId) ?? item.command;
          pending.push({...item, command, commandHash: await sha256(jsonBytes(command))});
        }
        result.recovery = {...recovery, projectId: project.projectId, sourceRevision: project.revision, pending};
      }
      break;
    }
    default: throw new StorageError('FORMAT_UNSUPPORTED', '読み込みの検査工程が未対応です。');
  }
  checkCancelled(signal);
  commitValidation?.();
  return result;
}

/** Public Node/direct-call path retains detached, editable captured results. */
export function runImportWork(work: ImportWork, signal?: AbortSignal, loadAsset?: (hash: string) => Promise<Uint8Array | undefined> | Uint8Array | undefined): Promise<ImportWorkResult> {
  return runImportWorkCore(work, signal, loadAsset, cloneMutableCaptured);
}

/** @internal Worker-only path. Its caller must immediately post the result so
 * the worker message clone is the mutable, detached publication boundary. */
export function runImportWorkForWorker(work: ImportWork, signal?: AbortSignal, loadAsset?: (hash: string) => Promise<Uint8Array | undefined> | Uint8Array | undefined): Promise<ImportWorkResult> {
  return runImportWorkCore(work, signal, loadAsset, publishWorkerCaptured);
}

/** A worker-owned scope for sequential import-work steps from one parsed archive.
 * Public/Node and one-off worker entry points deliberately keep fresh sessions. */
export function createImportWorkWorkerRunner() {
  const reuse = createWorkerValidationReuse();
  let interning = createImmutableRecordInterningSession();
  let active = 0;
  const runScoped = (work: ImportWork, signal: AbortSignal | undefined,
    loadAsset: ((hash: string) => Promise<Uint8Array | undefined> | Uint8Array | undefined) | undefined,
    nativeWorkerMessage: boolean): Promise<ImportWorkResult> => {
    const overlapping = active > 0;
    active++;
    if (overlapping) { reuse.clear(); interning = createImmutableRecordInterningSession(); }
    const currentInterning = interning;
    return runImportWorkCore(work, signal, loadAsset, publishWorkerCaptured,
      overlapping ? undefined : reuse, nativeWorkerMessage, overlapping ? internImmutableRecords : currentInterning.intern)
      .catch(error => { reuse.clear(); if (interning === currentInterning) interning = createImmutableRecordInterningSession(); throw error; })
      .finally(() => { active--; });
  };
  return {
    reset: () => { reuse.clear(); interning = createImmutableRecordInterningSession(); },
    run(work: ImportWork, signal?: AbortSignal, loadAsset?: (hash: string) => Promise<Uint8Array | undefined> | Uint8Array | undefined): Promise<ImportWorkResult> {
      return runScoped(work, signal, loadAsset, false);
    },
    /** @internal Only archive.worker.ts may call this for native MessageEvent.data. */
    runNativeClonedInput(work: ImportWork, signal?: AbortSignal, loadAsset?: (hash: string) => Promise<Uint8Array | undefined> | Uint8Array | undefined): Promise<ImportWorkResult> {
      return runScoped(work, signal, loadAsset, true);
    },
  };
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

