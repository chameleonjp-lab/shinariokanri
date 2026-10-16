"""Prepare a concrete local handoff. This does not upload or deploy anything."""
import argparse, hashlib, json, shutil, re, zipfile
from pathlib import Path
from urllib.parse import urljoin

p=argparse.ArgumentParser(description=__doc__)
p.add_argument('--candidate',type=Path,required=True)
p.add_argument('--repo',type=Path,required=True)
p.add_argument('--output',type=Path,required=True)
p.add_argument('--review-pr-url',required=True)
a=p.parse_args()
binding=json.loads((a.candidate/'binding.json').read_text());target=binding['product']
assert target['dirty'] is False and target['base']=='/shinariokanri/'
a.output.mkdir(parents=True,exist_ok=False)
sha=lambda raw:hashlib.sha256(raw).hexdigest()
shutil.copytree(a.candidate/'dist',a.output/'shinariokanri')
for row in binding['distFiles']:
    raw=(a.output/'shinariokanri'/row['path']).read_bytes()
    assert len(raw)==row['bytes'] and sha(raw)==row['sha256']
old=Path('/workspace/pr49-checks/manual-candidate-086255a')
dependencies=json.loads((old/'DEPENDENCIES.json').read_text())
for row in dependencies:
    actual=a.repo/'node_modules'/row['package']/Path(row['file']).name
    package=json.loads((a.repo/'node_modules'/row['package']/'package.json').read_text())
    assert package['version']==row['version'] and actual.read_bytes()==(old/row['file']).read_bytes()
    output=a.output/row['file'];output.parent.mkdir(parents=True,exist_ok=True);shutil.copyfile(actual,output)
(a.output/'DEPENDENCIES.json').write_text(json.dumps(dependencies,indent=2)+'\n')
fixture=old/'AT-F01-given.scenario'
assert sha(fixture.read_bytes())=='71a6a7abd67ea17b45113628ab366a98bae810ee77f4bc3306ae9a9cae8bc043'
for name in ['AT-F01-given.scenario','AT-F01-given.json']:shutil.copyfile(old/name,a.output/name)
guide=(a.repo/'docs/quality/pr49-followup-2026-10-15/MANUAL_REVIEW.md').read_text()
assert re.fullmatch(r'https://github\.com/chameleonjp-lab/shinariokanri/pull/[0-9]+',a.review_pr_url)
guide=guide.replace('[今回の記録](README.md)','[今回の記録]('+a.review_pr_url+')')
base='https://github.com/chameleonjp-lab/shinariokanri/blob/'+target['commit']+'/docs/quality/pr49-followup-2026-10-15/'
guide=re.sub(r'\]\(([^)#]+)(#[^)]*)?\)',lambda m:']('+urljoin(base,m[1])+(m[2] or '')+')',guide)
(a.output/'MANUAL_REVIEW.md').write_text(guide)
template=json.loads((old/'REVIEW_TEMPLATE.json').read_text());template['target']=target
template['fixtureOrigin']={'scope':'Historical native1.0.0 sample input, not current execution evidence','candidate':'086255ab3ee07bb3a522fc2dc8cf6d249afca4a7'}
(a.output/'REVIEW_TEMPLATE.json').write_text(json.dumps(template,ensure_ascii=False,indent=2)+'\n')
files=[]
for path in sorted(a.output.rglob('*')):
    if path.is_file():
        raw=path.read_bytes();files.append({'path':path.relative_to(a.output).as_posix(),'bytes':len(raw),'sha256':sha(raw)})
manifest={'target':target,'scope':'Local fixed candidate handoff only; no upload/deployment/physical/AT/liveAuth results','files':files}
(a.output/'MANIFEST.json').write_text(json.dumps(manifest,ensure_ascii=False,indent=2)+'\n')
zip_path=a.output.with_suffix('.zip')
assert not zip_path.exists()
with zipfile.ZipFile(zip_path,'w',zipfile.ZIP_DEFLATED,compresslevel=9) as archive:
    for path in sorted(a.output.rglob('*')):
        if path.is_file():archive.write(path,path.relative_to(a.output).as_posix())
with zipfile.ZipFile(zip_path) as archive:
    assert archive.testzip() is None
    assert len(archive.namelist())==len(files)+1
    for row in files:
        raw=archive.read(row['path']);assert len(raw)==row['bytes'] and sha(raw)==row['sha256']
print(json.dumps({'zip':str(zip_path),'bytes':zip_path.stat().st_size,'sha256':sha(zip_path.read_bytes()),'members':len(files)+1,'product':target},indent=2))
