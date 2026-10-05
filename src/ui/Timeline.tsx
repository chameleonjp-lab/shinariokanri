import { useMemo, useState } from 'react';
import type { Entity, ProjectData, TimeSpec } from '../domain/types';
import { getEntitiesByKind } from '../domain/model';
import { formatCalendarTick, isTick, MAX_TICK, resolveTime } from '../domain/time';
import { EmptyState, Icon, StatusBadge, fieldText } from './components';
import { dataOf, labelOf } from './Fields';

export function timeLabel(value: unknown, project: ProjectData) {
  if (!value || typeof value !== 'object') return '日時未定';
  const t = value as Record<string, any>;
  const calendar = project.calendars.find(c => c.id === t.calendarId) || project.calendars[0];
  const label = (tick: string) => { try { return formatCalendarTick(tick, calendar); } catch { return `${tick} tick`; } };
  if (t.mode === 'instant') return label(t.at);
  if (t.mode === 'interval') return `${label(t.start)} 〜 ${label(t.end)}（終了を含まない）`;
  if (t.mode === 'uncertain') return `${label(t.earliest)} 〜 ${label(t.latest)} · ${t.precision}`;
  if (t.mode === 'relative') return `${labelOf(project.entities.find(e => e.id === t.anchorEventId))}の${t.anchorPoint === 'start' ? '開始' : '終了'}から ${t.minOffset}〜${t.maxOffset} tick`;
  return `日時未定${t.reason ? ` · ${t.reason}` : ''}`;
}

interface Lane { id: string; name: string; groupId?: string; common?: boolean; group?: boolean; events: Entity<'event'>[] }

