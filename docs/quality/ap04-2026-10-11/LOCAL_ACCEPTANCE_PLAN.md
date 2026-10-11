# AP04 原116ケースのローカル受入実行計画

2026-10-11作成。これは実行入口・入力・残操作の対応表であり、製品受入の実行結果ではない。116ケース/464条項を原文のまま[JSON](local_acceptance_plan.json)へ収録し、全新候補結果を`not_run`とした。[元監査](../../review-2026-10-11/original_acceptance_audit.json)と旧C29結果は変更していない。

元監査の外部条件注記を数えると、97ケースは4節すべてに注記がなく、19ケースは実端末・実Auth/API等の条件を含む。条項別では405節がローカル操作候補、59節が外部条件を含む。これは注記に基づく振り分けであり、97件が準備済み・合格済みという意味ではない。元仕様の実端末条件は追加で評価する。

初回計画で既存入口を特定したB01/B10/F02/F27/F36/N05/N09の7件に加え、現在の[入口inventory](authored_entry_inventory.json)には93ケースの96個の静的test宣言が43本のspecに登録されている。既存7件との重複はなく、100ケースに既存または新しい入口参照がある。残る16ケースには新しい原ケース題名がなく、実環境条件や独立補助の範囲を保って次操作を記録している。宣言数は動的引数展開後のブラウザー実行数ではなく、原4節を満たす完成件数でもない。全464条項は`not_run`、合格件数は0のままである。

元監査で外部条件注記のない97ケースには、既存7件または新しい90件の入口参照がある。注記付きケースではE12/F29/F33の3件に新しい題名があるが、実機・実Auth・実同期等の証拠は別に必要である。N11の機内モードやN14の実ファイル退避など、元注記だけでは表せない実条件の不足も各proofへ保持した。各原句は同じ固定候補・given上の直接観測で判定し、入口の存在や過去の局所結果から合格を推定しない。

## 既存入口から始める7件

| 元ケース | 通常操作の入口 | 入力と注意 |
| --- | --- | --- |
| AT-B01 | `tests/e2e/basic-registration.spec.ts:15` | 空作品で名前のみ人物/要約のみ出来事。必須・参照拒否、native12表不変、cold、実完全new/cloneのhelperがある。 |
| AT-B10 / AT-F27 | `tests/e2e/link-candidate-ignore.spec.ts:47` | 二人の葵・別名青い子・一般語葵を同fixtureで作る。対象の確認/除外/逆参照と元本文位置、旧snapshot、cold、新規/複製復元を確認できる。 |
| AT-F02 | `tests/e2e/templates.spec.ts:25` | 名前のみ人物A→説明付き所属enum→必須/数値化の影響と取消。F56の同名2人/参照型/型不正ファイルは別途追加が必要。 |
| AT-F36 | `tests/e2e/consultation-context.spec.ts:79` | 確定/仮設定/秘密/前後状態を含むSのfixtureと実MDのdownload検査。別案出所/版と非自動変更を保持する。 |
| AT-N05 | `tests/rb10/large-analysis.spec.ts:34` | 元Large 88,003記録/72 MiB実素材＋256遷移。専用configで実行する。小規模`reader-analysis-navigation`はnavigation契約の補助であり原givenを代用できない。 |
| AT-N09 | `tests/e2e/rb10-import-errors.spec.ts:69` | 元7破損fixtureとcomplete.scenario、manifestの実bytes/hashが取得可能。全原子拒否/パス・理由/入力保持を同候補で実行する。 |

通常E2Eは`npm run build`後に`npx playwright test <上記spec> --project chromium`、原N05は`npx playwright test --config tests/rb10/playwright.config.ts --project chromium`が入口となる。元のtimeout/上限を保持し、AP03の性能・大量履歴実行と同時に走らせない。Linux Chromium/Firefox/WebKitは補助環境として記録し、実iPhone/iPad/VoiceOver/NVDAの代わりにしない。

## 新しく追加した原条件の入口

