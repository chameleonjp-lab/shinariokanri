# Codexへ1つずつ送る依頼文

下のコード枠を**1つだけ**コピーして送る。3段階は進行を整理する区切りであり、3回の依頼で全作業を一括実行する指示ではない。通常は1単位を1依頼とし、時間・証拠量・変更範囲に応じて同じ単位を小さなPRへ分け、最後の「中断・小分け作業の再開」を使う。

共通の実行手順は[README.md](README.md)、変更・証拠・並行作業の条件は[GUARDRAILS.md](GUARDRAILS.md)、依頼範囲は各依頼カードを読む。[STATUS.md](STATUS.md)は段階統合時の一覧スナップショットなので、次の着手可否は直前の引継ぎとGitHub上の実際のmerge・CI結果でも確認する。

## コピーする順序と文脈の渡し方

`1A → (1B / 1C) → 1D → 2A → 2B → 2C → 3A → 3B → 3C` の順で進める。1Bと1Cは、1Aの依存PRがユーザーによりmergeされ、所有pathが独立する場合に並行できる。依存する次の単位は、ユーザーのmerge後に更新したmainから始める。

通常の10依頼と中断再開文に加え、任意の「1B＋1Cを同時に進める依頼文」を用意している。これを選ぶ場合だけ、1B・1Cの個別依頼2回を、その同時依頼1回で置き換える。実施単位・別PR・別引継ぎの管理は1Bと1Cのまま維持する。

- 並行担当は**全体で統合担当1人＋実装担当最大2人**。1B・1Cを同時に行う場合もこの上限を共有し、下位担当による再帰的な追加spawnは行わない。所有pathを先に分け、独立pathだけを並行する。`store.ts`、`App.tsx`、共有型・manifestの同時編集は禁止する。
- 下位担当へは対象カード、関係する引継ぎ、必要な原文・API・所有path・検証条件だけを渡す。全文脈の自動転送、全長文資料・全生ログの毎回の読み直しはしない。欠けた引継ぎを過去全履歴から推測して埋めない。
- RTKのPR #71は計画時点で未統合なので、利用可能な前提にしない。トークン削減率の数値保証はしない。
- 通常の単位は自分の `handoffs/<ID>.md` を更新する。全体の `STATUS.md` は1D・2C・3Cの統合担当だけが更新し、1Bと1Cは競合編集しない。
- 外部環境が未提供でも可能な準備を進め、準備済の内容と未実行・BLOCKEDの条件を分けて記録する。実機試験や本番変更を自動で始めない。

## 1A — 製品変更前の基準固定

```text
対象リポジトリ: https://github.com/chameleonjp-lab/shinariokanri
計画フォルダー: docs/implementation/codex-next-stages-2026-10-19/
最初に計画内の README.md、GUARDRAILS.md、STATUS.md、requests/1A.md を読み、計画PRの実mergeと最新mainを確認してください。初回なので直前unitのhandoffはありません。再開なら handoffs/1A.md と実PR・commitを先に確認してください。
今回の範囲は1Aだけです。NP01とNP05 baselineとして、製品変更前の現行実装・原受入・計測条件・比較対象の識別を固定してください。NP05全体を準備だけで完了扱いにしないでください。
不足する引継ぎを過去全履歴から推測せず、READMEの文脈・並行制限に従い、完了できる範囲は自律実行してください。依存が未統合なら、依存作業の実行前に準備と阻害記録まで進めてください。
変更を新Draft PRにし、実行した検証とCI結果、未実行条件、handoffs/1A.md を提出してください。STATUS.mdの全体更新はしません。mergeはユーザーのみです。
```

## 1B — N05原本と補助RGの判定

```text
対象リポジトリ: https://github.com/chameleonjp-lab/shinariokanri
計画フォルダー: docs/implementation/codex-next-stages-2026-10-19/
最初に計画内の README.md、GUARDRAILS.md、STATUS.md、requests/1B.md、handoffs/1A.md を読み、1Aの依存PRの実mergeとCIを確認し、ユーザーのmerge後に更新したmainから始めてください。再開なら handoffs/1B.md も確認してください。
今回の範囲は1Bだけです。NP02としてN05の二つの実ダウンロード原本を取得・識別し、NP03として補助RGの証拠と判定を整理してください。履歴記録を新しい原本・実測へ読み替えないでください。
1Cとの同時進行は、共通統合担当と独立した所有pathの割当を同じ引継ぎ記録で確認できる場合だけにし、未割当なら1B→1Cを直列に進め、子担当の再委任は行わないでください。不足する引継ぎを過去全履歴から推測せず、READMEの文脈・並行制限に従い、完了できる範囲は自律実行してください。依存未統合なら準備と阻害記録まで進めてください。
変更を新Draft PRにし、検証・CI結果、原本のpathとSHA、未実行条件、handoffs/1B.md を提出してください。STATUS.mdは編集しません。mergeはユーザーのみです。
```

