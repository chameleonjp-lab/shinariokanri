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

## 補正後の製品と比較

計測製品は `6e03cd904089c5bce22cce88c58262ffdb1679ef` / tree `175357edb8d5783679fc9d90647527d84612c642` / clean build `658e90b133fea74dd9bf`。配布PRの後続変更は文書・固定証拠・その検査であり、この測定製品へ付け替えない。source/build/fixtureの完全な結合は [assessment](evidence/assessment.json) と [build-retention](evidence/build-retention.json)。64配信ファイルの実bytesを [archive](evidence/measured-builds.tar.gz) に保存し、9測定の全配信manifestと照合した。

| 元指標 | main Standard | 計測製品 Standard | main Large | 計測製品 Large |
| --- | ---: | ---: | ---: | ---: |
| 保存済み起動 p95 ms | 783.9 | 604.1 | 5310 | 4335.1 |
| 選択 p95 ms | 57.6 | 31.9 | 125.4 | 94.5 |
| 一覧切替 p95 ms | 39 | 33.8 | 56.2 | 53.9 |
| 複合検索 p95 ms | 38.5 | 48.7 | 377.5 | 356.2 |
| command保存 p95 ms | 221.7 | 185.8 | 4248.3 | 3592.6 |
| 次期間 p95 ms | 15 | 14.9 | 64.5 | 92.8 |
| 年表frame p95 ms | 16.7 | 16.7 | 66.7 | 66.7 |
| 関係図frame p95 ms | 16.7 | 16.8 | 33.3 | 33.3 |

表示だけを丸めた。合否は全raw/nearest-rankの丸めない値で独立再計算し、Standard8上限・Large2上限を保持した。Large残6指標に上限を追加していない。両runとも全30/330値を残す。各sizeの前後fixture SHAは一致。計測OFFで元数値条件を通ったが、本PRは性能最適化を実装していない。実行順やOS/JIT/cache/負荷等の揺れを統制した性能改善の因果証明ではなく、値の差を改善率として採用しない。

## 原因の切り分け

元のOFF保存30回のstage生値から、各stageの合計/total合計を計算した。p95同士を加算した値ではない。main Largeではhash区間 **33.14%**、database区間 **25.19%**、read **12.95%**、validate **12.64%**、diff **10.82%**。それぞれmedianは922.55/744.8/404.15/390.95/344.9ms。databaseには `writeContent` の比較、header/parts準備・Worker・native取引が含まれ、純粋なIDB待機だけとは断定しない。これが現行Large保存の主要な区間というOBSであり、各内部要因の改善後の純効果はHYPのまま。

補正後ON診断は、速度と別に次の仕事量を確認した。

| 追加入力/操作 | 実観測 | 因果として確定した構造と省けない条件 |
| --- | --- | --- |
| 作品1/10/50、各10記録 | entity取得6/60/300、block3/30/150、commands0。保持10/100/500記録、close後0。診断時間9/56.4/677.8ms | 非選択の現在内容も増える。履歴省略は効いている。header化して本文を省く余地はあるが、draft/権限/選択後の完全性を省かない |
| 履歴100/1000/10000、各3page | 表示は最大30でもcommands取得100/1000/10000。10000件の3診断は535.4/579/727.3ms | O(N)の本文取得が確定。before/after全展開が主因という主張ではない。画面外missing rowを見つける元検査を単純sliceで消せない |
| Largeの人物名1件 | hash3回/59,407,554実bytes。normalize前後配列312,012行、targetChanges/contentDelta/writeContent各176,006行。committed entity1/command1/outbox1 | 少量書込でも全体request hashと配列比較が残る。再送識別のhash契約を削らず、同じ差分を複数生成する処理を比較対象にする |
| Largeの台詞1件 | hash2回/59,407,825実bytes。上と同じ走査対象行数。committed entity1/block1/command1/outbox1 | 本文blockと参照anchorの整合を保つ。作品header・syncMetadata・recordPartsの確定は別counterに残す |
| 連続する2つのparticipant検索 | 各sizeでquery.index.builds=2 | 同compile内共有は実装済みだが、次compileへ共有されない。版/世界/role/schema依存を欠くglobal cacheは不可 |
| calendar参照候補 | source entity全体を準備 | scope前の共通処理が確定。返すcalendarのID/label/orderとpin不在拒否は維持 |
| 製品Appの追加UI診断 | 起動→入力可242ms、入力→保存済み表示787.5ms | 小fixtureの補助1回。30回p95やLarge UI応答に読み替えない |

