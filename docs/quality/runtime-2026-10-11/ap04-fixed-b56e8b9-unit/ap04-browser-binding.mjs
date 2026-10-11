import {execFileSync} from 'node:child_process';
import {readFile, realpath, writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';

const [mode, outputFile, sourceEnvScript] = process.argv.slice(2);
if (!['system', 'pinned'].includes(mode) || !outputFile) throw Error('system|pinned output-file [env-script] required');
const configuredPath = process.env.CHROMIUM_PATH ?? null, usedPath = configuredPath || '/usr/bin/chromium';
const version = execFileSync(usedPath, ['--version'], {encoding: 'utf8', maxBuffer: 1024 * 1024}).trim();
const result = {mode, recordedAt: new Date().toISOString(), configuredPath, usedPath, realPath: await realpath(usedPath), version,
  sourceEnvScript: sourceEnvScript ?? null, sourceEnvScriptSha256: sourceEnvScript ? createHash('sha256').update(await readFile(sourceEnvScript)).digest('hex') : null,
  environment: Object.fromEntries(['PLAYWRIGHT_BROWSERS_PATH', 'TMPDIR', 'XDG_CONFIG_HOME', 'XDG_CACHE_HOME', 'LD_LIBRARY_PATH'].map(name => [name, process.env[name] ?? null]))};
await writeFile(outputFile, `${JSON.stringify(result, null, 2)}\n`); console.log(JSON.stringify(result));
