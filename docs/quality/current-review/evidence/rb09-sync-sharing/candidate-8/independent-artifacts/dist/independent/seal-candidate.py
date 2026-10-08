from pathlib import Path
import hashlib,json,subprocess,datetime
base=Path('/tmp/shinariokanri-independent-rb09-af0c2b9');root=base/'independent';source=json.loads((base/'SOURCE_BINDING.json').read_text());commit=source['candidateCommit'];tree=source['candidateTree']
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
oldroots=['/tmp/shinariokanri-rb09-core-review','/tmp/shinariokanri-rb09-core-review-4','/tmp/shinariokanri-independent-rb09-additional-1','/tmp/shinariokanri-independent-rb09-35d34a8','/tmp/shinariokanri-independent-rb09-29a8bb9','/tmp/shinariokanri-independent-rb09-dd4328c','/tmp/shinariokanri-independent-rb09-4d14113','/tmp/shinariokanri-independent-rb09-ff971b7','/tmp/shinariokanri-independent-rb09-73a279a','/tmp/shinariokanri-independent-rb09-cfaebcb'];old=[]
for b in oldroots:
 b=Path(b);binding=b/'independent/ARTIFACTS_BINDING.json';d=json.loads(binding.read_text());bad=[r['file'] for r in d['artifacts'] if not (b/r['file']).is_file() or sha(b/r['file'])!=r['sha256']]
 assert not bad,(str(b),bad)
 report=b/'independent/REPORT.json';assert sha(report)==d['reportSHA256']
 old.append({'root':str(b),'artifactCount':d['artifactCount'],'bindingSHA256':sha(binding),'reportSHA256':sha(report),'mismatches':bad})
status=subprocess.check_output(['git','status','--porcelain','--untracked-files=no'],cwd=base,text=True);assert not status
build=json.loads((base/'dist/build-info.json').read_text());assert build['commit']==commit and build['dirty']==False
now=datetime.datetime.now(datetime.timezone.utc).isoformat()
final={'candidateCommit':commit,'candidateTree':tree,'sourceCount':len(source['sourceHashes']),'sourceBindingSHA256':sha(base/'SOURCE_BINDING.json'),'all319MatchedGitShowAndFrozenFiles':True,'allOriginal15Unchanged':True,'oldBindingsUnchanged':old,'trackedGitStatus':status,'buildInfo':build,'sealedAt':now};dump(root/'FINAL_SOURCE_BINDING.json',final)
report=json.loads(Path('/tmp/shinariokanri-independent-rb09-cfaebcb/independent/REPORT.json').read_text())
report.update({'stage':'RB09 candidate8 independent focused repair review; original E07–E10 expectations and new grant/content/cold/recovery boundaries passed','candidateCommit':commit,'candidateTree':tree,'sourceBindingSHA256':sha(base/'SOURCE_BINDING.json'),'finalSourceBindingSHA256':sha(root/'FINAL_SOURCE_BINDING.json'),'old53_76_175_521_363_534_565_590_586_612Unchanged':True,'sealedAt':now})
report['actualIndependentRuns']=[
 {'scope':'core/native/editor/transfer/repository27, authority/atomic-expiry, original mixed-age E07 plus coherent E07, current continuity/E08/E09/E10','tests':77,'pass':77,'fail':0,'log':'independent/core-authority-known-ack-expiry.log','files':14},
 {'scope':'fixed world material closure, transitive snapshot/expected hash/native restoration','tests':3,'pass':3,'fail':0,'log':'independent/world-closure.log'},
 {'scope':'independent new grant mask/new unseen body+C/current values/mask widening/cold expiry/edited-only recovery','tests':4,'pass':4,'fail':0,'log':'independent/grant-content-mask.log','proofs':['independent/fixtures/R9C8MASK01.json','independent/fixtures/R9C8MASK02.json','independent/fixtures/R9C8MASK03.json','independent/fixtures/R9C8MASK04.json']},
 {'scope':'typed owner/editor/derived/Edge authorization, legitimate SQL E08/E09 ordering, natural finite scope deadline E10 ordering','tests':21,'pass':21,'fail':0,'log':'independent/sql-typed-known-ack-expiry.log','files':7},
 {'scope':'fresh network-none all8migrations/original mockRLS/NULL Unicode positions','migrations':8,'migrationPass':8,'mockRLSAssertions':23,'mockRLSPass':23,'nullBoundaryAssertions':2,'nullBoundaryPass':2,'logs':['independent/sql-setup-results.json','independent/sql-original-rls.log','independent/sql-null-comment-refusal.log']},
 {'scope':'clean production Chromium153 isolated5398 HTTPS mocks','finalGroups':18,'pass':18,'fail':0,'runnerLog':'independent/browser-run-status.json','includes':'original13, original pending prepared/conflict2, coherent current-content2 conflict/cold1, original finite B-expiry/fresh descriptor A-edit1, added mask unknown→current values→C atomic save/cold1','widthGroup':[1280,390,768,1440],'noFetchNormalization':True,'noForcedClick':True}]
