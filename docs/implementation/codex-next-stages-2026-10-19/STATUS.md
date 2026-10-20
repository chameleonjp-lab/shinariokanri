# 段階の進捗（統合時の一覧）

更新基準：2026-10-20 UTC、2C統合担当の第2段階スナップショット。開始点は#80ユーザーmerge後main `4930bd5bf3c3f53cf65483e270e8df94d515be2c` / tree `a4b99bb5497cc49ce7c2922e7db367b31a6f95e4`。#75〜80の実merge・最終PR CIを再確認した。[依存・検証台帳](evidence/2C/VERIFICATION.md)。**第1・第2段階全体は未完了**。1A現行基準と2A/2B実成果が不足し、2Cは準備のみである。開始mainの全CIも失敗している。

この一覧は1D・2C・3Cの統合担当だけが更新する。handoff提出当時の統合待ちを現在のGitHub状態で補正するが、準備のmergeや文書CIを性能改善・正式受入へ昇格しない。

| 単位 | 依存 | 状態 | 成果PR／引継ぎ |
| --- | --- | --- | --- |
| [1A](requests/1A.md) | 計画PRのユーザーmerge | 阻害（現行30/180・heap等が未取得） | [#75](https://github.com/chameleonjp-lab/shinariokanri/pull/75)準備merge済み、最終文書CI成功。原Large binaryは1Bで取得、clean build/配信bytes/seal・残実測は未了。[引継ぎ](handoffs/1A.md) |
| [1B](requests/1B.md) | 1A | 完了（NP02・03の指定範囲） | [#77](https://github.com/chameleonjp-lab/shinariokanri/pull/77)merge済み、最終全7jobs成功。原2download/RG補助/11反例。[引継ぎ](handoffs/1B.md) |
| [1C](requests/1C.md) | 1A | 完了（NP04接続・NP08準備の指定範囲） | [#76](https://github.com/chameleonjp-lab/shinariokanri/pull/76)merge済み、最終全7jobs成功。実外部は全BLOCKED。[引継ぎ](handoffs/1C.md) |
| [1D](requests/1D.md) | 1B・1C | 準備範囲統合済み（NP05/06/07全体は未完了） | [#78](https://github.com/chameleonjp-lab/shinariokanri/pull/78)merge済み、最終CI attempt2全7jobs成功。比較設計/runbook/暫定表/検査器。[引継ぎ](handoffs/1D.md) |
| [2A](requests/2A.md) | 1D | 阻害（準備統合済み、NP09/10必要成果は未完了） | [#79](https://github.com/chameleonjp-lab/shinariokanri/pull/79)準備3文書merge済み、最終文書CI成功。製品実装/動的検証/比較・採否未了。[引継ぎ](handoffs/2A.md) |
| [2B](requests/2B.md) | 2A | 阻害（準備統合済み、NP11/13必要成果は未完了） | [#80](https://github.com/chameleonjp-lab/shinariokanri/pull/80)準備3文書merge済み、最終文書CI成功。1A基準・2A実成果不足。[引継ぎ](handoffs/2B.md) |
| [2C](requests/2C.md) | 2A・2B | PR提出・統合待ち（準備のみ、製品変更は阻害） | 新Draft PRで人物一画面/世界保持の比較・負例設計と阻害を提出。両NP未実装/未実測、採否保留。[引継ぎ](handoffs/2C.md) |
| [3A](requests/3A.md) | 2C | 未着手（2C必要成果不足につき着手不可） | 未作成 |
| [3B](requests/3B.md) | 3A | 未着手 | 未作成 |
| [3C](requests/3C.md) | 3B | 未着手 | 未作成 |

「完了」は指定単位の条件を満たしてユーザーが統合した範囲だけ。1B/1Cの指定範囲完了と1D準備統合は1A未実測・NP05/06/07・外部受入の完了を意味しない。2A/2B準備PRが統合されても、下流の製品変更条件は解除されない。

## 原NP01〜16の対応

| NP | 現在の完了区間／残区間 |
| --- | --- |
| NP01 | 1Aの版・原本の所在/不足を固定し、1Bで原Large binary実bytesを取得済み。clean候補/build/配信bytes・現行測定との結合は残る |
| NP02 | 1Bで別イベント2実download原本と独立拒否条件を統合。Fの再実行は3B |
| NP03 | 1Bで原RG補助と実11反例を新規再構成・統合。原6群の最終合格とは別 |
| NP04 | 1Cで同作品/人物/章/場面/固定版と6職種接続を統合。Fでの逐条対応は3B/3C |
| NP05 | 1D比較設計は統合済み。1A現行前測定不足、3B最終同条件比較未実行。**全体未完了** |
| NP06 | 1Dの5実行/実終了/cleanup/seal/独立verify/再開手順は統合済み。3B正式実行未了。**全体未完了** |
| NP07 | 1Dの原104/116/464/24/6/68暫定表は統合済み。3C実逐条確定/再取得は未確定。**全体未完了** |
| NP08 | 1Cの原22件＋別3条件の準備済み、実条件BLOCKED。3Cで更新 |
| NP09・NP10 | 2A準備のみ統合。NP09取消の実装/安全性→NP10全metadata完全性を保つ比較/採否の必要成果が未完了 |
| NP11・NP13 | 2B準備のみ統合。normalize局所案と位置生成/scope準備の比較/実装・採否は保留。棄却shared changeset/provider/ordinalは再採用しない |
| NP12 | 2C人物基本情報一画面と完全保存/失効境界・C/A/B/独立負例を設計。未実装/未実測、採否保留 |
| NP14 | 2Cの4/8/16件・4/8/16MiB比較と所有負例を設計。実比較はNP12判断後。未実装/未実測、採否保留 |
| NP15 | 3A未着手。元必須検査を保ったCI準備比較 |
| NP16 | 3B/3C未着手。NP06と同じFの正式結果を参照 |

## 現在のCIと第2段階の開始条件

#75〜80の最終PR CIは成功。文書scopeの#75/79/80はscope/documents/verify成功・unit/browser skippedであり、製品全CIではない。#76/77/78はlatest全7jobs成功。各head/merge/run/attemptは[台帳](evidence/2C/VERIFICATION.md)に固定した。

#80統合後mainの[run39388952025 / attempt1](https://github.com/chameleonjp-lab/shinariokanri/actions/runs/39388952025)は**failure**。unitの原Large fixture同一性ケースが5000ms timeout（1391成功/1失敗）。build/browserは未実行、verifyは必須job失敗/skipを拒否した。原因・再現性は未確定で、時間条件を変更せず調査/必要な再実行を行う条件を残す。2C文書CIや過去のmain成功で上書きしない。

次の一操作は[1D引継ぎ末尾の1A再開文](handoffs/1D.md)を使い、許可済み通常環境で最初の製品変更前の原30/180・各size3標本heapとclean source/tree/build/配信bytes/fixture/driver/実終了/cleanup/sealを固定すること。1A/2A/2Bをこの2C依頼で代行しない。

その後、2A NP09→NP10、2B NP11/NP13の必要成果・採否・元全CIをユーザーmerge後の更新mainで確認する。2Cの実行順はNP12独立反例・一画面比較/採否→NP14同操作列保持比較/採否。NP12が実比較後に不採用でも、現行完全currentを対照にNP14へ進める。未実施を不採用として閉じない。**3Aへ渡せる段階ではない。**

開始条件は必要成果の実統合、同条件の変更前基準、独立期待・所有path・取得/判定手順・rollbackと必要CI。正式最終受入合格を第2段階の開始条件にはしない。2Cの準備と残区間は[比較設計](evidence/2C/PREPARATION.md)と[自handoff](handoffs/2C.md)へ分離した。

## 外部・公開判定

原22外部ケースは手順/様式準備済み、実受入は全BLOCKED。AC-G02/CP04実2account、旧C29の37part/MANIFEST＋旧18不足宣言、CP15独立確認者/結果は別3欄で未解消。未採用X01〜X12とX36補助を採用へ昇格せず、元check_release.pyの9gate/BLOCKEDを維持する。正式30/180・7200/full113・完全復元/異常系・116/464逐条確定は今回未実行。完成版全条件合格・公開可能を宣言しない。

## 更新時の確認

- [x] #75〜80の実ユーザーmerge・対象head/commit・最新CI run/attempt/jobsを照合した。
- [x] 提出当時の統合待ちと現在の準備統合済みを補正し、実成果不足を別に示した。
- [x] 統合後main CIの失敗/skipと2C文書CIを別に記録した。
- [x] NP05/06/07の準備と正式実行/確定、原22外部＋別3条件、未採用Xとrelease gateを保持した。
- [ ] 1A現行基準、2A/2B必要実成果、統合後mainの元全CI成功を確認する。
- [ ] NP12→NP14の実比較/採否と必要成果のユーザーmergeを確認し、2C終了後に3Aへ渡す。
