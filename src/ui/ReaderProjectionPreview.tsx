import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {ReaderReturnControls} from './ReaderReturnControls';
import type { ReaderOutput, ReaderRange } from '../domain/exports';
import { readerEntityDocuments, readerId, readerRanges, renderReaderHtml } from '../domain/exports';
import { buildPublicCatalogIndex, buildPublicReaderPages, publicReaderEntityLabel, searchPublicCatalogIndex, type PublicReaderPage } from '../domain/publicCatalog';
import { PagedSelect } from './PagedSelect';
import { WindowedList } from './WindowedList';

function targetPages(pages: readonly PublicReaderPage[], ranges: readonly ReaderRange[]) {
  const targets = new Map<string, string>();
  for (const page of pages) for (const {id: version, projection} of [{id: 'public-project', projection: page.projection}, ...page.projection.versions ?? []]) {
    const add = (id: string) => {const target = readerId(id, version); if (!targets.has(target)) targets.set(target, page.id);};
    for (const entity of projection.entities) {
      add(entity.id);
      for (const [, blocks] of readerEntityDocuments(entity)) for (const block of blocks) add(block.id);
    }
  }
  for (const range of ranges) {
    const block = readerId(range.blockId, range.version), page = targets.get(block);
    if (page) targets.set(`${block}--${range.start}--${range.end}`, page);
  }
  return targets;
}

function focusTarget(document: Document, target: string) {
  const element = document.getElementById(target);
  if (!element) return false;
  element.setAttribute('tabindex', '-1');
  element.scrollIntoView({block: 'center'});
  element.focus({preventScroll: true});
  return true;
}

