# 実装監査と最終設計

## 確認した既存実装

実際のmainは `a13d8fa`、treeは `7876a9346443f47f49e5f057801f647c85726f56`。#67の検査済みtreeと一致し、元#63/#64/#65のmerge commitがすべて祖先である。main更新・全open PR・保護状態を再取得した記録は証拠に含める。branch APIは `protected:false`、rulesetsは空配列、保護詳細APIは403であり、その詳細はUNKNOWN。設定を変更していない。

P2-01のsummary/編集分離、P2-02のscope別候補準備、P2-04の全履歴metadata完全性、P2-05のcurrent/history別pin closureとstore cache所有は既存。P2-03の保存changeset試作は比較後に棄却され、元save入口・完全検証を維持している。保存/履歴/完全復元/DB移行を再実装しない。`contentValidationMemo`や固定版hashの検証条件も短絡しない。

## 原因と変更

| 観測・反例 | 原因 | 対応と実際の範囲 |
| --- | --- | --- |
| 同じsaved sourceを2回compileすると依存索引・正規化を再構築 | compile単位の一時共有だけで、storeの正本寿命に所有されていない | 具体的なScenarioStoreに1つのbudget、saved currentにrevocable owner。未知入力は全件再生成 |
| `character.goals`/`group.members`のIDが本文検索に混入 | 型固有の正式参照葉と作者本文の境界が未反映 | 既存modelのreference walkerが示す実際のleaf pathだけ除外。`scene.goals`と本文中のUUID風文字列を残す |
| foreign同ID entityをtrusted projectのcompileへ渡せる | ID一致だけでは所有データと証明できない | 実際のimmutable entity objectをWeakSetで照合。foreign/mutableは固有の本文で全件処理 |
| 非同期参照準備中のrole/schema変更、componentのready rows | index構築中・構築後の寿命確認不足 | await後/最終公開前とUI ready rows再使用時のrevocable guard。部分公開なし |
| deep-frozenでもstore未登録のcollectionがschema変更前のIDを保持 | frozenを保存済み所有証明の代わりにした | reviewerの反例を再現し、**未登録入力はfrozenも含め毎操作全件再生成** |
| Largeの4Mi code-unit上限では正規化済み本文が途中までしか入らない | whole corpusは約5.86M code units。上限後の行が毎query再生成 | 上限付きprefix admissionを維持し、最終案8Miと同じ最終ソース4Miを比較。実heapとは別の論理量 |
| 全B UIのStandard時間がP2-06単独より不利、page移動の改善なし | 全matchのID/ordinal Mapを作り、textPositions等が再び全match rowsを取得。fresh schema証明にも費用 | **製品UI統合を棄却**。`CatalogPanel.tsx`/`Lists.tsx`/`ListWindow.tsx`をP2-06単独のbytesに復帰 |
| warm queryでも全走査とmatch allocationが残る | 数値probeでcold Unicode trace構築とwarm trace hitを区別。既存WeakMap再利用はすでにある | traceキャッシュの新規効果とは主張しない。今回の正規化共有効果、残る全走査・位置match allocationを別報告 |

## P2-06：所有・失効・保持

`src/domain/derivedIndexes.ts` のownerはhistory/authorAlternativesを保持対象から外し、private immutable currentの各header/body object identityをown-data descriptorで確認する。actual schema signatureをevaluationごとに取得し、unknown/cycleはfull fallback、変更時は値を破棄する。アカウントごとのstore、role generation、作者scope、normalization versionを別所有とし、public projectionを作者cacheへ接続しない。

保存・epoch・role変更、既存LRU/release、closeでownerを閉じ、強いsource/値/membershipを解放する。`isActive`は同じ同期evaluation内、`isCurrent`はschemaを含む再確認。同期の所有証明をawaitの後まで持ち越さない。単なるWeakMapは失効の代わりにしない。caller自身が保持した古いview/closureまでGC済みとは主張しない。

既定候補は1 store合計でentries 100,000 / references 750,000 / textCodeUnits 8,388,608。projectごとに上限を掛け算しない。文字列payloadの論理和はUTF-16換算約16MiBであり、JS heap上限ではない。optional dependency/reverse-reference indexも同じreference budgetを消費するため、合計referencesを「本文だけの参照数」と読まない。拒否したindexは正しい一時結果を返し、公開済みcacheへ昇格させない。全走査で自分のprefixを追い出すLRU thrashを避ける。

検索依存/正規化、作者向け日本語term、link term準備、eligible state usage、逆参照を必要時共有する。返すmutable containerはcopyし、option別label/exclusion・Unicode位置は呼出しごとの意味を保持する。state usageの固定版hash確認は維持。作者分類・確認済み参照・提案/ignore・公開投影後索引はそれぞれ独立し、派生cacheは検証証拠や認可判定にならない。

## P2-07：共通意味と比較した一覧案

cleanなliteral `a13d8fa` から43 kind/345 field、元UI/public/schema契約を独立に固定した。`capture-field-semantics.mjs` は別head/dirty sourceを拒否し、元ソースから再生成したJSONが固定fixtureとbyte一致する。descriptorはmodel registryから参照種別・nested/conditional pattern・制約を抽出し、UIの81個の一致する参照定義で使用する。11個の意図的なscope/filter例外、文言/配置、公開allowlist、生成schema JSONは独立した元契約を保持する。新DSLや全生成器は導入しない。

| 案 | 正確性と費用 | 採否 |
| --- | --- | --- |
| 従来full array | 全件filter後、既存UIページを読む。元の戻り位置・選択・移動順を維持 | 製品UIに継続採用 |
| ordinal A | 1 snapshotのID→ordinal Mapでtail検索は軽くなるがprepareと保持が増える。D03から順序不変を証明するcross-revision変更集合は今回未実装 | 比較のみ。DB部分読込とは呼ばない |
| provider B | loaded/unloaded/absent/stale、独立selected、bounded page、own-ID照合、同期frameのschema/lifetime fence。全件順序・保存編集・非表示選択の独立oracleは一致 | 製品UIでは棄却。domain比較adapterと検査だけ残す |
| 永続索引/全UI read model | migration・破損復旧・全UI状態設計が必要。今回の証拠から費用に見合う改善を証明できない | 不採用 |

Bの成功したpage60だけを根拠にDB rowsや検索走査数が60になったとは表現しない。実際のUI試作ではtextPositionsが全matchを取得し、`collection.selected` APIも使っていなかった。API上の独立hidden selection証明は別の機能検査で行う。

元mainからStandardのparticipant predicate p95が悪化する値もある。同じ境界にfresh actual-schema証明が加わるが、劣化への寄与割合は分離していない。2サイズだけからentity数の閾値を新設せず、実UIとpure APIの結果を分けて残す。全操作高速化・全端末最適・heap合格とはしない。

## 戻し方

DB version、native形式、保存正本は変更していない。P2-06はstore option `derivedIndexes:false` で比較用の再生成経路へ戻せる。製品として戻す場合は本PRの索引/descriptor変更をrevertする。正式参照葉の検索除外は独立commitでレビュー可能。比較用collection adapterの削除は製品UIへ影響しない。元全量検証・DB読込・履歴/固定版/hash契約を維持しているためデータmigrationは不要。
