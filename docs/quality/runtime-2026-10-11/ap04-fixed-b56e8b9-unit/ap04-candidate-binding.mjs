import {createHash} from 'node:crypto';
import {readFile, readdir, stat, mkdir, writeFile} from 'node:fs/promises';
import {execFileSync} from 'node:child_process';
import {join, relative} from 'node:path';

const [workspace, phase, outputDirectory, expectedSha] = process.argv.slice(2);
if (!workspace || !phase || !outputDirectory || !/^[0-9a-f]{40}$/.test(expectedSha ?? '')) throw Error('workspace phase output-directory exact-SHA are required');
const git = (...args) => execFileSync('git', args, {cwd: workspace, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024});
const sha256 = bytes => createHash('sha256').update(bytes).digest('hex');
const digest = records => sha256(JSON.stringify(records));
const head = git('rev-parse', 'HEAD').trim(), status = git('status', '--porcelain=v1', '--untracked-files=all');
if (head !== expectedSha) throw Error(`HEAD is ${head}, expected ${expectedSha}`);
if (status) throw Error(`Candidate checkout is dirty: ${status}`);
const tracked = git('ls-files', '-z').split('\0').filter(Boolean).sort();
const sourceFiles = [];
for (const path of tracked) sourceFiles.push({path, sha256: sha256(await readFile(join(workspace, path)))});
async function filesBelow(path) {
  try {if (!(await stat(path)).isDirectory()) return [];} catch (error) {if (error.code === 'ENOENT') return []; throw error;}
  const files = [], directories = [path];
  while (directories.length) {
    const directory = directories.pop();
    for (const entry of await readdir(directory, {withFileTypes: true})) {
      const absolute = join(directory, entry.name);
      if (entry.isDirectory()) directories.push(absolute);
      else if (entry.isFile()) files.push(absolute);
    }
  }
  const manifest = [];
  for (const absolute of files.sort()) manifest.push({path: relative(workspace, absolute), sha256: sha256(await readFile(absolute))});
  return manifest;
}
const packageJson = JSON.parse(await readFile(join(workspace, 'package.json'), 'utf8'));
const lockBytes = await readFile(join(workspace, 'package-lock.json')), lock = JSON.parse(lockBytes);
const installed = [];
for (const name of Object.keys({...packageJson.dependencies, ...packageJson.devDependencies}).sort()) {
  const expected = lock.packages[`node_modules/${name}`]?.version;
  let actual = null;
  try {actual = JSON.parse(await readFile(join(workspace, 'node_modules', name, 'package.json'), 'utf8')).version;} catch (error) {if (error.code !== 'ENOENT') throw error;}
  installed.push({name, expected, actual, matches: expected === actual});
}
const distFiles = await filesBelow(join(workspace, 'dist'));
const generatedFiles = [];
for (const path of ['src/portable/generated/runtime.js', 'examples/browser-game/generated/game.js', 'examples/browser-game/game.js', 'public/examples/browser-game/index.html', 'public/examples/browser-game/game.js']) {
  try {generatedFiles.push({path, sha256: sha256(await readFile(join(workspace, path)))});} catch (error) {if (error.code !== 'ENOENT') throw error;}
}
const result = {phase, measuredAt: new Date().toISOString(), workspace, commit: head, cleanTrackedCheckout: true,
  node: process.version, lockSha256: sha256(lockBytes), installed, npmCiNeeded: installed.some(item => !item.matches),
  sourceDigest: digest(sourceFiles), sourceFiles, distDigest: digest(distFiles), distFiles, generatedDigest: digest(generatedFiles), generatedFiles};
await mkdir(outputDirectory, {recursive: true});
await writeFile(join(outputDirectory, `${phase}-binding.json`), `${JSON.stringify(result, null, 2)}\n`);
console.log(JSON.stringify({phase, commit: head, sourceDigest: result.sourceDigest, distDigest: result.distDigest, distFiles: distFiles.length, generatedDigest: result.generatedDigest, npmCiNeeded: result.npmCiNeeded}));
