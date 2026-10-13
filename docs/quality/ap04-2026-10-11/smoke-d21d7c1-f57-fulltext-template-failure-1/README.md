d21d7c15b32c6c781f3bc6e8ccceb54f217a8e18 / tree 93c8ce12875cb7d48b4064a054df545ea75e0b1f / build a99fa5b600ea4854a616 の 12 件・10 ファイル smoke は N16 / F13 / F51 / F52 / E09 / F16 / F14 の 7 件が通過し、F57 が 8011 ms で失敗して停止しました。残る 4 件は未実行です。原 timeout と given / query / guards は変えていません。

失敗時の原 60 行は、全種類の全文 query「勇者」に対しカード 1 件を期待しました。実 snapshot の 2 件は人物「青井光」と「人物のタグ雛形」です。実入力の人物 customValues.catalogTag と、雛形の default / allowedValues に同じ作者の文字列があり、catalog.ts は両方の authored text を検索するため正しい一致です。原 F57 は全文・作者索引・タグの区別を求め、全種類検索の結果が人物だけとは定めません。根拠は原の source、実 ZIP、error-context、trace と raw-query-diagnostic.json に保持します。製品不具合を確定せず、root は fixture / query / 原数値を保って正確な 2 names / fixed UUID set に oracle を強化する修正のみ許可しました。このコピーはその修正前に作成しています。

実 .scenario 入力 9 件・ダウンロード 24 件を SHA と trace event まで監査し、全 stage artifact audit は complete、観測エラーはありません。F57 の入力は実 3221 bytes、ダウンロードはありません。全 stage と全体の source/dist/hook/module/env 前後 binding が一致し、保持した bounded source+generated / dist tar の SHA と全 member bytes も確認済みです。終了後の browser / preview / 4173 listener 不在を確認して実行枠を解放しました。

全 run files は byte 同一で retained-run にコピーし、失敗 source と build log / exit / bounded manifest / source-generated tar / dist tar を別保存しています。先行失敗は変更せず、成功した 7 executable test から原 116 の完成を推定しません。原判定は全て not_run のままです。
