# AP03 main基準の工程候補

元Largeの113履歴と実72MiBを完全保存するため、検査/JSON処理の同一不変値の重複と全履歴readの不要なWorker転送を減らし、通常112編集から完全ファイル/空new-clone/coldを検査するハーネスをまとめた。これは未公開の工程準備で、**このbranchのbuild/unit/browser/CI、Standard/Large30回、実7200秒、全ACはnot_run**。元600000msの失敗は解消を認定していない。

[実装計画](../../review-2026-10-11/IMPLEMENTATION_PLAN.md)のAP03はAP02を前提とし、G05/G13/G15とAC-G05/G13/G15の正常/例外を対象とする。[機械可読構成](packaging.json)に依存commit、選択source hash、旧失敗の保持と未観測条件を記録した。元104要件/116ケース/464条項/24工程/6回帰群、native1.0.0、runtime1.0.0/profile1.1.0、fixture/数値閾値/archive上限/公開gateは不変。追加X01〜X12は未採用。

## mainからの構成

branch `fix/ap03-large-history-performance-20261011` はmain `8285608c75791ed1ea01380751abb3805913b639`から作成した。確定AP02 tip `0b42e7c5c9e88bff1e7eab459c204603d9de63b5`をこのbranchだけへlocal mergeし、元`3bea751`/`2c98fca`/`9f2bdb1`を順にcherry-pickした。競合はない。main/PR44/AP02/root統合候補は変更せず、前提差分を祖先として保持する。

