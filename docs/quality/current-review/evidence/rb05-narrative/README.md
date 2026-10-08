# RB05第4追加の対象版と証拠

元104/116/24/6の契約は保持する。この記録は提示順・未回収・開始版移行・変更後再確認・固定実行文脈と分岐保存ライフサイクルの局所検証であり、全RB05の最終受入ではない。

[candidate-history.json](candidate-history.json)は各source commit/treeに別々の検査結果を結ぶ。旧候補の正常成功を、独立レビューで残った境界の合格へ換算しない。候補1〜8で見つかった範囲・開始時点・stub・章選択・固定例外・call復帰・画面移動中保存の差は、元の正期待とfixtureを残して順に修正した。

現在候補9は `7a40c7c52b5e3e2c8058a41bcc78c0113b9e1a0c` / tree `8362d0c22aa9eb9f5732d976227c9b37930795e5`。[binding](candidate-9/candidate-binding.json)と[source manifest](candidate-9/source-manifest.json)を参照。651単体/保存、54production Chromium153/Linux通常操作、15Pythonとdocs/plan/schema/buildが成功。build-infoに同commit・dirty=false・baseを確認した。独立レビューは別環境・別fixtureによるVite dev実App/native IndexedDBと部品検査であり、production全検査と実機に分類を移さない。

各独立成果物は元のARTIFACT_BINDINGに記録された相対パスで保持し、コピー前にSHA-256を照合した。途中の独立失敗はneeds_fixのまま残す。元レジストリのplanned/not_run、全116受入、実機/支援技術/実Auth/RLS/Storage/全性能/完成対象版は未実行または後続条件として維持する。

候補8の再生待ち再入・次回明示版の2失敗は同じfixture/正期待で補修した。候補9の独立部品12＋通常App12は成功し、元の原資料/旧fixture不変、155srcと77成果物のhashを独立記録に結合した。
