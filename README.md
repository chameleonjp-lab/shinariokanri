# shinariokanri

シナリオ管理

ゲーム・小説・動画等のシナリオを、年表、人物・場所・物品、関係図、伏線、フラグ、分岐から管理するツールの設計と実装リポジトリです。PC・iPad・スマートフォンでの編集を対象にしています。

現在は**アプリを実装・検証中で、完成版は未公開**です。完成版の全104要件・24工程を維持し、未確認の受入条件を完了扱いにしていません。

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
python3 -m unittest discover -s scripts -p 'test_check_docs.py' -v
```

この検査は文書の整合確認です。アプリの受入試験や実端末検証は実装後に行います。
