# AP04 通常操作の補修と原受入への対応

2026-10-11。原116ケース・464条項のgiven/when/then/negative_or_edgeを保ち、通常画面から実行できる入口と、そこで判明した不具合の修正を整理する。本書のcommandは実行入口であり成功記録ではない。最終候補のcommit/tree/build/base、入力ファイルとSHA-256、同じ原4条項の観測をそろえてから受入を判定する。未実行は`not_run`のまま保持し、旧C29・タイトル登録・unit・別fixtureの結果を原ケースへ移記しない。

初期の振り分けは[実行計画](LOCAL_ACCEPTANCE_PLAN.md)と[原文JSON](local_acceptance_plan.json)にある。追加した入口は[登録一覧](authored_entry_inventory.json)、各条項の操作/assert/ソースhashは下のproofへ結ぶ。登録一覧の件数・タイトル一致だけでは原4条項の確認を代替できない。

## 実欠陥・原因・修正した動作

| 補修 | 実欠陥と原因 | 具体的な動作・保持する値 | 関連原AT・実行入口 |
| --- | --- | --- | --- |
| 折りたたんだ章の診断 | graph所有の入口/出口診断がsceneへ渡らず、算出変数の全体初期化エラーで表示が止まった。さらにcycle/depth/orphan診断を上位集計の後に登録していた。 | sceneが属するgraphのID集合を既存problem identityで重複排除。条件ごとの例外を診断し、階層診断を登録してからscene/chapterを集計する。未完成・エラー・未確認を分け、graph rootと元node IDを保つ。 | F13。C01。 [flowStructure](../../../src/domain/flowStructure.ts) |
| 条件入力の実エラーコード | 編集画面は説明だけで純粋評価のコードを表示できず、無関係な算出変数のoverflow/cycleが対象比較のエラーを隠した。 | 採用変数の初期値から対象leafを共有評価器で評価し、実際のissue codeと既存入力説明を表示。選択途中・空欄の案内に独自コードを発行しない。 | N16。C02。 [conditionDraft](../../../src/domain/conditionDraft.ts)・[Fields](../../../src/ui/Fields.tsx) |
| 関係の保存理由と詳細 | 不適合な始終点の理由が事前に見えず、詳細の参照欄はraw typeのみで方向・有効時期・経路条件を欠いていた。 | 実在する型適合対象、自己関係/対称許可に基づく理由を表示。同じ関係IDの意味・向き・半開の期間・条件を詳細へ表示し、配置を正本へ変換しない。 | B07/B09、F55支援。C03。 [Relationships](../../../src/ui/Relationships.tsx)・[参照欄](../../../src/ui/EntityReferenceSection.tsx) |
| 状態差分の変更元 | 試読と二経路比較に、実際の変更元へ戻るUIがなかった。 | 記録された変更のedgeIdsと実行した線、最終値、各経路の対象版からリンクを決める。左/右の版を混同せず、後のstub・値ずれ・欠落pin・未実行線から変更元を推測しない。 | F16。C04。 [Reader](../../../src/ui/Reader.tsx)・[変更元解決](../../../src/domain/runtimeChangeOrigins.ts) |
| 借用した固定世界の提示 | 借用node/scene/lineをlocal-onlyで検索し、同IDの別pinに属する提示位置の版を正しく確認できなかった。 | hashを検査した捕捉referencesでgraph/chapter/line・開示・resetの文脈を解決し、提示位置を実際の固定世界pinと比較する。未確認pinを別の版へ読み替えない。 | F09/F16/F19の固定参照支援。C05。 [presentation](../../../src/domain/presentation.ts)・[検証開始](../../../src/domain/runtimeVerified.ts) |
| 同じきっかけの再送 | 通常画面に同じoccurrenceIdを再送する入口がなく、元whenの重複確認を新しいIDに置き換えていた。 | 「直前のきっかけを再送」で実記録の同じきっかけを渡す。状態更新・入室・再送・再入室を分け、once規則と旧版/状態の検査を保つ。 | F14。C06。 [Reader](../../../src/ui/Reader.tsx)・[runtime](../../../src/domain/runtime.ts) |
| 制作完了の自己無効化 | task自身のprogress/stage更新も参照元の変更と同じaffected集合へ入り、作者が再確認したdoneを即needs_reviewへ戻した。 | reverse参照からsourceAffectedへ届いた完了taskだけを再確認待ちにする。実際の場面・先行作業変更、翻訳/収録のsourceHash検査は維持。制作期限と世界日時を分ける。 | F51/E09。C07。 [production](../../../src/domain/production.ts) |
| 作者索引から本文・公開索引 | 作者索引の編集から本文へ戻る入口がなく、reader HTML/Markdownは既存publicCatalogを使っていなかった。 | 保存した分類/読みを選び、modalを閉じて既存onOpenTargetへ実rich field/block/Unicode位置を渡す。公開索引は既存公開投影の実本文アンカーへリンクし、秘密の名前・読み・alias・メモ・参照数を持ち込まない。 | F57。C08。 [索引編集](../../../src/ui/JapaneseIndexEntryEditor.tsx)・[exports](../../../src/domain/exports.ts) |
| 削除済みの再開登録 | favorite/recentには元IDが残るが、AppがdeletedAt/欠落対象を表示から除外し、説明も再開入口も失っていた。 | 登録UUID・順序を保ち、アーカイブ済み/見つからない原因と既存historyへの案内を表示。通常のactive対象は従来どおり開く。案内は自動復元せず、履歴取消で同じ本文IDへ戻す。 | F33の独立ローカル補助。C09。 [App](../../../src/App.tsx) |
| 制作対応先の選択と不一致 | 既存runtime guardに対応する通常UIの対応先選択がなく、不適合な外部入出力型を対象ID/項目で先に確認できなかった。 | 汎用runtime/単体試遊に実装/検証範囲の表と対応先selectを追加。汎用以外を拒否し、入出力型を個別に診断。選択変更で旧artifactを破棄。本文出力は利用者が別公開範囲を明示して選び直す。 | N20。C10。 [WorkPage](../../../src/ui/WorkPage.tsx)・[exports](../../../src/domain/exports.ts) |

