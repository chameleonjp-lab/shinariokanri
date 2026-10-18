import {test,expect} from '@playwright/test';
import {build} from 'vite';
import {createServer, type Server} from 'node:http';
import {mkdtemp,readFile,rm,readdir} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {resolve,join,extname} from 'node:path';
import {createHash} from 'node:crypto';

let directory:string,server:Server,origin:string;
test.beforeAll(async()=>{
  directory=await mkdtemp(join(tmpdir(),'phase1-browser-'));
  await build({configFile:false,base:'/',build:{outDir:directory,emptyOutDir:true,target:'es2022',rollupOptions:{input:resolve('tests/optimization/harness.html')}},logLevel:'silent'});
  server=createServer(async(req,res)=>{
    const path=resolve(directory,'.'+new URL(req.url!,'http://localhost').pathname);
    if(!path.startsWith(directory+'/')){res.writeHead(403).end();return;}
    try{res.setHeader('Content-Type',extname(path)==='.js'?'text/javascript':extname(path)==='.css'?'text/css':'text/html');res.end(await readFile(path));}catch{res.writeHead(404).end();}
  });
  await new Promise<void>(done=>server.listen(0,'127.0.0.1',done));origin=`http://127.0.0.1:${(server.address() as {port:number}).port}`;
});
test.afterAll(async()=>{server?.closeAllConnections();if(server)await new Promise<void>(done=>server.close(()=>done()));if(directory)await rm(directory,{recursive:true,force:true});});

test('numeric capture observes native committed rows in the browser without changing one-record saves',async({page},info)=>{
  test.setTimeout(120000);
  await page.goto(origin+'/tests/optimization/harness.html');await page.waitForFunction(()=>!!window.phase1);
  const result=await page.evaluate(()=>window.phase1.profile('standard'));
  expect(result.fixture.counts.totalRecords).toBe(8800);expect(result.fixture.assetBytes).toBe(0);
  expect(result.cold.probe.counters['db.read.rows.commands']??0).toBe(0);
  for(const operation of result.operations){
    expect(operation.result.changedEntities).toBe(1);expect(operation.probe.pendingTransactions).toBe(0);
    expect(operation.probe.counters['db.write.committed.entities']).toBe(1);
    expect(operation.probe.counters['db.write.committed.commands']).toBe(1);
    expect(operation.probe.counters['db.write.committed.outbox']).toBe(1);
    expect(operation.probe.counters['hash.bytes']).toBeGreaterThan(1_000_000);
    expect(operation.probe.droppedEvents).toBe(0);
  }
  expect(result.closed.probe.counters['cache.records']).toBe(0);
  expect(JSON.stringify(result)).not.toContain('SYNTHETIC_PRIVATE_CANARY');
  const files=[];
  for(const entry of await readdir(join(directory,'assets'))){const bytes=await readFile(join(directory,'assets',entry));files.push({path:'assets/'+entry,bytes:bytes.length,sha256:createHash('sha256').update(bytes).digest('hex')});}
  await info.attach('phase1-numeric-native-observation.json',{body:JSON.stringify({engine:info.project.name,result,files}),contentType:'application/json'});
});

test('product-default derived capture preserves native save invariants and independently ordered nonempty results',async({page},info)=>{
  test.setTimeout(120000);
  await page.goto(origin+'/tests/optimization/harness.html');await page.waitForFunction(()=>!!window.phase1);
  const result=await page.evaluate(()=>window.phase1.profile('standard','product-default'));
  expect(result.profileMode).toBe('product-default');
  expect(result.fixture.counts.totalRecords).toBe(8800);expect(result.fixture.assetBytes).toBe(0);
  expect(result.cold.probe.counters['db.read.rows.commands']??0).toBe(0);
  for(const operation of result.operations){
    expect(operation.result.changedEntities).toBe(1);expect(operation.probe.pendingTransactions).toBe(0);
    expect(operation.probe.counters['db.write.committed.entities']).toBe(1);
    expect(operation.probe.counters['db.write.committed.commands']).toBe(1);
    expect(operation.probe.counters['db.write.committed.outbox']).toBe(1);
    expect(operation.probe.counters['hash.bytes']).toBeGreaterThan(1_000_000);
    expect(operation.probe.droppedEvents).toBe(0);
  }
  expect(result.search.probe.counters['query.index.builds']).toBe(1);
  expect(result.search.probe.counters['derived.hit']).toBe(1);
  expect(result.nonemptySearch!.result.counts).toEqual([15,15]);
  expect(result.nonemptySearch!.expected.count).toBe(15);
  expect(result.nonemptySearch!.actualSHA256).toEqual([result.nonemptySearch!.expected.sha256,result.nonemptySearch!.expected.sha256]);
  expect(result.nonemptySearch!.probe.counters['query.index.builds']??0).toBe(0);
  expect(result.nonemptySearch!.probe.counters['derived.hit']).toBe(2);
  expect(result.closed.probe.counters['cache.records']).toBe(0);
  expect(result.derivedAfterClose).toEqual({owners:0,entries:0,references:0,textCodeUnits:0});
  expect(JSON.stringify(result)).not.toContain('SYNTHETIC_PRIVATE_CANARY');
  const files=[];
  for(const entry of await readdir(join(directory,'assets'))){const bytes=await readFile(join(directory,'assets',entry));files.push({path:'assets/'+entry,bytes:bytes.length,sha256:createHash('sha256').update(bytes).digest('hex')});}
  await info.attach('phase2-product-default-native-observation.json',{body:JSON.stringify({scope:'Product-default derived sharing; separate from the historical disabled-baseline lane',profileMode:result.profileMode,engine:info.project.name,result,files}),contentType:'application/json'});
});
