# 今回の検証記録

検証日: 2026-10-11。main `3f34db00ef31bf97dec3d7668cb93212e5ba802f`を基準に、文書・対応表・固定ソースの整合性を確認した。製品操作・実端末・実同期・Large性能の新しい受入結果は作成していない。

## 実行した確認

| 確認 | 結果 | 確認できたこと |
| --- | --- | --- |
| `python3 scripts/check_docs.py` | PASS | 原104/60提案/24工程/116受入、原出典・PDF同一性、本文とレジストリ、ローカルリンク |
| `python3 scripts/check_completion_plan.py` | PASS | 原104作業/24工程/116受入/6回帰群/10段階、原条件の保持 |
| `python3 scripts/check_review_20261011.py --verify-git-blobs --check-worktree` | PASS | 原104/116/464節/24/6、16残件/12候補/68追加AC/10工程/22出典、対応・依存・原文、固定Git blob/tree/hash/行、後続資料4件のbytes |
| `python3 -m unittest discover -s scripts -p 'test_check_*.py' -v` | PASS: 24件 | 既存15件＋追加9件（正常1/異常8）。下の誤りを検出する |
| `git diff --check` | PASS | 変更に空白エラーなし |
| GitHub main/後続ブランチの再取得 | 基準と一致 | PR提出前にもmainと`fix/rb10-read-batches`が固定したSHAと一致 |

追加の異常8件は、原の例外条件の改変、原要件の削除、未観測の追加ケースの合格化、追加AC削除、工程の依存循環、存在しない既存ソース、C29報告数の水増し、製品コード変更を許可する例外の追加である。

## 検査方法と再現

原仕様/原レジストリ/原公開checkerの22ファイルのhashと、代表156ソースのhashを[manifest](review_manifest.json)で固定した。今回の文書入口であるrootとdocsのREADMEだけは更新を許可し、原規範/製品コード/既存checkerは変えない。

通常のreview checkerは現在の原レジストリと追加表の意味的な整合性を検査する。GitHub CIの浅いcheckoutでも新9検査は履歴取得なしで動く。`--verify-git-blobs`は追加で固定したmain/C29/後続commitのGitオブジェクトを読む。対象commitがない環境では取得が必要で、取得不能をPASSにしない。`--check-worktree`は原規範と代表コードが今回の基準から変わっていないことを確認する。

作業用checkoutでは最初、疎な取得のため既存リンク先が手元にないエラーが出た。GitHub上の既存追跡ファイルを取得し、Git blob SHAと一致を確認してから再検査を通した。空ファイルで置き換えたり、リンク検査/原checkerを弱めたりしていない。既存ファイルの取得は今回のPR差分へ含めない。

## この検証から判断しないこと

今回のPASSは文書と追跡の検査である。原116ケース・追加68ケースの新候補の結果は全てnot_runのまま。アプリの完成、実iPhone/iPad、読み上げ/拡大、専用同期の実5役割/RLS/Storage、Large113履歴の完全出力、2時間編集後の復元、現在の課金・容量は受入工程へ残る。

後続ブランチの資料4件を固定bytesで確認したことと、約1.85GBの閉鎖証拠全体を取って再実行/再照合したことは異なる。全証拠アーカイブの再照合bytesは0として記録する。公式資料22件は文書記載の調査で、全製品の有料実機試用ではない。

PRのGitHub Actions結果はPR画面に記録される。文書検査のPASSを公開/mergeの許可や製品受入のPASSへ転記しない。
