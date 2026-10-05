import { useEffect, useRef, useState } from 'react';
import type { Entity, ProjectData, ProjectSnapshot } from '../domain/types';
import { createEntity, newId, KIND_LABELS, textToRichText } from '../domain/model';
import { exportProject as createExport, type ExportProfile, type ExportResult } from '../domain/exports';
import { ARCHIVE_LIMITS, scenarioStore, inspectScenario, jsonBytes, sha256, type ImportMode, type PreparedScenario, type AssetInput } from '../storage';
import { prepareAsset } from '../domain/attachments';
import { EmptyState, Icon, Modal, downloadBytes, safeFileName } from './components';
import { dataOf, labelOf, JsonField, RefList } from './Fields';

export function BackupPanel({ project, projects, onImported }: { project: ProjectData | null; projects: ProjectData[]; onImported: (project: ProjectData) => void }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [progress, setProgress] = useState('');
  const [prepared, setPrepared] = useState<PreparedScenario | null>(null);
  const [mode, setMode] = useState<ImportMode>('clone');
  const [targetId, setTargetId] = useState(project?.projectId || '');
  const [preview, setPreview] = useState<Awaited<ReturnType<typeof scenarioStore.previewImport>> | null>(null);
  const [resolutions, setResolutions] = useState<Record<string, 'existing' | 'incoming'>>({});
  const [checked, setChecked] = useState(false);
  const controller = useRef<AbortController | null>(null);
  const previewSequence = useRef(0);
  useEffect(() => () => controller.current?.abort(), []);
  useEffect(() => {
    setPreview(null); setChecked(false); setResolutions({});
    if (!prepared) return;
    const sequence = ++previewSequence.current;
    const options = { mode, targetProjectId: ['replace', 'merge'].includes(mode) ? targetId || undefined : undefined };
    void scenarioStore.previewImport(prepared, options).then(next => { if (sequence === previewSequence.current) { setPreview(next); setError(''); } }).catch(e => { if (sequence === previewSequence.current) setError((e as Error).message); });
  }, [prepared, mode, targetId]);
  const exportBackup = async (full = true) => {
    if (!project) return;
    setBusy(true); setError(''); setNotice('');
    try { const bytes = await scenarioStore.exportProject(project.projectId, { assetMode: full ? 'embedded' : 'metadata_only' }); downloadBytes(bytes as BlobPart, `${safeFileName(project.name)}${full ? '' : '-素材を除く'}.scenario`, 'application/zip'); setNotice(full ? '完全保存ファイルを作成しました。端末のダウンロードを確認してください。' : '素材bytesを除いたファイルを作成しました。完全復元には素材が別途必要です。'); }
    catch (e) { setError((e as Error).message); }
    finally { setBusy(false); }
  };
  const inspect = async (file: File) => {
    if (file.size > ARCHIVE_LIMITS.compressedBytes) { setError('保存ファイルの上限は64 MiBです。選択したファイルは読み込まず、保存済みの作品を保持しています。'); return; }
    setPrepared(null); setPreview(null); setError(''); setNotice(''); setBusy(true); setProgress('ファイルを読み込み中…');
    const abort = new AbortController(); controller.current = abort;
    try { const candidate = await inspectScenario(new Uint8Array(await file.arrayBuffer()), { signal: abort.signal, onProgress: p => setProgress(`${{ container: '形式を検査', expanding: '展開', hashes: '内容の整合性を検査', validating: 'データと参照先を検査' }[p.stage]} ${p.completed} / ${p.total}`) }); setPrepared(candidate); setMode(projects.some(p => p.projectId === candidate.project.projectId) ? 'clone' : 'new'); if (projects.some(p => p.projectId === candidate.project.projectId)) setTargetId(candidate.project.projectId); }
    catch (e) { setError((e as Error).message); }
    finally { setBusy(false); controller.current = null; setProgress(''); }
  };
  const commit = async () => {
    if (!prepared || !preview) return;
    setBusy(true); setError('');
    try { const result = await scenarioStore.importScenario(prepared, { mode, targetProjectId: ['replace', 'merge'].includes(mode) ? targetId : undefined, baseRevision: preview.target?.revision, resolutions }); setPrepared(null); setPreview(null); setNotice('検査した作品を端末内に復元しました。'); onImported(result.project); }
    catch (e) { setError((e as Error).message); }
    finally { setBusy(false); }
  };
  const blocked = !preview || mode === 'new' && preview.conflicts.length > 0 || mode === 'replace' && preview.pendingChanges > 0 || mode === 'merge' && preview.conflicts.some(c => !resolutions[c.id]);

  return <section className="backup-page">{project && <div className="backup-card"><span className="panel-icon"><Icon name="download" size={26}/></span><div><h3>作品を完全保存</h3><p>本文・状態・履歴・添付を専用の .scenario ファイルに保存します。作者用の内容を含みます。</p><div className="backup-actions"><button className="button primary" disabled={busy} onClick={() => void exportBackup()}><Icon name="download" size={18}/>完全保存ファイルを作成</button><button className="text-button" disabled={busy} onClick={() => void exportBackup(false)}>素材bytesを除いて保存</button></div></div></div>}
    <div className="backup-card"><span className="panel-icon soft-green"><Icon name="upload" size={26}/></span><div><h3>ファイルから復元</h3><p>選んだファイルを検査し、作品名・件数・変更の影響を確認してから復元します。</p><label className={`button secondary file-button ${busy ? 'disabled' : ''}`}><Icon name="upload" size={18}/>保存ファイルを選ぶ<input type="file" accept=".scenario,.zip,application/zip" disabled={busy} onChange={e => { const file = e.target.files?.[0]; e.target.value = ''; if (file) void inspect(file); }}/></label></div></div>
    {busy && <div className="import-progress" role="status"><span className="spinner"/>{progress || '処理中…'}{controller.current && <button className="text-button" onClick={() => controller.current?.abort()}>中止</button>}</div>}{error && <div className="error-notice" role="alert"><strong>処理を完了できませんでした</strong><p>{error}</p><span className="field-hint">保存済みの作品は保持されています。</span></div>}{notice && <div className="success-notice" role="status">{notice}</div>}
    {prepared && <div className="import-preview"><div className="section-heading"><h3>検査済みの作品</h3><span className="status-badge status-confirmed">整合性を確認</span></div><h4>{prepared.summary.name}</h4><div className="import-counts"><span>{prepared.summary.entities}件の情報</span><span>{prepared.summary.relations}件の関係</span><span>{prepared.summary.history}件の履歴</span><span>{(prepared.summary.assetBytes / 1024 / 1024).toFixed(2)} MiBの素材</span></div>{prepared.warnings.map((warning, i) => <p className="info-notice" key={i}>{warning}</p>)}<div className="form-field"><label>復元方法</label><select aria-label="復元方法" value={mode} onChange={e => setMode(e.target.value as ImportMode)}><option value="new">保存IDを維持して新規復元</option><option value="clone">新しいIDへ複製して追加</option><option value="replace">同じ作品を置換</option><option value="merge">同じ作品へ統合</option></select></div>{['replace', 'merge'].includes(mode) && <div className="form-field"><label>対象の作品</label><select aria-label="復元する対象作品" value={targetId} onChange={e => setTargetId(e.target.value)}><option value="">対象を選択</option>{projects.filter(p => p.projectId === prepared.project.projectId).map(p => <option key={p.projectId} value={p.projectId}>{p.name} · 版 {p.revision}</option>)}</select></div>}{preview && <><p className="info-notice">{mode === 'clone' ? '作品と内部参照へ新しいIDを付け、保存済みの作品に追加します。' : mode === 'new' ? 'ファイルの固定IDを維持します。同じ作品IDとの衝突がある場合は停止します。' : `対象の現在版 ${preview.target?.revision}。追加 ${preview.additions}件、同IDの差分 ${preview.conflicts.length}件。`} {mode === 'replace' && '置換前の完全復元点を作成します。'}</p>{mode === 'replace' && preview.pendingChanges > 0 && <p className="error-notice">未送信の変更が{preview.pendingChanges}件あるため置換できません。「複製して追加」を選べます。</p>}{preview.conflicts.map(conflict => <details className="import-conflict" key={conflict.id}><summary>同IDの差分 · {conflict.kind} · {labelOf(conflict.existing as Entity)}</summary><div className="conflict-comparison"><div><h5>現在の作品</h5><pre>{JSON.stringify(conflict.existing, null, 2)}</pre></div><div><h5>ファイルの内容</h5><pre>{JSON.stringify(conflict.incoming, null, 2)}</pre></div></div>{mode === 'merge' && <select aria-label={`${conflict.id}の統合方法`} value={resolutions[conflict.id] || ''} onChange={e => setResolutions(previous => ({ ...previous, [conflict.id]: e.target.value as 'existing' | 'incoming' }))}><option value="">採用する内容を選ぶ</option><option value="existing">現在の内容を残す</option><option value="incoming">ファイルの内容を採用</option></select>}</details>)}</>}
      <label className="check-label import-check"><input type="checkbox" checked={checked} onChange={e => setChecked(e.target.checked)}/>復元方法と対象への影響を確認しました</label><div className="modal-actions"><button className="button secondary" disabled={busy} onClick={() => { setPrepared(null); setPreview(null); }}>中止</button><button className="button primary" disabled={busy || blocked || !checked} onClick={() => void commit()}>この内容で復元する</button></div></div>}
  </section>;
}

