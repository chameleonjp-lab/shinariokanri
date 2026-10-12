# Codex向け実装計画表

計画版1.0 / 2026-10-12。原計画を削減せず、取り込み済み修正の作り直しを避けて残りを完了する。担当・工数・納期は実測前のため未確定。ここでのplannedは作業指示の状態であり、製品が全て未実装という意味ではない。

## 着手順と依存

最初にCP01で現在のheadと担当を固定し、CP02/CP03を既存PR #48で修正する。修正後は原AP02・原通常受入・Largeの確認を進める。重い性能/長時間処理は同じ資源で直列に実行する。実環境待ち中も独立した通常検査・互換・手順作成を進める。原AP04の最終判定はAP03と外部条件の完了後にCP15で行い、先に準備/再現したことを工程完了へ換算しない。

| 作業 | 対象 | 必須前工程 | 完了の基準 |
| --- | --- | --- | --- |
| CP01 現在のmain・PR #48・原契約を固定して引き継ぐ | G01,G08 | なし | 版の取り違えが0。#44〜#47のマージを確認し、#48をmain実装へ計上しない。原104/116/464/24/6と68補助確認を維持。 |
| CP02 PR #48のFirefox復元確認停止を解消する | G15,G16 | CP01 | 元30000ms・元5秒assert・通常click・元入力/全ID対応/rollbackを保持して元ケースが成功。#48現headの全CIが成功し、後続5チェックも実際に実行される。 |
| CP03 PR #48のWebKit保存状態の不一致を解消する | G06,G15,G16 | CP01 | 元5000ms以内に実保存に対応する表示となる。元caseの同期失敗/再試行まで成功し、native/cold/完全復元と3ブラウザー/全CIを満たす。 |
| CP04 取り込み済みAP02の3通常操作を統合版で完了する | G02,G03,G04 | CP02 / CP03 | AC-G02/03/04の正常/例外が同じ候補で成功。原F27/F36/E12の未観測条件には操作と必要環境がある。 |
| CP05 Large113履歴の完全保存と空環境復元を成功させる | G05 | CP02 / CP03 | 元600000ms内に実完全fileを取得し、全履歴・全hash・typed IDと空new/clone/coldが一致。進捗/取消の2000msと応答条件も実測。診断0は7200秒受入の成功にしない。 |
| CP06 同じ最終候補の性能・180保存を測る | G13 | CP04 / CP05 | 元全指標・全試行・180保存・実復元が同じ最終製品で成功。丸め/epsilon/最良run選択/固定データ縮小は使わない。実機条件はCP11へ残す。 |
| CP07 実7200秒編集後の113履歴完全復元を完了する | G05,G13 | CP05 / CP06 | 実7200秒と最終完全file/復元の両方が成功。連続編集だけの成功を復元込みの完了にしない。 |
| CP08 原116ケース・464条項の通常操作と不足機能を埋める | G06,G16 | CP02 / CP03 | 原文と全IDは不変。実動作の欠陥は同じ正期待で修正し、各条項に対象版・fixture・実操作・実結果・証拠がある。全体合格はCP15で判定する。 |
| CP09 更新・復元と全出力の互換性を統合版で確認する | G14,G15 | CP04 / CP05 / CP08 | native1.0.0/runtime形式1.0.0/profile1.1.0/browser-game1.0.0の契約を維持。ID/hash/全素材/旧版を保持し、未対応・秘密・破損は生成前または確定前に拒否する。 |
| CP10 証拠の保存と別環境への引渡しを完了する | G07 | CP01 | 必要な証拠の取得先が実際に使え、対象版とhashが一致。取得不能な旧packetはG07 blockedのまま区別し、旧引渡し成功を宣言しない。 |
| CP11 iPhoneを中心に実端末の編集・Files復元を確認する | G09 | CP04 / CP05 / CP08 / CP09 | 原N01/N02/N11/N13/N14・E01/E07/E10/E12等の実端末条件が満たされる。Linux WebKitや画面幅変更は補助証拠として分ける。 |
| CP12 読み上げ・文字200%・キーボードを確認する | G10 | CP08 / CP09 | 原N03と対象B24/F31/F32/N18の手動条件が固定候補で成功。支援技術がない場合は未実行のまま残す。 |
| CP13 専用同期で5役割・二端末・秘密保護を確認する | G11 | CP01 / CP08 / CP09 | 原F29/F30/F34/N07/N08・E05/E06/E09の実環境条件が成功。模擬HTTP/隔離SQL/UUID設定を実Authと行単位権限・素材取得の成功にしない。 |
| CP14 実容量・費用・配信条件を確認する | G12 | CP01 | 原N17/N20と容量条件の現実値・境界の実結果・対象版がある。費用ゼロや公開済みを未確認のまま断定しない。 |
| CP15 全原計画を判定して完成候補を提出する | G06 | CP04 / CP05 / CP06 / CP07 / CP08 / CP09 / CP10 / CP11 / CP12 / CP13 / CP14 | 原release checkerが対象commitで成功し、独立した証拠内容確認も成功。CIと文書検査だけで完成を宣言しない。必要実環境がなければ具体不足を記して公開判定を保留する。 |
| CP16 追加12案の採用範囲と形式変更を記録する | 条件付き X01,X02,X03,X04,X05,X06,X07,X08,X09,X10,X11,X12 | CP01 | 採用対象・保留対象・必要schema・対応ACが明確。未採用案を実装済み/必須と表示しない。 |
| CP17 採用した入口・保存確認・二版比較・素材条件を追加する | 条件付き X01,X07,X09,X10 | CP16 / CP05 / CP08 | 採用した4機能の対応AC12件が成功。旧1.0.0backup→新1.1.0の原子移行、取消・容量不足・旧reader拒否・未知key拒否を確認する。 |
| CP18 採用した置換・翻訳表・用語確認・経路テストを追加する | 条件付き X03,X04,X05,X06 | CP17 | 採用範囲のAC12件と原関連Unicode/台詞/出力/履歴ケースが同対象で成功。previewだけでは正本を変更しない。 |
| CP19 採用した横断検索・試読修正・目標・Twee連携を追加する | 条件付き X02,X08,X11,X12 | CP18 | 採用範囲のAC12件と原権限/秘密/固定世界/互換ケースが成功。Tweeは宣言した限定範囲でのみ往復する。 |

