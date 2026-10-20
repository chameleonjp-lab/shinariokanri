# 3B：開始条件・証拠範囲・正式未実行の記録

2026-10-20 UTC、統合担当1人、子担当なし。対象はNP05最終比較・NP06正式実行・NP16統合後受入の3Bだけ。

**結論：3Bは阻害。正式最終候補Fは未固定、正式5実行はすべて未起動、NP05/06/16は未完了。** #82のユーザーmergeと最終文書CI成功を確認したが、3Aの必要成果は準備のみで、1A現行基準と段階2成果・採否も不足している。準備mergeを正式開始条件の充足へ読み替えない。

## 読取範囲と開始点

[README](../../README.md)・[GUARDRAILS](../../GUARDRAILS.md)・[STATUS](../../STATUS.md)・[3B依頼書](../../requests/3B.md)・指定handoffを入口にした。1A baselineと1D正式runbook、実CIの定義へ必要な範囲だけ広げた。全履歴・全生ログから不足引継ぎを推測していない。開始mainに `handoffs/3B.md` は存在しない（Contents API 404）、今回は新規作成。

| 識別 | 確認値・有効範囲 |
| --- | --- |
| 更新main | `052c423ba7079e3843f15deb03d8e8d03ccbcdc8`（#82 merge、2026-10-20T09:24:04Z） |
| Git root tree | `c5c6561ddf7a439ed2c4d2cf9cea52816218e8b8` |
| src subtree | `6c0098365af131f13d36c53b499f458a36ae225e`（Git tree APIで照合） |
| PR作業 | 新規branch `docs/3b-formal-readiness-20261020`。このmainをparentとする文書差分 |
| tested product / F | なし。開始mainは読取対象であり、正式検証済み製品ではない |
| evidence head/tree | 自身を含むSHAは自己参照せず、提出後のPR本文・CIで確定する |

AGENTSはrootのものを確認した。変更pathの祖先5箇所の追加AGENTSはContents API 404。root treeは取得できたが、recursive treeの読取はTransport closedで失敗したため、全path監査成功とは記さない。必要な入口はpath指定で取得した。Cloud shellでの `rg` や製品検査はG06確認後に追加していない。

## 実mergeと依存CI

09:27 UTCまでのGitHub API再取得。すべて `merged=true`、merge actorは `chameleonjp-lab`。runのheadが各最終PR headに一致することと、latest jobsの結果を確認した。#78はattempt2。全7 jobsとはscope/documents/unit/3engine/verifyのjob結果であり、ZIP全memberの今回独立監査を意味しない。

