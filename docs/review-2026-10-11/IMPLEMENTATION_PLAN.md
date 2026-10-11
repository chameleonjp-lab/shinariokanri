# 実装計画書 — 原104の完成と追加案

計画版: 1.0 / 基準: 2026-10-11。全工程はplanned、工数/担当/納期はunestimated。今回実施するのは比較・仕様・計画の文書PRまでである。製品修正と実受入は次の工程で実施する。

## 1. 実装の順番

AP01〜AP06は原104の修復/確認、AP07〜AP09は採用した追加候補、AP10は範囲ごとの最終判定。原のRB01〜RB10/24工程を置換しない。Xの追加は原104からの機能削除や原受入の延期へ転用しない。

| 工程 | 必須の前工程 | 対象 | 終了時の判断 |
| --- | --- | --- | --- |
| AP01 基準版と引渡しを整理する | なし | G01 / G07 / G08 | 22製品・検査・CI差分を一件ずつ照合。元104/116/24/6と公開gateが不変。候補のcommit/tree/build/baseを固定する。 |
| AP02 通常操作の既知差分を直して再確認する | AP01 | G02 / G03 / G04 | 対象3件のAC正常/例外を通常操作→保存→cold→完全new/cloneまで実行。対象原AT-F27/F36/E12の未観測条項は別に残す。 |
| AP03 大量履歴の完全保存と長時間復元を完了する | AP02 | G05 / G13 / G15 | 元600000ms内に出力し全hash/ID/113操作順を確認。元Standard/Large各30回の全指標、2秒進捗と取消、7200秒実時間の条件を満たす。 |
| AP04 原116ケースの通常操作と境界を埋める | AP03 | G06 / G16 | 原116の正常/境界/例外と原24工程/6回帰群を対応させる。外部条件以外の未実行に次の具体操作と原因がある。失敗を直して再検査する。 |
| AP05 実iPhone・iPad・PCと支援技術を確認する | AP03 | G09 / G10 | 元N01/N02/N03/N11/N13/N14とE01/E07/E10の対象手順を実端末で実行。Linux模擬は補助資料として分離。 |
| AP06 実同期・秘密・出力互換・容量を確認する | AP03 | G11 / G12 / G14 | 原E05/E06/E09/N07/N08/N17/N20の実条件を満たす。未対応は拒否、秘密は図/索引/件数/素材/出力すべてから除外。 |
| AP07 追加案の入口・比較・保存確認・素材条件を作る | AP04 | X01 / X07 / X09 / X10 | 採用範囲を記録して対応AC12件を満たす。旧完全ファイル/固定版/秘密投影/原116の関連ケースを維持。X07はG05の成功後にバックアップ正常を示せる。 |
| AP08 置換・翻訳表・期待結果の確認を作る | AP07 | X03 / X04 / X05 / X06 | 対応AC12件と、Unicode/台詞ID/原文hash/範囲/unknown/秘密/失敗の関連原ケースを同対象で成功する。 |
| AP09 複数作品・試読中編集・目標・Twee連携を作る | AP08 | X02 / X08 / X11 / X12 | 対応AC12件、複数アカウント/固定世界/権限失効/原文保護/上限/未対応構文を確認する。外部adapterを増やすなら別対応宣言とfixtureを追加。 |
| AP10 範囲別の完成判定と公開候補を提出する | AP04 / AP05 / AP06 | G06 | 元release gateは不変。失敗・未実行・版不一致が0。追加案未採用を原104からの機能削除へすり替えない。実機/実API不在なら公開判定を保留。 |

AP05とAP06はAP03後に独立して進められる。AP04の外部条件を使わない通常検査も進める。AP10で追加を公開範囲へ含める場合だけ、対象Xを担当するAP07〜AP09の完了を追加の前提とする。未採用Xの未実装は原104の完成率に混ぜない。実端末/実同期を取得できない場合は公開に必要な原条件を保留として残す。

## 2. PR単位の実施規則

各工程はmainから独立ブランチを作りDraft PRを提出する。AP01では原#38〜#42とmainの差分を見て統合し、古いブランチの結果をコピーしない。レビュー可能な小ささへ分割するときも、完了は同じ統合候補の結果で判断する。

