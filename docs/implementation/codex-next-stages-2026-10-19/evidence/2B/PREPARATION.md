# 2B：保存前処理・検索一覧の再開準備

対象は[依頼2B](../../requests/2B.md)の独立した読取・設計と阻害記録。NP11・NP13は**未実装、動的検証・新規比較未実行、採否保留**である。[1D比較設計](../../../../optimization/next-stages-2026-10-19/COMPARISON_DESIGN.md)の候補を具体化し、製品変更条件を解除しない。

## 着手判定と変更前後

開始mainは#79をユーザーがmergeした `4a67e85fd7f292e26b2d7d766baa0dd3ab348b6e` / tree `fadead2d1df6838bbb531824f1505ac040631b39`。依存の実merge・CIは[検証記録](VERIFICATION.md)に分離した。開始時に自handoffとopen PRはなかった。

[2A引継ぎ](../../handoffs/2A.md)はNP09未実装・安全性未検証、NP10未着手、1A基準不足を明示する。#79の実mergeは準備3文書の統合であり、2Bが要求する「2Aの必要成果」の充足ではない。[1A引継ぎ](../../handoffs/1A.md)と1Dの採用停止条件も現行30/180・各size3標本heap原本を未取得としている。正式受入合格を新しい開始条件にはしない。

| 項目 | 変更前main | 今回の提出後 |
| --- | --- | --- |
| 保存・検索・一覧の製品処理 | 下記の現行C | 同じ製品bytes。省略・memo・位置遅延は追加しない |
| OFF時間 / ON仕事量 / 保持量 / 動的正確性 | 現行基準不足 | 新規実測なし、差はUNKNOWN |
| 2B再開情報 | 依頼・1D設計、自己handoffなし | 境界・独立負例・C/A/B比較条件と阻害を追加 |
| STATUS / 共有型 / manifest / 原fixture / 検査・workflow | 既存版 | 差分なし。最終tree照合はPR本文へ確定 |

## 所有pathと保存・索引の接点

今回の編集者は統合担当 `/root` 1人。所有pathは本書、[検証記録](VERIFICATION.md)、[2B引継ぎ](../../handoffs/2B.md)の3 Markdownだけ。子担当・内部並行はない。

将来のNP11担当は `store.ts` / `projectSummary.ts` と保存検査、NP13担当は `catalog.ts` / `catalogPositions.ts` / `derivedIndexes.ts` / `CatalogPanel.tsx` / 一覧と検索検査。独立した差分とAPIが確定した場合だけ最大2実装担当へ分ける。`store.ts`・`App.tsx`・共有型・共有manifestの接点は統合担当が直列編集し、所有重複なら並行を止める。

現行では `saveProject` のtransaction確定後に `rememberProject` が旧derived ownerをcloseし、新しいimmutable編集viewだけにownerをbindする。`invalidateProjectCache`、権限変更、release、closeでも旧ownerを破棄する。NP11の失敗・replay・古いcaptureでは現在のcache公開条件を維持し、NP13へ未確定candidateを通知しない。**新しい保存通知・失効APIは不要という準備上の方針**であり、今回API変更はない。後日の細粒度再利用がstore失効APIを要するなら、その契約を先に固定して直列で扱う。

## NP11：現行の境界と分離すべき費用

行番号は開始mainに固定。Git blobは検証記録を参照。

| 箇所 | 静的に確認した現行 | 比較で分離するもの |
| --- | --- | --- |
| `store.ts:179–185,1033` | storeが再帰freezeした値だけ共有し、mutable/shallow-frozen本文は最初のawait前にcapture。historyは既存token/完全履歴契約を使う | captureの複製・bytes・寿命。caller変更を省略の証拠にしない |
| `store.ts:1041–1068` | cacheのprevious/head/history tupleを同期capture、world準備後にv1/v2のexact request hash・再送判定 | readと全量canonical encoding/hash。v2も全量hashを残す |
| `store.ts:288–303,1073–1081` | entities/relationsをnormalizeし、既存作品ではreconcile後にentitiesを再normalize | 第1/第2normalizeのMap構築・走査・比較・copy、reconcile本体 |
| `production.ts:18–60` | 通常のno-opはcandidateを返すが、台詞/cue/正式参照の変更は成果物のstage/status/needsReviewへ波及し得る | no-opと波及を区別。異なる配列でも同じrecord、同じIDでも別recordを試す |
| `store.ts:1093–1104,964–997` | targetChanges、contentDelta、writeContentが独立。書込は既に変更recordのみ | 3処理の走査・Map・allocと実commit rowsを別々に測る |
| `store.ts:989–990` / `projectSummary.ts:27–30` | native header再読込・source hash・active entity count・digest | database時間に埋めず、native bytes/2 hash/count scanを分離。現行から消えたとはしない |
| `store.ts:1106–1151` | 単一write transaction、checkpoint64、outbox/assets、確定後cacheとreturn copy | 原子性・最終故障・全API時間。SaveMetrics.total以後のreturn費用も含む |

