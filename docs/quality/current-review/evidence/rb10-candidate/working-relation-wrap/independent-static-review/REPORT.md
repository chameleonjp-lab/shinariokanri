C8作業差分の静的レビューでは、元の表示・保存・測定条件を弱める変更は見つからなかった。独立ブラウザー実行はまだ行っていない。

World.cssの末尾は、C7で横にはみ出した `.world-relation-meaning > strong` とspanへ `max-width:100%; overflow-wrap:anywhere`、本体にも `min-width:0; max-width:100%` を追加している。文字列、参照先、採用状態、図の内部スクロール、44px操作サイズを変更せず、hiddenやellipsisによる欠落も追加していない。C7で実測した342.14pxのラベルを狭い親幅へ折り返す修正として妥当である。実際の320/390/768/1024/1440、200%文字、クリック・keyboard・cold・完全復元は新しい固定版で確認する必要がある。

rb10-graph.spec.tsは元の移動／矢印接続／端末別配置／意味編集／cold／完全ファイルの期待を保持し、ネスト条件から発生する長い参照経路を追加する。320pxと200%で全文とページ幅を確認している。元のperson/line fixtureは保持され、追加したvariable/flow entitiesはbefore/after双方の完全保存比較に含まれる。この局所回帰だけで原F31/N13全条件、実回転・SplitView・ソフトキーボード等を合格にはできない。

measure-app.mjsは現行の正確なタブラベル「試読・検査」を使い、navと作品切替でAppShellの準備を待つ。元の試読操作、原データ件数・実素材SHA、ループ、30秒間隔、7200秒条件、出力／復元、性能の測定区間・上限は変更されていない。C7の旧ラベル失敗は未完了のharness失敗として保持し、C8で実7200秒を新たに実行する必要がある。

次候補では親commit/tree・source/build SHAを新しく固定し、測定補足helperの元script SHAも明示する。旧C7由来helperを使う場合は、どのscriptから生成したbytesかを保持し、新しいmeasure-app.mjsのSHAと混同しない。

この結果は作業中3ファイルの読み取りだけで、C8受入・性能・実機・実Authの合格証拠ではない。原104/116 JSON、UI_UX、NFR、BEHAVIORのbytesはC7と同一だった。
