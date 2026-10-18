"""Canonical post-formal commands and byte-exact allowed portability changes."""
import hashlib,json,re,subprocess
from datetime import datetime
from pathlib import Path

sha=lambda data:hashlib.sha256(data).hexdigest()
def verify_post(repo,post,binding_path,historical_root=None):
 from check_phase3 import loads,require,verify_exit
 repo=Path(repo).resolve();post=Path(post).resolve();binding_path=Path(binding_path).resolve()
 binding=loads(binding_path.read_bytes());source={r['path']:r for r in binding['source_files']}
 def sealed(path):
  data=(repo/path).read_bytes();row=source[path]
  require(len(data)==row['bytes'] and sha(data)==row['sha256'],'Post-formal sealed source differs: '+path);return data
 execute=sealed('scripts/acceptance/execute.py')
 plan=loads((post/'sequence.json').read_bytes());formal=binding_path.parent;recorded_formal=Path(plan['formal']);recorded_repo=Path(binding['sourceRoot']);recorded_post=Path(plan['steps'][0]['argv'][-1]).parent
 require(all(p.is_absolute() for p in (recorded_formal,recorded_repo,recorded_post)) and plan['status']=='completed' and plan['product']==binding['build_info'],'Post-formal candidate/status differs')
 names=['original-supplements','n05-actual-downloads','baseline-checkout','baseline-build','baseline-seal','baseline-resources','candidate-resources']
 formal_plan=loads((formal/'sequence.json').read_bytes())
 require(formal_plan.get('status')=='completed' and [r['step'] for r in formal_plan['steps']]==['performance-standard','performance-large','saves180','soak','exceptions'] and all(r['status']=='completed' and r['sourceVerifiedBefore'] and r['sourceVerifiedAfter'] for r in formal_plan['steps']) and plan['formalFinishedAt']==formal_plan['steps'][-1]['finishedAt'],'Post operations are not bound to the completed original five-stage formal execution')
 require([r['step'] for r in plan['steps']]==names,'Missing/reordered post-formal operation')
 first=plan['steps'][0]['argv'];require(len(first)==10,'Original supplementary argv shape differs')
 python=first[0];require(Path(python).is_absolute() and re.fullmatch(r'python(?:3(?:\.\d+)?)?',Path(python).name),'Post-formal interpreter is not Python')
 historical=Path(first[7]);require(first[6]=='--historical' and historical.is_absolute(),'Original protocol location missing')
 baseline=Path(plan['steps'][2]['argv'][4]);require(baseline.is_absolute() and baseline!=recorded_repo,'Invalid separate PR59 checkout')
 rr=recorded_repo;rp=recorded_post;rf=recorded_formal
 commands={
 'original-supplements':[python,str(rr/'scripts/acceptance/run_supplements.py'),'--repository',str(rr),'--binding',str(rf/'candidate.json'),'--historical',str(historical),'--output',str(rp/'original-supplements')],
 'n05-actual-downloads':[python,str(rp/'executed-n05-capture.py'),'--repository',str(rr),'--binding',str(rf/'candidate.json'),'--historical',str(historical),'--output',str(rp/'n05-actual-downloads')],
 'baseline-checkout':['git','worktree','add','--detach',str(baseline),'f40d07afb709b91db1ec439c0a5503682ecab91b'],
 'baseline-build':['npm','run','build'],
 'baseline-seal':[python,str(rp/'baseline-seal-candidate.py'),'--output',str(rp/'baseline-source.json')],
 'baseline-resources':['node',str(rr/'scripts/acceptance/measure_resources.mjs'),'--repository',str(baseline),'--tools-root',str(rr),'--output',str(rp/'baseline-resources')],
 'candidate-resources':['node',str(rr/'scripts/acceptance/measure_resources.mjs'),'--repository',str(rr),'--tools-root',str(rr),'--output',str(rp/'candidate-resources'),'--compare',str(rp/'baseline-resources/raw.json')],
 }
 receipts={};previous=datetime.fromisoformat(plan['formalFinishedAt'])
 for row in plan['steps']:
  name=row['step'];directory=post/(name+'-execution');command=loads((directory/'command.json').read_bytes());receipt=loads((directory/'exit.json').read_bytes());verify_exit(receipt)
  cwd=str(baseline if name=='baseline-build' else rr)
  require(row['status']=='completed' and row['returncode']==0 and row['argv']==commands[name] and row['cwd']==cwd,'Noncanonical dependent operation: '+name)
  verify_command(directory,commands[name],cwd,execute,rr,recorded_directory=rp/(name+'-execution'))
  start=datetime.fromisoformat(row['startedAt']);finish=datetime.fromisoformat(row['finishedAt'])
  require(previous<=start<=datetime.fromisoformat(command['startedAt'])<=datetime.fromisoformat(receipt['finishedAt'])<=finish,'Dependent operation overlapped or lies outside its receipt')
  previous=finish;receipts[name]=(command,receipt)
 require(previous<=datetime.fromisoformat(plan['finishedAt']),'Post sequence ends before operations')
 original=sealed('scripts/acceptance/seal_candidate.py').decode();adapted=original
 replacements=[("ROOT = Path(__file__).resolve().parents[2]",'ROOT = Path('+repr(str(baseline))+')'),("ROOT/'docs/optimization/phase1/contract-lock.json'",'Path('+repr(str(rr/'docs/optimization/phase1/contract-lock.json'))+')')]
 for old,new in replacements:
  require(adapted.count(old)==1,'Baseline seal portability source differs');adapted=adapted.replace(old,new)
 require((post/'original-seal-candidate.py').read_bytes()==original.encode() and (post/'baseline-seal-candidate.py').read_bytes()==adapted.encode(),'Baseline seal has changes beyond two path bindings')
 portable=loads((post/'baseline-seal-portability.json').read_bytes())
 require(portable['originalSHA256']==sha(original.encode()) and portable['executedSHA256']==sha(adapted.encode()) and portable['exactPathSubstitutions']==[list(x) for x in replacements],'Baseline seal substitution receipt differs')
 require((post/'original-supplements/executed-procedure.py').read_bytes()==sealed('scripts/acceptance/run_supplements.py'),'Executed original supplement runner differs')
 require((post/'executed-n05-capture.py').read_bytes()==(post/'n05-actual-downloads/executed-procedure.py').read_bytes(),'Executed passive-capture procedure differs')
 require(sha((post/'executed-n05-capture.py').read_bytes())=='b9b3ec4b16dd122f42156d3b073af11e28e05f4a8bf6d97f9942c3e0432a815e','Passive capture runner differs from retained intended protocol')
 context_rows=[];actual_historical=Path(historical_root).resolve() if historical_root else historical
 for label,prefix,name in [('unaffected-local-3ab6','rg01-same-given-3ab6f40-attempt1/executed-inputs','rg01-package.json'),('additional-original-regressions-1fcadcca','rg02-rg03-same-given-1fcadcca-attempt1/executed-inputs','rg02-rg03-package.json')]:
  data=historical_input(repo,actual_historical,label,prefix+'/package.json')
  require(loads(data)['type']=='module' and (post/'original-module-context'/name).read_bytes()==data,'Original module context differs')
  context_rows.append(dict(label=label,originalPath=prefix+'/package.json',retained='original-module-context/'+name,bytes=len(data),sha256=sha(data)))
 context=loads((post/'module-context.json').read_bytes())
 require(context['format']=='phase3-original-es-module-context/1' and context['originals']==context_rows and context['appliedPath']=='package.json' and context['appliedSHA256']==context_rows[0]['sha256'] and sha((post/'package.json').read_bytes())==context_rows[0]['sha256'],'Staged original ES module package setting differs')
 return dict(plan=plan,receipts=receipts,python=python,historical=Path(historical_root).resolve() if historical_root else historical,baseline=baseline,sealed=sealed,execute=execute,recorded_repo=rr,recorded_post=rp)