export function ExportPanel({ project, onSave, onOpen }: { project: ProjectData; onSave: (entity: Entity) => Promise<Entity>; onOpen: (id: string) => void }) {
  const profiles = project.entities.filter(e => e.kind === 'projection_profile' && !e.deletedAt);
  const [profileId, setProfileId] = useState(profiles[0]?.id || '');
  const [profile, setProfile] = useState<ExportProfile>('reader');
  const [version, setVersion] = useState('');
  const [format, setFormat] = useState<'markdown' | 'html'>('markdown');
  const [result, setResult] = useState<ExportResult | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [newProfile, setNewProfile] = useState(false);
  const [included, setIncluded] = useState<string[]>([]);
  const [publicTitle, setPublicTitle] = useState(project.name);
  const [copyText, setCopyText] = useState(false);
  useEffect(() => { setResult(null); }, [project.revision, profileId, profile, version, format]);
  const preview = async () => { setBusy(true); setError(''); try { setResult(await createExport(project, { profile, projectionProfileId: profileId, ...(version ? { targetVersionId: version } : { targetRevision: project.revision }), readerFormat: format })); } catch (e) { setError((e as Error).message); } finally { setBusy(false); } };
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
    {profiles.length > 0 && <><div className="reader-setup-fields"><label>公開範囲<select value={profileId} aria-label="出力する公開範囲" onChange={e => setProfileId(e.target.value)}><option value="">選択してください</option>{profiles.map(p => <option value={p.id} key={p.id}>{p.name}</option>)}</select></label><label>出力目的<select value={profile} aria-label="出力目的" onChange={e => setProfile(e.target.value as ExportProfile)}><option value="reader">読み手向け本文</option><option value="runtime_json">汎用ランタイムJSON</option><option value="localization">翻訳・収録</option><option value="production">制作の受渡し</option><option value="consultation">手動相談用</option><option value="playable_preview">単体の試遊出力</option></select></label><label>対象版<select value={version} aria-label="出力する作品版" onChange={e => setVersion(e.target.value)}><option value="">編集稿の現在版 {project.revision}</option>{project.snapshots.map(s => <option key={s.id} value={s.id}>{s.versionLabel}</option>)}</select></label>{profile === 'reader' && <label>ファイル形式<select value={format} aria-label="本文の出力形式" onChange={e => setFormat(e.target.value as 'markdown' | 'html')}><option value="markdown">Markdown</option><option value="html">HTML</option></select></label>}</div><div className="backup-actions"><button className="button primary" disabled={!profileId || busy} onClick={() => void preview()}>{busy ? '出力を検査中' : '内容を検査・プレビュー'}</button><button className="button secondary" onClick={() => onOpen(profileId)} disabled={!profileId}>範囲を編集</button><button className="text-button" onClick={() => setNewProfile(true)}><Icon name="plus" size={16}/>新しい範囲</button></div></>}
    {error && <div className="error-notice" role="alert">{error}</div>}{result && <div className="export-result">{!result.ok ? <div className="error-notice" role="alert"><strong>出力を停止しました</strong><ul>{result.issues.map((issue, i) => <li key={i}>{issue.message}{issue.entityId && <button className="text-button" onClick={() => onOpen(issue.entityId!)}>対象を開く</button>}</li>)}</ul></div> : <><div className="section-heading"><h3>出力内容の確認</h3><span>{result.preview.includedCount}件 · 元の版 {result.preview.sourceRevision}</span></div>{result.preview.warnings.map((w, i) => <p className="info-notice" key={i}>{w}</p>)}<details className="advanced-details"><summary>出力から除かれる内容（{result.preview.omissions.length}件）</summary>{result.preview.omissions.map((o, i) => <p className="field-hint" key={i}>{labelOf(project.entities.find(e => e.id === o.entityId))} {o.field || ''} · {o.reason}</p>)}</details>{result.artifacts.map(artifact => <div className="export-artifact" key={artifact.filename}><h4>{artifact.filename}</h4><pre className="export-preview-text">{artifact.content.slice(0, 6000)}{artifact.content.length > 6000 ? '\n… プレビューはここまで。保存ファイルには全内容を含みます。' : ''}</pre><button className="button primary" onClick={() => downloadBytes((artifact.bytes ?? artifact.content) as BlobPart, artifact.filename, artifact.mimeType)}><Icon name="download" size={18}/>この内容を保存</button></div>)}</>}</div>}
    {newProfile && <Modal title="公開する範囲を作成" wide onClose={() => setNewProfile(false)}><div className="form-field"><label>公開用の作品名</label><input value={publicTitle} onChange={e => setPublicTitle(e.target.value)}/></div><div className="form-field"><label>出力する対象</label><RefList project={project} value={included} onChange={setIncluded}/></div><label className="check-label"><input type="checkbox" checked={copyText} onChange={e => setCopyText(e.target.checked)}/>選んだ対象の現在の本文を公開文へコピーする</label><p className="field-hint">名前は現在の表示名を公開名として登録します。コピー後、公開範囲の詳細で公開名と文章を確認・編集できます。作者メモはコピーしません。</p><div className="modal-actions"><button className="button secondary" onClick={() => setNewProfile(false)}>中止</button><button className="button primary" disabled={busy || !included.length || !publicTitle.trim()} onClick={() => void createProfile()}>範囲を作成して内容を確認</button></div></Modal>}
  </section>;
}

