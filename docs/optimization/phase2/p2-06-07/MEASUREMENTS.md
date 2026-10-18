# 補助計測の定義と全比較

**正式第3段階受入ではない。RELEASE BLOCKED。** 下の表は丸めた表示であり、全精度の値・cold/最大値・全sample・numeric probeは `evidence/ui/*/measurements.json` に保持する。独立checkerが元rawからnearest-rank p95を再計算する。過去計測を今回の新規成功に書き換えない。

## 同一条件と限界

- `measure-derived-ui.mjs` と実App用HTML/TSXの3 overlay bytesは全7 label/2 suiteで同一。各clean literal sourceのsrc・runtime・原package/lockから実Vite buildを作り、ZIPと全member SHAを保存した。元App/ScenarioStoreProviderをnative Chromium IndexedDBで動かし、loopbackのみ許可、service workerをblock、unexpectedRequestsは全件空。
- Standardはseed `standard-r06-v1`、8,800 records/6,800 entities、原JSON 6,258,972 bytes。Largeは `large-material-rb10-v1`、88,003 records/68,003 entities、原wire JSON 59,407,368 bytes、3個×25,165,824 bytes＝実72MiB。元fixtureのcanonical SHAとwire SHA、各assetの実native読出bytes/SHAを照合した。
- seed用の`new Date()`だけを計測前に固定し、Date.nowと元constructorをrestoreしてから全区間を測定。操作IDを固定。OFF/ONで同一normalized saved currentとreadonly後hash、同じ期待ID順序を確認。DBのseedやbundle取得、Authは起動区間に含まない。
- OFFで `霧→霧の→門番→記録→霧→霧の` を30回連続、180 query actions。各列30値でp95は昇順29番目。input captureから期待UIの2 animation frameまでを測る。assert/hash/checkpointはclock外。ONは別contextを同じseedで作り、numeric diagnosticsだけを採る。ONのphase millisecondsはOFF latencyではない。
- navigationは30回×前page/選択pageの計60 actions。setupの固定400ms待機はasync reference準備完了の確認ではない。background作業を含み得る実UIの観察であり、隔離したpage API性能とは呼ばない。UIはcount/先頭3 names/pagerを照合し、別の機能proofで全filter/provider.ids/全page連結を独立SHAへ照合する。
- startup、一覧summary、編集load、historyPage、rename-oneは各OFF **1観測**。coreRead各操作とApp mountはそれぞれfreshなScenarioStoreを作り、store内cacheを共有しない。一方、同じseed済みdatabase/contextでstartup前にsummary/load/historyを読んでおり、IDB/browser側がwarmである可能性を含む。bundle/Authを含むcold起動やnew/clone/cold復元の条件ではない。正式30回p95ではない。participant predicateだけはpure API30回。元の重い保存/履歴/復元比較はP2-01〜05のliteral-source証拠を引き継ぎ、今回の正式再受入と呼ばない。
- 同じhostで重いcaptureを直列実行。source cohort全体の順番はランダム化していない。専用host・noise除去・統計的有意差は保証しない。最初のmain Largeのsetup/diagnostics中に短い回帰検査を1回実行した事実も残す。
- CDP `JSHeapUsedSize` はGC強制なしの4地点。peak/全プロセス/native/worker/physical memoryではない。close後にlogical cacheが0でもcaller-held viewや未回収heapは残り得る。heapの正式合格や端末最適性はUNKNOWN。
- 600000msはharnessのstartup/Playwright UI locator scopeに適用。page.evaluateで呼ぶAPIに独立outer watchdogは追加していない。終了したAPI行はfulfilledとして保存するが、原完全保存の600000ms受入を再現したとはしない。原受入のtimeout/retry/skipは変更していない。

## コホートの意味

