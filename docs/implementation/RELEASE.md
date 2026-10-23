現在の固定候補はC29 `09d39faae9c7293fe77b5675cc7286605a1809a6`、tree `352863bf81bd56b3c563f76e6b7586fe5f471e24`、clean build `b59572f71d050cd96e0f`、base `/shinariokanri/`。[同版evidence](../quality/current-review/release-evidence-incomplete.json)を製品HEADから元check_release.pyへ渡した実判定はexit1、116受入・24工程・9gateの149保留、版/基底不一致0。チェックの条件は変更していない。候補ZIPは13distと依存LICENSE/NOTICEを実bytesで含み[短い実端末手順](C29_MANUAL_REVIEW.md)を用意したが、専用HTTPSへ未公開で実端末/実Auth等は未実行。文書delivery commitを製品buildの対象commitへ置き換えない。

# 公開構成と完了条件

開発中の最新版の公開先は公開リポジトリのGitHub Pages。基底パスは `/shinariokanri/`、URLは `https://chameleonjp-lab.github.io/shinariokanri/`。2026-10-23の利用者による公開・自動更新の依頼に基づき、Pagesの配信元をGitHub Actionsとし、`.github/workflows/pages.yml` で `main` へのすべてのpush（PRのマージを含む）を自動配信の対象とする。Node.js 24で `npm ci` と `npm run build` を実行し、生成した `dist` だけを配信する。ビルドや配信が失敗した場合は既存の公開版を維持する。手動再実行はActionsの `Deploy latest main to GitHub Pages` を `main` で実行する。作業ブランチや未マージのPRからは公開しない。

この配信は開発中の `main` の公開であり、完成版の正式受入ではない。既存の `.github/workflows/ci.yml`、完成版の `Publish verified release`、`scripts/check_release.py` の証拠条件は維持する。最新版の自動配信では完成版受入証拠を生成したり、未確認の条件を合格扱いにしたりしない。公開後は `build-info.json` のcommit/tree/baseとActionsの配信結果を照合する。

配信は既存の `pages` concurrencyグループで直列化する。配信直前に実行対象commitと最新 `main` を照合し、一致しない古い実行は停止する。古いrunやdeployジョブだけの再実行による巻き戻しを防ぎ、最新版のrunから再実行する。

静的buildのHTML・JS・キャッシュには作者の作品データを含めない。作品は端末内に保存し、同期の接続先がないときはクラウドに送信しない。バックエンドを設定した場合は、接続先・認証・RLS・private素材・容量/通信/メール費用を別に検証する。新規有料機能は有効にしていない。現行プランの使用量と課金条件はWP24で記録するまで未確認とする。

`npm run build` はcommit・基底パス・build識別子を `dist/build-info.json` へ出す。Service Workerは同じ基底パスの静的アプリ資材だけをキャッシュする。更新workerを強制適用せず、旧画面が閉じた後に新しいキャッシュへ切り替える。更新後は保存/再読込/オフライン起動を再確認する。

完成版の公開にはWP23/WP24の条件を満たす必要がある。`scripts/check_release.py` は全116受入ケース・全24工程の結果、実端末、手動アクセシビリティ、性能、復元訓練、実同期、実RLS、独立レビュー、費用、直リンクの証拠を対象commitへ対応させる。未実行や別commitの記録では公開を停止する。これは証拠記録の検査であり、実試験の実行や証拠内容の独立審査を代替しない。

証拠は対象commitを検証した後のActions artifact `release-evidence` に `release-evidence.json` として保存する。ソースのcommitにそのcommit自身のhashを書き込もうとせず、外部の検証artifactで版を固定する。完成版受入が整った後、`Publish verified release` workflowへ同じcommitの証拠run IDを渡す。現時点ではこのartifactを生成していない。

公開前に対象commitのbuildでサブパス・素材・キャッシュ更新・再読込・直リンクを確認し、公開後にもbuild-infoと表示版を確認する。ルート単独の成功をサブパスの確認として扱わない。

## RB10候補の確認手順

対象は[RB10候補](RB10_COMPLETION_CANDIDATE.md)。production buildの `build-info.json` に記録したcommit/tree/baseと、検査artifactのsource・dist hashを照合する。ソースにそのcommit自身のhashを埋め込まず、検査後の外部artifactへ版を固定する。証拠だけを追加したcommitを、前のbuildの試験対象commitと混同しない。

実端末確認はスマートフォン／タブレットの通常画面で新規登録→保存→再読込→固定リンク→読み位置へ戻る→完全保存→空領域new/clone復元を行う。利用に毎回PCを必要としない。320/390/768/1024/1440幅、回転、IME、Files、録音、offline、キーボード、文字200%、VoiceOver／NVDA、ドラッグ代替の結果とOS/browser実版を個別に残す。自動WebKitを実Safariの証拠へ変えない。

専用実接続にはURL/public key、owner/editor/reviewer/reader/nonmemberの5試験accountとfixture tenant、private bucket、region/tier、許容量と現行quota／費用が必要。利用者の別用途DBを代用せず、自動migration適用・課金・公開をしない。prepared/rebase/原子ACK/二案UIと9migrationの局所契約は実接続試験から区別する。

公開を別途承認して実施した後は、直リンクから開いたbuild-infoと完成commit、サブパス・キャッシュ更新・cold/offline・保存/復元・権限撤回を再確認する。公開先が未設定であることや未実行の受入を、公開成功や費用ゼロへ読み替えない。
