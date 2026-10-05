# RB01 / RG-R06 保存改善の局所検証

2026-10-05、Linux x86_64 / headless Chromium 151 / 実IndexedDBで計測した。Viteのproduction bundle、target es2022でdomain/storeを単独起動した。アプリ画面の入力・描画を含まず、store呼出しから端末内トランザクションcommitまでを測る。対象コードは[修正後の測定記録](storage-after.json)のsourceHashesで固定する。

Standardはseed `standard-r06-v1`、entity 6,800件・relation 2,000件、合計8,800件。fixture SHA-256は `de0b9420abec95bcc37fc7fb7c3dc4c2667082258678f750af33bb53f8a557f5`。本文・要約・人物メモ・条件・期間を含む。添付bytesは0であり、素材込みの性能は測定していない。

| 操作 | 改善前の一観測 | 改善後30回のp95 | 改善後の最大値 | 毎回の本文等の書込 |
| --- | ---: | ---: | ---: | --- |
| 作品名一項目 | 35,703.3 ms | 714.2 ms | 732.9 ms | entity / relation / blockすべて0件 |
| 一台詞の本文 | 51,247.2 ms | 577.5 ms | 825.4 ms | entity 1件、block 1件 |
| 作品名・一台詞・一関係の複合変更 | 未計測 | 573.1 ms | 673.4 ms | entity 1件、block 1件、relation 1件 |

改善前は各操作でentity 6,800件・relation 2,000件・block 7,300件を再保存した。改善後は上表の変更行に加え、作品header・command・outbox・同期metadataを同じトランザクションで更新する。90回の通常編集では全履歴のDB読込が0件。64操作ごとの履歴復元点を含む結果である。初回作成は多数の情報を保存するため、上表の少量編集とは別の試料として記録した。

改善前の二つの保存観測は[改善前の測定記録](storage-before.json)に区間値とともに残した。一回ずつの観測からp95を算出していない。これはPR2レビューに記録されたChromium 153の二観測とは別の、今回の再測定である。

## 実装と回帰検査

- 変更したentity・relation・block・view・snapshotのみを書き込み、不変の行を削除・再挿入しない。
- 履歴は内部で元の操作ID・差分・64操作ごとの復元点として保持する。外部のCommandRecordと完全保存ファイルでは従来のbefore/afterへ復元する。v1の全情報を持つ既存行・既存outboxも読める。
- 編集用の読込は現在の情報だけを取得し、履歴は開いた時・取消・復元・完全保存時に読み込む。編集用履歴の参照は端末内の不変tokenで保持する。通常のgetProject/listHistoryは全履歴を返す。
- 検証済みの同一レコードの構造と参照一覧を再利用する。参照先の存在・種類・名前空間・キーの一意性・循環・日時制約は検査し、変更した対象の依存先の値・本文範囲も再検査する。checkpoint/traceの提示証跡は新規IDを含む集合に依存するため常に再検査する。
- 読込・専用ファイルの取込・移行・完全保存では、履歴と不変版を含む全検査を維持する。保存時には新しい不変版を検査し、既存版の改変・重複IDを拒否する。

[差分保存・復元の回帰検査](../../../src/storage/performance.test.ts)は、実書込件数、遅延履歴、67操作後の再起動・旧版・undo、古い形式の行と冪等再送、改竄履歴・古い編集、依存値・新規開示集合、単体本文復元時のUnicode位置・固定版・relation位置、完全保存の空領域復元を確認する。従来の[保存・障害注入試験](../../../src/storage/storage.test.ts)も通過した。storageの両ファイルは合計54件、runtimeを加えた局所実行は89件が合格した。

## 再実行と未完了の測定

```sh
node scripts/measure-storage.mjs --samples 30 --size standard --output artifacts/storage-performance.json
```

[測定script](../../../scripts/measure-storage.mjs)はproduction bundleを一時領域に作り、ローカルHTTPでChromiumへ渡し、fixture hash・環境・ソースhash・区間時間・書込数を記録する。必要なら`CHROMIUM_PATH`で実行ファイルを選び、`--size large`でLargeを測れる。生成した作品領域は測定後に削除する。

この証拠で指定実端末の最終受入を合格にしていない。iPhone/iPad/PCの実機30回p95、アプリ画面の入力開始から保存成功通知まで、添付付きStandard/Large、2時間編集、全情報・素材の復元訓練はRB06/RB10で引き続き確認する。大量の全履歴を明示的に開く・完全保存する処理の取消や進捗、端末喪失時の復帰も最終受入へ残す。
