// Original Large / 112 normal App edits / 113 complete commands and pending
// intents. This measures file creation and full empty new/clone/cold recovery.
// --soak-seconds 7200 retains the exact 112 edits and performs the original
// search/trial/viewport/offline-cold workload over at least 7,200 real seconds.
// Default 0 is a full-input diagnostic, never a completed soak claim. Linux
// observations do not certify physical-device or live API gates.
import { build } from 'vite';
import { chromium } from '@playwright/test';
import { createServer } from 'node:http';
import { mkdtemp, readFile, writeFile, mkdir, rm, readdir } from 'node:fs/promises';
import { resolve, join, extname, dirname } from 'node:path';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { release } from 'node:os';

const arg = (name, fallback) => { const index = process.argv.indexOf('--' + name); return index < 0 ? fallback : process.argv[index + 1]; };
const root = process.cwd(), output = resolve(arg('output', 'artifacts/large-history-113.json'));
const soakSeconds = Number(arg('soak-seconds', '0'));
if (![0, 7200].includes(soakSeconds)) throw Error('Only 0 (diagnostic) or the original actual 7200 seconds is supported');
const temporary = await mkdtemp('/tmp/scenario-large-history-'), helperDist = join(temporary, 'helper');
const git = (...args) => execFileSync('git', args, { cwd: root, encoding: 'utf8', maxBuffer: 16 * 1024 * 1024 }).trim();
const digest = bytes => createHash('sha256').update(bytes).digest('hex');
const require = (ok, message) => { if (!ok) throw Error(message); };
const result = { recordedAt: new Date().toISOString(), sourceCommit: git('rev-parse', 'HEAD'), sourceTree: git('rev-parse', 'HEAD^{tree}'), dirty: !!git('status', '--porcelain'),
  runKind: soakSeconds ? 'actual_7200_second_soak' : 'diagnostic_full_input',
  contract: { seed: 'large-material-rb10-v1', records: 88003, actualAssetBytes: 72 * 1024 * 1024, normalEdits: 112, completeHistory: 113, portablePending: 113, downloadLimitMs: 600000, progressLimitMs: 2000, minimumActualSoakSeconds: soakSeconds },
  environment: { os: 'Linux managed cloud', osVersion: release(), physicalDevice: false, assistiveTechnology: false, realAPI: false },
  scope: 'Production App, actual IndexedDB, normal UI edits, actual downloaded file and complete cold native correspondence. Fixture setup excluded. ' + (soakSeconds ? 'Original actual 7200-second workload; no physical/API/AT certification.' : 'Fast full-input diagnostic; actual 7200-second soak not run and not certified.'),
  sourceFiles: [], edits: [], checkpoints: [], soakChecks: [], activities: [], errors: [], restoration: {} };
const persist = async () => { await mkdir(dirname(output), { recursive: true }); await writeFile(output, JSON.stringify(result, null, 2) + '\n'); };
const sourcePaths = [...new Set([...git('ls-files', '--', 'src', 'scripts', 'tests', 'package.json', 'package-lock.json', 'vite.config.ts').split('\n'),
  ...git('ls-files', '--others', '--exclude-standard', '--', 'src', 'scripts', 'tests', 'package.json', 'package-lock.json', 'vite.config.ts').split('\n')])].filter(Boolean).sort();
