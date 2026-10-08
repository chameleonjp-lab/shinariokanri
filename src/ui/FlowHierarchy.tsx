import { useMemo, useState } from 'react';
import type { ProjectData } from '../domain/types';
import { flowStructure, structureCounts, type FlowStructureItem } from '../domain/flowStructure';
import { KIND_LABELS } from '../domain/model';
import { ListPager, useListWindow } from './ListWindow';

function Level({ items, scope, selectedId, onSelect }: { items: FlowStructureItem[]; scope: string; selectedId: string | null; onSelect: (id: string) => void }) {
  const window = useListWindow({ items, scope, selectedId });
  const [openId, setOpenId] = useState(() => { try { return localStorage.getItem(`scenario-hierarchy-open:v1:${scope}`) ?? ''; } catch { return ''; } });
  const toggle = (id: string) => { const next = openId === id ? '' : id; setOpenId(next); try { localStorage.setItem(`scenario-hierarchy-open:v1:${scope}`, next); } catch { /* Optional view preference. */ } };
  return <><ol className="flow-hierarchy-level">{window.items.map(item => <Folder key={item.id} scope={`${scope}/${item.id}`} item={item} open={openId === item.id} toggle={() => toggle(item.id)} selectedId={selectedId} onSelect={onSelect}/>)}</ol><ListPager {...window} label="階層"/></>;
}
function Folder({ item, scope, open, toggle, selectedId, onSelect }: { item: FlowStructureItem; scope: string; open: boolean; toggle: () => void; selectedId: string | null; onSelect: (id: string) => void }) {
  const counts = structureCounts(item), problems = useListWindow({ items: item.problems.map((problem, index) => ({ ...problem, id: String(index) })), scope: `${scope}/problems` });
  return <li className={selectedId === item.id ? 'selected' : ''}><div>
    {!!item.children.length && <button type="button" aria-expanded={open} aria-label={`${item.name}を${open ? '折りたたむ' : '掘り下げる'}`} onClick={toggle}>{open ? '−' : '＋'}</button>}
    {item.kind === 'unplaced' ? <strong>{item.name}</strong> : <button className="text-button" onClick={() => onSelect(item.id)}>{KIND_LABELS[item.kind]} · {item.name}</button>}
    <span> · 入口 {item.entries.length} / 出口 {item.exits.length} · 未完成 {counts.unfinished} · エラー {counts.errors} · 未確認条件 {counts.unknown}</span>
  </div>{open && <><ul aria-label={`${item.name}内の確認箇所`}>{problems.items.map(problem => <li key={problem.id}><button className="text-button" onClick={() => onSelect(problem.targetId)}>{problem.message}</button></li>)}</ul><ListPager {...problems} label="確認箇所"/><Level key={scope} scope={scope} items={item.children} selectedId={selectedId} onSelect={onSelect}/></>}</li>;
}
export function FlowHierarchy({ project, selectedId, onSelect }: { project: ProjectData; selectedId: string | null; onSelect: (id: string) => void }) {
  const items = useMemo(() => flowStructure(project), [project]);
  return <section aria-label="章・場面・会話と分岐の階層図"><p>折りたたんでも下位の未完成・エラー・未確認条件を集計します。初期状態の構造確認です。経路全体は試読・検査で確認してください。</p><Level key={project.projectId} scope={`${project.projectId}/flow-hierarchy`} items={items} selectedId={selectedId} onSelect={onSelect}/></section>;
}