native `.scenario` 1.0.0、serialized fields/kind/schema、runtime形式1.0.0/profile1.1.0、原数値上限・探索量・性能閾値を維持する。180,000msの新しい多段操作E2E budgetは、原性能閾値の変更ではない。完全保存のfull-read処理と大量履歴exportの性能補修・測定はAP03の別結果に結び、ここに原Largeの成功を作らない。

## 検証コマンド

最終ソースを固定し、同じbuild/baseで実行する。通常browser commandは`npm run build`後に`npm run test:e2e -- <file> --project=chromium --workers=1`を使う。以下はケースを選ぶ具体入口で、実行は統合担当が直列調整する。Firefox/WebKitを実行した場合もengineと版を別記し、実iPhone/iPadの証拠へ換算しない。

| 入口 | 通常操作 | 独立unit補助 |
| --- | --- | --- |
| C01 | `npm run test:e2e -- tests/e2e/ap04-original-f-hierarchy.spec.ts --project=chromium --grep AT-F13` | `npm test -- tests/flowStructureAncestorGraph.test.ts` |
| C02 | `npm run test:e2e -- tests/e2e/ap04-original-n-condition-parity.spec.ts --project=chromium --grep AT-N16` | `npm test -- tests/conditionInputIssue.test.ts` |
| C03 | `npm run test:e2e -- tests/e2e/ap04-original-bm-timeline.spec.ts --project=chromium --grep 'AT-B0[79]'` | 始終点・方向・period/conditionは同じgivenのUI/cold/実完全保存で確認する。 |
| C04 | `npm run test:e2e -- tests/e2e/ap04-original-n-f16-20.spec.ts --project=chromium --grep AT-F16` | `npm test -- tests/runtimeChangeOrigins.test.ts` |
| C05 | `npm run test:e2e -- tests/e2e/ap04-original-f-world-versions.spec.ts --project=chromium --grep AT-F09` と `npm run test:e2e -- tests/e2e/ap04-original-n-f16-20.spec.ts --project=chromium --grep AT-F19` | `npm test -- tests/borrowedPresentation.test.ts`。unitのborrowed pin fixtureを原givenの実操作へ代用しない。 |
| C06 | `npm run test:e2e -- tests/e2e/ap04-original-n-f14-trigger.spec.ts --project=chromium --grep AT-F14` | 同じ実記録のoccurrenceIdと状態/trace/onceを実UIで確認する。 |
| C07 | `npm run test:e2e -- tests/e2e/ap04-original-f-production.spec.ts --project=chromium --grep AT-F51` と `npm run test:e2e -- tests/e2e/ap04-original-e09-world-production.spec.ts --project=chromium --grep AT-E09` | `npm test -- tests/productionTaskReconfirmation.test.ts` |
| C08 | `npm run test:e2e -- tests/e2e/ap04-original-f-index.spec.ts --project=chromium --grep AT-F57` | `npm test -- tests/readerPublicIndex.test.ts` |
| C09 | `npm run test:e2e -- tests/e2e/ap04-original-f-resume-recovery.spec.ts --project=chromium --grep AT-F33` | 元F33の二端末条件とは別の補助。通常archive/cold/両list案内/取消/同UUID・段落IDを照合する。 |
| C10 | `npm run test:e2e -- tests/e2e/ap04-original-n20-targets.spec.ts --project=chromium --grep AT-N20` | `npm test -- tests/runtimeTargetCompatibility.test.ts` |

