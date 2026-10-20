# 3A準備：依存・CI契約・検証と阻害

2026-10-20 UTC。開始点は#81ユーザーmerge後main `4f3110963794eb142340282b2267a266feac585f` / tree `5e32ce0c17a6f22ed1711d8a247afc1a15a04724` / src subtree `6c0098365af131f13d36c53b499f458a36ae225e`。本単位は[比較設計](PREPARATION.md)と阻害の準備のみ。NP15の実装/実比較/採用、3B正式受入の成功を報告する文書ではない。

## 実mergeと依存CI

各PRをGitHub APIで再取得し、`merged=true`、`merged_by=chameleonjp-lab`、head/merge commitを照合した。各headのActions一覧とlatest全jobsも再取得し、jobsのtotal_countと取得件数を確認した。#73の正式CIと別self-testsを混同しない。

| 単位 / PR | 最終head | 実merge commit / UTC | 最終PR CI run / attempt / latest jobs |
| --- | --- | --- | --- |
| 任意RTK / [#73](https://github.com/chameleonjp-lab/shinariokanri/pull/73) | `5dcfab6e1375df333ebd5396c20e546e11cdf9aa` | `8426bc020e0191c10942398449582b8c7650166d` / 10-19 03:52:37 | [39192645694](https://github.com/chameleonjp-lab/shinariokanri/actions/runs/39192645694) / 1 / 全7成功。別self-tests run39192645721成功 |
| 1A準備 / [#75](https://github.com/chameleonjp-lab/shinariokanri/pull/75) | `760dd507749d62778ac5456566eb7d42cd5fa22e` | `6611287b986553f90c6d8587c7bff2d64afac458` / 10-19 06:30:54 | [39208529291](https://github.com/chameleonjp-lab/shinariokanri/actions/runs/39208529291) / 1 / 文書scope成功 |
| 1C / [#76](https://github.com/chameleonjp-lab/shinariokanri/pull/76) | `37839fa12a30b1475c8d0ac646e4b87dc595d90c` | `bd9e74164ccc54b2f480116e546e2af73ffc4c82` / 10-19 08:02:17 | [39213058156](https://github.com/chameleonjp-lab/shinariokanri/actions/runs/39213058156) / 1 / 全7成功 |
| 1B / [#77](https://github.com/chameleonjp-lab/shinariokanri/pull/77) | `3dd828078a31b4264bf621c36d2196487e3d619c` | `aa86e25b91287329c061a97d1d3f9c4e0e0e9f85` / 10-19 08:29:09 | [39213727737](https://github.com/chameleonjp-lab/shinariokanri/actions/runs/39213727737) / 1 / 全7成功 |
| 1D準備 / [#78](https://github.com/chameleonjp-lab/shinariokanri/pull/78) | `e0ba37ae1c6ac36e4b847d39dcc06ffbd046fafc` | `14d78659320fda40babe751116df171b767055bc` / 10-20 01:00:33 | [39275412553](https://github.com/chameleonjp-lab/shinariokanri/actions/runs/39275412553) / 2 / latest全7成功。初回失敗/engine別retryは保持 |
| 2A準備 / [#79](https://github.com/chameleonjp-lab/shinariokanri/pull/79) | `192127931f2f5313af0c34df19aaaad078009088` | `4a67e85fd7f292e26b2d7d766baa0dd3ab348b6e` / 10-20 03:53:32 | [39351906891](https://github.com/chameleonjp-lab/shinariokanri/actions/runs/39351906891) / 1 / 文書scope成功 |
| 2B準備 / [#80](https://github.com/chameleonjp-lab/shinariokanri/pull/80) | `20242c1bceb8fea6fdafbd98b3aa5ace503481e7` | `4930bd5bf3c3f53cf65483e270e8df94d515be2c` / 10-20 07:48:14 | [39367868843](https://github.com/chameleonjp-lab/shinariokanri/actions/runs/39367868843) / 1 / 文書scope成功 |
| 2C準備 / [#81](https://github.com/chameleonjp-lab/shinariokanri/pull/81) | `68c3bd57457ec8738074e00b93e6d7309550301e` | `4f3110963794eb142340282b2267a266feac585f` / 10-20 08:28:13 | [39392670959](https://github.com/chameleonjp-lab/shinariokanri/actions/runs/39392670959) / 1 / 文書scope成功 |

文書scopeはscope/documents/verify成功、unit/browser skippedの5jobである。#79/80の実変更は各3 Markdown、#81はSTATUSを含む4 Markdownと全変更pathを再確認した。準備mergeは1A現行基準、2A NP09/10、2B NP11/13、2C NP12/14の必要成果・採否の不足を解除しない。

開始mainのGit parentsは#80 mergeと#81最終head、treeは#81提出treeと一致。開始時open PRは0件、main protected=falseを読取確認した。設定変更なし。自handoffはmainで404、handoffs一覧にも3Aなしで初回着手。docs/implementation/計画/evidence/handoffsの祖先に追加AGENTSなし。

## 開始mainと直前mainのCI

08:34:36 UTC時点の開始main [run39393627941 / attempt1](https://github.com/chameleonjp-lab/shinariokanri/actions/runs/39393627941) はpush / head `4f3110963794eb142340282b2267a266feac585f` / **in_progress**。scope/documents成功、[unit](https://github.com/chameleonjp-lab/shinariokanri/actions/runs/39393627941/job/118531972719)の元全unit実行中。build/3engine/verifyの成功は未確認。提出前に再取得した最終観測をPR本文へ記録し、この途中snapshotを成功へ読み替えない。

直前#80 merge main [run39388952025 / attempt1](https://github.com/chameleonjp-lab/shinariokanri/actions/runs/39388952025) の失敗は[unit原ログ](https://github.com/chameleonjp-lab/shinariokanri/actions/runs/39388952025/job/118516558902)を再取得して確認した。`npm test -- --maxWorkers=1 --fileParallelism=false` exit1、148 files中147成功/1失敗、1392 tests中1391成功/1失敗。`tests/optimization/fixtureIdentity.test.ts:13`のLarge同一性ケースが`Test timed out in 5000ms`。digest不一致のassert失敗やflakyとは断定しない。build未実行、browser skipped、verify failureを文書CIや別版の成功で上書きしない。

今回、元timeout/fixture/retryを変更せず、run再実行も依頼していない。開始条件と同条件成功対照がそろうまでCI準備を実変更しない。後続の正常runだけで過去失敗の原因調査が完了したとは扱わない。

## 過去成功runの時間分解（現在対照ではない）

#77のrun39213727737/attempt1は全7成功でretryなし。この1件のAPI時刻を読み、局所準備と経過時間/runner時間の違いを確認した。現在のtest inventoryや環境を固定したC/A/B比較、cache効果の実測ではない。

| job | setup-node | npm ci | browser install --with-deps | build | job区間の秒 |
| --- | ---: | ---: | ---: | ---: | ---: |
| unit | 3 | 2 | 55（3engine） | 5 | 736 |
| chromium | 4 | 3 | 30 | 4 | 1379 |
| firefox | 2 | 2 | 25 | 3 | 1687 |
| webkit | 4 | 2 | 34 | 5 | 2425 |

全job区間はscope56＋documents152＋unit736＋chromium1379＋firefox1687＋webkit2425＋verify68＝**6503 runner秒**。run_started_at 07:05:13→API updated_at 08:03:25＝**3492秒**（終端通知込み、ジョブ最終終了08:03:24までなら3491秒）。準備stepの合計は13＋9＋144＝166秒だが、並列区間を含み、browser downloadとOS依存はこのAPIでは未分離。166秒を短縮可能量や純効果にしない。cache hit/missも未監査。

[当時verify原ログ](https://github.com/chameleonjp-lab/shinariokanri/actions/runs/39213727737/job/117952558631)は`product_checks=passed`、各engine250 tests/attempt1/tree `bdb888edb9b233ec5031053bf9919cd191a29410`。実checkout `fffafa29b879b5f6019f5f5df0deda1bbbe98560`で、PR headとは別である。この250を現在の固定件数にしない。

各engine包＋集約包4件のAPI所在/bytes/digestも確認した。集約artifact ID12171535944、86934316 bytes、API digest `sha256:8210334c6bf5f68f1087d5716f855c0629ae368785299b9b85f7648ddb5f399e`。これはAPI/当時ログの観測で、今回独立downloadして全member/CRC/実bytes/SHAを監査した結果ではない。build seal・各engineの使用配信bytesも未取得であり、共有buildの正当化に使わない。#78のlatest7jobsはengine別retryを含むため、単一attemptの全job経過時間へ合算しない。

## 読取原本・既存検査の有効範囲

最初に指定README/GUARDRAILS/STATUS/requests/3A/handoffs/2CとAGENTSを読んだ。その入口からRTKガイド、現行workflow、scope/inventory/復元原本helperと該当tests、引継ぎ様式/保存規則・3A依頼文、原第3段階、1D比較設計の関連節、外部準備台帳のBLOCKED/別3/9gateへ限定して確認した。全履歴から引継ぎを補っていない。

以下は開始mainのGit blob SHAであり、buildやSHA-256 sealの代用ではない。

| path | Git blob SHA |
| --- | --- |
| `AGENTS.md` | `0920e85a1de4a5fc6658f7caf776f1f09efbc4c8` |
| `.github/workflows/ci.yml` | `a2a3cec46a4b398ae4ecc20ba8e2ff90b659e21c` |
| `scripts/ci/ci_controls.py` | `fc6fa1b7d0d05759cc74fc03737318762dbf29af` |
| `scripts/ci/test_ci_controls.py` | `99a3cc2c9b4b01cfb2d7f0ffdb52b38b85d5a093` |
| `scripts/ci/verify_recovery_artifacts.py` | `cacb59d6951c67e6a7148aed5d9e7190cd83c1e3` |
| `scripts/ci/test_verify_recovery_artifacts.py` | `bbec4307b8d796e177fe03e42506d8ee36196e03` |
| `package-lock.json` | `5c4f8166d87c405f1d2775de8a9819281fe6303d` |
| `playwright.config.ts` | `3d86fcd88e9908257d7a5e33e0337abe93ad6434` |

scopeは純Markdown allowlist、空/不明diff・push・製品pathは全検査。検証器は必須job/全3engineのID集合・重複/欠落・stats・commit/run/engine/attemptとengine間tree一致を検査する。recovery helperは4実原本と各内部manifest memberのbytes/hashを照合する。全ZIP独立監査/共有buildの使用bytes/新cache完全性の既存実証まであるとはしない。

既存CI helper testはscope6＋evidence9＋recovery6＋release-retention4＝25件。engine別正当retry [1,1,2]と以前の失敗原本保持は既存契約。新cache・共有build/shardの負例は設計だけで、今回の既存25件成功から新案のRED/GREENを推定しない。

## 提出差分と実行する文書CI

所有pathは`evidence/3A/PREPARATION.md`、本記録、`handoffs/3A.md`の3 Markdownのみ。STATUSや外部台帳、共有manifest、他handoff、workflow/helper、製品/JSON/fixtureは変更しない。独立レビューは読取だけ、追加実装担当なし。

既存allowlist内のMarkdown差分として、新Draft PRのActionsで次の4コマンドとscope/verifyを実行する。文言を写す追加testは作らない。

```sh
python3 scripts/check_docs.py
python3 scripts/check_completion_plan.py
python3 -m unittest discover -s scripts -p 'test_check_*.py' -v
python3 -m unittest discover -s scripts/ci -p 'test_*.py' -v
```

提出後の**最終PR本文**へ、各実exit/件数、head/tree/実checkout、run URL/attempt/jobs、途中取消・失敗も確定する。自身を含む最終SHAをこの文書へ自己参照させず、過去CIを今回の成功へ付け替えない。最終3文書を再取得して作成本文との一致、compare/root treeで3path以外の不変を確認する。文書scopeならunit/build/3engineは今回未実行である。

## 実行環境・阻害・正式検証の残条件

初期にCloud shellでファイル探索とnetwork-policy/environment_status、ghでmain/指定文書の読取、cloneを試みた。通常networkはexit128でproxy接続不可、追加networkで開始したcloneはG06確認後にINTで停止し**exit130**。checkout/製品検証の完了には数えない。以後はGitHub連携と既存Actionsだけで文書作業を行い、Cloudで依存導入/build/製品テスト/計測をしていない。Cloud環境の新規作成・設定変更なし。RTKは未使用、導入/存在確認なし。

| 残条件 | 現在と解除に必要なもの |
| --- | --- |
| 1A・段階2 | 現行30/180・heap、clean source/tree/build/配信bytes/fixture/driver/実終了/cleanup/seal不足。2A/2B/2C必要成果と採否・元CIのユーザー実mergeが必要。準備mergeでは不足 |
| 現在の元7job/3engine成功対照 | 開始mainは上記時点で実行中。直前main失敗を保持し、同条件で原因調査/必要な確認を行う |
| NP15 C/A/B | 新cacheなし、cold/warm/破損・fallbackの実測なし。局所/全CI/runner総時間・完全原本監査、独立負例と採否は未了 |
| 同一候補の正式検証 | 3B/3Cの原30/180、各size3標本heap、実7200/full113/72MiB全量、同全量復元・異常系、116/464逐条・空領域への再取得、N05別2download、全ZIP member/CRC/bytes/SHAが必要 |
| 外部・公開 | 原22外部＋実2account/旧C29の37part＋MANIFESTと旧18宣言/CP15独立確認者と結果は未解消。未採用Xと元check_release.pyの9gate/BLOCKEDを維持 |

fixture/seed/原実bytesは[1A入力台帳](../../baselines/1A/INPUTS.md)・既存fixture同一性検査を使い、同件数の別入力へ換えない。今回新しいseed/素材bytes再生成・download/復元照合は行っていない。現在のbuild/配信inventory/計測raw/seal、独立監査済ZIPのpath/SHAは未取得であり、所在を創作しない。

次の一操作は[1D引継ぎ末尾の1A再開文](../../handoffs/1D.md)を使い、許可済み通常環境で不足基準を固定すること。依存成立後に自handoffから3Aを再開し、実比較と採否を閉じる。現段階の3B候補固定/正式実行は不可。今回の戻し方は追加3 Markdownのrevertだけ。merge・公開はユーザーのみ。