def verify_command(directory,argv,cwd,execute,repo,env=None,recorded_directory=None):
 from check_phase3 import loads,require,verify_exit
 directory=Path(directory);command=loads((directory/'command.json').read_bytes());receipt=loads((directory/'exit.json').read_bytes());verify_exit(receipt)
 require(command['argv']==argv and command['cwd']==str(cwd),'Actual argv/cwd differs from canonical procedure')
 require(command['childPid']==receipt['childPid'] and datetime.fromisoformat(command['startedAt'])<datetime.fromisoformat(receipt['finishedAt']),'Child identity/interval differs')
 require((directory/'executed-wrapper.py').read_bytes()==execute and command['procedure']==dict(path=str(Path(repo)/'scripts/acceptance/execute.py'),retained='executed-wrapper.py',bytes=len(execute),sha256=sha(execute)),'Actual parent wrapper differs')
 log=(directory/'stdout-stderr.log').read_bytes();recorded_directory=Path(recorded_directory) if recorded_directory else directory
 require(receipt['log']==dict(path=str(recorded_directory/'stdout-stderr.log'),bytes=len(log),sha256=sha(log)),'Actual child log differs')
 for key,value in (env or {}).items():require(command['environmentSelectors'].get(key)==value,'Original environment selector differs: '+key)
 return command,receipt