## 1C — 既存6職種E2Eの不足接続と外部準備

```text
対象リポジトリ: https://github.com/chameleonjp-lab/shinariokanri
計画フォルダー: docs/implementation/codex-next-stages-2026-10-19/
最初に計画内の README.md、GUARDRAILS.md、STATUS.md、requests/1C.md、handoffs/1A.md を読み、1Aの依存PRの実mergeとCIを確認し、ユーザーのmerge後に更新したmainから始めてください。再開なら handoffs/1C.md も確認してください。
今回の範囲は1Cだけです。NP04として既存6職種E2Eの不足する接続を補い、NP08の外部試験準備を進めてください。外部環境未提供は準備済と未実行・BLOCKEDを分け、実機試験や本番変更は始めないでください。
1Bとの同時進行は、共通統合担当と独立した所有pathの割当を同じ引継ぎ記録で確認できる場合だけにし、未割当なら1B→1Cを直列に進め、子担当の再委任は行わないでください。不足する引継ぎを過去全履歴から推測せず、READMEの文脈・並行制限に従い、完了できる範囲は自律実行してください。依存未統合なら準備と阻害記録まで進めてください。
変更を新Draft PRにし、検証・CI結果、未実行条件と必要な外部環境、handoffs/1C.md を提出してください。STATUS.mdは編集しません。mergeはユーザーのみです。
```

## 任意 — 1B＋1Cを同時に進める依頼文

1A統合後に並行作業を選ぶ場合、1B・1Cの個別依頼2回の代わりに、この1枠をコピーする。

```text
対象リポジトリ: https://github.com/chameleonjp-lab/shinariokanri
計画フォルダー: docs/implementation/codex-next-stages-2026-10-19/
最初に計画内の README.md、GUARDRAILS.md、STATUS.md、handoffs/1A.md を読み、依頼カードは requests/1B.md と requests/1C.md だけを読んでください。1Aの依存PRの実mergeとCIを確認し、ユーザーのmerge後に更新したmainから始めてください。既存作業がある側は自分のhandoffと実PRも確認してください。
今回の範囲は1Bと1Cだけです。あなたが共通統合担当1人となり、開始時に handoffs/1B.md と handoffs/1C.md の両方へ共通統合担当と所有pathの同じ割当を記録してから、1B側1人・1C側1人、全体で実装担当最大2人に分担してください。下位担当の再帰的な追加spawn・再委任は行わず、会話全文を渡さず、各側のカード・必要な引継ぎ・原文・API・所有path・検証条件だけを渡してください。
所有pathが独立する部分だけを並行し、共通runner・manifestの調整は統合担当1人が直列に担当してください。store.ts・App.tsx・共有型・manifestの同時編集は禁止し、境界が重なれば該当部分を直列へ戻してください。
1BはNP02のN05の二つの実ダウンロード原本とNP03の補助RG判定、1CはNP04の既存6職種E2Eの不足接続とNP08の外部準備を進めてください。必要な原文・検査は両カードが示す範囲から追加で確認し、不足する引継ぎを過去全履歴から推測せず、完了できる範囲は自律実行してください。
各PRで要求される元の必須CIを維持し、検査条件の緩和やskipで短縮しないでください。どちらかがBLOCKEDでも独立して実行できる部分は継続し、準備済と未実行条件を分けてください。実機試験や本番変更は始めないでください。
1B・1Cを別々の新Draft PRにし、それぞれの検証・CI結果、原本pathとSHA、未実行条件、handoffs/1B.md と handoffs/1C.md を提出してください。STATUS.mdは編集せず、1Dへは進めないでください。mergeはユーザーのみです。
```

## 1D — 比較設計・正式検証準備・第1段階統合

```text
対象リポジトリ: https://github.com/chameleonjp-lab/shinariokanri
計画フォルダー: docs/implementation/codex-next-stages-2026-10-19/
最初に計画内の README.md、GUARDRAILS.md、STATUS.md、requests/1D.md、handoffs/1A.md、handoffs/1B.md、handoffs/1C.md を読み、依存PRすべての実mergeとCIを確認し、ユーザーのmerge後に更新したmainから始めてください。再開なら handoffs/1D.md も確認してください。
今回の範囲は1Dだけです。NP05の比較設計、NP06の準備、NP07の暫定逐条表・正式runbookをまとめてください。準備だけでNP05・NP06・NP07全体を完了扱いにせず、正式実行・確定の残作業を残してください。
不足する引継ぎを過去全履歴から推測せず、READMEの文脈・並行制限に従い、完了できる範囲は自律実行してください。依存未統合なら準備と阻害記録まで進めてください。
統合担当としてSTATUS.mdの第1段階スナップショットを更新し、変更を新Draft PRにして、検証・CI結果、未実行条件、handoffs/1D.md を提出してください。mergeはユーザーのみです。
```