初回に追加したB23/F26/F15/F23の独立spec2本と[原4節のproof](local_acceptance_entry_proof.json)を保持し、その後の追加入口は上記inventoryに反映した。各proofは原文、source hash、callback位置、通常操作と予定assert、不足条件を記録する。初回のTypeScript確認は当時のsourceに対する補助であり、現在の統合候補のブラウザー実行や原4節の受入結果へ移さない。

現在の追加群は、[B群20件](ap04-original-bm-proof.json)、[F07/F08/F10/F11/F12](ap04-original-bm-f07-12-proof.json)、[F群24件](ap04-original-f-proof.json)、[E・F37〜50群20件](ap04-original-e-proof.json)、[N・F14/F16〜20群15件](ap04-original-n-proof.json)、[root E07/N19/N20](ap04-original-root-proof.json)、[N20対応先選択](ap04-original-n20-target-proof.json)、[E07別10上限の必須補助](ap04-original-e07-safety-bounds-proof.json)を参照する。同じケースの補助・追加入口は重複して数えず、元givenと実環境条件の不足を残す。E12/F33の題名付き入口もinventoryへ記録し、独立補助や実条件の未観測を原4節の証拠と区別する。

[静的照合report](clause_plan_static_check.json)は`scripts/check_ap04_clause_plans.py`で原4節、source SHA、callback/span/lineを照合する。静的一致は試験実行の合格を意味しない。root/Eのsource更新後には各所有者がhash・行・spanを再生成し、最終commit/tree/buildへ結び付ける。

| 元ケース | 新入口 | 同じgivenで確認する点 |
| --- | --- | --- |
| AT-B23 | `tests/e2e/ap04-original-identity-impact.spec.ts` | UI保存で履歴を準備した確定リンク付き人物を改名。容量失敗の入力/正本保持、単体復元の新履歴、coldでID/本文リンク/固定版保持。 |
| AT-F26 | 同上 | 人物Aを参照する台詞/伏線/翻訳と作者が意味関連を指定した場面を同fixtureに置く。改名表示と死亡本文変更の人確認待ちを比較し、候補を本文へ確定適用しない。 |
| AT-F15 | `tests/e2e/ap04-original-checkpoint-production.spec.ts` | 鍵1個/好感度5、欠落値、旧版の各checkpointを通常試読する。戻り、初期開始との違い、移行の明示確認、partial経路の証拠範囲。 |
| AT-F23 | 同上 | reviewed翻訳/収録・確認者identity UUID・実WAV・固定版から始める。並替え時のhash不変と本文変更時のneeds_review、担当別実出力と旧成果物/確認者/bytes保持。 |

各テストは実行時の`given.scenario`、そのbytes数/SHA-256、直接読んだ結果のJSONをPlaywright添付へ保存する。生成APIはgivenの準備とarchive読取に使用し、作者の保存・変更・復元・開始・移行・出力は通常画面から行う。B23の保存失敗のみ境界障害を注入し、正本・履歴・outboxをread-onlyで比較する。

AT-F14の旧「同じoccurrenceIdを通常UIから再送できない」という実装不足は、Readerの「直前のきっかけを再送」で解消する入口を追加した。直近の実traceにevent requestがある場合だけ同じrequest/occurrenceIdを既存`stepTrial`へ渡し、busy・stale・pendingPresentationの制限を守る。[通常保存記録とcold確認の候補](../../../tests/e2e/ap04-original-n-f14-trigger.spec.ts)と[N群proof](ap04-original-n-proof.json)へ原4節を対応付けた。初回proofの不足記述は当時の記録であり、現在の入口不足の判定には使わない。新入口は未実行のため、重複時の状態・trace不変やonce=runの原句は引き続き`not_run`である。

## 再利用できる入力と観測helper

