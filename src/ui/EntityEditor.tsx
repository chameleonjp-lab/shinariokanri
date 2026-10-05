import { useEffect, useRef, useState } from 'react';
import type { Entity, ProjectData } from '../domain/types';
import { KIND_LABELS, collectReferences } from '../domain/model';
import { FIELD_SPECS } from './fieldSpecs';
import { DataField, dataOf, JsonField, labelOf, RefSelect, RichTextView } from './Fields';
import { downloadBytes, Icon, Modal, safeFileName, STATUS_LABELS } from './components';
import { AssetPreview } from './AssetPreview';
import { safeExternalUrl } from '../domain/attachments';

export interface EditorFailure extends Error { issues?: { path: string; message: string }[] }

export function EntityEditor({ entity, project, isNew, hasUnsavedDraft, onSave, onClose, onDraft, onArchive, onOpen, jsonBuffers, onJsonBuffer }: {
  entity: Entity;
  project: ProjectData;
  isNew: boolean;
  hasUnsavedDraft: boolean;
  onSave: (entity: Entity) => Promise<Entity>;
  onClose: () => void;
  onDraft: (entity: Entity, dirty: boolean) => void;
  onArchive: (entity: Entity) => Promise<void>;
  onOpen: (id: string) => void;
  jsonBuffers: Record<string, string>;
  onJsonBuffer: (field: string, raw: string | undefined) => void;
}) {
  const [draft, setDraft] = useState(entity);
  const [dirty, setDirty] = useState(isNew || hasUnsavedDraft);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [issues, setIssues] = useState<{ path: string; message: string }[]>([]);
  const [invalidJson, setInvalidJson] = useState<string[]>(Object.keys(jsonBuffers));
  const [tab, setTab] = useState<'main' | 'body' | 'notes' | 'detail' | 'preview'>('main');
  const [archiveConfirm, setArchiveConfirm] = useState(false);
  const [vertical, setVertical] = useState(false);
  const [composing, setComposing] = useState(false);
  const draftRef = useRef(draft);
  const savingRef = useRef(false);
  const attemptRef = useRef('');
  draftRef.current = draft;
  const actionRef = useRef(onSave);
  actionRef.current = onSave;
  const fields = FIELD_SPECS[entity.kind] || [];
  const hasTextTabs = fields.some(f => f.key === 'body') && fields.some(f => f.key === 'authorNotes');

  useEffect(() => { setDraft(entity); setDirty(isNew || hasUnsavedDraft); setError(''); setIssues([]); setInvalidJson(Object.keys(jsonBuffers)); setTab('main'); attemptRef.current = ''; }, [entity.id]);
  useEffect(() => { if (!dirty && !saving && entity.revision !== draft.revision) setDraft(entity); }, [entity.revision]);
  useEffect(() => { onDraft(draft, dirty); }, [draft, dirty]);

  const save = async (manual = false) => {
    if (savingRef.current || invalidJson.length || composing) return;
    const current = draftRef.current;
    const stamp = JSON.stringify(current);
    if (!manual && (stamp === attemptRef.current || !current.name.trim() && !['event', 'dialogue_line'].includes(current.kind))) return;
    attemptRef.current = stamp;
    savingRef.current = true;
    setSaving(true); setError(''); setIssues([]);
    try {
      const saved = await actionRef.current(current);
      if (JSON.stringify(draftRef.current) === stamp) { setDraft(saved); setDirty(false); }
      else setDraft(previous => ({ ...previous, revision: saved.revision }));
    } catch (err) {
      const failure = err as EditorFailure;
      setError(failure.message || '端末内に保存できませんでした。入力はこの画面に保持されています。');
      setIssues(failure.issues || []);
      if (manual) requestAnimationFrame(() => {
        const path = failure.issues?.[0]?.path.split('.').pop();
        const field = path ? document.querySelector<HTMLElement>(`[data-field="${CSS.escape(path)}"] input, [data-field="${CSS.escape(path)}"] textarea, [data-field="${CSS.escape(path)}"] select`) : null;
        field?.focus();
      });
    } finally { savingRef.current = false; setSaving(false); }
  };

  useEffect(() => { if (!dirty || saving || composing || invalidJson.length) return; const timer = window.setTimeout(() => { void save(); }, 500); return () => window.clearTimeout(timer); }, [draft, dirty, composing, invalidJson, saving]);
  const change = (next: Entity) => { setDraft(next); setDirty(true); setError(''); setIssues([]); };
  const changeData = (key: string, value: unknown) => {
    const data = { ...dataOf(draft), [key]: value };
    if (value === undefined) delete data[key];
    if (key === 'valueType' && draft.kind === 'variable') {
      data.initial = { type: 'unknown', value: null, reason: '値の型を変更したため未設定' };
      data.allowed = value === 'integer' ? { min: -2147483648, max: 2147483647 } : value === 'boolean' ? { values: [false, true] } : { values: [] };
    }
    change({ ...draft, data } as Entity);
  };
  const shownFields = fields.filter(f => !hasTextTabs || (tab === 'main' ? !['body', 'authorNotes'].includes(f.key) && ['summary', 'reading'].includes(f.key) : tab === 'body' ? f.key === 'body' : tab === 'notes' ? f.key === 'authorNotes' : tab === 'detail' ? !['summary', 'body', 'authorNotes', 'reading'].includes(f.key) : false));
  const related = project.relations.filter(r => !r.deletedAt && (r.fromId === draft.id || r.toId === draft.id));
  const referencedBy = project.entities.filter(e => e.id !== draft.id && !e.deletedAt && collectReferences(e).some(ref => ref.id === draft.id));

  return <aside className="detail-panel" aria-label={`${KIND_LABELS[draft.kind]}の詳細`} onCompositionStart={() => setComposing(true)} onCompositionEnd={() => setComposing(false)}>
    <div className="detail-heading"><button type="button" className="icon-button detail-back" aria-label="一覧に戻る" onClick={onClose}><Icon name="back"/></button><div><span className="eyebrow">{KIND_LABELS[draft.kind]} {isNew && '・ 新規'}</span><h2>{labelOf(draft)}</h2></div><button type="button" className="icon-button desktop-close" aria-label="詳細を閉じる" onClick={onClose}><Icon name="close"/></button></div>
    <div className="editor-save-state" role="status" aria-live="polite"><span className={`save-dot ${error || invalidJson.length ? 'failed' : dirty ? 'pending' : ''}`}/>{saving ? '保存中…' : error || invalidJson.length ? '未保存 · 入力は保持されています' : dirty ? '変更あり · 保存待ち' : '端末内保存済み'}<span className="revision-label">版 {draft.revision}</span></div>
    {error && <div className="error-notice" role="alert"><strong>保存できませんでした</strong><p>{error}</p>{issues.length > 0 && <ul>{issues.map((issue, i) => <li key={i}>{issue.message}</li>)}</ul>}<button type="button" className="text-button" onClick={() => downloadBytes(JSON.stringify(draft, null, 2), `${safeFileName(draft.name)}-未保存.json`)}><Icon name="download" size={16}/>入力を一時ファイルに保存</button></div>}
    <div className="editor-content">{draft.kind === "attachment" && <AssetPreview entity={draft}/>} {draft.kind === "source" && safeExternalUrl(draft.data.locator) && <a className="button secondary small source-link" href={safeExternalUrl(draft.data.locator)!} target="_blank" rel="noopener noreferrer">資料のURLを開く<Icon name="arrow" size={16}/></a>}<div className="form-field" data-field="name"><label htmlFor="entity-name">{entity.kind === 'event' ? '出来事の名前（要約だけでも登録可）' : '名前'}</label><input id="entity-name" value={draft.name} onChange={e => change({ ...draft, name: e.target.value })} onBlur={() => { if (dirty) void save(); }} placeholder={`${KIND_LABELS[draft.kind]}の名前`}/></div>
      <div className="form-row"><div className="form-field"><label htmlFor="entity-status">情報の状態</label><select id="entity-status" value={draft.status} onChange={e => change({ ...draft, status: e.target.value } as Entity)}>{Object.entries(STATUS_LABELS).map(([v, label]) => <option key={v} value={v}>{label}</option>)}</select></div><div className="form-field"><label htmlFor="entity-visibility">公開範囲</label><select id="entity-visibility" value={draft.visibility} onChange={e => change({ ...draft, visibility: e.target.value } as Entity)}><option value="private">自分だけ</option><option value="team">作品の編集者</option><option value="projection">投影プロファイル</option></select></div></div>
      {hasTextTabs && <div className="editor-tabs" role="tablist" aria-label="編集内容">{([['main', '要約'], ['body', '本文'], ['notes', '作者メモ'], ['detail', '詳細'], ['preview', '確認表示']] as const).map(([key, label]) => <button key={key} type="button" role="tab" aria-selected={tab === key} className={tab === key ? 'active' : ''} onClick={() => setTab(key)}>{label}</button>)}</div>}
      {tab === 'preview' && hasTextTabs ? <div className="editor-preview"><label className="check-label"><input type="checkbox" checked={vertical} onChange={e => setVertical(e.target.checked)}/>縦書きで確認</label><RichTextView value={dataOf(draft).body} vertical={vertical} onOpen={onOpen}/></div> : shownFields.map(field => <DataField key={field.key} field={field} entity={draft} value={dataOf(draft)[field.key]} project={project} onChange={value => changeData(field.key, value)} rawOverride={jsonBuffers[field.key]} onInvalidRaw={raw => onJsonBuffer(field.key, raw)} onValid={valid => setInvalidJson(previous => valid ? previous.filter(k => k !== field.key) : previous.includes(field.key) ? previous : [...previous, field.key])}/>)}
      {draft.visibility === "projection" && <div className="form-field"><label>公開投影プロファイル</label><RefSelect project={project} kinds={["projection_profile"]} value={draft.projectionProfileId} label="公開投影プロファイル" onChange={id => change({...draft,projectionProfileId:id || null})}/></div>}
      <details className="advanced-details"><summary>詳細データ・ルビ・本文リンクを編集</summary><p className="field-hint">全フィールドをJSONで編集できます。保存前に型と参照先を検査します。本文のブロックIDは維持してください。</p><JsonField label="詳細データ" validate={v => !v || typeof v !== "object" || Array.isArray(v) ? "詳細データはJSONのオブジェクト（{}）で入力してください。" : undefined} rawOverride={jsonBuffers._data} onInvalidRaw={raw => onJsonBuffer("_data", raw)} value={draft.data} onChange={data => { if (data && typeof data === 'object' && !Array.isArray(data)) change({ ...draft, data } as Entity); }} onValid={valid => setInvalidJson(previous => valid ? previous.filter(k => k !== '_data') : previous.includes('_data') ? previous : [...previous, '_data'])}/></details>
      <details className="advanced-details"><summary>カスタム項目を編集</summary><p className="field-hint">雛形に定義したkeyと型を使用してください。</p><JsonField label="カスタム項目" value={draft.customValues} rawOverride={jsonBuffers._customValues} onInvalidRaw={raw => onJsonBuffer("_customValues",raw)} validate={v => !v || typeof v !== "object" || Array.isArray(v) ? "カスタム項目はJSONのオブジェクト（{}）で入力してください。" : undefined} onChange={v=>change({...draft,customValues:v as Entity["customValues"]})} onValid={valid=>setInvalidJson(previous=>valid?previous.filter(k=>k!=="_customValues"):previous.includes("_customValues")?previous:[...previous,"_customValues"])}/></details>
      {(related.length > 0 || referencedBy.length > 0) && <section className="references-section"><h3>この情報への参照</h3>{related.map(r => <p key={r.id}>{labelOf(project.entities.find(e => e.id === r.fromId))} → {labelOf(project.entities.find(e => e.id === r.toId))}<span className="field-hint">{r.relationType}</span></p>)}{referencedBy.map(e => <button type="button" key={e.id} className="reference-link" onClick={() => onOpen(e.id)}><Icon name="link" size={16}/>{labelOf(e)}<small>{KIND_LABELS[e.kind]}</small></button>)}</section>}
      <details className="advanced-details"><summary>IDと履歴情報</summary><dl className="record-meta"><dt>固定ID</dt><dd className="mono">{draft.id}</dd><dt>作成</dt><dd>{new Date(draft.createdAt).toLocaleString('ja-JP')}</dd><dt>更新</dt><dd>{new Date(draft.updatedAt).toLocaleString('ja-JP')}</dd></dl></details>
    </div>
    {invalidJson.length > 0 && <div className="error-notice"><span>不正なJSONの入力も、画面を切り替えたあとまで保持します。</span><button type="button" className="text-button" onClick={() => downloadBytes(JSON.stringify({ entity: draft, invalidJsonInput: jsonBuffers }, null, 2), `${safeFileName(draft.name)}-未保存入力.json`)}>未保存の入力を持ち出す</button></div>}<div className="editor-footer"><button type="button" className="text-button danger" disabled={isNew || saving} onClick={() => setArchiveConfirm(true)}>アーカイブ</button><button type="button" className="button primary" disabled={saving || invalidJson.length > 0 || composing} onClick={() => void save(true)}><Icon name="check" size={18}/>{saving ? '保存中' : error ? '保存を再試行' : '保存する'}</button></div>
    {archiveConfirm && <Modal title="アーカイブの確認" onClose={() => setArchiveConfirm(false)}><p>「{labelOf(draft)}」を通常の一覧から外します。履歴に保存され、作品画面から復元できます。</p><p>{referencedBy.length + related.length}件の参照・関係があります。参照先を連鎖して削除することはありません。</p><div className="modal-actions"><button type="button" className="button secondary" onClick={() => setArchiveConfirm(false)}>中止</button><button type="button" className="button danger" onClick={async () => { try { await onArchive(draft); setArchiveConfirm(false); onClose(); } catch (e) { setError((e as Error).message); setArchiveConfirm(false); } }}>アーカイブする</button></div></Modal>}
  </aside>;
}
