# AP02 main基準の工程候補

通常本文の候補除外、相談の前後状態、旧保存領域の再試行を同じ工程候補で確認するため、main基準の独立branchを構成した。これは未公開のDraft準備で、**工程branchのbuild/unit/browser/CIと全ACはnot_run**。既存統合候補の27件成功をこのbranchへ転記しない。

[実装計画](../../review-2026-10-11/IMPLEMENTATION_PLAN.md)のAP02はAP01を前提とし、G02/G03/G04、AC-G02/03/04のN/Eと原AT-F27/F36/E12を対象とする。[機械可読構成](packaging.json)にcommit依存、選択ファイルhash、未観測条件を記録する。元104/116/464/24/6、native1.0.0、runtime1.0.0/profile1.1.0、原fixture/数値上限/timeout/公開gateは不変。追加候補X01〜X12は未採用。

## mainからの構成

branch `fix/ap02-author-roundtrips-20261011` はmain `8285608c75791ed1ea01380751abb3805913b639`から作成した。PR44head `4e39cc1a086296226643e6105ffbfc47d467c50f`をこのbranchだけへlocal mergeし、`4efa9ce`と`8b50128`を順にcherry-pickした。競合はない。main/PR44は変更せず、AP01未mergeの前提差分を祖先として保持する。

AP02固有製品差分は`TextAnnotations.tsx`、scoped candidate preferenceとunit、原3specである。これらのbytesは統合b56e8b9と一致するが、domain/storage/portable/scripts/packageはPR44headのままで、AP03/AP06/AP04の製品修復は含めない。既存完全保存性能や全体結果までb56と同じとは扱わない。

追加選択は[E12通常入口](../../../tests/e2e/ap04-original-e12-continuity.spec.ts)、[共通helper](../../../tests/e2e/ap04-original-helpers.ts)、[E12補助計画](../ap04-2026-10-11/ap04-original-e12-plan.md)と[原4節proof](../ap04-2026-10-11/ap04-original-e12-proof.json)だけ。AP04の全計画/全製品/他case群を取り込まない。E12のsource行/hashは実worktreeで一致し、全条項not_runを保つ。

## 元版の保持結果

| 元版 | 実結果 | 保存先 |
| --- | --- | --- |
| 3bea751 / build8778f67aa866bb25251b | AP02原3spec計27中21成功/6失敗。元clone oracleの失敗を保持 | [run1 summary](../runtime-2026-10-11/ap02-run1/summary.json)、[保持manifest](../runtime-2026-10-11/ap02-run1-retention.json) |
| b56e8b9 / tree46927ebcc8c8b016f5a23845d19745ccb05c0049 / build1dc95b9eb4d844a28134 | 同じ原3spec、3engine各9・計27成功。1worker、retry/skip/flakyなし。source/dist前後不変 | [run2 summary](../runtime-2026-10-11/ap02-b56e8b9-run2/summary.json)、[元/移送bytes/hash](../runtime-2026-10-11/ap02-b56e8b9-run2/relocation-manifest.json) |
| PR44 CI106 | 前提workflow21step成功、unit890/E2E342成功 | [実run38123646997](https://github.com/chameleonjp-lab/shinariokanri/actions/runs/38123646997)。head4e39、実merge-ref checkout6212d8d、hostedbuild69f29385ad35e068039aは別の識別値。hosted tree/dirty未観測。raw packetはroot保持先をpackaging.jsonへ記録し、AP02独自binaryへ再生成しない。 |

run2の保持READMEが参照する旧build binding JSON 1件（2,348,147 bytes）も同じGit blobから保持する。whole unit packetは選択しておらず、この参照は旧b56 buildだけに属する。原run1のraw renderer/logにある末尾空白はbyte保持のため変更しない。

原bytesをGitの同じblobから選択して保持し、元manifest/log/bindingの対象版や絶対パスを変更しない。捕捉run scriptは保持対象であり自動実行しない。既存成功はhistorical supportで、new branch acceptanceではない。新branchの最終commit/tree/build/base/source/distは別に固定する。

## 必要な次の検証

1. 元3specを含むsourceを最終commitへ固定し、独立worktreeで依存installと生成buildを実行する。生成portable内容は実source依存が変わっていないことを照合する。旧b56/PR44distやrootnode_modulesを流用しない。
2. 原timeout/fixture/期待値を守り、1worker・retryなしでunitとChromium/Firefox/WebKitの原3specを実行する。通常保存/cold/実download/空new/cloneのID・hash・元命令・clone監査・outbox/revisionを保持する。先に正常を仮定しない。
3. AT-F27の引用資料fixtureと実アカウントscope、AT-F36の対象page以外の送信観測を追加観測する。b56でproposal出所/対象版/別案比較まで観測した範囲は残す。
4. E12補助をService Workerが利用できるbrowserで実行し、cached controller・通常保存による非空outbox・offline cold・容量拒否/再試行・waiting lifecycle・コピー旧DB移行拒否・完全new/cloneを観測する。物理機内モード、実旧app upgrade、実容量枯渇、未取得素材controlとOS保存先取消は別条件。原E12全体の合格はまだ付けない。
5. AP01の[G07 blockedと復帰](../ap01-2026-10-11/HANDOVER.md)を残す。C29元37partと元MANIFESTの未取得を別packetで代用しない。工程前提と公開gateは保留。

入力/旧DBは隔離コピーを使用し、元データ/完全保存とraw failure/successを保持する。戻す場合はAP02固有commitを戻すかlocal Draft branchを破棄できる。main/PR44のmerge、push/公開、DB操作、課金はこの準備で行っていない。
