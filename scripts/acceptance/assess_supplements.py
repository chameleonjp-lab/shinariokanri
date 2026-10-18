"""Assess fresh original-given regressions and actual N05 download bytes."""
import argparse,base64,hashlib,io,json,os,re,shutil,subprocess,sys,zipfile
from datetime import datetime,timedelta
from pathlib import Path
p=argparse.ArgumentParser();p.add_argument('--repository',type=Path,required=True);p.add_argument('--post',type=Path,required=True);p.add_argument('--binding',type=Path,required=True);p.add_argument('--index-procedure',type=Path,required=True);p.add_argument('--historical',type=Path);p.add_argument('--output',type=Path,required=True);a=p.parse_args()
repo=a.repository.resolve();post=a.post.resolve();out=a.output.resolve();out.mkdir(exist_ok=False)
sys.path.insert(0,str(repo/'scripts'));from check_phase3 import loads,verify_exit,require
from phase3_post_procedures import verify_post,verify_supplement_inputs,verify_n05_observation,verify_n05_downloads,N05_CURRENT_STORES
sha=lambda b:hashlib.sha256(b).hexdigest();binding=loads(a.binding.read_bytes());product=binding['build_info']
post_proof=verify_post(repo,post,a.binding,a.historical);verify_supplement_inputs(repo,post,binding,post_proof)
sequence=loads((post/'sequence.json').read_bytes());require(sequence['status']=='completed' and sequence['product']==product,'Incomplete or different post-formal sequence')
for row in sequence['steps']:
 require(row['status']=='completed','Failed dependent execution')
 receipt=loads((post/(row['step']+'-execution')/'exit.json').read_bytes());verify_exit(receipt)
 log=(post/(row['step']+'-execution/stdout-stderr.log')).read_bytes();require(len(log)==receipt['log']['bytes'] and sha(log)==receipt['log']['sha256'],'Dependent execution log differs')
supp=post/'original-supplements';supp_sequence=loads((supp/'sequence.json').read_bytes());require(supp_sequence['status']=='completed' and supp_sequence['product']==product and supp_sequence['bindingSHA256']==sha(a.binding.read_bytes()),'Original supplement binding differs')
for row in supp_sequence['steps']:
 require(row['status']=='passed' and row['returncode']==0,'Original supplement failed');verify_exit(loads((supp/row['step']/'execution/exit.json').read_bytes()))
require([r['step'] for r in supp_sequence['steps']]==['rg01','rg02-rg03','n05'],'Original supplement inventory differs')
shutil.copyfile(__file__,out/'executed-procedure.py');shutil.copyfile(a.index_procedure,out/'executed-report-index.py');index_procedure=out/'executed-report-index.py';index_bytes=index_procedure.read_bytes()
def actual(attachment,root,recorded_root):
 value=base64.b64decode(attachment['body'],validate=True) if 'body' in attachment else None
 if 'path' in attachment:
  path=Path(attachment['path']);relative=path.relative_to(recorded_root);data=(root/relative).read_bytes()
  if value is not None:require(value==data,'Inline/path attachment differs')
  value=data
 require(value is not None,'Actual supplement attachment missing');return value
def flatten(s):
 for spec in s.get('specs',[]):
  for test in spec['tests']:yield spec,test
 for child in s.get('suites',[]):yield from flatten(child)
def report(directory,name,expected):
 path=directory/'results.json';destination=out/(name+'-index.json');recorded_root=post_proof['recorded_post']/directory.relative_to(post)
 subprocess.run([sys.executable,str(index_procedure),'--report',str(path),'--recorded-root',str(recorded_root),'--retained-root',str(directory),'--output',str(destination),'--expected',str(expected),'--contract-root',str(repo)],check=True,env={**os.environ,'PYTHONPATH':str(repo/'scripts')})
 raw=loads(path.read_bytes());rows=[]
 command=loads((directory/'execution/command.json').read_bytes());receipt=loads((directory/'execution/exit.json').read_bytes());start=datetime.fromisoformat(raw['stats']['startTime']);finish=start+timedelta(milliseconds=raw['stats']['duration'])
 require(datetime.fromisoformat(command['startedAt'])<=start<=finish<=datetime.fromisoformat(receipt['finishedAt']),'Actual supplementary report outside its corresponding child execution')
 for suite in raw['suites']:
  for spec,test in flatten(suite):
   result=test['results'][0];attachments=[(f['name'],actual(f,directory,recorded_root),f['contentType']) for f in result.get('attachments',[])];bodies={name:loads(data) for name,data,kind in attachments if kind=='application/json'}
   zips=[]
   for name,data,kind in attachments:
    if data.startswith(b'PK\x03\x04'):
     with zipfile.ZipFile(io.BytesIO(data)) as zipped:
      if 'data/project.json' in zipped.namelist():zips.append(dict(name=name,bytes=len(data),sha256=sha(data),project=loads(zipped.read('data/project.json'))))
   rows.append(dict(spec=spec,bodies=bodies,zips=zips))
 return rows,dict(path=destination.name,bytes=destination.stat().st_size,sha256=sha(destination.read_bytes()))
