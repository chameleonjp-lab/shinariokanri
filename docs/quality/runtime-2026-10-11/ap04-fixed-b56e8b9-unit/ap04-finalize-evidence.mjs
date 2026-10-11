import {readFile, writeFile, copyFile, readdir} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {join, relative} from 'node:path';

const directory = '/tmp/ap04-fixed-b56e8b9', read = async name => JSON.parse(await readFile(join(directory, name), 'utf8'));
const before = await read('before-build-binding.json'), built = await read('after-build-binding.json'), wholeBinding = await read('after-unit-binding.json'), finalBinding = await read('after-pinned-exports-binding.json');
const checks = {sourceUnchanged: [built, wholeBinding, finalBinding].every(item => item.sourceDigest === before.sourceDigest),
  distUnchangedAfterBuild: [wholeBinding, finalBinding].every(item => item.distDigest === built.distDigest),
  generatedUnchangedAfterBuild: [wholeBinding, finalBinding].every(item => item.generatedDigest === built.generatedDigest),
  exactCommitAndClean: [before, built, wholeBinding, finalBinding].every(item => item.commit === 'b56e8b953ee5398a8c4b97031b4a426bb6a9f512' && item.cleanTrackedCheckout)};
if (Object.values(checks).some(value => !value)) throw Error('Final binding mismatch');
await copyFile(join(directory, 'after-pinned-exports-binding.json'), join(directory, 'exports-pinned-attempt1/after-binding.json'));
const build = await read('build-command.json'), metadata = await read('build-info.json'), whole = await read('unit-results.json'), wholeCommand = await read('unit-command.json');
const pinned = await read('exports-pinned-attempt1/unit-results.json'), pinnedCommand = await read('exports-pinned-attempt1/unit-exports-pinned-command.json');
const wholeExport = whole.testResults.find(file => file.name.endsWith('/tests/exports.test.ts')), pinnedExport = pinned.testResults.find(file => file.name.endsWith('/tests/exports.test.ts'));
if (!wholeExport || !pinnedExport || JSON.stringify(wholeExport.assertionResults.map(test => test.fullName)) !== JSON.stringify(pinnedExport.assertionResults.map(test => test.fullName))) throw Error('Targeted attempt did not cover the identical full exports file');
const otherFiles = whole.testResults.filter(file => file !== wholeExport), unionPassed = otherFiles.every(file => file.status === 'passed') && pinnedExport.status === 'passed' && pinned.numFailedTests === 0;
const count = report => ({files: report.testResults.length, total: report.numTotalTests, passed: report.numPassedTests, failed: report.numFailedTests, skipped: report.numPendingTests, success: report.success});
const result = {recordedAt: new Date().toISOString(), commit: metadata.commit, tree: metadata.tree, dirty: metadata.dirty, base: metadata.base, version: metadata.version,
  npmCiNeeded: before.npmCiNeeded, build: {exitCode: build.exitCode, durationMs: build.durationMs, command: build.command, args: build.args},
  wholeAttempt: {...count(whole), exitCode: wholeCommand.exitCode, durationMs: wholeCommand.durationMs, browser: await read('browser-system.json'),
    failedTests: wholeExport.assertionResults.filter(test => test.status === 'failed').map(test => ({fullName: test.fullName, status: test.status, failureMessages: test.failureMessages}))},
  targetedPinnedAttempt: {...count(pinned), exitCode: pinnedCommand.exitCode, durationMs: pinnedCommand.durationMs, browser: await read('browser-pinned.json'), identicalFullFileCaseNames: true},
  combinedCoverage: {passed: unionPassed, files: whole.testResults.length, cases: whole.numTotalTests, replacedFile: 'tests/exports.test.ts',
    method: 'The original whole run is retained as failed. Its other files passed, and the identical complete exports file passed in a separate attempt with the project-pinned browser; no source/test/policy changes.'},
  limits: {defaultTestTimeoutMs: 5000, maxWorkers: 1, fileParallelism: false, authoredPerTestTimeoutsUnchanged: true, singleWholeAttemptPassed: whole.success},
  bindings: {...checks, sourceDigest: finalBinding.sourceDigest, distDigest: finalBinding.distDigest, generatedDigest: finalBinding.generatedDigest},
  retainedHarnessFailure: 'before-build-binding-attempt1-failure.json'};
await writeFile(join(directory, 'verification-summary.json'), `${JSON.stringify(result, null, 2)}\n`);
const markdown = `Candidate ${metadata.commit}\n\nProduction build passed; tree ${metadata.tree}, dirty=false, base=${metadata.base}, version=${metadata.version}.\n\nOriginal serial whole run: ${whole.numPassedTests}/${whole.numTotalTests} passed across ${whole.testResults.length} files, with two retained ERR_BLOCKED_BY_ADMINISTRATOR failures from system Chromium. Duration ${(wholeCommand.durationMs / 1000).toFixed(2)} s.\n\nSeparate project-pinned browser attempt: the complete tests/exports.test.ts passed ${pinned.numPassedTests}/${pinned.numTotalTests}, with identical case names and unchanged source, tests and policy. Duration ${(pinnedCommand.durationMs / 1000).toFixed(2)} s.\n\nAll ${whole.numTotalTests} cases across ${whole.testResults.length} files passed across the two retained attempts. The first whole run remains a failed run. Original 5000 ms default and authored per-test limits were preserved, with one worker and fileParallelism=false.\n\nSource remained identical before/after build and both unit attempts; dist and generated runtime bytes remained identical after build and both attempts. Raw stdout, stderr, JSON reports, command metadata, browser bindings and file hashes are retained here.\n`;
await writeFile(join(directory, 'verification-summary.md'), markdown);
for (const file of ['ap04-candidate-binding.mjs', 'ap04-run-command.mjs', 'ap04-browser-binding.mjs', 'ap04-finalize-evidence.mjs']) await copyFile(`/tmp/${file}`, join(directory, file));
const files = [], pending = [directory];
while (pending.length) for (const entry of await readdir(pending.pop(), {withFileTypes: true})) {
  const path = join(entry.parentPath, entry.name);
  if (entry.isDirectory()) pending.push(path); else if (entry.isFile() && entry.name !== 'artifact-hashes.json') files.push(path);
}
const hashes = [];
for (const path of files.sort()) {const bytes = await readFile(path); hashes.push({path: relative(directory, path), byteSize: bytes.byteLength, sha256: createHash('sha256').update(bytes).digest('hex')});}
await writeFile(join(directory, 'artifact-hashes.json'), `${JSON.stringify(hashes, null, 2)}\n`);
console.log(JSON.stringify({buildPassed: build.exitCode === 0, whole: count(whole), pinned: count(pinned), combinedCoveragePassed: unionPassed, bindings: checks, artifactFiles: hashes.length}));
