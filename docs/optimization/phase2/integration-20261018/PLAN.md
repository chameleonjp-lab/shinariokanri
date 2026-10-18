# P2-03〜05のmain向け統合候補

> **For agentic workers:** Use superpowers:executing-plans to execute the tasks in order. Keep the original requirements and every verification condition.

**Goal:** main未到達の#63〜65の採用済み実装・検査・証拠を最新mainと両立させ、P2-06/07を検証できるレビュー可能な基点を作る。

**Architecture:** 最新mainから作った新規ブランチ上で、#63〜65の元merge commitを祖先に保持する統合候補を作る。差分だけのsquashでは元commitのmain到達を証明できないため、mainと3つの元mergeを親に持つ候補を使う。#65までの既存製品実装を再実装せず、mainのP2-02と#66の独立した監査・研究コードを保持する。元の各計測は元sourceに属するHIST証拠として維持する。

**Tech Stack:** TypeScript/React/Dexie、Node 24、元package-lock、Vitest、Playwright 3 engine、元Python検証器。

**Spec:** ../reassessment-20261018/DESIGN.md、../../phase1/HANDOFF.md、およびdocs/implementation/codex-three-phase-2026-10-17/PHASE_2_OPTIMIZATION.md。

## Global Constraints

- 原104要件、116ケース/464条項、24工程/6群、68補助確認、73固定入力を維持する。
- 元fixture/seed/実bytes、30回/180保存/7200秒/600000ms/2000ms、assert/timeout/retry/skipを変更しない。
- #63の保存changeset試作は不採用のまま。保存形式・DB/schema・認証・公開範囲の新しい変更は加えない。
- 前回ユーザーの「実機テスト、本番環境変更、マージ、公開を実施しない」を維持し、main向けDraftとその候補上の後続作業を提出する。mainへの実マージを行わない。
- 過去のmain未統合という観測・計測値・source識別を現在の成績へ付け替えない。原94local/22external、RELEASE BLOCKEDを維持する。

## Review Focus

- #62修正版の選択/reload/権限/未保存draft維持を失わない。
- #61のscope別候補準備を未修正の古い実装へ戻さない。
- #65のcacheEpoch/所有者/preview/ACK衝突検査を部分的な競合解消で失わない。
- #66の過去source検証を現在のsource一致の恒久CI制約へ変えない。
- 不採用試作・過去の失敗・不利値・未受入条件を成功へ書き換えない。

## Task 1: 累積ソースの統合と由来の固定

**Files:** #63〜65が追加・変更したsrc/scripts/testsとdocs/optimization/phase2/p2-03〜05。新しい報告は本ディレクトリ。mainの原CI・依存・元fixture・元docs/dataは不変。

**Interfaces:** 消費する基点mainは3650244bfb05cfd03e52d5622d04ccd8dc9bfc89。累積製品sourceは#65 HEAD f07c53036f061ebdc0e807dc521d04164080f5c3。保持する元mergeは#63 c06ff7becc75f6ed34b097e1ae5134074b1c50ad、#64 559777cf1b5301483f2fbbd17014ffc190f7c2f3、#65 5299d389d9eb81d282dd9e64347763d573751819。成果はsourceの一致と3元mergeの祖先到達を照合した統合候補commit。

- [x] GitHubでmainと#63〜66のマージ先・HEAD・状態を再取得する。
- [x] mainから隔離worktreeを作り、必要な祖先を取得する。
- [x] merge-treeで候補を算出し、App.tsxの2区間、store.tsの1区間を#65の所有者・cacheEpoch制御で解消する。
- [x] App.tsx/store.tsが#65の正確なbytes、referenceChoicesと#66検証器がmainの正確なbytesであることを確認する。
- [ ] 全製品ファイル・原入力・削除なしを照合し、source由来をJSONへ記録する。
- [ ] 元のdocument/completion/phase1/reassessment検査、全Pythonテスト、全unit、buildを実行し、出力を保持する。Expected: 元release guard以外は全成功。release guardはRELEASE BLOCKED/exit1。
- [ ] 新規ブランチへcommitし、main向けDraftを提出する。原CI全7ジョブ・3engine全inventory・後続回帰・復元原本・aggregateを確認する。Expected: 全成功、skipped/flaky/unexpected=0。

既存実装の組合せだけを行う本タスクでは元のbehavior/負例テストを利用する。統合中に新しい不具合が見つかれば、反例を先にREDにして最小修正し、元条件でGREENを確認する。

## 後続の分離

P2-06とP2-07は、この統合候補を実際の基点としてAPIと失効境界を確認した後、既存D06/07/09/10/11と#66の比較を引き継ぐ個別計画で実装する。未mainの候補をmain統合済みとは表現しない。製品採用、source計測、全必須CIを各レビュー範囲に結び付ける。
