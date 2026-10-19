/** Wrap the immutable N05 body; save bytes only from completed download events. */
import {readFile, writeFile, mkdir, symlink, unlink} from 'node:fs/promises';
import {resolve, join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash, randomUUID} from 'node:crypto';
import {spawnSync} from 'node:child_process';

export const sha = bytes => createHash('sha256').update(bytes).digest('hex');
export const ORIGINAL_SHA256 = '4b8eff5530a2925557a4491c6bdb22061bc16e33d239bc8cb003578dab66456e';
export const ORIGINAL_CONFIG_SHA256 = '325086179677c1f7a0b39031415e7c54f9fc8cc466aec281961627ff84cb3c0f';
export const ORIGINAL_METADATA_SHA256 = '4bce4331003c6c00ead1565a5c79965beda13ddd714e1c877729e67a5c2d3158';
export const ORIGINAL_IMPORT = "import {test,expect,type Page} from '@playwright/test';";
export function stageSource(source) {
  if (!source.startsWith(ORIGINAL_IMPORT+'\n') || source.split(ORIGINAL_IMPORT).length !== 2)
    throw new Error('Unexpected original N05 import');
  return source.replace(ORIGINAL_IMPORT, "import {test,expect,type Page} from './capture-bridge';");
}

export function bridgeSource(provenance, directory) {
  return `import {test as base,expect,type Page} from '@playwright/test';
import {readFile,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
export {expect}; export type {Page};
const provenance=${JSON.stringify(provenance)},directory=${JSON.stringify(directory)};
export const test=base.extend<{captureN05:void}>({captureN05:[async({page},use,info)=>{
 const pending:Promise<void>[]=[],events:any[]=[],failures:any[]=[],seen=new WeakSet();
 const listener=(download:any)=>{
  if(seen.has(download))throw new Error('Repeated download object');seen.add(download);
  const event= pending.length+1;
  pending.push((async()=>{
   const failure=await download.failure();if(failure!==null)throw new Error('Download failed: '+failure);
   const savedPath=directory+'/downloads/'+event+'.json';
   await download.saveAs(savedPath);
   const bytes=await readFile(savedPath);
   events.push({...provenance,event,filename:download.suggestedFilename(),url:download.url(),savedPath,
    path:'downloads/'+event+'.json',bytes:bytes.length,sha256:createHash('sha256').update(bytes).digest('hex'),completed:true});
  })().catch(error=>{failures.push(error);}));
 };
 page.on('download',listener);
 try{await use();}finally{
  page.off('download',listener);await Promise.all(pending);if(failures.length)throw failures[0];events.sort((a,b)=>a.event-b.event);
  const descriptor={...provenance,testId:info.testId,project:info.project.name,retry:info.retry,events};
  const body=Buffer.from(JSON.stringify(descriptor,null,2)+'\\n');
  await writeFile(directory+'/events.json',body,{flag:'wx'});
  await info.attach('n05-download-events',{body,contentType:'application/json'});
  if(events.length!==2)throw new Error('Expected exactly two actual download events');
 }
 },{auto:true}]});
`;
}

