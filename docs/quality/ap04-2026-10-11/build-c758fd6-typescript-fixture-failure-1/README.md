c758fd68377059f7e2e7389fac80124818710da8 / tree 2acf8e06b2795323d191707e378020203a85aec6 の build は `tsc -b` で停止しました。3 件の新 N fixture の整数 allowed.min/max に null を指定しており、6 件の TS2322 が実際の build.log に残っています。Vite と service-worker 段階には到達していません。

このフォルダは失敗時の log と当該 commit の正確な fixture source を保存します。現在の成功済み c207762 build や残存していた b56 dist を c758 の成功結果に再対応させません。stale-dist-build-observation.json は先行 b56 の保存済み binding に含まれる metadata の観測コピーで、c758 build 成功の証拠ではありません。独立した終了コードファイルは提供されていないため値を推定しません。原受入判定はすべて not_run です。
