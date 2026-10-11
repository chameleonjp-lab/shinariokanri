// This is an immutability proof, never a schema/permission/acceptance proof.
// Only recursively frozen, plain own-data graphs can share work. Dates,
// accessors, prototypes, sparse arrays and cycles retain their old path.
const proven = new WeakSet<object>();

function plainGraph(value: unknown, frozen: boolean, active = new WeakSet<object>(), visited = new WeakSet<object>(), depth = 0): boolean {
  if (depth > 128) return false;
  if (value === null || typeof value !== 'object') return !['function', 'symbol', 'bigint'].includes(typeof value);
  if (proven.has(value)) return true;
  if (active.has(value)) return false;
  if (visited.has(value)) return true;
  const array = Array.isArray(value), prototype = Object.getPrototypeOf(value);
  if (array ? prototype !== Array.prototype : prototype !== Object.prototype && prototype !== null) return false;
  if (frozen && !Object.isFrozen(value)) return false;
  const descriptors = Object.getOwnPropertyDescriptors(value), keys = Reflect.ownKeys(value);
  if (keys.some(key => typeof key !== 'string' || ['__proto__', 'constructor', 'prototype'].includes(key))) return false;
  if (array && (keys.length !== value.length + 1 || keys.some(key => key !== 'length' && (!/^(0|[1-9]\d*)$/.test(String(key)) || Number(key) >= value.length)))) return false;
  active.add(value);
  for (const key of keys as string[]) {
    if (array && key === 'length') continue;
    const descriptor = descriptors[key];
    if (!descriptor.enumerable || !Object.hasOwn(descriptor, 'value') || !plainGraph(descriptor.value, frozen, active, visited, depth + 1)) {
      active.delete(value); return false;
    }
  }
  active.delete(value); visited.add(value);
  if (frozen) proven.add(value);
  return true;
}

export function isImmutablePlainData(value: unknown): boolean {
  return plainGraph(value, true);
}

/** Call only on an already privately captured graph, never the author's input. */
export function freezeCapturedPlainData<T>(value: T): boolean {
  if (!plainGraph(value, false)) return false;
  const freeze = (item: unknown): void => {
    if (!item || typeof item !== 'object' || proven.has(item)) return;
    for (const [key, descriptor] of Object.entries(Object.getOwnPropertyDescriptors(item))) {
      if (Array.isArray(item) && key === 'length') continue;
      freeze(descriptor.value);
    }
    Object.freeze(item); proven.add(item);
  };
  freeze(value); return true;
}

/** Preserve all own values and shared identities without invoking an accessor.
 * Unsupported language stays on its existing validation/encoding path. */
export function captureImmutablePlainData<T>(value: T): { value: T; captured: boolean } {
  if (isImmutablePlainData(value)) return { value, captured: true };
  if (!plainGraph(value, false)) return { value, captured: false };
  const copies = new WeakMap<object, object>();
  const copy = (item: unknown): unknown => {
    if (!item || typeof item !== 'object') return item;
    if (proven.has(item)) return item;
    const previous = copies.get(item); if (previous) return previous;
    const result = Array.isArray(item) ? new Array(item.length) : Object.create(Object.getPrototypeOf(item));
    copies.set(item, result);
    for (const [key, descriptor] of Object.entries(Object.getOwnPropertyDescriptors(item))) {
      if (Array.isArray(item) && key === 'length') continue;
      Object.defineProperty(result, key, { value: copy(descriptor.value), enumerable: true });
    }
    Object.freeze(result); proven.add(result); return result;
  };
  return { value: copy(value) as T, captured: true };
}