PRには対象G/X/REQ/AT/AC、具体的変更、schema/移行/互換の影響、正常/失敗の実結果、残件、戻し方を載せる。文書/機械可読表/実装/関連受入を一緒に更新する。元104/24/116/6と検査fixture・合格閾値を維持する。本人の指示の範囲を超える課金・別用途DB変更・公開/mergeは工程完了の自動操作に含めない。

## 3. 工程ごとの成果物と合格条件

### AP01 基準版と引渡しを整理する

対象: G01、G07、G08。前提: 固定したmain基準。

**成果物**: main向け統合候補、元PR対応表、製品入力/文書/実証拠の版別manifest、取得できる証拠の引渡し。#38〜#42を含むことを検証する。

**合格条件**: 22製品・検査・CI差分を一件ずつ照合。元104/116/24/6と公開gateが不変。候補のcommit/tree/build/baseを固定する。

**変更/確認の入口**: `docs/quality/current-review`、`docs/implementation`、`README.md`。

**確認ID**: AC-G01-N、AC-G01-E、AC-G07-N、AC-G07-E、AC-G08-N、AC-G08-E。原要件/24工程は[機械可読計画](implementation_plan.json)のoriginal_requirement_ids/original_work_packagesで全件参照する。元ATは[受入表](ACCEPTANCE.md)の原文を守る。

**戻し方**: 公開/mergeせず候補を破棄できる。証拠の原本・元作業ブランチは変更しない。

**注意する問題**: 親ブランチへ統合済みのPRをmain反映済みと誤認する。

担当/工数/納期: 未割当/未見積/未確定。完了状態: planned。

### AP02 通常操作の既知差分を直して再確認する

対象: G02、G03、G04。前提: AP01。

**成果物**: #38候補除外/#39相談前後/#41移行再試行を同候補で確認する回帰ケースと、保存失敗/取消/遅延通知/アカウント境界の実結果。

**合格条件**: 対象3件のAC正常/例外を通常操作→保存→cold→完全new/cloneまで実行。対象原AT-F27/F36/E12の未観測条項は別に残す。

**変更/確認の入口**: `src/App.tsx`、`src/ui/TextAnnotations.tsx`、`src/ui/WorkPage.tsx`、`src/storage/store.ts`、`src/ui/authorOperation.ts`、`tests/e2e`。

**確認ID**: AC-G02-N、AC-G02-E、AC-G03-N、AC-G03-E、AC-G04-N、AC-G04-E。原要件/24工程は[機械可読計画](implementation_plan.json)のoriginal_requirement_ids/original_work_packagesで全件参照する。元ATは[受入表](ACCEPTANCE.md)の原文を守る。

**戻し方**: 入力/履歴をコピーした隔離fixtureで実施。移行失敗は元DB不変、製品修正は個別コミットを戻せる。

**注意する問題**: 個別PRのCI成功を統合後成功へ転用する。

担当/工数/納期: 未割当/未見積/未確定。完了状態: planned。

### AP03 大量履歴の完全保存と長時間復元を完了する

対象: G05、G13、G15。前提: AP02。

**成果物**: 区間計測、同一113履歴/全素材の元入力、処理重複の最小修正、実ファイル、空new/clone/cold復元、2時間連続編集後の実復元、更新/容量不足の回帰。

**合格条件**: 元600000ms内に出力し全hash/ID/113操作順を確認。元Standard/Large各30回の全指標、2秒進捗と取消、7200秒実時間の条件を満たす。

**変更/確認の入口**: `src/storage/archiveData.ts`、`src/storage/archiveExport.worker.ts`、`src/storage/recovery.ts`、`src/domain/projectRecordValidation.ts`、`src/storage/store.ts`、`tests/e2e`。

**確認ID**: AC-G05-N、AC-G05-E、AC-G13-N、AC-G13-E、AC-G15-N、AC-G15-E。原要件/24工程は[機械可読計画](implementation_plan.json)のoriginal_requirement_ids/original_work_packagesで全件参照する。元ATは[受入表](ACCEPTANCE.md)の原文を守る。

**戻し方**: 正本/参照/履歴/送信待ちの原子性を保持。cacheや共有処理を外した場合も元完全形式を復元できる。上限/対象数は変更しない。

**注意する問題**: 113履歴を3履歴へ縮める、長い処理の応答停止、再展開でのメモリー過大化。

担当/工数/納期: 未割当/未見積/未確定。完了状態: planned。

