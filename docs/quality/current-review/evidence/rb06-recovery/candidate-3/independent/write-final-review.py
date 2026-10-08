from pathlib import Path
import json,hashlib,subprocess,datetime
r=Path('/tmp/shinariokanri-independent-rb06-cd38e34');repo=Path('/workspace/shinariokanri-rb06')
c='cd38e34d2ccebb1fc07ebbab4a6ca86afb494655';tree='4e416bdaba2a1e3c0d1213a5969e1455531d9dfe';base='b310800c98bc9a89b93182ad721380a0be99d2d3';previous='7a40c7c52b5e3e2c8058a41bcc78c0113b9e1a0c'
sha=lambda b:hashlib.sha256(b).hexdigest()
read=lambda p:json.loads(p.read_text())
def write(n,d):(r/n).write_text(json.dumps(d,ensure_ascii=False,indent=2)+'\n')
def git(commit,p):return subprocess.check_output(['git','show',commit+':'+p],cwd=repo)
m=read(r/'source-manifest.json');files=[]
for x in m['files']:
 p=x['file'];b=(r/p).read_bytes();s=sha(b);files.append({'file':p,'sha256':s,'manifestMatches':s==x['sha256'],'commitMatches':b==git(c,p)})
assert len(files)==161 and all(x['manifestMatches']and x['commitMatches']for x in files)
assert subprocess.check_output(['git','rev-parse',c+'^{tree}'],cwd=repo).decode().strip()==tree
old=read(Path('/tmp/shinariokanri-independent-rb05-narrative-7a40c7c/SOURCE_COMMIT_BINDING.json'));contracts=[];legacy=[]
for x in old['originalContracts']:
 p=x['file'];b=(r/p).read_bytes();contracts.append({'file':p,'sha256':sha(b),'baseMatches':b==git(base,p),'commitMatches':b==git(c,p),'historicalNormativeHashMatches':sha(b)==x['sha256']})
assert len(contracts)==15 and all(x['baseMatches']and x['commitMatches']and x['historicalNormativeHashMatches']for x in contracts)
for x in old['legacyFixtureInputs']:
 p=x['file'];b=(r/p).read_bytes();legacy.append({'file':p,'sha256':sha(b),'commitMatches':b==git(c,p),'historicalShaMatches':sha(b)==x['sha256']})
inputs=[]
for p in ['tests/fixtures/rb06-history.scenario','tests/fixtures/rb05-reader-editions.json']:
 b=(r/p).read_bytes();inputs.append({'file':p,'sha256':sha(b),'commitMatches':b==git(c,p)})
for p in ['C.scenario','C.json','D.scenario','D.json','RD-editions.scenario']:
 f='independent/fixtures/'+p;b=(r/f).read_bytes();inputs.append({'file':f,'sha256':sha(b),'origin':'independent schema/hash validated input; exact bytes to retain for next candidate'})