export function ProjectInfo({ project, onSaveProject, onSaveEntities, onOpen, theme, setTheme }: { project: ProjectData; onSaveProject: (project: ProjectData, reason: string) => Promise<ProjectData>; onSaveEntities: (entities: Entity[], reason: string, assets?: AssetInput[]) => Promise<void>; onOpen: (id: string) => void; theme: string; setTheme: (theme: string) => void }) {
  const [name, setName] = useState(project.name);
  const [mainStart, setMainStart] = useState(project.mainStart);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState(false);
  const [snapshotName, setSnapshotName] = useState('');
  const [calendarJson, setCalendarJson] = useState<unknown>(project.calendars);
  const [calendarValid, setCalendarValid] = useState(true);
  useEffect(() => { setName(project.name); setMainStart(project.mainStart); }, [project.projectId]);
  const save = async () => { setBusy(true); setError(''); setNotice(''); try { await onSaveProject({ ...project, name, mainStart, calendars: calendarJson as ProjectData['calendars'] }, '作品名・時間の基準を変更'); setNotice('作品の設定を端末内に保存しました。出来事の日時は維持されています。'); } catch (e) { setError((e as Error).message); } finally { setBusy(false); } };
  const snapshot = async () => {
    setBusy(true); setError(''); setNotice('');
    try { const { history: _history, snapshots: _snapshots, authorAlternatives: _authorAlternatives, ...content } = structuredClone(project); const id = newId(), hash = await sha256(jsonBytes(content)); const frozen: ProjectSnapshot = { id, contentHash: hash, versionLabel: snapshotName || `確定版 ${project.revision}`, createdAt: new Date().toISOString(), content }; const meta = { ...createEntity(project.projectId, 'snapshot', frozen.versionLabel, { versionLabel: frozen.versionLabel, contentHash: hash, immutable: true }), id }; await onSaveProject({ ...project, snapshots: [...project.snapshots, frozen], entities: [...project.entities, meta] }, '確定版を保存'); setNotice('本文と設定の確定版を不変の保存内容として記録しました。'); setSnapshotName(''); }
    catch (e) { setError((e as Error).message); }
    finally { setBusy(false); }
  };
  const addAsset = async (file: File) => {
    if (!file.size || file.size > 32 * 1024 * 1024) { setError('添付は1 byte〜32 MiBです。選択した素材は読み込まず、保存済みの作品を保持しています。'); return; }
    setBusy(true); setError(''); setNotice('');
    try { const prepared = await prepareAsset(new Uint8Array(await file.arrayBuffer()), file.name); const { bytes, preview: _preview, ...metadata } = prepared; const entity = createEntity(project.projectId, 'attachment', file.name, { ...metadata, stage: 'reference' }); await onSaveEntities([entity], '添付素材を追加', [{ ...prepared, bytes }]); setNotice('素材と内容を端末内に保存しました。'); onOpen(entity.id); }
    catch (e) { setError((e as Error).message); }
    finally { setBusy(false); }
  };
  return <section className="project-info"><div className="settings-card"><h3>作品の情報</h3><div className="form-field"><label htmlFor="project-name">作品名</label><input id="project-name" value={name} onChange={e => setName(e.target.value)}/></div><div className="form-field"><label htmlFor="project-start">本編開始の世界内tick</label><input id="project-start" inputMode="numeric" value={mainStart} onChange={e => setMainStart(e.target.value)}/><span className="field-hint">基準点だけを変更します。出来事の絶対日時は変わりません。</span></div><div className="form-field"><label>使用する暦</label><select value={project.calendarId} aria-label="作品の暦" disabled><option>{project.calendars.find(c => c.id === project.calendarId)?.name}</option></select></div><details className="advanced-details"><summary>暦の定義を編集</summary><p className="field-hint">独自暦を定義できます。現在のcalendarIdは維持し、日時のラベルだけを変更します。日時の換算・連動移動の操作は未対応です。</p><JsonField label="暦の定義" value={calendarJson} onChange={setCalendarJson} onValid={setCalendarValid}/></details><button className="button primary" disabled={busy || !calendarValid} onClick={() => void save()}>作品の設定を保存</button></div>
    <div className="settings-card"><h3>確定版を残す</h3><p className="field-hint">現在の本文と設定を固定します。後の編集はこの内容を変更しません。</p><div className="form-field"><label>版の名称</label><input value={snapshotName} placeholder={`確定版 ${project.revision}`} onChange={e => setSnapshotName(e.target.value)} aria-label="確定版の名称"/></div><button className="button secondary" disabled={busy} onClick={() => void snapshot()}>現在の内容を確定版として保存</button>{project.snapshots.map(s => <div className="snapshot-item" key={s.id}><Icon name="folder"/><span><strong>{s.versionLabel}</strong><small>{new Date(s.createdAt).toLocaleString('ja-JP')}</small></span></div>)}</div>
    <div className="settings-card"><h3>素材を追加</h3><p className="field-hint">PNG・JPEG・GIF・WebP・WAV・MP3・PDFを作品へ添付します。種類と容量を検査して保存します。</p><label className="button secondary file-button"><Icon name="upload" size={18}/>素材ファイルを選ぶ<input type="file" disabled={busy} onChange={e => { const file = e.target.files?.[0]; e.target.value = ''; if (file) void addAsset(file); }}/></label></div>
    <div className="settings-card"><h3>表示設定</h3><div className="theme-options">{[['light', '明るい配色'], ['dark', '暗い配色'], ['system', '端末に合わせる']].map(([v, label]) => <label className="check-label" key={v}><input type="radio" name="theme" checked={theme === v} onChange={() => setTheme(v)}/>{label}</label>)}</div></div>{error && <div className="error-notice" role="alert">{error}</div>}{notice && <div className="success-notice" role="status">{notice}</div>}
  </section>;
}

