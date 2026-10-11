AP02 run2 の固定候補実行を保管したディレクトリです。原3 spec の9ケースを Chromium / Firefox / WebKit 各1 workerで1回実行し、各9件、合計27/27成功でした。再試行・自動再実行・skipはありません。実行開始は2026-10-11T09:03:48.864Z、所要336,593.119 msです。

候補は `b56e8b953ee5398a8c4b97031b4a426bb6a9f512`、treeは `46927ebcc8c8b016f5a23845d19745ccb05c0049`、production buildは `1dc95b9eb4d844a28134` です。[summary.json](summary.json) と [binding-before.json](binding-before.json) / [binding-after.json](binding-after.json) に実結果・環境・候補を保持しています。source manifest SHAは `3559fc6f973d541c8122c867ac061f908f6dca0bbb45571a87cb456c47bdf946`、dist manifest SHAは `10b7642cd477f8a6db06f6f923023d2eb472a4bd9bf50cd682a117782795a6d2`。前後でcleanなsource/test/dist、環境、module、外部観測hookのbindingが一致しました。

元保管先 `/tmp/shinariokanri-ap02-b56e8b9-run2` の [retained-manifest.json](retained-manifest.json) に載る389ファイル、154,862,609 bytesをコピー前・コピー後の両方でSHA-256/bytes照合しました。manifest自身（75,867 bytes）も別に照合し、元390ファイル、154,938,476 bytesを一切改変せず保管しました。元の [README.md](README.md) もそのままです。本書と [relocation-manifest.json](relocation-manifest.json) の2ファイルだけを追記しています。移設時にraw JSON、HTML、trace、脚本、絶対パスを書き換えていません。

27本の実traceとHTMLレポート、raw reporter JSON/log、実upload51個（各engine17個）の `.scenario` Buffer、実report添付の `.scenario` 72個・Markdown18個・JSON30個を保持しています。72個は入力fixture添付も含むscenario添付数です。[actual-artifacts.json](actual-artifacts.json) はreport添付を実bytesへ復元した一覧とSHAを持ち、download出力との区別を元のattachment名・test対応で保持しています。

Playwright 1.63.0のtraceはsetInputFilesのBufferを `<Buffer>` に変えるため、元の非添付A/B入力をtraceだけで復元できません。許可された外部 [upload-hook.cjs](upload-hook.cjs) が原3 specの実 `.scenario` Bufferをforward前に別Bufferへコピーし、PID/counter/engine/titleに対応するwrite-wxの一意ファイルとSHA/bytesを保存しました。元メソッドは `original.apply(this, arguments)` で同じreceiver/引数/optionsを渡し、元Promise/例外を返します。観測失敗時も元操作を続行し、別途エラーを残してpostrun完全性auditを失敗させる構成です。hook SHAは `354f3bd06b953afd8d5d4a1b9a93815de8093e647639ab6ff96ac4feb156a6fa`（7,012 bytes）。実行時NODE_OPTIONS、hook/module/source SHAとbytesは元bindingに残っています。

[upload-audit.json](upload-audit.json) は実入力51とtraceの51 uploadを照合してcomplete、観測エラー0です。link-candidate-ignoreの2番目の原ケースで最初に入れた作品A/Bの計6入力は各1回の実uploadとして保存し、同名の後続cold archiveやrandomUUIDの再生成で置き換えていません。proposal.mdのBuffer、path/directory upload、全ネットワーク経路はこの`.scenario`専用hookの観測対象外です。

原実行コマンドと固定環境は [run.sh](run.sh) / [preparation.json](preparation.json) に保存しています。移設後も原絶対パスを保つため、保存したrun.sh等をこの場所で実行して再試験しないでください。原 `/tmp` 参照から保管済みbytesへの対応はrelocation-manifestに記録しました。build参照の `/tmp/ap04-fixed-b56e8b9/after-build-binding.json` は隣接する [固定候補unit証跡](../ap04-fixed-b56e8b9-unit/after-build-binding.json) と同SHAです。

原受入条項の観測範囲はrelocation-manifestのoriginalClauseScopeに原4節を改変せず対応しています。

- AT-F27: 同名/別名/一般語、確定リンク、逆参照、除外のcold保持、識別情報と本文不変は直接確認しました。「引用資料を無断で置換しない」は該当する引用資料fixtureがなく未観測です。
- AT-F36: 同じS fixtureの確定/未確定設定、秘密除外、明示した前後状態、Sの公開範囲による実MD、出所/固定版付き別案と正本比較・正本不変は直接確認しました。AI自動送信の観測は対象pageの外向きHTTP(S)requestが空というassertionに限られ、他contextやservice worker/背景処理全体での送信不在は未観測です。
- AT-E12: native移行の原子拒否/再試行/中止、保存例外UI、保持入力、専用完全保存からの復元を確認しました。キャッシュ済みアプリ＋未送信作品の同一given、機内モード、途中更新と安全地点適用、初回未取得・未取得素材・実OS保存先取消は未観測です。

原legacy clone入力のhistoryは空です。厳密oracleの履歴保持loopが非空履歴の保全を実証したとは扱いません。実端末、実Auth/RLS/Storage、原116ケース全体の合格にも昇格していません。元原受入auditのnot_runを変更せず、旧ap02-run1の21成功/6失敗は別候補での記録として保持しています。移設処理は新ディレクトリだけへ書き込み、runtime-verification、source/tests、global README/retention-manifest、旧run1を編集していません。
