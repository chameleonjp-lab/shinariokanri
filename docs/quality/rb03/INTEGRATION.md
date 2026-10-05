# RB03 正規保存・通常画面の結合検証

基準: RB02 main `bfe927c9f5c5a651bee4ed5aa2dd297c5d2ef561`。後続RB04以降の準備ファイルを含めず、明示したRB03ソースだけを基準版へ重ねた環境で検証した。

- production build成功、単体494件/44ファイル、文書/計画検査、Pythonの文書/公開gate試験15件が合格。
- Chromiumでは既存31件が通過。追加の通常画面の世界参照1件は保存完了の明示待機を加えた後、最終ソースでも合格した。
- WebKit全32件が合格。FirefoxはGitHub CIで別に確認する。
- 独立レビューは最終の型/参照/保存/通常画面のソースを検査し、未解決の具体的指摘なしとした。部品やこの段階の結果を116受入・実端末・完成版公開の合格へ広げない。

## 原子保存と完全保存

`src/storage/worldPins.test.ts`は実際のScenarioStoreと内容hashのある固定版で、推移世界の参照、本編の場所参照、旧版への引用、undo後の不変registry保持、完全ZIPへの往復、障害注入のrollback、再試行、異なる同ID暦、世界の日時制約、保存済み固定版IDの衝突を確認する。取り込みの事前確認を停止し、その間に別の世界ピンを保存してから取り込みを再開する試験でも、衝突はtransaction内で拒否され、本編/registryが一部だけ書き換わらない。

`src/storage/cacheConcurrency.test.ts`はネイティブIndexedDBの読み込み/保存に待機点だけを設け、旧版の全履歴読み込みと新しい編集読み込みが交差する再現を確認する。修正前は本文revision3にrevision2の履歴tokenが付き、次の保存がOPERATION_CONFLICTで拒否された。修正後は各読み込みの本文・履歴ID・保存元操作IDを同時に保持し、次のrevision4を保存できる。初回読み込み中のcloseと、読み込み中の原子replace復元も検証する。

`tests/e2e/world-workspace.spec.ts`は通常の完全保存ファイル取り込みから始め、世界の旧固定版を選択/参照/保存し、本編の出来事の場所選択に同じIDを使い、再読込後の完全ZIPを実際に読み戻す。本編に世界の場所を複製せず、旧名称/本文/採用設定を保持する。ローカル出来事から固定世界の出来事へ切り替えた後も選択IDは同じ固定出来事を指し、日時編集は無効、元情報は読み取り専用となる。

`src/ui/SnapshotAnchorPreview.test.ts`は実際のhash付き外側世界と旧/新入れ子世界を用い、参照元の固定版が指定した旧人物名・根拠と、前向き/対称関係の向きを表示する。新しい版の名称を混入せず、依存版がなければ参照を解決できないことを表示する。

## 再実行と範囲

```sh
npm run build
npm test
npm run check:docs
npm run check:completion-plan
python3 -m unittest discover -s scripts -p 'test_check_*.py' -v
BROWSER_ENGINES=all npm run test:e2e
RB03_ENGINES=chromium,firefox,webkit node tests/browser/run-rb03-components.mjs
```

部品画面の詳細は[局所検証記録](README.md)を参照。借用世界の公開名はプレビューと元情報表示に対応し、作品ローカルの限定投影へ借用IDを渡す未対応操作は無効にする。固定世界を含む実際の公開投影と公開API/素材の漏れ検査はRB09/RB10の結合条件として残す。

最終の追加修正では、本編の参加者とグループで使う借用人物IDを採用表示へ加えた。明示的な空の採用集合でも、本編で使う人物のレーンを失わず、未参照の人物は表示しない。変更後の単体2件と最終CIで確認する。

初回CI [37359011362](https://github.com/chameleonjp-lab/shinariokanri/actions/runs/37359011362)は494単体と3ブラウザーの通常画面96件が合格した。追加部品試験では、共有時点の更新後、入力欄の表示更新前に検査する待機不足が出た。待機条件へ共有時点と入力表示の両方の更新完了を含め、局所Chromiumの3スクリプトを再実行して合格。修正後の3ブラウザーCIを別に確認する。

最終CI [37360463566](https://github.com/chameleonjp-lab/shinariokanri/actions/runs/37360463566)（head `69b1d75333321652479e619680f77014bf158b3f`）は494単体、3ブラウザー通常画面96件、各ブラウザーの部品回帰・年表・世界参照の計9スクリプトが合格した。PR #6はmain `c2bdca1dce81f746473a9bd7a3a441ad103c6eb5`へ取り込み済み。この実行は計画の116受入ケースや実端末・完成版公開の代替ではない。
