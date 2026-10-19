# 1A：実行結果・CI・未実行条件

2026-10-19T06:10:35Z Draft提出。対象product sourceは開始main `a8caf979adc36c09f0ba7fcd3576b0472cff3392`、tree `a0d391556e4ff71fe752a48147e908d59e526bb3`。作業領域はAPIから取得した必要ファイルの部分snapshotであり、Git clone・clean candidate・製品buildではない。Markdown変更だけを提出対象にし、STATUS、製品、原文、fixture、runner、workflowは変更していない。

## 実行した検証

| 実コマンド・操作 | 実exit / 結果 | 対象・証拠と限界 |
| --- | --- | --- |
| 原contract-lock全行に既存 `check_phase1.verify_blob(root, record)` を適用 | exit0、取得済み72入力の全bytes・Git blob一致、未取得1件を明示 | [INPUTS](INPUTS.md)。未取得binaryを別入力で代替していない |
| 固定acceptance_casesとCLAUSE_REVIEWのID集合・各4原文をPythonで完全一致比較 | exit0、116 ID / 464原文一致 | INPUTSのcanonical digestと原ファイルSHA。実受入を推論しない |
| 原素材生成式の全3×24MiBを生成しSHA-256比較 | exit0、75497472実bytes・3原SHA一致 | `local-evidence/material-bytes/`。DB seed・保存・復元は未実行 |
| old32-recoveredの10実ファイルをGitHubから取得、各原expected bytes/SHAと比較 | exit0、14宣言 / 10 unique hash一致 | INPUTSのindex・実SHA。元宣言pathの欠落と残18を維持 |
| `python3 scripts/acceptance/execute.py --workdir /workspace/shinariokanri --receipt /workspace/1a-local-evidence/input-inventory-execution -- python3 /workspace/1a-local-evidence/verify-inputs.py` | exit0、上記原入力・ID/原文・旧14宣言・素材を最終inventoryへ結合 | 実wrapper、argv、stdout272 bytes / SHA `6534a13fda98d895343e79c3c68afbf9daad9532531b77c23ade8b4ebae8dacb`、実終了0を保持 |
| `PYTHONPATH=scripts python3 -m unittest test_check_phase3 test_check_phase3_expectations test_check_phase3_report -v` | exit0、26 tests OK | `phase3-kernels-local.log`。元30の欠損、丸め、fixture差替、driver/argv差替、pending hash、native archive等の既存反例。正式受入ではない |
| `python3 -m unittest discover -s scripts/ci -p 'test_*.py' -v` | exit0、25 tests OK | `ci-helpers-local.log`。CIの欠損・engine/run/attempt混同等の既存検査 |
| 既存 `seal_candidate.create_binding/verify_binding` を一時Git repoのsynthetic入力で直接呼出 | exit0、dirty source、sealed source変更、build commit/tree/dirty不一致、sealed dist差替を全て拒否 | 下記の実probe記録。対象製品をsealした証拠ではない |
| `python3 scripts/check_docs.py` | exit1、FAILED | 部分snapshotにresearch sources/technical/PROVENANCE、exampleがなく読取で停止。製品不具合とは判定しない。実receipt `local-evidence/documents-exit.json` |
| `python3 scripts/check_completion_plan.py` | exit1、FAILED | 部分snapshotに `docs/quality/pr2/review_baseline.json` がない。実receipt `local-evidence/completion-plan-exit.json` |
| `python3 -m unittest discover -s scripts -p 'test_check_*.py' -v` | exit1、99 tests、8 failures / 19 errors | 原資料、research PDF、旧測定raw/束、review registry等の不足。assert削除やskipで成功にしない。完全checkoutで再実行が必要。`local-evidence/document-evidence-tests-exit.json` と全log |
| `npm ping --fetch-retries=0 --fetch-timeout=10000` | exit1、EPERM | 既存proxyへのconnectが拒否。ViteはMODULE_NOT_FOUND、環境のPlaywright解決だけではbuild条件がそろわない |
| `git clone https://github.com/chameleonjp-lab/shinariokanri.git /workspace/shinariokanri` | exit128 | proxy port8080接続失敗。追加network要求は自動承認審査のcapacityエラーで未実行 |
| 新4文書の相対リンクを取得済みGit tree一覧に照合、既存 `select_scope('pull_request', paths)` 適用 | exit0、17リンク存在・documentation-only | 部分snapshot全体のcheck_docs成功を意味しない。scope拡大・検査削減なし |

