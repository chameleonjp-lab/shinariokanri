# 1A：変更前の識別固定とbaseline阻害記録

対象は [1A](requests/1A.md) のNP01とNP05変更前baselineだけ。**準備・部分照合まで。1Aの終了条件、NP05全体、NP06、最終正式受入は未達**。製品変更と性能案の採用は行っていない。現行30/180・heapのrawがないため、対応する改善の採用判断を止める。

## 開始時のGitHub状態

計画 [PR #74](https://github.com/chameleonjp-lab/shinariokanri/pull/74) は `chameleonjp-lab` が2026-10-19T04:45:13Zにmergeした。初回で直前unitのhandoffはない。取得対象refを以下へ固定した。ここに記すtreeはGitHubの実Git treeであり、この作業領域の完全checkoutやsealを証明するものではない。

| 区分 | commit / tree / 意味 |
| --- | --- |
| 開始時main・測定予定source | `a8caf979adc36c09f0ba7fcd3576b0472cff3392` / `a0d391556e4ff71fe752a48147e908d59e526bb3` |
| 現行src tree | `6c0098365af131f13d36c53b499f458a36ae225e` |
| 製品調査基準 | `096364269729c0958026ef6e92401ad1e53032a3` / `b9cc89027bba1ca922f47ee147a9b6f0a16a8cc8` |
| 計画提出時main | `8426bc020e0191c10942398449582b8c7650166d` / `a0695f9edaf8788b47ef1f11b03ad8ce7de62867` |
| 原計画・契約lock基準 | `f40d07afb709b91db1ec439c0a5503682ecab91b` / `101b56f2fe0859d77b413d3e5925d1907bce0717` |
| historical 04a7 | `04a7db7ecee0457e8350c904a533f779b7d2d340` / `2fe4c4ebfbbfa14b6e6c19edb8f67450511fb8aa` / build `e741dd9e78f7585c4522` |
| 旧94/22の製品 | `1fcadcca703863873a57d297e83b1b184e63e778` / `8ac6e33a98455204aa265be5ce86ee5be168a97b` / build `8ec3a03810bb0cf1b1b4` |

[0963→開始main](https://github.com/chameleonjp-lab/shinariokanri/compare/096364269729c0958026ef6e92401ad1e53032a3...a8caf979adc36c09f0ba7fcd3576b0472cff3392) は28ファイル：#73の9追加と#74の19変更。製品src、既存tests/scripts、既存ci.ymlに差分はない。[8426→開始main](https://github.com/chameleonjp-lab/shinariokanri/compare/8426bc020e0191c10942398449582b8c7650166d...a8caf979adc36c09f0ba7fcd3576b0472cff3392) は計画18ファイル追加とルートREADME変更のみ。

[04a7→開始main](https://github.com/chameleonjp-lab/shinariokanri/compare/04a7db7ecee0457e8350c904a533f779b7d2d340...a8caf979adc36c09f0ba7fcd3576b0472cff3392) は製品 `App.tsx` / `draftState.ts` と対応回帰、#70の証拠checker変更を含む。04a7の30/180を現行値へ付け替えない。

- #72は2026-10-19T00:35:29Zにmerge。現行srcはstale draft修正を含む。[main run 39181462652](https://github.com/chameleonjp-lab/shinariokanri/actions/runs/39181462652) / attempt 1 / head `096364269729c0958026ef6e92401ad1e53032a3` は7 jobsすべてsuccessをAPIで再確認した。1392 unit・各engine250件の詳細件数は [既存REVIEW](REVIEW.md) の記録であり、今回ログ・ZIP全memberを再検証した値ではない。
- #70はmerge commit `8ca4eac2e8ad396a33792043a9737564e0ea574b`。原fixture期待値を固定Git blobで確認する修正を含む。
- #73はmerge commit `8426bc020e0191c10942398449582b8c7650166d`。[現行AGENTS](../../../AGENTS.md) と [任意RTKガイド](../../quality/rtk-safe-execution/README.md) を確認。RTKは未使用・未導入。元の正式出力を短縮しない。
- open PRは初回読み取り時点でDraft #71のみ。PR作成再開時（2026-10-19T06:08:54Z）はopen PRなし、mainは開始時と同じ。別作業のPRを依存に追加しない。開始mainのCIと本変更のCIは [検証記録](baselines/1A/VERIFICATION.md) で分ける。

## 原受入・比較入力の固定

[原全体計画](../codex-three-phase-2026-10-17/PLAN_ALL_STAGES.md)、[原第3段階](../codex-three-phase-2026-10-17/PHASE_3_ACCEPTANCE.md)、[73入力のlock](../../optimization/phase1/contract-lock.json) は変更していない。[入力台帳](baselines/1A/INPUTS.md) に各pathの元bytes/Git blobと、今回取得できた実bytesのSHA-256、正確なID集合を記録した。72/73入力は実bytes・元Git blob一致。1件はGitHub Contentsが1MiB超binaryの本文を返さず、binary blob取得も拒否されたため、元識別子だけを保持し実bytes照合を未了とした。

116ケースのID集合と、given / when / then / negative_or_edgeの464原文について、固定 `acceptance_cases.json` と `CLAUSE_REVIEW.json` の原文欄の完全一致を確認した。104要件・24工程・6回帰群・68補助のID集合も保存する。この静的照合から現在版の116/464合格は作らない。68はG32＋未採用X36で、116に加算しない。

| fixture | 原seed / records / SHA-256 / 実素材条件 |
| --- | --- |
| Standard | `standard-r06-v1` / 8800 / `de0b9420abec95bcc37fc7fb7c3dc4c2667082258678f750af33bb53f8a557f5` / 0 bytes |
| Large | `large-material-rb10-v1` / 88003 / `814daf96a6511cf47409f3497b03c7ba0309af250bfd87306c44a1dec5d5a917` / 75497472 bytes、3×25165824 bytes |

上のfixture hashは固定phase1 rawの期待値。今回、現行製品内でfixtureをseedして得た観測値ではない。3素材は原生成式から全bytesを別途再生成し、3原hashとの一致まで確認した。DBへの保存、配信、復元、heapの証拠へは昇格しない。素材hashと実bytesは入力台帳にある。

## 現行baselineの有効範囲

| 項目 | 今回の状態 / 不足 |
| --- | --- |
| source / tree | 上記開始mainに固定。GitHubから必要なblobを取得し全実bytesのGit blobを照合。完全checkout・clean HEADは未確保 |
| build / 配信bytes / seal | UNKNOWN。現行 `npm run build` 未実行。build ID、dist asset集合・bytes/SHA、candidate.json / candidate.zipは未作成 |
| 原Standard/Large各8指標×30 | UNKNOWN。現在版と結合した同条件rawを取得できず、今回も未実行 |
| 元6条件×30＝180保存 | UNKNOWN。3保存形式×2 fixture、元command p95≤1000msを保持。今回未実行 |
| 資源各size3標本 | UNKNOWN。既存measure_resources.mjsを未実行。強制2 GC後main-renderer V8 heapのみという定義を保持 |
| DB仕事量・論理保持 | 現行版の新規観測なし。歴史上の診断ON値を正式OFFの時間列へ転記しない |
| peak / RSS / Worker / native memory | 未測定。GC後heapやcache上限から推定しない |
| 7200 / full113 / 最終受入 | 今回実行対象外。04a7の実終了未取得も維持。NP05最終比較・NP06・NP16は3B同一最終候補へ残す |

phase1の既存candidate-Standard/Large30は `6e03cd904089c5bce22cce88c58262ffdb1679ef` / tree `175357edb8d5783679fc9d90647527d84612c642` / build `658e90b133fea74dd9bf`。fixture期待の原本であり、現在速度の基準には使わない。旧historical-original180.json.gzも1fcの原判定器入力であり現在180保存のrawではない。

原p95はnearest rank、未丸め値。Standardは起動3000、選択/一覧/次期間200、検索500、保存1000、年表/図33.4ms。Largeは起動10000と検索2000msのみ原上限があり、他6指標の観測と未採用目標案を分離する。frameは元30 gestureの各330 frame定義を維持する。

ホスト診断はLinux `6.18.55`、Node `v24.19.0`、Python `3.12.14`、AMD EPYC 9V74、論理CPU5、総memory `18882674688` bytes。Viteは解決不能。環境側のPlaywrightは見えるが、候補のlockに従った依存・実browser version・測定条件は未確保で、比較可能な測定hostとして承認しない。

## 不足台帳と再開条件

| ID | 今回確認できた所在 / 状態 | 次の担当と一操作 |
| --- | --- | --- |
| B01 current baseline | 完全clone不可：既存proxy接続失敗。追加network要求は自動承認審査のcapacityエラーで未実行。npm pingもexit1 / EPERM。build・30/180・heapなし | 1A担当：許可済み通常実行環境で完全checkoutとlock依存を用意する。Cloud environmentsの新規使用・作成・変更を追加しない |
| B02 04a7作業領域・終了ログ・未commit補助判定器 | [RESUME](../../acceptance/phase3/RESUME_20261018.md) / #69本文は取得。現在のworkspace/tmpとphase3 tracked一覧に実run・exit原本なし。旧環境への接続能力はない。72編集/4564.287504485秒までの記述を7200合格にしない | 旧環境を保持する担当：元作業領域と実終了receiptを提供。未commit11反例の作業物を取得し、commit済み修正と内容比較する |
| B03 旧C29 | 原auditのarchive `1858947725` bytes、SHA `360324fda32771ed6979e354e9292c91ab4bc39cdbacc747d2e3ce0606b4cfe0`。37part＋原MANIFESTは今回未回収 | 原保存者：原37partとMANIFESTの取得可能な保存先を提供。各partの期待値・元保存候補はINPUTSの旧原本節を参照 |
| B04 旧18宣言 | 32宣言中14宣言/10 unique hashの保存済み実bytesを今回再取得し、各expected bytes/SHAへ照合。18宣言は不足のまま。旧宣言pathへの復帰や旧実行成功は認定しない | 原保存者・1A担当：INPUTSに列挙した18宣言の実bytesを元保存先から取得 |
| B05 original N05 Large binary | 元bytes `1914098`、Git blob `566cd06cc4602d31aff08b0bdd5830c29888c039`、元metadata SHA `1ca2b19dcf4c8464c68a24a1bbe02cd1b1c4be20187ed2cee99d4e541822d0d0`。APIから本文未取得 | 1A担当：完全clone後に元Git blob・bytes・SHAを実ファイルで照合 |
| B06 外部受入 | [22原外部条件](../../acceptance/phase3/EXTERNAL.md)、実2アカウント、CP15独立確認、原9release gate、未採用X01〜12を維持。実機・実サービス試験は実施していない | 1B/3Cと原担当へ所在を渡す。専用許可環境と実依頼なしに実行しない |
| B07 Draft PR | 初回のcapacityエラー後、同じ承認付き経路で [Draft PR #75](https://github.com/chameleonjp-lab/shinariokanri/pull/75) を作成。未merge。最終headとCIの実結果はPR本文で確定する | ユーザー：文書差分をレビュー。1A担当：同じ1Aの未実測・未回収を継続。全体STATUSは更新しない |

不足する04a7引継ぎを全履歴から再構成しない。既存歴史束は [bundle-location](../../quality/pr49-followup-2026-10-15/evidence/bundle-location.json) のimmutable commit `d5e132ef6f4db6a0f3fbe888228ffd1007d653f9` で識別する。原回収runnerはpart/member実bytesを検査するが、今回その束全体は実行・再検証していない。

## 実測の再開手順

以下は**未実行の手順**。完全checkout・依存・実Chromiumを用意し、開始時main以降に製品変更があれば再度sourceと比較対象を確認する。1A全体基準と各改善直前の親candidateを別bindingへ保存する。重い測定は同じhostで直列にし、並列build・別候補実装を重ねない。

```sh
npm ci
npx playwright install chromium firefox webkit
export CHROMIUM_PATH="$(node -p 'require("playwright").chromium.executablePath()')"
npm run build
python3 scripts/acceptance/seal_candidate.py --output /tmp/1a-baseline-new-candidate.json
python3 scripts/acceptance/seal_candidate.py --verify /tmp/1a-baseline-new-candidate.json
python3 scripts/acceptance/run_formal.py --output /tmp/1a-baseline-new-formal --only performance-standard
python3 scripts/acceptance/run_formal.py --output /tmp/1a-baseline-new-formal --only performance-large
python3 scripts/acceptance/run_formal.py --output /tmp/1a-baseline-new-formal --only saves180
node scripts/acceptance/measure_resources.mjs --repository "$PWD" --tools-root "$PWD" --output /tmp/1a-baseline-new-resources
python3 scripts/acceptance/seal_candidate.py --verify /tmp/1a-baseline-new-candidate.json
```

パスは未使用であることを確認し、既存の失敗試行を上書きしない。3つの--only実行は原30/180のbaseline限定であり、sequence全体の正式完了にはならない。raw/driver/helper/argv/receipt/実終了/cleanup/sealを保持し、固定原fixtureとの独立照合、資源rawの6標本完走、host/browser一致を確認してからbaseline到達点を更新する。ここでもNP05全体を完了にしない。

変更範囲はこのMarkdown、INPUTS、VERIFICATIONと [handoff](handoffs/1A.md) のみ。既存の保守的CI scope内の文書pathを使うため計画フォルダーへ配置し、JSON・runner・workflowを変更していない。戻す場合はこの4文書の追加をrevertする。DB・保存形式・製品への影響はない。
