# 設計比較と採否

本書はPR #59の統合計画・第2段階依頼、mainに統合された第1段階のDESIGN/HANDOFFを継承する。製品への採用と、研究用実装を分ける。本PRの製品方式は現行を維持する。未mainの#63〜65を統合済みと扱わず、原要件・形式・履歴・固定版・秘密・完全復元の条件を速度と交換しない。

## D06: 現行＋実行可能な2案

| 評価軸 | 現行・評価ごと再生成 | 案A・寿命付きコーパス共有 | 案B・有界の検索結果LRU |
| --- | --- | --- | --- |
| 正本との境界 | 元filterCatalogEntitiesをそのまま呼ぶ | collectCatalogText/normalizationを再利用し、不変recordごとの正規化語だけ保持 | 元全件検索の返却record参照だけを保持 |
| 必要な画像 | mutable draftにも元どおり応答 | 深く凍結されたplain graphのみ。不明/可変入力は研究APIで拒否 | 同左。queryのhook/accessor/非plain値はcacheせず元全件検索 |
| 所有者 | 比較用wrapperの8次元照合を含む | account/role/project/revision/pins/schema/visibility/normalizationの明示値。欠落・継承だけの値は拒否 | 同左。projectID/revisionだけで異なる像を共有しない |
| 公開/権限 | 製品の元の検査が正本 | author専用。公開ownerは構築拒否。ownerは呼出側の主張であり認可の証明ではない | 同左。公開索引はprojection後の別型・別所有者 |
| 保持量 | query終了後に派生情報を持ち越さない | 最大8MiBの正規化UTF8 payload、最大100000 source行。元ProjectData参照は別に存在 | 最大8query/100000結果参照、keyは4096 UTF8 bytes以下。返却配列の変更はcacheを変更しない |
| 読込/走査 | 本実験は元データをメモリ内で全件評価。DBは測らない | 各検索で全行を依然走査する。減らすのは主に正規化の再実行 | cache hitだけ全件filterを省く。異なるqueryと容量超過では元検索 |
| 初回費用 | 元全件の正規化 | 正規化＋保持量のUTF8算出＋Map登録。初回が遅くなり得る | 元検索＋key/copy/LRUの費用。hit率を推定せず実測する |
| 失効/負例 | 元再生成が対照 | 深い可変値・同revision別内容・改名/別名/削除・8owner変更を独立期待値で検査 | 上記＋返却配列変更、query.toJSONの偽装、entry/参照budget超過 |
| 費用/移行 | 追加費用0、移行0 | 追加サービス0、DB/外部形式の移行0。実際の製品owner/終了/例外への接続は未実装 | 同左。検索語と結果が次操作へ残るため明示破棄が必要 |
| 戻し方 | 元処理 | session.close後に元filterへ戻す。正本を削除しない | 同左 |

比較は同じ元入力と各30回の6連続query。最初のquery、別のquery、同じqueryの再検索を別の区間として保存する。順序は反復番号mod3で3方式を交代し、各方式/反復で新しいsessionを作る。原UIの30回測定ではなくNodeの追加測定である。全queryのID/順序digestは元全件検索と一致させ、小さな手書き期待値でも日本語、同名異ID、archived、参照、複合条件を確認する。

### 採否

現行方式を製品で維持する。案Aは繰返し検索向けの**後続実装候補**とする。初回費用と保持増を含めて判断し、8MiBが最適とは主張しない。案Bを単独の一般索引として採用しない。文字を入力するたびに変わるqueryや、Largeの複数の大きな結果集合ではhitを保証できず、結果LRUだけでは正規化の重複を解消しない。実測の有利・不利な値はMEASUREMENT.mdと全rawに残す。

製品の採用条件は、#63〜65のmain統合と確認、実際の不変画像/依存closure/権限世代に所有されたsession API、mutable draftの全件fallback、例外/キャンセル/終了での破棄、UI操作～結果表示・DB行数・heap保持の同条件比較である。研究wrapperのowner文字列を実認可や自動失効の実装と誤解しない。

### 独立した意味の反例