report['finalComponentTotal']={'tests':105,'pass':105,'fail':0,'includesRepositorySuite27':True,'excludesOriginal116':True}
report['productFindings']=[]
report['reviewOutcome']='No new product failure observed in the listed candidate8 independent scope. Original cases and stage-level device/provider/release gates are not graded.'
report['priorRepairsOnThisSource']['E07']='pass original prepared and historical mixed-age conflict positive expectations; original common/local/prepared/conflict/ACK retained exactly, current confirmed content retained under new grant mask; coherent current-content variants, explicit permitted-only recovery, DB reopen and normal cold re-entry/no old resend also pass'
report['priorRepairsOnThisSource']['E08/E09']='pass unchanged positive component expectations and actual isolated SQL grant/read/owner/scoped ACK ordering; old content and revoked B new active write refused without state mutations'
report['priorRepairsOnThisSource']['E10']='pass unchanged positive component and production expectations plus actual isolated SQL natural finite B-scope expiry; fresh same-content/auth A-only/null-expiry descriptor permits still-authorized A normal input, old ACK remains exact'
report['priorRepairsOnThisSource']['C8MASK']='pass additional independent mask01–04 and normal App: old-content values do not replace confirmed content2; added body/C remain unavailable until current read; current read cannot exceed observed field mask; cold/expiry are atomic; explicit recovery applies changed A only and preserves untouched remote B2'
report['preservedInitialAttempts']=[
 {'log':'independent/core-authority-known-ack-expiry.log','classification':'Own first command named world-boundaries, which does not exist; Vitest selected14 files/77 cases. The actual world-closure file was then run separately3/3 in world-closure.log. No result was inferred for an unselected file; unique final component total includes those3.'},
 {'file':'independent/browser-grant-content-mask-unexecuted-plan.mjs.txt','classification':'Initial unexecuted new harness plan selected prepared phase for its new identifier. Before the first import/artifact creation it was corrected to conflict phase in browser-grant-content-mask.mjs. Original planned bytes preserved; not an executed failure or pass.'},
 {'classification':'One read-only exec-server transport disconnect returned no new output; subsequent read recovered and existing test processes/logs completed normally. No product or test expectation changed.'}]
