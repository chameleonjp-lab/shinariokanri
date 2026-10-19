# 1Bの原本・再実行

[supplement-evidence.zip](supplement-evidence.zip) は17750581 bytes / SHA-256 `7b1a29cd32875e2cb206666b5bf81511216578baf1190360ae407f63ec73babf`。[全member台帳](supplement-evidence-manifest.json) とZIP内 `MANIFEST.json` は全260 memberのpath/bytes/SHAを保持し、全CRCを実読確認した。nested `local/candidate.zip` / `local/candidate2.zip` も各bindingの全source/dist/helper/原契約・生成runtime inventoryと実bytesへ照合した。既存formal95MiB制約未満で、失敗証拠も切り捨てていない。

成功候補は `db2874852e958e63261876d0cb5477ee4cc5a6d4` / tree `f7f24d96f84765f0a664396b350dac2c202997d7` / build `16a47445cc54b018cf19`。`local/candidate2.json` はSHA `bd62c6dd439fcf049e96f94f0701b9fd8af155596421a19a876de9c11a75ab74`。最初の `candidate.json` / `run-attempt1` / `supplements-attempt1` はESM context不足の別候補失敗であり、成功へ付け替えない。

実N05原本は `local/supplements-attempt2/n05/downloads/1.json` と `2.json`。各32013522 bytes、同SHA `b42e5e7e429a96558a13f80cad68d6debe28b33a38085e9f29b1b27ea40a34bb`。元テストの期待する結果等値により同じSHAだが、別downloadオブジェクト/別event/別saveAs/別通常fileである。各eventの名前/URL/path/bytes/SHA/完了、trial `a59a7ac2-4739-45c6-b60f-1291cccbf224` とsource/build/fixtureの結合は `events.json` / `capture.json` / 実 `results.json` の同一添付に保持する。再整形JSONから原本を作っていない。

`local/supplements-attempt2/assessment.json` が独立判定。原RG01の8checkpoint、RG02/03各6条件、原N05の全29表前後hash・unknown・未保存入力・中断応答へ結び付く。元N05本文/fixture/assert/timeoutは変更せず、importの限定変換と元ESM package contextだけを一時stageへ追加する。原RGのpackage.jsonも元manifestから全bytes照合する。

04a7の未commit checker/11反例コードは未回収で、この判定器は原given/拒否条件からの新規再構成。補助RG01〜03は原6回帰群RG-R01〜06の全合格ではない。`local/REPORT.md` のworker提出時の「実行待ち」は当時の報告であり、統合後実結果は `run-attempt2/exit.json`、`supplements-attempt2/`、`actual-eleven-probe/` を読む。初期REDは未実装時の2検査のFileNotFoundErrorであり、最終17検査全件の事前REDではない。

実反例の仕様・変更原本・各SHA・実拒否は `local/actual-eleven-probe/probe.json` と各caseディレクトリ。原RG実添付の8checkpoint置換/anchor実値/6条件置換/全trace state/添付欠損/policy-mixed/別buildの7件と、今回N05実原本の片側欠損/第二eventのないJSON複製/別trial/別buildの4件を、指定した拒否理由で全11件拒否した。hermetic unit17件だけを実原本11件の証拠へ転記していない。

再実行は新しいclean候補/production buildを用意し、原 `recover_historical.py` でimmutable commit `d5e132ef6f4db6a0f3fbe888228ffd1007d653f9` の2bundleを回収する（83＋37 member）。その後、未使用の外部outputで実行する。

```sh
python3 scripts/acceptance/seal_candidate.py --output /tmp/new-1b-candidate.json
python3 scripts/acceptance/run_supplements.py --repository "$PWD" --binding /tmp/new-1b-candidate.json --historical /tmp/original-historical --output /tmp/new-1b-supplements
```

wrapper/driver/verifierは実argvと実子終了/logを保持し、candidateの途中変更を拒否する。反例probeの実スクリプトはZIP内 `local/probe_actual_supplements.py`。絶対pathは元実行の所在を示す記録で、異なる取得先へ同じ実行を偽装するために書き換えない。

1Aの現行30/180・heap、3B同一最終候補の正式N05/RG・7200/full113/116・464判定、原外部22件・別3条件は未取得/未実行。元9release gateを維持する。最終PRの原全CI/3engineと、provider各ZIP全memberの照合はPR本文で別に記録する。
