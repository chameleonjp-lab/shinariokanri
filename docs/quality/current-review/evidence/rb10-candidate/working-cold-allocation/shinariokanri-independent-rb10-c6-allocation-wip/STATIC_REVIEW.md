C6 WIP割当削減の静的レビュー

C5 5720bc8/treea2d73に重ねた4ファイルを別SHAで固定。製品2ファイルの変更は、marker初検出時のみ配列を複製する処理とMap一時配列の削減だけ。全marker評価・分割値の検証・header順・欠損拒否・取消・cache epoch・不変性の経路は保持されている。静的に新しい製品不具合は確認していない。

新recordParts検査は実native IDBのmarker/bytesを直接比較する。新storage検査のraw()はScenarioStore codecを通るため、論理画像＋parts bytesの不変検査として分類する。元のbare-Dexie hydration検査と混同しない。

重い実行0、共有変更0。新検査定義と既存取消/競合検査の最終C6実行、正式30回性能、実機/実Authの結果はまだ得ていない。C5 Large未達は別の固定証拠として保持。