rg1,index1=report(supp/'rg01','rg01',1);require(len(rg1)==1,'Missing original RG01 test');r=rg1[0];summary=r['bodies']['supplemental-original-RG01-summary.json'];rows=summary['procedures']
require(summary['originalAssertionsExecutedUnchanged'] is True and summary['wholeOriginalRegressionAcceptance'] is False and summary['physicalDevice']=='not_run' and summary['OSJapaneseComposition'].startswith('not_run'),'RG01 scope changed')
labels=['original-prefix-and-cold','front-deletion','paragraph-split','paragraph-move','move-compensation-undo','paragraph-merge','overlapping-replacement','overlap-cold'];require([x['label'] for x in rows]==labels and len(r['zips'])==8,'Original RG01 checkpoints/output inventory differs')
duration=r['bodies']['unchanged-original-procedure-duration.json'];require(duration['originalProcedureCompleted'] is True and duration['milliseconds']<=30000,'Original RG01 first-procedure limit differs')
for row in rows:
 actual_file=next(v for v in r['zips'] if v['sha256']==row['actualFileSHA256'] and v['bytes']==row['actualFileBytes']);project=actual_file['project']
 require(project['revision']==row['revision'],'RG01 actual revision differs')
 scene=next(e for e in project['entities'] if e['id']==row['sceneId']);require(scene['data']['body']==row['body'],'RG01 actual complete body differs from observation')
 anchors=[e['data'].get('anchor') for e in project['entities'] if e['kind']=='disclosure'];require(row['anchor'] in anchors and project['history'][-1]==row['latestCommand'],'RG01 actual anchor/history differs')
for row in rows[:6]:
 body=row['body'];links=[(block,value) for block in body for value in block.get('links',[])];ruby=[(block,value) for block in body for value in block.get('ruby',[])]
 require(len(links)==len(ruby)==1 and all(block['text'][value['start']:value['end']]=='アオ' for block,value in links+ruby) and ruby[0][1]['text']=='あお','RG01 link/ruby moved to unrelated text')
 anchor=row['anchor'];block=next(b for b in body if b['id']==anchor['blockId']);require(block['text'][anchor['start']:anchor['end']]=='アオ','RG01 disclosure position differs')
require(rows[4]['latestCommand']['compensatesOperationId']==rows[3]['latestCommand']['operationId'],'RG01 compensation differs')
require(rows[2]['body'][0]['id']==rows[3]['body'][1]['id']==rows[4]['body'][0]['id']==rows[5]['body'][0]['id'],'RG01 split/move/undo/merge ID differs')
for row in rows[6:]:
 block=row['body'][0];unresolved=block['unresolvedAnnotations'];require(not block.get('links') and not block.get('ruby') and len(unresolved)==2 and {x['kind'] for x in unresolved}=={'link','ruby'} and all(x['originalText']=='アオ' and x['reason'] for x in unresolved),'RG01 ambiguous edits silently retained different text')
 require(row['anchor']['positionStatus']=='unresolved' and 'start' not in row['anchor'] and 'end' not in row['anchor'],'RG01 uncertain position presented as certain')
