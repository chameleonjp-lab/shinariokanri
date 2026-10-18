// Independent registry inventory and synthetic counterexamples; no product writes or private inputs.
import { registerHooks } from 'node:module';
import { readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
registerHooks({ resolve(specifier, context, nextResolve) {
  try { return nextResolve(specifier, context); }
  catch (error) { if (specifier.startsWith('.') && !/\.[a-z]+$/.test(specifier)) return nextResolve(`${specifier}.ts`, context); throw error; }
} });
const { fieldSemanticInventory, indexedFormalReferencePaths } = await import('./semanticStudy.ts');
const { createEntity, createProject } = await import('../../src/domain/model.ts');
if (process.argv.length !== 3) throw new Error('Pass a new output JSON file');
const git = (...args) => execFileSync('git', args, { encoding: 'utf8' }).trim();
const project = createProject(), goal = createEntity(project.projectId, 'goal', 'synthetic goal');
const character = createEntity(project.projectId, 'character', 'synthetic character', { goals: [goal.id] });
const group = createEntity(project.projectId, 'group', 'synthetic category', { members: [character.id] });
const fields = fieldSemanticInventory(), schema = await readFile('src/domain/schema.json');
const result = { version: 1, recordedAt: new Date().toISOString(), sourceCommit: git('rev-parse', 'HEAD'), sourceTree: git('rev-parse', 'HEAD^{tree}'), productTree: git('rev-parse', 'HEAD:src'), dirty: !!git('status', '--porcelain'),
  scope: 'Static authoritative schema/UI/projection inventory; original acceptance NOT_PERFORMED',
  schemaSha256: createHash('sha256').update(schema).digest('hex'), fields,
  findings: [character, group].map(entity => {
    const paths=indexedFormalReferencePaths(entity);
    return {kind:entity.kind,paths,status:paths.length?'CURRENT_PRODUCT_DISCREPANCY_UNFIXED':'RESOLVED_REFERENCE_LEAVES_EXCLUDED',
      cause:paths.length?'Formal reference leaves still enter the text corpus':'Authoritative kind/path references are excluded; authored UUID-looking text remains searchable',
      requiredDisposition:paths.length?'Resolve the product discrepancy and retain independent expectations':'Keep the independent regression checks and the original historical source/evidence'};
  }),
};
await writeFile(process.argv[2], JSON.stringify(result, null, 2) + '\n', { flag: 'wx' });
console.log(JSON.stringify({ fields: fields.length, kinds: new Set(fields.map(row => row.kind)).size, findings: result.findings.length }));
