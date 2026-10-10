# RB10 全件検証の計算と作者別案検査の保存待ち

2026-10-10のC18（`7c275dc4c7608165e5eaba5d2ac63c58d119aa0a`）は、GitHub CI run `38021089114`が成功した。一方、Largeの同じ88,003件・実素材72MiBを用いた各30回の通常画面測定は、起動p95 `10548.09999999404ms`と`10909.699999988079ms`が元の10,000msを超えた。両失敗を保持する。検索の合格、プロセスexit 0、別の版の成功を起動や全性能の合格へ換算しない。

この後続変更は、本文のUnicodeコードポイント数・UTF-8バイト数・サロゲートの妥当性を一度の走査で求め、同じ不変の文字列の測定値を再利用する。保持するのは測定値だけで、フィールドごとの合否・参照・許容範囲は毎回評価する。最大512文字列、1文字列4,096 UTF-16単位、合計1MiBの論理UTF-16ソース量に制限する。この値はMap・測定値・エンジンの文字列保持を含む実heap上限ではない。実在日の計算も、形式が一致する10文字の日付512件までに制限する。無効な日付のfalseも保持する。

本文ID・別名ID・条件・文字位置・素材・固定世界・snapshotの走査では、従来の関数の入口で直ちに戻っていたprimitive値への呼出しと、そのためだけの位置文字列の作成を省く。すべてのobject／array、元の順序・深さ・除外規則・未知項目・参照・hash検証は保持する。native読込の2048件区切り、同じ原子snapshot、取消、完全保存・履歴・復元・素材bytes・同期基底は変更しない。形式、schema、元の性能閾値、解析上限を変更しない。

Nodeで同じLarge fixtureの全件検証を3回実行した診断は、変更前`2360.6498 / 2089.020977 / 2237.227489000001ms`、変更後`1841.614275 / 1639.5823409999994 / 1481.988272999999ms`だった。fixture hashと入力は前後一致した。この診断はnative IndexedDB・実App・30回p95・実端末の証拠ではない。最終のclean対象版で通常操作・元の測定起点・空環境復元を再実行する。

別に最新mainのCI run `38020345163`では、WebKitの作者別案検査が二回目の保存を待って失敗した。検査側の`completePending`が前回の完了callbackを保持し、新しい非同期seal／保存待ちの登録前に前回を呼べる競合だった。submit直前に古いcallbackを外し、今回の保存待ち登録を確認してから解放する。二回目のSHA計算を実際に保留し、旧callbackがnullであることも検査する。8秒の待機上限・元の12項目・後発入力・移動画面・同ターン重複の期待値は維持する。

補修した作者別案検査はLinux上のChromium `153.0.8010.12`、Firefox `155.0`、WebKit `26.6`で各12項目成功した。実browser.version・UA・OSを保存した。in-memory hostの独立したsource component検査であり、実App・native永続化・iPhone/iPad/Safari・実Auth／RLS／Storage・全116受入へ加算しない。独立静的レビューでも元のvirtual host fixture、12検査ラベルと期待値の保持を確認した。

対応はREQ-N04／N12／N18、AT-N04／N12／N18、RG06、RV07とRV29の回帰検査である。元の104要件・116受入・24工程・6回帰群は保持し、設計時点のplanned／not_runと現在の実行結果を分ける。実端末・支援技術・専用実接続・現行quota／費用・公開後確認・2時間編集等は、同じ完成対象版の実証拠が揃うまで完成を保留する。

準備検査では、変更後の394製品入力を固定して、全814単体／90ファイル、専用4＋既存domain96＝100検査、production build、schema生成差分なし、文書・計画検査、Python15件を実行し、すべてexit 0だった。製品入力と元26文書は各実行の前後で不変。共通検証も変更した同じ394入力で作者別案検査を再実行し、3ブラウザー各12項目成功した。dirty準備のbuildと最終clean対象版は分ける。

実記録は[準備とC18最終結果のmanifest](../quality/current-review/evidence/rb10-candidate/candidate-19-text-validation-preparation-and-c18-final-1/MANIFEST.json)に5,281論理ファイル／801個の一意SHA blobとして保存した。元順の3partを連結したtar.gzは100,669,168 bytes、SHA-256 `4774f1a809569815b95bc31b90be6dbdaee8a065ecc4520abaf87299bc8c3932`。全blobのbytesを再読込してhash一致を確認した。privateな一時転送URLを含む設定・stderrは内容を除外し、除外のbytes／SHAだけを保持した。C18 CIの実artifact ZIPもGitHubのdigestと一致した（11,647,788 bytes、SHA-256 `e8474aef5d08af7413a28c9b0324502026c7450b96b814f4b70bf5accfb0f1e6`）。[独立静的レビュー](../quality/current-review/evidence/rb10-candidate/candidate-19-independent-static-preparation-1/MANIFEST.json)は対象sourceのSHAを固定しており、独立browser／unit／実端末検証へ換算しない。
