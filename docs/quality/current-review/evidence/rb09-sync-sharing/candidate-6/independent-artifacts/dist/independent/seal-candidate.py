from pathlib import Path
import hashlib,json,subprocess,datetime
base=Path('/tmp/shinariokanri-independent-rb09-73a279a');root=base/'independent';source=json.loads((base/'SOURCE_BINDING.json').read_text());commit=source['candidateCommit'];tree=source['candidateTree']
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
oldroots=['/tmp/shinariokanri-rb09-core-review','/tmp/shinariokanri-rb09-core-review-4','/tmp/shinariokanri-independent-rb09-additional-1','/tmp/shinariokanri-independent-rb09-35d34a8','/tmp/shinariokanri-independent-rb09-29a8bb9','/tmp/shinariokanri-independent-rb09-dd4328c','/tmp/shinariokanri-independent-rb09-4d14113','/tmp/shinariokanri-independent-rb09-ff971b7'];old=[]
for b in oldroots:
 b=Path(b);binding=b/'independent/ARTIFACTS_BINDING.json';d=json.loads(binding.read_text());bad=[r['file'] for r in d['artifacts'] if not (b/r['file']).is_file() or sha(b/r['file'])!=r['sha256']]
 assert not bad,(str(b),bad)
 report=b/'independent/REPORT.json';assert sha(report)==d['reportSHA256']
 old.append({'root':str(b),'artifactCount':d['artifactCount'],'bindingSHA256':sha(binding),'reportSHA256':sha(report),'mismatches':bad})
status=subprocess.check_output(['git','status','--porcelain','--untracked-files=no'],cwd=base,text=True);assert not status
build=json.loads((base/'dist/build-info.json').read_text());assert build['commit']==commit and build['dirty']==False
now=datetime.datetime.now(datetime.timezone.utc).isoformat()
final={'candidateCommit':commit,'candidateTree':tree,'sourceCount':len(source['sourceHashes']),'sourceBindingSHA256':sha(base/'SOURCE_BINDING.json'),'all319MatchedGitShowAndFrozenFiles':True,'allOriginal15Unchanged':True,'oldBindingsUnchanged':old,'trackedGitStatus':status,'buildInfo':build,'sealedAt':now};dump(root/'FINAL_SOURCE_BINDING.json',final)
report=json.loads(Path('/tmp/shinariokanri-independent-rb09-ff971b7/independent/REPORT.json').read_text())
report.update({'stage':'RB09 candidate6 independent review; known-ACK permission/content boundaries failed','candidateCommit':commit,'candidateTree':tree,'sourceBindingSHA256':sha(base/'SOURCE_BINDING.json'),'finalSourceBindingSHA256':sha(root/'FINAL_SOURCE_BINDING.json'),'old53_76_175_521_363_534_565_590Unchanged':True,'sealedAt':now})
report['actualIndependentRuns']=[
 {'scope':'core/native/editor/transfer/world/repository24 plus authority/atomic-expiry/originalE07/exact old-work continuity/known ACK authority','tests':74,'pass':72,'fail':2,'failedIDs':['R9E08','R9E09'],'log':'independent/core-authority-known-ack.log'},
 {'scope':'typed owner/editor/derived/Edge and authorization SQL19 plus actual SQL-generated grant/read/ownerchange/scoped ACK boundary1','tests':20,'pass':19,'fail':1,'failedIDs':['R9SQL-authority-content'],'log':'independent/sql-typed-editor-derived-edge-authority-known.log','newGroupFirstFailure':'E09 FORBIDDEN assertion failed; both saveField/receive mutations were executed and observed; later E08 assertion not reached'},
 {'scope':'fresh network-none all8migrations/original mockRLS/NULL Unicode positions','migrations':8,'migrationPass':8,'mockRLSAssertions':23,'mockRLSPass':23,'nullBoundaryAssertions':2,'nullBoundaryPass':2,'logs':['independent/sql-setup-results.json','independent/sql-original-rls.log','independent/sql-null-comment-refusal.log']},
 {'scope':'clean production Chromium153 isolated5396 HTTP mocks','finalGroups':16,'pass':16,'fail':0,'log':'independent/browser-execution.json','includes':'original13 plus prepared/conflict withdrawal2 plus coherent current-content2 conflict recovery/explicit adoption/cold1','noFetchNormalization':True,'noForcedClick':True}]
