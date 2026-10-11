'use strict';
// External evidence observation only. Never edits or reconstructs a fixture.
// This preload is inert until the existing runner launches its own browsers.
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const root = '/workspace/runtime-verification';
const run = '/tmp/shinariokanri-ap02-b56e8b9-run2';
const directory = path.join(run, 'uploads');
const allowedSpecs = new Set(['link-candidate-ignore.spec.ts', 'consultation-context.spec.ts', 'startup-migration-retry.spec.ts']);
const hash = bytes => crypto.createHash('sha256').update(bytes).digest('hex');
const marked = Symbol.for('ap02.b56e8b9.uploadEvidence');
let serial = 0;
let errorSerial = 0;
let testApi;
let identity;

function observationError(stage, error) {
  const record = { stage, pid: process.pid, at: new Date().toISOString(), name: error?.name, message: String(error?.message ?? error), stack: error?.stack };
  // Neither a failed observation nor failed error retention changes the API call.
  try {
    fs.mkdirSync(directory, { recursive: true });
    fs.writeFileSync(path.join(directory, `observation-error-${process.pid}-${++errorSerial}.json`), JSON.stringify(record, null, 2) + '\n', { flag: 'wx' });
  } catch (retentionError) {
    record.errorRetentionFailure = String(retentionError?.message ?? retentionError);
  }
  try { process.stderr.write('[AP02_UPLOAD_OBSERVATION_ERROR] ' + JSON.stringify(record) + '\n'); } catch { /* Continue the original API regardless. */ }
}

function observePromise(promise, observer, stage) {
  // Register before returning the ORIGINAL promise. The observer runs before
  // the caller's await resumes and cannot replace a value or rejection.
  try {
    promise.then(value => { try { observer(value); } catch (error) { observationError(stage, error); } }, () => {}).catch(error => observationError(stage, error));
  } catch (error) { observationError(stage, error); }
  return promise;
}

function capture(frame, args) {
  testApi ??= require(path.join(root, 'node_modules/@playwright/test')).test;
  let info;
  try { info = testApi.info(); } catch { return; }
  if (!allowedSpecs.has(path.basename(info.file))) return;
  const files = Array.isArray(args[1]) ? args[1] : [args[1]];
  for (let index = 0; index < files.length; index++) {
    const payload = files[index];
    if (!payload || typeof payload !== 'object' || typeof payload.name !== 'string' || !payload.name.endsWith('.scenario') || !Buffer.isBuffer(payload.buffer)) continue;
    const copied = Buffer.from(payload.buffer);
    const sha256 = hash(copied);
    const engine = String(info.project.name);
    const engineSlug = engine.replace(/[^a-zA-Z0-9_-]/g, '_');
    const titleHash = hash(Buffer.from(info.title)).slice(0, 12);
    const key = `upload-${process.pid}-${++serial}-${engineSlug}-${titleHash}-${index}`;
    const filename = key + '.scenario';
    fs.mkdirSync(directory, { recursive: true });
    fs.writeFileSync(path.join(directory, filename), copied, { flag: 'wx' });
    const forwardSourceSHA256 = hash(payload.buffer);
    const browser = frame.page().context().browser();
    const metadata = {
      key, filename, pid: process.pid, counter: serial, index, engine, title: info.title, file: info.file,
      testId: info.testId ?? null, retry: info.retry, workerIndex: info.workerIndex,
      sourceName: payload.name, mimeType: payload.mimeType, bytes: copied.length, sha256, forwardSourceSHA256,
      selector: args[0], capturedAt: new Date().toISOString(), browserVersion: browser?.version(),
      callStack: new Error('Actual scenario Buffer observed before original Frame.setInputFiles').stack,
      hookIdentity: identity, originalArgumentsReused: true, originalReceiverReused: true,
      observationOnly: true, originalWholeAcceptancePromotion: false,
    };
    fs.writeFileSync(path.join(directory, key + '.json'), JSON.stringify(metadata, null, 2) + '\n', { flag: 'wx' });
    if (forwardSourceSHA256 !== sha256) throw Error('Payload changed during synchronous observation');
  }
}

function installFrame(page) {
  const prototype = Object.getPrototypeOf(page.mainFrame());
  if (prototype[marked]) return;
  const original = prototype.setInputFiles;
  if (typeof original !== 'function') throw Error('Original Frame.setInputFiles unavailable');
  const originalMethodSHA256 = hash(Buffer.from(original.toString()));
  function observedSetInputFiles() {
    try { capture(this, arguments); } catch (error) { observationError('capture', error); }
    // No async wrapper, argument rewrite, receiver rewrite, retry, or catch of
    // the original API. Return its exact result, including Promise identity.
    return original.apply(this, arguments);
  }
  Object.defineProperty(prototype, marked, { value: true });
  prototype.setInputFiles = observedSetInputFiles;
  fs.writeFileSync(path.join(directory, `frame-install-${process.pid}.json`), JSON.stringify({ pid: process.pid, originalMethodSHA256, hookIdentity: identity }, null, 2) + '\n', { flag: 'wx' });
}

function installContext(context) {
  if (context[marked]) return;
  Object.defineProperty(context, marked, { value: true });
  context.on('page', page => { try { installFrame(page); } catch (error) { observationError('install-frame', error); } });
  for (const page of context.pages()) installFrame(page);
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
  const moduleVersions = Object.fromEntries(['@playwright/test', 'playwright', 'playwright-core'].map(name => [name, JSON.parse(fs.readFileSync(path.join(root, 'node_modules', name, 'package.json'), 'utf8')).version]));
  const source = fs.readFileSync(__filename);
  identity = { source: __filename, bytes: source.length, sha256: hash(source), nodeOptions: process.env.NODE_OPTIONS ?? '', moduleVersions,
    coreBundleSHA256: hash(fs.readFileSync(path.join(root, 'node_modules/playwright-core/lib/coreBundle.js'))) };
  const playwright = require(path.join(root, 'node_modules/playwright-core'));
  fs.mkdirSync(directory, { recursive: true });
  fs.writeFileSync(path.join(directory, `hook-install-${process.pid}.json`), JSON.stringify({ pid: process.pid, at: new Date().toISOString(), cwd: process.cwd(), argv: process.argv, hookIdentity: identity }, null, 2) + '\n', { flag: 'wx' });
  for (const engine of ['chromium', 'firefox', 'webkit']) {
    const browserType = playwright[engine], original = browserType.launch;
    browserType.launch = function observedLaunch() {
      return observePromise(original.apply(this, arguments), installBrowser, 'install-browser');
    };
  }
} catch (error) { observationError('install-preload', error); }
