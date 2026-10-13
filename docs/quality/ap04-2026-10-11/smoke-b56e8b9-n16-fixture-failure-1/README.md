# b56e8b9 AP04 first smoke: N16 fixture export failure

2026-10-11。候補 `b56e8b953ee5398a8c4b97031b4a426bb6a9f512` / build `1dc95b9eb4d844a28134` の 12 tests / 10 files smoke を一度実行し、最初の AT-N16 が 457ms で失敗した。

失敗箇所は `tests/e2e/ap04-original-n-condition-parity.spec.ts:39` の given `exportScenario(p)`。`project.entities[0].data.allowed.values: 整数には集合ではなくmin/maxを指定してください。` と共通検証器が拒否した。boolean の既定 `allowed.values: [false,true]` に対し、fixture が `valueType: integer` だけを上書きしていた。UI assertion と元の 30s timeout には到達していない。

`retained-run/` は `/tmp/ap04-b56e8b9-smoke-preparation` の全ファイルを bytes のままコピーした。hook / auditor / preparation / 実行 command / runner log / JSON / HTML / trace / before-after binding / assessment / summary を保持する。絶対パスは元記録のままで、内容を再ラベルしていない。`source-under-test/` に失敗した実 source と既定値を保持し、`retention.json` に全コピー SHA/bytes を記録した。

検査は最初の失敗で停止し、再試行せず、残り 11 tests は未実行。global と attempt の commit/tree/build/source/module/env before-after は一致し、終了後の runtime checkout は clean、4173 は free、browser/preview/Playwright process は残っていない。

実 archive bytes が生成される前に失敗したため、actual upload / download は各 0。artifact audit の complete は trace と一致する実 API イベント 0 件の照合であり、download capture の実証や原 given の成立を意味しない。入力 UUID は再生成していない。原受入は全て `not_run` のまま、原 F33 実端末、E07 の他 10 境界、外部条件へ合格を付けない。

この失敗を保存してから、別候補で fixture 型宣言の整合を修正する。元候補、guard、original when/then/negative_or_edge、数値上限、timeout を緩和しない。
