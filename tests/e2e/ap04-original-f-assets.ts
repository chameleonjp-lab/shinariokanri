import { zlibSync } from 'fflate';

/** A generated one-pixel PNG with real PNG CRCs and a zlib scanline.
 * This avoids relying on a MIME label or a signature-only image fixture. */
export function onePixelPng(red = 32, green = 96, blue = 192): Uint8Array {
  function chunk(name: string, data: Uint8Array) {
    const bytes = new Uint8Array(data.length + 12);
    const view = new DataView(bytes.buffer);
    view.setUint32(0, data.length, false);
    for (let i = 0; i < 4; i++) bytes[4 + i] = name.charCodeAt(i);
    bytes.set(data, 8);
    let crc = 0xffffffff;
    for (const byte of bytes.subarray(4, data.length + 8)) {
      crc ^= byte;
      for (let i = 0; i < 8; i++) crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0);
    }
    view.setUint32(data.length + 8, (crc ^ 0xffffffff) >>> 0, false);
    return bytes;
  }
  const header = new Uint8Array(13);
  const view = new DataView(header.buffer);
  view.setUint32(0, 1, false); view.setUint32(4, 1, false);
  header[8] = 8; header[9] = 2;
  const parts = [new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', header), chunk('IDAT', zlibSync(new Uint8Array([0, red, green, blue]))), chunk('IEND', new Uint8Array())];
  const result = new Uint8Array(parts.reduce((total, part) => total + part.length, 0));
  let position = 0;
  for (const part of parts) { result.set(part, position); position += part.length; }
  return result;
}
