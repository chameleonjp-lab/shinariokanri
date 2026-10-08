# RB05第4追加・独立候補8再検査 fcc06ca

commit `fcc06ca57e8e046b87d231ff0fec65a02099137a` / tree `7871b36eedabb838c474fb61c838519471065b80` を隔離し、155src/原資料15/旧固定fixture4をhash照合した。候補7差分はReader.tsxとreaderDraft.tsのみ。元CTX子fixtureはbyte不変、製品・repo既存証拠へ書き込んでいない。

独立部品12件成功、入力fixtureの型/hash/native成立1件、通常App12群は10成功/2失敗。元の保存待ち→画面移動→失敗→同じ経路再試行は成功へ転じた。通常の呼出/復帰/巻戻/原子記録/cold/native/clone、同一ターン連打、開始・再生中の別作品分離、開始失敗入力再開、基底0に対する通常設定保存rev1の競合拒否・旧版0証跡の明示retry、trigger/unknown停止が成功した。原子ack後の旧検証を遅延し、再入の検証が確定してから新操作を実行しても、旧promise完了が新位置を巻戻さない。

**RD-replay-reenter**：保存版A再生のhash待ち中に移動・再入すると、完了時sessionはAの終端になるが版selectが現在稿のままで誤stale表示になる。旧callbackがlocal版を更新できず、再入の版へ同期しない。**RD-version-selection**：Aを再生後、次の開始対象Bを明示選択して移動・再入すると、保存sessionのAを初期化で優先してBを落とす。両fixtureは不変snapshot/hash/native-valid。実行自体はA固定であり、現在稿を再生に代用したとは判定しない。

初回の新規harness/setup不足（未宣言optional-trigger override、1024幅メニュー開閉）を分けて保持し、正規の型付きcall/通常メニュー手順へ訂正した。版2差の正期待は変更していない。候補7のaway失敗と以前の全負例は不変。

Chromium151/Vite dev/native IndexedDBとfake IndexedDB部品の証拠を分け、親production/full suite/実機/実APIとは混ぜない。104/116/24/6や全RB05へ合格換算しない。詳細はINDEPENDENT_REVIEW.json、commit/原資料/fixtureの結合はSOURCE_COMMIT_BINDING.json、rawログと成果物はARTIFACT_BINDING.json。
