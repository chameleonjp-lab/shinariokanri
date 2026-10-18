"""Build an authored original-clause overlay from fresh, fully verified evidence."""
import argparse,hashlib,json,re,sys,subprocess
from pathlib import Path
from datetime import datetime,timezone
p=argparse.ArgumentParser();p.add_argument('--repository',type=Path,required=True);p.add_argument('--binding',type=Path,required=True);p.add_argument('--ci',type=Path,required=True);p.add_argument('--formal-assessment',type=Path,required=True);p.add_argument('--supplement-assessment',type=Path,required=True);p.add_argument('--resource-assessment',type=Path,required=True);p.add_argument('--decisions',type=Path,required=True);p.add_argument('--output',type=Path,required=True);p.add_argument('--release-proof',type=Path);p.add_argument('--delivery-proof',type=Path);a=p.parse_args()
repo=a.repository.resolve();out=a.output.resolve();out.mkdir(exist_ok=False);sys.path.insert(0,str(repo/'scripts'))
from check_phase3 import loads,require
from phase3_trace_proofs import verify_trace_inputs,verify_clause_refs,verify_procedure_source
sha=lambda b:hashlib.sha256(b).hexdigest();read=lambda p:loads(p.read_bytes());binding=read(a.binding);product=binding['build_info'];ci=read(a.ci/'RETENTION.json');formal=read(a.formal_assessment);supp=read(a.supplement_assessment);resource=read(a.resource_assessment);log_index=read(a.ci/'actual-log-index.json')
verify_trace_inputs(binding,ci,formal,supp,resource)
require(log_index['head']==binding['commit'] and log_index['unit']['files']==148 and log_index['unit']['tests']==1390,'Original complete unit proof missing')
original=read(repo/'docs/data/acceptance_cases.json');tasks=read(repo/'docs/data/completion_tasks.json');packages=read(repo/'docs/data/work_packages.json');regressions=read(repo/'docs/data/completion_acceptance.json')['regression_groups'];supplemental=read(repo/'docs/review-2026-10-11/supplemental_acceptance.json');protocol=read(repo/'docs/quality/pr49-followup-2026-10-15/CLAUSE_REVIEW.json');old={r['id']:r for r in protocol['cases']}
if isinstance(supplemental,dict):supplemental=supplemental['cases']
require((len(tasks),len(original),len(packages),len(regressions),len(supplemental))==(104,116,24,6,68),'Original inventory differs')
external={
 'AT-B24':'実タッチ端末でマウスなしの絞込・関係線・条件編集が未実行。',
 'AT-F01':'実スマートフォンの保存・録音拒否と、専用Authを使う実PCへの同期が未実行。',
 'AT-F29':'専用実Authのreviewerによる原指摘と役割権限が未実行。',
 'AT-F30':'専用実Auth/DataAPI/private Storageの実役割・直接API・撤回と失効が未実行。',
 'AT-F31':'実回転・SplitView・ソフトキーボードとスマートフォン単独の総合編集が未実行。',
 'AT-F33':'実PCと実スマートフォンの独立表示設定・同内容受渡しが未実行。',
 'AT-F34':'専用実Authと実二端末の機内モード編集・削除対編集・競合解決が未実行。',
 'AT-F42':'対象ゲームのengine/version/adapterと実戦闘結果が未指定。汎用受信例は別証拠。',
 'AT-N02':'原対象端末表の実iPhone/iPad/PCとOS/browserによる総合試験が未実行。',
 'AT-N03':'実VoiceOver/NVDAによる焦点・読上げ・エラー・完了通知が未実行。',
 'AT-N04':'原指定の実測対象端末での各30回・p95が未実行。Linux正式結果と区別する。',
 'AT-N07':'専用Authと実オフライン二端末の順逆同期・再送・収束が未実行。',
 'AT-N08':'専用実非メンバー/限定閲覧者の直接DataAPI/private素材取得拒否が未実行。',
 'AT-N11':'実OS機内モードと実未取得remote素材の利用状態が未実行。browser offlineと区別する。',
 'AT-N13':'実OS日本語IME変換途中の操作キー・保存・検索・出力・復元が未実行。',
 'AT-N17':'許可済み専用構成の実tier/region/使用量/残量/費用と検証URLが未指定。',
 'AT-E01':'実iPhoneだけの一連操作・回転・ソフトキーボード・OS Files取消が未実行。',
 'AT-E05':'実限定共有snapshotと実Auth/直接API/private Storage/権限撤回が未実行。',
 'AT-E06':'専用実Authと二端末のoffline同本文/削除/順逆重複送信・容量/失効が未実行。',
 'AT-E10':'原thenの対象ゲーム実結果が未指定。Linux汎用receiverのactual receiptは代替しない。',
 'AT-E11':'原実端末・VoiceOver/OS文字拡大/日本語IME/指定性能の総合条件が未実行。',
 'AT-E12':'実旧アプリbuild更新・OS機内モード・実未取得素材・OS Files保存先取消が未実行。'}