CP01〜CP15が原104要件の必須作業。CP16〜CP19は追加案の採用指示がある場合だけ実施し、未採用なら原104の完了を妨げない。追加を採用した完成版ではCP15にCP17〜CP19の該当AC/互換/原回帰成功を追加条件とする。

## 各作業の指示

### CP01 現在のmain・PR #48・原契約を固定して引き継ぐ

元工程: AP01。範囲: 必須。状態: planned。

**変更/確認の入口**: `README.md`、`docs/README.md`、`docs/implementation/PROGRESS.md`、`docs/quality/current-review`。

1. mainと#48を再取得し、commit/tree・対象製品ファイル・base・生成物・実CI checkoutを固定する。#44〜#47と#38〜#42の反映を確認し、同じ修正を再実装しない。
2. #48の担当・head・未push差分を確認する。同じ製品pathを別の担当が同時に更新しない。#48の修正は同PRへまとめ、mergeは利用者が行う。
3. 旧AP01〜AP06のREADMEやPROGRESSの「main未反映」「CI進行中」「最新C29」を履歴と明示し、現在の入口・確認日時・残件へ結ぶ。旧raw・原文・sealは保持する。

**完了条件**: 版の取り違えが0。#44〜#47のマージを確認し、#48をmain実装へ計上しない。原104/116/464/24/6と68補助確認を維持。

**戻し方**: 現在入口の文書追記だけを戻せる。旧原文、main、既存作業枝、過去の結果は書き換えない。

**対応**: 原REQ/AT/WP/ACの全IDは[implementation_plan.json](implementation_plan.json)の同じ作業IDを参照。対象G/Xの正常/例外/境界は元#43の[受入表](../review-2026-10-11/ACCEPTANCE.md)を維持する。

### CP02 PR #48のFirefox復元確認停止を解消する

元工程: AP04 / AP03。範囲: 必須。状態: planned。

**変更/確認の入口**: `src/ui/BackupPanel.tsx`、`src/storage/importMapping.ts`、`src/storage/store.ts`、`tests/e2e/rb06-recovery.spec.ts`。

1. CI38172493006の実trace・error-context・元fixture・checkoutを取得する。別作品mapped_merge、画面移動、cold再起動、影響再確認の順で同じ失敗を再現する。
2. 再確認前後のbusy/checked/ready、作品revision、idMap/resolutions、処理中controller、保存ACKを観測する。旧非同期通知・無効な対応・未完了の影響検査を分ける。根本原因は現時点ではわからない。
3. 確認の安全条件を保つ最小修正を行う。readonly native比較→容量拒否→再試行→全体/単体復元→完全file→coldを実施する。Firefox単独だけでなく3ブラウザーと元全workflowを確認する。

**完了条件**: 元30000ms・元5秒assert・通常click・元入力/全ID対応/rollbackを保持して元ケースが成功。#48現headの全CIが成功し、後続5チェックも実際に実行される。

**戻し方**: 隔離コピーのみを使用。変更した製品commitを戻せる。force操作、disabled解除、上限延長、失敗のskipを合格手段にしない。

**対応**: 原REQ/AT/WP/ACの全IDは[implementation_plan.json](implementation_plan.json)の同じ作業IDを参照。対象G/Xの正常/例外/境界は元#43の[受入表](../review-2026-10-11/ACCEPTANCE.md)を維持する。

### CP03 PR #48のWebKit保存状態の不一致を解消する

元工程: AP04 / AP02。範囲: 必須。状態: planned。

**変更/確認の入口**: `src/ui/EntityEditor.tsx`、`src/ui/Fields.tsx`、`src/storage/store.ts`、`tests/e2e/ap04-original-n-failure-retry.spec.ts`。

