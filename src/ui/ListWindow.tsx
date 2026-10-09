import { useEffect, useRef, useState } from 'react';
import {useAuthorScope} from './StoreContext';

const PREFIX = 'scenario-list-position:v1:';
function readPage(scope: string) {
  try { const page = Number(localStorage.getItem(PREFIX + scope)); return Number.isSafeInteger(page) && page >= 0 && page <= 100_000 ? page : 0; } catch { return 0; }
}
/** Per-project view position, independent from authored data and save revisions. */
export function useListWindow<T extends { id: string }>({ items, scope, selectedId, size = 60,followSelected=true }: { items: readonly T[]; scope: string; selectedId?: string | null; size?: number;followSelected?:boolean }) {
  scope=useAuthorScope(scope);
  const [position, setPosition] = useState(() => ({ scope, page: readPage(scope) }));
  const selected = useRef<string | null | undefined>(undefined);
  const lastScope = useRef(scope);
  const maximum = Math.max(0, Math.ceil(items.length / size) - 1);
  const page = Math.min(position.scope === scope ? position.page : readPage(scope), maximum);
  function setPage(next: number) {
    const bounded = Math.max(0, Math.min(next, maximum));
    setPosition({ scope, page: bounded });
    try { localStorage.setItem(PREFIX + scope, String(bounded)); } catch { /* Navigation remains available without persistent preferences. */ }
  }
  const selectedIndex = selectedId ? items.findIndex(item => item.id === selectedId) : -1;
  useEffect(() => {
    if (lastScope.current === scope && selected.current === selectedId) return;
    lastScope.current = scope; selected.current = selectedId;
    if (followSelected&&selectedIndex >= 0) setPage(Math.floor(selectedIndex / size));
    else setPosition({ scope, page: readPage(scope) });
  }, [scope, selectedId, selectedIndex,followSelected]);
  return { items: items.slice(page * size, (page + 1) * size), page, maximum, total: items.length, offset: page * size, setPage, selectedPage: selectedIndex < 0 ? undefined : Math.floor(selectedIndex / size) };
}
export function ListPager({ page, maximum, total, setPage, selectedPage, label }: { page: number; maximum: number; total: number; setPage: (page: number) => void; selectedPage?: number; label: string }) {
  if (!maximum) return null;
  return <nav className="pagination" aria-label={`${label}のページ`}><button type="button" className="button secondary small" disabled={page === 0} onClick={() => setPage(page - 1)}>前のページ</button><span>{page + 1} / {maximum + 1} · {total}件</span><button type="button" className="button secondary small" disabled={page === maximum} onClick={() => setPage(page + 1)}>次のページ</button>{selectedPage !== undefined && selectedPage !== page && <button className="text-button" onClick={() => setPage(selectedPage)}>選択中の項目のページへ</button>}</nav>;
}
