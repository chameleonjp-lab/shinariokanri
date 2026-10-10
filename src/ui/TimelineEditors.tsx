import { useMemo, useState } from 'react';
import type { CalendarDefinition, Entity, ID, ProjectData, Tick, TimeConstraint, TimeSpec } from '../domain/types';
import { calendarDateToTick, formatCalendarTick, isTick, MAX_TICK, parseTick, tickToCalendarDate, type TimeResolution } from '../domain/time';
import { applyTimeEditPreview, previewTimeEdit, type TimeEdit, type TimeEditChange, type TimeEditPreview } from '../domain/timeEditing';
import { Modal } from './components';
import { labelOf } from './Fields';
import { WorldTimeImpactPreview } from './WorldTimeImpactPreview';
import { PagedSelect } from './PagedSelect';
import { WindowedList } from './WindowedList';
import type { WorldPoint } from '../domain/world';

export const TIMELINE_PAGE_SIZE = 60;
export type TimelineSave = (candidate: ProjectData, reason: string) => Promise<ProjectData>;

export function resolutionLabel(time: TimeResolution, project: ProjectData): string {
  if (time.status !== 'resolved') return time.reason;
  const calendar = project.calendars.find(candidate => candidate.id === time.calendarId);
  const format = (tick: Tick) => { try { return calendar ? formatCalendarTick(tick, calendar) : `${tick} tick`; } catch { return `${tick} tick`; } };
  return time.earliest === time.endLatest ? format(time.earliest) : `${format(time.earliest)} 〜 ${format(time.endLatest)}`;
}

export function TickInput({ label, value, calendar, onChange, onValid }: { label: string; value: Tick; calendar: CalendarDefinition; onChange: (value: Tick) => void; onValid?: (valid: boolean) => void }) {
  const [format, setFormat] = useState<'tick' | 'date'>('tick');
  const makeDate = (tick: Tick = value) => { try { const date = tickToCalendarDate(isTick(tick) ? tick : '0', calendar); return { year: date.year, month: String(date.month), day: String(date.day), tickOfDay: date.tickOfDay ?? '0' }; } catch { return { year: '0', month: '1', day: '1', tickOfDay: '0' }; } };
  const [date, setDate] = useState(makeDate), [error, setError] = useState('');
  const updateDate = (field: keyof typeof date, next: string) => {
    const candidate = { ...date, [field]: next }; setDate(candidate);
    try {
      if (!/^-?(?:0|[1-9][0-9]*)$/.test(candidate.year) || !/^[1-9][0-9]*$/.test(candidate.month) || !/^[1-9][0-9]*$/.test(candidate.day)) throw new RangeError('年・月・日を整数で入力してください。');
      const tick = calendarDateToTick({ year: candidate.year, month: Number(candidate.month), day: Number(candidate.day), tickOfDay: candidate.tickOfDay }, calendar);
      setError(''); onValid?.(true); onChange(tick);
    } catch (cause) { setError((cause as Error).message); onValid?.(false); }
  };
  return <div className="form-field timeline-tick-input"><label>{label}</label><div className="timeline-input-format"><button type="button" aria-pressed={format === 'tick'} onClick={() => setFormat('tick')}>世界内tick</button><button type="button" aria-pressed={format === 'date'} onClick={() => setFormat('date')}>暦の年月日</button></div>{format === 'tick' ? <input aria-label={label} value={value} onChange={event => { const next = event.target.value, valid = isTick(next); onChange(next); onValid?.(valid); setError(valid ? '' : 'tickは38桁以内の整数で入力してください。'); if (valid) setDate(makeDate(next)); }}/>
    : <div className="timeline-calendar-input">{(['year', 'month', 'day', 'tickOfDay'] as const).map(field => <label key={field}>{{ year: '年', month: '月', day: '日', tickOfDay: '日内tick' }[field]}<input aria-label={`${label}の${{ year: '年', month: '月', day: '日', tickOfDay: '日内tick' }[field]}`} value={date[field]} inputMode={field === 'year' ? 'text' : 'numeric'} onChange={event => updateDate(field, event.target.value)}/></label>)}</div>}
    <span className="field-hint">{calendar.name} · 1日 {calendar.ticksPerDay} tick{format === 'date' && ` · 世界内tick ${value}`}</span>{error && <span className="field-error" role="alert">{error}</span>}</div>;
}

