import datetime,hashlib,json,pathlib,platform,subprocess,sys
root=pathlib.Path('/workspace/runtime-verification')
out=pathlib.Path('/tmp/shinariokanri-ap02-3bea751-run1')
phase=sys.argv[1]
args=['git','ls-files','-z','--','src','public','examples','scripts/build','vite.config.ts','package.json','package-lock.json','tsconfig.json','playwright.config.ts','tests/e2e/link-candidate-ignore.spec.ts','tests/e2e/consultation-context.spec.ts','tests/e2e/startup-migration-retry.spec.ts']
tracked=subprocess.check_output(args,cwd=root).decode().split('\0')
paths={p for p in tracked if p}
for generated in ['src/portable/generated','public/examples/browser-game']:
    if (root/generated).exists(): paths.update(str(p.relative_to(root)) for p in (root/generated).rglob('*') if p.is_file())
def manifest(paths):
    rows=[];digest=hashlib.sha256()
    for rel in sorted(paths):
        data=(root/rel).read_bytes();sha=hashlib.sha256(data).hexdigest();digest.update(rel.encode()+b'\0'+data)
        rows.append({'path':rel,'bytes':len(data),'sha256':sha})
    return {'sha256':digest.hexdigest(),'files':rows}
source=manifest(paths)
build=manifest(str(p.relative_to(root)) for p in (root/'dist').rglob('*') if p.is_file())
info=json.loads((root/'dist/build-info.json').read_text())
record={'checkedAt':datetime.datetime.now(datetime.timezone.utc).isoformat(),'phase':phase,'targetCommit':subprocess.check_output(['git','rev-parse','HEAD'],cwd=root,text=True).strip(),'productTree':subprocess.check_output(['git','rev-parse','HEAD^{tree}'],cwd=root,text=True).strip(),'worktreeStatus':subprocess.check_output(['git','status','--porcelain'],cwd=root,text=True),'buildInfo':info,'sourceManifest':source,'distManifest':build,'system':{'platform':platform.system(),'kernel':platform.release()},'physicalDevice':False,'actualAuthRlsStorage':False,'originalWholeAcceptancePromotion':False}
(out/f'binding-{phase}.json').write_text(json.dumps(record,ensure_ascii=False,indent=2)+'\n')
if info['dirty'] or info['commit']!=record['targetCommit'] or info['tree']!=record['productTree'] or record['worktreeStatus']:
    raise SystemExit('Candidate binding is not clean and exact.')
if phase=='after':
    before=json.loads((out/'binding-before.json').read_text())
    for key in ['targetCommit','productTree','worktreeStatus','buildInfo','sourceManifest','distManifest']:
        if record[key]!=before[key]: raise SystemExit(f'Candidate changed: {key}')
print(json.dumps({'phase':phase,'targetCommit':record['targetCommit'],'buildHash':info['version'],'sourceSHA256':source['sha256'],'distSHA256':build['sha256'],'unchanged':phase=='after'}))
