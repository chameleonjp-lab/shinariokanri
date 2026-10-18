"""Read every actual Playwright result and attachment without case-count promotion."""
import argparse,base64,hashlib,io,json,re,sys,zipfile
from datetime import datetime
from pathlib import Path,PurePosixPath
sys.path.insert(0,str(Path(__file__).resolve().parents[1]))
from check_phase3 import loads,safe_relative,require
p=argparse.ArgumentParser();p.add_argument('--report',type=Path,required=True);p.add_argument('--recorded-root',required=True);p.add_argument('--retained-root',type=Path,required=True);p.add_argument('--output',type=Path,required=True);p.add_argument('--expected',type=int,required=True);p.add_argument('--contract-root',type=Path,default=Path(__file__).resolve().parents[2]);a=p.parse_args()
sha=lambda b:hashlib.sha256(b).hexdigest()
report_bytes=a.report.read_bytes();report=loads(report_bytes)
negative_manifest=loads((a.contract_root/'tests/fixtures/rb10-import-errors/MANIFEST.json').read_bytes())
pinned_negatives={r['path']:r for r in negative_manifest['negative']}
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
  manifest=loads(z.read('manifest.json')) if 'manifest.json' in names else None
  native=native or 'data/project.json' in names or isinstance(manifest,dict) and manifest.get('format')=='scenario-package'
  info['kind']='native-scenario' if native else 'generic-zip'
  if native:
   require('manifest.json' in names and 'data/project.json' in names,'Missing native manifest/project')
   require(isinstance(manifest,dict) and manifest.get('format')=='scenario-package' and manifest.get('formatVersion')=='1.0.0','Unsupported positive native format/version')
   minimum=manifest.get('minimumReaderVersion')
   require(isinstance(minimum,str) and re.fullmatch(r'(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)',minimum) is not None and tuple(map(int,minimum.split('.')))<=(1,0,0),'Unsupported positive minimum reader')
   features=manifest.get('requiredFeatures',[])
   require(isinstance(features,list) and all(isinstance(feature,str) and feature in {'portable-recovery-v1','native-sync-recovery-v1','shared-review-source-v1','shared-records-v1','shared-record-deltas-v1','shared-calendar-records-v1'} for feature in features),'Unknown positive native required feature')
   uuid=r'[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}'
   require(all(isinstance(manifest.get(key),str) and re.fullmatch(uuid,manifest[key]) for key in ('projectId','snapshotId')),'Invalid positive native identity')
   exported=manifest.get('exportedAt');require(isinstance(exported,str) and re.fullmatch(r'[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}(?:\.[0-9]+)?Z',exported) is not None,'Invalid positive calendar-date export timestamp');datetime.fromisoformat(exported)
   require(manifest.get('assetMode') in ('embedded','metadata_only'),'Invalid positive asset mode')
   info.update(format=manifest['format'],formatVersion=manifest['formatVersion'],minimumReaderVersion=minimum,requiredFeatures=features,originalManifestHeaderCompatible=True,assetMode=manifest['assetMode'],completeEmbeddedAssetMode=manifest['assetMode']=='embedded');rows=manifest.get('files')
   require(isinstance(rows,list) and rows and len(rows)==len({r['path'] for r in rows}) and
           {r['path'] for r in rows}==set(names)-{'manifest.json'},'Incomplete native declared-member inventory')
   for feature,member in (('shared-records-v1','data/records.json'),('portable-recovery-v1','data/recovery.json'),('native-sync-recovery-v1','data/sync-recovery.json')):
    require((feature in features)==(member in names),'Native required feature/member mismatch: '+feature)
   require('shared-records-v1' in features or not {'shared-record-deltas-v1','shared-calendar-records-v1'}.intersection(features),'Native dictionary subfeature requires shared-records-v1')
   checks=[]
   for r in rows:
    safe_relative(r['path'])
    require(re.fullmatch(r'(?:data/(?:project|recovery|sync-recovery|records)\.json|worlds/[0-9a-f-]{36}\.json|assets/[0-9a-f]{64}\.[a-z0-9]{1,8})',r['path']) is not None,'Unsupported positive native declared path')
    expected_role={'data/project.json':'project','data/recovery.json':'recovery','data/sync-recovery.json':'sync_recovery','data/records.json':'record_dictionary'}.get(r['path'],'world' if r['path'].startswith('worlds/') else 'asset')
    require(r.get('role')==expected_role and type(r.get('byteSize')) is int and 0<=r['byteSize']<=9007199254740991 and isinstance(r.get('sha256'),str) and re.fullmatch(r'[0-9a-f]{64}',r['sha256']) is not None,'Invalid positive native file descriptor')
    b=z.read(r['path']);checks.append(len(b)==r['byteSize'] and sha(b)==r['sha256'])
   require(all(checks),'Native declared-member bytes/hash mismatch')
   info['allDeclaredFileBytesAndHashesMatch']=all(checks)
  if 'data/project.json' in names:
   project=loads(z.read('data/project.json'))
   dictionary=native and 'shared-records-v1' in manifest.get('requiredFeatures',[])
   if dictionary:
    require('data/records.json' in names and isinstance(project,dict) and set(project)=={'version','value','arrays','records'} and project['version']==1 and isinstance(project['arrays'],list) and isinstance(project['records'],list),'Invalid declared dictionary envelope')
    project=project['value']
   if native:require(isinstance(project,dict) and project.get('projectId')==manifest['projectId'] and project.get('formatVersion')=='1.0.0','Positive native project/manifest identity or version mismatch')
   info['project']=dict(projectId=project.get('projectId'),revision=project.get('revision'),entities=len(project['entities']) if isinstance(project.get('entities'),list) else None,relations=len(project['relations']) if isinstance(project.get('relations'),list) else None,history=len(project['history']) if isinstance(project.get('history'),list) else None,encoding='shared-records-v1; header unwrapped, full semantic decoding belongs to the original application assertions' if dictionary else 'plain-project-json')
  return info