require(len(external)==22,'External inventory differs')
native_scope={
 'AT-B23':'共有author fingerprintの不変比較は6表。全21表raw snapshotの主張ではない。',
 'AT-F32':'keyboardは対象へのfocus後のキー操作、200%はCSS補助。自然なTab順・実OS拡大・支援技術は別条件。',
 'AT-F35':'pending置換拒否に加え、同じ原ファイルを使うローカルHTTP通常bootstrap後の置換成功・全author/sync表rollback・再試行・coldを実証。実Hosted Auth/RLS/実二端末同期は未実行。',
 'AT-F56':'共有author fingerprintは6表。型・参照・cold値は原assertと実完全出力を別に照合。',
 'AT-F58':'共有author fingerprintは6表。表示ID集合、取消、書込失敗、補償の原assertと実ファイルを結合。',
 'AT-N06':'旧native10→現在80。注入したschema failure位置と原複数対象quota/retryを支持し、v8全migrationの全故障位置とはしない。',
 'AT-N09':'7固定negative・追加broken-container・実3完全出力。拒否直後15表不変は原assertであり15表raw snapshot添付の主張ではない。',
 'AT-N20':'原未対応契約fixtureの安全出力はreader.md（351 bytes）。runtime.json（18,611 bytes）は別の対応済みinteger契約fixtureによる補助正常系であり、同じ入力のthen根拠と混同しない。',
 'AT-N16':'共有author fingerprintは6表。三値・規則・エラーコードは原UI/純粋処理と新実添付が根拠。'}
source_rows={r['path']:r for r in binding['source_files']+binding['original_documents']}
# The original requirement registry also references four implementation guides.
# They are documentation outside the measurement-source inventory; bind their
# actual unchanged bytes to the measured Git object instead of inventing a seal.
require(subprocess.check_output(['git','cat-file','commit',binding['commit']],cwd=repo)==binding['sourceProof']['commit'].encode(),'Measured guide commit differs from original candidate proof')
for path in sorted({path for task in tasks for path in task['code_paths']}-set(source_rows)):
 require(path in {'docs/implementation/EXPORT_COMPATIBILITY.md','docs/implementation/PROGRESS.md','docs/implementation/RELEASE.md','docs/implementation/USER_GUIDE.md'},'Unmapped original requirement reference')
 data=subprocess.check_output(['git','show',binding['commit']+':'+path],cwd=repo)
 require((repo/path).read_bytes()==data,'Current implementation guide differs from measured candidate')
 source_rows[path]=dict(path=path,bytes=len(data),sha256=sha(data),gitBlob=hashlib.sha1(b'blob '+str(len(data)).encode()+b'\0'+data).hexdigest(),verifiedGitCommit=binding['commit'],scope='Original guide reference outside measurement inventory; actual current bytes equal the measured Git blob')

def descriptor(path):
 data=path.read_bytes();return dict(path=str(path),bytes=len(data),sha256=sha(data))
