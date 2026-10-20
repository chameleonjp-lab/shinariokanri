# 3A / NP15：CI準備の比較設計（準備のみ）

2026-10-20 UTC。対象は[依頼3A](../../requests/3A.md)だけ。[2C引継ぎ](../../handoffs/2C.md)の必要成果が不足するため、**実装・cold/warm実比較は未実行、NP15未完了、3Bへは進まない**。#81の準備mergeを段階2完了へ昇格しない。実merge・CI・読取版は[検証記録](VERIFICATION.md)。

## 目的・範囲

元検査と証拠の対応を保つ準備方式だけを比較する。React/TypeScript/Dexie、Vitest、Playwright 3 engines、Python、GitHub Actionsの既存構成を使い、今回は比較設計・阻害・自handoffの3 Markdownを追加する。workflow/helper/製品/依存/fixture/STATUSは編集しない。

再開後もCI担当は準備だけを所有する。比較中は製品sourceを並行変更せず、独立担当はscope/証拠契約の読取レビューに限定する。新しいcache実装や計測runnerをこの準備文書の存在だけで使用可能と扱わない。

## 現行Cの契約

正本は開始main `4f3110963794eb142340282b2267a266feac585f` の[ci.yml](../../../../../.github/workflows/ci.yml)。7jobはscope、documents、unit、browser×3、verify。browser内は1 worker、retries=0、fail-fast=falseである。次の定義・順序・元assert/fixture/timeoutを保持する。

| 区間 | 保持する実行と証拠 |
| --- | --- |
| scope/documents | `ci_controls.py scope`と既存文書4コマンド。純Markdownの既存allowlistだけ。push/不明diff/製品/JSON/fixture/runner/workflowは全検査 |
| unit | Node24、`actions/setup-node@v4`の`cache: npm`、`npm ci`、`npx playwright install --with-deps chromium firefox webkit`、既存CHROMIUM_PATH設定、`npm test -- --maxWorkers=1 --fileParallelism=false`、`npm run build` |
| 各browser | 同じnpm準備、当該engineの`install --with-deps`、既存Chromium path設定、各runnerでbuild→source記録→全inventory取得→全e2e→復元4原本検証→後続rb→always添付回収 |
| 後続rb | rb10は既存Chromiumのみ。rb03/rb04-authorは各engine、rb04-writingは既存Chromium/WebKit。元の条件を維持し、別engineの成功で代替しない |
| verify | 全必須job成功、3engine全inventory/結果、原本/失敗添付、run/checkout commit/tree/engine/attemptを照合。engine別artifactと集約ZIPを従来通り残す |

`pretest`/`prebuild`のportable runtime生成も残す。単なるdist流用でsource component用runtime生成を消さない。

## 比較するC＋2案と採否

npm download cacheは**既存機能**。A/Bの新規効果として二重計上しない。`node_modules`、build、結果原本、DB、native、reportは準備cacheへ入れない。全案で`npm ci`と元の`install --with-deps`を実行し、browserのOS依存は毎runnerで準備する。

| 案 | 依存・browser準備の差 | 速度/仕事量/保持量の比較点 | 現在の判断・理由 |
| --- | --- | --- | --- |
| C 現行 | npm download cache＋browser毎回install。buildは各job | 元の基準。実cache hitをログから区別 | 維持。新候補での成功対照は未取得 |
| A engine別browser cache | npmはC。同じPlaywrightが管理する実ファイルをengineごとに分離し、unitは3組、browserは当該1組を復元 | 小さな転送/展開と、3key取得/封印検査/保存の追加費用 | 保留。未実装・未実測、完全性検査の実証なし |
| B 3engine一括browser cache | npmはC。unit/browser全runnerで同じ3engine一括包を復元 | key操作減と、不要engine転送/展開・容量増の差 | 保留。未実装・未実測。Aより速いとは仮定しない |

