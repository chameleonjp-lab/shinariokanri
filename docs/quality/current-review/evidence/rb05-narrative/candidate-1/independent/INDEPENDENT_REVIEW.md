# RB05 narrative / migration / reconfirmation 独立候補レビュー

対象は `a21a5d3f963c2d385906624e959e096accdd6006`、tree `f31f2a3b1aa97564ff65946eaec6c2ebf0daf32e`。基底main `b310800c98bc9a89b93182ad721380a0be99d2d3` は祖先である。commitから07:41:00 UTCに隔離し、154 src全ファイルの内容とSHA-256を再照合して一致した。原requirements / acceptance / BEHAVIOR_CONTRACT / DATA_MODELの4 hashも一致した。

事前六原因の正期待14境界はすべて成功。追加の独立版・復元境界8件は4成功・4差分。既存の関連13件も成功した。実Chromium 151.0.7922.173、1024x768の通常Appは7群中6成功・1差分、pageerrorは0だった。Vite developmentでの実App・native IndexedDB操作であり、productionや実機の結果とは区別する。

| 差分 | 実際の挙動 | 必要な補修 |
| --- | --- | --- |
| EN01 | 初期stub変数8で保存した経路を再確認すると、初期値2/full_playとexternalMode=nullになる | 初期stub入力の型付き保持・再適用。旧記録で復元不能なら明示開始状態を要求 |
| EN02 | 現稿でrejectedにした名前付き物品個体を版移行inventoryへ持ち越す | instanceId自身の宣言も互換判定 |
| EN03 | 選択した二場面の経路を再確認すると、章全体の三場面へ範囲拡張 | 章選択／明示場面経路の選択単位・集合・順序を保持 |
| EN04 | 個別初期値8の章経路を確認なく通常初期値2へ作り直す | 通常初期状態との差を比較し、明示移行／再作成を要求 |
| UI05 | 入口Aで影響確認後、入口Bへ選択を変えても保存がenabled | 対象開始点をhash固定・表示し、変更時は再確認まで保存停止 |

親から、5原因をその後のworkspaceで補修した通知がある。次固定候補の独立再検査はまだ行っていない。この候補の失敗結果・源・fixture・ログを変更せず保持する。

正常な往復では、移行後のpartial開始値8→新経路9と旧経路3を、原子保存→読み直し→native完全保存復元→cloneで別々に再生できた。人物の取得とUnicode期限はstoreインスタンス再起動→native bytes→clone後も同じ結果になった。actual/mixedの再確認拒否、確認payloadの偽造・revision更新の拒否、旧証跡保持も確認した。

通常操作では、同一ターンの二押しは1保存、保存中の画面移動・再入後は待機を保持、保存後のlatest propsで完了し冷再読込後も試読・旧新再生が一致した。失敗中に移動しても差分を再開でき、再試行後に完了を表示した。確認後の作品revision更新では保存を止めて再確認を要求した。

検査側の非0revisionの空DB投入を専用new importへ変更した記録と、cold reload後のApp描画待ちを追加した初回browser timeout記録を別に保持した。これらを製品不具合数へ含めていない。

詳細は `INDEPENDENT_REVIEW.json`、全源・fixture・raw log・artifact hashは `ARTIFACT_BINDING.json`。原REQ/ATのgiven/when/then/negative_or_edgeは `original-contracts.json` に保持している。製品・repo証拠・コミットの編集は行っていない。104要件全体、RB05全体、116受入、実機・支援技術・実同期・性能・release gateの合格判定はしていない。