report['finalComponentTotal']={'tests':94,'pass':91,'fail':3,'includesRepositorySuite24':True,'excludesOriginal116':True}
report['productFindings']=[
 {'id':'R9E08','expected':'Delayed content1 image cannot replace content2 already proved by a valid scoped ACK; old work/evidence remains intact','actual':'New authority2 while base is authority1 causes receive to drop conflict and activate old content1 even though ACK proves content2/authority2','proof':'independent/fixtures/R9E08.json','raw':'independent/core-authority-known-ack.log'},
 {'id':'R9E09','expected':'Current scoped ACK that removes B stops active new B writes, while full original common/local/prepared/conflict/ACK remain evidence','actual':'Conflicting ACK authorization2/current A-only image is stored but active permission remains base authorization1; new B save succeeds','proof':'independent/fixtures/R9E09.json','raw':'independent/core-authority-known-ack.log'},
 {'id':'R9SQL-authority-content','supports':['R9E08','R9E09'],'observedTimeline':'Real isolated SQL: initial content1/auth2(A+B)→grant3 removesB/read1-auth3 captured→owner changesA content2→valid editor conflict ACK2-auth3(A only)→client newB save succeeds and delayed read1-auth3 activates content1/共通A/conflict absent','proof':'independent/fixtures/R9SQL-authority-content.json','rawCalls':'independent/sql-known-authority-calls.json','raw':'independent/sql-typed-editor-derived-edge-authority-known.log','firstAssertionFail':'E09 FORBIDDEN; E08 mutation observed but later assertion not reached','notActualSupabaseAuth':True}]
report['priorRepairsOnThisSource']['E07']='pass original prepared/conflict expected refusal; exact entire old work retained→component DB reopen→permitted later B only adopted→new B operation only; production current-content2 recovery/adoption/cold/no automatic old send also pass'
report['preservedInitialAttempts']=[]
report['previousAutomaticReview']=report.pop('automaticReview')
report['fixtureCoherenceDisclosure']='Original historical conflict withdrawal mock has response header1 after ACK2 and is retained only as client-defensive boundary, not latest real SQL response. Additional current-header2 positive and actual SQL legitimate delayed-read1/auth3→ACK2/auth3 timeline are recorded separately. No historic input/log/result changed.'
report['environment'].update({'appOrigin':'http://127.0.0.1:5396/shinariokanri/','buildInfo':build})
report['cleanup']={'own5396Stopped':True,'ownPostgreSQLRemoved':True}
report['notRun']=[{'scope':'Actual Auth/DataAPI/RLS/private Storage/two real devices','reason':'Dedicated endpoint/project/accounts/roles/configuration/quota/currentcost unspecified. SQL/Auth/Storage fixtures and intercepted HTTP are not live evidence'},{'scope':'Full104REQ/116AT/24packages/6regressiongroups, physicalOS/assistive/performance/final release','reason':'Focused stage review, required physical/provider/final-target evidence pending'},{'scope':'Root full suite and C7 repair','reason':'Root results kept separate. C7 graded only after separate source seal'}]
dump(root/'REPORT.json',report)
with (root/'REPORT.md').open('x') as out:out.write(f'# RB09 C6 独立レビュー\n\n対象 {commit} / tree {tree}。319入力全SHAはgit blobと一致し、原15資料・旧53/76/175/521/363/534/565/590成果物が不変です。\n\n部品94件＝91成功・3失敗。通常production16群、8migration、模擬RLS23、NULL位置2は成功。E07は旧work全体の保持、現在許可の後発Bだけの確認再開、cold、旧操作の自動再送防止まで成功しました。\n\nE08は既知ACKcontent2の後に遅延content1応答がactiveへ採用される差、E09はcurrent ACKで撤回されたBを旧権限で新規保存できる差です。同じ時系列を実隔離SQLのgrant/read/owner改稿/scoped ACKから生成して両更新を観察しました。SQL1群の最初のE09期待で失敗し、後のE08assertionは未到達として別記しています。\n\n旧header1/ACK2のmockは防御境界として保持し、現在content2のpositiveと実SQL時系列を別に記録しました。元104/116・実Auth/Storage・実端末・性能の合格へ換算しません。C7は別対象です。\n')
files={base/r['file']for r in source['sourceHashes']}|{base/r['file']for r in source['originalDocuments15']}|{base/'SOURCE_BINDING.json'}
files|={p for p in root.rglob('*')if p.is_file()and p.name!='ARTIFACTS_BINDING.json'};files|={p for p in (base/'tests').glob('independent-rb09-*')if p.is_file()};files|={p for p in (base/'dist').rglob('*')if p.is_file()}
art=[{'file':str(p.relative_to(base)),'sha256':sha(p),'bytes':p.stat().st_size}for p in sorted(files)];binding={'candidateCommit':commit,'candidateTree':tree,'sourceCount':319,'sourceBindingSHA256':sha(base/'SOURCE_BINDING.json'),'finalSourceBindingSHA256':sha(root/'FINAL_SOURCE_BINDING.json'),'reportSHA256':sha(root/'REPORT.json'),'artifactCount':len(art),'artifacts':art,'rawWhitespacePreserved':True,'notFullAcceptance':True,'notRealSupabaseEvidence':True,'sealedAt':now};dump(root/'ARTIFACTS_BINDING.json',binding)
print(json.dumps({'reportSHA256':sha(root/'REPORT.json'),'bindingSHA256':sha(root/'ARTIFACTS_BINDING.json'),'artifactCount':len(art),'oldBindingsUnchanged':True}))