| PR | 最終PR head | 実merge commit / UTC | 最終run / attempt / 結果 | 実行範囲 |
| --- | --- | --- | --- | --- |
| [#75](https://github.com/chameleonjp-lab/shinariokanri/pull/75) | `760dd507749d62778ac5456566eb7d42cd5fa22e` | `6611287b986553f90c6d8587c7bff2d64afac458` / 2026-10-19T06:30:54Z | [39208529291](https://github.com/chameleonjp-lab/shinariokanri/actions/runs/39208529291) / 1 / success | 文書scope成功、unit/browser skipped |
| [#76](https://github.com/chameleonjp-lab/shinariokanri/pull/76) | `37839fa12a30b1475c8d0ac646e4b87dc595d90c` | `bd9e74164ccc54b2f480116e546e2af73ffc4c82` / 2026-10-19T08:02:17Z | [39213058156](https://github.com/chameleonjp-lab/shinariokanri/actions/runs/39213058156) / 1 / success | latest全7 jobs成功 |
| [#77](https://github.com/chameleonjp-lab/shinariokanri/pull/77) | `3dd828078a31b4264bf621c36d2196487e3d619c` | `aa86e25b91287329c061a97d1d3f9c4e0e0e9f85` / 2026-10-19T08:29:09Z | [39213727737](https://github.com/chameleonjp-lab/shinariokanri/actions/runs/39213727737) / 1 / success | latest全7 jobs成功 |
| [#78](https://github.com/chameleonjp-lab/shinariokanri/pull/78) | `e0ba37ae1c6ac36e4b847d39dcc06ffbd046fafc` | `14d78659320fda40babe751116df171b767055bc` / 2026-10-20T01:00:33Z | [39275412553](https://github.com/chameleonjp-lab/shinariokanri/actions/runs/39275412553) / 2 / success | latest全7 jobs成功 |
| [#79](https://github.com/chameleonjp-lab/shinariokanri/pull/79) | `192127931f2f5313af0c34df19aaaad078009088` | `4a67e85fd7f292e26b2d7d766baa0dd3ab348b6e` / 2026-10-20T03:53:32Z | [39351906891](https://github.com/chameleonjp-lab/shinariokanri/actions/runs/39351906891) / 1 / success | 文書scope成功、unit/browser skipped |
| [#80](https://github.com/chameleonjp-lab/shinariokanri/pull/80) | `20242c1bceb8fea6fdafbd98b3aa5ace503481e7` | `4930bd5bf3c3f53cf65483e270e8df94d515be2c` / 2026-10-20T07:48:14Z | [39367868843](https://github.com/chameleonjp-lab/shinariokanri/actions/runs/39367868843) / 1 / success | 文書scope成功、unit/browser skipped |
| [#81](https://github.com/chameleonjp-lab/shinariokanri/pull/81) | `68c3bd57457ec8738074e00b93e6d7309550301e` | `4f3110963794eb142340282b2267a266feac585f` / 2026-10-20T08:28:13Z | [39392670959](https://github.com/chameleonjp-lab/shinariokanri/actions/runs/39392670959) / 1 / success | 文書scope成功、unit/browser skipped |
| [#82](https://github.com/chameleonjp-lab/shinariokanri/pull/82) | `0c98e6271f90f68877a8eb684410dffc640a4430` | `052c423ba7079e3843f15deb03d8e8d03ccbcdc8` / 2026-10-20T09:24:04Z | [39395617121](https://github.com/chameleonjp-lab/shinariokanri/actions/runs/39395617121) / 1 / success | 文書scope成功、unit/browser skipped |

- #82はmerge済みだが、[3A handoff](../../handoffs/3A.md)と[PR本文](https://github.com/chameleonjp-lab/shinariokanri/pull/82)はNP15未実装・未実測、A/B採否保留、3Bへ進まないと明記している。
- 直前main `4f3110963794eb142340282b2267a266feac585f` の[run39393627941 / attempt1](https://github.com/chameleonjp-lab/shinariokanri/actions/runs/39393627941)は、今回APIでcompleted/successを確認した。3A提出時点の「未確定」を補正するが、NP15実比較やFの正式受入には使わない。
- 開始mainの[run39400397936 / attempt1](https://github.com/chameleonjp-lab/shinariokanri/actions/runs/39400397936)、head `052c423ba7079e3843f15deb03d8e8d03ccbcdc8` は **2026-10-20 09:27:57 UTCの照合時点でin_progress**。scope/documents成功、unitの元npm test実行中、build/3engine/verifyの最終成功は未確認。提出時の最新観測はPR本文へ別記する。
- STATUSに残る[run39388952025 / attempt1](https://github.com/chameleonjp-lab/shinariokanri/actions/runs/39388952025)のLarge同一性5000ms timeout/exit1は履歴として保持する。今回原因を調査・再現しておらず、後続成功を理由にflakyや解消済みと断定しない。

## baseline・runbookと未成立条件

| 条件 | 所在・現在の意味 | 判定 |
| --- | --- | --- |
| 1A変更前基準 | [BASELINE_NEXT](../../BASELINE_NEXT.md)、[1A handoff](../../handoffs/1A.md)、[INPUTS](../../baselines/1A/INPUTS.md)。現行30/180・各size3標本heap・clean build/配信bytes/seal未取得 | 不足 |
| 段階2必要成果 | STATUSと3A handoffにNP09/10・NP11/13・NP12/14未実装/未実測・採否保留。#79〜81は準備文書merge | 不足 |
| 3A必要成果 | NP15のC/A/B実比較・独立負例・採否と必要実差分の統合が未了。文書CIのみ成功 | 不足 |
| 正式手順 | [RUNBOOK_NEXT](../../../../acceptance/phase3/RUNBOOK_NEXT.md)。5実行・実exit/cleanup・前後seal・独立verify・失敗/再開を規定 | 手順あり、実行なし |
| 実行host | 許可済み通常測定host、実browser/lock依存、十分な保存領域、永続回収先の指定なし。G06でCloudを測定hostへ転用しない | 不足 |

1Aの全体基準と改善直前Pnの対照、最終Fは別bindingとする。src subtreeの一致だけでbuild/dist/helper/driver/browser/fixtureの同一性を認定しない。原04a7/1fcの30/180成功や既存1Bの補助成功を現在Fへ移すことはしない。

## 候補・build・fixture・配信bytes・原本SHA

| 区分 | 今回の状態 |
| --- | --- |
| candidate.json / candidate.zip・前後seal | 未作成。F未固定、clean checkoutも未取得 |
| build ID / build-info.json / build receipt | 未取得。今回 `npm ci` / `npm run build` 未実行 |
| 配信asset inventory / 実bytes / SHA | 未取得。実browserへ読み込ませたdistなし |
| formal run / attempt / driver / argv / PID | 正式runner未起動、正式attemptなし。開始mainのCIとは別 |
| formal raw / native / sequence / exit / cleanup | 未取得。exit0・cleanup成功・seal一致を主張しない |
| 速度 / DB仕事量 / 論理保持 / 実heap | baseline/candidateとも今回実測なし。比較不能、改善率なし |
| peak / RSS / Worker / native memory | 未測定。GC後heapやcache予算から外挿しない |

以下は1A台帳に固定された**原入力の期待値**であり、今回Fでseed・保存・復元した観測値ではない。元ファイルを変更していない。原Large binaryは1B取得済みと1D/STATUSが記録しているが、今回は実bytesを再取得・再hashしていない。

| fixture | seed / records / 素材bytes | 原fixture SHA-256 |
| --- | --- | --- |
| Standard | `standard-r06-v1` / 8800 / 0 | `de0b9420abec95bcc37fc7fb7c3dc4c2667082258678f750af33bb53f8a557f5` |
| Large | `large-material-rb10-v1` / 88003 / 75497472 | `814daf96a6511cf47409f3497b03c7ba0309af250bfd87306c44a1dec5d5a917` |

原素材は各25165824 bytes、3件合計75497472 bytes。hashは順に `cb2412ade4973232e3a878bab47bfe95ab73852e9c30d10e6783284e93d07ac8`、`95dfa16729f2abcd367ff6a0b44d80d117d02e18be4b696b120b7a24238f298e`、`7f2bed51835af886a64f04b343803cb8f86b5c368e3de147401bba2efe21b71b`。

原binary `tests/fixtures/rb10-large-analysis/original-large-long-branch.scenario` は1914098 bytes、Git blob `566cd06cc4602d31aff08b0bdd5830c29888c039`、metadata記載SHA-256 `1ca2b19dcf4c8464c68a24a1bbe02cd1b1c4be20187ed2cee99d4e541822d0d0`。正式soakから出力したnativeのSHAではない。

| fixture定義の元原本path | 1A台帳記載bytes / SHA-256（historical） |
| --- | --- |
| `docs/optimization/phase1/evidence/candidate-standard30.json` | 317715 / `31bbe08bcbf137bff3cd47c2ecb5e5e2ba893a700b1889eb721d2b29a46e8f24` |
| `docs/optimization/phase1/evidence/candidate-large30.json` | 314322 / `d43e30a67238a920b72973a6e936fae0cf00802fd8ffde14559e7a00b1b67f66` |
| `tests/fixtures/phase3/historical-original180.json.gz` | 22566 / `0c690f80c1f92d0f2a9a6737cca47a1dda74e3e9297d6b95ed2d94f80b047b5f` |

## 正式実行の未実施台帳

全行が**未起動、raw/実exit/cleanup/前後seal未取得**。実行済みの行や中断した正式PIDはない。3Bの製品変更・候補変更もない。

| 原順序 | 必要な実条件 | 今回 |
| --- | --- | --- |
| 1 performance-standard | 原8指標×30、nearest-rank・未丸め値、図/年表は30 gestures×11 frames | 未実行 |
| 2 performance-large | 原8指標×30、同一原fixture。上限なし6指標の追加目標は未採用 | 未実行 |
| 3 saves180 | 3保存形式×2 fixture×30、各command p95≤1000ms、UI時間は別欄 | 未実行 |
| 4 soak | 実7200秒・112編集・88003記録・113履歴/送信待ち・実75497472素材bytes、full113をnew/clone/coldで独立対照 | 未実行 |
| 5 exceptions | 直前soakの同じ全量ファイル、破損/unknown major/最終error/quota/通常retry→cold、21表原子性・未保存入力 | 未実行 |
| 正式後の補助 | FでのN05別イベント2download・原RG補助・6職種接続、厳密なbinding照合 | 未実行 |
| NP05資源比較 | 同じhost/browser/fixtureで各size3標本、強制2GC後main-renderer V8 heapとlogical retention | 未実行 |
| 封入・独立照合 | formal包、check_phase3→verify_bundle、全ZIP member/CRC/bytes/SHA・空領域への再取得 | 未実行 |

再開時は既存RUNBOOKの順で実行し、正式・資源測定・buildを同じ資源で並行させない。時間短縮、編集数からの換算、別attemptの足算、失敗標本の削除、別候補への成功付替えはしない。完全出力600000ms・進捗/取消2000ms、実full113/全162117 owned IDs・全pending・cloneのdisjoint bijectionと各実素材hashを保持する。NP06とNP16は同じ成功した正式一式を参照し、NP番号の違いだけで二重起動しない。

runnerの `--output` / `--only`、canonical順、30/7200、verify_bundleの実wall確認を現行sourceで読取確認した。`verify_bundle.py` はCLIではなく `python3 scripts/check_phase3.py --evidence DIR` から呼ぶ。`measure_resources.mjs` へ `--help` を実行していない。これは入口の静的確認で、実行・負例検証ではない。

失敗修正でsource/tree/buildが変われば、新候補・新seal・新outputで必要な正式一式をやり直す。中断時はRUNBOOK 6節に従って元PID/exit/sequenceを確認し、正常終了済みcanonical prefixと全bindingが一致する場合に限り次の未実施stepを `--only` で継続する。running/failedをcompletedへ編集しない。95MiB制約超過時は全証拠を保持し、輸送/checker互換のレビュー前にformal完了としない。

## 本PRの変更・検査と有効範囲

所有pathはこの `evidence/3B/VERIFICATION.md` と `handoffs/3B.md` の2 Markdownのみ。STATUS、他handoff、製品、共有型/manifest、原fixture/JSON、runner、workflow、依存、assert/timeout/retry/engine、証拠保持を変更しない。性能案の採用判断は保留のまま。戻す場合は追加2文書だけをrevertする。

初期環境確認の `git clone https://github.com/chameleonjp-lab/shinariokanri.git /workspace/shinariokanri` はproxy:8080接続失敗で実exit128、候補checkout取得前に終了した。正式runnerは起動していない。G06確認後はGitHub連携と既存Actionsの文書作業だけで、Cloudで製品依存導入/build/テスト/測定を行わない。環境の作成/変更や追加権限申請もしていない。

`.github/workflows/ci.yml` と `scripts/ci/ci_controls.py` の既存保守的scopeを確認した。2 Markdownは `docs/implementation/` の文書pathで、JSONや検査入力を文書扱いにしない。最終版について以下を既存Actionsで実行し、実コマンド・exit・件数・run/attempt/head・実checkoutは提出後PR本文へ確定する。

- `python3 scripts/check_docs.py`
- `python3 scripts/check_completion_plan.py`
- `python3 -m unittest discover -s scripts -p 'test_check_*.py' -v`
- `python3 -m unittest discover -s scripts/ci -p 'test_*.py' -v`
- scopeの実path判定とverifyの `product_checks=not_run_documentation_only`

文書CI成功の有効範囲はこの版の静的文書整合性と既存helper検査だけ。元全unit/build/3engine/全artifact独立監査、正式受入、NP05比較、NP15採否には使わない。正式原本がないので、新formal raw/nativeのpath・SHAは未取得とする。ログをGitへ再添付・公開していない。

原104要件/116ケース/464条項/24工程/6回帰群/68補助、原外部22＋別3条件（実2account、旧C29/18宣言、CP15独立確認）を保持する。未採用Xと元9 release gate/BLOCKEDを維持し、今回release checkerを実行していない。3Cの逐条確定・証拠再取得へ完了として渡さない。

## 読取原本のGit blob固定

以下はすべて開始main `052c423ba7079e3843f15deb03d8e8d03ccbcdc8` に存在する読取資料。Git blob SHAは原本の場所と版を示し、測定rawのSHAやsealの代用ではない。

| path | Git blob SHA |
| --- | --- |
| `AGENTS.md` | `0920e85a1de4a5fc6658f7caf776f1f09efbc4c8` |
| `docs/implementation/codex-next-stages-2026-10-19/README.md` | `b5f49921688f572813e9c637ad140f27c8c8570e` |
| `docs/implementation/codex-next-stages-2026-10-19/GUARDRAILS.md` | `d5eb818ed150bde64ae41fd62aed295381f87509` |
| `docs/implementation/codex-next-stages-2026-10-19/STATUS.md` | `884c8802368484380b8e8245c259fde7bd0274fe` |
| `docs/implementation/codex-next-stages-2026-10-19/requests/3B.md` | `b8ac869c1d9f4ecc508be5bcce0c093e5c4f9fd8` |
| `docs/implementation/codex-next-stages-2026-10-19/handoffs/3A.md` | `b6a8bda0f9593d8397112100fb572a57101bd74a` |
| `docs/implementation/codex-next-stages-2026-10-19/handoffs/1D.md` | `4fd14ea0f19db7bc117f4afd99653ede4659a50b` |
| `docs/implementation/codex-next-stages-2026-10-19/handoffs/1A.md` | `09a3eb42e5c49ae908e397c9adb8a195a5d2cefe` |
| `docs/implementation/codex-next-stages-2026-10-19/BASELINE_NEXT.md` | `42ebce2706ba92bef66a783f8733d6c1f819034a` |
| `docs/implementation/codex-next-stages-2026-10-19/baselines/1A/INPUTS.md` | `cec2de36866fb1acd93f91e9d3d2fbe86a260819` |
| `docs/implementation/codex-next-stages-2026-10-19/HANDOFF_TEMPLATE.md` | `6cd72adcbcc35e906db6a992a8bde6f687cf665b` |
| `docs/implementation/codex-next-stages-2026-10-19/handoffs/README.md` | `1630153ceb075f5ec453ff8bbfeae53f155a8a45` |
| `docs/acceptance/phase3/RUNBOOK_NEXT.md` | `13b3ee41b1f989dc3640a6fc2a686af669b77b77` |
| `.github/workflows/ci.yml` | `a2a3cec46a4b398ae4ecc20ba8e2ff90b659e21c` |
| `scripts/ci/ci_controls.py` | `fc6fa1b7d0d05759cc74fc03737318762dbf29af` |
| `scripts/acceptance/run_formal.py` | `154aaed6dbf0c810a6368f650634f12a02152edc` |
| `scripts/acceptance/procedures.py` | `6bef738d2116f7ee6bb1b5dc6194fe1ad67f2465` |
| `scripts/acceptance/verify_bundle.py` | `ed0ac942d759806e8d15d5e16327472d43fdc35e` |
| `scripts/check_phase3.py` | `f000bdd6b85f387576c5cf2676a068a746538820` |
| `scripts/acceptance/measure_resources.mjs` | `a31a9d91f3f0d59059ed670ed296d627fee9880f` |
| `scripts/acceptance/run_supplements.py` | `cdb1f48dc8e040b3d34357b847873a71007ddd02` |

## 次の一操作

[1D handoff末尾の1A再開文](../../handoffs/1D.md#次に送るプロンプト)を使い、**許可済み通常環境で1Aの不足baselineを固定する依頼を行う**。これは今回の3Bで1Aを代行する指示ではない。その後2A→2B→2C→3Aの必要成果・採否・元CIとユーザーmergeを確認し、更新mainから3Bの同一Fを固定する。未成立中は3Bの依存確認/記録だけを継続し、3Cへは進まない。
