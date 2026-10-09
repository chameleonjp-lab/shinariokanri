from pathlib import Path
import hashlib,json,subprocess,datetime
base=Path('/tmp/shinariokanri-independent-rb09-ff971b7');root=base/'independent';source=json.loads((base/'SOURCE_BINDING.json').read_text());commit=source['candidateCommit'];tree=source['candidateTree']
def sha(p):return hashlib.sha256(p.read_bytes()).hexdigest()
def dump(p,d):
 with p.open('x') as out:out.write(json.dumps(d,ensure_ascii=False,indent=2)+'\n')
assert subprocess.check_output(['git','rev-parse',commit+'^{tree}'],cwd=base,text=True).strip()==tree
requests=''.join(commit+':'+r['file']+'\n' for r in source['sourceHashes']).encode()
raw=subprocess.run(['git','cat-file','--batch'],input=requests,capture_output=True,cwd=base,check=True).stdout
pos=0;mismatch=[]
for row in source['sourceHashes']:
 end=raw.index(b'\n',pos);header=raw[pos:end].decode();size=int(header.rsplit(' ',1)[1]);content=raw[end+1:end+1+size];pos=end+1+size+1
 if hashlib.sha256(content).hexdigest()!=row['sha256'] or sha(base/row['file'])!=row['sha256']:mismatch.append(row['file'])
assert not mismatch
assert all(sha(base/r['file'])==r['sha256'] for r in source['originalDocuments15'])
oldroots=['/tmp/shinariokanri-rb09-core-review','/tmp/shinariokanri-rb09-core-review-4','/tmp/shinariokanri-independent-rb09-additional-1','/tmp/shinariokanri-independent-rb09-35d34a8','/tmp/shinariokanri-independent-rb09-29a8bb9','/tmp/shinariokanri-independent-rb09-dd4328c','/tmp/shinariokanri-independent-rb09-4d14113'];old=[]
for b in oldroots:
 b=Path(b);binding=b/'independent/ARTIFACTS_BINDING.json';d=json.loads(binding.read_text());bad=[r['file'] for r in d['artifacts'] if not (b/r['file']).is_file() or sha(b/r['file'])!=r['sha256']]
 assert not bad,(str(b),bad)
 report=b/'independent/REPORT.json';assert sha(report)==d['reportSHA256']
 old.append({'root':str(b),'artifactCount':d['artifactCount'],'bindingSHA256':sha(binding),'reportSHA256':sha(report),'mismatches':bad})
status=subprocess.check_output(['git','status','--porcelain','--untracked-files=no'],cwd=base,text=True);assert not status
build=json.loads((base/'dist/build-info.json').read_text());assert build['commit']==commit and build['dirty']==False
now=datetime.datetime.now(datetime.timezone.utc).isoformat()
final={'candidateCommit':commit,'candidateTree':tree,'sourceCount':len(source['sourceHashes']),'sourceBindingSHA256':sha(base/'SOURCE_BINDING.json'),'all319MatchedGitShowAndFrozenFiles':True,'allOriginal15Unchanged':True,'oldBindingsUnchanged':old,'trackedGitStatus':status,'buildInfo':build,'sealedAt':now};dump(root/'FINAL_SOURCE_BINDING.json',final)
report=json.loads(Path('/tmp/shinariokanri-independent-rb09-4d14113/independent/REPORT.json').read_text())
report.update({'stage':'RB09 candidate5 independent review; historical failed pending-field-withdrawal evidence retained','candidateCommit':commit,'candidateTree':tree,'sourceBindingSHA256':sha(base/'SOURCE_BINDING.json'),'finalSourceBindingSHA256':sha(root/'FINAL_SOURCE_BINDING.json'),'old53_76_175_521_363_534_565Unchanged':True,'sealedAt':now})
report['actualIndependentRuns']=[
 {'scope':'core/local/native5/editor/transfer/world + repository22 + epoch3','tests':55,'pass':55,'fail':0,'log':'independent/core-editor-transfer-world.log'},
 {'scope':'original authority/legacy evidence migration/expiry resolution and recovery','tests':5,'pass':5,'fail':0,'log':'independent/authority-boundaries.log'},
 {'scope':'deadline crossing final IndexedDB transaction read, public receive/saveField/prepare/ACK/resolve/adoptRecovery','tests':6,'pass':6,'fail':0,'log':'independent/transaction-expiry-final.log'},
 {'scope':'typed owner/editor/derived SQL, Edge private bytes, current authority under locked commit, synthetic Auth/Storage','tests':19,'pass':19,'fail':0,'log':'independent/sql-typed-editor-derived-edge-authority.log'},
 {'scope':'new current field withdrawal in prepared and conflict phases','tests':2,'pass':0,'fail':2,'failedIDs':['R9E07-prepared','R9E07-conflict'],'log':'independent/pending-authority.log'},
 {'scope':'fresh network-none all8migrations/mockRLS/NULL Unicode boundaries','migrations':8,'migrationPass':8,'mockRLSAssertions':23,'mockRLSPass':23,'nullBoundaryAssertions':2,'nullBoundaryPass':2,'logs':['independent/sql-setup-results.json','independent/sql-original-rls.log','independent/sql-null-comment-refusal.log']},
 {'scope':'normal clean production Chromium153 isolated5395 HTTPS mocks','finalGroups':15,'pass':13,'fail':2,'positiveIDs':['R9US01','R9USV02','R9UE00','R9URV01','R9UR02','R9URBytes04','R9UL06','R9USC03','R9UI05_CACHE','R9UI05_TX','R9UI06','R9UIE05','R9UIE06'],'failedIDs':['R9UIE07-prepared','R9UIE07-conflict'],'logs':['independent/browser-execution.json','independent/browser-pending-authority.log(R9UIE07-conflict)','independent/browser-pending-authority-corrected.log'],'noFetchNormalization':True,'noForcedClick':True}]
