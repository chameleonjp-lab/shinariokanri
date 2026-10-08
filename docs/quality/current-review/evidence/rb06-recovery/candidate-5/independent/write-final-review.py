from pathlib import Path
import json,hashlib,subprocess,datetime
r=Path('/tmp/shinariokanri-independent-rb06-d64fd7d');old=Path('/tmp/shinariokanri-independent-rb06-cd38e34');previous_root=Path('/tmp/shinariokanri-independent-rb06-bd43ca7');repo=Path('/workspace/shinariokanri-rb06')
c='d64fd7dc1d14ab228511828ac6e72664dd31fdf7';tree='07c6a8a8184d496652a24b9e790ee838ecf60058';previous='bd43ca75f8cddccf93fcca1e762b8ba650c61bbb';base='b310800c98bc9a89b93182ad721380a0be99d2d3'
sha=lambda b:hashlib.sha256(b).hexdigest();read=lambda p:json.loads(p.read_text())
def write(n,d):(r/n).write_text(json.dumps(d,ensure_ascii=False,indent=2)+'\n')
def git(commit,p):return subprocess.check_output(['git','show',commit+':'+p],cwd=repo)
m=read(r/'source-manifest.json');p=read(old/'INDEPENDENT_REVIEW.json');q=read(previous_root/'INDEPENDENT_REVIEW.json');ob=read(old/'SOURCE_COMMIT_BINDING.json');files=[]
for x in m['files']:
 f=x['file'];b=(r/f).read_bytes();s=sha(b);files.append({'file':f,'sha256':s,'manifestMatches':s==x['sha256'],'commitMatches':b==git(c,f)})
assert len(files)==161 and all(x['manifestMatches']and x['commitMatches']for x in files)
assert subprocess.check_output(['git','rev-parse',c+'^{tree}'],cwd=repo).decode().strip()==tree
changed=subprocess.check_output(['git','diff','--name-only',previous,c,'--','src'],cwd=repo).decode().splitlines();assert changed==['src/App.tsx','src/ui/BackupPanel.tsx']
contracts=[]
for x in ob['originalContracts']:
 f=x['file'];b=(r/f).read_bytes();contracts.append({'file':f,'sha256':sha(b),'baseMatches':b==git(base,f),'commitMatches':b==git(c,f),'originalHashMatches':sha(b)==x['sha256']})
assert len(contracts)==15 and all(x['baseMatches']and x['commitMatches']and x['originalHashMatches']for x in contracts)
legacy=[]
for x in ob['legacyFixtureInputs']:
 f=x['file'];b=(r/f).read_bytes();legacy.append({'file':f,'sha256':sha(b),'commitMatches':b==git(c,f),'oldHashMatches':sha(b)==x['sha256']})
assert len(legacy)==4 and all(x['commitMatches']and x['oldHashMatches']for x in legacy)
inputs=[]
for x in ob['independentInputs']:
 f=x['file'];b=(r/f).read_bytes();inputs.append({'file':f,'sha256':sha(b),'sameBytesAsCd38':b==(old/f).read_bytes(),'sameBytesAsBd43':b==(previous_root/f).read_bytes(),**({'commitMatches':b==git(c,f)}if f.startswith('tests/')else{})})