def resource_entry(procedure,repository):
 from check_phase3 import require
 text=procedure.decode();start='await writeFile(entry,`';end='`);\nawait build('
 require(text.count(start)==text.count(end)==1,'Resource template source differs')
 template=text.split(start,1)[1].split(end,1)[0]
 for path in ('src/storage/store.ts','src/testing/performanceFixture.ts','src/storage/json.ts'):
  expression="${JSON.stringify(join(repo,'"+path+"'))}";require(template.count(expression)==1,'Resource import template differs')
  template=template.replace(expression,json.dumps(str(Path(repository)/path),ensure_ascii=False,separators=(',',':')))
 require('${' not in template,'Unrecognized resource template expression')
 return template.encode()

def historical_input(repo,historical,label,relative):
 from check_phase3 import loads,require,safe_relative
 pins={'unaffected-local-3ab6':'94638ab2ed3ac407b0a70a60d90d0f2a9ed81ce2e7967c02f5aebe4da67d8de1','additional-original-regressions-1fcadcca':'1cf01c9b9798d03dc641d0422663cd76192cf24dea813458d36df9ab6c6de07f'}
 commit='d5e132ef6f4db6a0f3fbe888228ffd1007d653f9';path='docs/quality/pr49-followup-2026-10-15/evidence/bundles/'+label+'.manifest.json'
 retained=Path(historical)/'manifests'/(label+'.manifest.json')
 raw=retained.read_bytes() if retained.exists() else subprocess.check_output(['git','show',commit+':'+path],cwd=repo)
 require(sha(raw)==pins[label],'Original procedure manifest differs from immutable source')
 manifest=loads(raw);rows=[r for r in manifest['files'] if r['path']==relative];require(len(rows)==1,'Original procedure not uniquely retained')
 data=(Path(historical)/label/safe_relative(relative)).read_bytes();require(len(data)==rows[0]['bytes'] and sha(data)==rows[0]['sha256'],'Original procedure bytes differ from immutable manifest')
 return data

