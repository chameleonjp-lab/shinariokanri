// Local-only source-level experiment. Does not import App/store or write any application database.
import { registerHooks } from 'node:module';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { cpus, release, totalmem } from 'node:os';
import assert from 'node:assert/strict';
registerHooks({ resolve(specifier, context, nextResolve) {
  try { return nextResolve(specifier, context); }
  catch (error) { if (specifier.startsWith('.') && !/\.[a-z]+$/.test(specifier)) return nextResolve(`${specifier}.ts`, context); throw error; }
} });
const { createCatalogStudy } = await import('./catalogStudy.ts');
const { studyFixtureIdentity } = await import('./fixtureIdentity.ts');
const { createPerformanceFixture, createMaterialPerformanceFixture } = await import('../../src/testing/performanceFixture.ts');
const { captureImmutablePlainData } = await import('../../src/domain/immutablePlainData.ts');
const { filterCatalogEntities } = await import('../../src/domain/catalog.ts');
const { startProbe, probeEnabled } = await import('../../src/observability/probe.ts');
const argument = name => { const index = process.argv.indexOf(`--${name}`); return index < 0 ? undefined : process.argv[index + 1]; };
const suite = argument('suite'), directory = argument('output');
if (!['standard', 'large'].includes(suite) || !directory) throw new Error('Usage: node scripts/optimization/measure-catalog-study.mjs --suite standard|large --output NEW_DIRECTORY');
const output = resolve(directory), git = (...args) => execFileSync('git', args, { encoding: 'utf8', maxBuffer: 8 * 1024 * 1024 }).trim();
const sha = bytes => createHash('sha256').update(bytes).digest('hex');
const serial = value => Buffer.from(JSON.stringify(value));
const idsDigest = rows => sha(serial(rows.map(entity => entity.id)));
const modes = ['current', 'corpus', 'results'];
const sequence = ['霧', '霧の', '門番', '記録', '霧', '霧の'].map(value => ({ op: 'text', value }));
const summarize = values => ({ count: values.length, minimum: Math.min(...values), median: [...values].sort((a, b) => a - b)[Math.ceil(values.length / 2) - 1], p95: [...values].sort((a, b) => a - b)[Math.ceil(values.length * 0.95) - 1], maximum: Math.max(...values) });
await mkdir(output); // Fail before executing if the requested evidence directory already exists.
const result = {
  version: 1, scope: 'Supplemental Node source experiment, not original browser30/180/7200 acceptance',
  recordedAt: new Date().toISOString(), sourceCommit: git('rev-parse', 'HEAD'), sourceTree: git('rev-parse', 'HEAD^{tree}'),
  productTree: git('rev-parse', 'HEAD:src'), dirty: !!git('status', '--porcelain'), suite, repetitions: 30,
  environment: { node: process.version, os: process.platform, release: release(), arch: process.arch, cpu: cpus()[0]?.model, logicalCPUs: cpus().length, totalMemory: totalmem(), physicalDevice: false, execution: 'Node type stripping; original source imports; no browser, IndexedDB or network in measured work' },
  definition: { interval: 'performance.now immediately around synchronous study.query; digest/assertions/setup/close excluded; corpus miss encoding and result-key lookup included', order: 'rotate current/corpus/results by repetition modulo three; new session for each mode/repetition; identical six-query sequence', probe: 'OFF latency; separate fresh ON session per mode; never add ON elapsed to OFF values', retention: 'logical source rows, normalized UTF8 payload and result references; not heap/peak/GC or physical database bytes', percentile: 'nearest-rank ceil(p*n)-1', uiLatency: 'UNKNOWN', heapRetention: 'UNKNOWN', dbReads: 'NOT_APPLICABLE: source-level in-memory experiment' },
  limits: { maxTextBytes: 8388608, maxResultEntries: 8, maxResultReferences: 100000 }, sequence,
  sourceFiles: [], observations: [], diagnostics: [], errors: [],
};
const persist = () => writeFile(join(output, 'measurements.json'), JSON.stringify(result, null, 2) + '\n');
try {
  assert.equal(result.dirty, false, 'Commit the experiment source before measurement');
  for (const path of git('ls-files', '--', 'src', 'scripts/optimization', 'tests/optimization', 'package.json', 'package-lock.json').split('\n').filter(Boolean).sort()) {
    const bytes = await readFile(path); result.sourceFiles.push({ path, bytes: bytes.length, sha256: sha(bytes) });
  }
  // Retain Git object proofs so a shallow CI checkout can verify the measured commit without fetching old history.
  const directories = new Set(['']);
  for (const { path } of result.sourceFiles) {
    const pieces = path.split('/'); pieces.pop();
    while (pieces.length) { directories.add(pieces.join('/')); pieces.pop(); }
  }
  result.sourceProof = { commit: execFileSync('git', ['cat-file', 'commit', result.sourceCommit], { encoding: 'utf8' }), trees: {} };
  for (const path of [...directories].sort()) {
    const ref = path ? `${result.sourceCommit}:${path}` : `${result.sourceCommit}^{tree}`, hash = git('rev-parse', ref);
    result.sourceProof.trees[hash] = git('ls-tree', '-z', ref).split('\0').filter(Boolean).map(line => {
      const match = /^(\d+) (blob|tree) ([0-9a-f]{40})\t([\s\S]+)$/.exec(line);
      if (!match) throw new Error('Unsupported source tree entry');
      return { mode: match[1], type: match[2], sha: match[3], name: match[4] };
    });
  }
  const generatedAt = performance.now();
  const fixture = suite === 'large' ? await createMaterialPerformanceFixture('large-material-rb10-v1') : await createPerformanceFixture('standard-r06-v1');
  const sourceBytes = serial(fixture.project), identity = await studyFixtureIdentity(fixture), assets = [];
  for (const asset of fixture.assets ?? []) { assert.equal(sha(asset.bytes), asset.contentHash); assets.push({ bytes: asset.bytes.length, sha256: asset.contentHash }); }
  assert.equal(fixture.counts.totalRecords, suite === 'large' ? 88003 : 8800);
  assert.equal(fixture.assetBytes, suite === 'large' ? 75497472 : 0);
  assert.equal(sha(sourceBytes), identity.wireJsonSha256);
  const original = JSON.parse(await readFile(`docs/optimization/phase1/evidence/candidate-${suite}30.json`, 'utf8')).fixture;
  assert.equal(fixture.sha256, original.sha256, 'Original phase1 fixture bytes must remain identical');
  assert.deepEqual(assets, original.assetHashes.map(row => ({ bytes: row.bytes, sha256: row.hash })));
  result.fixture = { seed: fixture.seed, counts: fixture.counts, assetBytes: fixture.assetBytes, assets, ...identity, generatorMilliseconds: performance.now() - generatedAt };
  const capturedAt = performance.now(), captured = captureImmutablePlainData(fixture.project);
  assert.equal(captured.captured, true); result.immutableCaptureMilliseconds = performance.now() - capturedAt;
  const project = captured.value, owner = Object.freeze({ account: 'synthetic-only', role: 'author', project: project.projectId, revision: project.revision, pins: sha(serial(project.worldReferences)), schema: 'original-main-schema', visibility: 'author', normalization: 'original-catalog' });
  const expected = sequence.map(query => { const rows = filterCatalogEntities(project, query); return { count: rows.length, sha256: idsDigest(rows) }; });
  result.expected = expected;
  await persist();
  for (let repetition = 0; repetition < 30; repetition++) {
    const order = modes.map((_, index) => modes[(index + repetition) % modes.length]);
    for (const mode of order) {
      assert.equal(probeEnabled(), false);
      const prepareAt = performance.now(), study = createCatalogStudy(project, owner, mode, result.limits), prepareMilliseconds = performance.now() - prepareAt;
      const queries = [];
      try {
        for (let queryIndex = 0; queryIndex < sequence.length; queryIndex++) {
          const started = performance.now(), rows = study.query(sequence[queryIndex], owner), milliseconds = performance.now() - started;
          const actual = { count: rows.length, sha256: idsDigest(rows) }; assert.deepEqual(actual, expected[queryIndex]);
          queries.push({ queryIndex, milliseconds, ...actual });
        }
        const retained = study.stats(); study.close();
        result.observations.push({ repetition, mode, order, prepareMilliseconds, queries, retained, afterClose: study.stats() });
      } finally { study.close(); }
    }
    await persist();
  }
  // Separate sessions: counters measure real original normalization/scan calls, not hypothetical savings.
  for (const mode of modes) {
    const study = createCatalogStudy(project, owner, mode, result.limits), capture = startProbe(), queries = [];
    try {
      for (let queryIndex = 0; queryIndex < sequence.length; queryIndex++) {
        const rows = study.query(sequence[queryIndex], owner), actual = { count: rows.length, sha256: idsDigest(rows) }; assert.deepEqual(actual, expected[queryIndex]);
        queries.push({ queryIndex, ...actual, counters: capture.snapshot().counters });
      }
      const retained = study.stats(); study.close();
      result.diagnostics.push({ mode, queries, retained, afterClose: study.stats(), probe: capture.stop() });
    } finally { capture.stop(); study.close(); }
  }
  assert.equal(sha(serial(fixture.project)), identity.wireJsonSha256); assert.equal(sha(serial(project)), identity.wireJsonSha256);
  for (const asset of fixture.assets ?? []) assert.equal(sha(asset.bytes), asset.contentHash);
  result.inputUnchanged = true;
  result.summary = Object.fromEntries(modes.map(mode => [mode, sequence.map((_, queryIndex) => summarize(result.observations.filter(row => row.mode === mode).map(row => row.queries[queryIndex].milliseconds)))]));
  result.finishedAt = new Date().toISOString();
} catch (error) { result.errors.push({ name: error.name, message: error.message }); process.exitCode = 1; }
finally { await persist(); }
console.log(JSON.stringify({ output, suite, observations: result.observations.length, diagnostics: result.diagnostics.length, errors: result.errors.length }));
