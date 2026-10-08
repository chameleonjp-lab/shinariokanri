import type { ProjectData, ProjectSnapshot, ProjectContent, ValidationIssue, ContentState, AuthorAlternative, AlternativeVersion, AlternativeApplyReceipt } from './types';
import type { ProjectValidationOptions } from './model';
import { validateProject } from './model';
import { validateAuthorAlternatives } from './authorAlternativeIntegrity';
import { validateReadingTraceRecord } from './runtimeRecordValidation';
import { captureRuntimeContent } from './runtimeVersions';
import { resolveReuseContent } from './reuse';
import { receiptPatchValue } from './authorAlternativeIntegrity';
import { canonicalJson } from '../storage/json';
import { createPinnedWorldDigestCache, freezePinnedWorldRegistry, verifyPinnedWorlds, resolvePinnedWorlds } from './pinnedWorlds';
import type { PinnedWorldDigestCache } from './pinnedWorlds';

function projectFromState(state: ContentState): ProjectData {
  return { ...state, history: [] };
}

function samePrefix<T>(previous: readonly T[], next: readonly T[]): boolean {
  return next.length >= previous.length && previous.every((item, index) => canonicalJson(item) === canonicalJson(next[index]));
}

/** Immutable branch evidence must remain byte-for-byte stable in every retained history image. */
function checkAlternativeHistory(project: ProjectData): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  const versionById = new Map<string, AlternativeVersion>(), receiptById = new Map<string, AlternativeApplyReceipt>();
  const branchIdentityById = new Map<string, string>();
  const timelines = new Map<string, Array<{ label: string; state: ContentState }>>();
  const timelineFor = (key: string) => { let timeline = timelines.get(key); if (!timeline) { timeline = []; timelines.set(key, timeline); } return timeline; };
  const local = timelineFor('local');
  const firstLocal = project.history.findIndex(command => !(command as typeof command & { importOrigin?: unknown }).importOrigin);
  if (firstLocal >= 0) local.push({ label: `project.history[${firstLocal}].before`, state: project.history[firstLocal]!.before });
  for (const [index, command] of project.history.entries()) {
    const importOrigin = (command as typeof command & { importOrigin?: { importOperationId: string } }).importOrigin;
    const key = importOrigin ? `import:${importOrigin.importOperationId}` : 'local';
    const timeline = timelineFor(key);
    if (importOrigin && !timeline.length) timeline.push({ label: `project.history[${index}].before`, state: command.before });
    timeline.push({ label: `project.history[${index}].after`, state: command.after });
  }
  const current = project as unknown as ContentState;
  if (!local.length || local.at(-1)?.state.revision !== project.revision) local.push({ label: 'project', state: current });

  for (const timeline of timelines.values()) {
    let previousById = new Map<string, AuthorAlternative>();
    for (const { label, state } of timeline) {
    const currentById = new Map((state.authorAlternatives ?? []).map(alternative => [alternative.id, alternative]));
    for (const [id, previous] of previousById) {
      const next = currentById.get(id);
      if (!next) { issues.push({ code: 'INTEGRITY_FAILED', path: `${label}.authorAlternatives`, message: `過去に保存した別案「${id}」が履歴から失われています。` }); continue; }
      if (!samePrefix(previous.versions, next.versions)) issues.push({ code: 'INTEGRITY_FAILED', path: `${label}.authorAlternatives.${id}.versions`, message: '別案版の履歴は削除・書換えできません。' });
      if (!samePrefix(previous.applyReceipts, next.applyReceipts)) issues.push({ code: 'INTEGRITY_FAILED', path: `${label}.authorAlternatives.${id}.applyReceipts`, message: '正本採用記録は削除・書換えできません。' });
    }
    for (const alternative of currentById.values()) {
      const identity = canonicalJson({ projectId: alternative.projectId, baseRevision: alternative.baseRevision, sourceSnapshotId: alternative.sourceSnapshotId ?? null,
        baseContent: alternative.baseContent, baseContentHash: alternative.baseContentHash, createdAt: alternative.createdAt });
      const priorIdentity = branchIdentityById.get(alternative.id);
      if (priorIdentity !== undefined && priorIdentity !== identity) issues.push({ code: 'INTEGRITY_FAILED', path: `${label}.authorAlternatives.${alternative.id}`, message: '別案IDが異なる分岐元の内容に再利用されています。' });
      else branchIdentityById.set(alternative.id, identity);
      for (const version of alternative.versions) {
        const old = versionById.get(version.id);
        if (old && canonicalJson(old) !== canonicalJson(version)) issues.push({ code: 'INTEGRITY_FAILED', path: `${label}.authorAlternatives.${alternative.id}.versions.${version.id}`, message: '不変の別案版IDが異なる内容へ再利用されています。' });
        else versionById.set(version.id, version);
      }
      for (const receipt of alternative.applyReceipts) {
        const old = receiptById.get(receipt.id);
        if (old && canonicalJson(old) !== canonicalJson(receipt)) issues.push({ code: 'INTEGRITY_FAILED', path: `${label}.authorAlternatives.${alternative.id}.applyReceipts.${receipt.id}`, message: '不変の正本採用記録IDが異なる内容へ再利用されています。' });
        else receiptById.set(receipt.id, receipt);
      }
    }
      previousById = currentById;
    }
  }
  return issues;
}

