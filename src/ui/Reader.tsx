import { readerDraft, updateReaderDraft, useReaderField } from './readerDraft';
import { DialoguePresentation } from './DialoguePresentation';
import { preparePartialCheckpoint } from '../domain/checkpoints';
import { RuntimeReconfirmation, runtimeReconfirmationBusy } from './RuntimeReconfirmation';
import { reuseTargetAnchor } from '../domain/reuse';
import { resolvePinnedWorlds } from '../domain/pinnedWorlds';
import { NarrativeClaims } from './NarrativeClaims';
import { stateUsage } from '../domain/stateUsage';
import { declaredRegressionPaths } from '../domain/regressionPaths';
import { startTrialVerified, replaySavedTraceVerified, analyzeFlowVerified } from '../domain/runtimeVerified';
import { useEffect, useRef, useState } from 'react';
import type { ContentAnchor, Entity, ProjectContent, ProjectData, ProjectSnapshot, TypedValue } from '../domain/types';
import { createEntity, newId, getEntitiesByKind } from '../domain/model';
import { backTrial, diffRuntimeStates, checkTrialForeshadows, getTrialChoices, getTrialContent, getTrialNode, pinTrialRecord, restartTrial, setTrialStubValues, stepTrial, trialCoverage, trialNarrativeOccurrences, type AnalysisResult, type TrialSession } from '../domain/runtime';
import { jsonBytes, sha256 } from '../storage';
import { EmptyState, Icon, Modal, downloadBytes, safeFileName } from './components';
import { dataOf, labelOf, RichTextView, TypedField } from './Fields';

const TRIAL_LABELS = { ready: '試読中', terminal: '意図した終端', blocked: '進行不可', unknown: '未確認の条件', error: '確認が必要' };
const FINDING_LABELS: Record<string, string> = { confirmed_issue: '確認された問題', candidate: '確認候補', unknown: '不明・探索未完了', intentional: '意図した終端', passed_for_checked_scope: '確認した範囲で問題なし' };
const displayValue = (value: unknown) => { if (value === undefined) return '未設定'; if (value && typeof value === 'object' && 'type' in value) { const typed = value as any; return typed.type === 'unknown' ? `不明（${typed.reason}）` : String(typed.value); } return typeof value === 'object' ? JSON.stringify(value) : String(value); };
type PartialPreparation = { checkpointId?: string; snapshotId?: string; error?: string };
const partialPreparations = new Map<string, PartialPreparation>(), PARTIAL_EVENT = 'scenario-partial-start-save';
const readerPreferences = new Map<string, { entry: string; checkpoint: string; version: string; seed: string; worldTick: string }>();
const notifyPartial = (projectId: string) => window.dispatchEvent(new CustomEvent(PARTIAL_EVENT, { detail: { projectId } }));

