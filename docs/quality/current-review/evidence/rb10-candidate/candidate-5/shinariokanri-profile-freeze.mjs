import {registerHooks} from 'node:module';
import {writeFile,readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
registerHooks({resolve(specifier,context,next){try{return next(specifier,context);}catch(error){if(specifier.startsWith('.')&&!/\.[a-z]+$/.test(specifier))return next(specifier+'.ts',context);throw error;}}});
const {createMaterialPerformanceFixture}=await import('/workspace/shinariokanri-rb10/src/testing/performanceFixture.ts');
const f=await createMaterialPerformanceFixture('large-material-rb10-v1'),output='/tmp/shinariokanri-rb10-c5-freeze-profile.json',result={scope:'Outside-repo Node-only controlled microprofile, not a production p95/acceptance result',recordedAt:new Date().toISOString(),helperSha256:createHash('sha256').update(await readFile(new URL(import.meta.url))).digest('hex'),fixtureSha256:f.sha256,fixtureRecords:f.counts.totalRecords,node:process.version,trials:[]};
for(let trial=0;trial<6;trial++)for(const method of trial%2?['ownForIn','values']:['values','ownForIn']){
 const p=structuredClone(f.project),seen=new WeakSet();let count=0;globalThis.gc?.();
 const visit=method==='values'?value=>{if(value&&typeof value==='object'&&!seen.has(value)){for(const child of Object.values(value))visit(child);Object.freeze(value);seen.add(value);count++;}}:value=>{if(value&&typeof value==='object'&&!seen.has(value)){for(const key in value)if(Object.hasOwn(value,key))visit(value[key]);Object.freeze(value);seen.add(value);count++;}};
 const start=performance.now();visit(p);const elapsed=performance.now()-start;result.trials.push({trial,method,milliseconds:elapsed,frozenObjectCount:count,rootFrozen:Object.isFrozen(p),entityArrayFrozen:Object.isFrozen(p.entities),lastEntityFrozen:Object.isFrozen(p.entities.at(-1))});console.log(JSON.stringify(result.trials.at(-1)));await writeFile(output,JSON.stringify(result,null,2)+'\n');
}
result.finishedAt=new Date().toISOString();await writeFile(output,JSON.stringify(result,null,2)+'\n');
