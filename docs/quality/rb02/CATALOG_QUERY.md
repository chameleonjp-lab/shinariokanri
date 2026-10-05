# RB02 資料検索の関連索引と計測

2026-10-05。工程・伏線・参加者の検索が各行の判定で作品全体を再走査していたため、`compileCatalogQuery` が検索全体の関連索引を一度作る形へ変更した。`filterCatalogEntities` を資料画面と動的一覧の評価へ接続し、複合条件でも同じ索引を使用する。本文検索の正規化と本文corpusも検索一回の間で再利用する。

索引は一回の評価に限る。同じ作品objectの中身が編集された場合も、次の評価で再構築する。保存履歴・ID・検索対象の採用規則を変更しない。単一行用の `matchesQuery` は従来の結果を保ち、一覧はbatch APIを使用する。

## 局所検証

- `catalog.test.ts` と `catalogPerformance.test.ts`: 14 tests pass。
- Standardのentity配列をProxyで読み、工程・伏線・参加者・複合・本文の各一覧評価で実際のrecord読み出しが `2N` 以下であることを検査。動的一覧も同じ上限を検査する。各行で全件走査を再導入すればこの検査が失敗する。
- 固定した結果件数は工程600、伏線425、参加者15、複合250、本文5,490。旧実装と新実装で一致した。
- 採用条件が異なる伏線をanchorとして指す場合、archivedノードから場面へ展開する場合、同じ作品objectの編集後、呼出側の並び順を検査する。

## Standard 計測

`createCatalogPerformanceFixture` はStandardの8,800 recordsを保ち、台詞1,210件を関連条件用のノード400・提示400・制作タスク400・章10に交換する。台詞3,790件を含み、relation2,000件、素材bytesなし。seedは `standard-catalog-v1`。同じfixtureの意味と件数を前後で使用する。raw JSONにはfixture SHA-256、source SHA-256、全標本を含む。

Vite production bundle / es2022、Linux headless Chromium 151。query呼出から結果配列完成までを計測し、fixture作成、UI描画、実端末、素材は含まない。旧実装は3標本だけであるため、受入用p95とは扱わない。新実装は30標本。

| 条件 | 旧3回の中央値 ms | 新30回のp95 ms |
| --- | ---: | ---: |
| 工程 | 992.2 | 2.0 |
| 伏線 | 585.2 | 3.4 |
| 参加者 | 61.1 | 1.0 |
| 場面＋工程/伏線の複合 | 70.6 | 1.6 |
| 本文 | 80.9 | 71.0 |

証拠: [修正前raw](catalog-query-before.json)、[修正後raw](catalog-query-after.json)、[修正前algorithm](catalog-query-before.ts)。修正前はこのRB02作業中の未commit `catalog.ts` であり、main branchのbaselineとは区別する。保存したsourceのSHA-256はrawの `catalogSourceSha256` と一致する。

再計測:

```sh
node scripts/measure-catalog.mjs --samples 30 --output /tmp/catalog-query.json
node scripts/measure-catalog.mjs --samples 3 \
  --catalog-source docs/quality/rb02/catalog-query-before.ts \
  --output /tmp/catalog-query-before.json
```

旧実装を比較する場合は保存したalgorithmを `--catalog-source` へ渡す。依存するdomain moduleは現在checkoutから読み、比較対象はquery algorithmに限定する。実端末の入力から描画まで・全画面の再描画・長時間作業の最終判定はRB10へ残る。
