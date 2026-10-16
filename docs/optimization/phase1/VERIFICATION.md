# 検査と証拠の結合

製品コードを `6e03cd904089c5bce22cce88c58262ffdb1679ef` に固定した。後続は文書・生証拠・固定条件の検査のみ。元テスト・fixture・assert・retry・skip・timeout・形式・公開checkerは変更しない。

| 実行した検査 | 実結果・証拠 | 主張できる範囲 |
| --- | --- | --- |
| 元unit全件＋追加12件 | **123ファイル/1144件成功、実exit0**。[全ログ](evidence/full-unit.log)、[実行command/時刻/終了](evidence/verification-execution.json) | 既存1132件を減らさず、追加を別計上。全116原受入への自動昇格ではない |
| TypeScript/製品build | 実exit0。[buildログ](evidence/full-build.log) | 配布製品の実行可否。実機/配備/公開は別 |
| 新しいnative計測検査×3engine | **Chromium/Firefox/WebKit各1件成功、retry0/skip0**。[原results](evidence/browser-probe-final-results.json)、[実行](evidence/browser-probe-final-execution.json)、[数値添付](evidence/browser-probe/) | fake IndexedDBだけで見えなかったnative completeの順序を実ブラウザーで確認。原228件/engineの代替にはしない |
| 原文書/原計画/CI制御/phase1 bindings | 元104/24/116/6と73原入力、全raw30/330/p95、実素材SHA観測、配信64memberのbytes照合。各実ログを保持 | 原条件保持・証拠整合。新しい受入合格を意味しない |
| PR必須CI | `.github/workflows/ci.yml` の既存full判定、unit・3engine全inventoryとrb03/rb04/rb10後続・verifyを保持。状態の正本は [PR #60 Checks](https://github.com/chameleonjp-lab/shinariokanri/pull/60/checks) | CI run/merge HEAD/tree/buildはローカル測定製品と別identity。各jobの実結果とartifactをPR本文に結合する。古いrun成功を最新headの成功へ転記しない |

ローカルFirefoxの初回は、テスト本文の前に `browserContext.newPage` がクラッシュした。提供workspaceの入れ子sandboxを確認し、**テスト環境だけ** `MOZ_DISABLE_CONTENT_SANDBOX=1` で同じ検査を再実行した。WebKit不足libraryはworkspace用に展開し、実launch/実検査を確認後にhost-library事前検出を迂回した。製品・権限・本番・元テスト条件の変更ではない。初回の実失敗log/traceもpreliminaryに保存し、3成功へ書き換えていない。

`scripts/check_phase1.py` とその6反例検査は既存の `test_check_*.py` 自動検査からも実行される。原入力の同じ長さの破損、104IDの欠落/重複、別caseへの条項pointer、根拠なし合格、30生値の削減、p95改竄、実素材未検証を拒否する。CI定義や原公開checkerを緩める変更はない。

元180保存・実7200秒・113履歴/実72MiBの最終完全復元はHISTの参照に留め、第3段階の統合候補で原条件のまま再実行する。今回の新probe検査/小fixtureのarchive一致を原全量受入に代入しない。実機は依頼対象外、実Auth/サービス/ゲーム/費用と独立レビューは環境待ち。元 `RELEASE BLOCKED` を保持する。
