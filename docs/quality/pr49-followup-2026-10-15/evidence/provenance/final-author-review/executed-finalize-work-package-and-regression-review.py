"""Persist explicit original gate decisions; package completion also requires original dependencies and owned cases."""
from pathlib import Path
import json,hashlib
from datetime import datetime,timezone
r=Path('/workspace/shinariokanri/docs/quality/pr49-followup-2026-10-15')
s=Path('/workspace/pr49-checks'); now=datetime.now(timezone.utc).isoformat()
read=lambda p:json.loads(p.read_text()); write=lambda p,x:p.write_text(json.dumps(x,ensure_ascii=False,indent=2)+'\n')
soak=read(s/'soak7200-1fcadcca-attempt1/ADJUDICATION.json'); neg=read(s/'large-negatives-1fcadcca-attempt1/ADJUDICATION.json')
assert soak['actual7200']=='passed' and neg['result']=='passed_local_same_full_input_negative_retry'
assert read(s/'large-negatives-1fcadcca-attempt1/execution/exit.json')['returncode']==0
rg_ui=read(s/'rg02-rg03-same-given-1fcadcca-attempt1/ADJUDICATION.json');assert rg_ui['result']=='passed_original_given_normal_UI_R02_R03' and rg_ui['actualChildExitCode']==0 and rg_ui['passed']==12
clauses=read(r/'CLAUSE_REVIEW.json'); assert clauses['currentAuthorDecisionSource']
cases={c['id']:c for c in clauses['cases']}; product=read(r/'evidence/product/binding.json')['product']
# Each observation is an authored reading of that package's original deliverables/gate,
# separately from source-test counts and from original dependency closure.
gates={
'WP01':(True,'版付き型/schema・整数tick/参照/ID/三値評価・投影・固定fixtureとCI基盤を現行sourceとunit1132件/3engine実出力で確認。N16の同一条件・規則・エラーコードが一致し、文書追跡とアプリ結果は別記録。'),
'WP02':(False,'幅別ナビ・通常編集・一覧代替・キーボード・cache/エラー表示のローカル実装を確認。スマートフォン単独の全作成/条件/線/読み込み・実文字拡大/IME・端末別復帰の原条件はF31/F33/実機確認が残る。'),
'WP03':(True,'通常操作の安定ID/原子command/IndexedDB履歴・取消・単体復元入口・outbox・移行復元点を確認。N06/N18、元180と実7200/full113、同全量の最終段generic/quota拒否と通常retryが成功。成功前の保存済み表示を出さない。N11の物理機内モードは別のowned-case未完了。'),
'WP04':(True,'人物/出来事/場所/物品/メモのCRUD、参加役割、型付き雛形と原メモ変換を現行実ファイルで確認。名前/要約だけの開始、不適合な型変更の影響付き拒否、参照を持つ削除の影響確認をB01/B08/B11/F02/F56で照合。F01の実phone連鎖は別途保留。'),
'WP05':(True,'同名2人/別名/人物の改名・削除、一般語候補の除外とcold保持、ID/段落リンク・逆参照、日本語検索/作者索引、動的固定一覧、原子一括/統合と補償を実操作で確認。B24実タッチとN13実IME、G02実アカウント切替は元条件として残す。'),
'WP06':(True,'独自暦/負巨大tick/未知範囲/相対制約/年齢・基準点と取消を確認。表示単位・基準変更はtick不変、閏と不在日付・相対循環・固定日時衝突を元条件で拒否し、変更影響を確認。'),
'WP07':(False,'共通/人物lane固定名、多重参照・期間・選択同期・局所横移動/一覧をCSS幅で確認。多重表示は同一IDを編集する。gateの「スマートフォンで横移動しながら人物を識別」は実物理端末では未実施。'),
'WP08':(True,'方向/期間/経路/根拠付き関係、6図種/凡例/線種/矢印/label、階層と一段/二段、常時ボタンと関係表を実行。配置・自動整列後のauthorデータ不変、非対称信頼の逆線/推移線非追加を確認。128幾何fixture一致と元graph30 p95を別途保持。'),
'WP09':(True,'共通世界の固定版参照、地図なし/場所階層・時期/経路表示・移動・所有履歴と家系/別名/認識者を確認。新版影響preview後も旧作品の公開版/world pinを保持し、現世界と固定版を区別する。'),
'WP10':(True,'章順/世界event参照、筋/目標/緊張、summary/body/メモ・ルビ/縦書き、正本/別案/公開pinを実ファイルで確認。回想順変更でworld tick不変、未入力scene可能、没別案が正本出力へ混入しない。'),
'WP11':(True,'boolean/integer/enum状態辞書・許容値/初期化/算出・条件AST/自然文・三値理由・遷移・利用/書込元を確認。括弧、未定義、算出循環/直接代入、禁止遷移の一括原子拒否、同一発火IDの非重複を元fixtureで確認。'),
'WP12':(True,'階層flowの宣言入口出口、choice/automatic/terminal・trigger・会話/questと参照/複製/overrideを確認。条件とeffectを共通runtimeで適用し、入口不整合・選択肢ゼロ/unknownを意図終端から分離。'),
'WP13':(True,'途中開始checkpoint、Backの全runtime state・state差分・二経路合流と既読/RNG/周回を確認。鍵有無の差を合流で保持し、seed/乱数位置0→1の再現、run reset/across_runs carry/fullresetを区別する。'),
'WP14':(True,'参照/到達/行止まり候補、証人経路、scene/line/choice/条件真偽の別分母、旧trace/新版再確認を確認。unknown/意図終端/上限打切り・stub/受取実例/対象ゲーム未実施を明示。原Large N05だけは旧3ab6の実実行と無影響根拠を明示して引継ぎ。'),
'WP15':(True,'独立伏線と複数clue/payoff/代替・段階/期限/方針、真実/証言/信念と出所/取得位置を確認。場面分割/削除で本体を残し、必須欠落の証人経路を提示、任意/代替/続編/意図未回収を区別して読者の理解を判定しない。'),
'WP16':(True,'native1.0完全archive/manifest/hash・実素材・移行/単体・追加/正常ACK後置換/統合を確認。全43種+未知日時+巨大tickのnew/cold全情報、7不正+11安全上限L±1の不変、元全88003/72MiB/113履歴pendingのnew/clone/cold、および同全量のlate拒否/retryが実成功。'),
'WP17':(False,'ローカルprotocol/SQL/unitは保持。専用HTTPS/Auth・membership/private Storageの実二端末同時編集・再送・通信断・削除対編集と非member RLSの原gateは未実施。'),
'WP18':(False,'ローカル限定snapshot/公開投影・旧review対象版/quote/削除位置とstageを確認。ただし実reader/reviewer/editorの直接API・検索/索引/図/私有素材と撤回の原gate未実施で、本名/家系/filename/countの取得不能を実server上では認定しない。'),
'WP19':(True,'台詞entity IDは改名/並替/本文改訂で保持、copy/splitは新IDと対応履歴。内容hash変化時にだけ翻訳/収録needs_review、確認者と旧成果物版・実WAVを保持。時期/例外付き用語/口調は候補表示で自動修正しない。'),
'WP20':(True,'本文のみ/演出込みと素材の参考/完成/欠落を分離し、差替え先と旧素材を追跡。Web/PDF/画像の出所・取得日・解釈・再配布許可、frame/cueのmsとworld tickを分離し、素材だけの変更で依存frameを確認待ちにする。'),
'WP21':(True,'企画対象/体験/主題と版別判断・却下/保留理由、遊び仕様と物語の意図付き差、6制作段階・実期限/依存循環を確認。unique scene/line/assetと経路出現数を別集計し、旧公開媒体本文を保持したまま新版候補を示す。'),
'WP22':(True,'完全/公開reader/playable/production/runtime/相談各profileを実ダウンロード。未対応型/engine・version/hash不一致を明示拒否し、秘密/没案/作者メモを除外。相談は手動出力・出所/対象版付き作者別案、外部AI自動送信なし。F42対象ゲーム実結果は別owned-case保留。'),
'WP23':(False,'原104/116/464/24/6を維持し、94ケースのローカル成功と22ケースの具体的外部未実行を記録。実機/支援技術/IME/Files/実権限/実二端末/対象ゲーム等が残り、「未実行・失敗なし」の原gateは未充足。'),
'WP24':(False,'製品1fc/実buildと配布commitを分け、操作/診断/バックアップ/互換/移行/実機手順と証拠取得手順を整理。現契約費用/専用HTTPS版/独立公開前レビューが未実施で、文書やCI成功を完成/公開済みへ換算しない。')}
wp=read(r/'WORK_PACKAGE_REVIEW.json'); assert set(gates)=={p['id'] for p in wp['workPackages']}
states={}
for row in wp['workPackages']:
 ident=row['id'];o=row['original'];gate,observation=gates[ident]
 pending_cases=[i for i in o['acceptance_ids'] if cases[i]['wholeCaseResult']!='passed']
 pending_deps=[i for i in o['depends_on'] if states[i]!='completed']
 complete=gate and not pending_cases and not pending_deps
 states[ident]='completed' if complete else 'pending_original_conditions_or_dependencies'
 if 'authorGateObservation' in row:row['historicalPreparationGateObservation']=row['authorGateObservation']
 row['reviewState']=states[ident]
 row['gateReviewResult']='passed_local_gate_scope' if gate else 'blocked_original_gate_conditions'
 row['authorGateObservation']={'at':now,'observation':observation,'scope':'Final authored gate/deliverables reading against actual evidence; local gate success is not whole-package completion.','wholePackagePromotion':complete}
 row['ownAcceptanceCasesPending']=pending_cases;row['blockedDependencies']=pending_deps
 row['actualEvidence']=[{'review':'CLAUSE_REVIEW.json','caseIds':o['acceptance_ids'],'scope':'Each original four-clause decision has source/build/actual bytes or a specific unmet original condition.'}]
 if ident in ['WP03','WP16','WP23']:row['actualEvidence'] += [{'bundleManifest':'evidence/bundles/formal-1fcadcca.manifest.json','actual7200':'soak7200-1fcadcca-attempt1/ADJUDICATION.json'},{'bundleManifest':'evidence/bundles/full-large-exceptions-1fcadcca.manifest.json','sameFullNegativeRetry':'actual-attempt/ADJUDICATION.json'}]
 row['limitation']=None if complete else {'originalCasesPending':pending_cases,'originalGatePending':not gate,'originalDependenciesPending':pending_deps,'rule':'docs/plan/IMPLEMENTATION_PLAN.md: dependencies must be complete before a stage starts; partial implementation does not establish full acceptance.'}