## 2A — 履歴取消から本文取得削減へ

```text
対象リポジトリ: https://github.com/chameleonjp-lab/shinariokanri
計画フォルダー: docs/implementation/codex-next-stages-2026-10-19/
最初に計画内の README.md、GUARDRAILS.md、STATUS.md、requests/2A.md、handoffs/1D.md を読み、依存PRの実merge・CIと引継ぎにある着手条件を確認し、ユーザーのmerge後に更新したmainから始めてください。再開なら handoffs/2A.md も確認してください。
今回の範囲は2Aだけです。NP09の履歴取消を先に実装・検証し、その安全性を確認してからNP10の本文取得削減へ進んでください。小分けPRにする場合もこの依存順を維持してください。
不足する引継ぎを過去全履歴から推測せず、READMEの文脈・並行制限に従い、完了できる範囲は自律実行してください。依存未統合なら準備と阻害記録まで進めてください。
変更を新Draft PRにし、変更前後の比較、検証・CI結果、未実行条件、handoffs/2A.md を提出してください。STATUS.mdの全体更新はしません。mergeはユーザーのみです。
```

## 2B — 保存前処理と検索・一覧

```text
対象リポジトリ: https://github.com/chameleonjp-lab/shinariokanri
計画フォルダー: docs/implementation/codex-next-stages-2026-10-19/
最初に計画内の README.md、GUARDRAILS.md、STATUS.md、requests/2B.md、handoffs/2A.md を読み、依存PRの実mergeとCIを確認し、ユーザーのmerge後に更新したmainから始めてください。再開なら handoffs/2B.md も確認してください。
今回の範囲は2Bだけです。NP11の保存前処理とNP13の検索・一覧を進めてください。store系とcatalog系は所有pathとAPIの境界が独立する場合だけ内部並行し、store.ts・App.tsx・共有型・manifestを同時編集しないでください。
不足する引継ぎを過去全履歴から推測せず、READMEの文脈・並行制限に従い、完了できる範囲は自律実行してください。依存未統合なら準備と阻害記録まで進めてください。
変更を新Draft PRにし、変更前後の比較、検証・CI結果、API変更、未実行条件、handoffs/2B.md を提出してください。STATUS.mdの全体更新はしません。mergeはユーザーのみです。
```

## 2C — 一画面読込から世界保持へ・第2段階統合

```text
対象リポジトリ: https://github.com/chameleonjp-lab/shinariokanri
計画フォルダー: docs/implementation/codex-next-stages-2026-10-19/
最初に計画内の README.md、GUARDRAILS.md、STATUS.md、requests/2C.md、handoffs/2A.md、handoffs/2B.md を読み、依存PRの実mergeとCIを確認し、ユーザーのmerge後に更新したmainから始めてください。再開なら handoffs/2C.md も確認してください。
今回の範囲は2Cだけです。NP12の一画面読込を先に実装・検証し、依存するNP14の世界保持へ進んでください。受入・完全復元・失効条件を保ち、採否と理由を記録してください。
不足する引継ぎを過去全履歴から推測せず、READMEの文脈・並行制限に従い、完了できる範囲は自律実行してください。依存未統合なら準備と阻害記録まで進めてください。
統合担当としてSTATUS.mdの第2段階スナップショットを更新し、変更を新Draft PRにして、変更前後の比較、検証・CI結果、未実行条件、handoffs/2C.md を提出してください。mergeはユーザーのみです。
```

## 3A — CI準備の比較

```text
対象リポジトリ: https://github.com/chameleonjp-lab/shinariokanri
計画フォルダー: docs/implementation/codex-next-stages-2026-10-19/
最初に計画内の README.md、GUARDRAILS.md、STATUS.md、requests/3A.md、handoffs/2C.md を読み、依存PRの実mergeとCIを確認し、ユーザーのmerge後に更新したmainから始めてください。再開なら handoffs/3A.md も確認してください。
今回の範囲は3Aだけです。NP15のCI準備を比較し、元の検査条件・閾値・ケース集合・証拠同一性を保つ案だけを採否判定してください。RTKのPR #71の導入を前提にせず、トークン削減率を数値保証しないでください。
不足する引継ぎを過去全履歴から推測せず、READMEの文脈・並行制限に従い、完了できる範囲は自律実行してください。依存未統合なら準備と阻害記録まで進めてください。
変更を新Draft PRにし、比較条件と採否理由、検証・CI結果、正式検証の残条件、handoffs/3A.md を提出してください。STATUS.mdの全体更新はしません。mergeはユーザーのみです。
```

