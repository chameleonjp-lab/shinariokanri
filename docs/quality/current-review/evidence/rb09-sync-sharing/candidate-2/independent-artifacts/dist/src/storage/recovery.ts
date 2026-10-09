import type { CommandRecord, ProjectContent, ProjectData } from '../domain/types';
import { ID_PATTERN, validateProject } from '../domain/model';
import { validateProjectIntegrity } from '../domain/projectRecordValidation';
import { equalJson, jsonBytes, sha256 } from './json';
import { checkCancelled, StorageError } from './errors';

/** Portable pending intents are retained without account credentials or permission claims. */
export interface PortableRecovery {
  version: 1; projectId: string; sourceRevision: string; serverRevision: string;
  pending: { operationId: string; command: CommandRecord; commandHash: string; origin?: { projectId: string; operationId: string; serverRevision: string } }[];
}
export function recoveryImages(recovery?: PortableRecovery): ProjectData[] {
  return recovery?.pending.flatMap(item => [item.command.before, item.command.after].map(state => ({ ...state, history: [] }))) ?? [];
}
export function projectWithRecoveryHistory(project: ProjectData, recovery?: PortableRecovery): ProjectData {
  const history = new Map(project.history.map(command => [command.operationId, command]));
  for (const item of recovery?.pending ?? []) {
    const previous = history.get(item.operationId);
    if (previous && !equalJson(previous, item.command)) throw new StorageError('OPERATION_CONFLICT', '送信待ちの内容が保存履歴と一致しません。', item.operationId);
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
