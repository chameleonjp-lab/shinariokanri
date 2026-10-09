import { describe, expect, it } from 'vitest';
import { clearStructuredNumberDrafts, parseStructuredNumberDrafts, reindexStructuredNumberDrafts, renameStructuredDraftPath, serializeStructuredNumberDrafts } from './structuredNumberDrafts';

describe('unfinished structured numeric input', () => {
  it('recovers the exact draft without putting it in saved numeric values', () => {
    const drafts = { 'pins.0.x': '-', 'pins.1.y': '1e-', 'estimate.range.value': '1.' };
    expect(parseStructuredNumberDrafts(serializeStructuredNumberDrafts(drafts))).toEqual(drafts);
    expect(serializeStructuredNumberDrafts({})).toBeUndefined();
    expect(parseStructuredNumberDrafts('invalid JSON')).toEqual({});
    expect(parseStructuredNumberDrafts('{"format":"different","drafts":{"a":"-"}}')).toEqual({});
  });
  it('deletes only the removed subtree and moves input with surviving array items', () => {
    const drafts = { 'pins.0.x': '-', 'pins.1.x': '1.', 'pins.2.y': '1e-', 'pinsExtra.0.x': '-2.', 'estimate.value': '+' };
    const removed = reindexStructuredNumberDrafts(drafts, 'pins', index => index === 1 ? undefined : index > 1 ? index - 1 : index);
    expect(removed).toEqual({ 'pins.0.x': '-', 'pins.1.y': '1e-', 'pinsExtra.0.x': '-2.', 'estimate.value': '+' });
    expect(clearStructuredNumberDrafts(removed, 'pins')).toEqual({ 'pinsExtra.0.x': '-2.', 'estimate.value': '+' });
    const moved = reindexStructuredNumberDrafts(drafts, 'pins', index => index === 0 ? 2 : index === 2 ? 0 : index);
    expect(moved).toMatchObject({ 'pins.2.x': '-', 'pins.0.y': '1e-', 'pins.1.x': '1.' });
    expect(drafts['pins.0.x']).toBe('-');
  });
  it('moves unfinished nested values and key drafts with a renamed dictionary row', () => {
    const drafts = { 'values.old.value': '-', 'values.old.$keyInput': 'duplicate', 'values.oldExtra.value': '1.', 'other.value': '1e-' };
    const renamed = renameStructuredDraftPath(drafts, 'values.old', 'values.new');
    expect(renamed).toEqual({ 'values.new.value': '-', 'values.new.$keyInput': 'duplicate', 'values.oldExtra.value': '1.', 'other.value': '1e-' });
    expect(parseStructuredNumberDrafts(serializeStructuredNumberDrafts(renamed))).toEqual(renamed);
    expect(drafts['values.old.value']).toBe('-');
  });
});