def verify_supplement_inputs(repo,post,binding,proof):
 from check_phase3 import loads,require
 repo=Path(repo);post=Path(post);supp=post/'original-supplements';historical=proof['historical'];sealed=proof['sealed'];rr=proof['recorded_repo'];rp=proof['recorded_post']
 plan=loads((supp/'sequence.json').read_bytes());require([r['step'] for r in plan['steps']]==['rg01','rg02-rg03','n05'],'Original supplementary inventory differs')
 portable=lambda b:b.decode().replace('/workspace/pr49-graph-measure-source',str(rr)).replace('/workspace/pr49-measure-source',str(rr))
 definitions=[('rg01','unaffected-local-3ab6','rg01-same-given-3ab6f40-attempt1/executed-inputs',('rg01.spec.ts','rebound-original-seed.ts')),('rg02-rg03','additional-original-regressions-1fcadcca','rg02-rg03-same-given-1fcadcca-attempt1/executed-inputs',('same-given.spec.ts','original-fixtures.ts','original-runtime-regressions.test.ts'))]
 for step,label,prefix,names in definitions:
  directory=supp/step;recorded_directory=rp/'original-supplements'/step;row=next(x for x in plan['steps'] if x['step']==step);expected_rows=[]
  for name in names:
   original=historical_input(repo,historical,label,prefix+'/'+name);executed=portable(original)
   if name=='same-given.spec.ts':
    for old,new in [('1fcadcca703863873a57d297e83b1b184e63e778',binding['commit']),('8ec3a03810bb0cf1b1b4',binding['build_info']['version'])]:
     require(executed.count(old)==1,'Original product assertion differs');executed=executed.replace(old,new)
   executed=executed.encode();require((directory/'originals'/name).read_bytes()==original and (directory/'executed-inputs'/name).read_bytes()==executed,'Original supplementary input has changes beyond permitted paths/product assertions')
   expected_rows.append(dict(path=name,originalBytes=len(original),originalSHA256=sha(original),executedBytes=len(executed),executedSHA256=sha(executed)))
  config=portable(historical_input(repo,historical,label,prefix+'/playwright.config.mjs'))
  if step=='rg02-rg03':config=config.replace('/workspace/pr49-checks/rg02-rg03-same-given-1fcadcca-attempt1',str(recorded_directory))
  require(row['inputs']==expected_rows and row['configSHA256']==sha(config.encode()) and (directory/'executed-inputs/playwright.config.mjs').read_bytes()==config.encode(),'Supplement config/input receipt differs')
  require(Path(row['stagingDirectory']).is_absolute() and row['status']=='passed' and row['returncode']==0,'Original supplementary staging/execution failed')
  argv=['npx','playwright','test','-c',str(Path(row['stagingDirectory'])/'playwright.config.mjs')]
  env={'CI':'1'}
  if step=='rg01':env['RG01_OUTPUT_DIR']=str(recorded_directory)
  command,receipt=verify_command(directory/'execution',argv,rr,proof['execute'],rr,env,recorded_directory=recorded_directory/'execution');inside(command,receipt,proof['receipts']['original-supplements'])
 directory=supp/'n05';row=plan['steps'][2];original=sealed('tests/rb10/large-analysis.spec.ts')
 require((directory/'executed-original.spec.ts').read_bytes()==original and row['originalSHA256']==sha(original),'Original N05 test changed')
 recorded_directory=rp/'original-supplements/n05';argv=['npx','playwright','test','-c','tests/rb10/playwright.config.ts','--project=chromium','--reporter=list,json','--output',str(recorded_directory/'test-results')]
 require(row['argv']==argv and row['status']=='passed' and row['returncode']==0,'Original N05 argv/exit differs')
 command,receipt=verify_command(directory/'execution',argv,rr,proof['execute'],rr,{'CI':'1','PLAYWRIGHT_JSON_OUTPUT_NAME':str(recorded_directory/'results.json')},recorded_directory=recorded_directory/'execution');inside(command,receipt,proof['receipts']['original-supplements'])
 directory=post/'n05-actual-downloads';recorded_directory=rp/'n05-actual-downloads';plan=loads((directory/'sequence.json').read_bytes());rows=[]
 for name in ('capture-download-directory.py','n05-retained-downloads.config.mjs'):
  source=historical_input(repo,historical,'unaffected-local-3ab6','n05-original-3ab6f40-attempt2/executed-inputs/'+name);data=source
  if name.endswith('.mjs'):
   require(source.count(b'/workspace/pr49-measure-source')==3,'Original N05 config differs');data=source.replace(b'/workspace/pr49-measure-source',str(rr).encode())
  require((directory/'originals'/name).read_bytes()==source and (directory/'executed-inputs'/name).read_bytes()==data,'Passive N05 procedure/config changed beyond three checkout paths')
  rows.append(dict(path=name,originalBytes=len(source),originalSHA256=sha(source),executedBytes=len(data),executedSHA256=sha(data)))
 argv=[proof['python'],str(recorded_directory/'executed-inputs/capture-download-directory.py'),'--downloads',str(recorded_directory/'downloads'),'--retained',str(recorded_directory/'retained-downloads'),'--manifest',str(recorded_directory/'actual-downloads.json'),'--','npx','playwright','test','-c',str(recorded_directory/'executed-inputs/n05-retained-downloads.config.mjs'),'--project=chromium','--reporter=list,json','--output',str(recorded_directory/'test-results')]
 require(plan['originalInputs']==rows and plan['argv']==argv and plan['originalTest']==dict(path='tests/rb10/large-analysis.spec.ts',bytes=len(original),sha256=sha(original)) and (directory/'executed-original.spec.ts').read_bytes()==original,'Passive N05 actual test/command differs')
 command,receipt=verify_command(directory/'execution',argv,rr,proof['execute'],rr,{'CI':'1','N05_DOWNLOADS_PATH':str(recorded_directory/'downloads'),'PLAYWRIGHT_JSON_OUTPUT_NAME':str(recorded_directory/'results.json')},recorded_directory=recorded_directory/'execution');inside(command,receipt,proof['receipts']['n05-actual-downloads'])

def inside(command,receipt,parent):
 from check_phase3 import require
 outer_command,outer_receipt=parent
 require(datetime.fromisoformat(outer_command['startedAt'])<=datetime.fromisoformat(command['startedAt'])<datetime.fromisoformat(receipt['finishedAt'])<=datetime.fromisoformat(outer_receipt['finishedAt']),'Supplementary child execution lies outside corresponding parent')

