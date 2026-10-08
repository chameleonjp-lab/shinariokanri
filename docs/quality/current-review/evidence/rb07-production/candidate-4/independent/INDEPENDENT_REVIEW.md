RB07候補 `7ca23111b3e8f8e7d85cb78b05ea9179a73a9f3e` / tree `01d929400f84b127fd116c7405c505d5c0540153` を同じ固定入力・正期待で独立再検査した。以前の部品14件＋固定版/素材捕捉2件＝16件、通常App7群＋固定版1群＝8群、production3件は成功。旧pinだけのコマはconfirmedを維持し、現稿cueを使うコマはneeds_reviewとなる。

関連する新R7D17/R7U09は失敗した。旧pinL1の話者Aへ結んだ固定字幕に対し、現稿L1だけBへ通常保存→cold reloadしてtick10で口調検査すると、旧字幕のA用候補が部品で1→0件、通常画面で全4→1件（正期待2件）へ減った。コマはconfirmed、旧pin話者Aは不変。productionChecksが現在稿から話者Bを借りている。新部品1件/通常1群の正期待失敗は元16/8成功と別記した。

169srcはcommit全件一致し、原15資料と旧4fixture hash（今回未実行）、元4独立入力＋旧固定入力bytesと新speaker fixture、dist/ログ/検査源を結合した。565の107成果物と921の64成果物は不変。過去fixture/setup/errorの履歴も別保持。実Appはnative IndexedDB/Chromium151、部品はfake-indexeddb。実OS Files/録音/実端末/支援技術/全性能/長時間/実Auth/API、104/116/24/6とRB07全体の合格へ換算しない。隔離build-infoのunknown/dirty=trueをclean releaseへ換算しない。Vite5335/preview5337は停止し、repo製品・既存証拠・commitは編集していない。
