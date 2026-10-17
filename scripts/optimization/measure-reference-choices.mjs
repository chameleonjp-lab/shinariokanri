// Explicit local-only additional diagnostics. No application storage or network requests.
import { createServer } from 'vite';
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
if (!process.env.P2_REFERENCE_COMMIT) throw new Error('Pass P2_REFERENCE_COMMIT from git rev-parse HEAD before running');
const output = resolve(process.argv[2] || 'docs/optimization/phase2/p2-02/comparison.json');
const server = await createServer({ configFile: false, server: { middlewareMode: true, hmr: false, ws: false }, appType: 'custom', logLevel: 'error' });
try {
  const { compareReferenceChoices } = await server.ssrLoadModule('/scripts/optimization/referenceChoicesMeasurement.ts');
  const result = await compareReferenceChoices();
  await mkdir(dirname(output), { recursive: true });
  await writeFile(output, JSON.stringify(result, null, 2) + '\n');
  console.log(JSON.stringify({ output, rows: result.observations.length, equality: result.observations.every(row => row.equal), errors: 0 }));
} finally { await server.close(); }