def verify_resource_provenance(directory,raw,procedure,recorded_repository,command,receipt):
 from check_phase3 import require
 directory=Path(directory);helper_root=directory/'helper';inventory={}
 for path in helper_root.rglob('*'):
  require(not path.is_symlink(),'Resource helper symlink')
  if path.is_file():
   data=path.read_bytes();inventory[path.relative_to(helper_root).as_posix()]=(len(data),sha(data))
 require(len(raw['helperFiles'])==len({r['path'] for r in raw['helperFiles']}) and inventory=={r['path']:(r['bytes'],r['sha256']) for r in raw['helperFiles']},'Resource complete helper inventory differs')
 entry=(directory/'entry.mjs').read_bytes();require(entry==resource_entry(procedure,recorded_repository) and sha(entry)==raw['entrySHA256'],'Resource entry differs from sealed exact repository imports')
 require(datetime.fromisoformat(command['startedAt'])<=datetime.fromisoformat(raw['startedAt'])<datetime.fromisoformat(raw['finishedAt'])<=datetime.fromisoformat(receipt['finishedAt']),'Resource raw lies outside corresponding actual child interval')

N05_CURRENT_STORES={'acks','assets','authorToolDrafts','blocks','commands','entities','importDrafts','importLogs','outbox','preparedSync','projectSummaries','projects','recordParts','recoveredPending','relations','restorePoints','retainedSyncRecovery','sharedSnapshots','snapshots','syncAckEvidence','syncAssetAcks','syncBases','syncConflicts','syncMetadata','viewStates','views','workspaceInputs','worldSources','worlds'}

def verify_n05_observation(value,metadata):
 from check_phase3 import require
 require(value['fixture']==metadata and value['physical']=='not_run' and value['actualAuth']=='not_run','N05 observed fixed metadata/scope differs')
 require(value['nativeBefore']==value['nativeAfter'] and set(value['nativeBefore'])==set(value['nativeAfter'])==N05_CURRENT_STORES,'N05 changed native bytes or omitted a current schema store')
 require(value['nativeBefore']['entities']['count']+value['nativeBefore']['relations']['count']==metadata['totalRecords']==88522 and value['nativeBefore']['assets']['count']==3,'N05 original full native input differs')
 for fingerprint in value['nativeBefore'].values():require(set(fingerprint)=={'count','sha256'} and type(fingerprint['count']) is int and fingerprint['count']>=0 and re.fullmatch('[a-f0-9]{64}',fingerprint['sha256']),'N05 all-table fingerprint missing')
 timing=value['timing'];require(0<timing['firstPaintAt']-timing['startedAt']<=2000 and 0<timing['largestTimerGap']<=2000 and value['progress'],'N05 original responsiveness differs')
 result=value['result'];require(result['status']=='unknown' and result['truncated'] is True and result['limits']==dict(maxStates=100000,maxTransitions=10000,maxMs=30000),'N05 stopped exploration treated as safety proof')

def verify_n05_downloads(downloads,capture,recorded_capture,result,command,receipt):
 from check_phase3 import loads,require
 capture=Path(capture);recorded_capture=Path(recorded_capture)
 require(downloads['result']=='retained_actual_downloads' and downloads['childReturncode']==0 and not downloads['errors'] and len(downloads['events'])==2,'Missing passive actual N05 downloads')
 retained=[];sources=set();targets=set()
 for row in downloads['events']:
  source=Path(row['source']);target=Path(row['retained'])
  require(source.parent==recorded_capture/'downloads' and target.parent==recorded_capture/'retained-downloads' and re.fullmatch('[a-f0-9-]{20,64}',source.name) and target.name==source.name+'.raw' and str(source) not in sources and str(target) not in targets,'N05 duplicated or differently bound actual download event')
  sources.add(str(source));targets.add(str(target));local_target=capture/'retained-downloads'/target.name
  raw=local_target.read_bytes();require(not local_target.is_symlink() and row['eventMask']&(0x8|0x80) and row['sameActualInodeAtCapture'] is True and row['parsedJSONStatus']=='unknown' and len(raw)==row['bytes'] and sha(raw)==row['sha256'] and loads(raw)==result,'Retained actual N05 bytes/result differs')
  require(datetime.fromisoformat(command['startedAt'])<=datetime.fromisoformat(row['capturedAt'])<=datetime.fromisoformat(receipt['finishedAt']),'N05 capture event outside actual execution')
  retained.append(dict(path=row['retained'],bytes=len(raw),sha256=sha(raw),sameActualInodeAtCapture=True))
 require({p.name for p in (capture/'retained-downloads').iterdir()}=={Path(p).name for p in targets} and len(sources)==len(targets)==2,'N05 actual retained download inventory differs')
 return retained