1. AT-N18の容量失敗、再試行、不正参照、元JSONへ戻す、保存する、同期失敗・再送を元手順で再現する。WebKitの実traceとnative保存内容を先に照合する。
2. 元JSONに戻したときのdirty/error/ack/revisionと、未保存入力・編集中フラグ・保存Promiseを記録する。clean時の早期終了が表示を残す可能性は調査仮説であり、原因とは断定しない。
3. 実際に保存した版だけを保存済みと示す最小修正を行う。不要な履歴追加を復活させず、同時入力・取消・アカウント切替・失敗入力の保持を再確認する。

**完了条件**: 元5000ms以内に実保存に対応する表示となる。元caseの同期失敗/再試行まで成功し、native/cold/完全復元と3ブラウザー/全CIを満たす。

**戻し方**: 製品差分を個別に戻せる。表示だけを強制成功にせず、fixture・正期待・時間上限を維持する。

**対応**: 原REQ/AT/WP/ACの全IDは[implementation_plan.json](implementation_plan.json)の同じ作業IDを参照。対象G/Xの正常/例外/境界は元#43の[受入表](../review-2026-10-11/ACCEPTANCE.md)を維持する。

### CP04 取り込み済みAP02の3通常操作を統合版で完了する

元工程: AP02。範囲: 必須。状態: planned。

**変更/確認の入口**: `tests/e2e/link-candidate-ignore.spec.ts`、`tests/e2e/consultation-context.spec.ts`、`tests/e2e/startup-migration-retry.spec.ts`、`src/ui/ConsultationContext.tsx`。

1. 原3specをChromium/Firefox/WebKitで各9件、計27件実行し、固定候補の実入力・出力・native・cold・new/cloneを保存する。旧b56の27成功を転用しない。
2. 候補除外のアカウント/作品/本文scope、同名確定リンクと除外解除を確認する。引用資料を持つ元F27と、別アカウントの条件も別に確認する。
3. 相談の前後状態・公開範囲・対象版・失敗後入力・別案を確認する。移行の再失敗/取消/遅延通知/通常再試行と、原E12の未確認実条件を対応表へ残す。

**完了条件**: AC-G02/03/04の正常/例外が同じ候補で成功。原F27/F36/E12の未観測条件には操作と必要環境がある。

**戻し方**: 元DBと正本作品を変更しない隔離fixture。失敗時は元データ・入力・完全ファイルを保持する。

**対応**: 原REQ/AT/WP/ACの全IDは[implementation_plan.json](implementation_plan.json)の同じ作業IDを参照。対象G/Xの正常/例外/境界は元#43の[受入表](../review-2026-10-11/ACCEPTANCE.md)を維持する。

### CP05 Large113履歴の完全保存と空環境復元を成功させる

元工程: AP03。範囲: 必須。状態: planned。

**変更/確認の入口**: `scripts/measure-large-history.mjs`、`scripts/large-history-verification-entry.mjs`、`src/storage/archiveData.ts`、`src/storage/archiveExport.worker.ts`、`src/storage/recovery.ts`、`src/domain/projectRecordValidation.ts`。

1. 元seed、88003記録、実素材75497472bytes、112通常編集→113履歴/送信待ちを保持し、soak-seconds 0の新しい診断を実行する。helper/source/distの実bytesを実行前後に保持する。
2. 履歴read、全件検証、共有解除、圧縮、download、Worker終了、cleanupを区間別に記録する。UI進捗/取消の実描画と容量拒否を区別し、観測した遅い区間だけを修正する。
3. 実完全fileとSHAを取得し、空環境new/clone/coldで全記録・素材・113全command/pending・連続before/after・順序・ID対応を照合する。破損/未知形式/最終段エラー/取消後再試行も保持する。

**完了条件**: 元600000ms内に実完全fileを取得し、全履歴・全hash・typed IDと空new/clone/coldが一致。進捗/取消の2000msと応答条件も実測。診断0は7200秒受入の成功にしない。

**戻し方**: native1.0.0と原子保存を維持する。履歴削減/素材除外/検証省略/上限延長を禁止。cache不具合は元の完全検証へ戻す。

**対応**: 原REQ/AT/WP/ACの全IDは[implementation_plan.json](implementation_plan.json)の同じ作業IDを参照。対象G/Xの正常/例外/境界は元#43の[受入表](../review-2026-10-11/ACCEPTANCE.md)を維持する。

### CP06 同じ最終候補の性能・180保存を測る

元工程: AP03。範囲: 必須。状態: planned。

**変更/確認の入口**: `scripts/measure-app.mjs`、`scripts/measure-storage.mjs`、`docs/spec/NONFUNCTIONAL_REQUIREMENTS.md`、`docs/quality/current-review`。

