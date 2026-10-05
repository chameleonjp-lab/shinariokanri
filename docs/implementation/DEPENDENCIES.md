# 依存関係の選定と固定

2026-10-05にnpm公式レジストリの版を照会し、package.jsonの完全な版番号とpackage-lock.jsonへ固定した。ライセンス欄は配布packageのmetadataを確認したもの。更新はlockfileと検証結果を一緒に変更する。

| package | 固定版 | license | 用途 |
| --- | --- | --- | --- |
| `dexie` | 4.4.6 | Apache-2.0 | 実行時 |
| `fflate` | 0.8.3 | MIT | 実行時 |
| `react` | 19.3.0 | MIT | 実行時 |
| `react-dom` | 19.3.0 | MIT | 実行時 |
| `@axe-core/playwright` | 4.13.0 | MPL-2.0 | 開発・検証 |
| `@playwright/test` | 1.63.0 | Apache-2.0 | 開発・検証 |
| `@types/node` | 26.6.4 | MIT | 開発・検証 |
| `@types/react` | 19.3.0 | MIT | 開発・検証 |
| `@types/react-dom` | 19.3.0 | MIT | 開発・検証 |
| `@vitejs/plugin-react` | 6.1.2 | MIT | 開発・検証 |
| `ajv` | 8.20.0 | MIT | 生成JSON Schemaの実行検証 |
| `fake-indexeddb` | 6.2.5 | Apache-2.0 | 開発・検証 |
| `typescript` | 7.0.2 | Apache-2.0 | 開発・検証 |
| `vite` | 8.3.2 | MIT | 開発・検証 |
| `vitest` | 5.0.3 | MIT | 開発・検証 |

React/TypeScript/Viteは設計案ADR08に従う。DexieはIndexedDBトランザクション、fflateはZIPコンテナー処理に使用する。本文は現段階ではブラウザー標準フォームで編集し、IMEを特別なエディター層で捕捉しない。図の正本はデータモデルに保持し、外部図ライブラリへ移さない。PlaywrightのChromium検証は実端末の検証とは区別する。

`npm audit`（2026-10-05）の初回確認では既知の脆弱性0件。これは将来の安全性の保証ではなく、公開前に対象lockfileで再確認する。
