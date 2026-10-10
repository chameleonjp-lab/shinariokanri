# C17 準備証拠の復元

同じbytesの重複だけをまとめています。実行時の全16,517ファイル（元のbundle manifestを含む）のパス・順・bytes・SHA256を保持し、元の274,002,779 bytesのgzip/tar（SHA256 `d73740bf8e0e86927b233076a1701677799e595fb538ec665d0944374c11f55a`）まで完全一致で再生成しています。通常操作・静的確認・部品検査・未実行を区別し、合格数は増やしていません。

このフォルダーを保存してから、空の出力先を指定します。

```sh
python3 restore_evidence.py --output /tmp/c17-preparation-evidence
```

3つのpart・全object・元の全ファイルを検査してから新しい出力ディレクトリを確定します。既存の出力先は上書きしません。`ORIGINAL_LAYOUT.tar.gz`も元のbytes/hashで復元します。必要な空き容量は約1.3 GiBです。

`prelaunch-captured-inputs`、`additional-prelaunch-captured-inputs`は各実行前の捕捉、`actual-browser-results`は成功・失敗のtrace、`independent-original104-116-static-preparation`は元104/116/24/6と4実fixtureの準備です。初期captureの不足・検査側の誤り・製品の原失敗をSUMMARYで分けています。固定候補・全116・実端末・実権限・性能・実7200秒の完成証拠ではありません。
