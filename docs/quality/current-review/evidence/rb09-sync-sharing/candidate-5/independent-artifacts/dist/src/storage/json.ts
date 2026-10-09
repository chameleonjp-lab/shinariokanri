import { StorageError } from './errors';

export const FORMAT_VERSION = '1.0.0' as const;
export const ARCHIVE_LIMITS = Object.freeze({
  compressedBytes: 64 * 1024 * 1024,
  expandedBytes: 256 * 1024 * 1024,
  jsonBytes: 64 * 1024 * 1024,
  assetBytes: 32 * 1024 * 1024,
  files: 5_000,
  records: 100_000,
  depth: 32,
  objects: 500_000,
  conditionDepth: 16,
  conditionNodes: 256,
  fieldBytes: 1024 * 1024,
});
export type ArchiveLimits = Record<keyof typeof ARCHIVE_LIMITS, number>;
export type LimitOverrides = Partial<Record<keyof ArchiveLimits, number>>;

/** Tests may lower limits; callers cannot silently raise the v1 safety contract. */
export function resolveLimits(overrides: LimitOverrides = {}): ArchiveLimits {
  const result = { ...ARCHIVE_LIMITS } as Record<keyof ArchiveLimits, number>;
  for (const [key, value] of Object.entries(overrides)) {
    if (!(key in result) || !Number.isSafeInteger(value) || value! < 1 || value! > result[key as keyof ArchiveLimits]) {
      throw new StorageError('LIMIT_EXCEEDED', 'v1の安全上限は引き上げられません。', key);
    }
    result[key as keyof ArchiveLimits] = value!;
  }
  return result as ArchiveLimits;
}

export function isValidUnicode(value: string): boolean {
  for (let i = 0; i < value.length; i++) {
    const code = value.charCodeAt(i);
    if (code >= 0xd800 && code <= 0xdbff) {
      const next = value.charCodeAt(++i);
      if (!(next >= 0xdc00 && next <= 0xdfff)) return false;
    } else if (code >= 0xdc00 && code <= 0xdfff) return false;
  }
  return true;
}

/** Parse while checking duplicate keys and structural quotas, before building an unchecked object graph. */
export interface JsonBudget { objects: number }
export function parseStrictJson(bytes: Uint8Array, path: string, limits: ArchiveLimits = ARCHIVE_LIMITS, budget: JsonBudget = { objects: 0 }): unknown {
  if (bytes.byteLength > limits.jsonBytes) throw new StorageError('LIMIT_EXCEEDED', 'JSONファイルが上限を超えています。', path);
  if (bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf) throw new StorageError('ARCHIVE_INVALID', 'JSONのBOMは使用できません。', path);
  let source: string;
  try { source = new TextDecoder('utf-8', { fatal: true }).decode(bytes); }
  catch (error) { throw new StorageError('ARCHIVE_INVALID', 'JSONは有効なUTF-8である必要があります。', path, { cause: error }); }
  let offset = 0;
  const invalid = (message: string): never => { throw new StorageError('ARCHIVE_INVALID', `${message}（位置 ${offset}）`, path); };
  const whitespace = () => { while (/[ \t\n\r]/.test(source[offset] ?? '') && offset < source.length) offset++; };
  function string(): string {
    const begin = offset++;
    while (offset < source.length) {
      const char = source[offset++];
      if (char === '"') {
        let value: string;
        try { value = JSON.parse(source.slice(begin, offset)) as string; }
        catch { return invalid('文字列が不正です。'); }
        if (!isValidUnicode(value)) return invalid('Unicodeのサロゲートが不正です。');
        return value;
      }
      if (char === '\\') offset++;
    }
    return invalid('文字列が閉じられていません。');
  }
  function value(depth: number): unknown {
    whitespace();
    const char = source[offset];
    if (char === '"') return string();
    if (char === '{' || char === '[') {
      if (depth > limits.depth || ++budget.objects > limits.objects) throw new StorageError('LIMIT_EXCEEDED', 'JSONの構造が安全上限を超えています。', path);
      const object = char === '{';
      offset++; whitespace();
      const end = object ? '}' : ']';
      const result: Record<string, unknown> | unknown[] = object ? Object.create(null) as Record<string, unknown> : [];
      const keys = new Set<string>();
      if (source[offset] === end) { offset++; return result; }
      while (offset < source.length) {
        whitespace();
        if (object) {
          if (source[offset] !== '"') return invalid('オブジェクトのkeyが不正です。');
          const key = string();
          if (keys.has(key)) return invalid(`key「${key}」が重複しています。`);
          keys.add(key); whitespace();
          if (source[offset++] !== ':') return invalid('keyの後にコロンが必要です。');
          (result as Record<string, unknown>)[key] = value(depth + 1);
        } else (result as unknown[]).push(value(depth + 1));
        whitespace();
        const delimiter = source[offset++];
        if (delimiter === end) return result;
        if (delimiter !== ',') return invalid('区切り文字が不正です。');
      }
      return invalid('JSONが閉じられていません。');
    }
    for (const [token, literal] of [['true', true], ['false', false], ['null', null]] as const) {
      if (source.startsWith(token, offset)) { offset += token.length; return literal; }
    }
    const token = /^-?(?:0|[1-9][0-9]*)(?:\.[0-9]+)?(?:[eE][+-]?[0-9]+)?/.exec(source.slice(offset));
    if (!token) return invalid('値が不正です。');
    offset += token[0].length;
    const number = Number(token[0]);
    if (!Number.isFinite(number)) return invalid('有限でない数値は保存できません。');
    return number;
  }
  const result = value(1); whitespace();
  if (offset !== source.length) invalid('JSONの末尾に余分なデータがあります。');
  return result;
}

