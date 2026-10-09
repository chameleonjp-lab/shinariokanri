C6 WIP2静的追補

5ファイルをSHA付きで固定。product2ファイルは前WIP1と一致し、新しい静的不具合は見つけていない。storage.testのraw比較はnative backendDBの同一readonly8-store TXとなり、codec経由分類の懸念は解消。8対象storeの証拠範囲として扱う。

E2Eは12,002件のfixtureと22期待を維持し、全体watchdogだけ120→240秒、5stepを追加。個別60/60/30秒waitと原性能基準は不変。実機/実Authや全受入へ換算しない。

C5 CI37889230895はhead5720bc8でfailure。761単体成功、257/258E2E、Firefox全体120秒timeout、後続RB03/RB04はskipped。rawjson/logを別SHAで不変保存し、C5Large30未達とは分ける。

共有ソース/git変更0、独立実行0、HEAVY PAUSED。最終C6のtarget/build結合・実行は未確認。
