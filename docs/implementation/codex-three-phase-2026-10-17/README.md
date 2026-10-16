# Codex 3段階計画（2026-10-17）— 読み順と引継ぎ

このフォルダーは、2026年10月17日に整理した「実機テストを除くシナリオ管理の調査・最適化・完成度確認」を、**計画書だけ**としてGitHubへ登録したものです。登録・マージは製品改修の実施でも、未採用機能の採用承認でも、完成・公開の承認でもありません。

対象: [chameleonjp-lab/shinariokanri](https://github.com/chameleonjp-lab/shinariokanri)  
当初の観測基準: `main 6297d7692d6c48f1e21609780ecd9db40d170ab9`（Codex着手時には必ず再確認）

## 登録資料（原稿4本を省略せず収録）

| 読み順 | ファイル | 目的 |
| --- | --- | --- |
| 1 | [PLAN_ALL_STAGES.md](PLAN_ALL_STAGES.md) | 共通の禁止事項、依存関係、三段階全体の作業と完了条件 |
| 2 | [PHASE_1_AUDIT_AND_DESIGN.md](PHASE_1_AUDIT_AND_DESIGN.md) | 現行実装の全経路監査、計測、根本設計、計測用PR |
| 3 | [PHASE_2_OPTIMIZATION.md](PHASE_2_OPTIMIZATION.md) | 取得・保存・履歴・検索・索引・共通定義・検証の根本最適化 |
| 4 | [PHASE_3_ACCEPTANCE.md](PHASE_3_ACCEPTANCE.md) | 制作機能の一連操作、例外、安全、性能、非実機受入と最終報告 |
| 5 | [TRACEABILITY.md](TRACEABILITY.md) | 監査23項目、改善候補15件、既存要件、外部待ち条件と三段階の対応確認 |

上記4本の計画原稿は、チャットで用意した統合版と各段階版をそのまま登録しています。追加の対応表は原稿を書き換えるものではなく、Codexが確認漏れを避けるための索引です。

## 適用の優先順

1. [元の104要件と原受入](../../spec/REQUIREMENTS.md)、原116受入ケース/464条項、24工程、6回帰群、68補助確認、元fixtureと数値・期限・形式の契約を保持する。過去の実測を新しい実測と呼ばない。
2. [最新の検証記録](../../quality/pr49-followup-2026-10-15/README.md)は原94件ローカル充足/22件外部条件待ちの時点記録であり、新しい採用判定ではない。実機・専用実認証・対象ゲーム・独立レビューなどは実際に取得しない限り未実行のままとする。
3. 今回、iPhone/iPad/PCの**実機テストは依頼対象外**。ブラウザ自動試験・模擬操作はできるが、実機条件の達成へ読み替えない。専用サービス試験はユーザーが許可した隔離環境がなければ実行せず、BLOCKEDとする。
4. 追加機能[X01–X12](../../review-2026-10-11/RESEARCH.md)は未採用候補。採否・形式変更・追加費用の承認前に製品本体へ実装しない。
5. 変更内容は別Draft PRとして提出。ユーザーだけがmergeする。現行のmain、配備先、本番DB、認証・課金を変更しない。Codex Cloud environmentsを使わない。

## マージ後にCodexへ渡す指示の形式

**第1段階**：この計画を登録したPR番号と `PHASE_1_AUDIT_AND_DESIGN.md` を指定し、最新main確認→監査/計測→候補比較→設計・検査・Draft PRの作成まで依頼する。単なる調査回答で終わらせない。

**第2段階**：第1段階の成果PRのmergeと設計承認を確認してから、この計画登録PR番号と `PHASE_2_OPTIMIZATION.md`、第1段階の成果PR番号を指定する。分割した製品Draft PRへ改修・測定・回帰・戻し方を記録させる。

**第3段階**：前段階の製品PRのmergeを確認して、この計画登録PR番号と `PHASE_3_ACCEPTANCE.md`、前段の成果PR番号群を指定する。非実機で実行できる原受入を完了し、正式検証・BLOCKEDの明示・最終Draft PRを求める。

参照資料：[Google Drive総合調査](https://drive.google.com/drive/folders/1BSdXfmdGUV1tFr-dg8a7drJv4yMDiytb) / [2026-10-16最新監査](https://drive.google.com/drive/folders/13BcAq-OxDUFmlmeIJqLz2tJ0K_ZR7c_k) / [原CP01–19計画](../completion-replan-2026-10-12/IMPLEMENTATION_PLAN.md)。

**重要**：このPRは計画書を登録するものだけです。製品コード、実行中の作業、原仕様、原受入、CI定義は変更しません。