assert all(x['sameBytesAsCd38']and x['sameBytesAsBd43']for x in inputs)
write('SOURCE_COMMIT_BINDING.json',{'commit':c,'tree':tree,'base':base,'sourceFileCount':161,'all161Match':True,'files':files,'changedSourceFromPrevious':changed,'unchangedSourceCount':159,'originalContracts':contracts,'legacyFixtureInputs':legacy,'independentInputs':inputs})
app=read(r/'independent/browser-recovery.json');assert len(app['results'])==8 and all(x['status']=='passed'for x in app['results'])
extra=read(r/'independent/browser-recovery-extra.json');assert len(extra['results'])==2 and all(x['status']=='passed'for x in extra['results'])
clear=read(r/'independent/browser-clear.json');assert len(clear['results'])==1 and clear['results'][0]['status']=='passed'
v1=read(r/'independent/browser-v1.json');assert v1['result']['status']=='passed'
production=read(r/'independent/production-browser.json');assert production['stats']['expected']==4 and production['stats']['unexpected']==0
build=read(r/'dist/build-info.json');assert build['commit']=='unknown'and build['dirty']is True
assert 'Tests  17 passed (17)'in(r/'independent/domain-boundaries.log').read_text()
prior_sha=sha((old/'INDEPENDENT_REVIEW.json').read_bytes());assert prior_sha=='84c2ee90b7a5181100035496a79f2769eb42dffdf42374a2cb7d248df72ba982'
bd_sha=sha((previous_root/'INDEPENDENT_REVIEW.json').read_bytes());assert bd_sha=='d16b8ee81cf2d458b86a36bff69ef7b590ef967431aa16c505a3f0e89eb1e7bf'
history=[]
for origin in [old,previous_root]:
 binding=read(origin/'ARTIFACT_BINDING.json');assert all(sha((origin/x['file']).read_bytes())==x['sha256']for x in binding['artifacts']);history.append({'root':str(origin),'artifactCount':binding['artifactCount'],'allArtifactsUnchanged':True,'reportSha256':sha((origin/'INDEPENDENT_REVIEW.json').read_bytes())})
