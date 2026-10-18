"""Fetch immutable review evidence and check every actual archive member."""
import argparse,hashlib,json,os,re,subprocess,zipfile
from datetime import datetime,timezone
from pathlib import Path,PurePosixPath
p=argparse.ArgumentParser();p.add_argument('--location',type=Path,required=True);p.add_argument('--cache',type=Path,required=True);p.add_argument('--output',type=Path,required=True);p.add_argument('--label',action='append');p.add_argument('--offline',action='store_true');a=p.parse_args()
def load(data):
 def pairs(rows):
  out={}
  for key,value in rows:
   if key in out:raise ValueError('Duplicate JSON key')
   out[key]=value
  return out
 return json.loads(data,object_pairs_hook=pairs,parse_constant=lambda _:(_ for _ in ()).throw(ValueError('Nonfinite JSON')))
def safe(value):
 path=PurePosixPath(value)
 assert isinstance(value,str) and value and not path.is_absolute() and '..' not in path.parts and '\\' not in value and '\0' not in value and path.as_posix()==value and path.name not in ('','.','..'),'Unsafe evidence path'
 return value
sha=lambda data:hashlib.sha256(data).hexdigest()
location_bytes=a.location.read_bytes();location=load(location_bytes);assert location['format']=='phase3-evidence-location/1'
assert location['repository']=='https://github.com/chameleonjp-lab/shinariokanri.git'
commit=location['commit'];assert re.fullmatch('[0-9a-f]{40}',commit)
started=datetime.now(timezone.utc).isoformat();cache=a.cache.resolve();output=a.output.resolve();cache_existed=cache.exists();output_existed=output.exists();output.mkdir(parents=True,exist_ok=False)
if not cache.exists():
 assert not a.offline;cache.mkdir(parents=True);subprocess.run(['git','init','--bare',str(cache)],check=True,stdout=subprocess.DEVNULL)
def git(*args):return subprocess.check_output(['git','--git-dir',str(cache),*args])
if not a.offline:subprocess.run(['git','--git-dir',str(cache),'fetch','--no-tags','--depth=1',location['repository'],commit],check=True)
assert git('rev-parse',commit+'^{commit}').decode().strip()==commit
labels={row['label']:row for row in location['bundles']};assert len(labels)==len(location['bundles'])
selected=a.label or list(labels);assert len(selected)==len(set(selected)) and set(selected)<=set(labels)
receipts=[]
for label in selected:
 safe(label);row=labels[label];path=safe(row['manifest']);raw=git('show',commit+':'+path)
 assert len(raw)==row['bytes'] and sha(raw)==row['sha256'],'Manifest differs from pinned location'
 manifest=load(raw);directory=output/label;directory.mkdir();(directory/'manifest.json').write_bytes(raw)
 prefix=str(PurePosixPath(path).parent);archive_row=manifest['archive'];format=manifest['format']
 if format=='phase3-formal-evidence/1':
  name=safe(archive_row['path']);data=git('show',commit+':'+prefix+'/'+name);archive=directory/name;archive.write_bytes(data)
 elif format=='phase3-delivery-archive/1':
  name='retained.zip';archive=directory/name;parts=archive_row['parts'];assert parts and len(parts)==len({r['path'] for r in parts})
  with archive.open('xb') as target:
   for part in parts:
    data=git('show',commit+':'+prefix+'/'+safe(part['path']));assert len(data)==part['bytes'] and sha(data)==part['sha256'],'Evidence part differs'
    target.write(data)
 else:raise ValueError('Unknown evidence transport format')
 with archive.open('rb') as source:
  digest=hashlib.sha256();size=0
  while data:=source.read(1024*1024):size+=len(data);digest.update(data)
 assert size==archive_row['bytes'] and digest.hexdigest()==archive_row['sha256'],'Complete evidence ZIP differs'
 files=manifest['files'];assert len(files)==len({r['path'] for r in files})
 expected={safe(r['path']):r for r in files};actual=directory/'actual';actual.mkdir()
 with zipfile.ZipFile(archive) as zipped:
  assert len(zipped.namelist())==len(expected) and set(zipped.namelist())==set(expected) and zipped.testzip() is None,'ZIP inventory or CRC differs'
  for member in zipped.infolist():
   name=safe(member.filename);assert not member.is_dir() and (member.external_attr>>16)&0o170000!=0o120000,'Nonregular evidence member'
   data=zipped.read(member);expected_row=expected[name];assert len(data)==expected_row['bytes'] and sha(data)==expected_row['sha256'],'Actual evidence member differs'
   destination=actual/name;destination.parent.mkdir(parents=True,exist_ok=True)
   with destination.open('xb') as target:target.write(data)
 receipts.append(dict(label=label,manifestSHA256=sha(raw),archiveSHA256=digest.hexdigest(),archiveBytes=size,actualFiles=len(files),result='all_actual_bytes_verified'))
procedure=Path(__file__).read_bytes()
result=dict(format='phase3-recovered-evidence/1',startedAt=started,finishedAt=datetime.now(timezone.utc).isoformat(),commit=commit,locationSHA256=sha(location_bytes),cacheExistedBefore=cache_existed,outputExistedBefore=output_existed,remoteFetchPerformed=not a.offline,procedureSHA256=sha(procedure),bundles=receipts,scope='Immutable Git objects, pinned manifest, all parts, full ZIP CRC/inventory and every retained actual file bytes/SHA verified. Verification is transport/integrity, not release or physical acceptance.')
(output/'RECOVERY.json').write_text(json.dumps(result,ensure_ascii=False,indent=2)+'\n');print(json.dumps(result))