1. 元Standard8800/Large88003＋実72MiBを使用し、各30回の全生値・起点/終点・OS/browser/装置・nearest-rank p95を保存する。実際に入力可能な編集欄を終点にする。
2. Standard起動3000ms、操作200ms、検索500ms、保存1000ms、操作中図/年表33.4ms、Large起動10000ms/検索2000msを原仕様どおり判定する。入力待ち500msは保存区間外。
3. 元3保存形式×各30回×素材有無の計180回と、実完全ファイル・旧91履歴・new/clone/coldの回帰を同候補で実行する。失敗は全runを保存し、改善後は影響する指標を再測定する。

**完了条件**: 元全指標・全試行・180保存・実復元が同じ最終製品で成功。丸め/epsilon/最良run選択/固定データ縮小は使わない。実機条件はCP11へ残す。

**戻し方**: 測定のみでは正本を変更しない。改善commitと測定結果を版別に分け、失敗rawを保持する。

**対応**: 原REQ/AT/WP/ACの全IDは[implementation_plan.json](implementation_plan.json)の同じ作業IDを参照。対象G/Xの正常/例外/境界は元#43の[受入表](../review-2026-10-11/ACCEPTANCE.md)を維持する。

### CP07 実7200秒編集後の113履歴完全復元を完了する

元工程: AP03。範囲: 必須。状態: planned。

**変更/確認の入口**: `scripts/measure-large-history.mjs`、`docs/quality/current-review`。

1. 同じ最終build・入力でsoak-seconds 7200を専有実行し、monotonic経過が7200秒以上であることを保存する。短い診断や時計変更で代替しない。
2. 112通常編集/検索/試読/回転と22オフラインcold、112全現在内容/素材bytes、113全履歴/送信待ちを元手順で観測する。重い測定を同じ資源上で同時に走らせない。
3. 最後の完全downloadと空new/clone/coldまで直接確認し、失敗なら最後の進捗・alert・Worker時刻・native・rawを保存して再開点を示す。

**完了条件**: 実7200秒と最終完全file/復元の両方が成功。連続編集だけの成功を復元込みの完了にしない。

**戻し方**: 隔離作品と独立attemptで実行する。過去の2時間失敗を上書きしない。

**対応**: 原REQ/AT/WP/ACの全IDは[implementation_plan.json](implementation_plan.json)の同じ作業IDを参照。対象G/Xの正常/例外/境界は元#43の[受入表](../review-2026-10-11/ACCEPTANCE.md)を維持する。

### CP08 原116ケース・464条項の通常操作と不足機能を埋める

元工程: AP04。範囲: 必須。状態: planned。

**変更/確認の入口**: `tests/e2e`、`tests/fixtures`、`docs/quality/ap04-2026-10-11`、`src/ui`、`src/domain`、`src/storage`。

1. acceptance_plan.jsonの原4節ごとにgiven/when/then/negative_or_edgeを同じfixtureで観測する。PR #48のauthored入口やCI667成功は実行候補・補助結果として扱い、全116の合格へ移記しない。
2. 同occurrenceId再送、状態変更元への復帰、固定世界/知識/作者仮説、制作doneの維持、作者索引→実段落・公開秘密除外、削除/欠落IDの再開案内を通常操作→保存→cold→完全fileで確認する。
3. 原F57の全文検索/作者索引/タグの区別を同じ条件で確認する。専用tag query未実装という#48記録だけで仕様にない検索演算子を増やさず、既存タグで原文を満たせない部分が実再現されたら最小実装を追加する。
4. localとexternal条件を条項単位で分け、未観測の条件には次の一操作と必要な環境を記す。原24工程・6回帰群へ対応し、外部待ち中も独立の通常操作を続ける。

**完了条件**: 原文と全IDは不変。実動作の欠陥は同じ正期待で修正し、各条項に対象版・fixture・実操作・実結果・証拠がある。全体合格はCP15で判定する。

**戻し方**: fixture/oracle/原上限/元timeoutを維持。手順誤りは旧失敗を保持して別runへ訂正する。

**対応**: 原REQ/AT/WP/ACの全IDは[implementation_plan.json](implementation_plan.json)の同じ作業IDを参照。対象G/Xの正常/例外/境界は元#43の[受入表](../review-2026-10-11/ACCEPTANCE.md)を維持する。

### CP09 更新・復元と全出力の互換性を統合版で確認する

元工程: AP03 / AP06。範囲: 必須。状態: planned。

**変更/確認の入口**: `src/ui/BackupPanel.tsx`、`src/domain/exports.ts`、`src/portable/gameReceiver.ts`、`src/ui/GameHandoffPanel.tsx`、`docs/implementation/EXPORT_COMPATIBILITY.md`、`tests/e2e/ap04-original-e12-continuity.spec.ts`。

1. 旧native DB、旧完全形式、更新worker、容量不足、単体復元、未同期保護解除後replace、異作品mapped_merge、取消・遅延ACKを通常画面で確認する。元旧アプリの実更新/Files取消はCP11へ分ける。
2. 原F19/F21/F24/F42/F54/N08/N19/N20に対応し、全出力profile・固定版・秘密・ID・暦・ルビ・翻訳・索引・除外項目を実ファイルで確認する。
3. 未対応外部commandの原givenで対応先選択→不一致表示→安全な出力のみ生成する。汎用scenario-runtimeの独立browser受取例→receipt持帰り→保存/cold/完全fileを実施する。Unity等への自動変換を新規必須にしない。