export function Reader({ project, worldSnapshots = {}, onOpen, onOpenTarget, onSaveMany }: { project: ProjectData; worldSnapshots?: Record<string, ProjectContent>; onOpenTarget?: (anchor: ContentAnchor) => void; onOpen: (id: string) => void; onSaveMany: (entities: Entity[], reason: string, assets?: undefined, snapshots?: ProjectSnapshot[], expectedRevision?: string) => Promise<void> }) {
  readerDraft(project.projectId, runtimeReconfirmationBusy(project.projectId) || partialPreparations.has(project.projectId) && !partialPreparations.get(project.projectId)?.error);
  const [session, setSession] = useReaderField(project.projectId, 'session');
  const [compareIds, setCompareIds] = useState<string[]>([]);
  const [comparison, setComparison] = useState<{ left: TrialSession; right: TrialSession } | null>(null);
  const declarations = declaredRegressionPaths(project);
  const [entry, setEntry] = useState(readerPreferences.get(project.projectId)?.entry ?? '');
  const [checkpoint, setCheckpoint] = useState(readerPreferences.get(project.projectId)?.checkpoint ?? '');
  const [version, setVersion] = useState(readerDraft(project.projectId).session?.state.contentVersionId === project.projectId ? readerPreferences.get(project.projectId)?.version ?? '' : readerDraft(project.projectId).session?.state.contentVersionId ?? readerPreferences.get(project.projectId)?.version ?? '');
  const [seed, setSeed] = useState(readerPreferences.get(project.projectId)?.seed ?? '物語の試読');
  const [vertical, setVertical] = useState(false);
  const [error, setError] = useReaderField(project.projectId, 'error');
  const [notice, setNotice] = useReaderField(project.projectId, 'notice');
  const [saving, setSaving] = useReaderField(project.projectId, 'saving');
  const [busy, setBusy] = useReaderField(project.projectId, 'busy');
  const operation = readerDraft(project.projectId).operation;
  const live = useRef(true);
  useEffect(() => { live.current = true; return () => { live.current = false; }; }, []);
  const [stubId, setStubId] = useState<string | null>(null);
  const [stubValue, setStubValue] = useState<TypedValue>({ type: 'unknown', value: null, reason: '仮値未入力' });
  const [analysis, setAnalysis] = useState<AnalysisResult | null>(null);
  const [analyzing, setAnalyzing] = useState(false);
  const [progress, setProgress] = useState(0);
  const [triggerConfirmed, setTriggerConfirmed] = useState(false);
  const [worldTick, setWorldTick] = useState(readerPreferences.get(project.projectId)?.worldTick ?? '');
  const [pendingReplay, setPendingReplay] = useReaderField(project.projectId, 'pendingReplay');
  const [pendingCheckpoint, setPendingCheckpoint] = useState<{ checkpointId: string; snapshotId: string } | null>(null);
  useEffect(() => { readerPreferences.set(project.projectId, { entry, checkpoint, version, seed, worldTick }); }, [project.projectId, entry, checkpoint, version, seed, worldTick]);
  useEffect(() => {
    const sync = (event?: Event) => {
      if (event && (event as CustomEvent).detail.projectId !== project.projectId) return;
      const preparation = partialPreparations.get(project.projectId);
      if (!preparation) return;
      operation.current = !preparation.error; setBusy(!preparation.error);
      if (preparation.error) setError(preparation.error);
      if (preparation.checkpointId && preparation.snapshotId) setPendingCheckpoint({ checkpointId: preparation.checkpointId, snapshotId: preparation.snapshotId });
    };
    sync(); window.addEventListener(PARTIAL_EVENT, sync); return () => window.removeEventListener(PARTIAL_EVENT, sync);
  }, [project.projectId]);
  const controller = useRef<AbortController | null>(null);
  useEffect(() => () => controller.current?.abort(), []);
  const selectedContent = version ? project.snapshots.find(snapshot => snapshot.id === version)?.content : project;
  const nodes = (selectedContent?.entities ?? []).filter(e => e.kind === 'flow_node' && !e.deletedAt && !['rejected', 'alternate'].includes(e.status));
  const chapterCheckpointIds = new Set(project.entities.filter((entity): entity is Entity<'trace'> => entity.kind === 'trace' && entity.data.mode === 'chapters').map(entity => entity.data.startCheckpointId));
  const checkpoints = project.entities.filter(e => e.kind === 'checkpoint' && !e.deletedAt && !chapterCheckpointIds.has(e.id) && e.data.contentVersionId === (version || project.projectId));
  const content = session ? getTrialContent(project, session) || project : project;
  const displayEntities = [...content.entities, ...(session?.referenceEntities ?? [])];
  const displayProject = { ...content, entities: displayEntities };
  const node = session ? getTrialNode(project, session) : undefined;
  const scene = node ? displayEntities.find(e => e.id === dataOf(node).sceneId) : undefined;
  const choices = session ? getTrialChoices(project, session) : [];
  const intrinsicTransfer = node && dataOf(node).nodeType === 'call' ? 'call' : node && dataOf(node).nodeType === 'exit' && session && session.state.callStack.length > 0 ? 'return' : undefined;
  const policy = node ? dataOf(node).executionPolicy || (dataOf(node).nodeType === 'automatic' ? 'first_match' : 'manual_choice') : 'manual_choice';
  const fallbackTargetId = node && typeof dataOf(node).fallbackId === 'string' ? dataOf(node).fallbackId : undefined;
  const fallbackTarget = fallbackTargetId ? displayEntities.find(e => e.id === fallbackTargetId && e.kind === 'flow_node' && !e.deletedAt) : undefined;
  const canAdvanceToFallback = !!session && session.status === 'ready' && !intrinsicTransfer && policy === 'manual_choice' && !choices.some(choice => choice.result === 'true') && !!fallbackTarget;
  const coverage = session ? trialCoverage(project, session) : null;
  const variables = [...getEntitiesByKind(content, 'variable'), ...(session?.referenceEntities ?? []).filter((entity): entity is Entity<'variable'> => entity.kind === 'variable')].filter(e => !e.deletedAt && !['rejected', 'alternate'].includes(e.status));
  const externalContracts = [...getEntitiesByKind(content, 'external_contract'), ...(session?.referenceEntities ?? []).filter((entity): entity is Entity<'external_contract'> => entity.kind === 'external_contract')].filter(entity => !entity.deletedAt && !['rejected', 'alternate'].includes(entity.status));
  const savedTraces = getEntitiesByKind(project, 'trace').filter(trace => trace.data.mode !== 'chapters');
  const foreshadowFindings = session ? checkTrialForeshadows(project, session) : [];
  const trigger = node ? dataOf(node).trigger : undefined;
  const pendingPresentation = !!session && "pendingPresentation" in session && !!session.pendingPresentation;
  const stale = !!session && (version ? !project.snapshots.some(s => s.id === version) : session.contentRevision !== project.revision);

  const openTarget = (anchor: ContentAnchor) => {
    anchor = reuseTargetAnchor(content, anchor);
    const closure = resolvePinnedWorlds(content, worldSnapshots);
    const borrowed = (session?.referenceEntities ?? []).find(entity => entity.id === anchor.entityId);
    const borrowedVersion = borrowed ? closure.references.find(reference => reference.projectId === borrowed.projectId)?.immutableSnapshotId : undefined;
    const target = { ...anchor, ...(borrowedVersion && !anchor.sourceVersionId ? { sourceVersionId: borrowedVersion } : {}), ...(anchor.sourceVersionId || borrowedVersion ? {} : session && session.state.contentVersionId !== project.projectId ? { sourceVersionId: session.state.contentVersionId } : {}) };
    if (onOpenTarget) onOpenTarget(target);
    else if (!target.sourceVersionId || target.sourceVersionId === project.projectId) onOpen(target.entityId);
  };
  const begin = async () => {
    if (operation.current) return;
    operation.current = true; setBusy(true); setNotice(''); setError('');
    try { const next = await startTrialVerified(project, { entryId: entry || undefined, checkpointId: checkpoint || undefined, contentVersionId: version || undefined, worldTick: worldTick || undefined, seed }, worldSnapshots); setSession(next); }
    catch (cause) { setError((cause as Error).message); }
    finally { operation.current = false; setBusy(false); }
  };
  const prepareStart = async () => {
    if (operation.current) return;
    operation.current = true; setBusy(true); setError(''); partialPreparations.set(project.projectId, {}); notifyPartial(project.projectId);
    try {
      const result = await preparePartialCheckpoint(project, { contentVersionId: version || undefined, entryId: entry || undefined, worldTick: worldTick || undefined, worldSnapshots });
      await onSaveMany([result.checkpoint], '型付き途中開始の状態と固定版を原子保存', undefined, result.snapshots, project.revision);
      partialPreparations.set(project.projectId, { checkpointId: result.checkpoint.id, snapshotId: result.checkpoint.data.contentVersionId }); notifyPartial(project.projectId);
    } catch (cause) { partialPreparations.set(project.projectId, { error: (cause as Error).message }); notifyPartial(project.projectId); operation.current = false; }
  };
  useEffect(() => {
    if (!pendingCheckpoint || !project.entities.some(entity => entity.id === pendingCheckpoint.checkpointId) || !project.snapshots.some(snapshot => snapshot.id === pendingCheckpoint.snapshotId)) return;
    partialPreparations.delete(project.projectId);
    setVersion(pendingCheckpoint.snapshotId); setCheckpoint(pendingCheckpoint.checkpointId); setEntry(''); setPendingCheckpoint(null); operation.current = false; setBusy(false);
    setNotice('途中開始の固定版と状態を保存しました。所持品・知識・状態値は通常フォームで編集できます。'); onOpen(pendingCheckpoint.checkpointId);
  }, [pendingCheckpoint, project]);
  useEffect(() => { setTriggerConfirmed(false); }, [session?.nodeId]);
  useEffect(() => {
    if (!pendingReplay || !project.entities.some(e => e.id === pendingReplay.traceId)) return;
    let active = true;
    void replaySavedTraceVerified(project, pendingReplay.traceId, worldSnapshots).then(next => {
      if (!active) return;
      setVersion(pendingReplay.snapshotId); operation.current = false;
      updateReaderDraft(project.projectId, { session: next, pendingReplay: null, notice: '開始状態と経路を端末内に保存しました。', busy: false, saving: false });
    }).catch(cause => {
      if (!active) return;
      operation.current = false;
      updateReaderDraft(project.projectId, { error: (cause as Error).message, pendingReplay: null, busy: false, saving: false });
    });
    return () => { active = false; };
  }, [pendingReplay, project, worldSnapshots]);
  const changeSession = (change: (current: TrialSession) => TrialSession) => {
    if (operation.current) return;
    operation.current = true;
    setSession(current => current ? change(current) : current);
    // Guard same-turn double dispatch, then allow a subsequent intentional action.
    queueMicrotask(() => { operation.current = false; });
  };
  const advance = (edgeId?: string, random = false) => {
    if (operation.current || !session || pendingPresentation) return;
    changeSession(current => stepTrial(project, current, { edgeId, random, worldTick: worldTick || undefined, event: trigger && triggerConfirmed ? { triggerId: trigger.id || node!.id, event: trigger.event, eventKey: trigger.eventKey, occurrenceId: newId() } : undefined }));
    setTriggerConfirmed(false);
  };
  const persist = async () => {
    if (operation.current || !session) return;
    operation.current = true; setBusy(true);
    setSaving(true); setError(''); setNotice('');
    try {
      const checkpointId = newId();
      const snapshotId = newId();
      const data = pinTrialRecord(session, { checkpointId, snapshotId }, project);
      const beginEntity = { ...createEntity(project.projectId, 'checkpoint', `開始状態 · ${new Date().toLocaleString('ja-JP')}`, data.checkpoint), id: checkpointId };
      const trace = createEntity(project.projectId, 'trace', `試読経路 · ${session.trace.length}遷移`, data.trace);
      const snapshot: ProjectSnapshot = { id: snapshotId, content: data.content, contentHash: await sha256(jsonBytes(data.content)), createdAt: new Date().toISOString(), versionLabel: `試読記録の固定版 ${session.contentRevision}` };
      await onSaveMany([beginEntity, trace], '試読の開始状態と経路を記録', undefined, [snapshot], project.revision);
      setPendingReplay({ traceId: trace.id, snapshotId });
    } catch (e) { operation.current = false; setError((e as Error).message); setBusy(false); setSaving(false); }
  };
  const analyze = async () => {
    if (operation.current) return;
    operation.current = true; setBusy(true);
    const abort = new AbortController();
    controller.current = abort;
    setAnalyzing(true); setError(''); setAnalysis(null); setProgress(0);
    try { const result = await analyzeFlowVerified(project, { entryId: entry || undefined, worldTick: worldTick || undefined, contentVersionId: version || undefined, maxStates: 100000, maxTransitions: 10000, maxMs: 30000, signal: abort.signal, onProgress: p => { if (live.current) setProgress(p.checkedStates); } }, worldSnapshots); setAnalysis(result); }
    catch (e) { if (!abort.signal.aborted) setError((e as Error).message); else setNotice('探索を中止しました。全体の確認は完了していません。'); }
    finally { operation.current = false; setBusy(false); if (live.current) setAnalyzing(false); controller.current = null; }
  };

  return <section className="reader-page"><div className="reader-setup"><div className="section-heading"><h3><Icon name="play"/>試読の開始状態</h3><span className="reader-private-label">作者メモを含めずに確認</span></div><div className="reader-setup-fields"><label>開始点<select aria-label="試読の開始点" disabled={busy} value={entry} onChange={e => setEntry(e.target.value)}><option value="">宣言した入口を使う</option>{nodes.map(n => <option key={n.id} value={n.id}>{labelOf(n)}</option>)}</select></label><label>作品版<select aria-label="試読する作品版" disabled={busy} value={version} onChange={e => { setVersion(e.target.value); setEntry(''); setCheckpoint(''); }}><option value="">現在の編集稿 · 版 {project.revision}</option>{project.snapshots.map(s => <option key={s.id} value={s.id}>{s.versionLabel}</option>)}</select></label><label>保存した開始状態<select aria-label="保存した開始状態" disabled={busy} value={checkpoint} onChange={e => setCheckpoint(e.target.value)}><option value="">初期値から開始</option>{checkpoints.map(c => <option key={c.id} value={c.id}>{labelOf(c)}</option>)}</select></label><label>初期提示の世界内tick<input aria-label="試読開始時点の世界内tick" disabled={busy} inputMode="numeric" value={worldTick} onChange={e => setWorldTick(e.target.value)}/></label><label>抽選種<input aria-label="抽選種" disabled={busy} value={seed} onChange={e => setSeed(e.target.value)}/></label></div><button type="button" className="button primary" onClick={() => void begin()} disabled={busy || !nodes.length}><Icon name="play" size={18}/>{session ? 'この状態から開始し直す' : '試読を始める'}</button><button className="button secondary" disabled={busy || !nodes.length} onClick={() => void prepareStart()}>途中開始の状態を作成</button></div>
    {!nodes.length && <EmptyState icon="play" title="分岐の入口を追加してください">「分岐」から入口と進行先を登録すると、本文と状態を試読できます。</EmptyState>}
    {error && <div className="error-notice" role="alert">{error}</div>}{notice && <div className="success-notice" role="status">{notice}</div>}
    {session && <><div className="reader-trial-heading"><span className={`trial-state trial-${session.status}`}>{TRIAL_LABELS[session.status]}</span><span>{session.state.provenance === 'stub' ? '仮値を使った経路' : session.state.provenance === 'partial' ? '途中開始の経路' : '初期状態からの経路'} · 周回 {session.state.loopNumber}</span><label className="check-label"><input type="checkbox" checked={vertical} onChange={e => setVertical(e.target.checked)}/>縦書き</label></div>{stale && <div className="info-notice">編集稿の版が変わりました。開始し直して変更内容を確認してください。記録した経路は保持されています。</div>}<div className="reader-layout"><article className="reader-sheet"><div className="reader-sheet-heading"><span className="eyebrow">{node ? dataOf(node).nodeType === 'terminal' ? 'ENDING' : 'SCENE' : '開始状態を確認'}</span><h2>{labelOf(scene || node)}</h2>{scene && <button className="text-button" onClick={() => openTarget({ entityId: scene.id })}>本文を編集<Icon name="arrow" size={16}/></button>}</div>{scene && !pendingPresentation ? <><RichTextView value={dataOf(scene).body} vertical={vertical} onOpenTarget={openTarget}/><DialoguePresentation key={scene.id} project={displayProject} lineIds={dataOf(scene).dialogueLineIds ?? []} vertical={vertical} onOpenTarget={openTarget}/></> : <p className="reader-no-body">{pendingPresentation ? "提示条件の不足値を確認してください。条件と知識への効果が確定するまで本文を提示しません。" : "このノードには本文の場面が設定されていません。"}</p>}{session.issues.map((i, index) => <p className="reader-issue" key={index}>{i.message}</p>)}{session.status === 'terminal' && <p className="reader-ending"><Icon name="check"/> {node && dataOf(node).terminalReason}</p>}<>{trigger && <div className="reader-trigger"><label className="check-label"><input type="checkbox" checked={triggerConfirmed} onChange={e => setTriggerConfirmed(e.target.checked)}/>宣言したきっかけ「{trigger.eventKey || trigger.event}」で進む</label></div>}</><input aria-label="試読時点の世界内tick" placeholder="期限の判定に使う世界内tick（未入力は不明）" value={worldTick} onChange={e => setWorldTick(e.target.value)}/><div className="reader-choices">{intrinsicTransfer ? session.status === 'ready' && <button className="button primary" disabled={busy || stale || pendingPresentation || trigger && !triggerConfirmed} onClick={() => advance()}>{intrinsicTransfer === 'call' ? '呼出し規則に従って進む' : '呼出元へ戻る'}<Icon name="arrow" size={18}/></button> : policy === 'manual_choice' ? choices.map(choice => <div key={choice.edgeId}>{(() => { const edge = displayEntities.find((entity): entity is Entity<'flow_edge'> => entity.kind === 'flow_edge' && entity.id === choice.edgeId); const line = displayEntities.find((entity): entity is Entity<'dialogue_line'> => entity.kind === 'dialogue_line' && entity.id === edge?.data.choiceLineId); return line ? <RichTextView value={line.data.text} vertical={vertical} onOpenTarget={openTarget}/> : null; })()}<button className={`reader-choice choice-${choice.result}`} key={choice.edgeId} disabled={busy || choice.result !== 'true' || stale || pendingPresentation || !choice.toId || trigger && !triggerConfirmed} onClick={() => advance(choice.edgeId)}><span><strong>{choice.label}</strong><small>{choice.result === 'unknown' ? '未確認 · ' : choice.result === 'false' ? '条件を満たしていません · ' : ''}{choice.reasons.join('、')}{!choice.toId && '行き先未完成'}</small></span><Icon name="arrow" size={18}/></button></div>) : session.status === 'ready' && <button className="button primary" disabled={busy || stale || pendingPresentation || trigger && !triggerConfirmed} onClick={() => advance()}>進行規則に従って次へ<Icon name="arrow" size={18}/></button>}{canAdvanceToFallback && <button className="button secondary reader-fallback" disabled={busy || stale || pendingPresentation || trigger && !triggerConfirmed} onClick={() => advance()}>代替の進行先へ：{labelOf(fallbackTarget)}<Icon name="arrow" size={18}/></button>}</div>{!intrinsicTransfer && policy === "manual_choice" && choices.length > 1 && <button className="button secondary small" disabled={busy || stale || pendingPresentation || session.status !== "ready" || trigger && !triggerConfirmed} onClick={() => advance(undefined, true)}>真の選択肢から抽選</button>}<div className="reader-controls"><button className="button secondary small" disabled={busy || !session.history.length} onClick={() => changeSession(backTrial)}><Icon name="back" size={16}/>一手戻る</button><button className="button subtle small" disabled={busy} onClick={() => changeSession(current => restartTrial(project, current, 'next_run', entry || undefined, { worldTick: worldTick || undefined }))}>次の周回</button><button className="button subtle small" disabled={busy} onClick={() => changeSession(current => restartTrial(project, current, 'all', entry || undefined, { worldTick: worldTick || undefined }))}>すべて初期化</button></div></article><aside className="reader-state-panel"><h3>試読の状態</h3>{session.state.resetCauses?.length ? <details><summary>直前の初期化と原因 · {session.state.resetCauses.length}件</summary>{session.state.resetCauses.map((cause, i) => <p key={i}><button className="text-button" onClick={() => openTarget({ entityId: cause.variableId })}>{labelOf(variables.find(v => v.id === cause.variableId))}</button> {cause.on} · {displayValue(cause.before)} → {displayValue(cause.after)} · {cause.reason}</p>)}</details> : null}<p className="field-hint">作品の設定値とは別に保持しています。</p><div className="runtime-variables">{variables.map(v => <div className="runtime-variable" key={v.id}><span><strong>{labelOf(v)}</strong><small>{v.data.key}</small></span><span>{displayValue(session.state.variableValues[v.id])}</span><button className="text-button" disabled={busy} onClick={() => { setStubId(v.id); setStubValue(session.state.variableValues[v.id] || { type: 'unknown', value: null, reason: '' }); }}>仮値</button></div>)}</div>{externalContracts.length > 0 && <div className="runtime-external"><h4>外部値</h4>{externalContracts.map(contract => <div className="runtime-variable" key={contract.id}><span><strong>{labelOf(contract)}</strong><small>{contract.data.key} · {contract.data.owner === "game" ? "ゲームが管理" : "ツールが管理"}</small></span><span>{displayValue(session.externalValues[contract.id])}</span><button className="text-button" disabled={busy} onClick={() => { setStubId(contract.id); setStubValue(session.externalValues[contract.id] || {type:"unknown",value:null,reason:"外部値未取得"}); }}>仮値</button></div>)}</div>}{!variables.length && <p className="field-hint">状態辞書はまだありません。</p>}<dl className="reader-state-counts"><dt>所持品</dt><dd>{session.state.itemInstances.filter(i => !i.consumed).length}個</dd><dt>知識・事実</dt><dd>{session.state.assertions.length}件</dd><dt>既読の対象</dt><dd>{session.state.seenIds.length}件</dd><dt>抽選位置</dt><dd>{session.state.rngPosition}</dd><dt>呼出し階層</dt><dd>{session.state.callStack.length}</dd></dl>{session.lastDiff.length > 0 && <section className="runtime-diff"><h4>直前の状態差分</h4>{session.lastDiff.map((d, i) => <p key={i}><span>{labelOf(displayEntities.find(e => d.path.includes(e.id))) || d.path}</span><small>{displayValue(d.before)} → {displayValue(d.after)}</small></p>)}</section>}</aside></div>
      <section className="trial-trace"><div className="section-heading"><h3>通った経路</h3><button className="button secondary small" onClick={() => void persist()} disabled={busy || !session.trace.length}>{saving ? '保存中' : '経路を記録'}</button></div><ol>{[session.startState.presentationPosition, ...session.trace.map(t => t.toId)].filter(Boolean).map((id, i) => <li key={`${id}-${i}`}><span className="trace-index">{i + 1}</span><button className="text-button" onClick={() => openTarget({ entityId: id! })}>{labelOf(displayEntities.find(e => e.id === id))}</button>{i > 0 && <small>{session.trace[i - 1]?.edgeIds.map(edgeId => { const e = displayEntities.find(v => v.id === edgeId); return e ? dataOf(e).label || labelOf(e) : ''; }).join(' / ')}</small>}</li>)}</ol></section>{coverage && <div className="coverage-cards">{([['scenes', '場面の到達'], ['dialogue', '台詞の到達'], ['choices', '選択肢の実行'], ['conditions', '条件の真偽確認']] as const).map(([key, label]) => <div key={key}><span>{label}</span><strong>{coverage[key].reached}<small> / {coverage[key].total}</small></strong><span className="field-hint">不明 {coverage[key].unknown} · 除外 {coverage[key].excluded}</span></div>)}</div>}</>}
    {session && <NarrativeClaims project={content} occurrences={trialNarrativeOccurrences(session)} referenceEntities={session.referenceEntities} state={session.state} onOpenTarget={openTarget}/>}
    {session && <section className="foreshadow-check"><div className="section-heading"><h3>この経路の伏線・回収</h3></div><p className="field-hint">作者が必須とした情報の提示順を確認します。読者の理解は判定しません。</p>{foreshadowFindings.length ? foreshadowFindings.map((finding,i) => <article className="analysis-finding" key={i}><span className="eyebrow">{FINDING_LABELS[finding.status]}</span><p>{finding.message}</p>{finding.missingInfoIds?.length ? <p className="finding-path">不足する提示：{finding.missingInfoIds.map(id=>labelOf(displayEntities.find(e=>e.id===id))).join('、')}</p> : null}{finding.targetId && <button className="text-button" onClick={()=>openTarget({ entityId: finding.targetId! })}>伏線を開く</button>}<p className="finding-path">根拠経路：{finding.path.map(id=>labelOf(displayEntities.find(e=>e.id===id))).join(' → ')}</p></article>) : <p className="field-hint">この経路で検出された必須提示の不足候補はありません。まだ通っていない回収の評価は含みません。</p>}</section>}
    <RuntimeReconfirmation project={project} version={version} worldTick={worldTick} entryId={entry} selectedCheckpointId={checkpoint} worldSnapshots={worldSnapshots} disabled={busy} onBusy={value => { operation.current = value; setBusy(value); }} onSaveMany={onSaveMany}/>
    {savedTraces.length > 0 && <section className="saved-traces"><div className="section-heading"><h3>保存した経路の再実行</h3></div>{savedTraces.map(trace=><button key={trace.id} className="reference-link" disabled={busy} onClick={async () => { if (operation.current) return; operation.current = true; setBusy(true); setError(''); try { const next = await replaySavedTraceVerified(project, trace.id, worldSnapshots); { setSession(next); readerPreferences.set(project.projectId, { ...(readerPreferences.get(project.projectId) ?? { entry: '', checkpoint: '', seed: '物語の試読', worldTick: '' }), version: trace.data.contentVersionId }); if (live.current) setVersion(trace.data.contentVersionId); setNotice('保存版で経路を再実行しました。状態の一致を検査しています。'); } } catch (cause) { setError((cause as Error).message); } finally { operation.current = false; setBusy(false); } }}><Icon name="play" size={16}/>{labelOf(trace)}<small>再実行して状態を比較</small></button>)}</section>}
    <section className="regression-paths"><h3>回帰経路と合流比較</h3><p>宣言経路 {declarations.ids.length}件。保存版・開始由来・仮値を保持し、改訂後の確認とは区別します。</p>{savedTraces.slice(0, 60).map(trace => <label className="check-label" key={trace.id}><input type="checkbox" checked={compareIds.includes(trace.id)} disabled={busy} onChange={e => setCompareIds(ids => e.target.checked ? [...ids, trace.id] : ids.filter(id => id !== trace.id))}/>{labelOf(trace)} · {trace.data.contentRevision ?? '旧形式の版記録'} · {trace.data.externalMode ?? '内部状態'}</label>)}<button className="button secondary small" disabled={busy || compareIds.length !== 2} onClick={async () => { if (operation.current) return; operation.current = true; setBusy(true); setError(''); try { const left = await replaySavedTraceVerified(project, compareIds[0], worldSnapshots); const right = await replaySavedTraceVerified(project, compareIds[1], worldSnapshots); if (left.status === 'error' || right.status === 'error') throw new Error([...left.issues, ...right.issues].map(issue => issue.message).join('、')); setComparison({ left, right }); } catch (cause) { setError((cause as Error).message); } finally { operation.current = false; setBusy(false); } }}>選んだ二経路を再生して比較</button><button className="button secondary small" disabled={busy || !compareIds.length} onClick={async () => { if (operation.current) return; operation.current = true; setBusy(true); setError(''); try { await onSaveMany([createEntity(project.projectId, 'collection', '回帰経路集合', { mode: 'fixed', purpose: 'regression', memberIds: compareIds })], '確認する回帰経路を宣言'); } catch (cause) { setError((cause as Error).message); } finally { operation.current = false; setBusy(false); } }}>選んだ経路を回帰集合へ保存</button>{comparison && <div><p>{comparison.left.nodeId === comparison.right.nodeId ? '同じ合流点の状態' : '終点が異なる経路の状態'} · {comparison.left.state.contentVersionId === comparison.right.state.contentVersionId ? '同じ作品版' : '異なる作品版・改訂差を含む'}</p>{diffRuntimeStates(comparison.left.state, comparison.right.state).map((difference, i) => <p key={i}>{difference.path}: {displayValue(difference.before)} → {displayValue(difference.after)}</p>)}</div>}</section>
    {variables.length > 0 && <section><h3>状態の読取・更新・初期化</h3>{variables.map(variable => { const uses = stateUsage(displayProject, variable.id); return <details key={variable.id}><summary>{labelOf(variable)} · {variable.data.scope} · {uses.length}箇所{variable.data.externalUseDeclared && ' · 外部利用を宣言'}</summary>{uses.map((use, i) => <p key={i}><button className="text-button" onClick={() => openTarget({ entityId: use.entityId })}>{labelOf(displayEntities.find(entity => entity.id === use.entityId))}</button> · {use.operation} · {use.reason}</p>)}{!uses.length && <p>未使用候補。削除は自動実行しません。</p>}</details>; })}</section>}
    <section className="analysis-section"><div className="section-heading"><h3>分岐の検査</h3>{analyzing ? <button className="button secondary small" onClick={() => controller.current?.abort()}>探索を中止</button> : <button className="button secondary small" onClick={() => void analyze()} disabled={busy || !nodes.length}>到達性と行き止まりを検査</button>}</div><p className="field-hint">最大100,000状態・10,000遷移・30秒の範囲を探索します。未確定値と探索打切りを確認済みとして扱いません。</p>{analyzing && <p role="status">{progress.toLocaleString()}状態を確認中…</p>}{analysis && <><div className="analysis-result-heading"><strong>{FINDING_LABELS[analysis.status]}</strong><span>{analysis.checkedStates.toLocaleString()}状態 · 版 {analysis.contentRevision}{analysis.truncated && ' · 探索打切り'}</span></div>{analysis.assumptions.map((assumption, i) => <p className="field-hint" key={i}>{assumption}</p>)}{analysis.findings.map((finding, i) => <article className="analysis-finding" key={i}><span className="eyebrow">{FINDING_LABELS[finding.status]}</span><p>{finding.message}</p>{finding.targetId && <button className="text-button" onClick={() => onOpen(finding.targetId!)}>対象を開く<Icon name="arrow" size={16}/></button>}{finding.path.length > 0 && <p className="finding-path">根拠経路：{finding.path.map(id => labelOf((selectedContent?.entities ?? []).find(e => e.id === id))).join(' → ')}</p>}</article>)}<button className="text-button" onClick={() => downloadBytes(JSON.stringify(analysis, null, 2), `${safeFileName(project.name)}-分岐検査.json`)}><Icon name="download" size={16}/>検査結果を保存</button></>}</section>
    {stubId && session && <Modal title="作者の仮値を設定" onClose={() => setStubId(null)}><p>この値を使う経路は「仮値」の証跡として記録します。「一手戻る」で仮値も戻せます。</p><div className="form-field"><label>{labelOf([...content.entities, ...(session?.referenceEntities ?? [])].find(e => e.id === stubId))}</label><TypedField project={content} value={stubValue} preferredType={dataOf([...content.entities, ...(session?.referenceEntities ?? [])].find(e => e.id === stubId)!).valueType || dataOf([...content.entities, ...(session?.referenceEntities ?? [])].find(e => e.id === stubId)!).outputType} onChange={v => setStubValue(v as TypedValue)}/></div><div className="modal-actions"><button className="button secondary" onClick={() => setStubId(null)}>中止</button><button className="button primary" onClick={() => { changeSession(current => setTrialStubValues(project, current, [...content.entities, ...(session?.referenceEntities ?? [])].find(e => e.id === stubId)?.kind === "external_contract" ? {external:{[stubId]:stubValue}} : {variables:{[stubId]:stubValue}})); setStubId(null); }}>仮値を適用</button></div></Modal>}
  </section>;
}
