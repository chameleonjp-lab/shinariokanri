from pathlib import Path
import hashlib,json,subprocess,datetime
r=Path('/tmp/shinariokanri-independent-rb05-narrative-7a40c7c')
repo=Path('/workspace/shinariokanri')
old=Path('/tmp/shinariokanri-independent-rb05-narrative-fcc06ca')
commit='7a40c7c52b5e3e2c8058a41bcc78c0113b9e1a0c'
tree='8362d0c22aa9eb9f5732d976227c9b37930795e5'
base='b310800c98bc9a89b93182ad721380a0be99d2d3'
prior='fcc06ca57e8e046b87d231ff0fec65a02099137a'
sha=lambda b: hashlib.sha256(b).hexdigest()
read=lambda p: json.loads(p.read_text())
def write(n,d): (r/n).write_text(json.dumps(d,ensure_ascii=False,indent=2)+'\n')
def git(c,p): return subprocess.check_output(['git','show',c+':'+p],cwd=repo)
manifest=read(r/'source-manifest.json'); previous=read(old/'INDEPENDENT_REVIEW.json'); ob=read(old/'SOURCE_COMMIT_BINDING.json')
assert subprocess.check_output(['git','rev-parse',commit+'^{tree}'],cwd=repo).decode().strip()==tree
files=[]
for m in manifest['files']:
 p=m['file']; b=(r/p).read_bytes(); s=sha(b)
 files.append({'file':p,'sha256':s,'manifestMatches':s==m['sha256'],'commitMatches':b==git(commit,p)})
assert len(files)==155 and all(f['manifestMatches'] and f['commitMatches'] for f in files)
changed=subprocess.check_output(['git','diff','--name-only',prior,commit,'--','src'],cwd=repo).decode().splitlines()
assert changed==['src/ui/Reader.tsx','src/ui/readerDraft.ts']
contracts=[]
for m in ob['originalContracts']:
 p=m['file']; b=(r/p).read_bytes()
 contracts.append({'file':p,'sha256':sha(b),'baseMatches':b==git(base,p),'commitMatches':b==git(commit,p),'priorShaMatches':sha(b)==m['sha256']})
assert len(contracts)==15 and all(m['baseMatches'] and m['commitMatches'] and m['priorShaMatches'] for m in contracts)
legacy=[]
for m in ob['legacyFixtureInputs']:
 p=m['file']; b=(r/p).read_bytes(); legacy.append({'file':p,'sha256':sha(b),'commitMatches':b==git(commit,p),'priorShaMatches':sha(b)==m['sha256']})
assert len(legacy)==4 and all(m['commitMatches'] and m['priorShaMatches'] for m in legacy)
inputs=[]
for n in ['CTX-child-ui-source.json','EN01.json','RD-editions.json','RD-trigger.json','RD-unknown.json']:
 p='independent/fixtures/'+n; b=(r/p).read_bytes(); inputs.append({'file':p,'sha256':sha(b),'sameBytesAsCandidate8':b==(old/p).read_bytes()})
assert all(m['sameBytesAsCandidate8'] for m in inputs)
input_path='tests/fixtures/rb05-reader-editions.json'
b=(r/input_path).read_bytes(); independent=(r/'independent/fixtures/RD-editions.json').read_bytes()
repo_input={'file':input_path,'sha256':sha(b),'commitMatches':b==git(commit,input_path),'sameBytesAsIndependentOriginal':b==independent}
assert repo_input['commitMatches'] and repo_input['sameBytesAsIndependentOriginal']
source_binding={'commit':commit,'tree':tree,'base':base,'sourceFileCount':155,'all155Match':True,'files':files,'changedSourceFromCandidate8':changed,'unchangedSourceCount':153,'originalContracts':contracts,'legacyFixtureInputs':legacy,'independentInputs':inputs,'repositoryFixtureBinding':repo_input}
write('SOURCE_COMMIT_BINDING.json',source_binding)
results=[]
logs=[]
for stem in ['browser-scoped-reuse','browser-reader-lifecycle','browser-reader-ack']:
 d=read(r/'independent'/(stem+'.json')); results.extend(d['results']); logs.append('independent/'+stem+'.log')
assert len(results)==12 and all(x['status']=='passed' and not x['pageErrors'] for x in results)
observation=read(r/'independent/fixtures/RD-replay-reenter-observation.json')
selection=read(r/'independent/fixtures/RD-version-selection-observation.json')
assert observation['selectedVersion']==observation['expectedSavedVersion'] and observation['staleNotice']==[]
assert selection['selectedBeforeNavigation']==selection['selectedAfterNavigation']
oldsha=sha((old/'INDEPENDENT_REVIEW.json').read_bytes())
assert oldsha=='d26b5b3237f6a6210f1f1ffa8752431b15f96be4c778e5269967c87832c001a2'
resolved=[]
for f in previous['findings']:
 resolved.append({'id':f['id'],'requirements':f['requirements'],'reviewReferences':f['reviewReferences'],'given':f['given'],'when':f['when'],'expected':f['expected'],'actual':observation if f['id']=='RD-replay-reenter' else selection,'status':'passed_same_expected_outcome','historicalCandidate8FailurePreserved':True,'evidence':f['evidence']})
