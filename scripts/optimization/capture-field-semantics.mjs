// Reproduce the independent pre-descriptor contract from the literal baseline.
// Run this script from the new branch, pointing --root at a clean a13 checkout.
import {registerHooks} from 'node:module';
import {readFile,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {pathToFileURL} from 'node:url';
import {resolve,join} from 'node:path';
const arg=name=>{const i=process.argv.indexOf(`--${name}`);return i<0?undefined:process.argv[i+1];};
if(!arg('root')||!arg('output'))throw Error('Usage: node scripts/optimization/capture-field-semantics.mjs --root CLEAN_A13_CHECKOUT --output NEW_JSON');
const root=resolve(arg('root')),git=(...args)=>execFileSync('git',args,{cwd:root,encoding:'utf8'}).trim();
if(git('rev-parse','HEAD')!=='a13d8fad93b1a4a14c4cc4d45ab98783388de177'||git('status','--porcelain'))throw Error('Independent contract requires the clean literal pre-descriptor a13 baseline');
registerHooks({resolve(specifier,context,next){try{return next(specifier,context);}catch(error){if(specifier.startsWith('.')&&!/\.[a-z]+$/.test(specifier))return next(specifier+'.ts',context);throw error;}}});
const {ENTITY_SCHEMAS,ENTITY_KINDS}=await import(pathToFileURL(join(root,'src/domain/model.ts')));
const {FIELD_SPECS}=await import(pathToFileURL(join(root,'src/ui/fieldSpecs.ts')));
const {PROJECTION_FIELDS}=await import(pathToFileURL(join(root,'src/domain/projection.ts')));
const {fieldSemanticInventory}=await import(pathToFileURL(join(root,'scripts/optimization/semanticStudy.ts')));
const files=[];
for(const path of ['src/domain/model.ts','src/ui/fieldSpecs.ts','src/domain/projection.ts','src/domain/schema.json']){const b=await readFile(join(root,path));files.push({path,gitBlob:git('rev-parse','HEAD:'+path),bytes:b.length,sha256:createHash('sha256').update(b).digest('hex')});}
const result={version:1,sourceCommit:git('rev-parse','HEAD'),sourceTree:git('rev-parse','HEAD^{tree}'),scope:'Independent frozen original-main contract, captured before descriptor/UI derivation. No acceptance promotion.',files,kinds:ENTITY_KINDS,model:ENTITY_SCHEMAS,fields:fieldSemanticInventory(),ui:FIELD_SPECS,public:PROJECTION_FIELDS};
await writeFile(resolve(arg('output')),JSON.stringify(result,null,2)+'\n',{flag:'wx'});
console.log(JSON.stringify({source:result.sourceCommit,kinds:result.kinds.length,fields:result.fields.length}));
