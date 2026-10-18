"""Read actual complete CI unit and supplementary executions; no clause promotion."""
import argparse,hashlib,json,re,subprocess
from datetime import datetime
from pathlib import Path
p=argparse.ArgumentParser();p.add_argument('--repository',type=Path,required=True);p.add_argument('--retention',type=Path,required=True);p.add_argument('--output',type=Path,required=True);a=p.parse_args()
repo=a.repository.resolve();root=a.retention.resolve();sha=lambda b:hashlib.sha256(b).hexdigest()
retention=json.loads((root/'RETENTION.json').read_bytes());assert retention['status']=='passed'
jobs=json.loads((root/'provider/jobs.json').read_bytes())['jobs'];logs={}
def descriptor(path):
 data=path.read_bytes();return dict(path=str(path.relative_to(root)),bytes=len(data),sha256=sha(data))
for record in retention['logs']:
 path=root/record['path'];data=path.read_bytes();assert len(data)==record['bytes'] and sha(data)==record['sha256']
 logs[record['job']]=re.sub(r'\x1b\[[0-9;]*m','',data.decode()).splitlines()
unit=[]
for line_number,line in enumerate(logs['unit'],1):
 match=re.search(r'✓\s+((?:src|tests)/\S+)\s+\(\s*(\d+) tests?\s*\)',line)
 if match:
  path,count=match[1],int(match[2]);data=(repo/path).read_bytes()
  unit.append(dict(path=path,passedTests=count,actualDecodedLogLine=line_number,actualLine=line,sourceBytes=len(data),sourceSHA256=sha(data),sourceGitBlob=hashlib.sha1(b'blob '+str(len(data)).encode()+b'\0'+data).hexdigest()))
expected=set(subprocess.check_output(['git','ls-files','--','src','tests'],cwd=repo,text=True).splitlines());expected={x for x in expected if x.endswith('.test.ts') and not x.startswith('tests/e2e/')}
assert len(unit)==len({r['path'] for r in unit}) and {r['path'] for r in unit}==expected,'Actual unit execution omitted/repeated a current original test file'
unit_text='\n'.join(logs['unit']);assert re.search(r'Test Files\s+'+str(len(unit))+r' passed \('+str(len(unit))+r'\)',unit_text)
assert re.search(r'Tests\s+'+str(sum(r['passedTests'] for r in unit))+r' passed \('+str(sum(r['passedTests'] for r in unit))+r'\)',unit_text)
assert 'vitest run --maxWorkers=1 --fileParallelism=false' in unit_text
supplements=[]
for engine in ('chromium','firefox','webkit'):
 name='browser ('+engine+')';text='\n'.join(logs[name]);directory=root/'extracted'/f'browser-evidence-{engine}-attempt1'
 runner=json.loads((directory/'test-results/rb03-components/runner.json').read_bytes());assert runner['engines']==[engine] and len(runner['results'])==3 and all(r['exitCode']==0 for r in runner['results'])
 observations=[]
 for kind in ('regressions','timeline','world'):
  path=directory/f'test-results/rb03-components/{kind}-{engine}.json';data=json.loads(path.read_bytes())
  if kind=='world':assert len(data['results'])==1 and data['results'][0]['engine']==engine and data['results'][0]['errors']==[]
  else:assert data['engine']==engine and data['errors']==[]
  observations.append(dict(**descriptor(path),actual=data))
 assert f'RB03 {engine}: 5 component regression groups passed.' in text and f'RB03 {engine} timeline smoke passed' in text and f'RB03 {engine} world smoke passed' in text
 rb04=[]
 for number,line in enumerate(logs[name],1):
  match=re.search(r'(\{"engine":"'+engine+r'","checksPassed":\d+,.+\})',line)
  if match:
   value=json.loads(match[1]);assert value['checksPassed']==12;rb04.append(dict(actualDecodedLogLine=number,actualLine=line,actual=value))
 assert len(rb04)==1
 if engine=='chromium':assert re.search(r'1 passed \([^\n]+\)',text) and 'tests/rb10/playwright.config.ts' in text
 if engine!='firefox':assert re.search(r'4 passed \([^\n]+\)',text) and 'tests/rb04/playwright.config.ts' in text
 job=next(j for j in jobs if j['name']==name);steps=[dict(name=s['name'],number=s['number'],conclusion=s['conclusion'],seconds=(datetime.fromisoformat(s['completed_at'])-datetime.fromisoformat(s['started_at'])).total_seconds() if s.get('completed_at') and s.get('started_at') else None) for s in job['steps']]
 supplements.append(dict(engine=engine,rb03=observations,rb04=rb04,rb10OriginalLarge='passed original one test on chromium' if engine=='chromium' else 'not selected by original workflow',rb04Writing='passed original four tests' if engine!='firefox' else 'not selected by original workflow',providerSteps=steps))
output=dict(format='phase3-actual-ci-log-index/1',runId=retention['runId'],head=retention['head'],source=retention['source'],unit=dict(files=len(unit),tests=sum(r['passedTests'] for r in unit),rows=unit),supplements=supplements,scope='Every original current Vitest file matched to a real passing decoded log line; original RB03 JSON and RB04 actual log record read. Source hashes describe the checked-out unchanged test bytes; CI source commit/tree and provider job steps are separately retained. No physical/live or four-clause acceptance is inferred.')
with a.output.open('x') as f:json.dump(output,f,ensure_ascii=False,indent=2);f.write('\n')
print(json.dumps(dict(unitFiles=output['unit']['files'],unitTests=output['unit']['tests'],engines=3,rb03Each=7,rb04Each=12,rb04WritingEngines=2,rb10OriginalLargeTests=1)))
