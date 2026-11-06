import {recordDiagnostic} from '../diagnostics';
import {registerAuthorCache,registerAuthorBusy} from './StoreContext';
import {useScenarioStore,useAuthorScope,storeForAuthorScope} from './StoreContext';
import { useEffect, useSyncExternalStore, useMemo, useState } from 'react';
import type { Entity, ProjectData } from '../domain/types';
import { newId } from '../domain/model';
import { ARCHIVE_LIMITS, inspectScenario, inspectBackupFile, restoreBackupTrial, estimateBackupCapacity, performImportWork, sha256, type BackupInspection, type BackupTrial, type BackupCapacity, StorageError, type ImportDraft, type ImportMode, type ImportPreview, type PreparedScenario } from '../storage';
import { collectImportIds, type ImportId } from '../storage/importMapping';
import { Icon, downloadBytes, safeFileName } from './components';
import { labelOf } from './Fields';
import { ListPager, useListWindow } from './ListWindow';
import { PagedSelect } from './PagedSelect';
import { BackupTrialPreview } from './BackupTrialPreview';

interface Verification { created?: {createdAt: string; sourceHash: string; assetMode: 'embedded' | 'metadata_only'}; selection?: 'checking' | 'checked' | 'failed' | 'cancelled'; inspection?: BackupInspection; trial?: BackupTrial; capacity?: BackupCapacity }

interface Draft extends ImportDraft { verification?: Verification; verificationOwner?: {projectId: string; baseRevision: string}; selectedBytes?: Uint8Array; prepared?: PreparedScenario; preview?: ImportPreview; checked: boolean; busy: boolean; ready: boolean; error: string; notice: string; progress: string; saved?: { projectId: string; revision: string }; controller?: AbortController }
const drafts = new Map<string, Draft>(), listeners = new Set<() => void>(), writes = new Map<string, Promise<unknown>>();
const queuedFiles = new Map<string, File>();
function recoveryErrorMessage(cause: unknown, fileName?: string): string {
  const message = cause instanceof Error && cause.message ? cause.message : '完全保存・復元の処理に失敗しました。入力と元ファイルを保持して再試行してください。';
  const path = cause instanceof StorageError && cause.path ? cause.path : fileName;
  return path ? `${path}: ${message}` : message;
}
const emit = () => listeners.forEach(listener => listener());
function load(key: string): Draft { let value = drafts.get(key); if (!value) { value = { key, mode: 'clone', targetProjectId: key.split(':').at(-1) === 'library' ? '' : key.split(':').at(-1)!, idMap: {}, resolutions: {}, checked: false, busy: false, ready: false, error: '', notice: '', progress: '' }; drafts.set(key, value); } return value; }
function update(key: string, patch: Partial<Draft>, persist = false) {
  const next = { ...load(key), ...patch }; drafts.set(key, next); emit();
  if (persist) {
    const value = next, request: ImportDraft = { key, sourceHash: value.sourceHash, mode: value.mode, targetProjectId: value.targetProjectId, idMap: structuredClone(value.idMap), resolutions: structuredClone(value.resolutions), selectedId: value.selectedId };
    const prior = writes.get(key) ?? Promise.resolve();
    const capturedStore=storeForAuthorScope(key),pending = prior.catch(() => {}).then(() => capturedStore.saveImportDraft(request)).catch(cause => update(key, { error: `復元入力の一時保存に失敗しました。画面内の入力は保持しています。${recoveryErrorMessage(cause)}` })); writes.set(key, pending);
  }
}
const subscribe = (listener: () => void) => { listeners.add(listener); return () => listeners.delete(listener); };

export function retainImportedVersion(key: string, project: Pick<ProjectData, 'projectId' | 'revision'>) {
  update(key, { busy: true, saved: { projectId: project.projectId, revision: project.revision }, controller: undefined, progress: '保存した版の表示を待っています…' });
}