export function EntityChoice({ entities, value, onChange, label, excludeId }: { entities: Entity[]; value: ID; onChange: (id: ID) => void; label: string; excludeId?: ID }) {
  const [query, setQuery] = useState('');
  const choices = useMemo(() => entities.filter(entity => !entity.deletedAt && entity.id !== excludeId && (!query || `${entity.name} ${entity.id}`.toLocaleLowerCase().includes(query.toLocaleLowerCase()))), [entities, query, excludeId]);
  const first = choices.slice(0, 100), selected = entities.find(entity => entity.id === value);
  if (selected && !first.some(entity => entity.id === value) && selected.id !== excludeId && !selected.deletedAt) first.unshift(selected);
  return <div className="timeline-entity-choice"><input type="search" aria-label={`${label}の候補を検索`} placeholder="名前またはIDで検索" value={query} onChange={event => setQuery(event.target.value)}/><select aria-label={label} value={value} onChange={event => onChange(event.target.value)}><option value="">選択してください</option>{first.map(entity => <option key={entity.id} value={entity.id}>{labelOf(entity)}</option>)}</select>{choices.length > 100 && <span className="field-hint">候補は{choices.length}件です。検索して対象を選んでください。</span>}</div>;
}

export function TimelinePagination({ page, total, onChange }: { page: number; total: number; onChange: (page: number) => void }) {
  if (total <= TIMELINE_PAGE_SIZE) return null;
  return <div className="pagination"><button type="button" className="button secondary small" disabled={page === 0} onClick={() => onChange(page - 1)}>前のページ</button><span>{page + 1} / {Math.ceil(total / TIMELINE_PAGE_SIZE)}</span><button type="button" className="button secondary small" disabled={(page + 1) * TIMELINE_PAGE_SIZE >= total} onClick={() => onChange(page + 1)}>次のページ</button></div>;
}

export function PreviewTable({ preview, project, movableIds, onMovableChange }: { preview: TimeEditPreview; project: ProjectData; movableIds?: ID[]; onMovableChange?: (ids: ID[]) => void }) {
  const [page, setPage] = useState(0), index = useMemo(() => new Map(project.entities.map(entity => [entity.id, entity])), [project.entities]);
  const safePage = Math.min(page, Math.max(0, Math.ceil(preview.impacts.length / TIMELINE_PAGE_SIZE) - 1));
  return <section className="timeline-time-preview" aria-label="日時変更の影響"><h3>変更前と連動先 · {preview.impacts.length}件</h3>{preview.impacts.slice(safePage * TIMELINE_PAGE_SIZE, (safePage + 1) * TIMELINE_PAGE_SIZE).map(impact => {
    const event = index.get(impact.eventId), canApprove = onMovableChange && impact.eventId !== preview.requestedEventId && event?.kind === 'event' && !['relative', 'unknown'].includes(event.data.time.mode);
    return <article key={impact.eventId} className={`timeline-impact ${impact.fixed ? 'fixed-date' : ''}`}><strong>{labelOf(event)}</strong><dl><dt>変更前</dt><dd>{resolutionLabel(impact.before, project)}</dd><dt>変更後</dt><dd>{resolutionLabel(impact.after, project)}</dd></dl><p>{impact.reason}</p>{canApprove && <label className="timeline-check"><input type="checkbox" checked={movableIds?.includes(impact.eventId) ?? false} onChange={event => onMovableChange(event.target.checked ? [...(movableIds ?? []), impact.eventId] : (movableIds ?? []).filter(id => id !== impact.eventId))}/>この日時の連動移動を承認する</label>}</article>;
  })}<TimelinePagination page={safePage} total={preview.impacts.length} onChange={setPage}/>{preview.conflicts.length > 0 && <div className="error-notice" role="alert"><strong>確定できない日時があります</strong><ul>{preview.conflicts.map((conflict, i) => <li key={`${conflict.path}:${i}`}>{labelOf(index.get(conflict.path.split('.')[1]))} · {conflict.message}</li>)}</ul></div>}</section>;
}

