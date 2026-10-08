from pathlib import Path
import json,hashlib,subprocess,datetime
r=Path('/tmp/shinariokanri-independent-rb06-bd43ca7');old=Path('/tmp/shinariokanri-independent-rb06-cd38e34');repo=Path('/workspace/shinariokanri-rb06')
c='bd43ca75f8cddccf93fcca1e762b8ba650c61bbb';tree='34d55a28311595770a8ddc0a5a48ac63d66a7999';previous='cd38e34d2ccebb1fc07ebbab4a6ca86afb494655';base='b310800c98bc9a89b93182ad721380a0be99d2d3'
sha=lambda b:hashlib.sha256(b).hexdigest();read=lambda p:json.loads(p.read_text())
def write(n,d):(r/n).write_text(json.dumps(d,ensure_ascii=False,indent=2)+'\n')
def git(commit,p):return subprocess.check_output(['git','show',commit+':'+p],cwd=repo)
m=read(r/'source-manifest.json');p=read(old/'INDEPENDENT_REVIEW.json');ob=read(old/'SOURCE_COMMIT_BINDING.json');files=[]
for x in m['files']:
 f=x['file'];b=(r/f).read_bytes();s=sha(b);files.append({'file':f,'sha256':s,'manifestMatches':s==x['sha256'],'commitMatches':b==git(c,f)})
assert len(files)==161 and all(x['manifestMatches']and x['commitMatches']for x in files)
assert subprocess.check_output(['git','rev-parse',c+'^{tree}'],cwd=repo).decode().strip()==tree
changed=subprocess.check_output(['git','diff','--name-only',previous,c,'--','src'],cwd=repo).decode().splitlines();assert changed==['src/App.tsx']
contracts=[]
for x in ob['originalContracts']:
 f=x['file'];b=(r/f).read_bytes();contracts.append({'file':f,'sha256':sha(b),'baseMatches':b==git(base,f),'commitMatches':b==git(c,f),'originalHashMatches':sha(b)==x['sha256']})
assert len(contracts)==15 and all(x['baseMatches']and x['commitMatches']and x['originalHashMatches']for x in contracts)
legacy=[]
for x in ob['legacyFixtureInputs']:
 f=x['file'];b=(r/f).read_bytes();legacy.append({'file':f,'sha256':sha(b),'commitMatches':b==git(c,f),'oldHashMatches':sha(b)==x['sha256']})
assert all(x['commitMatches']and x['oldHashMatches']for x in legacy)
inputs=[]
for x in ob['independentInputs']:
 f=x['file'];b=(r/f).read_bytes();inputs.append({'file':f,'sha256':sha(b),'sameBytesAsCd38':b==(old/f).read_bytes(),**({'commitMatches':b==git(c,f)}if f.startswith('tests/')else{})})
