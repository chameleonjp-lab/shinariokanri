# 同期プロトコルと専用接続adapter

[`RB09_SYNC_SHARING.md`](../../docs/implementation/RB09_SYNC_SHARING.md)に通常操作、確定共通元/prepared/rebase/atomic ACK、全対象の二案、旧証跡の完全保存、項目限定編集、固定投影/指摘、private bytes、アカウント入力/ログアウト、専用migration/Edge構成と未実行条件を記す。

`nativeBridge`/`ScenarioStore`はlocal CommandRecord.beforeをサーバー共通元にしない。先行ACK後の編集と別対象の競合を残す。ローカルrevisionとサーバーrevisionは別。`SyncOutbox`はaccount/session世代を固定し、atomic ACK後だけ依存rebaseする。未知・欠落・権限/型/hash不一致のwhole batchは拒否する。

`server`/`editor`/`edgeEntry`は正本の共通domain規則を使い、session/role/fieldsetをSQLlock内で再検証する。ordinary clientsへ私有正本/世界/作者履歴を渡すのはownerだけ。編集者は明示fieldset、閲覧/指摘は承認済み固定projection。private素材とarchiveは失効後も生きるsigned URLを発行しない。

`testing.ts`のメモリサーバー、fakeIndexedDB、ローカルPostgreSQLのmock Auth/Storage、ブラウザーHTTP fixtureの成功を実Auth/RLS/private Storageや二端末の合格へ流用しない。専用URL/実試験アカウント/quota/費用は未指定。接続先作成・migration適用・deploy・課金・別用途DB変更は未実行。

単体: `npm test -- tests/sync.test.ts src/storage/rb09Sync.test.ts tests/rb09Features.test.ts`。SQL: 隔離コンテナ限定 `scripts/sync/check-sql-local.sh`。server bundle: `npm run sync:build`。実API用opt-in driverはガイド参照。WP17/18・AT-E05/E06・RB09全体の受入完了は別判定する。

最終局所候補はnative DBv6、限定編集DBv2、8migration。内容版とauthorizationRevision/ExpiresAtを別評価し、解決/復元のDB確定時にも期限を再検証する。workspaceInputs+authorToolDraftsの原子復元とキャッシュ失敗後のcold再開を保持する。詳細は実装ガイド参照。
