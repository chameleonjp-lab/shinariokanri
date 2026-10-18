"""Retain GitHub's actual CI archives/logs and independently check their contents."""
import argparse,base64,hashlib,io,json,os,re,subprocess,sys,zipfile
from datetime import datetime,timezone
from pathlib import Path,PurePosixPath
p=argparse.ArgumentParser();p.add_argument('--repository',default='chameleonjp-lab/shinariokanri');p.add_argument('--run',required=True);p.add_argument('--head',required=True);p.add_argument('--checkout',type=Path,required=True);p.add_argument('--output',type=Path,required=True);p.add_argument('--index-procedure',type=Path);p.add_argument('--provider-cache',type=Path);p.add_argument('--offline-retention',type=Path);p.add_argument('--candidate-binding',type=Path);a=p.parse_args()
repo=a.checkout.resolve();output=a.output.resolve();output.mkdir(parents=True,exist_ok=False)
sys.path.insert(0,str(repo/'scripts'));sys.path.insert(0,str(repo/'scripts/ci'))
from check_phase3 import safe_relative,loads,require
from ci_controls import validate_results
from verify_recovery_artifacts import archive_files
sha=lambda b:hashlib.sha256(b).hexdigest()
procedure_bytes=Path(__file__).read_bytes();(output/'executed-retention.py').write_bytes(procedure_bytes)
def api(suffix):
 if a.offline_retention:
  mapping={'actions/runs/'+a.run:'run.json','actions/runs/'+a.run+'/jobs?per_page=100':'jobs.json','actions/runs/'+a.run+'/artifacts?per_page=100':'artifacts.json'}
  name='merge-commit.json' if suffix.startswith('git/commits/') else mapping[suffix]
  return (a.offline_retention/'provider'/name).read_bytes()
 result=subprocess.run(['gh','api',f'repos/{a.repository}/'+suffix],capture_output=True)
 require(result.returncode==0,'GitHub metadata request failed (redirect/error details withheld)')
 return result.stdout
def retain(name,b):
 target=output/name;target.parent.mkdir(parents=True,exist_ok=True)
 with target.open('xb') as f:f.write(b)
 return dict(path=name,bytes=len(b),sha256=sha(b))
run_bytes=api('actions/runs/'+a.run);run=loads(run_bytes);retain('provider/run.json',run_bytes)
require(run['status']=='completed' and run['head_sha']==a.head and run['event']=='pull_request','Run is incomplete or belongs to another candidate')
jobs_bytes=api('actions/runs/'+a.run+'/jobs?per_page=100');jobs=loads(jobs_bytes)['jobs'];retain('provider/jobs.json',jobs_bytes)
artifact_bytes=api('actions/runs/'+a.run+'/artifacts?per_page=100');artifacts=loads(artifact_bytes)['artifacts'];retain('provider/artifacts.json',artifact_bytes)
receipts=[];members={};extracted=output/'extracted'
for artifact in artifacts:
 require(not artifact['expired'],'Provider artifact expired')
 name=artifact['name'];safe_relative(name)
 raw=((a.offline_retention/'archives' if a.offline_retention else a.provider_cache)/(name+'.zip')).read_bytes()
 require(artifact['digest']=='sha256:'+sha(raw),'Provider artifact ZIP digest mismatch')
 receipt=retain('archives/'+name+'.zip',raw);receipt.update(providerId=artifact['id'],providerDigest=artifact['digest'],providerSize=artifact['size_in_bytes'],name=name)
 with zipfile.ZipFile(io.BytesIO(raw)) as archive:
  require(archive.testzip() is None,'Provider archive CRC mismatch')
  require(len(archive.namelist())==len(set(archive.namelist())),'Duplicate provider member')
  files={}
  for member in archive.infolist():
   if member.is_dir():continue
   safe_relative(member.filename);require((member.external_attr>>16)&0o170000!=0o120000,'Provider symlink')
   payload=archive.read(member);path=extracted/name/member.filename;path.parent.mkdir(parents=True,exist_ok=True)
   with path.open('xb') as f:f.write(payload)
   files[member.filename]=dict(bytes=len(payload),sha256=sha(payload))
  members[name]=files;receipt['files']=files
 receipts.append(receipt)
logs={};log_descriptors=[]
for job in jobs:
 if a.offline_retention:
  prior=loads((a.offline_retention/'RETENTION.json').read_bytes());record=next(r for r in prior['logs'] if r['id']==job['id']);safe_relative(record['path']);log=(a.offline_retention/record['path']).read_bytes()
  require(len(log)==record['bytes'] and sha(log)==record['sha256'],'Retained actual log differs')
 else:log=(a.provider_cache/('job-'+str(job['id'])+'.log')).read_bytes()
 logs[job['name']]=log
 name=re.sub('[^a-z0-9-]+','-',job['name'].lower()).strip('-')
 row=retain(f'logs/{job["id"]}-{name}.log',log);row.update(job=job['name'],id=job['id'],conclusion=job['conclusion'],transport='GitHub connector decoded log text, retained as UTF-8; not a byte-identical HTTP response assertion');log_descriptors.append(row)