/** Keys are canonicalized, but all arrays retain their semantic order. */
export function canonicalJson(value: unknown): string {
  const active = new Set<object>();
  function encode(input: unknown): string {
    if (input === null) return 'null';
    if (typeof input === 'string') {
      if (!isValidUnicode(input)) throw new StorageError('VALIDATION_FAILED', 'Unicodeのサロゲートが不正です。');
      return JSON.stringify(input);
    }
    if (typeof input === 'boolean') return String(input);
    if (typeof input === 'number') {
      if (!Number.isFinite(input)) throw new StorageError('VALIDATION_FAILED', '有限でない数値は保存できません。');
      return JSON.stringify(input);
    }
    if (typeof input !== 'object') throw new StorageError('VALIDATION_FAILED', 'JSONに保存できない値があります。');
    if (active.has(input)) throw new StorageError('VALIDATION_FAILED', '循環したJSONは保存できません。');
    active.add(input);
    const encoded = Array.isArray(input)
      ? `[${input.map(encode).join(',')}]`
      : `{${Object.keys(input).filter(key => (input as Record<string, unknown>)[key] !== undefined).sort()
        .map(key => `${JSON.stringify(key)}:${encode((input as Record<string, unknown>)[key])}`).join(',')}}`;
    active.delete(input);
    return encoded;
  }
  return encode(value);
}

export const jsonBytes = (value: unknown): Uint8Array => new TextEncoder().encode(canonicalJson(value));
export const equalJson = (left: unknown, right: unknown): boolean => canonicalJson(left) === canonicalJson(right);

export async function sha256(bytes: Uint8Array): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', bytes.slice().buffer);
  return [...new Uint8Array(digest)].map(value => value.toString(16).padStart(2, '0')).join('');
}

export function safeArchivePath(path: string): void {
  if (!path || path.includes('\0') || path.includes('\\') || path.startsWith('/') || /^[a-z]:/i.test(path)
    || path.split('/').some(part => !part || part === '.' || part === '..') || !isValidUnicode(path)) {
    throw new StorageError('UNSAFE_PATH', '危険なファイルパスです。', path);
  }
}