for (const path of sourcePaths) { const bytes = await readFile(path); result.sourceFiles.push({ path, bytes: bytes.length, sha256: digest(bytes) }); }
let browser, server, actualFile;
try {
  await build({ configFile: false, root, base: '/__large-history/', logLevel: 'error', build: { target: 'es2022', outDir: helperDist, emptyOutDir: true,
    lib: { entry: resolve('scripts/large-history-verification-entry.mjs'), formats: ['es'], fileName: () => 'entry.js' } } });
  const artifacts = async (directory, prefix) => {
    const files = [];
    for (const item of await readdir(directory, { withFileTypes: true })) {
      const file = join(directory, item.name), path = prefix + '/' + item.name;
      if (item.isDirectory()) files.push(...await artifacts(file, path));
      else { const bytes = await readFile(file); files.push({ path, bytes: bytes.length, sha256: digest(bytes) }); }
    }
    return files;
  };
  result.buildInfo = JSON.parse(await readFile('dist/build-info.json', 'utf8'));
  require(result.buildInfo.commit === result.sourceCommit && result.buildInfo.tree === result.sourceTree, 'Production build does not match the current source commit/tree');
  result.artifactFiles = [...await artifacts(resolve('dist'), 'dist'), ...await artifacts(helperDist, 'large-history-helper')].sort((left, right) => left.path.localeCompare(right.path));
  await persist();
  server = createServer(async (request, response) => {
    const path = new URL(request.url, 'http://localhost').pathname;
    try {
      if (path === '/actual-complete.scenario') { require(actualFile, 'Actual file is not ready'); response.setHeader('Content-Type', 'application/zip'); response.end(actualFile); return; }
      if (path === '/__large-history/') { response.setHeader('Content-Type', 'text/html'); response.end('<meta charset="utf-8"><script type="module" src="entry.js"></script>'); return; }
      const helper = path.startsWith('/__large-history/'), directory = helper ? helperDist : resolve('dist');
      require(helper || path.startsWith(result.buildInfo.base), 'Path is outside the bound build');
      const relative = helper ? path.slice('/__large-history/'.length) : path.slice(result.buildInfo.base.length) || 'index.html', file = resolve(directory, relative);
      require(file.startsWith(directory + '/'), 'Unsafe artifact path');
      response.setHeader('Content-Type', ({ '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.html': 'text/html', '.svg': 'image/svg+xml' })[extname(file)] ?? 'application/octet-stream');
      response.end(await readFile(file));
    } catch { response.writeHead(404).end(); }
  });
  await new Promise(done => server.listen(0, '127.0.0.1', done));
  const origin = `http://127.0.0.1:${server.address().port}`, url = origin + result.buildInfo.base;
  browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH, args: ['--no-sandbox', '--disable-background-timer-throttling', '--disable-renderer-backgrounding'] });
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } }), page = await context.newPage();
  page.setDefaultTimeout(120000);
  page.on('pageerror', error => result.errors.push({ type: 'pageerror', message: error.message }));
  page.on('worker', worker => worker.on('close', () => console.log('worker closed', worker.url())));
  await page.goto(origin + '/__large-history/'); await page.waitForFunction(() => typeof seedLargeHistory === 'function');
  result.fixture = await page.evaluate(trial => seedLargeHistory(trial), !!soakSeconds);
  await page.goto(url); await page.locator('.app-shell').waitFor();
  result.environment.browser = await page.evaluate(() => navigator.userAgent); result.environment.browserVersion = browser.version();
  const nav = async name => { const menu = page.getByRole('button', { name: 'メニューを開く', exact: true }); if (await menu.isVisible()) await menu.click(); await page.locator('.sidebar').getByRole('button', { name }).first().click(); };
  const checkpoint = () => page.evaluate(async fixture => { await import('/__large-history/entry.js'); return sourceCheckpoint(fixture); }, result.fixture);
  const switchProject = async title => {
    await page.locator('.app-shell').waitFor(); const menu = page.getByRole('button', { name: 'メニューを開く', exact: true }); if (await menu.isVisible()) await menu.click();
    await page.locator('.project-switch').click(); await page.locator('.project-card').filter({ hasText: title }).click();
  };
  result.initial = await checkpoint();
  require(result.initial.historyCount === 1 && result.initial.pendingCount === 1, 'Original seeded command/pending must both be retained');
  await nav(/^資料/); await page.locator('.entity-card').first().click();
  const soakStarted = performance.now();
  result.soak = { requiredSeconds: soakSeconds, startedAt: new Date().toISOString(), elapsedSeconds: 0, completed: false, intervalSeconds: soakSeconds ? 7200 / 112 : 0,
    workload: '112 normal source name edits; source search; separate auxiliary trial; alternating viewport; offline cold reload every fifth edit. Waits preserve exact 113 command/pending input.' };
  await persist();
  for (let index = 0; index < 112; index++) {
    await page.evaluate(() => performance.clearMeasures('scenario-local-save'));
    const name = '継続編集' + index;
    await page.getByLabel('名前', { exact: true }).fill(name);
    await page.waitForFunction(() => performance.getEntriesByName('scenario-local-save').length > 0);
    await page.locator('.editor-save-state').filter({ hasText: '端末内保存済み' }).waitFor();
    const measurement = await page.evaluate(() => { const entry = performance.getEntriesByName('scenario-local-save').at(-1); return { milliseconds: entry.duration, stages: entry.detail }; });
    result.edits.push({ index, name, at: new Date().toISOString(), ...measurement });
    if (soakSeconds) {
      const activity = { edit: index, startedAt: new Date().toISOString(), sourceProjectId: result.fixture.projectId };
      await nav(/^検索/); await page.getByLabel('作品内を検索', { exact: true }).fill(name); await page.locator('.entity-card').filter({ hasText: name }).first().waitFor();
      activity.search = { query: name, matchingSourceRendered: true };
      const width = index % 2 ? 1440 : 390, height = index % 2 ? 1000 : 844;
      await page.setViewportSize({ width, height }); activity.viewport = { width, height, physicalOrientation: false };
      await switchProject(result.fixture.trial.title); await nav(/^構成/); await page.getByRole('tab', { name: '試読・検査', exact: true }).click();
      await page.getByRole('button', { name: /^(試読を始める|この状態から開始し直す)$/ }).click(); await page.locator('.reader-choice').first().click();
      await page.getByRole('heading', { name: '補助試読終端', exact: true }).waitFor(); activity.trial = { projectId: result.fixture.trial.projectId, ending: '補助試読終端', completed: true };
      await switchProject(result.fixture.name); await nav(/^資料/);
      if ((index + 1) % 5 === 0) {
        await context.setOffline(true); await page.reload(); await page.locator('.entity-card').first().waitFor(); await context.setOffline(false);
        activity.offlineCold = { completed: true, sourceProjectId: result.fixture.projectId };
      }
      // Return to the same authored record regardless of card sorting or layout.
      await page.locator('.entity-card').filter({ has: page.getByRole('heading', { name, exact: true }) }).first().click();
      await page.getByLabel('名前', { exact: true }).waitFor();
      activity.finishedAt = new Date().toISOString(); result.activities.push(activity);
    }
    if (soakSeconds || (index + 1) % 8 === 0) {
      const point = await checkpoint(); require(point.historyCount === index + 2 && point.pendingCount === index + 2, 'Source normal history/pending order lost a command');
      if (soakSeconds) result.soakChecks.push(point);
      if ((index + 1) % 8 === 0) { result.checkpoints.push(point); console.log('normal App edits', index + 1); }
      await persist();
    }
    if (soakSeconds) {
      const target = soakStarted + (index + 1) * soakSeconds * 1000 / 112;
      while (performance.now() < target) await page.waitForTimeout(Math.min(30000, target - performance.now()));
      result.soak.elapsedSeconds = (performance.now() - soakStarted) / 1000; await persist();
    }
  }
  result.soak.elapsedSeconds = (performance.now() - soakStarted) / 1000;
  result.soak.finishedAt = new Date().toISOString();
  if (soakSeconds) { require(result.soak.elapsedSeconds >= 7200 && result.activities.length === 112 && result.soakChecks.length === 112, 'Original real-time soak, full image/material checks or activity count was not completed'); result.soak.completed = true; }
  await page.setViewportSize({ width: 1440, height: 1000 });
  result.before = await checkpoint();
  require(result.before.historyCount === 113 && result.before.pendingCount === 113 && result.checkpoints.length === 14, 'Original 113/113 source is required');
  result.sourceHistory = await page.evaluate(async fixture => { await import('/__large-history/entry.js'); return inspectSourceHistory(fixture); }, result.fixture);
  await persist();
  await nav(/^作品/); await page.getByRole('tab', { name: '完全保存・復元', exact: true }).click();
  let downloads = 0; const countDownload = () => downloads++; page.on('download', countDownload);
  await page.getByRole('button', { name: '完全保存ファイルを作成', exact: true }).click();
  const cancel = page.getByRole('status').getByRole('button', { name: '中止', exact: true });
  await cancel.waitFor({ timeout: 2000 }); await cancel.click();
  await page.getByRole('alert').filter({ hasText: /取り消|中止/ }).waitFor();
  result.afterCancel = await checkpoint(); require(downloads === 0 && JSON.stringify(result.afterCancel) === JSON.stringify(result.before), 'Cancel changed native source or downloaded partial bytes');
  page.off('download', countDownload);
  await page.evaluate(() => {
    const probe = { startedAt: 0, firstPaintAt: 0, maximumTimerGap: 0 }, button = [...document.querySelectorAll('button')].find(button => button.textContent === '完全保存ファイルを作成');
    globalThis.__largeHistoryExportProbe = probe;
    button.addEventListener('click', () => {
      probe.startedAt = performance.now(); let previous = probe.startedAt;
      const timer = setInterval(() => { const now = performance.now(); probe.maximumTimerGap = Math.max(probe.maximumTimerGap, now - previous); previous = now; }, 50);
      globalThis.__finishLargeHistoryProbe = () => { clearInterval(timer); return { ...probe, elapsedMs: performance.now() - probe.startedAt }; };
      const frame = () => { const cancel = [...document.querySelectorAll('[role=status] button')].find(button => button.textContent === '中止'); if (cancel?.getBoundingClientRect().width) probe.firstPaintAt = performance.now(); else requestAnimationFrame(frame); }; requestAnimationFrame(frame);
    }, { once: true });
  });
  const pendingDownload = page.waitForEvent('download', { timeout: 600000 });
  await page.getByRole('button', { name: '完全保存ファイルを作成', exact: true }).click();
  await cancel.waitFor({ timeout: 2000 });
  const download = await pendingDownload; require(await download.failure() === null, 'Actual download failed');
  result.exportTiming = await page.evaluate(() => __finishLargeHistoryProbe());
  actualFile = await readFile(await download.path()); const archivePath = output.replace(/\.json$/, '') + '-complete.scenario';
  await writeFile(archivePath, actualFile); result.completeFile = { path: archivePath, bytes: actualFile.length, sha256: digest(actualFile) };
  require(result.exportTiming.elapsedMs <= 600000, 'Original full download deadline exceeded');
  require(result.exportTiming.firstPaintAt > result.exportTiming.startedAt && result.exportTiming.firstPaintAt - result.exportTiming.startedAt <= 2000, 'Progress/cancel did not paint within the original 2-second contract');
  require(result.exportTiming.maximumTimerGap <= 2000, 'The UI was unresponsive for more than 2 seconds during full export');
  result.afterExport = await checkpoint(); require(JSON.stringify(result.afterExport) === JSON.stringify(result.before), 'Export changed the native source'); await persist();
  result.expected = await page.evaluate(async source => { await import('/__large-history/entry.js'); return inspectExpected(source); }, { firstName: result.fixture.firstName, checkpoints: result.checkpoints, initial: result.initial, sourceHistory: result.sourceHistory, soakChecks: soakSeconds ? result.soakChecks : undefined });
  await persist();
  for (const mode of ['new', 'clone']) {
    const fresh = await browser.newContext({ viewport: { width: 1440, height: 1000 } }), restored = await fresh.newPage(); restored.setDefaultTimeout(600000);
    restored.on('pageerror', error => result.errors.push({ type: 'restore-pageerror', mode, message: error.message }));
    await restored.goto(url); await restored.getByRole('button', { name: '保存ファイルを読み込む', exact: true }).click();
    await restored.locator('input[type=file][accept*=".scenario"]').setInputFiles({ name: 'original-large113.scenario', mimeType: 'application/zip', buffer: actualFile });
    await restored.locator('.import-preview h3').filter({ hasText: '検査済みの作品' }).waitFor();
    await restored.getByLabel('復元方法', { exact: true }).selectOption(mode); await restored.getByLabel('復元方法と対象への影響を確認しました').check();
    await restored.getByRole('button', { name: 'この内容で復元する', exact: true }).click(); await restored.locator('.app-shell').waitFor();
    await restored.reload(); await restored.locator('.app-shell').waitFor();
    result.restoration[mode] = await restored.evaluate(async ({ expected, mode }) => { await import('/__large-history/entry.js'); return inspectNative(expected, mode); }, { expected: result.expected, mode });
    await persist(); await fresh.close(); console.log('full native cold correspondence passed', mode);
  }
  require(result.errors.length === 0, 'Browser reported errors'); result.fullInputRecoveryCompleted = true; result.completed = soakSeconds === 7200; result.finishedAt = new Date().toISOString(); await persist();
} catch (error) { result.errors.push({ type: 'measurement', message: error.message, stack: error.stack }); await persist(); throw error; }
finally { await browser?.close(); if (server) { server.closeAllConnections(); await new Promise(done => server.close(done)); } await rm(temporary, { recursive: true, force: true }); }
