import {PagedSelect} from './PagedSelect';
import {ListPager,useListWindow} from './ListWindow';
import { useEffect, useMemo, useState } from 'react';
import type { ContentAnchor, DisclosureData, Entity, EntityKind, ProjectData, Query, Relation, ResolutionPolicy, Status } from '../domain/types';
import { createEntity, KIND_LABELS, newId } from '../domain/model';
import { buildJapaneseAuthorIndex, evaluateCollection, filterCatalogEntities, findCatalogMaintenance,findCatalogMaintenanceVerified, searchJapaneseAuthorIndex } from '../domain/catalog';
import type {CatalogMaintenanceFinding} from '../domain/catalog';
import {requiresFixedStateUsageVerification} from '../domain/stateUsage';
import { previewMerge } from '../domain/maintenance';
import { EntityCards, KindPicker } from './Lists';
import { labelOf } from './Fields';
import { fieldText, Modal, STATUS_LABELS } from './components';
import { FIELD_SPECS } from './fieldSpecs';
import { JapaneseIndexEntryEditor } from './JapaneseIndexEntryEditor';
import type { JapaneseAuthorIndexEntry } from '../domain/catalog';
import { findCatalogTextPositions } from '../domain/catalogPositions';
import { CatalogResultDiagram, CatalogResultTimeline } from './CatalogResultViews';

