# RB05第4追加・独立候補6再検査 f51f6b9

対象 commit `f51f6b9eea3727d1cb11af1914433b78e44d101b` / tree `2646c37b9e2dc7bfc6c34eea174dbe7b1c3a71d9` を git archive から隔離した。154src、原資料15ファイル、旧main3099固定fixture4ファイルのhashをcommitおよび原契約基底に照合した。製品・repo既存証拠を変更していない。

独立部品39件、提出関連13件が成功。候補5で失敗したCTX-graph/chapterの元正期待はそのまま成功した。同じ固定使用先のmigration/tick5/native/cloneを許可し、別使用先、期限切れ10、時点未入力は停止する。実際の固定callで仮想childGraphへ入り、そのgraph限定例外だけを許可する。金額/所持品/禁止遷移の効果群はexpired/unknownで全体拒否し、巻戻、原子保存→store再起動→native→clone再生を確認した。借用レコードを作者正本へ複写せず、仮想入口を宣言入口母数へ足さない。

通常App6群は5成功/1失敗。UI08-10の保存待ち/連打/移動/最新props/cold再起動、型付きtick5と一場面の保持が成功した。固定graphと章の通常試読→保存→cold reload→native/cloneは成功し、選択章の証跡はpartialを保持する。

**CTX-UI-childは未修正差。** Readerの通常ボタンで固定子graphの出口へ到達すると、試読中/呼出し階層1/金額9/物品1/限定値2まで正しいが、進行ボタンが0個になる。呼出元へ戻れず、通常操作の終端→経路保存→cold replayが完遂できない。同じ入力のruntime APIはterminalへ戻り、保存/復元も成功するため、部品成功を通常UI完成へ換算していない。Reader.tsx:76のmanual_choice分岐がstack付きexitにも適用され、outgoing edgeのない出口へ進行操作を出していない。

新規harnessの観測先3箇所（sessionにないexternalMode、使用先見出し、章worldTickとpartial）を正しい型/保存契約へ訂正し、初回源/logをsetupへ保持した。失敗した子出口の正期待は変更していない。候補5のCTX2失敗、a21/5c/32の旧失敗は不変。

実AppはChromium151/Vite dev/native IndexedDB、独立部品はfake IndexedDB。親のproduction/full suiteや実機/実APIとは別の証拠。104要件/116受入/24工程/6回帰群/RB05全体の合格には換算しない。詳細はINDEPENDENT_REVIEW.json、hash結合はSOURCE_COMMIT_BINDING.json、証拠raw bytesのhashはARTIFACT_BINDING.json。
