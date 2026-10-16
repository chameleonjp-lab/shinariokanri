# 第1段階：実装監査・計測・設計

計画登録PR [#59](https://github.com/chameleonjp-lab/shinariokanri/pull/59) のマージを確認し、main `f40d07afb709b91db1ec439c0a5503682ecab91b` / tree `101b56f2fe0859d77b413d3e5925d1907bce0717` から開始した。時刻はUTC（日本時間は+9時間）。本成果は第1段階のDraftであり、第2段階の製品最適化、設計のユーザー採用、実機受入、公開を意味しない。

計測のための数値専用コード、別管理の増加系列fixture、独立期待値と破損反例、自動検査を追加した。保存形式・DB版・元fixture・原要件・公開判定・CIの検査選択は変更していない。計測器は既定で無効。常用アプリから自動で有効化・保存・送信しない。

## 読み順

1. [版・出典](sources.json)、[改変禁止入力73ファイルの固定](contract-lock.json)
2. [全経路・AUD-001〜023の監査](AUDIT.md)、[原104要件・464条項への参照](requirements.json)
3. [測定定義・原値・今回の実測](MEASUREMENT.md)、[生証拠](evidence/README.md)
4. [OPT-01〜15：現行＋2案の比較と詳細設計](DESIGN.md)
5. [第2段階のPR分割・依存・検査・戻し方](HANDOFF.md)、[外部待ち22件](EXTERNAL.md)

`CODE` は当該mainの静的事実、`OBS` は本PRの実観測、`HIST` は元の特定commit/buildの記録、`HYP` は因果・効果が未実証、`UNKNOWN` は未測定。全件取得や走査を確認しても、その全てが遅さの主要因とは断定しない。時刻や件数から受入を自動昇格させない。

## 再現

```bash
npm ci
npm test -- --maxWorkers=1 --fileParallelism=false
npm run build
python3 scripts/check_phase1.py
node scripts/optimization/measure-phase1.mjs --suite growth --output /tmp/phase1-new/growth.json
node scripts/optimization/measure-phase1.mjs --suite standard --output /tmp/phase1-new/standard.json
node scripts/optimization/measure-phase1.mjs --suite large --output /tmp/phase1-new/large.json
node scripts/optimization/measure-phase1.mjs --suite ui --output /tmp/phase1-new/ui.json
node scripts/optimization/measure-phase1.mjs --suite calibration --output /tmp/phase1-new/calibration.json
```

Chromiumの実行ファイルは `CHROMIUM_PATH` で指定できる。各コマンドは同一資源で直列実行し、空の隔離DBを作成・削除する。作者の実作品・既存同期先は用いない。追加診断は原30回・180保存・7200秒の正式受入の代替ではない。原30回測定は既存 `scripts/measure-app.mjs` の始終点・seed・素材bytesを保持する。新旧のbuild・fixture・生値を同一と推定しない。

## 保持する境界

原104要件、116ケース/464条項、24工程/6回帰群、68補助確認、30回、180保存、7200秒、600000ms、2000ms、88,003記録/113履歴・送信待ち/実72MiBを維持する。新規の診断12件を原116件に加算しない。原判定は94 local/22外部待ち・`RELEASE BLOCKED` のまま。X01〜X12は未採用。実iPhone/iPad/PC試験、本番・認証・課金・権限・配備変更、merge・公開は実施しない。
