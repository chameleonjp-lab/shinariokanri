# 実装と検証の記録

残作業の順序は[完成までの実装計画書](../plan/COMPLETION_PLAN.md)を参照。全104要件の作業カードと116受入の対応から、現在の実装との差を埋める。

計画書の104要件・24工程を変更せず、React/TypeScriptのローカル編集アプリを実装中。途中の実装を完成版v1として公開しない。設計時点の要件・工程・受入レジストリは基準資料として保持し、現在の実装証拠と区別する。

- [依存関係の固定](DEPENDENCIES.md)
- [実装状況と残件](PROGRESS.md)
- [使い方と復元](USER_GUIDE.md)
- [公開条件](RELEASE.md)
- [独立レビュー](REVIEW.md)
- [現在の出力範囲](EXPORT_COMPATIBILITY.md)

実行方法:

```bash
npm ci
npm run dev
npm test
npm run build
npm run test:e2e
python3 scripts/check_docs.py
python3 -m unittest discover -s scripts -p 'test_check_*.py' -v
```

開発・previewとも `/shinariokanri/` を開く。rootホストのbuildだけは `APP_BASE=/ npm run build` とする。previewサーバーは検証用で、本番サーバーとして使わない。ブラウザー試験のChromiumは既定で `/usr/bin/chromium`、別の実体は `CHROMIUM_PATH` で指定する。Firefox/WebKitも用意した環境では `BROWSER_ENGINES=all` で実行する。CIはPlaywrightの3 engineをインストールする。

文書検査の合格は型・アプリ・権限・実端末の合格を意味しない。部品試験に通っても、該当受入ケースの全手順と失敗条件を確認するまでは未確認を残す。

Node 24以降で `npm run schema:generate` を実行すると、アプリと同じ型レジストリから `src/domain/schema.json` を再生成する。部品試験は生成物との一致とAjvによる実行検査を行う。
