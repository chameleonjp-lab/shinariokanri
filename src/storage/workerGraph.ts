import { checkCancelled, StorageError } from './errors';

type Value = { reference: number } | { value: unknown };
export interface WorkerGraphChunk {
  type: 'graph-chunk';
  declarations: { id: number; arrayLength?: number; nullPrototype?: boolean }[];
  properties: { id: number; key: string; value: Value }[];
}

/** The caller owns an immutable plain capture. Send every own value once,
 * preserving aliases, while returning to the browser between bounded chunks.
 * This is an internal worker transport, never a saved format or a data limit. */
export async function sendWorkerGraph(value: object, post: (chunk: WorkerGraphChunk | { type: 'graph-end'; root: number }) => void,
  signal?: AbortSignal, live: () => boolean = () => true): Promise<void> {
  const seen = new WeakMap<object, number>();
  type Frame = { value: object; id: number; keys?: string[]; index: number };
  const frames: (Frame | undefined)[] = [];
  let chunk: WorkerGraphChunk = { type: 'graph-chunk', declarations: [], properties: [] }, estimatedBytes = 0;
  const reference = (input: unknown): Value => {
    if (input === null || typeof input !== 'object') return { value: input };
    let id = seen.get(input);
    if (id === undefined) {
      id = frames.length; seen.set(input, id);
      frames.push({ value: input, id, keys: Array.isArray(input) ? undefined : Object.keys(input), index: 0 });
      chunk.declarations.push({ id, ...(Array.isArray(input) ? { arrayLength: input.length } : Object.getPrototypeOf(input) === null ? { nullPrototype: true } : {}) });
    }
    return { reference: id };
  };
  const root = reference(value) as { reference: number };
  const flush = async () => {
    checkCancelled(signal); if (!live()) throw new StorageError('CANCELLED', '保存の受渡しを取り消しました。');
    post(chunk); chunk = { type: 'graph-chunk', declarations: [], properties: [] }; estimatedBytes = 0;
    await new Promise<void>(resolve => setTimeout(resolve, 0));
    checkCancelled(signal); if (!live()) throw new StorageError('CANCELLED', '保存の受渡しを取り消しました。');
  };
  for (let index = 0; index < frames.length; index++) {
    const frame = frames[index]!;
    const length = frame.keys?.length ?? (frame.value as unknown[]).length;
    while (frame.index < length) {
      const key = frame.keys?.[frame.index] ?? String(frame.index);
      const descriptor = Object.getOwnPropertyDescriptor(frame.value, key);
      if (!descriptor || !Object.hasOwn(descriptor, 'value')) throw new StorageError('SAVE_FAILED', '固定した保存内容が変更されています。');
      chunk.properties.push({ id: frame.id, key, value: reference(descriptor.value) });
      estimatedBytes += key.length * 2 + (typeof descriptor.value === 'string' ? descriptor.value.length * 2 : 32);
      frame.index++;
      // A bounded 256KiB message can contain thousands of short references.
      // Avoid one browser timer per 512 properties while retaining the same
      // byte bound and returning to real UI/cancel tasks between messages.
      if (chunk.properties.length >= 4096 || estimatedBytes >= 256 * 1024) await flush();
    }
    frames[index] = undefined;
  }
  if (chunk.declarations.length || chunk.properties.length) await flush();
  checkCancelled(signal); if (!live()) throw new StorageError('CANCELLED', '保存の受渡しを取り消しました。');
  post({ type: 'graph-end', root: root.reference });
}

/** Only complete transport graphs reach the existing export validator. */
export class WorkerGraphReceiver {
  private readonly values = new Map<number, Record<string, unknown> | unknown[]>();
  accept(chunk: WorkerGraphChunk): void {
    for (const row of chunk.declarations) {
      if (!Number.isSafeInteger(row.id) || row.id < 0 || this.values.has(row.id)
        || row.arrayLength !== undefined && (!Number.isSafeInteger(row.arrayLength) || row.arrayLength < 0)) throw new StorageError('SAVE_FAILED', '保存の受渡し情報が不正です。');
      this.values.set(row.id, row.arrayLength === undefined ? Object.create(row.nullPrototype ? null : Object.prototype) : new Array(row.arrayLength));
    }
    for (const row of chunk.properties) {
      const target = this.values.get(row.id);
      if (!target || ['__proto__', 'constructor', 'prototype'].includes(row.key) || Object.hasOwn(target, row.key)
        || Array.isArray(target) && (!/^(0|[1-9]\d*)$/.test(row.key) || Number(row.key) >= target.length)) throw new StorageError('SAVE_FAILED', '保存の受渡し項目が不正です。');
      const value = 'reference' in row.value ? this.values.get(row.value.reference) : row.value.value;
      if ('reference' in row.value && value === undefined) throw new StorageError('SAVE_FAILED', '保存の受渡し参照が不足しています。');
      Object.defineProperty(target, row.key, { value, enumerable: true, writable: true, configurable: true });
    }
  }
  finish(root: number): unknown {
    const value = this.values.get(root);
    if (!value) throw new StorageError('SAVE_FAILED', '保存の受渡し内容がありません。');
    this.values.clear(); return value;
  }
}
