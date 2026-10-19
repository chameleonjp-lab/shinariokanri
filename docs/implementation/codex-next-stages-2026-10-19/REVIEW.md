# 計画と実装の比較・次に必要な対応

調査基準：main `096364269729c0958026ef6e92401ad1e53032a3`、tree `b9cc89027bba1ca922f47ee147a9b6f0a16a8cc8`、2026-10-19。以後の実行担当は着手時にmain・open PR・CIを再取得する。この比較は元PR #59と#60〜72の実装・記録に基づく計画資料であり、本計画の作業を実行した報告ではない。

## PR提出時の更新：#73の実行ガイド

作業中に [PR #73](https://github.com/chameleonjp-lab/shinariokanri/pull/73) が統合され、mainは `8426bc020e0191c10942398449582b8c7650166d`、treeは `a0695f9edaf8788b47ef1f11b03ad8ce7de62867` へ進んだ。差分はAGENTS、任意RTK Skill・自己検査・ガイドの9ファイルで、製品src、元tests／scripts、既存ci.ymlの変更はない。下記の製品調査基準と正式受入未完了の判定は保持し、実行ガイドの扱いだけ更新した。[比較差分](https://github.com/chameleonjp-lab/shinariokanri/compare/096364269729c0958026ef6e92401ad1e53032a3...8426bc020e0191c10942398449582b8c7650166d)

RTKは必要なローカルunit出力／安全なファイル一覧に任意使用するもので、本体導入や実際の削減率を保証しない。正式CI・性能・全量復元の代替にはしない。[導入ガイド](../../quality/rtk-safe-execution/README.md)

## 判定

**3段階の実装基盤はおおむね計画の方針に沿っているが、第3段階の正式受入と証拠の確定は未完了。性能案の一部は比較して不採用、別の一部は意図した初段階までである。** 「全体が想定外の実装」や「計画上の全受入が完了」とは判定しない。

原第1段階は比較計測と設計、第2段階は正確性を保った改善、第3段階は制作工程・同一候補での正式受入・証拠引渡しを求めている。原D02は選択作品の完全currentを先行し、D04は全metadataの完全性を守る初段階を認めている。選択章の部分読込やmetadata取得そのもののO(page)が未導入でも、直ちに原設計違反とはならない。[原全体計画](../codex-three-phase-2026-10-17/PLAN_ALL_STAGES.md)／[第1段階の設計判断](../../optimization/phase1/DESIGN.md)

| 前回の段階 | 確認できる成果 | 現時点の評価 | 今回の扱い |
| --- | --- | --- | --- |
| 1 調査・計測・設計 | 計測経路、原契約固定、独立期待、比較・採否、後続作業設計 | 基盤あり。新しい改善を始める際の基準と不足だけ更新する | 1A・1Dで必要な差分を固定 |
| 2 性能・共通処理改善 | 一覧分離、参照候補の必要時準備、限定的な履歴本文除外、世界依存と保持、派生索引・意味定義 | 採用／限定採用／不採用が混在。棄却を実装失敗と扱わない | 2A〜2Cで残る費用を新しく比較 |
| 3 制作工程・受入・引渡し | 共通制作E2E、正式runner、封印・補助実行・証拠検査の基盤、外部条件とX採否資料 | 最終候補の正式一式と逐条・証拠束の確定は残る | 1B・1Cで不足準備、3B・3Cで最終実施 |

根拠：[第1段階HANDOFF](../../optimization/phase1/HANDOFF.md)、[第3段階PLAN](../../acceptance/phase3/PLAN.md)、[第3段階再開記録](../../acceptance/phase3/RESUME_20261018.md)。

## 混同しない既存成果と未完了

- #72の古いdraftを保存する回帰修正は統合済み。対象CIではPython 99件＋CI補助25件、unit 148 files / 1392 tests、Chromium・Firefox・WebKit各250の全inventoryと7 jobsの成功を確認済み。これは当該CIの実績であり、元116/464や最終7200/full113がすべて完了した意味ではない。[PR #72](https://github.com/chameleonjp-lab/shinariokanri/pull/72)／[CI run 39181462652](https://github.com/chameleonjp-lab/shinariokanri/actions/runs/39181462652)
- #70の原fixture blob確認も既存修正。runnerの共通化は将来の整理案であって、同じ不具合が残っているという判定ではない。[PR #70](https://github.com/chameleonjp-lab/shinariokanri/pull/70)
- 旧「94ケースがローカル条件を満たし22ケース外部待ち」は製品 `1fcadcca` の記録。最新mainへ転記しない。04a7候補の30/180完了記録や、7200秒試行の72編集・4564.287504485秒までの記録も履歴であり、最終終了・full113の成功原本は回収と確認が必要。[旧判定の入口](../../quality/pr49-followup-2026-10-15/README.md)／[再開記録](../../acceptance/phase3/RESUME_20261018.md)
- 調査時点の `docs/acceptance/phase3/` は7本のMarkdownが中心で、最新候補の完成した116/464逐条表・最終測定表・証拠束の確定結果がそろっていない。これは受入成果物の不足であり、新しい重大な製品不具合を独立に再現したという指摘ではない。[phase3の現状](https://github.com/chameleonjp-lab/shinariokanri/tree/096364269729c0958026ef6e92401ad1e53032a3/docs/acceptance/phase3)
- 初回調査では#71が未統合だったが、提出時には#73で実行ガイドが導入された。再導入タスクを追加せず、最新AGENTSに従って任意使用する。RTK本体のインストール済みを意味しない。[PR #73](https://github.com/chameleonjp-lab/shinariokanri/pull/73)

## 15項目の差異と対応先

| 項目 | 実装・評価 | 残る差異／注意点 | 次の作業 | 根拠 |
| --- | --- | --- | --- | --- |
| OPT-01 起動時の全作品読込 | **採用済み**。作品一覧と選択後の完全編集読込を分離。非選択作品の本文取得を避ける。 | 選択作品のcurrent全量取得は残る。起動改善と章単位読込は別。 | NP12 | [根拠1](https://github.com/chameleonjp-lab/shinariokanri/blob/096364269729c0958026ef6e92401ad1e53032a3/src/storage/store.ts) / [根拠2](https://github.com/chameleonjp-lab/shinariokanri/blob/096364269729c0958026ef6e92401ad1e53032a3/docs/optimization/phase1/DESIGN.md) |
| OPT-02 分割読込と必要分読込 | **段階設計の途中**。8192件batchと履歴本文除外を維持し、非選択作品の取得を抑えた。 | 選択章/人物の部分APIは未導入。原D02自体が完全current先行を選んでいる。 | NP12 | [根拠1](https://github.com/chameleonjp-lab/shinariokanri/blob/096364269729c0958026ef6e92401ad1e53032a3/src/storage/store.ts#L630-L774) / [根拠2](https://github.com/chameleonjp-lab/shinariokanri/blob/096364269729c0958026ef6e92401ad1e53032a3/docs/optimization/phase1/DESIGN.md) |
| OPT-03 差分書込前の全体照合 | **比較完了・改善案は不採用**。差分record書込は既存。P2-03 changeset案は4比較中3不利で棄却。 | request全量hashと複数配列走査は残る。契約内の別案比較が必要。 | NP11 | [根拠1](https://github.com/chameleonjp-lab/shinariokanri/blob/096364269729c0958026ef6e92401ad1e53032a3/src/storage/store.ts#L1024-L1136) / [根拠2](https://github.com/chameleonjp-lab/shinariokanri/blob/096364269729c0958026ef6e92401ad1e53032a3/docs/optimization/phase2/p2-03/README.md) |
| OPT-04 履歴ページの全履歴取得 | **限定的に採用済み**。ownedかつ条件内の分割履歴で重い本文取得を回避。独立対照あり。 | 全metadataの取得/検査は残る。元Large・inline・過大metadataは完全readerへfallback。古い検索の処理取消も未導入。 | NP09 / NP10 | [根拠1](https://github.com/chameleonjp-lab/shinariokanri/blob/096364269729c0958026ef6e92401ad1e53032a3/src/storage/store.ts#L866-L887) / [根拠2](https://github.com/chameleonjp-lab/shinariokanri/blob/096364269729c0958026ef6e92401ad1e53032a3/docs/optimization/phase2/p2-04/README.md) |
| OPT-05 共通世界とデータ保持 | **採用済み・全体測定は残る**。世界依存closureとinactive cache4件上限、保存/ACK整合性を採用。 | root走査・whole row・未知owner時全registryは残る。4件は総memory保証ではない。 | NP05 / NP14 | [根拠1](https://github.com/chameleonjp-lab/shinariokanri/blob/096364269729c0958026ef6e92401ad1e53032a3/src/storage/worldClosure.ts#L6-L56) / [根拠2](https://github.com/chameleonjp-lab/shinariokanri/blob/096364269729c0958026ef6e92401ad1e53032a3/docs/optimization/phase2/p2-05/DESIGN.md) |
| OPT-06 検索索引の評価単位 | **採用済み**。版・権限・所有に結び付く派生索引を製品検索へ接続。失効と独立期待を検査。 | 予算外の尾部は再生成。保存時はowner全失効。複数作品/保存直後の比較が不足。 | NP13 | [根拠1](https://github.com/chameleonjp-lab/shinariokanri/blob/096364269729c0958026ef6e92401ad1e53032a3/src/ui/CatalogPanel.tsx#L64-L89) / [根拠2](https://github.com/chameleonjp-lab/shinariokanri/blob/096364269729c0958026ef6e92401ad1e53032a3/docs/optimization/phase2/p2-06-07/AUDIT_AND_DESIGN.md) |
| OPT-07 ページング前の全件前処理 | **比較完了・一覧案は不採用**。provider B/ordinal Aは比較し棄却または研究限定。現在の正しさを保持。 | 全filter/Map・全matching本文位置の生成が残る。画面30件は取得/前処理30件を意味しない。 | NP13 | [根拠1](https://github.com/chameleonjp-lab/shinariokanri/blob/096364269729c0958026ef6e92401ad1e53032a3/src/ui/CatalogPanel.tsx#L64-L89) / [根拠2](https://github.com/chameleonjp-lab/shinariokanri/blob/096364269729c0958026ef6e92401ad1e53032a3/docs/optimization/phase2/p2-06-07/MEASUREMENTS.md) |
| OPT-08 参照候補の準備範囲 | **採用済み**。scopeごとの必要時準備を導入。calendar/project/identity等で不要なentity準備を避ける。 | 全scopeの同値性を維持。永続候補索引を追加する必然性は未確定。 | NP07（回帰を保持） | [根拠1](https://github.com/chameleonjp-lab/shinariokanri/blob/096364269729c0958026ef6e92401ad1e53032a3/src/domain/referenceChoices.ts#L15-L59) / [根拠2](https://github.com/chameleonjp-lab/shinariokanri/blob/096364269729c0958026ef6e92401ad1e53032a3/docs/optimization/phase1/DESIGN.md) |
| OPT-09 複数箇所の項目意味定義 | **採用済み**。model由来の参照意味を81参照UIへ接続。43kind/345fieldの独立期待を維持。 | 11例外、画面文言、公開allowlist等は意図的分離。全面自動生成は完了条件ではない。 | NP07（回帰を保持） | [根拠1](https://github.com/chameleonjp-lab/shinariokanri/blob/096364269729c0958026ef6e92401ad1e53032a3/src/ui/fieldSpecs.ts#L19-L79) / [根拠2](https://github.com/chameleonjp-lab/shinariokanri/blob/096364269729c0958026ef6e92401ad1e53032a3/docs/optimization/phase2/p2-06-07/AUDIT_AND_DESIGN.md) |
| OPT-10 作者タグ・候補・正式参照 | **既存意味を保持**。作者の分類、候補、確定参照、公開投影を区別する既存境界を維持。 | 横断検索はX02の個別採用。新タグ形式は今回の採用範囲外。候補を正式参照へ昇格させない。 | NP07 / NP13 | [根拠1](https://github.com/chameleonjp-lab/shinariokanri/blob/096364269729c0958026ef6e92401ad1e53032a3/docs/optimization/phase2/p2-06-07/AUDIT_AND_DESIGN.md) / [根拠2](https://github.com/chameleonjp-lab/shinariokanri/blob/096364269729c0958026ef6e92401ad1e53032a3/docs/acceptance/phase3/X_DECISIONS.md) |
| OPT-11 検証結果の安全な再利用 | **限定再利用を保持**。immutable入力・所有/版/schema/依存に限る既存証拠再利用と反例を保持。 | global cacheへ無条件拡張する根拠なし。後続変更も全件対照と失効が必須。 | NP11 / NP12 / NP14 | [根拠1](https://github.com/chameleonjp-lab/shinariokanri/blob/096364269729c0958026ef6e92401ad1e53032a3/docs/optimization/phase1/DESIGN.md) / [根拠2](https://github.com/chameleonjp-lab/shinariokanri/blob/096364269729c0958026ef6e92401ad1e53032a3/docs/optimization/phase2/p2-05/DESIGN.md) |
| OPT-12 Large性能の未設定目標 | **提案はある・最終比較未了**。原上限なし6項目を観測とし、原合否と別の時間/仕事量目標を提案。 | 目標未採用、最終mainの正式比較資料が未完成。任意閾値で合格を作れない。 | NP05 / NP06 / NP07 | [根拠1](https://github.com/chameleonjp-lab/shinariokanri/blob/096364269729c0958026ef6e92401ad1e53032a3/docs/optimization/phase1/DESIGN.md) / [根拠2](https://github.com/chameleonjp-lab/shinariokanri/blob/096364269729c0958026ef6e92401ad1e53032a3/docs/acceptance/phase3/RESUME_20261018.md) |
| OPT-13 完全復元と日常操作の差 | **基盤あり・正式受入未了**。完全復元/異常系runnerと共通制作E2Eは実装。04a7の30/180完了記録あり。 | 最新候補の7200/full113と原逐条判定・証拠束は未完成。6職種の接続証拠も補完する。 | NP02〜NP07 | [根拠1](https://github.com/chameleonjp-lab/shinariokanri/blob/096364269729c0958026ef6e92401ad1e53032a3/tests/e2e/phase3-authoring-continuity.spec.ts#L6-L131) / [根拠2](https://github.com/chameleonjp-lab/shinariokanri/blob/096364269729c0958026ef6e92401ad1e53032a3/docs/acceptance/phase3/RESUME_20261018.md) |
| OPT-14 実端末・実権限・ゲーム証拠 | **未実証を維持・分類済み**。外部22件と必要条件を文書化。実機除外という原範囲に合う。 | 実機以外にも実Auth/ゲーム/契約等が必要。別3残条件も維持する。 | NP08 | [根拠1](https://github.com/chameleonjp-lab/shinariokanri/blob/096364269729c0958026ef6e92401ad1e53032a3/docs/acceptance/phase3/EXTERNAL.md) / [根拠2](https://github.com/chameleonjp-lab/shinariokanri/blob/096364269729c0958026ef6e92401ad1e53032a3/docs/quality/pr49-followup-2026-10-15/EXTERNAL_CASES.md) |
| OPT-15 CI時間と独立性 | **現在のCI成功・次の改善候補**。保守的docs scope、3engine独立job、全inventory/添付、最終verifyは既存。 | 準備cache/build共有/shardの純効果は別比較。#73のRTKガイドは任意のローカル出力短縮であり、元CI時間の改善とは別。 | NP15 | [根拠1](https://github.com/chameleonjp-lab/shinariokanri/actions/runs/39181462652) / [根拠2](https://github.com/chameleonjp-lab/shinariokanri/blob/096364269729c0958026ef6e92401ad1e53032a3/.github/workflows/ci.yml) |

## 受入を完了するための具体的な不足

| 不足 | すでにあるもの | 追加すること | 実行先 |
| --- | --- | --- | --- |
| 対象版と原本の所在 | seal・回収用runner・過去の台帳 | 最新main／candidate／build／fixtureと過去原本を結び、未回収の理由と次操作を記録 | 1A |
| N05の2出力原本 | 2回の実download、結果等値、全29 native表の前後hash検査 | 各downloadの実bytes・名前・path・SHAを保存し、片側欠損や別試行混入を拒否 | 1B |
| 原回帰の補助判定 | RG01〜03の再実行基盤 | 04a7の未commit判定器／11反例を回収、不可なら原条件から再構成して実行 | 1B |
| 6職種の制作工程接続 | 共通E2Eと専門E2E | 同じ作品・版・IDを渡す不足境界だけ接続し、実出力・復元・再編集を照合 | 1C |
| 最終の同条件比較と正式一式 | 原30/180/soak/full negative runner、資源計測 | 変更前基準と最終候補を固定し、原条件で直列完走・実終了とcleanup確認 | 1A・1D・3B |
| 最新逐条表・再取得できる証拠 | 索引・封印・pack／verifyの基盤 | 原文／独立期待／実観測を116/464等に結び、全証拠の再取得・member照合・元release結果を確定 | 1D・3C |

根拠：[N05原手順](https://github.com/chameleonjp-lab/shinariokanri/blob/096364269729c0958026ef6e92401ad1e53032a3/tests/rb10/large-analysis.spec.ts)、[補助runner](https://github.com/chameleonjp-lab/shinariokanri/blob/096364269729c0958026ef6e92401ad1e53032a3/scripts/acceptance/run_supplements.py)、[共通制作E2E](https://github.com/chameleonjp-lab/shinariokanri/blob/096364269729c0958026ef6e92401ad1e53032a3/tests/e2e/phase3-authoring-continuity.spec.ts)、[正式runner](https://github.com/chameleonjp-lab/shinariokanri/blob/096364269729c0958026ef6e92401ad1e53032a3/scripts/acceptance/run_formal.py)、[再開記録](../../acceptance/phase3/RESUME_20261018.md)。

## 外部で成立させる条件

原22件は AT-B24、AT-F01/F29/F30/F31/F33/F34/F42、AT-N02/N03/N04/N07/N08/N11/N13/N17、AT-E01/E05/E06/E10/E11/E12。分類は実機9、実機＋実サービス6、実Auth4、対象ゲーム2、契約／費用1。22件の手順・fixture・記録様式を準備し、実環境が必要な結果はBLOCKEDのまま残す。[外部条件の原分類](../../acceptance/phase3/EXTERNAL.md)

この22件とは別に、AC-G02 / CP04の実2アカウント、AC-G07 / CP10の旧C29 37分割＋MANIFEST／18宣言の原本、CP15の独立確認者・受入結果を追跡する。自動ブラウザー、mock、一般料金表、別AIのコードレビューでこれらを合格へ置き換えない。[旧外部条件台帳](../../quality/pr49-followup-2026-10-15/EXTERNAL_CASES.md)／[元再計画](../../completion-replan-2026-10-12/IMPLEMENTATION_PLAN.md)

X01〜X12の採否資料は既存で、いずれも未採用候補として保持する。この10依頼に新機能を自動追加しない。個別採用時に価値・範囲・追加受入・移行・費用を別計画へ分ける。[Xの採否資料](../../acceptance/phase3/X_DECISIONS.md)

## 原要件を追う入口

- [原104要件](../../data/requirements.json)／[原116ケース](../../data/acceptance_cases.json)／[原24工程](../../data/work_packages.json)
- [元仕様書](../../spec/REQUIREMENTS.md)／[原形式・振舞い等を固定した契約](../../optimization/phase1/contract-lock.json)
- [原6回帰群を含む受入表](../../plan/COMPLETION_ACCEPTANCE.md)／[原再計画の受入](../../completion-replan-2026-10-12/ACCEPTANCE.md)

各単位で必要なID・節を参照する。104/116の原登録データを新計画用に書き直さず、1Dで暫定対応表、3Cで最新実結果を独立に記録する。元NP01〜16の対応と新しい依存順は [PLAN.md](PLAN.md) を正本とする。