require(rows[6]['body']==rows[7]['body'] and rows[6]['anchor']==rows[7]['anchor'],'RG01 cold differs')
rg23,index23=report(supp/'rg02-rg03','rg02-rg03',12);seen2=set();seen3=set();archives=0
original=(supp/'rg02-rg03/executed-inputs/original-runtime-regressions.test.ts').read_bytes();require(len(original)==20734 and sha(original)=='0155a55e0d7c3a82632f2d95d116c0b537afe92787a7936e0ff34e59334d01b3','Original runtime fixture source changed')
source=original.decode();chunks=[source[source.index('function fixture()'):source.index('function foreshadowFixture')],source[source.index('function foreshadowFixture'):source.index('async function savePinned')],source[source.index('function rejectedEffectFixture'):source.index("describe('RG-R03")]];module=(supp/'rg02-rg03/executed-inputs/original-fixtures.ts').read_text();require(all(chunk in module for chunk in chunks),'Original extracted fixture function changed')
for row in rg23:
 bodies=row['bodies'];zips=row['zips'];archives+=len(zips);require(bodies['actual-product.json']['build']==product,'Supplement measured different product')
 if row['spec']['title'].startswith('RG-R02'):
  observed=bodies['RG-R02-actual.json'];given=bodies['RG-R02-given.json'];facts=given['facts'];require(len(zips)==2 and observed['route']==facts['route'] and observed['changes']==facts['changesCondition'],'RG02 original given differs');seen2.add((observed['changes'],observed['route']))
  actual_files=[z for z in zips if z['sha256']==observed['actualCompleteSHA256']];require(len(actual_files)==1,'RG02 observed complete hash does not select one actual file');actual_project=actual_files[0]['project']
  traces=[e for e in actual_project['entities'] if e['kind']=='trace' and e['id']==observed['traceId']];require(len(traces)==1,'RG02 observed trace absent from actual complete file');trace=traces[0]['data']
  checkpoint=next(e['data'] for e in actual_project['entities'] if e['kind']=='checkpoint' and e['id']==trace['startCheckpointId']);snapshot=next(s for s in actual_project['snapshots'] if s['id']==trace['contentVersionId'])
  require(trace['contentVersionId']==observed['sourceVersionId']==observed['finalState']['contentVersionId']==checkpoint['contentVersionId']==snapshot['id'] and trace['contentRevision']==checkpoint['contentRevision']==snapshot['content']['revision'],'RG02 fixed version/checkpoint mismatch')
  steps=trace['steps'];require(len(steps)=={'skip':2,'via':3,'initial':1}[observed['route']] and steps[0]['before']==checkpoint['runtimeState'] and steps[-1]['after']==observed['finalState'] and all(left['after']==right['before'] for left,right in zip(steps,steps[1:])),'RG02 actual complete trace continuity differs')
  terminal=next(e for e in snapshot['content']['entities'] if e['id']==observed['finalState']['presentationPosition']);require(terminal['kind']=='flow_node' and terminal['data']['nodeType']=='terminal','RG02 complete trace did not reach original terminal')
  require(observed['finalState']['variableValues'][facts['canReveal']]==dict(type='boolean',value=not observed['changes']),'RG02 presentation-time evidence differs')
  missing=[f for f in observed['findings'] if f['code']=='REQUIRED_INFO_MISSING' and f.get('payoffId')==facts['payoff']]
  require(not missing if observed['route']=='via' else len(missing)==1 and missing[0]['status']=='candidate' and missing[0]['targetId']==facts['question'] and missing[0]['missingInfoIds']==[facts['clue']],'RG02 missing-clue witness differs')
 else:
  observed=bodies['RG-R03-actual.json'];given=bodies['RG-R03-given.json'];require(len(zips)==3 and observed['beforeVisible']==observed['afterVisible'] and observed['beforeHeading']==observed['afterHeading'],'RG03 failed effect changed state');seen3.add((observed['policy'],observed['mixed']))
  facts=given['facts'];require(observed['policy']==facts['policy'] and observed['mixed']==facts['mixed'],'RG03 observed policy/mixed differs from original given')
  outputs=[z for z in zips if not z['name'].endswith('-given.scenario')];actual_files=[z for z in outputs if z['sha256']==observed['actualCompleteSHA256']];require(len(outputs)==2 and actual_files and outputs[0]['project']==outputs[1]['project'],'RG03 observed complete/native baseline differs')
  actual_project=actual_files[0]['project']
  require('REFERENCE_INVALID' in observed['error'] and '不採用' in observed['error'] and observed['authorNativeUnchanged'] and observed['failedOperationNotAddedToHistory'],'RG03 refusal/history/native boundary differs')
 given_zip=next(z for z in zips if z['name'].endswith('-given.scenario'));require(given_zip['bytes']==given['fixtureBytes'] and given_zip['sha256']==given['fixtureSha256'],'Supplement actual fixture descriptor differs')
 require(given_zip['project']['projectId']==actual_project['projectId'],'RG02/03 actual output belongs to a different given project')
 for entity in given_zip['project']['entities']:
  require(next((e for e in actual_project['entities'] if e['id']==entity['id']),None)==entity,'RG02/03 original fixture author entity changed')
 require(actual_project['relations']==given_zip['project']['relations'],'RG02/03 original given relation differs')