export function HistoryPanel({ project, onUpdated, onOpen }: { project: ProjectData; onUpdated: (project: ProjectData) => void; onOpen: (id: string) => void }) {
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [history, setHistory] = useState(project.history);
  const [loading, setLoading] = useState(true);
  const [undoId, setUndoId] = useState<string | null>(null);
  const [restore, setRestore] = useState<{ operationId: string; entityId: string; side: 'before' | 'after' } | null>(null);
  useEffect(() => {
    let live = true;
    setLoading(true); setError(''); setHistory(project.history);
    void scenarioStore.listHistory(project.projectId).then(history => { if (live) setHistory(history); }).catch(error => { if (live) setError((error as Error).message); }).finally(() => { if (live) setLoading(false); });
    return () => { live = false; };
  }, [project.projectId, project.revision]);
  const commands = [...history].reverse();
  const pending = commands.find(c => c.operationId === undoId);
  const undo = async () => { setBusy(true); setError(''); try { const result = await scenarioStore.undo(project.projectId, undoId || undefined); onUpdated(result.project); setUndoId(null); } catch (e) { setError((e as Error).message); } finally { setBusy(false); } };
  const restoreEntity = async () => { if (!restore) return; setBusy(true); setError(''); try { const result = await scenarioStore.restoreEntity(project.projectId, restore.operationId, restore.entityId, restore.side); onUpdated(result.project); setRestore(null); } catch (e) { setError((e as Error).message); } finally { setBusy(false); } };
  const archived = project.entities.filter(e => e.deletedAt);
  return <section className="history-page">{loading && <p role="status">変更履歴を読み込んでいます…</p>}{error && <div className="error-notice" role="alert">{error}</div>}{archived.length > 0 && <div className="settings-card"><h3>アーカイブ済みの情報</h3>{archived.map(e => <button className="reference-link" key={e.id} onClick={() => { const beforeDelete = commands.find(c => c.targetIds.includes(e.id) && c.before.entities.some(v => v.id === e.id && !v.deletedAt)); if (beforeDelete) setRestore({ operationId: beforeDelete.operationId, entityId: e.id, side: 'before' }); else onOpen(e.id); }}>{labelOf(e)}<small>{KIND_LABELS[e.kind]} · 復元</small></button>)}</div>}{!commands.length ? loading ? null : <EmptyState icon="clock" title="変更履歴はまだありません"/> : <ol className="history-list">{commands.slice(0, 50).map((c, i) => <li key={c.operationId}><span className="history-marker"><Icon name={c.compensatesOperationId ? 'back' : 'check'} size={16}/></span><div className="history-entry"><div className="section-heading"><h3>{c.reason}</h3><span>版 {c.revision}</span></div><p className="field-hint">{new Date(c.createdAt).toLocaleString('ja-JP')} · {c.targetIds.length}件の変更</p><div className="history-targets">{c.targetIds.map(id => { const entity = c.after.entities.find(e => e.id === id) || c.before.entities.find(e => e.id === id); return entity ? <button key={id} className="text-button" onClick={() => setRestore({ operationId: c.operationId, entityId: id, side: 'after' })}>{labelOf(entity)}をこの版へ復元</button> : null; })}</div>{i === 0 && <button className="button secondary small" onClick={() => setUndoId(c.operationId)}>この変更を取り消す</button>}</div></li>)}</ol>}{commands.length > 50 && <p className="field-hint">最新の50件を表示しています。全履歴は完全保存ファイルに含まれます。</p>}
    {undoId && <Modal title="変更の取り消し" onClose={() => { if (!busy) setUndoId(null); }}><p>「{pending?.reason}」の変更を、新しい履歴を追加して取り消します。</p><ul>{pending?.targetIds.map(id => <li key={id}>{labelOf(pending.after.entities.find(e => e.id === id) || pending.before.entities.find(e => e.id === id))}</li>)}</ul><div className="modal-actions"><button className="button secondary" disabled={busy} onClick={() => setUndoId(null)}>中止</button><button className="button primary" disabled={busy} onClick={() => void undo()}>この変更を取り消す</button></div></Modal>}
    {restore && <Modal title="情報を過去の版へ復元" onClose={() => { if (!busy) setRestore(null); }}><p>対象だけを選んだ履歴の内容へ復元します。現在の参照先と型を検査してから、新しい変更として保存します。</p><pre className="restore-preview">{JSON.stringify(commands.find(c => c.operationId === restore.operationId)?.[restore.side].entities.find(e => e.id === restore.entityId), null, 2)}</pre><div className="modal-actions"><button className="button secondary" disabled={busy} onClick={() => setRestore(null)}>中止</button><button className="button primary" disabled={busy} onClick={() => void restoreEntity()}>この内容へ復元する</button></div></Modal>}
  </section>;
}
