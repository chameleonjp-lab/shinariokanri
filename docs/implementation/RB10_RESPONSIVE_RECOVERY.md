# 完全復元と全履歴検査の取消・応答

対象は B14/B24/F18/F49/N09/N12/N17/N18/N19/N20、原 AT-B14/AT-B24/AT-F18/AT-F49/AT-N09/AT-N12/AT-N17/AT-N18/AT-N19/AT-N20 の関連補修。元104要件・116受入全句・24工程・6回帰群の完成判定とは別に記録する。

## 起きたことと補修

C24の8,800件・91操作の実完全保存は空環境で原子復元・cold再読込まで一致したが、復元中に長い計算が残った。実ファイルを用いたNode CPU診断では、同一操作の全内容比較、ID検索での配列全走査、復元commit前の全履歴検査が主な計算箇所だった。Node時間はブラウザーの応答時間やp95へ換算しない。

`projectWithRecoveryHistory` の同一操作比較だけに、全JSON構造を検証する呼出内の比較記録を加えた。識別子・理由・Unicode・型・数値・配列順・未知値の拒否は保持する。generic `equalJson`、正本のhash形式、永続schema、既存の完全保存形式は変更しない。65,536比較組で記録を入れ替え、データ上限にはしない。

復元の構造、所有ID、hash、全履歴のintegrity、送信待ち、clone、明示ID対応の計画、統合と履歴の照合を同じ純粋処理のWorkerへ接続した。開始時の作品・世界・対象版・signal・素材読取を捕捉し、取消時にWorkerを終了する。遅れて届いた成功・素材bytesは採用しない。素材読取の既知エラーは元のcode/path/issuesを保つ。

確認後のnative import transactionはC24と同じ内容で、現在revision、送信待ち、世界registry、素材、履歴、復元点と故障注入を原子検査・保存する。Worker結果やcallerの事前ID一覧を信頼して最終検査を省略しない。公開用に独立した段落の所有確認、実衝突の拒否、旧pinとcommand hashを保持する。

全履歴cold読取は編集用のhistory省略検査へ置き換えず、元の構造→世界→hash→integrityの順でWorker検証する。同一操作の二重保存の結果取得はwrite transaction完了後へ移し、同じ取消signalを渡す。既に先行保存が確定した場合、結果取得を取消しても確定済み操作は失わない。

BackupPanelの元ID一覧は非同期検査し、作品と元ファイルが一致する結果だけを用いる。空の検索で全IDへ文字列検索を掛けず、IDのラベルは索引で引く。確認中と原子保存中の案内、中止、入力・失敗・版の再確認は維持する。

## 実結果の範囲

C24 commit `42e8007134425f6b42a397e2e32b7915cc23d029` / tree `821038bda68f7018a0f107f4b7a0d545d60ddefe` の実結果は過去版の証拠として保持する。通常45件（15×Chromium/Firefox/WebKit）、Standard各30回、Large各30回、素材なし・実素材ありの3保存形式計180回が成功した。180回の保存区間p95は最大768.8000000119209ms。空環境の実復元では両ファイルともhistory91・復元した送信待ち91が一致した。C24 CI run38038470536には823単体・309通常画面の新しい実結果がある。C25へ合格を付け替えない。

C25のcaptured dirty source準備では、型検査・関連71検査と実Worker補足3件が成功した。補足は3,200件の同一原稿を通常画面から確認し、実Worker検査中に中止、再試行、cold再読込、実完全保存ファイルを検査する。native全表を取得し、作品・本文・履歴・outbox・素材・下書き等の件数と指紋を厳密比較する。画面設定も全字段を比較し、実クリックで記憶される `workspace.scrollY` だけを独立観測する。初期の全DB一括比較の失敗、全表ごとの指紋、scroll値、raw RAF/timer、実input/output、traceは保持した。補足の2,000ms最大gapはこのfixtureの取消検査であり、Standard30回の200ms／実端末／Large／全受入へ換算しない。

独立レビューは純粋処理・native transactionの同一性、捕捉、取消、late結果、cloneの履歴と現稿の独立、同一保存raceを照合した。review中に見つかったsignal接続と履歴freezeを補修し、旧指摘と新しいsourceを別記録にした。静的読解は実機・実権限の実行結果ではない。

各実入力・失敗・補正・実手順と対象sourceは [証拠](../quality/current-review/evidence/rb10-candidate/candidate-25-responsive-recovery-and-c24-actual-results-1/README.md) に保持する。最終候補commitのclean buildと同じ対象版で、原受入・性能・完全復元・実時間2時間編集を別に検証する。実iPhone/iPad/PCのOS・browser・支援技術、専用Auth/RLS/private Storage、現行quota/費用/接続先の未実行は残す。完成・公開gateは緩和しない。
