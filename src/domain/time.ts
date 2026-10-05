import type { CalendarDefinition, Entity, ID, Tick, TimeSpec, ValidationIssue, ValidationResult } from './types';

export const TICK_PATTERN = /^(?:0|-[1-9][0-9]{0,37}|[1-9][0-9]{0,37})$/;
export const MAX_TICK = 10n ** 38n - 1n;
export const GREGORIAN_CALENDAR: CalendarDefinition = { id: 'proleptic-gregorian-second', name: '先発グレゴリオ暦', kind: 'gregorian', originLabel: '0000-01-01 00:00:00', ticksPerDay: '86400' };
export function isTick(value: unknown): value is Tick { return typeof value === 'string' && TICK_PATTERN.test(value); }
export function parseTick(value: Tick): bigint { if (!isTick(value)) throw new RangeError('tickは38桁以内の正規整数文字列で指定してください。'); return BigInt(value); }
export function toTick(value: bigint): Tick { if (value < -MAX_TICK || value > MAX_TICK) throw new RangeError('tickが38桁の範囲を超えています。'); return value.toString(); }
export function addTicks(a: Tick, b: Tick): Tick { return toTick(parseTick(a) + parseTick(b)); }
export function subtractTicks(a: Tick, b: Tick): Tick { return toTick(parseTick(a) - parseTick(b)); }
export function compareTicks(a: Tick, b: Tick): -1 | 0 | 1 { const x = parseTick(a), y = parseTick(b); return x < y ? -1 : x > y ? 1 : 0; }
export function formatRelativeTick(at: Tick, mainStart: Tick, unit: Tick = '1'): string {
  const delta = parseTick(at) - parseTick(mainStart), divisor = parseTick(unit);
  if (divisor <= 0n) throw new RangeError('表示単位は正の整数です。');
  const negative = delta < 0n, abs = negative ? -delta : delta, quotient = abs / divisor, remainder = abs % divisor;
  return `${negative ? '−' : delta > 0n ? '+' : ''}${quotient}${remainder ? ` + ${remainder}/${divisor}` : ''}`;
}
export function tickToScreen(at: Tick, origin: Tick, ticksPerPixel: Tick, maxPixels = 1_000_000): number {
  const divisor = parseTick(ticksPerPixel);
  if (divisor <= 0n || !Number.isSafeInteger(maxPixels) || maxPixels <= 0) throw new RangeError('描画単位が不正です。');
  const delta = parseTick(at) - parseTick(origin), quotient = delta / divisor;
  if (quotient > BigInt(maxPixels)) return maxPixels;
  if (quotient < -BigInt(maxPixels)) return -maxPixels;
  // Only this derived coordinate converts to Number; original ticks are untouched.
  return Number(quotient) + Number(delta % divisor) / Number(divisor);
}
export function floorDiv(a: bigint, b: bigint): bigint { if (b <= 0n) throw new RangeError('除数は正数です。'); const q = a / b, r = a % b; return r < 0n ? q - 1n : q; }
function mod(a: bigint, b: bigint): bigint { return a - floorDiv(a, b) * b; }
export function isLeapYear(year: bigint): boolean { return mod(year, 4n) === 0n && (mod(year, 100n) !== 0n || mod(year, 400n) === 0n); }
const MONTH_DAYS = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
function gregorianYearStart(year: bigint): bigint {
  // Astronomical year 0 is a leap year; origin is 0000-01-01.
  return 365n * year + floorDiv(year + 3n, 4n) - floorDiv(year + 99n, 100n) + floorDiv(year + 399n, 400n);
}
export interface CalendarDate { year: string; month: number; day: number; tickOfDay?: Tick }
export function validateCalendar(input: unknown, path = 'calendar'): ValidationResult<CalendarDefinition> {
  const fail = (message: string, field = path): ValidationResult<CalendarDefinition> => ({ ok: false, issues: [{ code: 'VALIDATION_FAILED', path: field, message }] });
  if (!input || typeof input !== 'object' || Array.isArray(input)) return fail('暦はオブジェクトです。');
  const cal = input as Record<string, unknown>;
  const allowed = cal.kind === 'repeating' ? ['id', 'name', 'kind', 'originLabel', 'ticksPerDay', 'years'] : ['id', 'name', 'kind', 'originLabel', 'ticksPerDay'];
  if (Object.keys(cal).some(key => !allowed.includes(key))) return fail('暦に未知の項目があります。');
  if (typeof cal.id !== 'string' || !cal.id || typeof cal.name !== 'string' || !cal.name || typeof cal.originLabel !== 'string') return fail('暦のID・名称・原点ラベルが必要です。');
  if (!isTick(cal.ticksPerDay) || parseTick(cal.ticksPerDay) <= 0n) return fail('1日のtick数は正の整数です。', `${path}.ticksPerDay`);
  if (cal.kind === 'gregorian') {
    if (cal.ticksPerDay !== '86400') return fail('標準暦は1日86400tickです。', `${path}.ticksPerDay`);
    return { ok: true, value: input as CalendarDefinition };
  }
  if (cal.kind !== 'repeating' || !Array.isArray(cal.years) || cal.years.length < 1 || cal.years.length > 400) return fail('繰返し暦は1〜400年の周期が必要です。');
  for (let i = 0; i < cal.years.length; i++) {
    const year = cal.years[i];
    if (!year || typeof year !== 'object' || Object.keys(year).some(key => key !== 'months') || !Array.isArray(year.months) || year.months.length < 1 || year.months.length > 24) return fail('1年の月数は1〜24です。', `${path}.years[${i}]`);
    for (let j = 0; j < year.months.length; j++) {
      const month = year.months[j];
      if (!month || typeof month !== 'object' || Object.keys(month).some(key => !['name', 'days'].includes(key)) || typeof month.name !== 'string' || !month.name || !Number.isInteger(month.days) || month.days < 1 || month.days > 400) return fail('月名と1〜400の日数が必要です。', `${path}.years[${i}].months[${j}]`);
    }
  }
  return { ok: true, value: input as CalendarDefinition };
}
export function calendarDateToTick(date: CalendarDate, calendar: CalendarDefinition = GREGORIAN_CALENDAR): Tick {
  const valid = validateCalendar(calendar); if (!valid.ok) throw new RangeError(valid.issues[0].message);
  const year = parseTick(date.year), monthIndex = date.month - 1;
  if (!Number.isInteger(date.month) || !Number.isInteger(date.day)) throw new RangeError('月・日は整数です。');
  let days: bigint;
  if (calendar.kind === 'gregorian') {
    const monthDays = [...MONTH_DAYS]; if (isLeapYear(year)) monthDays[1] = 29;
    if (monthIndex < 0 || monthIndex >= 12 || date.day < 1 || date.day > monthDays[monthIndex]) throw new RangeError('暦に存在しない日付です。');
    days = gregorianYearStart(year) + BigInt(monthDays.slice(0, monthIndex).reduce((a, b) => a + b, 0) + date.day - 1);
  } else {
    const period = BigInt(calendar.years.length), position = Number(mod(year, period));
    const lengths = calendar.years.map(y => y.months.reduce((sum, month) => sum + month.days, 0));
    const months = calendar.years[position].months;
    if (monthIndex < 0 || monthIndex >= months.length || date.day < 1 || date.day > months[monthIndex].days) throw new RangeError('暦に存在しない日付です。');
    days = floorDiv(year, period) * BigInt(lengths.reduce((a, b) => a + b, 0)) + BigInt(lengths.slice(0, position).reduce((a, b) => a + b, 0));
    days += BigInt(months.slice(0, monthIndex).reduce((sum, month) => sum + month.days, 0) + date.day - 1);
  }
  const withinDay = parseTick(date.tickOfDay ?? '0'), ticksPerDay = parseTick(calendar.ticksPerDay);
  if (withinDay < 0n || withinDay >= ticksPerDay) throw new RangeError('時刻は1日のtick範囲内で指定してください。');
  return toTick(days * ticksPerDay + withinDay);
}
export function tickToCalendarDate(tick: Tick, calendar: CalendarDefinition = GREGORIAN_CALENDAR): CalendarDate {
  const valid = validateCalendar(calendar); if (!valid.ok) throw new RangeError(valid.issues[0].message);
  const value = parseTick(tick), ticksPerDay = parseTick(calendar.ticksPerDay), dayNumber = floorDiv(value, ticksPerDay);
  let year: bigint, dayOfYear: number, months: { days: number }[];
  if (calendar.kind === 'gregorian') {
    const cycle = floorDiv(dayNumber, 146097n), cycleStart = cycle * 400n;
    year = cycleStart; const remainder = dayNumber - cycle * 146097n;
    // A bounded loop (at most 400), independent of the size of a world tick.
    while (year < cycleStart + 399n && gregorianYearStart(year + 1n) - cycle * 146097n <= remainder) year++;
    dayOfYear = Number(dayNumber - gregorianYearStart(year));
    months = MONTH_DAYS.map((days, index) => ({ days: index === 1 && isLeapYear(year) ? 29 : days }));
  } else {
    const lengths = calendar.years.map(y => y.months.reduce((sum, month) => sum + month.days, 0)), cycleDays = BigInt(lengths.reduce((a, b) => a + b, 0));
    const cycle = floorDiv(dayNumber, cycleDays); let remainder = Number(mod(dayNumber, cycleDays)), position = 0;
    while (position < lengths.length - 1 && remainder >= lengths[position]) remainder -= lengths[position++];
    year = cycle * BigInt(lengths.length) + BigInt(position); dayOfYear = remainder; months = calendar.years[position].months;
  }
  let month = 0; while (month < months.length - 1 && dayOfYear >= months[month].days) dayOfYear -= months[month++].days;
  return { year: year.toString(), month: month + 1, day: dayOfYear + 1, tickOfDay: mod(value, ticksPerDay).toString() };
}
export function formatCalendarTick(tick: Tick, calendar: CalendarDefinition = GREGORIAN_CALENDAR): string {
  const date = tickToCalendarDate(tick, calendar); return `${date.year}年${date.month}月${date.day}日${date.tickOfDay !== '0' ? ` +${date.tickOfDay} tick` : ''}`;
}
export interface ResolvedTime { status: 'resolved'; earliest: Tick; latest: Tick; endEarliest: Tick; endLatest: Tick; calendarId: string; mode: TimeSpec['mode'] }
export type TimeResolution = ResolvedTime | { status: 'unknown' | 'conflict'; reason: string; path: ID[] };
export function resolveTime(time: TimeSpec, events: Entity<'event'>[] = [], chain: ID[] = []): TimeResolution {
  try {
    if (time.mode === 'unknown') return { status: 'unknown', reason: time.reason || '日時が未定です。', path: chain };
    if (time.mode === 'instant') { parseTick(time.at); return { status: 'resolved', earliest: time.at, latest: time.at, endEarliest: time.at, endLatest: time.at, calendarId: time.calendarId, mode: time.mode }; }
    if (time.mode === 'interval') {
      if (compareTicks(time.start, time.end) >= 0) return { status: 'conflict', reason: '期間は開始より後に終了してください。', path: chain };
      return { status: 'resolved', earliest: time.start, latest: time.start, endEarliest: time.end, endLatest: time.end, calendarId: time.calendarId, mode: time.mode };
    }
    if (time.mode === 'uncertain') {
      if (compareTicks(time.earliest, time.latest) > 0) return { status: 'conflict', reason: '概算範囲が逆転しています。', path: chain };
      return { status: 'resolved', earliest: time.earliest, latest: time.latest, endEarliest: time.earliest, endLatest: time.latest, calendarId: time.calendarId, mode: time.mode };
    }
    if (chain.includes(time.anchorEventId)) return { status: 'conflict', reason: '相対日時の参照が循環しています。', path: [...chain, time.anchorEventId] };
    if (compareTicks(time.minOffset, time.maxOffset) > 0) return { status: 'conflict', reason: '相対日時の範囲が逆転しています。', path: chain };
    const anchor = events.find(event => event.id === time.anchorEventId && !event.deletedAt);
    if (!anchor) return { status: 'unknown', reason: '基準となる出来事がありません。', path: [...chain, time.anchorEventId] };
    const resolved = resolveTime(anchor.data.time, events, [...chain, time.anchorEventId]);
    if (resolved.status !== 'resolved') return resolved;
    const earliest = addTicks(time.anchorPoint === 'start' ? resolved.earliest : resolved.endEarliest, time.minOffset), latest = addTicks(time.anchorPoint === 'start' ? resolved.latest : resolved.endLatest, time.maxOffset);
    return { status: 'resolved', earliest, latest, endEarliest: earliest, endLatest: latest, calendarId: resolved.calendarId, mode: time.mode };
  } catch (error) { return { status: 'conflict', reason: error instanceof Error ? error.message : '日時を解決できません。', path: chain }; }
}
export function validateEventTimes(events: Entity<'event'>[]): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  for (const event of events) {
    const time = resolveTime(event.data.time, events, [event.id]);
    if (time.status === 'conflict') issues.push({ code: 'TIME_CONSTRAINT_CONFLICT', path: `entities.${event.id}.data.time`, message: time.reason });
    for (const constraint of event.data.constraints ?? []) {
      const target = events.find(candidate => candidate.id === constraint.targetEventId); if (!target || time.status !== 'resolved') continue;
      const other = resolveTime(target.data.time, events, [target.id]); if (other.status !== 'resolved') continue;
      let conflict = time.calendarId !== other.calendarId;
      if (constraint.type === 'before') conflict ||= time.mode === 'interval' ? compareTicks(time.endEarliest, other.latest) > 0 : compareTicks(time.endEarliest, other.latest) >= 0;
      else if (constraint.type === 'same_start') conflict ||= compareTicks(time.earliest, other.latest) > 0 || compareTicks(other.earliest, time.latest) > 0;
      else {
        const minGap = parseTick(other.earliest) - parseTick(time.endLatest), maxGap = parseTick(other.latest) - parseTick(time.endEarliest);
        conflict ||= maxGap < parseTick(constraint.minimumTicks) || minGap > parseTick(constraint.maximumTicks);
      }
      if (conflict) issues.push({ code: 'TIME_CONSTRAINT_CONFLICT', path: `entities.${event.id}.data.constraints`, message: '指定した出来事の日時制約と矛盾しています。' });
    }
  }
  // Cyclic dependency constraints cannot be applied even while their dates are unknown.
  const index = new Map(events.map(event => [event.id, event])), colors = new Map<ID, number>();
  for (const event of events) {
    if (colors.get(event.id)) continue;
    const stack: { id: ID; targets: ID[]; cursor: number }[] = [{ id: event.id, targets: (event.data.constraints ?? []).map(constraint => constraint.targetEventId), cursor: 0 }]; colors.set(event.id, 1);
    while (stack.length) {
      const current = stack[stack.length - 1]; if (current.cursor === current.targets.length) { colors.set(current.id, 2); stack.pop(); continue; }
      const targetId = current.targets[current.cursor++], target = index.get(targetId); if (!target) continue;
      if (colors.get(targetId) === 1) issues.push({ code: 'TIME_CONSTRAINT_CONFLICT', path: `entities.${current.id}.data.constraints`, message: '日時制約の依存が循環しています。' });
      else if (!colors.has(targetId)) { colors.set(targetId, 1); stack.push({ id: targetId, targets: (target.data.constraints ?? []).map(constraint => constraint.targetEventId), cursor: 0 }); }
    }
  }
  return issues;
}
