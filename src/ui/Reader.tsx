import { useEffect, useRef, useState } from 'react';
import type { Entity, ProjectData, ProjectSnapshot, TypedValue } from '../domain/types';
import { createEntity, newId, getEntitiesByKind } from '../domain/model';
import { analyzeFlowAsync, backTrial, checkTrialForeshadows, getTrialChoices, getTrialContent, pinTrialRecord, replaySavedTrace, restartTrial, setTrialStubValues, startTrial, stepTrial, trialCoverage, type AnalysisResult, type TrialSession } from '../domain/runtime';
import { jsonBytes, sha256 } from '../storage';
import { EmptyState, Icon, Modal, downloadBytes, safeFileName } from './components';
import { dataOf, labelOf, RichTextView, TypedField } from './Fields';

const TRIAL_LABELS = { ready: '試読中', terminal: '意図した終端', blocked: '進行不可', unknown: '未確認の条件', error: '確認が必要' };
const FINDING_LABELS: Record<string, string> = { confirmed_issue: '確認された問題', candidate: '確認候補', unknown: '不明・探索未完了', intentional: '意図した終端', passed_for_checked_scope: '確認した範囲で問題なし' };
const displayValue = (value: unknown) => { if (value === undefined) return '未設定'; if (value && typeof value === 'object' && 'type' in value) { const typed = value as any; return typed.type === 'unknown' ? `不明（${typed.reason}）` : String(typed.value); } return typeof value === 'object' ? JSON.stringify(value) : String(value); };

