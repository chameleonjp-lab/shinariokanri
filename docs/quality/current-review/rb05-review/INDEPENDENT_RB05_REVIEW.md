# RB05追加分の独立レビュー

補修commit `773e755`を含む文書commit `f077c9ec916a8a78acf4d6bd2d6e9cb92db60dc6`の後、`feat/rb05-state-exploration` の未commit追加分を確認した。候補1の全140srcファイルを隔離コピーへ固定し、hashを記録した。後の作業中コードの結果とは分けている。製品コードは編集していない。

RB05の原26要件と関係する受入のshall、failure_behavior、given、when、then、negative_or_edgeを `original-rb05-contracts.json` へ原文のまま保存した。planned/not_runとbaseline_assessmentは設計時点の記録であり、この検査の現在結果ではない。104要件、116受入、24工程、6回帰群の削減・条件変更は行っていない。RB05全体および要件全体の完成判定は保留する。

Node v24.19.0、Vitest 5.0.3、Debian GNU/Linux 13.6 (trixie)、Linux 6.18.44 x86_64で実行した。提出された追加単体5件は成功した。独立した正期待9検査は2件成功、7件失敗で、原因は6種類だった。失敗を修正合格へ換算していない。入力project JSON、期待値・実結果JSON、検査源、ログ、各hashを `evidence/` に保存した。この工程の実ブラウザー・通常App・実端末検査は未実行である。

| 指摘 | 正しい期待と候補1の実結果 |
|---|---|
| R5A01/02 有効な排他例外の終了時文脈 | tick5、期間0〜10、確定根拠の例外で開始は成功するが、分岐の終了resetはerror、章の最終提示はunknownになる。reset呼出しでruleContextが欠ける。 |
| R5A03 提示後の値で例外が成立 | payoffのknowledgeEffectがflagをfalseからtrueへ変えると、提示前にはfalseだった経路例外が成立し、未提示の必須clueについてfindingが消える。 |
| R5A04 提示の訪問閾値が探索から欠落 | visited(scene)>=3で終了flagが立つ。通常stepは3訪問で終端へ進むが、解析は2訪問でUNBOUNDED_LOOPとなる。提示条件の閾値をstateKeyに反映していない。 |
| R5A05 stubの宣言をcheckedへ無区別に加算 | stub開始状態と同じstub宣言が一致するとchecked=1/total=1になる。開始由来・stub/actual別の集計がない。 |
| R5A06 固定版再保存で母数0/0 | trace固定保存、現稿へ集合追加、旧固定版再生、再保存と進むとdeclaredTestsは0/0になる。同じ記録をlive projectで照合すると1/1。pinが集合追加前のsession.contentを母数に使う。 |
| R5A07 API最大上限の保持 | 最大を超える100001状態・10001遷移・30001msを指定できる。拒否または仕様最大への制限が必要。UI既定値は仕様どおりで、これは補修commitから残るAPIの不足として区別した。 |

R5P01ではexclusionsの相手ID、alternativeInfoのキーと配列、台詞のclaimAssertionIdsと意図・根拠、回帰集合のmemberIdsが完全scenarioの再読込と独立cloneを通じて保持された。cloneの固定traceもterminalへ再生できた。ストレージ環境にはfake IndexedDBを用いており、実端末の保存・容量・再起動の受入とは分ける。

R5P02では既存のruntime_jsonとplayable_previewが、未対応のexclusionsをEXPORT_UNSUPPORTEDで明示拒否した。新型が黙って省略される結果は観測しなかった。これらの出力が排他規則へ対応済みとの判定ではない。

RV11の階層・reference/override再利用は依頼範囲で未完成とされている。宣言集合の通常画面には件数があるが、対象版・開始由来・stub/actual別の確認母数と実行数は未完成である。stateUsageの固定世界にある定義の参照、更新原因から選択・処理への導線、真実・証言・信念と発言意図の比較・診断も、型と入力欄の存在だけで完成にはしていない。

最終候補の修正再検査、通常Appの保存失敗・競合・再読込、原RB05受入の全条件、全116受入、指定実機・支援技術、Standard/Large性能、実同期・実権限は別に残る。候補1の証拠を後のcommitへそのまま流用しない。

## 候補2の修正再検査

全142srcファイルを新たに固定した候補2で、候補1の正期待9検査がすべて成功した。親担当が追加した同じ回帰9件と追加5件・durability1件も成功した。同内容の9件を新しい受入ケースとして二重計上していない。基準版3099c9dで生成した章・分岐の完全ファイルは変更せず再生し、2件成功した。

追加した保存境界9検査は3件成功・6件失敗で、未解消原因は4種類だった。候補1のログ・fixture・hashは保持し、候補2の結果を `independent-rb05-candidate-2-review.json` と `evidence/candidate-2/` に分けた。