| label | literal commit | 内容 |
| --- | --- | --- |
| main | a13d8fa | 実統合済みmain。新derived owner/provider未対応はnull/unsupported |
| p206 | b6e2120 | 正式参照葉修正とP2-06単独、旧4Mi text/500k references |
| prior | 0c378f5 | 後続guard修正前のB UI試作。最終案ではない |
| full-b | 6df6461 | guard修正済みB UI、旧4Mi/500k |
| full-b-budget8 | 6df6461 | 同B source、明示8Mi text/500k references |
| selected | 886d0c0 | B UIを棄却し元array UI、descriptor＋P2-06、既定8Mi text/750k references |
| budget4 | 886d0c0 | 同じ最終source、明示4Mi text/750k references。最終上限選択の比較対象 |

ディレクトリ名 `selected-*-01` は過去の全B試作（manifest label `full-b`）、最終採用は `adopted-*-01`（label `selected`）。名前でソース同一性を推測せずmanifest/commitを参照する。

## 原因の切り分け

全B/4MiのLargeは最初に68,003 text rowsを処理し、35,240個をadmit、32,763個をrejectしていた。warm queryもrejectされた32,763行を処理する。全B/8Miでは全文5,857,303 code unitsが入る。文字数の上限とoptional reverse-reference indexは独立条件であり、4Miの総referencesが8Miより多いこともある。総reference値を本文だけの保持費用と読まない。

既存Unicode trace WeakMapはwarmにhitする。Largeの全B例ではcold positions 67,000 rows/73,000 blocks、traceBuilds 73,000、matches 205,000。次queryはtraceBuilds 0/traceHits 73,000でmatches 205,000が残る。全match位置の走査とallocationはpage60にしてもなくならない。Bの全rows再取得・ordinal保持の追加費用も残り、StandardのP2-06単独より不利な値から製品UI採用を棄却した。

新しい数値probeが存在しないbaselineのcounterは**未対応**であり0 workとは扱わない。定義が異なるcold/ON/API/実UI/Nodeを混ぜて改善率を作らない。

<!-- GENERATED_TABLES -->

## OFF：連続検索とnavigation/predicate

単位ms。query列は同じ6 actionの各30値、navigationは60値、participantは30値のp95。

| suite/label | 霧(1) | 霧の(2) | 門番 | 記録 | 霧(5) | 霧の(6) | navigation | participant |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| [standard/main](evidence/ui/main-standard-01/measurements.json) | 103.4 | 87.7 | 63.0 | 104.9 | 81.5 | 82.5 | 30.5 | 1.1 |
| [standard/p206](evidence/ui/p206-standard-01/measurements.json) | 41.1 | 41.3 | 31.1 | 71.9 | 42.0 | 40.5 | 30.7 | 3.9 |
| [standard/prior](evidence/ui/candidate-standard-01/measurements.json) | 51.4 | 49.7 | 36.3 | 82.6 | 60.1 | 50.0 | 30.8 | 3.4 |
| [standard/full-b](evidence/ui/selected-standard-01/measurements.json) | 57.6 | 56.2 | 32.0 | 80.7 | 53.6 | 52.1 | 30.8 | 3.3 |
| [standard/full-b-budget8](evidence/ui/budget8-standard-01/measurements.json) | 94.9 | 56.1 | 32.0 | 80.4 | 58.5 | 54.7 | 30.8 | 3.2 |
| [standard/selected](evidence/ui/adopted-standard-01/measurements.json) | 57.2 | 39.5 | 30.8 | 69.5 | 41.2 | 39.2 | 30.6 | 3.6 |
| [standard/budget4](evidence/ui/budget4-standard-01/measurements.json) | 40.3 | 39.1 | 32.3 | 76.7 | 43.8 | 36.4 | 30.7 | 3.6 |
| [large/main](evidence/ui/main-large-01/measurements.json) | 1016.6 | 847.9 | 517.5 | 774.9 | 814.1 | 793.5 | 34.5 | 12.1 |
| [large/p206](evidence/ui/p206-large-01/measurements.json) | 862.6 | 881.0 | 516.5 | 626.5 | 619.3 | 747.1 | 30.6 | 5.9 |
| [large/prior](evidence/ui/candidate-large-01/measurements.json) | 860.0 | 741.3 | 418.9 | 657.6 | 703.1 | 747.6 | 30.7 | 6.8 |
| [large/full-b](evidence/ui/selected-large-01/measurements.json) | 740.4 | 635.5 | 438.8 | 624.8 | 719.3 | 886.7 | 30.8 | 5.8 |
| [large/full-b-budget8](evidence/ui/budget8-large-01/measurements.json) | 362.1 | 301.6 | 92.0 | 308.8 | 405.7 | 432.5 | 30.6 | 8.4 |
| [large/selected](evidence/ui/adopted-large-01/measurements.json) | 398.8 | 293.4 | 83.0 | 270.1 | 318.0 | 289.7 | 30.7 | 8.2 |
| [large/budget4](evidence/ui/budget4-large-01/measurements.json) | 769.2 | 715.0 | 425.7 | 593.5 | 599.9 | 713.1 | 30.7 | 5.9 |

