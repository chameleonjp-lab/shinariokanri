# 公開構成と完了条件

公開候補は公開リポジトリのGitHub Pages。基底パスは `/shinariokanri/`、候補URLは `https://chameleonjp-lab.github.io/shinariokanri/`。これは候補であり、公開済みのURLではない。Pagesサイト設定と公開操作はまだ行っていない。

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