### AP04 原116ケースの通常操作と境界を埋める

対象: G06、G16。前提: AP03。

**成果物**: original_acceptance_audit.jsonの116件/464条項ごとの新候補の実観測。人物改名、重複発火、旧checkpoint、演出/翻訳、逆順二案、世界/暦等の未観測を同じ初期条件で実行する。

**合格条件**: 原116の正常/境界/例外と原24工程/6回帰群を対応させる。外部条件以外の未実行に次の具体操作と原因がある。失敗を直して再検査する。

**変更/確認の入口**: `tests/e2e`、`tests/fixtures`、`docs/quality/current-review`、`scripts/check_release.py`。

**確認ID**: AC-G06-N、AC-G06-E、AC-G16-N、AC-G16-E。原要件/24工程は[機械可読計画](implementation_plan.json)のoriginal_requirement_ids/original_work_packagesで全件参照する。元ATは[受入表](ACCEPTANCE.md)の原文を守る。

**戻し方**: 元fixture/期待値/原句を変更しない。検査手順の誤りは旧結果を保持して別実行にする。

**注意する問題**: 似た対象や部品検査で元ケースを代替する。

担当/工数/納期: 未割当/未見積/未確定。完了状態: planned。

### AP05 実iPhone・iPad・PCと支援技術を確認する

対象: G09、G10。前提: AP03。

**成果物**: 固定候補の配布用build、実OS/ブラウザー、携帯単独編集/Files/日本語入力/録音/回転/分割、VoiceOver/NVDA/キーボード/200%の証拠。

**合格条件**: 元N01/N02/N03/N11/N13/N14とE01/E07/E10の対象手順を実端末で実行。Linux模擬は補助資料として分離。

**変更/確認の入口**: `docs/implementation/USER_GUIDE.md`、`docs/implementation/EXTERNAL_CONDITIONS.md`、`src/ui`。

**確認ID**: AC-G09-N、AC-G09-E、AC-G10-N、AC-G10-E。原要件/24工程は[機械可読計画](implementation_plan.json)のoriginal_requirement_ids/original_work_packagesで全件参照する。元ATは[受入表](ACCEPTANCE.md)の原文を守る。

**戻し方**: 既存本番作品へ失敗注入しない。隔離作品/別コピーを使い、作業前の完全保存を確保する。

**注意する問題**: 端末/OS/支援技術が利用不能の場合は該当gateを未実行として残す。

担当/工数/納期: 未割当/未見積/未確定。完了状態: planned。

### AP06 実同期・秘密・出力互換・容量を確認する

対象: G11、G12、G14。前提: AP03。

**成果物**: 専用構成/役割表/現行上限表、5実アカウント/二端末/直接API/private素材の結果、出力互換表、汎用受取例の版/hash往復。

**合格条件**: 原E05/E06/E09/N07/N08/N17/N20の実条件を満たす。未対応は拒否、秘密は図/索引/件数/素材/出力すべてから除外。

**変更/確認の入口**: `src/sync`、`supabase/migrations`、`scripts/sync`、`src/domain/exports.ts`、`src/portable/gameReceiver.ts`。

**確認ID**: AC-G11-N、AC-G11-E、AC-G12-N、AC-G12-E、AC-G14-N、AC-G14-E。原要件/24工程は[機械可読計画](implementation_plan.json)のoriginal_requirement_ids/original_work_packagesで全件参照する。元ATは[受入表](ACCEPTANCE.md)の原文を守る。

**戻し方**: 専用fixture tenantと元データのbackupを用意。構成差分を具体化した後、本人の既存許可の範囲でのみ適用する。別用途の実験場へ接続しない。

**注意する問題**: 接続先/権限/現行上限が未指定。外部条件を理由に独立の受取例/通常検査を止めない。

担当/工数/納期: 未割当/未見積/未確定。完了状態: planned。

### AP07 追加案の入口・比較・保存確認・素材条件を作る

対象: X01、X07、X09、X10。前提: AP04。

**成果物**: レビューで採用した機能だけのschema/移行/入出力対応表、4機能の通常フォーム、本文を変えない保存確認/二版比較/用途別入口、素材版の許可記録。

**合格条件**: 採用範囲を記録して対応AC12件を満たす。旧完全ファイル/固定版/秘密投影/原116の関連ケースを維持。X07はG05の成功後にバックアップ正常を示せる。

