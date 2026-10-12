# 原受入を完了するための記録

元の104要件、116ケース、464条項、24工程、6回帰群、G16件の正常/例外32確認、追加12案の正常/例外/境界36確認を保持する。全原文は[acceptance_plan.json](acceptance_plan.json)にある。このPRで製品受入は実行しておらず、最終結果は全てnot_run。

## 一件の受入に必要な情報

原case IDと原4節、対象製品commit/tree/build/base、fixture seed/hash、OS/browser実版、操作手順と時刻、保存前後の実ID/本文/素材/履歴、通常結果と失敗/境界結果、実ファイル・trace・native比較・SHA/bytes・終了codeを同じ対象へ結ぶ。固定snapshot/世界pin/公開profile/権限の版を含める。

CIのタイトルや件数、入口登録、近い小fixture、unit、過去C29、異なるbuildの成功を原4節の成功にしない。4節の一部だけが観測できたらpartialと不足操作を記す。外部条件がない場合はblockedと具体的な不足を示し、独立した条項を先に進める。

## 116ケースの実行入口

PR #48のauthored_entry_inventory/local_acceptance_planから原文を照合して入口候補を引いた。元の405 local/59 externalという分類は準備時の候補分類であり、今回その分類の完全性を実受入したものではない。担当は原句ごとに必要な実条件を再確認する。全116×4節を明示し、元の97 local候補/19外部条件caseを「97件は合格」と計上しない。

