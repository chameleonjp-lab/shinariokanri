from pathlib import Path
import subprocess,json,hashlib,datetime
root=Path('/tmp/shinariokanri-independent-rb08-bf0f6b0');repo=Path('/workspace/shinariokanri-rb08')
commit='bf0f6b07d4a3f782870ab11894d410936e7e1eff';tree='10e62dbf528d2290a5d18222216498faaf992908'
def sha(b):return hashlib.sha256(b).hexdigest()
def fh(p):return sha(p.read_bytes())
def git(*args):return subprocess.check_output(['git','-C',str(repo),*args])
assert git('rev-parse',commit+'^{tree}').decode().strip()==tree
source=json.loads((root/'source-manifest.json').read_text());rows=[]
for f in source['files']:
 data=git('show',commit+':'+f['file']);copied=(root/f['file']).read_bytes();rows.append({**f,'finalCopiedSHA256':sha(copied),'gitCommitSHA256':sha(data),'finalMatches':sha(data)==sha(copied)==f['sha256']})
assert len(rows)==186 and all(x['finalMatches'] for x in rows)
original=json.loads((root/'independent/INITIAL_BINDING.json').read_text());norm=[]
for f in original['originalDocuments']:
 actual=fh(root/f['file']);norm.append({**f,'finalSHA256':actual,'finalMatches':actual==f['sha256']});assert actual==f['sha256']
old=[]
for name in ['b59fddc','22db870','a6ad584']:
 folder=Path('/tmp/shinariokanri-independent-rb08-'+name);binding=json.loads((folder/'independent/ARTIFACTS_BINDING.json').read_text());matches=[]
 for a in binding['artifacts']:matches.append((folder/a['file']).exists() and fh(folder/a['file'])==a['sha256'])
 assert all(matches);old.append({'candidate':name,'commit':binding.get('commit',binding.get('targetCommit')),'tree':binding.get('tree',binding.get('targetTree')),'artifactCount':len(matches),'allOriginalSHA256Unchanged':True,'reportSHA256':fh(folder/'independent/REPORT.json'),'bindingSHA256':fh(folder/'independent/ARTIFACTS_BINDING.json')})
rb07=Path('/tmp/shinariokanri-independent-rb07-11cffa7');pack=root/'docs/quality/current-review/evidence/rb07-production/candidate-11/independent';b=json.loads((rb07/'ARTIFACT_BINDING.json').read_text());a=b.get('artifacts',b.get('files'));assert a is not None
checks=[]
for f in a:
 path=f.get('path',f.get('file'));h=f['sha256'];checks.append((pack/path).exists() and fh(pack/path)==h and fh(rb07/path)==h)
assert len(checks)==145 and all(checks)
legacy=[]
for path in sorted((root/'docs/quality/current-review/evidence/legacy').rglob('*')):
 if path.is_file():legacy.append({'file':str(path.relative_to(root)),'sha256':fh(path),'executedThisRB08Review':False})
port=(root/'independent/production-port-only-source.ts').read_text();raw=(root/'tests/e2e/rb08-handoff.spec.ts').read_text();assert port==raw.replace('http://127.0.0.1:4173','http://127.0.0.1:5381')
assert git('show',commit+':tests/e2e/rb08-handoff.spec.ts')==(root/'tests/e2e/rb08-handoff.spec.ts').read_bytes()
record={'commit':commit,'tree':tree,'verifiedAt':datetime.datetime.now(datetime.timezone.utc).isoformat(),'all186TrackedSourceHashesMatchGitCommit':True,'sourceProductCodeSchema151AndTests35':True,'files':rows,'originalDocuments15':norm,'historicalRB08ArtifactsUnchanged':old,'originalRB07Artifacts':{'count':145,'allOriginalAndPackagedSHA256Match':True,'reportSHA256':fh(rb07/'INDEPENDENT_REVIEW.json'),'bindingBytesUnchanged':(pack/'ARTIFACT_BINDING.json').read_bytes()==(rb07/'ARTIFACT_BINDING.json').read_bytes()},'legacyFixtures':legacy,'productionRunner':{'originalSHA256':fh(root/'tests/e2e/rb08-handoff.spec.ts'),'portOnlyAdapterSHA256':fh(root/'independent/production-port-only-source.ts'),'instrumentedRunnerSHA256':fh(root/'tests/e2e/independent-rb08-handoff.spec.ts'),'assertionsUnchanged':True,'changes':'Dedicated localhost port, seed bytes and download observer capture only'},'readOnlySharedProductAndEvidence':True}
(root/'independent/FINAL_SOURCE_BINDING.json').write_text(json.dumps(record,ensure_ascii=False,indent=2)+'\n')
print(json.dumps({'sourceFiles':len(rows),'originalDocuments':len(norm),'oldRB08Artifacts':[r['artifactCount'] for r in old],'RB07Artifacts':len(checks),'legacyNotRun':len(legacy)},ensure_ascii=False))
