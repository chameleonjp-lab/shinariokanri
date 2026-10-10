# 原子保存のJSON処理と元の保存受入

8,800件の同じ作品を通常画面で編集する元RG-R06の測定で、C17の一台詞保存p95は `1040.2999999821186ms` となり、保存完了の元上限 `1000ms` を超えた。C17 `413d66919a49d403e8df5366217d5a407f42f683` / tree `b25fea8471b2d114cddf600a35f309e50c5fba7c` / clean build `791efda0096db71cff13` の実不合格を保持し、次候補C18で同じ保存内容を繰り返しJSON化する負荷を減らす。対応はREQ-N04／AT-N04／WP23／RG-R06で、REQ-N06／AT-N06、REQ-N09／AT-N09、REQ-N18／AT-N18の原子性・拒否・入力保持も再検証する。

## 実際の変更

`ScenarioStore`の私有WeakSetへ再帰的に凍結済みとして登録された小さなrecordだけ、成功したcanonical JSON文字列をWeakMapで再利用する。呼出元の可変値・浅いfreeze・配列・accessor・非plain prototypeはキャッシュ対象から除外する。循環はcache lookupより先に検査し、失敗したencodingを公開しない。配列順、key順、undefinedの省略、Unicode、有限値、全canonical bytesとhashを保持する。

上限は1recordのUTF16符号化payloadが64KiB、1世代16,384件、合計payload32MiB。超過時は弱参照の世代全体を交換する。32MiBは文字列payloadの予算で、heap全体・object overhead・完成したrequest文字列・UTF8 buffer・SHA処理の上限ではない。作品全体・履歴全体・巨大配列はキャッシュしない。

schema・hash・基底revision・権限・固定世界・素材bytes・履歴・送信待ち・重複操作・取消・native transactionの検証と拒否条件を変更しない。現行request hashと旧request hash版の分岐も保持する。完全保存形式と移行・native parts・解析・公開gateの上限は不変。

## 元C17の実結果

元Standard8,800件と、明示的に追加した3件／各1MiBの実素材付き作品を分け、作品名1項目、一台詞、2台詞recordの原子一括保存を各30回、計180回実行した。区間はcommand検証開始→原子durable commitで、500ms入力debounceは混ぜない。別のinput/click→UI確認区間はdebounce・poll・IPCを含む観測として分ける。

| 元fixture | 保存操作 | 実30回p95 ms | 元1000ms判定 |
| --- | --- | ---: | --- |
| Standard8,800件 | 作品名1項目 | 462.90000000596046 | 局所成功 |
| Standard8,800件 | 一台詞 | 1040.2999999821186 | **不合格** |
| Standard8,800件 | 2record原子保存 | 528.4000000059605 | 局所成功 |
| 同じ8,800件＋実素材3件 | 作品名1項目 | 419.30000001192093 | 局所成功 |
| 同じ8,800件＋実素材3件 | 一台詞 | 723.0999999940395 | 局所成功 |
| 同じ8,800件＋実素材3件 | 2record原子保存 | 419 | 局所成功 |

両方で現在稿→cold→実完全保存ファイル→空の390px環境へ新規復元→coldを実行し、content hash・ID・本文位置・本編開始・暦・91件の全履歴・91件の元pending意図・素材bytes/hashが一致した。新規復元のoutbox1件とrecoveredPending91件を、元outbox91件と取り違えない。この復元成功は保存性能の不合格を解消しない。

C17のStandard測定attempt1のframe超過、attempt2の局所成功、Large attempt1の環境切断による未完了、attempt2の局所成功も各rawに保持する。C17のCI run38014552821は全21step成功（804単体／88files、306 production画面、Large解析、RB03/RB04、Python15、build等）。実checkout `d3647de971243d6c7e152426228423a174f0849e` は同じtree。証拠ZIPのredirect取得は実403で受信0bytesとなり、ZIPの中身を取得済みとは扱わない。署名付きURLのrawは私有保持し、redacted stderrとSHAだけを梱包する。

## C18準備の実検証

変更前後のJSONモジュールを使った小さなNode観測では、元C17の実before-currentのcanonical6,258,972bytes／SHA `fa8c51bf975d5b33bdf6516c942711d8708f1f60902b52e2868ef337c5852bb0` が3回とも一致した。これはNode部品のbytes確認で、ブラウザー保存・30回p95・全受入の合格へ換算しない。最初のTypeScript旧API loader失敗と、その後のimport quote書換え失敗も保存する。

実適用sourceの独立静的レビューに具体的blockerはなく、新6件の回帰、全810件／89filesの単体（251.36秒）、型検査・production build・offline shell、schema生成差分なし、文書・計画、Python15件が成功した。全検査の開始前sourceを保存し、終了後もsourceと元26文書がSHA一致した。準備buildは親commit＋dirty sourceの `7453b6cbec4e17c315b3`、生成runtimeはSHA `6871ea016635d84981e405880e56a7a2b9a9e3aa9edfa34f48bda27dddcf161f`。最終clean candidateとは区別する。

実入力・実出力・helper・trace・独立static seal・失敗記録は[準備と歴史C17の集計](../quality/current-review/evidence/rb10-candidate/candidate-18-bounded-json-working-and-c17-final-1/SUMMARY.json)と[SHA manifest](../quality/current-review/evidence/rb10-candidate/candidate-18-bounded-json-working-and-c17-final-1/MANIFEST.json)に保持する。archiveは64MiB以下の3partsを順に結合し、元tar.gzのSHA `a4139bba32bb3c8b543efe10bb222458d58e4e4d6804ff6ec3273fa2ac3edffd` と各memberのBUNDLE_MANIFESTを検査できる。元の原文・設計時planned/not_runレジストリは変更しない。

## 次の固定対象で判定する条件

clean commit／tree／build／base／全sourceとartifact hashを固定し、通常production画面、元Standard/Large各30回、元180保存、同じ元91履歴ファイルのnew/cloneと任意旧版復元、Largeの全素材復元、時計を加速しない実7200秒を再実行する。C17の成功・dirty準備・Node観測をC18の結果へ移さない。

104要件／116原ケースのgiven・when・then・negative_or_edge、24工程、6回帰群、RV01〜30は同じ最終対象へ結び付けて判定する。実OS・iPhone/iPad/PC・IME/Files/録音・VoiceOver/NVDA・専用実Auth/RLS/private Storage・5実account・現行quota/費用の不足は具体的な未実行として保持し、release evidence gateを緩めない。マージ・本番公開・新規課金・外部DB変更は本作業から実行しない。
