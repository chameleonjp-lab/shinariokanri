# 公開構成と完了条件

公開候補は公開リポジトリのGitHub Pages。基底パスは `/shinariokanri/`、候補URLは `https://chameleonjp-lab.github.io/shinariokanri/`。これは候補であり、公開済みのURLではない。Pagesサイト設定と公開操作はまだ行っていない。

静的buildのHTML・JS・キャッシュには作者の作品データを含めない。作品は端末内に保存し、同期の接続先がないときはクラウドに送信しない。バックエンドを設定した場合は、接続先・認証・RLS・private素材・容量/通信/メール費用を別に検証する。新規有料機能は有効にしていない。現行プランの使用量と課金条件はWP24で記録するまで未確認とする。

`npm run build` はcommit・基底パス・build識別子を `dist/build-info.json` へ出す。Service Workerは同じ基底パスの静的アプリ資材だけをキャッシュする。更新workerを強制適用せず、旧画面が閉じた後に新しいキャッシュへ切り替える。更新後は保存/再読込/オフライン起動を再確認する。

完成版の公開にはWP23/WP24の条件を満たす必要がある。`scripts/check_release.py` は全116受入ケース・全24工程の結果、実端末、手動アクセシビリティ、性能、復元訓練、実同期、実RLS、独立レビュー、費用、直リンクの証拠を対象commitへ対応させる。未実行や別commitの記録では公開を停止する。これは証拠記録の検査であり、実試験の実行や証拠内容の独立審査を代替しない。

証拠は対象commitを検証した後のActions artifact `release-evidence` に `release-evidence.json` として保存する。ソースのcommitにそのcommit自身のhashを書き込もうとせず、外部の検証artifactで版を固定する。完成版受入が整った後、`Publish verified release` workflowへ同じcommitの証拠run IDを渡す。現時点ではこのartifactを生成していない。

公開前に対象commitのbuildでサブパス・素材・キャッシュ更新・再読込・直リンクを確認し、公開後にもbuild-infoと表示版を確認する。ルート単独の成功をサブパスの確認として扱わない。