npm因子はdownload cache空/検証済warm、browser因子は空/検証済warmを独立に振る。Cにはbrowser warmがない。A/Bでは「npmのみwarm」「browserのみwarm」「両方warm」「両方cold」を分ける。空cacheは実験専用namespace/復元無効で作り、他用途cacheを削除しない。

cache keyには方式schema、runner OS/image実version/arch、実Node/npm版、lockfile SHA-256、Playwright package版とbrowser revision、engine集合を含める。異なるlock/image/revision/engineへのprefix fallbackは使わない。これはA/B用の条件であり、既存setup-nodeの内部keyを既に改修したという意味ではない。

cache包と一緒に置いた自己申告manifestだけでは完全性を証明しない。信頼したcold installの全path/実bytes/SHA-256・生成元run/attempt/keyをcacheの外へ封印し、それと照合する。信頼できる独立sealがなければcacheを消費せずmissとして元installへ戻す。symlink/実行権限等も元installと一致させる。破損包の一部を残したまま起動しない。

## 経過時間・runner総時間・正確性を分ける

- 準備の局所時間：setup-node/cache取得/展開/完全性検査、npm ci、browser install（OS依存とdownloadを区別）、cache保存/cleanup。失敗・fallback費用も含める。
- 全CI経過時間：`run_started_at`から全job終了まで。queue/依存待ちを別列にし、job時間の合計を経過時間にしない。
- runner総使用時間：全jobの`completed_at-started_at`の和。retryはattempt別に実行したjobだけ集計し、latest一覧の既存成功jobを再実行と数えない。課金分単位へ丸めた時間とは区別する。
- 仕事量・保持量：download/restore/saveの実bytes、展開bytes/file数、追加job数、CPU/IOの観測可能な範囲、cache容量。テストやbuild時間を準備短縮へ付け替えない。
- 正確性：同じ全unit/全inventoryとID集合/負例/後続rb/復元原本/ZIP全member/最終verify。job名のsuccessや件数だけの一致では採用しない。

同じsource/test/fixture/seed/driver/argv、lock/実runtime/browser、runner image/CPU/RAMを固定する。PR headと実merge checkout/treeを別記録し、変更を準備方式の差分に限定して各tree/workflow SHAを封印する。host条件が変わった標本は別群にし、Cloudで代行しない。

準備測定は各条件3独立標本を事前固定し、C→A→B、A→B→C、B→C→Aの順に釣り合わせる。coldの生成費用・warm producerの費用を含め、想定hit率が不明なら損益分岐だけ示す。採用判断前にはC/A/Bそれぞれcold/warmに対応する**元全CI**を実行し、準備だけの標本を全CI実測と呼ばない。CI順序は現行のengine並列のまま、正式性能/資源測定とは重ねない。

採用には不変条件・負例の全成功と、転送/検査/保存/失敗時費用を含む純効果の実測が必要。経過時間とrunner総時間の一方だけが改善する場合は両方を示し、費用増を隠して採用しない。効果が不明/悪化ならCを維持する。削減率の保証、未実施を「比較済・不採用」として閉じることはしない。

## 先に固定する独立負例

以下は設計であり、今回RED/GREENを実行した結果ではない。実装時は該当負例の失敗を先に確認し、必要な最小変更で再確認する。

