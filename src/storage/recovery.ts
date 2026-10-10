import type { CommandRecord, ProjectContent, ProjectData } from '../domain/types';
import { ID_PATTERN, validateProject } from '../domain/model';
import { validateProjectIntegrity } from '../domain/projectRecordValidation';
import { equalJson, isValidUnicode, jsonBytes, sha256 } from './json';
import { checkCancelled, StorageError } from './errors';

/** Portable pending intents are retained without account credentials or permission claims. */
export interface PortableRecovery {
  version: 1; projectId: string; sourceRevision: string; serverRevision: string;
  pending: { operationId: string; command: CommandRecord; commandHash: string; origin?: { projectId: string; operationId: string; serverRevision: string } }[];
}
export function recoveryImages(recovery?: PortableRecovery): ProjectData[] {
  return recovery?.pending.flatMap(item => [item.command.before, item.command.after].map(state => ({ ...state, history: [] }))) ?? [];
}
// Compare private, plain JSON completely without expanding shared history repeatedly.
// A scope never escapes one synchronous projectWithRecoveryHistory invocation.
// Inputs eligible for memo are private plain-data JSON, not Proxy/live props.
// Other encodable values retain the existing canonical comparison.

function plainDataRecord(value: unknown): value is Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return (prototype === Object.prototype || prototype === null)
    && Reflect.ownKeys(value).every(key => 'value' in Object.getOwnPropertyDescriptor(value, key)!);
}

function denseDataArray(value: unknown): value is unknown[] {
  if (!Array.isArray(value) || Object.getPrototypeOf(value) !== Array.prototype
    || Object.getOwnPropertySymbols(value).length
    || Object.getOwnPropertyNames(value).length !== value.length + 1) return false;
  for (let index = 0; index < value.length; index++) {
    const descriptor = Object.getOwnPropertyDescriptor(value, String(index));
    if (!descriptor || !('value' in descriptor)) return false;
  }
  return true;
}

function canMemoizeRecoveryCommands(project: ProjectData, recovery?: PortableRecovery): boolean {
  if (!recovery || !plainDataRecord(project) || !plainDataRecord(recovery)) return false;
  const history = Object.getOwnPropertyDescriptor(project, 'history')?.value;
  const pending = Object.getOwnPropertyDescriptor(recovery, 'pending')?.value;
  return denseDataArray(history) && denseDataArray(pending)
    && history.every(command => plainDataRecord(command) && Object.hasOwn(command, 'operationId'))
    && pending.every(item => plainDataRecord(item) && Object.hasOwn(item, 'operationId') && Object.hasOwn(item, 'command'));
}

function recoveryCommandEquality(): (left: unknown, right: unknown) => boolean {
  let canonicalOnly = false;
  let validated = new WeakSet<object>();
  let fields = new WeakMap<object, string[]>();
  let equalPairs = new WeakMap<object, WeakSet<object>>();
  let pairCount = 0;
  const maximumMemoPairs = 65_536; // Cache eviction policy, not a data limit.

  function inspect(input: unknown, active: Set<object>): boolean {
    if (input === null || typeof input === 'boolean') return true;
    if (typeof input === 'string') {
      if (!isValidUnicode(input)) throw new StorageError('VALIDATION_FAILED', 'Unicodeのサロゲートが不正です。');
      return true;
    }
    if (typeof input === 'number') {
      if (!Number.isFinite(input)) throw new StorageError('VALIDATION_FAILED', '有限でない数値は保存できません。');
      return true;
    }
    if (typeof input !== 'object') throw new StorageError('VALIDATION_FAILED', 'JSONに保存できない値があります。');
    if (active.has(input)) throw new StorageError('VALIDATION_FAILED', '循環したJSONは保存できません。');
    if (validated.has(input)) return true;
    if (Array.isArray(input) ? !denseDataArray(input) : !plainDataRecord(input)) return false;
    active.add(input);
    try {
      if (Array.isArray(input)) {
        for (let index = 0; index < input.length; index++) if (!inspect(input[index], active)) return false;
      } else {
        // Preserve canonicalJson's omission and UTF-16 key-sort rules.
        // Object keys themselves are not newly Unicode-validated here: the
        // legacy encoder JSON.stringify's keys and validates string values.
        const record = input as Record<string, unknown>;
        const keys = Object.keys(record).filter(key => record[key] !== undefined).sort();
        for (const key of keys) if (!inspect(record[key], active)) return false;
        fields.set(input, keys);
      }
      validated.add(input);
      return true;
    } finally {
      active.delete(input);
    }
  }

  function same(left: unknown, right: unknown): boolean {
    // Identity is usable only after both complete inspections, including cycles.
    // === keeps finite -0 and +0 equal, matching JSON.stringify.
    if (left === right) return true;
    if (left === null || right === null || typeof left !== 'object' || typeof right !== 'object') return false;
    if (Array.isArray(left) !== Array.isArray(right)) return false;
    if (equalPairs.get(left)?.has(right)) return true;
    if (Array.isArray(left)) {
      const array = right as unknown[];
      if (left.length !== array.length) return false;
      for (let index = 0; index < left.length; index++) if (!same(left[index], array[index])) return false;
    } else {
      const leftKeys = fields.get(left)!, rightKeys = fields.get(right)!;
      if (leftKeys.length !== rightKeys.length) return false;
      for (let index = 0; index < leftKeys.length; index++) {
        const key = leftKeys[index];
        if (key !== rightKeys[index] || !same((left as Record<string, unknown>)[key], (right as Record<string, unknown>)[key])) return false;
      }
    }
    if (pairCount >= maximumMemoPairs) { equalPairs = new WeakMap<object, WeakSet<object>>(); pairCount = 0; }
    let rights = equalPairs.get(left);
    if (!rights) { rights = new WeakSet<object>(); equalPairs.set(left, rights); }
    rights.add(right); // Publish only a fully completed equality proof.
    pairCount++;
    return true;
  }

  return (left, right) => {
    if (canonicalOnly) return equalJson(left, right);
    if (!inspect(left, new Set<object>()) || !inspect(right, new Set<object>())) {
      // Accessors/class instances/sparse arrays can have legacy semantics or
      // side effects. Drop proofs and never memoize again in this invocation.
      canonicalOnly = true;
      validated = new WeakSet<object>(); fields = new WeakMap<object, string[]>(); equalPairs = new WeakMap<object, WeakSet<object>>();
      pairCount = 0;
      return equalJson(left, right);
    }
    return same(left, right);
  };
}

