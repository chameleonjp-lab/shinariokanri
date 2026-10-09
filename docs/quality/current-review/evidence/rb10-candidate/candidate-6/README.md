# C6 固定候補の結果と一覧再入後の保存拒否

eab9812 / tree8cc78、clean build1dd4d263d6d1d9c056f2。CI37893273502は763単体・258 production・全20step成功。CIの実checkoutはad793afff041dc52ba5f2d0dfd5e2593b13437d9で、source treeは候補と同じ。Standard各30回の元8局所指標とLargeの強い入力開始30回8,483.2ms／検索462.4msは数値内。実88003件・履歴31・待ち31・72MiB全hashを照合した。元値・source/dist SHA・helper・環境を保持する。

その後、元recovery helperの取消→再試行→作品一覧からの再入→編集は120秒で未保存。補足は同じfixture/操作/期待値に失敗UI採取を加え、project.idの未知項目による通常保存拒否を確認した。strict schemaは正しく停止し、入力と取消前後の正本は保持された。Libraryが表示用idを正本へ付加したことが原因。CI/性能の成功を復元や全体合格へ流用しない。C7は表示行を{id,project}へ分けて元projectを渡す。

PR20は2026-10-09T06:58:21Z、利用者側でmain ae22dcae465236891f58cf8c1ea63174b9483cdb / 同treeへ取り込まれた。ルートからマージしていない。C6で空new/clone・実7200秒・原116全体は未完了。9migrationと隔離模擬RLSの成功を実Auth/RLS/Storageへ換算しない。
