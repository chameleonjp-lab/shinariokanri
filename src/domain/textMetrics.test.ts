import { describe, expect, it } from 'vitest';
import { createEntity, newId, validateEntity } from './model';
import { measureText } from './textMetrics';

describe('Unicode measurements used by every text validation', () => {
  it('matches UTF-8 encoding and string iteration across every BMP code unit and valid supplementary pair', () => {
    const bmp = Array.from({ length: 0x10000 }, (_, code) => String.fromCharCode(code)).join('');
    const supplementary = Array.from({ length: 0x100000 }, (_, offset) => String.fromCodePoint(0x10000 + offset)).join('');
    for (const [value, validUnicode] of [[bmp, false], [supplementary, true], ['aé漢😀e\u0301👩‍💻\0', true]] as const) {
      const expected = { codePoints: Array.from(value).length, utf8Bytes: new TextEncoder().encode(value).byteLength, validUnicode };
      expect(measureText(value)).toEqual(expected);
      expect(measureText(value)).toEqual(expected);
    }
  });

  it('continues to reject isolated surrogates after repeated field checks and measures their replacement encoding accurately', () => {
    const note = createEntity(newId(), 'note', 'Malformed Unicode');
    for (const text of ['\ud800', '\udfff', '\ud800x', 'x\udc00', '\ud800\ud800\udc00', '😀\udfff']) {
      note.data.body = [{ id: newId(), kind: 'paragraph', text }];
      const expected = { codePoints: Array.from(text).length, utf8Bytes: new TextEncoder().encode(text).byteLength, validUnicode: false };
      expect(measureText(text)).toEqual(expected);
      expect(validateEntity(note).ok).toBe(false);
      expect(validateEntity(note).ok).toBe(false);
    }
    note.data.body[0]!.text = '😀';
    expect(validateEntity(note).ok).toBe(true);
  });

  it('checks each field limit independently when a previously measured body is used as a name or summary', () => {
    const character = createEntity(newId(), 'character', '文字境界');
    const text = '😀'.repeat(129);
    character.data.body = [{ id: newId(), kind: 'paragraph', text }];
    expect(validateEntity(character).ok).toBe(true);
    character.name = text;
    expect(validateEntity(character).ok).toBe(false);
    character.name = '😀'.repeat(128);
    expect(validateEntity(character).ok).toBe(true);
    character.data.summary = [{ id: newId(), kind: 'paragraph', text: '漢'.repeat(2049) }];
    expect(validateEntity(character).ok).toBe(false);
    character.data.summary[0]!.text = '漢'.repeat(2048);
    character.data.body[0]!.text = '😀'.repeat(256 * 1024);
    expect(validateEntity(character).ok).toBe(true);
    character.data.body[0]!.text += 'a';
    expect(validateEntity(character).ok).toBe(false);
  });

  it('preserves real calendar-day and UTC checks through repeated and evicted date measurements', () => {
    const note = createEntity(newId(), 'note', '日時の境界');
    const check = (stamp: string) => { note.createdAt = stamp; return validateEntity(note).ok; };
    for (let round = 0; round < 2; round++) {
      expect(check('2000-02-29T00:00:00Z')).toBe(true);
      expect(check('1900-02-29T00:00:00Z')).toBe(false);
      expect(check('2026-02-29T00:00:00Z')).toBe(false);
      expect(check('2026-10-05T23:59:59+00:00')).toBe(true);
      expect(check('2026-10-05T24:00:00Z')).toBe(false);
      expect(check('2026-10-05T00:00:00+09:00')).toBe(false);
      for (let year = 1000; year < 1640; year++) expect(check(`${year}-01-01T00:00:00Z`)).toBe(true);
    }
  });
});