**完了条件**: native1.0.0/runtime形式1.0.0/profile1.1.0/browser-game1.0.0の契約を維持。ID/hash/全素材/旧版を保持し、未対応・秘密・破損は生成前または確定前に拒否する。

**戻し方**: 旧ファイルと旧buildを保持し、製品差分は戻せる。変換済みと偽装せず安全な本文出力は利用者の明示選択へ分ける。

**対応**: 原REQ/AT/WP/ACの全IDは[implementation_plan.json](implementation_plan.json)の同じ作業IDを参照。対象G/Xの正常/例外/境界は元#43の[受入表](../review-2026-10-11/ACCEPTANCE.md)を維持する。

### CP10 証拠の保存と別環境への引渡しを完了する

元工程: AP01。範囲: 必須。状態: planned。

**変更/確認の入口**: `docs/quality/ap01-2026-10-11/HANDOVER.md`、`docs/quality/current-review`、`docs/implementation/RELEASE.md`。

1. C29の元MANIFEST/37分割・1858947725bytes、32旧artifact不足・C24 logical path重複を元台帳から一件ずつ確認する。取得元が旧一時環境だけなら原bytes取得不能を残す。
2. 取得できる旧証拠はhash/bytes/版/保存期限を保持して照合する。元データがない場合、後の実行で古い証拠を作り直したと表示しない。新候補の証拠は新しいmanifestとして保存する。
3. 空の作業環境で実download・全bytes/SHA照合・実ファイル再読込まで確認し、携帯向け要約と不足時の再開方法を付ける。大きな旧packetを本資料PRへ複製しない。

**完了条件**: 必要な証拠の取得先が実際に使え、対象版とhashが一致。取得不能な旧packetはG07 blockedのまま区別し、旧引渡し成功を宣言しない。

**戻し方**: 証拠原本を変更せずmanifest追記だけを戻せる。秘密や認証値を公開packetへ入れない。

**不足する実環境**: C29の元37分割とMANIFESTを取得できる保存元。現在は旧一時環境由来で未確認。

**対応**: 原REQ/AT/WP/ACの全IDは[implementation_plan.json](implementation_plan.json)の同じ作業IDを参照。対象G/Xの正常/例外/境界は元#43の[受入表](../review-2026-10-11/ACCEPTANCE.md)を維持する。

### CP11 iPhoneを中心に実端末の編集・Files復元を確認する

元工程: AP05。範囲: 必須。状態: planned。

**変更/確認の入口**: `docs/implementation/USER_GUIDE.md`、`docs/implementation/EXTERNAL_CONDITIONS.md`、`src/ui`。

1. 同じ最終候補の配布用build・版表示・5〜10分に区切った手順・隔離サンプル・OS/browser記録欄を用意する。主端末はiPhone17Pro Safari、補助iPhone11Pro/iPadPro2018、原計画のPCも別条件とする。
2. 人物→場面→本文→試読→端末保存→Filesへ完全保存→空領域new/clone復元を実端末で行う。日本語変換中保存、下側入力、縦横、分割、44px操作、オフライン、録音許可/拒否を確認する。
3. Files取消、通信断、容量拒否、実旧アプリ更新、素材未取得時も元作品と入力を保持する。利用者が実操作した結果を版付きで受け取り、再現した欠陥だけ修正する。

**完了条件**: 原N01/N02/N11/N13/N14・E01/E07/E10/E12等の実端末条件が満たされる。Linux WebKitや画面幅変更は補助証拠として分ける。

**戻し方**: 本番作品で失敗注入せず隔離コピーを使う。作業前の完全保存と旧候補を保持する。

**不足する実環境**: 実iPhone/iPad/PCの操作結果と実OS/browser版。固定候補のHTTPS検証場所。

**対応**: 原REQ/AT/WP/ACの全IDは[implementation_plan.json](implementation_plan.json)の同じ作業IDを参照。対象G/Xの正常/例外/境界は元#43の[受入表](../review-2026-10-11/ACCEPTANCE.md)を維持する。

### CP12 読み上げ・文字200%・キーボードを確認する

元工程: AP05。範囲: 必須。状態: planned。

**変更/確認の入口**: `src/ui/components.tsx`、`src/ui/Timeline.tsx`、`src/ui/Relationships.tsx`、`src/ui/WindowedList.tsx`、`docs/implementation/USER_GUIDE.md`。

1. 図の表による代替・フォーカス順・名称・警告・取消後の復帰・仮想一覧の末尾までの短い実操作表を用意する。自動検査と手動観測の欄を分ける。
2. 実VoiceOver/NVDA・キーボード・200%文字で主操作を完了し、画面外の焦点・隠れた保存ボタン・色だけの判別・モーダルの移動不能を確認する。
3. 実端末の失敗を最小のUI変更で修正し、該当操作と保存/cold/復元を再確認する。ピンチ制限を文字拡大確認の省略理由にしない。

