"""Verify sealed resource observations and compare retained main-renderer heap."""
import argparse,hashlib,importlib.util,json,math,os,statistics,subprocess,sys,tempfile
from datetime import datetime
from pathlib import Path
p=argparse.ArgumentParser();p.add_argument('--repository',type=Path,required=True);p.add_argument('--post',type=Path,required=True);p.add_argument('--candidate-binding',type=Path,required=True);p.add_argument('--historical',type=Path,required=True);p.add_argument('--baseline-binding',type=Path,required=True);p.add_argument('--snapshot-procedure',type=Path,required=True);p.add_argument('--output',type=Path,required=True);a=p.parse_args()
repo=a.repository.resolve();post=a.post.resolve();sys.path.insert(0,str(repo/'scripts'))
from check_phase3 import loads,require,verify_exit,safe_relative
from phase3_post_procedures import verify_post,verify_resource_provenance
spec=importlib.util.spec_from_file_location('resource_snapshot_verifier',a.snapshot_procedure);snapshot=importlib.util.module_from_spec(spec);spec.loader.exec_module(snapshot)
sha=lambda b:hashlib.sha256(b).hexdigest();candidate=loads(a.candidate_binding.read_bytes());baseline=loads(a.baseline_binding.read_bytes());sequence=loads((post/'sequence.json').read_bytes())
post_proof=verify_post(repo,post,a.candidate_binding,a.historical)
original_fixtures={};original_fixture_inputs=[]
for size,pinned in [('standard','ed3ead70fa66881ea6cedff11c77ec455e49f82910a24fc7bbc88451fbcaec03'),('large','3d278287b8db6444950f46d2e7439cac94594cc108f2b7a93565e476d44731c8')]:
 path=f'docs/optimization/phase1/evidence/baseline-{size}30.json';data=subprocess.check_output(['git','show','67bef6a08f63a737d64d5bab0c8a17e3364bbc0a:'+path],cwd=repo)
 require(sha(data)==pinned and (repo/path).read_bytes()==data,'Original resource fixture expectation changed')
 target=a.output.with_name('resource-original-baseline-'+size+'30.json')
 with target.open('xb') as f:f.write(data)
 original_fixtures[size]=loads(data)['fixture'];original_fixture_inputs.append(dict(path=target.name,bytes=len(data),sha256=sha(data),gitCommit='67bef6a08f63a737d64d5bab0c8a17e3364bbc0a',originalPath=path))
require(sequence['status']=='completed' and sequence['product']==candidate['build_info'],'Incomplete/different serial resource sequence')
previous=None
for step in sequence['steps']:
 require(step['status']=='completed' and (previous is None or datetime.fromisoformat(step['startedAt'])>=previous),'Post-formal operations overlapped or failed');previous=datetime.fromisoformat(step['finishedAt'])
 directory=post/(step['step']+'-execution');command=loads((directory/'command.json').read_bytes());exit=loads((directory/'exit.json').read_bytes());verify_exit(exit)
 require(command['argv']==step['argv'] and command['cwd']==step['cwd'] and datetime.fromisoformat(step['startedAt'])<=datetime.fromisoformat(command['startedAt'])<=datetime.fromisoformat(exit['finishedAt'])<=previous,'Actual dependent command/source interval differs')