export function projectWithRecoveryHistory(project: ProjectData, recovery?: PortableRecovery): ProjectData {
  const equalCommand = canMemoizeRecoveryCommands(project, recovery) ? recoveryCommandEquality() : equalJson;
  const history = new Map(project.history.map(command => [command.operationId, command]));
  for (const item of recovery?.pending ?? []) {
    const previous = history.get(item.operationId);
    if (previous && !equalCommand(previous, item.command)) throw new StorageError('OPERATION_CONFLICT', '送信待ちの内容が保存履歴と一致しません。', item.operationId);
    history.set(item.operationId, item.command);
  }
  return { ...project, history: [...history.values()] };
}
export async function validateRecovery(input: unknown, project: ProjectData, worlds: Record<string, ProjectContent>, signal?: AbortSignal): Promise<PortableRecovery> {
  const invalid = (message: string, path = 'data/recovery.json'): never => { throw new StorageError('VALIDATION_FAILED', message, path); };
  if (!input || typeof input !== 'object' || Array.isArray(input)) return invalid('送信待ち復元情報はオブジェクトです。');
  const raw = input as Record<string, unknown>;
  if (Object.keys(raw).some(key => !['version', 'projectId', 'sourceRevision', 'serverRevision', 'pending'].includes(key)) || raw.version !== 1 || raw.projectId !== project.projectId || raw.sourceRevision !== project.revision || typeof raw.serverRevision !== 'string' || !/^(0|[1-9]\d*)$/.test(raw.serverRevision) || !Array.isArray(raw.pending) || raw.pending.length > 100_000) return invalid('送信待ち復元情報の版・作品・基底版・件数が不正です。');
  const recovery = structuredClone(input) as PortableRecovery, seen = new Set<string>();
  for (const item of recovery.pending) {
    checkCancelled(signal);
    if (!item || typeof item !== 'object' || Object.keys(item).some(key => !['operationId', 'command', 'commandHash', 'origin'].includes(key)) || !ID_PATTERN.test(item.operationId) || seen.has(item.operationId) || typeof item.commandHash !== 'string' || !/^[0-9a-f]{64}$/.test(item.commandHash)) return invalid('送信待ちの操作IDまたはhashが不正・重複しています。');
    if ('origin' in item && (!item.origin || typeof item.origin !== 'object' || Array.isArray(item.origin) || Object.keys(item.origin).some(key => !['projectId', 'operationId', 'serverRevision'].includes(key)) || !ID_PATTERN.test(item.origin.projectId) || !ID_PATTERN.test(item.origin.operationId) || !/^(0|[1-9]\d*)$/.test(item.origin.serverRevision))) return invalid('送信待ちの元操作の記録が不正です。');
    seen.add(item.operationId);
    if (!item.command || item.command.operationId !== item.operationId || item.command.projectId !== project.projectId || await sha256(jsonBytes(item.command)) !== item.commandHash) return invalid('送信待ち操作の内容が固定したhashと一致しません。');
    const recordProject = { ...item.command.after, history: [item.command] };
    const validation = validateProject(recordProject, { worldSnapshots: worlds }); if (!validation.ok) return invalid(validation.issues.map(issue => `${issue.path}: ${issue.message}`).join('\n'));
    for (const image of recoveryImages({ ...recovery, pending: [item] })) {
      const issues = await validateProjectIntegrity(image, { worldSnapshots: worlds }, false); if (issues.length) return invalid(issues.map(issue => issue.message).join('\n'));
    }
  }
  projectWithRecoveryHistory(project, recovery);
  return recovery;
}