report={
 'target':{'commit':commit,'tree':tree,'base':base,'source155Match':True,'frozenAt':manifest['frozenAt'],'verifiedAt':datetime.datetime.now(datetime.timezone.utc).isoformat()},
 'decision':'Both candidate8 edition display/selection differences are repaired with unchanged independent fixture bytes and expected outcomes. No new defect found in the executed focused scope. This is not completion of entire RB05,104 requirements,116 AT,24 stages or6 regression groups.',
 'historicalEvidenceUnchanged':{'candidate8ReportSha256':oldsha,'candidate8OriginalReportSha256':'d26b5b3237f6a6210f1f1ffa8752431b15f96be4c778e5269967c87832c001a2','candidate8Failures':['RD-replay-reenter','RD-version-selection'],'earlier':'candidate7 away-save failure; candidate6 child-return gap; candidate5 scoped failures; a21/5c/32 negatives and0917 freeze-only retained without rewriting'},
 'verification':{'independentParts':{'passed':12,'failed':0,'log':'independent/scoped-reuse-and-preservation.log','cases':{'scopedOriginal':2,'scopedAtomicNativeClone':3,'EN14_18':5,'genuineLegacy':2}},'actualApp':{'passed':12,'failed':0,'results':results,'logs':logs,'browser':'Chromium151.0.7922.173 /usr/bin/chromium','build':'Vite dev exact commit source; actual App/ScenarioStore/native IndexedDB; controlled native save and real crypto.subtle.digest wait/rejection','viewport':'1024x768'},'fixtureValidity':'Frozen input imported through ordinary native validation in actual App. The candidate8 random-ID fixture generator was intentionally not rerun; no candidate9 fixture-generation pass count is claimed.'},
 'resolvedFindings':resolved,
 'repairResults':[
 'RD-replay-reenter: paused saved replay followed by navigation/reenter before completion now selects immutableA together with terminal result; staleNotice is empty.',
 'RD-version-selection: explicitly selected immutableB remains after navigation; the old executed sessionA remains separate evidence.',
 'Same original CTX-child input still passes usual call/exit/return/back/atomic save/cold reload/native/clone. Pending same-view/away-view failure retains state and notice; same-route retry waits for latest props.',
 'Start and replay across project switch isolate operation/session/version. Off-screen hash failure and retry retain tick5 and inputs.',
 'Record digest delay captures original revision0. Normal settings save to1 causes conflict before native store record call; no trace is saved, explicit retry preserves revision0 run and revision1 canonical name.',
 'Actual post-ack old replay is delayed and canceled by navigation. Fresh reentry replay completes and a newer terminal progression stays terminal after old digest release.',
 'Same-turn duplicate call/return/save and manual trigger execute once; unknown gate remains stopped.',
 'Current independent domain12 retain fixed original caller and internal child scopes, finite exception expiry, whole-effect rejection, clocks, partial/stub provenance and tamper refusal, genuine legacy and native/clone compatibility.'
 ],
 'findings':[],
 'environment':previous['environment'],
 'executedCommands':[
 'vitest run tests/independent-scoped-reuse-context.test.ts tests/independent-scoped-reuse-extended.test.ts tests/independent-edition-context-clock.test.ts tests/independent-legacy-frozen.test.ts --maxWorkers=4',
 'node independent-app-scoped-reuse.mjs','node independent-app-reader-lifecycle.mjs','node independent-app-reader-ack.mjs','Vite dedicated port5313; stopped after independent runs'
 ],
 'harnessSetup':'Copied corrected candidate8 harness and unchanged expected outcomes. Only exact isolated source paths/commit labels/port changed. Prior invalid optional-trigger override and drawer selector setup records remain at candidate8 and are not product failures. Trigger/unknown normal author fixtures retain their frozen schema/native-valid bytes.',
 'unexecuted':[
 'Original104 whole requirement grade/116 entire original acceptance cases/24 stages/6 regression groups not run to completion',
 'Prior NP14/EN01-13/UI01-10/53+8 and other earlier evidence remain historical; available copied tests are not reported as executed candidate9 passes',
 'Parent production build/full unit suite/production browser6 are separate; independent runs here use isolated Vite source',
 'Physical iPhone/iPad, full actual OS/browser matrix, VoiceOver/NVDA/IME/Files/recording, long offline, Standard/Large p95 and2hour edit not run',
 'Real two-device Auth/RLS/API/private Storage and external-game actual receipts not run',
 'Cold browser restart during a pending unsaved tab-only Reader operation is not claimed preserved'
 ],
 'originalPlan':previous['originalPlan'],'productRepositoryWrites':False,
 'evidenceBinding':'SOURCE_COMMIT_BINDING.json covers155 src/original15 docs/legacy4/frozen inputs/repository original fixture; ARTIFACT_BINDING.json binds exact output/log bytes without trimming whitespace.'
}
write('INDEPENDENT_REVIEW.json',report)
md=f'''候補9 `{commit}` / tree `{tree}` を隔離して独立レビューした。部品12件、Chromium151の通常App操作12件が成功し、この実行範囲では新しい不具合を確認しなかった。対象製品155 srcはcommit内容と全件一致、候補8との差はReader.tsxとreaderDraft.tsの2ファイルである。

候補8のRD-replay-reenter／RD-version-selectionは、同じfixture bytes・given／when／正しい期待値で成功した。再生待ちに画面へ再入しても旧固定版Aと終端表示が揃い、現稿変更の誤警告は出ない。次回開始用に明示した固定版Bは、旧版Aの実行状態を保持したまま画面往復後も保たれる。RD-editions原fixture SHA256は`{repo_input['sha256']}`であり、製品commitのtests/fixtures/rb05-reader-editions.jsonともbytesが一致した。

通常App検査には固定子graphの呼出し・復帰・巻戻し、原子保存→cold reload→完全保存／clone、同一ターン連打、保存待ち移動・失敗再試行、開始／再生待ちと別作品への切替、基底revision競合、最新props検証中の古い再生完了、triggerとunknown停止を含む。部品検査は固定元有限例外のscopeとtick、全効果原子拒否、partial／stubの保存復元と改ざん拒否、固定旧fixture互換を確認した。

Chromium151.0.7922.173（/usr/bin/chromium）、Debian13.6/Linux6.18.44、Node24.19.0、Vitest5.0.3で実施。Appは隔離したViteの製品ソースとnative IndexedDB、部品保存検査はfake-indexeddb。テスト側で実SHA digestと保存の完了を遅延・失敗させた。専用ポート5313は終了後停止した。

候補8の2失敗とraw logsは変更せず保持し、そのreport SHA256 `{oldsha}`も再一致した。元PDF・要件／受入／計画／契約15ファイル、旧記録4ファイルと原fixture、今回の実結果／raw logsをSOURCE_COMMIT_BINDING.jsonとARTIFACT_BINDING.jsonに結んだ。repo製品・既存証拠への書込み／commit／pushは行っていない。

104要件・116受入・24工程・6回帰群・RB05全体の完成判定ではない。親のproduction／全suiteとは別の証拠であり、過去候補の成功を今回の成功へ換算していない。実iPhone／iPad・支援技術・全性能条件・長時間オフライン・実Auth／API／private Storageは未実行のままである。
'''
(r/'INDEPENDENT_REVIEW.md').write_text(md)
artifacts=[]
paths={r/'source-manifest.json',r/'SOURCE_COMMIT_BINDING.json',r/'INDEPENDENT_REVIEW.json',r/'INDEPENDENT_REVIEW.md',r/'write-final-review.py'}
paths.update(p for p in (r/'independent').rglob('*') if p.is_file())
paths.update(r.glob('tests/independent*.test.ts'))
paths.update(p for p in r.glob('independent-app*') if p.is_file())
for p in sorted(paths):
 b=p.read_bytes(); artifacts.append({'file':str(p.relative_to(r)),'sha256':sha(b),'bytes':len(b)})
write('ARTIFACT_BINDING.json',{'commit':commit,'tree':tree,'artifactCount':len(artifacts),'artifacts':artifacts,'source155AllMatch':True,'rawLogsTrailingWhitespacePreserved':True,'executedScope':{'independentDomainParts':12,'actualAppCases':12,'notEntirePlanPass':True}})
assert all(sha((r/m['file']).read_bytes())==m['sha256'] for m in artifacts)
print(json.dumps({'commit':commit,'tree':tree,'parts':12,'app':12,'src':155,'artifacts':len(artifacts),'allArtifactHashesMatch':True,'reportSha256':sha((r/'INDEPENDENT_REVIEW.json').read_bytes()),'sourceBindingSha256':sha((r/'SOURCE_COMMIT_BINDING.json').read_bytes()),'originalFixtureSha256':repo_input['sha256']},ensure_ascii=False))
