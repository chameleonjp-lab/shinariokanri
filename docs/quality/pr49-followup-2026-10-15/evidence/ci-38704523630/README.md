# 前候補086255aで生成した復元原本12件

[全CI run38704523630](https://github.com/chameleonjp-lab/shinariokanri/actions/runs/38704523630) の Chromium・Firefox・WebKit artifact から取得した実bytesを保存する。対象headは `086255ab3ee07bb3a522fc2dc8cf6d249afca4a7`、実CI merge checkoutは `0cd0714bc7698a19d4a158ece54318e80bff871e`、共通treeは `56beca7ab1be5150bab892087cfb563cdaf92b9a`。

各engineフォルダーには AT-N14 resumed/cold と AT-E12 new/clone の4完全ファイル、元のsource/manifest、独立照合の記録を持つ。`selected-test-results.json` は実125MB前後のJSON reportから該当2 spec/resultオブジェクトを変更せず抜き出したもの。元reportの実bytes/SHA、artifactのID/digest/容量/期限も同ファイルに記録した。抜粋を全228件のraw reportとは扱わない。

リポジトリのrootから、同じ検査コードで各抜粋と実原本を再照合できる。出力先は未使用のディレクトリを指定する。

```sh
python scripts/ci/verify_recovery_artifacts.py \
  --results docs/quality/pr49-followup-2026-10-15/evidence/ci-38704523630/chromium/selected-test-results.json \
  --source docs/quality/pr49-followup-2026-10-15/evidence/ci-38704523630/chromium/source.json \
  --engine chromium --output /tmp/pr49-recovery-chromium
```

`firefox`・`webkit`でもengineとフォルダーを合わせて実行する。出力4ファイルのbytes/SHAを、保存済み `recovery-manifest.json` と比較する。CI artifactのprovider digest/CRC・実checkout/tree・228件の全結果とinventoryの一致は `verification.json` の取得時照合記録に分けてある。GitHub artifactの記録上の期限は2027-01-13 UTCだが、ここに保存した原本と抜粋はその期限に依存しない。

これは前候補086255aの12原本であり、現候補へ転用しない。旧run38515797862で不足した12原本や、未取得の旧C29の37分割/MANIFESTを回収・再構成した記録ではない。原116ケース/464条項・実機・実Auth等の全受入へも昇格しない。