**完了条件**: 原N03と対象B24/F31/F32/N18の手動条件が固定候補で成功。支援技術がない場合は未実行のまま残す。

**戻し方**: UI差分を戻せる。通常の編集・原文・入力保持を保つ。

**不足する実環境**: 実VoiceOver/NVDA・実OSキーボード・200%表示の結果。

**対応**: 原REQ/AT/WP/ACの全IDは[implementation_plan.json](implementation_plan.json)の同じ作業IDを参照。対象G/Xの正常/例外/境界は元#43の[受入表](../review-2026-10-11/ACCEPTANCE.md)を維持する。

### CP13 専用同期で5役割・二端末・秘密保護を確認する

元工程: AP06。範囲: 必須。状態: planned。

**変更/確認の入口**: `src/sync`、`supabase/migrations`、`scripts/sync/live-contract.mjs`、`scripts/sync/live-plan.example.json`、`tests/fixtures/sync`。

1. 専用project ID/管理者/fixture tenant/HTTPS URL/public key/private bucket/5実アカウント/二端末を具体化する。既存の別用途ランキングDBを流用しない。Supabase実装前に現行changelogと公式Auth/DataAPI/Storage資料を確認する。
2. 現在のmigrationと対象schemaを読み、差分・復元方法・dry-run結果をレビュー可能にする。既存許可範囲内の専用環境でのみ適用し、新規課金や別用途DB変更は行わない。
3. owner/editor/reviewer/reader/nonmemberで通常UIと直接APIの許可/拒否を確認する。古い権限、撤回、認証失効、同本文競合、削除対編集、重複再送、private素材、公開索引/件数/URLからの秘密漏れを実二端末で試験する。

**完了条件**: 原F29/F30/F34/N07/N08・E05/E06/E09の実環境条件が成功。模擬HTTP/隔離SQL/UUID設定を実Authと行単位権限・素材取得の成功にしない。

**戻し方**: 専用fixtureの完全backupと旧構成を保持。許可不足は必要環境付きblockedとし、CP04〜CP12など独立作業は続ける。

**不足する実環境**: 指定済みの専用同期接続先・5実アカウント・private bucket・二端末・管理者権限。

**対応**: 原REQ/AT/WP/ACの全IDは[implementation_plan.json](implementation_plan.json)の同じ作業IDを参照。対象G/Xの正常/例外/境界は元#43の[受入表](../review-2026-10-11/ACCEPTANCE.md)を維持する。

### CP14 実容量・費用・配信条件を確認する

元工程: AP06。範囲: 必須。状態: planned。

**変更/確認の入口**: `docs/implementation/EXTERNAL_CONDITIONS.md`、`docs/implementation/RELEASE.md`、`docs/spec/NONFUNCTIONAL_REQUIREMENTS.md`、`scripts/sync`。

1. 専用tenantのtier/region/使用量/残量/添付上限/送信上限/実行予算と、配信先の現設定を読取りで記録する。公開料金表を実契約や実残量の値として扱わない。
2. アプリ完全file64MiB、素材上限、実Storage/通信の上限を別欄で持ち、隔離fixtureの境界失敗で端末内容・bytes・送信待ちを保持する。最新公式値は実施時に再確認する。
3. base /shinariokanri/・生成物・cache更新・直リンク・依存LICENSE/NOTICE・復元手順を検証候補で用意し、実公開先と費用の確認結果をCP15へ渡す。

**完了条件**: 原N17/N20と容量条件の現実値・境界の実結果・対象版がある。費用ゼロや公開済みを未確認のまま断定しない。

**戻し方**: 料金・契約・支払・有料機能を変更しない。読取り資料と隔離fixtureだけを戻せる。

**不足する実環境**: 専用tenantの現在設定/使用量/費用を読める情報と、利用者が指定する検証/配信先。

**対応**: 原REQ/AT/WP/ACの全IDは[implementation_plan.json](implementation_plan.json)の同じ作業IDを参照。対象G/Xの正常/例外/境界は元#43の[受入表](../review-2026-10-11/ACCEPTANCE.md)を維持する。

### CP15 全原計画を判定して完成候補を提出する

元工程: AP10。範囲: 必須。状態: planned。

**変更/確認の入口**: `scripts/check_release.py`、`.github/workflows/release.yml`、`docs/implementation/RELEASE.md`、`docs/implementation/USER_GUIDE.md`、`docs/quality/current-review`。

1. 同一最終製品commit/tree/build/baseに原104要件・116ケース/464条項・24工程・6回帰群、AC-Gの正常/例外を結び付ける。失敗/未実行/部分/blocked/版不一致を0にする。
2. 原9gateのrealDevices/accessibilityManual/performance/restoreDrill/syncLive/rlsLive/independentReview/hostingCosts/directLinksを実証拠付きで満たす。check_release.pyの判定を変更せず、外部release-evidence artifactへ対象commitを記録する。
3. 原計画の完成とX追加案の採用範囲を別に判定する。採用したXだけは対応AC36/移行/互換/原回帰まで満たす。未採用なら原104の完成率に算入しない。
4. 利用者向け短い説明・未解決0の証拠索引・復元方法・公開後確認手順をDraft PRへまとめる。mergeと公開切替は利用者の許可済み範囲だけで実施する。

