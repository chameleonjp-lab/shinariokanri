# 1Cの局所証拠

[local-evidence.zip](local-evidence.zip) は、最終worker E2E/helperの実source、実配信dist、原契約入力、局所log/HTML report、完全scenario8件、実公開MD、相談MD入力原本、失敗した3engine試行を保持する。SHA-256は `aa19943be164f3a0dbd910f5edbe3b8006e69eba9d7d1f78819cc165647ca368`、8737659 bytes。全775 memberのCRCと実bytes/SHAを再読確認した。[外側inventory](local-evidence-manifest.json) は自己参照せず、ZIP内 `MANIFEST.json` のSHAも別記する。

これはcommit/tree unknown・dirty=trueの開発distによる局所Chromium接続の証拠であり、clean candidate sealや正式受入ではない。最終PRの原全CIと実3engine結果はPR本文で別に結合する。元の1A現行30/180・heap不足、外部22件と別3条件、9release gateを解除しない。

ZIPの `source/` / `served/` は最終局所試行の実source/配信bytes。`worker-source/` と `local/source-binding.json` はworker提出時の5所有path、`originals/` は固定契約入力。`local/REPORT.md` に実argv/exitと途中失敗の有効範囲がある。最初の失敗/中間試行を最終sourceの成功へ付け替えない。

`local/e2e-final-report/data/` に実scenario8件、同HTMLの埋込reportを抽出した `local/report-*.json` に添付名とSHAがある。`local/actual-artifacts.json` は各原本のpath/bytes/SHA/作品ID/版/固定版、`local/continuity-observed.json` は実観測を保持する。テスト用の作者秘密markerは合成作品内の値であり、実Auth秘密・実作品・個人情報は含めていない。
