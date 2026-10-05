import type { ProjectContent, ValidationIssue, WorldReference } from './types';
import { jsonBytes, sha256 } from '../storage/json';
export interface PinnedWorldClosure { worlds: ProjectContent[]; references: WorldReference[]; errors: string[] }
export interface PinnedWorldDigestCache {
  hashes: WeakMap<object, Map<string, Promise<string>>>;
  registryClones: WeakMap<object, Record<string, ProjectContent>>;
  stableRegistries: WeakSet<object>;
}
export function createPinnedWorldDigestCache(): PinnedWorldDigestCache { return { hashes: new WeakMap(), registryClones: new WeakMap(), stableRegistries: new WeakSet() }; }
/** Clone a caller-owned registry once for a durable validation run, then reuse that frozen image. */
export function freezePinnedWorldRegistry(snapshots: Record<string, ProjectContent>, cache: PinnedWorldDigestCache): Record<string, ProjectContent> {
  const existing = cache.registryClones.get(snapshots);
  if (existing) return existing;
  const frozen = structuredClone(snapshots);
  cache.registryClones.set(snapshots, frozen); cache.stableRegistries.add(frozen);
  return frozen;
}
/** One active immutable version per world project, including transitive dependencies. */
export function resolvePinnedWorlds(project: Pick<ProjectContent, 'worldReferences'>, snapshots: Record<string, ProjectContent>): PinnedWorldClosure {
  const worlds: ProjectContent[] = [], references: WorldReference[] = [], errors: string[] = [];
  const visited = new Set<string>(), active = new Set<string>(), projects = new Map<string, string>(), expectedHashes = new Map<string, string>();
  const pending: ({ reference: WorldReference } | { exit: string })[] = [...project.worldReferences].reverse().map(reference => ({ reference }));
  let steps = 0;
  while (pending.length) {
    if (++steps > 200_000) { errors.push('共通世界の依存数が安全上限を超えています。'); break; }
    const frame = pending.pop()!;
    if ('exit' in frame) { active.delete(frame.exit); continue; }
    const reference = frame.reference, id = reference.immutableSnapshotId;
    if (active.has(id)) { errors.push('共通世界の固定版参照が循環しています。'); continue; }
    const expectedHash = expectedHashes.get(id);
    if (expectedHash && expectedHash !== reference.contentHash) { errors.push('同じ共通世界の固定版に異なる内容ハッシュが指定されています。'); continue; }
    expectedHashes.set(id, reference.contentHash);
    const previous = projects.get(reference.projectId);
    if (previous && previous !== id) { errors.push('同じ共通世界の異なる版が同時に参照されています。'); continue; }
    projects.set(reference.projectId, id);
    if (visited.has(id)) continue;
    const world = snapshots[id];
    if (!world || world.projectId !== reference.projectId) { errors.push('参照した共通世界の固定版がありません。'); continue; }
    visited.add(id); active.add(id); references.push(reference); worlds.push(world); pending.push({ exit: id });
    if (!Array.isArray(world.worldReferences)) { errors.push('共通世界の依存参照が不正です。'); continue; }
    for (const child of [...world.worldReferences].reverse()) pending.push({ reference: child });
  }
  return { worlds, references, errors };
}

/** Verify the exact immutable world images used by validation and runtime capture. */
export async function verifyPinnedWorlds(project: Pick<ProjectContent, 'worldReferences'>, snapshots: Record<string, ProjectContent>, path = 'worldReferences', cache?: PinnedWorldDigestCache): Promise<ValidationIssue[]> {
  const closure = resolvePinnedWorlds(project, snapshots);
  const issues: ValidationIssue[] = closure.errors.map(message => ({ code: 'REFERENCE_INVALID', path, message }));
  for (const reference of closure.references) {
    const world = snapshots[reference.immutableSnapshotId];
    if (!world) continue;
    const key = `${reference.immutableSnapshotId}\0${reference.contentHash}`;
    let digests = cache?.hashes.get(world);
    if (cache && !digests) { digests = new Map(); cache.hashes.set(world, digests); }
    let digest = digests?.get(key);
    if (!digest) { digest = sha256(jsonBytes(world)); digests?.set(key, digest); }
    const actual = await digest;
    if (actual !== reference.contentHash) issues.push({
      code: 'INTEGRITY_FAILED',
      path: `${path}.${reference.projectId}.${reference.immutableSnapshotId}.contentHash`,
      message: '共通世界の固定版内容ハッシュが一致しません。',
    });
  }
  return issues;
}