export function acknowledgeImportedVersions(projects: ProjectData[], scopePrefix: string) {
  const confirmed: { sourceScope: string; projectId: string; revision: string; notice: string }[] = [];
  const byId = new Map(projects.map(project => [project.projectId, project]));
  for (const [key, value] of drafts) {
    if (!key.startsWith(scopePrefix) || !value.saved) continue;
    const saved = value.saved, observed = byId.get(saved.projectId);
    if (!observed || BigInt(observed.revision) < BigInt(saved.revision)) continue;
    const capturedStore = storeForAuthorScope(key);
    const notice = '検査した作品を端末内に復元しました。保存した版を確認しました。';
    update(key, { busy: false, saved: undefined, prepared: undefined, preview: undefined, checked: false, notice });
    const clear = (writes.get(key) ?? Promise.resolve()).catch(() => {}).then(() => capturedStore.clearImportDraft(key)).catch(cause => update(key, { error: `復元済みの入力を消去できませんでした。${recoveryErrorMessage(cause)}` }));
    writes.set(key, clear);
    confirmed.push({ sourceScope: key, projectId: saved.projectId, revision: saved.revision, notice });
  }
  return confirmed;
}

export function BackupPanel({ project, projects, onImported }: { project: ProjectData | null; projects: Pick<ProjectData,'projectId'|'name'|'revision'>[]; onImported: (project: ProjectData, intent?: { followSelection: boolean }) => void }) {
  const scenarioStore=useScenarioStore();
  const key = useAuthorScope(project?.projectId ?? 'library');
  const draft = useSyncExternalStore(subscribe, () => load(key));
  const [query, setQuery] = useState('');
  const [recoveredPendingCount, setRecoveredPendingCount] = useState(0);
  useEffect(() => { let live = true; setRecoveredPendingCount(0); if (project) void scenarioStore.getSaveState(project.projectId).then(value => { if (live) setRecoveredPendingCount(value.recoveredPendingCount); }).catch(cause => update(key, { error: recoveryErrorMessage(cause) })); return () => { live = false; }; }, [key, project?.revision]);
  const [ownedIds, setOwnedIds] = useState<{prepared?: PreparedScenario; scope: string; ids: ImportId[]; error: string; ready: boolean}>({scope: '', ids: [], error: '', ready: false});
  useEffect(() => {
    const prepared = draft.prepared, controller = new AbortController(); let live = true;
    setOwnedIds({prepared, scope: key, ids: [], error: '', ready: !prepared});
    if (prepared) void performImportWork({step: 'ids', project: prepared.project, recovery: prepared.recovery, worlds: {}}, {signal: controller.signal})
      .then(result => { if (live) setOwnedIds({prepared, scope: key, ids: result.ids!, error: '', ready: true}); })
      .catch(cause => { if (live) { recordDiagnostic(cause, {accountId: scenarioStore.accountId, revision: project?.revision}); setOwnedIds({prepared, scope: key, ids: [], error: recoveryErrorMessage(cause), ready: true}); } });
    return () => { live = false; controller.abort(); };
  }, [key, draft.prepared]);
  const ownershipPending = !!draft.prepared && (!ownedIds.ready || ownedIds.prepared !== draft.prepared || ownedIds.scope !== key);
  const ownershipError = ownedIds.scope === key && ownedIds.prepared === draft.prepared ? ownedIds.error : '';
  const ids = ownershipPending ? [] : ownedIds.ids;
  const entityById = useMemo(() => { const index = new Map<string, Entity>(); for (const entity of draft.prepared?.project.entities ?? []) if (!index.has(entity.id)) index.set(entity.id, entity); return index; }, [draft.prepared]);
  const matches = useMemo(() => { const text = query.normalize('NFKC').toLowerCase(); if (!text) return ids; return ids.filter(item => `${item.id} ${item.role} ${entityById.get(item.id)?.name ?? ''}`.normalize('NFKC').toLowerCase().includes(text)); }, [ids, query, entityById]);
  const idPage = useListWindow({ items: matches, scope: `${key}:import-ids:${query}`, selectedId: draft.selectedId });
  const conflicts = useListWindow({ items: draft.preview?.conflicts ?? [], scope: `${key}:import-conflicts` });
  const targetChoice=projects.find(candidate=>candidate.projectId===draft.targetProjectId);
  const [targetLoad,setTargetLoad]=useState<{id:string;state:'unloaded'|'loading'|'loaded'|'missing'|'error';project?:ProjectData;error?:string}>({id:'',state:'unloaded'});
  useEffect(()=>{
    const controller=new AbortController();let live=true;
    const id=draft.targetProjectId,needed=!!draft.prepared&&['replace','merge','mapped_merge'].includes(draft.mode);
    setTargetLoad({id,state:needed?'loading':'unloaded'});
    if(needed)void scenarioStore.loadEditor(id,{signal:controller.signal,expectedRevision:targetChoice?.revision,immutableView:true}).then(found=>{if(live)setTargetLoad({id,state:found?'loaded':'missing',project:found});}).catch(cause=>{if(live)setTargetLoad({id,state:'error',error:recoveryErrorMessage(cause)});});
    return()=>{live=false;controller.abort();if(id&&id!==project?.projectId)scenarioStore.releaseEditor(id);};
  },[scenarioStore,key,draft.targetProjectId,draft.mode,draft.prepared,targetChoice?.revision]);
  const target=targetLoad.id===draft.targetProjectId&&targetLoad.state==='loaded'?targetLoad.project:undefined;
  const targetEntityById = useMemo(() => { const index = new Map<string, Entity>(); for (const entity of target?.entities ?? []) if (!index.has(entity.id)) index.set(entity.id, entity); return index; }, [target]);
  const selected = ids.find(item => item.id === draft.selectedId);
  const choices = useMemo(() => !selected || !target ? [] : collectImportIds(target).filter(item => item.role === selected.role && (!selected.ownerId || item.ownerId === draft.idMap[selected.ownerId])).map(item => ({ id: item.id, label: `${labelOf(targetEntityById.get(item.id))} · ${item.role}` })), [selected, target, draft.idMap, targetEntityById]);
  const change = (patch: Partial<Draft>) => update(key, { ...patch, preview: undefined, checked: false, error: '' }, true);
  const stale = !!draft.preview?.target && target?.revision !== draft.preview.target.revision;
  const mappedUnresolved = draft.preview?.mappedPlan?.unresolved.length ?? 0;
  const blocked = ownershipPending || !!ownershipError || !draft.preview || stale || draft.mode === 'new' && !!draft.preview.conflicts.length || draft.mode === 'replace' && draft.preview.pendingChanges > 0 || ['merge', 'mapped_merge'].includes(draft.mode) && draft.preview.conflicts.some(conflict => !draft.resolutions[conflict.id]) || draft.mode === 'mapped_merge' && (!draft.preview.mappedPlan?.candidate || !!mappedUnresolved);

  useEffect(() => {
    if (load(key).ready || load(key).busy) return;
    update(key, { busy: true, progress: '保持した復元入力を読み込み中…' });
    void Promise.all([scenarioStore.getImportDraft(key), scenarioStore.getAuthorToolDraft(`${key}:backup-verification`)]).then(async ([saved, record]) => {
      if (record?.fields.verification) update(key, {verification: record.fields.verification as Verification, verificationOwner: {projectId: record.projectId, baseRevision: record.baseRevision}});
      return saved;
    }).then(async saved => {if(!saved&&key.startsWith('guest:')){const old=await scenarioStore.getImportDraft(key.slice(6));if(old){saved={...old,key};await scenarioStore.saveImportDraft(saved);await scenarioStore.clearImportDraft(key.slice(6));}}
      if (saved) {
        const prepared = saved.bytes ? await inspectScenario(saved.bytes) : undefined;
        if (saved.bytes && await sha256(saved.bytes) !== saved.sourceHash) throw new Error('保持した元ファイルのhashが一致しません。');
        update(key, { ...saved, bytes: undefined, selectedBytes: saved.bytes, prepared, preview: undefined, checked: false, notice: prepared ? '元ファイルとID対応の入力を再開しました。対象版の影響を再確認してください。' : '' });
      }
    }).catch(cause => update(key, { error: recoveryErrorMessage(cause) })).finally(() => update(key, { ready: true, busy: false, progress: '' }));
  }, [key]);
  useEffect(() => { if (!draft.busy && draft.ready) { const file = queuedFiles.get(key); if (file) { queuedFiles.delete(key); void inspect(file); } } }, [key, draft.busy, draft.ready]);
  function verification(patch: Partial<Verification>) {
    const current = load(key), previous = current.verification, value = {...previous, ...patch};
    // Evidence is cleared when another selection starts. Its account-bound
    // persistence owner must survive until that attempt reaches a terminal state.
    const source = value.inspection ?? previous?.inspection;
    const owner = project ? {projectId: project.projectId, baseRevision: project.revision} : source ? {projectId: source.projectId, baseRevision: source.revision} : current.verificationOwner;
    update(key, {verification: value, verificationOwner: owner});
    if (!owner) return;
    const pending = (writes.get(key) ?? Promise.resolve()).catch(() => {}).then(() => scenarioStore.saveAuthorToolDraft({key: `${key}:backup-verification`, ...owner, fields: {verification: value}})).catch(cause => update(key, {error: `確認記録の端末内保存に失敗しました。画面内の結果は保持しています。${recoveryErrorMessage(cause)}`}));
    writes.set(key, pending);
  }
  function cancelSelection(event?: Event) {
    event?.stopPropagation();
    // File reads and capacity estimates may resolve after the picker cancels.
    // Abort their inspection before clearing evidence so it cannot become success.
    if (load(key).verification?.selection === 'checking') load(key).controller?.abort();
    queuedFiles.delete(key);
    verification({selection: 'cancelled', inspection: undefined, trial: undefined, capacity: undefined});
  }
  async function trialRestore() {
    const request = load(key), inspection = request.verification?.inspection;
    if (request.busy || !request.selectedBytes || !inspection || request.verification?.trial) return;
    const controller = new AbortController(); update(key, {busy: true, controller, error: '', notice: '', progress: '元作品を残して別コピーへ試し復元中…'});
    try {
      const result = await restoreBackupTrial(scenarioStore, request.selectedBytes, inspection, {signal: controller.signal});
      verification({trial: result.trial});
      onImported(result.project, {followSelection: false});
    } catch (cause) {recordDiagnostic(cause, {accountId: scenarioStore.accountId, revision: project?.revision}); update(key, {error: recoveryErrorMessage(cause)});}
    finally {update(key, {busy: false, controller: undefined, progress: ''});}
  }
  async function preview() {
    const request = load(key); if (request.busy || !request.prepared) return;
    update(key, { busy: true, error: '', checked: false, progress: 'ID対応・差分・素材を検査中…' });
    const controller = new AbortController(); update(key, { controller });
    try { await (writes.get(key) ?? Promise.resolve()); const result = await scenarioStore.previewImport(request.prepared, { mode: request.mode, targetProjectId: ['replace', 'merge', 'mapped_merge'].includes(request.mode) ? request.targetProjectId : undefined, idMap: request.idMap, resolutions: request.resolutions, signal: controller.signal }); update(key, { preview: result }); }
    catch (cause) { recordDiagnostic(cause,{accountId:scenarioStore.accountId,revision:project?.revision});update(key, { error: recoveryErrorMessage(cause) }); }
    finally { update(key, { busy: false, controller: undefined, progress: '' }); }
  }
  async function inspect(file: File) {
    if (load(key).busy) { queuedFiles.set(key, file); return; }
    if (file.size > ARCHIVE_LIMITS.compressedBytes) { verification({selection: 'failed', inspection: undefined, trial: undefined, capacity: undefined}); update(key, { error: `${file.name}: 保存ファイルの上限は64 MiBです。元の復元入力と保存済み作品を保持しています。` }); return; }
    verification({selection: 'checking', inspection: undefined, trial: undefined, capacity: undefined});
    const controller = new AbortController(); let inspected = false; update(key, { busy: true, error: '', notice: '', progress: 'ファイルを読み込み中…', controller });
    try {
      const bytes = new Uint8Array(await file.arrayBuffer()), {prepared, inspection} = await inspectBackupFile(bytes, file.name, { signal: controller.signal, onProgress: progress => update(key, { progress: `${progress.stage} ${progress.completed} / ${progress.total}` }) }), sourceHash = inspection.sourceHash, prior = load(key), sameFile = sourceHash === prior.sourceHash;
      const capacity = await estimateBackupCapacity(typeof navigator !== 'undefined' && navigator.storage?.estimate ? () => navigator.storage.estimate() : undefined);
      if (controller.signal.aborted) throw new StorageError('CANCELLED', '検査を取り消しました。元作品は保持しています。');
      verification({selection: 'checked', inspection, trial: undefined, capacity});
      const next: ImportDraft = { key, bytes, sourceHash, mode: sameFile ? prior.mode : projects.some(p => p.projectId === prepared.project.projectId) ? 'clone' : 'new', targetProjectId: sameFile ? prior.targetProjectId : projects.some(p => p.projectId === prepared.project.projectId) ? prepared.project.projectId : prior.targetProjectId, idMap: sameFile ? prior.idMap : {}, resolutions: sameFile ? prior.resolutions : {} };
      update(key, { ...next, bytes: undefined, selectedBytes: bytes, prepared, preview: undefined, checked: false });
      inspected = true;
      try { await (writes.get(key) ?? Promise.resolve()).catch(() => {}); await scenarioStore.saveImportDraft(next); } catch (cause) { recordDiagnostic(cause,{accountId:scenarioStore.accountId,revision:project?.revision});update(key, { error: `元ファイルの一時保存に失敗しました。入力は画面内に保持しています。${recoveryErrorMessage(cause, file.name)}` }); }
    } catch (cause) { verification({selection: controller.signal.aborted ? 'cancelled' : 'failed', inspection: undefined, trial: undefined, capacity: undefined}); recordDiagnostic(cause,{accountId:scenarioStore.accountId,revision:project?.revision});update(key, { error: recoveryErrorMessage(cause, file.name) }); }
    finally { update(key, { busy: false, controller: undefined, progress: '' }); }
    if (inspected && load(key).prepared && load(key).mode !== 'mapped_merge') await preview();
  }
  async function commit() {
    const request = load(key); if (request.busy || !request.prepared || !request.preview || !request.checked || blocked) return;
    update(key, { busy: true, error: '', progress: '復元する本文・履歴と送信待ちを確認中…' });
    const controller = new AbortController(); update(key, { controller });
    try { const result = await scenarioStore.importScenario(request.prepared, { mode: request.mode, targetProjectId: ['replace', 'merge', 'mapped_merge'].includes(request.mode) ? request.targetProjectId : undefined, baseRevision: request.preview.target?.revision, idMap: request.idMap, resolutions: request.resolutions, confirmationHash: request.preview.confirmationHash, signal: controller.signal, onStage: stage => update(key, { progress: stage === 'commit' ? '確認した内容を原子保存中…' : stage === 'clone' ? '複製のIDと固定版を確認中…' : '復元する本文・履歴と送信待ちを確認中…' }) }); retainImportedVersion(key, result.project); onImported(result.project, { followSelection: !queuedFiles.has(key) }); }
    catch (cause) { recordDiagnostic(cause,{accountId:scenarioStore.accountId,revision:project?.revision});update(key, { busy: false, controller: undefined, progress: '', error: recoveryErrorMessage(cause) }); }
  }
  async function exportBackup(full = true) {
    if (!project || load(key).busy) return; update(key, { busy: true, error: '', notice: '', progress: '完全保存ファイルを作成中…' });
    const controller = new AbortController(); update(key, { controller });
    try { const bytes = await scenarioStore.exportProject(project.projectId, { assetMode: full ? 'embedded' : 'metadata_only', signal: controller.signal,onProgress:p=>update(key,{progress:({container:'ファイル一覧を確認',expanding:'ファイルを展開',hashes:'保存した操作を照合',validating:'内容と履歴を検査',serializing:'本文・履歴・素材を格納',compressing:'保存ファイルを圧縮'})[p.stage]+` ${p.completed}/${p.total}`}) }); const sourceHash = await sha256(bytes);
      if (controller.signal.aborted) throw new StorageError('CANCELLED', '控えの作成を取り消しました。端末内の作品は保持しています。');
      verification({created: {createdAt: new Date().toISOString(), sourceHash, assetMode: full ? 'embedded' : 'metadata_only'}});
      downloadBytes(bytes as BlobPart, `${safeFileName(project.name)}${full ? '' : '-素材を除く'}.scenario`, 'application/zip'); update(key, { notice: full ? '画像・音声を同梱する控えを作成しました。「ファイル」やダウンロードから実物を選び、検査・試し復元してください。' : '素材を別に用意する控えを作成しました。画像・音声は含まれません。完全復元には素材が別途必要です。' }); }
    catch (cause) { recordDiagnostic(cause,{accountId:scenarioStore.accountId,revision:project?.revision});update(key, { error: recoveryErrorMessage(cause) }); }
    finally { update(key, { busy: false, controller: undefined, progress: '' }); }
  }
  return <section className="backup-page">{project && <div className="backup-card"><Icon name="download" size={26}/><div><h3>持ち出す控えを作る</h3><p>「この端末に保存」は、このブラウザー内の保存です。端末の故障やブラウザーのデータ消去に備えるには、.scenario の控えを「ファイル」などへ保存してください。</p><h4>画像・音声も同梱する控え</h4><p>本文・状態・固定世界・履歴・送信待ちと画像・音声を含みます。このファイルから別コピーへ素材も読み戻せます。</p><button className="button primary" disabled={draft.busy} onClick={() => void exportBackup()}>完全保存ファイルを作成</button><h4>画像・音声を別に用意する控え</h4><p>本文・状態・固定世界・履歴・送信待ちと素材の情報だけを含みます。画像・音声の実物は含まれません。素材を別に用意しないと、すべては戻せません。</p><button className="text-button" disabled={draft.busy} onClick={() => void exportBackup(false)}>素材bytesを除いて保存</button></div></div>}
    {!!recoveredPendingCount && <p className="info-notice" role="status">復元した送信待ち操作 {recoveredPendingCount}件を保持しています。接続先・権限・サーバー確定基底を再確認するまで送信しません。</p>}
    <div className="backup-card"><Icon name="upload" size={26}/><div><h3>ファイルから復元</h3><p>元ファイルと対応の入力を端末内に保持し、影響を確認してから復元します。控えを作った後は「ファイル」やダウンロードにある実物を選んで検査し、元作品を残す別コピーで試せます。</p><label className="button secondary file-button">保存ファイルを選ぶ<input type="file" accept=".scenario,.zip,application/zip" disabled={draft.busy} onChange={event => { const file = event.target.files?.[0]; event.target.value = ''; if (file) void inspect(file); else cancelSelection(); }} ref={input => {if (!input) return; input.addEventListener('cancel', cancelSelection); return () => input.removeEventListener('cancel', cancelSelection);}}/></label></div></div>
    <section className="backup-card" aria-label="控えの確認記録"><div><h3>控えの確認記録</h3>
      <p>{draft.verification?.created ? `作成時刻 ${draft.verification.created.createdAt} · ${draft.verification.created.assetMode === 'embedded' ? '画像・音声を同梱' : '素材を別に用意'}` : '控えはまだ作成していません。'} 作成だけでは、保存先の実ファイルは未検査です。</p>
      {draft.verification?.selection === 'checking' ? <p>実ファイルを検査中…</p> : draft.verification?.selection === 'failed' ? <p>ファイル検査に失敗しました。確認済みにはしていません。</p> : draft.verification?.selection === 'cancelled' ? <p>ファイルの選択を取り消しました。今回のファイルは未検査です。</p> : !draft.verification?.inspection && <p>実ファイルは未検査です。</p>}
      {draft.verification?.inspection && <><p>ファイル検査に成功 · {draft.verification.inspection.fileName} · 検査時刻 {draft.verification.inspection.checkedAt}</p><p style={{overflowWrap: 'anywhere'}}>検査対象の作品 {draft.verification.inspection.projectId} · 版 {draft.verification.inspection.revision} · ファイル内の作成時刻 {draft.verification.inspection.exportedAt}</p><details><summary>照合したファイルと添付内容</summary><p style={{overflowWrap: 'anywhere'}}>ファイル SHA-256 {draft.verification.inspection.sourceHash}</p><p>同梱素材 {draft.verification.inspection.assets.length}件 · 含まれない素材 {draft.verification.inspection.missingAssets}件</p></details>
      {draft.verification.inspection.assetMode === 'metadata_only' && <p className="info-notice">画像・音声を含まない控えです。素材を別に用意する必要があります。この端末に素材があっても、控えから全素材を復元した証明にはなりません。</p>}
      {draft.verification.created && <p>{draft.verification.created.sourceHash === draft.verification.inspection.sourceHash ? '直前に作成した控えと同じファイルです。' : '直前に作成した控えとは別のファイルです。検査対象の作品・版だけの結果です。'}</p>}
      <p>{draft.verification.capacity?.availableBytes === undefined ? '容量は確認できません' : `このブラウザーの空き容量の概算 ${draft.verification.capacity.availableBytes.toLocaleString()} bytes`} · 確認時刻 {draft.verification.capacity?.checkedAt ?? '未取得'}。保存先の「ファイル」や端末全体の容量ではありません。容量の概算は復元成功を保証しません。</p>
      {draft.verification.trial ? <><p>この端末の別コピーへ読み戻しました · 試し復元したコピーの版 {draft.verification.trial.revision} · {draft.verification.trial.restoredAt}</p><p style={{overflowWrap: 'anywhere'}}>コピーID {draft.verification.trial.projectId} · 読み戻した同梱素材 {draft.verification.trial.restoredAssets}件 · 含まれない素材 {draft.verification.trial.missingAssets}件</p><BackupTrialPreview trial={draft.verification.trial} inspection={draft.verification.inspection}/></> : <p>試し復元は未実施です。</p>}
      <button className="button secondary" disabled={draft.busy || !draft.selectedBytes || !!draft.verification.trial} onClick={() => void trialRestore()}>元作品を残して別コピーへ試し復元</button></>}
      {!draft.verification?.inspection && <button className="button secondary" disabled>元作品を残して別コピーへ試し復元</button>}
    </div></section>
    {draft.busy && <p role="status">{draft.progress || '処理中…'}{draft.controller && <button className="text-button" onClick={() => draft.controller?.abort()}>中止</button>}</p>}{ownershipPending && <p role="status">IDの所有者と対応を確認しています…</p>}{draft.error && <div className="error-notice" role="alert">{draft.error}</div>}{ownershipError && <div className="error-notice" role="alert">ID対応の検査を続けられません。元ファイルと保存済み作品を保持しています。{ownershipError}</div>}{draft.notice && <p className="success-notice" role="status">{draft.notice}</p>}
    {draft.prepared && <div className="import-preview"><h3>検査済みの作品 · {draft.prepared.summary.name}</h3><p>{draft.prepared.summary.entities}件の情報 · {draft.prepared.summary.history}件の履歴 · {draft.prepared.summary.assetBytes} bytesの素材</p>{draft.prepared.warnings.map(warning => <p className="info-notice" key={warning}>{warning}</p>)}<label>復元方法<select aria-label="復元方法" disabled={draft.busy} value={draft.mode} onChange={event => { const mode = event.target.value as ImportMode; change({ mode, resolutions: {} }); if (mode === 'new' || mode === 'clone') void preview(); }}><option value="new">保存IDを維持して新規復元</option><option value="clone">新しいIDへ複製して追加</option><option value="replace">同じ作品を置換</option><option value="merge">同じ作品へ統合</option><option value="mapped_merge">別作品へ明示ID対応で統合</option></select></label>
      {['replace', 'merge', 'mapped_merge'].includes(draft.mode) && <PagedSelect label="復元する対象作品" scope={`${key}:import-project`} disabled={draft.busy} value={draft.targetProjectId} onChange={targetProjectId => change({ targetProjectId, idMap: {}, resolutions: {} })} items={projects.filter(p => draft.mode === 'mapped_merge' ? p.projectId !== draft.prepared!.project.projectId : p.projectId === draft.prepared!.project.projectId).map(p => ({ id: p.projectId, label: `${p.name} · 版 ${p.revision}` }))}/>}
      {targetLoad.state==='loading'&&<p role="status">復元する対象作品を読み込んでいます…</p>}{targetLoad.state==='error'&&<p role="alert">{targetLoad.error}</p>}{targetLoad.state==='missing'&&<p role="alert">復元する対象作品が見つからないか、編集する権限がありません。</p>}
      {draft.mode === 'mapped_merge' && <section aria-label="全IDの明示対応"><h4>全IDの対応を確認</h4><p>段落・台詞・固定版・履歴も含め、{ids.length}件すべての対応を指定します。本文中の文字列は変更しません。</p><button className="button secondary" disabled={draft.busy || ownershipPending || !!ownershipError || !target} onClick={() => change({ idMap: Object.fromEntries(ids.map(item => [item.id, item.role === 'project' ? draft.targetProjectId : newId()])), resolutions: {} })}>全IDへ新しい対応先を用意</button><input type="search" aria-label="対応元IDを検索" value={query} onChange={event => setQuery(event.target.value)}/><ListPager {...idPage} label="対応元ID"/>{idPage.items.map(item => <button className="reference-link" disabled={draft.busy} key={item.id} onClick={() => update(key, { selectedId: item.id }, true)}>{labelOf(entityById.get(item.id))} · {item.role}<small>{item.id} → {draft.idMap[item.id] || '未指定'}</small></button>)}{selected && <div><p>対応元 {selected.id} · {selected.role}</p><label>対応先ID<input aria-label="対応先ID" value={draft.idMap[selected.id] ?? ''} disabled={draft.busy || selected.role === 'project'} onChange={event => change({ idMap: { ...draft.idMap, [selected.id]: event.target.value }, resolutions: {} })}/></label>{selected.role !== 'project' && <PagedSelect label="既存の同じ種別へ対応" scope={`${key}:target:${selected.id}`} disabled={draft.busy} items={choices} value={choices.some(item => item.id === draft.idMap[selected.id]) ? draft.idMap[selected.id] : ''} onChange={value => { if (value) change({ idMap: { ...draft.idMap, [selected.id]: value }, resolutions: {} }); }}/>}</div>}</section>}
      <button className="button secondary" disabled={draft.busy || ownershipPending || !!ownershipError} onClick={() => void preview()}>復元の影響を確認</button>{stale && <p role="alert">確認後に対象作品が更新されました。入力を保持して影響を再確認してください。</p>}
      {draft.preview && <><p>確認した対象版 {draft.preview.target?.revision ?? '新規'} · 追加 {draft.preview.additions}件 · 差分 {draft.preview.conflicts.length}件</p>{draft.mode === 'replace' && draft.preview.pendingChanges > 0 && <p role="alert">未送信の変更が{draft.preview.pendingChanges}件あるため置換できません。</p>}{draft.preview.mappedPlan && <p>対応確認 {Object.keys(draft.preview.mappedPlan.idMap).length}件 · 素材提供 {draft.preview.mappedPlan.assets.provided.length}件／既存使用 {draft.preview.mappedPlan.assets.reused.length}件／不足 {draft.preview.mappedPlan.assets.missing.length}件 · 確認hash {draft.preview.confirmationHash}</p>}<ListPager {...conflicts} label="統合差分"/>{conflicts.items.map(conflict => <details key={conflict.id}><summary>同IDの差分 · {conflict.kind} · {labelOf(conflict.existing as Entity)}</summary><div className="conflict-comparison"><pre>{JSON.stringify(conflict.existing, null, 2)}</pre><pre>{JSON.stringify(conflict.incoming, null, 2)}</pre></div>{['merge', 'mapped_merge'].includes(draft.mode) && <select disabled={draft.busy} aria-label={`${conflict.id}の統合方法`} value={draft.resolutions[conflict.id] ?? ''} onChange={event => change({ resolutions: { ...draft.resolutions, [conflict.id]: event.target.value as 'existing' | 'incoming' } })}><option value="">採用する内容を選ぶ</option><option value="existing">現在の内容を残す</option><option value="incoming">ファイルの内容を採用</option></select>}</details>)}</>}
      <label className="check-label"><input type="checkbox" checked={draft.checked} disabled={draft.busy || blocked} onChange={event => update(key, { checked: event.target.checked })}/>復元方法と対象への影響を確認しました</label><div className="modal-actions"><button className="button secondary" disabled={draft.busy} onClick={() => { update(key, { prepared: undefined, preview: undefined, sourceHash: undefined, idMap: {}, resolutions: {}, checked: false }); void (writes.get(key) ?? Promise.resolve()).catch(() => {}).then(() => scenarioStore.clearImportDraft(key)); }}>中止</button><button className="button primary" disabled={draft.busy || blocked || !draft.checked} onClick={() => void commit()}>この内容で復元する</button></div>
    </div>}
  </section>;
}

registerAuthorCache(account=>{const prefix=account+":";for(const map of [drafts,writes,queuedFiles])for(const key of map.keys())if(key.startsWith(prefix))map.delete(key);});
registerAuthorBusy(account=>[...drafts].some(([key,value])=>key.startsWith(account+":")&&value.busy));
