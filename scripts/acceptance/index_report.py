"""Read every actual Playwright result and attachment without case-count promotion."""
import argparse,base64,hashlib,io,json,re,sys,zipfile
from pathlib import Path,PurePosixPath
sys.path.insert(0,str(Path(__file__).resolve().parents[1]))
from check_phase3 import loads,safe_relative,require
p=argparse.ArgumentParser();p.add_argument('--report',type=Path,required=True);p.add_argument('--recorded-root',required=True);p.add_argument('--retained-root',type=Path,required=True);p.add_argument('--output',type=Path,required=True);p.add_argument('--expected',type=int,required=True);a=p.parse_args()
sha=lambda b:hashlib.sha256(b).hexdigest()
report_bytes=a.report.read_bytes();report=loads(report_bytes)
assert report['stats']['expected']==a.expected and all(report['stats'][k]==0 for k in ('unexpected','flaky','skipped'))
assert report.get('errors',[])==[]
assert report['config']['workers']==1 and all(p['retries']==0 and p['repeatEach']==1 for p in report['config']['projects'])
def nodes(s,parent=()):
 for spec in s.get('specs',[]):
  for test in spec['tests']:yield s,spec,test,parent+(s.get('title',''),)
 for child in s.get('suites',[]):yield from nodes(child,parent+(s.get('title',''),))
def actual(row):
 value=base64.b64decode(row['body'],validate=True) if 'body' in row else None
 if 'path' in row:
  path=PurePosixPath(row['path']);relative=path.relative_to(PurePosixPath(a.recorded_root))
  assert '..' not in relative.parts and not relative.is_absolute()
  data=(a.retained_root/str(relative)).read_bytes()
  if value is not None: assert value==data
  value=data
 assert value is not None,'Missing actual attachment bytes'
 return value
def archive_info(payload,native):
 with zipfile.ZipFile(io.BytesIO(payload)) as z:
  names=z.namelist();require(len(names)==len(set(names)) and z.testzip() is None,'Duplicate member or bad CRC')
  for member in z.infolist():
   safe_relative(member.filename)
   require(not member.is_dir() and (member.external_attr>>16)&0o170000!=0o120000,'Non-file archive member')
  info=dict(members=len(names),crc='passed')
  if native:
   require('manifest.json' in names and 'data/project.json' in names,'Missing native manifest/project')
   manifest=loads(z.read('manifest.json'));info['formatVersion']=manifest.get('formatVersion');rows=manifest.get('files')
   require(isinstance(rows,list) and rows and len(rows)==len({r['path'] for r in rows}) and
           {r['path'] for r in rows}==set(names)-{'manifest.json'},'Incomplete native declared-member inventory')
   checks=[]
   for r in rows:
    safe_relative(r['path'])
    b=z.read(r['path']);checks.append(len(b)==r['byteSize'] and sha(b)==r['sha256'])
   require(all(checks),'Native declared-member bytes/hash mismatch')
   info['allDeclaredFileBytesAndHashesMatch']=all(checks)
  if 'data/project.json' in names:
   project=loads(z.read('data/project.json'));info['project']=dict(projectId=project.get('projectId'),revision=project.get('revision'),entities=len(project.get('entities',[])),relations=len(project.get('relations',[])),history=len(project.get('history',[])))
  return info
tests=[];identities=set();archives=0;outputs=0
for suite in report['suites']:
 for enclosing,spec,test,path in nodes(suite):
  identity=(spec['id'],test['projectName']);assert identity not in identities;identities.add(identity)
  assert test['expectedStatus']=='passed' and test['status']=='expected' and len(test['results'])==1
  result=test['results'][0];assert result['status']=='passed' and result['retry']==0 and not result.get('errors')
  files=[];bodies={};names={}
  for attachment in result.get('attachments',[]):
   payload=actual(attachment);name=attachment['name'];assert name not in names;names[name]=payload
   row=dict(name=name,contentType=attachment['contentType'],bytes=len(payload),sha256=sha(payload),source='inline-body' if 'body' in attachment else attachment['path'])
   if attachment['contentType']=='application/json':
    try:bodies[name]=loads(payload)
    except (UnicodeDecodeError,ValueError):row['declaredJSON']='intentionally-nonparseable-or-invalid-input; no observation inferred'
   if name.endswith('.scenario') or (payload.startswith(b'PK\x03\x04') and name.endswith('.zip')):
    archives+=1
    try:row['archive']=archive_info(payload,name.endswith('.scenario'))
    except (ValueError,KeyError,zipfile.BadZipFile):
     assert name in {'AT-B12-input-'+suffix+'.scenario' for suffix in ('payload-hash','unsupported-reader','unsafe-path','broken-reference')},'Actual positive archive failed structural/member verification: '+name
     row['archive']='malformed-or-nonnative-input; no successful recovery inferred'
   files.append(row)
  for name,metadata in bodies.items():
   if not isinstance(metadata,dict):continue
   if all(k in metadata for k in ('fileName','fileSHA256','fileBytes')):
    b=names[metadata['fileName']];assert sha(b)==metadata['fileSHA256'] and len(b)==metadata['fileBytes'];outputs+=1
   if name.endswith('-given.json') and 'fixtureSha256' in metadata:
    b=names[name.removesuffix('.json')+'.scenario'];assert sha(b)==metadata['fixtureSha256'] and len(b)==metadata['fixtureBytes']
  for name,payload in names.items():
   if name.startswith('AT-B12-input-'):
    rejected=bodies['AT-B12-rejected-'+name.removeprefix('AT-B12-input-')+'.json']
    assert rejected['archiveSha256']==sha(payload) and rejected['visibleReason'] and rejected['unchangedAuthorRecords'] is True and rejected['unchangedAssetBytes'] is True
  for file in files:
   if file['name'].startswith('complete-backup-') and file['name'].endswith('.scenario'):
    assert file['archive']['allDeclaredFileBytesAndHashesMatch'],'Complete output contains a changed declared member'
  tests.append(dict(testId=spec['id'],engine=test['projectName'],file=spec.get('file',enclosing.get('file')),line=spec.get('line'),title=spec['title'],suite=path,durationMs=result['duration'],caseIds=sorted(set('AT-'+x for x in re.findall(r'(?<![A-Za-z0-9])(?:AT-)?([BFNE]\d{2})(?!\d)',spec['title']))),attachments=files,observations=bodies))
assert len(tests)==a.expected
output=dict(format='phase3-observed-report-index/1',report=dict(path=str(a.report),bytes=len(report_bytes),sha256=sha(report_bytes)),stats=report['stats'],scope='All actual tests/results/retries and all attachment bytes read. Valid complete output hashes and descriptor pairs checked. This index is not automatic four-clause acceptance or physical/live-service certification.',actualArchivesRead=archives,actualOutputDescriptorPairs=outputs,tests=tests)
with a.output.open('x') as f:json.dump(output,f,ensure_ascii=False,indent=2);f.write('\n')
print(json.dumps(dict(tests=len(tests),actualArchivesRead=archives,actualOutputDescriptorPairs=outputs,attachmentFiles=sum(len(t['attachments']) for t in tests))))
