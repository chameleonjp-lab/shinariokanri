import { isImmutablePlainData } from '../domain/immutablePlainData';
import { canonicalJson, jsonBytes } from './json';

/** One invocation owns this bounded cache. Every command still hashes all its
 * canonical bytes. Only byte-identical, recursively immutable ordered arrays
 * share serialization; no schema, integrity or capacity check is skipped. */
export function createSharedArrayJsonEncoder(): (value: unknown) => Uint8Array {
  const maximumBytes = 64 * 1024 * 1024, maximumEntries = 128;
  let arrays = new WeakMap<object, Uint8Array>(), bytes = 0, entries = 0;
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
          let encoded = arrays.get(input);
          if (!encoded) {
            encoded = jsonBytes(input);
            if (encoded.byteLength <= maximumBytes) {
              if (bytes + encoded.byteLength > maximumBytes || entries + 1 > maximumEntries) {
                arrays = new WeakMap(); bytes = 0; entries = 0;
              }
              arrays.set(input, encoded); bytes += encoded.byteLength; entries++;
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
