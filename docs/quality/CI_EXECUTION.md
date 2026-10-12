# 自動検査の実行方法

2026-10-13。PR #48の製品担当とは別に、検査の実行方法を変更する。
原要件・受入条件・fixture・テストの期待・時間制限を維持する。

## 変更した点

従来は、すべてのPRで単体・build・3ブラウザーの全画面操作・大容量検査・部品検査を1台で順番に実行していた。
成功例 [実行 #127](https://github.com/chameleonjp-lab/shinariokanri/actions/runs/38267819865) は78分33秒で、画面操作だけで67分18秒を使った。
この実行の製品は `e0af36bddd23173b2591a48a01b246f02f9acf6b` で、新しい製品の成功へ転記しない。

今回も全画面操作は残すが、Chromium / Firefox / WebKitを別の実行環境へ分ける。
各環境内では元どおり1作業ずつ動かす。単体は1回だけ実行し、複数の環境へ重複させない。
各ブラウザーのbuildは、同じcheckoutからportable runtimeを生成し直すため実行する。
これにより部品検査の生成元と製品の版を揃える。新しい料金設定・公開設定は変更しない。

| 検査 | 実行する環境 |
| --- | --- |
| 文書checkerと既存24自己検査、新しい実行制御の自己検査 | `documents`、毎回 |
| 元の単体全件・build | `unit`、製品/入力/不明な変更とmainへのpush |
| 元の全画面操作 | `browser`、3ブラウザーを別の環境で実行 |
| 元の大容量到達性検査 | Chromium、元と同じ1回 |
| 元の年表・世界・作者の部品検査 | 3ブラウザー、各1回 |
| 元の執筆画面の部品検査 | Chromium / WebKit、元と同じ各1回 |
| 結果と同じ版の記録をまとめる検査 | `verify`、失敗・取消・省略でも判定する |

## 説明文だけのPR

製品検査を省けるのは、PRの全変更が次の説明文だけの場合。

- リポジトリ直下の `README.md`。
- `docs/implementation/` 内のMarkdown。
- `docs/completion-replan-2026-10-12/` 内のMarkdown。
- `docs/quality/` 内のMarkdown。

`docs/data`、元の受入JSON、spec、fixture、JSON証拠、保存ファイル、コード、依存関係、生成元、workflow、Python checkerは省略対象にしない。
diff取得不能・空のdiff・不明なpathでも全製品検査へ回す。
改名は元と先の両pathで判定し、製品ソースをMarkdownへ移す変更を説明文だけと判定しない。
mainへのpushは説明文だけでも全件を実行する。

説明文だけの成功では、summaryに `product_checks: not_run_documentation_only` を表示する。
製品テストや受入が成功したという意味にはしない。

## 失敗と検査漏れを検出する

元のcheck名 `verify` は残す。
scopeと文書検査、必要な単体と3ブラウザーが成功した場合にだけ成功へ進む。
片方の失敗・取消・想定外の省略を成功へ換算しない。
1ブラウザーが失敗しても、ほかのブラウザーは実行して原因の記録を残す。

各ブラウザーは実行前の全件一覧と実行後のJSONを保存する。
`verify` は3種類すべての記録、workflowのcommit、run ID、source treeを照合する。
一覧と結果のtest IDが一致し、全件成功・失敗0・再試行成功0・省略0であることを確認する。
記録がない・別の版・別ブラウザー・件数不足・重複・失敗を拒否する。

失敗したジョブだけを再実行した場合は、同じcommit/runの各ブラウザーの最新attemptを使う。
前のattemptの失敗記録は削除せず保持する。

## 記録の配置

| artifact名 | 内容 |
| --- | --- |
| `browser-evidence-<engine>-attempt<番号>` | 各ブラウザーのsource・一覧・結果、元HTML reportとtest-results |
| `browser-evidence` | 上のartifactを名前別のフォルダでまとめたもの。元のartifact名を維持 |

まとめたZIPには `browser-evidence-chromium-attempt1/` などのフォルダがある。
その中の `ci-browser-evidence/source.json`、`inventory.json`、`results.json` が版と全件の照合記録。
元のHTML reportは各フォルダの `playwright-report/`、添付は `test-results/` にある。
3種類のHTMLや添付を同名のpathで上書きしない。既存の証拠を読む処理ではこの追加階層を考慮する。
再実行で集約ZIPを更新しても、そのZIP内には前のattemptの個別記録も残す。

## 開発中のPR #48への適用

CI変更はmainから別Draft PRで提出する。PR #48の製品ブランチへこちらから変更を積まない。
利用者がCIのPRをmergeした後、PR #48の担当が更新mainを取り込み、現在の製品で全検査を実行する。
別の版で取得した旧成功を、最新の製品の成功へ転記しない。
元の入力・全値・時間制限を変えないまま、現在のLarge課題の解消を続ける。

実2時間編集・113履歴・30回測定・180保存などは、今回も通常workflowに追加しない。
完成受入の別工程として同じ最終製品で実行する。
短い途中確認、全自動検査、完成受入、実機検査の結果を区別する。

大容量検査の入力準備の共通化や、細かな検査選択は今回の変更に含めない。
今回のPR #48は保存・復元の共通処理を変更しており、大容量検査の省略対象にしない。
待ち時間の短縮量は変更後の実測で確認する。実行枠が空いていない場合は並列の効果が小さくなる。

## 原状へ戻す

このCI用commitをrevertし、元の単一 `verify` workflowへ戻す。
製品のsourceやテストの期待を変更していないため、製品ブランチを巻き戻す必要はない。
mergeと公開は利用者が行う。