require(baseline['commit']=='f40d07afb709b91db1ec439c0a5503682ecab91b','Resource baseline is not merged PR59')
bindings={'baseline':(a.baseline_binding,baseline),'candidate':(a.candidate_binding,candidate)};raws={};proofs=[]
for name,(binding_path,binding) in bindings.items():
 archive=binding_path.with_suffix('.zip').read_bytes()
 # Materialize only already hash-checked snapshot paths into a separate scratch
 # root. Original lock is read from the current checkout; all73 historical
 # contract bytes still must equal its immutable Git blobs.
 from check_phase3 import verify_archive
 rows={r['path']:r for r in binding['source_files']+binding['artifact_files']+binding['original_documents']+[binding['generated_runtime']]};contents=verify_archive(archive,list(rows.values()))
 with tempfile.TemporaryDirectory(prefix='phase3-heap-source-') as directory:
  temporary=Path(directory)
  for path,data in contents.items():
   target=temporary/safe_relative(path);target.parent.mkdir(parents=True,exist_ok=True);target.write_bytes(data)
  verified=snapshot.verify_snapshot(binding,archive,temporary,contract_root=repo)
 require(verified==contents,'Resource Git proof/snapshot mismatch')
 raw_path=post/(name+'-resources/raw.json');raw_bytes=raw_path.read_bytes();raw=loads(raw_bytes);raws[name]=raw
 require(raw['status']=='completed' and raw['errors']==[] and raw['commit']==binding['commit'] and raw['tree']==binding['tree'] and raw['buildInfo']==binding['build_info'] and raw['environment']['physicalDevice'] is False,'Resource source/build/status differs')
 source_by_path={r['path']:r for r in binding['source_files']}
 require(raw['sourceFiles']==[source_by_path[path] for path in sorted(source_by_path) if path.startswith('src/') or path in ('package.json','package-lock.json','vite.config.ts')],'Resource source inventory differs')
 require(len(raw['servedFiles'])==len(binding['artifact_files']) and {'dist/'+r['path']:(r['bytes'],r['sha256']) for r in raw['servedFiles']}=={r['path']:(r['bytes'],r['sha256']) for r in binding['artifact_files']},'Resource served build differs')
 procedure=(post/(name+'-resources/executed-procedure.mjs')).read_bytes();instrumentation=next(r for r in candidate['source_files'] if r['path']=='scripts/acceptance/measure_resources.mjs')
 require(len(procedure)==instrumentation['bytes'] and sha(procedure)==instrumentation['sha256'] and procedure==(repo/instrumentation['path']).read_bytes(),'Resource instrumentation differs')
 measured_repo=post_proof['baseline'] if name=='baseline' else post_proof['recorded_repo']
 actual_command,actual_exit=post_proof['receipts'][name+'-resources']
 verify_resource_provenance(post/(name+'-resources'),raw,procedure,measured_repo,actual_command,actual_exit)
 require([(s['size'],s['sample']) for s in raw['samples']]==[(size,n) for size in ('standard','large') for n in range(3)],'Missing/extra resource samples')
 for sample in raw['samples']:
  size=sample['size'];native=sample['native'];fixture=sample['fixture'];require(sample['status']=='completed' and native['currentHash']==fixture['storedCurrentHash'] and native['revision']=='1' and native['records']==(88003 if size=='large' else 8800),'Resource read-only native content changed')
  expected=original_fixtures[size]
  require(fixture['sha256']==expected['sha256'] and fixture['seed']==expected['seed'] and fixture['counts']==expected['counts'] and fixture['assets']==expected.get('assetHashes',[]) and fixture['assetBytes']==(75497472 if size=='large' else 0),'Resource original fixture differs')
  require(len(native['assets'])==(3 if size=='large' else 0) and all(v['verified'] for v in native['assets']) and [{k:v[k] for k in ('hash','bytes')} for v in native['assets']]==fixture['assets'],'Resource actual material differs')
  require([r['label'] for r in sample['observations']]==['selected-editable-initial','after-ten-filtered-searches','returned-editable'],'Missing resource observation point')
  for point in sample['observations']:
   metrics=point['metrics'];used=metrics['JSHeapUsedSize'];total=metrics['JSHeapTotalSize'];require(isinstance(used,(int,float)) and math.isfinite(used) and 0<used<=total and math.isfinite(total),'Invalid retained heap measurement')
   require(datetime.fromisoformat(raw['startedAt'])<=datetime.fromisoformat(point['at'])<=datetime.fromisoformat(raw['finishedAt']),'Resource point outside actual execution')
 receipt=loads((post/(name+'-resources-execution/exit.json')).read_bytes());verify_exit(receipt)
 proofs.append(dict(name=name,commit=binding['commit'],build=raw['buildInfo'],raw=dict(path=str(raw_path),bytes=len(raw_bytes),sha256=sha(raw_bytes)),sealedFiles=len(contents),originalContracts=73,actualMainRendererObservations=18))
comparison=raws['candidate']['comparison'];baseline_raw=(post/'baseline-resources/raw.json').read_bytes();require(comparison['bytes']==len(baseline_raw) and comparison['sha256']==sha(baseline_raw) and comparison['identicalFixtureAndBrowser'] is True,'Resource baseline comparison differs')
require(raws['baseline']['environment']['browser']==raws['candidate']['environment']['browser'],'Resource browser differs')
shape=lambda raw:[{k:s['fixture'][k] for k in ('seed','sha256','counts','assetBytes','assets')} for s in raw['samples']];require(shape(raws['baseline'])==shape(raws['candidate']),'Resource exact fixtures differ')
summaries=[]
for size in ('standard','large'):
 for label in ('selected-editable-initial','after-ten-filtered-searches','returned-editable'):
  values={name:[next(p['metrics']['JSHeapUsedSize'] for p in s['observations'] if p['label']==label) for s in raw['samples'] if s['size']==size] for name,raw in raws.items()}
  summaries.append(dict(size=size,point=label,unit='bytes',samplesEach=3,observations=values,summary={name:dict(minimum=min(v),median=statistics.median(v),maximum=max(v)) for name,v in values.items()},candidateMedianMinusBaselineBytes=statistics.median(values['candidate'])-statistics.median(values['baseline'])))
result=dict(format='phase3-page-heap-comparison/1',status='verified_supplemental_observation',proofs=proofs,browser=raws['candidate']['environment']['browser'],comparisons=summaries,scope='Main-renderer V8 heap retained after two forced collections at each point, three fresh contexts per original size. No percentile, memory pass threshold, peak/RSS/worker/native/process/device or causal significance claim. Baseline-first fixed order and JIT/GC/host variation remain.')
result['originalFixtureInputs']=original_fixture_inputs
with a.output.open('x') as f:json.dump(result,f,ensure_ascii=False,indent=2);f.write('\n')
print(json.dumps(dict(status=result['status'],products=2,freshContexts=12,retainedMainRendererPoints=36)))