**変更/確認の入口**: `src/ui`、`src/domain`、`src/storage`、`docs/spec`、`docs/implementation/EXPORT_COMPATIBILITY.md`。

**新規ファイル候補（未作成）**: `src/ui/GuidedWorkspace.tsx`、`src/ui/guidePreferences.ts`、`src/domain/backupHealth.ts`、`src/ui/BackupHealthPanel.tsx`、`src/domain/versionComparison.ts`、`src/ui/VersionComparisonPanel.tsx`、`src/domain/assetUsagePolicy.ts`、`src/ui/AssetUsagePolicyEditor.tsx`。

**確認ID**: AC-X01-N、AC-X01-E、AC-X01-B、AC-X07-N、AC-X07-E、AC-X07-B、AC-X09-N、AC-X09-E、AC-X09-B、AC-X10-N、AC-X10-E、AC-X10-B。原要件/24工程は[機械可読計画](implementation_plan.json)のoriginal_requirement_ids/original_work_packagesで全件参照する。元ATは[受入表](ACCEPTANCE.md)の原文を守る。

**戻し方**: 既存データをコピーし、後述の形式1.1.0へ原子的に移行。旧buildへ戻すときは旧1.0.0backupへ戻り、新形式を旧buildに強制読込しない。

**注意する問題**: 表示を簡単にするため既存機能を隠して到達不能にする。素材条件を法的な自動判定にする。

担当/工数/納期: 未割当/未見積/未確定。完了状態: planned。

### AP08 置換・翻訳表・期待結果の確認を作る

対象: X03、X04、X05、X06。前提: AP07。

**成果物**: 型付き確認計画、CSV/manifest往復、埋込み語検査、経路の期待値集合と無画面実行。作者確認→原子確定→取消/再読込/完全復元をまとめる。

**合格条件**: 対応AC12件と、Unicode/台詞ID/原文hash/範囲/unknown/秘密/失敗の関連原ケースを同対象で成功する。

**変更/確認の入口**: `src/domain/text.ts`、`src/domain/productionChecks.ts`、`src/domain/regressionPaths.ts`、`src/storage/store.ts`、`src/ui`。

**新規ファイル候補（未作成）**: `src/domain/bulkTextReplace.ts`、`src/ui/BulkTextReplace.tsx`、`src/domain/localizationTable.ts`、`src/ui/LocalizationTablePanel.tsx`、`src/domain/localizationChecks.ts`、`src/ui/LocalizationRuleEditor.tsx`、`src/domain/narrativeTests.ts`、`src/ui/NarrativeTestPanel.tsx`、`scripts/narrative/run-suite.mjs`。

**確認ID**: AC-X03-N、AC-X03-E、AC-X03-B、AC-X04-N、AC-X04-E、AC-X04-B、AC-X05-N、AC-X05-E、AC-X05-B、AC-X06-N、AC-X06-E、AC-X06-B。原要件/24工程は[機械可読計画](implementation_plan.json)のoriginal_requirement_ids/original_work_packagesで全件参照する。元ATは[受入表](ACCEPTANCE.md)の原文を守る。

**戻し方**: previewだけでは正本を変更しない。確定は既存履歴付き操作で戻せる。元ファイル/表/期待値版を保持する。

**注意する問題**: 式としてのCSV実行、注記ずれ、古い原文への翻訳承認、未知を経路成功へ換算する。

担当/工数/納期: 未割当/未見積/未確定。完了状態: planned。

### AP09 複数作品・試読中編集・目標・Twee連携を作る

対象: X02、X08、X11、X12。前提: AP08。

**成果物**: 権限を反映する横断索引、旧traceを保つ修正→新経路確認、任意目標、限定Twee adapterと互換表。

**合格条件**: 対応AC12件、複数アカウント/固定世界/権限失効/原文保護/上限/未対応構文を確認する。外部adapterを増やすなら別対応宣言とfixtureを追加。

**変更/確認の入口**: `src/domain`、`src/ui`、`src/storage/importMapping.ts`。

**新規ファイル候補（未作成）**: `src/domain/workspaceSearch.ts`、`src/ui/WorkspaceSearch.tsx`、`src/ui/TrialEditReturn.tsx`、`src/domain/writingGoals.ts`、`src/ui/WritingGoalPanel.tsx`、`src/domain/adapters/twee3.ts`、`src/ui/ExternalStoryImport.tsx`。

