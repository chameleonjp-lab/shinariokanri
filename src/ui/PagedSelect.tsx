import { useMemo } from 'react';
import { ListPager, useListWindow } from './ListWindow';
import {useListQuery} from './WindowedList';

/** A selected ID stays available while at most sixty other options occupy the DOM. */
export function PagedSelect({ label, scope, items, value, onChange, disabled = false, emptyLabel = '選択してください' }: { label: string; scope: string; items: readonly { id: string; label: string }[]; value: string; onChange: (value: string) => void; disabled?: boolean; emptyLabel?: string }) {
  const [query, setQuery] = useListQuery(scope);
  const filtered = useMemo(() => { const text = query.normalize('NFKC').toLocaleLowerCase(); return text ? items.filter(item => `${item.label} ${item.id}`.normalize('NFKC').toLocaleLowerCase().includes(text)) : items; }, [items, query]);
  const page = useListWindow({ items: filtered, scope: `${scope}:${query}`, selectedId: value });
  const selected = value && !page.items.some(item => item.id === value) ? items.find(item => item.id === value) : undefined;
  return <div className="form-field"><label>{label}<input type="search" value={query} disabled={disabled} aria-label={`${label}を検索`} placeholder="名前・IDで絞り込む" onChange={event => setQuery(event.target.value)}/><select aria-label={label} value={value} disabled={disabled} onChange={event => onChange(event.target.value)}><option value="">{emptyLabel}</option>{value&&!items.some(item=>item.id===value)&&<option value={value} disabled>参照先を確認できません · {value}</option>}{selected && <option value={selected.id}>{selected.label} · 選択中</option>}{page.items.map(item => <option key={item.id} value={item.id}>{item.label}</option>)}</select></label><ListPager {...page} label={label}/>{query && !page.total && <span className="field-hint">一致する項目がありません。選択中の項目は保持しています。</span>}</div>;
}