obs3=read(r/'independent/fixtures/R6U03-observation.json');obs9=read(r/'independent/fixtures/R6U09-observation.json');assert obs3['before']==obs3['after']and obs9['before']==obs9['after']
proof=read(r/'independent/fixtures/R6U11-clear-observation.json');Dhash=sha((r/'independent/fixtures/D.scenario').read_bytes());assert proof['draft']['sourceHash']==proof['Dhash']==Dhash
events=proof['events'];end=next(i for i,x in enumerate(events)if x['stage']=='clear-end');start=next(i for i,x in enumerate(events)if x['stage']=='save-start'and x.get('sourceHash')==Dhash);assert start>end
resolved=[{'id':'R6U03','requirements':p['findings'][0]['requirements'],'historicalTarget':p['target'],'historicalReportSha256':prior_sha,'status':'passed_same_frozen_C_bytes_and_correct_expected_outcome','expected':p['findings'][0]['expected'],'actual':obs3,'evidence':['independent/browser-recovery.json','independent/fixtures/R6U03-observation.json']},{'id':'R6U09','requirements':q['findings'][0]['requirements'],'historicalTarget':q['target'],'historicalReportSha256':bd_sha,'historicalFailure':q['findings'][0],'status':'passed_same_frozen_C_D_bytes_and_correct_expected_outcome','expected':q['findings'][0]['expected'],'actual':{'originalViewRetained':True,'originalExpectationThenDHeader':'passed in unchanged semantic R6U09','earlyTransitionalObservation':obs9,'durableDSourceHash':Dhash,'clearPrecedesDSave':True,'coldReloadDUnapproved':'passed additional R6U11 and current production native-ack test'},'evidence':['independent/browser-recovery-extra.json','independent/browser-recovery-extra.log','independent/fixtures/R6U09-observation.json','independent/browser-clear.json','independent/fixtures/R6U11-clear-observation.json','independent/production-browser.json'],'measurementLimit':'Original R6U09 early two-animation-frame capture remains source=[] while inspection begins; the same later D-header expectation passed. Additional R6U11 independently confirms durable D and cold reload. Late file-input change and acknowledgment/clear waits are controlled actual-browser boundaries, not an actual OS Files picker test.'}]
report={
 'target':{'commit':c,'tree':tree,'base':base,'source161Match':True,'frozenAt':m['frozenAt'],'verifiedAt':datetime.datetime.now(datetime.timezone.utc).isoformat()},
 'decision':'R6U09 repaired under unchanged bytes and expected outcome; R6U03 remains repaired. No further issue found within the executed independent scope. Not whole RB06/104/116 completion.',
 'historicalEvidenceUnchanged':{'cd38ReportSha256':prior_sha,'bd43ReportSha256':bd_sha,'R6U03AndR6U09FailuresPreserved':True,'previousArtifacts':history},
 'verification':{
  'independentParts':{'passed':17,'failed':0,'log':'independent/domain-boundaries.log','cases':'Same independent R6I01-14 test sources and semantic expectations; absolute output root changed only. Includes real archive bytes/legacy fixed traces, mapped old74 commands, ambiguity refusal, all4 transaction failure stages and late cancel. fake-indexeddb.'},
  'priorActualAppBoundaries':{'passed':8,'failed':0,'results':app['results'],'logs':['independent/browser-recovery.json','independent/browser-recovery.log'],'browser':'Chromium151.0.7922.173 /usr/bin/chromium','viewport':'1024x768','build':'isolated exact d64 source via Vite; actual App/native IndexedDB'},
  'previousAdditionalBoundaries':{'passed':2,'failed':0,'results':extra['results'],'classification':'Original R6U09 controlled late native-file-input change at post-save acknowledgment and R6U10 normal navigation roundtrip. Same C/D bytes and expectations; not actual OS Files evidence.','log':'independent/browser-recovery-extra.log'},
  'additionalClearOrdering':{'passed':1,'failed':0,'result':clear['results'][0],'given':'Native C import has committed, acknowledgment is pending, later D selection is queued.','when':'Delay completed-input clear, release C acknowledgment, navigate away/back while clear is pending, then finish clear and cold reload.','expected':'Keep A backup view and D input, hold approval/save while draft write waits, clear old input before saving D, resume D unapproved after cold reload.','actual':{'DHash':Dhash,'durableDraftHash':proof['draft']['sourceHash'],'clearEndEventIndex':end,'DSaveStartEventIndex':start,'coldReloadDUnapproved':True,'CImported':True,'DNotImported':True},'measurementLimit':'Actual native DB and real App, with controlled acknowledgment/clear waits and a late native input event. Not physical device quota or actual OS Files proof.','evidence':['independent/browser-clear.json','independent/browser-clear.log','independent/fixtures/R6U11-clear-observation.json'],'test':'independent-app-clear.mjs'},
  'nativeDatabaseUpgrade':{'passed':1,'failed':0,'result':v1['result'],'evidence':['independent/browser-v1.json','independent/fixtures/R6V01-native-v1.json'],'classification':'Native IndexedDB additive old-v1 schema upgrade using genuine frozen3099 content/bytes/replay and cold reload; not physical OS/browser application update evidence'},
  'production':{'build':'passed isolated npm run build','buildInfo':build,'infoLimitation':'Archive isolation has no.git. unknown/dirty=true is recorded truthfully; product161src and exact dist bytes bound separately. Not release-ready clean-build evidence.','browser':{'passed':4,'failed':0,'source':'Unmodified repository tests/e2e/rb06-recovery.spec.ts at d64; independent Chromium151 on dedicated5325','logs':['independent/production-browser.json','independent/production-browser.log'],'controlledCase':'The new post-native-transaction acknowledgment/late input test is a controlled browser boundary; not physical Files evidence.'}},
  'fixtureValidity':'Generators intentionally not rerun. All original C/D/RD bytes and immutable repo history/legacy inputs matched; current normal App/native import revalidates inputs. Earlier fixture creation2 successes remain historical.'
 },
 'resolvedFindings':resolved,'findings':[],
 'positiveScope':p['positiveScope']+['R6U03 preserves A/資料 after new C completion, including an away-and-back R6U10. Successful clone still opens its restored project when the user stayed.','R6U09 keeps later D confirmation instead of opening C. R6U11 verifies old-input clear precedes durable D save, keeps D during screen movement, and cold reload resumes D unapproved.'],
 'environment':{**p['environment'],'browser':'Chromium151.0.7922.173 /usr/bin/chromium','ports':'Vite5323 / production5325, both stopped'},
 'unexecuted':[
  'Whole original104/116/24/6 and all RB06 not graded; original acceptance given/when/then/negative preserved with historicalnot_run.',
  'Aggregate all-kind/author alternatives/adoption/transitive world/large-asset complete acceptance not independently executed here; parent full suite is separate.',
  'Physical iPhone/iPad OS Files/actual Safari/Chrome/Edge/Firefox matrix, browser OS update, VoiceOver/NVDA/IME/rotation not executed.',
  'Actual interrupted app/cache update, long offline/2hour editing, Standard/Large p95 and real device quota not executed.',
  'Actual Auth/RLS/API/private Storage/two-device reconnect/authorization/revocation and recovered outbox transmission not executed.'
 ],
 'originalPlan':p['originalPlan'],'productRepositoryWrites':False,'evidenceBinding':'SOURCE_COMMIT_BINDING.json covers161src/original15docs/legacy4/all original frozen inputs. ARTIFACT_BINDING.json covers raw logs/test/harness sources/outputs/dist without whitespace trimming.'
}
write('INDEPENDENT_REVIEW.json',report)
(r/'INDEPENDENT_REVIEW.md').write_text(f'''RB06候補 `{c}` / tree `{tree}` の独立再検査を行った。元のR6U09は同じC/Dファイルbytes・正期待で成功した。先のC原子保存後の応答待ちにDをキューへ渡しても、作品Aの復元画面を保ってDの確認へ進む。R6U03と既存通常App境界も8/8成功し、画面往復R6U10も成功した。

追加R6U11では完了入力のclearを遅延させ、Dを確認表示したまま資料へ往復した。clear完了前は確認・保存を待ち、完了後にDを一時保存した。実native IndexedDBのイベント順はclear-end→D save-start、保存hashはDの `{Dhash}` と一致し、cold reload後もDを未承認のまま再開した。Cは一覧に存在し、Dはまだ取り込まれていない。

部品17件、以前の通常App8件、R6U09/10の2件、追加clear/cold1件、native v1/cold1件、production4件が成功した。実Chromium151.0.7922.173、Debian13.6/Linux6.18.44、Node24.19.0、Vitest5.0.3。Appはnative IndexedDB、部品はfake-indexeddb。後続native inputとack/clearの遅延は制御した境界検査であり、実OS Filesダイアログや実端末の証拠ではない。元R6U09の早い2frame観測JSONはD検査開始前のsource=[]を保持し、その後の同じDヘッダー正期待と別R6U11のdurable/cold検査を成功証拠とした。

src161はcommit全件一致し、前候補との製品差はApp.tsx/BackupPanel.tsxの2ファイル。原15資料、旧4fixture、元5ファイル入力と対象commit/tree/成果物hashを結合した。cd38とbd43の負例・全成果物は不変である。元cd38 report SHA `{prior_sha}`、元bd43 report SHA `{bd_sha}`。Vite5323/production5325を停止し、repo製品・既存証拠への編集、commit、pushは行っていない。

隔離archiveは.gitを持たないためproduction build-infoのunknown/dirty=trueをそのまま記録し、clean release証拠に使用しない。今回の実行範囲で新しい問題は見つからなかったが、104要件・116受入・24工程・6回帰群・RB06全体の完成判定は行っていない。全kind/作者案/採用/推移世界/大素材の総合受入、実端末・支援技術・更新・長時間・全性能・実Auth/API/Storageは未実行のままである。
''')
paths={r/'source-manifest.json',r/'SOURCE_COMMIT_BINDING.json',r/'INDEPENDENT_REVIEW.json',r/'INDEPENDENT_REVIEW.md',r/'write-final-review.py',r/'independent-playwright.config.ts'}
paths.update(f for f in(r/'independent').rglob('*')if f.is_file());paths.update(r.glob('tests/independent*.test.ts'));paths.update(f for f in r.glob('independent-app*')if f.is_file());paths.update(f for f in(r/'dist').rglob('*')if f.is_file());a=[{'file':str(f.relative_to(r)),'sha256':sha(f.read_bytes()),'bytes':len(f.read_bytes())}for f in sorted(paths)]
write('ARTIFACT_BINDING.json',{'commit':c,'tree':tree,'artifactCount':len(a),'artifacts':a,'source161AllMatch':True,'rawLogsTrailingWhitespacePreserved':True,'executedScope':{'parts':17,'priorUI':8,'previousAdditionalUI':2,'newClearOrdering':1,'nativeV1':1,'production':4,'notEntirePlanPass':True}})
assert all(sha((r/x['file']).read_bytes())==x['sha256']for x in a)
print(json.dumps({'commit':c,'tree':tree,'parts':17,'priorUI':8,'extra':2,'clear':1,'nativeV1':1,'production':4,'src':161,'artifacts':len(a),'allArtifactHashesMatch':True,'reportSha256':sha((r/'INDEPENDENT_REVIEW.json').read_bytes())},ensure_ascii=False))
