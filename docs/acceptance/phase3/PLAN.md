# 第3段階 自動・非実機受入 Implementation Plan

> **For agentic workers:** Use superpowers:executing-plans. The user explicitly requested execution through a new Draft PR; the registered plan and phase-three request supply the approved scope. Track evidence and decisions in `LEDGER.md`.

**Goal:** 最新mainの採用済み実装を監査し、原条件の非実機受入・正式性能・完全復元を同一候補で実行して再現可能なDraft PRを提出する。

**Architecture:** 製品の正本・形式・既存検査は維持する。既存の原30回／113履歴runnerを再利用し、過去の原180保存runnerをpathだけ可搬化する。追加の証拠validatorは生値・実bytes・source/build・実終了・全件対応から判定する。

**Tech Stack:** TypeScript/React/Dexie, Vitest, Playwright 3 engines, Python unittest, GitHub Actions.

**Spec:** `docs/implementation/codex-three-phase-2026-10-17/PLAN_ALL_STAGES.md`, `PHASE_3_ACCEPTANCE.md`, `TRACEABILITY.md`; original contracts in `docs/data/` and `docs/optimization/phase1/contract-lock.json`.

## Global Constraints

- 104要件、116ケース／464条項、24工程／6回帰群／68補助、73固定入力を削減・緩和しない。
- 原Standard/Large各8指標×30、6条件×30=180保存、実7200秒、88003記録／113履歴・送信待ち／75497472素材bytes、600000ms、2000msを維持。
- 重い正式測定は同一資源で直列。p95はnearest rank、生値を丸めず失敗も保持。
- 実機・本番／別用途Supabase・実認証／権限／課金・配備／公開・mergeを実施しない。新しいCloud environmentを作成・設定しない。
- X01–X12は採用判断資料のみ。実環境待ちは自動試験で合格へ昇格しない。元release checkerを変更しない。

## Review Focus

- 同数の別fixture・別build・短縮soak・未完了復元を成功へ転記しない。
- UI表示とdurable commit、command時間とdebounceを含むUI時間を混同しない。
- 不正参照・同名異ID・秘密・固定版・取消／容量不足後の再試行とcoldを維持。
- 過去の94/22判定を新候補の実結果に付け替えない。
- CIの部分matrix・retry・欠落添付・失敗証拠の削除を受理しない。

## Task 1: 監査・入力・依存の固定

**Files:** `AUDIT_AND_DESIGN.md`, `TRACEABILITY.json`, `EXTERNAL.md`, `X_DECISIONS.md`, `LEDGER.md`.

**Interfaces:** 最新main `67bef6a08f63a737d64d5bab0c8a17e3364bbc0a`、#59–68の実マージ状態、原4条項と既存test/fixtureの具体的対応を後続判定へ渡す。

- [x] 最新main/open PR/protection/祖先と既存検証を確認する。
- [ ] 原116/464・24/6/68、AUD001–023/OPT01–15、22外部待ち、X12案を逐条照合する。
- [x] 現行・最小補完・広域再設計を比較し、再現した欠陥のみ修正対象とする。
- [x] `check_docs.py`, `check_completion_plan.py`, `check_phase1.py`とbaseline unitの実結果を保存する。

## Task 2: 可搬な正式計測と証拠検査

**Files:** `scripts/acceptance/seal_candidate.py`, `measure-original-saves.mjs`, `run_formal.py`, `scripts/check_phase3.py`, `scripts/test_check_phase3.py`, `docs/acceptance/phase3/procedures/`.

**Interfaces:** `seal_candidate.py --output PATH`はclean HEAD/tree/buildとsource/artifact/原契約のSHAを固定。`run_formal.py --output DIR`は候補のsealを作成し、原30×2、180、7200/full113を直列実行して各実終了と実行前後のsealを記録。`check_phase3.py --evidence DIR`は実測・byte・出所を再検査し、公開gateを変更しない。

- [x] 成功原本のmutatorで偽p95、欠落値、別fixture/build、短縮soak、113未満、欠落素材、未完了new/clone/cold、終了code不明を拒否するテストを先に書いてREDを確認。
- [x] 過去原180手順の実blob/全118memberを照合し、path/label/portの可搬化に限定。元assert/fixture/30回/期限を維持する。
- [x] seal・直列runner・検査を実装してGREEN。実コマンド／log／実終了を保存する。

## Task 3: 制作導線・例外の補完

**Files:** `tests/e2e/phase3-authoring-continuity.spec.ts`、必要と再現で確定した製品pathのみ。

**Interfaces:** 元の各職種相当の専門機能は既存原E2Eへ結合し、追加テストは空作品からの通常UI制作→参照→日本語本文→検索／試読→履歴→秘密出力→完全保存→空復元→再編集を一連で検査。新しい合格ケースとして元件数へ加算しない。

- [ ] 既存原E2Eのcoverageを照合し、切れている接続だけ追加する。
- [ ] 自動browserの実操作と独立archive内容を検査し、発見した製品不具合は再現RED→修正GREEN。
- [ ] 元全unit/buildと3engine追加導線を実行し、最終製品sourceをcommitして封印する。

## Task 4: 正式検証・引渡し

**Files:** `evidence/`、`MEASUREMENTS.md`, `VERIFICATION.md`, `release-evidence.json`, `README.md`。

**Interfaces:** 封印候補のsource/build/fixture/raw/native/実終了→独立判定→原受入と外部待ち→Draft PR・元全CIへ接続。

- [ ] 同一最終候補で原30×2、180、実7200/full113/new/clone/coldを直列実行。旧不利値を維持して比較する。
- [ ] 同じ完全ファイルの破損/unknown major/最終一般エラー/quota/通常再試行coldを元手順で実行する。
- [ ] 原全unit/build・3engine全inventoryと後続rb03/rb04/rb10を元CIで実行し、全artifactを照合する。
- [ ] 生証拠・source/dist/helperの実bytesとSHA、再実行手順・未実行・戻し方を保存する。
- [ ] fresh-context whole-branch review後、元release checkerの実BLOCKEDを保持して新規Draft PRに提出する。

## 実施判断

ユーザーは登録済み計画の第3段階を完成まで実行しDraft提出することを明示している。新しい機能・形式・本番変更の承認要求へ拡大せず、既承認範囲の計測・監査・検査・必要修正をこのsessionで継続する。
