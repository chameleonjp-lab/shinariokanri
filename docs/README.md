# 資料の入口

更新日: 2026-10-05。仕様資料は設計時点のレビュー案。アプリは実装中、同期接続先と公開先は未設定。[現在の実装・検証状況](implementation/README.md)を別に記録する。基礎/拡張の採用済み要件と今回仕様化した調査提案を区別し、完成版に必要な全範囲を計画へ載せる。

現在の「想定した全機能を実装する」作業は、**[完成までの実装計画書](plan/COMPLETION_PLAN.md)**を入口にする。PR #2の固定版レビューから、残る全104要件を10段階へ割り当てた。[要件別作業](plan/COMPLETION_TASKS.md)、[受入・回帰検査](plan/COMPLETION_ACCEPTANCE.md)、[レビュー基準](quality/pr2/README.md)を合わせて読む。初期の要件・24工程・116受入の範囲と条件は保持している。

[完成計画書の検査記録](quality/COMPLETION_PLAN_VALIDATION.md)には、範囲と対応の検査、15件の既存検査、8種類の誤りを検出する確認を記録した。アプリの受入結果とは別に扱う。

## 最初に読む資料

| 資料 | 判断できること |
| --- | --- |
| [要件仕様書](spec/REQUIREMENTS.md) | 全104要件の必須動作・失敗時・受入条件 |
| [実装計画表](plan/IMPLEMENTATION_PLAN.md) | 全24工程の依存・成果物・完了条件・リスク |
| [追跡表](plan/TRACEABILITY.md) | 元の依頼、提案60項目、要件、工程、確認の対応 |
| [調査概要](research/RESEARCH.md) | 15ツールから何を参考にし、何を本製品の提案としたか |
| [調査PDF](research/Game_Scenario_Manager_Research_2026-10-05.pdf) | 既存の27ページの調査資料全体 |

## 実装時に使う規範

| 資料 | 内容 |
| --- | --- |
| [データ仕様](spec/DATA_MODEL.md) | 安定ID、情報種類、型、時点、正本と派生情報 |
| [動作契約](spec/BEHAVIOR_CONTRACT.md) | 条件評価、効果順序、合流、取消、開示、探索、共通エラー |
| [UI・UX仕様](spec/UI_UX.md) | PC/iPad/スマートフォンの編集、図の代替、アクセシビリティ |
| [保存・同期・権限](spec/SYNC_SECURITY.md) | 保存状態、競合、役割、秘密情報の投影 |
| [専用ファイル仕様](spec/FILE_FORMAT.md) | 版、manifest、完全保存、上限、事前検査、往復 |
| [品質仕様](spec/NONFUNCTIONAL_REQUIREMENTS.md) | 性能目標、固定データ、全端末、復元、合格ゲート |
| [設計判断](decisions/ARCHITECTURE_DECISIONS.md) | 基準構成と未確定の接続先/選定/費用/日程 |
| [受入試験](quality/ACCEPTANCE_TESTS.md) | 104要件別＋12総合、正常・例外の期待結果。全て未実行 |

## 元資料・機械可読データ

[提案カタログ](research/FEATURE_CATALOG.md)はF01–F60の原文、[資料一覧](research/SOURCES.md)は元の公式48資料と技術補足を含む。[出力ファイルの同一性情報](research/PROVENANCE.json)は調査PDFのhash/サイズを記録する。

[要件](data/requirements.json)、[実装工程](data/work_packages.json)、[受入ケース](data/acceptance_cases.json)、[提案原文](data/feature_catalog.json)には安定IDと対応を保存する。[説明用サンプル](examples/branching-clue.example.json)は世界時間・提示順・分岐・知識の区別を具体化する。サンプルはアプリ実装済みの証拠ではない。

[文書検証](quality/DOCUMENT_VALIDATION.md)はこのPRで実行した確認の証拠。アプリ受入結果へ転用しない。

## 状態と変更規則

B01–B24は元の依頼と以前から採用済みの範囲、F01–F60は調査提案の仕様化、N01–N20は品質条件。F/Nは本PRのレビュー対象。A–Fは実装順序であって、要件を完成版から除外する優先度ではない。

工数、納期、実装担当、同期/公開先、課金、具体package版は未確定。規範を変える場合は対象要件と受入試験・形式の互換性を同時に更新する。文書検査を通してmain向けDraft PRで具体的な差分を示す。

上のF/Nの決定区分は初期仕様作成時の記録。最新の依頼では全104件を完成対象として計画し、その根拠と現在の残作業はcompletion系資料に記録する。過去の`planned`/`not_run`を現時点のアプリ合否として読まない。
