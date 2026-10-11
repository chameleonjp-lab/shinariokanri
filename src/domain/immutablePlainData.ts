// This is an immutability proof, never a schema/permission/acceptance proof.
// Only recursively frozen, plain own-data graphs can share work. Dates,
// accessors, prototypes, sparse arrays and cycles retain their old path.
import { checkCancelled } from '../storage/errors';
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

/** The main thread owns a private database read image. Prove its entire
 * plain-data graph before freezing anything, and yield during both passes.
 * Descriptor reads are incremental: a Large ordered array never allocates
 * its complete descriptor map in one synchronous operation. */
export async function freezeCapturedPlainDataAsync<T>(value: T, signal?: AbortSignal): Promise<boolean> {
  type Frame = { value: object; keys: (string | symbol)[]; index: number; depth: number; array: boolean };
  const active = new WeakSet<object>(), complete = new WeakSet<object>(), frames: Frame[] = [], ordered: object[] = [];
  let deadline = performance.now() + 16, operations = 0;
  const shouldYield = () => ++operations % 128 === 0 && performance.now() >= deadline;
  const yieldTask = async () => {
    checkCancelled(signal);
    await new Promise<void>(resolve => setTimeout(resolve, 0));
    checkCancelled(signal); deadline = performance.now() + 16;
  };
  const enter = (input: unknown, depth: number): boolean => {
    if (depth > 128) return false;
    if (input === null || typeof input !== 'object') return !['function', 'symbol', 'bigint'].includes(typeof input);
    if (proven.has(input)) return true;
    if (active.has(input)) return false;
    if (complete.has(input)) return true;
    const array = Array.isArray(input), prototype = Object.getPrototypeOf(input);
    if (array ? prototype !== Array.prototype : prototype !== Object.prototype && prototype !== null) return false;
    const keys = Reflect.ownKeys(input);
    if (array && keys.length !== input.length + 1) return false;
    active.add(input); frames.push({ value: input, keys, index: 0, depth, array });
    return true;
  };
  checkCancelled(signal);
  if (!enter(value, 0)) return false;
  while (frames.length) {
    const frame = frames.at(-1)!;
    if (frame.index === frame.keys.length) {
      frames.pop(); active.delete(frame.value); complete.add(frame.value); ordered.push(frame.value);
    } else {
      const key = frame.keys[frame.index++]!;
      if (typeof key !== 'string' || ['__proto__', 'constructor', 'prototype'].includes(key)) return false;
      if (frame.array && key === 'length') continue;
      if (frame.array && (!/^(0|[1-9]\d*)$/.test(key) || Number(key) >= (frame.value as unknown[]).length)) return false;
      const descriptor = Object.getOwnPropertyDescriptor(frame.value, key);
      if (!descriptor?.enumerable || !Object.hasOwn(descriptor, 'value') || !enter(descriptor.value, frame.depth + 1)) return false;
    }
    if (shouldYield()) await yieldTask();
  }
  checkCancelled(signal);
  // This point is reached only after every reachable own value passed. An
  // unsupported graph or a cancelled proof has not frozen any input object.
  for (const item of ordered) {
    Object.freeze(item); proven.add(item);
    if (shouldYield()) await yieldTask();
  }
  checkCancelled(signal);
  return true;
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
