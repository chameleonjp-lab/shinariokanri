# 1D：検証・候補・未実行の記録

統合担当1人。今回の範囲はNP05比較設計・NP06準備・NP07暫定対応。開始日時のGitHub GETで依存の実merge・最終head CIを確認し、更新main aa86e25から新branch/Draft #78を作成した。過去全履歴から不足引継ぎを推測していない。

## 依存の実状態

| 単位/PR | ユーザーmerge（UTC）/merge commit | 最終PR CI / attempt / head |
| --- | --- | --- |
| 計画 #74 | 04:45:13 / a8caf979adc36c09f0ba7fcd3576b0472cff3392 | [39197313268](https://github.com/chameleonjp-lab/shinariokanri/actions/runs/39197313268) / 1 / df301ba0095e8244857de821bca5d45a97951794 |
| 1A #75 | 06:30:54 / 6611287b986553f90c6d8587c7bff2d64afac458 | [39208529291](https://github.com/chameleonjp-lab/shinariokanri/actions/runs/39208529291) / 1 / 760dd507749d62778ac5456566eb7d42cd5fa22e |
| 1C #76 | 08:02:17 / bd9e74164ccc54b2f480116e546e2af73ffc4c82 | [39213058156](https://github.com/chameleonjp-lab/shinariokanri/actions/runs/39213058156) / 1 / 37839fa12a30b1475c8d0ac646e4b87dc595d90c |
| 1B #77 | 08:29:09 / aa86e25b91287329c061a97d1d3f9c4e0e0e9f85 | [39213727737](https://github.com/chameleonjp-lab/shinariokanri/actions/runs/39213727737) / 1 / 3dd828078a31b4264bf621c36d2196487e3d619c |

各PRのconclusion=successをAPI再取得。#74/#75は既存documentation-onlyでscope/documents/verify成功、unit/browser対象外。#76/#77は全7ジョブsuccess、元全unit/build・各3engine全inventory・rb03/rb04/rb10・回収/verify stepの実成功を確認した。handoff内の「未merge/CI待ち」は提出当時の記録であり、上表で現在の状態を補正する。

merge後も1A main [39210365561](https://github.com/chameleonjp-lab/shinariokanri/actions/runs/39210365561)、1C main [39219932781](https://github.com/chameleonjp-lab/shinariokanri/actions/runs/39219932781)、開始main [39223094577](https://github.com/chameleonjp-lab/shinariokanri/actions/runs/39223094577) のattempt1成功をGETで確認。後2件は全7job/必要step成功も再取得した。[API確認台帳](DEPENDENCIES.json)に実head/merge/run/jobを保持する。依存のprovider ZIPの独立再取得・全member監査をこのsessionで実施したとはしない。各先行PR本文の監査記録と別に扱う。

## 今回の検査

先にscripts/test_check_stage1_traceability.pyだけをcommitしたRED head `6ad6df282f22af70933047c35093346b63299f15`。[run39267673368](https://github.com/chameleonjp-lab/shinariokanri/actions/runs/39267673368) / attempt1、documents job118111407754。実コマンド `python3 -m unittest discover -s scripts -p 'test_check_*.py' -v` は133件中16fail、実exit1。16件はいずれも「1D provisional-registry validator is not implemented」のAssertionErrorで、checkerの不在を確認した。全反例が実データへの変更で事前REDだった、とは主張しない。元116件と既存入口のhelp検査は成功。最終GREENで各具体反例の拒否も確認する。

同じCIの実help（すべてexit0）：

```sh
python3 scripts/acceptance/run_formal.py --help
python3 scripts/acceptance/seal_candidate.py --help
python3 scripts/check_phase3.py --help
python3 scripts/acceptance/pack_evidence.py --help
python3 scripts/acceptance/recover_historical.py --help
python3 scripts/acceptance/run_supplements.py --help
```

原check_phase3既存kernelは偽p95/欠落生値/別fixture・build/短縮soak/113不足/素材欠損/未完了new・clone・cold/実終了不明/実argv改変を既に拒否する。今回の自動発見testから元検査を削らず実行する。新検査器は原104/116/464/24/6/68、全73実bytes/Git blob、原Large binary実SHA、source候補bytes、fixture期待、依存非循環、未実行昇格禁止を検査する。

最終差分はJSON・検査器・既存範囲外のoptimization文書を含むのでfull scope。既存ci.ymlの次の4コマンドに加え元全unit/build、3engine全inventory・後続rb03/rb04/rb10・失敗証拠回収・最終verifyを通す。workflow/skip/retry/timeout/assert/seedは変更しない。

```sh
python3 scripts/check_docs.py
python3 scripts/check_completion_plan.py
python3 -m unittest discover -s scripts -p 'test_check_*.py' -v
python3 -m unittest discover -s scripts/ci -p 'test_*.py' -v
```

この文書を含む最終head/tree/run/attempt・実exit/件数/CI URLは自己参照を避け、提出後の[Draft PR #78本文](https://github.com/chameleonjp-lab/shinariokanri/pull/78)へ固定する。最終CIはこの文書の作成時には未実行であり、REDや依存CIを成功結果として付け替えない。

## 実行方針と判定の範囲

- Ruling: GUARDRAILS G06のCloud使用禁止を優先し、GitHub connector内のテキスト取得・新branch/Git tree/commit/PRと既存GitHub Actionsで実行。添付Cloudのshell/依存導入/build/測定は使用していない。開始時の環境状態読取だけで環境を利用可能・許可済みと扱っていない。
- Ruling: shellのrgに代わり、指定pathのGitHub取得・関数名/節の限定検索を用いた。保存/履歴・検索/読込の現行source、既存棄却結果、原条項の入口だけを確認し、全履歴を再調査していない。
- Ruling: 現行baseline不足を1Dの設計で解消したことにせず、最初の製品変更前の採用停止条件として残す。1B/1Cはsrc tree不変でもdriver/build/CI候補は異なるためrawを統一しない。
- Ruling: 実行計画スキルの作業記録はこの検証記録とhandoffs/1D.mdへ集約する。製品コードの新機能ではなく、指定の比較/準備範囲だけを扱う。

## 残る条件

1Aの現行30/180・heap、Fのclean build/配信bytes/seal、正式5実行、N05/RG/資源のF再取得、最終116/464判定、正式束/CI各ZIPの独立再取得・全member/CRC/SHA照合、外部22件、実2account/旧C29＋原18宣言の揃い/CP15は今回の実績ではない。旧18宣言について1Aの14宣言/10 unique回収実績は保持し、残りの揃いを未確認とする。95MiB超過時の輸送/checker拡張も未実装。原release 9gateとBLOCKEDを維持する。
