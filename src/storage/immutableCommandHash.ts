import type {CommandRecord} from '../domain/types';
import {isImmutablePlainData} from '../domain/immutablePlainData';
import {sha256} from './json';
import {createSharedArrayJsonEncoder} from './sharedArrayJson';

const descriptor = Object.getOwnPropertyDescriptor, prototype = Object.getPrototypeOf;
const objectPrototype = Object.prototype, arrayPrototype = Array.prototype;
const numberPrototype = Number.prototype, stringPrototype = String.prototype;
const functionText = Function.prototype.toString;
const intrinsics = () => [JSON.stringify, Object.keys, Object.getOwnPropertyDescriptors, Object.getOwnPropertyDescriptor,
  Object.getPrototypeOf, Object.hasOwn, Object.isFrozen, Reflect.ownKeys, Array.isArray,
  Array.prototype.every, Array.prototype.forEach, Array.prototype.filter, Array.prototype.sort,
  Array.prototype.slice, Array.prototype.map, Array.prototype.join, Array.prototype.push,
  TextEncoder, TextEncoder.prototype.encode, Uint8Array, Uint8Array.prototype.set, Uint8Array.prototype.slice,
  Uint8Array.prototype[Symbol.iterator], Number.isFinite, Number.prototype.toString,
  String.prototype.charCodeAt, String.prototype.padStart, crypto.subtle, crypto.subtle.digest,
  Map.prototype.get, Map.prototype.set, Map.prototype.has, Map.prototype.delete, Map.prototype.keys,
  WeakMap.prototype.get, WeakMap.prototype.set, WeakSet.prototype.has, WeakSet.prototype.add];
const originals = intrinsics();

function stableEncoding(): boolean {
  const current = intrinsics();
  if (current.length !== originals.length) return false;
  for (let index = 0; index < current.length; index++) if (current[index] !== originals[index]) return false;
  return /\[native code\]/.test(functionText.call(JSON.stringify))
    && prototype(objectPrototype) === null && prototype(arrayPrototype) === objectPrototype
    && descriptor(objectPrototype, 'toJSON') === undefined && descriptor(arrayPrototype, 'toJSON') === undefined
    && descriptor(numberPrototype, 'toJSON') === undefined && descriptor(stringPrototype, 'toJSON') === undefined;
}

/** Only a real successful digest of the exact, recursively immutable command
 * can be reused. This is independent of IDs, declared hashes and validation.
 * Mutable/unsupported data and changed encoding behavior use fresh digests. */
export function createImmutableCommandHasher() {
  let hashes = new WeakMap<CommandRecord, string>(), count = 0, encode = createSharedArrayJsonEncoder();
  const clear = () => { hashes = new WeakMap(); count = 0; encode = createSharedArrayJsonEncoder(); };
  return async (command: CommandRecord): Promise<string> => {
    const reusable = stableEncoding() && isImmutablePlainData(command);
    if (!reusable) clear();
    const cached = reusable ? hashes.get(command) : undefined;
    if (cached !== undefined) return cached;
    const result = await sha256(encode(command));
    // An asynchronous digest lets other code change realm behavior. Never
    // publish a reusable proof across that change or retain partial work.
    if (reusable && stableEncoding()) {
      if (count >= 4096) { hashes = new WeakMap(); count = 0; }
      hashes.set(command, result); count++;
    } else clear();
    return result;
  };
}
