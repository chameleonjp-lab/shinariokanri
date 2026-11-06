import type { Entity, ID, ProjectData, ProjectSnapshot } from './types';
import { editRichText, remapEditedTextReferences, remapEditedTextRelationReferences } from './text';
import { adoptedRecord } from './adoption';
import { canonicalJson, jsonBytes, sha256 } from '../storage/json';
import { createEntity, newId, textToRichText } from './model';
import { captureRuntimeContent } from './runtimeVersions';
import { replaySavedTraceVerified, startTrialVerified } from './runtimeVerified';
import { checkTrialForeshadows, declaredEntrypoints, pinTrialRecord, stepTrial, type TrialSession } from './runtime';
import { checkChapterForeshadows, pinChapterReadingRecord, presentNextChapterScene, replayChapterReading, startChapterReading, type ChapterReadingSession } from './presentation';

const ancillary = new Set(['checkpoint', 'trace', 'review', 'collection', 'projection_profile', 'production_task', 'template', 'localization', 'recording', 'media_variant']);
const semantic = (entity: Entity) => canonicalJson({ kind: entity.kind, adopted: adoptedRecord(entity), status: entity.status, data: entity.data });
export function traceRevisionChanges(project: ProjectData, trace: Entity<'trace'>): { id: ID; reason: string }[] {
  const original = trace.data.contentVersionId === project.projectId && trace.data.contentRevision === project.revision ? project : project.snapshots.find(snapshot => snapshot.id === trace.data.contentVersionId)?.content;
  if (!original) return [{ id: trace.id, reason: '元の固定版がありません。証跡を復元してください。' }];
  const old = new Map(original.entities.filter(entity => !ancillary.has(entity.kind)).map(entity => [entity.id, entity]));
  const next = new Map(project.entities.filter(entity => !ancillary.has(entity.kind)).map(entity => [entity.id, entity]));
  const changes = [...new Set([...old.keys(), ...next.keys()])].flatMap(id => {
    const previous = old.get(id), current = next.get(id);
    return !previous ? [{ id, reason: '宣言・本文が追加されました。' }] : !current ? [{ id, reason: '宣言・本文が取り除かれました。' }] : semantic(previous) !== semantic(current) ? [{ id, reason: '宣言・本文・採用状態が変更されました。' }] : [];
  });
  const chapterOrder = (entities: readonly Entity[]) => entities.filter(entity => entity.kind === 'chapter' && adoptedRecord(entity)).map(entity => entity.id);
  if (canonicalJson(chapterOrder(original.entities)) !== canonicalJson(chapterOrder(project.entities))) changes.push({ id: project.projectId, reason: '章の提示順が変更されました。' });
  if (canonicalJson(original.worldReferences) !== canonicalJson(project.worldReferences)) changes.push({ id: project.projectId, reason: '採用する固定世界版が変更されました。' });
  if (canonicalJson(original.mainStart) !== canonicalJson(project.mainStart)) changes.push({ id: project.projectId, reason: '本編開始の世界内tickが変更されました。' });
  return changes;
}
export interface ReconfirmationPlan {
  projectId: ID; baseRevision: string; sourceTraceId: ID; changes: { id: ID; reason: string }[];
  entities: Entity[]; snapshots: ProjectSnapshot[]; findings: { status: string; message: string }[];
  targetVersionId: ID; startCheckpointId: ID | null; confirmationHash: string;
}
/** Replay old evidence first, then run the same authored operations against new declarations. */
export async function prepareTraceReconfirmation(project: ProjectData, traceId: ID, options: { worldSnapshots?: Parameters<typeof startTrialVerified>[2]; checkpointId?: ID; signal?: AbortSignal; onProgress?: (steps: number) => void } = {}): Promise<ReconfirmationPlan> {
  const checkpointId = options.checkpointId;
  const source = structuredClone(project), worlds = structuredClone(options.worldSnapshots ?? {}), trace = source.entities.find((entity): entity is Entity<'trace'> => entity.id === traceId && entity.kind === 'trace' && adoptedRecord(entity));
  if (!trace) throw new Error('再確認する経路がありません。');
  if (['actual', 'mixed'].includes(trace.data.externalMode ?? '')) throw new Error('実ゲーム入力は受領証跡と対象版を改めて確認してください。仮値へ置き換えません。');
  if (trace.data.steps.length > 10_000 || (trace.data.readingPath?.occurrences.length ?? 0) > 10_000) throw new Error('一経路10,000遷移の上限を超えています。');
  const current = await captureRuntimeContent(source, source.projectId, { worldSnapshots: worlds });
  const ids = { checkpointId: newId(), snapshotId: newId() }, started = performance.now();
  const guard = async (index: number) => {
    if (options.signal?.aborted) throw new Error('再確認を中止しました。新しい確認証跡は保存していません。');
    if (performance.now() - started > 30_000) throw new Error('再確認は30秒の上限に達しました。新しい確認証跡は保存していません。');
    if (index % 50 === 0) { options.onProgress?.(index); await new Promise<void>(resolve => setTimeout(resolve, 0)); }
  };
  const selectedCheckpoint = checkpointId ? source.entities.find((entity): entity is Entity<'checkpoint'> => entity.id === checkpointId && entity.kind === 'checkpoint' && adoptedRecord(entity)) : undefined;
  if (checkpointId && !selectedCheckpoint) throw new Error('選んだ開始状態がありません。移行・再作成を確認してください。');
  if (selectedCheckpoint && traceRevisionChanges(source, { ...trace, data: { ...trace.data, contentVersionId: selectedCheckpoint.data.contentVersionId } }).length) throw new Error('選んだ開始状態は改訂稿の宣言と異なります。版移行を再確認してください。');
  let record: ReturnType<typeof pinTrialRecord>, findings: ReconfirmationPlan['findings'];
  if (trace.data.mode === 'chapters') {
    const cp = source.entities.find(entity => entity.id === trace.data.startCheckpointId && entity.kind === 'checkpoint');
    if (!cp || cp.kind !== 'checkpoint') throw new Error('旧章経路の開始状態がありません。');
    const worldTick = selectedCheckpoint?.data.worldTick ?? trace.data.initialWorldTick ?? cp.data.worldTick ?? undefined;
    const old = await replayChapterReading(source, trace.data, cp.data, { worldSnapshots: worlds });
    if (old.status !== 'terminal') throw new Error('旧版の章提示記録が完了していません。旧証跡を確認してください。');
    const path = trace.data.readingPath!, selection = path.selection ?? 'scenes';
    if (!selectedCheckpoint) {
      const originalStart = await startChapterReading(source, { contentVersionId: trace.data.contentVersionId, chapterIds: path.chapterIds, sceneIds: path.sceneIds, selection, worldSnapshots: worlds, externalValues: trace.data.initialExternalValues ?? {}, worldTick: trace.data.initialWorldTick ?? cp.data.worldTick ?? undefined });
      if (canonicalJson(originalStart.startState) !== canonicalJson(cp.data.runtimeState)) throw new Error('個別の章開始状態には、対象版へ移行・再作成した開始状態を選んでください。');
    }
    const selected = new Set(path.chapterIds), chapterIds = current.entities.filter(entity => entity.kind === 'chapter' && adoptedRecord(entity) && selected.has(entity.id)).map(entity => entity.id);
    if (chapterIds.length !== selected.size) throw new Error('対象の章が改訂稿から取り除かれています。開始範囲を再作成してください。');
    // An old record without a selection declaration retains its exact scene path.
    let next = await startChapterReading(source, { ...(selection === 'chapters' ? { chapterIds } : { chapterIds: path.chapterIds, sceneIds: path.sceneIds }), selection, ...(selectedCheckpoint ? { state: selectedCheckpoint.data.runtimeState, contentVersionId: selectedCheckpoint.data.contentVersionId } : {}), worldSnapshots: worlds, externalValues: trace.data.initialExternalValues ?? {}, worldTick });
    for (let index = 0; index < next.sceneIds.length; index++) { await guard(index); next = presentNextChapterScene(source, next); if (next.status === 'error' || next.status === 'unknown') break; }
    if (next.status !== 'terminal') throw new Error('改訂稿の提示に未知または失敗があります。未実行を確認済みへ変換できません。');
    record = pinChapterReadingRecord(next, ids); findings = checkChapterForeshadows(next);
  } else {
    const old = await replaySavedTraceVerified(source, trace.id, worlds);
    if (old.status !== 'terminal') throw new Error('旧経路は終端までの再生を確認できません。旧証跡を確認してください。');
    const oldCheckpoint = source.entities.find(entity => entity.id === trace.data.startCheckpointId && entity.kind === 'checkpoint');
    if (!oldCheckpoint || oldCheckpoint.kind !== 'checkpoint') throw new Error('旧経路の開始状態がありません。');
    const worldTick = selectedCheckpoint?.data.worldTick ?? trace.data.initialWorldTick ?? oldCheckpoint.data.worldTick ?? undefined;
    const entryId = old.startState.presentationPosition ?? undefined;
    if (!checkpointId && old.startState.provenance !== 'full_play' && old.startState.provenance !== 'stub') throw new Error('途中開始の経路には、対象版へ移行・再作成した開始状態を選んでください。');
    if (!checkpointId && trace.data.initialStubBaseState) throw new Error('個別状態からのstub開始には、対象版へ移行・再作成した開始状態を選んでください。');
    if (!checkpointId && (!entryId || !declaredEntrypoints(current).includes(entryId))) throw new Error('旧入口が改訂稿の宣言入口にありません。開始状態を再作成してください。');
    let initialStub = trace.data.initialStubValues ?? (Object.keys(old.startExternalValues).length ? { external: old.startExternalValues } : undefined);
    if (!checkpointId && old.startState.provenance === 'stub') {
      const originalStart = await startTrialVerified(source, { entryId, contentVersionId: trace.data.contentVersionId, seed: old.startState.rngSeed, worldTick: trace.data.initialWorldTick ?? oldCheckpoint.data.worldTick ?? undefined, stub: initialStub ?? {} }, worlds);
      if (canonicalJson(originalStart.startState) !== canonicalJson(old.startState)) throw new Error('旧stubの個別開始入力が記録されていないか、開始状態と一致しません。開始状態を移行・再作成して選んでください。');
      initialStub ??= {};
    }
    const selectedStub = checkpointId && (old.startState.provenance === 'stub' || Object.keys(old.startExternalValues).length) ? { ...(Object.keys(old.startExternalValues).length ? { external: old.startExternalValues } : {}) } : undefined;
    let next = await startTrialVerified(source, { entryId, checkpointId, contentVersionId: selectedCheckpoint?.data.contentVersionId, seed: old.startState.rngSeed, worldTick, ...(selectedStub ? { stub: selectedStub } : !checkpointId && initialStub ? { stub: initialStub } : {}) }, worlds);
    if (next.status !== 'ready' && next.status !== 'terminal') throw new Error('改訂稿の開始状態を確認できません。未知・対象版・入口を確認してください。');
    for (const [index, step] of old.trace.entries()) {
      await guard(index); const beforeLength = next.trace.length;
      next = stepTrial(source, next, structuredClone(step.request));
      if (next.status === 'error' || next.status === 'unknown' || next.status === 'blocked' || next.trace.length !== beforeLength + 1 || next.nodeId !== step.toId || canonicalJson(next.trace.at(-1)?.edgeIds) !== canonicalJson(step.edgeIds)) throw new Error(`改訂稿の${index + 1}手目を同じ経路で実行できません。条件・宣言・仮値を再確認してください。`);
    }
    if (next.status !== 'terminal') throw new Error('改訂稿の経路が終端まで完了していません。');
    record = pinTrialRecord(next, ids, source); findings = checkTrialForeshadows(source, next);
  }
  const checkpoint = { ...createEntity(source.projectId, 'checkpoint', '再確認した開始状態', record.checkpoint), id: ids.checkpointId }, nextTrace = createEntity(source.projectId, 'trace', `改訂稿の再確認 · ${trace.name}`, record.trace);
  nextTrace.data.reconfirmation = { sourceTraceId: trace.id, sourceVersionId: trace.data.contentVersionId, baseRevision: source.revision, startCheckpointId: checkpointId ?? null };
  const snapshot: ProjectSnapshot = { id: ids.snapshotId, content: record.content, contentHash: await sha256(jsonBytes(record.content)), createdAt: new Date().toISOString(), versionLabel: `改訂稿の経路再確認 ${source.revision}` };
  const review = createEntity(source.projectId, 'review', `経路の変更確認 · ${trace.name}`, { target: trace.id, targetVersionId: trace.data.contentVersionId, body: textToRichText('旧版の証跡を保持して改訂稿を再実行しました。'), stage: findings.some(finding => finding.status === 'candidate' || finding.status === 'unknown') ? 'fixed' : 'verified', resolution: textToRichText(`確認対象の作品改訂 ${source.revision}。新しい経路 ${nextTrace.id} / 固定版 ${ids.snapshotId}。人物と読者の理解は自動認定していません。`) });
  review.visibility = 'private'; review.customValues = { 'traceReconfirmation.sourceTraceId': trace.id, 'traceReconfirmation.newTraceId': nextTrace.id, 'traceReconfirmation.baseRevision': source.revision };
  const collections = source.entities.filter((entity): entity is Entity<'collection'> => entity.kind === 'collection' && adoptedRecord(entity) && entity.data.purpose === 'regression' && !!entity.data.memberIds?.includes(trace.id)).map(collection => ({ ...collection, data: { ...collection.data, memberIds: [...new Set([...(collection.data.memberIds ?? []), nextTrace.id])] } }));
  const payload = { projectId: source.projectId, baseRevision: source.revision, sourceTraceId: trace.id, targetVersionId: ids.snapshotId, startCheckpointId: checkpointId ?? null, changes: traceRevisionChanges(source, trace), entities: [checkpoint, nextTrace, review, ...collections], snapshots: [snapshot], findings };
  return { ...payload, confirmationHash: await sha256(jsonBytes(payload)) };
}
export async function confirmTraceReconfirmation(project: ProjectData, plan: ReconfirmationPlan) {
  const source = structuredClone(project), approved = structuredClone(plan), { confirmationHash, ...payload } = approved;
  if (source.projectId !== plan.projectId || source.revision !== approved.baseRevision) throw new Error('再確認中に作品が更新されました。結果を保持して改訂稿を再実行してください。');
  if (await sha256(jsonBytes(payload)) !== confirmationHash) throw new Error('確認した結果が変更されています。再実行してください。');
  return { entities: approved.entities, snapshots: approved.snapshots };
}

