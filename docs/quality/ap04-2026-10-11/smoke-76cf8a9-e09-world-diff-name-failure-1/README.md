76cf8a94669dcc97d29e08102a40cb91aeb61d1e / tree 347e5092ebd76a4c1d22cdf83c31675b7b0d4ff3 / build eba72a45d50d085d9090 の実成功 build に固定して、同じ 12 件・10 ファイルの smoke を一度実行しました。N16 / F13 / F51 / F52 の 4 件が通過し、E09 が 10124 ms で失敗して停止しました。残る 7 件は未実行です。原 timeout（E09 は 30000 ms）、given、assertion、数値閾値は変更していません。

失敗箇所は E09 61 行です。「共通世界版の変更前の影響」に本文の「新たに改訂した世界設定」を期待しましたが、実表示は変更元の名前「旧世界設定の城」と元 UUID、および追加された「小説公開時の旧世界版」と作品側の 3 影響先でした。確認・適用を行う前に expect の 5000 ms で失敗しています。実表示と原 oracle を保持し、製品不具合か判定対象の誤りかは担当者による診断前に確定しません。

全実行段階で実 .scenario 入力 6 件・ダウンロード 10 件を捕捉し、raw Buffer / file SHA と trace の upload/download event 対応を独立監査しました。E09 の実入力 2 件は保存され、E09 にダウンロードはありません。観測エラーはなく各 artifact audit は complete です。入力 UUID の再生成はありません。全 stage および全体の前後 source/build/hook/module/env binding は一致しています。終了後の 4173 listener と稼働中 browser/preview がないことを確認し、排他的実行枠を解放しました。

retained-run は原 run ディレクトリから byte 同一でコピーした HTML / JSON / trace / raw / hook / command / binding / audit を含みます。source-under-test と bounded successful build reference も別保存しています。先行 b56 / c207 失敗と c758 コンパイル失敗は変更していません。実行の 4 件通過から原 116 件や実端末 F33、E07 全境界、N20 補助 control の完成を推定せず、全原判定は not_run を維持します。