## coldと公開APIの1観測

単位ms。各値は1回でありp95ではない。初回queryは上の30値にも含む。renameは別の入力で繰返した180-save分布ではない。

| suite/label | startup | cold query | summary | loadEditor | historyPage | rename-one |
| --- | --- | --- | --- | --- | --- | --- |
| [standard/main](evidence/ui/main-standard-01/measurements.json) | 663.7 | 478.6 | 6.5 | 453.2 | 9.7 | 550.4 |
| [standard/p206](evidence/ui/p206-standard-01/measurements.json) | 671.0 | 637.6 | 7.3 | 481.1 | 16.0 | 534.1 |
| [standard/prior](evidence/ui/candidate-standard-01/measurements.json) | 859.6 | 577.6 | 6.7 | 456.5 | 10.4 | 604.5 |
| [standard/full-b](evidence/ui/selected-standard-01/measurements.json) | 767.7 | 539.9 | 6.8 | 432.9 | 11.6 | 529.6 |
| [standard/full-b-budget8](evidence/ui/budget8-standard-01/measurements.json) | 779.0 | 547.2 | 6.4 | 434.8 | 10.4 | 493.1 |
| [standard/selected](evidence/ui/adopted-standard-01/measurements.json) | 670.8 | 600.8 | 6.4 | 457.9 | 10.2 | 546.2 |
| [standard/budget4](evidence/ui/budget4-standard-01/measurements.json) | 630.8 | 602.1 | 6.4 | 431.7 | 25.5 | 539.3 |
| [large/main](evidence/ui/main-large-01/measurements.json) | 4429.4 | 4481.9 | 8.9 | 4148.6 | 5715.8 | 6447.4 |
| [large/p206](evidence/ui/p206-large-01/measurements.json) | 4356.2 | 5738.3 | 3.6 | 4602.9 | 5829.6 | 6297.5 |
| [large/prior](evidence/ui/candidate-large-01/measurements.json) | 4996.8 | 5281.7 | 12.1 | 4267.8 | 5819.5 | 6346.9 |
| [large/full-b](evidence/ui/selected-large-01/measurements.json) | 5386.7 | 4970.4 | 4.0 | 4528.7 | 5876.8 | 6045.4 |
| [large/full-b-budget8](evidence/ui/budget8-large-01/measurements.json) | 5125.3 | 5270.1 | 11.5 | 4574.1 | 6193.1 | 6382.6 |
| [large/selected](evidence/ui/adopted-large-01/measurements.json) | 4371.8 | 5844.0 | 11.0 | 4251.8 | 6016.5 | 6819.7 |
| [large/budget4](evidence/ui/budget4-large-01/measurements.json) | 4170.3 | 5689.7 | 17.1 | 4497.2 | 5867.9 | 6465.4 |

## 論理保持量と実heap観測

retention欄は`afterParticipant`（owners/entries/references/textCodeUnits）。`afterQueries`はharnessがnavigation後のverifyで上書きするため、query直後だけの保持値とは呼ばない。全supported cohortでafterCloseは全項目0。baselineの未対応はUNKNOWN。heapはOFFの各地点のJSHeapUsedSizeをMiB表示、GC強制なし。

