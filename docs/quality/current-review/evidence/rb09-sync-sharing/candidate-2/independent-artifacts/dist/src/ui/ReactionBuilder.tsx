import { useEffect, useRef, useState } from 'react';
import type { ProjectData } from '../domain/types';
import { adoptedRecord } from '../domain/adoption';
import { prepareReactions, REACTION_LABELS, type ReactionMode } from '../domain/reactions';
import { labelOf } from './Fields';
import { ListPager, useListWindow } from './ListWindow';

type Draft = { mode: ReactionMode; sceneIds: string[]; name: string };
const empty = (): Draft => ({ mode: 'first_revisit', sceneIds: [], name: '' });
const pending = new Set<string>(), memory = new Map<string, Draft>(), EVENT = 'scenario-reaction-save';
const key = (id: string) => `scenario-reaction-draft:v1:${id}`;
function readDraft(id: string): Draft {
  if (memory.has(id)) return memory.get(id)!;
  try { const value = JSON.parse(localStorage.getItem(key(id)) ?? 'null'); if (value && Object.hasOwn(REACTION_LABELS, value.mode) && typeof value.name === 'string' && value.name.length <= 1000 && Array.isArray(value.sceneIds) && value.sceneIds.length <= 100 && new Set(value.sceneIds).size === value.sceneIds.length && value.sceneIds.every((id: unknown) => typeof id === 'string')) return value; } catch { /* An unreadable optional draft is ignored. */ }
  return empty();
}
function storeDraft(id: string, value: Draft): string { memory.set(id, value); try { localStorage.setItem(key(id), JSON.stringify(value)); return ''; } catch { return '下書きの端末内保存に失敗しました。この画面を開いている間の入力は保持しています。再読込の前に保存をやり直してください。'; } }
export function ReactionBuilder({ project, onSaveProject, onOpen }: { project: ProjectData; onSaveProject: (project: ProjectData, reason: string) => Promise<ProjectData>; onOpen: (id: string) => void }) {
  const [draft, setDraft] = useState(() => readDraft(project.projectId)), [preview, setPreview] = useState<ReturnType<typeof prepareReactions> | null>(null);
  const [busy, setBusy] = useState(pending.has(project.projectId)), [error, setError] = useState(''), [notice, setNotice] = useState('');
  const live = useRef(true); useEffect(() => { live.current = true; const changed = (event: Event) => { const detail = (event as CustomEvent).detail; if (detail.projectId !== project.projectId) return; setBusy(pending.has(project.projectId)); if (detail.saved) { setDraft(readDraft(project.projectId)); setPreview(null); setNotice('反応の系列を端末内に保存しました。'); } if (detail.error) setError(detail.error); }; window.addEventListener(EVENT, changed); return () => { live.current = false; window.removeEventListener(EVENT, changed); }; }, [project.projectId]);
  const scenes = project.entities.filter(entity => entity.kind === 'scene' && adoptedRecord(entity)), view = useListWindow({ items: scenes, scope: `${project.projectId}/reaction-scenes` });
  const change = (next: Draft) => { setError(storeDraft(project.projectId, next)); setDraft(next); setPreview(null); setNotice(''); };
  const stale = !!preview && preview.candidate.revision !== project.revision;
  const save = async () => {
    if (!preview || stale || pending.has(project.projectId)) return;
    pending.add(project.projectId); window.dispatchEvent(new CustomEvent(EVENT, { detail: { projectId: project.projectId } }));
    const submitted = JSON.stringify(draft);
    try {
      await onSaveProject(preview.candidate, `短い反応の系列を原子保存 · ${REACTION_LABELS[draft.mode]}`);
      const draftError = JSON.stringify(readDraft(project.projectId)) === submitted ? storeDraft(project.projectId, empty()) : '';
      pending.delete(project.projectId); window.dispatchEvent(new CustomEvent(EVENT, { detail: { projectId: project.projectId, saved: true, error: draftError } }));
      if (live.current) onOpen(preview.graphId);
    } catch (cause) { pending.delete(project.projectId); window.dispatchEvent(new CustomEvent(EVENT, { detail: { projectId: project.projectId, error: (cause as Error).message } })); }
  };
  return <details className="settings-card"><summary>短い反応の系列を作る</summary><fieldset disabled={busy}>
    <p>選んだ順に場面を使います。系列の入力は作品別に下書きへ保持します。条件・抽選・巻戻・周回は試読と同じ実行規則を使います。</p>
    <label>系列名<input aria-label="反応の系列名" maxLength={1000} value={draft.name} onChange={event => change({ ...draft, name: event.target.value })}/></label>
    <label>提示方式<select aria-label="反応の提示方式" value={draft.mode} onChange={event => change({ ...draft, mode: event.target.value as ReactionMode })}>{Object.entries(REACTION_LABELS).map(([mode, label]) => <option key={mode} value={mode}>{label}</option>)}</select></label>
    {view.items.map(scene => <label className="check-label" key={scene.id}><input type="checkbox" disabled={busy || draft.sceneIds.length >= 100 && !draft.sceneIds.includes(scene.id)} checked={draft.sceneIds.includes(scene.id)} onChange={event => change({ ...draft, sceneIds: event.target.checked ? [...draft.sceneIds, scene.id] : draft.sceneIds.filter(id => id !== scene.id) })}/>{labelOf(scene)}</label>)}<ListPager {...view} label="反応の場面"/>
    <ol>{draft.sceneIds.map((id, index) => <li key={id}>{labelOf(project.entities.find(entity => entity.id === id))}<button disabled={busy || !index} onClick={() => { const ids = [...draft.sceneIds]; [ids[index - 1], ids[index]] = [ids[index], ids[index - 1]]; change({ ...draft, sceneIds: ids }); }}>前へ</button><button disabled={busy || index === draft.sceneIds.length - 1} onClick={() => { const ids = [...draft.sceneIds]; [ids[index + 1], ids[index]] = [ids[index], ids[index + 1]]; change({ ...draft, sceneIds: ids }); }}>後へ</button></li>)}</ol>
    <button className="button secondary" onClick={() => { try { setPreview(prepareReactions(project, draft)); setError(''); } catch (cause) { setError((cause as Error).message); } }}>作成する分岐を確認</button>
    {preview && <><p>確認した版 {preview.candidate.revision} · 反応 {draft.sceneIds.length}件 · 共通場面の本文は同じIDを参照します。</p>{stale && <p role="alert">確認後に作品が更新されました。入力を保ったまま再確認してください。</p>}<button className="button primary" disabled={busy || stale} onClick={() => void save()}>確認した反応系列を保存</button><button className="button secondary" onClick={() => setPreview(null)}>確認を取り消す</button></>}
    {error && <p role="alert">{error}</p>}{notice && <p role="status">{notice}</p>}
  </fieldset>{busy && <p role="status">反応の系列を保存中…</p>}</details>;
}