function reservedIds(project: ProjectData): Set<string> {
  const ids = new Set<string>([project.projectId]);
  for (const item of [...project.entities, ...project.relations]) ids.add(item.id);
  for (const snapshot of project.snapshots) {
    ids.add(snapshot.id);
    for (const entity of project.entities) if (entity.kind === 'snapshot' && entity.id === snapshot.id) ids.add(entity.id);
  }
  for (const command of project.history) ids.add(command.operationId);
  return ids;
}

async function checkAlternatives(project: ProjectData, validationOptions: ProjectValidationOptions, path: string, digestCache: PinnedWorldDigestCache): Promise<ValidationIssue[]> {
  const issues: ValidationIssue[] = [];
  const snapshots = project.snapshots;
  const branchIssues = await validateAuthorAlternatives(project.projectId, project.authorAlternatives ?? [], {
    snapshotIds: new Set(snapshots.map(snapshot => snapshot.id)), snapshots, reservedIds: reservedIds(project),
    validateContent: async (content: ProjectContent) => {
      const pinIssues = await verifyPinnedWorlds(content, validationOptions.worldSnapshots ?? {}, `${path}.authorAlternatives.worldReferences`, digestCache);
      const result = validateProject({ ...content, snapshots, history: [] }, validationOptions);
      return result.ok && !pinIssues.length ? { ok: true } : { ok: false, issues: [...pinIssues, ...(!result.ok ? result.issues : [])] };
    },
  });
  for (const issue of branchIssues) issues.push({ code: 'INTEGRITY_FAILED', path: `${path}.${issue.path}`, message: issue.message });
  return issues;
}

async function checkChapterTraces(project: ProjectData, validationOptions: ProjectValidationOptions, digestCache: PinnedWorldDigestCache): Promise<ValidationIssue[]> {
  const issues: ValidationIssue[] = [];
  for (const [index, entity] of project.entities.entries()) {
    if (entity.kind !== 'trace' || entity.data.mode !== 'chapters' && !entity.data.initialStubValues) continue;
    const location = `project.entities[${index}].data`;
    const checkpoint = project.entities.find(candidate => candidate.id === entity.data.startCheckpointId && candidate.kind === 'checkpoint');
    if (!checkpoint || checkpoint.kind !== 'checkpoint') {
      issues.push({ code: 'REFERENCE_INVALID', path: `${location}.startCheckpointId`, message: '章読み通しの開始状態が見つかりません。' });
      continue;
    }
    try {
      const content = await captureRuntimeContent(project, entity.data.contentVersionId, validationOptions, digestCache);
      if (entity.data.mode === 'chapters') issues.push(...validateReadingTraceRecord(content, entity.data, checkpoint.data, location, validationOptions));
      else {
        const { replaySavedTrace } = await import('./runtime');
        const closure = resolvePinnedWorlds(resolveReuseContent(content, content.snapshots), validationOptions.worldSnapshots ?? {});
        const replay = replaySavedTrace(project, entity.id, closure.worlds.flatMap(world => world.entities));
        if (replay.status === 'error') issues.push(...replay.issues.map(issue => ({ ...issue, path: `${location}.${issue.path}` })));
      }
    } catch (error) {
      const inner = (error as { issues?: ValidationIssue[] }).issues;
      if (inner?.length) issues.push(...inner.map(issue => ({ ...issue, path: `${location}.${issue.path}` })));
      else issues.push({ code: 'INTEGRITY_FAILED', path: `${location}.contentVersionId`, message: error instanceof Error ? error.message : '章読み通しの固定版本文を確認できません。' });
    }
  }
  return issues;
}

