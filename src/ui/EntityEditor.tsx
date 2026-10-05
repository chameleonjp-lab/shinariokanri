import { useEffect, useMemo, useRef, useState } from 'react';
import type { ContentAnchor, Entity, ProjectData } from '../domain/types';
import { KIND_LABELS, collectReferences } from '../domain/model';
import { FIELD_SPECS, type FieldSpec } from './fieldSpecs';
import { DataField, dataOf, JsonField, labelOf, RefSelect, RichTextView } from './Fields';
import { downloadBytes, Icon, Modal, safeFileName, STATUS_LABELS } from './components';
import { AssetPreview } from './AssetPreview';
import { safeExternalUrl } from '../domain/attachments';
import { applyTemplatePreview, getEntityTemplate, previewTemplateChange, type TemplateReplacements } from '../domain/templates';
import { CustomFieldsEditor, FieldVisibilityControls, loadEditorDisplayPreferences, TemplateChooser, TemplateFieldsEditor, TemplateImpactList, type EditorDisplayPreferences } from './TemplateFields';
import { NotesTools } from './NotesTools';
import type { AssetInput } from '../storage';
import { resolveEditorNavigation } from './editorNavigation';
import { deletionImpact } from '../domain/maintenance';
import { findTextLinkReferences, type TextLinkReference } from '../domain/linkCandidates';
import { editorStateKey, editorTextFingerprint, loadEditorViewState, restorableEditorSelection, saveEditorViewState, type EditorSelection, type EditorTab } from './editorState';

const EDITOR_TABS = [['main', '要約'], ['body', '本文'], ['notes', '作者メモ'], ['detail', '詳細'], ['preview', '確認表示']] as const;

export interface EditorFailure extends Error { issues?: { path: string; message: string }[] }

