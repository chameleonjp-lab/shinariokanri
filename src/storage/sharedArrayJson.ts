import { isImmutablePlainData } from '../domain/immutablePlainData';
import { canonicalJson, jsonBytes } from './json';

/** One invocation owns this bounded cache. Every command still hashes all its
 * canonical bytes. Only byte-identical, recursively immutable ordered arrays
 * share serialization; no schema, integrity or capacity check is skipped. */
export function createSharedArrayJsonEncoder(): (value: unknown) => Uint8Array {
  const maximumBytes = 64 * 1024 * 1024, maximumEntries = 128;
  let arrays = new WeakMap<object, Uint8Array>(), bytes = 0, entries = 0;
  // An edit creates a new ordered entity array while retaining almost every
  // immutable record. Caching both complete before/after arrays can evict the
  // entire Large cache on every command. Small exact ordered segments keep the
  // shared record bytes within the same byte budget, including changed chunks.
  const segmentLength = 64, maximumSegments = 16_384;
  const segments = new Map<object, { values: readonly unknown[]; bytes: Uint8Array }>();
  const segment = (values: unknown[]): Uint8Array => {
    const key = values[0] as object, previous = segments.get(key);
    if (previous && previous.values.length === values.length && values.every((value, index) => value === previous.values[index])) {
      segments.delete(key); segments.set(key, previous);
      return previous.bytes;
    }
    const encoded = jsonBytes(values).slice(1, -1);
    if (encoded.byteLength <= maximumBytes) {
      if (previous) { segments.delete(key); bytes -= previous.bytes.byteLength; }
      // Whole scalar-array caches and ordered segments share one capacity.
      if (bytes + encoded.byteLength > maximumBytes && entries) {
        arrays = new WeakMap(); bytes -= arrayBytes; arrayBytes = 0; entries = 0;
      }
      while (segments.size && (bytes + encoded.byteLength > maximumBytes || segments.size >= maximumSegments)) {
        const oldest = segments.keys().next().value!;
        bytes -= segments.get(oldest)!.bytes.byteLength; segments.delete(oldest);
      }
      segments.set(key, { values, bytes: encoded }); bytes += encoded.byteLength;
    }
    return encoded;
  };
  let arrayBytes = 0;
  const encoder = new TextEncoder();
  return value => {
    // Preserve the existing language/side-effect behavior of unsupported input.
    if (!isImmutablePlainData(value)) return jsonBytes(value);
    const chunks: Uint8Array[] = [];
    const text = (source: string) => chunks.push(encoder.encode(source));
    const visit = (input: unknown): void => {
      if (!input || typeof input !== 'object') { text(canonicalJson(input)); return; }
      if (Array.isArray(input)) {
        if (input.length >= 64) {
          if (input.every(item => item !== null && typeof item === 'object')) {
            text('[');
            for (let index = 0; index < input.length; index += segmentLength) {
              if (index) text(',');
              chunks.push(segment(input.slice(index, index + segmentLength)));
            }
            text(']'); return;
          }
          let encoded = arrays.get(input);
          if (!encoded) {
            encoded = jsonBytes(input);
            if (encoded.byteLength <= maximumBytes) {
              if (bytes + encoded.byteLength > maximumBytes || entries + 1 > maximumEntries) {
                arrays = new WeakMap(); bytes -= arrayBytes; arrayBytes = 0; entries = 0;
                while (segments.size && bytes + encoded.byteLength > maximumBytes) {
                  const oldest = segments.keys().next().value!;
                  bytes -= segments.get(oldest)!.bytes.byteLength; segments.delete(oldest);
                }
              }
              arrays.set(input, encoded); bytes += encoded.byteLength; arrayBytes += encoded.byteLength; entries++;
            }
          }
          chunks.push(encoded); return;
        }
        text('[');
        input.forEach((item, index) => { if (index) text(','); visit(item); });
        text(']'); return;
      }
      const object = input as Record<string, unknown>;
      text('{');
      Object.keys(object).filter(key => object[key] !== undefined).sort().forEach((key, index) => {
        if (index) text(','); text(JSON.stringify(key)); text(':'); visit(object[key]);
      });
      text('}');
    };
    visit(value);
    const result = new Uint8Array(chunks.reduce((total, chunk) => total + chunk.byteLength, 0));
    let offset = 0;
    for (const chunk of chunks) { result.set(chunk, offset); offset += chunk.byteLength; }
    return result;
  };
}