ONのpayload graph走査には大きな観測コストがある。小fixtureの10対AB/BA校正はOFF median2.35ms、ON3.45ms。Largeではsize計測自身の累積が約10秒となり、ONの時間を原因寄与や元性能合否に使うことはできない。全体からsize時間を単純に引くこともしない。時間の寄与には上記OFFの既存stage、仕事量にはONのcounterを用いた。通常動作はOFFのまま。軽いcounter専用captureを追加する場合も、別の測定器版と校正が必要である。

初回はnative completeの観測欠落と、capture-phase listenerだけでは補正できない失敗を確認した。さらに途中の候補Large30試行を再buildと重ねたため、その試行は中断・不採用とした。[preliminary/status](evidence/preliminary/status.json) と当時のrawを削除せず保存し、最終6e03cd9を固定した直列runのみを上の比較に採用した。

## 追加計測の意味

`startProbe()` の明示呼出しから `stop()` までのみ、数値counterと固定phase名のeventを保持する。既定OFF、メモリ内限定、10000 event上限とdrop件数付き。任意の文字列次元/本文/ID/account/認証/エラーメッセージは受付けず、getter・toJSONを呼ばない。追加probeは既存のuser診断・performance.measureの保存契約とは独立。

| 指標 | 定義・誤読しない点 |
| --- | --- |
| store/phase時間 | 公開store呼出し開始→resolve/reject。saveのprepare/read/hash/reconcile/validate/diff/databaseは既存区間。親子spanはinclusiveで足し合わせない。失敗をerrorで残す |
| UI | 隔離harnessが製品Appを描画し、実cardから入力欄を開き可視/有効/編集可とfocus/2frameを確認。保存は入力開始→`editor-save-state`の保存済み表示。内部command時間と500ms待ち/React描画を分離する |
| DB read | record-partsより下のDBCore get/getMany/queryの返却row、要求key数、keyだけの返却を別集計。parts内部要求も含む。物理disk readや直IDB keep-aliveは含まない。cursor専用経路の完全行数はUNKNOWN |
| DB write | attempted/succeededとnative transaction complete後committedを区別。abort後はaborted。deleteRangeはcall数であり行数UNKNOWN。native完了listenerより公開Promiseの続行が先になる実ブラウザー条件を確認。研究側だけ `await capture.settle()` で観測を封印し、未完了snapshotはpendingTransactionsを明示。製品transactionに待機を追加しない |
| payload bytes | UTF-8のscalar/key＋binary byte数、同じobjectは一回。構造化clone/disk/wire/JS heapの実bytesではない。accessor/unsupported/200万object超過はUNKNOWN counter。計測自身のsize時間を別記 |
| hash/encode | `jsonBytes` 出力bytesと `sha256` 入力bytesは実byte数。計算結果digestや内容は記録しない。Worker内部は別のJS realmでOFFのままなので内部hash/検証回数はUNKNOWN |
| 走査/検証 | normalize/targetChanges/contentDelta/writeContentに渡す前後配列の行数。レコードschemaの全走査回数そのものではない。current/full/integrityは各実装入口の回数。失敗/再利用を混同しない |
| 索引 | catalogのindex build回数/対象行数、text抽出行数、参照候補のsource行数、UI逆引きとMap/filterの対象行数 |
| Worker | 親側の開始/terminate、送受message数/payload推定、boundary時間。コピーとtransferのwire内部実量、Worker内部CPU/heapはUNKNOWN |
| 保持/破棄 | store cacheのproject/record数とpayload推定。close後0を記録。GC・全アプリretained heap・メモリ漏れなしの証明ではない。Chromium `performance.memory` は同process内推定、他engineではUNKNOWN |

ONは追加のgraph走査を行うためOFFより遅くなり得る。校正は小fixtureの同一変更をfresh DBで10対、AB/BA順に実行する。原30回ではなく、LargeのON影響をその小入力から外挿しない。性能比較/合否はOFF、原因の仕事量はONを使い分ける。counter/spanの一致だけで正確性を認定せず、保存全値・履歴・outbox・archive・独立期待値の検査を併用する。

## 未実行・UNKNOWN

原180保存と実7200秒・113履歴/実72MiBの全量new/clone/cold最終受入は今回再実行しない。第1段階は原因/設計の計測であり、統合済み最終候補で第3段階に実行する指定に従う。元の成功/失敗/原本はHISTとして保持する。実端末、実OS Files/IME/支援機能、専用実Auth/DataAPI/Storage、対象ゲーム、独立レビュー、実費用は [外部待ち](EXTERNAL.md) に残す。