JSONの`test_references`は各ソースのSHA-256、test宣言の行/題名、helper名/行、参照するfixtureの取得可否を持つ。`nav/navigate`で通常sidebarとtabへ移り、`seed/importProject`は生成した完全ファイルを通常Files入力から取り込む。`backup`は実download bytesを読み、`inspectScenario`で本文・ID・hashを比較する。`durable/native/nativeFingerprint`は拒否前後のIndexedDBを読み、正本・履歴・送信待ち・素材の不変を観測する。これらは入口と観測手段であって各原givenの成立を保証しない。

取得可能な入力は`repository_fixture_inventory`へ実bytes数とSHA-256で一覧化した。固定読取版/child call、61履歴、制作fixture、実WAV/MP4、7破損archive、原Largeがある。生成型のfixtureはソースhashと生成後input hashを別々に保存する。既存`tests/e2e/httpContract.ts`・`tests/fixtures/sync/browser`はローカルHTTP境界の補助のみで、実RLS/private Storageの証拠にはしない。

`historical_source_references`の旧原契約・fixture生成ソースは取得可能な設計資料として列挙した。古いcandidateの結果や/tmpパスだけを新候補証拠へ移記しない。約1.85 GBの旧閉鎖証拠すべての再hash確認をこの入力調査では実施していない。

## 先に埋める未観測のローカル操作

JSONの各caseには`specific_next_action`、各条項には原文・候補test・不足観測・外部条件・次操作を持たせた。以下は初回の不足操作一覧で、現在は追加proofとinventoryの入口を併読する。題名や予定assertが追加済みでも、同じgivenでの直接観測は未実行である。

- B23: 台詞で代用せず、確定リンクと初期履歴を持つ人物そのものを改名/復元する。
- B16: 同じ二択fixtureの正本と公開済み固定版を読者操作/戻るで上書きしないことを比較する。
- F14/F15/F21: 同occurrenceId再送、旧checkpointの実選択、話者改名とL1/L2並替えを通常操作で観測する。
- F23/F24/F26: 実在確認者IDの保存、実素材付き4プロファイル出力、人物改名と死亡設定の別操作を追加する。
- F43/F46: Q本体から根拠を付け直す操作、出所と知識取得位置の新規保存、仮assertionを追加する。
- F50/F53/F54: 全遊び仕様の通常関連付け、素材のみ差替え、共通世界版2を通常UIで作る操作を追加する。
- E02/E10/E12: 暦単位/基準点/回想章順、抽選/loop/実ゲーム結果、offline/容量/更新/移行/専用出力再開を各同fixtureで続けて観測する。

元監査の`reported_remaining_conditions`と`reported_partial_observation`をJSONに保持したため、旧局所成功から未観測の原句を見分けられる。すべての結果は新候補では未実行である。

## 116件の入口対応

外部節数は元監査に注記された節数。参照キーはJSONの`test_references`へ対応し、caseの次操作と各条項の原文を併読する。unit/browser supportは候補fixtureや規則の参考で、通常App操作の代替ではない。