既存SaveMetricsのreconcile/diff/databaseは複合区間なので、これだけで第2normalizeやsummary単独の時間を断定しない。既存 `normalize.rows` 等は入力件数の帰属値で、実loop visit/割当/peakの証拠ではない。新しい細分counter/spanは未実装、未対応値はUNKNOWNとする。

| 候補 | 変更する局所範囲 | OFF時間 / ON仕事量 / 保持量 / 正確性 |
| --- | --- | --- |
| C：開始時の現行save | 全量hash、2回normalize、独立diff/write/summaryを維持 | すべて新規未測定。静的読取のみ |
| A：reconcileのno-changeを証明した場合の第2normalize省略 | operation内のprivate入力とreconcileの非変更証明を結ぶ。array identityだけで内容同一としない。証明不能はC | 未測定。証明費用と波及時fallbackを含め、省略不能割合も報告 |
| B：normalize内だけのoperation-local再利用 | 同じprevious/draftおよび安全な正規化済recordに閉じたmemo。reconcileが置換したrecordや未知形状は再計算。operation終了で解放 | 未測定。照合・memo参照・保持時間・失敗時解放を含める |

[P2-03棄却shared changeset](../../../../optimization/phase2/p2-03/README.md)のtarget/delta/write共通Mapを復活させない。元実験はOFF単一4観測中3不利で、prior Mapがcommitまで残った。過去rawを現行値にしない。summary countのincremental化、patch command、新request版、DB/外部形式変更は今回の候補へ混ぜない。

独立期待は[凍結save oracle](../../../../../tests/optimization/save-changeset-oracle.ts)のtarget/field presence/delta/ordered IDs/writeRowsと、固定literal入力・native全表・cold full readerを組み合わせる。oracleはrequest encodingや全検証を網羅しないため、原v1/v2 requestの実bytes/hashを別に固定・照合する。候補のnormalizeやhash helperから期待を作らない。

| 操作・負例（すべて未実行設計） | 独立して照合する結果 |
| --- | --- |
| capture後にcallerのmutable/shallow-frozen本文・配列を変更 | captureした入力のまま保存し、未保存draftを失わない。再送bytesも一致 |
| 同operationId同request / 同ID別request / 並行二重送信 | 再送結果は同一、別内容はOPERATION_CONFLICT、command/outboxを重複しない |
| 新規・改名・台詞/cue・正式参照変更、成果物承認、順序のみ変更、削除 | 全record・revision/updatedAt/tombstone・target/field presence・delta順序・summaryがC/oracle一致。波及をno-opにしない |
| kind/createdAt不正・重複ID・不正参照・固定snapshot変更 | 現行の全体検証と拒否を維持。局所hitで不正を通さない |
| 64境界、new/clone/cold、旧native1.0、v1/v2再送 | 全履歴・復元点・本文・outbox/assetsの独立再読込が一致 |
| world pin差替・権限取消・stale draft・fake/遅延ACK・cache eviction中save | 固定版とtuple/generation/ACK guardを維持し、古い結果を新ownerへ公開しない |
| quota、after-content/history/outbox、before-commit、最終native transaction失敗、通常再試行 | projects/entities/commands/outbox/assetsとsummary/partsが原子的。失敗前bytesを保持し、失敗通知後のdraftと再試行が正しい |

条件成立後は原Standard/Largeの**3保存形式×2fixture×30＝各候補180保存**を元 `measure-original-saves.mjs` で実行する。元各条件command p95≤1000ms、時間区間・assert・watchdogを維持する。rename/dialogueだけの既存補助harnessは180保存の代用にしない。OFFは全API/UI/command、ONは別contextで上記細分仕事量、保持はmemo/Mapの実寿命・peak/GCを分離する。

## NP13：結果集合と本文位置を分ける条件

| 箇所 | 静的に確認した現行と残る仕事 |
| --- | --- |
| `catalog.ts:115–183` | queryをcompileし全active候補をfilter。textはowned saved recordだけ共有、依存operatorで必要になってから複合indexを構築 |
| `catalog.ts:215–285` | fixed/dynamic collectionの順序・missingを解決。createCatalogCollectionは比較adapterで、provider UI採用は棄却済み |
| `CatalogPanel.tsx:64–89,121` | 結果を全件確定後、全結果についてfindCatalogTextPositions。本文位置は独立した全match総件数・ページを表示する |
| `catalogPositions.ts:5–61` | graphemeのNFKC/kanaと原文code point位置を対応付ける。WeakMap traceのwarm hitでも全match配列は再生成 |
| `WindowedList.tsx:23–26` / `ListWindow.tsx:15–28` | 全filter/ID→original index/selectedIndexの後にslice。表示件数はDB読込・全走査量ではない |
| `derivedIndexes.ts` / store owner境界 | store共通budgetはentries100000/references750000/text8388608 code units。超過は正確な再生成へ戻る。schema/role/寿命の旧leaseを再利用しない |

**結果entity数と本文match数を区別する。** 結果entityの表示pageだけで位置検索すると、既存の独立した本文位置pagerの総数・中間/末尾ページが欠落する。Aは全matchの正確なcountと順序を確定しつつ、詳細anchor/snippet objectの生成だけ必要windowへ絞る設計にする。count走査/traceと再走査の費用、ページ跨ぎ・同entity多数matchの扱いも比較対象であり、O(page)検索とは主張しない。

