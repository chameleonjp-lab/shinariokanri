# RTK Safe Execution：シナリオ管理への試験導入

## 目的

実装内容・検証項目・正式な証拠の保存方法を変えず、開発担当のAIが読む**一部のコマンド出力だけ**を短縮します。RTKを使ったコマンドの完全な出力と終了コードは別に保存します。

この導入はアプリの変更・テスト最適化・検査省略・公開許可ではありません。既存の `CI`、`release`、`retain-release-review` ワークフロー、全受入要件、正式な証拠、実機/本番条件は維持します。

### 配布元

- 共通管理： https://github.com/chameleonjp-lab/skill--Safe-Execution
- 固定参照：`9e87e123e6e0ef18d53efa852c1ce130c26c790d`（共通Skill PR #2を反映したmain）。このリポジトリにコピーしたSkill 6ファイルと完全一致することをGit blob SHAで確認します。
- 使用ファイル：`.agents/skills/rtk-safe-execution/SKILL.md`。RTK本体のインストールは含みません。

## 対象（最初の段階のみ）

承認済みの開発作業で元々必要なときに限り、次の用途で使用します。無駄な繰り返し実行はしません。

```bash
SKILL_DIR=.agents/skills/rtk-safe-execution
# Skill自体の検証（模擬RTKを使用）
python3 -m unittest discover -s "$SKILL_DIR/tests" -v

# 単体テスト（CIと同じ元コマンド・テスト件数を維持）
python3 "$SKILL_DIR/scripts/run.py" --kind test --label shinario-unit -- npm test -- --maxWorkers=1 --fileParallelism=false

# 安全なファイル名一覧だけ
python3 "$SKILL_DIR/scripts/run.py" --kind list --label tracked-code -- git ls-files src tests scripts
```

Python 3.11以上を使用します。RTK本体が使えなければ短縮表示は行わず、完全ログだけを保管して `RTK_NOT_INSTALLED` と明示します。外部ソフトの無断インストール・自動フック・Codex Cloud環境の変更は行いません。

## 何が保存されるか

- 毎回異なる非Git領域のディレクトリ（通常 `~/.local/state/rtk-safe-execution/`）に `raw.log` と `metadata.json` を保存します。
- `metadata.json` に本来の終了コード、時刻、ログの大きさ、SHA-256、RTK実行状況を記録します。RTK利用時のみ `rtk-summary.txt` も保存します。
- `--kind test` は短縮結果に加え、元ログ末尾24行・最大4,000文字を参考表示します。結果が失敗、曖昧、説明不足の場合は省略前の `raw.log` を確認します。
- 保存内容の整合性は `python3 "$SKILL_DIR/scripts/verify.py" /path/to/metadata.json` で確認できます。
- **ローカルの完全ログは長期保存を保証しません。** 既存GitHub Actionsとその証拠は引き続き従来通り保存します。生ログをGitや公開アーティファクトへ自動送信しません。

## 範囲外（必ず従来の完全な実行・記録を維持）

- `.github/workflows/ci.yml` にある単体テスト、3種類のブラウザの全検査と結果原本、失敗時の復元原本の検証。
- `.github/workflows/release.yml`、`.github/workflows/retain-release-review.yml`、承認と公開の条件、権利・安全の審査。
- 7200秒の長時間検証、116受入項目・464条項の照合、Standard/Largeの全量復元試験、性能測定、Auth/RLS/Supabaseの権限確認などの正式な測定と根拠。
- 内容が外部の会話原文、個人情報、秘密鍵、認証情報、環境変数、内部レビュー情報になり得るコマンド。

## 合格基準と今後の判断

1. Skillの付属オフラインテスト10件が成功する。これらは模擬RTKであり実機検証を意味しません。
2. 試験利用で元コマンドの終了コードと全出力が正確に保存され、元ログの改変を検出できる。
3. エラー時には短縮結果だけで成功判定をせず、完全ログで原因の根拠を確認できる。
4. RTK本体が利用可能な環境で、実際に表示量が減ったか計測する。トークンや開発費の削減率を推定値で断定しない。

合格を確認してから対象を広げるか判断します。問題があればSkillを呼び出さず既存のコマンドを使用すれば元の開発手順に戻せます。

### GitHub Actionsへの影響

このPRの新しいSkill関連ファイルは、`scripts/ci/ci_controls.py` が「説明文書だけの変更」と認めるパスに含まれません。そのため既存CIは**正式な全検証を実行**します。これを回避するために判定条件を緩める変更は行いません。新しい軽量の `RTK Safe Execution self-tests` はSkill自身の10件だけを別途確認し、正式検証の代わりにはしません。