| 元ケース | 元回帰群 | 準備分類 | 外部節数 | test参照キー |
| --- | --- | --- | --- | --- |
| AT-B01 | RB02 | 既存入口を再実行可 | 0/4 | basic, navigation |
| AT-B02 | RB03 | 原条件の手順追加 | 0/4 | timeline, time-components, graph, paging |
| AT-B03 | RB03 | 原条件の手順追加 | 0/4 | timeline, time-components, graph, paging |
| AT-B04 | RB03 | 原条件の手順追加 | 0/4 | timeline, time-components, graph, paging |
| AT-B05 | RB03 | 原条件の手順追加 | 0/4 | timeline, time-components, graph, paging |
| AT-B06 | RB03 | 原条件の手順追加 | 0/4 | timeline, time-components, graph, paging |
| AT-B07 | RB03 | 原条件の手順追加 | 0/4 | timeline, time-components, graph, paging |
| AT-B08 | RB02 | 原条件の手順追加 | 0/4 | timeline, structured, navigation |
| AT-B09 | RB03 | 原条件の手順追加 | 0/4 | timeline, time-components, graph, paging |
| AT-B10 | RB02 | 既存入口を再実行可 | 0/4 | links, navigation |
| AT-B11 | RB02 | 原条件の手順追加 | 0/4 | world, structured, navigation |
| AT-B12 | RB06 | 原条件の手順追加 | 0/4 | recovery, import-errors |
| AT-B13 | RB04 | 原条件の手順追加 | 0/4 | writing, author |
| AT-B14 | RB05 | 原条件の手順追加 | 0/4 | runtime-ui, conditions-ui, fallback, runtime-unit |
| AT-B15 | RB05 | 原条件の手順追加 | 0/4 | runtime-ui, conditions-ui, fallback, runtime-unit |
| AT-B16 | RB05 | 原条件の手順追加 | 0/4 | runtime-ui, conditions-ui, fallback, runtime-unit |
| AT-B17 | RB05 | 原条件の手順追加 | 0/4 | narrative-unit, runtime-ui |
| AT-B18 | RB03 | 原条件の手順追加 | 0/4 | world, time-components, time-unit |
| AT-B19 | RB05 | 原条件の手順追加 | 0/4 | narrative-unit, runtime-ui |
| AT-B20 | RB04 | 原条件の手順追加 | 0/4 | writing, author |
| AT-B21 | RB03 | 原条件の手順追加 | 0/4 | world, time-components, time-unit |
| AT-B22 | RB05 | 原条件の手順追加 | 0/4 | production, structure, runtime-ui |
| AT-B23 | RB06 | 原条件の手順追加 | 0/4 | recovery, navigation, basic |
| AT-B24 | RB02 | 実環境条件あり | 2/4 | editor, conditions-ui, graph, collections |
| AT-F01 | RB02 | 実環境条件あり | 3/4 | catalog, sharing-local |
| AT-F02 | RB02 | 既存入口を再実行可 | 0/4 | templates, drafts, structured |
| AT-F03 | RB04 | 原条件の手順追加 | 0/4 | writing, author |
| AT-F04 | RB04 | 原条件の手順追加 | 0/4 | writing, author |
| AT-F05 | RB04 | 原条件の手順追加 | 0/4 | writing, author |
| AT-F06 | RB04 | 原条件の手順追加 | 0/4 | writing, author |
| AT-F07 | RB03 | 原条件の手順追加 | 0/4 | world, time-components, time-unit |
| AT-F08 | RB03 | 原条件の手順追加 | 0/4 | time-components, paging, time-unit |
| AT-F09 | RB03 | 原条件の手順追加 | 0/4 | world-ui, world |
| AT-F10 | RB03 | 原条件の手順追加 | 0/4 | world, time-components, time-unit |
| AT-F11 | RB03 | 原条件の手順追加 | 0/4 | world, time-components, time-unit |
| AT-F12 | RB03 | 原条件の手順追加 | 0/4 | projection-unit, handoff, sharing-local |
| AT-F13 | RB05 | 原条件の手順追加 | 0/4 | structure |
| AT-F14 | RB05 | 原条件の手順追加 | 0/4 | runtime-ui, runtime-unit |
| AT-F15 | RB05 | 原条件の手順追加 | 0/4 | structure, reconfirmation |
| AT-F16 | RB05 | 原条件の手順追加 | 0/4 | runtime-ui, reconfirmation |
| AT-F17 | RB05 | 原条件の手順追加 | 0/4 | reconfirmation, writing, runtime-unit |
| AT-F18 | RB05 | 原条件の手順追加 | 0/4 | analysis-small, analysis-large, runtime-unit |
| AT-F19 | RB05 | 原条件の手順追加 | 0/4 | reuse |
| AT-F20 | RB05 | 原条件の手順追加 | 0/4 | structure, runtime-unit |
| AT-F21 | RB07 | 原条件の手順追加 | 0/4 | production, handoff |
| AT-F22 | RB07 | 原条件の手順追加 | 0/4 | production, handoff |
| AT-F23 | RB07 | 原条件の手順追加 | 0/4 | production, handoff |
| AT-F24 | RB08 | 原条件の手順追加 | 0/4 | handoff, import-errors, exports-unit |
| AT-F25 | RB04 | 原条件の手順追加 | 0/4 | writing, handoff |
| AT-F26 | RB02 | 原条件の手順追加 | 0/4 | navigation, links, production |
| AT-F27 | RB02 | 既存入口を再実行可 | 0/4 | links, navigation |
| AT-F28 | RB07 | 原条件の手順追加 | 0/4 | production, handoff |
| AT-F29 | RB09 | 実環境条件あり | 1/4 | completion, sharing-local |
| AT-F30 | RB09 | 実環境条件あり | 4/4 | sharing-local, projection-unit, account-local |
| AT-F31 | RB02 | 実環境条件あり | 3/4 | editor, conditions-ui, graph, collections |
| AT-F32 | RB02 | 原条件の手順追加 | 0/4 | editor, conditions-ui, graph, collections |
| AT-F33 | RB02 | 実環境条件あり | 2/4 | graph, library, drafts |
| AT-F34 | RB09 | 実環境条件あり | 4/4 | account-local, sync-unit |
| AT-F35 | RB06 | 原条件の手順追加 | 0/4 | recovery, import-errors |
| AT-F36 | RB08 | 既存入口を再実行可 | 0/4 | consultation, handoff |
| AT-F37 | RB05 | 原条件の手順追加 | 0/4 | completion, structured, conditions-ui |
| AT-F38 | RB05 | 原条件の手順追加 | 0/4 | runtime-ui, runtime-unit |
| AT-F39 | RB05 | 原条件の手順追加 | 0/4 | maintenance, references, navigation |
| AT-F40 | RB05 | 原条件の手順追加 | 0/4 | conditions-ui, fallback, runtime-ui |
| AT-F41 | RB05 | 原条件の手順追加 | 0/4 | runtime-ui, runtime-unit |
| AT-F42 | RB08 | 原条件の手順追加 | 0/4 | handoff, exports-unit |
| AT-F43 | RB05 | 原条件の手順追加 | 0/4 | writing, structured, narrative-unit |
| AT-F44 | RB05 | 原条件の手順追加 | 0/4 | writing, narrative-unit |
| AT-F45 | RB05 | 原条件の手順追加 | 0/4 | narrative-unit, analysis-small, runtime-ui |
| AT-F46 | RB05 | 原条件の手順追加 | 0/4 | narrative-unit, analysis-small, runtime-ui |
| AT-F47 | RB05 | 原条件の手順追加 | 0/4 | narrative-unit, analysis-small, runtime-ui |
| AT-F48 | RB07 | 原条件の手順追加 | 0/4 | production, handoff |
| AT-F49 | RB08 | 原条件の手順追加 | 0/4 | handoff, production |
| AT-F50 | RB08 | 原条件の手順追加 | 0/4 | handoff, production |
| AT-F51 | RB08 | 原条件の手順追加 | 0/4 | handoff, production |
| AT-F52 | RB08 | 原条件の手順追加 | 0/4 | handoff, production |
| AT-F53 | RB07 | 原条件の手順追加 | 0/4 | handoff, production |
| AT-F54 | RB08 | 原条件の手順追加 | 0/4 | handoff, production |
| AT-F55 | RB03 | 原条件の手順追加 | 0/4 | graph, collections, paging |
| AT-F56 | RB02 | 原条件の手順追加 | 0/4 | templates, drafts, structured |
| AT-F57 | RB02 | 原条件の手順追加 | 0/4 | catalog, projection-unit |
| AT-F58 | RB02 | 原条件の手順追加 | 0/4 | collections, catalog |
| AT-F59 | RB03 | 原条件の手順追加 | 0/4 | graph, collections, paging |
| AT-F60 | RB02 | 原条件の手順追加 | 0/4 | maintenance, references, navigation |
| AT-N01 | RB02 | 原条件の手順追加 | 0/4 | editor, conditions-ui, graph, collections |
| AT-N02 | RB10 | 実環境条件あり | 4/4 | editor, basic, recovery |
| AT-N03 | RB10 | 実環境条件あり | 3/4 | editor, conditions-ui, graph |
| AT-N04 | RB10 | 実環境条件あり | 3/4 | performance-fixture-unit |
| AT-N05 | RB05 | 既存入口を再実行可 | 0/4 | analysis-large, analysis-small |
| AT-N06 | RB06 | 原条件の手順追加 | 0/4 | migration, completion, import-worker, editor |
| AT-N07 | RB09 | 実環境条件あり | 4/4 | account-local, sync-unit |
| AT-N08 | RB09 | 実環境条件あり | 4/4 | sharing-local, projection-unit, account-local |
| AT-N09 | RB06 | 既存入口を再実行可 | 0/4 | import-errors |
| AT-N10 | RB07 | 原条件の手順追加 | 0/4 | production, projection-unit, exports-unit |
| AT-N11 | RB06 | 原条件の手順追加 | 0/4 | editor, completion |
| AT-N12 | RB05 | 原条件の手順追加 | 0/4 | reconfirmation, runtime-unit |
| AT-N13 | RB02 | 実環境条件あり | 3/4 | editor, conditions-ui, time-unit |
| AT-N14 | RB06 | 原条件の手順追加 | 0/4 | basic, recovery, import-errors |
| AT-N15 | RB10 | 原条件の手順追加 | 0/4 | completion |
| AT-N16 | RB02 | 原条件の手順追加 | 0/4 | conditions-ui, runtime-ui |
| AT-N17 | RB10 | 実環境条件あり | 2/4 | editor, completion |
| AT-N18 | RB02 | 原条件の手順追加 | 0/4 | completion, editor, migration |
| AT-N19 | RB04 | 原条件の手順追加 | 0/4 | writing, handoff |
| AT-N20 | RB08 | 原条件の手順追加 | 0/4 | handoff, exports-unit |
| AT-E01 | RB10 | 実環境条件あり | 4/4 | basic, editor, conditions-ui, graph |
| AT-E02 | RB10 | 原条件の手順追加 | 0/4 | time-components, time-unit, writing |
| AT-E03 | RB10 | 原条件の手順追加 | 0/4 | runtime-ui, fallback, runtime-unit |
| AT-E04 | RB10 | 原条件の手順追加 | 0/4 | narrative-unit, analysis-small |
| AT-E05 | RB10 | 実環境条件あり | 4/4 | sharing-local, projection-unit, account-local |
| AT-E06 | RB10 | 実環境条件あり | 4/4 | account-local, sync-unit |
| AT-E07 | RB10 | 原条件の手順追加 | 0/4 | import-errors, recovery |
| AT-E08 | RB10 | 原条件の手順追加 | 0/4 | production, recovery |
| AT-E09 | RB10 | 原条件の手順追加 | 0/4 | handoff, world-ui |
| AT-E10 | RB10 | 原条件の手順追加 | 0/4 | handoff, analysis-small, runtime-unit |
| AT-E11 | RB10 | 実環境条件あり | 4/4 | editor, graph, performance-fixture-unit |
| AT-E12 | RB10 | 実環境条件あり | 1/4 | migration, completion, import-worker, editor |

## 実行と判定

AP01/02/03後に候補commit/tree/build/baseと各input hash/seedを固定し、原givenを保存する。一ケースのwhenとthen/negative_or_edgeを同じfixtureで実行し、正常と失敗の実結果、cold/実ファイル/新規復元の保存点、証拠path/hash、実環境と日時を別runへ記録する。新しいrunを原監査へ上書きしない。

失敗は`failed`、実端末/接続等が足りなければ不足前提と次操作付き`blocked`、未着手は`not_run`、中止は確定点と入力保持付き`cancelled`とする。原4節を同一候補で観測して証拠を取得できた範囲だけを`passed`にできる。原116/24工程/6回帰群とrelease checkerのgateを維持する。完全保存600000ms、30回測定、113履歴、7200秒実時間を緩和しない。この計画の整合検査は製品合格ではない。