| suite/label | logical retention | heap startup | heap queries | heap navigation | heap close |
| --- | --- | --- | --- | --- | --- |
| [standard/main](evidence/ui/main-standard-01/measurements.json) | UNKNOWN | 33.4 | 50.5 | 48.0 | 49.2 |
| [standard/p206](evidence/ui/p206-standard-01/measurements.json) | 1 / 6802 / 56614 / 579891 | 27.7 | 106.3 | 64.0 | 58.6 |
| [standard/prior](evidence/ui/candidate-standard-01/measurements.json) | 1 / 6803 / 56614 / 579891 | 33.1 | 65.0 | 90.2 | 57.4 |
| [standard/full-b](evidence/ui/selected-standard-01/measurements.json) | 1 / 6803 / 56614 / 579891 | 30.7 | 50.0 | 54.5 | 74.3 |
| [standard/full-b-budget8](evidence/ui/budget8-standard-01/measurements.json) | 1 / 6803 / 56614 / 579891 | 20.3 | 89.2 | 51.2 | 63.0 |
| [standard/selected](evidence/ui/adopted-standard-01/measurements.json) | 1 / 6802 / 56614 / 579891 | 33.4 | 107.4 | 57.7 | 74.0 |
| [standard/budget4](evidence/ui/budget4-standard-01/measurements.json) | 1 / 6802 / 56614 / 579891 | 36.6 | 107.3 | 49.6 | 74.0 |
| [large/main](evidence/ui/main-large-01/measurements.json) | UNKNOWN | 153.3 | 841.5 | 515.7 | 205.6 |
| [large/p206](evidence/ui/p206-large-01/measurements.json) | 1 / 35242 / 484442 / 4194300 | 147.6 | 397.5 | 344.7 | 229.6 |
| [large/prior](evidence/ui/candidate-large-01/measurements.json) | 1 / 35243 / 484442 / 4194300 | 217.2 | 774.8 | 663.9 | 460.1 |
| [large/full-b](evidence/ui/selected-large-01/measurements.json) | 1 / 35243 / 484442 / 4194300 | 937.6 | 358.5 | 351.9 | 245.9 |
| [large/full-b-budget8](evidence/ui/budget8-large-01/measurements.json) | 1 / 68005 / 390536 / 5857303 | 215.0 | 579.5 | 323.3 | 219.9 |
| [large/selected](evidence/ui/adopted-large-01/measurements.json) | 1 / 68005 / 553614 / 5857303 | 152.1 | 842.5 | 631.3 | 362.7 |
| [large/budget4](evidence/ui/budget4-large-01/measurements.json) | 1 / 35242 / 484442 / 4194300 | 167.2 | 337.1 | 326.6 | 229.5 |

## ON：cold/warm queryの仕事量

各counterは別contextの診断。`—`は該当counterが未対応またはそのactionで未出力であり、仕事量0の証明ではない。全raw probeをJSONに残す。