export interface PathDifference { choice: number; nodeId?: ID; edgeIds: ID[]; reason: string }
export interface RevisionReplay {
  status: 'same_path' | 'different_path' | 'unexecutable'; sourceTraceId: ID; sourceVersionId: ID; targetVersionId: ID;
  startState?: import('./types').RuntimeState; seed?: string; session?: TrialSession; attempted?: TrialSession; firstDifference?: PathDifference;
}
/** Replays a captured prefix as well as a completed route. The source evidence is never edited. */
export async function replayTraceAgainstRevision(project: ProjectData, traceId: ID, options: { targetVersionId?: ID; worldSnapshots?: Record<ID, import('./types').ProjectContent>; signal?: AbortSignal } = {}): Promise<RevisionReplay> {
  const source = structuredClone(project), trace = source.entities.find((entity): entity is Entity<'trace'> => entity.id === traceId && entity.kind === 'trace' && adoptedRecord(entity));
  if (!trace) throw new Error('再実行する旧経路がありません。');
  const targetVersionId = options.targetVersionId ?? source.projectId;
  const base: RevisionReplay = { status: 'unexecutable', sourceTraceId: trace.id, sourceVersionId: trace.data.contentVersionId, targetVersionId };
  const failure = (reason: string, choice = 0, session?: TrialSession, edgeIds: ID[] = [], nodeId?: ID): RevisionReplay => ({ ...base, session, firstDifference: { choice, edgeIds, nodeId, reason } });
  if (trace.data.mode === 'chapters') return failure('章順の経路は開始範囲の再確認を使ってください。');
  if (['actual', 'mixed'].includes(trace.data.externalMode ?? '')) return failure('実ゲーム入力は受領証跡の対象版を確認してください。');
  if (trace.data.steps.length > 10_000) return failure('一経路10,000遷移の上限を超えています。');
  const old = await replaySavedTraceVerified(source, trace.id, options.worldSnapshots);
  if (old.status !== 'ready' && old.status !== 'terminal') return failure(`旧固定版の証跡を再生できません。${old.issues.map(issue => issue.message).join('、')}`);
  const state = { ...structuredClone(old.startState), contentVersionId: targetVersionId };
  let next = await startTrialVerified(source, { state, contentVersionId: targetVersionId, externalValues: structuredClone(old.startExternalValues), seed: old.startState.rngSeed, worldTick: old.initialWorldTick }, options.worldSnapshots);
  base.startState = structuredClone(next.startState); base.seed = next.startState.rngSeed;
  if (next.status !== 'ready' && next.status !== 'terminal' && !(next.status === 'blocked' && old.trace.length)) return failure(`固定した開始状態では開始できません。${next.issues.map(issue => issue.message).join('、')}`, 0, next);
  const started = performance.now();
  for (const [index, step] of old.trace.entries()) {
    if (options.signal?.aborted) return failure('再実行を中止しました。残りの経路は未実行です。', index + 1, next, step.edgeIds, step.fromId);
    if (performance.now() - started > 30_000) return failure('再実行は30秒の上限に達しました。', index + 1, next, step.edgeIds, step.fromId);
    if (index % 50 === 0) await new Promise<void>(resolve => setTimeout(resolve, 0));
    const attempted = stepTrial(source, next, structuredClone(step.request));
    if (attempted.status === 'error' || attempted.status === 'unknown' || attempted.status === 'blocked' || attempted.trace.length !== next.trace.length + 1) return failure(attempted.issues.map(issue => issue.message).join('、') || '保存した選択を実行できません。', index + 1, next, step.edgeIds, step.fromId);
    if (attempted.nodeId !== step.toId || canonicalJson(attempted.trace.at(-1)?.edgeIds ?? []) !== canonicalJson(step.edgeIds)) return { ...failure('選択先または実行した分岐が旧経路から変わりました。', index + 1, next, step.edgeIds, step.fromId), status: 'different_path', attempted };
    next = attempted;
  }
  return { ...base, status: 'same_path', session: next };
}