export function Reader({ project, onOpen, onSaveMany }: { project: ProjectData; onOpen: (id: string) => void; onSaveMany: (entities: Entity[], reason: string, assets?: undefined, snapshots?: ProjectSnapshot[]) => Promise<void> }) {
  const [session, setSession] = useState<TrialSession | null>(null);
  const [entry, setEntry] = useState('');
  const [checkpoint, setCheckpoint] = useState('');
  const [version, setVersion] = useState('');
  const [seed, setSeed] = useState('物語の試読');
  const [vertical, setVertical] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [saving, setSaving] = useState(false);
  const [stubId, setStubId] = useState<string | null>(null);
  const [stubValue, setStubValue] = useState<TypedValue>({ type: 'unknown', value: null, reason: '仮値未入力' });
  const [analysis, setAnalysis] = useState<AnalysisResult | null>(null);
  const [analyzing, setAnalyzing] = useState(false);
  const [progress, setProgress] = useState(0);
  const [triggerConfirmed, setTriggerConfirmed] = useState(false);
  const [worldTick, setWorldTick] = useState('');
  const [pendingReplay, setPendingReplay] = useState<{ traceId: string; snapshotId: string } | null>(null);
  const controller = useRef<AbortController | null>(null);
  useEffect(() => () => controller.current?.abort(), []);
  const nodes = project.entities.filter(e => e.kind === 'flow_node' && !e.deletedAt);
  const checkpoints = project.entities.filter(e => e.kind === 'checkpoint' && !e.deletedAt);
  const content = session ? getTrialContent(project, session) || project : project;
  const node = session ? content.entities.find(e => e.id === session.nodeId) : undefined;
  const scene = node ? content.entities.find(e => e.id === dataOf(node).sceneId) : undefined;
  const choices = session ? getTrialChoices(project, session) : [];
  const policy = node ? dataOf(node).executionPolicy || (dataOf(node).nodeType === 'automatic' ? 'first_match' : 'manual_choice') : 'manual_choice';
  const fallbackTargetId = node && typeof dataOf(node).fallbackId === 'string' ? dataOf(node).fallbackId : undefined;
  const fallbackTarget = fallbackTargetId ? content.entities.find(e => e.id === fallbackTargetId && e.kind === 'flow_node' && !e.deletedAt) : undefined;
  const canAdvanceToFallback = !!session && session.status === 'ready' && policy === 'manual_choice' && !choices.some(choice => choice.result === 'true') && !!fallbackTarget;
  const coverage = session ? trialCoverage(project, session) : null;
  const variables = getEntitiesByKind(content, 'variable');
  const externalContracts = getEntitiesByKind(content, 'external_contract');
  const savedTraces = getEntitiesByKind(project, 'trace');
  const foreshadowFindings = session ? checkTrialForeshadows(project, session) : [];
  const trigger = node ? dataOf(node).trigger : undefined;
  const pendingPresentation = !!session && "pendingPresentation" in session && !!session.pendingPresentation;
  const stale = !!session && (version ? !project.snapshots.some(s => s.id === version) : session.contentRevision !== project.revision);

  const begin = () => { setNotice(''); setError(''); setSession(startTrial(project, { entryId: entry || undefined, checkpointId: checkpoint || undefined, contentVersionId: version || undefined, seed })); };
  useEffect(() => { setTriggerConfirmed(false); }, [session?.nodeId]);
  useEffect(() => { if (pendingReplay && project.entities.some(e => e.id === pendingReplay.traceId)) { setSession(replaySavedTrace(project, pendingReplay.traceId)); setVersion(pendingReplay.snapshotId); setPendingReplay(null); } }, [pendingReplay, project.revision]);
  const advance = (edgeId?: string, random = false) => {
    if (!session || pendingPresentation) return;
    setSession(stepTrial(project, session, { edgeId, random, worldTick: worldTick || undefined, event: trigger && triggerConfirmed ? { triggerId: trigger.id || node!.id, event: trigger.event, eventKey: trigger.eventKey, occurrenceId: newId() } : undefined }));
    setTriggerConfirmed(false);
  };
  const persist = async () => {
    if (!session) return;
    setSaving(true); setError(''); setNotice('');
    try {
      const checkpointId = newId();
      const snapshotId = newId();
      const data = pinTrialRecord(session, { checkpointId, snapshotId });
      const beginEntity = { ...createEntity(project.projectId, 'checkpoint', `開始状態 · ${new Date().toLocaleString('ja-JP')}`, data.checkpoint), id: checkpointId };
      const trace = createEntity(project.projectId, 'trace', `試読経路 · ${session.trace.length}遷移`, data.trace);
      const snapshot: ProjectSnapshot = { id: snapshotId, content: data.content, contentHash: await sha256(jsonBytes(data.content)), createdAt: new Date().toISOString(), versionLabel: `試読記録の固定版 ${session.contentRevision}` };
      await onSaveMany([beginEntity, trace], '試読の開始状態と経路を記録', undefined, [snapshot]);
      setPendingReplay({ traceId: trace.id, snapshotId });
      setNotice('開始状態と経路を端末内に保存しました。');
    } catch (e) { setError((e as Error).message); }
    finally { setSaving(false); }
  };
  const analyze = async () => {
    const abort = new AbortController();
    controller.current = abort;
    setAnalyzing(true); setError(''); setAnalysis(null); setProgress(0);
    try { const result = await analyzeFlowAsync(project, { entryId: entry || undefined, contentVersionId: version || undefined, maxStates: 100000, maxTransitions: 10000, maxMs: 30000, signal: abort.signal, onProgress: p => setProgress(p.checkedStates) }); setAnalysis(result); }
    catch (e) { if (!abort.signal.aborted) setError((e as Error).message); else setNotice('探索を中止しました。全体の確認は完了していません。'); }
    finally { setAnalyzing(false); controller.current = null; }
  };

  return <section className="reader-page"><div className="reader-setup"><div className="section-heading"><h3><Icon name="play"/>試読の開始状態</h3><span className="reader-private-label">作者メモを含めずに確認</span></div><div className="reader-setup-fields"><label>開始点<select aria-label="試読の開始点" value={entry} onChange={e => setEntry(e.target.value)}><option value="">宣言した入口を使う</option>{nodes.map(n => <option key={n.id} value={n.id}>{labelOf(n)}</option>)}</select></label><label>作品版<select aria-label="試読する作品版" value={version} onChange={e => setVersion(e.target.value)}><option value="">現在の編集稿 · 版 {project.revision}</option>{project.snapshots.map(s => <option key={s.id} value={s.id}>{s.versionLabel}</option>)}</select></label><label>保存した開始状態<select aria-label="保存した開始状態" value={checkpoint} onChange={e => setCheckpoint(e.target.value)}><option value="">初期値から開始</option>{checkpoints.map(c => <option key={c.id} value={c.id}>{labelOf(c)}</option>)}</select></label><label>抽選種<input aria-label="抽選種" value={seed} onChange={e => setSeed(e.target.value)}/></label></div><button type="button" className="button primary" onClick={begin} disabled={!nodes.length}><Icon name="play" size={18}/>{session ? 'この状態から開始し直す' : '試読を始める'}</button></div>
    {!nodes.length && <EmptyState icon="play" title="分岐の入口を追加してください">「分岐」から入口と進行先を登録すると、本文と状態を試読できます。</EmptyState>}
    {error && <div className="error-notice" role="alert">{error}</div>}{notice && <div className="success-notice" role="status">{notice}</div>}
    {session && <><div className="reader-trial-heading"><span className={`trial-state trial-${session.status}`}>{TRIAL_LABELS[session.status]}</span><span>{session.state.provenance === 'stub' ? '仮値を使った経路' : session.state.provenance === 'partial' ? '途中開始の経路' : '初期状態からの経路'} · 周回 {session.state.loopNumber}</span><label className="check-label"><input type="checkbox" checked={vertical} onChange={e => setVertical(e.target.checked)}/>縦書き</label></div>{stale && <div className="info-notice">編集稿の版が変わりました。開始し直して変更内容を確認してください。記録した経路は保持されています。</div>}<div className="reader-layout"><article className="reader-sheet"><div className="reader-sheet-heading"><span className="eyebrow">{node ? dataOf(node).nodeType === 'terminal' ? 'ENDING' : 'SCENE' : '開始状態を確認'}</span><h2>{labelOf(scene || node)}</h2>{scene && <button className="text-button" onClick={() => onOpen(scene.id)}>本文を編集<Icon name="arrow" size={16}/></button>}</div>{scene && !pendingPresentation ? <RichTextView value={dataOf(scene).body} vertical={vertical} onOpen={onOpen}/> : <p className="reader-no-body">{pendingPresentation ? "提示条件の不足値を確認してください。条件と知識への効果が確定するまで本文を提示しません。" : "このノードには本文の場面が設定されていません。"}</p>}{session.issues.map((i, index) => <p className="reader-issue" key={index}>{i.message}</p>)}{session.status === 'terminal' && <p className="reader-ending"><Icon name="check"/> {node && dataOf(node).terminalReason}</p>}<>{trigger && <div className="reader-trigger"><label className="check-label"><input type="checkbox" checked={triggerConfirmed} onChange={e => setTriggerConfirmed(e.target.checked)}/>宣言したきっかけ「{trigger.eventKey || trigger.event}」で進む</label><input aria-label="試読時点の世界内tick" placeholder="期限の判定に使う世界内tick（未入力は不明）" value={worldTick} onChange={e => setWorldTick(e.target.value)}/></div>}</><div className="reader-choices">{policy === 'manual_choice' ? choices.map(choice => <button className={`reader-choice choice-${choice.result}`} key={choice.edgeId} disabled={choice.result !== 'true' || stale || pendingPresentation || !choice.toId || trigger && !triggerConfirmed} onClick={() => advance(choice.edgeId)}><span><strong>{choice.label}</strong><small>{choice.result === 'unknown' ? '未確認 · ' : choice.result === 'false' ? '条件を満たしていません · ' : ''}{choice.reasons.join('、')}{!choice.toId && '行き先未完成'}</small></span><Icon name="arrow" size={18}/></button>) : session.status === 'ready' && <button className="button primary" disabled={stale || pendingPresentation || trigger && !triggerConfirmed} onClick={() => advance()}>進行規則に従って次へ<Icon name="arrow" size={18}/></button>}{canAdvanceToFallback && <button className="button secondary reader-fallback" disabled={stale || pendingPresentation || trigger && !triggerConfirmed} onClick={() => advance()}>代替の進行先へ：{labelOf(fallbackTarget)}<Icon name="arrow" size={18}/></button>}</div>{policy === "manual_choice" && choices.length > 1 && <button className="button secondary small" disabled={stale || pendingPresentation || session.status !== "ready" || trigger && !triggerConfirmed} onClick={() => advance(undefined, true)}>真の選択肢から抽選</button>}<div className="reader-controls"><button className="button secondary small" disabled={!session.history.length} onClick={() => setSession(backTrial(session))}><Icon name="back" size={16}/>一手戻る</button><button className="button subtle small" onClick={() => setSession(restartTrial(project, session, 'next_run', entry || undefined))}>次の周回</button><button className="button subtle small" onClick={() => setSession(restartTrial(project, session, 'all', entry || undefined))}>すべて初期化</button></div></article><aside className="reader-state-panel"><h3>試読の状態</h3><p className="field-hint">作品の設定値とは別に保持しています。</p><div className="runtime-variables">{variables.map(v => <div className="runtime-variable" key={v.id}><span><strong>{labelOf(v)}</strong><small>{v.data.key}</small></span><span>{displayValue(session.state.variableValues[v.id])}</span><button className="text-button" onClick={() => { setStubId(v.id); setStubValue(session.state.variableValues[v.id] || { type: 'unknown', value: null, reason: '' }); }}>仮値</button></div>)}</div>{externalContracts.length > 0 && <div className="runtime-external"><h4>外部値</h4>{externalContracts.map(contract => <div className="runtime-variable" key={contract.id}><span><strong>{labelOf(contract)}</strong><small>{contract.data.key} · {contract.data.owner === "game" ? "ゲームが管理" : "ツールが管理"}</small></span><span>{displayValue(session.externalValues[contract.id])}</span><button className="text-button" onClick={() => { setStubId(contract.id); setStubValue(session.externalValues[contract.id] || {type:"unknown",value:null,reason:"外部値未取得"}); }}>仮値</button></div>)}</div>}{!variables.length && <p className="field-hint">状態辞書はまだありません。</p>}<dl className="reader-state-counts"><dt>所持品</dt><dd>{session.state.itemInstances.filter(i => !i.consumed).length}個</dd><dt>知識・事実</dt><dd>{session.state.assertions.length}件</dd><dt>既読の対象</dt><dd>{session.state.seenIds.length}件</dd><dt>抽選位置</dt><dd>{session.state.rngPosition}</dd><dt>呼出し階層</dt><dd>{session.state.callStack.length}</dd></dl>{session.lastDiff.length > 0 && <section className="runtime-diff"><h4>直前の状態差分</h4>{session.lastDiff.map((d, i) => <p key={i}><span>{labelOf(content.entities.find(e => d.path.includes(e.id))) || d.path}</span><small>{displayValue(d.before)} → {displayValue(d.after)}</small></p>)}</section>}</aside></div>
      <section className="trial-trace"><div className="section-heading"><h3>通った経路</h3><button className="button secondary small" onClick={() => void persist()} disabled={saving || !session.trace.length}>{saving ? '保存中' : '経路を記録'}</button></div><ol>{[session.startState.presentationPosition, ...session.trace.map(t => t.toId)].filter(Boolean).map((id, i) => <li key={`${id}-${i}`}><span className="trace-index">{i + 1}</span><button className="text-button" onClick={() => onOpen(id!)}>{labelOf(content.entities.find(e => e.id === id))}</button>{i > 0 && <small>{session.trace[i - 1]?.edgeIds.map(edgeId => { const e = content.entities.find(v => v.id === edgeId); return e ? dataOf(e).label || labelOf(e) : ''; }).join(' / ')}</small>}</li>)}</ol></section>{coverage && <div className="coverage-cards">{([['scenes', '場面の到達'], ['dialogue', '台詞の到達'], ['choices', '選択肢の実行'], ['conditions', '条件の真偽確認']] as const).map(([key, label]) => <div key={key}><span>{label}</span><strong>{coverage[key].reached}<small> / {coverage[key].total}</small></strong><span className="field-hint">不明 {coverage[key].unknown} · 除外 {coverage[key].excluded}</span></div>)}</div>}</>}
    {session && <section className="foreshadow-check"><div className="section-heading"><h3>この経路の伏線・回収</h3></div><p className="field-hint">作者が必須とした情報の提示順を確認します。読者の理解は判定しません。</p>{foreshadowFindings.length ? foreshadowFindings.map((finding,i) => <article className="analysis-finding" key={i}><span className="eyebrow">{FINDING_LABELS[finding.status]}</span><p>{finding.message}</p>{finding.missingInfoIds?.length ? <p className="finding-path">不足する提示：{finding.missingInfoIds.map(id=>labelOf(content.entities.find(e=>e.id===id))).join('、')}</p> : null}{finding.targetId && <button className="text-button" onClick={()=>onOpen(finding.targetId!)}>伏線を開く</button>}<p className="finding-path">根拠経路：{finding.path.map(id=>labelOf(content.entities.find(e=>e.id===id))).join(' → ')}</p></article>) : <p className="field-hint">この経路で検出された必須提示の不足候補はありません。まだ通っていない回収の評価は含みません。</p>}</section>}
    {savedTraces.length > 0 && <section className="saved-traces"><div className="section-heading"><h3>保存した経路の再実行</h3></div>{savedTraces.map(trace=><button key={trace.id} className="reference-link" onClick={()=>{setSession(replaySavedTrace(project,trace.id));setVersion(trace.data.contentVersionId);setNotice('保存版で経路を再実行しました。状態の一致を検査しています。');}}><Icon name="play" size={16}/>{labelOf(trace)}<small>再実行して状態を比較</small></button>)}</section>}
    <section className="analysis-section"><div className="section-heading"><h3>分岐の検査</h3>{analyzing ? <button className="button secondary small" onClick={() => controller.current?.abort()}>探索を中止</button> : <button className="button secondary small" onClick={() => void analyze()} disabled={!nodes.length}>到達性と行き止まりを検査</button>}</div><p className="field-hint">最大100,000状態・10,000遷移・30秒の範囲を探索します。未確定値と探索打切りを確認済みとして扱いません。</p>{analyzing && <p role="status">{progress.toLocaleString()}状態を確認中…</p>}{analysis && <><div className="analysis-result-heading"><strong>{FINDING_LABELS[analysis.status]}</strong><span>{analysis.checkedStates.toLocaleString()}状態 · 版 {analysis.contentRevision}{analysis.truncated && ' · 探索打切り'}</span></div>{analysis.assumptions.map((assumption, i) => <p className="field-hint" key={i}>{assumption}</p>)}{analysis.findings.map((finding, i) => <article className="analysis-finding" key={i}><span className="eyebrow">{FINDING_LABELS[finding.status]}</span><p>{finding.message}</p>{finding.targetId && <button className="text-button" onClick={() => onOpen(finding.targetId!)}>対象を開く<Icon name="arrow" size={16}/></button>}{finding.path.length > 0 && <p className="finding-path">根拠経路：{finding.path.map(id => labelOf(project.entities.find(e => e.id === id))).join(' → ')}</p>}</article>)}<button className="text-button" onClick={() => downloadBytes(JSON.stringify(analysis, null, 2), `${safeFileName(project.name)}-分岐検査.json`)}><Icon name="download" size={16}/>検査結果を保存</button></>}</section>
    {stubId && session && <Modal title="作者の仮値を設定" onClose={() => setStubId(null)}><p>この値を使う経路は「仮値」の証跡として記録します。「一手戻る」で仮値も戻せます。</p><div className="form-field"><label>{labelOf(content.entities.find(e => e.id === stubId))}</label><TypedField project={content} value={stubValue} preferredType={dataOf(content.entities.find(e => e.id === stubId)!).valueType || dataOf(content.entities.find(e => e.id === stubId)!).outputType} onChange={v => setStubValue(v as TypedValue)}/></div><div className="modal-actions"><button className="button secondary" onClick={() => setStubId(null)}>中止</button><button className="button primary" onClick={() => { setSession(setTrialStubValues(project, session, content.entities.find(e => e.id === stubId)?.kind === "external_contract" ? {external:{[stubId]:stubValue}} : {variables:{[stubId]:stubValue}})); setStubId(null); }}>仮値を適用</button></div></Modal>}
  </section>;
}
