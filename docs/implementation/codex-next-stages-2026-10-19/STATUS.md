# 段階の進捗（統合時の一覧）

更新基準：2026-10-19、1D統合担当の第1段階スナップショット。開始main `aa86e25b91287329c061a97d1d3f9c4e0e0e9f85` / tree `f191b5bfce8d356470bb507ab5c257c322b6fc95`。依存の実mergeと最終CIを確認した。[検証・依存台帳](evidence/1D/VERIFICATION.md)。**第1段階全体は未完了**。1Aの現行30/180・heapが阻害、1DはDraft提出・統合待ちである。

この一覧は1D・2C・3Cの統合担当だけが更新する。依存handoffの提出当時の状態とGitHubの現在状態を照合し、CI成功と正式受入を分ける。

| 単位 | 依存 | 状態 | 成果PR／引継ぎ |
| --- | --- | --- | --- |
| [1A](requests/1A.md) | 計画PRのユーザーmerge | 阻害（現行30/180・heap未取得） | [#75](https://github.com/chameleonjp-lab/shinariokanri/pull/75) merge済み、文書CI成功。識別/原本準備と残実測を分離。[引継ぎ](handoffs/1A.md) |
| [1B](requests/1B.md) | 1A | 完了（NP02・03の指定範囲） | [#77](https://github.com/chameleonjp-lab/shinariokanri/pull/77) merge済み、最終PR/merge-main全CI成功。原2download/RG補助/11反例。[引継ぎ](handoffs/1B.md) |
| [1C](requests/1C.md) | 1A | 完了（NP04接続・NP08準備の指定範囲） | [#76](https://github.com/chameleonjp-lab/shinariokanri/pull/76) merge済み、最終PR/merge-main全CI成功。実外部は全BLOCKED。[引継ぎ](handoffs/1C.md) |
| [1D](requests/1D.md) | 1B・1C | PR提出・統合待ち | [Draft #78](https://github.com/chameleonjp-lab/shinariokanri/pull/78)、比較設計/runbook/暫定表/検査器。最終CIはPR本文で確定。[引継ぎ](handoffs/1D.md) |
| [2A](requests/2A.md) | 1D | 未着手（製品変更前に1A基準が必要） | 未作成 |
| [2B](requests/2B.md) | 2A | 未着手 | 未作成 |
| [2C](requests/2C.md) | 2A・2B | 未着手 | 未作成 |
| [3A](requests/3A.md) | 2C | 未着手 | 未作成 |
| [3B](requests/3B.md) | 3A | 未着手 | 未作成 |
| [3C](requests/3C.md) | 3B | 未着手 | 未作成 |

「完了」は指定単位の成果がユーザーにより統合された範囲だけ。1B/1Cの統合は1Aの未実測を解除せず、NP05/06/07や外部受入の完了も意味しない。必要な基準なしの製品変更/採用を止める。

## 原NP01〜16の対応

| NP | 現在の完了区間／残区間 |
| --- | --- |
| NP01 | 1Aの版・原本の所在/不足を固定。1Bで原Large binaryの実bytesも取得。clean候補/build/配信bytesと現行測定の結合は残る |
| NP02 | 1Bで別イベント2実download原本を保存し独立拒否条件を確認。Fの再実行は3B |
| NP03 | 1Bで原RG補助と実11反例を新規再構成・統合。原6群の最終合格とは別 |
| NP04 | 1Cの同作品/人物/章/場面/固定版と6職種接続を統合。Fでの逐条対応は3B/3C |
| NP05 | 1D比較設計を提出。1Aの現行前測定が阻害、3B最終同条件比較も未実行。**全体未完了** |
| NP06 | 1Dの5実行/実終了/cleanup/seal/独立verify/再開手順を提出。3B正式実行は未実行。**全体未完了** |
| NP07 | 1Dの原104/116/464/24/6/68暫定表を提出。3C実逐条判定/再取得は未確定。**全体未完了** |
| NP08 | 1Cの原22件＋別3条件の準備済。実条件はBLOCKED、3Cで更新 |
| NP09・NP10 | 2A未着手。古い履歴取消→全metadata完全性を保った本文軽量化の比較 |
| NP11・NP13 | 2B未着手。棄却shared changeset/provider/ordinalを再採用せず別局所案を比較 |
| NP12・NP14 | 2C未着手。選択人物の基本情報一画面→4/8/16/bytes保持比較 |
| NP15 | 3A未着手。元必須検査を保ったCI準備比較 |
| NP16 | 3B/3C未着手。NP06と同じFの正式結果を参照 |

## 次の一操作と第2段階の条件

ユーザーが[Draft #78](https://github.com/chameleonjp-lab/shinariokanri/pull/78)の最終full CI・成果を確認しmergeする。その後、許可済み通常実行環境で**1Aの未測定区間を再開**し、最初の製品変更より前の現行30/180・heap原本を固定する。欠ける環境/依存/素材/保存先があれば、必要な一操作と阻害をhandoffへ残す。

1D統合後の2A読取・独立設計は可能。製品変更へ進む条件は、1A〜1Dの必要成果の実統合、同条件の変更前基準、独立期待・取得/判定手順・所有path・rollbackであり、**正式受入合格を第2段階の開始条件にはしない**。今回2A以降へ進んでいない。

## 外部・公開判定

原22外部ケースは1Cの手順/様式準備済、実受入は全BLOCKED。AC-G02/CP04実2account、旧C29の37part/MANIFEST＋旧18不足宣言の揃い、CP15独立確認者/結果は別3欄。未採用X01〜X12とX36補助は未採用のまま。元check_release.pyの9gate/BLOCKEDを保持し、完成版全条件合格・公開可能は宣言しない。

## 更新時の確認

- [x] 依存PRの実merge・対象commit・CI run/attemptをGitHub APIで照合した。
- [x] 各handoffの指定範囲と残区間を確認し、提出当時のCI待ちは現在の実状態で補正した。
- [x] 分割NP05/06/07を準備と正式実行/確定へ分離した。
- [x] 原22外部＋別3条件、未採用Xと元release gateを保持した。
- [ ] 1Aの現行前測定完了と1Dのユーザーmergeを確認する。
