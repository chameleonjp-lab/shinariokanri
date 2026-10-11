import { build } from '/workspace/shinariokanri-rb06-large-history-export/node_modules/vite/dist/node/index.js';
import { readFile, writeFile, readdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import assert from 'node:assert/strict';
const root = '/workspace/shinariokanri-rb06-large-history-export';
const output = '/tmp/shinariokanri-rb06-large-history-restore-113-2';
const bindingPath = '/tmp/shinariokanri-rb06-large-history-export-browser-113-4/source-and-build-binding.json';
const bindingBytes = await readFile(bindingPath), binding = JSON.parse(bindingBytes);
const sha = value => createHash('sha256').update(value).digest('hex');
const git = (...args) => execFileSync('git', args, { cwd: root, encoding: 'utf8' }).trim();
const report = { startedAt: new Date().toISOString(), commit: binding.commit, tree: binding.tree, sourceBindingSHA256: sha(bindingBytes), procedureSHA256: sha(await readFile(new URL(import.meta.url))), runtimeExecuted: false, scope: 'Compile preparation only. No browser launch, export, import, restore, acceptance or performance pass is implied.', errors: [] };
try {
  assert.equal(git('rev-parse', 'HEAD'), binding.commit);
  assert.equal(git('rev-parse', 'HEAD^{tree}'), binding.tree);
  assert.equal(git('status', '--porcelain'), '');
  for (const row of [...binding.source_files, ...binding.artifact_files]) assert.equal(sha(await readFile(resolve(root, row.path))), row.sha256, row.path);
  const entry = output + '/native-roundtrip-entry.mjs', destination = output + '/prepared-helper-2';
  report.entrySHA256 = sha(await readFile(entry));
  await build({ configFile: false, root, base: '/__roundtrip/', logLevel: 'error', build: { target: 'es2022', outDir: destination, emptyOutDir: false, lib: { entry, formats: ['es'], fileName: () => 'entry.js' } } });
  report.files = [];
  const walk = async directory => {
    for (const item of await readdir(directory, { withFileTypes: true })) {
      const path = resolve(directory, item.name);
      if (item.isDirectory()) await walk(path);
      else { const bytes = await readFile(path); report.files.push({ path: path.slice(output.length + 1), bytes: bytes.length, sha256: sha(bytes) }); }
    }
  };
  await walk(destination);
  for (const row of [...binding.source_files, ...binding.artifact_files]) assert.equal(sha(await readFile(resolve(root, row.path))), row.sha256, row.path);
  assert.equal(git('rev-parse', 'HEAD'), binding.commit);
  assert.equal(git('status', '--porcelain'), '');
  report.sourceAndBuildInputsUnchanged = true;
  report.result = 'compiled_only';
} catch (error) {
  report.result = 'preparation_failed'; report.errors.push({ message: error.message, code: error.code ?? null }); process.exitCode = 1;
} finally {
  report.finishedAt = new Date().toISOString();
  await writeFile(output + '/COMPILE_PREPARATION_2.json', JSON.stringify(report, null, 2) + '\n');
  console.log(JSON.stringify({ result: report.result, files: report.files?.length, runtimeExecuted: false, errors: report.errors }));
}