wp['recordedAt']=now;wp['originalDependencyRuleApplied']=True;wp['completionScope']='Only an independently satisfied original gate, all owned original cases and all original dependency completions permit whole-package completion.';write(r/'WORK_PACKAGE_REVIEW.json',wp)
# Regression groups: exact original unit fixtures/asserts plus ordinary UI and actual
# outputs are composed explicitly. Tests with no attachments are evidenced by their
# original source assertions and the actual bound Playwright result, not invented files.
rg=read(r/'REGRESSION_REVIEW.json')
notes={
'RG-R01':('partial_local_passed_real_IME_not_run','現行3engineの原UIとunit、旧3ab6の同Given追加8実ファイルを明示した無影響引継ぎで確認。アオ/昨日、/CP4..6/前削除/重なりunresolved/split/merge/move/undoとlink/ruby/cueを保持。実iPhone日本語IMEは未実施。',['AT-B10','AT-F06','AT-F21'],['tests/e2e/editor-regressions.spec.ts']),
'RG-R02':('passed_local_original_conditions','原runtime-regressions fixtureの提示時true→効果後false、効果なし、手掛かり有無・初期提示/Back/replay/旧optional fields/改変拒否を実unit26件内で確認。有限探索5件と元rb05-narrative12件が成功。現行B19/F45の通常試読・保存trace/実解析JSONと照合し、任意/代替を必須へ換算せず後値で提示済回収を除外しない。',['AT-B19','AT-F45'],['tests/e2e/ap04-original-bm-world-narrative.spec.ts','tests/e2e/ap04-original-e-f43-47-narrative.spec.ts']),
'RG-R03':('passed_local_original_conditions','元fixtureの単独/混合×manual_choice/first_match/all_match、不採用effect、再利用/開示/Back/replay、runtime/playable出力拒否の全assertが同一sourceの実unit26件内で成功。通常B14の原子拒否とF25の没案非混入、F24/N20の実出力/説明付き拒否を照合。変数/物品/知識/既読/once/RNG/履歴/進行を部分更新しない。',['AT-B14','AT-F25','AT-F24','AT-N20'],['tests/e2e/ap04-original-bm-runtime.spec.ts']),
'RG-R04':('passed_local_original_conditions','元390px通常UIでall-false+fallback、明示trigger確認→進行、Back→再進行→保存経路再生、issue0/横scrollなしを3engineの実retry0結果へ結合。添付はないため実出力ファイルを捏造せず、source4396 bytes/SHAaf1c…の全assertと実reportを証拠にする。unit5+runtime35件でgatefalse/no-fallback/unknown/真候補の組合せと意図終端区別を確認。',[],['tests/e2e/reader-fallback.spec.ts']),
'RG-R05':('passed_local_original_conditions','原boolean/integer/enumの3通常UIで単値↔in、複数値追加/演算切替取消、括弧自然文と式、保存/cold/試読、integer/enum空欄拒否と入力修正を3engine実結果へ結合。添付なしは元source8251 bytes/SHA51e3…と実reportが証拠。unit6+6件で値削除/明示survivor/unknown≠false/型不一致/不正draft保持を補完。',[],['tests/e2e/editor-regressions.spec.ts']),
'RG-R06':('partial_local_original_passed_physical_measurements_not_run','clean1fcで元Standard/Large各8×30、6形式180、実7200.018523761秒/112編集、全113履歴pending/72MiB素材new/clone/coldが実exit0。追加同全量のlate generic/quota拒否→正常retry/cold原oracleも実exit0。Standard command p95全6≤1000ms、UI通知区間は別。少量編集でもv1必須hash3回6259174 bytesの実測は残り、hashゼロとはしない。指定実端末N04/E11最終判定は未実施。',['AT-N06','AT-N18','AT-N14'],[])}
indices={e:read(s/('ci-1fcadcca/case-evidence-'+e+'/index.json')) for e in ['chromium','firefox','webkit']}
for row in rg['groups']:
 ident=row['id'];result,note,ids,paths=notes[ident]
 row['reviewResult']=result;row['authorCurrentObservation']={'at':now,'observation':note,'scope':'Original exact unit fixtures plus ordinary UI/actual outputs composed explicitly; current execution identities remain separate from local product build and named historical carry.'}
 row['actualEvidence'] += [{'bundleManifest':'evidence/bundles/product-ci-1fcadcca.manifest.json','engine':e,'index':'ci-1fcadcca/case-evidence-'+e+'/index.json','source':ix['source'],'tests':[t['testId'] for t in ix['retainedTestResults'] if (set(t['caseIds'])&set(ids)) or (t['procedureSource']['path'] in paths and (ident not in ['RG-R01','RG-R05'] or t['title'].startswith(ident)))]} for e,ix in indices.items()]
 if ident in ['RG-R02','RG-R03','RG-R04','RG-R05']:row['actualEvidence'].append({'bundleManifest':'evidence/bundles/product-ci-1fcadcca.manifest.json','unitWitness':'ci-1fcadcca/unit-execution-index-attempt2.json','originalFileBindings':'authorActualUnitObservation.files'})
 if ident=='RG-R06':row['actualEvidence'] += [{'bundleManifest':'evidence/bundles/formal-1fcadcca.manifest.json'},{'bundleManifest':'evidence/bundles/full-large-exceptions-1fcadcca.manifest.json'}]
 if ident in ['RG-R02','RG-R03']:
  row['actualEvidence'].append({'bundleManifest':'evidence/bundles/additional-original-regressions-1fcadcca.manifest.json','actualAdjudication':'rg02-rg03-same-given-1fcadcca-attempt1/ADJUDICATION.json','scope':'Exact original function bytes produce unchanged given; additional ordinary UI six cases each, actual30 complete archive inputs/outputs retained.'})
  row['authorCurrentObservation']['observation'] += ' 追加通常UIでは元fixture関数を一字も変えず、R02の条件変更有無×skip/via/initial6件とR03の3policy×単独/混合6件を実行。実30archiveと正常UI結果を別途保持。'
 row['limitation']=('実iPhone日本語IME未実施' if ident=='RG-R01' else '指定実端末の原性能最終判定未実施' if ident=='RG-R06' else None)
rg['recordedAt']=now;write(r/'REGRESSION_REVIEW.json',rg)
print(json.dumps({'localGatePassed':sum(v[0] for v in gates.values()),'wholePackagesCompleted':[i for i,s in states.items() if s=='completed'],'regressionResults':{i:v[0] for i,v in notes.items()}},ensure_ascii=False))
