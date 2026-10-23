# shinariokanri

シナリオ管理

2026-10-19以降の開発の入口は、[Codex向け・次の3段階と10依頼の実装計画](docs/implementation/codex-next-stages-2026-10-19/README.md)です。PR #59の計画と#60〜72の実装・証拠の差異、#73の実行ガイド、NP01〜16の対応、並行範囲、完了条件、コピーして使える依頼文をまとめています。この新計画の実装は未着手で、正式受入と外部条件を完了扱いにはしていません。

2026-10-16の[PR #49に従う後続対応](docs/quality/pr49-followup-2026-10-15/README.md)は過去の固定候補に対する記録です。PR #57は外部でmain `1f642457` へ取り込まれ、残る証拠と判定をDraft PR #58へまとめました。固定製品 `1fcadcca` の元30回・180保存・実7200秒と全113履歴/72MiBの完全復元、同全量の異常系/通常再試行まで成功。原116ケース/464条項を個別に確認し、94ケースがローカル条件を満たし22ケースは実条件待ちです。証拠8束の公開先からの実取得・全7296ファイル照合も完了。実機・専用Auth/RLS/実同期・費用・独立レビューと完成版の公開は保留です。

2026-10-12の[計画と実装の差分・Codex向け再計画](docs/completion-replan-2026-10-12/README.md)は原計画として維持します。同資料の#48未マージ・CI2件失敗は作成時点の履歴です。原104要件を完了する必須15作業と、追加案を採用した場合の4作業を分けています。

ゲーム・小説・動画等のシナリオを、年表、人物・場所・物品、関係図、伏線、フラグ、分岐から管理するツールの設計と実装リポジトリです。PC・iPad・スマートフォンでの編集を対象にしています。

現在は**アプリを実装・検証中で、完成版は未公開**です。完成版の全104要件・24工程を維持し、未確認の受入条件を完了扱いにしていません。

開発中の最新版の公開先は **https://chameleonjp-lab.github.io/shinariokanri/** です。PR が `main` にマージされるたびに、GitHub Actions がビルドしてページを自動更新します（`main` への直接 push も対象）。配信の状況・再実行は [Pages ワークフロー](https://github.com/chameleonjp-lab/shinariokanri/actions/workflows/pages.yml)で確認できます。開いたままの画面は編集を保護するため旧版を使い続けることがあり、更新後はこのアプリのタブをすべて閉じてから開き直してください。公開は完成版の正式受入を意味しません。

- **[計画に従う統合候補と今回の実行状況](docs/quality/ap01-2026-10-11/README.md)**（#38〜#42の22差分、固定基準、証拠引渡し、後続工程。歴史結果から合格を転記しない）
- **[2026-10-11の計画・実装比較と追加機能の要件・実装計画](docs/review-2026-10-11/README.md)**（固定main基準、16残件、12追加候補。実装済み/最終合格とは区別）
- **[全機能を完成させる実装計画書](docs/plan/COMPLETION_PLAN.md)**（PR #2レビュー後の残作業・10段階）
- [104要件の作業カード](docs/plan/COMPLETION_TASKS.md) / [116受入と6回帰検査群](docs/plan/COMPLETION_ACCEPTANCE.md)
- [前回レビューの固定基準](docs/quality/pr2/README.md)

- [開発・検証の実行方法](docs/implementation/README.md)
- [実装進捗と残件](docs/implementation/PROGRESS.md)
- [ローカル編集・復元の手順](docs/implementation/USER_GUIDE.md)
- [公開構成と証拠ゲート](docs/implementation/RELEASE.md)

- [資料の入口と読む順番](docs/README.md)
- [要件仕様書](docs/spec/REQUIREMENTS.md)
- [実装計画表](docs/plan/IMPLEMENTATION_PLAN.md)
- [要件・工程・確認の追跡表](docs/plan/TRACEABILITY.md)
- [類似15ツールの調査と提案60項目](docs/research/RESEARCH.md)
- [調査資料PDF（27ページ）](docs/research/Game_Scenario_Manager_Research_2026-10-05.pdf)
- [文書検査の結果](docs/quality/DOCUMENT_VALIDATION.md)

文書の構造と対応関係は、Python 3.10以上・標準ライブラリだけで確認できます。

```bash
python3 scripts/check_docs.py
python3 scripts/check_completion_plan.py
python3 scripts/check_review_20261011.py
python3 -m unittest discover -s scripts -p 'test_check_docs.py' -v
```

この検査は文書の整合確認です。アプリの受入試験や実端末検証は実装後に行います。

## ライセンス

本プロジェクトの独自ソースコード、テスト、ビルド用スクリプト、および独自の説明文書は、別のライセンス表示があるものを除き、[Apache License, Version 2.0](LICENSE) の下で提供します。第三者のコード・素材等の扱いは、下記「第三者の著作物」を参照してください。

Apache-2.0 の条件に従って、商用利用、改変、複製、再配布ができます。改変版のソースコード公開を一律に義務付けるライセンスではありません。再配布時には、ライセンス本文、該当する権利表示・帰属表示の保持、変更したファイルへの変更告知などが必要です。NOTICE が付属する場合は、該当する帰属表示も保持してください。

許諾の正確な内容は LICENSE の英文を参照してください。この日本語説明は、その条項を変更するものではありません。特許許諾は Apache-2.0 第3条の範囲に限られ、商標利用権は第6条に定める場合を除いて付与されません。保証・責任の扱いは第7〜9条によります。

### 第三者の著作物

依存ライブラリ、取り込まれた第三者コード、画像・音声・フォント、モデル・モデル重み、外部資料、第三者を権利者とするテスト素材等は、それぞれの権利者のライセンス・利用条件に従います。本プロジェクトの LICENSE は、これらを一括して再許諾したり、既存の条件を置き換えたりするものではありません。該当ファイルの表示、同梱の LICENSE / NOTICE、第三者通知を確認してください。

利用者が入力・取り込む文章、画像、音声等に、本プロジェクトのライセンスが自動的に適用されることはありません。利用者素材の権利と、書き出した成果物に含まれる本プロジェクトのコードや第三者コードの許諾を分けて確認してください。
