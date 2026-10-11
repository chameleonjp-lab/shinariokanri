'use strict';
// External observation only. Candidate sources, payloads and API outcomes stay unchanged.
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const root = '/workspace/runtime-verification';
const directory = process.env.AP04_EVIDENCE_DIR;
const selectedSpec = process.env.AP04_SMOKE_SPEC;
const allowedSpecs = new Set([
  'ap04-original-n-condition-parity.spec.ts', 'ap04-original-f-hierarchy.spec.ts',
  'ap04-original-f-production.spec.ts', 'ap04-original-e09-world-production.spec.ts',
  'ap04-original-n-f16-20.spec.ts', 'ap04-original-n-f14-trigger.spec.ts',
  'ap04-original-f-index.spec.ts', 'ap04-original-f-resume-recovery.spec.ts',
  'ap04-original-n20-targets.spec.ts', 'ap04-original-root-restoration-output.spec.ts',
]);

// Global binding's Node --version and unrelated processes must not record artifacts.
if (directory && allowedSpecs.has(selectedSpec)) {
  const hash = bytes => crypto.createHash('sha256').update(bytes).digest('hex');
  const marked = Symbol.for('ap04.b56e8b9.actualArtifactObservation');
  const pageInfo = new WeakMap();
  const downloads = new WeakMap();
  const downloadMethods = new WeakMap();
  let serial = 0;
  let errorSerial = 0;
  let testApi;
  let identity;

  function write(name, record) {
    fs.mkdirSync(directory, { recursive: true });
    fs.writeFileSync(path.join(directory, name), JSON.stringify(record, null, 2) + '\n', { flag: 'wx' });
  }

  function observationError(stage, error, detail = {}) {
    const record = { kind: 'observation-error', stage, pid: process.pid, at: new Date().toISOString(), name: error?.name, message: String(error?.message ?? error), stack: error?.stack, detail };
    try { write(`observation-error-${process.pid}-${++errorSerial}.json`, record); }
    catch (retentionError) { record.errorRetentionFailure = String(retentionError?.message ?? retentionError); }
    try { process.stderr.write('[AP04_ARTIFACT_OBSERVATION_ERROR] ' + JSON.stringify(record) + '\n'); }
    catch { /* Neither observation failure nor its logging changes the original API. */ }
  }

  function observePromise(promise, observer, stage, rejected) {
    // Register before caller await; return the ORIGINAL Promise/result unchanged.
    try {
      promise.then(value => {
        try { observer(value); } catch (error) { observationError(stage, error); }
      }, error => { if (rejected) observationError(stage + '-rejected', error, rejected); })
        .catch(error => observationError(stage, error));
    } catch (error) { observationError(stage, error); }
    return promise;
  }

  function currentInfo() {
    testApi ??= require(path.join(root, 'node_modules/@playwright/test')).test;
    let info;
    try { info = testApi.info(); } catch { return null; }
    if (path.basename(info.file) !== selectedSpec || info.project.name !== 'chromium') return null;
    return { file: info.file, title: info.title, testId: info.testId ?? null, engine: info.project.name, retry: info.retry, workerIndex: info.workerIndex };
  }

  function infoFor(page) {
    let info = pageInfo.get(page);
    if (!info) {
      info = currentInfo();
      if (info) pageInfo.set(page, info);
    }
    return info;
  }

  function upload(frame, args) {
    const page = frame.page(), info = infoFor(page);
    if (!info) return;
    const files = Array.isArray(args[1]) ? args[1] : [args[1]];
    for (let index = 0; index < files.length; index++) {
      const payload = files[index];
      const isBuffer = payload && typeof payload === 'object' && typeof payload.name === 'string' && payload.name.endsWith('.scenario') && Buffer.isBuffer(payload.buffer);
      const isPath = typeof payload === 'string' && payload.endsWith('.scenario');
      if (!isBuffer && !isPath) continue;
      const originalBytes = isBuffer ? payload.buffer : fs.readFileSync(path.resolve(payload));
      const copied = Buffer.from(originalBytes);
      const key = `upload-${process.pid}-${++serial}`;
      const filename = key + '.scenario';
      fs.mkdirSync(directory, { recursive: true });
      fs.writeFileSync(path.join(directory, filename), copied, { flag: 'wx' });
      const sha256 = hash(copied);
      const forwardSourceSHA256 = hash(isBuffer ? payload.buffer : fs.readFileSync(path.resolve(payload)));
      write(key + '.json', { kind: 'upload', key, filename, ...info, pid: process.pid, index,
        sourceName: isBuffer ? payload.name : path.basename(payload), sourcePath: isPath ? path.resolve(payload) : null,
        mimeType: isBuffer ? payload.mimeType : null, sourceKind: isBuffer ? 'buffer' : 'path',
        bytes: copied.length, sha256, forwardSourceSHA256, pageId: page._guid ?? null,
        selector: args[0], capturedAt: new Date().toISOString(), hookIdentity: identity,
        originalReceiverReused: true, originalArgumentsReused: true, observationOnly: true,
        originalWholeAcceptancePromotion: false });
      if (sha256 !== forwardSourceSHA256) throw Error('Input changed during synchronous observation');
    }
  }

  function captureDownload(download, state, actualPath, reason) {
    if (state.finished) return;
    state.finished = true;
    if (typeof actualPath !== 'string') throw Error('Actual Download.path did not resolve a local file');
    const bytes = fs.readFileSync(actualPath);
    // .bin avoids confusing actual runtime JSON with evidence metadata JSON.
    const filename = state.key + '.bin';
    fs.writeFileSync(path.join(directory, filename), bytes, { flag: 'wx' });
    const sha256 = hash(bytes), sourceSHA256 = hash(fs.readFileSync(actualPath));
    write(state.key + '.json', { kind: 'download', ...state.metadata, key: state.key, filename,
      bytes: bytes.length, sha256, sourceSHA256, actualPath, captureReason: reason,
      capturedAt: new Date().toISOString(), observationOnly: true,
      callerPathInvocationsAtCapture: state.callerPathInvocations,
      originalCallerReturnPolicy: 'original result unchanged', originalWholeAcceptancePromotion: false });
    if (sha256 !== sourceSHA256) throw Error('Download source changed during synchronous observation');
  }

  function installDownload(download) {
    const prototype = Object.getPrototypeOf(download);
    if (downloadMethods.has(prototype)) return downloadMethods.get(prototype);
    const original = prototype.path;
    if (typeof original !== 'function') throw Error('Original Download.path unavailable');
    prototype.path = function observedPath() {
      const promise = original.apply(this, arguments);
      const state = downloads.get(this);
      if (state) {
        state.callerPathInvocations++;
        observePromise(promise, value => captureDownload(this, state, value, 'caller-path'), 'download-path', { key: state.key });
      }
      return promise;
    };
    downloadMethods.set(prototype, original);
    return original;
  }

  function downloadEvent(page, download) {
    const info = infoFor(page);
    if (!info) throw Error('Actual download cannot be associated with the selected test');
    if (downloads.has(download)) return;
    const key = `download-${process.pid}-${++serial}`;
    const original = installDownload(download);
    const metadata = { ...info, pid: process.pid, pageId: page._guid ?? null,
      url: download.url(), suggestedFilename: download.suggestedFilename(),
      eventAt: new Date().toISOString(), hookIdentity: identity,
      originalPathMethodSHA256: hash(Buffer.from(original.toString())) };
    const state = { key, metadata, finished: false, callerPathInvocations: 0 };
    downloads.set(download, state);
    write(key + '.event.json', { kind: 'download-event', key, ...metadata });
    // Read-only proactive path observation also covers downloads the test never requests.
    // This extra observer call is never substituted for an original caller call.
    observePromise(original.apply(download, []), value => captureDownload(download, state, value, 'page-download-event'), 'download-event-path', { key });
  }

  function installPage(page) {
    if (page[marked]) return;
    Object.defineProperty(page, marked, { value: true });
    infoFor(page);
    const prototype = Object.getPrototypeOf(page.mainFrame());
    if (!prototype[marked]) {
      const original = prototype.setInputFiles;
      if (typeof original !== 'function') throw Error('Original Frame.setInputFiles unavailable');
      prototype.setInputFiles = function observedSetInputFiles() {
        try { upload(this, arguments); } catch (error) { observationError('upload', error); }
        return original.apply(this, arguments);
      };
      Object.defineProperty(prototype, marked, { value: true });
      write(`frame-install-${process.pid}-${++serial}.json`, { kind: 'frame-install', pid: process.pid, originalMethodSHA256: hash(Buffer.from(original.toString())), hookIdentity: identity });
    }
    page.on('download', download => { try { downloadEvent(page, download); } catch (error) { observationError('download-event', error); } });
    write(`page-install-${process.pid}-${++serial}.json`, { kind: 'page-install', pid: process.pid,
      pageId: page._guid ?? null, ...(infoFor(page) ?? {}), downloadObserver: true, hookIdentity: identity });
  }

  function installContext(context) {
    if (context[marked]) return;
    Object.defineProperty(context, marked, { value: true });
    context.on('page', page => { try { installPage(page); } catch (error) { observationError('install-page', error); } });
    for (const page of context.pages()) installPage(page);
  }

  function installBrowser(browser) {
    if (browser[marked]) return;
    Object.defineProperty(browser, marked, { value: true });
    const original = browser.newContext;
    browser.newContext = function observedNewContext() {
      return observePromise(original.apply(this, arguments), installContext, 'install-context');
    };
    for (const context of browser.contexts()) installContext(context);
  }

  try {
    const source = fs.readFileSync(__filename);
    const moduleVersions = Object.fromEntries(['@playwright/test', 'playwright', 'playwright-core'].map(name => [name, JSON.parse(fs.readFileSync(path.join(root, 'node_modules', name, 'package.json'), 'utf8')).version]));
    identity = { source: __filename, bytes: source.length, sha256: hash(source), nodeOptions: process.env.NODE_OPTIONS ?? '', moduleVersions,
      coreBundleSHA256: hash(fs.readFileSync(path.join(root, 'node_modules/playwright-core/lib/coreBundle.js'))),
      moduleSourcesSHA256: Object.fromEntries(['@playwright/test/index.js', 'playwright/test.js', 'playwright/lib/index.js', 'playwright/lib/globals.js', '@playwright/test/package.json', 'playwright/package.json', 'playwright-core/package.json'].map(name => [name, hash(fs.readFileSync(path.join(root, 'node_modules', name)))])),
      evidenceDirectory: directory, selectedSpec };
    const playwright = require(path.join(root, 'node_modules/playwright-core'));
    write(`hook-install-${process.pid}.json`, { kind: 'hook-install', pid: process.pid, at: new Date().toISOString(), cwd: process.cwd(), argv: process.argv, hookIdentity: identity });
    for (const engine of ['chromium', 'firefox', 'webkit']) {
      const browserType = playwright[engine], original = browserType.launch;
      browserType.launch = function observedLaunch() {
        return observePromise(original.apply(this, arguments), installBrowser, 'install-browser');
      };
    }
  } catch (error) { observationError('install-preload', error); }
}
