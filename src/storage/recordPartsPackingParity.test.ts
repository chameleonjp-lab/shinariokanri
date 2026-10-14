import {createHash} from 'node:crypto';
import {readFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {afterEach,expect,it,vi} from 'vitest';
import {packRecordData as packCurrent,unpackRecordData} from './recordPartsCore';
import {packRecordData as pack3288Baseline} from './recordPartsCore.baseline-3288.fixture';

const baseline = {
 commit: '3288e4eb5e425a33105a672a781b971838c64e9b',
 tree: '0425f40a0a85d96c2d41006661fbfe3b595fbfb0',
 sourcePath: 'src/storage/recordPartsCore.ts',
 sourceSha256: 'b4b131f2b88b63e4ceace8efa33046e0832a92406640eadaf277fa6efa97f223',
 fixturePath: fileURLToPath(new URL('./recordPartsCore.baseline-3288.fixture.ts', import.meta.url)),
};
afterEach(() => vi.restoreAllMocks());

async function expectBaselineParity(value: unknown, scope: string) {
 const expected = await pack3288Baseline(value, scope);
 const actual = await packCurrent(value, scope);
 expect(actual.packed.root).toEqual(expected.packed.root);
 expect(actual.packed.nodes).toBe(expected.packed.nodes);
 expect(actual.packed.strings).toBe(expected.packed.strings);
 expect(actual.packed).toEqual(expected.packed);
 expect(actual.parts).toHaveLength(expected.parts.length);
 for (const [index, part] of actual.parts.entries()) {
  const reference = expected.parts[index]!;
  expect({key: part.key, scope: part.scope, sequence: part.sequence, kind: part.kind, bytes: part.bytes.byteLength, sha256: part.sha256})
   .toEqual({key: reference.key, scope: reference.scope, sequence: reference.sequence, kind: reference.kind, bytes: reference.bytes.byteLength, sha256: reference.sha256});
  expect(Buffer.from(part.bytes.buffer, part.bytes.byteOffset, part.bytes.byteLength)
   .equals(Buffer.from(reference.bytes.buffer, reference.bytes.byteOffset, reference.bytes.byteLength))).toBe(true);
 }
 return actual;
}

it('binds the independent encoding oracle to the retained 3288e4e source bytes', () => {
 const actualSha = createHash('sha256').update(readFileSync(baseline.fixturePath)).digest('hex');
 expect({commit: baseline.commit, tree: baseline.tree, sourcePath: baseline.sourcePath, sourceSha256: actualSha, fixturePath: baseline.fixturePath})
  .toEqual(baseline);
});

it('keeps every packed byte, root, count and SHA identical to the 3288e4e baseline', async () => {
 const shared = Object.assign(Object.create(null) as Record<string, unknown>, {
  text: '😀日本語と改行\n', present: undefined, negativeZero: -0, z: '後', a: '前',
 });
 const equalButSeparate = Object.assign(Object.create(null) as Record<string, unknown>, {
  text: '😀日本語と改行\n', present: undefined, negativeZero: -0, z: '後', a: '前',
 });
 const ordinaryInput = {
  shared: [shared, shared], separate: [equalButSeparate], absent: [],
  order: {z: '末尾', a: '先頭'}, present: undefined, negativeZero: -0,
 };
 await expectBaselineParity(ordinaryInput, 'fixed-baseline-scope:ordinary');
 await expectBaselineParity(['並び', '😀', null, true, false, -0, Number.MIN_VALUE, Number.MAX_VALUE, 1e-7, 1e-6, 1e20, 1e21, undefined, {z: 1, a: 2, tagLike: {number: -0, undefined: true}}], 'fixed-baseline-scope:array-order');

 const stringsAtThreshold = [
  'a'.repeat(699_047), 'b'.repeat(699_047), 'c'.repeat(699_048), 'd'.repeat(13),
 ];
 const grouped = await expectBaselineParity(stringsAtThreshold, 'fixed-baseline-scope:group-boundary');
 expect(grouped.parts[0]!.kind).toBe('strings');
 expect(grouped.parts[0]!.bytes.byteLength).toBe(2 * 1024 * 1024);
 expect(JSON.parse(new TextDecoder().decode(grouped.parts[0]!.bytes))).toHaveLength(3);
 expect(grouped.parts[1]!.kind).toBe('strings');
 expect(JSON.parse(new TextDecoder().decode(grouped.parts[1]!.bytes))).toHaveLength(1);

 const unicodeNearThreshold = ['漢'.repeat(233_015), '本'.repeat(233_016), '語'.repeat(233_016), '別'];
 const unicodeGrouped = await expectBaselineParity(unicodeNearThreshold, 'fixed-baseline-scope:utf8-boundary');
 expect(unicodeGrouped.parts[0]!.kind).toBe('strings');
 expect(unicodeGrouped.parts[0]!.bytes.byteLength).toBe(2 * 1024 * 1024 - 1);
 expect(JSON.parse(new TextDecoder().decode(unicodeGrouped.parts[0]!.bytes))).toHaveLength(3);

 const wideNumbers = {values: Array(80_000).fill(1234567890123456)};
 const wide = await expectBaselineParity(wideNumbers, 'fixed-baseline-scope:node-boundary');
 const nodeParts = wide.parts.filter(part => part.kind === 'nodes');
 expect(nodeParts).toHaveLength(2);
 expect(nodeParts[0]!.bytes.byteLength).toBeLessThan(2 * 1024 * 1024);
 expect(nodeParts[1]!.bytes.byteLength).toBeGreaterThan(2 * 1024 * 1024);
});

it('does not call inherited native JSON hooks while packing generated node arrays and numeric tags', async () => {
 const input = {
  values: [1234567890123456, -0, Number.MIN_VALUE, Number.MAX_VALUE, 1e-7, 1e21, null, true, false],
  tagLike: {number: -0, undefined: true, text: '😀'},
  explicit: undefined,
  negativeZero: -0,
  nullValue: null,
  trueValue: true,
  falseValue: false,
 };
 const hooks = [Object.prototype, Array.prototype, Number.prototype] as const;
 const saved = hooks.map(prototype => Object.getOwnPropertyDescriptor(prototype, 'toJSON'));
 let calls = 0;
 const toJSON = () => { calls++; throw new Error('native JSON hook must not run'); };
 try {
  for (const prototype of hooks) Object.defineProperty(prototype, 'toJSON', {configurable: true, writable: true, value: toJSON});
  await expectBaselineParity(input, 'fixed-baseline-scope:generated-node-hooks');
  expect(calls).toBe(0);
 } finally {
  hooks.forEach((prototype, index) => {
   const descriptor = saved[index];
   if (descriptor) Object.defineProperty(prototype, 'toJSON', descriptor);
   else Reflect.deleteProperty(prototype, 'toJSON');
  });
 }
});

async function packFailure(pack: typeof packCurrent, value: unknown, scope: string) {
 try { await pack(value, scope); return null; }
 catch (error) {
  const value = error as {name?: unknown; code?: unknown; message?: unknown; path?: unknown};
  return {name: value.name, code: value.code, message: value.message, path: value.path};
 }
}

it('preserves baseline errors for unsupported author graphs before generated-node encoding', async () => {
 const cycle: {child?: unknown} = {};
 cycle.child = cycle;
 const invalidCases: Array<[string, unknown]> = [
  ['nonfinite', {value: Number.NaN}],
  ['function', {value: () => undefined}],
  ['sparse', new Array(2)],
  ['class-instance', {value: new Date(0)}],
  ['cycle', cycle],
 ];
 for (const [label, value] of invalidCases) {
  const scope = `fixed-baseline-scope:error:${label}`;
  const baselineError = await packFailure(pack3288Baseline, value, scope);
  const candidateError = await packFailure(packCurrent, value, scope);
  expect(baselineError).not.toBeNull();
  expect(candidateError).toEqual(baselineError);
 }
});

it('keeps caller graphs mutable and packs the captured value while a digest is pending', async () => {
 const input = {body: 'call-time body', nested: {label: 'captured label'}};
 const before = structuredClone(input);
 let digestStarted!: () => void;
 let resumeDigest!: () => void;
 const started = new Promise<void>(resolve => { digestStarted = resolve; });
 const held = new Promise<void>(resolve => { resumeDigest = resolve; });
 const digest = crypto.subtle.digest.bind(crypto.subtle);
 vi.spyOn(crypto.subtle, 'digest').mockImplementationOnce(async (...args) => {
  const result = await digest(...args);
  digestStarted();
  await held;
  return result;
 });
 const packing = packCurrent(input, 'fixed-baseline-scope:mutable-caller');
 await started;
 input.body = 'later body';
 input.nested.label = 'later label';
 expect(Object.isFrozen(input)).toBe(false);
 expect(Object.isFrozen(input.nested)).toBe(false);
 resumeDigest();
 const packed = await packing;
 expect(await unpackRecordData(packed.packed, packed.parts)).toEqual(before);
 expect(input).toEqual({body: 'later body', nested: {label: 'later label'}});
});
