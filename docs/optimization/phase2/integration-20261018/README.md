# #63〜65のmain向け統合候補

ユーザーの「#63〜65がmain未統合のためP2-06/07が保留、これを対応」に対する統合候補。基点は#66が他の操作でマージされた後のmain `3650244bfb05cfd03e52d5622d04ccd8dc9bfc89`。本作業でmainは更新していない。

## 取り込む内容と履歴

| 元PR | mainへ取り込む内容 | 保持する元merge commit |
| --- | --- | --- |
| #63 / P2-03 | 不採用の保存changeset比較・独立behavior検査・失敗/不利値。試作経路は復活させない | c06ff7becc75f6ed34b097e1ae5134074b1c50ad |
| #64 / P2-04 | 正規に分割保存済みの限定metadata読込、全キー検査、旧形式/大metadataの完全読込fallback、本文照合 | 559777cf1b5301483f2fbbd17014ffc190f7c2f3 |
| #65 / P2-05 | 世界依存closure、派生保持の制限、editor/preview所有者、同版更新とACK衝突の保全 | 5299d389d9eb81d282dd9e64347763d573751819 |

最新mainと上記3commitを祖先に保持する候補を作る。差分だけのsquashは元commitをmainの祖先にせず、到達確認で再び未統合となるため採らない。このPRのmain取り込み時も**merge commit方式**で履歴を保持する。squash/rebaseはこの到達保証と同じものではない。

累積製品sourceは#65 HEAD `f07c53036f061ebdc0e807dc521d04164080f5c3`。mainとこのHEADの共通祖先は`d3bf88c31172386fd84926a615ed060c2ee2190c`。競合したApp.tsxの2区間とstore.tsの1区間は#65のworld所有者・cacheEpoch失効を保持して解消し、解消後の両ファイル全体が#65と完全一致した。mainのP2-02候補準備、#66の研究コード/過去source検査を保持した。

[source-provenance.json](source-provenance.json)は全299srcファイルのbytes/SHA256/Git blobと両入力のblobを保持する。**299件すべてがmainまたは#65の実ファイルそのもの**であり、合成された別の製品ソースはない。原CI・依存/lock・docs/data・tests/fixturesのmain差分と、追跡ファイルの削除はない。

## この候補での検証

- 元の全unit: **142ファイル / 1,349件成功**、1worker/非並列、497.46秒。logs/full-unit.log。
- 元tsconfigの型検査/build成功。これは統合候補の作業treeでのbuildであり、clean計測sourceのbuildと付け替えない。提出commitでのclean buildは原GitHub CIで確認する。
- 文書、completion-plan、phase1の原73入力/104要件対応、#66の過去source検証が成功。Python文書系54件、CI制御/復元原本25件成功。
- 独立したエージェントの組合せレビューで重要な統合退行なし。権限失効、cache/save読取所有者、preview世代、ACK取引内衝突、canonical metadataの失敗/rollbackを確認。これは原条件にある独立した人の受入の代替ではない。
- 元release guardはexit1の**RELEASE BLOCKED**を維持。実機・実Auth/サービス・第3段階の30回/180保存/7200秒の正式受入は未実行。

原GitHub CIの全7ジョブ（各3engine全inventory・復元原本・後続rb03/rb04/rb10・aggregate）の最終run、source/attempt/tree、保存artifactは、この統合Draft PR本文へ記録する。ローカル成功を未終了のCI成功として扱わない。

## 過去計測と採否

p2-03/04/05配下の元計測・source・レビュー・build・失敗・不利値は元のまま保持した。統合候補の新しい性能値とは呼ばない。#64の旧/大入力fallback、#65の40対の不利値やheap/全体高速化UNKNOWN、容量4の最適性未証明も変更しない。#66の検索3案の研究は現行製品維持という判断のままである。

P2-06/07の元設計と#66の原因分析を引き継ぐ。**この候補をmain統合済みと仮定しない。** 原計画のmain起点を満たす実マージは、前回のユーザー「マージしない」指定があるため、候補と全検証を提示した後の明示許可まで実施しない。

## 戻し方と境界

本候補の作成では実ユーザーDBを開かず、DB/schema・外部形式version・本番・認証・課金・公開設定を変更しない。元104/116/464/24/6/68/73とfixture/seed/実bytes/30回/180保存/7200秒/600000ms/2000ms、原assert/timeout/retry/skipを保持する。

P2-05の派生closure/cacheは破棄して元の読込へ戻せる。P2-04の新しい内部headerを実データへ書いた後に古いbinaryへ戻す場合は、**互換decoderを維持するか、全本文検証後に互換表現へ原子的に書き戻す必要がある**。単純な旧binaryへのrevertだけを安全なデータrollbackとは扱わない。詳細は../p2-04/DESIGN.mdとREADME.mdを保持する。

実機テスト、本番環境変更、mainへのマージ、配備・公開は行わない。
