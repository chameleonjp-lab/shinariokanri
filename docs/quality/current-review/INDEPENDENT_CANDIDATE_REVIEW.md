# RV01〜RV10 補修候補の独立レビュー

対象は main 3099c9d の後のRV01〜RV10補修commit `773e7554f381c8e3a7c93e142350f181328f014e`、tree `d89ceec5f439c0b711ce73c13500cffd6544c1b1`、[Draft PR #9](https://github.com/chameleonjp-lab/shinariokanri/pull/9)です。独立した候補コピー6の全138srcファイルhashが当該commitの内容と一致し、追加・欠落したsrcパスがないことを確認しました。以後のRB05作業中コードは別工程です。104要件・116受入・24工程・6回帰群の原条件は `independent-main-audit.json` に保持しています。このレビューの部品・結合成功を要件全体の合格へ加算しません。

Node v24.19.0 / Vitest 5.0.3 / Debian GNU/Linux 13.6 (trixie), Linux 6.18.44 x86_64で正期待33件が成功しました。実headless Chromium 151.0.7922.173 / 同OS / 1024×768 のcomponent結合5件も成功しました。画面は実ブラウザーで操作していますが、App通常導線、実iPhone/iPad、支援技術、実Auth/RLS/Storageの証拠とは分けています。

| 指摘 | 固定補修commitの結果 |
|---|---|
| IC01 終了イベントの原因記録の上書き | 場面・章移動と最終場面・章・run終了の5原因を保持して成功 |
| IC02 同じ場面のterminalで場面終了が実行されない | terminalの提示後に終了し成功 |
| IC03 章試読がscene/chapter/run初期化を実行しない | 分岐と同じ宣言境界の値を確認し成功 |
| IC04 部分状態の欠落値がundefinedの原因になる | unknownのbeforeを保持し型検査が成功 |
| IC07 graph未知が別章の既知不一致を隠す | 対象外を除外し、現在提示を停止せず成功 |
| IC08a/08b 設定保存中のremount・ack | 保存待ちが継続し、保存済み入力の未保存表示が消えて成功 |
| IC09 invalid暦JSONがremountで消える | raw入力と未保存判定を保持し成功 |
| IC10 固定世界の借用変数の仮値Modal | 固定情報から型・名前を解決し成功 |
| IC11/12 新しい空原因欄で旧正常経路の再生が壊れる | 実基準版で生成した章・分岐の完全ファイルを変更せず再生して成功 |
| IC13 固定世界のクエスト遷移表が提示効果を制約しない | 借用クエストの禁則が同じ参照解決で適用され、全効果の原子拒否が成功 |
| IC14 有効例外へ開始時点やtriggerなしの時点を渡せない | 期限内成功・未入力/範囲外/期限切れ/不正tick停止・完全保存/複製後再生が成功 |

IC13はクエストの参照解決をlocalとreferenceの共通集合へ揃えて解消しました。IC14は開始時点を初期提示、trace、章提示、完全保存・複製・再生へ接続して解消しました。期限内5の成功、未入力のunknown、期限10と開始前-1の拒否、不正2.5の停止を別々に記録しています。初期提示のmoney効果が保存再生で二重適用されず、mainStartも変わらないことを確認しました。

最後の非同期捕捉変更も再検査しました。章開始のworldTickと場面選択、解析の入口・state・stub・提示結果をawait前に捕捉し、呼出側が待機中にoptionsを書き換えても元の要求を使う2件が成功しました。取消signalと進捗callbackは操作用に維持しています。

修正前の失敗logも保存しました。元の規則を削除して解消とした項目はありません。独立で報告したIC01〜IC14の実装指摘は固定補修commitで解消しています。hash照合の手順と全結果は `evidence/independent-candidate-6-commit-binding.json` に記録しました。このcommitは全機能の完成commitではありません。

RV05/06/07/09は候補コードの静的レビューまでです。親担当のproduction通常画面検査は別証跡です。RV01/02/03/04/08/10にも、元のgiven/when/then/negative全体や対象版の全通常保存・復元受入を完了したとの判定は付けていません。

旧fixtureは `evidence/legacy/` のJSON・完全scenarioです。実基準版の正常な実行と出力で作成し、生成コードとlog、baseline commit/tree、各ファイルhashをJSONへ記録しました。保存したfixture自体の基準版再読込・再生2件も成功しました。旧版内容や保存したafter状態を書換えて検査を通していません。

再実行は当該補修commitの隔離コピーに `independent-candidate-contract-regressions.ts`、`independent-candidate-boundaries.ts`、`independent-historical-trace-regressions.ts`、`independent-borrowed-quest-regression.ts`、`independent-exception-lifecycle-regressions.ts`、`independent-async-capture-regressions.ts` の6検査源を `tests/` に `.test.ts` として配置し、legacyを `tests/fixtures/independent-legacy/` へコピーして行います。UIはharness3ファイルを隔離コピー直下へ配置し、`node independent-ui-review.mjs` でローカルVite/Chromiumを起動します。出力先は `/tmp`、専用portは5229です。

全機能完成対象での全116受入、指定実機・支援技術、Standard/Large性能、実同期・実権限、release evidence gateは未実行または環境待ちです。個別不足環境と既存RB01〜RB04の歴史的証拠は基準版監査JSONへ残しています。
