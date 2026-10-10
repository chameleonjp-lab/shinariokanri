import { useId, useMemo, useState } from 'react';
import type { Entity, ProjectData, Relation } from '../domain/types';
import { buildRelationGraph } from '../domain/relationGraph';
import { catalogTimelineEntries } from '../domain/catalogViews';
import { formatCalendarTick, type TimeResolution } from '../domain/time';
import { KIND_LABELS } from '../domain/model';
import { labelOf } from './Fields';
import { STATUS_LABELS } from './components';
import { ListPager, useListWindow } from './ListWindow';
import { RelationForm } from './Relationships';
import './CatalogResultViews.css';

interface Props { project: ProjectData; results: Entity[]; selectedId: string | null; scope: string; onOpen: (id: string) => void }
export function CatalogResultDiagram({ project, results, selectedId, scope, onOpen, onSaveRelation }: Props & { onSaveRelation: (relation: Relation) => Promise<void> }) {
  const arrowId = useId();
  const [editing, setEditing] = useState<Relation | null>(null);
  const resultIds = useMemo(() => new Set(results.map(entity => entity.id)), [results]);
  const lines = useMemo(() => buildRelationGraph(project).lines.filter(line => resultIds.has(line.fromId) && resultIds.has(line.toId)), [project, resultIds]);
  const nodes = useListWindow({ items: results, scope: scope + ':diagram-nodes', selectedId });
  const edges = useListWindow({ items: lines, scope: scope + ':diagram-lines' });
  const positions = new Map(nodes.items.map((entity, i) => [entity.id, { x: 130 + i % 3 * 280, y: 70 + Math.floor(i / 3) * 120 }]));
  const visibleLines = lines.filter(line => positions.has(line.fromId) && positions.has(line.toId)).slice(0, 120);
  const index = useMemo(() => new Map(results.map(entity => [entity.id, entity])), [results]);
  return <section aria-label="同じ検索結果の図">
    <p>同じ{results.length}件の情報 · {lines.length}本の関係。没・仮・要確認も検索対象の項目として表示します。没の関係を有効な線へ含めません。</p>
    <p className="field-hint">実線は保存された関係、破線は元情報の参照です。日時・経路が不足する線は未確認です。線のない項目も表示します。</p>
    <div className="catalog-result-canvas" tabIndex={0} aria-label="検索結果の図のスクロール領域">
      <svg width="820" height={Math.max(160, Math.ceil(nodes.items.length / 3) * 120)} aria-label="同じ結果IDの関係図">
        <defs><marker id={arrowId} viewBox="0 0 10 10" refX="9" refY="5" markerWidth="8" markerHeight="8" orient="auto-start-reverse"><path d="M 0 0 L 10 5 L 0 10 z" fill="currentColor"/></marker></defs>
        {visibleLines.map(line => { const a = positions.get(line.fromId)!, b = positions.get(line.toId)!; return <line key={line.id} x1={a.x} y1={a.y} x2={b.x} y2={b.y} stroke="currentColor" strokeWidth="2" strokeDasharray={line.origin === 'derived' || line.assessment.value === 'unknown' ? '8 5' : undefined} markerEnd={`url(#${arrowId})`} markerStart={line.direction === 'symmetric' ? `url(#${arrowId})` : undefined}><title>{line.label} · {line.assessment.value === 'unknown' ? '未確認' : '有効'}</title></line>; })}
        {nodes.items.map(entity => { const p = positions.get(entity.id)!; return <g key={entity.id} data-entity-id={entity.id} role="button" tabIndex={0} aria-label={`${labelOf(entity)} · ${STATUS_LABELS[entity.status]} · 詳細を開く`} className={selectedId === entity.id ? 'selected' : ''} onClick={() => onOpen(entity.id)} onKeyDown={event => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); onOpen(entity.id); } }}>
          <rect x={p.x - 110} y={p.y - 28} width="220" height="56" rx="8"/><text x={p.x} y={p.y - 3} textAnchor="middle">{Array.from(labelOf(entity)).slice(0, 18).join('')}</text><text x={p.x} y={p.y + 17} textAnchor="middle">{KIND_LABELS[entity.kind]} · {STATUS_LABELS[entity.status]}</text>
        </g>; })}
      </svg>
    </div>
    <ListPager {...nodes} label="検索結果図の項目"/>
    <p>{visibleLines.length} / {lines.length}線を図に表示中です。ページをまたぐ線と描画上限を超える線も、次の関係一覧から確認できます。</p>
    <ul className="catalog-result-edges">{edges.items.map(line => <li key={line.id} data-relation-id={line.origin === 'manual' ? line.id : undefined}><button type="button" className="text-button" onClick={() => onOpen(line.fromId)}>{labelOf(index.get(line.fromId))}</button> {line.direction === 'symmetric' ? '←→' : '→'} <button type="button" className="text-button" onClick={() => onOpen(line.toId)}>{labelOf(index.get(line.toId))}</button> · {line.label} · {line.assessment.value === 'unknown' ? '未確認' : '有効'} <button type="button" className="text-button" onClick={() => line.relation ? setEditing(structuredClone(line.relation)) : onOpen(line.sourceId)}>元情報・根拠を確認</button>{line.assessment.reasons.length > 0 && <span> · {line.assessment.reasons.join('、')}</span>}</li>)}</ul>
    <ListPager {...edges} label="検索結果図の関係"/>
    {editing && <RelationForm relation={editing} project={project} onSave={onSaveRelation} onClose={() => setEditing(null)} onOpen={onOpen}/>}
  </section>;
}
function dateLabel(time: TimeResolution, project: ProjectData) {
  if (time.status !== 'resolved') return `日時未確認 · ${time.reason}`;
  const calendar = project.calendars.find(item => item.id === time.calendarId);
  if (!calendar) return '暦の対応が未確認です。';
  const start = formatCalendarTick(time.earliest, calendar), end = formatCalendarTick(time.endLatest, calendar);
  return `${calendar.name} · ${start}${time.earliest !== time.endLatest ? ` 〜 ${end}` : ''}${time.mode === 'interval' ? '（終了を含まない）' : time.mode === 'uncertain' || time.earliest !== time.latest ? '（日時に幅あり）' : ''}`;
}
export function CatalogResultTimeline({ project, results, selectedId, scope, onOpen }: Props) {
  const entries = useMemo(() => catalogTimelineEntries(project, results), [project, results]);
  const page = useListWindow({ items: entries, scope: scope + ':timeline', selectedId });
  return <section aria-label="同じ検索結果の年表">
    <p>同じ{results.length}件を登録された世界日時で並べます。独立した暦は別に扱い、章順・提示順・制作期限へ換算しません。日時を持たない情報も末尾に表示します。</p>
    <ol className="catalog-result-timeline">{page.items.map(entry => <li key={entry.id} data-entity-id={entry.id} className={selectedId === entry.id ? 'selected' : ''}>
      <button type="button" className="text-button" onClick={() => onOpen(entry.id)}>{labelOf(entry.entity)} · {KIND_LABELS[entry.entity.kind]} · {STATUS_LABELS[entry.entity.status]}</button>
      {entry.dates.length === 0 ? <p>登録日時なし · 詳細から関連する日時を編集できます。</p> : entry.dates.slice(0, 3).map((date, i) => <p key={`${date.sourceId}:${i}`}>{date.label} · {dateLabel(date.time, project)} {date.sourceId !== entry.id && <button type="button" className="text-button" onClick={() => onOpen(date.sourceId)}>日時の元情報を開く</button>}</p>)}
      {entry.dates.length > 3 && <p>ほか{entry.dates.length - 3}件の登録日時。<button type="button" className="text-button" onClick={() => onOpen(entry.id)}>詳細ですべての参照を確認</button></p>}
    </li>)}</ol>
    <ListPager {...page} label="検索結果年表"/>
  </section>;
}