| 入力・反例 | 期待する拒否/復帰 | 既存保証と追加実証 |
| --- | --- | --- |
| cache欠損、lock/revision/image違い | miss→元のnpm ci/browser install→全検査。復帰不能なら失敗 | A/Bでcold復帰を新規確認 |
| npm tarball破損、browserの1byte改変/欠落、cache内manifestも再hash | 不正cacheを消費せず隔離し、独立seal照合からclean installへ。失敗は原ログに残す | key一致や起動smokeだけで合格にしない。新規反例 |
| partial artifact、source/inventory/results欠落、同件数の別ID、別engine/commit/run、1engineの別tree | verify失敗。元原本の欠落/重複/改変も拒否 | ci_controls既存反例＋recovery helper。包全member/CRC/SHAは別途実監査 |
| 3engine全部を同じ偽treeへ差替 | 実checkoutのGit treeとの不一致で候補包を拒否 | 現行verifyのtree条件はengine間一致。共有buildを正当化する独立expected tree/bytes検証は未実装 |
| 旧run/別候補のretry包、attempt名だけ付替、最新不合格を旧成功で隠す | run/commit/engine/実attempt不一致を拒否、失敗原本を保持 | 現行のengineごと最新available attempt≤実行attemptを維持。正当な同run再実行は下記の通り |
| build/shared包の部分欠落、別tree/dist/runtime、使用bytes不明、shard重複/欠落 | 採用不可 | 下記追加案の入口条件。既存recordにbuild sealはない |

`test_retry_uses_latest_engine_attempt_and_retains_earlier_evidence`は同run/commitでattempt2がwebkitだけなら[1,1,2]を認める。A/Bでこれを勝手に禁止/改名しない。一方、NP15のcold/warm時間比較にretry成功だけを抜き出さず、初回失敗・再実行・待ち・追加使用時間を別記録する。

## build共有・shardは別案

現行`record_browser`のsourceにはengine/commit/tree/pr_head/run_id/attemptだけがあり、build ID・dist/配信SHA・各engineが使用した実bytesはない。したがって、**そのsource記録だけを根拠にしたbuild共有/既存verifyへのshard結果の混載は不採用**。速度を測って棄却したという意味ではない。証明を追加した別案は未実装・比較保留とする。

再検討には生成元checkout/tree/lock/argv、portable runtimeを含むbuild全path/bytes/SHA、配布包と配信後の各engine使用bytes、全inventoryの重複なし和集合、run/engine/attempt/失敗添付を結ぶ独立検査が要る。別tree/partial/retry混入を拒否できなければ比較対象へ入れない。browser cache案に混ぜず、まずC/A/Bを閉じる。

## 再開順・正式検証・戻し方

- [ ] [1D引継ぎ末尾](../../handoffs/1D.md)の1A再開文で、許可済み通常環境の現行基準とclean build/配信bytes/sealを固定する。その後2A→2B→2C必要成果と採否・元CI・ユーザーmergeを確認する。今回それらを代行しない。
- [ ] 更新mainで元7job/3engine成功対照を取得。C/A/B入力・独立seal・負例と所有pathを固定し、局所反例→準備比較→元全CI/全artifact監査→採否を行う。
- [ ] 採用差分をDraft PRへ提出し、ユーザーmerge後のclean mainで3B候補を固定する。改善がなくても実比較が完了するまでは3Bへ渡さない。

[GUARDRAILS G01〜06](../../GUARDRAILS.md)の104/116/464/24/6/68、原fixture/seed/実bytes、Standard/Large各8指標×30・6条件×30=180保存（command p95≤1000ms）、nearest rank/未丸め値、実7200秒/112編集/88003記録/113履歴・送信待ち/75497472素材bytes、完全出力600000ms・進捗/取消2000ms、同全量復元/異常系、各size3標本heapを維持する。Largeの追加目標や未採用Xを原条件へ混ぜない。3B/3Cの正式受入・再取得、外部22＋別3条件と元9 release gate/BLOCKEDは残る。

[AGENTS](../../../../../AGENTS.md)と[RTKガイド](../../../../quality/rtk-safe-execution/README.md)を維持。RTKは今回未使用、存在確認/導入なし。正式CI・原本照合・3engine・性能・7200/full113は短縮対象にせず、削減率を数値保証しない。

今回は追加3 Markdownだけをrevertできる。将来採用する場合も準備方式だけをCへ戻し、原検査・添付・verifyを保持する。DB downgrade/データ削除は不要。merge・公開はユーザーのみ。
