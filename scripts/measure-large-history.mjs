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
const startedMonotonic = performance.now();
const timestamp = () => ({ at: new Date().toISOString(), elapsedMs: performance.now() - startedMonotonic });
const errorDetails = error => ({ name: error.name, message: error.message, stack: error.stack });
const result = { recordedAt: new Date().toISOString(), sourceCommit: git('rev-parse', 'HEAD'), sourceTree: git('rev-parse', 'HEAD^{tree}'), dirty: !!git('status', '--porcelain'),
  status: 'running', completed: false, fullInputRecoveryCompleted: false,
  runKind: soakSeconds ? 'actual_7200_second_soak' : 'diagnostic_full_input',
  contract: { seed: 'large-material-rb10-v1', records: 88003, actualAssetBytes: 72 * 1024 * 1024, normalEdits: 112, completeHistory: 113, portablePending: 113, downloadLimitMs: 600000, progressLimitMs: 2000, minimumActualSoakSeconds: soakSeconds },
  environment: { os: 'Linux managed cloud', osVersion: release(), physicalDevice: false, assistiveTechnology: false, realAPI: false },
  scope: 'Production App, actual IndexedDB, normal UI edits, actual downloaded file and complete cold native correspondence. Fixture setup excluded. ' + (soakSeconds ? 'Original actual 7200-second workload; no physical/API/AT certification.' : 'Fast full-input diagnostic; actual 7200-second soak not run and not certified.'),
  sourceFiles: [], edits: [], checkpoints: [], soakChecks: [], activities: [], errors: [], restoration: {}, stages: [], workerEvents: [], uiHistory: [], consoleMessages: [],
  cancelTiming: { status: 'unmeasured', reason: 'Pointer-to-painted-alert interval has not been collected', limitMs: 2000 },
  exportTiming: { status: 'unmeasured', firstPaintStatus: 'unmeasured', heartbeatStatus: 'unmeasured', reason: 'Full export probe has not been collected' } };
let persistence = Promise.resolve();
const persist = () => { persistence = persistence.then(async () => { await mkdir(dirname(output), { recursive: true }); await writeFile(output, JSON.stringify(result, null, 2) + '\n'); }); return persistence; };
const stage = name => { result.currentStage = name; const event = { stage: name, ...timestamp() }; result.stages.push(event); console.log('stage', JSON.stringify(event)); };
const timingFromProbe = probe => {
  if (!probe?.startedAt) return { status: 'unmeasured', firstPaintStatus: 'unmeasured', heartbeatStatus: 'unmeasured', reason: 'Full export click was not observed' };
  return { ...probe, status: 'measured', firstPaintStatus: probe.firstPaintAt > probe.startedAt ? 'measured' : 'unmeasured',
    firstPaintElapsedMs: probe.firstPaintAt > probe.startedAt ? probe.firstPaintAt - probe.startedAt : null,
    heartbeatStatus: probe.timerTicks > 0 ? 'measured' : 'unmeasured', maximumTimerGap: probe.timerTicks > 0 ? probe.maximumTimerGap : null };
};
const cancelTimingFromProbe = probe => {
  if (!probe?.pointerAt || !probe.alertPaintAt) return { ...probe, status: 'unmeasured', reason: 'Both cancellation pointer and painted alert were not observed', limitMs: 2000 };
  return { ...probe, status: 'measured', elapsedMs: probe.alertPaintAt - probe.pointerAt, limitMs: 2000 };
};
const artifacts = async (directory, prefix) => {
  const files = [];
  for (const item of await readdir(directory, { withFileTypes: true })) {
    const file = join(directory, item.name), path = prefix + '/' + item.name;
    if (item.isDirectory()) files.push(...await artifacts(file, path));
    else { const bytes = await readFile(file); files.push({ path, bytes: bytes.length, sha256: digest(bytes) }); }
  }
  return files.sort((left, right) => left.path.localeCompare(right.path));
};
const retainedHelper = output.replace(/\.json$/, '') + '-helper-artifacts';
let helperArtifactManifest;
const verifyHelperRetention = async () => {
  const sourceFiles = await artifacts(helperDist, 'large-history-helper'), retainedFiles = await artifacts(retainedHelper, 'large-history-helper');
  return { recordedAt: new Date().toISOString(), sourceFiles, retainedFiles,
    sourceUnchanged: JSON.stringify(sourceFiles) === JSON.stringify(helperArtifactManifest),
    retainedUnchanged: JSON.stringify(retainedFiles) === JSON.stringify(helperArtifactManifest) };
};
const sourcePaths = [...new Set([...git('ls-files', '--', 'src', 'scripts', 'tests', 'package.json', 'package-lock.json', 'vite.config.ts').split('\n'),
  ...git('ls-files', '--others', '--exclude-standard', '--', 'src', 'scripts', 'tests', 'package.json', 'package-lock.json', 'vite.config.ts').split('\n')])].filter(Boolean).sort();
