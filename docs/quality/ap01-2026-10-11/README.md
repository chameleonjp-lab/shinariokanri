# 計画に従う統合候補と今回の実行状況

PR #43の[実装計画](../../review-2026-10-11/IMPLEMENTATION_PLAN.md)を開始した。これは完成・公開の認定ではない。原104要件・116ケース/464条項・24工程・6回帰群と元の公開条件を維持する。

## AP01の固定基準

main `8285608c75791ed1ea01380751abb3805913b639`（PR #43取り込み後）から、後続 `5d8d3de484a454722999169ffbbbe1152f4354d4` を統合した。統合commitは `1ad3c928b9090ab8d9d96a6a8971c597216e3be2`。mainへのmergeや公開は行っていない。

[一件ずつの差分照合と配信bytes](integration.json)は22製品・検査・CIファイルのmain基準/後続/統合後のGit blob、bytes、SHA-256、変更目的を記録する。全22件は後続の実bytesを保持し、#38〜#42のheadが統合commitの祖先であることも確認した。元要件・工程・受入レジストリと `scripts/check_release.py` のbytesは不変。

初回production buildは `64a162ebfac9e7f65105`、基底 `/shinariokanri/`、配信13ファイルのbytesを記録した。ただしdefault実行環境の `spawnSync git EPERM` により配布メタデータはcommit/tree=`unknown`、dirty=`true`だった。ビルドの処理自体は成功したが、固定候補に結び付いたclean buildの合格証拠としては扱わない。版情報を取得できる追加network権限の実行環境で新候補をビルドし直し、実メタデータを確認する。これは製品のGit検出規則の変更ではない。

文書・完成計画・歴史監査Git blob検査とPython24件は成功した。単体・通常画面・Large・実機・実APIの成功をこの文書検査から推定しない。後続修正は別の候補commit/buildと実行記録に固定する。

## 証拠と完成までの順序

[歴史的なC29結果](../current-review/FINAL_CANDIDATE.md)、[旧後続候補](../current-review/FOLLOW_UP_CANDIDATES.md)、[原116の監査](../../review-2026-10-11/original_acceptance_audit.json)は当時の対象版のまま保存する。今回の候補へその合格をコピーしない。

[証拠引渡しの実検査](HANDOVER.md)と[全結果](handover.json)を記録した。Git収録の取得可能なbytesを検査し、C24のlogical path重複と32旧artifactの不足も保持した。C29の37分割・1,858,947,725 bytesの完全証拠パケットはDELIVERYが一時環境のみと明記し、現環境には0/37しか取得できていない。G07はblockedのままであり、この不足をmetadataや過去のhash検査だけで成功にしない。

AP02の候補除外・相談前後・移行再試行を統合後に確認し、AP03の元Large113履歴/72MiB・600000ms内の完全保存とnew/clone/cold復元へ進む。元30回性能測定と7200秒実時間を短縮しない。AP04は元given/when/then/negativeの全節を同じ候補で照合する。

AP05の実端末/支援技術とAP06の専用同期環境は未指定であり、Linux検査から合格を推定しない。追加12案は採用範囲と前提工程を確認してから進め、未採用の追加を原104の削減へ転用しない。公開gateは同じ `scripts/check_release.py` で確認する。
