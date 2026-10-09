import { createHash } from 'node:crypto';
import { mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import { dirname, resolve } from 'node:path';
import { build } from 'vite';
import { chromium } from 'playwright';

const args = Object.fromEntries(process.argv.slice(2).reduce((pairs, arg, index, list) => arg.startsWith('--') ? [...pairs, [arg.slice(2), list[index + 1]]] : pairs, []));
const samples = Number(args.samples ?? 30);
if (!Number.isInteger(samples) || samples < 1 || samples > 100 || !args.output) throw new Error('Usage: node scripts/measure-catalog.mjs --samples 30 --output path.json [--catalog-source archived/catalog.ts]');
const root = process.cwd(), catalogSource = resolve(args['catalog-source'] ?? 'src/domain/catalog.ts');
const temporary = await mkdtemp('/tmp/catalog-measure-'), entry = resolve(temporary, 'entry.js'), output = resolve(temporary, 'bundle');
await writeFile(entry, `import * as catalog from ${JSON.stringify(catalogSource)};import {createCatalogPerformanceFixture} from ${JSON.stringify(resolve('src/testing/catalogPerformanceFixture.ts'))};globalThis.measureCatalog=async(samples)=>{const fixture=await createCatalogPerformanceFixture(),rows=[];for(const {name,query} of fixture.queries){const milliseconds=[];let matchedCount=0;for(let index=0;index<samples;index++){const start=performance.now();const results=catalog.filterCatalogEntities?catalog.filterCatalogEntities(fixture.project,query):fixture.project.entities.filter(entity=>!entity.deletedAt&&catalog.matchesQuery(fixture.project,entity,query));milliseconds.push(performance.now()-start);matchedCount=results.length;}const sorted=[...milliseconds].sort((a,b)=>a-b);rows.push({name,matchedCount,milliseconds,p50:sorted[Math.ceil(samples*.5)-1],p95:sorted[Math.ceil(samples*.95)-1],max:sorted.at(-1)});}const {project,queries,...metadata}=fixture;return {fixture:metadata,queries:rows};};`);
await build({ configFile: false, root, logLevel: 'error', plugins: [{ name: 'archived-catalog-imports', resolveId(source, importer) { if (importer === catalogSource && source.startsWith('./')) return resolve(root, 'src/domain', `${source.slice(2)}.ts`); } }], build: { target: 'es2022', outDir: output, emptyOutDir: true, lib: { entry, formats: ['es'], fileName: () => 'entry.js' } } });
const server = createServer(async (request, response) => { if (request.url === '/entry.js') { response.setHeader('Content-Type', 'text/javascript'); response.end(await readFile(resolve(output, 'entry.js'))); } else response.end('<script type="module" src="/entry.js"></script>'); });
await new Promise(done => server.listen(0, '127.0.0.1', done));
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || '/usr/bin/chromium', args: ['--no-sandbox'] });
try {
  const page = await browser.newPage(); await page.goto(`http://127.0.0.1:${server.address().port}/`); await page.waitForFunction(() => typeof globalThis.measureCatalog === 'function');
  const measured = await page.evaluate(samples => globalThis.measureCatalog(samples), samples);
  const result = { measuredAt: new Date().toISOString(), samples, browser: await page.evaluate(() => navigator.userAgent), build: 'Vite production es2022', scope: 'query evaluation only; fixture construction, UI rendering, physical devices and attachments excluded', catalogSourceSha256: createHash('sha256').update(await readFile(catalogSource)).digest('hex'), ...measured };
  await mkdir(dirname(resolve(args.output)), { recursive: true }); await writeFile(args.output, JSON.stringify(result, null, 2) + '\n');
  process.stdout.write(JSON.stringify(result.queries.map(query => ({ name: query.name, matchedCount: query.matchedCount, p50: query.p50, p95: query.p95 }))) + '\n');
} finally { await browser.close(); server.closeAllConnections(); await new Promise(done => server.close(done)); }
