# 独立レビューの引渡し

原CP15の証拠内容確認用。ここで作成した著者レビューと、別の確認者による独立レビューを区別する。確認者・確認日時・実施結果は未記入であり、この文書を作っただけで独立レビュー済みにはしない。

対象製品は `1fcadcca703863873a57d297e83b1b184e63e778`、tree `8ac6e33a98455204aa265be5ce86ee5be168a97b`、clean build `8ec3a03810bb0cf1b1b4`、base `/shinariokanri/`。PRの証拠追加コミットと、実行した製品コミットを分けて確認する。[判定記録](release-evidence.json)・[逐条記録](CLAUSE_REVIEW.json)・[工程](WORK_PACKAGE_REVIEW.json)・[回帰群](REGRESSION_REVIEW.json)・[補助確認](SUPPLEMENTAL_REVIEW.json)を原文と突き合わせる。

1. [原116ケース](../../plan/COMPLETION_ACCEPTANCE.md)の4条項が残り、104要件・24工程・6回帰群・68補助確認と対応しているか確認する。未採用の追加12案に対応する36確認は、採用済みの原要件へ加えない。
2. 証拠束の全partとmanifestを取得し、同梱の `evidence/verify_bundles.py` で新しい空フォルダーへ検証・展開する。各ファイルの元実行パス、保存パス、bytes、SHAをmanifestでたどる。原CI ZIPの取得先・期限は別に残し、保存していない旧原本を再生成したものへ置換しない。
3. 製品CIの実merge `819b178f8d47048d3bc5aaa6988b67c220a71947` とtree・parents、実unitログ、各ブラウザーの実結果・fixture・出力を照合する。Chromium `f26008444ed75dd8c5af` / Firefox `fdfa60b47e1db110ce41` / WebKit `7824d3a0bf4a81f63fe8` は各CI buildであり、ローカルbuild `8ec3…` へ付け替えない。E12の実cache/build記録も同じ値と一致するか確認する。
4. Standardの元8指標各30回、Largeの元8指標各30回、元6条件×30保存の全生値を確認する。Largeの明示上限は起動10000ms・検索2000msで、残6指標へStandardの上限を作らない。nearest-rank p95を丸めず、関係図の元上限33.4msを維持する。不合格runとその実ソースも読む。
5. 実7200秒のmonotonic時間と112操作・14native再読込・22offline cold、最後の実完全ファイル・全113command/pending・162117 typed owned ID・72MiB素材、新規/複製/coldの全対応を確認する。14回のnative再読込を公開snapshot14件と解釈しない。元CLIの実終了codeと、結果の合否を区別する。
6. 保存の計測区間は500ms入力待ちを除く元の検査開始→端末commitと、UI開始→成功通知を分ける。全件再保存・全履歴読込・全台詞hashの再発を元の観測項目で確認する。正規のv1 command hashに必要な実digest呼出し・bytesを残しており、hash処理ゼロという主張にはしない。
7. 原Largeと同じ全量の例外確認は、縮小した単体fixtureと区別する。破損/未知版/最終段エラー/容量不足、実native rollback、同じ入力での通常再試行とcold oracleを、実行した対象版とrawで確認する。
8. [実機等の引渡し](MANUAL_REVIEW.md)の未実行条件、実Auth/RLS・二端末・対象ゲーム・費用・直リンクと旧証拠の不足が、合格へ一括変更されていないか確認する。汎用ブラウザー受取例のactual-mode receiptを、指定ゲームの実機結果へ読み替えない。

公開判定を再確認するときは、cleanな製品 `1fcadcca` checkoutで、元の `scripts/check_release.py --evidence /絶対パス/release-evidence.json` を使う。証拠配布用HEADで同じ製品commitを名乗らない。原checker・原9gateは変更しない。未確認が残る場合は実際の `RELEASE BLOCKED` と不足項目を記録する。

確認者は、対象製品、使用したmanifest SHA、原AT/条項、実入力と実結果の対応、指摘、未実行条件、判定、時刻を返す。実機・実接続がない条件を確認済みにはしない。第三者へのレビュー通知や新しいCodexタスクの作成は、この作業からは行っていない。
