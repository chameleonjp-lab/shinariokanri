# 段階の進捗（統合時の一覧）

更新基準：2026-10-20 UTC、3C統合担当の第3段階スナップショット。#83ユーザーmerge後の更新main `006333705a7e556fa0e54f1054df6b2910053cde` / tree `a8709a2202a22380bdc323607f753c8520ae7174` から開始し、#75〜83の実merge・最終PR CIを再取得した。[3C検証台帳](evidence/3C/VERIFICATION.md)。**第1・第2・第3段階全体は未完了。最終F未固定、3B正式結果なし、NP07正式確定はBLOCKED。** 本3Cは準備/履歴証拠の再取得と不足の逐条確認を提出する。

この一覧は1D・2C・3Cの統合担当だけが更新する。handoff提出当時の統合待ちを実GitHub状態で補正し、準備のmergeや文書CIを改善実測・正式受入へ昇格しない。自3Cは新Draft PR提出・ユーザーmerge待ち。最終head/tree/実CIはPR本文で確定する。

| 単位 | 依存 | 現在の状態 | 成果PR／引継ぎ |
| --- | --- | --- | --- |
| [1A](requests/1A.md) | 計画PRのユーザーmerge | 阻害（現行30/180・heap等が未取得） | [#75](https://github.com/chameleonjp-lab/shinariokanri/pull/75)準備merge済み・文書CI成功。clean build/配信bytes/seal・残実測未了。[引継ぎ](handoffs/1A.md) |
| [1B](requests/1B.md) | 1A | 完了（NP02/03の指定範囲） | [#77](https://github.com/chameleonjp-lab/shinariokanri/pull/77)merge・全7 jobs成功。既存包260 member/2 nested各689 memberを3Cで実再取得・全照合。F再実行は未了。[引継ぎ](handoffs/1B.md) |
| [1C](requests/1C.md) | 1A | 完了（NP04接続・NP08準備の指定範囲） | [#76](https://github.com/chameleonjp-lab/shinariokanri/pull/76)merge・全7 jobs成功。既存局所包775 memberを3Cで再取得・全照合。外部実受入全BLOCKED。[引継ぎ](handoffs/1C.md) |
| [1D](requests/1D.md) | 1B・1C | 準備範囲統合済み（NP05/06/07全体未完了） | [#78](https://github.com/chameleonjp-lab/shinariokanri/pull/78)merge・attempt2全7 jobs成功。比較設計/runbook/暫定表・検査器。[引継ぎ](handoffs/1D.md) |
| [2A](requests/2A.md) | 1D | 阻害（準備統合済み、NP09/10必要成果未了） | [#79](https://github.com/chameleonjp-lab/shinariokanri/pull/79)準備merge・文書CI成功。動的検証/実比較・採否未了。[引継ぎ](handoffs/2A.md) |
| [2B](requests/2B.md) | 2A | 阻害（準備統合済み、NP11/13必要成果未了） | [#80](https://github.com/chameleonjp-lab/shinariokanri/pull/80)準備merge・文書CI成功。1A基準・2A実成果不足。[引継ぎ](handoffs/2B.md) |
| [2C](requests/2C.md) | 2A・2B | 阻害（準備統合済み、NP12/14必要成果未了） | [#81](https://github.com/chameleonjp-lab/shinariokanri/pull/81)ユーザーmerge済み・文書CI成功。人物一画面/世界保持は比較設計のみ、実比較・採否保留。[引継ぎ](handoffs/2C.md) |
| [3A](requests/3A.md) | 2C | 阻害（準備統合済み、NP15実比較未実行） | [#82](https://github.com/chameleonjp-lab/shinariokanri/pull/82)ユーザーmerge済み・文書CI成功。C/A/B設計まで。[引継ぎ](handoffs/3A.md) |
| [3B](requests/3B.md) | 3A | 阻害（開始条件記録統合済み、正式5実行未起動） | [#83](https://github.com/chameleonjp-lab/shinariokanri/pull/83)ユーザーmerge済み・文書CI成功。F/seal/raw/実終了なし。[引継ぎ](handoffs/3B.md) |
| [3C](requests/3C.md) | 3B | PR提出・統合待ち（再取得/不足判定の範囲、正式確定は阻害） | [逐条確認](evidence/3C/CLAUSE_AUDIT.md)・[150ファイル実再取得](evidence/3C/REACQUISITION.md)・外部22＋別3更新・元release BLOCKED。[引継ぎ](handoffs/3C.md) |

「完了」は必要条件を満たしユーザー統合済みの指定範囲だけ。#79〜83がmergeされても未実施の基準・比較・正式結果はそろわない。1B/1C局所成果と全CIは各版の証拠で、最終Fの合格に付け替えない。

## 原NP01〜16の対応

| NP | 完了・準備した区間 | 実施・確定の残り／判定と根拠 |
| --- | --- | --- |
| NP01 | 1A入力台帳、1B原Large binary取得。3Cで73固定入力/原binary実bytesを再照合 | 未完了：clean候補/build/配信bytes/sealと現行baselineの結合なし |
| NP02 | 1Bの別イベント2実download原本・独立拒否条件を統合。3Cで保持2原本と別event/URL/pathを再照合 | 指定補助範囲完了。Fの再実行未了。旧2原本の再取得を新2downloadと呼ばない |
| NP03 | 1B原RG補助・新規再構成11反例を統合、3Cで原包/失敗試行を再取得 | 指定補助範囲完了。原RG-R01〜06のF全体合格は未了 |
| NP04 | 1Cの同作品/人物/章/場面/固定版・6職種接続、既存局所原包を再取得 | 接続の指定範囲完了。F実観測・原条項全体の判定は未了 |
| NP05 | 1D比較設計は準備済み | **未実行／阻害**：1A現行基準・3B同条件最終比較なし、確定なし |
| NP06 | 1D正式5実行/runbook/実終了/cleanup/seal/独立verify/再開手順は準備済み | **未実行／阻害**：3B全5 step未起動、F未固定、確定なし |
| NP07 | 1D暫定表、3C全ID/原文照合・150ファイル/履歴包の空領域再取得・未実行判定 | **正式確定BLOCKED**：464条項＝未実行405/blocked59/合格0、116ケース＝未実行94/blocked22。同一Fの観測/正式包/CI ZIP全件監査なし |
| NP08 | 1C手順/様式準備、3C原22件の原文/分類/実条件/次操作と別3条件を更新 | 準備済み／実受入全BLOCKED。外部環境・旧原本・独立確認者待ち |
| NP09 | 2A取消/保全の準備設計 | 未実行／阻害。独立動的検証・必要差分未了。未実施を不採用にしない |
| NP10 | 2A全metadata完全性を保つ現行＋2案の準備 | 未実行／阻害。NP09後の実比較/採否未了 |
| NP11 | 2B normalize局所案の準備 | 未実行／阻害。実比較/採否保留。棄却shared changeset/providerを再採用しない |
| NP12 | 2C人物基本情報一画面/完全保存/失効境界・独立負例の準備 | 未実行／阻害。実比較/採否保留 |
| NP13 | 2B位置生成/scope準備 | 未実行／阻害。実比較/採否保留。棄却ordinalを再採用しない |
| NP14 | 2Cの4/8/16件・4/8/16MiBと所有負例の設計 | 未実行／阻害。NP12実判断後の保持比較/採否未了 |
| NP15 | 3A元検査を保つC/A/Bと負例/時間・証拠契約を準備 | 未実行／阻害。cache実比較/採否なし、元必須CI不変 |
| NP16 | 3B/3CでNP06との同一正式一式参照を明示 | **未実行／阻害**：参照すべきNP06のF実行自体がない。別候補や旧履歴合格を代入しない |

新しい性能案の採用なし。今回の未実測を「比較済・不採用」へ昇格しない。既存棄却案と未採用X01〜X12/X36はその状態を維持する。

## NP05・06・07の準備／実施／確定

| NP | 準備 | 実施 | 正式確定 |
| --- | --- | --- | --- |
| NP05 | 比較設計済み | 現行baseline/最終実比較未実行 | 未確定 |
| NP06 | 原5 stepと封印/実終了/独立verify手順あり | 全5 step未起動 | 未確定 |
| NP07 | 暫定表・今回原文照合/履歴再取得済み | Fの逐条実観測/正式包再取得・全CI ZIP監査未実行 | BLOCKED |

NP16はNP06と同じ正式一式を参照する。原30/180・実7200秒/112編集/88003記録/full113履歴と送信待ち/実75497472素材bytes・new/clone/cold・同全量異常系を未実施のまま保持する。最終速度/仕事量/論理保持/heap比較は比較不能。製品/配信bytes等が変わった候補にはG03/G05と依頼カードの再取得条件を適用する。

## CI・再取得・公開判定

#75〜83の最終PR CIは成功。#76/77/78はlatest全7 jobs成功（#78 attempt2）、#75/79〜83は文書scope成功・unit/browser skipped。各head/merge/run/attemptは[3C台帳](evidence/3C/VERIFICATION.md)に固定した。これらは各PRのjob結果であり、本3Cの製品CIや正式受入へ転記しない。

開始mainの[run39402880500 / attempt1](https://github.com/chameleonjp-lab/shinariokanri/actions/runs/39402880500)は記録時点でscope/documents/unit成功、3engine実行中、verify未確定。最終観測は自PR本文を参照。前段mainの旧run39388952025/attempt1の5000ms timeout/exit1と後続skipを保存し、別runで解消済みと断定しない。自PRは元scopeによる文書検査を確認し、最終head/run/実checkout/exitはPR本文へ固定する。

[実再取得](evidence/3C/REACQUISITION.md)は空領域への150ファイル/36613017 bytes、73固定入力の全bytes/Git blob、1B 260 member・1C 775 member・1B nested各689 memberのCRC/実bytes/SHAと歴史Git source proofを照合した。F正式原本はなく、その再取得/全member照合は未実行。過去包のsource/dist/helper/raw/native/失敗の保持確認と、現在候補の受入を分ける。

元 `scripts/check_release.py` を再取得先で実行して **exit1 / RELEASE BLOCKED**。default release-evidence.json欠如で入口拒否し、9個別gateは未評価。原checker/9gateは変更せず、公開可能と宣言しない。

原22外部ケースは手順/様式PREPARED、原実条件は全BLOCKED。実機9＋実機/サービス6＋実Auth4＋ゲーム2＋契約費用1。実2account/CP04、旧C29の37part＋MANIFEST/旧18宣言原本、CP15独立確認者/結果を別3欄に保持。[個別の原文・次操作](evidence/3C/VERIFICATION.md)。fresh agentレビューをCP15独立ユーザー受入へ代替しない。実機/本番変更/公開は開始しない。

## 次の一操作と再開条件

ユーザーが今回の新Draft PRの実施範囲・原checkerのBLOCKED・未実行を確認する。後続の依存解消は[1D handoff末尾の1A再開文](handoffs/1D.md#次に送るプロンプト)を用いた別依頼で、許可済み通常環境の不足baselineを固定する。1A/2A/2B/2C/3A/3Bをこの3Cで代行しない。

その後、必要比較/採否・元CI・ユーザーmergeを確認し、3Bが同一Fを固定して原正式一式を実施する。F/seal/raw/実終了・cleanupと必要な統合状態がそろった時点でのみ[3C handoff](handoffs/3C.md)の残りを再開する。準備mergeだけで正式開始条件を解除しない。merge/公開はユーザーのみ。

## 更新時の確認

- [x] #75〜83の実ユーザーmerge・最終head/merge/run/attempt/jobsを再取得した。
- [x] #81〜83の提出当時の統合待ちを準備統合済みへ補正し、正式未実行と分けた。
- [x] 原104/116/464/24/6/68の集合/原文、22外部＋別3、未採用Xを保持した。
- [x] 空領域への実原本取得/検査器実行/履歴ZIP全member照合と元release BLOCKEDを記録した。
- [ ] 1A現行基準と段階2/3Aの必要成果・採否をそろえる。
- [ ] 3Bの同一F正式一式を取得し、3C正式逐条確定・正式包/全CI ZIP再取得監査を完了する。