export interface TrialCorrectionPlan {
  baseRevision: string; anchor: import('./types').ContentAnchor; candidate: Entity<'scene'> | Entity<'dialogue_line'>;
  sourceTrace: Entity<'trace'>; entities: Entity[]; snapshots: ProjectSnapshot[];
}
/** The editor receives a detached candidate and a pinned old prefix, never the live trial entity. */
export async function prepareTrialCorrection(project: ProjectData, session: TrialSession, anchor: import('./types').ContentAnchor): Promise<TrialCorrectionPlan> {
  if (session.status !== 'ready' && session.status !== 'terminal') throw new Error('未確認の条件を解決してから修正候補を開いてください。');
  const currentNode = session.content.entities.find(entity => entity.id === session.nodeId && entity.kind === 'flow_node');
  const scene = currentNode?.kind === 'flow_node' ? session.content.entities.find(entity => entity.id === currentNode.data.sceneId && entity.kind === 'scene') : undefined;
  if (!scene || scene.kind !== 'scene' || anchor.entityId !== scene.id && !scene.data.dialogueLineIds?.includes(anchor.entityId)) throw new Error('試読中の場面・台詞を選んでください。');
  const candidate = project.entities.find((entity): entity is Entity<'scene'> | Entity<'dialogue_line'> => entity.id === anchor.entityId && (entity.kind === 'scene' || entity.kind === 'dialogue_line') && adoptedRecord(entity));
  if (!candidate) throw new Error('現在稿から本文が取り除かれています。旧版を確認してください。');
  const blocks = candidate.kind === 'scene' ? candidate.data.body : candidate.data.text;
  if (!anchor.blockId || !blocks.some(block => block.id === anchor.blockId)) throw new Error('元の段落が現在稿にありません。移動先を確認してください。');
  const ids = { checkpointId: newId(), snapshotId: newId() }, record = pinTrialRecord(session, ids, project);
  const checkpoint = { ...createEntity(project.projectId, 'checkpoint', '修正前の試読開始', record.checkpoint), id: ids.checkpointId };
  const sourceTrace = createEntity(project.projectId, 'trace', '修正前の試読経路', { ...record.trace, correctionAnchor: { ...anchor, sourceVersionId: ids.snapshotId } });
  const snapshot = { id: ids.snapshotId, content: record.content, contentHash: await sha256(jsonBytes(record.content)), createdAt: new Date().toISOString(), versionLabel: `修正前の試読 · ${session.contentRevision}` };
  return { baseRevision: project.revision, anchor: { ...anchor, sourceVersionId: ids.snapshotId }, candidate: structuredClone(candidate), sourceTrace, entities: [checkpoint, sourceTrace], snapshots: [snapshot] };
}