require(seen2=={(change,route) for change in (False,True) for route in ('skip','via','initial')} and seen3=={(policy,mixed) for policy in ('manual_choice','first_match','all_match') for mixed in (False,True)} and archives==30,'Original 6+6 given combinations or 30 actual native files missing')
capture=post/'n05-actual-downloads';capture_plan=loads((capture/'sequence.json').read_bytes());require(capture_plan['status']=='completed' and capture_plan['product']==product and capture_plan['bindingSHA256']==sha(a.binding.read_bytes()),'N05 actual-download candidate differs')
verify_exit(loads((capture/'execution/exit.json').read_bytes()));n05,index5=report(capture,'n05-actual-downloads',1);first,index5first=report(supp/'n05','n05-original-report',1)
metadata_bytes=post_proof['sealed']('tests/fixtures/rb10-large-analysis/metadata.json');metadata=loads(metadata_bytes);fixture=post_proof['sealed']('tests/fixtures/rb10-large-analysis/'+metadata['archive'])
require(len(fixture)==metadata['bytes']==1914098 and sha(fixture)==metadata['sha256']=='1ca2b19dcf4c8464c68a24a1bbe02cd1b1c4be20187ed2cee99d4e541822d0d0','N05 original fixed input bytes differ')
with zipfile.ZipFile(io.BytesIO(fixture)) as archive:
 manifest=loads(archive.read('manifest.json'));require(archive.testzip() is None and len(archive.namelist())==len(set(archive.namelist())) and set(archive.namelist())=={'manifest.json'}|{r['path'] for r in manifest['files']},'N05 original complete input inventory/CRC differs')
 assets=[]
 for row in manifest['files']:
  payload=archive.read(row['path']);require(len(payload)==row['byteSize'] and sha(payload)==row['sha256'],'N05 original input expanded bytes/hash differs')
  if row['role']=='asset':assets.append(dict(path=row['path'],bytes=len(payload),sha256=sha(payload)))
 project=loads(archive.read('data/project.json'));require(project['projectId']==metadata['projectId'] and len(project['entities'])+len(project['relations'])==metadata['totalRecords']==88522,'N05 actual fixed input record inventory differs')
 require(manifest['assetMode']=='embedded' and len(assets)==3 and all(r['bytes']==25165824 for r in assets) and sum(r['bytes'] for r in assets)==metadata['actualAssetBytes']==75497472,'N05 actual original material bytes differ')
expected_stores=N05_CURRENT_STORES
for record in (first[0],n05[0]):
 verify_n05_observation(record['bodies']['original-large-analysis-result'],metadata)
observed=n05[0]['bodies']['original-large-analysis-result']
timing=observed['timing'];require(0<timing['firstPaintAt']-timing['startedAt']<=2000 and timing['largestTimerGap']<=2000 and observed['progress'],'N05 original responsiveness differs')
result=observed['result'];require(result['status']=='unknown' and result['truncated'] is True and result['limits']==dict(maxStates=100000,maxTransitions=10000,maxMs=30000),'N05 stopped exploration treated as safety proof')
downloads=loads((capture/'actual-downloads.json').read_bytes());capture_command=loads((capture/'execution/command.json').read_bytes());capture_exit=loads((capture/'execution/exit.json').read_bytes());retained=verify_n05_downloads(downloads,capture,post_proof['recorded_post']/'n05-actual-downloads',result,capture_command,capture_exit)
require(index_procedure.read_bytes()==index_bytes,'Executed supplement reader changed')
output=dict(format='phase3-original-supplement-assessment/1',product=product,status='passed_nonphysical_original_conditions',rg01=dict(checkpoints=labels,actualCompleteFiles=8,originalFirstProcedureMs=duration['milliseconds'],physicalIME='not_run'),rg02=dict(originalGivenCombinations=6),rg03=dict(originalGivenCombinations=6,actualCombinedNativeFiles=30,sharedAuthorFingerprintScope='six canonical tables; does not imply an all-native raw snapshot'),n05=dict(originalFixtureSHA256='1ca2b19dcf4c8464c68a24a1bbe02cd1b1c4be20187ed2cee99d4e541822d0d0',originalBaseRecords=88003,nativeRecordsIncludingOriginalDeclarations=88522,actualAssetBytes=75497472,actualDownloads=retained,allNativeTablesUnchanged=len(observed['nativeBefore']),timing=timing,resultStatus=result['status'],fullObservation='n05-actual-downloads-index.json'),indices=[index1,index23,index5,index5first],scope='Fresh actual same-candidate original procedures and files. RG01 real OS IME, physical/live acceptance and original release gates remain separate.')
output['n05']['fixedMetadata']=dict(bytes=len(metadata_bytes),sha256=sha(metadata_bytes),value=metadata);output['n05']['actualInputArchive']=dict(bytes=len(fixture),sha256=sha(fixture),expandedAssets=assets);output['n05']['nativeInventory']=sorted(expected_stores);output['n05']['nativeVersionScope']='Original fingerprint has no db.version field; 29 current-schema store names verified, no independently observed N05 native-version claim.'
(out/'ASSESSMENT.json').write_text(json.dumps(output,ensure_ascii=False,indent=2)+'\n');print(json.dumps(dict(status=output['status'],rg01ActualFiles=8,rg02And3ActualFiles=30,n05ActualDownloads=2)))
