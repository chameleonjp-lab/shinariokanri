import { describe, expect, it } from 'vitest';
import { freezeCapturedPlainData, freezeCapturedPlainDataAsync, isImmutablePlainData } from './immutablePlainData';

const privateGraph = () => {
  const shared = { text: '😀共有本文', values: [null, -0, true] };
  return { records: Array.from({ length: 20_000 }, (_, id) => ({ id, name: `資料${id}`, shared })), shared };
};

describe('responsive immutability proof for private native export captures', () => {
  it('keeps a timer running through complete proof/freeze, preserving identities and author data', async () => {
    const author = privateGraph(), captured = structuredClone(author);
    let ticks = 0, largestGap = 0, previous = performance.now();
    const timer = setInterval(() => { const now = performance.now(); ticks++; largestGap = Math.max(largestGap, now - previous); previous = now; }, 0);
    try { expect(await freezeCapturedPlainDataAsync(captured)).toBe(true); }
    finally { clearInterval(timer); }
    expect(ticks).toBeGreaterThan(0); expect(largestGap).toBeLessThanOrEqual(2000);
    expect(isImmutablePlainData(captured)).toBe(true);
    expect(captured.records[0].shared).toBe(captured.shared); expect(captured.records.at(-1)!.shared).toBe(captured.shared);
    expect(Object.isFrozen(captured.records)).toBe(true); expect(Object.isFrozen(captured.shared.values)).toBe(true);
    expect(Object.isFrozen(author)).toBe(false); expect(Object.isFrozen(author.records[0])).toBe(false);
    author.records[0].name = '後の作者編集'; expect(captured.records[0].name).toBe('資料0');
  });

  it('cancels during the read-only proof before freezing any private data and allows a fresh retry', async () => {
    const captured = privateGraph(), controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 0);
    try { await expect(freezeCapturedPlainDataAsync(captured, controller.signal)).rejects.toMatchObject({ code: 'CANCELLED' }); }
    finally { clearTimeout(timer); }
    for (const value of [captured, captured.records, captured.records[0], captured.records.at(-1), captured.shared, captured.shared.values]) expect(Object.isFrozen(value)).toBe(false);
    expect(await freezeCapturedPlainDataAsync(captured)).toBe(true);
    const untouched = { child: {} }, aborted = new AbortController(); aborted.abort();
    await expect(freezeCapturedPlainDataAsync(untouched, aborted.signal)).rejects.toMatchObject({ code: 'CANCELLED' });
    expect(Object.isFrozen(untouched.child)).toBe(false);
  });

  it.each([
    ['synchronous private capture', freezeCapturedPlainData],
    ['responsive private capture', freezeCapturedPlainDataAsync],
  ] as const)('%s rejects unsafe language, active cycles and excess depth without reading accessors or partially freezing a safe prefix', async (_name, freeze) => {
    let reads = 0; const accessor = { get value() { reads++; return '作者のlive値'; } };
    const cyclic: { next?: unknown } = {}; cyclic.next = cyclic;
    const deep: Record<string, unknown> = {}; let cursor = deep;
    for (let index = 0; index < 129; index++) { const child = {}; cursor.child = child; cursor = child; }
    const symbol = { [Symbol('unsupported')]: true }, nonEnumerable = Object.defineProperty({}, 'hidden', { value: 1 });
    for (const unsafe of [accessor, cyclic, deep, new Array(3), Object.assign([1], { extra: true }), new Date(), Object.create({ inherited: true }), symbol, nonEnumerable, { constructor: 'opaque' }]) {
      const safe = { child: { value: '😀未変更' } }, captured = { safe, unsafe };
      expect(await freeze(captured)).toBe(false);
      expect(Object.isFrozen(captured)).toBe(false); expect(Object.isFrozen(safe)).toBe(false); expect(Object.isFrozen(safe.child)).toBe(false);
    }
    expect(reads).toBe(0);
    const shared = { value: '共有するだけの非循環' };
    expect(await freeze({ first: shared, second: shared })).toBe(true);
  });

  it('preserves every own value, ordered image and shared identity when freezing a wide native capture', () => {
    const metadata = Object.assign(Object.create(null), { present: undefined, zero: -0, label: '😀原文' });
    const records = Array.from({ length: 20_000 }, (_, id) => ({ id, metadata }));
    const later = records.slice(); later[19_999] = { id: 20_000, metadata };
    const captured = { before: records, after: later, retained: records, metadata };
    const keys = Object.keys(metadata);
    expect(freezeCapturedPlainData(captured)).toBe(true);
    expect(isImmutablePlainData(captured)).toBe(true);
    expect(captured.before).toBe(captured.retained);
    expect(captured.after).not.toBe(captured.before);
    expect(captured.before.map(row => row.id)).toEqual(Array.from({ length: 20_000 }, (_, id) => id));
    expect(captured.after.map(row => row.id)).toEqual([...Array.from({ length: 19_999 }, (_, id) => id), 20_000]);
    expect(captured.after[0]).toBe(captured.before[0]);
    expect(captured.after.at(-1)).not.toBe(captured.before.at(-1));
    expect(captured.after.at(-1)!.metadata).toBe(captured.metadata);
    expect(Object.getPrototypeOf(captured.metadata)).toBe(null);
    expect(Object.keys(captured.metadata)).toEqual(keys);
    expect(Object.hasOwn(captured.metadata, 'present')).toBe(true);
    expect(captured.metadata.present).toBeUndefined();
    expect(Object.is(captured.metadata.zero, -0)).toBe(true);
    expect(captured.metadata.label).toBe('😀原文');
    expect(Object.isFrozen(captured.before.at(-1))).toBe(true);
    expect(Object.isFrozen(captured.after)).toBe(true);
  });
});