changed=subprocess.check_output(['git','diff','--name-only',previous,c,'--','src'],cwd=repo).decode().splitlines()
write('SOURCE_COMMIT_BINDING.json',{'commit':c,'tree':tree,'base':base,'sourceFileCount':161,'all161Match':True,'files':files,'changedSourceFromRB05Candidate9':changed,'originalContracts':contracts,'legacyFixtureInputs':legacy,'independentInputs':inputs})
ids={'AT-B12','AT-B23','AT-F35','AT-N06','AT-N09','AT-N11','AT-N14','AT-E07','AT-E12'}
original=read(r/'docs/data/acceptance_cases.json');selected=[x for x in original if x['id']in ids];assert len(selected)==9
reqs=read(r/'docs/data/requirements.json');reqList=reqs if isinstance(reqs,list)else reqs.get('requirements',[])
reqIds={y for x in selected for y in x['requirement_ids']}|{'REQ-N18'}
write('independent/ORIGINAL_CONTRACTS.json',{'source':'docs/data/acceptance_cases.json and requirements.json; copied untouched given/when/then/negative_or_edge and historical result','acceptanceFileSha256':sha((r/'docs/data/acceptance_cases.json').read_bytes()),'requirementsFileSha256':sha((r/'docs/data/requirements.json').read_bytes()),'cases':selected,'requirements':[x for x in reqList if x['id']in reqIds],'currentWholeCaseGrades':'not assigned by this focused review'})
first=read(r/'independent/browser-recovery.json');follow=read(r/'independent/browser-recovery-followup.json');last=read(r/'independent/browser-recovery-followup2.json');app=[x for x in first['results']if x['id']in['R6U01-item-clone-replay','R6U05-history-away-failure','R6U07-file-queue-preview']]+[x for x in follow['results']if x['id']=='R6U06-history-whole-other']+last['results'];app=sorted(app,key=lambda x:x['id']);assert len(app)==8 and sum(x['status']=='passed'for x in app)==7
observation=read(r/'independent/fixtures/R6U03-observation.json');assert observation['before']!=observation['after']
v1=read(r/'independent/browser-v1.json');assert v1['result']['status']=='passed'
production=read(r/'independent/production-browser.json');assert production['stats']['expected']==2 and production['stats']['unexpected']==0
build=read(r/'dist/build-info.json');assert build['commit']=='unknown'and build['dirty']is True
code='src/App.tsx';finding={'id':'R6U03','requirements':['REQ-F35','REQ-N18','REQ-B12'],'reviewReference':'RV16','classification':'reproduced_normal_ui_navigation_overwritten_after_restore','given':'Existing projectA; a native-valid separate projectC archive selected and new restore impact approved.','when':'Start new recovery; delay actual ScenarioStore import. Navigate to 資料 for A while pending, then finish the original atomic import.','expected':'Keep the later projectA/資料 choice; add restoredC to the project list. Open restoredC automatically only when the original recovery view and choice remain active.','actual':observation,'storeResult':'C committed normally; A/B preserved. The defect is later navigation overwritten by completion, not lost archived data.','cause':{'file':code,'sha256':sha((r/code).read_bytes()),'detail':'Backup onImported guards library and active project only; original page/tab and later navigation are not captured. The late openProject changes to restoredC and initialization returns to timeline.'},'contract':'docs/implementation/RB06_RECOVERY.md: 画面移動・作品切替で後の選択を無断で開き直さない; user normal save/move/restore constraints.','source':'independent-app-recovery-followup2.mjs','fixture':'independent/fixtures/C.scenario','evidence':['independent/fixtures/R6U03-observation.json','independent/browser-recovery-followup2.json','independent/browser-recovery-followup2.log','independent/fixtures/R6U03-new-away-completion-projects.json'],'status':'failed_correct_expectation_retained'}
report={
 'target':{'commit':c,'tree':tree,'base':base,'source161Match':True,'frozenAt':m['frozenAt'],'verifiedAt':datetime.datetime.now(datetime.timezone.utc).isoformat()},
 'decision':'One normal navigation difference remains: R6U03 late new recovery changes the later project/view selection. Independently executed recovery/ID/history/atomicity scope otherwise passes; this is not whole RB06/104/116 completion.',
 'verification':{'independentParts':{'passed':17,'failed':0,'logs':['independent/domain-boundaries.log','independent/imported-history.log'],'cases':'R6I01-13 includes4 quota fault stages=16; R6I14=1 imported74-history boundary'},'fixtureValidity':{'passed':2,'failed':0,'logs':['independent/ui-input-validation.log','independent/item-ui-input-validation.log'],'classification':'Input archive schema/hash validity only, not original acceptance completion'},'actualApp':{'passed':7,'failed':1,'results':app,'browser':'Chromium151.0.7922.173 /usr/bin/chromium','viewport':'1024x768','build':'isolated exact cd38e34 Vite source; real App and native IndexedDB','logs':['independent/browser-recovery.log','independent/browser-recovery-followup.log','independent/browser-recovery-followup2.log'],'fileQueueBoundary':'Controlled native file-input change events while a previous operation/ack is pending; no physical OS Files picker evidence claimed'},'nativeDatabaseUpgrade':{'passed':1,'failed':0,'result':v1['result'],'fixture':'genuine3099 frozen1.0 content manually stored through old v1 DB schema; current App opens native IndexedDB v3 and then cold reload; unchanged content, bytes and old terminal replay','source':'independent-app-v1-harness.tsx','evidence':['independent/browser-v1.json','independent/fixtures/R6V01-native-v1.json']},'production':{'build':'passed isolated npm run build','buildInfo':build,'infoLimitation':'Archive isolation contains no .git: build-info truthfully records commit unknown and dirty=true. Product161src independently matched to source commit; executable dist artifacts separately hashed. Not clean release evidence.','browserCases':{'source':'repository tests/e2e/rb06-recovery.spec.ts unchanged; independently rerun on dedicated production port5317','passed':2,'failed':0,'browser':'Chromium151','logs':['independent/production-browser.log','independent/production-browser.json']}}},
 'findings':[finding],
 'positiveScope':[
 'Genuine immutable shared-item trace through empty/new, clone and explicit all-ID mapped merge: stable runtime inventory role, old edition/call execution, terminal, initial tick5, full-origin; reexport still replays.',
 'All74 source commands explicitly mapped into another project keep original project/operation provenance and queued order; duplicate numeric revision lookup safely refuses ambiguity, explicit old operation unit restore retains the target note and published versions.',
 'Arbitrary history beyond50 searchable/paged; single versus whole restoration preserve all original history and immutable editions, append compensating operations, survive empty-environment complete round trip.',
 'Stale/forged history/map approvals refuse, other-role inventory ID collisions remain rejected, missing/duplicate mapping refuses.',
 'All4 quota transaction stages and post-history cancellation roll back content/history/pending/restore point; exact retry works.',
 'Material bytes restore and clone; metadata-only import warns and complete reexport refuses missing bytes. Corrupt hash, unknown required feature and configured limit refuse before mutation.',
 'Portable pending retains exact commands/order/original server base, omits account identity, restores as needs_reconnect, reexports retained intents. Does not prove actual server retransmission or authorization.',
 'Screen-specific pending mapped import/history fail, navigation/reentry/project switch, retry, stale target preview, queued later file selection/ack and cold import-draft retention pass.',
 'Genuine old branch/chapter fixture bytes and conservative chapter partial provenance remain, including native v1 additive operational-table upgrade and cold startup.'
 ],
 'harnessCorrections':[
 'independent/setup-build-type: first build checked additional independent test literal typing/nonexistent trace field. Corrected review source and genuine checkpoint partial provenance expectation; original logs retained; product source unchanged.',
 'independent/SETUP_CORRECTIONS.md: first browser setup used wrong current DOM/settings labels, selected a not-yet-ready preview conflict and mismatched Playwright whitespace; fixed normal selectors/waits/evaluate argument. Preserve original attempts, final8 role-classified results above.',
 'independent/setup-imported-history-field: corrected expected PortableRecovery source item.origin access, same frozen file and expected original operation IDs. Rerun passed.'
 ],
 'environment':{'os':'Debian GNU/Linux13.6','kernel':'6.18.44','architecture':'x86_64','node':'v24.19.0','vitest':'5.0.3','componentDB':'fake-indexeddb','appDB':'actual Chromium native IndexedDB','faultControl':'Test harness waits/rejects actual store calls and post-commit ack; product source untouched','ports':'Vite5315 / production5317, both stopped'},
 'unexecuted':[
 'Entire original104 requirements/116 acceptance/24 stages/6 regression groups/RB06 completion not graded. Original given/when/then/negative and historical not_run retained separately.',
 'No independent aggregate all-kind+author alternatives+adoption+transitive worlds+large assets acceptance proof in this focused run; parent full-kind unit fixtures/full suite separate. Positive earlier evidence remains historical, not reused as current pass.',
 'Physical iPhone/iPad Files, actual OS/browser update matrix, Safari/Chrome/Edge/Firefox actual versions across targets, VoiceOver/NVDA/IME/rotation not executed.',
 'Actual app update/cache interrupted transition, long offline/2hour editing, Standard/Large p95/limits on devices and device quota exhaustion not executed.',
 'Actual two-device Auth/RLS/API/private Storage reconnect/pending send rights/revocation not executed. Pending quarantine test is local only.',
 'R6U03 failed correct expected outcome; completion hold remains until same-fixture review of next fixed candidate.'
 ],
 'parentReportsSeparate':'Parent reported full664unit/56production/Python/docs/plan/schema checks on cd38 and retained earlier5s watchdog timeout. Not independent current evidence or original AT pass; no parent raw-log bytes copied into this report.',
 'originalPlan':{'requirements':104,'acceptanceCases':116,'stages':24,'regressionGroups':6,'notReduced':True,'historicalBaselineAndDesignRegistryNotCurrentGrade':True},'productRepositoryWrites':False,'evidenceBinding':'SOURCE_COMMIT_BINDING.json binds161src/original15docs/legacy4/current fixtures; ARTIFACT_BINDING.json binds exact test source, fixtures, raw logs and dist bytes. Raw trailing whitespace preserved.'
}
write('INDEPENDENT_REVIEW.json',report)
(r/'INDEPENDENT_REVIEW.md').write_text(f'''RB06候補 `{c}` / tree `{tree}` を隔離して独立レビューした。部品17件、fixtureの検査2件、実Chromium native IndexedDBの旧v1→v3移行1件、production既存復元2件が成功。通常App境界は7件成功・1件不合格である。元104要件・116受入・24工程・6回帰群・RB06全体の完成判定は行わない。

未修正のR6U03は、作品Aの新規C復元を開始し、保存待ち中に資料Aへ移動すると、完了でCの年表へ自動移動する。正期待は後の作品A・資料選択を保持し、Cを一覧へ追加すること。復元内容の原子保存は成功している。Appの完了処理が作品/一覧だけを確認してopenProjectを呼ぶため、後の画面移動を上書きする。fixture `independent/fixtures/C.scenario` と実観測 `independent/fixtures/R6U03-observation.json`、正期待失敗logを保持した。

共有物品IDの旧固定経路は、新規/clone/全ID対応の別作品統合でもterminal・tick5・個体ID・旧pinを保った。74件の元履歴・送信待ちと出所を別作品へ写し、重複revisionの曖昧参照は拒否し、明示した操作IDから単体復元できた。旧任意版検索、単体/全体復元、4原子quota段階・書込後取消、変更後/偽造承認拒否、素材bytes/不足、破損/未知/量拒否、入力cold再開・保存失敗再入・別作品・ファイル待機を検査した。

部品保存はfake-indexeddb、App/旧v1 DB/productionはChromium151.0.7922.173（/usr/bin/chromium）のnative IndexedDB。Debian13.6/Linux6.18.44、Node24.19.0、Vitest5.0.3。Vite5315・production5317は停止済み。productionの2件は既存testを独立実行した。隔離archiveには.gitが無いためbuild-infoはcommit=unknown/dirty=trueであり、完成版release証拠には使わない。161srcのcommit一致と実行成果物hashは別に結んだ。

製品・repo既存証拠は変更していない。review harnessの初回型/セレクタ/同期/期待出所欄の訂正前sourceとlogsも保存し、製品差と区別した。元15規範資料と4旧fixtureのhash・原9受入のgiven/when/then/negativeを保持した。

全kind/作者案/採用/推移世界/大素材を同時に含む総合受入、実端末Files/OS更新/支援技術/長時間/全性能、実Auth/RLS/API/Storageは、この局所レビューの合格へ換算していない。親の全suite/production成功は別証拠である。
''')
paths={r/'source-manifest.json',r/'SOURCE_COMMIT_BINDING.json',r/'INDEPENDENT_REVIEW.json',r/'INDEPENDENT_REVIEW.md',r/'write-final-review.py',r/'independent-playwright.config.ts'}
paths.update(p for p in (r/'independent').rglob('*')if p.is_file());paths.update(p for p in r.glob('independent-app*')if p.is_file());paths.update(r.glob('tests/independent*.test.ts'));paths.update(p for p in(r/'dist').rglob('*')if p.is_file())
a=[{'file':str(p.relative_to(r)),'sha256':sha(p.read_bytes()),'bytes':len(p.read_bytes())}for p in sorted(paths)]
write('ARTIFACT_BINDING.json',{'commit':c,'tree':tree,'artifactCount':len(a),'artifacts':a,'source161AllMatch':True,'rawLogsTrailingWhitespacePreserved':True,'executedScope':{'independentParts':17,'actualAppPassed':7,'actualAppFailed':1,'nativeV1':1,'repositoryProductionCases':2,'fixtureValidityOnly':2,'notEntirePlanPass':True}})
assert all(sha((r/x['file']).read_bytes())==x['sha256']for x in a)
print(json.dumps({'commit':c,'tree':tree,'parts':17,'app':'7pass1fail','nativeV1':1,'production':2,'src':161,'artifactCount':len(a),'allArtifactHashesMatch':True,'reportSha256':sha((r/'INDEPENDENT_REVIEW.json').read_bytes())},ensure_ascii=False))
