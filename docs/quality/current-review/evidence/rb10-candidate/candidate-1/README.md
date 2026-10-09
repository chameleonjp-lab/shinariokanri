# RB10 C1 の実結果（失敗候補を保持）

対象は `71159f2e71c648c43ae81f90d1bd72a6a144586b`、tree `a22e8498118263854c0801ea4b8fdffd25ea409e`、clean production build `48dedbc96071237ee064`、base `/shinariokanri/`。source・dist・測定 helper・fixture のSHA256はbindingと各測定JSONに記録する。`summary.json`は各raw artifactのhashを結ぶ。

GitHub CI `37871467519` は失敗。単体754件、build、文書・計画、Python15件は成功したが、production E2Eは249/252。3件とも開始点のselectと追加検索欄を曖昧なlabelで選ぶfixture誤りで、後続RB03/RB04は未実行。別のローカル全単体では752/754。2件はsystem Chromiumのfile URL禁止により実行できず、元の検査をdownloaded Chromium153で変更せず再実行して2件成功した。19件のfilter除外を実行成功へ数えない。

実App・実IndexedDB、Linux自動Chromium153でStandard8,800件の各30回p95は操作200ms、検索500ms、command保存1000ms、cache起動3秒、active図／年表33.4msの各基準内。保存区間へ500ms入力待ちを入れない。Large88,003件＋実素材72MiBでは検索30回p95は2秒以内だが、cold local初回表示30回p95 **12,390.7ms** が10秒を超えた。単発8,689.5msで置き換えず、C1は性能未達として保持する。

実機、支援技術、実Auth／RLS／private Storage、全116受入、全24工程、公開gateの合格ではない。C1の保存・復元・2時間継続編集はこの記録では未実行。後の候補へrawを流用しない。
