// Execute the byte-verified original 180-save procedure with portable paths.
// No fixture, loop, assertion, watchdog, retry, skip or timed interval is edited.
import { readFile, writeFile, mkdir, mkdtemp, rm } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { createHash } from 'node:crypto';
const arg = name => { const i = process.argv.indexOf('--' + name); return i < 0 ? undefined : process.argv[i + 1]; };
const bindingPath = resolve(arg('binding') ?? ''), proof = resolve(arg('proof') ?? ''), attempt = arg('attempt');
if (!arg('binding') || !arg('proof') || !/^[a-z0-9-]+$/.test(attempt ?? '')) throw Error('Use --binding FILE --proof DIR --attempt NEW_NAME');
const original = await readFile(new URL('./originals/six-save-forms.mjs', import.meta.url), 'utf8');
if (createHash('sha256').update(original).digest('hex') !== 'c56fd5920f701148a34cdb6141b26a377ec504db16843918878fa762b4e497dd') throw Error('Historical original save procedure changed');
const replaceOnce = (text, from, to) => { if (text.split(from).length !== 2) throw Error('Ambiguous portability substitution'); return text.replace(from, to); };
let portable = replaceOnce(original, "const source='/workspace/pr49-graph-measure-source',proof='/workspace/pr49-benchmark';", `const source=${JSON.stringify(process.cwd())},proof=${JSON.stringify(proof)};`);
portable = replaceOnce(portable, "const bindingPath='/workspace/pr49-benchmark/candidate-1fcadcca-binding.json';", `const bindingPath=${JSON.stringify(bindingPath)};`);
portable = replaceOnce(portable, "const artifactRoot='/workspace/pr49-checks/candidate-1fcadcca/dist',base=binding.build_info.base;", "const artifactRoot=resolve(source,'dist'),base=binding.build_info.base;");
portable = replaceOnce(portable, "candidate:'PR49-1fcadcca'", "candidate:'phase3-final-candidate'");
portable = replaceOnce(portable, "server.listen(5351,'127.0.0.1',ok));const origin='http://127.0.0.1:5351',url=origin+base;", "server.listen(0,'127.0.0.1',ok));const origin='http://127.0.0.1:'+server.address().port,url=origin+base;");
await mkdir(resolve('node_modules/.cache'), { recursive: true });
const temporary = await mkdtemp(resolve('node_modules/.cache/phase3-saves-'));
const entry = join(temporary, 'original-portable.mjs');
try { await writeFile(entry, portable, { flag: 'wx' }); await import(pathToFileURL(entry).href); }
finally { await rm(temporary, { recursive: true, force: true }); }