前提AP02は[Draft PR45](https://github.com/chameleonjp-lab/shinariokanri/pull/45)、headは上記`0b42e7c`。[CI run38130042452](https://github.com/chameleonjp-lab/shinariokanri/actions/runs/38130042452)はrootの2026-10-11 09:57:42 UTC観測で進行中。AP02の元b56三engine27件とPR44 CIの証拠は継承[AP02 README](../ap02-2026-10-11/README.md)を参照し、AP03の新実行と混同しない。

AP03固有差分はprivate immutable async proof、bounded canonical bytes共有、archive/recoveryの所有検証session、全履歴readの一回のprivate Worker job、関連unit sourceと通常実App計測ハーネスである。全commandの全bytes/SHAと全履歴の構造/JSON/固定世界/snapshot hash/整合性の検査は保持する。cacheは呼出し所有、未知/可変/accessor等は既存fallback、作者の編集中入力を凍結しない。保存形式/schema/移行の変更や検査skipの外部申告は追加しない。[実装説明](../../implementation/AP03_LARGE_HISTORY.md)を参照。

`exports.ts`/`WorkPage.tsx`はAP02 tipと同じbytesであり、AP06の受取例/出力宣言やAP04の他の製品/全caseを追加していない。AP02から継承したE12補助と旧証拠はその前提scopeのまま保持する。

## 旧失敗をそのまま保持

[固定3bea751の原記録](../runtime-2026-10-11/ap03-3bea751-run1/README.md)はLinux Chromium、tree `1bf07ebaa47b982fab25a80d9a7f99a373c51025`、clean build `8778f67aa866bb25251b`に属する。通常112編集、88,003記録、実75,497,472 bytes、113履歴/送信待ち、14現在内容/全素材hashと113 native command/pending全bytes hashを観測したが、downloadは元600000msでtimeout/exit1。実完全ファイル、空new/clone/cold、実7200秒は未実行。pointer→取消alertの実2秒とexport firstPaint/heartbeatは未計測。

最初のsandbox起動の`spawnSync git EPERM`はfixture/browser前の環境失敗として別保持する。旧Worker closeは時刻がなくcleanupと区別できず、CPU原因や早期製品拒否を断定しない。新ハーネスでUI進捗/alertのmessage/path、download timeout、Worker UTC/monotonicとcleanup開始を別々に観測する。raw Workerのterminal payload/code/objectcountは現ハーネス未捕捉。

原9ファイルは同じGit blobから保持し、元raw/log/binding/summary/tar/manifestのbytes・hash・対象版・絶対パスを書き換えていない。[移送manifest](historical-relocation.json)に元blobと全SHA/bytesを記録する。397 sourceと13 distの元bytesはtarに含まれるが、旧temporary helper15 filesはmanifestのみでbytes未保持。この欠落を後の別buildで埋めたとは扱わない。旧統合unit/部品成功やAP02 b56の27成功はこのbranchの受入ではない。

## 次の検証と結果保全

1. 最終工程commit/treeを固定し、独立worktreeで依存installとbuildを行う。root統合候補のdist/別commitのbuildを流用しない。関連unitと原browser前提を元timeout/期待/fixtureで実行し、版を記録する。
2. [未割当テンプレート](next-attempt-template.json)のcommit/tree/build/worktree/実行許可は未設定。rootが専有枠を明示した後に新しい空attempt directoryを作る。[保全helper](evidence.mjs)で限定source（src/scripts/tests/examples/supabase/.github/config/packageと元C8 probe）/全distのbefore manifestとtarを保存する。大きな旧歴史証拠全体をsource tarへ混ぜない。
3. `node scripts/measure-large-history.mjs --soak-seconds 0 --output <new-attempt>/raw.json`だけを専有で実行する。元seed、88,003記録・72MiB・112通常App編集→113全履歴/送信待ち、600000ms download、2000ms進捗/heartbeat/pointer取消、全file hash/typed ID/113順序、空new/clone/cold native全照合を保持する。bulk-saveや空fixtureで通常編集を代替しない。診断0は成功時も`completed:false`であり、実7200秒の成功ではない。
4. 実行前に全served helper bytesをoutput隣へ排他保持し、計測終了後に元/保持helper全bytesとSHAを再照合する。成功/非zero失敗どちらもsource/dist after manifest、実exit codeとUTC、全raw/log、実.scenarioがあればそのbytes、取消/測定値/未計測、全file/new/clone/coldの結果を保持してrecursive sealを作る。[手順](commands.txt)のとおりWorker close時刻と`cleanup.started`を比較し、UI quota拒否とdownload timeoutを別結果にする。原因未確定や未測定を合格へ換算しない。
5. 結果を報告して専有枠を返す。次の割当でStandard8,800/Large88,003＋実72MiBの原各30回/全生値/nearest-rank p95を同じ最終対象で実行する。Standardの起動3000ms、操作200ms、検索500ms、保存1000ms、active図/年表33.4ms、Largeの起動10000ms/検索2000msを丸め/epsilon/最良run選択で緩和しない。first actual editable editorを終点とし、カード存在だけの旧probeを代用しない。保存500ms debounceは原測定区間外。
6. 診断が実完全file/new/clone/coldと元応答条件を満たしてから、別の明示割当で`--soak-seconds 7200`を実行する。実monotonic7200秒以上、112通常編集/検索/別補助試読/viewport/22 offline cold、112全現在内容/素材照合、同じ113最終完全復元を直接確認する。短い診断から成功を推定しない。更新/容量不足等の原回帰、G07の取得不能、実端末/支援技術/実APIの未観測条件も残す。

工程固有acceptanceのcandidate/build/CIは未割当。統合root候補の次診断が実行されても、その別sourceの結果をこの工程tipへ付け替えない。同一統合候補の全工程完成/公開は元gateで別判定する。未採用追加案を原要件の削減にしない。

戻す場合はAP03固有commitを戻すかlocal準備branchを破棄できる。正本/参照/履歴/送信待ちの原子性と元完全形式の検査を保持し、既存ファイルの移行は不要。今回build/unit/browser/perf/export/実DB操作、push/PR/merge/publicationは実行していない。ここでのlocal前提mergeとcherry-pickを外部mainのmergeと混同しない。
