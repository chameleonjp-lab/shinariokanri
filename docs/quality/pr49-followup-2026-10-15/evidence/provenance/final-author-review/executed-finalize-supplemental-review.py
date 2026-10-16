"""Record authored G01-G16 findings while preserving all original68 checks and unadopted extensions."""
import json,hashlib
from pathlib import Path
from datetime import datetime,timezone
r=Path('/workspace/shinariokanri/docs/quality/pr49-followup-2026-10-15');s=Path('/workspace/pr49-checks');read=lambda p:json.loads(p.read_text())
assert read(s/'large-negatives-1fcadcca-attempt1/ADJUDICATION.json')['result']=='passed_local_same_full_input_negative_retry'
assert read(s/'rg02-rg03-same-given-1fcadcca-attempt1/ADJUDICATION.json')['result']=='passed_original_given_normal_UI_R02_R03'
x=read(r/'SUPPLEMENTAL_REVIEW.json');raw=(Path('/workspace/pr49-graph-measure-source')/x['original']['path']).read_bytes();assert len(raw)==x['original']['bytes'] and hashlib.sha256(raw).hexdigest()==x['original']['sha256']
# Normal and edge decisions are separate: a local guard can pass while the full
# real-device/live-service outcome is still unexecuted.
P='passed_local_original_conditions';B='blocked_original_external_conditions';L='partial_local_support_original_conditions_remain'
notes={
'G01':((P,'確認main a6a6c97はPR56が外部merge済み。統合済み修正に関係図3appファイル/幾何testを加えた製品1fc/tree8acを封印し、実CI7job/unit1132/3engine各228、正式30/180/実7200と同全量異常系が完了。元検査・文書・契約を保持。'),(P,'mainや元作業branchを本作業から書換えず専用Draft PR57へ提出。旧3ab6不合格と途中失敗の実ソース/rawを保持し、旧結果を1fcへretagしない。明示したN05/RG01無影響carryだけ原規則で別記。')),
'G02':((L,'現行B10/F27実出力で同名2人・一般語・別名・複数出現・Unicode/引用不変、cold後除外・逆参照、解除失敗の入力保持とnew/clone復元を確認。原whenに含む別実アカウントの通常ログイン切替は未実施。'),(L,'作品/本文間の分離、確定リンク保持、解除・再保存/coldは実操作で確認。account utility試験を実ログアウト/別accountの通常操作へ換算しない。原N/Eとも実account条件が残る。')),
'G03':((P,'同一場面Sの前後boolean/integer、公開policy/対象pin版を選び実相談MD1730/1735/1721/1734 bytesを取得。前後状態と確定/仮設定を含み、出所/対象版付き提案を作者別案へ読み込む現行4手順が3engineで成功。'),(P,'実MDはSECRET・作者メモを含まず外部request=[]。保存失敗でも最新入力/coldを保持、版変更で再確認、整数途中/範囲外拒否と修正値出力、cache失敗案内を確認。正本/旧pinと別案applyReceipts0を保持。')),
'G04':((P,'実genuine legacy SHAab5b…のnative10移行を1回/2回quota拒否し、通常retryだけでnative70へ。現行3engineの実観測は全表拒否時不変、完全project同一、cold/空環境replay=true。'),(P,'遅延native success1000ms中の通常取消と新retryを実行。schema commit後取消はv70のまま、原表は不変で完了済移行を戻したとは表示しない。実3手順の完全ファイルと元sourceを保持。')),
'G05':((P,'実7200.018523761秒/112通常編集後、元88003記録・72MiB実素材・113履歴/pendingを235817msで実完全ファイルへ出力。全before/after連続性・162117 typed owned IDs・順序/全素材hashを元oracleでnew/clone/cold照合し、cleanup/actual exit0まで確認。'),(P,'進捗37.600000001490116ms/取消42.399999998509884ms、max UIgap1124.8000000044703msを原2秒条件で確認。同じ実全量の1byte project破損/unknown major/最終24MiB素材末尾1byte破損、全書込み後generic/quota abort、21critical表0/入力保持、正常retryと元cold113照合が実exit0。履歴/素材/検査/上限を減らさない。')),
'G06':((B,'原116×4の内容を個別照合し94ケースのローカル合格、22ケースの具体的実条件未実行を記録。個別local gate18件と工程全体は区別し、依存/owned-case閉包ではWP01だけ完了。回帰R01実IMEとR06実機性能が残り、全116/24/6の原thenは未充足。'),(P,'部品/CI/旧版/未実行を一括合格にしない。元公開checkerを製品1fcの別checkoutで最終recordへ実行し、未充足の全条件をexit1/RELEASE BLOCKEDとして保持する。最終実checkerログはevidence/release-checker-localを参照。')),
'G07':((L,'新しい証拠を個別manifest/hash/分割part/自己完結verifierと保持期間付きで用意し、空領域へ実展開照合する。公開後のimmutable SHAからの実ダウンロード照合はPR57/Drive報告に実結果を記録する。原C29の約1.85GB/37part/MANIFESTと旧不足18宣言は未取得であり、現証拠を旧原本回収としない。'),(P,'一時path/metadataだけを成功証拠とせずraw実bytesと手順/実exitを保持し、旧不足を明示。素材/本文は公開repo由来または隔離fixtureの合成データ、実作品/認証情報/無関係project情報を同梱しない。実機配布ZIPは別の許可未回答として本証拠束に含めない。')),
'G08':((P,'root README/docs README/PROGRESSと本記録からmain基準a6・製品1fc/tree8ac/build8ec・実CI merge819/tree8ac/engine固有build・別delivery履歴・未完条件へリンクする。元計画/原文と旧記録を別保持。'),(P,'元not_runは設計時originalとして保持し、現在authorResult/authorCurrentObservationと区別。旧失敗を現在の不合格へ再計上せず、document/delivery commitを製品実測commitへ読み替えない。')),
'G09':((B,'iPhone17Proを主とする実iPhone/iPad/PCの短い分割手順・実fixture・13配信bytes/manifest・記録欄を用意したが、実OS版/縦横/文字拡大/IME/キーボード/機内モードの原受入は未実施。'),(B,'実マイク拒否/Files取消/実容量不足/断線/未取得素材の総合結果は未実施。ローカル注入の入力/正本保持を実機成功に流用せず、手順と再開欄を残す。')),
'G10':((B,'実VoiceOver/NVDA、実OSキーボードと200%文字表示の最終操作は未実施。ローカル常時ボタン/表代替/焦点/sourceとCSS幅の補助結果は別保持。'),(B,'色以外の凡例/線種とmodal取消のローカル結果を保持するが、実読み上げ/文字200%の焦点・末尾到達・本文/警告の可読性は未判定。pinch無効化で省略しない。')),
'G11':((B,'専用HTTPS/Auth/DataAPI/private Storageと5実役割・二つの実端末が未指定。別用途projectはread-only確認だけで、既存9migration/SQL/HTTP protocolを実RLS/同期成功へ換算しない。'),(B,'実nonmember/失効/撤回/再送/古い権限/公開索引・件数・素材URLの横断拒否は未実施。外部DB/課金変更を行わず、専用環境の具体的隔離fixture計画を渡す。')),
'G12':((B,'公開公式上限の読取りとアプリnative/素材限界の元L±1実行は保持。専用実tier/region/使用量/残枠/費用が未指定で、現契約の容量費用表と実枠境界を確認できない。'),(B,'ローカル同全量quota拒否で素材/未送信保持は確認。実bucket upload拒否/通信枠不足の原環境は未実施で、費用ゼロやupload可能と断定しない。')),
'G13':((L,'同clean1fcで原Standard/Large各8×30、原6形式×30保存と実7200/full113/72MiB new/clone/coldを完了。Standard全目標とLarge明示起動/検索上限は満たすが指定実機の最終測定は未実施。'),(P,'500ms入力待ちを除く元command始終点/全30生値/nearest-rankを保持。UI成功通知区間は別、6Large未規定指標へ独自上限を作らない。診断/旧build/仮想幅を実機合格にせず、失敗試行も保持。')),
'G14':((P,'宣言したnative/runtime1.0、profile1.1/browser-game1.0を保持。reader/playable/runtime/production/相談の実bytesと版/hash、固定世界/部分override/台詞素材/ID対応、generic browser受取receiptの照合を現行CIで確認。対象ゲームはF42/E10別未実施と明示。'),(P,'作者メモ/秘密名/私有素材を公開投影から除き、未対応engine/command/inputTypeと版/hash不一致を拒否。Unity/Unreal/ink/Yarnへの全対応を主張せず、旧公開版本文を保持。')),
'G15':((L,'genuine legacy・native移行拒否/retry/取消・複数tab waiting worker、実全体new/clone/coldを現行3engineで確認。SW変更はcache identityだけで実旧app buildからの更新とは別。実旧アプリ/実端末/OS Filesの原総合条件は未実施。'),(L,'不正major/破損/late quota/遅延通知/取消・未cache起動拒否をローカルで確認。実old-build更新の未保存入力/未取得素材と実OS保存先取消の条件は未実施として保持。')),
'G16':((L,'原全116×4を確認し、人物自体の改名/単体復元、同一trigger再送、旧版開始選択、素材のみ差替え、同fixture逆順二案など実行可能な原given/whenを元UIで観測。94ケースのlocal完了と22ケースの外部不足を個別に記録し、全件成功とはしない。'),(P,'台詞改名を人物改名へ換算せず、元fixture・対象版・未定義/素材欠落を保持。F02最小入力とB01の横断原則は根拠を明記。N05だけ旧版無影響carryを明示。外部条件は理由付き未実行で、別対象の似た操作で穴を埋めない。'))}
assert set(notes)=={'G'+str(i).zfill(2) for i in range(1,17)}
now=datetime.now(timezone.utc).isoformat()
for row in x['checks']:
 if row['id'].startswith('AC-X'):assert row['reviewResult']=='not_adopted';continue
 group,side=row['id'].split('-')[1:];result,note=notes[group][0 if side=='N' else 1]
 row['historicalPreparationObservation']=row.get('authorObservation')
 row['reviewResult']=result;row['authorObservation']=note;row['authorCurrentObservation']={'at':now,'scope':'Original given/when/then preserved; current result authored from the actual bound evidence or named missing original environment.','observation':note}
 manifests={
 'G01':['product-ci-1fcadcca','formal-1fcadcca','additional-original-regressions-1fcadcca'], 'G02':['product-ci-1fcadcca'], 'G03':['product-ci-1fcadcca'], 'G04':['product-ci-1fcadcca'], 'G05':['formal-1fcadcca','full-large-exceptions-1fcadcca'], 'G06':['product-ci-1fcadcca','formal-1fcadcca'], 'G07':['formal-1fcadcca','product-ci-1fcadcca','historical-and-failed-checks','historical-ci-3ab6'], 'G08':['retention-delivery-1e77'], 'G09':[], 'G10':['product-ci-1fcadcca'], 'G11':[], 'G12':['full-large-exceptions-1fcadcca'], 'G13':['formal-1fcadcca'], 'G14':['product-ci-1fcadcca'], 'G15':['product-ci-1fcadcca'], 'G16':['product-ci-1fcadcca','unaffected-local-3ab6']}
 row['actualEvidence']=[{'bundleManifest':'evidence/bundles/'+label+'.manifest.json'} for label in manifests[group]]
 if group in ['G06','G08','G16']:row['actualEvidence'].append({'authorReview':'CLAUSE_REVIEW.json','workPackages':'WORK_PACKAGE_REVIEW.json','regressions':'REGRESSION_REVIEW.json'})
x['recordedAt']=now;x['scope']='All original68 supplemental checks preserved. Original32 G checks are remediation/verification, not extra acceptance cases;36 X checks remain unadopted. Current observations distinguish local scope from missing original real environments.'
(r/'SUPPLEMENTAL_REVIEW.json').write_text(json.dumps(x,ensure_ascii=False,indent=2)+'\n');print('Authored32 G checks; original68 and36 unadopted X unchanged.')