/** No author project, source ID map, omissions or diagnostics cross this boundary. */
export function ReaderProjectionPreview({ output }: { output: ReaderOutput }) {
  const pages = useMemo(() => buildPublicReaderPages(output.projection), [output]);
  const ranges = useMemo(() => readerRanges(output.projection), [output]);
  const destinations = useMemo(() => targetPages(pages, ranges), [pages, ranges]);
  const destinationsRef = useRef(destinations); destinationsRef.current = destinations;
  const frame = useRef<HTMLIFrameElement>(null), pendingTarget = useRef<string | null>(null), cleanupFrame = useRef<(() => void) | undefined>(undefined);
  const [selected, setSelected] = useState(pages[0].id), [query, setQuery] = useState(''),[observationTarget,setObservationTarget]=useState('');
  const index = Math.max(0, pages.findIndex(page => page.id === selected)), page = pages[index];
  const shownScenes=page.projection.entities.filter(entity=>entity.kind==='scene'),observedScene=shownScenes.find(entity=>entity.id===observationTarget)?.id??shownScenes[0]?.id;
  const catalog = useMemo(() => buildPublicCatalogIndex(output.projection), [output]);
  const entries = useMemo(() => searchPublicCatalogIndex(catalog, query), [catalog, query]);
  // A srcdoc's fallback base URL is the host page; keep native fragment navigation inside srcdoc.
  const html = useMemo(() => renderReaderHtml(page.projection, output.versionLabel, 'horizontal', ranges).replaceAll('href="#', 'href="about:srcdoc#'), [page, output.versionLabel, ranges]);
  const names = new Map(output.projection.entities.map(entity => [entity.id, entity.name]));
  const relations = output.projection.relations.filter(relation => names.has(relation.fromId) && names.has(relation.toId));
  useEffect(() => () => cleanupFrame.current?.(), []);
  useEffect(() => {pendingTarget.current = null;}, [output]);
  const showPage = (id: string) => {pendingTarget.current = null; setSelected(id);};
  const openTarget = useCallback((target: string) => {
    const destination = destinationsRef.current.get(target);
    if (!destination) return;
    const document = frame.current?.contentDocument;
    if (document && focusTarget(document, target)) {pendingTarget.current = null; return;}
    pendingTarget.current = target;
    setSelected(destination);
  }, []);
  useEffect(() => {
    let handle = 0, previousHash = '';
    const observeFragment = () => {
      let hash = '';
      try {hash = frame.current?.contentWindow?.location.hash ?? '';} catch {/* A replaced document is not a public navigation target. */}
      if (hash !== previousHash) {
        previousHash = hash;
        if (hash) {
          let target = hash.slice(1);
          if (!destinationsRef.current.has(target)) try {target = decodeURIComponent(target);} catch {/* Keep the unrecognized fragment inert. */}
          openTarget(target);
        }
      }
      handle = requestAnimationFrame(observeFragment);
    };
    // WebKit suppresses listeners inside script-disabled frames. Observe only its public URL fragment from the parent.
    handle = requestAnimationFrame(observeFragment);
    return () => cancelAnimationFrame(handle);
  }, [openTarget]);
  const prepareFrame = () => {
    cleanupFrame.current?.();
    const document = frame.current?.contentDocument;
    if (!document) return;
    if (pendingTarget.current && focusTarget(document, pendingTarget.current)) pendingTarget.current = null;
    const follow = (event: MouseEvent) => {
      const link = (event.target as Element | null)?.closest?.('a[href^="#"],a[href^="about:srcdoc#"]'), href = link?.getAttribute('href');
      const target = href?.slice(href.indexOf('#') + 1);
      if (!target || !destinationsRef.current.has(target)) return;
      event.preventDefault();
      openTarget(target);
    };
    document.addEventListener('click', follow);
    cleanupFrame.current = () => document.removeEventListener('click', follow);
  };
  return <section aria-label="読者用の全章プレビュー">
    <p>{output.projection.title} · 対象版: {output.versionLabel}</p>
    <PagedSelect label="読者用の章" scope="reader-public-pages" items={pages.map(page => ({ id: page.id, label: page.title }))} value={page.id} onChange={showPage}/>
    <div className="backup-actions"><button className="button secondary" disabled={index === 0} onClick={() => showPage(pages[index - 1].id)}>前の章</button><span>{index + 1} / {pages.length}</span><button className="button secondary" disabled={index === pages.length - 1} onClick={() => showPage(pages[index + 1].id)}>次の章</button></div>
    {/* Parent-side fragment routing needs document access; sandbox and CSP still prohibit scripts. */}
    <iframe ref={frame} onLoad={prepareFrame} title="読者用の本文" sandbox="allow-same-origin" srcDoc={html} style={{ width: '100%', height: '60vh', minHeight: 280, border: '1px solid var(--border)' }}/>
    <PagedSelect label="控える公開場面" scope="reader-public-observation" value={observedScene??''} items={shownScenes.map(entity=>({id:entity.id,label:entity.name}))} onChange={setObservationTarget}/><ReaderReturnControls projection={output.projection} publicScene={observedScene}/><details><summary>五十音・分類索引</summary><label>索引を検索<input aria-label="読者用の索引を検索" value={query} onChange={event => setQuery(event.target.value)}/></label><WindowedList items={entries} scope={`reader-public-index:${query}`} label="読者用の索引" render={entry => <p><button className="text-button" onClick={() => openTarget(readerId(entry.entityId))}>{entry.term}</button>{entry.reading && ` · ${entry.reading}`}{entry.classifications.length > 0 && ` · ${entry.classifications.join('、')}`}</p>}/></details>
    <details><summary>公開された関係</summary><WindowedList items={relations} scope="reader-public-relations" label="公開された関係" render={relation => <p>{names.get(relation.fromId)} · {relation.relationType} · {names.get(relation.toId)}</p>}/></details>
    <details><summary>公開された素材名</summary><WindowedList items={output.projection.entities.filter(entity => entity.kind === 'attachment')} scope="reader-public-assets" label="公開された素材名" render={entity => <p>{publicReaderEntityLabel(entity)}</p>}/></details>
  </section>;
}