/** Async durable-boundary checks for hashes, isolated branch contents, and replayable chapter evidence. */
export async function validateProjectIntegrity(input: ProjectData, options: ProjectValidationOptions = {}, requireReceiptHistory = input.history.length > 0): Promise<ValidationIssue[]> {
  // Freeze the exact dependency images at the durable boundary. Async hash checks
  // must never validate a different world map from the one structural validation read.
  const digestCache = createPinnedWorldDigestCache();
  const validationOptions = { ...options, worldSnapshots: freezePinnedWorldRegistry(options.worldSnapshots ?? {}, digestCache), worlds: options.worlds ? structuredClone(options.worlds) : undefined };
  const structural = validateProject(input, validationOptions);
  if (!structural.ok) return structural.issues;
  const issues: ValidationIssue[] = [];
  issues.push(...await verifyPinnedWorlds(input, validationOptions.worldSnapshots, 'project.worldReferences', digestCache));
  for (const [index, snapshot] of input.snapshots.entries()) issues.push(...await verifyPinnedWorlds(snapshot.content, validationOptions.worldSnapshots, `project.snapshots[${index}].content.worldReferences`, digestCache));
  issues.push(...await checkAlternatives(input, validationOptions, 'project', digestCache));
  issues.push(...await checkChapterTraces(input, validationOptions, digestCache));
  issues.push(...checkAlternativeHistory(input));
  if (requireReceiptHistory) for (const [branchIndex, alternative] of (input.authorAlternatives ?? []).entries()) for (const [receiptIndex, receipt] of alternative.applyReceipts.entries()) {
    const receiptPath = `project.authorAlternatives[${branchIndex}].applyReceipts[${receiptIndex}]`;
    const command = input.history.find(item => item.revision === receipt.appliedRevision && item.before.revision === receipt.fromCanonicalRevision && receipt.patches.every(patch => {
      const before = receiptPatchValue(item.before, patch), after = receiptPatchValue(item.after, patch);
      const beforeExpected = patch.before.present ? patch.before.value : undefined, afterExpected = patch.after.present ? patch.after.value : undefined;
      return canonicalJson(before ?? null) === canonicalJson(beforeExpected ?? null) && (before === undefined) === !patch.before.present
        && canonicalJson(after ?? null) === canonicalJson(afterExpected ?? null) && (after === undefined) === !patch.after.present;
    }));
    if (!command) { issues.push({ code: 'INTEGRITY_FAILED', path: receiptPath, message: '正本採用記録に対応する不変の変更履歴がありません。' }); continue; }
    for (const [patchIndex, patch] of receipt.patches.entries()) {
      const before = receiptPatchValue(command.before, patch), after = receiptPatchValue(command.after, patch);
      const beforeExpected = patch.before.present ? patch.before.value : undefined, afterExpected = patch.after.present ? patch.after.value : undefined;
      if (canonicalJson(before ?? null) !== canonicalJson(beforeExpected ?? null) || (before === undefined) !== !patch.before.present) issues.push({ code: 'INTEGRITY_FAILED', path: `${receiptPath}.patches[${patchIndex}].before`, message: '採用前の正本値が対応する変更履歴と一致しません。' });
      if (canonicalJson(after ?? null) !== canonicalJson(afterExpected ?? null) || (after === undefined) !== !patch.after.present) issues.push({ code: 'INTEGRITY_FAILED', path: `${receiptPath}.patches[${patchIndex}].after`, message: '採用後の正本値が対応する変更履歴と一致しません。' });
    }
  }
  for (const [index, command] of input.history.entries()) {
    for (const side of ['before', 'after'] as const) {
      const state = command[side];
      const historical = projectFromState(state);
      issues.push(...await verifyPinnedWorlds(historical, validationOptions.worldSnapshots, `project.history[${index}].${side}.worldReferences`, digestCache));
      for (const [snapshotIndex, snapshot] of historical.snapshots.entries()) issues.push(...await verifyPinnedWorlds(snapshot.content, validationOptions.worldSnapshots, `project.history[${index}].${side}.snapshots[${snapshotIndex}].content.worldReferences`, digestCache));
      if (state.authorAlternatives?.length) issues.push(...await checkAlternatives(historical, validationOptions, `project.history[${index}].${side}`, digestCache));
      issues.push(...await checkChapterTraces(historical, validationOptions, digestCache));
    }
  }
  return issues.slice(0, 256);
}

/** Hash verifier for callers that already performed structural validation. */
export async function assertProjectIntegrity(project: ProjectData, options: ProjectValidationOptions = {}): Promise<void> {
  const issues = await validateProjectIntegrity(project, options);
  if (issues.length) throw Object.assign(new Error(issues.map(issue => `${issue.path}: ${issue.message}`).join('\n')), { issues });
}

export function snapshotContents(project: ProjectData): readonly ProjectSnapshot[] { return project.snapshots; }
