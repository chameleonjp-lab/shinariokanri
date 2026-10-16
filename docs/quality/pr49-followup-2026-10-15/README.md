# PR #49の後続対応・最終ローカル結果

2026-10-16 UTC更新。[原計画CP01〜CP15](../../completion-replan-2026-10-12/IMPLEMENTATION_PLAN.md)の実行可能なローカル検証と証拠引渡しを完了し、[Draft PR #58](https://github.com/chameleonjp-lab/shinariokanri/pull/58)へ提出する。原116ケース・464条項を個別照合し、**94ケースがローカル条件を満たし、22ケースは実環境の原条件待ち**。完成版の公開判定は保留する。

測定製品は `1fcadcca703863873a57d297e83b1b184e63e778` / tree `8ac6e33a98455204aa265be5ce86ee5be168a97b` / clean build `8ec3a03810bb0cf1b1b4` / base `/shinariokanri/`。[製品の封印](evidence/product/binding.json)に513 sourceのGit blob/bytes/SHAと13配信ファイルを固定し、実行前後に照合した。証拠追加用の配布commitやCI固有buildへ実行対象を付け替えない。

確認mainは `1f642457fab18bd545e8422b1b92988e11538266`。関係図修正と保存workflowを含むPR #57は2026-10-16 06:07:44Zに外部で取り込まれた。本作業からmerge・公開切替・外部DB変更・課金・第三者への通知は行っていない。参照チャットを読む `read_thread` は提供されていなかったため、チャット名を根拠にせず、実GitHub状態・原計画・指定Drive資料を確認した。

## 確定した実結果

| 原検証 | 実結果と範囲 |
| --- | --- |
| Standard全8指標・各30回 | 全て元の数値条件内。関係図p95 `33.30000000000291ms`、元上限33.4ms |
| Large全8指標・各30回 | 明示上限のある起動5731.5ms≤10000ms、検索562.8000000044703ms≤2000ms。他6指標は観測値として保持 |
| 元6条件×30保存 | 180件成功。全6条件のcommand p95≤1000ms。入力待ち500msを除く元始終点を使用し、UI開始→成功通知は別計測 |
| 元180保存後の復元 | 全91履歴・送信待ち・実素材のcold保持と空領域への完全ファイル復元が成功 |
| 実7200秒 | 実経過7200.018523761秒、112通常編集、22 offline cold、14 native照合。最終全量復元・cleanup・実CLI終了0まで完了 |
| 2時間後の完全ファイル | 235817ms≤元600000ms。2721202 bytes、SHA `33d8dfc5ae388a6c04554bf7d7c82644278e1e72db92c7c3f202b5320f36069d` |
| 全113履歴の復元 | 元88003記録、113履歴/送信待ち、162117 typed owned ID、3素材/72MiBをnew/clone/coldの元全量oracleで照合 |
| 進捗・取消 | 初回描画37.600000001490116ms、取消42.399999998509884ms、最大UI間隔1124.8000000044703ms。元2000ms条件内 |
| 同じ全量ファイルの異常系 | projectの1byte hash破損、unknown major、最後の24MiB素材末尾1byte破損を理由/path付き拒否 |
| 全量の最終保存段階 | 113履歴・113送信待ち・3素材を書いた後の一般エラー/容量不足を原子拒否。対象21表は0、入力と復元方法を保持し、通常再試行後のcold全量照合まで実終了0 |
| 元固定データの回帰UI補完 | 元fixture関数を変更しないR02条件変更有無×skip/via/initial6件、R03の3進行規則×単独/混合6件が成功。実archive入力/出力30個を保持 |

[正式測定](evidence/local-formal-summary.json)には全30生値、nearest-rankとcommand/UIの別区間を残す。年表/関係図は元30ジェスチャーから得た各330 frameを元定義のまま判定する。14 native照合を公開snapshot14件やStoredCommandの復元点14件とは解釈しない。v1の必要なcommand hash処理は残り、少量保存の実観測digest3回/6259174 bytesをhashゼロとは記載しない。

関係図では座標更新をまとめ、同じ辺/ラベルの再描画、重なり判定の割り当て、図領域の描画を改善した。元の配置順・試行回数・余白・寸法を保ち、128入力の全座標/幅/キャンバス寸法が完全一致。関連unit29件と既存画面5件も成功した。旧3ab6の図p95 66.70000000000437msと途中の失敗・実ソースを保存し、33.400000000001455msを丸めて合格にはしていない。元fixture・件数・文字量・素材・assert・timeout・retry・skip・上限は維持する。

## 受入と公開判定

[逐条レビュー](CLAUSE_REVIEW.json)は全116ケース/464節の原given・when・then・negative_or_edge、実入力/操作/結果、具体的な不足を保持する。[著者の個別判定](evidence/author-current-decisions.json)を適用した結果が94/22であり、タイトルや実行件数から合格を推定していない。N05の原Largeだけは、原規則に基づき旧clean3ab6の実実行と[無影響の根拠](evidence/unaffected-local-3ab6-carry.json)を明示して引き継ぐ。

[24工程](WORK_PACKAGE_REVIEW.json)の個別local gateは18件を確認した。工程全体は元の担当受入と依存を併せて判定するため、WP01が完了、残23工程は原条件または前提工程待ち。[6回帰群](REGRESSION_REVIEW.json)はR02〜R05のローカル原条件を満たす。R01の実iPhone日本語IME、R06の指定実端末での最終性能は未実施。[補助確認68件](SUPPLEMENTAL_REVIEW.json)はG系32件と未採用X系36件を維持し、原116へ加算しない。

[最終release記録](release-evidence.json)に対し、別checkoutの製品1fcで元 `scripts/check_release.py` を変更せず実行した。**実exit1 / RELEASE BLOCKED**、22受入・23工程・元9gateの54不足であり、対象commit/基底パスの不一致は0。[実ログと判定](evidence/release-checker-local/assessment.json)を保持する。workflowの成功は証拠保存の成功であり、公開承認ではない。

## CIと原本の対応

[製品CI run38792131626](https://github.com/chameleonjp-lab/shinariokanri/actions/runs/38792131626)は全7job成功。unit122ファイル/1132件、Chromium・Firefox・WebKit各228件と元の後続検査を実行した。実merge `819b178f8d47048d3bc5aaa6988b67c220a71947` のparentsと製品tree一致をGit実体で確認。原ZIPのprovider SHA/サイズ、全CRC/全inventory、12原復旧ファイルと各engine481 metadata byte照合、全228結果/実添付の保存を確認した。

CI buildはChromium `f26008444ed75dd8c5af`、Firefox `fdfa60b47e1db110ce41`、WebKit `7824d3a0bf4a81f63fe8`。E12の実cache/build観測とjob logを各値へ結合し、ローカルbuildへ付け替えない。元artifactは2027-01-13 UTCまでの保持記録を持つ。今回保存した実原本は下の専用branchからも取得できる。

PR #57の配布用1e77の通常CIも全7job成功し、暫定recordの元checker exit1/149不足を実 `release-evidence` artifactから独立照合した。これは暫定履歴として保持する。PR #58の最終CI、最終record SHAと実artifact ID/検証結果はPR本文と[Drive報告](https://docs.google.com/document/d/1aQ3FI-SmsomUbUBiG0NQ7vp4KdQIqGfbjQ92elvLU9g/edit)へ記録する。最終artifactも製品513 sourceと元checkerのblocked実結果を保持する。

## 証拠の取得と再検証

証拠8束・49 part、7,296実ファイルを[専用保存commit d5e132ef](https://github.com/chameleonjp-lab/shinariokanri/tree/d5e132ef6f4db6a0f3fbe888228ffd1007d653f9)へ固定した。[取得先・全59ファイルのbytes/Git blob/SHA-256](evidence/bundle-location.json)、[8 manifest](evidence/bundles)、[取得プログラム](evidence/fetch_bundles.py)、[検証プログラム](evidence/verify_bundles.py)を用意した。保存branchは検証資料専用でありmainへ取り込む対象ではない。

公開先から新しい空領域へ匿名HTTPで全59ファイルを実取得し、Git blob/bytesを照合した。配布する取得プログラムでも別の空領域へのbytes/Git blob/SHA-256照合を実行。**実際にダウンロードした検証プログラム**で全8束を展開し、全7,296ファイルのbytes/SHAと正規のmember集合を確認した。[実取得記録](evidence/provenance/evidence-publication/portable-fetch-receipt.json)と[検証の実終了0](evidence/provenance/evidence-publication/remote-verification-execution/exit.json)を保持する。第三者の受入実施とは区別する。

このフォルダーで、未使用の出力先を指定して実行する。

```bash
python3 evidence/fetch_bundles.py --location evidence/bundle-location.json --destination /tmp/pr49-proof-new --receipt /tmp/pr49-fetch-new.json
python3 /tmp/pr49-proof-new/docs/quality/pr49-followup-2026-10-15/evidence/verify_bundles.py /tmp/pr49-proof-new/docs/quality/pr49-followup-2026-10-15/evidence/bundles --extract /tmp/pr49-decoded-new
```

manifest内の`path`が展開後の取得先であり、`sourcePath`は当時の実取得元を記録した履歴。各束には当該実行の生結果・実入力/出力・元手順・実ソース・実終了codeを保持する。現在製品、無影響carry、旧CI、失敗/診断、暫定保存workflowを別々のidentityで残す。現在CIの完全な元results.json bytesもgzipで保存し、一覧だけを原結果の代わりにしない。Gitでの保存とActionsの期限を区別し、取得不能時は不足として保留し、元の実行を同条件で取り直して別IDへ記録する。

原C29の約1.85GB/37part/MANIFESTは未取得。[旧不足32宣言](evidence/old-proof-audit.json)中14宣言/10 unique hashだけを実旧C13 member bytesから回収し、18宣言は不足のまま。[C24 RETENTIONの2版](evidence/c24-retention-variants/MAPPING.json)も実SHA別に保存し、正本を推定していない。新しい証拠を旧原本の回収とはしない。

## 原計画の残条件と引渡し

| CP | 現在の結果・残条件 |
| --- | --- |
| CP01 | 現main1f642、既取り込みPR #56/#57、製品1fc、配布PR #58を区別して固定 |
| CP02・CP03 | 元Firefox復元/WebKit保存を含む製品CI全7jobと原artifact/実byte照合が成功 |
| CP04 | 候補除外・相談・移行3specを全3engineで確認。G02の実アカウント切替は未実施 |
| CP05・CP07 | 元7200/full113/72MiB new/clone/coldと同全量破損/未知版/最終一般エラー/容量不足/通常再試行まで完了 |
| CP06 | 元Standard/Large各30・元180保存の正式ローカル測定完了。指定実端末は未実施 |
| CP08 | 原116/464、24工程、6回帰群、68補助確認を原文のまま内容照合し、94 local/22外部待ちを明記 |
| CP09 | native1.0/runtime1.0/profile1.1/browser-game1.0を維持。実旧アプリ更新・OS Files取消・対象ゲームの実結果は未実施 |
| CP10 | 新証拠の固定保存・空領域への実取得/展開を確認。旧C29原37part等と旧不足18宣言は未取得 |
| CP11・CP12 | 実機・Files・IME・録音・回転/SplitView・VoiceOver/NVDA・OS文字200%の短い手順と記録欄を用意。実操作は未実施 |
| CP13 | 専用HTTPS/Auth/DataAPI/private Storage・5実役割・実二端末が未指定。別用途projectの変更は行わない |
| CP14 | 実tier/region/使用量/残量/費用が未確認。2026-10-16 06:15ZのPages build-infoは実404 |
| CP15 | 原9gate/元checkerを維持し、最終recordでも実exit1/54不足。独立レビューと完成・公開は保留 |

[実条件待ち22ケース](EXTERNAL_CASES.md)、[実機・専用同期の手順](MANUAL_REVIEW.md)、[独立レビューの手順](INDEPENDENT_REVIEW.md)を用意した。実機用の最終ローカルZIPは `manual-candidate-1fcadcca-final-pr58.zip`、1098028 bytes、SHA `e3b131c1525447a12e45a6f40c814b595ecd80a529de1f57a5db578ae66da3f6`。25 member・封印dist13・全manifest・既存依存LICENSE/NOTICE・fixture・実PRリンクを独立照合した。[生成/検証記録](evidence/provenance/manual-packet-pr58/verification.json)を保持する。元メモfixtureは旧086の実native1.0入力であり、現候補が生成した結果にはしない。

旧ZIPの指定Driveへの保存は自動承認審査で「この内容の指定先への明示許可と接続先所有確認が不足」として拒否された。許可は未回答。現在の最終ZIPも送信を保留し、コード/検証用の証拠branchへ実機配布ZIPを含めていない。実配布・実機受入の成功とは扱わない。

途中状態・旧製品の成功/失敗・当時の配布物は[履歴](HISTORY.md)に保持する。[原計画の証拠条件](../../completion-replan-2026-10-12/ACCEPTANCE.md)と[検証・版・不足の記録](EVIDENCE.json)を併せて確認できる。原104要件と追加X01〜X12未採用の区分は変更していない。