export function EntityEditor({ entity, project, isNew, hasUnsavedDraft, onSave, onSaveMany, onSaveProject, onClose, onDraft, onArchive, onOpen, onOpenTarget, navigationTarget, jsonBuffers, onJsonBuffer }: {
  entity: Entity;
  project: ProjectData;
  isNew: boolean;
  hasUnsavedDraft: boolean;
  onSave: (entity: Entity) => Promise<Entity>;
  onSaveMany?: (entities: Entity[], reason: string, assets?: AssetInput[]) => Promise<void>;
  onSaveProject?: (project: ProjectData, reason: string, assets?: AssetInput[]) => Promise<ProjectData>;
  onClose: () => void;
  onDraft: (entity: Entity, dirty: boolean) => void;
  onArchive: (entity: Entity) => Promise<void>;
  onOpen: (id: string) => void;
  onOpenTarget?: (anchor: ContentAnchor, fieldPath?: string) => void;
  navigationTarget?: { anchor: ContentAnchor; fieldPath?: string } | null;
  jsonBuffers: Record<string, string>;
  onJsonBuffer: (field: string, raw: string | undefined, expectedRaw?: string) => void;
}) {
  const [draft, setDraft] = useState(entity);
  const [dirty, setDirty] = useState(isNew || hasUnsavedDraft);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [issues, setIssues] = useState<{ path: string; message: string }[]>([]);
  const [invalidJson, setInvalidJson] = useState<string[]>(Object.keys(jsonBuffers).filter(key => key !== '_noteCapture'));
  const positionKey = editorStateKey(project.projectId, entity.id);
  const initialPosition = useMemo(() => loadEditorViewState(localStorage, positionKey), [positionKey]);
  const [tab, setTab] = useState<EditorTab>(() => initialPosition.tab);
  const displayKey = `scenario-editor-display:v1:${project.projectId}:${entity.kind}`;
  const [display, setDisplay] = useState<EditorDisplayPreferences>(() => loadEditorDisplayPreferences(localStorage, displayKey));
  const [templateReview, setTemplateReview] = useState<{ template: Entity<'template'>; project: ProjectData } | null>(null);
  const [templateTargets, setTemplateTargets] = useState<string[]>([]);
  const [templateReplacements, setTemplateReplacements] = useState<TemplateReplacements>({});
  const [templateFailure, setTemplateFailure] = useState('');
  const [navigationNotice, setNavigationNotice] = useState('');
  const [reverseTarget, setReverseTarget] = useState<string | null>(null);
  const [reversePage, setReversePage] = useState(0);
  const [archiveConfirm, setArchiveConfirm] = useState(false);
  const [archivePage, setArchivePage] = useState(0);
  const [vertical, setVertical] = useState(false);
  const [composing, setComposing] = useState(false);
  const draftRef = useRef(draft);
  const savingRef = useRef(false);
  const attemptRef = useRef('');
  const editorContent = useRef<HTMLDivElement>(null);
  const positionsReady = useRef(false);
  const lastSelection = useRef<EditorSelection | undefined>(initialPosition.selection);
  const lastScroll = useRef({ scrollTop: initialPosition.scrollTop, scrollY: initialPosition.scrollY });
  const tabRef = useRef(tab); tabRef.current = tab;
  draftRef.current = draft;
  const actionRef = useRef(onSave);
  actionRef.current = onSave;
  const fields = FIELD_SPECS[entity.kind] || [];
  const displayFields: FieldSpec[] = [{ key: 'name', label: '名前', type: 'text' }, { key: 'status', label: '情報の状態', type: 'enum' }, { key: 'visibility', label: '公開範囲', type: 'enum' }, { key: 'retainIfUnreferenced', label: '未参照でも保持する', type: 'boolean' }, ...fields];
  const hasTextTabs = fields.some(f => f.key === 'body') && fields.some(f => f.key === 'authorNotes');

  useEffect(() => { setDraft(entity); setDirty(isNew || hasUnsavedDraft); setError(''); setIssues([]); setInvalidJson(Object.keys(jsonBuffers).filter(key => key !== '_noteCapture')); setTab(loadEditorViewState(localStorage, positionKey).tab); setTemplateReview(null); attemptRef.current = ''; }, [entity.id]);
  useEffect(() => { if (!dirty && !saving && BigInt(entity.revision) > BigInt(draft.revision)) setDraft(entity); }, [entity.revision, dirty, saving]);
  useEffect(() => { onDraft(draft, dirty); }, [draft, dirty]);
  useEffect(() => { setDisplay(loadEditorDisplayPreferences(localStorage, displayKey)); }, [displayKey]);
  const visibleTabs = EDITOR_TABS.filter(([key]) => !display.hiddenTabs.includes(key));
  useEffect(() => { if (hasTextTabs && !visibleTabs.some(([key]) => key === tab)) setTab(visibleTabs[0]?.[0] ?? 'main'); }, [display.hiddenTabs, hasTextTabs, tab]);
  const templatePreview = useMemo(() => templateReview ? previewTemplateChange(templateReview.project, templateReview.template, { targetIds: templateTargets, replacements: templateReplacements }) : null, [templateReview, templateTargets, templateReplacements]);
  const previewStale = !!templateReview && templateReview.project.revision !== project.revision;
  const persistPosition = (target?: EventTarget | null) => {
    if (!positionsReady.current) return;
    if (target instanceof HTMLTextAreaElement && target.dataset.richTextEditor) {
      const fieldKey = target.closest<HTMLElement>('[data-field]')?.dataset.field;
      if (fieldKey) lastSelection.current = { fieldKey, start: target.selectionStart, end: target.selectionEnd, textHash: editorTextFingerprint(target.value) };
    }
    if (editorContent.current) lastScroll.current = { scrollTop: Math.round(editorContent.current.scrollTop), scrollY: Math.round(Math.max(0, window.scrollY)) };
    saveEditorViewState(localStorage, positionKey, { tab: tabRef.current, ...lastScroll.current, ...(lastSelection.current ? { selection: lastSelection.current } : {}) });
  };
  const persistRef = useRef(persistPosition); persistRef.current = persistPosition;
  useEffect(() => {
    positionsReady.current = false;
    const state = loadEditorViewState(localStorage, positionKey);
    lastSelection.current = state.selection;
    lastScroll.current = { scrollTop: state.scrollTop, scrollY: state.scrollY };
    if (navigationTarget && (navigationTarget.anchor.entityId === draft.id || navigationTarget.anchor.lineId === draft.id)) { positionsReady.current = true; return; }
    let frame = requestAnimationFrame(() => { frame = requestAnimationFrame(() => {
      if (editorContent.current) editorContent.current.scrollTop = state.scrollTop;
      if (window.innerWidth < 768) window.scrollTo(0, state.scrollY);
      const control = state.selection ? editorContent.current?.querySelector<HTMLTextAreaElement>(`[data-field="${CSS.escape(state.selection.fieldKey)}"] textarea[data-rich-text-editor]`) : null;
      if (control && restorableEditorSelection(state.selection, control.value)) { control.focus({ preventScroll: true }); control.setSelectionRange(state.selection!.start, state.selection!.end); if (state.selection?.focus) control.scrollIntoView({ block: 'nearest' }); }
      positionsReady.current = true;
    }); });
    return () => cancelAnimationFrame(frame);
  }, [positionKey, navigationTarget]);
  useEffect(() => { if (positionsReady.current) persistRef.current(); }, [tab]);
  useEffect(() => {
    const capture = () => persistRef.current();
    window.addEventListener('pagehide', capture);
    return () => { capture(); window.removeEventListener('pagehide', capture); };
  }, [positionKey]);
  useEffect(() => {
    setNavigationNotice('');
    if (!navigationTarget || navigationTarget.anchor.entityId !== draft.id && navigationTarget.anchor.lineId !== draft.id) return;
    const target = resolveEditorNavigation(draftRef.current, navigationTarget.anchor, navigationTarget.fieldPath);
    if (!target.ok) { setNavigationNotice(target.message); return; }
    const targetTab: EditorTab = !hasTextTabs || !target.fieldKey || ['summary', 'reading'].includes(target.fieldKey) ? 'main' : target.fieldKey === 'body' ? 'body' : target.fieldKey === 'authorNotes' ? 'notes' : 'detail';
    setTab(targetTab);
    setDisplay(previous => ({ hiddenFields: previous.hiddenFields.filter(key => key !== (target.fieldKey ?? 'name')), hiddenTabs: previous.hiddenTabs.filter(key => key !== targetTab) }));
    let frame = requestAnimationFrame(() => {
      frame = requestAnimationFrame(() => {
        const marker = target.blockId ? document.querySelector<HTMLElement>(`[data-block-id="${CSS.escape(target.blockId)}"]`) : null;
        const editorId = marker?.dataset.editorId;
        const control = editorId ? document.getElementById(editorId) : target.fieldKey ? document.querySelector<HTMLElement>(`[data-field="${CSS.escape(target.fieldKey)}"] textarea, [data-field="${CSS.escape(target.fieldKey)}"] input, [data-field="${CSS.escape(target.fieldKey)}"] select`) : document.getElementById('entity-name');
        if (!control) { setNavigationNotice('参照先の項目を表示できませんでした。詳細データから保存された段落IDを確認できます。'); return; }
        control.scrollIntoView({ block: 'center' }); control.focus();
        if (control instanceof HTMLTextAreaElement && target.start != null && target.end != null) control.setSelectionRange(target.start, target.end);
      });
    });
    return () => cancelAnimationFrame(frame);
  }, [navigationTarget, draft.id]);

  const save = async (manual = false) => {
    if (savingRef.current || invalidJson.length || composing) return;
    const current = draftRef.current;
    if (current.kind === 'template') {
      if (manual) { setTemplateReview({ template: structuredClone(current), project }); setTemplateTargets([]); setTemplateReplacements({}); setTemplateFailure(''); }
      return;
    }
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

  useEffect(() => { if (!dirty || draft.kind === 'template' || saving || composing || invalidJson.length) return; const timer = window.setTimeout(() => { void save(); }, 500); return () => window.clearTimeout(timer); }, [draft, dirty, composing, invalidJson, saving]);
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
  const shownFields = fields.filter(f => !display.hiddenFields.includes(f.key) && (draft.kind !== 'template' || f.key !== 'defaults') && (!hasTextTabs || visibleTabs.length > 0 && (tab === 'main' ? !['body', 'authorNotes'].includes(f.key) && ['summary', 'reading'].includes(f.key) : tab === 'body' ? f.key === 'body' : tab === 'notes' ? f.key === 'authorNotes' : tab === 'detail' ? !['summary', 'body', 'authorNotes', 'reading'].includes(f.key) : false)));
  const assignedTemplate = getEntityTemplate(project, draft);
  const markValid = (key: string, valid: boolean) => setInvalidJson(previous => valid ? previous.includes(key) ? previous.filter(value => value !== key) : previous : previous.includes(key) ? previous : [...previous, key]);
  const changeDisplay = (preferences: EditorDisplayPreferences) => {
    setDisplay(preferences);
    try { localStorage.setItem(displayKey, JSON.stringify(preferences)); } catch { /* Display preferences remain available for this session. */ }
  };
  const confirmTemplate = async () => {
    if (!templateReview || !templatePreview || savingRef.current || previewStale) return;
    const candidate = applyTemplatePreview(project, templatePreview);
    if (!candidate.ok) { setTemplateFailure(candidate.issues.map(issue => issue.message).join('\n')); return; }
    const stamp = JSON.stringify(templateReview.template);
    savingRef.current = true; setSaving(true); setTemplateFailure(''); setError(''); setIssues([]);
    try {
      if (onSaveMany) await onSaveMany(templatePreview.entities, '雛形と追加項目の適用差分を一括保存');
      else if (templatePreview.entities.length === 1) {
        const saved = await actionRef.current(templatePreview.entities[0]);
        if (JSON.stringify(draftRef.current) === stamp) setDraft(saved);
      } else throw new Error('複数の情報を同時に保存する操作を利用できません。入力と差分は保持しています。');
      if (JSON.stringify(draftRef.current) === stamp) setDirty(false);
      setTemplateReview(null);
    } catch (failure) {
      const err = failure as EditorFailure;
      setTemplateFailure(err.message || '保存できませんでした。差分と入力を保持しています。');
      setError(err.message || '保存できませんでした。入力を保持しています。'); setIssues(err.issues ?? []);
    } finally { savingRef.current = false; setSaving(false); }
  };
  const related = project.relations.filter(r => !r.deletedAt && (r.fromId === draft.id || r.toId === draft.id));
  const referencedBy = project.entities.filter(e => e.id !== draft.id && !e.deletedAt && collectReferences(e).some(ref => ref.id === draft.id));
  const archiveImpacts = useMemo(() => archiveConfirm ? deletionImpact(project, draft.id) : [], [archiveConfirm, project, draft.id]);
  const activeArchiveImpacts = archiveImpacts.filter(impact => !impact.snapshotId);
  const archivePageCount = Math.max(1, Math.ceil(archiveImpacts.length / 20));
  const reverseReferences = useMemo(() => reverseTarget ? findTextLinkReferences({ ...project, entities: project.entities.some(record => record.id === draft.id) ? project.entities.map(record => record.id === draft.id ? draft : record) : [...project.entities, draft] }, reverseTarget) : [], [project, draft, reverseTarget]);
  const showReverseReferences = (id: string) => { setReverseTarget(id); setReversePage(0); };
  const openTextReference = (reference: TextLinkReference) => {
    setReverseTarget(null);
    const anchor: ContentAnchor = { entityId: reference.sourceEntityId, blockId: reference.sourceBlockId, start: reference.start, end: reference.end };
    if (onOpenTarget) onOpenTarget(anchor, reference.sourceField); else onOpen(reference.sourceEntityId);
  };
  const followTextTarget = (anchor: ContentAnchor, sourceAnchor: ContentAnchor | undefined, fieldKey: string) => {
    if (sourceAnchor) {
      const source = resolveEditorNavigation(draftRef.current, sourceAnchor, fieldKey);
      const control = editorContent.current?.querySelector<HTMLTextAreaElement>(`[data-field="${CSS.escape(fieldKey)}"] textarea[data-rich-text-editor]`);
      if (source.ok && source.start != null && source.end != null && control) {
        lastSelection.current = { fieldKey, start: source.start, end: source.end, textHash: editorTextFingerprint(control.value), focus: true };
        persistPosition();
      }
    }
    if (onOpenTarget) onOpenTarget(anchor); else onOpen(anchor.lineId ?? anchor.entityId);
  };

  return <aside className="detail-panel" aria-label={`${KIND_LABELS[draft.kind]}の詳細`} onSelectCapture={event => persistPosition(event.target)} onBlurCapture={event => persistPosition(event.target)} onCompositionStart={() => setComposing(true)} onCompositionEnd={() => setComposing(false)}>
    <div className="detail-heading"><button type="button" className="icon-button detail-back" aria-label="一覧に戻る" onClick={onClose}><Icon name="back"/></button><div><span className="eyebrow">{KIND_LABELS[draft.kind]} {isNew && '・ 新規'}</span><h2>{labelOf(draft)}</h2></div><button type="button" className="icon-button desktop-close" aria-label="詳細を閉じる" onClick={onClose}><Icon name="close"/></button></div>
    <div className="editor-save-state" role="status" aria-live="polite"><span className={`save-dot ${error || invalidJson.length ? 'failed' : dirty ? 'pending' : ''}`}/>{saving ? '保存中…' : error || invalidJson.length ? '未保存 · 入力は保持されています' : dirty ? draft.kind === 'template' ? '変更あり · 差分の確認待ち' : '変更あり · 保存待ち' : '端末内保存済み'}<span className="revision-label">版 {draft.revision}</span></div>
    {draft.deletedAt && <p className="info-notice" role="status">アーカイブ済みの情報です。内容と参照は保持されています。作品・保存の変更履歴から復元できます。</p>}
    {navigationNotice && <p className="error-notice" role="alert">{navigationNotice}</p>}
    {error && <div className="error-notice" role="alert"><strong>保存できませんでした</strong><p>{error}</p>{issues.length > 0 && <ul>{issues.map((issue, i) => <li key={i}>{issue.message}</li>)}</ul>}<button type="button" className="text-button" onClick={() => downloadBytes(JSON.stringify(draft, null, 2), `${safeFileName(draft.name)}-未保存.json`)}><Icon name="download" size={16}/>入力を一時ファイルに保存</button></div>}
    <div className="editor-content" ref={editorContent} onScroll={() => persistPosition()}>{draft.kind === "attachment" && <AssetPreview entity={draft}/>} {draft.kind === "source" && safeExternalUrl(draft.data.locator) && <a className="button secondary small source-link" href={safeExternalUrl(draft.data.locator)!} target="_blank" rel="noopener noreferrer">資料のURLを開く<Icon name="arrow" size={16}/></a>}{!display.hiddenFields.includes('name') && <div className="form-field" data-field="name"><label htmlFor="entity-name">{entity.kind === 'event' ? '出来事の名前（要約だけでも登録可）' : '名前'}</label><input id="entity-name" value={draft.name} onChange={e => change({ ...draft, name: e.target.value })} onBlur={() => { if (dirty) void save(); }} placeholder={`${KIND_LABELS[draft.kind]}の名前`}/></div>}
      <div className="form-row">{!display.hiddenFields.includes('status') && <div className="form-field" data-field="status"><label htmlFor="entity-status">情報の状態</label><select id="entity-status" value={draft.status} onChange={e => change({ ...draft, status: e.target.value } as Entity)}>{Object.entries(STATUS_LABELS).map(([v, label]) => <option key={v} value={v}>{label}</option>)}</select></div>}{!display.hiddenFields.includes('visibility') && <div className="form-field" data-field="visibility"><label htmlFor="entity-visibility">公開範囲</label><select id="entity-visibility" value={draft.visibility} onChange={e => change({ ...draft, visibility: e.target.value } as Entity)}><option value="private">自分だけ</option><option value="team">作品の編集者</option><option value="projection">投影プロファイル</option></select></div>}</div>
      {!display.hiddenFields.includes('retainIfUnreferenced') && <div className="form-field" data-field="retainIfUnreferenced"><label className="check-label"><input type="checkbox" aria-label="未参照でも保持する" checked={!!draft.retainIfUnreferenced} onChange={event => change({ ...draft, retainIfUnreferenced: event.target.checked })}/>未参照でも保持する</label><span className="field-hint">背景設定など、参照がなくても残す情報を指定できます。確認候補からの除外は保存後に反映します。</span></div>}
      {hasTextTabs && visibleTabs.length > 0 && <div className="editor-tabs" role="tablist" aria-label="編集内容">{visibleTabs.map(([key, label]) => <button key={key} type="button" role="tab" aria-selected={tab === key} className={tab === key ? 'active' : ''} onClick={() => setTab(key)}>{label}</button>)}</div>}
      {tab === 'preview' && hasTextTabs && visibleTabs.length > 0 ? <div className="editor-preview"><label className="check-label"><input type="checkbox" checked={vertical} onChange={e => setVertical(e.target.checked)}/>縦書きで確認</label><RichTextView value={dataOf(draft).body} vertical={vertical} onOpen={onOpen}/></div> : shownFields.map(field => draft.kind === 'template' && field.key === 'fields'
        ? <TemplateFieldsEditor key={field.key} template={draft.data} project={project} onChange={data => change({ ...draft, data })} onValid={valid => markValid('_templateFields', valid)}/>
        : <DataField key={field.key} field={field} entity={draft} value={dataOf(draft)[field.key]} project={project} onChange={value => changeData(field.key, value)} rawOverride={jsonBuffers[field.key]} onInvalidRaw={raw => onJsonBuffer(field.key, raw)} onValid={valid => markValid(field.key, valid)} onOpenTarget={(anchor: ContentAnchor, sourceAnchor?: ContentAnchor) => followTextTarget(anchor, sourceAnchor, field.key)} onOpenReferences={showReverseReferences} onOpenReference={openTextReference}/>)}
      <FieldVisibilityControls fields={displayFields} customFields={assignedTemplate?.data.fields ?? []} tabs={hasTextTabs ? EDITOR_TABS : []} preferences={display} onChange={changeDisplay}/>
      <TemplateChooser entity={draft} project={project} onChange={change}/>
      <CustomFieldsEditor entity={draft} project={project} hidden={display.hiddenFields} onChange={change} onValid={valid => markValid('_customFields', valid)}/>
      {draft.kind === 'note' && !isNew && !dirty && !saving && onSaveMany && onSaveProject && <NotesTools project={project} note={draft} onSaveMany={onSaveMany} onSaveProject={onSaveProject} onOpen={onOpen} captureDraft={jsonBuffers._noteCapture} onCaptureDraft={(raw, expectedRaw) => onJsonBuffer('_noteCapture', raw, expectedRaw)}/>}
      {draft.visibility === "projection" && <div className="form-field"><label>公開投影プロファイル</label><RefSelect project={project} kinds={["projection_profile"]} value={draft.projectionProfileId} label="公開投影プロファイル" onChange={id => change({...draft,projectionProfileId:id || null})}/></div>}
      <details className="advanced-details"><summary>詳細データ・ルビ・本文リンクを編集</summary><p className="field-hint">全フィールドをJSONで編集できます。保存前に型と参照先を検査します。本文のブロックIDは維持してください。</p><JsonField label="詳細データ" validate={v => !v || typeof v !== "object" || Array.isArray(v) ? "詳細データはJSONのオブジェクト（{}）で入力してください。" : undefined} rawOverride={jsonBuffers._data} onInvalidRaw={raw => onJsonBuffer("_data", raw)} value={draft.data} onChange={data => { if (data && typeof data === 'object' && !Array.isArray(data)) change({ ...draft, data } as Entity); }} onValid={valid => setInvalidJson(previous => valid ? previous.filter(k => k !== '_data') : previous.includes('_data') ? previous : [...previous, '_data'])}/></details>
      <details className="advanced-details"><summary>カスタム項目を編集</summary><p className="field-hint">雛形に定義したkeyと型を使用してください。</p><JsonField label="カスタム項目" value={draft.customValues} rawOverride={jsonBuffers._customValues} onInvalidRaw={raw => onJsonBuffer("_customValues",raw)} validate={v => !v || typeof v !== "object" || Array.isArray(v) ? "カスタム項目はJSONのオブジェクト（{}）で入力してください。" : undefined} onChange={v=>change({...draft,customValues:v as Entity["customValues"]})} onValid={valid=>setInvalidJson(previous=>valid?previous.filter(k=>k!=="_customValues"):previous.includes("_customValues")?previous:[...previous,"_customValues"])}/></details>
      {(related.length > 0 || referencedBy.length > 0) && <section className="references-section"><h3>この情報への参照</h3><button type="button" className="text-button" onClick={() => showReverseReferences(draft.id)}>本文からの参照位置を表示</button>{related.map(r => <p key={r.id}>{labelOf(project.entities.find(e => e.id === r.fromId))} → {labelOf(project.entities.find(e => e.id === r.toId))}<span className="field-hint">{r.relationType}</span></p>)}{referencedBy.map(e => <button type="button" key={e.id} className="reference-link" onClick={() => onOpen(e.id)}><Icon name="link" size={16}/>{labelOf(e)}<small>{KIND_LABELS[e.kind]}</small></button>)}</section>}
      <details className="advanced-details"><summary>IDと履歴情報</summary><dl className="record-meta"><dt>固定ID</dt><dd className="mono">{draft.id}</dd><dt>作成</dt><dd>{new Date(draft.createdAt).toLocaleString('ja-JP')}</dd><dt>更新</dt><dd>{new Date(draft.updatedAt).toLocaleString('ja-JP')}</dd></dl></details>
    </div>
    {invalidJson.length > 0 && <div className="error-notice"><span>入力内容を修正できます。画面を切り替えても未保存入力を保持します。</span><button type="button" className="text-button" onClick={() => downloadBytes(JSON.stringify({ entity: draft, invalidJsonInput: jsonBuffers }, null, 2), `${safeFileName(draft.name)}-未保存入力.json`)}>未保存の入力を持ち出す</button></div>}<div className="editor-footer"><button type="button" className="text-button danger" disabled={isNew || saving || !!draft.deletedAt} onClick={() => { setArchivePage(0); setArchiveConfirm(true); }}>アーカイブ</button><button type="button" className="button primary" disabled={saving || invalidJson.length > 0 || composing} onClick={() => void save(true)}><Icon name="check" size={18}/>{saving ? '保存中' : draft.kind === 'template' ? '保存前の差分を確認' : error ? '保存を再試行' : '保存する'}</button></div>
    {templateReview && templatePreview && <Modal title="雛形の変更・適用差分" wide onClose={() => { if (!saving) setTemplateReview(null); }}><p>雛形と影響する情報を一度の保存で更新します。現在の値は、置換値を指定した項目だけ変更します。</p>
      <fieldset className="template-targets"><legend>追加でこの雛形を適用する情報</legend>{templateReview.project.entities.filter(record => !record.deletedAt && record.kind === templateReview.template.data.targetKind).map(record => {
        const assigned = record.templateId === templateReview.template.id;
        return <label className="check-label" key={record.id}><input type="checkbox" aria-label={`${labelOf(record)}に適用 · ${record.id}`} checked={assigned || templateTargets.includes(record.id)} disabled={assigned || saving} onChange={event => setTemplateTargets(previous => event.target.checked ? [...previous, record.id] : previous.filter(id => id !== record.id))}/><span>{labelOf(record)} <small>{record.id}</small>{assigned && ' · 適用済み'}</span></label>;
      })}</fieldset><p className="field-hint">既存の適用先 {templateReview.project.entities.filter(record => !record.deletedAt && record.templateId === templateReview.template.id).length}件 · 差分の対象 {templatePreview.impacts.length}件</p>
      <fieldset disabled={saving} className="index-editor-controls"><TemplateImpactList impacts={templatePreview.impacts} template={templateReview.template} project={templateReview.project} replacements={templateReplacements} onReplacements={setTemplateReplacements}/></fieldset>
      {templatePreview.issues.filter(issue => !issue.path.includes('.customValues.')).map((issue, index) => <p className="field-error" role="alert" key={index}>{issue.message}</p>)}
      {previewStale && <p className="field-error" role="alert">差分の確認後に作品が更新されました。中止して現在の版で差分を確認し直してください。</p>}{templateFailure && <p className="error-notice" role="alert">{templateFailure}</p>}
      <div className="modal-actions"><button type="button" className="button secondary" disabled={saving} onClick={() => setTemplateReview(null)}>中止</button><button type="button" className="button primary" disabled={saving || previewStale || !templatePreview.canApply} onClick={() => void confirmTemplate()}>{saving ? '保存中…' : 'この差分を一括保存'}</button></div>
    </Modal>}
    {reverseTarget && <Modal title="本文からの参照" onClose={() => setReverseTarget(null)}><p>{labelOf(project.entities.find(record => record.id === reverseTarget))}を参照する本文 {reverseReferences.length}件。段落IDと文字位置から該当箇所を開きます。</p>{reverseReferences.length === 0 && <p className="field-hint">この情報への本文リンクはありません。</p>}<ul className="archive-impact-list">{reverseReferences.slice(reversePage * 20, (reversePage + 1) * 20).map(reference => <li key={`${reference.sourceEntityId}:${reference.sourceField}:${reference.sourceBlockId}:${reference.start}`}><strong>{reference.sourceEntityName || '無題'}</strong><span className="field-hint">{FIELD_SPECS[reference.sourceEntityKind]?.find(field => field.key === reference.sourceField)?.label ?? reference.sourceField} · 引用「{reference.text}」</span><button type="button" className="text-button" onClick={() => openTextReference(reference)}>この本文の参照位置を開く</button></li>)}</ul>{reverseReferences.length > 20 && <div className="modal-actions"><button type="button" className="button secondary small" disabled={reversePage === 0} onClick={() => setReversePage(page => page - 1)}>前の20件</button><span>{reversePage + 1} / {Math.ceil(reverseReferences.length / 20)}</span><button type="button" className="button secondary small" disabled={(reversePage + 1) * 20 >= reverseReferences.length} onClick={() => setReversePage(page => page + 1)}>次の20件</button></div>}</Modal>}
    {archiveConfirm && <Modal title="アーカイブの確認" onClose={() => setArchiveConfirm(false)}><p>「{labelOf(draft)}」を通常の一覧から外します。履歴に保存され、作品画面から復元できます。</p><p>参照と固定版への影響 {archiveImpacts.length}件。参照先の情報は個別に確認できます。</p>{draft.retainIfUnreferenced && <p className="field-hint">作者が「未参照でも保持する」と指定した背景情報です。この操作はその指定も含む情報をアーカイブします。</p>}
      {activeArchiveImpacts.length > 0 && <p className="field-error" role="alert">現在の情報からの参照が{activeArchiveImpacts.length}件あります。参照元を修正してからアーカイブしてください。</p>}
      <ul className="archive-impact-list">{archiveImpacts.slice(archivePage * 20, (archivePage + 1) * 20).map((impact, index) => {
        const key = impact.path.replace(/^data\./, '').split(/[.\[]/)[0];
        const label = FIELD_SPECS[impact.sourceKind]?.find(field => field.key === key)?.label ?? impact.path;
        const relation = impact.sourceKind === 'relation' ? project.relations.find(record => record.id === impact.sourceId) : undefined;
        return <li key={`${impact.sourceId}:${impact.path}:${index}`}><strong>{impact.sourceName || '無題'}</strong><span className="field-hint">{impact.snapshotId ? '固定版は保持します。保存された本文・参照先は変更しません。' : `参照元の項目: ${label}`}</span>{impact.snapshotId ? <span className="field-hint">固定版 {impact.snapshotId}</span> : relation ? <div>{[relation.fromId, relation.toId].filter(id => id !== draft.id).map(id => <button type="button" className="text-button" key={id} onClick={() => { setArchiveConfirm(false); onOpenTarget ? onOpenTarget({ entityId: id }) : onOpen(id); }}>関係先 {labelOf(project.entities.find(record => record.id === id))} を開く</button>)}</div> : <button type="button" className="text-button" onClick={() => { setArchiveConfirm(false); onOpenTarget ? onOpenTarget({ entityId: impact.sourceId }, impact.path) : onOpen(impact.sourceId); }}>参照元を開く</button>}</li>;
      })}</ul>{archivePageCount > 1 && <div className="modal-actions"><button type="button" className="button secondary small" disabled={archivePage === 0} onClick={() => setArchivePage(page => page - 1)}>前の20件</button><span>{archivePage + 1} / {archivePageCount}</span><button type="button" className="button secondary small" disabled={archivePage + 1 >= archivePageCount} onClick={() => setArchivePage(page => page + 1)}>次の20件</button></div>}
      <div className="modal-actions"><button type="button" className="button secondary" onClick={() => setArchiveConfirm(false)}>中止</button><button type="button" className="button danger" disabled={activeArchiveImpacts.length > 0} onClick={async () => { try { await onArchive(draft); setArchiveConfirm(false); onClose(); } catch (e) { setError((e as Error).message); setArchiveConfirm(false); } }}>アーカイブする</button></div></Modal>}
  </aside>;
}
