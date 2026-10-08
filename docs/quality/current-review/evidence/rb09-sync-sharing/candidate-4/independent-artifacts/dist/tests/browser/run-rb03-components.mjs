import { spawn } from 'node:child_process';
import { createWriteStream } from 'node:fs';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const projectRoot = fileURLToPath(new URL('../../', import.meta.url));
const port = Number(process.env.RB03_PORT ?? '5213');
if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('RB03_PORT must be between 1 and 65535.');
const engines = [...new Set((process.env.RB03_ENGINES ?? 'chromium').split(',').map(value => value.trim()).filter(Boolean))];
if (!engines.length || engines.some(value => !['chromium', 'firefox', 'webkit'].includes(value))) throw new Error('RB03_ENGINES must list chromium, firefox or webkit.');
const output = path.resolve(projectRoot, process.env.RB03_OUTPUT_DIR ?? 'test-results/rb03-components');
await mkdir(output, { recursive: true });
const configPath = path.join(output, 'vite.components.config.mjs');
await writeFile(configPath, `import config from ${JSON.stringify(path.join(projectRoot, 'vite.config.ts'))};\nexport default { ...config, cacheDir: ${JSON.stringify(path.join(output, '.vite'))} };\n`);
const baseURL = `http://127.0.0.1:${port}/shinariokanri/`;
const serverLog = createWriteStream(path.join(output, 'vite.log'));
const server = spawn(process.execPath, [path.join(projectRoot, 'node_modules/vite/bin/vite.js'), '--config', configPath, '--host', '127.0.0.1', '--port', String(port), '--strictPort'], { cwd: projectRoot, env: process.env, stdio: ['ignore', 'pipe', 'pipe'], detached: process.platform !== 'win32' });
server.stdout.pipe(serverLog); server.stderr.pipe(serverLog); let serverError;
server.on('error', error => { serverError = error; });
const startedAt = new Date().toISOString(), results = [];

function stopServer() {
  if (!server.pid) return;
  try { if (process.platform !== 'win32') process.kill(-server.pid, 'SIGTERM'); else server.kill('SIGTERM'); } catch { /* It may have already exited. */ }
}
const onSignal = () => { stopServer(); process.exitCode = 130; };
process.once('SIGINT', onSignal); process.once('SIGTERM', onSignal);
async function ready() {
  const deadline = Date.now() + 40000;
  while (Date.now() < deadline) {
    if (serverError || server.exitCode !== null) throw serverError ?? new Error(`Vite exited (${server.exitCode}); inspect ${path.join(output, 'vite.log')}.`);
    try { if ((await fetch(baseURL, { signal: AbortSignal.timeout(1200) })).ok) return; } catch { /* Startup is bounded by the deadline. */ }
    await new Promise(resolve => setTimeout(resolve, 150));
  }
  throw new Error(`Vite did not start within 40 seconds; inspect ${path.join(output, 'vite.log')}.`);
}
async function run(engine, script) {
  const logPath = path.join(output, `${script.replace('.mjs', '')}-${engine}.log`), log = createWriteStream(logPath);
  const env = { ...process.env, RB03_ENGINE: engine, RB03_DEV_URL: baseURL, RB03_OUTPUT_DIR: output };
  if (!env.RB03_CHROMIUM_PATH && env.CHROMIUM_PATH) env.RB03_CHROMIUM_PATH = env.CHROMIUM_PATH;
  const child = spawn(process.execPath, [path.join(projectRoot, 'tests/browser', script)], { cwd: projectRoot, env, stdio: ['ignore', 'pipe', 'pipe'] });
  child.stdout.on('data', bytes => { log.write(bytes); process.stdout.write(bytes); }); child.stderr.on('data', bytes => { log.write(bytes); process.stderr.write(bytes); });
  let timer;
  try {
    const code = await new Promise((resolve, reject) => { child.once('error', reject); child.once('exit', (code, signal) => { if (signal) reject(new Error(`${script}/${engine} terminated by ${signal}`)); else resolve(code); }); timer = setTimeout(() => { child.kill('SIGTERM'); reject(new Error(`${script}/${engine} exceeded 120 seconds`)); }, 120000); });
    results.push({ engine, script, exitCode: code, log: path.basename(logPath) }); if (code !== 0) throw new Error(`${script}/${engine} failed (${code}); inspect ${logPath}.`);
  } finally { clearTimeout(timer); log.end(); }
}
try {
  await ready();
  for (const engine of engines) for (const script of ['rb03-component-regressions.mjs', 'rb03-timeline-smoke.mjs', 'rb03-world-smoke.mjs']) await run(engine, script);
} finally {
  stopServer(); if (server.exitCode === null && server.pid) await new Promise(resolve => { let timer; server.once('close', () => { clearTimeout(timer); resolve(); }); timer = setTimeout(() => { try { process.kill(process.platform === 'win32' ? server.pid : -server.pid, 'SIGKILL'); } catch { /* Already closed. */ } resolve(); }, 2000); }); serverLog.end(); process.removeListener('SIGINT', onSignal); process.removeListener('SIGTERM', onSignal);
  await writeFile(path.join(output, 'runner.json'), JSON.stringify({ startedAt, finishedAt: new Date().toISOString(), engines, port, results }, null, 2));
}
