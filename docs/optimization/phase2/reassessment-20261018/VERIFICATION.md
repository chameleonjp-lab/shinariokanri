# 検証・環境・証拠

計測source `d963f3d1f6b75337a432b0ece3ce087184f78e75` / tree `d6b72a68c0e472facfac102771fd7225f2d0a4fc`。これ以降の提出文書・証拠・Pythonのpackaged-evidence検査は、測定source321ファイルと製品srcを変えない。原要件・原入力・原CIは不変。

## 実行済み

- baseline: 元のcatalog/参照/固定版テスト5ファイル36件と製品buildが成功。
- 新規: 研究session/入力同一性/意味監査の3ファイル53件成功。継承owner、query.toJSON、実走査counterの3反例はレビュー後RED→GREEN。元fixtureの2種類のSHA定義は固定hashテストでRED→GREEN。
- 元tsconfigを使う製品build/型検査が成功。clean d963f3d、dirty=falseの実build13memberを保持。ZIP 1094454 bytes / SHA256 `3831b99b7f8a4276101394649ef9dbc40c3f5091e36058e85fdaf1bda5257312`。clean-build.jsonで全memberを照合できる。
- 同一clean sourceでStandard/Largeを直列に実行。各90session/540 query値、全30反復、3方式の別ON実行、元fixture/素材SHAと最終入力不変が成功。rawからp95/保持/結果digest/全321 sourceのGit証明を独立再検算した。
- 文書検査は元の104/60提案/24工程/116 planned cases/48+10出所と原文の整合を確認して成功。新しい補助検査を原件数へ加算しない。
- 元の全unitを指定どおり1worker/非並列で実行し、130ファイル/1253件すべて成功。485.88秒、全文はevidence/logs/full-unit.log。53件の新規研究テストを含むが原受入件数へ加算しない。
- 2回の独立レビューで、最初の3件は計測前に修正済み。提出レビューでは1080個のCSV値・720対差分・build13memberを独立確認した。そこで見つかった「過去sourceと現在のcheckoutの一致を通常CIに課す」問題は、計測時source ZIPの保存と通常CI/提出時追加検査の区別で修正。将来のsource変更を模擬した回帰検査は保存証拠の成功と現行一致検査の拒否を両方確認する。製品/計測driverへの変更や過去rawの付け替えはない。
- Python文書系54件、CI制御/原復元artifact検査25件が成功。文書・completion-plan・phase1・新しいreassessmentの現行source一致追加検査も成功。新しいchecker24件には、欠測/重複/順序違い/NaN/p95偽装/結果不一致/上限超過/未解放/source差し替え/ZIP改変/両suiteの混在を拒否する検査を含む。
- 原release checkerは終了値1の **RELEASE BLOCKED** を維持。製品src・package/lock・原CI・元e2e・原docs/dataの基点mainからのdiffは空。最終mainのAPI再確認でも基点SHAは同一だった。

原3engine/後続回帰・GitHubの最終状態は実行後に追記する。この記載だけで全体検査成功や第2段階完了を意味しない。

## ローカル実行環境

Linux Debian 13、Node v24.19.0、元package-lockとnpm ci。既定npm cacheはread-onlyのhome配下で失敗したため、`--cache /tmp/shinariokanri-npm-cache` で元依存をそのまま導入した。初回失敗の原出力はツール履歴にあり、workspace上の原logファイルは保存されていない。後の成功logは保持。

原Playwright 1.64.0のChromium156.0.8078.4/Firefox157.0/WebKit27.2をscratchへ導入。欠けたDebianライブラリは/tmpへdownload/extractし、ホストの本番設定やapt DBを変更しなかった。WebKit bundleのwrapperがLD_LIBRARY_PATHを上書きすることを追跡し、scratch bundleのsys/libだけへ必要なlibraryを置いた。FirefoxはstraceでXDG configの作成がhomeのread-only境界に拒否されることを確認し、XDG_CONFIG_HOME/XDG_CACHE_HOMEをworkspaceの試験用ディレクトリへ指定した。HOMEは変更していない。

入れ子sandboxでのFirefoxは元の検証手順と同じMOZ_DISABLE_CONTENT_SANDBOX=1を使用。host library事前検出はscratchの実配置を検出できないため無効化したが、3engineの実launch→newPage→data URL/titleを確認して成功した。これらは実機試験・実OS操作の受入を代替しない。失敗したlaunch、依存不足、strace、解消後の実launchはlogsへ保存。

初回の狭いTypeScript CLIは元のjsx/vite型を渡さず失敗した。元のtsconfig/buildで再確認して成功した。初期のsparse checkout不足による文書link失敗も、必要な元資料を取得して元checkerの成功を確認した。元のテスト・assert・timeout・retry・fixture・seed・形式は変更していない。

## 判定の区別

historical-ci.jsonは#60〜65の各7job成功を2026-10-18にAPIで読み直した記録であり、本提出sourceの新しい検査ではない。特に#65のPR本文に残る「CI追記予定」を現在の未完了と混同しない。過去runのbinary artifactは今回再downloadしていない。

原94ローカル/22外部条件の時点記録は維持する。全116/464条項の新規正式受入、180保存、7200秒、113履歴/送信待ちと実72MiBの最終new/clone/cold、実機、専用実Auth/サービス、対象ゲーム、費用、独立した人の受入レビューは本提出で未実行。**RELEASE BLOCKED**。原release checkerを成功させるために証拠を補作しない。
