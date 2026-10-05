// Production-bundled domain/store modules in real Chromium IndexedDB, without the application UI.
import { build } from 'vite';
import { chromium } from '@playwright/test';
import { createServer } from 'node:http';
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, extname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';

const repository = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const option = (name, fallback) => { const index = process.argv.indexOf(name); return index < 0 ? fallback : process.argv[index + 1]; };
const count = Number(option('--samples', '30')), size = option('--size', 'standard');
if (!Number.isSafeInteger(count) || count < 1 || count > 1000 || !['standard', 'large'].includes(size)) throw new Error('Use --samples 1..1000 and --size standard|large.');
const output = resolve(option('--output', join(repository, 'artifacts/storage-performance.json')));
const temporary = await mkdtemp(join(tmpdir(), 'scenario-storage-performance-'));
const entry = join(temporary, 'entry'), distribution = join(temporary, 'dist');
let server, browser;
try {
  await mkdir(entry);
  await writeFile(join(entry, 'index.html'), '<!doctype html><html lang="ja"><meta charset="utf-8"><script type="module" src="/main.ts"></script></html>');
  await writeFile(join(entry, 'main.ts'), `
import { ScenarioStore } from ${JSON.stringify(join(repository, 'src/storage/store.ts'))};
import { createPerformanceFixture } from ${JSON.stringify(join(repository, 'src/testing/performanceFixture.ts'))};
globalThis.measureStorage = async ({ count, size }) => {
  const fixture = await createPerformanceFixture('standard-r06-v1', size), samples = [];
  let operation = 'creation';
  const store = new ScenarioStore({ databaseName: 'benchmark-' + crypto.randomUUID(), onSaveMetrics: metrics => samples.push({ operation, ...metrics }) });
  try {
    let project = (await store.saveProject(fixture.project, { reason: '性能fixture', includeHistory: false })).project;
    const lineId = project.entities.find(entity => entity.kind === 'dialogue_line').id;
    const editLine = text => project.entities.map(entity => entity.id === lineId ? { ...entity, data: { ...entity.data, text: entity.data.text.map((block, index) => index ? block : { ...block, text }) } } : entity);
    for (let i = 0; i < count; i++) {
      operation = 'project-title';
      project = (await store.saveProject({ ...project, name: '作品名変更 ' + i }, { reason: '作品名', includeHistory: false })).project;
      operation = 'dialogue-line';
      project = (await store.saveProject({ ...project, entities: editLine('台詞の変更 ' + i) }, { reason: '本文', includeHistory: false })).project;
      operation = 'compound';
      project = (await store.saveProject({ ...project, name: '複合変更 ' + i, entities: editLine('複合本文 ' + i), relations: project.relations.map((relation, index) => index ? relation : { ...relation, status: i % 2 ? 'confirmed' : 'needs_review' }) }, { reason: '複合変更', includeHistory: false })).project;
    }
    return { browser: navigator.userAgent, fixture: { seed: fixture.seed, size: fixture.size, counts: fixture.counts, sha256: fixture.sha256, assetBytes: fixture.assetBytes }, samples };
  } finally { await store.deleteDatabase(); }
};
`);
  await build({ root: entry, configFile: false, base: '/', build: { target: 'es2022', outDir: distribution, emptyOutDir: true }, logLevel: 'warn' });
  server = createServer(async (request, response) => {
    const path = resolve(distribution, '.' + new URL(request.url, 'http://localhost').pathname), target = path === distribution ? join(path, 'index.html') : path;
    if (!target.startsWith(distribution + '/')) { response.writeHead(403).end(); return; }
    try { response.setHeader('Content-Type', extname(target) === '.js' ? 'text/javascript' : 'text/html'); response.end(await readFile(target)); }
    catch { response.writeHead(404).end(); }
  });
  await new Promise((ready, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', ready); });
  const executablePath = process.env.CHROMIUM_PATH ?? (existsSync('/usr/bin/chromium') ? '/usr/bin/chromium' : undefined);
  browser = await chromium.launch({ executablePath, args: ['--no-sandbox'] });
  const page = await browser.newPage();
  await page.goto(`http://127.0.0.1:${server.address().port}/`);
  await page.waitForFunction(() => typeof globalThis.measureStorage === 'function');
  const result = await page.evaluate(async options => globalThis.measureStorage(options), { count, size });
  const percentile = values => [...values].sort((a, b) => a - b)[Math.ceil(values.length * .95) - 1];
  const summary = Object.fromEntries(['project-title', 'dialogue-line', 'compound'].map(operation => {
    const samples = result.samples.filter(sample => sample.operation === operation);
    return [operation, { count: samples.length, p95Milliseconds: percentile(samples.map(sample => sample.milliseconds.total)), maxMilliseconds: Math.max(...samples.map(sample => sample.milliseconds.total)) }];
  }));
  const sourceFiles = ['src/storage/store.ts', 'src/domain/model.ts', 'src/domain/production.ts', 'src/domain/text.ts'];
  const sourceHashes = Object.fromEntries(await Promise.all(sourceFiles.map(async path => [path, await crypto.subtle.digest('SHA-256', await readFile(join(repository, path))).then(bytes => Buffer.from(bytes).toString('hex'))])));
  let baseCommit = null;
  try { baseCommit = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: repository, encoding: 'utf8' }).trim(); } catch { /* Source hashes identify non-Git exports. */ }
  await mkdir(dirname(output), { recursive: true });
  await writeFile(output, JSON.stringify({ measuredAt: new Date().toISOString(), baseCommit, sourceHashes, build: 'Vite production bundle / es2022', scope: 'store call through transaction commit; excludes input wait, UI rendering, first launch, attachments and physical devices', summary, ...result }, null, 2) + '\n');
  console.log(JSON.stringify({ output, summary }, null, 2));
} finally {
  await browser?.close();
  if (server) await new Promise(ready => server.close(ready));
  await rm(temporary, { recursive: true, force: true });
}
