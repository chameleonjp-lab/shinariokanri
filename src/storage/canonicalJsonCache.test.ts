import {describe, expect, it} from 'vitest';
import {canonicalJson, createCanonicalJsonCache, jsonBytes, sha256} from './json';

function scope() {
  const immutable = new WeakSet<object>();
  const freeze = <T>(value: T): T => {
    if (value && typeof value === 'object' && !immutable.has(value)) {
      for (const child of Object.values(value)) freeze(child);
      Object.freeze(value); immutable.add(value);
    }
    return value;
  };
  return {immutable, freeze, cache: createCanonicalJsonCache(value => immutable.has(value))};
}

describe('bounded canonical encodings of store-owned immutable records', () => {
  it('preserves exact old bytes, key and array order, Unicode and omitted fields on repeated saves', async () => {
    const {freeze, cache} = scope();
    const record = freeze({kind: 'character', id: 'old-id', z: undefined,
      data: {order: [3, 1, 2], name: 'アオ😀', empty: null, negativeZero: -0}});
    const expected = '{"data":{"empty":null,"name":"アオ😀","negativeZero":0,"order":[3,1,2]},"id":"old-id","kind":"character"}';
    expect(canonicalJson(record)).toBe(expected);
    for (let index = 0; index < 3; index++) {
      expect(canonicalJson(record, cache)).toBe(expected);
      expect(jsonBytes(record, cache)).toEqual(new TextEncoder().encode(expected));
      expect(await sha256(jsonBytes(record, cache))).toBe(await sha256(new TextEncoder().encode(expected)));
    }
    expect(cache.get(record)).toBe(expected);
    expect(canonicalJson({old: record, same: record}, cache)).toBe(`{"old":${expected},"same":${expected}}`);
  });

  it('observes later changes in mutable and caller shallow-frozen records', () => {
    const {cache} = scope();
    const data = {count: 1};
    const shallow = Object.freeze({id: 'caller', kind: 'event', data});
    expect(canonicalJson(shallow, cache)).toContain('"count":1');
    data.count = 2;
    expect(canonicalJson(shallow, cache)).toContain('"count":2');
    data.count = Number.NaN;
    expect(() => canonicalJson(shallow, cache)).toThrow('有限でない数値');
    expect(cache.get(shallow)).toBeUndefined();
    data.count = 3;
    expect(canonicalJson(shallow, cache)).toContain('"count":3');
  });

  it('rejects invalid Unicode and cycles before caching, and permits an explicit correction', () => {
    const {cache, freeze} = scope();
    const record = {id: 'retry', kind: 'scene', data: {text: '\uD800'}};
    expect(() => canonicalJson(record, cache)).toThrow('Unicode');
    expect(cache.get(record)).toBeUndefined();
    record.data.text = '直した😀'; freeze(record);
    expect(canonicalJson(record, cache)).toBe(canonicalJson(record));
    const cycle: unknown[] = [record]; cycle.push(cycle);
    expect(() => canonicalJson(cycle, cache)).toThrow('循環');
    expect(canonicalJson([record, record], cache)).toBe(canonicalJson([record, record]));
  });

  it('does not cache accessor or prototype objects even if marked by a caller', () => {
    const {cache, immutable} = scope(); let observed = 0;
    const accessor = Object.freeze({id: 'accessor', kind: 'event', get count() { return ++observed; }});
    immutable.add(accessor);
    const first = canonicalJson(accessor, cache), second = canonicalJson(accessor, cache);
    expect(second).not.toBe(first); expect(cache.get(accessor)).toBeUndefined();
    const inherited = Object.freeze(Object.assign(Object.create({base: true}), {id: 'prototype', kind: 'event'}));
    immutable.add(inherited);
    expect(canonicalJson(inherited, cache)).toBe(canonicalJson(inherited));
    expect(cache.get(inherited)).toBeUndefined();
  });

  it('bounds the cache when many historical small records remain live', () => {
    const {freeze, cache} = scope();
    const history = Array.from({length: 16_385}, (_, index) => freeze({id: `history-${index}`, kind: 'event'}));
    for (const record of history) canonicalJson(record, cache);
    expect(cache.get(history[0]!)).toBeUndefined();
    expect(cache.get(history.at(-1)!)).toBe(canonicalJson(history.at(-1)!));
    expect(canonicalJson(history[0]!, cache)).toBe(canonicalJson(history[0]!));
    expect(cache.get(history)).toBeUndefined();
  });

  it('bounds encoded storage and excludes oversized individual values', () => {
    const {freeze, cache} = scope();
    const history = Array.from({length: 600}, (_, index) => freeze({id: `long-${index}`, kind: 'scene', text: 'x'.repeat(30_000)}));
    for (const record of history) canonicalJson(record, cache);
    expect(cache.get(history[0]!)).toBeUndefined();
    expect(cache.get(history.at(-1)!)).toBe(canonicalJson(history.at(-1)!));
    const large = freeze({id: 'large', kind: 'scene', text: '😀'.repeat(20_000)});
    expect(canonicalJson(large, cache)).toBe(canonicalJson(large));
    expect(cache.get(large)).toBeUndefined();
  });
});