export function Timeline({ project, selectedId, onSelect, onAdd }: { project: ProjectData; selectedId: string | null; onSelect: (id: string) => void; onAdd: () => void }) {
  const events = project.entities.filter((e): e is Entity<'event'> => e.kind === 'event' && !e.deletedAt);
  const characters = getEntitiesByKind(project, 'character');
  const groups = getEntitiesByKind(project, 'group').filter(e => ['display', 'faction'].includes(e.data.groupType));
  const [unit, setUnit] = useState('tick');
  const [zoom, setZoom] = useState(1);
  const [fittedSpan, setFittedSpan] = useState<string | null>(null);
  const [listPage, setListPage] = useState(0);
  const [center, setCenter] = useState(project.mainStart);
  const [jump, setJump] = useState('');
  const [jumpError, setJumpError] = useState('');
  const [collapsed, setCollapsed] = useState<string[]>([]);
  const [mode, setMode] = useState<'timeline' | 'list'>('timeline');
  const calendar = project.calendars.find(c => c.id === project.calendarId) || project.calendars[0];
  const unitTick = unit === 'day' ? BigInt(calendar?.ticksPerDay || '86400') : unit === 'hour' ? BigInt(calendar?.ticksPerDay || '86400') / 24n || 1n : unit === 'year' ? BigInt(calendar?.ticksPerDay || '86400') * 365n : unit === 'month' ? BigInt(calendar?.ticksPerDay || '86400') * 30n : 1n;
  const rawSpan = fittedSpan ? BigInt(fittedSpan) : unitTick * BigInt(Math.max(4, Math.round(120 / zoom)));
  const span = rawSpan > MAX_TICK * 2n ? MAX_TICK * 2n : rawSpan < 4n ? 4n : rawSpan;
  const rawOrigin = isTick(center) ? BigInt(center) - span / 2n : 0n;
  const origin = rawOrigin < -MAX_TICK ? -MAX_TICK : rawOrigin + span > MAX_TICK ? MAX_TICK - span : rawOrigin;
  const end = origin + span;
  const resolved = useMemo(() => events.map(event => ({ event, time: resolveTime(event.data.time, events, [event.id]) })), [project.entities]);
  const visible = resolved.filter(r => r.time.status === 'resolved' && BigInt(r.time.earliest) <= end && BigInt(r.time.endLatest) >= origin);
  const unknown = resolved.filter(r => r.time.status !== 'resolved');
  const sortedEvents = useMemo(() => [...resolved].sort((a, b) => a.time.status === 'resolved' && b.time.status === 'resolved' ? BigInt(a.time.earliest) < BigInt(b.time.earliest) ? -1 : BigInt(a.time.earliest) > BigInt(b.time.earliest) ? 1 : 0 : a.time.status === 'resolved' ? -1 : b.time.status === 'resolved' ? 1 : 0).map(r => r.event), [resolved]);
  const lanes: Lane[] = [{ id: 'common', name: '共通の出来事', common: true, events: events.filter(e => e.data.laneRole !== 'participants') }];
  const displayed = new Set<string>();
  const forCharacter = (id: string) => events.filter(e => e.data.laneRole !== 'common' && e.data.participants?.some(p => p.characterId === id));
  groups.forEach(group => { lanes.push({ id: group.id, name: group.name, group: true, events: [] }); if (collapsed.includes(group.id)) return; (group.data.members || []).forEach(id => { const person = characters.find(c => c.id === id); if (person) { displayed.add(id); lanes.push({ id: `${group.id}-${id}`, groupId: group.id, name: person.name, events: forCharacter(id) }); } }); });
  characters.filter(c => !displayed.has(c.id) && !groups.some(g => collapsed.includes(g.id) && g.data.members?.includes(c.id))).forEach(c => lanes.push({ id: c.id, name: c.name, events: forCharacter(c.id) }));
  const percent = (tick: string) => Number((BigInt(tick) - origin) * 100000n / span) / 1000;
  const fit = () => {
    const known = resolved.filter(r => r.time.status === 'resolved');
    if (!known.length) { setCenter(project.mainStart); return; }
    let min = BigInt((known[0].time as any).earliest), max = BigInt((known[0].time as any).endLatest);
    known.forEach(({ time }) => { if (time.status === 'resolved') { const a = BigInt(time.earliest), b = BigInt(time.endLatest); if (a < min) min = a; if (b > max) max = b; } });
    setCenter(((min + max) / 2n).toString());
    const distance = max - min;
    setFittedSpan((distance + distance / 5n + 4n).toString());
  };
  const navigatePeriod = (direction: bigint) => { const next = BigInt(center) + span * direction; setCenter((next > MAX_TICK ? MAX_TICK : next < -MAX_TICK ? -MAX_TICK : next).toString()); };

  return <section className="timeline-section"><div className="view-switch" aria-label="年表の表示"><button type="button" className={mode === 'timeline' ? 'active' : ''} onClick={() => setMode('timeline')}><Icon name="timeline" size={17}/>年表</button><button type="button" className={mode === 'list' ? 'active' : ''} onClick={() => setMode('list')}><Icon name="note" size={17}/>出来事一覧</button></div>
    <div className="timeline-controls"><div className="control-group"><label>表示単位<select aria-label="年表の表示単位" value={unit} onChange={e => { setUnit(e.target.value); setFittedSpan(null); }}><option value="tick">tick</option><option value="hour">時</option><option value="day">日</option><option value="month">月（30日幅）</option><option value="year">年（365日幅）</option></select></label><div className="zoom-controls"><button type="button" className="icon-button" aria-label="年表を縮小" disabled={fittedSpan ? span >= MAX_TICK * 2n : zoom <= .001} onClick={() => { if (fittedSpan) setFittedSpan((span * 2n).toString()); else setZoom(Math.max(.001, zoom / 2)); }}>−</button><span>{fittedSpan ? "全体幅" : zoom < 1 ? `${zoom.toFixed(3)}倍` : `${zoom}倍`}</span><button type="button" className="icon-button" aria-label="年表を拡大" disabled={fittedSpan ? span <= 4n : zoom >= 20} onClick={() => { if (fittedSpan) setFittedSpan((span / 2n).toString()); else setZoom(Math.min(20, zoom * 2)); }}>＋</button></div></div><div className="control-group"><button type="button" className="button subtle small" onClick={fit}>全体へ戻る</button><button type="button" className="button subtle small" onClick={() => setCenter(project.mainStart)}>本編開始へ</button>{selectedId && <button type="button" className="button subtle small" onClick={() => { const found = resolved.find(r => r.event.id === selectedId); if (found?.time.status === 'resolved') setCenter(found.time.earliest); }}>選択対象へ</button>}</div></div>
    <div className="timeline-context"><span><span className="legend-dot"/>{calendar?.name || '暦未設定'}</span><span>本編開始 {project.mainStart} tick</span><span>表示 {origin.toString()} 〜 {end.toString()} tick</span></div>
    {events.length === 0 ? <EmptyState icon="timeline" title="物語の時間を並べましょう" action={<button className="button primary" onClick={onAdd}><Icon name="plus"/>出来事を追加</button>}>日時が未定でも、要約から出来事を残せます。</EmptyState> : mode === 'list' ? <div className="event-table"><div className="table-labels"><span>出来事</span><span>世界内日時</span></div>{sortedEvents.slice(listPage * 60, (listPage + 1) * 60).map(e => <button key={e.id} className={`event-table-row ${selectedId === e.id ? 'selected' : ''}`} type="button" onClick={() => onSelect(e.id)}><span><strong>{e.name || fieldText(e.data.summary).slice(0, 40)}</strong><small>{e.data.participants?.map(p => labelOf(project.entities.find(c => c.id === p.characterId))).join('、') || '共通の出来事'}</small></span><span>{timeLabel(e.data.time, project)}<StatusBadge status={e.status}/></span></button>)}</div> : <>
      <div className="timeline-canvas" tabIndex={0} aria-label="世界内年表。左右にスクロールできます。"><div className="timeline-grid"><div className="timeline-axis"><div className="lane-label axis-label">人物・グループ</div><div className="axis-ticks">{Array.from({ length: 7 }, (_, i) => { const value = (origin + span * BigInt(i) / 6n).toString(); return <span key={i} style={{ left: `${i * 100 / 6}%` }} title={value}>{value}</span>; })}</div></div>{lanes.map(lane => {
        if (lane.group) return <div className="timeline-group" key={lane.id}><button type="button" className="lane-label group-label" onClick={() => setCollapsed(previous => previous.includes(lane.id) ? previous.filter(id => id !== lane.id) : [...previous, lane.id])} aria-expanded={!collapsed.includes(lane.id)} title={lane.name}><span>{collapsed.includes(lane.id) ? '▸' : '▾'}</span>{lane.name}</button></div>;
        const laneEntries = visible.filter(({ event }) => lane.events.some(e => e.id === event.id));
        const slotEnds: number[] = [];
        const boxes = laneEntries.slice(0, 200).map(entry => { if (entry.time.status !== 'resolved') return null; const left = Math.max(0, percent(entry.time.earliest)), right = Math.min(100, percent(entry.time.endLatest)); const width = Math.max(13, right - left); let slot = slotEnds.findIndex(n => n + 1 < left); if (slot === -1) slot = slotEnds.length; slotEnds[slot] = left + width; return { ...entry, left, width: Math.min(100 - left, width), slot }; }).filter(Boolean) as { event: Entity<'event'>; left: number; width: number; slot: number }[];
        return <div key={lane.id} className={`timeline-lane ${lane.common ? 'common-lane' : ''}`} style={{ minHeight: `${Math.max(88, slotEnds.length * 60 + 20)}px` }}><div className="lane-label" title={lane.name} tabIndex={0}>{lane.common && <span className="common-label">共通</span>}<span>{lane.name}</span>{laneEntries.length > 1 && <small>{laneEntries.length}件</small>}</div><div className="lane-track">{isTick(project.mainStart) && percent(project.mainStart) >= 0 && percent(project.mainStart) <= 100 && <span className="main-start-line" style={{ left: `${percent(project.mainStart)}%` }} aria-label="本編開始"/>}{boxes.map(({ event, left, width, slot }) => <button type="button" key={event.id} className={`timeline-event event-${event.data.time.mode} ${selectedId === event.id ? 'selected' : ''}`} style={{ left: `${left}%`, width: `${width}%`, top: `${slot * 60 + 12}px` }} onClick={() => onSelect(event.id)} title={`${event.name} · ${timeLabel(event.data.time, project)}`}><span className="event-shape"/>{event.name || fieldText(event.data.summary).slice(0, 24)}<small>{event.data.time.mode === 'interval' ? '期間' : event.data.time.mode === 'uncertain' ? '不確定な範囲' : event.status === 'confirmed' ? '確定' : '下書き'}</small></button>)}</div></div>;
      })}</div></div>{lanes.some(lane => visible.filter(r => lane.events.some(e => e.id === r.event.id)).length > 200) && <p className="field-hint">各レーンの描画は200件までです。すべての出来事は「出来事一覧」から確認・編集できます。</p>}<div className="timeline-bottom"><div className="timeline-legend"><span><i className="legend-instant"/>瞬間</span><span><i className="legend-interval"/>期間</span><span><i className="legend-uncertain"/>不確定な範囲</span></div><span>{visible.length} / {events.length}件を表示</span></div>
    </>}
    {mode === "list" && sortedEvents.length > 60 && <div className="pagination"><button className="button secondary small" disabled={listPage === 0} onClick={() => setListPage(listPage - 1)}>前のページ</button><span>{listPage + 1} / {Math.ceil(sortedEvents.length / 60)}</span><button className="button secondary small" disabled={(listPage + 1) * 60 >= sortedEvents.length} onClick={() => setListPage(listPage + 1)}>次のページ</button></div>}
    <div className="timeline-navigation"><button className="button secondary small" onClick={() => navigatePeriod(-1n)}><Icon name="back" size={16}/>前の期間</button><form onSubmit={e => { e.preventDefault(); if (isTick(jump)) { setCenter(jump); setJumpError(''); } else setJumpError('38桁以内の整数tickを入力してください。'); }}><input aria-label="移動先の世界内tick" placeholder="tickへ移動" value={jump} onChange={e => setJump(e.target.value)}/><button className="button secondary small" type="submit">移動</button></form><button className="button secondary small" onClick={() => navigatePeriod(1n)}>次の期間<Icon name="arrow" size={16}/></button></div>{jumpError && <p className="field-error" role="alert">{jumpError}</p>}
    {unknown.length > 0 && <section className="undated-section"><div className="section-heading"><h3>日時未定・未解決</h3><span className="count-pill">{unknown.length}</span></div><div className="compact-cards">{unknown.map(({ event, time }) => <button type="button" key={event.id} className="compact-card" onClick={() => onSelect(event.id)}><Icon name="clock"/><span><strong>{labelOf(event)}</strong><small>{time.status !== 'resolved' ? time.reason : ''}</small></span><Icon name="arrow" size={16}/></button>)}</div></section>}
  </section>;
}
