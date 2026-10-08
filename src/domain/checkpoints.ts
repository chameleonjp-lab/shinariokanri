import type { ID, ProjectContent, ProjectData, ProjectSnapshot } from './types';
import { createEntity, newId, validateVariableValue, collectReferences } from './model';
import { evaluateExpression, initializeRuntimeState, runtimeExclusionIssues } from './conditions';
import { captureRuntimeContent } from './runtimeVersions';
import { resolvePinnedWorlds } from './pinnedWorlds';
import { adoptedRecord } from './adoption';
import { canonicalJson, jsonBytes, sha256 } from '../storage/json';
import { resolveReuseContent } from './reuse';

/** New author-supplied starts are always partial; the normal editor retains their drafts. */
export async function preparePartialCheckpoint(project: ProjectData, options: { contentVersionId?: ID; entryId?: ID; chapterStart?: boolean; worldSnapshots?: Record<ID, ProjectContent> } = {}) {
  const source = structuredClone(project), requested = structuredClone(options), version = requested.contentVersionId ?? source.projectId;
  const content = await captureRuntimeContent(source, version, { worldSnapshots: requested.worldSnapshots });
  if (requested.entryId && !content.entities.some(entity => entity.id === requested.entryId && entity.kind === 'flow_node' && adoptedRecord(entity))) throw new Error('選んだ開始点が対象版にありません。');
  const fixedVersion = version === source.projectId ? newId() : version;
  const view = resolveReuseContent(content, content.snapshots);
  const referenceEntities = resolvePinnedWorlds(view, requested.worldSnapshots ?? {}).worlds.flatMap(world => world.entities);
  const state = initializeRuntimeState(view, fixedVersion, referenceEntities);
  state.provenance = 'partial'; state.presentationPosition = requested.entryId ?? null;
  const { snapshots: _snapshots, history: _history, authorAlternatives: _alternatives, ...fixedContent } = content;
  const snapshots: ProjectSnapshot[] = version === source.projectId ? [{ id: fixedVersion, content: fixedContent, contentHash: await sha256(jsonBytes(fixedContent)), createdAt: new Date().toISOString(), versionLabel: `途中開始の固定版 ${content.revision}` }] : [];
  const checkpoint = createEntity(source.projectId, 'checkpoint', '途中開始の状態', { contentVersionId: fixedVersion, contentRevision: content.revision, runtimeState: state, origin: 'partial' });
  return { checkpoint, snapshots };
}

