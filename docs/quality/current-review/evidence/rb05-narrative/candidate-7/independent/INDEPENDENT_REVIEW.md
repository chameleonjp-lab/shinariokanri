# RB05第4追加・独立候補7再検査 7812804

commit `7812804f4b727656c09904a5ffb25379da1955bc` / tree `a9c48d2fcd7863d6daba3a5b3aac1ad0417fad0c` を隔離し154srcのhashを照合した。候補6から製品差分はReader.tsxだけ、残る153srcは同じ。原資料15/旧main3099fixture4も不変。製品・repo証拠は編集していない。

元CTX-UI-childのfixture bytesを保持し、専用call/returnのラベルへ観測セレクタだけ合わせた。独立部品12件が成功し、通常App3群は2成功/1失敗。固定子の正常呼出し→出口→復帰、同一ターン連打、巻戻し再復帰、終端の原子記録→cold reload→native/clone再生が成功した。出口で同一画面の保存遅延/失敗/再試行では進行・戻る・版切替を停止し、元状態を保ち、最新propsの再生後に復帰できる。

**CTX-UI-child-away-failureは残るRV07境界。** 出口で経路保存待ち→資料へ移動→Reader再入すると、試読状態/呼出スタックの表示が消え、開始がenabledになる。保存を失敗させてもReaderにエラー・経路・状態が戻らない。DB trace0は保持されるが同じ経路を再試行できない。通常persistのsession/busy/pendingReplay/errorがcomponent local、完了・失敗処理もlive.current限定で、移動後のReaderへ渡す保存フェーズがない。候補7が導入した差とは判定せず、現コードで再現した既存の保存ライフサイクル差と記録した。

候補6の『子出口にボタンなし』失敗、候補5のCTX2失敗、さらに旧a21/5c/32の失敗は不変。今回の実AppはChromium151/Vite dev/native IndexedDBであり親のproduction/full suiteや実機/実APIとは別の証拠。104/116/24/6、全RB05の合格へ換算しない。詳細/環境/未実行はINDEPENDENT_REVIEW.json、hash結合はSOURCE_COMMIT_BINDING.jsonとARTIFACT_BINDING.json。