export async function prepareTrialCorrectionSave(project: ProjectData, plan: TrialCorrectionPlan, text: string, worldSnapshots: Record<ID, import('./types').ProjectContent> = {}) {
  if (project.revision !== plan.baseRevision || project.projectId !== plan.candidate.projectId) throw new Error('修正候補を開いた後に作品が更新されました。入力を保持して現在稿と比較してください。');
  const before = project.entities.find(entity => entity.id === plan.candidate.id);
  if (!before || before.kind !== plan.candidate.kind || semantic(before) !== semantic(plan.candidate)) throw new Error('修正元の本文が更新されました。入力を保持して比較してください。');
  const candidate = structuredClone(plan.candidate), blocks = candidate.kind === 'scene' ? candidate.data.body : candidate.data.text;
  const wholeText = blocks.map(block => block.id === plan.anchor.blockId ? text : block.text).join('\n');
  const edited = editRichText(blocks, wholeText);
  if (candidate.kind === 'scene') candidate.data.body = edited; else candidate.data.text = edited;
  const entities = remapEditedTextReferences([...project.entities.map(entity => entity.id === candidate.id ? candidate : entity), ...plan.entities], before, candidate);
  const relations = remapEditedTextRelationReferences(project.relations, before, candidate);
  const next = { ...project, entities, relations, snapshots: [...project.snapshots, ...plan.snapshots] };
  const captured = await captureRuntimeContent(next, next.projectId, { worldSnapshots });
  const { snapshots: _snapshots, history: _history, authorAlternatives: _alternatives, ...content } = captured;
  const snapshot: ProjectSnapshot = { id: newId(), content, contentHash: await sha256(jsonBytes(content)), createdAt: new Date().toISOString(), versionLabel: `一文修正後の試読 · ${project.revision}` };
  return { project: { ...next, snapshots: [...next.snapshots, snapshot] }, targetVersionId: snapshot.id };
}