report['fixtureCoherenceDisclosure']='All original mixed-age and coherent-current fixtures/positive expectations retained. C8 now separately handles the historical newer-authority/older-content defensive input without adopting stale values. Actual isolated SQL E08/E09 and E10 use SQL-generated current descriptors/natural scope expiry; new mask fixtures explicitly show unknown/new values not used until current verified fieldset response. All previous candidate failures/raw/bindings are immutable.'
report['originalAcceptanceContext']={'cases':['AT-F29','AT-F30','AT-F34','AT-F35','AT-N07','AT-N14','AT-E05','AT-E06'],'givenWhenThenNegativeOrEdgeUnchanged':True,'registryResultNotPromoted':True,'limits':'Subset behavior/atomic save/cold/native+mock data checks contribute focused evidence, not full-case/device/live permissions acceptance'}
report['environment'].update({'appOrigin':'http://127.0.0.1:5398/shinariokanri/','buildInfo':build})
report['cleanup']={'own5398Stopped':True,'ownPostgreSQLRemoved':True}
report['notRun']=[{'scope':'Actual Supabase Auth/DataAPI/RLS/private Storage and two physical devices','reason':'Dedicated endpoint/project/public client key, owner/editor/reviewer/reader/nonmember test accounts/session configuration, approved migrations/private bucket, quota and current cost are unspecified. SQL/Auth/Storage fixtures and intercepted HTTPS cannot serve as live evidence'},{'scope':'Full104REQ/116AT/24packages/6regressiongroups, physical OS/browser/assistive/performance and final release gate','reason':'Focused candidate-source review only; required physical/provider/final-target evidence remains pending'},{'scope':'Root full unit/browser suites and RB10 worktree','reason':'Root results and separate worktrees are not independent runs from this checkout and remain distinct'}]
dump(root/'REPORT.json',report)
with (root/'REPORT.md').open('x') as out:out.write(f'# RB09 C8 独立レビュー\n\n対象 {commit} / tree {tree}。319入力SHAはgit blobと一致し、原15資料と過去全成果物（C7の612を含む）が不変です。\n\n部品105件、通常production18群、8migration、模擬RLS23、NULL位置2が成功しました。元E07〜E10は期待・fixturesを縮小せず再検査。新権限／旧本文は確認済み本文にmaskだけ適用し、旧work全体を保持します。同stampの新しい限定許可と期限を古いACKが上書きせず、有効Aを保存できます。\n\n追加の独立境界では、未知body／新Cを現行画像取得前に利用不可、取得後は宣言mask内だけ利用可能、mask外拡大を全拒否、cold／期限を原子処理、復旧採用は編集済みAだけ反映して未編集の古いBが遠隔B2を上書きしないことを確認しました。通常UIでもCの原子保存→cold、完全旧証跡保持、旧操作の自動再送なしを確認しています。\n\n初回world検査名の未選択は明記し、実ファイル3件を別実行しました。原104／116、実Auth／Storage、実端末、性能、完成候補のgateは保留です。rootの全suite結果とは分けています。\n')
files={base/r['file']for r in source['sourceHashes']}|{base/r['file']for r in source['originalDocuments15']}|{base/'SOURCE_BINDING.json'}
files|={p for p in root.rglob('*')if p.is_file()and p.name!='ARTIFACTS_BINDING.json'};files|={p for p in (base/'tests').glob('independent-rb09-*')if p.is_file()};files|={p for p in (base/'dist').rglob('*')if p.is_file()}
art=[{'file':str(p.relative_to(base)),'sha256':sha(p),'bytes':p.stat().st_size}for p in sorted(files)];binding={'candidateCommit':commit,'candidateTree':tree,'sourceCount':319,'sourceBindingSHA256':sha(base/'SOURCE_BINDING.json'),'finalSourceBindingSHA256':sha(root/'FINAL_SOURCE_BINDING.json'),'reportSHA256':sha(root/'REPORT.json'),'artifactCount':len(art),'artifacts':art,'rawWhitespacePreserved':True,'notFullAcceptance':True,'notRealSupabaseEvidence':True,'sealedAt':now};dump(root/'ARTIFACTS_BINDING.json',binding)
print(json.dumps({'reportSHA256':sha(root/'REPORT.json'),'bindingSHA256':sha(root/'ARTIFACTS_BINDING.json'),'artifactCount':len(art),'buildVersion':build['version'],'oldBindingsUnchanged':True}))
