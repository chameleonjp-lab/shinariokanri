# 固定した完成候補の検証（完了・公開は保留）

対象製品commitは `6ed5654ca6226061a48651dd317ce1a922c5d07b`、treeは `2e1650180b7769e8a2e59a6a01510c8d64bdac8b`、clean buildは `d0fc32b97242aa86b09f`、baseは `/shinariokanri/`。製品source385・元文書26・配信13・生成runtimeを425ファイルの実bytes/hashで固定した。証拠を届ける文書commitと、実行した製品commitは別に記録する。

これは検証途中の記録であり、元104要件・116受入・24工程・6回帰群の完成判定ではない。設計時点のplanned/not_runと歴史baselineを保持し、部品・CI・Linux通常画面・実機・実権限の結果を区別する。過去候補の成功をこの製品commitへ転記しない。

PR #14〜#17は番号順に競合を解消し、各対象版でCI成功を確認した。mainへの取り込みは利用者側で行われた。本作業からmainへのマージ・本番公開・新規課金・外部DB変更は実行していない。

現在の固定版では、元F58の同じ保存結果集合の図と年表を補修した。原入力SHA `717eb244aa5173d61d277dfe3a1b1b09bfbf2ba85c3ceddc5a14e76e99429ad5` を変えず、原given/when/then/negative_or_edgeと本文・日時への戻り、原子失敗、再試行、取消、cold、完全new/cloneを通常productionで確認した。F06/F07/F08の原条項も同じ固定版で実行した。[4ケース16条項の実結果・入力・手順・ファイル・trace](evidence/rb10-candidate/candidate-15-independent-completed-four-1/SUMMARY.json)へ結合し、[104要件と116ケースの記録](current-implementation.json)に局所結果と残112件を分けた。この4件の実行時private変換cacheは未採取で、当時の実TS入力と配信13ファイルを保持する。後生成JSを実行済みと扱わない。残るケースは継続して判定する。

状態の通常登録F37と元母数4場面/3選択/4条件による経路網羅F17も同じ版で直接確認した。[追加2ケースと実変換cache・全失敗の証拠](evidence/rb10-candidate/candidate-15-independent-state-completed-two-1/SUMMARY.json)を収録し、局所は6ケース24条項、残110ケースに更新した。F17ではcold再生→本文改稿後も旧trace/pinが不変で、再確認待ちへ変わる。元4ケースのcache未採取の制約は維持する。

[CI run 37986799199](https://github.com/chameleonjp-lab/shinariokanri/actions/runs/37986799199)は21工程success、779単体/85ファイル、276 production三engine、元Large解析1件、Python15件、schema/文書/計画/buildを確認した。実checkout `925c73b7df16a01f78d81b28315dad302b8b464c` のtreeは製品候補と一致する。CIの自動buildとローカルclean buildは別に記録した。ブラウザーartifactはmetadataとFile Service参照を取得したが、403でZIP bytesは未取得。実ログ・metadataの確認と、ローカル実ブラウザー・実機の結果を区別する。期限付きURLは収録しない。

Standard8,800件は各30回（図・年表の動作区間各330フレーム）で元8数値基準を満たした。起動2398.5999999940395ms、選択18.30000001192093ms、一覧145.5ms、検索122.90000000596046ms、保存696.8000000119209ms、次期間20.099999994039536ms、年表16.799999999995634ms、図16.80000000000291ms。丸めで境界を合格化していない。保存区間はcommand検査開始から原子commitまでで、500ms入力debounceを含めない。

Large88,003件・実素材72MiBの各30回では、起動p95=8142.899999976ms、検索p95=464.099999994msが元10秒/2秒の基準を満たした。その他のLarge値をStandardの合格へ転用しない。[CI・全数値raw・判定手順・実helper・候補build・実環境用手順](evidence/rb10-candidate/candidate-15-completed-ci-performance-and-manual-preparation-1/SUMMARY.json)に実bytes/hashを収録した。

元三形式保存は、素材なし8800件と追加実素材3×1MiBで各30回の6群を完了し、検査開始→原子commitのp95はいずれも1000ms以下。素材なしではcurrent/coldの91履歴/91送信待ちと、完全ファイルを空390幅環境へ復元した91履歴/1新outbox/91隔離待ちの同content hashを確認した。素材ありの完全復元と、以前失敗した同一91履歴ファイルの独立cloneはまだ完了判定していない。input/click→確認の区間は500ms debounce・IPC/pollingを含む別の値として保持する。

実7200秒とLarge recoveryの初回は、私が複数のLarge準備を並行させた際にブラウザーがクラッシュした。cgroupのOOM0→11、kill0→2を実記録し、fixture準備も7200秒区間も未完了である。[手順/実compiled helper/生成入力/raw/監視記録](evidence/rb10-candidate/candidate-15-large-preparation-failures-1/SUMMARY.json)を保持し、同じfixture・閾値・元手順で一つずつ再実行する。製品の判定は単独再確認まで保留する。

履歴91の完全new/clone、素材付きLarge完全復元・実7200秒・116原ケース・33境界・旧版/更新互換は、それぞれの完了記録と同一対象版・実source/helper/fixture/raw/hashを確認してから判定する。中断、未知、未探索、stub、0/0、部分成功は全体合格にしない。

過去候補は[C12の全4,752実入力と部分結果](evidence/rb10-candidate/candidate-12-independent-partial-history/SUMMARY.json)、[C14の同一91履歴file新規/cold成功と未完clone](evidence/rb10-candidate/candidate-14-original-91-history-new-cold-and-incomplete-clone/SUMMARY.json)に保持した。C14 cloneは監視processが消失して終了理由と結果を観測できず、合格にも製品失敗にも換算しない。C15への旧成功転記は0件。

実iPhone Safari/Chrome、iPad Safari/分割、Windows/macOSの各実ブラウザー版、VoiceOver/NVDA、IME・Files・録音・回転・200%の実操作環境はこのLinux環境にない。専用同期先、5roleの実試験アカウント、private Storage構成、現行quota・費用、確認用HTTPS公開先も未指定である。候補buildと短い実行手順を用意し、実機・実APIだけが必要な確認をnot_runのまま残す。Linux Chromium/Firefox/WebKit、隔離SQL、メモリ同期をその合格へ置き換えない。

公開証拠gateは原条件のまま保留する。[同一製品commitの不完全証拠](release-evidence-incomplete.json)を、HEADが6ed5654の元 scripts/check_release.py へ渡した。RELEASE BLOCKED、149不足であり、commit/base/116ID集合の不一致は0。要件・ケース・実環境の不足を合格へ変更していない。証拠のみの文書commitを製品buildとして再認定しない。
