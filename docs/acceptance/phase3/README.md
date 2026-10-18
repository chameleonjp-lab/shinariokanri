# 第3段階の非実機受入と引渡し

PR #59と第2段階の採用済み実装を最新mainへ照合し、原条件の正式計測、制作導線、完全復元、障害試験、全CIの証拠を結合する作業記録です。現在は正式第1試行の失敗原因を修正し、次のclean候補で再実行する段階です。完了前の値を最終合格へ転記しません。

- [監査・設計比較](AUDIT_AND_DESIGN.md)、[実施計画](PLAN.md)、[実行判断・失敗記録](LEDGER.md)
- [22件の実環境待ちと次の一操作](EXTERNAL.md)、[未採用X01–X12の判断資料](X_DECISIONS.md)
- [統合計画](../../implementation/codex-three-phase-2026-10-17/PLAN_ALL_STAGES.md)、[第3段階依頼](../../implementation/codex-three-phase-2026-10-17/PHASE_3_ACCEPTANCE.md)

製品`src`・原fixture・元受入・元CI・release checkerは変更していません。追加の計測同期ヘルパーは非同期作品検証の完了後に通常メニューを開きます。元の112活動・7200秒・113履歴/送信待ち・実72MiB・600000ms/2000msと全assertは維持します。実機、実サービスの変更、マージ、配備、公開は行いません。

## 再実行

Node24、Python3、npm依存とPlaywrightの実3engine・必要なhost libraryを用意します。Chromiumの実行pathを`CHROMIUM_PATH`へ指定し、候補をcommitしてから`npm run build`します。`dist/build-info.json`のcommit/tree/dirtyが一致しなければsealは拒否します。

```sh
python3 scripts/acceptance/run_formal.py --output /tmp/phase3-formal-new-attempt
```

Standard/Large原各8指標×30、6条件×30保存、実7200秒＋full113/new/clone/cold、同じ完全ファイルの破損/unknown major/最終error/quota/通常再試行を直列実行します。実コマンドと子終了を保存し、各段階の前後に封印を再検査します。途中でsource、HEAD、配布物を変更しません。過去の出力を上書きせず、失敗した試行は別に保持します。

補足原回帰は、immutable証拠branchから原bytesを回収し、同じclean候補で実行します。元RG01の8 checkpointとRG02/03の各6条件を再利用し、N05の原テストにはJSON reporterを追加して成功時添付も残します。

```sh
git fetch origin evidence/pr49-followup-20261015-1fcadcca
python3 scripts/acceptance/recover_historical.py additional-original-regressions-1fcadcca --output /tmp/phase3-historical
python3 scripts/acceptance/recover_historical.py unaffected-local-3ab6 --output /tmp/phase3-historical
python3 scripts/acceptance/run_supplements.py --repository . --binding /tmp/phase3-formal-new-attempt/candidate.json --historical /tmp/phase3-historical --output /tmp/phase3-original-supplements
```

`measure_resources.mjs`は別の補助計測です。clean checkoutごとに`--repository`、依存のあるcheckoutを`--tools-root`、未使用の`--output`ディレクトリを指定します。候補側は`--compare BASELINE/raw.json`でfixture/実素材/browser一致を必須にします。各サイズ3標本の強制GC後main-renderer heapであり、peak/RSS/worker/nativeメモリや正式latencyの合格ではありません。同一資源で正式試験と並行しません。

`index_report.py`は実reportの全test/retry/添付bytes、実出力のmember/hash、拒否入力と拒否観測を読みます。件数だけから116ケースの合格を作るものではありません。`pack_evidence.py`は全実ファイルをCRC・member集合・bytes/SHAとともに保持します。最終形式の正式束は`python3 scripts/check_phase3.py --evidence DIR`で独立に照合できます。

## 判定の境界

原116/464と104要件、24工程、6回帰群、68補助確認を維持します。局所工程gateと依存を含む工程全体、6表の作者fingerprintと全21表の障害照合、ブラウザー模擬と実機/実Authを区別します。旧N06のnative70観測は現在のnative80の証拠にしません。原release checkerのBLOCKEDはそのまま残します。

戻す場合は本PRの追加検査・計測・文書をrevertします。製品DBのmigrationや本番環境の変更はありません。