345のトップレベル項目/43kindのregistry・UI・公開allowlistを一覧化した。これは深い全AST項目の網羅証明ではない。character.goalsは正式参照の配列、scene.goalsはrich textで、同名フィールドの意味が違う。collection.modeは作者側dynamic/fixedに対し公開はfixedのみ。scene.goalsは公開allowlistにない。これらを一つの全生成DSLに寄せると意図した区別を壊せる。

新しい合成反例で、character.data.goals[0]とgroup.data.members[0]の正式参照IDが作者用全文検索の文字列コーパスへ入ることを確認した。原因はcollectCatalogTextがId/Idsというキー接尾辞で除外し、modelの参照walkerを参照していないこと。公開投影への漏洩をこの反例から主張しない。**現在製品の未修正の意味差分**として残す。案A/Bも元コーパスを使うため同じ挙動を継承する。全件対照との一致だけでは原意図への正しさを証明できない具体例である。

後続の独立した製品修正は、kindと正式参照pathに基づいて該当するleafだけを除外し、作者が本文へ書いたUUID風文字列とscene.goalsの本文を検索対象に残す。単純なUUID文字列全除外や、全kindのgoalsを参照扱いする方式は棄却する。検索保存・公開索引・正式参照の不変と元Standard/Large/3engineを維持して再測定する。

## OPT-01〜15の判断を継承する範囲

元の現行＋2案の詳細はphase1/DESIGN.mdのD01〜15を保持する。新実測がない行を今回の速度改善と呼ばない。

| OPT | 現時点の採否・根拠 | 残る作業・戻し方 |
| --- | --- | --- |
| 01 | #62のsummary＋選択後完全loadはmainに存在。古い全作品読込を再実装しない | 既存の個別破損/late response/draft保持とv8互換を保持 |
| 02 | 選択currentは全量。章closureと永続read modelは未採用 | 未読状態と完全性を証明してから分離。現在の全件loadへ戻せる |
| 03 | #63のchangeset試作はHISTで不採用。現行saveを維持 | request v1/v2 hash、64checkpoint、原子性を変えない。試作の復活なし |
| 04 | #64のmetadata方式は未main。単純sliceは破損検査を失うため棄却 | main統合後、全metadata/選択本文/旧形式fallbackとrollbackを再確認 |
| 05 | #65のclosure/上限4方式は未main。HISTの40不利値とUNKNOWNを維持 | 容量4の最適性や全体高速化を主張しない。保持境界とACK guardを別評価 |
| 06 | 本書の現行＋2案を実装・比較。製品は現行維持 | 案Aのowner接続と意味差分解消、UI/DB/heap比較後に採否 |
| 07 | 既存DOMページングは取得削減ではない。ID順序memoとordered read modelを比較する設計を維持 | P2-05/06後に、選択復帰/日本語/順序/不在と未読を実ブラウザーで照合 |
| 08 | #61のscope別遅延準備はmainに存在 | 永続候補cacheの保持増・mutable陳腐化というHIST棄却理由を保持 |
| 09 | authoritative registryの監査用descriptorを追加。製品の全生成はしない | 正式参照pathの検索差分を別製品PRで修正。公開allowlist/UI配置は独立 |
| 10 | 作者分類・確定リンク・候補・公開投影を維持 | owner付き派生registryは別比較。X機能/作者タグ形式を追加しない |
| 11 | 既存contentValidationMemoを維持。検索の結果を検証証拠へ転用しない | 全件oracle、schema/world/cycle/mutable/同ID異種のfallbackを保持 |
| 12 | 原p95制限、30回/180保存の定義を不変とする | UI保存1000msやframe33.4ms等の追加目標は別の未採用提案のまま |
| 13 | 原native/Worker/完全保存と重複削減済み処理を維持 | archive v2/desktop化を追加しない。正式全量/実素材/new/clone/coldは第3段階 |
| 14 | 原22外部条件とRELEASE BLOCKEDを維持 | 実機除外。専用環境なしの実Auth/サービス/費用/対象ゲームは未実行 |
| 15 | 原CI・inventory・全assert・3engineを維持 | shared build/dependency cache等のCI運用設計は第3段階。今回CI設定変更なし |
