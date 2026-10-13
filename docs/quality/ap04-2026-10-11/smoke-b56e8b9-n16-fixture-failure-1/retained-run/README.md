# AP04 最初の Chromium smoke（準備のみ）

候補は `/workspace/runtime-verification` の clean `b56e8b953ee5398a8c4b97031b4a426bb6a9f512`、tree `46927ebcc8c8b016f5a23845d19745ccb05c0049`、build `1dc95b9eb4d844a28134`、base `/shinariokanri/`。実行していない。root が unit → AP02 → Large113 の占有を解除してから、次を一回だけ実行する。

```sh
bash /tmp/ap04-b56e8b9-smoke-preparation/run.sh
```

`preparation.json` に全タイトル、元 timeout、入力ファイル SHA/bytes、環境 script SHA、固定 build reference SHA、補助手順と未測定条件を記録した。browser は既存環境 script から読み、Chromium revision metadata と executable の path/size/mtime を固定する。executable 全体の SHA を事前測定したとは記録しない。

| 順序 | `tests/e2e/` のファイル | file 専用 grep | 件数 | timeout |
| --- | --- | --- | ---: | ---: |
| 01 | ap04-original-n-condition-parity.spec.ts | `AT-N16 ` | 1 | 30s |
| 02 | ap04-original-f-hierarchy.spec.ts | `AT-F13 ` | 1 | 180s |
| 03 | ap04-original-f-production.spec.ts | `AT-F5[12] ` | 2 | 180s |
| 04 | ap04-original-e09-world-production.spec.ts | `AT-E09 ` | 1 | 30s |
| 05 | ap04-original-n-f16-20.spec.ts | `AT-F16 ` | 1 | 90s |
| 06 | ap04-original-n-f14-trigger.spec.ts | `AT-F14 ` | 1 | 90s |
| 07 | ap04-original-f-index.spec.ts | `AT-F57 ` | 1 | 180s |
| 08 | ap04-original-f-resume-recovery.spec.ts | `AT-F33 ` | 1 | 180s |
| 09 | ap04-original-n20-targets.spec.ts | `AT-N20 ` | 2 | 30s |
| 10 | ap04-original-root-restoration-output.spec.ts | `AT-E07 ` | 1 | 180s |

計 12 tests / 10 files。各 attempt は `--project=chromium --workers=1 --retries=0 --max-failures=1 --trace=on --reporter=list,json,html`。timeout/global-timeout を上書きせず、N16/E09/N20 の 30s も維持する。根復元ファイルの旧 N20 は選ばないため、global grep による 13 件への混入は起こらない。

各 attempt を別ディレクトリに保持し、command、runner stdout/stderr、JSON、HTML、全 trace、Playwright exit code、source/build/environment before/after binding、実行 assessment を残す。HTML index と実行済み test の trace attachment が当該 attempt 内に実在することを確認し、SHA/bytes を assessment へ記録する。4173 を事前に free と確認し、`CI=1` で既存 preview を再利用しない。最初の failure、report欠落、件数違い、tee書込失敗、trace/HTML欠落、binding不一致で停止する。中断も記録し、起動済み directory は再利用しない。原因を修正した次候補は別 directory・別 commit/build binding で実行し、この失敗を上書きしない。

assessment の `passed` はこの選択した test の実行結果だけを表す。binding/retention が不適合なら attempt も `failed` と記録し、全原受入 status は `not_run` のまま、原四節の実観測レビュー後に別途判断する。

- F33 は同 browser の通常 archive/cold/history undo を検査するローカル補助。実 smartphone/別端末と missing-native-ID 分岐へ原合格を与えない。
- N20 二件目は supported declared type の陽性 control。未対応コマンドの original given や real Unity/Unreal/ink/Yarn 受領・実行へ代用しない。
- E07 の通常 complete 往復・原不正ファイル・既存 field1MiB L−1/L+1 をそのまま含む。`ap04-original-e07-safety-bounds.spec.ts` の他 10 境界を全て除外し、`not_run` とする。
- F13 orphan/cycle/depth の実 ancestor count は別 unit fixture。通常 UI の F13 test は undeclared entry/unresolved exit/condition error/unknown であり、三階層境界の UI 観測を代替しない。
- F18/E10 探索、Large113/AP03、実 Auth/RLS/private Storage/同期/物理端末は選ばず、原閾値を変更しない。
- 実 `.scenario` input Buffer と全 download の raw bytes は、候補に手を加えない外部 `artifact-hook.cjs` が各 attempt の `actual-artifacts/` に保存する。Buffer copy は元 Frame.setInputFiles の直前、download copy は元 Download.path の Promise 解決時に同期実行する。元 receiver/arguments/options/Promise/result/rejection をそのまま返す。page の download event からも元 path を読取りで観測し、caller が path を取得しなかった download を保存する。同じ実 Download object は一回保存し、同名の別 download は別 key で保持する。
- hook source、module version/source SHA、NODE_OPTIONS と scope を before/after に固定する。実 test/engine/ID、元 filename、URL/page ID、bytes/SHA を保存し、trace の実 input/download multiset と照合する。観測エラー、イベントに対する raw bytes 欠落、孤立ファイル、件数不一致は evidence incomplete として停止し、元 API の結果には介入しない。入力 UUID を再生成しない。
- これは外部観測の準備であり実測ではない。context が完了前に閉じた download、取消/拒否、remote Download.path、trace 自体の欠落では raw bytes が保存できない可能性がある。その場合は明示的な証拠不備となる。同期 copy と追加の読取 path API は観測負荷を生むため、性能測定の成功根拠へ転用しない。

失敗箇所の最初の通常操作と trace/error context を、その given SHA と同じ ID/cold backup 観測に結ぶ。fixture/schema 拒否、selector/oracle、製品不具合、30s budget を切り分け、検査の skip、原数値変更、成功 record の直接 DB 書換えはしない。F13/F51/F52/F57/F33 は F 担当、N16/N20/F16/F14 は N 担当（conditionDraft は条件担当も参加）、E09 と production sourceAffected は E 担当、E07 full-read は root/保存担当へ渡す。

この準備では `bash -n`、`node --check`、Python AST、source 宣言数・metadata の静的照合だけを行う。runner/hook/helper 自体、browser、build、unit、fixture export は実行しない。
