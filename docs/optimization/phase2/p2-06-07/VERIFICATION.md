# 検証証拠と実施範囲

## 原条件と出所

依存PRを仮に統合したtreeではなく、実main `a13d8fa` から開始した。#67で成功したrun `39103860047` attempt 1の全7 jobと同一treeを確認。元1349 unit/142 files、3 engine各245 inventory、recovery originals、後続rb03/rb04/rb10、aggregateはそのソースの既存証拠であり、今回の変更を検査した結果へ読み替えない。

今回のproduct比較はclean literal commitで取得した。最終採用ソース `886d0c0e664c159b53be22bb9e19cc0d7df8159d` の全src/package/lockと提出時の製品bytesを追加検査する。追加の報告書・証拠checkerは測定後にも更新されるため最終PR headとは区別する。各captureのsource commit/tree/blob、measurement overlay、runtime source、実Vite build、全ZIP member SHA256を検査する。測定harness buildは通常製品buildと別物であり、通常buildも原CIで実行する。

## RED→GREENと独立検査

| 問題・検査 | 失敗の証拠と修正後の範囲 |
| --- | --- |
| 正式参照葉の本文漏れ | 元実装3 fail/1 pass → modelのleaf pathを除外し73 tests/7 files |
| store所有と別account/role/schema/world/root/mutable/foreign境界 | 再compileの4反例fail → 所有/lifetime/予算/共有の追加検査と既存domain/UI/storage検査 |
| async参照のrole取消 | progress `[0,3]` を公開した反例 → await境界で取消し部分公開なし |
| 戻り値containerと未知mutable入力 | 元共有実装の2反例fail → 独立containerとfull fallback |
| Node既存計測CLIとの互換 | 新規parameter propertyのstrip失敗 → 明示field代入。自動Node実行を追加 |
| descriptor網羅 | missing APIの2 failと独立baseline pass → 43 kind/345 field、元UI/public/schema完全比較 |
| collection page/選択/ordinal | missing API、publication中のsource変更、row ID不一致、await後frame、不要依存index構築をそれぞれ再現し修正 |
| real saved edits | public store APIで改名/別名/並替/アーカイブ、全件filter/providerの順序と非表示選択を比較 |
| componentのready参照行 | 実Chromiumでschema変更後0件となる反例 → ready rowsにrevocable guardを保持し1件へ。25 tests/3 files |
| 未登録deep-frozen collection | 独立reviewのP1、schema変更後に古いIDが残る1 fail → 未登録は常に全再生成、47 tests/4 files/tsc成功 |
| 証拠manifest全削除 | 空matrixを成功にできるreviewのP1を再現 → 必須7 label×2 suite、固定sourceと必要artifactを検査 |
| 同数ID差替・p95改竄・ZIP改竄 | 全件order、saved-edit固定SHA、全raw sample/順序、OFF/ON分離、実ZIP member、原fixture、close上限を負例で検査 |
| Node案比較の欠落・scope昇格 | mode欠落/false p95/full resultをpageと報告/backend偽装を再現 → 90 rotating OFF rowsと別ON、明示fake-IDB/no latencyを検査 |

`scripts/test_check_phase2_indexes.py` は原CI documents jobの既存unittest discoveryに含まれる。保存済みevidence一式の正検査と、欠落/改竄の負検査を行う。過去のarchive checkerを弱めず、そのexact source coverage検査を再利用する。現在srcとの比較は今回の提出時だけ明示flagで行う。

独立全件order検査は同じrunnerをliteral main/P2-06/全B/全B8Mi/最終案/最終4Miへ適用する。Node fake-indexeddbのactual ScenarioStore public APIで元5 query、改名+別名後4 query、archive後3 queryを取得する。独立したkind/name/id割当の期待SHAとfull filter、provider.ids、全60件page連結の実SHAを照合し、hidden selectedを別取得する。baselineにないproviderはnull/unsupportedであり0件成功にしない。native UIのsaved current正規化SHAとfixtureを照合するが、このNode検査をnative persistence/ブラウザ時間の証拠にはしない。

## 計測失敗・不利な値の保持

`proof-full-b-standard-01` は元から存在する `SyncProtocolError` のparameter propertyがNode strip-onlyに対応しないため失敗。既存製品構文を変更せず、全proofを明示 `--experimental-transform-types` と同じrunnerで実行した。`-02` はdefault sandboxのchild-process `git` がEPERMとなり測定前に停止（JSONなし）。network許可の付いた同じワークスペース実行で `-03` を新規保存した。失敗attempt/元logを削除・上書きしていない。

旧collection prototypeのcold query増加、Standard predicateの劣化、Bのprepare/read追加費用、heapの増加値・close後の残存を保持する。ON時間をOFFへ混ぜない。試作前後のソース変更を同一sourceの比較と呼ばず、固定source matrixで示す。

保存したraw logには元出力の末尾空白があるため、整形検査でraw logを変更しない。製品・文書の差分整形検査は `evidence/` を除く範囲で成功し、CSVは数値を変えずLFへ修正した。全差分の空白警告と対象範囲を分けて記録する。

## ローカル検査と最終CI

P2-06単独時点で原full unit 144 files/1370 tests（497.92秒）、最初のP2-07試作で147 files/1385 tests（496.37秒）が成功。その後の反例・失効修正を含む最終提出ソースは原workflowの全unit/build/3 engineで再検査し、最終head/run/attempt/実数・artifactをDraft PR本文に記録する。

元F58/F60/catalog noteと新しい反例はChromium 9 tests/35秒、新規UI反例は3 engine/17.2秒で事前確認済み。さらに最終製品sourceで以下を実行した。ただし提出時の新しい全CIを代替しない。workflow/inventoryを減らしたり、retry/timeout/skipを変えたりしていない。