export function CatalogPanel({ project, selectedId, onOpen, onSave, onSaveProject, onSaveMany, onSaveRelation, onOpenField, onOpenTarget, searchState, onSearchStateChange }: {
  onSaveRelation: (relation: Relation) => Promise<void>;
  onOpenTarget: (anchor: ContentAnchor, fieldPath?: string) => void;
  onSaveMany: (entities: Entity[], reason: string) => Promise<void>; onOpenField: (entityId: string, fieldPath: string) => void;
  searchState?: { text: string; kind: string; status: string }; onSearchStateChange?: (next: { text: string; kind: string; status: string }) => void;
  project: ProjectData; selectedId: string | null; onOpen: (id: string) => void;
  onSave: (entity: Entity) => Promise<Entity>; onSaveProject: (project: ProjectData, reason: string) => Promise<ProjectData>;
}) {
  const [resultView, setResultView] = useState<'cards' | 'table' | 'diagram' | 'timeline'>('cards');
  const [tab, setTab] = useState<'search' | 'index' | 'maintenance'>('search');
  const [verifiedMaintenance,setVerifiedMaintenance]=useState<{project:ProjectData;revision:string;findings:CatalogMaintenanceFinding[]}|null>(null);
  useEffect(()=>{
    if(tab!=='maintenance'||!requiresFixedStateUsageVerification(project))return;
    const revision=project.revision;
    let current=true;void findCatalogMaintenanceVerified(project).then(findings=>{if(current&&project.revision===revision)setVerifiedMaintenance({project,revision,findings});});
    return()=>{current=false;};
  },[tab,project,project.revision]);
  const [localSearch, setLocalSearch] = useState({ text: '', kind: 'all', status: 'all' });
  const { text, kind, status } = searchState ?? localSearch;
  const updateSearch = (change: Partial<typeof localSearch>) => { const next = { ...(searchState ?? localSearch), ...change }; if (onSearchStateChange) onSearchStateChange(next); else setLocalSearch(next); };
  const setText = (text: string) => updateSearch({ text });
  const setKind = (kind: string) => updateSearch({ kind });
  const setStatus = (status: string) => updateSearch({ status });
  const [indexEntry, setIndexEntry] = useState<JapaneseAuthorIndexEntry | null>(null);
  const [chapter, setChapter] = useState('');
  const [foreshadow, setForeshadow] = useState('');
  const [resolution, setResolution] = useState('');
  const [disclosureRole, setDisclosureRole] = useState('');
  const [disclosureStage, setDisclosureStage] = useState('');
  const [participant, setParticipant] = useState('');
  const [production, setProduction] = useState('all');
  const [bulkPage, setBulkPage] = useState(0);
  const [indexClass, setIndexClass] = useState('all');
  const [collectionId, setCollectionId] = useState('');
  const [collectionName, setCollectionName] = useState('');
  const [collectionMode, setCollectionMode] = useState<'fixed' | 'dynamic'>('dynamic');
  const [selected, setSelected] = useState<string[]>([]);
  const [bulkStatus, setBulkStatus] = useState<Status>('needs_review');
  const [preview, setPreview] = useState<{ project: ProjectData; reason: string; details: string[] } | null>(null);
  const [mergeSource, setMergeSource] = useState('');
  const [mergeTarget, setMergeTarget] = useState('');
  const [mergeFields, setMergeFields] = useState<Record<string, 'source' | 'survivor'>>({});
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState(false);
  const active = useMemo(()=>project.entities.filter(entity => !entity.deletedAt),[project.entities]);
  const query = useMemo<Query>(() => ({ op: 'all', children: [
    ...(text.trim() ? [{ op: 'text' as const, value: text }] : []),
    ...(kind !== 'all' ? [{ op: 'kind' as const, value: kind as EntityKind }] : []),
    ...(status !== 'all' ? [{ op: 'status' as const, value: status as Status }] : []),
    ...(participant ? [{ op: 'participant' as const, characterId: participant }] : []),
    ...(chapter ? [{ op: 'chapter' as const, chapterId: chapter }] : []),
    ...(foreshadow || resolution || disclosureRole || disclosureStage ? [{ op: 'foreshadow' as const, ...(foreshadow ? { foreshadowId: foreshadow } : {}), ...(resolution ? { resolutionPolicy: resolution as ResolutionPolicy } : {}), ...(disclosureRole ? { role: disclosureRole as 'clue' | 'payoff' } : {}), ...(disclosureStage ? { stage: disclosureStage as DisclosureData['stage'] } : {}) }] : []),
    ...(production !== 'all' ? [{ op: 'production' as const, value: production as 'todo' | 'doing' | 'done' | 'needs_review' }] : []),
  ] }), [text, kind, status, participant, chapter, foreshadow, resolution, disclosureRole, disclosureStage, production]);
  const effectiveQuery = useMemo<Query>(() => query.op === 'all' && !query.children.length ? { op: 'text', value: '' } : query, [query]);
  const collection = active.find((entity): entity is Entity<'collection'> => entity.id === collectionId && entity.kind === 'collection');
  const results = useMemo(() => collection ? evaluateCollection(project, collection).entities : filterCatalogEntities(project, effectiveQuery, active), [project, collection, effectiveQuery, active]);
  const textPositions = useMemo(() => findCatalogTextPositions(project, results, text), [project, results, text]);
  const index = useMemo(() => tab==='index'?buildJapaneseAuthorIndex(project):[], [project,tab]);
  const indexClasses = [...new Set(index.flatMap(entry => entry.classifications))];
  const indexResults = searchJapaneseAuthorIndex(index, text).filter(entry => indexClass === 'all' || entry.classifications.includes(indexClass));
  const findings = useMemo(() => tab==='maintenance'?(verifiedMaintenance?.project===project&&verifiedMaintenance.revision===project.revision?verifiedMaintenance.findings:findCatalogMaintenance(project)):[], [project,project.revision,tab,verifiedMaintenance]);
  const source = active.find(entity => entity.id === mergeSource);
  const survivor = active.find(entity => entity.id === mergeTarget);
  const fieldLabel = (field: string) => FIELD_SPECS[source?.kind ?? 'note']?.find(item => item.key === field)?.label ?? field;
  const displayValue = (value: unknown) => Array.isArray(value) ? fieldText(value) || `${value.length}件` : value == null ? '未設定' : typeof value === 'object' ? '詳細値' : String(value);
  const fields = source && survivor ? [...new Set([...Object.keys(source.data), ...Object.keys(survivor.data)])] : [];
  const run = async (action: () => Promise<void>) => { setBusy(true); setError(''); setNotice(''); try { await action(); } catch (failure) { setError((failure as Error).message); } finally { setBusy(false); } };
  const viewScope=`catalog:${project.projectId}:${text}:${kind}:${status}:${participant}:${chapter}:${foreshadow}:${resolution}:${disclosureRole}:${disclosureStage}:${production}:${collectionId}`;
  const positionPage=useListWindow({items:textPositions,scope:viewScope+':positions'}),tablePage=useListWindow({items:results,scope:viewScope+':table',selectedId}),indexPage=useListWindow({items:indexResults,scope:viewScope+':index:'+indexClass}),maintenancePage=useListWindow({items:findings,scope:viewScope+':maintenance'}),reviewPage=useListWindow({items:active.filter((entity):entity is Entity<'review'>=>entity.kind==='review'&&entity.customValues['changeReview.generatedBy']==='semantic-change-review/v1'),scope:viewScope+':reviews',selectedId});
  const clearCollection = () => { setCollectionId(''); setSelected([]); setBulkPage(0); };
  return <section className="search-page">
    <div className="section-tabs" role="tablist" aria-label="検索と整理">
      {([['search', '複合検索・一覧'], ['index', '五十音・分類索引'], ['maintenance', '見直しと統合']] as const).map(([key, label]) => <button key={key} role="tab" aria-selected={tab === key} className={tab === key ? 'active' : ''} onClick={() => { setTab(key); }}>{label}</button>)}
    </div>
    {error && <div className="error-notice" role="alert">{error}<p>入力と選択は保持されています。内容を確認して再試行してください。</p></div>}
    {notice && <p role="status">{notice}</p>}
    {tab !== 'maintenance' && <div className="form-field"><label htmlFor="catalog-search">作品内を検索</label><input id="catalog-search" value={text} onChange={event => { setText(event.target.value); clearCollection(); }} placeholder="名前・読み・別名・本文"/></div>}
    {tab === 'search' && <>
      <div className="list-toolbar"><KindPicker value={kind} all onChange={value => { setKind(value); clearCollection(); }}/>
        <select aria-label="情報の状態で絞り込む" value={status} onChange={event => { setStatus(event.target.value); clearCollection(); }}><option value="all">すべての状態</option>{Object.entries(STATUS_LABELS).map(([value, label]) => <option value={value} key={value}>{label}</option>)}</select>
        <PagedSelect label="参加人物で絞り込む" scope={`catalog:${project.projectId}:participant`} value={participant} items={active.filter(e=>e.kind==='character').map(e=>({id:e.id,label:labelOf(e)}))} emptyLabel="すべての参加人物" onChange={value=>{setParticipant(value);clearCollection();}}/>
        <select aria-label="制作進捗で絞り込む" value={production} onChange={event => { setProduction(event.target.value); clearCollection(); }}><option value="all">すべての制作進捗</option><option value="todo">未着手</option><option value="doing">作業中</option><option value="done">完了</option><option value="needs_review">確認待ち</option></select>
        <PagedSelect label="章で絞り込む" scope={`catalog:${project.projectId}:chapter`} value={chapter} items={active.filter(e=>e.kind==='chapter').map(e=>({id:e.id,label:labelOf(e)}))} emptyLabel="すべての章" onChange={value=>{setChapter(value);clearCollection();}}/>
        <PagedSelect label="伏線で絞り込む" scope={`catalog:${project.projectId}:foreshadow`} value={foreshadow} items={active.filter(e=>e.kind==='foreshadow').map(e=>({id:e.id,label:labelOf(e)}))} emptyLabel="すべての伏線" onChange={value=>{setForeshadow(value);clearCollection();}}/>
        <select aria-label="伏線の回収方針" value={resolution} onChange={event => { setResolution(event.target.value); clearCollection(); }}><option value="">すべての回収方針</option>{([['this_work','本作で回収'],['sequel','続編で回収'],['intentional_open','意図的に未回収'],['red_herring','ミスリード'],['undecided','未決定'],['rejected','不採用']] as const).map(([value,label]) => <option key={value} value={value}>{label}</option>)}</select>
        <select aria-label="手掛かり・回収の役割" value={disclosureRole} onChange={event => { setDisclosureRole(event.target.value); clearCollection(); }}><option value="">すべての役割</option><option value="clue">手掛かり</option><option value="payoff">回収</option></select>
        <select aria-label="提示段階で絞り込む" value={disclosureStage} onChange={event => { setDisclosureStage(event.target.value); clearCollection(); }}><option value="">すべての提示段階</option>{([['hint','示唆'],['suspicion','疑念'],['reinforce','補強'],['reveal','開示'],['alternative','別案']] as const).map(([value,label]) => <option value={value} key={value}>{label}</option>)}</select>
      </div>
      <PagedSelect label="保存した一覧を再表示" scope={`catalog:${project.projectId}:collections`} value={collectionId} items={active.filter(e=>e.kind==='collection').map(e=>({id:e.id,label:labelOf(e)}))} emptyLabel="現在の検索条件" onChange={value=>{setCollectionId(value);setSelected([]);}}/>
      {collection && evaluateCollection(project, collection).missingIds.length > 0 && <p role="status">固定一覧に削除・不明の参照があります。既存の情報だけ表示しています。</p>}
      <div className="form-row"><div className="form-field"><label htmlFor="catalog-name">一覧の名前</label><input id="catalog-name" value={collectionName} onChange={event => setCollectionName(event.target.value)}/></div><div className="form-field"><label htmlFor="catalog-mode">保存する内容</label><select id="catalog-mode" value={collectionMode} onChange={event => setCollectionMode(event.target.value as 'dynamic' | 'fixed')}><option value="dynamic">条件に合わせて変わる一覧</option><option value="fixed">今の結果を固定した一覧</option></select></div></div>
      <button className="button secondary" disabled={busy || !collectionName.trim()} onClick={() => void run(async () => { const saved = await onSave(createEntity(project.projectId, 'collection', collectionName.trim(), { mode: collectionMode, query: collectionMode === 'dynamic' ? collection?.data.query ?? effectiveQuery : null, memberIds: collectionMode === 'fixed' ? results.map(entity => entity.id) : [], sort: { field: 'name', direction: 'asc' } })); setCollectionId(saved.id); setNotice('一覧を保存しました。'); })}>一覧を保存</button>
      <div className="list-heading"><h2>検索結果</h2><span>{results.length}件</span></div>
      <details><summary>結果をまとめて編集</summary><p>選択した対象の変更差分を確認し、一度に保存します。保存後は作品の変更履歴から取り消せます。</p>
        <button className="button secondary small" onClick={() => setSelected(results.map(entity => entity.id))}>結果をすべて選択</button><button className="button secondary small" onClick={() => setSelected([])}>選択を解除</button>
        {results.slice(bulkPage * 60, (bulkPage + 1) * 60).map(entity => <label className="check-label" key={entity.id}><input type="checkbox" checked={selected.includes(entity.id)} onChange={event => setSelected(ids => event.target.checked ? [...ids, entity.id] : ids.filter(id => id !== entity.id))}/>{labelOf(entity)}</label>)}
        <div className="pagination"><button className="button secondary small" disabled={bulkPage === 0} onClick={() => setBulkPage(value => value - 1)}>前の選択一覧</button><span>{bulkPage + 1} / {Math.max(1, Math.ceil(results.length / 60))}</span><button className="button secondary small" disabled={(bulkPage + 1) * 60 >= results.length} onClick={() => setBulkPage(value => value + 1)}>次の選択一覧</button></div>
        <select aria-label="まとめて設定する状態" value={bulkStatus} onChange={event => setBulkStatus(event.target.value as Status)}>{Object.entries(STATUS_LABELS).map(([value, label]) => <option value={value} key={value}>{label}</option>)}</select>
        <button className="button primary" disabled={busy || !selected.length} onClick={() => setPreview({ project: { ...project, entities: project.entities.map(entity => selected.includes(entity.id) ? { ...entity, status: bulkStatus } : entity) }, reason: '一覧から情報の状態を一括変更', details: active.filter(entity => selected.includes(entity.id)).map(entity => `${labelOf(entity)}: ${STATUS_LABELS[entity.status]} → ${STATUS_LABELS[bulkStatus]}`) })}>変更差分を確認</button>
      </details>
      {textPositions.length > 0 && <section aria-label="本文の検索位置"><h3>一致した文章の位置 · {textPositions.length}件</h3>{positionPage.items.map(hit => <button key={hit.id} className="reference-link" type="button" onClick={() => onOpenTarget(hit.anchor, hit.fieldPath)}><strong>{hit.name || '無題'}</strong> · {FIELD_SPECS[active.find(entity => entity.id === hit.entityId)?.kind ?? 'note'].find(field => `data.${field.key}` === hit.fieldPath)?.label ?? '文章'}<span>{Array.from(hit.text).slice(Math.max(0, (hit.anchor.start ?? 0) - 12), (hit.anchor.end ?? 0) + 24).join('')}</span></button>)}<ListPager {...positionPage} label="本文の検索位置"/></section>}
      <div className="filter-pills" aria-label="検索結果の表示">{([['cards', 'カード'], ['table', '表'], ['diagram', '図'], ['timeline', '年表']] as const).map(([view, label]) => <button key={view} type="button" aria-pressed={resultView === view} className={resultView === view ? 'active' : ''} onClick={() => setResultView(view)}>{label}</button>)}</div>
      {resultView === 'cards' && <EntityCards entities={results} project={project} selectedId={selectedId} onSelect={onOpen}/>}
      {resultView === 'table' && <><div className="table-scroll"><table><caption>同じ検索結果の一覧</caption><thead><tr><th>名前</th><th>種類</th><th>状態</th><th>操作</th></tr></thead><tbody>{tablePage.items.map(entity => <tr key={entity.id}><td>{labelOf(entity)}</td><td>{KIND_LABELS[entity.kind]}</td><td>{STATUS_LABELS[entity.status]}</td><td><button type="button" className="text-button" onClick={() => onOpen(entity.id)}>詳細を開く</button></td></tr>)}</tbody></table></div><ListPager {...tablePage} label="検索結果表"/></>}
      {resultView === 'diagram' && <CatalogResultDiagram project={project} results={results} selectedId={selectedId} scope={viewScope} onOpen={onOpen} onSaveRelation={onSaveRelation}/>}
      {resultView === 'timeline' && <CatalogResultTimeline project={project} results={results} selectedId={selectedId} scope={viewScope} onOpen={onOpen}/>}
    </>}
    {tab === 'index' && <><PagedSelect label="索引の分類" scope={`catalog:${project.projectId}:index-class`} value={indexClass === 'all' ? '' : indexClass} onChange={id => setIndexClass(id || 'all')} emptyLabel="すべての分類" items={indexClasses.map(label => ({ id: label, label }))}/><p>同じ名前は種類と固定IDで選び分けられます。読みが未登録の項目は、見直し一覧から補えます。</p>{indexPage.items.map((entry, position) => <button className="reference-link" key={`${entry.entityId}-${position}`} onClick={() => setIndexEntry(entry)}>{entry.term}<small>{entry.reading} · {entry.classifications.join('、')} · {KIND_LABELS[entry.kind]} · {entry.entityId.slice(0, 8)}</small></button>)}<ListPager {...indexPage} label="五十音索引"/></>}
    {tab === 'maintenance' && <>
      <p>候補は自動判定の結論ではありません。参照元と変更理由を確認して扱ってください。</p>
      {maintenancePage.items.map(finding => <article key={finding.id}><p>{finding.reason}</p>{finding.targetIds.map(id => { const target = active.find(entity => entity.id === id); return <div key={id}><button className="reference-link" onClick={() => onOpen(id)}>{labelOf(target)}</button>{target && ['unreferenced', 'retained'].includes(finding.kind) && <button type="button" className="button secondary small" disabled={busy} onClick={() => void run(async () => { await onSaveMany([{ ...target, retainIfUnreferenced: !target.retainIfUnreferenced }], target.retainIfUnreferenced ? '背景情報の保持指定を解除' : '背景情報・外部利用のため保持を指定'); setNotice('保持指定を保存しました。'); })}>{target.retainIfUnreferenced ? '保持指定を解除' : '背景情報として保持'}</button>}{target && finding.kind === 'external_use' && <button type="button" className="text-button" onClick={() => onOpenField(target.id, 'data.externalUseDeclared')}>外部利用宣言を確認</button>}</div>; })}</article>)}
      <ListPager {...maintenancePage} label="見直し候補"/>
      <h2>変更による見直し</h2><p>直接参照と作者が定めた意味上の関係を根拠として示します。内容は自動修正しません。</p>
      {reviewPage.items.map(review => <article key={review.id}><h3>{labelOf(review)} · {review.data.stage === 'open' ? '確認待ち' : review.data.stage === 'fixed' ? '対応済み' : '再確認済み'}</h3><p>{fieldText(review.data.body)}</p><button type="button" className="reference-link" onClick={() => { const target = review.data.target; if (typeof target === 'string') onOpen(target); else onOpenTarget(target); }}>見直す箇所を開く</button><select aria-label={`${labelOf(review)}の対応状態`} value={review.data.stage} disabled={busy} onChange={event => { const stage = event.target.value as Entity<'review'>['data']['stage']; void run(async () => { await onSave({ ...review, data: { ...review.data, stage } }); setNotice('見直しの対応状態を保存しました。'); }); }}><option value="open">確認待ち</option><option value="fixed">対応済み</option><option value="verified">再確認済み</option></select><button type="button" className="text-button" onClick={() => onOpen(review.id)}>理由と解決内容を編集</button></article>)}
      <ListPager {...reviewPage} label="変更による見直し"/>
      <h2>同じ種類の情報を統合</h2><p>残すIDと採用する項目を選んでください。公開済みの版は保持されます。</p>
      <PagedSelect label="統合する情報" scope={`catalog:${project.projectId}:merge-source`} value={mergeSource} items={active.map(entity=>({id:entity.id,label:KIND_LABELS[entity.kind]+' · '+labelOf(entity)}))} emptyLabel="統合元を選択" onChange={value=>{setMergeSource(value);setMergeTarget('');setMergeFields({});}}/>
      <PagedSelect label="統合後に残す情報" scope={`catalog:${project.projectId}:merge-target:${source?.kind??''}`} value={mergeTarget} items={active.filter(entity=>source&&entity.kind===source.kind&&entity.id!==source.id).map(entity=>({id:entity.id,label:labelOf(entity)+' · '+entity.id.slice(0,8)}))} emptyLabel="残すIDを選択" onChange={value=>{setMergeTarget(value);setMergeFields({});}}/>
      {fields.map(field => <div className="form-field" key={field}><label>{fieldLabel(field)}</label><select aria-label={`${fieldLabel(field)}の採用元`} value={mergeFields[field] ?? 'survivor'} onChange={event => setMergeFields(previous => ({ ...previous, [field]: event.target.value as 'source' | 'survivor' }))}><option value="survivor">残す情報の値</option><option value="source">統合元の値</option></select></div>)}
      <button className="button primary" disabled={busy || !source || !survivor} onClick={() => { try { const result = previewMerge(project, { sourceId: mergeSource, survivorId: mergeTarget, fields: mergeFields, operationId: newId(), deletedAt: new Date().toISOString() }); setPreview({ project: result.project, reason: '重複情報の統合', details: [`残すID: ${mergeTarget}`, ...result.changes.map(change => `${fieldLabel(change.field)}: ${displayValue(change.from)} → ${displayValue(change.to)}`), ...result.impact.map(impact => `${impact.sourceName} (${impact.path}${impact.snapshotId ? '・保存版は変更しない' : '・参照を書換え'})`)] }); setError(''); } catch (failure) { setError((failure as Error).message); } }}>統合差分を確認</button>
    </>}
    {indexEntry && <Modal title="索引の項目を編集" wide onClose={() => setIndexEntry(null)}><JapaneseIndexEntryEditor project={project} entry={indexEntry} onSaveMany={onSaveMany} onOpenField={onOpenField} onClose={() => setIndexEntry(null)}/></Modal>}
    {preview && <Modal title="変更差分の確認" onClose={() => { if (!busy) setPreview(null); }}><p>版 {preview.project.revision} の内容から確定します。途中で版が変わった場合は再確認が必要です。</p><ul>{preview.details.map((detail, index) => <li key={index}>{detail}</li>)}</ul><div className="modal-actions"><button className="button secondary" disabled={busy} onClick={() => setPreview(null)}>中止</button><button className="button primary" disabled={busy} onClick={() => void run(async () => { await onSaveProject(preview.project, preview.reason); setPreview(null); setSelected([]); setNotice('一括変更を保存しました。変更履歴から取り消せます。'); })}>差分を確定して保存</button></div></Modal>}
  </section>;
}
