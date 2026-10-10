"""Verify and restore the original byte-exact layout of this evidence bundle."""
import argparse,gzip,hashlib,json,pathlib,re,shutil,tarfile,tempfile
p=argparse.ArgumentParser();p.add_argument('--summary',type=pathlib.Path,default=pathlib.Path(__file__).with_name('SUMMARY.json'));p.add_argument('--output',type=pathlib.Path,required=True);a=p.parse_args()
assert not a.output.exists() and not a.output.is_symlink(),'Choose a new output directory; existing data is never overwritten.'
a.output.parent.mkdir(parents=True,exist_ok=True);summary=json.loads(a.summary.read_text());bundle=summary['bundle'];base=a.summary.parent
sha=lambda f:hashlib.file_digest(f.open('rb'),'sha256').hexdigest()
with tempfile.TemporaryDirectory(prefix='evidence-restore-',dir=a.output.parent) as tmp:
 tmp=pathlib.Path(tmp);packed=tmp/'bundle.tar.gz'
 if 'parts' in bundle:
  with packed.open('wb') as dst:
   for row in bundle['parts']:
    src=base/row['path'];assert src.stat().st_size==row['bytes'] and sha(src)==row['sha256']
    with src.open('rb') as stream:shutil.copyfileobj(stream,dst,1048576)
 else:packed=base/bundle['archive']['path']
 assert packed.stat().st_size==bundle['archive']['bytes'] and sha(packed)==bundle['archive']['sha256']
 objects=tmp/'objects';objects.mkdir();layout=None
 with tarfile.open(packed,'r:gz') as t:
  for member in t:
   assert member.isfile(),'Links and directories are not accepted.'
   if re.fullmatch(r'objects/[a-f0-9]{64}',member.name):
    target=objects/member.name.split('/')[-1];assert not target.exists()
    assert 0<=member.size<=128*1024*1024
    with t.extractfile(member) as src,target.open('wb') as dst:shutil.copyfileobj(src,dst,1048576)
    assert sha(target)==target.name and target.stat().st_size==member.size
   elif member.name=='LAYOUT.json':
    assert layout is None and member.size<16*1024*1024;layout=json.load(t.extractfile(member))
   else:assert member.name in {'repack-evidence.py','BUNDLE_MANIFEST.json'}
 assert layout and layout['format']=='shinariokanri-evidence-objects-v1'
 rows=layout['logicalFiles'];assert len(rows)<=200000 and sum(r['bytes'] for r in rows)<=1024*1024*1024
 names=set()
 for r in rows:
  name=pathlib.PurePosixPath(r['path']);assert not name.is_absolute() and '..' not in name.parts and '\\' not in str(name) and '\x00' not in str(name) and str(name) not in names
  names.add(str(name));assert re.fullmatch(r'[a-f0-9]{64}',r['sha256']) and r['object']=='objects/'+r['sha256'] and r['mode']==0o644 and r['mtime']==0
  source=objects/r['sha256'];assert source.is_file() and source.stat().st_size==r['bytes'] and sha(source)==r['sha256']
 # Stage every original file and publish the directory only after all hashes pass.
 output=tmp/'restored';output.mkdir()
 for r in rows:
  target=output/r['path'];target.parent.mkdir(parents=True,exist_ok=True);shutil.copyfile(objects/r['sha256'],target)
  assert target.stat().st_size==r['bytes'] and sha(target)==r['sha256']
 original=output/'ORIGINAL_LAYOUT.tar.gz';assert not original.exists()
 with original.open('wb') as out,gzip.GzipFile(filename=layout['originalArchive']['path'],fileobj=out,mode='wb',mtime=0) as gz,tarfile.open(fileobj=gz,mode='w') as t:
  for r in rows:
   item=tarfile.TarInfo(r['path']);item.mode=r['mode'];item.mtime=r['mtime'];item.size=r['bytes']
   with (objects/r['sha256']).open('rb') as f:t.addfile(item,f)
 assert original.stat().st_size==layout['originalArchive']['bytes'] and sha(original)==layout['originalArchive']['sha256']
 output.rename(a.output)
print(json.dumps({'restoredFiles':len(rows),'output':str(a.output),'originalArchiveBytes':layout['originalArchive']['bytes'],'originalArchiveSHA256':layout['originalArchive']['sha256'],'allLogicalHashesVerified':True,'noAcceptanceResultPromotion':True}))