| 原case | 元工程 | PR48の入口候補 | 次の観測 |
| --- | --- | --- | --- |
| AT-B01 | WP04 | 0登録 + 既存候補 | 原4節 / 最終not_run |
| AT-B02 | WP07 | 1登録 + 既存候補 | 原4節 / 最終not_run |
| AT-B03 | WP07 | 1登録 + 既存候補 | 原4節 / 最終not_run |
| AT-B04 | WP07 | 1登録 + 既存候補 | 原4節 / 最終not_run |
| AT-B05 | WP06 | 1登録 + 既存候補 | 原4節 / 最終not_run |
| AT-B06 | WP06 | 1登録 + 既存候補 | 原4節 / 最終not_run |
| AT-B07 | WP08 | 1登録 + 既存候補 | 原4節 / 最終not_run |
| AT-B08 | WP04 | 1登録 + 既存候補 | 原4節 / 最終not_run |
| AT-B09 | WP08 | 1登録 + 既存候補 | 原4節 / 最終not_run |
| AT-B10 | WP05 | 0登録 + 既存候補 | 原4節 / 最終not_run |
| AT-B11 | WP04 | 1登録 + 既存候補 | 原4節 / 最終not_run |
| AT-B12 | WP16 | 1登録 + 既存候補 | 原4節 / 最終not_run |
| AT-B13 | WP10 | 1登録 + 既存候補 | 原4節 / 最終not_run |
| AT-B14 | WP12 | 1登録 + 既存候補 | 原4節 / 最終not_run |
| AT-B15 | WP11 | 1登録 + 既存候補 | 原4節 / 最終not_run |
| AT-B16 | WP13 | 1登録 + 既存候補 | 原4節 / 最終not_run |
| AT-B17 | WP15 | 1登録 + 既存候補 | 原4節 / 最終not_run |
| AT-B18 | WP09 | 1登録 + 既存候補 | 原4節 / 最終not_run |
| AT-B19 | WP15 | 1登録 + 既存候補 | 原4節 / 最終not_run |
| AT-B20 | WP10 | 1登録 + 既存候補 | 原4節 / 最終not_run |
| AT-B21 | WP06 | 1登録 + 既存候補 | 原4節 / 最終not_run |
| AT-B22 | WP12 | 1登録 + 既存候補 | 原4節 / 最終not_run |
| AT-B23 | WP03 | 1登録 + 既存候補 | 原4節 / 最終not_run |
| AT-B24 | WP05 | 0登録 + 既存候補 | 原4節 / 最終not_run |
| AT-F01 | WP04 | 0登録 + 既存候補 | 原4節 / 最終not_run |
| AT-F02 | WP04 | 0登録 + 既存候補 | 原4節 / 最終not_run |
| AT-F03 | WP10 | 1登録 + 既存候補 | 原4節 / 最終not_run |
| AT-F04 | WP10 | 1登録 + 既存候補 | 原4節 / 最終not_run |
| AT-F05 | WP10 | 1登録 + 既存候補 | 原4節 / 最終not_run |
| AT-F06 | WP10 | 1登録 + 既存候補 | 原4節 / 最終not_run |
| AT-F07 | WP06 | 1登録 + 既存候補 | 原4節 / 最終not_run |
| AT-F08 | WP06 | 1登録 + 既存候補 | 原4節 / 最終not_run |
| AT-F09 | WP09 | 1登録 + 既存候補 | 原4節 / 最終not_run |
| AT-F10 | WP09 | 1登録 + 既存候補 | 原4節 / 最終not_run |
| AT-F11 | WP09 | 1登録 + 既存候補 | 原4節 / 最終not_run |
| AT-F12 | WP09 | 1登録 + 既存候補 | 原4節 / 最終not_run |
| AT-F13 | WP12 | 1登録 + 既存候補 | 原4節 / 最終not_run |
| AT-F14 | WP12 | 1登録 + 既存候補 | 原4節 / 最終not_run |
| AT-F15 | WP13 | 1登録 + 既存候補 | 原4節 / 最終not_run |
| AT-F16 | WP13 | 1登録 + 既存候補 | 原4節 / 最終not_run |
| AT-F17 | WP14 | 1登録 + 既存候補 | 原4節 / 最終not_run |
| AT-F18 | WP14 | 1登録 + 既存候補 | 原4節 / 最終not_run |
| AT-F19 | WP12 | 1登録 + 既存候補 | 原4節 / 最終not_run |
| AT-F20 | WP13 | 1登録 + 既存候補 | 原4節 / 最終not_run |
| AT-F21 | WP19 | 1登録 + 既存候補 | 原4節 / 最終not_run |
| AT-F22 | WP20 | 1登録 + 既存候補 | 原4節 / 最終not_run |
| AT-F23 | WP19 | 1登録 + 既存候補 | 原4節 / 最終not_run |
| AT-F24 | WP22 | 1登録 + 既存候補 | 原4節 / 最終not_run |
| AT-F25 | WP10 | 1登録 + 既存候補 | 原4節 / 最終not_run |
| AT-F26 | WP05 | 1登録 + 既存候補 | 原4節 / 最終not_run |
| AT-F27 | WP05 | 0登録 + 既存候補 | 原4節 / 最終not_run |
| AT-F28 | WP20 | 1登録 + 既存候補 | 原4節 / 最終not_run |
| AT-F29 | WP18 | 1登録 + 既存候補 | 原4節 / 最終not_run |
| AT-F30 | WP18 | 0登録 + 既存候補 | 原4節 / 最終not_run |
| AT-F31 | WP02 | 0登録 + 既存候補 | 原4節 / 最終not_run |
| AT-F32 | WP02 | 1登録 + 既存候補 | 原4節 / 最終not_run |
| AT-F33 | WP02 | 1登録 + 既存候補 | 原4節 / 最終not_run |
| AT-F34 | WP17 | 0登録 + 既存候補 | 原4節 / 最終not_run |
| AT-F35 | WP16 | 1登録 + 既存候補 | 原4節 / 最終not_run |
| AT-F36 | WP22 | 0登録 + 既存候補 | 原4節 / 最終not_run |
| AT-F37 | WP11 | 1登録 + 既存候補 | 原4節 / 最終not_run |
| AT-F38 | WP11 | 1登録 + 既存候補 | 原4節 / 最終not_run |
| AT-F39 | WP11 | 1登録 + 既存候補 | 原4節 / 最終not_run |
| AT-F40 | WP11 | 1登録 + 既存候補 | 原4節 / 最終not_run |
| AT-F41 | WP11 | 1登録 + 既存候補 | 原4節 / 最終not_run |
| AT-F42 | WP22 | 1登録 + 既存候補 | 原4節 / 最終not_run |
| AT-F43 | WP15 | 1登録 + 既存候補 | 原4節 / 最終not_run |
| AT-F44 | WP15 | 1登録 + 既存候補 | 原4節 / 最終not_run |
| AT-F45 | WP15 | 1登録 + 既存候補 | 原4節 / 最終not_run |
| AT-F46 | WP15 | 1登録 + 既存候補 | 原4節 / 最終not_run |
| AT-F47 | WP15 | 1登録 + 既存候補 | 原4節 / 最終not_run |
| AT-F48 | WP19 | 1登録 + 既存候補 | 原4節 / 最終not_run |
| AT-F49 | WP21 | 1登録 + 既存候補 | 原4節 / 最終not_run |
| AT-F50 | WP21 | 1登録 + 既存候補 | 原4節 / 最終not_run |
| AT-F51 | WP21 | 1登録 + 既存候補 | 原4節 / 最終not_run |
| AT-F52 | WP21 | 1登録 + 既存候補 | 原4節 / 最終not_run |
| AT-F53 | WP20 | 1登録 + 既存候補 | 原4節 / 最終not_run |
| AT-F54 | WP21 | 1登録 + 既存候補 | 原4節 / 最終not_run |
| AT-F55 | WP08 | 1登録 + 既存候補 | 原4節 / 最終not_run |
| AT-F56 | WP04 | 1登録 + 既存候補 | 原4節 / 最終not_run |
| AT-F57 | WP05 | 1登録 + 既存候補 | 原4節 / 最終not_run |
| AT-F58 | WP05 | 1登録 + 既存候補 | 原4節 / 最終not_run |
| AT-F59 | WP08 | 1登録 + 既存候補 | 原4節 / 最終not_run |
| AT-F60 | WP05 | 1登録 + 既存候補 | 原4節 / 最終not_run |
| AT-N01 | WP02 | 1登録 + 既存候補 | 原4節 / 最終not_run |
| AT-N02 | WP23 | 0登録 + 既存候補 | 原4節 / 最終not_run |
| AT-N03 | WP23 | 0登録 + 既存候補 | 原4節 / 最終not_run |
| AT-N04 | WP23 | 0登録 + 既存候補 | 原4節 / 最終not_run |
| AT-N05 | WP14 | 0登録 + 既存候補 | 原4節 / 最終not_run |
| AT-N06 | WP03 | 1登録 + 既存候補 | 原4節 / 最終not_run |
| AT-N07 | WP17 | 0登録 + 既存候補 | 原4節 / 最終not_run |
| AT-N08 | WP18 | 0登録 + 既存候補 | 原4節 / 最終not_run |
| AT-N09 | WP16 | 0登録 + 既存候補 | 原4節 / 最終not_run |
| AT-N10 | WP20 | 1登録 + 既存候補 | 原4節 / 最終not_run |
| AT-N11 | WP03 | 1登録 + 既存候補 | 原4節 / 最終not_run |
| AT-N12 | WP14 | 1登録 + 既存候補 | 原4節 / 最終not_run |
| AT-N13 | WP05 | 0登録 + 既存候補 | 原4節 / 最終not_run |
| AT-N14 | WP16 | 1登録 + 既存候補 | 原4節 / 最終not_run |
| AT-N15 | WP24 | 1登録 + 既存候補 | 原4節 / 最終not_run |
| AT-N16 | WP01 | 1登録 + 既存候補 | 原4節 / 最終not_run |
| AT-N17 | WP24 | 0登録 + 既存候補 | 原4節 / 最終not_run |
| AT-N18 | WP02 | 1登録 + 既存候補 | 原4節 / 最終not_run |
| AT-N19 | WP10 | 1登録 + 既存候補 | 原4節 / 最終not_run |
| AT-N20 | WP22 | 3登録 + 既存候補 | 原4節 / 最終not_run |
| AT-E01 | WP23 | 0登録 + 既存候補 | 原4節 / 最終not_run |
| AT-E02 | WP23 | 1登録 + 既存候補 | 原4節 / 最終not_run |
| AT-E03 | WP23 | 1登録 + 既存候補 | 原4節 / 最終not_run |
| AT-E04 | WP23 | 1登録 + 既存候補 | 原4節 / 最終not_run |
| AT-E05 | WP23 | 0登録 + 既存候補 | 原4節 / 最終not_run |
| AT-E06 | WP23 | 0登録 + 既存候補 | 原4節 / 最終not_run |
| AT-E07 | WP23 | 2登録 + 既存候補 | 原4節 / 最終not_run |
| AT-E08 | WP23 | 1登録 + 既存候補 | 原4節 / 最終not_run |
| AT-E09 | WP23 | 1登録 + 既存候補 | 原4節 / 最終not_run |
| AT-E10 | WP23 | 1登録 + 既存候補 | 原4節 / 最終not_run |
| AT-E11 | WP23 | 0登録 + 既存候補 | 原4節 / 最終not_run |
| AT-E12 | WP23 | 1登録 + 既存候補 | 原4節 / 最終not_run |

