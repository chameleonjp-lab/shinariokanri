# C20準備とC19最終局所結果

C19はcommit `01f7cc6d37aa68bcc699becfb7edae15ede5156a`、tree `5a9ba3698432975f6ff89a5af36080f7571fc804`、clean build `0159bde2fbdcb417e29c`。434固定入力の全bytesを収録・SHA検証した。通常42件、新8ケース×3engineの入力／完全出力24組、Standard元8指標各30回は局所成功。Large30の起動p95 **10269.799999982119ms >10000ms は不合格**、検索885msは2000ms内。CI38025297656は814単体／306通常browser等の実成功で、実artifact ZIPのsize／digest／全475 CRCを照合した。Linuxを実端末・実Auth/RLS/Storageへ換算しない。

C20は親C19 HEADを持つdirty準備版として106局所・816単体／90files・build・schema／文書／計画・Python15の実結果を保存した。同じLargeのNode診断はAppやp95の成功を示さない。独立4fileレビューと手順の訂正は静的のみで実行0。C20固定版の正式検査は別証拠へ記録する。

`MANIFEST.json` の4485論理files／908unique blobsを、48MiB以下の3つのpartsから復元できる。全blob、全part、連結archiveのSHAを検証済み。実際の秘密転送URL設定とraw transport stderrだけを除外し、public SQL `snapshot_positions_and_private_archives` と元434入力は収録している。旧parent archiveは変更しない。

```sh
cat evidence.tar.gz.part-01 evidence.tar.gz.part-02 evidence.tar.gz.part-03 > /tmp/c20-evidence.tar.gz
tar -xzf /tmp/c20-evidence.tar.gz -C /tmp/c20-evidence
```

展開先を先に作り、`ARCHIVE_MANIFEST.json` の論理pathを対応する `blobs/<sha256>` から読む。全archive SHAは `21c66cad30fe6ee14b52947f60fac328230651117964a7bb4a044c1c545b0243`。

`ADDITIONAL_FILES_1.json` はarchive後の文書入力時刻と、別封印したF39/F41の現UI向け手順訂正9fileを列挙する。旧prep4不変、訂正版の型／selector／ブラウザー実行は未実行。元116／464原文条件、実7200秒、完全復元、実端末／実権限の全体合格をこの記録から推定しない。