| 最終製品sourceのローカル確認 | 実結果 |
| --- | --- |
| 原unit全件、1 worker/非並列 | **148 files / 1,390 tests成功、505.07秒**、[生ログ](evidence/logs/final-full-unit.log) |
| 元tsconfigによる通常build | 成功、[生ログ](evidence/logs/final-build.log) |
| 文書系Python（新しい証拠19 testsを含む） | 73 tests成功、[生ログ](evidence/logs/final-python-doc-tests.log) |
| CI制御/復元原本Python | 25 tests成功、[生ログ](evidence/logs/final-ci-controls.log) |
| 追加UI反例、Chromium/Firefox/WebKit | 全3 tests成功、16.0秒、[生ログ](evidence/logs/final-three-engine-counterexamples.log) |
| docs/completion/phase1原73入力・104対応/過去source/new evidence-current | すべてexit0、`final-check-results.json` と各log |
| 元release guard | 期待どおりexit1、RELEASE BLOCKED、[生ログ](evidence/logs/final-release-blocked.log) |

全コマンド・実exit・実施時刻は [final-check-results.json](evidence/final-check-results.json)。製品src/package/lockはこの全検査中および提出時に測定済みsourceと一致する。

提出時ローカル検査の実行結果は `evidence/logs/final-*` とmanifestに記録する。CIはその後の外部結果であるため、未実行を成功とする静的snapshotは作らない。

最終whole-branch agent reviewでは既指摘2件の軽量反例再実行、全UI/proof/designの重い区間の非重複、元UIへの復帰、失効・秘密・証拠境界を確認し、追加のP1/P2なし。指摘された起動計測の説明を修正し、各Storeは新規だが同じseed済みDB/contextを事前読込した区間であることを明記した。最終回答と対応は `evidence/review.txt`。原条件の独立した人の第3段階受入をこのagent reviewで置換しない。

## PR #68 初回CI失敗と計測条件の修正

初回run `39126143827` attempt 1、提出head `33982c0` は、原numeric observationで失敗した。Chromium/Firefoxは各245 passed/1 failed。元harnessの `query.index.builds === 2` に対し、製品defaultの実値が1 build/1 shared hitだった。ローカルでも元テストの同じ失敗を再現し、補助consoleを一時追加したtraceで実counterを確認した後、consoleを除去した。元失敗artifact（ID `12136049367`、SHA256 `72074c48b0d924f3e750caaa29bd5d79fd9afde0f684ea700198f8618d3a0c75`）・生log・RED・数値診断を保持する。

元E2Eブロックと元2 build assertはbyte/式を保持する。profile内のseed/readerだけに `disabled-baseline` を設け、既存internal optionで共有を無効化し、実際に2回構築する従来比較条件を継続する。growth/calibration/Appのfactoryや製品設定へ波及させず、counterの補正も行わない。1引数profileはこの従来条件であり、返却JSONにmodeと「製品default性能ではない」scopeを明示する。

追加E2Eは通常factoryの `product-default` で同じ元fixture/保存行数/hash/history/秘密/close条件を再検査し、実1 build/1 hitを要求する。元queryの結果は空だったため、同じ元fixtureの2人目のcharacterに対する非空15件も追加した。event.participantsとscene.eventIdsを直接走査した独立期待順序と実結果の全ID/順序SHAを比較し、2回とも共有hit、追加構築0、close後の全論理保持0を要求する。oracle/hash処理はqueryの時計外である。

計測CLIは `--derived-index-mode` を追加し、既定を明示的に `product-default` とする。baselineは明示flagでのみCLIから選び、modeを出力へ記録する。過去の計測値を読み替えない。ローカルのCLI両条件はChromium `154.0.8037.57` で成功し、default=1 build/1 hit・独立15件SHA一致、baseline=実2 build/0 hitだった。この追加実行は修正中のdirty tooling bytesを各sourceFiles SHAで記録した診断であり、新しい性能比較ではない。

修正後の両条件はChromium/Firefox/WebKitの計6 tests成功（51.4秒）。型検査、通常build、docs/completion/phase1、新証拠current-source検査も成功した。修正後のPython文書/証拠73 testsも成功（13.877秒）。独立reviewは追加P1/P2なし、元テストblockと製品src/package/lock/性能計測3overlayの不変を確認した。製品bytesは依然として測定source `886d0c0` と一致する。提出inventoryは元245件＋既存追加UI反例1件＋新default観測1件の各engine247件となる。

証拠は [ci-repair.zip](evidence/ci-repair.zip) に元bytesのまま収容し、manifestとcheckerでZIP全memberのbytes/SHA/coverageを検査する。最終の原全7 CI・復元原本・後続回帰・aggregateは修正後headで確認し、実run/head/tree/結果をDraft PR本文へ記録する。この文書は再CI前のsnapshotであり、上記ローカル成功を全CI成功へ代入しない。

## 未実行・原release条件

原8指標×Standard/Large各30、元6条件×30の180保存、実7200秒soak、最終候補の88,003記録/113履歴・送信待ち/実72MiB、600000ms完全保存/new/clone/cold、2000ms進捗/取消の正式再受入は第3段階。補助UI 180 query actionsや1回のrenameをその成功へ代入しない。原rb10等のCIが成功しても、全正式再受入を実施したとは表現しない。

実機試験は対象外。22件の外部条件と既存release不足の分類・件数を保持し、mock/自動タッチを実機または実認証/実サービス合格へ置換しない。production/Auth/権限/Supabase/支払/公開/配備・追加mergeは行わず、RELEASE BLOCKEDを維持する。