report['finalComponentTotal']={'tests':87,'pass':85,'fail':2,'includesRepositorySuite22':True,'excludesOriginal116':True}
report['productFindings']=[{'id':'R9E07','variants':['prepared','conflict'],'contract':'docs/spec/SYNC_SECURITY.md:48 current communication handles revoked cache while preserving unsent evidence','given':'prepared/conflict authority1 expiry=null, then hash-verified authority2 removing name at same content revision','expected':'Retain original common/local/prepared/conflict/ACK as exact evidence and stop new active writes to withdrawn fields','actual':'receive rejects REVISION_CHANGED solely because pending work exists; old authority1 remains and a new saveField(name) succeeds. Ordinary UI reproduces both variants.','componentProofs':['independent/fixtures/R9E07-prepared.json','independent/fixtures/R9E07-conflict.json'],'normalUIProofs':['independent/browser-pending-authority-corrected/R9UIE07-prepared-observed.json','independent/browser-pending-authority/R9UIE07-conflict-observed.json'],'serverAuthorizationBypassNotClaimed':True}]
report['priorRepairsOnThisSource']['E05/E06']='pass original C4 inputs/expectations in component and normal UI, plus six deadline-crossing atomic operations'
report['preservedInitialAttempts']=[{'path':'independent/setup-sql-types','classification':'independent fixture response shape annotation; runtime expected values unchanged'},{'path':'independent/setup-transaction-types','classification':'independent fixture discriminated SyncAck typing; runtime expected values unchanged'},{'path':'independent/PENDING_AUTHORITY_SETUP_CLASSIFICATION.json','classification':'HTTP503 correctly normalized TRANSPORT_UNAVAILABLE; initial prepared UI selector waited backend code, boundary not reached'},{'path':'independent/SEAL_SETUP_CLASSIFICATION.json','classification':'report-code generator quoting error and subsequent missing file; no product tests or old evidence changed'}]
report['automaticReview']={'action':'setup classification file creation','rejectionReason':'Concern about overwriting old classification history','resolved':'Read-only check showed C5 target absent and C4 classification unchanged. Safe alternative exclusively created a distinct new classification and new harness file. No old evidence edited; no remaining blocker.'}
report['environment'].update({'appOrigin':'http://127.0.0.1:5395/shinariokanri/','buildInfo':build})
report['cleanup']={'own5395Stopped':True,'ownPostgreSQLRemoved':True}
report['notRun']=[{'scope':'Actual Auth/DataAPI/RLS/privateStorage/two real devices','reason':'Dedicated endpoint/project/accounts/roles/configuration/quota/currentcost unspecified; synthetic fixtures cannot substitute'},{'scope':'Full104REQ/116AT/24packages/6regressiongroups, physicalOS/assistive/performance/finalrelease','reason':'Focused review stage; actual environments and final-target evidence pending'},{'scope':'Root full suite and candidate6 repair','reason':'Separate root evidence; C6 graded after C5 seal'}]
dump(root/'REPORT.json',report)
with (root/'REPORT.md').open('x') as out:out.write(f'# RB09 C5 independent review\n\nCommit {commit}, tree {tree}. All319 inputs match git blobs; original15 and old53/76/175/521/363/534/565 remain unchanged.\n\nComponents87:85pass,2fail. Original expectations and atomic-expiry6 pass; normal production15groups:13pass,2fail. Fresh8migrations/mockRLS23/NULL2 pass. R9E07 prepared/conflict retains old authority1 after verified field withdrawal2 and permits a new withdrawn-name write; ordinary UI reproduces both. E05/E06 pass on the original C4 inputs and expectations.\n\nFixture type/selector/report-generation setup failures are preserved separately. Automatic-review overwrite concern was resolved using exclusive new files; no old evidence changed or action remains blocked. No full116, real Auth/Storage, physical-device or performance grade.\n')
files={base/r['file']for r in source['sourceHashes']}|{base/r['file']for r in source['originalDocuments15']}|{base/'SOURCE_BINDING.json'}
files|={p for p in root.rglob('*')if p.is_file()and p.name!='ARTIFACTS_BINDING.json'};files|={p for p in (base/'tests').glob('independent-rb09-*')if p.is_file()};files|={p for p in (base/'dist').rglob('*')if p.is_file()}
art=[{'file':str(p.relative_to(base)),'sha256':sha(p),'bytes':p.stat().st_size}for p in sorted(files)]
binding={'candidateCommit':commit,'candidateTree':tree,'sourceCount':319,'sourceBindingSHA256':sha(base/'SOURCE_BINDING.json'),'finalSourceBindingSHA256':sha(root/'FINAL_SOURCE_BINDING.json'),'reportSHA256':sha(root/'REPORT.json'),'artifactCount':len(art),'artifacts':art,'rawWhitespacePreserved':True,'notFullAcceptance':True,'notRealSupabaseEvidence':True,'sealedAt':now};dump(root/'ARTIFACTS_BINDING.json',binding)
print(json.dumps({'reportSHA256':sha(root/'REPORT.json'),'bindingSHA256':sha(root/'ARTIFACTS_BINDING.json'),'artifactCount':len(art),'oldBindingsUnchanged':True}))
