import {spawn, execFileSync} from 'node:child_process';
import {createWriteStream} from 'node:fs';
import {mkdir, writeFile} from 'node:fs/promises';
import {join} from 'node:path';

const [outputDirectory, phase, workspace, expectedSha, command, ...args] = process.argv.slice(2);
if (!outputDirectory || !phase || !workspace || !/^[0-9a-f]{40}$/.test(expectedSha ?? '') || !command) throw Error('output-directory phase workspace exact-SHA command [args] required');
const git = (...argv) => execFileSync('git', argv, {cwd: workspace, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024}).trim();
const commit = git('rev-parse', 'HEAD'), tree = git('rev-parse', 'HEAD^{tree}'), dirty = !!git('status', '--porcelain=v1', '--untracked-files=all');
if (commit !== expectedSha || dirty) throw Error('Command must run in the exact clean candidate');
await mkdir(outputDirectory, {recursive: true});
const stdout = createWriteStream(join(outputDirectory, `${phase}.stdout.log`)), stderr = createWriteStream(join(outputDirectory, `${phase}.stderr.log`)), combined = createWriteStream(join(outputDirectory, `${phase}.log`));
const startedAt = new Date().toISOString(), began = performance.now();
const child = spawn(command, args, {cwd: workspace, stdio: ['ignore', 'pipe', 'pipe']});
child.stdout.on('data', bytes => {stdout.write(bytes); combined.write(bytes);});
child.stderr.on('data', bytes => {stderr.write(bytes); combined.write(bytes);});
const outcome = await new Promise(resolve => {
  child.on('error', error => resolve({exitCode: null, signal: null, error: error.message}));
  child.on('close', (exitCode, signal) => resolve({exitCode, signal}));
});
await Promise.all([stdout, stderr, combined].map(stream => new Promise(resolve => stream.end(resolve))));
const result = {phase, workspace, commit, tree, dirty, command, args, startedAt, endedAt: new Date().toISOString(), durationMs: performance.now() - began, ...outcome};
await writeFile(join(outputDirectory, `${phase}-command.json`), `${JSON.stringify(result, null, 2)}\n`);
console.log(JSON.stringify(result));
process.exitCode = outcome.exitCode === 0 ? 0 : 1;
