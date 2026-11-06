import { useEffect, useRef, useState } from 'react';
import type { ContentAnchor, Entity, ProjectContent, ProjectData } from '../domain/types';
import type { TrialSession } from '../domain/runtime';
import { prepareTrialCorrection, prepareTrialCorrectionSave, replayTraceAgainstRevision, type RevisionReplay, type TrialCorrectionPlan } from '../domain/traceReconfirmation';
import { Modal } from './components';
import { WindowedList } from './WindowedList';
import { labelOf } from './Fields';

export function TrialCorrection({ project, session, scene, worldSnapshots, disabled, onBusy, onSaveProject, onReplay, onOpenTarget }: {
 project: ProjectData; session: TrialSession; scene?: Entity; worldSnapshots: Record<string, ProjectContent>; disabled: boolean;
 onBusy: (busy: boolean) => void; onSaveProject: (project: ProjectData, reason: string) => Promise<unknown>;
 onReplay: (session: TrialSession, version: string, anchor: ContentAnchor) => void; onOpenTarget: (anchor: ContentAnchor) => void;
}) {
 const [selecting, setSelecting] = useState(false), [plan, setPlan] = useState<TrialCorrectionPlan | null>(null), [text, setText] = useState(''), [error, setError] = useState(''), [notice, setNotice] = useState(''), [result, setResult] = useState<RevisionReplay | null>(null), [pending, setPending] = useState<{ traceId: string; version: string; anchor: ContentAnchor } | null>(null);
 const operation = useRef(false), composing = useRef(false);
 const targets = scene?.kind === 'scene' ? [scene, ...session.content.entities.filter((entity): entity is Entity<'dialogue_line'> => entity.kind === 'dialogue_line' && !!scene.data.dialogueLineIds?.includes(entity.id))] : [];
 const paragraphs = targets.flatMap(entity => (entity.kind === 'scene' ? entity.data.body : entity.data.text).map(block => ({ id: `${entity.id}:${block.id}`, entity, block })));
 const open = async (entityId: string, blockId: string) => {
  if (operation.current || disabled) return; operation.current = true; onBusy(true); setError('');
  try { const next = await prepareTrialCorrection(project, session, { entityId, blockId }); setPlan(next); const blocks = next.candidate.kind === 'scene' ? next.candidate.data.body : next.candidate.data.text; setText(blocks.find(block => block.id === blockId)!.text); setSelecting(false); }
  catch (cause) { setError((cause as Error).message); } finally { operation.current = false; onBusy(false); }
 };
 const save = async () => {
  if (!plan || operation.current || composing.current) return; operation.current = true; onBusy(true); setError('');
  try { const prepared = await prepareTrialCorrectionSave(project, plan, text, worldSnapshots); await onSaveProject(prepared.project, '試読の一文修正を採用・旧経路と新しい固定版を原子保存'); setPending({ traceId: plan.sourceTrace.id, version: prepared.targetVersionId, anchor: plan.anchor }); setNotice('保存した新しい固定版で同じ選択を再実行しています。'); }
  catch (cause) { setError((cause as Error).message); operation.current = false; onBusy(false); }
 };
 useEffect(() => {
  if (!pending || !project.entities.some(entity => entity.id === pending.traceId) || !project.snapshots.some(snapshot => snapshot.id === pending.version)) return;
  let live = true;
  void replayTraceAgainstRevision(project, pending.traceId, { targetVersionId: pending.version, worldSnapshots }).then(replayed => {
   if (!live) return; operation.current = false; onBusy(false); setResult(replayed); setPlan(null); setPending(null);
   if (replayed.status === 'same_path' && replayed.session) { onReplay(replayed.session, pending.version, { ...pending.anchor, sourceVersionId: pending.version }); setNotice('同じ選択で修正した場面・段落に戻りました。修正前の固定版と経路も保持しています。'); }
   else setNotice('最初に進めない選択で停止しました。旧経路を保持しています。');
  }).catch(cause => { if (live) { operation.current = false; onBusy(false); setError((cause as Error).message); setPending(null); } });
  return () => { live = false; };
 }, [project, pending]);
 if (!scene && !result) return null;
 return <section aria-label="試読の一文を修正"><button className="button secondary small" disabled={disabled || !paragraphs.length} onClick={() => setSelecting(true)}>この試読から一文の修正候補を開く</button>{error && <p role="alert">{error}</p>}{notice && <p role="status">{notice}</p>}
  {result?.firstDifference && <div><p>{result.firstDifference.choice}手目 · {result.firstDifference.reason}</p>{result.firstDifference.edgeIds.map(id => <button className="text-button" key={id} onClick={() => onOpenTarget({ entityId: id, sourceVersionId: result.sourceVersionId })}>進めない旧選択を開く</button>)}{result.firstDifference.nodeId && <button className="text-button" onClick={() => onOpenTarget({ entityId: result.firstDifference!.nodeId!, sourceVersionId: result.sourceVersionId })}>旧経路の場面を開く</button>}</div>}
  {selecting && <Modal title="修正する一文の段落を選ぶ" onClose={() => setSelecting(false)}><WindowedList items={paragraphs} scope={`trial-correction:${project.projectId}`} label="修正する段落" render={row => <button className="reference-link" disabled={disabled} onClick={() => void open(row.entity.id, row.block.id)}>{labelOf(row.entity)} · {row.block.text}</button>}/></Modal>}
  {plan && <Modal title="試読から開いた別の修正候補" onClose={() => { if (!operation.current) setPlan(null); }}><p>元の固定版 {plan.snapshots[0].versionLabel} · 段落 {(plan.candidate.kind === 'scene' ? plan.candidate.data.body : plan.candidate.data.text).findIndex(block => block.id === plan.anchor.blockId) + 1} · 選択 {plan.sourceTrace.data.steps.length}手 · 抽選種 {plan.sourceTrace.data.seed}</p><p>現在稿の候補だけを編集します。採用時に修正前の試読を残し、新しい固定版で同じ選択を再生します。</p>{error && <p role="alert">{error}</p>}<label>修正候補の一文<textarea disabled={disabled || !!pending} value={text} maxLength={100000} onChange={event => setText(event.target.value)} onCompositionStart={() => { composing.current = true; }} onCompositionEnd={() => { composing.current = false; }}/></label>{plan.baseRevision !== project.revision && !pending && <p role="alert">候補を開いた後に作品が変わりました。入力を保持しています。現在稿と再比較してください。</p>}<button className="button primary" disabled={disabled || !!pending || plan.baseRevision !== project.revision} onClick={() => void save()}>この修正を採用して同じ選択で読む</button><button className="button secondary" disabled={disabled} onClick={() => setPlan(null)}>候補を取り消す</button></Modal>}
 </section>;
}