## 3B — 同一最終候補の正式検証

```text
対象リポジトリ: https://github.com/chameleonjp-lab/shinariokanri
計画フォルダー: docs/implementation/codex-next-stages-2026-10-19/
最初に計画内の README.md、GUARDRAILS.md、STATUS.md、requests/3B.md、handoffs/3A.md、handoffs/1D.md、handoffs/1A.md を読み、依存PRの実mergeとCI、baselineと正式runbookの所在を確認し、ユーザーのmerge後に更新したmainから始めてください。再開なら handoffs/3B.md も確認してください。
今回の範囲は3Bだけです。NP05の最終比較とNP06・NP16の正式検証を、同一最終候補に固定して行ってください。正式30回・180保存・実7200秒・full113は直列実行し、性能測定の並行実行、時間短縮、外挿、別候補への履歴合格の付替えはしないでください。
不足する引継ぎを過去全履歴から推測せず、READMEの文脈・並行制限に従い、完了できる範囲は自律実行してください。候補変更・中断・未実行があれば証拠の有効範囲と次の一操作を記録し、準備だけで正式完了扱いにしないでください。
変更を新Draft PRにし、候補・build・fixture・配信bytesと原本SHA、検証・CI結果、未実行条件、handoffs/3B.md を提出してください。STATUS.mdの全体更新はしません。mergeはユーザーのみです。
```

## 3C — 逐条確定・証拠再取得・第3段階統合

```text
対象リポジトリ: https://github.com/chameleonjp-lab/shinariokanri
計画フォルダー: docs/implementation/codex-next-stages-2026-10-19/
最初に計画内の README.md、GUARDRAILS.md、STATUS.md、requests/3C.md、handoffs/3B.md を読み、依存PRの実mergeとCI、最終候補の識別を確認し、ユーザーのmerge後に更新したmainから始めてください。再開なら handoffs/3C.md も確認してください。
今回の範囲は3Cだけです。NP07の逐条判定を確定し、必要な証拠を再取得してNP08の残条件を更新してください。3Bの履歴合格を別候補へ付替えず、製品・配信bytes等が変わった場合はGUARDRAILSと依頼カードの再取得条件に従ってください。
不足する引継ぎを過去全履歴から推測せず、READMEの文脈・並行制限に従い、完了できる範囲は自律実行してください。外部環境未提供は準備済と未実行・BLOCKEDを分け、実機試験・本番変更・公開を始めないでください。
統合担当としてSTATUS.mdの第3段階スナップショットを更新し、変更を新Draft PRにして、逐条判定・検証・CI結果、未実行条件、handoffs/3C.md と最終報告を提出してください。mergeはユーザーのみです。
```

## 中断・小分け作業の再開

`<ID>` と `<substep>` を直近の引継ぎにある値へ置き換える。未実施の単位をまとめて指定しない。

```text
対象リポジトリ: https://github.com/chameleonjp-lab/shinariokanri
計画フォルダー: docs/implementation/codex-next-stages-2026-10-19/
再開する単位: <ID> / substep: <substep>
最初に計画内の README.md、GUARDRAILS.md、STATUS.md、requests/<ID>.md、handoffs/<ID>.md と、依頼カードが指定する直前handoffを読んでください。引継ぎが無い場合はその事実を記録してください。
実PR・base/head/product/evidence commit・merge状態・CI runとattemptを再確認し、引継ぎの次の一操作から、指定単位の未完了部分だけを再開してください。依存PRはユーザーのmerge確認後、更新したmainから扱ってください。同一未統合PRの再開なら、現状のheadと差分を確認してそのブランチを続けてください。
不足する引継ぎを過去全履歴から推測せず、READMEの文脈・並行制限に従い、完了できる範囲は自律実行してください。履歴合格を新候補に付替えず、製品・build・fixture・配信bytesが変わった場合は証拠の有効性と必要な再取得を判定してください。
別の小分け差分は新Draft PRにし、同じ未統合作業の中断なら既存Draft PRを更新してください。検証・CI結果、未実行条件、更新した handoffs/<ID>.md を提出してください。STATUS.mdの全体更新は1D・2C・3Cの統合時だけです。mergeはユーザーのみです。
```
