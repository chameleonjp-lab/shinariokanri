export interface TextMetrics {
  readonly codePoints: number;
  readonly utf8Bytes: number;
  readonly validUnicode: boolean;
}

// Strings are immutable. Retain only their scalar measurements, never a
// validation result or a record, so each schema still checks its own limits.
// The source text retained by this module is bounded to 1 MiB and 512 keys.
const maximumKeys = 512;
const maximumEntryCodeUnits = 4096;
const maximumSourceBytes = 1024 * 1024;
const cached = new Map<string, TextMetrics>();
let sourceBytes = 0;

export function measureText(value: string): TextMetrics {
  const prior = cached.get(value);
  if (prior) return prior;
  let codePoints = 0, utf8Bytes = 0, validUnicode = true;
  for (let index = 0; index < value.length; index++, codePoints++) {
    const code = value.charCodeAt(index);
    if (code < 0x80) utf8Bytes++;
    else if (code < 0x800) utf8Bytes += 2;
    else if (code >= 0xd800 && code <= 0xdbff) {
      const next = value.charCodeAt(index + 1);
      if (next >= 0xdc00 && next <= 0xdfff) { utf8Bytes += 4; index++; }
      else { utf8Bytes += 3; validUnicode = false; }
    } else {
      utf8Bytes += 3;
      if (code >= 0xdc00 && code <= 0xdfff) validUnicode = false;
    }
  }
  const metrics = Object.freeze({ codePoints, utf8Bytes, validUnicode });
  if (value.length <= maximumEntryCodeUnits) {
    const bytes = value.length * 2;
    while (cached.size >= maximumKeys || sourceBytes + bytes > maximumSourceBytes) {
      const oldest = cached.keys().next().value!;
      sourceBytes -= oldest.length * 2;
      cached.delete(oldest);
    }
    cached.set(value, metrics);
    sourceBytes += bytes;
  }
  return metrics;
}