decisions=read(a.decisions)
require(decisions['format']=='phase3-authored-clause-decisions/1' and decisions['product']==product and decisions['independentHumanReleaseAcceptance'] is False,'Missing explicit same-candidate author clause decisions')
expected_inputs={name:descriptor(path) for name,path in [('candidate',a.binding),('ci',a.ci/'RETENTION.json'),('actualLogs',a.ci/'actual-log-index.json'),('formal',a.formal_assessment),('supplements',a.supplement_assessment),('resources',a.resource_assessment)]}
for engine in ('chromium','firefox','webkit'):expected_inputs['caseIndex-'+engine]=descriptor(a.ci/('case-index-'+engine+'.json'))
for key,path in [('release',a.release_proof),('delivery',a.delivery_proof)]:
 if path:expected_inputs[key]=descriptor(path)
require(decisions['proofInputs']==expected_inputs,'Authored decisions are not pinned to all fresh actual proof bytes')
require(len(decisions['cases'])==116 and len({r['id'] for r in decisions['cases']})==116 and {r['id'] for r in decisions['cases']}=={r['id'] for r in original},'Explicit authored case inventory differs')
authored={r['id']:r for r in decisions['cases']}
def explicit_reviews(field, originals, allowed):
 rows=decisions.get(field,[])
 require(len(rows)==len(originals) and len({r['id'] for r in rows})==len(rows) and {r['id'] for r in rows}=={r['id'] for r in originals},'Explicit original review inventory differs: '+field)
 reviews={r['id']:r for r in rows}
 for original in originals:
  review=reviews[original['id']]
  original_bytes=json.dumps(original,ensure_ascii=False,sort_keys=True,separators=(',',':')).encode()
  require(review['originalSHA256']==sha(original_bytes) and review['result'] in allowed and len(review['authorObservation'])>=20 and review['evidenceRefs'],'Missing authored original reading or evidence: '+original['id'])
  require(all(ref in expected_inputs for ref in review['evidenceRefs']),'Unknown fresh proof reference: '+original['id'])
 return reviews
package_reviews=explicit_reviews('workPackages',packages,{'passed_local_gate_scope','blocked_original_gate_conditions'})
regression_reviews=explicit_reviews('regressions',regressions,{'passed_local_original_conditions','partial_local_original_conditions_real_IME_not_run','partial_local_original_conditions_physical_performance_not_run'})
supplement_reviews=explicit_reviews('supplemental',supplemental,{'passed_local_original_conditions','blocked_original_external_conditions','partial_local_support_original_conditions_remain','unadopted_not_implemented'})
for identity in ('WP02','WP07','WP17','WP18','WP23','WP24'):require(package_reviews[identity]['result']=='blocked_original_gate_conditions','Original physical/live/release package condition was promoted')
require(regression_reviews['RG-R01']['result']=='partial_local_original_conditions_real_IME_not_run' and regression_reviews['RG-R06']['result']=='partial_local_original_conditions_physical_performance_not_run','Original physical regression condition was promoted')
for check in supplemental:
 result=supplement_reviews[check['id']]['result']
 if check['owner_id'].startswith('X'):require(result=='unadopted_not_implemented','Unadopted extension was promoted')
 if check['owner_id'] in ('G09','G10','G11','G12') or check['id']=='AC-G06-N':require(result=='blocked_original_external_conditions','Original supplemental external condition was promoted')
def small(value,depth=0):
 if isinstance(value,dict):
  if depth>=3:return {k:v for k,v in value.items() if isinstance(v,(str,int,float,bool,type(None))) and len(str(v))<300}
  return {k:small(v,depth+1) for k,v in value.items() if k not in ('assetData','runtimeProject','publicProjection','base64')}
 if isinstance(value,list):return [small(v,depth+1) for v in value] if len(value)<=3 else dict(count=len(value),first=small(value[0],depth+1),last=small(value[-1],depth+1))
 return value if not isinstance(value,str) or len(value)<300 else value[:280]+'… (full actual attachment retained)'