assert all(x['sameBytesAsCd38']for x in inputs)
write('SOURCE_COMMIT_BINDING.json',{'commit':c,'tree':tree,'base':base,'sourceFileCount':161,'all161Match':True,'files':files,'changedSourceFromPrevious':changed,'unchangedSourceCount':160,'originalContracts':contracts,'legacyFixtureInputs':legacy,'independentInputs':inputs})
app=read(r/'independent/browser-recovery.json');assert len(app['results'])==8 and all(x['status']=='passed'for x in app['results']);extra=read(r/'independent/browser-recovery-extra.json');assert len(extra['results'])==2 and extra['results'][0]['status']=='failed'and extra['results'][1]['status']=='passed';v1=read(r/'independent/browser-v1.json');assert v1['result']['status']=='passed';production=read(r/'independent/production-browser.json');assert production['stats']['expected']==3 and production['stats']['unexpected']==0
build=read(r/'dist/build-info.json');assert build['commit']=='unknown'and build['dirty']is True
prior_sha=sha((old/'INDEPENDENT_REVIEW.json').read_bytes());assert prior_sha=='84c2ee90b7a5181100035496a79f2769eb42dffdf42374a2cb7d248df72ba982'
observation=read(r/'independent/fixtures/R6U09-observation.json');assert observation['before']!=observation['after']and observation['source']==[]
resolved={**p['findings'][0],'status':'passed_same_frozen_C_bytes_and_expected_outcome','actual':read(r/'independent/fixtures/R6U03-observation.json'),'evidence':['independent/browser-recovery.json','independent/browser-recovery.log','independent/fixtures/R6U03-observation.json']};assert resolved['actual']['before']==resolved['actual']['after']
finding={'id':'R6U09','requirements':['REQ-F35','REQ-N18'],'reviewReference':'RV16','classification':'reproduced_controlled_pending_file_selection_boundary','given':'Existing A view has approved a new native-valid C archive. C has atomically saved, but its Promise acknowledgment to the view is controlled and delayed.','when':'Deliver a later D file-input change while acknowledgment is pending, then complete C acknowledgment without navigating away.','expected':'Keep the original recovery view and process the later queued D selection; add C to the list without hiding the later selection.','actual':observation,'impact':'Later D source confirmation is hidden because C is auto-opened. D remains in old A-key tab-memory queuedFiles; permanent deletion is not claimed. The existing persistent A input still points to C until A view resumes.','cause':{'file':'src/ui/BackupPanel.tsx','sha256':sha((r/'src/ui/BackupPanel.tsx').read_bytes()),'appSha256':sha((r/'src/App.tsx').read_bytes()),'detail':'Queued file change sets only queuedFiles; it neither updates App navigation epoch nor communicates a later-selection intent to onImported. C acknowledgment still opens C and changes BackupPanel project key, so oldA queue cannot be processed on the active view.'},'measurementLimit':'Controlled native file-input event in actual Chromium, equivalent to resolving a pending selection. Not proof of an actual OS Files dialog operation; visible input is disabled during busy.','source':'independent-app-recovery-extra.mjs','fixture':'independent/fixtures/D.scenario (same bytes as cd38)','evidence':['independent/fixtures/R6U09-observation.json','independent/browser-recovery-extra.json','independent/browser-recovery-extra.log'],'status':'failed_correct_expected_outcome_retained'}
report={
 'target':{'commit':c,'tree':tree,'base':base,'source161Match':True,'frozenAt':m['frozenAt'],'verifiedAt':datetime.datetime.now(datetime.timezone.utc).isoformat()},
 'decision':'Original R6U03 repaired with same fixtures/expectations and all8 prior UI cases pass. New controlled post-save file-selection queue boundary R6U09 remains; not whole RB06/104/116 completion.',
 'historicalEvidenceUnchanged':{'cd38ReportSha256':prior_sha,'originalCd38ReportSha256':'84c2ee90b7a5181100035496a79f2769eb42dffdf42374a2cb7d248df72ba982','R6U03FailurePreserved':True,'priorRawLogsAndFixtureBytesUnchanged':True},
 'verification':{'independentParts':{'passed':17,'failed':0,'log':'independent/domain-boundaries.log','cases':'Same R6I01-14 test sources and semantic expectations; absolute output paths changed only'},'priorActualAppBoundaries':{'passed':8,'failed':0,'results':app['results'],'logs':['independent/browser-recovery.json','independent/browser-recovery.log'],'browser':'Chromium151.0.7922.173 /usr/bin/chromium','viewport':'1024x768','build':'isolated exact bd43 source via Vite; actual App/native IndexedDB'},'additionalBoundaries':{'passed':1,'failed':1,'results':extra['results'],'classification':'R6U10 normal navigation-roundtrip pass; R6U09 controlled later native file-input change at post-save ack fails. Not actual OS Files evidence.','log':'independent/browser-recovery-extra.log'},'nativeDatabaseUpgrade':{'passed':1,'failed':0,'result':v1['result'],'evidence':['independent/browser-v1.json','independent/fixtures/R6V01-native-v1.json'],'classification':'Native IndexedDB additive old-v1 schema upgrade with genuine frozen3099 content/bytes/replay and cold reload; not physical OS/browser application update evidence'},'production':{'build':'passed isolated npm run build','buildInfo':build,'infoLimitation':'Archive isolation has no.git. unknown/dirty=true is preserved truthfully; product161src and exact dist bytes bound separately. Not release-ready clean build evidence.','browser':{'passed':3,'failed':0,'source':'repository tests/e2e/rb06-recovery.spec.ts unchanged at bd43; independent Chromium151 run on dedicated5321','logs':['independent/production-browser.json','independent/production-browser.log']}},'fixtureValidity':'Input generator tests intentionally not rerun to preserve original C/D/RD bytes. Current SHA matched; ordinary current App/native import revalidates archives. Earlier2 fixture creation pass counts remain historical.'},
 'resolvedFindings':[resolved],'findings':[finding],
 'positiveScope':p['positiveScope']+['Same-source R6U03 preserves A/資料 after newC completes; separate roundtrip back to original backup view preserves later navigation epoch and does not openC. Staying in original view still opens the successful clone via R6U01.'],
 'environment':{**p['environment'],'ports':'Vite5319 / production5321, both stopped'},
 'unexecuted':[
 'Whole original104/116/24/6 or all RB06 not graded; original acceptance given/when/then/negative preserved with historicalnot_run.',
 'Aggregate all-kind/author alternatives/adoption/transitive world/large-asset complete acceptance not independently executed here; parent full suite is separate.',
 'Physical iPhone/iPad OS Files/actual Safari/Chrome/Edge/Firefox matrix, browser OS update, VoiceOver/NVDA/IME/rotation not executed.',
 'Actual interrupted app/cache update, long offline/2hour editing, Standard/Large p95, real device quota not executed.',
 'Actual Auth/RLS/API/private Storage/two-device reconnect/authorization/revocation and recovered outbox transmission not executed.',
 'R6U09 controlled selection queue is failed; no whole acceptance completion conversion.'
 ],
 'originalPlan':p['originalPlan'],'productRepositoryWrites':False,'evidenceBinding':'SOURCE_COMMIT_BINDING.json covers161src/original15docs/legacy4/all original frozen inputs. ARTIFACT_BINDING.json covers raw logs/test/harness sources/outputs/dist without whitespace trimming.'
}
write('INDEPENDENT_REVIEW.json',report)
(r/'INDEPENDENT_REVIEW.md').write_text(f'''RB06候補 `{c}` / tree `{tree}` の独立再検査を行った。元R6U03と既存7通常App境界は8/8成功、同fixtureの部品17件・native v1/cold1件・production3件も成功した。src161はcommit全件一致、前候補との製品差はApp.tsxだけである。

元の保存待ち中の資料移動と、追加の往復境界R6U10は後の作品A/画面を保ち、Cを一覧に追加した。元の同画面clone成功では復元した作品を開く挙動も保たれた。前候補cd38のR6U03失敗report SHA `{prior_sha}`と旧raw logs/fixtureは変更していない。

追加のR6U09は不合格。新規Cが原子保存済みで完了応答を待つ間に、後続Dのfile-input changeをキューへ渡すと、C完了処理がCを開き、Dの確認画面は隠れる。Dは旧Aキーのタブ内キューに残るため永久消失とは判定しない。正期待は元の復元画面で後続Dを引継ぐこと。Appの画面epochはqueuedFiles更新を観測せず、完了でproject keyが変わり旧Aキューの処理が止まる。`independent/fixtures/R6U09-observation.json`と正期待失敗logを保持した。

R6U09は実Chromium native inputの後続changeを制御注入した保存待ち境界であり、busy中の可視inputはdisabledである。実OS Filesダイアログの操作証拠には換算しない。Chromium151.0.7922.173、Debian13.6/Linux6.18.44、Node24.19.0、Vitest5.0.3。Appはnative IndexedDB、部品はfake-indexeddb。Vite5319/production5321は停止した。

原15規範資料・旧4fixture・元C/D/RD入力bytesと対象commit/tree/source/実行成果物のhashを結んだ。productionは隔離archiveから作成したのでbuild-infoはunknown/dirty=trueをそのまま記録し、clean release証拠に使わない。repo製品/既存証拠への編集・commit・pushは行わない。

104要件・116受入・24工程・6回帰群・RB06全体の完成判定は行っていない。全kind/作者案/採用/推移世界/大素材の総合受入、実端末/支援技術/更新/長時間/全性能/実Auth/API/Storageは未実行のままである。
''')
paths={r/'source-manifest.json',r/'SOURCE_COMMIT_BINDING.json',r/'INDEPENDENT_REVIEW.json',r/'INDEPENDENT_REVIEW.md',r/'write-final-review.py',r/'independent-playwright.config.ts'};paths.update(p for p in(r/'independent').rglob('*')if p.is_file());paths.update(r.glob('tests/independent*.test.ts'));paths.update(p for p in r.glob('independent-app*')if p.is_file());paths.update(p for p in(r/'dist').rglob('*')if p.is_file());a=[{'file':str(f.relative_to(r)),'sha256':sha(f.read_bytes()),'bytes':len(f.read_bytes())}for f in sorted(paths)]
write('ARTIFACT_BINDING.json',{'commit':c,'tree':tree,'artifactCount':len(a),'artifacts':a,'source161AllMatch':True,'rawLogsTrailingWhitespacePreserved':True,'executedScope':{'parts':17,'priorUI8':8,'additionalUI1':'passed','additionalQueue1':'failed','nativeV1':1,'production':3,'notEntirePlanPass':True}});assert all(sha((r/x['file']).read_bytes())==x['sha256']for x in a)
print(json.dumps({'commit':c,'tree':tree,'parts':17,'originalUI':8,'extra':'1pass1fail','nativeV1':1,'production':3,'src':161,'artifacts':len(a),'allArtifactHashesMatch':True,'reportSha256':sha((r/'INDEPENDENT_REVIEW.json').read_bytes())},ensure_ascii=False))
