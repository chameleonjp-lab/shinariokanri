# 第2段階への実装単位

開始条件は本第1段階成果PRのユーザーレビュー・設計採用・mergeと、その後の最新main/全open PRの再取得。未統合の本ブランチをmainに取り込み済みと扱わない。元104/116/464/24/6/68とrelease gateを保持する。

| PR単位・依存 | 所有pathと具体作業 | 比較入力・負例・必須証拠 | 中止/戻し方 |
| --- | --- | --- | --- |
| P2-01 一覧分離 / 最初 | `store.ts` のsummary API、`App.tsx` のsummary stateと選択時load、`StoreContext/AccountWorkspace` 呼出元。D01。header以外を選択前に読まない | 作品1/10/50、未選択破損・旧版、account/role切替、未保存draft、同時save/late response/cancel。全表示値/送信待ち/削除状態の一致、DB rows/bytesと入力可能時刻 | 表示または権限不一致で不採用。旧listProjectsForEditingとUIへ復帰。外部形式/DB移行不要 |
| P2-02 候補の必要時準備 / P2-01と独立、同pathなし | `referenceChoices.ts` だけを中心にD08。calendar/project/identity等の不要準備を除去 | 全scope×kind×archive×pin、同名異ID、別名、publicTexts/trigger。ID/label/orderを現行対照と独立期待に完全照合。呼出回数×走査数 | 不一致は旧関数へ戻す。DB移行なし |
| P2-03 保存changeset / P2-01後、store所有を引継ぐ | `store.ts` のnormalize/targetChanges/contentDelta/writeContent、必要なdomain境界。D03 | 元Standard/Large、改名1件/台詞1件/複合、密参照、旧v1/v2再送、同ID別request、短縮anchor、global重複、quota/最終故障/cold。hash bytes・検証回数・走査数・実commit行数・UI区間を分離 | 原子性/履歴/outbox/固定版の不一致で不採用。旧save入口を保持。request hash/形式変更は別承認 |
| P2-04 履歴metadata / P2-03後、store重複編集禁止 | `store.ts`、内部DBの新表/移行と互換reader、`HistoryPanel.tsx`。D04 | 100/1000/10000、全page/query/order、missing/壊れたmetadata/本文、親cycle/64checkpoint、import/clone/cold。元全metadata検査の保証範囲を保持し軽量化 | 移行前完全保存/復元点。旧行を破棄せず旧readerへ。O(page)のための破損検査削減は禁止 |
| P2-05 pin closure/保持 / P2-01/03/04後 | `worldPins/pinnedWorlds/worldSources`、`store.ts` cache、App読込所有者。D05 | currentとhistory/exportで必要なclosureを別比較。transitive pin、旧版/同ID違hash、cancel/role/epoch、draft未喪失。cache保持数/heapと失効を分離 | unknown依存は全registry/full検証。cache削除/旧読込への切替で復帰。GCをメモリ合格に推定しない |
| P2-06 派生索引 / P2-02/05後 | `catalog/referenceIndex/stateUsage/linkCandidates/publicCatalog`、D06/10/11。cache所有者の共通境界 | 連続検索、1件改名、別名、削除、pin/schema/role/account差替。全件再生成と独立原期待の完全一致、漏洩なし。保持上限/構築回数 | 索引消去・全件compileへ戻す。作者の分類/正式参照/除外判断を派生へ移さない |
| P2-07 共通意味と画面取得 / P2-06後、別PRへ分けてもよい | `model/types/fieldSpecs/projection` のdescriptor網羅と `WindowedList/ListWindow/CatalogPanel` のD07/09 | 全項目・全種類の独立expectation、schema生成diff、公開allowlist、UI復帰位置/日本語、元図/年表/試読。UI/DB/検索を別測定 | 共通生成元の誤りで全対照が同時誤答しない検査。個別descriptor/旧リストへ復帰 |

各PRで原unit全件・build・3engineの全必須inventory・後続rb03/rb04/rb10・変更に対応する負例を成功させる。fixture/seed/bytes/assert/timeout/retry/skipを変えない。前後比較は同一計測定義/入力/環境で行い、ON診断による時間をOFF正式値へ混ぜない。失敗生値を残し、改善なし/劣化案も棄却理由を保存する。

第3段階で、統合済みの同一最終候補を封印して、原全8指標×Standard/Large各30、元6条件×30の180保存、実7200秒、88,003記録/113履歴・送信待ち/実72MiB、600000msの完全保存とnew/clone/cold、2000msの進捗/取消を直列再実行する。本段階で再実行していない長時間・完全復元の最終受入を成功へ転記しない。実機は依頼対象外、専用実サービスの許可環境がないものはBLOCKED。独立レビューは別担当者の実施待ち。

本PRの戻し方は計測/検査コミットのrevertである。DB version・保存形式・正本を変えないためデータmigrationはない。計測を開始しなければ新しいログも保存も発生しない。新probeの結果を使わず既存performance機構へ戻しても保存契約を保持する。
