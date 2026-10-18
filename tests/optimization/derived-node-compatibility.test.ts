import {expect,it} from 'vitest';
import {spawnSync} from 'node:child_process';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {mkdtempSync,readFileSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';

it('keeps the product index boundary importable by the existing Node type-stripping measurement tools',()=>{
  const root=resolve(import.meta.dirname,'../..'),url=pathToFileURL(resolve(root,'src/domain/derivedIndexes.ts')).href;
  const program=`import {registerHooks} from 'node:module';
    registerHooks({resolve(specifier,context,next){try{return next(specifier,context);}catch(error){if(specifier.startsWith('.')&&!/\\.[a-z]+$/.test(specifier))return next(specifier+'.ts',context);throw error;}}});
    const module=await import(${JSON.stringify(url)});console.log(typeof module.beginDerivedEvaluation);`;
  const result=spawnSync(process.execPath,['--input-type=module','-e',program],{cwd:root,encoding:'utf8',timeout:30_000});
  expect(result.status,result.stderr).toBe(0);
  expect(result.stdout.trim()).toBe('function');
});

it('reports the live formal-reference fix accurately without rewriting historical evidence',()=>{
  const root=resolve(import.meta.dirname,'../..'),directory=mkdtempSync(resolve(tmpdir(),'p206-semantics-'));
  try{
    const output=resolve(directory,'semantics.json'),result=spawnSync(process.execPath,['scripts/optimization/audit-semantics.mjs',output],{cwd:root,encoding:'utf8',timeout:30_000});
    expect(result.status,result.stderr).toBe(0);
    const report=JSON.parse(readFileSync(output,'utf8'));
    expect(report.findings).toHaveLength(2);
    for(const finding of report.findings)expect(finding).toMatchObject({paths:[],status:'RESOLVED_REFERENCE_LEAVES_EXCLUDED'});
  }finally{rmSync(directory,{recursive:true,force:true});}
});