function OffsetInputs({ label, minimum, maximum, calendar, onChange }: { label: string; minimum: Tick; maximum: Tick; calendar: CalendarDefinition; onChange: (minimum: Tick, maximum: Tick) => void }) {
  const [unit, setUnit] = useState<'tick' | 'day'>('tick');
  const width = unit === 'day' ? parseTick(calendar.ticksPerDay) : 1n;
  const display = (value: Tick) => isTick(value) && parseTick(value) % width === 0n ? (parseTick(value) / width).toString() : value;
  const convert = (value: string) => isTick(value) ? (parseTick(value) * width).toString() : value;
  const divisible = isTick(minimum) && isTick(maximum) && parseTick(minimum) % parseTick(calendar.ticksPerDay) === 0n && parseTick(maximum) % parseTick(calendar.ticksPerDay) === 0n;
  return <div className="form-field"><label>{label}</label><div className="timeline-offset-input"><select aria-label={`${label}の入力単位`} value={unit} onChange={event => setUnit(event.target.value as 'tick' | 'day')}><option value="tick">tick</option><option value="day" disabled={!divisible} title={!divisible ? '日未満の端数があるため、tickで入力してください。' : undefined}>日</option></select><label>最小<input aria-label={`${label}の最小`} value={display(minimum)} onChange={event => onChange(convert(event.target.value), maximum)}/></label><label>最大<input aria-label={`${label}の最大`} value={display(maximum)} onChange={event => onChange(minimum, convert(event.target.value))}/></label></div><span className="field-hint">1日 {calendar.ticksPerDay} tick{!divisible && ' · 日未満の端数はtickで入力します。'}</span></div>;
}

