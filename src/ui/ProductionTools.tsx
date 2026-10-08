import {registerAuthorCache,registerAuthorBusy} from './StoreContext';
import {useScenarioStore,useAuthorScope,storeForAuthorScope} from './StoreContext';
import { useEffect, useSyncExternalStore } from 'react';
import type { Entity, ProjectData } from '../domain/types';
import { previewDialogueChange, confirmDialogueChange, previewSourceApproval, confirmSourceApproval, type DialogueChangePlan } from '../domain/productionWorkflow';
import { previewMaterial, confirmMaterial, materialUsers, type MaterialPlan } from '../domain/materials';
import { prepareAsset, type PreparedAsset } from '../domain/attachments';
import { type AssetInput, type AuthorToolDraft } from '../storage';
import { labelOf, RichTextView } from './Fields';
import { PagedSelect } from './PagedSelect';
import { ListPager, useListWindow } from './ListWindow';

type Input = { mode: 'split' | 'merge' | 'copy'; blockId: string; offset: string; mergeIds: string[]; reason: string; mediaType: string; replaceIds: string[]; fileName: string };
type Draft = { input: Input; baseRevision: string; ready: boolean; busy: boolean; error: string; notice: string; asset?: PreparedAsset; dialogue?: DialogueChangePlan; approval?: Awaited<ReturnType<typeof previewSourceApproval>>; material?: MaterialPlan; saved?: { revision: string; entity: Entity } };
const drafts = new Map<string, Draft>(), listeners = new Set<() => void>(), writes = new Map<string, Promise<void>>(), queuedFiles = new Map<string, File>();
const subscribe = (listener: () => void) => { listeners.add(listener); return () => listeners.delete(listener); };
function load(key: string, project: ProjectData, entity: Entity): Draft {
  let draft = drafts.get(key);
  if (!draft) { draft = { input: { mode: 'split', blockId: entity.kind === 'dialogue_line' ? entity.data.text[0]?.id ?? '' : '', offset: '', mergeIds: [entity.id], reason: '', mediaType: '', replaceIds: [], fileName: '' }, baseRevision: project.revision, ready: false, busy: false, error: '', notice: '' }; drafts.set(key, draft); }
  return draft;
}
function update(key: string, patch: Partial<Draft>) { drafts.set(key, { ...drafts.get(key)!, ...patch }); listeners.forEach(listener => listener()); }
function store(key: string, projectId: string) {const scenarioStore=storeForAuthorScope(key);
  const draft = drafts.get(key)!;
  const submitted: AuthorToolDraft = { key, projectId, baseRevision: draft.baseRevision, fields: structuredClone(draft.input), ...(draft.asset ? { asset: { bytes: draft.asset.bytes, contentHash: draft.asset.contentHash } } : {}) };
  const write = (writes.get(key) ?? Promise.resolve()).catch(() => {}).then(() => scenarioStore.saveAuthorToolDraft(submitted)).catch(cause => update(key, { error: `制作入力の一時保存に失敗しました。画面内の入力は保持しています。${(cause as Error).message}` })); writes.set(key, write);
}
export function ProductionTools({ project, entity, disabled, onSaveProject, onBusy, onApplied, onOpen }: { project: ProjectData; entity: Entity; disabled: boolean; onSaveProject: (project: ProjectData, reason: string, assets?: AssetInput[]) => Promise<ProjectData>; onBusy: (busy: boolean) => void; onApplied: (entity: Entity) => void; onOpen: (id: string) => void }) {
  const scenarioStore=useScenarioStore();
  const key = useAuthorScope(`production:v1:${project.projectId}:${entity.id}`), draft = useSyncExternalStore(subscribe, () => load(key, project, entity));
  const current = project.entities.find(record => record.id === entity.id) ?? entity;
  const approvalSource = current.kind === 'localization' || current.kind === 'recording' ? project.entities.find(record => record.id === current.data.sourceLineId && record.kind === 'dialogue_line') as Entity<'dialogue_line'> | undefined : undefined;
  const stale = !!(draft.dialogue || draft.approval || draft.material) && project.revision !== (draft.dialogue?.baseRevision ?? draft.approval?.baseRevision ?? draft.material?.baseRevision);
  const users = entity.kind === 'attachment' ? materialUsers(project, entity.id) : [], userPage = useListWindow({ items: users, scope: `${key}:material-users` });
  const lineage = entity.kind === 'dialogue_line' ? entity.data.lineage?.segments ?? [] : [], lineagePage = useListWindow({ items: lineage.map((segment,index) => ({ id: `${index}`, segment })), scope: `${key}:lineage` });
  const choices = project.entities.filter(record => record.kind === 'dialogue_line' && !record.deletedAt && !['rejected','alternate'].includes(record.status) && !draft.input.mergeIds.includes(record.id)).map(record => ({ id: record.id, label: labelOf(record) }));
  useEffect(() => { const retained = drafts.get(key)!; if (retained.ready || retained.busy) return; update(key, { busy: true }); void scenarioStore.getAuthorToolDraft(key).then(async stored => {if(!stored&&key.startsWith('guest:')){const old=await scenarioStore.getAuthorToolDraft(key.slice(6));if(old){stored={...old,key};await scenarioStore.saveAuthorToolDraft(stored);await scenarioStore.clearAuthorToolDraft(key.slice(6));}}
    if (!stored) return;
    const input = stored.fields as Input;
    if (!['split','merge','copy'].includes(input.mode) || !Array.isArray(input.mergeIds) || !Array.isArray(input.replaceIds) || typeof input.reason !== 'string' || stored.projectId !== project.projectId) throw new Error('制作入力の保存形式を確認できません。作品データは変更していません。');
    const asset = stored.asset ? await prepareAsset(stored.asset.bytes, input.fileName, input.mediaType || undefined) : undefined;
    if (asset && asset.contentHash !== stored.asset!.contentHash) throw new Error('保持した素材bytesのhashが一致しません。');
    update(key, { input, baseRevision: stored.baseRevision, asset, notice: '制作入力を再開しました。現在版の影響を確認してから保存してください。' });
  }).catch(cause => update(key, { error: (cause as Error).message })).finally(() => update(key, { ready: true, busy: false })); }, [key]);
  useEffect(() => { onBusy(draft.busy || !draft.ready); }, [key,draft.busy,draft.ready]);
  useEffect(() => { if (!draft.saved || BigInt(project.revision) < BigInt(draft.saved.revision)) return; const stored = project.entities.find(record => record.id === entity.id); if (!stored || stored.revision !== draft.saved.entity.revision) return; onApplied(stored); const retained=drafts.get(key)!; update(key, { busy: false, saved: undefined, dialogue: undefined, approval: undefined, material: undefined, asset:undefined, input:{...retained.input,reason:'',offset:'',replaceIds:[],fileName:''},baseRevision:project.revision,notice: '確認した変更を端末内に保存し、表示版を確認しました。' }); const clear=(writes.get(key)??Promise.resolve()).catch(()=>{}).then(()=>scenarioStore.clearAuthorToolDraft(key)).catch(cause=>update(key,{error:`完了した制作入力の消去に失敗しました。保存結果は保持しています。${(cause as Error).message}`}));writes.set(key,clear); }, [key,project.revision,draft.saved]);
  useEffect(()=>{if(disabled||draft.busy||!draft.ready)return;const next=queuedFiles.get(key);if(next){queuedFiles.delete(key);void file(next);}},[key,disabled,draft.busy,draft.ready]);
  const change = (patch: Partial<Input>) => { update(key, { input: { ...drafts.get(key)!.input, ...patch }, dialogue: undefined, approval: undefined, material: undefined, error: '', notice: '' }); store(key, project.projectId); };
  async function run(task: () => Promise<void>) { if (disabled || drafts.get(key)!.busy || !drafts.get(key)!.ready) return; update(key, { busy: true, error: '', notice: '' }); try { await (writes.get(key) ?? Promise.resolve()); await task(); } catch (cause) { update(key, { error: (cause as Error).message }); } finally { if (!drafts.get(key)!.saved) update(key, { busy: false }); } }
  const preview = () => run(async () => {
    const value = drafts.get(key)!, input = value.input;
    if (entity.kind === 'dialogue_line') update(key, { dialogue: await previewDialogueChange(project, input.mode === 'copy' ? {mode:'copy',sourceIds:[entity.id],reason:input.reason} : input.mode === 'split' ? { mode:'split',sourceIds:[entity.id],blockId:input.blockId,offset:Number(input.offset),reason:input.reason } : { mode:'merge',sourceIds:input.mergeIds,reason:input.reason }), baseRevision: project.revision });
    else if (entity.kind === 'localization' || entity.kind === 'recording') update(key, { approval: await previewSourceApproval(project, entity.id), baseRevision: project.revision });
    else if (value.asset) update(key, { material: await previewMaterial(project, value.asset, entity.kind === 'attachment' ? entity.id : undefined, entity.kind === 'attachment' ? input.replaceIds : [], entity.kind==='source'?entity.id:undefined), baseRevision: project.revision });
  });
  const save = () => run(async () => {
    const value = drafts.get(key)!; if (stale) throw new Error('REVISION_CONFLICT: 確認後に作品が更新されました。入力を保持して再確認してください。');
    let candidate: ProjectData, assets: AssetInput[] | undefined;
    if (value.dialogue) candidate = await confirmDialogueChange(project, value.dialogue);
    else if (value.approval) candidate = await confirmSourceApproval(project, value.approval);
    else if (value.material) { candidate = await confirmMaterial(project, value.material); assets = [value.material.asset]; }
    else return;
    const saved = await onSaveProject(candidate, value.dialogue ? `台詞の${value.dialogue.request.mode === 'split' ? '分割' : value.dialogue.request.mode === 'copy' ? '独立複製' : '統合'}と旧→新ID対応を保存` : value.approval ? '現在原文hashの確認を保存' : '素材bytes・新版・選択した確認先を保存', assets);
    const stored = saved.entities.find(record => record.id === entity.id); if (!stored) throw new Error('保存した対象を確認できません。'); update(key, { saved: { revision:saved.revision,entity:stored } });
  });
  async function file(file: File) { if(drafts.get(key)!.busy||!drafts.get(key)!.ready||disabled){queuedFiles.set(key,file);update(key,{notice:'後から選んだ素材を保持しました。現在の保存・表示確認後に検査します。'});return;} await run(async () => { if (file.size > 32*1024*1024) throw new Error('IMPORT_LIMIT: 素材は32 MiB以下で選んでください。'); const asset = await prepareAsset(new Uint8Array(await file.arrayBuffer()), file.name, drafts.get(key)!.input.mediaType || undefined); update(key, { asset,input:{...drafts.get(key)!.input,fileName:file.name},material:undefined }); store(key,project.projectId); }); }
  const isLine = entity.kind === 'dialogue_line', isApproval = entity.kind === 'localization' || entity.kind === 'recording';
  return <details className="settings-card production-tools"><summary>{isLine ? '台詞の分割・統合とID対応' : isApproval ? '現在原文の確認' : '素材の追加・版差替え'}</summary><fieldset disabled={disabled || draft.busy || !draft.ready}>
    {isLine && <><label>台詞の変更方法<select aria-label="台詞の変更方法" value={draft.input.mode} onChange={event=>change({mode:event.target.value as Input['mode']})}><option value="split">一つの台詞を分割</option><option value="merge">複数の台詞を統合</option><option value="copy">独立した台詞へ複製</option></select></label>{draft.input.mode === 'split' && entity.kind === 'dialogue_line' ? <><PagedSelect label="分割する段落" scope={`${key}:blocks`} items={entity.data.text.map(block=>({id:block.id,label:block.text.slice(0,80)}))} value={draft.input.blockId} onChange={blockId=>change({blockId})}/><label>分割する文字位置<input aria-label="分割する文字位置" inputMode="numeric" value={draft.input.offset} onChange={event=>change({offset:event.target.value})}/></label><p className="field-hint">先頭から数えた文字数です。絵文字も1文字として数えます。ルビ・リンクの途中は分割できません。</p></> : draft.input.mode === 'copy' ? <p>新しい台詞・段落・演出IDを作成し、元台詞への対応を保持します。元の場面と翻訳・収録の対応は変更しません。</p> : <><ol>{draft.input.mergeIds.map((id,index)=><li key={id}>{labelOf(project.entities.find(record=>record.id===id))}<button type="button" onClick={()=>change({mergeIds:draft.input.mergeIds.filter(value=>value!==id)})} disabled={index===0}>除く</button>{index>1 && <button type="button" onClick={()=>{const ids=[...draft.input.mergeIds];[ids[index-1],ids[index]]=[ids[index],ids[index-1]];change({mergeIds:ids});}}>前へ</button>}</li>)}</ol><PagedSelect label="統合する台詞を追加" scope={`${key}:merge`} items={choices} value="" onChange={id=>{if(id)change({mergeIds:[...draft.input.mergeIds,id]});}}/></>}<label>台詞変更の理由<input aria-label="台詞変更の理由" value={draft.input.reason} onChange={event=>change({reason:event.target.value})}/></label></>}
    {isApproval && <><p>現在の採用台詞を表示して、原文hashに翻訳・収録を対応させます。原文を差し替える保存は行いません。</p>{(entity.kind === 'localization' || entity.kind === 'recording') && <button type="button" onClick={()=>onOpen(entity.data.sourceLineId)}>対応する原台詞を開く</button>}</>}
    {!isLine && !isApproval && <><label>資料・素材の形式<select aria-label="資料・素材の形式" value={draft.input.mediaType} onChange={event=>{update(key,{asset:undefined});change({mediaType:event.target.value});}}><option value="">画像・音声・動画・PDFを内容で判定</option><option value="text/plain">UTF-8文章（ファイル保存で確認）</option><option value="application/json">JSON（ファイル保存で確認）</option><option value="application/octet-stream">その他の資料（ファイル保存で確認）</option></select></label><label className="button secondary file-button">素材ファイルを選ぶ<input type="file" aria-label="素材ファイルを選ぶ" onChange={event=>{const value=event.target.files?.[0];if(value)void file(value);event.target.value='';}}/></label>{draft.asset && <p>選択素材 {draft.input.fileName} · {draft.asset.byteSize} bytes · SHA-256 {draft.asset.contentHash}</p>}{entity.kind === 'attachment' && <><p>旧素材と旧公開版を保持して、新IDの素材を作成します。差替える参照先だけを選んでください。</p>{userPage.items.map(user=><label className="check-label" key={user.id}><input type="checkbox" checked={draft.input.replaceIds.includes(user.id)} onChange={event=>change({replaceIds:event.target.checked?[...draft.input.replaceIds,user.id]:draft.input.replaceIds.filter(id=>id!==user.id)})}/>{labelOf(user)}</label>)}<ListPager {...userPage} label="素材の確認先"/></>}</>}
    <button type="button" className="button secondary" disabled={isLine ? !draft.input.reason.trim() || draft.input.mode==='split' && draft.input.offset==='' : !isApproval && !draft.asset} onClick={()=>void preview()}>{isApproval?'現在原文とhashを確認':'変更の影響を確認'}</button>
    {draft.dialogue && <><p>確認版 {draft.dialogue.baseRevision} · 新台詞 {draft.dialogue.newLineIds.length}件</p>{draft.dialogue.newLineIds.map(id=>{const line=draft.dialogue!.candidate.entities.find(record=>record.id===id);return line?.kind==='dialogue_line'?<div key={id}><strong>{line.name} · {id}</strong><RichTextView value={line.data.text}/></div>:null;})}{draft.dialogue.warnings.map(warning=><p key={warning} className="info-notice">{warning}</p>)}<p>{draft.dialogue.request.mode==='copy'?'元の翻訳・収録対応を保持します。新しい台詞の成果物を別に登録してください。':'翻訳・収録の旧対応は保持し、確認待ちになります。新台詞のIDへ対応を付け直して原文を確認してください。'}</p></>}
    {draft.approval && <><p>確認版 {draft.approval.baseRevision} · 原台詞 {draft.approval.sourceLineId} · 原文hash {draft.approval.sourceHash}</p><RichTextView value={approvalSource?.data.text ?? []}/></>}
    {draft.material && <p>確認版 {draft.material.baseRevision} · 新素材ID {draft.material.newAttachmentId} · 差替える参照 {draft.material.replacementIds.length}件。演出・収録・媒体の確認状態も同じ保存で更新します。</p>}
    {(draft.dialogue||draft.approval||draft.material) && <><button type="button" className="button primary" disabled={stale} onClick={()=>void save()}>確認した変更を保存</button><button type="button" className="button secondary" onClick={()=>update(key,{dialogue:undefined,approval:undefined,material:undefined})}>差分確認を取り消す</button></>}
  </fieldset>{stale && <p role="alert">確認後に作品が更新されました。入力を保持して影響を再確認してください。</p>}{draft.baseRevision!==project.revision && !draft.dialogue&&!draft.material&&!draft.approval && <p className="field-hint">入力の基底版 {draft.baseRevision} · 現在版 {project.revision}。再確認で現在の内容と照合します。</p>}{draft.busy && <p role="status">制作変更を確認・保存中…</p>}{draft.error && <p role="alert">{draft.error}</p>}{draft.notice && <p role="status">{draft.notice}</p>}
    {entity.kind==='dialogue_line' && (entity.data.replacedByLineIds?.length || lineage.length) ? <><p>元台詞と新台詞の対応</p>{entity.data.replacedByLineIds?.map(id=><button className="text-button" type="button" key={id} onClick={()=>onOpen(id)}>{labelOf(project.entities.find(record=>record.id===id))}を開く</button>)}{lineagePage.items.map(({id,segment})=><p key={id}><button type="button" className="text-button" onClick={()=>onOpen(segment.source.entityId)}>元 {segment.source.entityId}</button> → {segment.target.entityId} · 文字 {segment.source.start??0}〜{segment.source.end??'段落末'}</p>)}<ListPager {...lineagePage} label="台詞ID対応"/></>:null}
  </details>;
}

registerAuthorCache(account=>{const prefix=account+":";for(const map of [drafts,writes,queuedFiles])for(const key of map.keys())if(key.startsWith(prefix))map.delete(key);});
registerAuthorBusy(account=>[...drafts].some(([key,value])=>key.startsWith(account+":")&&value.busy));