cases=[];bycase={}
for case in original:
 previous=old[case['id']];sources=[]
 for row in previous['procedureSources']:
  current=source_rows[row['path']];reviewed_change=verify_procedure_source(current,row)
  data=(repo/row['path']).read_bytes();require(len(data)==current['bytes'] and sha(data)==current['sha256'],'Current case procedure differs from sealed product')
  sources.append(dict(**current,oldSourceSHA256=row['sha256'],reviewedChange=reviewed_change))
 decision=authored[case['id']];require(decision['wholeCaseResult'] in ('passed','blocked'),'Unauthored whole-case outcome')
 if case['id'] in external:require(decision['wholeCaseResult']=='blocked','Original external condition was promoted')
 require(len(decision['clauses'])==4 and {r['name'] for r in decision['clauses']}=={'given','when','then','negative_or_edge'},'Explicit four-clause decisions missing')
 clauses=[]
 for key in ('given','when','then','negative_or_edge'):
  prior=next(c for c in previous['clauses'] if c['name']==key);require(prior['original']==case[key],'Original clause wording differs')
  interpretation=prior['authorSourceObservation']
  if case['id']=='AT-N06':interpretation={'given':'元の旧native10コピー、現行native80と複数対象保存を使用。','when':'原schema failureと複数対象quotaを注入し通常再試行。','then':'原native比較・全変更確定・coldと履歴を新実結果で照合。','negative_or_edge':'部分確定と偽の保存済み表示を原assertで拒否。全migration故障位置の主張はしない。'}[key]
  explicit=next(r for r in decision['clauses'] if r['name']==key);require(explicit['originalSHA256']==sha(case[key].encode()) and len(explicit['authorObservation'])>=12 and explicit['evidenceRefs'],'Explicit clause reading/hash/evidence missing')
  verify_clause_refs(explicit['evidenceRefs'],set(expected_inputs),case['id'] not in external,case['id'],supp)
  require(explicit['result'] in ('passed_local_original_conditions','blocked_original_external_conditions','not_accepted_missing_evidence'),'Unknown authored clause outcome')
  if decision['wholeCaseResult']=='passed':require(explicit['result']=='passed_local_original_conditions','Whole case accepted without four explicit positive decisions')
  clauses.append(dict(name=key,original=case[key],protocolInterpretation=interpretation,interpretationScope='Original protocol/source reading checked against current retained source. This interpretation is not an old execution outcome.',result=explicit['result'],authorObservation=explicit['authorObservation'],evidenceRefs=explicit['evidenceRefs'],limitation=external.get(case['id'])))
 row=dict(id=case['id'],requirementIds=case['requirement_ids'],originalWorkPackage=case['package_id'],clauses=clauses,procedureSources=sources,actualEvidence=[],freshObservedFacts=[],wholeCaseResult=decision['wholeCaseResult'],limitation=external.get(case['id']),scopeNote=native_scope.get(case['id']))
 cases.append(row);bycase[case['id']]=row
for engine in ('chromium','firefox','webkit'):
 record=next(r for r in ci['caseIndices'] if r['path']=='case-index-'+engine+'.json');path=a.ci/record['path'];data=path.read_bytes();require(len(data)==record['bytes'] and sha(data)==record['sha256'],'Current actual case index differs');index=loads(data);tests={t['testId']:t for t in index['tests']};require(len(tests)==249,'Complete current browser inventory differs')
 for case in cases:
  prior=next((r for r in old[case['id']].get('executionEvidence',[]) if r.get('engine')==engine),dict(testIds=[]));ids=set(prior['testIds'])|{t['testId'] for t in index['tests'] if case['id'] in t['caseIds']};require(ids<=set(tests),'Original actual test missing from new engine')
  for clause in case['clauses']:
   referenced={ref['testId'] for ref in clause['evidenceRefs'] if ref['proof']=='caseIndex-'+engine}
   require(referenced<=ids,'Authored clause references another case or missing actual test')
  witnesses=[]
  for identity in sorted(ids):
   test=tests[identity];witnesses.append(dict(testId=identity,file=test['file'],line=test['line'],title=test['title'],durationMs=test['durationMs'],actualAttachments=[{k:v for k,v in f.items() if k in ('ordinal','occurrence','name','bytes','sha256','role','archive')} for f in test['attachments']]))
   if engine=='chromium':
    selected={k:v for k,v in test['observations'].items() if (case['id'] in k or 'observ' in k or k.startswith('original-')) and not k.startswith('complete-backup-') and not k.endswith('-given.json')}
    case['freshObservedFacts'].append(dict(testId=identity,observations=small(selected),scope='Reading aid; all unabridged actual bytes and JSON remain in the pinned original provider ZIP/report index.'))
  if witnesses:case['actualEvidence'].append(dict(engine=engine,source=ci['source'],index=record,tests=witnesses))
  if case['id'] not in external:require(witnesses or case['id']=='AT-N05','Local case has no actual fresh execution')
 del tests,index,data
