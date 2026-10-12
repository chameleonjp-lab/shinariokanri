import {freezeCapturedPlainData, isImmutablePlainData} from './immutablePlainData';

/** This scope owns immutable input. A typed ID only chooses candidates; every
 * own value, prototype, undefined property and signed zero must match before
 * records share identity. No digest or previous validation result is trusted. */
export function internImmutableRecords<T>(input: T): T {
  if (!isImmutablePlainData(input)) return input;
  const copied = new WeakMap<object, unknown>(), candidates = new Map<string, object[]>();
  let count = 0;
  const equal = (left: unknown, right: unknown, seen = new WeakMap<object, WeakSet<object>>()): boolean => {
    if (Object.is(left, right)) return true;
    if (!left || !right || typeof left !== 'object' || typeof right !== 'object'
      || Object.getPrototypeOf(left) !== Object.getPrototypeOf(right)) return false;
    if (seen.get(left)?.has(right)) return true;
    const keys = Reflect.ownKeys(left);
    if (keys.length !== Reflect.ownKeys(right).length || keys.some(key => !Object.hasOwn(right, key))) return false;
    let pairs = seen.get(left); if (!pairs) { pairs = new WeakSet(); seen.set(left, pairs); } pairs.add(right);
    return keys.every(key => equal((left as Record<PropertyKey, unknown>)[key], (right as Record<PropertyKey, unknown>)[key], seen));
  };
  const visit = (value: unknown, depth = 0): unknown => {
    if (!value || typeof value !== 'object' || depth > 128) return value;
    if (copied.has(value)) return copied.get(value);
    const row = value as Record<string, unknown>;
    const record = typeof row.id === 'string' && typeof row.projectId === 'string'
      && (typeof row.kind === 'string' && !!row.data && typeof row.data === 'object'
        || typeof row.relationType === 'string' && typeof row.fromId === 'string' && typeof row.toId === 'string');
    if (record) {
      const key = `${row.projectId}:${row.kind ?? row.relationType}:${row.id}`, bucket = candidates.get(key);
      const previous = bucket?.find(candidate => equal(value, candidate));
      if (previous) { copied.set(value, previous); return previous; }
      // Bound additional retained references. Overflow resumes exact uncached
      // comparison in a new scope; it does not change any data or format limit.
      if (count >= 100_000) { candidates.clear(); count = 0; }
      if (candidates.has(key)) candidates.get(key)!.unshift(value);
      else candidates.set(key, [value]);
      count++; copied.set(value, value); return value;
    }
    const result: unknown[] | Record<string, unknown> = Array.isArray(value) ? new Array(value.length) : Object.create(Object.getPrototypeOf(value));
    copied.set(value, result);
    for (const key of Object.keys(value)) Object.defineProperty(result, key, {value: visit(row[key], depth + 1), enumerable: true, writable: true, configurable: true});
    return result;
  };
  const result = visit(input) as T;
  return freezeCapturedPlainData(result) ? result : input;
}