| suite/label | action | query.filter.rows | query.text.rows | derived.admitted | derived.rejected | derived.hit | query.positions.traceBuilds | query.positions.traceHits | query.positions.matches | collection.page.rows |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| [standard/main](evidence/ui/main-standard-01/measurements.json) | 0 | 6800 | 6800 | — | — | — | — | — | — | — |
| [standard/main](evidence/ui/main-standard-01/measurements.json) | 1 | 6800 | 6800 | — | — | — | — | — | — | — |
| [standard/p206](evidence/ui/p206-standard-01/measurements.json) | 0 | 6800 | 6800 | 6800 | — | — | — | — | — | — |
| [standard/p206](evidence/ui/p206-standard-01/measurements.json) | 1 | 6800 | — | — | — | 6800 | — | — | — | — |
| [standard/prior](evidence/ui/candidate-standard-01/measurements.json) | 0 | 6800 | 6800 | 6800 | — | 7 | — | — | — | 6942 |
| [standard/prior](evidence/ui/candidate-standard-01/measurements.json) | 1 | 6800 | — | — | — | 6807 | — | — | — | 6942 |
| [standard/full-b](evidence/ui/selected-standard-01/measurements.json) | 0 | 6800 | 6800 | 6800 | — | 7 | 7300 | 0 | 20500 | 6942 |
| [standard/full-b](evidence/ui/selected-standard-01/measurements.json) | 1 | 6800 | — | — | — | 6807 | 0 | 7300 | 20500 | 6942 |
| [standard/full-b-budget8](evidence/ui/budget8-standard-01/measurements.json) | 0 | 6800 | 6800 | 6800 | — | 7 | 7300 | 0 | 20500 | 6942 |
| [standard/full-b-budget8](evidence/ui/budget8-standard-01/measurements.json) | 1 | 6800 | — | — | — | 6807 | 0 | 7300 | 20500 | 6942 |
| [standard/selected](evidence/ui/adopted-standard-01/measurements.json) | 0 | 6800 | 6800 | 6800 | — | — | 7300 | 0 | 20500 | — |
| [standard/selected](evidence/ui/adopted-standard-01/measurements.json) | 1 | 6800 | — | — | — | 6800 | 0 | 7300 | 20500 | — |
| [standard/budget4](evidence/ui/budget4-standard-01/measurements.json) | 0 | 6800 | 6800 | 6800 | — | — | 7300 | 0 | 20500 | — |
| [standard/budget4](evidence/ui/budget4-standard-01/measurements.json) | 1 | 6800 | — | — | — | 6800 | 0 | 7300 | 20500 | — |
| [large/main](evidence/ui/main-large-01/measurements.json) | 0 | 68003 | 68003 | — | — | — | — | — | — | — |
| [large/main](evidence/ui/main-large-01/measurements.json) | 1 | 68003 | 68003 | — | — | — | — | — | — | — |
| [large/p206](evidence/ui/p206-large-01/measurements.json) | 0 | 68003 | 68003 | 35240 | 32763 | — | — | — | — | — |
| [large/p206](evidence/ui/p206-large-01/measurements.json) | 1 | 68003 | 32763 | — | 32763 | 35240 | — | — | — | — |
| [large/prior](evidence/ui/candidate-large-01/measurements.json) | 0 | 68003 | 68003 | 35240 | 32763 | 7 | — | — | — | 67242 |
| [large/prior](evidence/ui/candidate-large-01/measurements.json) | 1 | 68003 | 32763 | — | 32763 | 35247 | — | — | — | 67242 |
| [large/full-b](evidence/ui/selected-large-01/measurements.json) | 0 | 68003 | 68003 | 35240 | 32763 | 7 | 73000 | 0 | 205000 | 67242 |
| [large/full-b](evidence/ui/selected-large-01/measurements.json) | 1 | 68003 | 32763 | — | 32763 | 35247 | 0 | 73000 | 205000 | 67242 |
| [large/full-b-budget8](evidence/ui/budget8-large-01/measurements.json) | 0 | 68003 | 68003 | 68003 | — | 7 | 73000 | 0 | 205000 | 67242 |
| [large/full-b-budget8](evidence/ui/budget8-large-01/measurements.json) | 1 | 68003 | — | — | — | 68010 | 0 | 73000 | 205000 | 67242 |
| [large/selected](evidence/ui/adopted-large-01/measurements.json) | 0 | 68003 | 68003 | 68003 | — | — | 73000 | 0 | 205000 | — |
| [large/selected](evidence/ui/adopted-large-01/measurements.json) | 1 | 68003 | — | — | — | 68003 | 0 | 73000 | 205000 | — |
| [large/budget4](evidence/ui/budget4-large-01/measurements.json) | 0 | 68003 | 68003 | 35240 | 32763 | — | 73000 | 0 | 205000 | — |
| [large/budget4](evidence/ui/budget4-large-01/measurements.json) | 1 | 68003 | 32763 | — | 32763 | 35240 | 0 | 73000 | 205000 | — |

