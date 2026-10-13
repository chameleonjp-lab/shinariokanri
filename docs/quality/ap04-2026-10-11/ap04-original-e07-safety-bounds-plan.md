AT-E07 の残り 10 種類の安全上限を、元の ARCHIVE_LIMITS の直前・直後で通常画面から確認する追加入口です。原ケースの四節は一件のまま保持します。全情報往復・元の不正 7 ファイル・添付重複・ID衝突・本文 1 MiB 境界は `tests/e2e/ap04-original-root-restoration-output.spec.ts` と同じ固定候補で実行します。元監査と元 fixture は変更していません。

`tests/e2e/ap04-original-e07-safety-bounds-helpers.ts` は実行時にだけ元 `complete.scenario` から派生 fixture を生成します。ZIP の CRC とサイズ、manifest の SHA とサイズ、添付 metadata は実 bytes と一致します。限度の上書きや、上限未満側の別形式不正、ZIP 外の padding、偽の素材 header は使用しません。

| 対象 | 元上限 | 直前 / 直後 | 実際の構成 |
| --- | ---: | ---: | --- |
| 圧縮 bytes | 67108864 | 67108863 / 67108865 | 実 UTF-8 素材四つを登録した method-0 ZIP の全 bytes |
| 展開 bytes | 268435456 | 268435455 / 268435457 | 各素材 32 MiB 未満の八素材と全 JSON・manifest の合計 |
| JSON bytes | 67108864 | 67108863 / 67108865 | 合法な末尾空白を加えた元 project JSON |
| 添付 bytes | 33554432 | 33554431 / 33554433 | 登録された実 UTF-8 text/plain 素材一つ |
| ファイル数 | 5000 | 4999 / 5001 | manifest を含む実 ZIP entry、全添付に実 record |
| record 数 | 100000 | 99999 / 100001 | 正本と元参照世界の entity・relation 合計 |
| JSON 深さ | 32 | 31 / 33 | terminal gate の all と children array、AST は上限内 |
| JSON 容器数 | 500000 | 499999 / 500001 | 全 JSON 容器を測定し、六つの本文へ空段落を分散 |
| 条件深さ | 16 | 15 / 17 | not と constant の実 AST、JSON 深さは上限内 |
| 条件ノード数 | 256 | 255 / 257 | all と 254 / 256 個の constant、子配列は上限内 |

各生成結果は対象値が元上限 ±1 と一致し、他の十上限を越えないことを数えます。records の直後側は参照世界の件数を含めて越えます。正本だけは合法なため、「参照世界を含むentityとrelationの件数」の guard を確認します。圧縮 bytes は通常ファイル選択の 64 MiB guard、その他の bytes は実 ZIP 展開サイズ guard が先に働きます。

`tests/e2e/ap04-original-e07-safety-bounds.spec.ts` の十入口は、直前側を空 context に読み込み、「保存IDを維持して新規復元」を明示して通常復元を完了します。検査済み表示だけでは足りません。dialog の終了、正本の件数、snapshot・view・世界 ID、追加段落の実保存数、末尾 category、全素材の保存 bytes の SHA を確認します。

直後側は元作品を保存済みの別 context に投入し、対象上限の正確な理由と該当 path、復元候補が出ないことを確認します。readonly IndexedDB で正本・本文・素材 bytes・履歴・同期・recordParts を含む全表を正規化して SHA を比較します。入力保持・navigation 表だけを除外します。

現時点は fixture 生成、browser、build、unit、TSC を実行していません。十入口も原四節も `not_run` です。実行時には真の bytes と測定値・SHA・通常画面の拒否文言・保存表比較を observation に添付し、固定候補の source SHA を更新します。OS の Files / 実端末への受け渡しは別の実観測が必要です。
