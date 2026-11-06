import { useMemo, useState } from 'react';
import {ReaderReturnControls} from './ReaderReturnControls';
import type { ReaderOutput } from '../domain/exports';
import { renderReaderHtml } from '../domain/exports';
import { buildPublicCatalogIndex, buildPublicReaderPages, publicReaderEntityLabel, searchPublicCatalogIndex } from '../domain/publicCatalog';
import { PagedSelect } from './PagedSelect';
import { WindowedList } from './WindowedList';

/** No author project, source ID map, omissions or diagnostics cross this boundary. */
export function ReaderProjectionPreview({ output }: { output: ReaderOutput }) {
  const pages = useMemo(() => buildPublicReaderPages(output.projection), [output]);
  const [selected, setSelected] = useState(pages[0].id), [query, setQuery] = useState(''),[observationTarget,setObservationTarget]=useState('');
  const index = Math.max(0, pages.findIndex(page => page.id === selected)), page = pages[index];
  const shownScenes=page.projection.entities.filter(entity=>entity.kind==='scene'),observedScene=shownScenes.find(entity=>entity.id===observationTarget)?.id??shownScenes[0]?.id;
  const catalog = useMemo(() => buildPublicCatalogIndex(output.projection), [output]);
  const entries = useMemo(() => searchPublicCatalogIndex(catalog, query), [catalog, query]);
  const html = useMemo(() => renderReaderHtml(page.projection, output.versionLabel), [page, output.versionLabel]);
  const names = new Map(output.projection.entities.map(entity => [entity.id, entity.name]));
  const relations = output.projection.relations.filter(relation => names.has(relation.fromId) && names.has(relation.toId));
  return <section aria-label="読者用の全章プレビュー">
    <p>{output.projection.title} · 対象版: {output.versionLabel}</p>
    <PagedSelect label="読者用の章" scope="reader-public-pages" items={pages.map(page => ({ id: page.id, label: page.title }))} value={page.id} onChange={setSelected}/>
    <div className="backup-actions"><button className="button secondary" disabled={index === 0} onClick={() => setSelected(pages[index - 1].id)}>前の章</button><span>{index + 1} / {pages.length}</span><button className="button secondary" disabled={index === pages.length - 1} onClick={() => setSelected(pages[index + 1].id)}>次の章</button></div>
    <iframe title="読者用の本文" sandbox="" srcDoc={html} style={{ width: '100%', height: '60vh', minHeight: 280, border: '1px solid var(--border)' }}/>
    <PagedSelect label="控える公開場面" scope="reader-public-observation" value={observedScene??''} items={shownScenes.map(entity=>({id:entity.id,label:entity.name}))} onChange={setObservationTarget}/><ReaderReturnControls projection={output.projection} publicScene={observedScene}/><details><summary>五十音・分類索引</summary><label>索引を検索<input aria-label="読者用の索引を検索" value={query} onChange={event => setQuery(event.target.value)}/></label><WindowedList items={entries} scope={`reader-public-index:${query}`} label="読者用の索引" render={entry => <p><button className="text-button" onClick={() => { const target = pages.find(page => page.projection.entities.some(entity => entity.id === entry.entityId)); if (target) setSelected(target.id); }}>{entry.term}</button>{entry.reading && ` · ${entry.reading}`}{entry.classifications.length > 0 && ` · ${entry.classifications.join('、')}`}</p>}/></details>
    <details><summary>公開された関係</summary><WindowedList items={relations} scope="reader-public-relations" label="公開された関係" render={relation => <p>{names.get(relation.fromId)} · {relation.relationType} · {names.get(relation.toId)}</p>}/></details>
    <details><summary>公開された素材名</summary><WindowedList items={output.projection.entities.filter(entity => entity.kind === 'attachment')} scope="reader-public-assets" label="公開された素材名" render={entity => <p>{publicReaderEntityLabel(entity)}</p>}/></details>
  </section>;
}