| 追加指摘 | 候補2の実結果 |
|---|---|
| R5B01 candidateのactual/mixed分類 | 内部宣言traceと開始/stepsが一致すると、候補側externalModeがactualまたはmixedでも主checkedが1になる。宣言側modeだけを見ている。 |
| R5B02 途中開始の観測由来 | 宣言入口以外のノードを選ぶとstateはpartial、観測状態はfull_playのままで、固定保存したcheckpointが検証で拒否される。 |
| R5B03/04 章の観測状態 | occurrenceに効果前のpresentationStateが保存されず、章再生はoptional欄の偽の観測状態も受理する。 |
| R5B06 stub開始の再生 | 明示stubで開示条件を補った開始は保存できるが、checkpoint.origin=partialが再生時にstub由来を上書きし、保存step.beforeとの不一致で停止する。 |

分岐stepの偽の観測状態は拒否され、正本は不変だった。初期提示の効果前状態は完全保存・cloneを通じて維持され、提示後の値で成立した例外が必須不足を隠さない結果も確認した。scene.dialogueLineIdsの公開範囲外依存は、部分的に台詞を選んだ場合もruntime出力が明示拒否した。

この候補2の検査では、独立した実ブラウザー・通常App・実機受入を実行していない。原RB05全条件・全116受入の合格判定は保留している。

## 候補3と候補4の保存・旧版再確認

候補3の全143srcファイルを固定し、元9件、保存境界9件、変更していない旧fixture2件がすべて成功した。R5B01/02/03/04/06の修正を確認した。追加した完全ファイル・clone・再保存の4検査は2件成功、2件失敗だった。章の効果前状態と台詞・段落IDは往復して保持され、stub開始はstubとして再生され、偽造した章の観測状態はnative書出しが正本不変で拒否した。

追加指摘R5C01では、clone後の章再生が保存したopaqueなoccurrenceIdを再生成するため、同じ開始・提示結果の宣言経路がpartial別集計でも0/1になった。R5C02では、3099c9dの章traceにない任意presentationStateを再生成した候補へ加えたまま比較し、正常な旧版再生の結果がpartial別集計でも0/1になった。いずれも主checkedを0に保つことは正しく、途中開始を通し確認へ昇格させる修正は求めていない。

候補4も全143srcファイルを別に固定した。R5C01は、独立実行の状態・観測・条件が一致した後に保存occurrenceIdを保持する変更で解消した。同じ24検査は23件成功、R5C02の1件が失敗した。存在する偽観測の拒否検査は成功を維持している。候補1〜3の証拠は変更せず、候補3と4の検査源、入力fixture、native bytes、期待・実結果、対象src hashを各専用JSONと `evidence/candidate-3/`、`evidence/candidate-4/` に分けた。

この独立工程では実ブラウザー・通常App・実機を実行していない。親担当の通常画面検査とは別記し、候補3/4の部品・保存検査を原26要件または全116受入の合格へ換算しない。commitへのhash照合とR5C02の修正再検査は、この記録時点では保留である。

## 候補5の修正再検査

候補5の全143srcファイルを固定した。候補4からのsrc差分はregressionPaths.tsの1ファイル、候補3からはpresentation.tsを含む2ファイルだった。R5C02の比較では、旧宣言にpresentationStateがない場合だけ、候補のその任意欄を旧記録の欄へ正規化している。存在する観測の比較と再生検証は保持していた。

同じ正期待の24検査がすべて成功した。元9件、保存境界9件、変更していない旧章・分岐fixture2件、native保存・clone・再保存4件を別記した。clone後のopaqueな提示ID、章の効果前状態と台詞段落ID、旧章traceの任意欄互換が確認された。章のpartial経路と明示stub経路は各別集計へ1/1として加算し、主checkedは0を保持した。存在する偽の観測は章・分岐の再生とnative書出しが拒否し、正本は不変だった。

この追加範囲で発見した未解消の挙動差はなくなった。`independent-rb05-candidate-5-review.json` と `evidence/candidate-5/` に実結果とhashを保存した。原26要件の全条件、RB05全体、全116受入は未実行・未完成を維持し、通常Appと指定実機・支援技術・性能・実権限の証拠へ置き換えていない。確定commitへのsrc hash照合は別記する。

## 候補commitとの独立照合

確定commit `6d2a05c768638d3658f756064eb8953df92e6ea9`、tree `73f48ce954835f7ae8c61851493ce2eeef1dc202` の内容をgit showで読み、候補5の全143src SHA256・ファイル集合と一致した。候補5の53証拠artifactと結果JSONもcommit内のbytesに一致し、ログ末尾の空白を含めて変更していない。最新main基底 `2efd4be` が祖先であることも確認した。[照合JSON](evidence/candidate-5-commit-binding.json) に各hashと照合結果を記録した。この対応は独立検査24件の対象版を固定するものであり、RB05全体・原116受入の完成判定は保留を維持する。