**確認ID**: AC-X02-N、AC-X02-E、AC-X02-B、AC-X08-N、AC-X08-E、AC-X08-B、AC-X11-N、AC-X11-E、AC-X11-B、AC-X12-N、AC-X12-E、AC-X12-B。原要件/24工程は[機械可読計画](implementation_plan.json)のoriginal_requirement_ids/original_work_packagesで全件参照する。元ATは[受入表](ACCEPTANCE.md)の原文を守る。

**戻し方**: 追加索引は派生物として再生成可。Tweeは別案への取り込み、目標は本文の品質・状態を変更しない。

**注意する問題**: 横断索引から秘密件数が漏れる。外部構文を実行する。

担当/工数/納期: 未割当/未見積/未確定。完了状態: planned。

### AP10 範囲別の完成判定と公開候補を提出する

対象: G06。前提: AP04、AP05、AP06。

**成果物**: 採用範囲、対象候補、原104/116/24/6の全結果、追加機能で採用したAC結果、利用/復元/互換/実容量/費用の資料、公開後確認手順。

**合格条件**: 元release gateは不変。失敗・未実行・版不一致が0。追加案未採用を原104からの機能削除へすり替えない。実機/実API不在なら公開判定を保留。

**変更/確認の入口**: `scripts/check_release.py`、`docs/implementation/RELEASE.md`、`docs/implementation/USER_GUIDE.md`。

**確認ID**: AC-G06-N、AC-G06-E。原要件/24工程は[機械可読計画](implementation_plan.json)のoriginal_requirement_ids/original_work_packagesで全件参照する。元ATは[受入表](ACCEPTANCE.md)の原文を守る。

**戻し方**: 公開前の候補を提出し、配信切替時の前buildとbackupを残す。本人の公開/merge許可なしに実施しない。

**注意する問題**: CI成功または文書整合性を完成・公開の許可に流用する。

担当/工数/納期: 未割当/未見積/未確定。完了状態: planned。

## 4. 元24工程の対応を維持する

下表は原工程の担当要件、今回の完了工程、主な追加案を結ぶ。原の成果物/依存/受入は[原計画](../plan/IMPLEMENTATION_PLAN.md)と[元データ](../data/work_packages.json)を維持する。

