# AP04 AT-E12 原4節の追加計画

この資料と[proof JSON](ap04-original-e12-proof.json)は、現行の[通常入口](../../../tests/e2e/ap04-original-e12-continuity.spec.ts)の原文・source位置・予定操作・assert・不足条件を記録する。全4節は`not_run`。進行中の固定候補`b56e8b9`の実行結果ではなく、旧結果や静的一致から合格を移さない。

| 原句 | 現行sourceにある計画 | 未観測・不足 |
| --- | --- | --- |
| given: キャッシュ済みアプリと未送信作品 | 既存trace入り完全ファイルを通常復元。service workerのcontrollerを確認し、場面を通常保存して実outboxが非空であることをassertする。 | ブラウザー未実行。実端末の取得済み状態・実アカウントの送信待ちは別に観測する。fixture自体には未送信操作・素材がなく、未送信操作は実行時の通常保存で作る。 |
| when: 機内モード、保存容量不足、途中更新、移行失敗、専用出力からの再開を行う | context offline/cold、native putの一回限りのquota拒否と保存再試行、実waiting worker、コピー旧DB layoutで移行拒否と再試行、実完全downloadを別contextへnew/clone復元してcold試読する。 | context offlineは実機機内モードの補助。quota注入は実容量枯渇ではない。workerのcache名だけを変え、アプリbytesは同一なので異なる旧アプリからの更新を証明しない。コピーDBへのsetupも旧アプリの実移行を代用しない。 |
| then: 失敗と未保存を明示し、更新は安全地点で適用し、書き出しと復元で再開できる | 容量alert・未保存表示・入力保持・指定11表不変をassertし、通常再試行後に完全保存を作る。両controlled documentを閉じる/worker scope外へ移してwaiting消失・新cache・作品/outbox保持をassertする。new/cloneの復元、cold、保存projectとID/history対応、試読終端を確認する。 | 11表不変は全DB不変のassertではない。安全地点はfixture serverのscope外navigationであり、実旧版更新と実端末の継続は未観測。復元後のpending件数は記録だけで同一性をassertせず、素材取得/実OS保管も確認しない。 |
| negative_or_edge: 初回未取得・未取得素材・保存先取消を成功と扱わない | 別の空offline contextで初回gotoがrejectされることをassertする。 | これはブラウザーnavigation拒否までで、製品の初回未取得説明はassertしない。fixtureにはattachment/asset bytesがなく、未取得素材の実product controlはこのspecにない。実OS保存先取消も操作・assertがない。 |

入力fixtureは`docs/quality/current-review/evidence/legacy/3099c9d-flow-trace.scenario`（2237 bytes、SHA-256 `ab5b4b920b22ebd4453945e4d366bccc8f3c5893357c04993548e0a4359b84e1`）。保存ファイル内はprojectとmanifestのみで、8 entities・1 snapshot・0 historyを含む。実行時に`attachGiven`が元bytes/hash、非空outboxのoperation ID、buildを保存する。specに予定fixture SHAとの事前比較はなく、最終実行では実添付bytesをこの固定入力へ照合する必要がある。

起動前にrootが同一commit/tree/build・base・source/fixture bytesを固定し、Service Workerを使えるブラウザーで `npx playwright test tests/e2e/ap04-original-e12-continuity.spec.ts --project chromium` を実行する。生成する完全保存、runtime workerの変更前後hash、実build情報、native比較、new/clone結果を同じrunから取得する。実機機内モード、旧/新版アプリbytesを使う更新、実容量枯渇、未取得素材の通常表示、実OS保存先取消は別の原条件観測が必要で、補助手順の成功から原句全体を合格にしない。

この追加で製品・spec・helper・checker・既存監査/plan/reportを変更していない。source spanとhashの静的確認も受入実行結果ではない。
