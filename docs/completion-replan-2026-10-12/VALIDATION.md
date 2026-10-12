# この資料の検査記録

2026-10-12。対象main `2f7275265cefd7ffe9a882d7ecaea64ec5bf2995`、PR #48 head `0522bf5f5cffcfc3393877b3978a15d8081037c9`の固定ソースを使用した。

| 実行した確認 | 実結果 |
| --- | --- |
| `python3 docs/completion-replan-2026-10-12/validate.py --verify-git` | PASS。原104要件/116ケース/464条項/24工程/6回帰群、16残件、12提案、68補助確認、19作業の対応と依存循環なし。原4条項の全文、固定main/PR48の参照137製品pathの実bytes/SHA-256、未採用案/未実行判定を照合。 |
| `python3 scripts/check_docs.py` | PASS。元要件・提案・24工程・116受入・出典・原PDF hash・資料内リンクを照合。 |
| `python3 scripts/check_completion_plan.py` | PASS。元104作業/24工程/116ケース/6回帰群/10段階と原契約を維持。 |
| `python3 scripts/check_review_20261011.py` | PASS。#43の固定監査の原文・ID・範囲・依存・提案区分を維持。 |
| `python3 -m unittest discover -s scripts -p 'test_check_*.py' -v` | 既存24件PASS。文書・公開条件・旧監査の異常検出を確認。 |
| `git diff --check` | PASS。新規資料も追加した差分で提出前に確認する。 |

初回の新表検査は、G台帳だけから割り当てた総合AT-E01〜E12の12件不足を検出した。原全116ケースをCP08/CP15へ明示し、実端末・実同期の関連総合ケースも担当作業へ追加した後に、全原文と全割当の検査が成功した。元の総合ケースを削除したり、確認済みと記録したりしていない。

資料の取得は巨大証拠を除いた疎なチェックアウトから始め、既存文書検査に必要な原PDF・参照資料・リンク先の実ファイルを追加取得した。C29の元37分割全bytesの取得/照合を行ったという意味ではない。

製品実行、build/unit/browser、実端末/支援技術、専用Auth/Storage、Large性能、実7200秒、C29原証拠全bytesの再検証は今回実施していない。原受入の最終結果は全not_run。この資料は現在ソースとGitHub metadata/jobログの比較・再計画であり、製品の完成記録ではない。
