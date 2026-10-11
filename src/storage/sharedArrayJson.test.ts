import { describe, expect, it } from 'vitest';
import { captureImmutablePlainData, freezeCapturedPlainData, isImmutablePlainData } from '../domain/immutablePlainData';
import { jsonBytes, sha256 } from './json';
import { createSharedArrayJsonEncoder } from './sharedArrayJson';

describe('canonical pending-command bytes with shared ordered collections', () => {
  it('retains exact ordered bytes when edits share records across different large arrays and segment boundaries', async () => {
    const records = captureImmutablePlainData(Array.from({ length: 193 }, (_, index) => ({ id: `record-${index}`, value: index, text: '😀e\u0301', omitted: undefined }))).value;
    const encode = createSharedArrayJsonEncoder();
    for (const changedAt of [0, 1, 63, 64, 65, 127, 128, 192]) {
      const after = [...records]; after[changedAt] = { ...records[changedAt], text: `変更${changedAt}😀` };
      const input = captureImmutablePlainData({ before: records, after }).value;
      expect(encode(input)).toEqual(jsonBytes(input));
      expect(await sha256(encode(input))).toBe(await sha256(jsonBytes(input)));
    }
    // The same first object does not prove that later items or segment length
    // match. Nor may a previous ordering substitute for this array's ordering.
    for (const array of [records.slice(0, 64), records.slice(0, 65), [records[0], ...records.slice(1).reverse()], records.map((item, index) => index === 1 ? records[0] : item)]) {
      const input = captureImmutablePlainData(array).value;
      expect(encode(input)).toEqual(jsonBytes(input));
    }
    const scalars = captureImmutablePlainData(Array.from({ length: 128 }, (_, index) => index % 2 ? '😀' : index)).value;
    expect(encode(scalars)).toEqual(jsonBytes(scalars)); expect(encode(records)).toEqual(jsonBytes(records));
  });

  it('retains every old byte and hash for header changes, Unicode and ordered record variants', async () => {
    const records = Array.from({ length: 67 }, (_, index) => ({ id: `record-${index}`, kind: 'scene',
      data: { text: '😀e\u0301\n"引用"', zero: -0, value: index, omitted: undefined }, enabled: index % 2 === 0 }));
    const source = { before: { revision: '0', name: '旧名', entities: records }, after: { name: '新名', entities: records, revision: '1' } };
    const captured = captureImmutablePlainData(source);
    expect(captured.captured).toBe(true); expect(captured.value.before.entities).toBe(captured.value.after.entities);
    expect(Object.isFrozen(source.before)).toBe(false); expect(source.before.entities).toBe(records);
    expect(Object.hasOwn(captured.value.before.entities[0].data, 'omitted')).toBe(true);
    const encode = createSharedArrayJsonEncoder();
    for (let revision = 1; revision <= 6; revision++) {
      const next = { ...captured.value, after: { ...captured.value.after, revision: String(revision) } };
      freezeCapturedPlainData(next);
      expect(encode(next)).toEqual(jsonBytes(next));
      expect(await sha256(encode(next))).toBe(await sha256(jsonBytes(next)));
    }
    const reversed = captureImmutablePlainData({ ...source, after: { ...source.after, entities: [...records].reverse() } }).value;
    expect(encode(reversed)).toEqual(jsonBytes(reversed)); expect(encode(reversed)).not.toEqual(jsonBytes(source));
    const result = encode(captured.value); result.fill(0);
    expect(encode(captured.value)).toEqual(jsonBytes(source));
  });

  it('rechecks mutable and shallow-frozen inputs instead of trusting their identity', () => {
    const records = Array.from({ length: 64 }, (_, index) => ({ id: `item-${index}`, value: index }));
    const input = Object.freeze({ records });
    const encode = createSharedArrayJsonEncoder();
    expect(isImmutablePlainData(input)).toBe(false); expect(encode(input)).toEqual(jsonBytes(input));
    records[0].value = 999; records.reverse();
    expect(encode(input)).toEqual(jsonBytes(input));
    const first = captureImmutablePlainData(input).value;
    records[0].value = 1001;
    const second = captureImmutablePlainData(input).value;
    expect(encode(first)).not.toEqual(encode(second));
    expect(encode(first)).toEqual(jsonBytes(first)); expect(encode(second)).toEqual(jsonBytes(second));
  });

  it('keeps accessor/prototype/sparse behavior and canonical rejection on the old path', () => {
    const encode = createSharedArrayJsonEncoder();
    const getter = () => { let calls = 0; const value = Object.freeze(Object.defineProperty({}, 'changing', { enumerable: true, get: () => ++calls })); return { value, calls: () => calls }; };
    const old = getter(), current = getter();
    expect(isImmutablePlainData(current.value)).toBe(false); expect(current.calls()).toBe(0);
    expect(encode(current.value)).toEqual(jsonBytes(old.value)); expect(current.calls()).toBe(old.calls());
    for (const value of [Object.freeze(new Date('2026-10-10T00:00:00Z')), new Array(3), Object.create({ inherited: true })]) {
      expect(isImmutablePlainData(value)).toBe(false); expect(encode(value)).toEqual(jsonBytes(value));
    }
    const cyclic: Record<string, unknown> = {}; cyclic.self = cyclic; Object.freeze(cyclic);
    expect(captureImmutablePlainData(cyclic).captured).toBe(false);
    for (const value of [cyclic, undefined, [undefined], NaN, Infinity, 1n, '\ud800']) {
      expect(() => encode(value)).toThrow(); expect(() => jsonBytes(value)).toThrow();
    }
  });

  it('keeps exact hashes after bounded cache eviction for many distinct arrays and multibyte content', async () => {
    const encode = createSharedArrayJsonEncoder();
    const oldest = captureImmutablePlainData(Array.from({ length: 64 }, (_, index) => ({ id: `first-${index}`, text: '😀e\u0301' }))).value;
    const original = await sha256(jsonBytes(oldest));
    expect(await sha256(encode(oldest))).toBe(original);
    for (let variant = 0; variant < 130; variant++) {
      const next = captureImmutablePlainData(Array.from({ length: 64 }, (_, index) => ({ id: `${variant}-${index}`, text: '😀e\u0301' }))).value;
      expect(encode(next)).toEqual(jsonBytes(next));
    }
    expect(await sha256(encode(oldest))).toBe(original);
    // Ten different arrays exceed the cache's 64 MiB UTF-8 payload budget.
    // All canonical bytes are still provided; eviction never becomes a data
    // limit or permission to omit a complete command's bytes.
    const text = '😀e\u0301'.repeat(16_384);
    for (let variant = 0; variant < 10; variant++) {
      const next = captureImmutablePlainData(Array.from({ length: 64 }, (_, index) => ({ id: `large-${variant}-${index}`, text }))).value;
      expect(await sha256(encode(next))).toBe(await sha256(jsonBytes(next)));
    }
    expect(await sha256(encode(oldest))).toBe(original);
  });
});
