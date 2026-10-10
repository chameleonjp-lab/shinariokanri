import {registerAuthorCache,registerAuthorBusy} from './StoreContext';
import {useAuthorScope} from './StoreContext';
import { useEffect, useRef, useState } from 'react';
import type { Entity, ProjectData, Reuse } from '../domain/types';
import { adoptedRecord } from '../domain/adoption';
import { prepareReuse } from '../domain/reuse';
import { FIELD_SPECS } from './fieldSpecs';
import { labelOf } from './Fields';
import { ListPager, useListWindow } from './ListWindow';
import { PagedSelect } from './PagedSelect';

type Owner = Entity<'scene'> | Entity<'flow_node'>;
type Draft = { sourceId: string; snapshotId: string; mode: Reuse['mode']; overrideFields: string[] };
type Outcome = { busy: boolean; error?: string; saved?: Entity };
const memory = new Map<string, Draft>(), outcomes = new Map<string, Outcome>(), EVENT = 'scenario-reuse-save';
const draftKey = (projectId: string, ownerId: string) => `scenario-reuse-draft:v1:${projectId}:${ownerId}`;
function readDraft(key: string, owner: Owner): Draft {
  if (memory.has(key)) return memory.get(key)!;
  try { const value = JSON.parse(localStorage.getItem(key) ?? 'null'); if (value && typeof value.sourceId === 'string' && typeof value.snapshotId === 'string' && ['reference', 'clone', 'override'].includes(value.mode) && Array.isArray(value.overrideFields) && value.overrideFields.length < 100 && value.overrideFields.every((field: unknown) => typeof field === 'string')) return value; } catch { /* The saved author data is unaffected by a damaged optional input draft. */ }
  const reuse = owner.data.reuse;
  return { sourceId: reuse?.sourceId ?? '', snapshotId: reuse?.pinnedSnapshotId ?? '', mode: reuse?.mode ?? 'reference', overrideFields: reuse?.overrideFields ?? [] };
}
export function ReuseManager({ project, owner, disabled, onSaveProject, onApplied, onBusy }: { project: ProjectData; owner: Owner; disabled: boolean; onSaveProject: (project: ProjectData, reason: string) => Promise<ProjectData>; onApplied: (entity: Entity) => void; onBusy: (busy: boolean) => void }) {
  const key = useAuthorScope(draftKey(project.projectId, owner.id));
  const [draft, setDraft] = useState(() => readDraft(key, owner)), [preview, setPreview] = useState<Awaited<ReturnType<typeof prepareReuse>> | null>(null);
  const [outcome, setOutcome] = useState<Outcome>(() => outcomes.get(key) ?? { busy: false }), [preparing, setPreparing] = useState(false), [error, setError] = useState('');
  const live = useRef(true), preparation = useRef(0), actions = useRef({ onApplied, onBusy }); actions.current = { onApplied, onBusy };
  useEffect(() => { live.current = true; const changed = (event: Event) => {
    if ((event as CustomEvent).detail !== key) return;
    const result = outcomes.get(key) ?? { busy: false }; setOutcome(result); actions.current.onBusy(result.busy);
    if (result.saved) { actions.current.onApplied(result.saved); setDraft(readDraft(key, owner)); setPreview(null); }
  }; window.addEventListener(EVENT, changed); actions.current.onBusy(outcomes.get(key)?.busy ?? false); return () => { live.current = false; preparation.current++; window.removeEventListener(EVENT, changed); }; }, [key]);
  const sources = (draft.snapshotId ? project.snapshots.find(snapshot => snapshot.id === draft.snapshotId)?.content.entities ?? [] : project.entities).filter(entity => entity.kind === owner.kind && entity.id !== owner.id && adoptedRecord(entity));
  const view = useListWindow({ items: sources, scope: `${key}/sources/${draft.snapshotId}`, selectedId: draft.sourceId });
  const source = sources.find(entity => entity.id === draft.sourceId);
  const fields = source ? Object.keys(source.data).filter(field => !['reuse', 'chapterId'].includes(field)) : [];
  const fieldLabel = (field: string) => FIELD_SPECS[owner.kind]?.find(spec => spec.key === field)?.label ?? field;
  const change = (next: Draft) => { memory.set(key, next); try { localStorage.setItem(key, JSON.stringify(next)); setError(''); } catch { setError('再利用の下書きを端末に保存できませんでした。入力はこの作業中に保持しています。再読込の前に保存してください。'); } setDraft(next); preparation.current++; setPreparing(false); setPreview(null); };
  const dependencyView = useListWindow({ items: preview?.dependencyChanges ?? [], scope: `${key}/dependency-diffs` });
  const stale = !!preview && preview.candidate.revision !== project.revision;
  const prepare = async () => {
    if (disabled || preparing || outcomes.get(key)?.busy) return;
    const operation = ++preparation.current; setPreparing(true); setError('');
    try { const result = await prepareReuse(project, { ownerId: owner.id, sourceId: draft.sourceId, snapshotId: draft.snapshotId || undefined, mode: draft.mode, overrideFields: draft.mode === 'override' ? draft.overrideFields : [] }); if (live.current && operation === preparation.current) setPreview(result); }
    catch (cause) { if (live.current && operation === preparation.current) setError((cause as Error).message); }
    finally { if (live.current && operation === preparation.current) setPreparing(false); }
  };
  const save = async () => {
    if (!preview || stale || disabled || outcomes.get(key)?.busy) return;
    outcomes.set(key, { busy: true }); window.dispatchEvent(new CustomEvent(EVENT, { detail: key }));
    try {
      const saved = await onSaveProject(preview.candidate, `共通元の版と再利用方式を原子保存 · ${labelOf(owner)}`);
      const stored = saved.entities.find(entity => entity.id === owner.id); if (!stored) throw new Error('保存した使用先を確認できません。対象版を読み直してください。');
      outcomes.set(key, { busy: false, saved: stored });
      const retained = readDraft(key, owner); if (JSON.stringify(retained) === JSON.stringify(draft)) { const next = { ...draft, snapshotId: preview.sourceVersionId }; memory.set(key, next); try { localStorage.setItem(key, JSON.stringify(next)); } catch { /* A committed pin is available in author data after reload. */ } }
    } catch (cause) { outcomes.set(key, { busy: false, error: (cause as Error).message }); }
    window.dispatchEvent(new CustomEvent(EVENT, { detail: key }));
  };
  return <details className="settings-card"><summary>共通元の固定参照・複製・部分上書き</summary><p>参照は固定した共通元を使い、複製は別IDの独立した内容になります。部分上書きでは選択した項目に使用先の入力を使います。共通元の改訂は確認して適用します。</p>
    <fieldset disabled={disabled || outcome.busy || preparing}>
      <PagedSelect label="共通元の版" scope={`${key}:source-versions`} value={draft.snapshotId} onChange={id => change({ ...draft, snapshotId: id })}
        emptyLabel="現在稿を新しい固定版にする" items={project.snapshots.map(snapshot => ({ id: snapshot.id, label: `${snapshot.versionLabel} · ${snapshot.content.revision}` }))}/>
      <fieldset><legend>共通元</legend>{view.items.map(entity => <label className="check-label" key={entity.id}><input type="radio" name={key} checked={draft.sourceId === entity.id} onChange={() => change({ ...draft, sourceId: entity.id })}/>{labelOf(entity)}</label>)}<ListPager {...view} label="共通元"/></fieldset>
      <label>再利用方式<select aria-label="再利用方式" value={draft.mode} onChange={event => change({ ...draft, mode: event.target.value as Reuse['mode'] })}><option value="reference">固定版を参照</option><option value="clone">独立した複製</option><option value="override">指定項目だけ上書き</option></select></label>
      {draft.mode === 'override' && <fieldset><legend>使用先の入力で上書きする項目</legend>{fields.map(field => <label className="check-label" key={field}><input type="checkbox" checked={draft.overrideFields.includes(field)} onChange={event => change({ ...draft, overrideFields: event.target.checked ? [...draft.overrideFields, field] : draft.overrideFields.filter(key => key !== field) })}/>{fieldLabel(field)}</label>)}</fieldset>}
      <button type="button" className="button secondary" disabled={!source || disabled || outcome.busy || preparing} onClick={() => void prepare()}>共通元の更新差分と影響を確認</button>
      {preview && <><p>確認した作品版 {preview.candidate.revision} · 共通元の固定版 {preview.sourceVersionId}</p><p>共通元の変更項目: {preview.fields.map(fieldLabel).join('、') || '変更なし'}</p><div>{preview.diffs.map(diff => <details key={diff.field}><summary>{fieldLabel(diff.field)}の変更内容</summary><div className="form-row"><div><strong>更新前</strong><pre className="json-input">{JSON.stringify(diff.before, null, 2)}</pre></div><div><strong>選択した共通元</strong><pre className="json-input">{JSON.stringify(diff.after, null, 2)}</pre></div></div>{Object.hasOwn(diff, 'overrideValue') && <><strong>保持する使用先の上書き入力</strong><pre className="json-input">{JSON.stringify(diff.overrideValue, null, 2)}</pre></>}</details>)}</div><p>依存情報の変更 {preview.dependencyChanges.length}件</p>{dependencyView.items.map(diff => <details key={diff.id}><summary>{diff.name || diff.id}の依存差分</summary><pre className="json-input">{JSON.stringify({ before: diff.before, after: diff.after }, null, 2)}</pre></details>)}<ListPager {...dependencyView} label="依存差分"/><p>再利用先 {preview.users.length}件: {preview.users.map(id => labelOf(project.entities.find(entity => entity.id === id))).join('、') || 'なし'}。この保存は選択中の使用先だけを更新します。</p>{preview.overriddenConflicts.length > 0 && <p>共通元でも変更された上書き項目: {preview.overriddenConflicts.map(fieldLabel).join('、')}。使用先の入力を保持することを確認してください。</p>}{stale && <p role="alert">差分の確認後に作品が更新されました。入力を残して再確認してください。</p>}<button type="button" className="button primary" disabled={disabled || stale || outcome.busy} onClick={() => void save()}>確認した再利用を保存</button><button type="button" className="button secondary" onClick={() => setPreview(null)}>差分確認を取り消す</button></>}
    </fieldset>{preparing && <p role="status">共通元の固定版とID対応を確認中…</p>}{outcome.busy && <p role="status">再利用と固定版を保存中…</p>}{outcome.saved && <p role="status">固定版と再利用を端末内に保存しました。</p>}{(error || outcome.error) && <p role="alert">{error || outcome.error}</p>}
  </details>;
}

registerAuthorCache(account=>{const prefix=account+":";for(const map of [memory,outcomes])for(const key of map.keys())if(key.startsWith(prefix))map.delete(key);});
registerAuthorBusy(account=>[...outcomes].some(([key,value])=>key.startsWith(account+":")&&value.busy));
