RB07候補 `8e6023929b64cb180f65da4b4859bd8a8df57b7c` / tree `7b007332ff785ec8b1b6cb520dfd4caa99522769` の独立レビューを確定した。既存の部品17件（fixture妥当性1件は別）、通常App9群、production3件が成功した。旧固定字幕の話者、元台詞hashの確認、未検証時のunknown候補、native/new/cloneを確認した。追加の世界/共通元部品は2成功・2失敗、追加通常App1群は失敗した。

R7D20/R7U10：外側固定版が借用する内側固定台詞を正しく解決できず、現稿話者だけA→Bへ通常保存・cold reloadした後に旧字幕が未確認となる。正期待は固定話者Aの候補を維持すること。通常画面は候補4件・未確認1件（正期待未確認0件）。R7D21：制作viewの直接APIが借用依存hashの改ざんを拒否しない。通常UIのcaptureは独立に検証するため、直接APIの問題と区別した。

R7D22はcontent-only registryに旧版の期待hash descriptorがないためINTEGRITY_FAILEDで安全停止した。成功を期待した事前検査源/rawはそのまま保持し、根拠不足と製品負例を区別した。次候補では同じ旧bytesと既存worldB.snapshotsのhashを渡す成功検査、descriptor欠落の停止検査を別に行う。旧hashを入力bytesから自己計算して合格扱いにはしない。

169srcは対象commitに一致、原15資料・旧4fixture（今回未実行）・共有入力はhashを維持し、565/921/7caの全成果物は不変。部品fake-indexeddb、実App native IndexedDB/Chromium151、productionを別記。隔離build-infoのunknown/dirty=trueをclean releaseへ換算しない。104/116/24/6・全RB07、実端末/実Files/録音/支援技術/全性能/長時間/実Auth/APIは未判定。repo製品・既存証拠・commitは編集していない。