上のlog名はローカル提出証拠束内のpathであり、GitHubにupload済みのartifact pathではない。logのbytes/SHA、実argv・終了は同梱 `MANIFEST.json` と実receiptで識別する。RTKは使っておらず、正式CI出力の圧縮・置換は行っていない。

## sealの直接probe

実行は `python3 - <<'PY'` で既存moduleをimportし、`seal.ROOT` だけを `TemporaryDirectory` 内の独立Git repoへ向けた。元runnerファイルの変更や製品sourceの変更はない。fixtureはtracked `src/x.ts`、生成runtime、1原文を含むlockとignored dist。cleanな対応buildでbindingを生成し、以下を順に操作した。これは追加の正式fixtureではない。

1. clean binding生成と `verify_binding(binding, exact_head=True)` 成功。
2. tracked source変更後の `create_binding()` は `Commit all candidate work before sealing`。同bindingのverifyは `Sealed bytes changed: src/x.ts`。
3. source復旧後、build-infoのcommitだけ、treeだけ、dirtyだけをそれぞれ差し替えると、全て `Clean production build must match candidate HEAD/tree`。
4. build-info復旧後にdist/app.jsのbytesを変更すると `Sealed bytes changed: dist/app.js`。distも復旧するとexact-head verify成功。

実stdoutは `seal-probe-transcript.txt` にtool返却の転記として保持。`build-info`を照合しない抜け道やdirty候補での製品測定は使っていない。完全checkout後も本物のsource/build/配信bytesをsealする必要がある。

## CIの照合

| 区分 | 実run / attempt / head | 実確認結果 |
| --- | --- | --- |
| #72統合main | [39181462652](https://github.com/chameleonjp-lab/shinariokanri/actions/runs/39181462652) / 1 / `096364269729c0958026ef6e92401ad1e53032a3` | completed / success。scope、documents、unit、3 browser、verifyの7 jobs全successをAPIで再確認 |
| 開始main（#74 merge） | [39201056932](https://github.com/chameleonjp-lab/shinariokanri/actions/runs/39201056932) / 1 / `a8caf979adc36c09f0ba7fcd3576b0472cff3392` | completed / success、scope/documents/unit/3 browser/verifyの7 jobs全successをAPIで確認 |
| 今回の変更 | [Draft PR #75](https://github.com/chameleonjp-lab/shinariokanri/pull/75) / branch `docs/1a-baseline-lock-20261019` / 未merge | この文書を含む最終head・実run/attemptと結果はPR本文へ記録。旧CIを本変更の結果へ付け替えない |

CIの正本は開始mainの `.github/workflows/ci.yml`。今回の予定4ファイルは全て `docs/implementation/**/*.md` で、既存 `scripts/ci/ci_controls.py` がPRでdocumentation-onlyと判定する範囲。scope定義を変更していない。Draft提出後はdocumentsとverifyを含む実runの最終状態を確認し、run/attempt/headをPR本文へ確定する。main pushは既存どおりfullであり、文書CI成功と正式受入成功は別判定。

## 未実行と阻害

- 現行 `npm ci` / production build / candidate seal / 原Standard・Large各30 / 元180保存 / 各size3標本heapは未実行。必要条件は完全checkout、lock依存、実engine・host library、許可済み測定host。同host直列で測定し、parallel buildを重ねない。
- 原N05 Large binary1件、旧C29・18宣言・04a7終了原本は未回収。対象ID・期待値・保存先候補・担当はBASELINE_NEXTとINPUTSにある。
- 実7200/full113・同一全量異常系の最終候補受入、116/464の現在実観測付き判定、外部22条件・独立確認・公開は未実行。原release BLOCKEDを保持。
- 初回の新規branch作成は自動承認審査の `Selected model is at capacity` で未実行だった。PR作成再開時に同じ承認付き経路でbranch作成が成功した。審査を回避せず、Draft PR #75を作成済み。本変更CIの最終結果はPR本文で別途記録する。
- ローカルの部分snapshotで出たdocument/99検査失敗を解消したと報告しない。GitHubの完全checkoutで必須4コマンドを含む本変更CIを確認し、その結果をPR本文へ記録する。ローカルの部分snapshotでの失敗は履歴として保持する。
