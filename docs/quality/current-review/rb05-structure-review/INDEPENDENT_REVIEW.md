# RB05階層・短い反応・途中開始の独立レビュー

基底 `b9ce26bccb6359d2414a66a13168fc054c434519` の後に追加した工程を、149srcファイルの隔離コピーで確認した。原REQ/AT-F13、F15、F20、F39、N18と関連するB16、F17、N19のshall、failure_behavior、given、when、then、negative_or_edgeを `original-contracts.json` へ原文のまま保存した。planned/not_runは歴史的な設計記録であり、現在の完成件数へ換算していない。製品コードは編集していない。

候補1の提出5検査と従来の独立24回帰は成功した。新しい独立domain6件は4件成功・2件失敗、実Chromiumによる実Appの保存境界6件は2件成功・4件失敗だった。原因は次の5種類で、正しい結果を期待する検査として記録した。

| 指摘 | 候補1で確認した差 |
|---|---|
| S5D01 | 下位call図の場面がrejected台詞を参照すると下位scene欄はerror1だが、上位chapterとroot graphのerrorは0。 |
| S5D02 | unknownの開始提示を保存・集合宣言・固定版再生・再保存すると主declaredTestsが1/1になる。従来集計から残る差で、今回のfull-origin再構成が新たに作った問題とは分けた。 |
| S5R01 | cold start後のhistory token付きprojectをpreviewでstructuredCloneすると、通常の反応保存が履歴改変として拒否される。新規・復元直後のfull historyだけでは見落とせる。 |
| S5U04 | 途中開始の実保存を保留し、資料へ移動してReaderへ戻ると未完了のまま作成ボタンが有効になる。 |
| S5U05 | 同じ移動後に保存を拒否すると失敗通知が消え、選んだ開始点も空へ戻る。 |

候補2も全149srcを別に凍結し、同じ正期待を再実行した。新しい独立domain6件、従来24回帰、提出5件、実Appの6件がすべて成功した。反応の同期previewはhistory配列/tokenを維持し、作品別の途中開始pendingは移動・再入・失敗・最新propsのackを通じて保持する。未知経路は主checkedへ加算せず、下位scene/台詞の問題はsummary作成前に確定して上位へ集計する。

所持品・人物の信念・値を持つ途中開始は、native保存・再読込・clone・trace保存・再読込・再生を通じてpartialを維持し、巻戻で全状態を復元した。初回/再訪、順次の最終反応への固定、seed抽選を各5回繰り返し、巻戻と保存再生の抽選位置を比較した。所持金10→5、across_runs記憶7→9の変更を経た終了・new_loop・full_resetも宣言規則に一致した。手入力でfullラベルへ変えた任意状態はpartialとして扱う既存検査と、unknown初期値からのstub再生も成功を維持した。

環境はNode v24.19.0、Vitest5.0.3、Debian13.6/Linux6.18.44 x86_64。Node保存検査ではfake IndexedDBと実native/clone/runtimeコードを用いた。実ブラウザーは `/usr/bin/chromium` 151.0.7922.173、1024×768、Vite developmentで実App・実IndexedDB保存を操作した。遅延と失敗は保存promiseの境界に注入した。production build・実端末・性能・実API/権限の証拠とは区別する。初回ハーネスがApp描画完了前にナビゲーションへ進んだ試行は未実行として残し、製品不具合や合格へ換算していない。

確定commit `01d73ebdda4ed0e52c44c10d8f70e7f99a0efcc2`、tree `b2cfef822b347e7b1e8948036ce34748bd50a2f1` のgit show内容と候補2の149src SHA256・ファイル集合が一致した。候補1/2の159証拠artifact hashも一致し、rawログを変更していない。[照合JSON](evidence/candidate-2-commit-binding.json) と各候補専用結果JSONに記録した。対象変更は [Draft PR #11](https://github.com/chameleonjp-lab/shinariokanri/pull/11) でレビューできる。

この範囲の発見指摘は解消した。固定reference/override再利用、全対象の伏線期限・未回収方針・変更再確認、回帰集合改訂の再確認、認識比較、状態利用の全運用には別の残条件がある。RB05全体・原104要件全体・原116受入の完成判定は保留を維持する。指定の実端末、支援技術、Standard/Large性能、実Auth/RLS/private Storage等をこの検査で合格へ置き換えていない。
