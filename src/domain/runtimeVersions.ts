import type { ID, ProjectData } from './types';
import { validateProject } from './model';
import { jsonBytes, sha256 } from '../storage/json';
import { DomainValidationError } from './conditions';
import type { ProjectValidationOptions } from './model';
import { freezePinnedWorldRegistry, verifyPinnedWorlds } from './pinnedWorlds';
import type { PinnedWorldDigestCache } from './pinnedWorlds';
import { resolveReuseContent } from './reuse';

/** Verify immutable bytes before interpreting any captured references or runtime state. */
export async function captureRuntimeContent(project: ProjectData, contentVersionId: ID = project.projectId, validationOptions: ProjectValidationOptions = {}, digestCache?: PinnedWorldDigestCache): Promise<ProjectData> {
  const source = contentVersionId === project.projectId ? project : project.snapshots.find(snapshot => snapshot.id === contentVersionId);
  if (!source) throw new DomainValidationError([{ code: 'REFERENCE_INVALID', path: 'contentVersionId', message: '実行する固定版がありません。' }]);
  // Snapshot all mutable inputs before the first await so callers cannot swap the
  // captured edition or its borrowed worlds while their digests are checked.
  const worldSnapshots = validationOptions.worldSnapshots
    ? digestCache?.stableRegistries.has(validationOptions.worldSnapshots) ? validationOptions.worldSnapshots : digestCache ? freezePinnedWorldRegistry(validationOptions.worldSnapshots, digestCache) : structuredClone(validationOptions.worldSnapshots)
    : {};
  const worlds = validationOptions.worlds ? structuredClone(validationOptions.worlds) : undefined;
  const safeOptions = { ...validationOptions, worldSnapshots, worlds };
  const isSnapshot = 'content' in source;
  const sourceContent = structuredClone((isSnapshot ? source.content : source) as ProjectData);
  const sourceHash = isSnapshot ? source.contentHash : undefined;
  const sourceId = 'content' in source ? source.id : project.projectId;
  const snapshots = structuredClone(project.snapshots);
  const { authorAlternatives: _authorAlternatives, snapshots: _sourceSnapshots, history: _history, ...branchFreeContent } = sourceContent;
  const captured = { ...branchFreeContent, snapshots, history: [] } as ProjectData;
  if (sourceHash && await sha256(jsonBytes(branchFreeContent)) !== sourceHash) throw new DomainValidationError([{ code: 'INTEGRITY_FAILED', path: `snapshots.${sourceId}.contentHash`, message: '固定版の内容ハッシュが一致しません。実行を停止しました。' }]);
  const pins = new Set<ID>(), queue = [captured];
  for (let cursor = 0; cursor < queue.length; cursor++) for (const entity of queue[cursor].entities) if ((entity.kind === 'scene' || entity.kind === 'flow_node') && entity.data.reuse && entity.data.reuse.mode !== 'clone') {
    const pin = entity.data.reuse.pinnedSnapshotId; if (pins.has(pin)) continue; pins.add(pin);
    const snapshot = snapshots.find(item => item.id === pin);
    if (!snapshot || await sha256(jsonBytes(snapshot.content)) !== snapshot.contentHash) throw new DomainValidationError([{ code: 'INTEGRITY_FAILED', path: `snapshots.${pin}`, message: '共通元の固定版がないか、内容hashが一致しません。' }]);
    queue.push({ ...snapshot.content, snapshots, history: [] });
  }
  const worldIssues = await verifyPinnedWorlds(resolveReuseContent(captured, snapshots), worldSnapshots, 'worldReferences', digestCache);
  if (worldIssues.length) throw new DomainValidationError(worldIssues);
  const checked = validateProject(captured, safeOptions);
  if (!checked.ok) throw new DomainValidationError(checked.issues);
  return captured;
}

export function capturedVersionIssue(project: ProjectData, version: ID, revision: string, contentHash?: string): string | null {
  if (version === project.projectId) return project.revision === revision ? null : '試読開始後に作品が変わりました。保存した開始版で続けるか、開始し直してください。';
  const snapshot = project.snapshots.find(item => item.id === version);
  if (!snapshot) return '試読対象の固定版がありません。';
  return snapshot.content.revision === revision && (!contentHash || snapshot.contentHash === contentHash) ? null : '試読対象の固定版が変更されています。';
}
