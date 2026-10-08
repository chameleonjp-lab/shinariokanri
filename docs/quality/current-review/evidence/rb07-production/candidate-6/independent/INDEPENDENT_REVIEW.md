RB07候補 `1b7b50898515b92a1b8e6706565685c9be611113` / tree `39249c28def211d3454545f4f44fc71f03203df5` を読み取り専用で独立確認した。既存17部品＋fixture妥当性1件、10通常App群、production3件は成功。追加部品は5成功・2失敗、追加通常Appは1成功・2失敗。外側固定版reuseの元台詞解決と依存hash拒否は修正され、保存済み旧hash descriptorを渡す旧世界字幕は正常で、根拠不足／不一致は安全停止した。旧採用→新採用の履歴を持つ作品は完全保存からnew/cloneでも旧字幕を保持した。

R7D23/R7U12：初回から新B世界を採用し旧Bの台詞だけを引用した作品は、原子保存・cold検査・旧台詞表示は成功するが、完全保存で旧引用世界を収集せずsourceVersionId不足として停止する。履歴に旧B採用がある場合にだけ偶然保持される。R7D24/R7U13：旧世界字幕へ現在作品の用語規則を適用した候補の根拠が旧世界pinへ誤結合され、通常UIで『参照先の固定版または情報が見つかりません』となる。両方の元入力・正期待・raw負例を保持した。

169srcと当該commit/tree、原15資料、旧4fixture（hash保持のみ）、全固定入力、成果物をSHA256で結合した。8eの98成果物と前候補の負例は不変。部品fake-indexeddb、実App native IndexedDB/Chromium151、productionを区別。隔離build-infoのunknown/dirty=trueをclean releaseへ換算しない。104/116/24/6・全RB07・実端末・実Files/録音・支援技術・全性能・長時間・実Auth/APIは未判定。製品コード／repo証拠／commitは編集していない。
