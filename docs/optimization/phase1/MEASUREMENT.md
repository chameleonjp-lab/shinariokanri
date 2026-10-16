# 測定定義と基準値

## 元の測定と今回の測定

元正式結果は製品 `1fcadcca703863873a57d297e83b1b184e63e778` / build `8ec3a03810bb0cf1b1b4`。Largeの起動p95 5731.5ms、検索562.8000000044703ms、保存5224.1ms、年表frame100ms、関係図frame50msは **HIST**。元Standard30/Large30・180保存の全生値/区間は [local-formal-summary](../../quality/pr49-followup-2026-10-15/evidence/local-formal-summary.json) に保持し、本PRの実測へ付け替えない。

今回の対照は最新main `f40d07a` のclean checkout/build `eb099b284f47630dee25`。既存 `scripts/measure-app.mjs` を変更せず、元seed `standard-r06-v1` / `large-material-rb10-v1`、Standard 8,800記録、Large 88,003記録/実75,497,472素材bytesで全8指標×各30回を実行した。fixture構築と初期保存を測定区間から除外する。年表/図は元30gestureから各330frame、p95はnearest-rank `sorted[ceil(n*.95)-1]`。失敗/timeoutを成功分布から黙って除外しない。

| 指標 | main Standard p95 ms | main Large p95 ms | 元規範 |
| --- | ---: | ---: | --- |
| 保存済み起動→実際の編集可能確認 | 783.8999999999069 | 5310 | Standard≤3000 / Large≤10000 |
| 選択 | 57.60000000009313 | 125.4000000001397 | Standard≤200 / Large専用上限なし |
| 一覧切替 | 39 | 56.199999999953434 | Standard≤200 / Large専用上限なし |
| 複合検索 | 38.5 | 377.5 | Standard≤500 / Large≤2000 |
| command保存 | 221.70000000018626 | 4248.300000000047 | Standard≤1000 / Large専用上限なし |
| 次期間 | 15 | 64.5 | Standard≤200 / Large専用上限なし |
| 年表frame | 16.700000000004366 | 66.70000000001164 | Standard≤33.4 / Large専用上限なし |
| 関係図frame | 16.700000000004366 | 33.30000000001746 | Standard≤33.4 / Large専用上限なし |

この表と元HISTとの差は環境・build等が異なり、最適化の因果的効果ではない。実機性能・原AT-N04/R06の合格でもない。新しいprobe付き製品の同じOFF測定・ON区間診断・校正は生証拠に別identityで保持する。

## 追加計測の意味

`startProbe()` の明示呼出しから `stop()` までのみ、数値counterと固定phase名のeventを保持する。既定OFF、メモリ内限定、10000 event上限とdrop件数付き。任意の文字列次元/本文/ID/account/認証/エラーメッセージは受付けず、getter・toJSONを呼ばない。追加probeは既存のuser診断・performance.measureの保存契約とは独立。

| 指標 | 定義・誤読しない点 |
| --- | --- |
| store/phase時間 | 公開store呼出し開始→resolve/reject。saveのprepare/read/hash/reconcile/validate/diff/databaseは既存区間。親子spanはinclusiveで足し合わせない。失敗をerrorで残す |
| UI | 隔離harnessが製品Appを描画し、実cardから入力欄を開き可視/有効/編集可とfocus/2frameを確認。保存は入力開始→`editor-save-state`の保存済み表示。内部command時間と500ms待ち/React描画を分離する |
| DB read | record-partsより下のDBCore get/getMany/queryの返却row、要求key数、keyだけの返却を別集計。parts内部要求も含む。物理disk readや直IDB keep-aliveは含まない。cursor専用経路の完全行数はUNKNOWN |
| DB write | attempted/succeededとnative transaction complete後committedを区別。abort後はaborted。deleteRangeはcall数であり行数UNKNOWN。失敗時の直後snapshotよりnative abortが遅い場合は完了を待つ |
| payload bytes | UTF-8のscalar/key＋binary byte数、同じobjectは一回。構造化clone/disk/wire/JS heapの実bytesではない。accessor/unsupported/200万object超過はUNKNOWN counter。計測自身のsize時間を別記 |
| hash/encode | `jsonBytes` 出力bytesと `sha256` 入力bytesは実byte数。計算結果digestや内容は記録しない。Worker内部は別のJS realmでOFFのままなので内部hash/検証回数はUNKNOWN |
| 走査/検証 | normalize/targetChanges/contentDelta/writeContentに渡す前後配列の行数。レコードschemaの全走査回数そのものではない。current/full/integrityは各実装入口の回数。失敗/再利用を混同しない |
| 索引 | catalogのindex build回数/対象行数、text抽出行数、参照候補のsource行数、UI逆引きとMap/filterの対象行数 |
| Worker | 親側の開始/terminate、送受message数/payload推定、boundary時間。コピーとtransferのwire内部実量、Worker内部CPU/heapはUNKNOWN |
| 保持/破棄 | store cacheのproject/record数とpayload推定。close後0を記録。GC・全アプリretained heap・メモリ漏れなしの証明ではない。Chromium `performance.memory` は同process内推定、他engineではUNKNOWN |

ONは追加のgraph走査を行うためOFFより遅くなり得る。校正は小fixtureの同一変更をfresh DBで10対、AB/BA順に実行する。原30回ではなく、LargeのON影響をその小入力から外挿しない。性能比較/合否はOFF、原因の仕事量はONを使い分ける。counter/spanの一致だけで正確性を認定せず、保存全値・履歴・outbox・archive・独立期待値の検査を併用する。

## 未実行・UNKNOWN

原180保存と実7200秒・113履歴/実72MiBの全量new/clone/cold最終受入は今回再実行しない。第1段階は原因/設計の計測であり、統合済み最終候補で第3段階に実行する指定に従う。元の成功/失敗/原本はHISTとして保持する。実端末、実OS Files/IME/支援機能、専用実Auth/DataAPI/Storage、対象ゲーム、独立レビュー、実費用は [外部待ち](EXTERNAL.md) に残す。
