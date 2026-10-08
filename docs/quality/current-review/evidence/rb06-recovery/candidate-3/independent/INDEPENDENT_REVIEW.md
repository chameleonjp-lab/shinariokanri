RB06候補 `cd38e34d2ccebb1fc07ebbab4a6ca86afb494655` / tree `4e416bdaba2a1e3c0d1213a5969e1455531d9dfe` を隔離して独立レビューした。部品17件、fixtureの検査2件、実Chromium native IndexedDBの旧v1→v3移行1件、production既存復元2件が成功。通常App境界は7件成功・1件不合格である。元104要件・116受入・24工程・6回帰群・RB06全体の完成判定は行わない。

未修正のR6U03は、作品Aの新規C復元を開始し、保存待ち中に資料Aへ移動すると、完了でCの年表へ自動移動する。正期待は後の作品A・資料選択を保持し、Cを一覧へ追加すること。復元内容の原子保存は成功している。Appの完了処理が作品/一覧だけを確認してopenProjectを呼ぶため、後の画面移動を上書きする。fixture `independent/fixtures/C.scenario` と実観測 `independent/fixtures/R6U03-observation.json`、正期待失敗logを保持した。

共有物品IDの旧固定経路は、新規/clone/全ID対応の別作品統合でもterminal・tick5・個体ID・旧pinを保った。74件の元履歴・送信待ちと出所を別作品へ写し、重複revisionの曖昧参照は拒否し、明示した操作IDから単体復元できた。旧任意版検索、単体/全体復元、4原子quota段階・書込後取消、変更後/偽造承認拒否、素材bytes/不足、破損/未知/量拒否、入力cold再開・保存失敗再入・別作品・ファイル待機を検査した。

部品保存はfake-indexeddb、App/旧v1 DB/productionはChromium151.0.7922.173（/usr/bin/chromium）のnative IndexedDB。Debian13.6/Linux6.18.44、Node24.19.0、Vitest5.0.3。Vite5315・production5317は停止済み。productionの2件は既存testを独立実行した。隔離archiveには.gitが無いためbuild-infoはcommit=unknown/dirty=trueであり、完成版release証拠には使わない。161srcのcommit一致と実行成果物hashは別に結んだ。

製品・repo既存証拠は変更していない。review harnessの初回型/セレクタ/同期/期待出所欄の訂正前sourceとlogsも保存し、製品差と区別した。元15規範資料と4旧fixtureのhash・原9受入のgiven/when/then/negativeを保持した。

全kind/作者案/採用/推移世界/大素材を同時に含む総合受入、実端末Files/OS更新/支援技術/長時間/全性能、実Auth/RLS/API/Storageは、この局所レビューの合格へ換算していない。親の全suite/production成功は別証拠である。