result=dict(format='phase3-provider-ci-retention/1',recordedAt=datetime.now(timezone.utc).isoformat(),runId=a.run,head=a.head,providerConclusion=run['conclusion'],attempt=run['run_attempt'],artifacts=receipts,logs=log_descriptors)
result['providerScope']='Offline verification of pinned original provider outputs and all actual ZIP/log bytes; no new remote-status query' if a.offline_retention else 'Actual provider metadata queried; connector-downloaded original ZIPs are checked against the provider digests'
result['retentionProcedure']=dict(path='executed-retention.py',bytes=len(procedure_bytes),sha256=sha(procedure_bytes))
index_procedure=a.index_procedure.resolve() if a.index_procedure else repo/'scripts/acceptance/index_report.py'
result['indexProcedure']=retain('executed-report-index.py',index_procedure.read_bytes())
index_procedure=output/'executed-report-index.py';index_procedure_bytes=index_procedure.read_bytes()
(output/'RETENTION.json').write_text(json.dumps(result,indent=2)+'\n')
require(run['conclusion']=='success','Actual workflow failed; every available artifact/log retained')
require(len(jobs)==7 and {j['name'] for j in jobs}=={'scope','documents','unit','browser (chromium)','browser (firefox)','browser (webkit)','verify'} and all(j['conclusion']=='success' for j in jobs),'Missing or unsuccessful required job')
attempt=run['run_attempt'];require(attempt==1,'Preserve and separately adjudicate every earlier failed attempt before accepting a retry')
expected={'browser-evidence'}|{f'browser-evidence-{engine}-attempt{attempt}' for engine in ('chromium','firefox','webkit')}
require(set(members)==expected,'Missing/extra provider artifact inventory')
aggregate=members['browser-evidence']
for name in expected-{'browser-evidence'}:
 subset={path.removeprefix(name+'/'):row for path,row in aggregate.items() if path.startswith(name+'/')}
 require(subset==members[name],'Aggregate differs from original engine artifact bytes')
scope=logs['scope'].decode();product=re.findall(r'run_product=(true|false)\s*$',scope,re.M);reason=re.findall(r'reason=([a-z-]+)\s*$',scope,re.M)
require(product and reason,'Actual scope outputs missing from provider log')
needs={name:dict(result='success') for name in ('scope','documents','unit','browser')};needs['scope']['outputs']=dict(run_product=product[-1],reason=reason[-1])
sources=[];indices=[];recovery=[]
for engine in ('chromium','firefox','webkit'):
 directory=extracted/f'browser-evidence-{engine}-attempt{attempt}';root=directory/'ci-browser-evidence'
 source=loads((root/'source.json').read_bytes());require(source['pr_head']==a.head,'Browser belongs to another PR head');sources.append(source)
 report=loads((root/'results.json').read_bytes());recorded=PurePosixPath(report['config']['rootDir']).parents[1]
 index=output/('case-index-'+engine+'.json')
 subprocess.run([sys.executable,str(index_procedure),'--report',str(root/'results.json'),'--recorded-root',str(recorded),'--retained-root',str(directory),'--output',str(index),'--expected',str(report['stats']['expected']),'--contract-root',str(repo)],check=True,cwd=repo,env={**os.environ,'PYTHONPATH':str(repo/'scripts')})
 indices.append(dict(path=index.name,bytes=index.stat().st_size,sha256=sha(index.read_bytes())))
 originals=archive_files(report,engine);manifest=loads((root/'recovery-originals/manifest.json').read_bytes())
 require(manifest['source']==source and len(manifest['files'])==4,'Recovery original source/inventory differs')
 for name,data in originals:
  row=next(r for r in manifest['files'] if r['path']==name)
  require(len(data)==row['bytes'] and sha(data)==row['sha256'] and (root/'recovery-originals'/name).read_bytes()==data,'Recovered original byte mismatch')
 recovery.append(dict(engine=engine,actualOriginals=4))
require(len({s['commit'] for s in sources})==1 and len({s['tree'] for s in sources})==1,'Mixed CI source')
merge=loads(api('git/commits/'+sources[0]['commit']));retain('provider/merge-commit.json',json.dumps(merge,indent=2).encode()+b'\n')
require(merge['tree']['sha']==sources[0]['tree'] and a.head in {p['sha'] for p in merge['parents']},'CI merge object does not bind candidate/tree')
if a.candidate_binding:
 candidate_bytes=a.candidate_binding.read_bytes();candidate=loads(candidate_bytes)
 require(candidate['commit']==a.head and candidate['tree']==sources[0]['tree'],'CI merge contents differ from the measured clean candidate tree')
 result['sameMeasuredCandidateTree']=dict(commit=candidate['commit'],tree=candidate['tree'],bindingSHA256=sha(candidate_bytes))
validated=validate_results(needs,extracted,sources[0]['commit'],str(run['id']),attempt)
require(index_procedure.read_bytes()==index_procedure_bytes,'Executed report procedure changed during indexing')
require(Path(__file__).read_bytes()==procedure_bytes,'Retention procedure changed during execution')
result.update(status='passed',source=sources[0],independentCI=validated,caseIndices=indices,recoveryOriginals=recovery,aggregateEqualsEveryOriginalEngineFile=True)
(output/'RETENTION.json').write_text(json.dumps(result,indent=2)+'\n')
print(json.dumps(dict(run=a.run,head=a.head,requiredJobs=7,providerArchives=len(receipts),recoveryOriginals=12,actualAttachmentIndex='all complete')))
