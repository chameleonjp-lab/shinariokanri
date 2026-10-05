# RB04 結合検証

基準はmainの `c2bdca1dce81f746473a9bd7a3a441ad103c6eb5`。後続段階の未追跡ソースを除外し、43件のコード・試験・CIファイルを隔離した。検査対象は[source-files.txt](source-files.txt)と[source-manifest.json](source-manifest.json)のSHA-256で固定する。文書の追加によって検査対象コードのhashは変えない。

## 検証結果

- Vitest: 52ファイル・541件合格。
- 通常のNode 24によるJSON Schema生成、TypeScript、production build、service worker生成が成功。生成Schemaのhashは候補に含まれるSchemaと一致した。
- 文書検査・完了計画検査とPython15件が合格。104要件・24作業項目・116計画ケース・6回帰群・10段階を保持する。
- production Chromium: 通常画面36件合格。別案の作成・保存・画面移動・再読込・完全保存・複製復元、参照値と本文の採用・自動確認依頼、章と場面の並べ替え・所属変更・筋からの除外、固定版での章試読・記録保存を含む。
- 構成・通読・別案・雛形の注入ホスト部品操作: Chromium4件・実WebKit4件合格。
- 保存競合と固定版ナビゲーションの厳密な部品検査: Chromium11群・実WebKit11群合格。結果は[Chromium記録](author-components-chromium.json)・[WebKit記録](author-components-webkit.json)に保持する。native保存・通常Appの合格とは分ける。
- production実WebKit: 通常画面36件合格。CIのFirefoxを含む3ブラウザーの結果はPRのチェックとbrowser-evidence artifactに保持する。

## 独立レビュー

検査担当は全43hashを照合し、採用・並べ替え時の編集履歴能力の保持、自動生成確認依頼との整合性、削除済み情報の論理的な有無、複製後の現在版と履歴内別案のhash、参照値を持つ採用記録の型に従った変換、固定版から分岐した別案の初回保存を再現確認した。元の5件の問題は修正後のnative保存・再読込・完全保存で解消した。

採用検査は最新の正本と別案から差分と記録を再計算する。自動確認依頼は期待される生成キーと意味内容が一致するものだけ認め、乱数の情報ID・本文ブロックIDと生成日時だけ比較から除く。版番号は比較する。無関係な情報・確認依頼の追加、本文・名称・状態・公開範囲・生成元メタデータ・版番号の改変8件を、構造上有効な入力で拒否し、正本・履歴・outboxが不変であることを確認した。正しい採用は保存・再読込できる。

最初の通常画面試験では、構成変更の試験側が人物表示から章表示へ切り替えておらず、また筋からの除外ボタンを対象の筋へ限定していなかった。試験手順を修正し、製品の保存条件や期待する順序を緩めずに36件のChromium回帰が合格した。

## 残る条件

この段階の局所検証は、計画の116受入、実iPhone/iPad/PC、手動VoiceOver/NVDA、添付付きLarge・2時間編集、専用接続先での実Auth/RLS/private Storage、完成対象commitの復元訓練・費用・公開後検証の合格結果ではない。公開workflowの完成証拠gateを変更しない。
