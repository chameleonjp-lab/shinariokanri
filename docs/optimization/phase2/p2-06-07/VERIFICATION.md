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

## ローカル検査と最終CI

P2-06単独時点で原full unit 144 files/1370 tests（497.92秒）、最初のP2-07試作で147 files/1385 tests（496.37秒）が成功。その後の反例・失効修正を含む最終提出ソースは原workflowの全unit/build/3 engineで再検査し、最終head/run/attempt/実数・artifactをDraft PR本文に記録する。

元F58/F60/catalog noteと新しい反例はChromium 9 tests/35秒、新規UI反例は3 engine/17.2秒で事前確認済み。ただし提出時の新しい全CIを代替しない。workflow/inventoryを減らしたり、retry/timeout/skipを変えたりしていない。

提出時ローカル検査の実行結果は `evidence/logs/final-*` とmanifestに記録する。CIはその後の外部結果であるため、未実行を成功とする静的snapshotは作らない。レビューの最終回答と対応も証拠へ保存する。

## 未実行・原release条件

原8指標×Standard/Large各30、元6条件×30の180保存、実7200秒soak、最終候補の88,003記録/113履歴・送信待ち/実72MiB、600000ms完全保存/new/clone/cold、2000ms進捗/取消の正式再受入は第3段階。補助UI 180 query actionsや1回のrenameをその成功へ代入しない。原rb10等のCIが成功しても、全正式再受入を実施したとは表現しない。

実機試験は対象外。22件の外部条件と既存release不足の分類・件数を保持し、mock/自動タッチを実機または実認証/実サービス合格へ置換しない。production/Auth/権限/Supabase/支払/公開/配備・追加mergeは行わず、RELEASE BLOCKEDを維持する。
