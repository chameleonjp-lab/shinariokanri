# RB05 固定再利用候補の独立レビュー

対象は `feat/rb05-fixed-reuse` の未commit候補1。05:40:51Zに151 srcを凍結し、直後のworkspaceとのSHA256差分は0件でした。基底は `a11352dce854119afb59fbdd32bf35cf6212a5dc`。元104要件・116受入・24工程・6回帰群の完成判定は更新していません。

原F19/AT-F19と動作契約§7を含む対象要件・受入のgiven/when/then/negative_or_edgeを[original-contracts.json](original-contracts.json)へ変更せず保持しました。個別補修検査の成功は元受入ケース全体の合格へ換算しません。

候補1では追加独立11件が2成功・9失敗、提出5件と前段の独立30件は成功しました。実Chromium151 / 1024×768の通常App検査5群は成功、pageerrorは0です。Vite上の実Appとnative IndexedDBに保存遅延/失敗を注入した証拠であり、production・実機・支援技術・実権限の証拠とは分けています。

| 原因 | 正期待と確認した差 |
| --- | --- |
| S5F01 | 固定pinに限定した有効な相互排他例外が、初期提示で禁止扱いになる |
| S5F02 | 固定pin対象の伏線deadlineで、必須情報不足が直接確認と有限探索から抜ける |
| S5F03 | 借用IDを正本relation IDまたは別本文block IDへ衝突させても検査が成功する |
| S5F04 | hash待ち中の呼出元revision/request変更が確認候補へ混ざる |
| S5F07 | 推移依存pinのhash不一致を見逃し、独立cloneにも改ざん本文が入る |
| S5F08 | 実行ビューに存在する借用変数を型付きoverrideへ指定すると保存時に参照欠落扱いになる |
| S5F09 | 明示した別固定版のリンクが、使用先と同じentity IDの場合に共通元pinへ変わる |

途中開始と固定gateの巻戻・native保存/復元・作品clone/再生、現在稿の没化後の旧pin利用、別名IDの独立cloneは成功しました。通常操作では遅延保存→閉じる/再入→1回確定、閉じた後の失敗→同入力retry、完了後の再入/cold reload、override下書き再読込/取消、不変S/T/U→C改稿→旧本文再読込→Sだけ版更新を確認しました。

[候補1 JSON](independent-candidate-1-review.json)に手順を実装した独立検査源、fixture、実結果、151 src hash、環境、ログ、証拠ファイルhashを結びました。初回harnessのscriptパス/locatorの不備はsetup記録として保持し、製品指摘へ数えていません。

この候補には未解決7原因があります。修正候補は別の凍結・再検査として記録します。実機・全116受入・性能・同期実権限・release gateと全RB05の完成は未確認のままです。製品コードは編集していません。

候補1の同一151 srcに対する追加下位call図検査1件は失敗しました（S5F10）。現在稿の子図だけを修正すると、旧pinの子図に残る未接続出口を使用先上位集計が0件とし、同じ実行ビューの集計では1件です。原F13/F19に反するため、[補足記録](independent-candidate-1-hierarchy-supplement.json)を別に保存しました。元の候補1報告・98証拠hashは変更していません。

候補2は06:05:43Zに151 srcを凍結（workspace差分0、候補1から12 src変更）。元の追加12件、前段30件、提出7件、実Chromium151通常App6群は成功しました。新たな入れ子の開示検査S5F11は失敗し、外側pinに定義した提示が内側pinの本文由来だけで除外され、効果が欠落しました。[候補2記録](independent-candidate-2-review.json)へ正期待源・fixture・実結果を保存しています。候補1の負の証拠は変更していません。

候補3の独立確認を[記録](independent-candidate-3-review.json)へ保存しました。元49件と入れ子提示S5F11の正期待1件は成功し、同じ通常App6群も成功しました。新たな明示固定リンクの通常表示S5F12は、内側から借用した本文が固定版dialogで空になる差を確認しました。通常操作はnative保存→cold reload→検索→確認表示→リンク→対象固定版です。未実行の元116受入・全RB05・実機・性能・実権限の判定は変えていません。

候補3の同じ151 srcへ追加した入れ子native往復/作品clone検査S5F13は成功しました。両復元作品で外側pinの提示ID/効果5と正本件数を確認し、借用レコードを正本へ増やしていません。[別の補足証拠](independent-candidate-3-native-supplement.json)として保存し、候補3 primary102 artifactと報告hashは変更していません。

候補4は06:26:22Zに151 srcを凍結（workspace差分0、候補3から固定版表示2 src変更）。[独立記録](independent-candidate-4-review.json)のNode53件（独立44・提出reuse7・提出固定表示2）と実Chromium151通常App8群が成功しました。候補1〜3で確認した8原因と入れ子提示S5F11/固定表示S5F12を正期待で再確認し、未解決指摘はこの範囲では0件です。native保存→cold reload→外側pin本文表示、内側pin/元IDへのリンク、😀コードポイント3..4の強調、外側の元位置へ戻るまで一致しました。候補1〜3の負の証拠を保持し、元116受入・全RB05・実機・性能・実権限・release gateを合格へ換算していません。製品コードは編集していません。

候補4の151 src SHA256を最終製品commit `686f4e9ac2c48df3b15484f6676f6a6a14b2c78e` / tree `434809f54ea26827811e127a256a7de681b5c26b` のgit blobへ独立照合し、151/151一致・追加/欠落0件を確認しました。最新main基底 `47b70ab2375de3504af364bddd5df8b74aedd37e` は候補commitの祖先です。[commit結合記録](candidate-4-commit-binding.json)にNode53件と実App8群を結び、歴史的な負例は別manifestのまま保持しました。6報告の425証拠hashと原requirement/acceptance/specの4 hashも全一致です。対象範囲の補修検査成功であり、元116受入・全RB05の完成判定ではありません。
