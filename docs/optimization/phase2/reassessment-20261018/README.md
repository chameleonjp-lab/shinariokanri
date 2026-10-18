# 第2段階・最新main再監査と独立した計測/検査

PR #59のマージ、登録された統合計画/第2段階依頼、既存の監査・実装・CI結果を照合した提出物。基点mainは `b32de9525c4acf5206ac3d6d1d23f5b90967ec95` / tree `83ae5006ead9c7e2a83316b95a0e643a2338167b`。製品src treeは `73263a85e2ef2ead9799f91125ba54fb643182b4` で不変。

**第2段階の製品最適化全体は未完了。** #63〜65のマージ先は機能ブランチでありmainではない。登録依頼の前提に従い、独立して進められる監査・現行＋2案の研究用実装・同条件計測・自動検査を完了する範囲とした。後続のP2-06/07製品採用と、新たに確認した検索の意味差分の製品修正は別のレビュー範囲へ引き継ぐ。

## 成果物

- [現行経路/AUD-001〜023/外部22条件](AUDIT.md)、[設計比較・採用/保留・後続の修正範囲](DESIGN.md)、[測定定義/全結果/失敗/制限](MEASUREMENT.md)。
- [main到達・PRマージ先・保護flagのAPI観測](integration.json)、[原104要件/原条項/pathの対応](traceability.json)、[過去6PRの各7ジョブの状態](historical-ci.json)。
- [検証結果と実行環境](VERIFICATION.md)、[実ファイルのbytes/SHA256一覧](evidence-manifest.json)、evidence内のStandard/Large全raw・独立定義一覧・失敗/補助ログ・保持したbuild。
- 研究コードはscripts/optimizationのcatalogStudy/fixtureIdentity/semanticStudy、2計測CLI。既存probeは明示ON時だけ使用。製品からのimport経路、保存契約、DB、形式、原fixture、原CIは変更しない。
- scripts/check_phase2_reassessment.pyは全30生値/p95・実行順/同一source/環境/直列実行・入力/素材SHA・原73入力blob・source commit/tree/blobのGitオブジェクト証明・終了後の論理保持・原104条項対応を検査する。測定時の321ファイルをevidence/measured-source-d963f3d.zipへ保存し、浅いcheckoutでも過去のGitオブジェクトなしで照合できる。
- 通常のCIは保存済みのsourceと証拠を検査し、将来の正当な製品変更を過去計測との不一致で拒否しない。`--verify-current-source` は提出時の追加検査であり、現在のcheckoutとの一致も要求する。過去の計測を将来のsourceの成績として流用しない。

## 再実行

```sh
python3 scripts/check_phase2_reassessment.py
python3 scripts/check_phase2_reassessment.py --verify-current-source
python3 -m unittest discover -s scripts -p 'test_check_phase2_reassessment.py' -v
npm test -- --maxWorkers=1 --fileParallelism=false
npm run build
```

追加計測はclean checkout、Node 24、元依存のnpm ci後、別の新規ディレクトリへ実行する。同じ資源では重い検査/計測を直列にする。

```sh
node scripts/optimization/measure-catalog-study.mjs --suite standard --output /tmp/catalog-study-standard-new
node scripts/optimization/measure-catalog-study.mjs --suite large --output /tmp/catalog-study-large-new
node scripts/optimization/audit-semantics.mjs /tmp/catalog-study-semantics-new.json
```

既存の出力先は拒否する。測定したsourceと入力、全失敗/不利値を保存し、過去の値を現在のsourceへ付け替えない。本Nodeの30回は原ブラウザー30回や180保存/7200秒の再受入ではない。DB/Worker/UI待ち/heapの効果は本実験ではUNKNOWN。

## 保持条件・戻し方

原104要件・116ケース/464条項・24工程/6群・68補助確認・73固定入力、元fixture/seed/素材bytes、30/180/7200秒/600000ms/2000msと全形式/履歴/固定版/秘密/原子復元を維持する。元94ローカル/22外部条件の時点記録と **RELEASE BLOCKED** を保持し、新しい補助検査を元受入へ加算しない。

実機・実Auth/サービス・本番/別用途DB・認証/課金/支払設定・merge・配備・公開・Cloud環境の作成/設定変更・X01〜12の実装は行わない。戻す場合は本PRの追加ファイルをrevert。DB/製品/形式の変更と移行はない。