完全保存ファイルとそのSHA-256、実download成果物、cold後の正本ID/本文/旧版/素材bytesを記録する。nativeの読取照合は通常操作の保存を観測するために使う。明示した容量故障の注入でtransaction rollbackを確認しても、成功データの直接書換えで検査を通さない。

## 未測定・未実装の条件

| 条件 | 原ケースとの関係 | 本書の扱い |
| --- | --- | --- |
| 実smartphone/別端末・支援技術・実browser文字拡大 | F31/F32/F33ほか。F33補助は同browserのdesktop/phone-class表示のみ。 | 未実行は`not_run`。回転・分割画面・software keyboard・Files・VoiceOver/NVDAをCSS viewportやfont-size変更で成功にしない。 |
| missing-native-IDの再開案内 | F33補助は通常archiveのdeletedAt分岐を操作する。元IDが実際に欠けた分岐は別観測が必要。 | 案内コードの存在を実操作の成功にしない。historyは汎用画面への遷移で、自動復元や該当commandの自動選択ではない。 |
| 実Auth/reviewer/comment出所・RLS/private Storage・二端末同期 | F29/F30/F34/F59ほか。既存review fixtureとidentity UUIDはローカル内容保護のgiven。 | 別の実接続で確認する。UUID・モックHTTP・公開readerの秘密不在を実役割制御へ換算しない。 |
| 未同期保護解除後の置換と異作品の明示対応統合 | F35。新規/clone/同project merge/rollback入口とは別の実操作。 | 保護拒否をreplace成功にしない。実ACK後のreplaceと異project mapped mergeを別記録する。 |
| 専用tag query | F57は既存custom enumタグ、全文、作者索引の区別を扱う。 | 専用tag query op/UIは未実装。この独立機能の完成を既存欄から推測しない。 |
| 借用世界/reuseの変更元・stub/値ずれ/欠落pinのUI抑止 | F16の現行経路と独立unitを支援に使う。 | 各実UI・対象版で別に観測する。unit/source reviewだけで旧pin navigationを完了にしない。 |
| 任意外部コマンド・Unity/Unreal/ink/Yarn変換と実engine受領 | N20。実装済みは汎用scenario-runtimeだけ。 | 変換器・任意コマンドの実行は未実装/未観測。陽性controlを未対応原givenへ転記せず、不一致の拒否と明示した本文出力を区別する。 |
| 原Large性能・大量履歴/全出力profile・最終原116 | AP03および原N/Eの固有given/数値条件。 | 小規模fixture・新timeout・局所unitで代替しない。失敗・未測定は元結果を保持する。 |

## 条項proofと利用者向け説明

F担当の[24ケース・96条項proof](ap04-original-f-proof.json)と[操作計画](ap04-original-f-plan.md)は全節の原文、実ソース行、操作/assert、依存hashを持つ。F33はこの96条項外の独立補助で、元F33全体の合格は付けない。[B/M proof](ap04-original-bm-proof.json)、[F07–12 proof](ap04-original-bm-f07-12-proof.json)、[N proof](ap04-original-n-proof.json)、[N20 proof](ap04-original-n20-target-proof.json)、[E proof](ap04-original-e-proof.json)、[根復元・出力proof](ap04-original-root-proof.json)、[安全境界proof](ap04-original-e07-safety-bounds-proof.json)も同じ最終候補へ結ぶ。最終安定後に各ソースhash・callback行を更新し、実行結果と未測定条件を分けて保存する。

通常の使い方は[利用者ガイド](../../implementation/USER_GUIDE.md)、出力形式と拒否条件は[出力互換性](../../implementation/EXPORT_COMPATIBILITY.md)を参照する。

## main からの工程ブランチ

[AP04 独立工程候補](../ap04-phase-2026-10-11/README.md)に前提 PR47、actual source commit/tree、最新統合 source との全非 docs byte 一致と限定保持資料を記録した。工程候補の build/UI/unit/性能/CI と原464条項は未実行である。
