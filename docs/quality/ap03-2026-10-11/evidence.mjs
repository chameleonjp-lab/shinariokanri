// Read-only binding/preservation utility. It never builds or starts a browser.
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import { resolve, relative, join } from 'node:path';

const [operation] = process.argv.slice(2);
const arg = name => { const index = process.argv.indexOf('--' + name); if (index < 0 || !process.argv[index + 1]) throw Error('Missing --' + name); return process.argv[index + 1]; };
const directory = resolve(arg('directory'));
const digestFile = async path => { const hash = createHash('sha256'); let bytes = 0; for await (const chunk of createReadStream(path)) { bytes += chunk.length; hash.update(chunk); } return { bytes, sha256: hash.digest('hex') }; };
const writeNew = async (path, value) => { await mkdir(directory, { recursive: true }); await writeFile(path, JSON.stringify(value, null, 2) + '\n', { flag: 'wx' }); };
const allFiles = async root => { const paths = []; for (const entry of await readdir(root, { withFileTypes: true })) { const path = join(root, entry.name); if (entry.isDirectory()) paths.push(...await allFiles(path)); else if (entry.isFile()) paths.push(path); else throw Error('Unsupported retained entry: ' + path); } return paths.sort(); };

if (operation === 'capture') {
  const worktree = resolve(arg('worktree')), phase = arg('phase');
  if (!['before', 'after'].includes(phase)) throw Error('Phase must be before or after');
  const git = (...args) => execFileSync('git', args, { cwd: worktree, encoding: 'utf8', maxBuffer: 16 * 1024 * 1024 });
  const expected = { commit: arg('commit'), tree: arg('tree'), buildVersion: arg('build') };
  const sourceScopes = ['src', 'scripts', 'tests', 'examples', 'supabase', '.github', 'package.json', 'package-lock.json', 'vite.config.ts', 'playwright.config.ts', 'vitest.config.ts',
    'docs/quality/current-review/evidence/rb10-candidate/candidate-8/measure-editable-performance.mjs'];
  const sourcePaths = [...new Set([...git('ls-files', '-z', '--', ...sourceScopes).split('\0'), ...git('ls-files', '-z', '--others', '--exclude-standard', '--', ...sourceScopes).split('\0')])].filter(Boolean).sort();
  const sourceFiles = [], distFiles = [];
  for (const path of sourcePaths) sourceFiles.push({ path, ...await digestFile(resolve(worktree, path)) });
  for (const path of await allFiles(resolve(worktree, 'dist'))) distFiles.push({ path: relative(worktree, path), ...await digestFile(path) });
  const buildInfo = JSON.parse(await readFile(resolve(worktree, 'dist/build-info.json'), 'utf8'));
  const captured = { recordedAt: new Date().toISOString(), phase, expected, worktree, commit: git('rev-parse', 'HEAD').trim(), tree: git('rev-parse', 'HEAD^{tree}').trim(),
    statusPorcelain: git('status', '--porcelain=v1', '-z'), buildInfo, sourceScopes, sourceFiles, distFiles,
    environment: Object.fromEntries(['CHROMIUM_PATH', 'PLAYWRIGHT_BROWSERS_PATH', 'TMPDIR', 'XDG_CONFIG_HOME', 'XDG_CACHE_HOME', 'LD_LIBRARY_PATH'].map(key => [key, process.env[key] ?? null])),
    errors: [] };
  for (const [condition, message] of [
    [captured.commit === expected.commit, 'Unexpected source commit'], [captured.tree === expected.tree, 'Unexpected source tree'],
    [captured.statusPorcelain === '', 'Source checkout is dirty'], [buildInfo.commit === expected.commit, 'Build source commit differs'],
    [buildInfo.tree === expected.tree, 'Build source tree differs'], [buildInfo.version === expected.buildVersion, 'Build version differs'], [buildInfo.dirty === false, 'Build was made with dirty source'],
  ]) if (!condition) captured.errors.push(message);
  if (phase === 'after') {
    const before = JSON.parse(await readFile(resolve(directory, 'before.json'), 'utf8'));
    for (const field of ['expected', 'commit', 'tree', 'statusPorcelain', 'buildInfo', 'sourceFiles', 'distFiles']) if (JSON.stringify(before[field]) !== JSON.stringify(captured[field])) captured.errors.push('Before/after mismatch: ' + field);
    captured.beforeAfterUnchanged = captured.errors.length === 0;
  }
  await writeNew(resolve(directory, phase + '.json'), captured);
  if (phase === 'before' && !captured.errors.length) {
    captured.archives = [];
    for (const [name, files] of [['fixed-source.tar.gz', sourceFiles], ['fixed-dist.tar.gz', distFiles]]) {
      const path = resolve(directory, name);
      // tar consumes a NUL-delimited path list directly; no shell interpolation.
      execFileSync('tar', ['-czf', path, '--null', '--verbatim-files-from', '-T', '-'], { cwd: worktree, input: Buffer.from(files.map(file => file.path).join('\0') + '\0'), maxBuffer: 1024 * 1024 });
      captured.archives.push({ path: name, ...await digestFile(path), memberCount: files.length });
    }
    await writeNew(resolve(directory, 'before-archives.json'), { recordedAt: new Date().toISOString(), archives: captured.archives });
  }
  console.log(JSON.stringify({ phase, commit: captured.commit, tree: captured.tree, build: buildInfo.version, sourceFiles: sourceFiles.length, distFiles: distFiles.length, errors: captured.errors }));
  if (captured.errors.length) process.exitCode = 1;
} else if (operation === 'seal') {
  const files = [];
  for (const path of await allFiles(directory)) {
    if (relative(directory, path) === 'retained-manifest.json') throw Error('Run directory is already sealed; never overwrite an earlier attempt');
    files.push({ path: relative(directory, path), ...await digestFile(path) });
  }
  await writeNew(resolve(directory, 'retained-manifest.json'), { recordedAt: new Date().toISOString(), scope: 'All retained files except this manifest; result failures are preserved unchanged', files });
  console.log(JSON.stringify({ retainedFiles: files.length, retainedBytes: files.reduce((sum, file) => sum + file.bytes, 0) }));
} else if (operation === 'performance-summary') {
  const path = resolve(arg('result')), input = JSON.parse(await readFile(path, 'utf8'));
  const thresholds = { cached_startup: input.size === 'large' ? 10000 : 3000, selection: 200, list_switch: 200, compound_search: input.size === 'large' ? 2000 : 500, command_save: 1000, next_period: 200, timeline_frames: 33.4, graph_frames: 33.4 };
  const summary = { recordedAt: new Date().toISOString(), result: path, resultSha256: (await digestFile(path)).sha256, size: input.size, samples: input.samples,
    originalGates: input.size === 'large' ? ['cached_startup', 'compound_search'] : Object.keys(thresholds), supplementalMetrics: input.size === 'large' ? Object.keys(thresholds).filter(key => !['cached_startup', 'compound_search'].includes(key)) : [],
    metrics: {}, errors: [], scope: 'Independent nearest-rank recalculation; Linux automated browser only. Every raw sample is retained; no best-run selection.' };
  if (input.samples !== 30 || input.mode !== 'performance') summary.errors.push('Original exact 30-sample performance run required');
  if (!input.finishedAt || input.errors?.length) summary.errors.push('Run did not finish without errors');
  if (input.dirty !== false || input.buildInfo?.dirty !== false || input.sourceCommit !== input.buildInfo?.commit || input.sourceTree !== input.buildInfo?.tree) summary.errors.push('Clean source/build binding does not match');
  if (input.helperRetention?.status !== 'retained_and_verified_before_after' || !input.helperRetention.before?.sourceUnchanged || !input.helperRetention.before?.retainedUnchanged || !input.helperRetention.after?.sourceUnchanged || !input.helperRetention.after?.retainedUnchanged) summary.errors.push('Exact served helper bytes were not verified and retained before/after');
  if (input.fixture?.counts?.totalRecords !== (input.size === 'large' ? 88003 : 8800)) summary.errors.push('Original record count differs');
  if (input.size === 'large' && input.fixture?.assetBytes !== 72 * 1024 * 1024) summary.errors.push('Original actual 72MiB asset count differs');
  if (input.measurements?.cached_startup?.editableProbes?.length !== 30 || input.measurements.cached_startup.editableProbes.some(probe => !probe.focused || !probe.enabled || !probe.visible || !probe.renderConfirmed || probe.readOnly || probe.inert)) summary.errors.push('Actual first editable editor proof missing');
  for (const [metric, limitMs] of Object.entries(thresholds)) {
    const data = input.measurements?.[metric], values = data?.milliseconds;
    const frames = metric.endsWith('_frames');
    if (!Array.isArray(values) || !values.length || values.some(value => !Number.isFinite(value) || value < 0) || (!frames && values.length !== 30) || (frames && (data.gestures?.length !== 30 || values.length !== 330 || data.gestures.some(gesture => (Array.isArray(gesture) ? gesture : gesture.frames)?.length !== 11)))) { summary.errors.push('Raw sample count/value differs: ' + metric); continue; }
    const p95 = [...values].sort((left, right) => left - right)[Math.ceil(values.length * .95) - 1];
    if (p95 !== data.p95) summary.errors.push('Reported p95 differs: ' + metric);
    summary.metrics[metric] = { rawCount: values.length, p95, maximum: Math.max(...values), limitMs, withinThreshold: p95 <= limitMs, originalGate: summary.originalGates.includes(metric) };
  }
  summary.originalGatePassed = !summary.errors.length && summary.originalGates.every(metric => summary.metrics[metric]?.withinThreshold);
  await writeNew(resolve(directory, 'performance-summary.json'), summary);
  console.log(JSON.stringify(summary));
  if (!summary.originalGatePassed) process.exitCode = 1;
} else throw Error('Operation must be capture, performance-summary, or seal');