| 候補 | 局所範囲 | OFF時間 / ON仕事量 / 保持量 / 正確性 |
| --- | --- | --- |
| C：現行array UI | 全結果filterと全本文位置配列、既存ownerを維持 | すべて新規未測定 |
| A：必要な本文位置objectだけ生成 | 全結果ID/順序/件数と全本文match countを維持。position window/選択に必要なanchorを後から生成。既存全件関数をfallback/oracleとして残す | 未測定。count＋page再走査、trace、all matches対window allocation、page移動も測る |
| B：要求内のscope別準備 | 現行の遅延dependency構築をさらに必要operator単位に分け、既存ownerの必要indexだけ使う。新provider/ordinal/Worker/永続postingなし | 未測定。plain/text/participant/production/foreshadowと組合せの準備・miss/hit・保持を分ける |

[旧比較](../../../../optimization/phase2/p2-06-07/MEASUREMENTS.md)のprovider BはUI不採用、ordinal Aは研究のみ。今回のA/Bは別の局所候補であり、旧labelから採用を引き継がない。storeの全体owner失効を細粒度へ変える採用判断も未実施。unknown/mutable/schema変更時のfull fallbackを残し、authorの分類・候補・正式参照とpublic投影を混ぜない。

独立期待は候補変更前の全件compile/位置生成を凍結した対照と、literal ID順序・原文位置を使う。既存collection/owner検査の合格だけで新windowの全件一致を宣言しない。たとえば原文 `😀Ａカ\u3099` に対する `aが` はcode point範囲[1,4)、`㍿` の `会社` は[0,1)を手計算期待として固定する。UTF-16 offsetとcode point/graphemeの数を混同せず、元表記・anchor・fieldPath・lineIdを保持する。

| 操作・負例（すべて未実行設計） | 全件対照する結果 |
| --- | --- |
| 空/0件/少数/大量/末尾一致、先頭/中間/末尾position page | 全ID・順序・entity総数・本文match総数、全page連結、label/anchor/Unicode位置が一致 |
| 同名異ID、別名、半角/全角、結合文字、astral、空白、NFKC展開、同block複数match | 原文を変更せず正確な範囲と既存の非重複match順を保持 |
| 改名/別名/削除/作者順序/参照変更→保存直後検索 | 旧term/旧順序を返さず、fixed/dynamic collectionとmissingも独立一致 |
| 非表示の選択、cards/table/diagram/timeline、位置から詳細へ移動 | 選択・入力・戻りpageを保持し、非一致selectedを結果へ混入しない |
| 予算外末尾・entries/references/textそれぞれの超過、mutable/未知owner | 全件再生成で正答。未取得・不在・staleを混同せず、未対応counterを0にしない |
| 同ID/同revisionの別作品・別account、schema/header/pin/hash差替、role取消、close/reopen・遅延準備 | 古いownerから位置/秘密/参照labelを返さない。正当なauthor検索と公開投影の秘密非露出を別に照合 |
| 保存→検索→作品切替→復帰、1/10/50作品・複数Large | project間の混入なし。全結果digestと選択がC一致し、old ownerが失効する |

OFFは原 `霧→霧の→門番→記録→霧→霧の` 各query30標本とnavigationを同一条件で直列比較し、cold/保存直後/予算外末尾/複数作品を別cohortにする。ONはfilter/text/index/position scan・trace build/hit・match count・生成object数を別contextで記録。保持はowner/entries/references/text code unitsに加え、結果配列・位置配列・trace WeakMap・caller-held viewの寿命を含める。8Miは総heap上限ではない。各size3標本の強制2GC後main renderer V8 heapとpeak/RSS/Worker/nativeは別欄とする。

## 再開順序・採否・戻し方

1. 次の一操作は、許可済み通常環境で[1D引継ぎ](../../handoffs/1D.md)末尾の1A残測定を再開し、clean source/tree/build/配信bytes/seal・原30/180・heap原本を固定すること。今回2Bでは1A/2Aを代行しない。
2. 2Aの必要成果（NP09安全性、NP10比較/実装または比較済・不採用）とユーザーmerge・CIを確認してから更新mainに合わせる。1A全体基準とNP11/13直前Pnを分け、既存API/ownerを再照合する。
3. 独立期待と負例を固定し、必要な反例のRED→実装→GREEN。C/A/Bの同一fixture/host/browser/driver/argv/clock、失敗試行、全生値を保持。採用は全件正確性・安全性と原条件を先に満たした案に限る。比較未実施を「比較済・不採用」にしない。
4. 独立差分なら小Draftへ分け、後から統合する側はユーザーmerge後mainで保存→検索→作品切替→復帰と元全CIを再検査。2Cへ進めず、STATUSを更新しない。

現行へのrollbackはNP11の省略/memoだけを無効化して元hash/saveを残し、NP13の位置遅延/局所準備を戻して派生cacheを消去・全件再生成する。capture/tuple/generation/ACK guardを外さず、DB downgradeや原データ削除はしない。今回の3文書だけなら、その追加をrevertする。