async function main() {
  const args=process.argv.slice(2), options={};
  for(let i=0;i<args.length;i+=2){
    if(!['--repository','--binding','--output'].includes(args[i]) || !args[i+1] || options[args[i]])
      throw new Error('Usage: --repository PATH --binding FILE --output NEW_DIRECTORY');
    options[args[i]]=args[i+1];
  }
  if(Object.keys(options).length!==3)throw new Error('All three arguments are required');
  const repository=resolve(options['--repository']), output=resolve(options['--output']);
  const bindingBytes=await readFile(resolve(options['--binding'])),binding=JSON.parse(bindingBytes);
  const original=await readFile(join(repository,'tests/rb10/large-analysis.spec.ts'));
  const packageBytes=await readFile(join(repository,'package.json'));
  if(JSON.parse(packageBytes).type!=='module')throw new Error('Original ESM package context missing');
  const fixture=await readFile(join(repository,'tests/fixtures/rb10-large-analysis/metadata.json'));
  if(sha(original)!==ORIGINAL_SHA256 || sha(fixture)!==ORIGINAL_METADATA_SHA256 || sha(await readFile(join(repository,'tests/rb10/playwright.config.ts')))!==ORIGINAL_CONFIG_SHA256)throw new Error('Fixed original N05 input changed');
  const metadata=JSON.parse(fixture), archive=await readFile(join(repository,'tests/fixtures/rb10-large-analysis',metadata.archive));
  const git=(...argv)=>{const r=spawnSync('git',argv,{cwd:repository,encoding:'utf8'});if(r.status!==0)throw new Error(r.stderr);return r.stdout.trim();};
  const seal=async()=>{
    if(git('rev-parse','HEAD')!==binding.commit || git('status','--porcelain'))throw new Error('Candidate checkout differs');
    for(const row of [...binding.source_files,...binding.artifact_files,...binding.original_documents,binding.generated_runtime]){
      const bytes=await readFile(join(repository,row.path));
      if(bytes.length!==row.bytes || sha(bytes)!==row.sha256)throw new Error('Sealed file differs: '+row.path);
    }
    if(JSON.stringify(JSON.parse(await readFile(join(repository,'dist/build-info.json'))))!==JSON.stringify(binding.build_info))throw new Error('Build differs');
  };
  await seal();await mkdir(output);await mkdir(join(output,'downloads'));
  const stage=join(output,'staging');await mkdir(stage);await symlink(join(repository,'node_modules'),join(stage,'node_modules'),'dir');
  const provenance={format:'phase3-n05-downloads/1',trial:randomUUID(),bindingSHA256:sha(bindingBytes),
    candidate:binding.commit,tree:binding.tree,build:binding.build_info,originalSHA256:sha(original),packageSHA256:sha(packageBytes),
    fixture:{metadataSHA256:sha(fixture),archive:metadata.archive,bytes:archive.length,sha256:sha(archive)}};
  const transformed=stageSource(original.toString());
  if(transformed.slice(transformed.indexOf('\n'))!==original.toString().slice(original.indexOf(10)))throw new Error('Original body changed');
  const bridge=bridgeSource(provenance,output);
  const config=`import original from ${JSON.stringify(join(repository,'tests/rb10/playwright.config.ts'))};\nexport default {...original,testDir:${JSON.stringify(stage)},testMatch:'capture-original.spec.ts',reporter:[['list'],['json',{outputFile:${JSON.stringify(join(output,'results.json'))}}]],webServer:{...original.webServer,cwd:${JSON.stringify(repository)}}};\n`;
  await writeFile(join(output,'executed-original.spec.ts'),original,{flag:'wx'});
  await writeFile(join(stage,'package.json'),packageBytes,{flag:'wx'});
  await writeFile(join(stage,'capture-original.spec.ts'),transformed,{flag:'wx'});
  await writeFile(join(stage,'capture-bridge.ts'),bridge,{flag:'wx'});
  await writeFile(join(stage,'playwright.config.ts'),config,{flag:'wx'});
  await writeFile(join(output,'executed-driver.mjs'),await readFile(fileURLToPath(import.meta.url)),{flag:'wx'});
  const argv=['npx','playwright','test','-c',join(stage,'playwright.config.ts'),'--project=chromium','--output',join(output,'test-results')];
  const record={...provenance,repository,output,argv,stagedSHA256:sha(transformed),bridgeSHA256:sha(bridge),configSHA256:sha(config),status:'running'};
  const save=()=>writeFile(join(output,'capture.json'),JSON.stringify(record,null,2)+'\n');await save();
  const child=spawnSync(process.env.PYTHON || 'python3',[join(repository,'scripts/acceptance/execute.py'),'--workdir',repository,'--receipt',join(output,'execution'),'--',...argv],{cwd:repository,env:{...process.env,CI:'1'},stdio:'inherit'});
  await unlink(join(stage,'node_modules'));
  record.returncode=child.status ?? 1;record.status=record.returncode===0?'completed':'failed';await save();await seal();
  process.exitCode=record.returncode;
}
if(process.argv[1] && resolve(process.argv[1])===fileURLToPath(import.meta.url))main().catch(error=>{console.error(error);process.exitCode=1;});