export interface CheckpointMigrationPlan {
  projectId: ID; baseRevision: string; sourceCheckpointId: ID; sourceVersionId: ID; targetVersionId: ID; targetEntryId: ID | null; targetMode: 'flow' | 'chapters';
  changes: { id: ID; action: 'carry' | 'reset' | 'drop'; reason: string }[];
  migrated: Awaited<ReturnType<typeof preparePartialCheckpoint>>;
  recreated: Awaited<ReturnType<typeof preparePartialCheckpoint>>;
  confirmationHash: string;
}
function signature(entity: import('./types').Entity) { return canonicalJson({ kind: entity.kind, status: entity.status, deletedAt: entity.deletedAt, data: entity.data }); }
function ownedIds(entity: import('./types').Entity): ID[] {
  const walk = (value: unknown): ID[] => Array.isArray(value) ? value.flatMap(walk) : value && typeof value === 'object' ? [typeof (value as { id?: unknown }).id === 'string' ? (value as { id: ID }).id : '', ...Object.values(value).flatMap(walk)].filter(Boolean) : [];
  return [entity.id, ...walk(entity.data)];
}
/** An edition change produces a new partial start only after its losses and retained state are reviewed. */
export async function previewCheckpointMigration(project: ProjectData, checkpointId: ID, options: Parameters<typeof preparePartialCheckpoint>[1] = {}): Promise<CheckpointMigrationPlan> {
  const source = structuredClone(project), requested = structuredClone(options), checkpoint = source.entities.find(entity => entity.id === checkpointId && entity.kind === 'checkpoint' && adoptedRecord(entity));
  if (!checkpoint || checkpoint.kind !== 'checkpoint') throw new Error('移行元の開始状態がありません。');
  const oldContent = await captureRuntimeContent(source, checkpoint.data.contentVersionId, { worldSnapshots: requested.worldSnapshots });
  const targetContent = await captureRuntimeContent(source, requested.contentVersionId ?? source.projectId, { worldSnapshots: requested.worldSnapshots });
  const oldView = resolveReuseContent(oldContent, oldContent.snapshots), targetView = resolveReuseContent(targetContent, targetContent.snapshots);
  const refs = (view: ProjectData) => resolvePinnedWorlds(view, requested.worldSnapshots ?? {}).worlds.flatMap(world => world.entities);
  const previous = [...oldView.entities, ...refs(oldView)].filter(adoptedRecord), next = [...targetView.entities, ...refs(targetView)].filter(adoptedRecord);
  const nextById = new Map(next.map(entity => [entity.id, entity])), previousById = new Map(previous.map(entity => [entity.id, entity]));
  const compatible = new Set(next.filter(entity => previousById.has(entity.id) && signature(previousById.get(entity.id)!) === signature(entity)).flatMap(ownedIds));
  const chapterStart = requested.chapterStart || !checkpoint.data.runtimeState.presentationPosition && source.entities.some(entity => entity.kind === 'trace' && entity.data.mode === 'chapters' && entity.data.startCheckpointId === checkpointId && adoptedRecord(entity));
  const entryId = chapterStart ? undefined : requested.entryId ?? (checkpoint.data.runtimeState.presentationPosition && nextById.get(checkpoint.data.runtimeState.presentationPosition)?.kind === 'flow_node' ? checkpoint.data.runtimeState.presentationPosition : undefined);
  if (!entryId && !chapterStart) throw new Error('移行先の開始点を選択してください。');
  const recreated = await preparePartialCheckpoint(source, { ...requested, entryId });
  const migrated = structuredClone(recreated), initial = migrated.checkpoint.data.runtimeState, old = checkpoint.data.runtimeState;
  const changes: CheckpointMigrationPlan['changes'] = [];
  for (const [id, value] of Object.entries(old.variableValues)) {
    const variable = nextById.get(id);
    if (compatible.has(id) && variable?.kind === 'variable' && !variable.data.derived && !variable.data.externalContractId) { const issues = validateVariableValue(variable, value); if (issues.length) throw new Error(issues.map(issue => issue.message).join('、')); initial.variableValues[id] = structuredClone(value); changes.push({ id, action: 'carry', reason: '宣言が同じ状態値を移行します。' }); }
    else changes.push({ id, action: id in initial.variableValues ? 'reset' : 'drop', reason: '宣言変更・削除・算出値・外部管理値は新しい宣言から再作成します。' });
  }
  for (const id of Object.keys(initial.variableValues).filter(id => !(id in old.variableValues))) changes.push({ id, action: 'reset', reason: '新規の状態は対象版の初期値を使います。' });
  const retain = (id: ID, valid: boolean, reason: string) => { changes.push({ id, action: valid ? 'carry' : 'drop', reason }); return valid; };
  initial.itemInstances = old.itemInstances.filter(item => retain(item.instanceId, [item.instanceId, item.typeId, item.ownerId, item.locationId].filter(Boolean).every(id => compatible.has(id!)), '個体・物品型・所有者・所在の採用宣言が同じ個体だけを移行します。')).map(item => structuredClone(item));
  initial.assertions = old.assertions.filter(assertion => retain(assertion.assertionId, [assertion.assertionId, assertion.holderId, assertion.sourceEffectId, ...(nextById.get(assertion.assertionId) ? collectReferences(nextById.get(assertion.assertionId)!).map(reference => reference.id) : [])].filter(Boolean).every(id => compatible.has(id!)), '人物・認識・取得効果の宣言が同じ記録だけを移行します。')).map(assertion => structuredClone(assertion));
  initial.seenIds = old.seenIds.filter(id => retain(id, compatible.has(id), '変更された本文・位置の既読は持ち越しません。'));
  initial.visitCounts = Object.fromEntries(Object.entries(old.visitCounts).filter(([id]) => compatible.has(id)));
  initial.rngSeed = old.rngSeed; initial.rngPosition = old.rngPosition; initial.loopNumber = old.loopNumber;
  if (old.callStack.length || old.onceTriggers.length) changes.push({ id: checkpointId, action: 'drop', reason: '呼出し途中と一度限りの発火記録は持ち越さず、新しい開始状態から確認します。' });
  initial.callStack = []; initial.onceTriggers = []; initial.resetCauses = []; initial.provenance = 'partial';
  const context = { state: initial, entities: targetView.entities, referenceEntities: refs(targetView), ruleContext: { projectId: source.projectId } };
  for (const variable of next) if (variable.kind === 'variable' && variable.data.derived) initial.variableValues[variable.id] = evaluateExpression(variable.data.derived, context);
  const prohibited = runtimeExclusionIssues(context).filter(issue => issue.code !== 'CONDITION_UNKNOWN'); if (prohibited.length) throw new Error(prohibited.map(issue => issue.message).join('、'));
  migrated.checkpoint.name = '版移行した途中開始の状態';
  recreated.checkpoint.name = '対象版から再作成した途中開始の状態';
  for (const prepared of [migrated, recreated]) prepared.checkpoint.data.migration = { sourceCheckpointId: checkpointId, sourceVersionId: checkpoint.data.contentVersionId, baseRevision: source.revision, method: prepared === migrated ? 'migrate' : 'recreate' };
  const payload = { projectId: source.projectId, baseRevision: source.revision, sourceCheckpointId: checkpointId, sourceVersionId: checkpoint.data.contentVersionId, targetVersionId: requested.contentVersionId ?? source.projectId, targetEntryId: entryId ?? null, targetMode: chapterStart && !entryId ? 'chapters' as const : 'flow' as const, changes, migrated, recreated };
  return { ...payload, confirmationHash: await sha256(jsonBytes(payload)) };
}
export async function confirmedCheckpointMigration(project: ProjectData, plan: CheckpointMigrationPlan, method: 'migrate' | 'recreate', worldSnapshots: Record<ID, ProjectContent> = {}) {
  const source = structuredClone(project), approved = structuredClone(plan), { confirmationHash, ...payload } = approved;
  if (source.projectId !== approved.projectId || source.revision !== approved.baseRevision) throw new Error('影響確認後に作品が更新されました。入力を保持して差分を再確認してください。');
  if (await sha256(jsonBytes(payload)) !== confirmationHash) throw new Error('確認した移行差分が変更されています。再確認してください。');
  const prepared = method === 'migrate' ? approved.migrated : approved.recreated;
  // Full project validation and the normal runtime are applied again to the exact prepared edition.
  const candidate = { ...source, entities: [...source.entities, prepared.checkpoint], snapshots: [...source.snapshots, ...prepared.snapshots] };
  if (!prepared.checkpoint.data.runtimeState.presentationPosition) {
    const { startChapterReading } = await import('./presentation');
    const session = await startChapterReading(candidate, { contentVersionId: prepared.checkpoint.data.contentVersionId, state: prepared.checkpoint.data.runtimeState, worldSnapshots });
    if (session.status === 'error') throw new Error(session.issues.map(issue => issue.message).join('、'));
    return prepared;
  }
  const { startTrialVerified } = await import('./runtimeVerified');
  const session = await startTrialVerified(candidate, { checkpointId: prepared.checkpoint.id, contentVersionId: prepared.checkpoint.data.contentVersionId, entryId: prepared.checkpoint.data.runtimeState.presentationPosition ?? undefined }, worldSnapshots);
  if (session.status === 'error') throw new Error(session.issues.map(issue => issue.message).join('、'));
  return prepared;
}
