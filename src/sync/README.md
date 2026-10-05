# 同期プロトコルの実装範囲

`index.ts` はバックエンドに依存しない同期契約を公開する。現時点のアプリには同期接続先と認証設定がなく、端末内保存をクラウド同期済みとして扱わない。`syncCapability` に実環境での検証状況を記録している。

- `createSyncOperation` は確定サーバーrevisionと共通元・端末案から操作を作り、フィールドごとの旧値SHA-256を付ける。対象IDとprojectIdは変更できない。ローカル保存revisionは別の値として保持する。
- `threeWayMerge` は別フィールドだけを自動統合する。`data` の直下を別フィールドに分けるが、各RichText全体・配列・参照先は一つの値として比較する。同じフィールドの異なる変更、削除対編集、同じIDの異なる新規作成は共通元と二案を保持する。
- `createResolutionOperation` は保持した案を変更せず、選択または組合せを新しい操作にする。取得し直したサーバー案とrevisionを使い、対象の更新が進んでいた場合は再比較を求める。
- `SyncOutbox` は同じaccount/projectの送信を直列化し、operationId・内容hash・適用結果・確定revisionを検査する。ackと競合が端末へ原子保存できてから元操作を送信待ちから除く。通信断・保存失敗・認証失効・権限拒否は操作を残す。アカウントまたはセッション世代が変わった応答は確定しない。
- `AccountScopedSyncStore` は固定されたアカウント領域の永続APIを接続する。guest領域を同期用として扱わず、アカウントや作品を差し替えた操作・ackを拒否する。

共通元はサーバーで取得した確定snapshotである。ローカル編集を含む `CommandRecord.before` を、そのままサーバーの共通元にしてはならない。保存済みの依存する複数操作を送信操作へ変換する際は、確定snapshotに基づくまとめまたは因果関係を保つrebaseが必要になる。このアプリの既存保存outboxからprepared操作への自動変換・共同編集UI・添付bytes同期は未接続である。

`testing.ts` の `ContractSyncServer` と `MemorySyncOutboxStore` は契約試験専用である。メモリ上でサーバー側revision履歴、membership役割、private/team境界、冪等ack、一括適用・競合保持を検査する。JWT認証やRLSの実装・試験の代替にはならない。実アダプターにはサーバー側の型・参照・権限検査、ackとrevisionの原子確定、private添付の認可が必要である。

未実行: 実接続での二端末同期、JWT更新/失効、SELECT/INSERT/UPDATE/DELETEのRLS直接API試験、Storageのupload/download/update/delete・署名URL期限試験。接続先・DB・Supabase projectは作成していない。

契約試験: `npm test -- tests/sync.test.ts`。この試験の合格は、WP17・AT-E06・AT-N07の実運用受入完了を意味しない。

独立レビュー後の追加規則: 競合はackを保存して送信待ちから除いた後も、`listUnresolvedConflicts` の永続状態として送信を止める。新しいflushや送信クラスの再作成で解除しない。明示的解決は `createResolutionOperation` の `conflictOperationId` を `resolvesOperationId` に固定し、解決ackを原子保存してから解除する。原子操作の一対象が競合したときは、非競合対象も未適用なので元operationの**全targets**を保持する。解決で対象を一部省くことは拒否し、その他の未適用対象を `additionalTargets` で現在サーバー値へrebaseして全体を一操作で送る。旧案と旧ackは監査記録として保持する。

applied ackの変更済みレコードは、確認済みproject基底revisionより後のrevisionを持つ必要がある。HTTP成功や本文の一致だけでrevisionの進まない変更を確定扱いしない。
