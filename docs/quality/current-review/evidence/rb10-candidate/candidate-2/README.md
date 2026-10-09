# RB10 C2 の実結果（性能未達を保持）

対象 `0c8f6253eb5640d1b75175524aed10dc04c6789c` / tree `845f9d9161cb1e5230e4b6af6852217ae8ea4a0a`、clean build `8f06672a585f03a7c425`、base `/shinariokanri/`。source・dist・生成runtime・fixture・helper hashはbindingと各rawに記録する。

ローカル単体756/756・80ファイル、Python15、schema生成差分なし、文書・計画、production build、Edge生成が成功。network:noneの専用PostgreSQL17.11へ9migrationと模擬Auth/StorageのSQL契約を実行して成功した。実Auth／RLS／private Storageの成功ではない。

GitHub CI `37874756743` は全20工程success。単体756件、production通常画面252件、RB03の3browser×5回帰群と年表／世界smoke、RB04の3browser×12作者別案確認と執筆Chromium4/WebKit4、Python15・文書・計画・buildが成功。CI成功は性能・原116全体・実端末gateの代用ではない。

Standard8,800件・各30回の実App測定では操作、検索、command保存、cache起動、active年表は基準内だが、active関係図の330frames/30gestures p95 **50ms** が33.4ms基準を超えた。C2は性能未達として保持する。C2のLarge30回、Large完全復元、2時間継続編集は未実行。後候補の結果をC2へ付け替えない。