**完了条件**: 原release checkerが対象commitで成功し、独立した証拠内容確認も成功。CIと文書検査だけで完成を宣言しない。必要実環境がなければ具体不足を記して公開判定を保留する。

**戻し方**: 配信前の旧build/完全backupを保持。文書delivery commitを製品試験commitへ置き換えず、自己hashをソースへ埋め込まない。

**対応**: 原REQ/AT/WP/ACの全IDは[implementation_plan.json](implementation_plan.json)の同じ作業IDを参照。対象G/Xの正常/例外/境界は元#43の[受入表](../review-2026-10-11/ACCEPTANCE.md)を維持する。

### CP16 追加12案の採用範囲と形式変更を記録する

元工程: AP07 / AP08 / AP09。範囲: 追加採用時のみ。状態: planned。

**変更/確認の入口**: `docs/review-2026-10-11/REQUIREMENTS.md`、`docs/review-2026-10-11/extension_requirements.json`、`docs/spec/FILE_FORMAT.md`。

1. X01〜X12はrecommendedであり、現在の作業記録は未採用。採用済みと推測せず、対象Xと利用者の採用指示・仕様・対応AC・互換の決定を記録する。採用指示がない対象は提案のまま保持する。
2. 端末表示だけの追加と正本レコードの追加を分ける。永続拡張を採用した場合はProject/完全package/minimumReaderVersion1.1.0、既知extensionsのみ、全上限への算入、旧1.0.0からの原子移行を先に設計する。
3. 原104の完成は未採用Xで止めず、Xの未実装を原要件の削除へ転用しない。全て採用する指示を得た場合はCP17〜CP19とAC-X36を完成対象へ追加する。

**完了条件**: 採用対象・保留対象・必要schema・対応ACが明確。未採用案を実装済み/必須と表示しない。

**戻し方**: 採用記録のPRを戻せる。未採用キーや旧buildへ読めない形式を先行導入しない。

**対応**: 原REQ/AT/WP/ACの全IDは[implementation_plan.json](implementation_plan.json)の同じ作業IDを参照。対象G/Xの正常/例外/境界は元#43の[受入表](../review-2026-10-11/ACCEPTANCE.md)を維持する。

### CP17 採用した入口・保存確認・二版比較・素材条件を追加する

元工程: AP07。範囲: 追加採用時のみ。状態: planned。

**変更/確認の入口**: `src/ui/GuidedWorkspace.tsx`、`src/ui/BackupHealthPanel.tsx`、`src/ui/VersionComparisonPanel.tsx`、`src/ui/AssetUsagePolicyEditor.tsx`、`src/domain`、`src/storage`。

1. 採用したX01/X07/X09/X10だけを対象に、既存雛形・表示設定・履歴・保存失敗通知・素材出力との差分を確認する。全機能へ戻れる入口と途中入力を保つ。
2. 5段階以下の用途案内、実検証に基づくbackup状態、二版の本文/設定差分、素材版の利用条件/表記を作る。未検証backupを正常としない。素材条件を法的自動判定にしない。
3. 型/schema/移行/固定版/完全file/clone ID/秘密投影を必要範囲で更新し、対象ACの正常/例外/境界と原関連ケースを実行する。

**完了条件**: 採用した4機能の対応AC12件が成功。旧1.0.0backup→新1.1.0の原子移行、取消・容量不足・旧reader拒否・未知key拒否を確認する。

**戻し方**: 旧buildへ戻すときは旧1.0.0backupを使う。新形式を旧buildへ強制読込しない。

**対応**: 原REQ/AT/WP/ACの全IDは[implementation_plan.json](implementation_plan.json)の同じ作業IDを参照。対象G/Xの正常/例外/境界は元#43の[受入表](../review-2026-10-11/ACCEPTANCE.md)を維持する。

### CP18 採用した置換・翻訳表・用語確認・経路テストを追加する

元工程: AP08。範囲: 追加採用時のみ。状態: planned。

**変更/確認の入口**: `src/domain/bulkTextReplace.ts`、`src/domain/localizationTable.ts`、`src/domain/localizationChecks.ts`、`src/domain/narrativeTests.ts`、`src/ui`、`scripts/narrative/run-suite.mjs`。

1. 採用したX03/X04/X05/X06のpreview→作者確認→原子確定を作る。本文UUID/台詞ID/Unicode注記/原文hash/秘密範囲を維持する。
2. CSV manifestとlineId/locale/sourceHash/targetText、埋込み語/用語規則、期待最終値/到達/伏線の経路集合を原仕様へ接続する。CSVを式として実行せず、古い原文やunknownを成功にしない。
3. 取消/容量不足/衝突/旧版/新旧完全file/new/clone/coldと対応AC12件を確認し、headless実行の実結果を保存する。

