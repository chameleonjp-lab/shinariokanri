# 第2段階の再監査・独立計測計画

目的は PR #59 の統合計画と PHASE_2_OPTIMIZATION.md に従い、最新mainの既存成果を再利用し、未統合の前提を越えずに残る設計判断を実行可能な形にすること。

基点: `b32de9525c4acf5206ac3d6d1d23f5b90967ec95` / tree `83ae5006ead9c7e2a83316b95a0e643a2338167b`。

## 制約と範囲

- 原104要件・116ケース/464条項・24工程/6回帰群・68補助確認、元fixture/seed/実bytes/30回/180保存/7200秒/600000ms/2000msを維持する。
- #60/61/62はmainに統合済み。#63/64/65は機能ブランチへの統合であり、mainへの到達を意味しない。依存する製品最適化を採用済みと扱わない。
- 新しい実験コードは `scripts/optimization/` と新規テストに限定し、製品のimport経路、DB、外部形式、CI、原入力は変更しない。
- 2案は研究用の寿命を持つ不変画像内の正規化コーパス共有と検索結果の有界キャッシュ。現行の全件処理を対照として保持する。設計選択は実測後に行い、製品への導入はmain前提の充足後とする。
- 実機・実Auth/サービス・本番・merge・配備・公開・X01〜12の実装は実施しない。外部22条件とRELEASE BLOCKEDを維持する。

## レビュー重点

同一revisionの別内容、深い可変値、owner/account/role/pin/schema/scopeの変更、返却配列の変更、容量上限と終了後の秘密保持を独立の小さな期待値で検査する。生値はNode補助計測であり、ブラウザー操作の原性能受入へ転用しない。

## 実装順

1. [ ] `scripts/optimization/catalogStudy.ts` と `tests/optimization/catalogStudy.test.ts`: owner全次元と深い不変性を要求し、終了時に保持を破棄する研究専用2案。既存検索と手書き期待値、改名・別名・削除・順序・例外・scope変更の反例を先にREDで確認する。
2. [ ] `scripts/optimization/measure-catalog-study.mjs`: 原Standard/Large入力・実72MiB素材を固定し、現行＋2案を同一30回の連続検索で比較する。setup/最初の検索/後続検索/ON仕事量/保持を区別し、全生値・source/input SHA・実環境を保存する。UI意味定義・参照/状態/公開索引・描画取得の現行経路も監査する。
3. [ ] `scripts/check_phase2_reassessment.py` と負例テスト: 104/116/464追跡、元入力blob、実験sourceと結果のdigest、全30値、正確性、未実行、依存main状態を検査する。文書/全unit/build/3engineの元検査を実行し、実際の失敗を保持する。最終レビュー後、新規Draft PRを提出する。

戻し方: 本PRの追加ファイルをrevert。製品・DB・形式変更はなく移行不要。第2段階製品完了や第3段階正式受入の完了を主張しない。