tests=[];identities=set();archives=0;outputs=0
for suite in report['suites']:
 for enclosing,spec,test,path in nodes(suite):
  identity=(spec['id'],test['projectName']);assert identity not in identities;identities.add(identity)
  assert test['expectedStatus']=='passed' and test['status']=='expected' and len(test['results'])==1
  result=test['results'][0];assert result['status']=='passed' and result['retry']==0 and not result.get('errors')
  files=[];bodies={};names={};observation_records=[];observed_pinned_negatives=set()
  for ordinal,attachment in enumerate(result.get('attachments',[])):
   payload=actual(attachment);name=attachment['name'];names.setdefault(name,[]).append((ordinal,payload))
   row=dict(ordinal=ordinal,name=name,occurrence=len(names[name]),contentType=attachment['contentType'],bytes=len(payload),sha256=sha(payload),source='inline-body' if 'body' in attachment else attachment['path'])
   if attachment['contentType']=='application/json':
    try:
     value=loads(payload);bodies.setdefault(name,[]).append(value)
     observation_records.append(dict(attachmentOrdinal=ordinal,name=name,valueIndex=len(bodies[name])-1,value=value))
    except (UnicodeDecodeError,ValueError):row['declaredJSON']='intentionally-nonparseable-or-invalid-input; no observation inferred'
   if name.endswith(('.scenario','.zip')) or payload[:4] in (b'PK\x03\x04',b'PK\x05\x06',b'PK\x07\x08'):
    fixture_match=re.fullmatch(r'filesystem-read-[0-9]{3}-(.+\.scenario)',name)
    pinned=fixture_match.group(1) if fixture_match else None
    original_negative=spec['title'].startswith('AT-N09 ') and pinned in pinned_negatives
    dynamic_negative=spec['title'].startswith('AT-B12 ') and name in {'AT-B12-input-'+suffix+'.scenario' for suffix in ('payload-hash','unsupported-reader','unsafe-path','broken-reference')}
    if dynamic_negative:row['role']='original-dynamic-rejected-input'
    if original_negative:
     contract=pinned_negatives[pinned]
     assert len(payload)==contract['bytes'] and sha(payload)==contract['sha256'],'Original negative fixture differs'
     observed_pinned_negatives.add(pinned);row['role']='unchanged-original-negative-fixture'
     row['originalRejectionContract']=contract
    archives+=1
    try:row['archive']=archive_info(payload,name.endswith('.scenario'))
    except (ValueError,KeyError,zipfile.BadZipFile):
     assert original_negative or dynamic_negative,'Actual positive archive failed structural/member verification: '+name
     row['archive']='malformed-or-nonnative-input; no successful recovery inferred'
   files.append(row)
  def matching(name,digest,size):
   matches=[ordinal for ordinal,data in names[name] if sha(data)==digest and len(data)==size]
   assert matches,'No actual attachment matches descriptor bytes/hash: '+name
   return matches
  for observation in observation_records:
   name=observation['name'];metadata=observation['value']
   if not isinstance(metadata,dict):continue
   if all(k in metadata for k in ('fileName','fileSHA256','fileBytes')):
    observation['matchesAttachmentOrdinals']=matching(metadata['fileName'],metadata['fileSHA256'],metadata['fileBytes']);outputs+=1
   if name.endswith('-given.json') and 'fixtureSha256' in metadata:
    observation['matchesAttachmentOrdinals']=matching(name.removesuffix('.json')+'.scenario',metadata['fixtureSha256'],metadata['fixtureBytes'])
   if name.startswith('filesystem-read-') and all(k in metadata for k in ('filename','bytes','sha256')):
    observation['matchesAttachmentOrdinals']=matching(name.removesuffix('.json'),metadata['sha256'],metadata['bytes'])
  for name,payloads in names.items():
   if name.startswith('AT-B12-input-'):
    rejections=bodies['AT-B12-rejected-'+name.removeprefix('AT-B12-input-')+'.json']
    assert len(rejections)==1 and len(payloads)==1,'Ambiguous rejection evidence'
    rejected=rejections[0];payload=payloads[0][1]
    assert rejected['archiveSha256']==sha(payload) and rejected['visibleReason'] and rejected['unchangedAuthorRecords'] is True and rejected['unchangedAssetBytes'] is True
  for file in files:
   if file['name'].endswith('.scenario') and (file['name'].startswith('complete-backup-') or file['name'].endswith('-complete.scenario')):
    assert file['archive']['allDeclaredFileBytesAndHashesMatch'] and file['archive']['completeEmbeddedAssetMode'],'Complete output contains changed or omitted declared bytes'
  if spec['title'].startswith('AT-N09 '):assert observed_pinned_negatives==set(pinned_negatives),'Missing original negative fixture bytes'
  references=[{**{k:v for k,v in row.items() if k not in ('value','valueIndex')},'valuePath':['observations',row['name']]+([row['valueIndex']] if len(bodies[row['name']])>1 else [])} for row in observation_records]
  tests.append(dict(testId=spec['id'],engine=test['projectName'],file=spec.get('file',enclosing.get('file')),line=spec.get('line'),title=spec['title'],suite=path,durationMs=result['duration'],caseIds=sorted(set('AT-'+x for x in re.findall(r'(?<![A-Za-z0-9])(?:AT-)?([BFNE]\d{2})(?!\d)',spec['title']))),attachments=files,observations={name:values[0] if len(values)==1 else values for name,values in bodies.items()},observationRecords=references))
assert len(tests)==a.expected
output=dict(format='phase3-observed-report-index/1',report=dict(path=str(a.report),bytes=len(report_bytes),sha256=sha(report_bytes)),stats=report['stats'],scope='All actual tests/results/retries and all attachment bytes read. Valid complete output hashes and descriptor pairs checked. This index is not automatic four-clause acceptance or physical/live-service certification.',actualArchivesRead=archives,actualOutputDescriptorPairs=outputs,tests=tests)
with a.output.open('x') as f:json.dump(output,f,ensure_ascii=False,indent=2);f.write('\n')
print(json.dumps(dict(tests=len(tests),actualArchivesRead=archives,actualOutputDescriptorPairs=outputs,attachmentFiles=sum(len(t['attachments']) for t in tests))))
