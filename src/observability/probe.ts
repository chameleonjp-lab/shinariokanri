/** Explicit, in-memory, numeric-only research capture. No storage, console or network. */
export const PHASES = [
  'store.list', 'store.read', 'store.fullRead', 'store.save', 'store.history', 'store.export', 'store.import',
  'save.prepare', 'save.read', 'save.hash', 'save.reconcile', 'save.validate', 'save.diff', 'save.database',
  'copy', 'capture', 'normalize', 'targetChanges', 'contentDelta', 'writeContent', 'hydrate', 'decode',
  'validate.current', 'validate.integrity', 'validate.full', 'query.filter', 'query.index', 'reference.choices',
  'ui.filter', 'ui.indices', 'worker.read', 'worker.parts', 'worker.archive', 'ui.startup', 'ui.save',
] as const;
export type ProbePhase = typeof PHASES[number];
const metrics = [
  'db.read.calls', 'db.read.rows', 'db.read.keys', 'db.read.payloadBytes', 'db.read.requested',
  'db.write.calls', 'db.write.attempted', 'db.write.succeeded', 'db.write.committed', 'db.write.aborted',
  'db.write.payloadBytes', 'db.deleteRange.calls', 'db.transaction.committed', 'db.transaction.aborted',
  'hash.calls', 'hash.bytes', 'json.calls', 'json.bytes', 'copy.calls', 'copy.payloadBytes',
  'capture.calls', 'capture.payloadBytes', 'normalize.rows', 'targetChanges.rows', 'contentDelta.rows',
  'writeContent.rows', 'hydrate.rows', 'decode.rows', 'decode.payloadBytes',
  'validate.current.calls', 'validate.integrity.calls', 'validate.full.calls',
  'query.index.builds', 'query.index.rows', 'query.text.rows', 'query.filter.rows',
  'reference.choices.rows', 'reference.index.builds', 'reference.index.rows', 'ui.filter.rows', 'ui.indices.rows',
  'worker.started', 'worker.terminated', 'worker.sent.messages', 'worker.sent.payloadBytes',
  'worker.received.messages', 'worker.received.payloadBytes',
  'cache.projects', 'cache.records', 'cache.payloadBytes', 'cache.invalidated',
  'memo.hit', 'memo.miss', 'probe.size.unknown', 'probe.size.milliseconds',
] as const;
export type ProbeMetric = typeof metrics[number];
export const PROBE_TABLES = ['projects', 'entities', 'relations', 'blocks', 'snapshots', 'commands', 'outbox', 'assets', 'views', 'viewStates', 'syncMetadata', 'acks', 'restorePoints', 'worlds', 'importLogs', 'importDrafts', 'authorToolDrafts', 'workspaceInputs', 'recoveredPending', 'retainedSyncRecovery', 'syncAssetAcks', 'syncBases', 'preparedSync', 'syncConflicts', 'syncAckEvidence', 'sharedSnapshots', 'recordParts'] as const;
export type ProbeTable = typeof PROBE_TABLES[number];
export interface ProbeEvent { sequence: number; phase: ProbePhase; milliseconds: number; outcome: 'ok' | 'error' }
export interface ProbeSnapshot { version: 1; counters: Record<string, number>; events: ProbeEvent[]; droppedEvents: number }
interface Capture { counters: Record<string, number>; events: ProbeEvent[]; droppedEvents: number; sequence: number }
let active: Capture | undefined;
const phaseSet = new Set<string>(PHASES), metricSet = new Set<string>(metrics), tableSet = new Set<string>(PROBE_TABLES);
const clock = () => { try { return performance.now(); } catch { return 0; } };
export const probeEnabled = () => active !== undefined;

