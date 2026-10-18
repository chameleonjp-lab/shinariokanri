// Same full Large input and original fault/negative assertions, with portable paths.
import { readFile, writeFile, mkdir, mkdtemp, rm } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { createHash } from 'node:crypto';
const arg = name => { const i = process.argv.indexOf('--' + name); return i < 0 ? undefined : process.argv[i + 1]; };
if (!arg('binding') || !arg('source') || !arg('output')) throw Error('Use --binding FILE --source SOAK_DIRECTORY --output NEW_FILE');
const binding = JSON.parse(await readFile(resolve(arg('binding')), 'utf8'));
const original = await readFile(new URL('./originals/full-large-exceptions.mjs', import.meta.url), 'utf8');
const expected = '6771f8abab23cef943ffcd100d18e365998f28f9ff8564ea03f4a2f45c98a66b';
if (createHash('sha256').update(original).digest('hex') !== expected) throw Error('Historical full-input exception procedure changed');
const replaceOnce = (text, from, to) => { if (text.split(from).length !== 2) throw Error('Ambiguous portability substitution'); return text.replace(from, to); };
let portable = replaceOnce(original, "const repo = '/workspace/pr49-graph-measure-source';", `const repo = ${JSON.stringify(process.cwd())};`);
portable = replaceOnce(portable, "const root = '/workspace/pr49-checks/soak7200-1fcadcca-attempt1';", `const root = ${JSON.stringify(resolve(arg('source')))};`);
portable = replaceOnce(portable, "git('rev-parse', 'HEAD') === '1fcadcca703863873a57d297e83b1b184e63e778'", `git('rev-parse', 'HEAD') === ${JSON.stringify(binding.commit)}`);
await mkdir(resolve('node_modules/.cache'), { recursive: true });
const temporary = await mkdtemp(resolve('node_modules/.cache/phase3-exceptions-'));
const entry = join(temporary, 'original-portable.mjs'), output = resolve(arg('output'));
try { await writeFile(entry, portable, { flag: 'wx' }); process.argv = [process.argv[0], entry, output]; await import(pathToFileURL(entry).href); }
finally { await rm(temporary, { recursive: true, force: true }); }
