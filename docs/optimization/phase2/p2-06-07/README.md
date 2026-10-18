# 第2段階 P2-06/07：派生索引・共通意味・一覧取得の最終比較

**RELEASE BLOCKED。第3段階の正式再受入・実機合格・公開承認ではない。**

第2段階依頼書と [実装単位](../../phase1/HANDOFF.md) に基づく残作業。#59、#67のmergeを再確認し、実際のmain `a13d8fad93b1a4a14c4cc4d45ab98783388de177` から実装した。#67は確認時点ですでにmerge commitとして統合済みだったため、この作業ではmerge APIを呼んでいない。#63/#64/#65の元merge commitもmainの祖先に含まれる。既存P2-01〜05を重複実装していない。

採用対象は、保存済み作者データに所有された上限付き派生索引（P2-06）、既存modelから参照意味を取り出す共通定義と独立した網羅検査（P2-07）。一覧collectionの製品UI統合は比較後に取り消し、従来の全件結果を使うUIへ戻した。比較用のdomain adapterと反例テストは残す。DB部分読込、永続全文索引、新形式、新しい権限判定は導入しない。

| 成果物 | 内容 |
| --- | --- |
| [AUDIT_AND_DESIGN.md](AUDIT_AND_DESIGN.md) | 実装監査、原因、案の比較・採否、失効・秘密境界、戻し方 |
| [MEASUREMENTS.md](MEASUREMENTS.md) | 同じ実App計測定義によるmain/P2-06/試作/最終案/上限比較、生値と制約 |
| [VERIFICATION.md](VERIFICATION.md) | RED→GREEN、原検査、レビュー指摘、未実行の正式条件 |
| [PLAN.md](PLAN.md) | 実施計画と完了境界 |
| [evidence-manifest.json](evidence-manifest.json) | 原入力・ソース・実build・測定・全件照合・ログのSHA256台帳 |

104要件、116受入ケース/464条項、24工程、6回帰群、68補助確認、native 1.0、元fixture/seed/実bytes/assert/timeout/retry/skipを保持する。30回、180保存、7200秒、600000ms、2000msの原契約を変更していない。新しい30回連続検索は補助比較であり、原8指標や180保存の代替ではない。

ローカル証拠の検査：

```sh
python3 scripts/check_phase2_indexes.py --verify-current-source
python3 -m unittest scripts/test_check_phase2_indexes.py
python3 scripts/check_docs.py
python3 scripts/check_completion_plan.py
```

通常CIは保存した履歴ソース・生値・ZIPを毎回検査する。`--verify-current-source` は今回の提出時に追加実行し、現在の全製品srcとpackage/lockが最終測定ソースと一致することを確認する。将来の正当な製品変更を過去の測定ソースへ固定する検査にはしない。

新規main向けDraft PRの本文に、最終head/treeと原workflowのrun/attempt・全7 job・全3 engineの実結果を追記する。CIの測定後に説明を追記するためだけの製品変更は行わず、PR本文の結果とこの提出時スナップショットを区別する。Draftはmergeしない。

実機、production/Auth/service/billing、既存Supabase、公開・配備は操作していない。専用の実サービス試験環境は提供されておらず、その外部条件は保留。ローカルブラウザと同じワークスペース内のloopbackだけを補助計測に用いた。
