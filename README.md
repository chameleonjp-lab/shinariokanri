# shinariokanri

シナリオ管理

ゲーム・小説・動画等のシナリオを、年表、人物・場所・物品、関係図、伏線、フラグ、分岐から管理するツールの設計と実装リポジトリです。PC・iPad・スマートフォンでの編集を対象にしています。

現在は**アプリを実装・検証中で、完成版は未公開**です。完成版の全104要件・24工程を維持し、未確認の受入条件を完了扱いにしていません。

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