export function TimelineTimeEditor({ project, referenceProject, event, onClose, onSave, onApplied, point, onOpen }: { project: ProjectData; referenceProject?: ProjectData; event: Entity<'event'>; onClose: () => void; onSave: TimelineSave; onApplied: (changes: TimeEditChange[]) => void; point?: WorldPoint; onOpen?: (id: ID) => void }) {
  const [base, setBase] = useState(project), [time, setTime] = useState<TimeSpec>(structuredClone(event.data.time)), [constraints, setConstraints] = useState<TimeConstraint[]>(structuredClone(event.data.constraints ?? []));
  const [request, setRequest] = useState<TimeEdit | null>(null), [move, setMove] = useState(false), [movable, setMovable] = useState<ID[]>([]), [validFields, setValidFields] = useState<Record<string, boolean>>({});
  const [busy, setBusy] = useState(false), [error, setError] = useState('');
  const available = referenceProject ?? project, calendar = available.calendars.find(candidate => candidate.id === ('calendarId' in time ? time.calendarId : project.calendarId)) ?? available.calendars[0];
  const events = useMemo(() => available.entities.filter((entity): entity is Entity<'event'> => entity.kind === 'event' && !entity.deletedAt), [available.entities]);
  const references = useMemo(() => events.filter(event => event.projectId !== project.projectId), [events, project.projectId]);
  const previewProject = useMemo(() => { const localIds = new Set(base.entities.map(entity => entity.id)); return { ...available, entities: [...base.entities, ...available.entities.filter(entity => !localIds.has(entity.id))] }; }, [available, base.entities]);
  const preview = useMemo(() => request ? previewTimeEdit(base, request, { moveDependents: move, movableEventIds: movable, referenceEvents: references }) : null, [base, request, move, movable, references]);
  const updateTime = (next: TimeSpec) => { setTime(next); setRequest(null); };
  const updateConstraint = (index: number, next: TimeConstraint) => { setConstraints(previous => previous.map((constraint, position) => position === index ? next : constraint)); setRequest(null); };
  const valid = (key: string, value: boolean) => setValidFields(previous => previous[key] === value ? previous : { ...previous, [key]: value });
  const tickField = (label: string, key: 'at' | 'start' | 'end' | 'earliest' | 'latest') => <TickInput key={`${key}:${calendar.id}`} label={label} value={(time as unknown as Record<string, string>)[key]} calendar={calendar} onChange={value => updateTime({ ...time, [key]: value } as TimeSpec)} onValid={value => valid(key, value)}/>;
  const changeMode = (mode: TimeSpec['mode']) => {
    const defaults: Record<TimeSpec['mode'], TimeSpec> = { instant: { mode: 'instant', at: project.mainStart, calendarId: calendar.id }, interval: { mode: 'interval', start: project.mainStart, end: (parseTick(project.mainStart) < MAX_TICK ? parseTick(project.mainStart) + 1n : MAX_TICK).toString(), calendarId: calendar.id }, uncertain: { mode: 'uncertain', earliest: project.mainStart, latest: project.mainStart, calendarId: calendar.id, precision: '概算' }, relative: { mode: 'relative', anchorEventId: '', anchorPoint: 'start', minOffset: '0', maxOffset: '0' }, unknown: { mode: 'unknown', reason: '' } };
    updateTime(defaults[mode]); setValidFields({});
  };
  return <Modal title={`日時・前後関係 · ${labelOf(event)}`} onClose={() => { if (!busy) onClose(); }} wide><fieldset disabled={busy} className="world-save-fields"><p className="field-hint">日時変更前に連動先を確認します。絶対日時の連動移動は対象ごとに承認できます。</p>{error && <div className="error-notice" role="alert">{error}</div>}
    <div className="form-field"><label>日時の種類</label><select aria-label="日時の種類" value={time.mode} onChange={change => changeMode(change.target.value as TimeSpec['mode'])}><option value="instant">確定した瞬間</option><option value="interval">開始と終了のある期間</option><option value="uncertain">不確定な範囲</option><option value="relative">別の出来事からの相対日時</option><option value="unknown">日時未定</option></select></div>
    {'calendarId' in time && <div className="form-field"><label>日時の暦</label><PagedSelect label="日時の暦" scope={`${project.projectId}:${event.id}:time-edit:calendar`} value={time.calendarId} onChange={id => updateTime({ ...time, calendarId: id })} items={available.calendars.map(candidate => ({ id: candidate.id, label: candidate.name }))}/><span className="field-hint">暦を替えても世界内tickは保持します。</span></div>}
    {time.mode === 'instant' && tickField('出来事の世界内tick', 'at')}{time.mode === 'interval' && <>{tickField('開始の世界内tick', 'start')}{tickField('終了の世界内tick', 'end')}</>}{time.mode === 'uncertain' && <>{tickField('最も早い世界内tick', 'earliest')}{tickField('最も遅い世界内tick', 'latest')}<div className="form-field"><label>精度・理由</label><input aria-label="日時の精度・理由" value={time.precision} onChange={change => updateTime({ ...time, precision: change.target.value })}/></div></>}
    {time.mode === 'relative' && <><div className="form-field"><label>基準となる出来事</label><EntityChoice entities={events} value={time.anchorEventId} excludeId={event.id} label="相対日時の基準" onChange={anchorEventId => updateTime({ ...time, anchorEventId })}/></div><div className="form-field"><label>基準位置</label><select aria-label="相対日時の基準位置" value={time.anchorPoint} onChange={change => updateTime({ ...time, anchorPoint: change.target.value as 'start' | 'end' })}><option value="start">開始から</option><option value="end">終了から</option></select></div><OffsetInputs label="相対日時の差" minimum={time.minOffset} maximum={time.maxOffset} calendar={calendar} onChange={(minOffset, maxOffset) => updateTime({ ...time, minOffset, maxOffset })}/></>}
    {time.mode === 'unknown' && <div className="form-field"><label>未定の理由</label><textarea aria-label="日時未定の理由" value={time.reason} onChange={change => updateTime({ ...time, reason: change.target.value })}/></div>}
    <section className="timeline-constraints"><h3>前後・同時・終了からの時間差</h3><WindowedList items={constraints.map((constraint, i) => ({ id: String(i), constraint }))} scope={`${project.projectId}:${event.id}:time-edit:constraints`} label="日時制約" size={10} render={({ constraint, id }, i) => <div key={id} className="timeline-constraint"><select aria-label={`日時制約${i + 1}の種類`} value={constraint.type} onChange={change => updateConstraint(i, change.target.value === 'end_gap' ? { type: 'end_gap', targetEventId: constraint.targetEventId, minimumTicks: '0', maximumTicks: calendar.ticksPerDay } : { type: change.target.value as 'before' | 'same_start', targetEventId: constraint.targetEventId })}><option value="before">この出来事が先に起こる</option><option value="same_start">同時に始まる</option><option value="end_gap">この出来事の終了からの時間差</option></select><EntityChoice entities={events} value={constraint.targetEventId} excludeId={event.id} label={`日時制約${i + 1}の対象`} onChange={targetEventId => updateConstraint(i, { ...constraint, targetEventId })}/>{constraint.type === 'end_gap' && <OffsetInputs label={`日時制約${i + 1}の時間差`} minimum={constraint.minimumTicks} maximum={constraint.maximumTicks} calendar={calendar} onChange={(minimumTicks, maximumTicks) => updateConstraint(i, { ...constraint, minimumTicks, maximumTicks })}/>}<button type="button" className="button danger small" onClick={() => { setConstraints(previous => previous.filter((_, position) => position !== i)); setRequest(null); }}>この制約を外す</button></div>}/><button type="button" className="button secondary small" onClick={() => { setConstraints(previous => [...previous, { type: 'before', targetEventId: '' }]); setRequest(null); }}>日時制約を追加</button></section>
    <div className="form-field"><label>連動先の扱い</label><select aria-label="日時変更の連動先の扱い" value={move ? 'move' : 'report'} onChange={change => setMove(change.target.value === 'move')}><option value="report">指摘だけ · 絶対日時を固定する</option><option value="move">承認した日時を連動移動する</option></select></div>
    <button type="button" className="button secondary" disabled={busy || Object.values(validFields).some(value => !value)} onClick={() => { setError(''); setRequest({ eventId: event.id, time, constraints }); }}>変更前の影響を確認</button>{base.revision !== project.revision && <p className="field-hint">現在版が更新されています。<button type="button" className="button subtle small" onClick={() => { setBase(project); setRequest({ eventId: event.id, time, constraints }); }}>現在版で差分を再確認</button></p>}
    {preview && <><PreviewTable preview={preview} project={previewProject} movableIds={movable} onMovableChange={move ? setMovable : undefined}/><WorldTimeImpactPreview preview={preview} project={previewProject} point={point} onOpen={onOpen}/></>}
    <div className="modal-actions"><button type="button" className="button secondary" disabled={busy} onClick={onClose}>変更を中止</button><button type="button" className="button primary" disabled={busy || !preview?.canApply} onClick={async () => { if (!preview) return; setBusy(true); setError(''); try { await onSave(applyTimeEditPreview(project, preview), '日時・前後関係と承認済み連動先を一括変更'); onApplied(preview.changes); onClose(); } catch (cause) { setError((cause as Error).message); } finally { setBusy(false); } }}>{busy ? '保存中' : '差分を一括確定'}</button></div>
  </fieldset></Modal>;
}
