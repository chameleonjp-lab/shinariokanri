# 共有履歴の完全復元

最新mainの確認は `cddaee863ba43dc1be8039cc6effbb7281450df5`（利用者によるPR #26取り込み）。PR #27の固定C13 `18bc668` / tree `ec3ed81` / clean build `2503d3e7976b1e7d1643` はCI run `37973355292` の774単体・273通常ブラウザー・元Large解析1を含む全21段階が成功した。

元Standard 8,800件を通常画面で作品名30回、1台詞30回、2台詞の原子一括30回保存し、版91・履歴91・送信待ち91まで進めた。第3手順の保存区間p95は371.2ms、656ms、342.1msで元1000ms以内。500ms入力待ちを含む画面区間と分ける。current/coldの内容hash、段落ID、全ID、世界tick、暦を保持した。

その実完全ファイル（255,211 bytes、SHA256 `5fc45f32b1ef2a428e7cd0facbd7388b32f8a05edfc22dd0f28bb7f5bc4efd9a`）を空の390幅production Chromiumへ読み込むと検査は成功するが、新規復元の確定時に保存エラーとなった。実例外は `RangeError: Invalid string length`。共有レコード辞書から復元した全履歴を、storeの `validated()` が未使用の一本のJSON文字列へ展開していた。作品・履歴・送信待ちなどのnative表は0件のまま、元ファイルを含む復元入力は保持した。[固定source・実行手順・raw・trace・失敗判定](../quality/current-review/evidence/rb10-candidate/candidate-13-history-restore-failure/SUMMARY.json)に結合する。CI成功をこの復元の合格へ換算しない。

C14準備は既存の `validateJsonValue()` を `validated()` へ接続し、同じ呼出中に検査済みの共有オブジェクトの再走査だけを省く。Unicode、有限数、循環、未定義配列値の拒否と未定義object項目の省略契約を保持する。検査済み記録は呼出ごとに破棄するため、その後に変更された入力を再検査する。内容hash・snapshot hash・送信待ちhashを計算するcanonical JSONは変更しない。

元のnative形式、辞書feature、全kind、段落/台詞ID、旧版、世界pin、履歴、送信待ち、素材bytes、clone対応、公開投影、容量不足/取消の原子性、ZIP64MiB/展開256MiB/JSON64MiB/素材32MiB/100,000records/500,000objects/深さ32を保持する。履歴を削除したり未知の結果を合格にしたりしない。

最終固定C14で同じ実ファイルのnew/clone/cold、元各30回、元116/24/6と33境界、Largeと実7200秒を別々に確認する。実OS端末/支援技術/実専用Auth/RLS/private Storage/quota・費用・公開接続先は未提供のまま完成を保留する。実7200秒はまだ開始していない。

この差分の主対応はREQ/AT-B12（専用ファイル）、B23（ID/保存/履歴）、F35（履歴とファイルの持出し）、N06（原子性）、N14（復元完了）、N18（入力保持）。RV16/RV17/RV29の後続検証に接続する。準備確認は関連55件/4ファイル・production build・文書/計画・schema不変・Python15件・最終5ファイル独立静的レビュー。旧fixtureの本文field上限拒否、合法ASCII巨大入力で発見した出力失敗、同じ準備の180秒watchdog失敗を原記録へ保持する。最終検査の代替にはしない。
