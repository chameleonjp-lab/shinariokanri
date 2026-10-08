import { projectSettingsDraft, acknowledgeSettingsDraft, settingsDraftChanged, type ProjectSettingsDraft } from './projectSettingsDraft';
import { useEffect, useRef, useState } from 'react';
import type { Entity, ProjectData, ProjectSnapshot } from '../domain/types';
import { createEntity, newId, textToRichText } from '../domain/model';
import { exportProject as createExport, type ExportProfile, type ExportResult } from '../domain/exports';
import { jsonBytes, sha256, type AssetInput } from '../storage';
import { prepareAsset } from '../domain/attachments';
import { EmptyState, Icon, Modal, downloadBytes, safeFileName } from './components';
import { dataOf, labelOf, JsonField, RefList } from './Fields';

export { BackupPanel } from './BackupPanel';
export { HistoryPanel } from './HistoryPanel';

export function ExportPanel({ project, onSave, onOpen }: { project: ProjectData; onSave: (entity: Entity) => Promise<Entity>; onOpen: (id: string) => void }) {
  const profiles = project.entities.filter(e => e.kind === 'projection_profile' && !e.deletedAt);
  const [profileId, setProfileId] = useState(profiles[0]?.id || '');
  const [profile, setProfile] = useState<ExportProfile>('reader');
  const [version, setVersion] = useState('');
  const [assigneeId, setAssigneeId] = useState('');
  const assignees = [...new Set(project.entities.flatMap(entity => entity.kind === 'production_task' && !entity.deletedAt && entity.data.assigneeId ? [entity.data.assigneeId] : []))];
  const [format, setFormat] = useState<'markdown' | 'html'>('markdown');
  const [result, setResult] = useState<ExportResult | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [newProfile, setNewProfile] = useState(false);
  const [included, setIncluded] = useState<string[]>([]);
  const [publicTitle, setPublicTitle] = useState(project.name);
  const [copyText, setCopyText] = useState(false);
  useEffect(() => { setResult(null); }, [project.revision, profileId, profile, version, format]);
  const preview = async () => { setBusy(true); setError(''); try { setResult(await createExport(project, { profile, projectionProfileId: profileId, ...(version ? { targetVersionId: version } : { targetRevision: project.revision }), readerFormat: format, ...(['production', 'localization'].includes(profile) && assigneeId ? { assigneeId } : {}) })); } catch (e) { setError((e as Error).message); } finally { setBusy(false); } };
  const createProfile = async () => {
    setBusy(true); setError('');
    try {
      const byEntityId: Record<string, { mode: 'replace'; replacement: string }> = {}, publicTexts: Record<string, any> = {};
      included.forEach(id => { const e = project.entities.find(v => v.id === id); if (!e) return; byEntityId[id] = { mode: 'replace', replacement: e.name }; if (copyText) { const data = dataOf(e), output: Record<string, unknown> = {}; ['summary', 'body', 'text', 'description', 'question', 'intent', 'caption', 'usageNotes', 'interpretation', 'label', 'reading', 'terminalReason', 'reason', 'key', 'canonical', 'language', 'locale', 'sourceHash', 'expression', 'method', 'locator', 'predicate', 'cueType', 'precision', 'displayName', 'relationType', 'eventKey'].forEach(k => { if (data[k] !== undefined) output[k] = structuredClone(data[k]); }); publicTexts[id] = output; } });
      const entity = createEntity(project.projectId, 'projection_profile', `${publicTitle} · 公開範囲`, { audience: '読者', includedIds: included, allowedKinds: [...new Set(included.map(id => project.entities.find(e => e.id === id)!.kind))], publicTitle, namePolicy: { defaultPolicy: { mode: 'exclude' }, byEntityId }, publicTexts, includeAuthorNotes: false });
      const saved = await onSave(entity); setProfileId(saved.id); setNewProfile(false); onOpen(saved.id);
    } catch (e) { setError((e as Error).message); }
    finally { setBusy(false); }
  };
  return <section className="export-panel"><div className="info-notice">公開・制作・相談用の出力は、選択した範囲と公開文を使って作成します。完全復元には「完全保存」を使用してください。</div>{!profiles.length && <EmptyState icon="folder" title="出力する範囲を選びましょう" action={<button className="button primary" onClick={() => setNewProfile(true)}><Icon name="plus"/>公開範囲を作成</button>}>対象と公開用の名前・文章を指定してから出力します。</EmptyState>}
    {profiles.length > 0 && <><div className="reader-setup-fields"><label>公開範囲<select value={profileId} aria-label="出力する公開範囲" onChange={e => setProfileId(e.target.value)}><option value="">選択してください</option>{profiles.map(p => <option value={p.id} key={p.id}>{p.name}</option>)}</select></label><label>出力目的<select value={profile} aria-label="出力目的" onChange={e => setProfile(e.target.value as ExportProfile)}><option value="reader">読み手向け本文</option><option value="runtime_json">汎用ランタイムJSON</option><option value="localization">翻訳・収録</option><option value="production">制作の受渡し</option><option value="consultation">手動相談用</option><option value="playable_preview">単体の試遊出力</option></select></label><label>対象版<select value={version} aria-label="出力する作品版" onChange={e => setVersion(e.target.value)}><option value="">編集稿の現在版 {project.revision}</option>{project.snapshots.map(s => <option key={s.id} value={s.id}>{s.versionLabel}</option>)}</select></label>{['production', 'localization'].includes(profile) && <label>制作の担当範囲<select aria-label="制作の担当範囲" value={assigneeId} onChange={event => { setAssigneeId(event.target.value); setResult(null); }}><option value="">公開範囲に含めた全担当</option>{assignees.map(id => <option key={id} value={id}>{id}</option>)}</select></label>}{profile === 'reader' && <label>ファイル形式<select value={format} aria-label="本文の出力形式" onChange={e => setFormat(e.target.value as 'markdown' | 'html')}><option value="markdown">Markdown</option><option value="html">HTML</option></select></label>}</div><div className="backup-actions"><button className="button primary" disabled={!profileId || busy} onClick={() => void preview()}>{busy ? '出力を検査中' : '内容を検査・プレビュー'}</button><button className="button secondary" onClick={() => onOpen(profileId)} disabled={!profileId}>範囲を編集</button><button className="text-button" onClick={() => setNewProfile(true)}><Icon name="plus" size={16}/>新しい範囲</button></div></>}
    {error && <div className="error-notice" role="alert">{error}</div>}{result && <div className="export-result">{!result.ok ? <div className="error-notice" role="alert"><strong>出力を停止しました</strong><ul>{result.issues.map((issue, i) => <li key={i}>{issue.message}{issue.entityId && <button className="text-button" onClick={() => onOpen(issue.entityId!)}>対象を開く</button>}</li>)}</ul></div> : <><div className="section-heading"><h3>出力内容の確認</h3><span>{result.preview.includedCount}件 · 元の版 {result.preview.sourceRevision}</span></div>{result.preview.warnings.map((w, i) => <p className="info-notice" key={i}>{w}</p>)}<details className="advanced-details"><summary>出力から除かれる内容（{result.preview.omissions.length}件）</summary>{result.preview.omissions.map((o, i) => <p className="field-hint" key={i}>{labelOf(project.entities.find(e => e.id === o.entityId))} {o.field || ''} · {o.reason}</p>)}</details>{result.artifacts.map(artifact => <div className="export-artifact" key={artifact.filename}><h4>{artifact.filename}</h4><pre className="export-preview-text">{artifact.content.slice(0, 6000)}{artifact.content.length > 6000 ? '\n… プレビューはここまで。保存ファイルには全内容を含みます。' : ''}</pre><button className="button primary" onClick={() => downloadBytes((artifact.bytes ?? artifact.content) as BlobPart, artifact.filename, artifact.mimeType)}><Icon name="download" size={18}/>この内容を保存</button></div>)}</>}</div>}
    {newProfile && <Modal title="公開する範囲を作成" wide onClose={() => setNewProfile(false)}><div className="form-field"><label>公開用の作品名</label><input value={publicTitle} onChange={e => setPublicTitle(e.target.value)}/></div><div className="form-field"><label>出力する対象</label><RefList project={project} value={included} onChange={setIncluded}/></div><label className="check-label"><input type="checkbox" checked={copyText} onChange={e => setCopyText(e.target.checked)}/>選んだ対象の現在の本文を公開文へコピーする</label><p className="field-hint">名前は現在の表示名を公開名として登録します。コピー後、公開範囲の詳細で公開名と文章を確認・編集できます。作者メモはコピーしません。</p><div className="modal-actions"><button className="button secondary" onClick={() => setNewProfile(false)}>中止</button><button className="button primary" disabled={busy || !included.length || !publicTitle.trim()} onClick={() => void createProfile()}>範囲を作成して内容を確認</button></div></Modal>}
  </section>;
}

