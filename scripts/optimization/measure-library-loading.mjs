// Loopback-only, original inputs, old full-array API versus summary/selected API.
import {build} from 'vite';
import {chromium} from '@playwright/test';
import {createServer} from 'node:http';
import {readFile,writeFile,mkdir,readdir} from 'node:fs/promises';
import {resolve,dirname,join,extname} from 'node:path';
import {createHash} from 'node:crypto';
import {release,cpus,totalmem} from 'node:os';
const value=(name,fallback)=>{const at=process.argv.indexOf(`--${name}`);return at<0?fallback:process.argv[at+1];};
const output=resolve(value('output','test-results/p2-01/comparison.json')),suite=value('suite','growth');
if(!['growth','standard','large','ui'].includes(suite))throw Error('Unknown suite');
const root=process.cwd(),distribution=output.replace(/\.json$/,'')+'-build';
const digest=bytes=>createHash('sha256').update(bytes).digest('hex');
async function files(directory,prefix=''){const values=[];for(const entry of await readdir(directory,{withFileTypes:true})){const path=join(directory,entry.name),relative=prefix+entry.name;if(entry.isDirectory())values.push(...await files(path,relative+'/'));else{const bytes=await readFile(path);values.push({path:relative,bytes:bytes.length,sha256:digest(bytes)});}}return values.sort((a,b)=>a.path.localeCompare(b.path));}
const result={version:1,suite,recordedAt:new Date().toISOString(),sourceCommit:process.env.P2_SOURCE_COMMIT,sourceTree:process.env.P2_SOURCE_TREE,dirty:process.env.P2_SOURCE_DIRTY,environment:{os:'Linux',osVersion:release(),node:process.version,cpu:cpus()[0]?.model,logicalCPUs:cpus().length,totalMemory:totalmem(),physicalDevice:false,network:'HTTP loopback only'},scope:'Legacy-API/common-store comparison; baseline App is pinned main App with import-path-only adaptation but uses candidate shared store/components. This is not literal main-before. Supplemental single observations; OFF time and ON numeric diagnostics are distinct. Original formal30/180/7200 and 600000ms acceptance not performed. Native headers and derived summary bytes explicit. Cache canonical bytes exclude JS overhead; actual heap/GC UNKNOWN.',sourceFiles:[],observations:[],errors:[]};
for(const directory of ['src','tests/optimization','scripts/optimization'])for(const row of await files(resolve(root,directory)))result.sourceFiles.push({...row,path:`${directory}/${row.path}`});
let browser,server;
try{
 await mkdir(dirname(output),{recursive:true});await build({configFile:false,root,base:'/',build:{target:'es2022',outDir:distribution,emptyOutDir:true,rollupOptions:{input:resolve('tests/optimization/library-summary-harness.html')}},logLevel:'warn'});result.buildFiles=await files(distribution);
 server=createServer(async(req,res)=>{const path=resolve(distribution,'.'+new URL(req.url,'http://localhost').pathname);if(!path.startsWith(distribution+'/')){res.writeHead(403).end();return;}try{res.setHeader('Content-Type',extname(path)==='.js'?'text/javascript':extname(path)==='.css'?'text/css':'text/html');res.end(await readFile(path));}catch{res.writeHead(404).end();}});
 await new Promise(done=>server.listen(0,'127.0.0.1',done));browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH||'/usr/bin/chromium',args:['--no-sandbox']});result.environment.browser=browser.version();
 const page=await browser.newPage({viewport:{width:1440,height:1000}});page.setDefaultTimeout(600000);page.on('pageerror',error=>result.errors.push({name:error.name,message:error.message,kind:'pageerror'}));
 await page.goto(`http://127.0.0.1:${server.address().port}/tests/optimization/library-summary-harness.html`);await page.waitForFunction(()=>!!window.libraryMeasurement);
 if(suite==='ui')for(const count of [1,10,50])for(const enabled of [false,true])for(const variant of ['baseline','candidate']){
  await page.evaluate(({variant,count,enabled})=>window.libraryMeasurement.mount(variant,count,enabled),{variant,count,enabled});await page.locator('.sidebar').getByRole('button',{name:/^資料/}).click();await page.locator('.entity-card').first().click();const input=page.getByLabel('名前',{exact:true});await input.waitFor();await input.focus();await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));if(!await input.isEditable())throw Error('Editor is not input ready');result.observations.push({count,variant,enabled,...await page.evaluate(()=>window.libraryMeasurement.inputReady())});await page.evaluate(()=>window.libraryMeasurement.cleanup());
 }else for(const count of suite==='growth'?[1,10,50]:[1]){result.observations.push(await page.evaluate(({suite,count})=>window.libraryMeasurement.compare(suite,count),{suite,count}));await writeFile(output,JSON.stringify(result,null,2)+'\n');}
 result.finishedAt=new Date().toISOString();
}catch(error){result.errors.push({name:error.name,message:error.message});process.exitCode=1;}
finally{await browser?.close();if(server){server.closeAllConnections();await new Promise(done=>server.close(done));}await mkdir(dirname(output),{recursive:true});await writeFile(output,JSON.stringify(result,null,2)+'\n');}
console.log(JSON.stringify({suite,output,errors:result.errors.length}));