/** A capture must be stopped explicitly; it never retains input objects or caller strings. */
export function startProbe() {
  if (active) throw new Error('A numeric capture is already active');
  const capture: Capture = { counters: Object.create(null), events: [], droppedEvents: 0, sequence: 0 };
  active = capture;
  const snapshot = (): ProbeSnapshot => ({ version: 1, counters: { ...capture.counters }, events: capture.events.map(row => ({ ...row })), droppedEvents: capture.droppedEvents });
  return { snapshot, stop() { if (active === capture) active = undefined; return snapshot(); } };
}
function increment(capture: Capture | undefined, metric: ProbeMetric, value: number, table?: ProbeTable) {
  if (!capture || !metricSet.has(metric) || table !== undefined && !tableSet.has(table) || !Number.isFinite(value) || value < 0) return;
  const key = table === undefined ? metric : `${metric}.${table}`;
  const next = (capture.counters[key] ?? 0) + value;
  if (Number.isFinite(next)) capture.counters[key] = next;
}
export function probeCount(metric: ProbeMetric, value = 1, table?: ProbeTable) { increment(active, metric, value, table); }
export function probeGauge(metric: ProbeMetric, value: number) {
  if (active && metricSet.has(metric) && Number.isFinite(value) && value >= 0) active.counters[metric] = value;
}
/** Transaction completions are bound to their original capture, even if another one starts. */
export function probeCounter() {
  const capture = active;
  return (metric: ProbeMetric, value = 1, table?: ProbeTable) => increment(active === capture ? capture : undefined, metric, value, table);
}
export function probeDuration(phase: ProbePhase, milliseconds: number, outcome: 'ok' | 'error' = 'ok') {
  if (!active || !phaseSet.has(phase) || !Number.isFinite(milliseconds) || milliseconds < 0 || !['ok', 'error'].includes(outcome)) return;
  if (active.events.length >= 10_000) { active.droppedEvents++; return; }
  active.events.push({ sequence: active.sequence++, phase, milliseconds, outcome });
}
export function probeSpan(phase: ProbePhase) {
  if (!active || !phaseSet.has(phase)) return (_outcome?: 'ok' | 'error') => {};
  const capture = active, started = clock(); let finished = false;
  return (outcome: 'ok' | 'error' = 'ok') => { if (finished) return; finished = true; if (active === capture) probeDuration(phase, clock() - started, outcome); };
}
export function probeSync<T>(phase: ProbePhase, task: () => T): T {
  if (!active) return task();
  const finish = probeSpan(phase);
  try { const value = task(); finish(); return value; } catch (error) { finish('error'); throw error; }
}

/** Payload estimate: UTF-8 scalar/key bytes plus binary bytes, each object once.
 * Excludes runtime object/IDB/wire overhead. Never invokes getters or JSON hooks.
 * Unsupported/accessor graphs are UNKNOWN, and cannot affect application results. */
export function probePayload(metric: ProbeMetric, input: unknown, table?: ProbeTable) {
  if (!active) return;
  const started = clock();
  try {
    const seen = new WeakSet<object>(), pending: unknown[] = [input], encoder = new TextEncoder();
    let bytes = 0, objects = 0;
    while (pending.length) {
      const value = pending.pop();
      if (typeof value === 'string') { bytes += encoder.encode(value).byteLength; continue; }
      if (value === null || value === undefined) continue;
      if (typeof value === 'number') { bytes += 8; continue; }
      if (typeof value === 'boolean') { bytes++; continue; }
      if (typeof value !== 'object') throw new Error('Unsupported scalar');
      if (seen.has(value)) continue;
      seen.add(value); if (++objects > 2_000_000) throw new Error('Probe budget');
      if (value instanceof ArrayBuffer || ArrayBuffer.isView(value)) { bytes += value.byteLength; continue; }
      if (typeof Blob !== 'undefined' && value instanceof Blob) { bytes += value.size; continue; }
      if (!Array.isArray(value) && Object.getPrototypeOf(value) !== Object.prototype && Object.getPrototypeOf(value) !== null) throw new Error('Unsupported object');
      for (const key of Object.keys(value)) {
        const descriptor = Object.getOwnPropertyDescriptor(value, key)!;
        if (!Object.hasOwn(descriptor, 'value')) throw new Error('Accessor');
        bytes += encoder.encode(key).byteLength; pending.push(descriptor.value);
      }
    }
    probeCount(metric, bytes, table);
  } catch { probeCount('probe.size.unknown'); }
  finally { probeCount('probe.size.milliseconds', Math.max(0, clock() - started)); }
}

export function probeWorkerStart(phase: 'worker.read' | 'worker.parts' | 'worker.archive') {
  const finish = probeSpan(phase), count = probeCounter(); count('worker.started'); let stopped = false;
  return () => { if (!stopped) { stopped = true; count('worker.terminated'); finish(); } };
}
export function probeWorkerMessages() {
  const capture = active;
  return (direction: 'sent' | 'received', value: unknown) => {
    if (!capture || active !== capture) return;
    probeCount(direction === 'sent' ? 'worker.sent.messages' : 'worker.received.messages');
    probePayload(direction === 'sent' ? 'worker.sent.payloadBytes' : 'worker.received.payloadBytes', value);
  };
}