export function ProjectInfo({ project, initialDraft, saving = false, onDraftChange, onDraftSaved, onSavingChange, onSaveProject, onSaveEntities, onOpen, theme, setTheme }: { project: ProjectData; initialDraft?: ProjectSettingsDraft; saving?: boolean; onDraftChange?: (draft: ProjectSettingsDraft) => void; onDraftSaved?: (submitted: ProjectSettingsDraft, saved: ProjectData, consumedSnapshotName?: string) => void; onSavingChange?: (saving: boolean) => void; onSaveProject: (project: ProjectData, reason: string) => Promise<ProjectData>; onSaveEntities: (entities: Entity[], reason: string, assets?: AssetInput[]) => Promise<void>; onOpen: (id: string) => void; theme: string; setTheme: (theme: string) => void }) {
  const [draft, setDraft] = useState(() => initialDraft ?? projectSettingsDraft(project));
  const draftRef = useRef(draft); draftRef.current = draft;
  const { name, mainStart, calendars: calendarJson, calendarValid, snapshotName } = draft;
  const change = (value: Partial<ProjectSettingsDraft>) => {
    const next = { ...draftRef.current, ...value }; draftRef.current = next; setDraft(next); onDraftChange?.(next);
  };
  const setName = (name: string) => change({ name }), setMainStart = (mainStart: string) => change({ mainStart }), setSnapshotName = (snapshotName: string) => change({ snapshotName });
  const setCalendarJson = (calendars: unknown) => change({ calendars }), setCalendarValid = (calendarValid: boolean) => { if (calendarValid !== draftRef.current.calendarValid) change({ calendarValid }); };
  const [error, setError] = useState(''); const [notice, setNotice] = useState(''); const [busy, setBusy] = useState(false);
  const previousInitial = useRef(initialDraft);
  const operation = useRef(false), stale = settingsDraftChanged(draft) && draft.base.revision !== project.revision;
  useEffect(() => {
    const prior = previousInitial.current; previousInitial.current = initialDraft;
    const next = initialDraft ?? (prior || !settingsDraftChanged(draftRef.current) ? projectSettingsDraft(project) : undefined);
    if (next && JSON.stringify(next) !== JSON.stringify(draftRef.current)) { draftRef.current = structuredClone(next); setDraft(draftRef.current); }
  }, [initialDraft, project.projectId, project.revision]);
  const save = async () => {
    if (operation.current || saving || stale) return;
    operation.current = true; setBusy(true); onSavingChange?.(true); setError(''); setNotice('');
    const submitted = structuredClone(draftRef.current);
    try {
      const saved = await onSaveProject({ ...project, revision: submitted.base.revision, name: submitted.name, mainStart: submitted.mainStart, calendars: submitted.calendars as ProjectData['calendars'] }, '作品名・時間の基準を変更');
      onDraftSaved?.(submitted, saved);
      const next = acknowledgeSettingsDraft(draftRef.current, submitted, saved); draftRef.current = next; setDraft(next);
      setNotice('作品の設定を端末内に保存しました。出来事の日時は維持されています。');
    } catch (e) { setError((e as Error).message); }
    finally { operation.current = false; setBusy(false); onSavingChange?.(false); }
  };
  const snapshot = async () => {
    if (operation.current || saving) return;
    operation.current = true; onSavingChange?.(true);
    const submitted = { ...projectSettingsDraft(project), snapshotName: draftRef.current.snapshotName };
    setBusy(true); setError(''); setNotice('');
    try { const { history: _history, snapshots: _snapshots, authorAlternatives: _authorAlternatives, ...content } = structuredClone(project); const id = newId(), hash = await sha256(jsonBytes(content)); const frozen: ProjectSnapshot = { id, contentHash: hash, versionLabel: snapshotName || `確定版 ${project.revision}`, createdAt: new Date().toISOString(), content }; const meta = { ...createEntity(project.projectId, 'snapshot', frozen.versionLabel, { versionLabel: frozen.versionLabel, contentHash: hash, immutable: true }), id }; const saved = await onSaveProject({ ...project, snapshots: [...project.snapshots, frozen], entities: [...project.entities, meta] }, '確定版を保存'); setNotice('本文と設定の確定版を不変の保存内容として記録しました。'); onDraftSaved?.(submitted, saved, submitted.snapshotName); const next = acknowledgeSettingsDraft(draftRef.current, submitted, saved, submitted.snapshotName); draftRef.current = next; setDraft(next); }
    catch (e) { setError((e as Error).message); }
    finally { operation.current = false; onSavingChange?.(false); setBusy(false); }
  };
  const addAsset = async (file: File) => {
    if (!file.size || file.size > 32 * 1024 * 1024) { setError('添付は1 byte〜32 MiBです。選択した素材は読み込まず、保存済みの作品を保持しています。'); return; }
    if (operation.current || saving) return; operation.current = true; onSavingChange?.(true);
    setBusy(true); setError(''); setNotice('');
    try { const prepared = await prepareAsset(new Uint8Array(await file.arrayBuffer()), file.name); const { bytes, preview: _preview, ...metadata } = prepared; const entity = createEntity(project.projectId, 'attachment', file.name, { ...metadata, stage: 'reference' }); await onSaveEntities([entity], '添付素材を追加', [{ ...prepared, bytes }]); setNotice('素材と内容を端末内に保存しました。'); onOpen(entity.id); }
    catch (e) { setError((e as Error).message); }
    finally { operation.current = false; onSavingChange?.(false); setBusy(false); }
  };
  return <section className="project-info">{settingsDraftChanged(draft) && <p className="info-notice" role="status">作品設定の未保存入力を保持しています。基底版 {draft.base.revision}</p>}{stale && <div className="error-notice" role="alert"><p>別の変更が保存されました。入力と現在版の差分を確認してください。</p><dl><dt>作品名（基底 → 現在 → 入力）</dt><dd>{draft.base.name} → {project.name} → {name}</dd><dt>本編開始</dt><dd>{draft.base.mainStart} → {project.mainStart} → {mainStart}</dd><dt>暦</dt><dd>基底 {draft.base.calendars.length}件・現在 {project.calendars.length}件</dd></dl><button type="button" className="button secondary" disabled={busy || saving} onClick={() => change({ base: projectSettingsDraft(project).base, name: name === draft.base.name ? project.name : name, mainStart: mainStart === draft.base.mainStart ? project.mainStart : mainStart, calendars: JSON.stringify(calendarJson) === JSON.stringify(draft.base.calendars) ? project.calendars : calendarJson })}>差分を確認して現在版を基底にする</button></div>}<div className="settings-card"><h3>作品の情報</h3><div className="form-field"><label htmlFor="project-name">作品名</label><input id="project-name" value={name} onChange={e => setName(e.target.value)}/></div><div className="form-field"><label htmlFor="project-start">本編開始の世界内tick</label><input id="project-start" inputMode="numeric" value={mainStart} onChange={e => setMainStart(e.target.value)}/><span className="field-hint">基準点だけを変更します。出来事の絶対日時は変わりません。</span></div><div className="form-field"><label>使用する暦</label><select value={project.calendarId} aria-label="作品の暦" disabled><option>{project.calendars.find(c => c.id === project.calendarId)?.name}</option></select></div><details className="advanced-details"><summary>暦の定義を編集</summary><p className="field-hint">独自暦を定義できます。現在のcalendarIdは維持し、日時のラベルだけを変更します。日時の換算・連動移動の操作は未対応です。</p><JsonField label="暦の定義" value={calendarJson} rawOverride={draft.calendarRaw} onInvalidRaw={calendarRaw => change({ calendarRaw })} onChange={setCalendarJson} onValid={setCalendarValid}/></details><button className="button primary" disabled={busy || saving || stale || !calendarValid} onClick={() => void save()}>作品の設定を保存</button></div>
    <div className="settings-card"><h3>確定版を残す</h3><p className="field-hint">現在の本文と設定を固定します。後の編集はこの内容を変更しません。</p><div className="form-field"><label>版の名称</label><input value={snapshotName} placeholder={`確定版 ${project.revision}`} onChange={e => setSnapshotName(e.target.value)} aria-label="確定版の名称"/></div><button className="button secondary" disabled={busy || saving} onClick={() => void snapshot()}>現在の内容を確定版として保存</button>{project.snapshots.map(s => <div className="snapshot-item" key={s.id}><Icon name="folder"/><span><strong>{s.versionLabel}</strong><small>{new Date(s.createdAt).toLocaleString('ja-JP')}</small></span></div>)}</div>
    <div className="settings-card"><h3>素材を追加</h3><p className="field-hint">PNG・JPEG・GIF・WebP・WAV・MP3・PDFを作品へ添付します。種類と容量を検査して保存します。</p><label className="button secondary file-button"><Icon name="upload" size={18}/>素材ファイルを選ぶ<input type="file" disabled={busy || saving} onChange={e => { const file = e.target.files?.[0]; e.target.value = ''; if (file) void addAsset(file); }}/></label></div>
    <div className="settings-card"><h3>表示設定</h3><div className="theme-options">{[['light', '明るい配色'], ['dark', '暗い配色'], ['system', '端末に合わせる']].map(([v, label]) => <label className="check-label" key={v}><input type="radio" name="theme" checked={theme === v} onChange={() => setTheme(v)}/>{label}</label>)}</div></div>{error && <div className="error-notice" role="alert">{error}</div>}{notice && <div className="success-notice" role="status">{notice}</div>}
  </section>;
}

