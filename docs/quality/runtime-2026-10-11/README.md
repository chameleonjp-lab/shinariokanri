# AP04 の既存候補・失敗記録

この案内は AP04 に収録した既存結果だけを示す。前提工程の案内は各工程の README を参照する。

次は元の版別結果であり、この工程ブランチの検査成功ではない。原 bytes と binding を保持する。

| 記録 | 実際の結果 | 範囲と残件 |
| --- | --- | --- |
| [固定b56e8b9 unit](ap04-fixed-b56e8b9-unit/verification-summary.json) | 同じbuildで全体106files/967件中965成功・2失敗、exit1。別attemptのpinned Chromiumによる`tests/exports.test.ts`全21件は成功、exit0。 | system Chromiumの`file://`政策拒否2件を保存。二attemptで元967ケースの通過を確認したが、1回のwhole967成功とは記録しない。新fixture修正後の候補の証明ではない。 |
| [b56e8b9 smoke失敗](../ap04-2026-10-11/smoke-b56e8b9-n16-fixture-failure-1/README.md) | 最初のN16 given exportがinteger型と既定boolean allowed集合の不整合で457msに失敗。元12件中残11件は未実行、実upload/download各0。 | traceと0イベントを照合したaudit completeはgiven成立・download観測の成功を意味しない。元候補・guard・assertion・timeoutを保持。 |

`c758fd68377059f7e2e7389fac80124818710da8` の新buildも、3fixtureの`allowed.min/max:null`がnumber型と不整合なTS2322で失敗した。[実build失敗と元source](../ap04-2026-10-11/build-c758fd6-typescript-fixture-failure-1/README.md)を別保存した。このsourceではbrowserを実行しておらず、残存するb56e8b9のdistを成功へ結び付けない。`allowed:{}`へ修正した後のclean候補 `c2077620ca6b72a1994aec6e29efdd7325cea6ab` / tree `5cf766ed8f66d91bbd5bb55212fd7ec109eebc0d` はbuild `0b38e4b6bb3ffb808f1f`、base `/shinariokanri/`で成功した。通常UI検査と原4節の受入判定はbuild成功から推定しない。
