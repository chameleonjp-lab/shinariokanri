成功した c2077620ca6b72a1994aec6e29efdd7325cea6ab / tree 5cf766ed8f66d91bbd5bb55212fd7ec109eebc0d / build 0b38e4b6bb3ffb808f1f に固定し、12 件・10 ファイルの Chromium smoke を一度実行しました。AT-N16 が 11253 ms で cold 後の全 entity ID 等値検査（133 行）に失敗したため停止し、残る 11 件は実行していません。原 timeout、given、assertion は変更していません。

実際の入力 .scenario 1 件（1831 bytes）とダウンロード 5 件（4082 / 4466 / 6199 / 8183 / 8623 bytes）を保持しています。各 raw の SHA と元 Buffer / download file の SHA が一致し、trace の upload 1 件・download 5 件の対応を別 audit が確認しました。観測エラーはなく artifact audit は complete です。入力 UUID の再生成は行っていません。

実 raw ZIP の読み取り診断では、元の 6 entity は残り、追加された 2 entity は `review`（「変更確認」）です。作者による状態変数 initial の改訂 0→1 / 1→2 を元の flow_edge が参照するため作られた記録です。この失敗を製品不具合と確定せず、N 担当者が元 ID 不変・条件参照・レビュー履歴と cold 保存の判定範囲を調べます。失敗時の原 oracle はそのまま保存しています。

実行前後の source/build/hook/module/env binding は全て一致し、runtime checkout は clean です。終了後に 4173 listener と稼働中 browser/preview がないことを確認し、排他的実行枠を解放しました。HTML / JSON / trace / 生入力・出力 / hook / command / binding / audit は retained-run に byte 同一で保存しています。先行 b56 失敗と c758 コンパイル失敗は別フォルダのまま保持します。原 116 件・F33 実端末・E07 全境界・N20 補助 control への合格昇格はせず、原判定は全て not_run のままです。