## 通常受入で重点的に埋める不足

同一きっかけの重複発火、旧checkpointの明示選択、人物改名の引用/参照、固定世界の変数/知識/作者仮説、借用/別pinの変更元、制作依存の再確認、索引から実段落へ戻る動作、秘密名/読み/件数/素材除外を原givenで確認する。復元はnew/clone/同project merge/異project mapped_merge/ACK後replace/単体影響/容量rollbackをそれぞれ確認し、保護拒否だけをreplace成功にしない。

Largeは元88003記録・実72MiB・113履歴/送信待ちを削らない。元600000msの完全file、各30回と180保存、実7200秒後の最終new/clone/coldを同じ候補で満たす。先に通る性能値だけを抽出しない。

## 外部条件の準備と保留

| 条件 | Codexが先に用意するもの | 実結果が必要なもの |
| --- | --- | --- |
| 実端末 | 固定build・隔離サンプル・短いFiles/IME/録音/縦横/分割手順・記録欄 | 実iPhone/iPad/PCの操作結果と版 |
| 支援技術 | 名称/焦点/図の表代替/200%文字の手順・問題再現 | 実VoiceOver/NVDA/OSキーボードの結果 |
| 専用同期 | 具体構成・役割許可表・fixture・直接API計画・変更/復元差分 | 専用Auth/Storage・5アカウント・二実端末・実権限 |
| 容量/配信 | 現行公式資料と実設定の別表、境界fixture、固定base/cache/直リンク検査 | 実tenantの契約/残枠/費用と指定配信先 |
| 旧証拠引渡し | 元manifest・不足一覧・取得先/期限・新候補packetの別台帳 | C29元37分割等の実bytesと空環境取得 |

不足があるときは手順とレビュー可能な候補まで仕上げ、必要な実確認だけを保留する。環境待ちを理由に通常検査・互換・実装・PR提出を止めない。

## 24工程・6回帰群・公開条件

24工程の原depends/要件/受入はdocs/data/work_packages.json、6回帰群はdocs/data/completion_acceptance.jsonをそのまま参照する。[manifest.json](manifest.json)に原回帰群と原文hashを固定した。完了は同一最終候補での原成果物と全条件の充足に基づき、文書状態plannedの一括置換では行わない。

元scripts/check_release.pyには全116受入、24工程、実端末、手動支援技術、性能、復元、実同期、実権限、独立レビュー、費用、直リンクの9gateがある。外部release-evidence artifactへ対象製品commitを記録し、元checkerを変更しない。別delivery commitで古いbuildを試験したと記録しない。証拠構造の検査と実証拠内容の確認を両方行う。

追加Xが未採用なら原104の完成へ混ぜない。採用した範囲は対応AC-X36と形式移行/完全往復/原回帰を追加確認する。原104/116を省略して追加だけを完成にしない。