| 元工程 | 必須要件 | 今回の対応工程 | 関連追加候補 |
| --- | --- | --- | --- |
| WP01 データ契約・固定データ・検査の基盤 | REQ-N16 | AP04 / AP08 / AP10 | X06 |
| WP02 PC・iPad・スマートフォンの編集基盤 | REQ-F31 / REQ-F32 / REQ-F33 / REQ-N01 / REQ-N18 | AP01 / AP02 / AP03 / AP04 / AP05 / AP07 / AP08 / AP10 | X01 / X03 |
| WP03 端末内保存・履歴・送信待ち | REQ-B23 / REQ-N06 / REQ-N11 | AP01 / AP02 / AP03 / AP04 / AP05 / AP07 / AP10 | X07 / X09 |
| WP04 共通データと入力雛形 | REQ-B01 / REQ-B08 / REQ-B11 / REQ-F01 / REQ-F02 / REQ-F56 | AP04 / AP05 / AP07 / AP09 / AP10 | X01 / X12 |
| WP05 検索・索引・参照・整理 | REQ-B10 / REQ-B24 / REQ-F26 / REQ-F27 / REQ-F57 / REQ-F58 / REQ-F60 / REQ-N13 | AP01 / AP02 / AP04 / AP05 / AP07 / AP08 / AP09 / AP10 | X02 / X03 / X05 / X08 / X09 / X11 |
| WP06 暦・時点・日時の制約 | REQ-B05 / REQ-B06 / REQ-B21 / REQ-F07 / REQ-F08 | AP04 / AP10 | なし |
| WP07 年表とレーンの編集 | REQ-B02 / REQ-B03 / REQ-B04 | AP04 / AP10 | なし |
| WP08 意味付きの関係と可視化 | REQ-B07 / REQ-B09 / REQ-F55 / REQ-F59 | AP04 / AP10 | なし |
| WP09 共通世界・場所・移動・正体 | REQ-B18 / REQ-F09 / REQ-F10 / REQ-F11 / REQ-F12 | AP04 / AP09 / AP10 | X02 |
| WP10 章・本文・構成・正本と別案 | REQ-B13 / REQ-B20 / REQ-F03 / REQ-F04 / REQ-F05 / REQ-F06 / REQ-F25 / REQ-N19 | AP01 / AP02 / AP03 / AP04 / AP06 / AP07 / AP08 / AP09 / AP10 | X02 / X03 / X08 / X09 / X11 |
| WP11 フラグ・条件・状態遷移 | REQ-B15 / REQ-F37 / REQ-F38 / REQ-F39 / REQ-F40 / REQ-F41 | AP04 / AP08 / AP10 | X05 |
| WP12 分岐図・クエスト・再利用 | REQ-B14 / REQ-B22 / REQ-F13 / REQ-F14 / REQ-F19 | AP04 / AP06 / AP10 | なし |
| WP13 試し読み・比較・周回 | REQ-B16 / REQ-F15 / REQ-F16 / REQ-F20 | AP02 / AP04 / AP08 / AP09 / AP10 | X06 / X08 |
| WP14 経路記録・検査・網羅率 | REQ-F17 / REQ-F18 / REQ-N05 / REQ-N12 | AP01 / AP03 / AP04 / AP06 / AP08 / AP09 / AP10 | X06 / X08 |
| WP15 伏線・開示・認識の管理 | REQ-B17 / REQ-B19 / REQ-F43 / REQ-F44 / REQ-F45 / REQ-F46 / REQ-F47 | AP04 / AP10 | なし |
| WP16 完全保存・読み込み・復元 | REQ-B12 / REQ-F35 / REQ-N09 / REQ-N14 | AP01 / AP02 / AP03 / AP04 / AP05 / AP07 / AP08 / AP09 / AP10 | X04 / X07 / X09 / X12 |
| WP17 端末間の安全な同期 | REQ-F34 / REQ-N07 | AP04 / AP06 / AP10 | なし |
| WP18 共有範囲・レビュー・公開投影 | REQ-F29 / REQ-F30 / REQ-N08 | AP04 / AP06 / AP07 / AP09 / AP10 | X02 / X10 |
| WP19 台詞ID・翻訳・収録・用語 | REQ-F21 / REQ-F23 / REQ-F48 | AP04 / AP06 / AP08 / AP10 | X03 / X04 / X05 |
| WP20 素材・資料・絵コンテ・演出 | REQ-F22 / REQ-F28 / REQ-F53 / REQ-N10 | AP04 / AP07 / AP08 / AP09 / AP10 | X04 / X05 / X10 / X12 |
| WP21 企画・制作依存・媒体別内容 | REQ-F49 / REQ-F50 / REQ-F51 / REQ-F52 / REQ-F54 | AP04 / AP06 / AP09 / AP10 | X11 |
| WP22 目的別出力と制作受け渡し | REQ-F24 / REQ-F36 / REQ-F42 / REQ-N20 | AP01 / AP02 / AP04 / AP06 / AP07 / AP08 / AP09 / AP10 | X04 / X06 / X10 / X12 |
| WP23 全機能の実端末・性能・回帰検証 | REQ-N02 / REQ-N03 / REQ-N04 | AP01 / AP03 / AP04 / AP05 / AP06 / AP10 | なし |
| WP24 完成版の固定と運用引き継ぎ | REQ-N15 / REQ-N17 | AP01 / AP04 / AP06 / AP07 / AP10 | X07 |

## 5. 実行の証拠と停止条件

原116ケースのgiven/when/then/negative_or_edgeを全て保持し、一ケースを成功にするには四節すべてを同一候補で確認する。部品検査は補助として報告する。Standard/Largeの入力seed/平均文字数/全実素材、30回測定、p95の計算、全archive上限、600000ms、7200秒の実時間を変えない。113履歴を減らした診断は原因調査であって完了証拠ではない。

失敗・未実行・取得不能・版不一致は残件に理由と次操作を残す。証拠の一時パスだけを引渡し完了にしない。新規空環境で取得とhashを確認する。公開候補はcommit/tree/build/base、対応形式と受取例、利用手順/復元手順/実上限と費用を揃えて提出する。文書検査の成功はアプリ完成や公開許可を意味しない。