## Node：array/A/Bの独立した取得比較

各source/suiteで30反復×3 mode、mode順をrotateし、毎回新しいsynthetic ownerを作る。empty queryのprepareとtail position/page/hidden selectedの1同期readを分ける。native storeの所有証明・DB・実UIの速度ではない。全順序digest/assertはclock外。pageはStandard末尾20行、Large末尾23行、selectedはpage外1行。選択対象も実UIの末尾dialogueとは異なり、Largeでは最後のattachment。

| suite/source | mode | prepare p95 ms | read p95 ms | full rows | ordinals | page rows |
| --- | --- | --- | --- | --- | --- | --- |
| [standard/full-b](evidence/designs/designs-standard-01/measurements.json) | full-array | 0.4356 | 0.1993 | 6800 | 0 | 20 |
| [standard/full-b](evidence/designs/designs-standard-01/measurements.json) | ordinal-A | 1.2889 | 0.0212 | 6800 | 6800 | 20 |
| [standard/full-b](evidence/designs/designs-standard-01/measurements.json) | provider-B | 6.4708 | 5.7649 | 0 | 6800 | 20 |
| [large/full-b](evidence/designs/designs-large-01/measurements.json) | full-array | 10.5242 | 5.7791 | 68003 | 0 | 23 |
| [large/full-b](evidence/designs/designs-large-01/measurements.json) | ordinal-A | 29.0883 | 0.0423 | 68003 | 68003 | 23 |
| [large/full-b](evidence/designs/designs-large-01/measurements.json) | provider-B | 51.2061 | 38.5903 | 0 | 68003 | 23 |
| [standard/selected](evidence/designs/adopted-designs-standard-01/measurements.json) | full-array | 0.6359 | 0.2149 | 6800 | 0 | 20 |
| [standard/selected](evidence/designs/adopted-designs-standard-01/measurements.json) | ordinal-A | 1.8412 | 0.0127 | 6800 | 6800 | 20 |
| [standard/selected](evidence/designs/adopted-designs-standard-01/measurements.json) | provider-B | 7.0807 | 5.7267 | 0 | 6800 | 20 |
| [large/selected](evidence/designs/adopted-designs-large-01/measurements.json) | full-array | 9.7969 | 4.7820 | 68003 | 0 | 23 |
| [large/selected](evidence/designs/adopted-designs-large-01/measurements.json) | ordinal-A | 26.8826 | 0.0390 | 68003 | 68003 | 23 |
| [large/selected](evidence/designs/adopted-designs-large-01/measurements.json) | provider-B | 48.3316 | 31.8048 | 0 | 68003 | 23 |

## 採否と残る制約

最終案のLarge連続検索p95はmain比60.8〜84.0%短縮。ただしsourceを跨ぐ全cohortは時刻順であり統計的な因果断定ではない。同じ最終sourceの4Mi/8Mi比較はtext上限だけを変更している。8Miで全文が保持されwarm text再生成がなくなり、4Miではbudget外の再生成が残るため、今回測定した選択肢から8Miを採用する。references 750kは全文＋optional逆参照＋participant indexの実保持553,614を許す上限であり、数値の大域最適性は証明していない。

B UIはStandardの追加費用とnavに明確な利点を示せないことから不採用。Aもcross-revisionの順序不変証明を導入せず比較のみとする。全取得/全検証を維持する製品UIにP2-06とdescriptorを適用する。

最終Large cold queryはmain約4.48秒から約5.84秒へ増加。Standard participant p95もmain約1.1msから最終約3.6msへ悪化した。全文正規化の初回費用、fresh schema証明、観測地点のheap増加を隠さず、全操作・全資源の改善とはしない。上限値の最適化やcold改善を理由に原合否を変更しない。

全精度OFF値の一覧は [off-samples.csv](off-samples.csv)。ONの全counter、各source/build/runtime proof、実asset/hash、saved edit全ID digestはmanifestから辿れる。正式な保存180回/7200秒/全8指標の再受入は未実施。