bycase['AT-N05']['actualEvidence'].append(dict(kind='fresh-original-full-Large-supplement',assessment=descriptor(a.supplement_assessment),n05=supp['n05']))
require(all(len(c['clauses'])==4 for c in cases),'Missing original clause')
requirements=[]
for task in tasks:
 paths=[source_rows[path] for path in task['code_paths']];owned=task['acceptance_ids'];integrations=task['integration_ids'];pending=[x for x in owned+integrations if bycase[x]['wholeCaseResult']!='passed']
 requirements.append(dict(id=task['id'],title=task['title'],requiredBehavior=task['required_behavior'],originalWorkPackage=task['original_package_id'],implementationPaths=paths,acceptanceIds=owned,integrationIds=integrations,pendingOriginalCases=pending,result='local_owned_and_integration_cases_satisfied' if not pending else 'original_external_conditions_remain',scope='Owned local acceptance and full original integration dependencies are distinct; a code path alone is not completion.'))
local_gates={key for key,row in package_reviews.items() if row['result']=='passed_local_gate_scope'};package_rows=[];package_states={}
for package in packages:
 pending=[x for x in package['acceptance_ids'] if bycase[x]['wholeCaseResult']!='passed'];dependencies=[x for x in package['depends_on'] if package_states[x]!='complete'];local=package['id'] in local_gates
 state='complete' if local and not pending and not dependencies else 'pending_original_conditions_or_dependencies';package_states[package['id']]=state
 review=package_reviews[package['id']]
 package_rows.append(dict(id=package['id'],original=package,localGateReview=review['result'],authorObservation=review['authorObservation'],ownAcceptanceCasesPending=pending,blockedDependencies=dependencies,wholePackageState=state,evidenceRefs=review['evidenceRefs'],ownedCaseRefs=package['acceptance_ids'],scope='Explicit authored local gate reading composed with fresh original cases; full completion also requires all owned cases and original package dependencies.'))
old_rg=read(repo/'docs/quality/pr49-followup-2026-10-15/REGRESSION_REVIEW.json');rg_rows=[];units={r['path']:r for r in log_index['unit']['rows']}
for group in regressions:
 guide=next(r for r in old_rg['groups'] if r['id']==group['id']);unit_sources=[]
 for source in guide['procedureSources']:
  if source['path'].endswith('.test.ts'):
   observed=units[source['path']];require(observed['sourceSHA256']==source_rows[source['path']]['sha256'] and observed['passedTests']>0,'Original regression unit file did not execute');unit_sources.append(observed)
 review=regression_reviews[group['id']]
 rg_rows.append(dict(id=group['id'],original=group,result=review['result'],authorObservation=review['authorObservation'],evidenceRefs=review['evidenceRefs'],actualUnitFiles=unit_sources,extraEvidence=descriptor(a.supplement_assessment) if group['id'] in ('RG-R01','RG-R02','RG-R03') else descriptor(a.formal_assessment) if group['id']=='RG-R06' else dict(ci=ci['runId'],actualLogIndex='actual-log-index.json'),scope='All original group wording/environments preserved. Source, component/normal UI, physical conditions and exact additional-given files remain separate.'))
supp_rows=[]
for check in supplemental:
 review=supplement_reviews[check['id']]
 supp_rows.append(dict(id=check['id'],original=check,result=review['result'],observation=review['authorObservation'],evidenceRefs=review['evidenceRefs']))
