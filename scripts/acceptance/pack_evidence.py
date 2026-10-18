"""Retain complete actual files with per-member SHA and a reproducible archive manifest."""
import argparse,hashlib,json,zipfile
from pathlib import Path
p=argparse.ArgumentParser();p.add_argument('--source',type=Path,required=True);p.add_argument('--output',type=Path,required=True);p.add_argument('--format',choices=['formal','delivery'],required=True);p.add_argument('--label',default='actual-evidence');a=p.parse_args()
source=a.source.resolve();output=a.output.resolve();output.mkdir(exist_ok=False,parents=True)
digest=lambda b:hashlib.sha256(b).hexdigest()
rows=[]
for path in sorted(source.rglob('*')):
 assert not path.is_symlink(),'Symlinks are not retained evidence: '+str(path)
 if not path.is_file():continue
 name=path.relative_to(source).as_posix();b=path.read_bytes();rows.append(dict(path=name,bytes=len(b),sha256=digest(b)))
assert rows and len(rows)==len({r['path'] for r in rows})
archive=output/(a.label+'.zip')
with zipfile.ZipFile(archive,'x',compression=zipfile.ZIP_DEFLATED,compresslevel=6) as z:
 for row in rows:z.write(source/row['path'],row['path'])
with zipfile.ZipFile(archive) as z:
 assert len(z.namelist())==len(rows) and z.testzip() is None
 for row in rows:
  b=z.read(row['path']);assert len(b)==row['bytes'] and digest(b)==row['sha256']
b=archive.read_bytes();description=dict(path=archive.name,bytes=len(b),sha256=digest(b))
if a.format=='formal':
 assert len(b)<95*1024*1024,'Formal bundle needs a reviewed transport extension before splitting'
 manifest=dict(format='phase3-formal-evidence/1',recordedRoot=str(source),archive=description,files=rows)
else:
 description.pop('path');parts=[]
 for index,start in enumerate(range(0,len(b),4*1024*1024),1):
  piece=b[start:start+4*1024*1024];name=archive.name+'.part'+str(index).zfill(3)
  with (output/name).open('xb') as f:f.write(piece)
  parts.append(dict(path=name,bytes=len(piece),sha256=digest(piece)))
 archive.unlink();description['parts']=parts
 manifest=dict(format='phase3-delivery-archive/1',label=a.label,recordedRoot=str(source),archive=description,files=rows)
with (output/'manifest.json').open('x') as f:json.dump(manifest,f,ensure_ascii=False,indent=2);f.write('\n')
print(json.dumps(dict(files=len(rows),archiveBytes=len(b),archiveSHA256=digest(b))))
