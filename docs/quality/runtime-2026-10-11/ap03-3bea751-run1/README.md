# AP03 固定3bea751 Large113診断・元600000ms未達

固定commit `3bea75191adb1fa6ffa4be596cc3568ee9e5798f` / tree `1bf07ebaa47b982fab25a80d9a7f99a373c51025` / clean build `8778f67aa866bb25251b` のLinux Chromium診断。`--soak-seconds 0` であり、実7200秒の成功ではない。

通常Appの112編集、元88,003記録・実75,497,472 bytesの素材、113履歴/送信待ち、14 source画像/全素材bytes SHA照合と、全113 native command/pendingの完全bytes SHA一致を観測した。取消後のsource内容hash・全素材・件数は不変。取消ボタンの可視化には2000msのwaitを使用したが、pointer入力→取消alert描画の実elapsedは**未測定**で、取消2秒の合格へ換算しない。

完全保存のdownloadは元600000msでtimeout、exit1。実完全ファイルは未観測、file内容検査・空new/clone・cold完全照合は未実行。失敗時のfirstPaint/heartbeatは旧harnessが回収しておらず、具体的な製品処理stageやUI停止原因は未確定。JSONのcatch内measurement error/stackとafterCancel、finally後にlive browser processが無いことを確認した。NodeのtriggerUncaughtException表示だけからunhandled pending promiseへ分類しない。

最初の既定sandbox起動はfixture開始前の`spawnSync git EPERM`でexit1。別rawとして保持する。追加network権限で実行したattempt2を上記診断結果として扱う。

`binding.json`に全397 sourceと28 served artifactのSHA/bytes、browser.version、build情報を保持した。`fixed-source.tar.gz`は397ファイルの元bytesを記録SHAと全照合して収録。`fixed-dist.tar.gz`は配信distを記録SHAと全照合して収録した。旧harnessのtemporary helper buildはfinallyで削除されたため、そのbytesは未収録でありmanifestだけを保持する。この欠落を全artifact bytes収録へ換算しない。

`result-summary.json`に部分成功と未測定/未実行を分け、`retained-manifest.json`に今回収録ファイルのbytes/SHAを保持する。Standard/Large各30回、元600000ms成功、2秒応答、new/clone/cold、実7200秒と実端末/支援技術/APIの完成を推定しない。
