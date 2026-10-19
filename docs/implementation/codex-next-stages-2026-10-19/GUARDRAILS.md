# 全依頼で守る条件

原典は [PR #59の全体計画](../codex-three-phase-2026-10-17/PLAN_ALL_STAGES.md) の共通条件1〜8と [第3段階](../codex-three-phase-2026-10-17/PHASE_3_ACCEPTANCE.md)、[原契約の固定記録](../../optimization/phase1/contract-lock.json)。以下は実装時に確認する要点であり、原文を置き換える短縮仕様ではありません。

## G01 要件・正本・既存修正

- 原104要件、116ケースの given / when / then / negative_or_edge の464条項、24工程、6回帰群、68補助確認、元fixture・seed・実bytes・独立期待を削除・緩和・改名しない。件数だけ合う別入力も不可。68補助はG32＋未採用X36であり、元116へ加算しない。
- ID、作者入力、正式参照、真実／証言／仮説、固定版、履歴・64操作ごとの復元点、秘密／公開／role、旧native 1.0互換を保持する。projects / entities / commands / outbox / assets の原子確定と失敗時保全、同operationIdのv1/v2 request実bytes・再送同一性を保持する。
- 型・検証・索引の共通化で、作者の分類、候補、確定参照、公開投影を混ぜない。未読・読込中・読込済み・不在・エラーを区別する。部分値を完全なProjectDataとして保存しない。
- 所有の照合はaccount / role / project / revisionだけで済ませない。世界pinのproject / snapshot / hash、schema、native header fingerprint、store寿命の証明を含む既存条件を確認する。同revisionでのheader差替やstore close/reopen、遅延応答・ACKで古い結果を混入させない。
- #72のstale draft回帰修正、#70の原fixture blob検証、save tuple capture / generation fence / ACK最終transaction guard、81参照UIと43kind / 345fieldの意味検査は既存成果として保持する。再実装の必要性は再現で判断する。

## G02 比較・採否・戻し方

新しい性能案は現行＋少なくとも2案を、同じfixture・入力・環境・計測定義で比較する。局所の速度、仕事量、保持量、正確性を別列にし、独立した全件対照と負例を使う。1Aの全体基準と各改善直前の親候補を分け、途中の製品変更があるのに古いrawを現在の対照値にしない。既存P2の棄却案を名前だけ変えて採用しない。計測ONの診断値をOFFの正式時間に混ぜない。

効果がない案や正しさを壊す案は不採用と記録する。「比較済・不採用」は実装完了とは区別する。性能案を採用しなくても、比較の完了条件と原要件を満たせば後続へ進める。必須要件の欠陥は不採用判断で解消したことにしない。

各変更には戻す経路を残す。履歴の内部表現を変えた場合は、新表現を理解する互換full decoderを残して高速経路を停止する。旧binaryへ戻すには全本文検証後の旧envelopeへの原子的な書戻しが必要であり、DB downgradeやデータ削除をrollbackにしない。

## G03 測定・最終受入

| 項目 | 保持する元条件 |
| --- | --- |
| 正式速度 | Standard / Largeそれぞれ8指標×30回。元p95条件・nearest rank・未丸め生値 |
| 正式保存 | 3保存形式×2 fixtureの6条件×30回＝180保存。原command p95≤1000ms |
| 長時間・完全復元 | 実7200秒、112編集、88003記録、113履歴／送信待ち、実75497472 bytes（72MiB）の素材 |
| 出力・中断 | 完全出力600000ms、進捗・取消2000ms。原手順の時間定義を保持 |
| 復元・異常系 | new / clone / cold、同じ全量の破損・unknown major・最終error・quota・通常再試行 |
| 資源測定 | 既存measure_resourcesの各size3標本を保存。強制2 GC後のmain renderer V8 heapと、peak / RSS / Worker / native memoryを区別 |

Largeの原上限なし6指標について、UI保存p95≤1000ms、図／年表p95≤33.4msは追加の**未採用目標案**にすぎない。原Standardや180保存の既存上限と混同しない。cache4件やtext予算8Mi code unitsは総メモリ上限ではない。

最初の製品変更より前に1Aで比較基準を固定する。NP05の最終比較、NP06の正式実行、NP16の統合後受入は3Bの同一最終候補の実行にまとめる。1Dの準備完了を正式合格へ繰り上げない。原30/180の比較基準原本がなければ変更前に必要な測定を行うため、全期間で重い測定が必ず一度とは保証しない。

正式測定と資源測定は同じホスト資源で直列に実施し、並列ビルドや別の重い測定を重ねない。source / tree / build / 配信bytes / fixture / driver / argv / run / attempt / 実終了 / cleanup / sealを結ぶ。最終候補を途中で変更しない。失敗を修正した候補や異なるfixtureへ古い結果を付け替えない。失敗試行は保持し、新しいoutputで必要な正式一式を再実行する。

## G04 各PRの検査

局所検査を先行して原因を絞り、各製品PRでは元の必須全unit・build・3ブラウザー全inventoryと後続rb03 / rb04 / rb10、失敗証拠回収・最終verifyを通す。assert、fixture、timeout、retry、skip、engineを減らして時間を短くしない。最新の `.github/workflows/ci.yml` を実行コマンドの正本として読む。

文書だけの変更は既存 `scripts/ci/ci_controls.py` の保守的なscopeを使う。JSON、検査入力、runner、workflowの変更を文書だけと扱わない。CI準備の改善は3Aで比較し、この計画PRでCI定義を変更しない。

文書の確認コマンドは以下。追加のテストは新たな機能・不具合・誤判定の具体的リスクを確認するために作り、単純な文言変更だけのために実装を写したテストを増やさない。

```bash
python3 scripts/check_docs.py
python3 scripts/check_completion_plan.py
python3 -m unittest discover -s scripts -p 'test_check_*.py' -v
python3 -m unittest discover -s scripts/ci -p 'test_*.py' -v
```

検査結果は実コマンド、exit code、対象版、CI URLとattempt、証拠pathで示す。CI成功と正式受入成功は別の判定である。

## G05 証拠・外部待ち・公開判定

N05の2原本は別々の実downloadイベントから保存する。整形したJSONの複製は不可。最新116/464の逐条判定は原文・独立期待・実観測と結び、索引や旧94/22だけから合格を作らない。CIの各engine／集約ZIPは全member、CRC、実bytes、SHAを確認する。

証拠束にはsource / dist / helper / raw / native / 失敗試行を含め、空の領域へ再取得して独立照合する。formal包の既存95MiB未満制約を超える場合、証拠を切り捨てない。既存delivery形式等の輸送案とchecker互換を別レビューし、再結合した全体と全memberの一致を証明する。

原22外部条件、AC-G02 / CP04の実2アカウント、旧C29の37分割＋MANIFEST／18宣言の原本、CP15の独立確認者と結果を別々に管理する。準備済と実受入済を区別する。fresh agentのコードレビューはCP15の独立ユーザー受入の代用ではない。元 `scripts/check_release.py` の9 gateとBLOCKEDを維持する。

## G06 許可範囲と並行作業

- 実機試験、既存の別用途Supabase、本番DB、実ユーザー作品、認証・権限・課金、配備・公開をこの計画から追加実施しない。Codex Cloud environmentsは使用・作成・変更しない。外部条件は許可された対象環境と実行依頼がそろってから扱う。X01〜X12は未採用のまま維持する。
- 変更は新規ブランチとレビュー可能なDraft PRへ提出する。指定された単位の実装・検査・PR・引継ぎを進め、依存する次単位へはユーザーのmerge後に更新mainから着手する。作業者はmerge・公開しない。
- 1依頼の統合担当1人＋独立した実装担当最大2人を基本にする。子担当へは対象ID、読むpath、変更許可path、完了条件と必要な証拠だけ渡し、会話全文を自動転送しない。独立作業がなければ担当を増やさない。1Bと1Cを同時に依頼する場合も全体で統合担当1人＋実装担当最大2人とし、子担当がさらに担当を増やさない。共通統合担当と所有pathの割当を同じ引継ぎ記録で確認できる場合だけ1B／1Cを同時進行し、未割当なら1B→1Cの直列で進める。
- `src/storage/store.ts`、`src/App.tsx`、共有型、共有manifest・台帳の編集者は同時に1人。先に変更範囲を割り当て、重複が判明した部分は直列へ戻す。別ブランチでも同じ基盤を同時変更してよいとは限らない。
- 通常の依頼は自分の `handoffs/<ID>.md` を更新する。全体 `STATUS.md` は1D・2C・3Cの段階統合担当だけが集約更新する。次の実行可否は依存handoffとGitHubの実merge / CIを照合して判断する。

短い引継ぎは再調査の入口であり原本の置換ではない。ログ要約のためのRTK等は必須にしない。#71は調査時点で未統合の別Draft PRなので、実装済みの前提や今回の依存へ加えない。