**完了条件**: 採用範囲のAC12件と原関連Unicode/台詞/出力/履歴ケースが同対象で成功。previewだけでは正本を変更しない。

**戻し方**: 履歴付き原子操作で取消でき、元CSV/manifest/元本文と期待値版を保持する。

**対応**: 原REQ/AT/WP/ACの全IDは[implementation_plan.json](implementation_plan.json)の同じ作業IDを参照。対象G/Xの正常/例外/境界は元#43の[受入表](../review-2026-10-11/ACCEPTANCE.md)を維持する。

### CP19 採用した横断検索・試読修正・目標・Twee連携を追加する

元工程: AP09。範囲: 追加採用時のみ。状態: planned。

**変更/確認の入口**: `src/domain/workspaceSearch.ts`、`src/ui/WorkspaceSearch.tsx`、`src/ui/TrialEditReturn.tsx`、`src/domain/writingGoals.ts`、`src/domain/adapters/twee3.ts`、`src/ui/ExternalStoryImport.tsx`。

1. 採用したX02/X08/X11/X12だけを対象に、許可作品の派生横断索引、旧traceを残す修正/再試読、任意目標、限定passage/linkのTwee3変換を実装する。
2. 複数アカウント・撤回・秘密件数、古い版の本文・固定世界、暦/目標を分ける。Tweeの外部構文は実行せず、未対応spanを原文付きで示す。sidecarなしを無損失対応と表示しない。
3. sidecarの元hash/ID対応/原独自設定・改ざん拒否、別案取込・原文保護・上限、完全new/clone/coldと対応AC12件を確認する。採用後はCP15を追加範囲込みで再判定する。

**完了条件**: 採用範囲のAC12件と原権限/秘密/固定世界/互換ケースが成功。Tweeは宣言した限定範囲でのみ往復する。

**戻し方**: 派生索引は再生成可能。別案を確定前に破棄でき、目標が正本の品質/状態を変えない。

**対応**: 原REQ/AT/WP/ACの全IDは[implementation_plan.json](implementation_plan.json)の同じ作業IDを参照。対象G/Xの正常/例外/境界は元#43の[受入表](../review-2026-10-11/ACCEPTANCE.md)を維持する。

## 実行コマンドの入口

候補の独立checkoutで、package-lockに従い依存を準備する。これらは未実行の指示であり今回の成功記録ではない。試験先・fixture・build-info/source/distを固定し、元workflowと同じ順序/上限を守る。

```bash
npm ci
python3 scripts/check_docs.py
python3 scripts/check_completion_plan.py
python3 scripts/check_review_20261011.py
python3 docs/completion-replan-2026-10-12/validate.py --verify-git
python3 -m unittest discover -s scripts -p 'test_check_*.py' -v
npx playwright install --with-deps chromium firefox webkit
npm test -- --maxWorkers=1 --fileParallelism=false
npm run build
# CP02の元ケース、CP03の元ケースを先に3ブラウザーで再現・修正・確認する
BROWSER_ENGINES=all npm run test:e2e
npx playwright test -c tests/rb10/playwright.config.ts --project=chromium
RB03_ENGINES=chromium,firefox,webkit node tests/browser/run-rb03-components.mjs
```

RB04 authorとwriting2ブラウザーを含む残りも`.github/workflows/ci.yml`の元コマンドを実行する。CIで後半がskipなら全体成功にしない。Chromium実体は同workflowのCHROMIUM_PATH設定で固定する。

```bash
# 出力先は新しい独立attempt。対象ソースを先にコミットしclean buildで固定する
node scripts/measure-large-history.mjs --soak-seconds 0 --output /tmp/replan-cp05-new-attempt/raw.json
node scripts/measure-app.mjs --size standard --mode performance --samples 30 --output /tmp/replan-cp06-standard-new-attempt/raw.json
node scripts/measure-app.mjs --size large --mode performance --samples 30 --output /tmp/replan-cp06-large-new-attempt/raw.json
node scripts/measure-large-history.mjs --soak-seconds 7200 --output /tmp/replan-cp07-new-attempt/raw.json
```

180保存・各実環境の操作・全原受入は[ACCEPTANCE.md](ACCEPTANCE.md)と元ハーネスを使用する。短い診断は7200秒の代わりにしない。上記/tmpは一時実行場所であり成果物の引渡し先にしない。終了ごとに実bytesを取り出して保存先・hash・対象版を記録する。

## PRへ載せる内容

一つの製品PRに一つの書込み担当を固定する。#48の続きと同pathの別実装を重ねない。PRにはCP/G/X/REQ/AT/AC、再現する入力と旧失敗、最小変更、同候補の成功結果、残件、形式/移行/権限の影響、戻し方を記す。文書・対応表・実証拠を併せて更新する。

merge・公開・課金・別用途DB変更・Codex Cloud environmentsの新規作成/再起動/選択をこの計画の自動完了操作に含めない。利用者の既存許可の範囲を確認し、通常のWorkと既存接続で進める。新しい依頼を利用者のCodex枠へ勝手に送らない。