counts=dict(requirements=104,cases=116,clauses=464,localCasesPassed=sum(c['wholeCaseResult']=='passed' for c in cases),blockedOriginalCases=sum(c['wholeCaseResult']=='blocked' for c in cases),workPackages=24,localPackageGates=len(local_gates),wholePackagesCompleted=sum(v=='complete' for v in package_states.values()),regressionGroups=6,supplementalChecks=68)
trace=dict(format='phase3-original-authored-trace/1',recordedAt=datetime.now(timezone.utc).isoformat(),product=product,sourceTree=binding['tree'],ciSource=ci['source'],originalCounts=counts,method='Author read the unchanged original four clauses/procedure assertions and current actual results/inputs/outputs. Old IDs are lookup hints, old source prose describes protocol only, and old outcomes/UUIDs/hashes are not promoted. Whole-case, local gate, package dependency, physical/live and independent human release acceptance remain distinct.',requirements=requirements,cases=cases,workPackages=package_rows,regressions=rg_rows,supplemental=supp_rows,formal=descriptor(a.formal_assessment),supplements=descriptor(a.supplement_assessment),resources=descriptor(a.resource_assessment),releaseDecision='RELEASE BLOCKED')
trace['authoredDecisions']=descriptor(a.decisions)
release=dict(recordPhase='phase3_nonphysical_acceptance',commit=binding['commit'],base=product['base'],product=product,originalCounts=counts,acceptance={c['id']:dict(result=c['wholeCaseResult'],evidence=['TRACEABILITY.json: '+c['id']],remaining=c['limitation']) for c in cases},workPackages=package_states)
for gate in ('realDevices','accessibilityManual','performance','restoreDrill','syncLive','rlsLive','independentReview','hostingCosts','directLinks'):
 release[gate]=dict(result='partial_local_original_conditions_only' if gate in ('performance','restoreDrill') else 'not_run',evidence=['TRACEABILITY.json'] if gate in ('performance','restoreDrill') else [],remaining='原実機・実権限・実契約・独立人間受入等が未実行。EXTERNAL.md参照。コードreviewやLinux自動成功で代替しない。')
from phase3_report_receipts import verify_release_receipt,verify_delivery_receipt
trace['additionalActualChecks']={}
for identity,key,path in [('AC-G06-E','release',a.release_proof),('AC-G07-E','delivery',a.delivery_proof)]:
 review=supplement_reviews[identity]
 if review['result']=='passed_local_original_conditions':
  require(path is not None and key in review['evidenceRefs'],'Original release or evidence handoff was accepted without its actual receipt')
  trace['additionalActualChecks'][key]=verify_release_receipt(path,binding,release) if key=='release' else verify_delivery_receipt(path,binding,formal,supp,resource,repo)
 else:require(review['result']=='partial_local_support_original_conditions_remain','Preliminary release/handoff outcome must remain partial')
trace['reportScope']='final_verified_nonphysical_author_review' if set(trace['additionalActualChecks'])=={'release','delivery'} else 'preliminary_author_review_actual_release_or_handoff_check_pending'
(out/'TRACEABILITY.json').write_text(json.dumps(trace,ensure_ascii=False,indent=2)+'\n')
(out/'release-evidence.json').write_text(json.dumps(release,ensure_ascii=False,indent=2)+'\n')
lines=['# 原要件と新実証拠の対応','',f'計測製品 `{binding["commit"]}` / build `{product["version"]}`。原104要件・116ケース／464条項を維持する。全条項・source SHA・実test ID・入力/出力bytes/SHA・制限は[TRACEABILITY.json](TRACEABILITY.json)。件数は証拠からの要約であり、原条件の代用ではない。','', '| 要件 | 内容 | 原受入・統合 | 原条件の残り |','| --- | --- | --- | --- |']
for row in requirements:lines.append('| '+row['id']+' | '+row['title']+' | '+', '.join(row['acceptanceIds']+row['integrationIds'])+' | '+(', '.join(row['pendingOriginalCases']) or '記載した局所条件を確認')+' |')
lines+=['',f'24工程の局所gate{len(local_gates)}件と工程全体の完了は別。原依存まで満たす工程は'+(', '.join(k for k,v in package_states.items() if v=='complete') or 'なし')+'。RG-R01の実IME、RG-R06の指定実端末性能は未実行。68補助確認と未採用Xを元116件へ加算しない。','', 'N05は原fullfixtureと2実ダウンロード、RG01–03は原追加givenを現在候補で再実行する。N09の15表不変、共有author fingerprintの6表、完全Large障害の21重要表は異なる証拠範囲である。']
(out/'TRACEABILITY.md').write_text('\n'.join(lines)+'\n')
print(json.dumps(counts))
