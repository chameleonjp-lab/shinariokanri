import argparse,hashlib,io,json,subprocess,tarfile
from pathlib import Path,PurePosixPath
p=argparse.ArgumentParser();p.add_argument('label');p.add_argument('--repository',type=Path,default=Path.cwd());p.add_argument('--output',type=Path,required=True);a=p.parse_args()
assert a.label and all(c in 'abcdefghijklmnopqrstuvwxyz0123456789-' for c in a.label)
repo=a.repository.resolve();base='docs/quality/pr49-followup-2026-10-15/evidence/'
location=json.loads((repo/base/'bundle-location.json').read_bytes());commit=location['commit']
records={r['path']:r for r in location['files']};name=base+'bundles/'+a.label+'.manifest.json'
def digest(b):return hashlib.sha256(b).hexdigest()
def original(path):
 r=records[path];b=subprocess.check_output(['git','cat-file','blob',commit+':'+path],cwd=repo)
 assert len(b)==r['bytes'] and digest(b)==r['sha256']
 assert hashlib.sha1(f'blob {len(b)}\0'.encode()+b).hexdigest()==r['gitBlob']
 return b
manifest_bytes=original(name);m=json.loads(manifest_bytes);parts=[]
for r in m['archive']['parts']:
 b=original(base+'bundles/'+r['name']);assert len(b)==r['bytes'] and digest(b)==r['sha256'];parts.append(b)
archive=b''.join(parts);assert len(archive)==m['archive']['bytes'] and digest(archive)==m['archive']['sha256']
root=a.output.resolve();root.mkdir(parents=True,exist_ok=True);dest=root/a.label;dest.mkdir(exist_ok=False)
expected={r['path']:r for r in m['files']};assert len(expected)==len(m['files'])
with tarfile.open(fileobj=io.BytesIO(archive),mode='r:gz') as t:
 members=t.getmembers();assert len(members)==len(expected) and {r.name for r in members}==set(expected)
 for entry in members:
  assert entry.isfile() and not entry.name.startswith('/') and '..' not in PurePosixPath(entry.name).parts
  b=t.extractfile(entry).read();r=expected[entry.name];assert len(b)==r['bytes'] and digest(b)==r['sha256']
  target=dest/entry.name;target.parent.mkdir(parents=True,exist_ok=True)
  with target.open('xb') as f:f.write(b)
(root/(a.label+'.tar.gz')).write_bytes(archive)
(root/(a.label+'.recovery.json')).write_text(json.dumps(dict(commit=commit,manifest=dict(path=name,sha256=digest(manifest_bytes)),archive=m['archive'],verifiedMembers=len(expected)),indent=2)+'\n')
print(a.label,len(expected),'original members verified')