for (const path of sourcePaths) { const bytes = await readFile(path); result.sourceFiles.push({ path, bytes: bytes.length, sha256: digest(bytes) }); }
let browser, server, actualFile, page;
// A failed or frozen page must not add another default 120-second wait, and
// partial observations never establish a passing response-time interval.
const collectFailureObservation = async () => {
  const begin = timestamp();
  if (!page || page.isClosed()) { result.failureObservation = { ...begin, status: 'unavailable', reason: 'Source page is not open' }; return; }
  let timeout;
  const observed = page.evaluate(() => ({
    ui: globalThis.__largeHistoryUIProbe?.snapshot(),
    export: globalThis.__finishLargeHistoryProbe?.(),
    cancel: globalThis.__largeHistoryCancelProbe,
  })).then(value => ({ status: 'collected', value }), error => ({ status: 'failed', error: errorDetails(error) }));
  const observation = await Promise.race([observed, new Promise(done => { timeout = setTimeout(() => done({ status: 'timed_out', reason: 'Page did not answer within the separate 2000ms failure-collection budget' }), 2000); })]);
  clearTimeout(timeout);
  result.failureObservation = { started: begin, finished: timestamp(), ...observation };
  if (observation.status === 'collected') {
    result.exportTiming = timingFromProbe(observation.value.export);
    result.cancelTiming = cancelTimingFromProbe(observation.value.cancel);
  } else {
    result.exportTiming = { status: 'unmeasured', firstPaintStatus: 'unmeasured', heartbeatStatus: 'unmeasured', reason: 'Final full export interval could not be collected', lastObserved: result.exportTiming };
  }
};
try {
  stage('build_verification_helper');
  await build({ configFile: false, root, base: '/__large-history/', logLevel: 'error', build: { target: 'es2022', outDir: helperDist, emptyOutDir: true,
    lib: { entry: resolve('scripts/large-history-verification-entry.mjs'), formats: ['es'], fileName: () => 'entry.js' } } });
  result.buildInfo = JSON.parse(await readFile('dist/build-info.json', 'utf8'));
  require(result.buildInfo.commit === result.sourceCommit && result.buildInfo.tree === result.sourceTree, 'Production build does not match the current source commit/tree');
  helperArtifactManifest = await artifacts(helperDist, 'large-history-helper');
  result.artifactFiles = [...await artifacts(resolve('dist'), 'dist'), ...helperArtifactManifest].sort((left, right) => left.path.localeCompare(right.path));
  // Preserve the exact served helper bytes before fixture setup or measurement.
  // An earlier attempt's directory is never merged into or overwritten.
  await mkdir(dirname(output), { recursive: true }); await mkdir(retainedHelper);
  result.helperRetention = { directory: retainedHelper, status: 'copying', scope: 'All served helper build files; before/after byte and SHA checks outside the measured workload' };
  for (const file of helperArtifactManifest) {
    const relative = file.path.slice('large-history-helper/'.length), bytes = await readFile(join(helperDist, relative)), target = join(retainedHelper, relative);
    require(bytes.length === file.bytes && digest(bytes) === file.sha256, 'Helper bytes changed before retention: ' + file.path);
    await mkdir(dirname(target), { recursive: true }); await writeFile(target, bytes, { flag: 'wx' });
  }
  result.helperRetention.before = await verifyHelperRetention();
  require(result.helperRetention.before.sourceUnchanged && result.helperRetention.before.retainedUnchanged, 'Retained helper bytes differ before measurement');
  result.helperRetention.status = 'retained_before_measurement';
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
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } }); page = await context.newPage();
  page.setDefaultTimeout(120000);
  page.on('pageerror', error => result.errors.push({ type: 'pageerror', ...timestamp(), ...errorDetails(error) }));
  page.on('console', message => { if (['error', 'warning'].includes(message.type())) result.consoleMessages.push({ ...timestamp(), type: message.type(), text: message.text() }); });
  page.on('worker', worker => {
    const record = state => { const event = { ...timestamp(), state, url: worker.url(), stage: result.currentStage }; result.workerEvents.push(event); console.log('worker', JSON.stringify(event)); };
    record('created'); worker.on('close', () => record('closed'));
  });
  await page.exposeBinding('__recordLargeHistoryUI', (_source, observation) => {
    const event = { ...timestamp(), stage: result.currentStage, ...observation };
    if (observation.type === 'ui') result.uiHistory.push(event);
    else if (observation.type === 'export_probe') result.exportTiming = timingFromProbe(observation.probe);
    else if (observation.type === 'cancel_probe') result.cancelTiming = cancelTimingFromProbe(observation.probe);
    console.log('live UI', JSON.stringify(event));
    // This does not block browser work or alter the original timed intervals.
    void persist().catch(error => console.error('observation persistence failed', error.message));
  });
  stage('seed_original_large_fixture');
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
  stage('112_normal_app_edits');
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
  stage('source_full_checkpoint');
  result.before = await checkpoint();
  require(result.before.historyCount === 113 && result.before.pendingCount === 113 && result.checkpoints.length === 14, 'Original 113/113 source is required');
  stage('source_113_full_command_and_pending_hashes');
  result.sourceHistory = await page.evaluate(async fixture => { await import('/__large-history/entry.js'); return inspectSourceHistory(fixture); }, result.fixture);
  await persist();
  await nav(/^作品/); await page.getByRole('tab', { name: '完全保存・復元', exact: true }).click();
  await page.evaluate(() => {
    const visible = element => {
      if (!element.getClientRects().length) return false;
      for (let node = element; node instanceof HTMLElement; node = node.parentElement) {
        const style = getComputedStyle(node);
        if (style.display === 'none' || ['hidden', 'collapse'].includes(style.visibility) || Number(style.opacity) === 0) return false;
      }
      return true;
    };
    const panel = document.querySelector('.backup-page');
    const snapshot = () => ({ browserAt: performance.now(), browserTimeOrigin: performance.timeOrigin,
      statuses: [...panel.querySelectorAll('[role=status]')].filter(visible).map(node => node.textContent ?? ''),
      alerts: [...panel.querySelectorAll('[role=alert]')].filter(visible).map(node => node.textContent ?? ''),
      exportButtonDisabled: [...panel.querySelectorAll('button')].find(button => button.textContent === '完全保存ファイルを作成')?.disabled ?? null });
    let previous = '';
    const report = () => { const value = snapshot(), key = JSON.stringify({ statuses: value.statuses, alerts: value.alerts, exportButtonDisabled: value.exportButtonDisabled });
      if (key !== previous) { previous = key; void __recordLargeHistoryUI({ type: 'ui', ...value }).catch(() => {}); } };
    const observer = new MutationObserver(report); observer.observe(panel, { childList: true, subtree: true, characterData: true, attributes: true, attributeFilter: ['disabled', 'style', 'class', 'hidden'] });
    globalThis.__largeHistoryUIProbe = { snapshot, stop: () => observer.disconnect() }; report();
  });
  stage('cancel_start_export');
  let downloads = 0; const countDownload = () => downloads++; page.on('download', countDownload);
  await page.getByRole('button', { name: '完全保存ファイルを作成', exact: true }).click();
  const cancel = page.getByRole('status').getByRole('button', { name: '中止', exact: true });
  await cancel.waitFor({ timeout: 2000 });
  await cancel.evaluate(button => {
    const probe = { pointerAt: 0, alertPaintAt: 0, alertText: '' };
    globalThis.__largeHistoryCancelProbe = probe;
    const visibleAlert = () => [...document.querySelectorAll('.backup-page [role=alert]')].find(alert => {
      if (!/取り消|中止/.test(alert.textContent ?? '') || !alert.getClientRects().length) return false;
      for (let node = alert; node instanceof HTMLElement; node = node.parentElement) {
        const style = getComputedStyle(node);
        if (style.display === 'none' || ['hidden', 'collapse'].includes(style.visibility) || Number(style.opacity) === 0) return false;
      }
      return true;
    });
    button.addEventListener('pointerdown', () => {
      probe.pointerAt = performance.now();
      const frame = () => {
        if (visibleAlert()) requestAnimationFrame(() => {
          const alert = visibleAlert();
          if (alert) {
            probe.alertPaintAt = performance.now(); probe.alertText = alert.textContent ?? '';
            void __recordLargeHistoryUI({ type: 'cancel_probe', probe: { ...probe } }).catch(() => {});
          }
          else requestAnimationFrame(frame);
        });
        else requestAnimationFrame(frame);
      };
      requestAnimationFrame(frame);
    }, { once: true, capture: true });
  });
  stage('cancel_pointer_to_painted_alert');
  await cancel.click();
  await page.getByRole('alert').filter({ hasText: /取り消|中止/ }).waitFor();
  await page.waitForFunction(() => globalThis.__largeHistoryCancelProbe.alertPaintAt > 0);
  result.cancelTiming = cancelTimingFromProbe(await page.evaluate(() => globalThis.__largeHistoryCancelProbe));
  require(result.cancelTiming.pointerAt > 0 && result.cancelTiming.alertPaintAt > result.cancelTiming.pointerAt && result.cancelTiming.elapsedMs <= 2000, 'Cancel pointer-to-painted-alert exceeded the original 2-second contract');
  stage('cancel_native_source_unchanged_check');
  result.afterCancel = await checkpoint(); require(downloads === 0 && JSON.stringify(result.afterCancel) === JSON.stringify(result.before), 'Cancel changed native source or downloaded partial bytes');
  page.off('download', countDownload);
  await persist();
  await page.evaluate(() => {
    const probe = { startedAt: 0, firstPaintAt: 0, maximumTimerGap: 0, timerTicks: 0, finishedAt: 0 }, button = [...document.querySelectorAll('button')].find(button => button.textContent === '完全保存ファイルを作成');
    globalThis.__largeHistoryExportProbe = probe;
    button.addEventListener('click', () => {
      probe.startedAt = performance.now(); let previous = probe.startedAt, reportedGapFailure = false, frameId;
      const report = () => { void __recordLargeHistoryUI({ type: 'export_probe', probe: { ...probe, elapsedMs: performance.now() - probe.startedAt } }).catch(() => {}); };
      const timer = setInterval(() => {
        const now = performance.now(); probe.maximumTimerGap = Math.max(probe.maximumTimerGap, now - previous); previous = now; probe.timerTicks++;
        if (!reportedGapFailure && probe.maximumTimerGap > 2000) { reportedGapFailure = true; report(); }
      }, 50);
      globalThis.__finishLargeHistoryProbe = () => {
        if (!probe.finishedAt) {
          probe.finishedAt = performance.now(); clearInterval(timer); cancelAnimationFrame(frameId);
          if (probe.timerTicks) probe.maximumTimerGap = Math.max(probe.maximumTimerGap, probe.finishedAt - previous);
        }
        return { ...probe, elapsedMs: probe.finishedAt - probe.startedAt };
      };
      const visibleCancel = () => {
        const cancel = [...document.querySelectorAll('.backup-page [role=status] button')].find(button => button.textContent === '中止');
        if (!cancel?.getClientRects().length) return false;
        for (let node = cancel; node instanceof HTMLElement; node = node.parentElement) {
          const style = getComputedStyle(node);
          if (style.display === 'none' || ['hidden', 'collapse'].includes(style.visibility) || Number(style.opacity) === 0) return false;
        }
        return true;
      };
      const frame = () => {
        if (visibleCancel()) frameId = requestAnimationFrame(() => {
          if (visibleCancel()) { probe.firstPaintAt = performance.now(); report(); }
          else frameId = requestAnimationFrame(frame);
        });
        else frameId = requestAnimationFrame(frame);
      };
      frameId = requestAnimationFrame(frame);
      report();
    }, { once: true });
  });
  stage('full_export_click');
  result.downloadWait = { status: 'waiting', limitMs: 600000, started: timestamp() };
  // Attach the rejection handler before the click or cancel-button wait. The
  // original download deadline remains unchanged, including early UI errors.
  const pendingDownload = page.waitForEvent('download', { timeout: 600000 }).then(download => {
    result.downloadWait = { ...result.downloadWait, status: 'received', finished: timestamp(), suggestedFilename: download.suggestedFilename() };
    console.log('download event', JSON.stringify(result.downloadWait));
    return { ok: true, download };
  }, error => {
    result.downloadWait = { ...result.downloadWait, status: 'failed', finished: timestamp(), error: errorDetails(error) };
    console.log('download wait failed', JSON.stringify(result.downloadWait));
    void persist().catch(cause => console.error('download failure persistence failed', cause.message));
    return { ok: false, error };
  });
  await page.getByRole('button', { name: '完全保存ファイルを作成', exact: true }).click();
  stage('full_export_progress_visibility');
  await cancel.waitFor({ timeout: 2000 });
  stage('full_export_wait_download');
  const downloadResult = await pendingDownload;
  if (!downloadResult.ok) throw downloadResult.error;
  const download = downloadResult.download, downloadFailure = await download.failure();
  result.downloadWait.fileFailure = downloadFailure;
  require(downloadFailure === null, 'Actual download failed: ' + downloadFailure);
  result.exportTiming = timingFromProbe(await page.evaluate(() => __finishLargeHistoryProbe()));
  stage('actual_archive_bytes_and_hash');
  actualFile = await readFile(await download.path()); const archivePath = output.replace(/\.json$/, '') + '-complete.scenario';
  await writeFile(archivePath, actualFile); result.completeFile = { path: archivePath, bytes: actualFile.length, sha256: digest(actualFile) };
  require(result.exportTiming.elapsedMs <= 600000, 'Original full download deadline exceeded');
  require(result.exportTiming.firstPaintAt > result.exportTiming.startedAt && result.exportTiming.firstPaintAt - result.exportTiming.startedAt <= 2000, 'Progress/cancel did not paint within the original 2-second contract');
  require(result.exportTiming.heartbeatStatus === 'measured' && result.exportTiming.maximumTimerGap <= 2000, 'The original full export UI heartbeat was unmeasured or exceeded 2 seconds');
  stage('post_export_native_source_unchanged_check');
  result.afterExport = await checkpoint(); require(JSON.stringify(result.afterExport) === JSON.stringify(result.before), 'Export changed the native source'); await persist();
  stage('actual_archive_113_full_history_and_material_validation');
  result.expected = await page.evaluate(async source => { await import('/__large-history/entry.js'); return inspectExpected(source); }, { firstName: result.fixture.firstName, checkpoints: result.checkpoints, initial: result.initial, sourceHistory: result.sourceHistory, soakChecks: soakSeconds ? result.soakChecks : undefined });
  await persist();
  for (const mode of ['new', 'clone']) {
    stage(mode + '_empty_native_restore');
    const fresh = await browser.newContext({ viewport: { width: 1440, height: 1000 } }), restored = await fresh.newPage(); restored.setDefaultTimeout(600000);
    restored.on('pageerror', error => result.errors.push({ type: 'restore-pageerror', mode, message: error.message }));
    await restored.goto(url); await restored.getByRole('button', { name: '保存ファイルを読み込む', exact: true }).click();
    await restored.locator('input[type=file][accept*=".scenario"]').setInputFiles({ name: 'original-large113.scenario', mimeType: 'application/zip', buffer: actualFile });
    await restored.locator('.import-preview h3').filter({ hasText: '検査済みの作品' }).waitFor();
    await restored.getByLabel('復元方法', { exact: true }).selectOption(mode); await restored.getByLabel('復元方法と対象への影響を確認しました').check();
    await restored.getByRole('button', { name: 'この内容で復元する', exact: true }).click(); await restored.locator('.app-shell').waitFor();
    stage(mode + '_cold_native_full_correspondence');
    await restored.reload(); await restored.locator('.app-shell').waitFor();
    result.restoration[mode] = await restored.evaluate(async ({ expected, mode }) => { await import('/__large-history/entry.js'); return inspectNative(expected, mode); }, { expected: result.expected, mode });
    await persist(); await fresh.close(); console.log('full native cold correspondence passed', mode);
  }
  require(result.errors.length === 0, 'Browser reported errors'); result.fullInputRecoveryCompleted = true; result.completed = soakSeconds === 7200;
  result.status = soakSeconds ? 'completed' : 'diagnostic_full_input_recovery_completed'; stage(result.status); result.finishedAt = new Date().toISOString(); await persist();
} catch (error) {
  result.status = 'failed'; result.completed = false; result.finishedAt = new Date().toISOString();
  result.errors.push({ type: 'measurement', stage: result.currentStage, ...timestamp(), ...errorDetails(error) });
  await collectFailureObservation(); await persist(); throw error;
} finally {
  result.cleanup = { started: timestamp(), status: 'running', errors: [] };
  for (const [name, available, action] of [
    ['browser', !!browser, () => browser.close()],
    ['server', !!server, async () => { server.closeAllConnections(); await new Promise(done => server.close(done)); }],
  ]) {
    if (!available) { result.cleanup[name] = 'not_started'; continue; }
    try { await action(); result.cleanup[name] = 'closed'; }
    catch (error) { result.cleanup[name] = 'failed'; result.cleanup.errors.push({ resource: name, ...errorDetails(error) }); }
  }
  if (result.helperRetention) {
    try {
      result.helperRetention.after = await verifyHelperRetention();
      require(result.helperRetention.after.sourceUnchanged && result.helperRetention.after.retainedUnchanged, 'Served or retained helper bytes changed during measurement');
      result.helperRetention.status = 'retained_and_verified_before_after';
    } catch (error) {
      result.helperRetention.status = 'failed'; result.helperRetention.error = errorDetails(error);
      result.errors.push({ type: 'helper-retention', ...errorDetails(error) }); result.status = 'failed'; result.completed = false; process.exitCode = 1;
    }
  }
  try { await rm(temporary, { recursive: true, force: true }); result.cleanup.temporary_helper = 'closed'; }
  catch (error) { result.cleanup.temporary_helper = 'failed'; result.cleanup.errors.push({ resource: 'temporary_helper', ...errorDetails(error) }); }
  result.cleanup.status = result.cleanup.errors.length ? 'failed' : 'completed'; result.cleanup.finished = timestamp(); await persist();
}
