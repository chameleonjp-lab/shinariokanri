2026-10-10の後続C26補修は[全件の冷読込と保存待ちの保護](RB10_BOUNDED_NATIVE_READS.md)。C25の固定439入力によるStandard30回は基準内だが、Large30回の起動p95は10331.40000000596msで元10000msを超え、CI run 38048314501もE2E3件失敗のまま保持する。C26は単一読込transaction・全件・header順・分割検査・hash・全履歴を保持して取得単位を8192件へ変え、保存行と本文・段落のID不一致を拒否し、開始時signalと保存待ちの離脱案内を固定する。準備の既存48検査を含む84/85結果と取消observer設定誤り、訂正後の実query取消1件とsignal差替3件の成功はそれぞれの入力hashで区別する。通常画面の復元ACK・保存順ACKとqueue検査は最終候補で実行する。同一最終commit／buildの性能・原180・空環境復元・実7200・全116受入と、実端末／実権限の条件は未判定であり、全完成・公開は保留する。

2026-10-10の最新の後続補修は[完全復元と全履歴検査の取消・応答](RB10_RESPONSIVE_RECOVERY.md)。最新mainは `16e9a273b06947eb5061be549eea8d66efeda46b`（PR #35取り込み後）で、PR #14〜17は順次のコンフリクト補修後に外部で取り込まれた。C24の同一434入力による通常45件・Standard各30回・Large各30回・元の3保存形式計180回と実ファイルの空環境復元は実結果として保持する。後続C25は全検査・ID所有・hash・全履歴・原子commitを保持して復元中の計算をWorkerへ移す。準備の関連71検査と実Worker取消・再試行・cold再読込・完全保存の3ブラウザー補足検査は成功。初期の追加検査は正常なscroll位置保存を作品データ不変へ含めて失敗し、rawと補正を別に保持した。C25の同一最終commit／buildの全受入・性能・長時間編集と、実機／専用実接続が必要な条件は別判定であり、現時点で全104要件・116受入・24工程の完成を宣言しない。

2026-10-10の最新の後続補修は[全件検証の計算・作者別案検査の保存待ち](RB10_TEXT_VALIDATION.md)。C18のCI run 38021089114は成功し、810単体・306通常画面・Large解析1・作者別案12×3ブラウザー等の実ログを保持する。C18の通常操作42件とStandard各30回は成功したが、Large起動各30回は10548.09999999404ms／10909.699999988079msで元の10000msを超え、両方不合格のまま保持する。後続の独立ブランチで、全件・Unicode・未知項目・固定世界・hash・原子性の検証を残して計算の重複を削減し、最新mainのWebKit作者別案検査の旧callback再利用も補修している。補修した作者別案source component検査は3ブラウザー各12項目成功。Node全件診断は改善を観測したが実Appの性能合格ではない。同じ最終対象commit／buildの通常操作・元の30回／180回・完全復元・116受入全句・実時間2時間編集は、実結果を固定してから判定する。実機・支援技術・専用実Auth／RLS／Storageの未実行をCI成功で合格化しない。

2026-10-10の前段C18補修は[原子保存のJSON処理](RB10_BOUNDED_JSON_ENCODING.md)。固定C17の元8,800件／3保存操作／各30回／素材なし・実素材あり計180回で、一台詞保存p95=1040.2999999821186msが元1000msを超えた。両方の実完全保存→空390→coldはID・本文hash・91全履歴・元pending91・素材bytesが一致したが、性能不合格を解消しない。C18はprivate再帰immutableの小recordだけをpayload32MiB／16,384件に制限してcanonical bytesを再利用し、全検証・原子性・旧形式・上限を維持。新6／全810単体89files、型・build・schema差分なし・文書・計画・Python15と独立staticを成功したdirty準備と、C17のCI804/306・42通常・性能成功/不合格/環境中断を分離して保持する。clean同一対象で正式30回・実復元・実7200秒・原116を別実行し、実機・実権限・公開gateは保留する。

2026-10-10の前段補修は[分割した編集画面で入力・参照位置を保持する](RB10_PAGED_EDITING.md)。辞書の25件制限と全件DOMを検索・ページへ替え、不正入力・切替確認・行ID・旧版参照・全内容検査を保持した。固定版から元のUnicode選択への復帰、10,000絵文字の分割・結合後の停止、根拠を開くと元の関係図へ戻れなくなる問題を実productionで再現して補修。125グループ・人物・公開別名・手動根拠、126派生根拠、129移動根拠を通常操作→原子保存→cold→実完全保存まで確認した。最新製品sourceの全804単体／88ファイル（193.34秒）と、準備build13のLinux3engine各14件／合計42件が成功。初期35単体・27ブラウザーは別入力の履歴として保持する。現在の116原ケースと24工程・6回帰群の準備照合は原文を保持し、実観測待ちを合格へ変更しない。対象commitを固定した性能・Large・実7200秒・復元・実機・実権限・公開gateは別に判定する。

前候補C16 `cfe1491ca9e258613d739c31f8f5c44ab9680900` / tree `5fe8d9f8f25732c00af3f0ab3be65adf29fd5ede` / clean build `d1b910e14888af69d769` は、同じ元8,800件・91履歴の実完全保存ファイルで新規／clone→cold→任意旧版8の復元を成功した。9件の読取観測timeoutは保持し応答性能の合格へ換算しない。同じtreeのCI run `38004855255` は800単体・282production・Large解析・RB04・文書等の21stepが成功し、clean Linux3engineの関連9件も成功。C15のclone停止は旧版の失敗として保持する。最新main `be77ba66a8e9305526dfffddaa15b566cdf08e38` はPR #27までで、親枝へ外部MERGEDされたPR #28〜#30の内容とは区別する。mainへのマージ・本番公開・課金・外部DB変更は本作業から実行していない。以下は各対象版の歴史記録。

2026-10-09の最新差分は[保存済み状態の利用判定と全履歴の複製](RB10_STATE_USAGE_AND_HISTORY_CLONE.md)。C15の独立通常操作で元F39の未使用候補消失と実91履歴のclone停止を再確認し、参照保護・全履歴・hash・原子性・元上限を維持して補修。本文リンクの誤読取、現稿と固定snapshotの共有、固定reuseの利用判定、実SHA待機中の入力変更、ローカルと多重overrideの由来、統合選択のページ保持も正期待の失敗から補修した。最新準備の実Chromiumを含む800単体/88ファイル、型・schema・Python15、関連31件と独立同入力5件が成功。前段階の81/790/799件・3engine9通常画面は対象sourceを分けて保持する。固定候補の実91clone/取消、全116/33/性能/実7200/実端末・実権限は未合格。以下は各時点の歴史記録。

2026-10-09の最新差分は[保存一覧の図と年表](RB10_COLLECTION_VIEWS.md)。元F58の同じ結果集合の図がない失敗を保持し、四表示→同じIDの編集→原子保存→cold/完全new-cloneを補修中。16部品/3production engine/独立元入力1の成功はdirty準備。C14の実91履歴復元は検査側page100拒否を保持し、page60で全metadata/旧版/new/cloneを再実行中。全116/33/性能/実7200/実端末・実権限は未合格。以下は各時点の歴史記録。

2026-10-09の最新差分は[共有履歴の完全復元](RB10_SHARED_HISTORY_RESTORE.md)。C13のCI774/273と元通常保存各30回の成功を保持する一方、91履歴の実完全new復元に文字列上限の製品不具合を再現し、C14で補修中。全履歴・hash・原子性・元上限を維持し、同一最終版の全116/33境界/実7200・実環境はまだ合格にしていない。以下は各時点の歴史記録。

2026-10-09の追加保存差分は[検索表示中の一括保存応答](RB10_CATALOG_SAVE_RESPONSE.md)を参照。C12の元RG-R06 2件保存p95=1249.4ms未達を保持し、最新main cddaee8からC13で再解析を補修中。実7200秒/最終116/実機/実接続は合格にしていない。

2026-10-09の現在作業は[RB10候補の準備と確認条件](RB10_COMPLETION_CANDIDATE.md)を参照。PR #14〜#17の競合を順に解消し、各CI成功を確認した。#17の最終headは `01676a27d1f7bbc03d421c8c64187ef385e86ed4`、CI run `37867912548` が735単体、225 productionブラウザー、RB03/RB04、Python15、文書・計画・buildで成功。PR #18〜#22も利用者側で取り込まれ、最新確認mainは `4bd437153aa29e8ecc3024f139db9fea97a47474` / tree `1822ac96925fa765068a6339c5e828fe24f3e998`（PR #22外部取り込み後）。本作業からmainへのマージ・公開・外部DB変更は行っていない。

RB10は章／執筆／分岐／制作／参照候補の分割、任意診断の実失敗導線、共有指摘→制作タスクの原子保存、同義／反対状態候補、Largeのlossless DB partsと完全ファイル辞書、取消中の入力・原子性とcold読込を接続した。固定C4 `746cc68` のCI run `37880375499` は758単体、255 production画面、RB03/RB04、Python15、文書・計画・buildで成功。Standard各30回の局所値は基準内。Largeの一覧描画は10秒内だったが、実際に入力可能となる時点を要求する補足30回は19回で環境中断、再起動後の診断3回はp95=10,569.3msで未達。異なる測定終点や中断を合格へ換算しない。

C5 `5720bc89410e39cc3ed0de50f2135367f24c47bf` / tree `a2d73e65a2332b1c2d02c8e267f86e6e887078e5` はLarge逆参照を分割・取消・未確認・明示再試行へ接続した。固定Standard各30回は局所8指標が数値内だが、Large入力開始30回p95=10,082.6msで10秒未達。検索459.1ms、88,003記録／history31／pending31／素材72MiBの実bytesが一致。CI run37889230895は761単体・build・文書・計画・Python15成功、production257成功／Firefox新参照テスト全体watchdog超過1失敗、後のRB03/RB04はskip。原結果はcandidate-5へ保持する。

固定C6 `eab9812adfb7eb7e19d7d7c2add2e371ab51b6cb` / tree `8cc78ddae0a579a6063c358e0b58c5695f7d2d8a`、clean build `1dd4d263d6d1d9c056f2` はCI37893273502の763単体・258 production・全20stepが成功。Standard各30回の元8局所値とLarge入力開始30回p95=8,483.2ms／検索462.4msは数値内。ところが後の元Large復元操作で、作品一覧から再選択すると表示専用idが正本に混じり通常保存がschema拒否となった。失敗入力と取消前後の正本は保持。元timeout・診断UI・静的原因・全成功rawをcandidate-6へ分離し、C6を復元／全体合格にしない。

固定C7 `905aad8997bd4218fc3da84bba96687120ebb4dd` / tree `b89ea2600f3b9d5298e6cb0bda227a822ea27f8c` / clean build `4aa7686ea50ba1b3f89e` はCI37898131383の763単体・261 production・全20stepが成功。同じtreeの実checkoutはc1abadd2bbad5757a329595470ae0ef115e3e29d。Standard各30回の局所指標、Largeの実入力開始30回p95=7,997.8ms／検索446.3msは元数値内。元Large復元手順で取消→一覧再選択→通常保存→完全出力→空390幅new/clone→coldと88,003記録・元履歴／送信待ち・素材72MiBの実bytes/hashが一致した。

独立通常8成功／部品53成功後、320pxの関係表で参照経路ラベルが58pxの全体横スクロールを発生する不具合を確認。C7の成功・失敗・原116条項別結果・実artifactをcandidate-7へ封印した。短いStandard60秒は旧タブ名を用いた検査側の停止、実7200秒は未開始。C8は全文の折返しと現行タブ名／App準備待ちを補修。通常graphの元期待を保持して320/200%を追加し、dirty3browserで通過。検査側の絞込み解除忘れの初回rawをworking-relation-wrapへ保持する。元116／全品質gateを同じcleanC8で再検証する。

固定C8 `fd67f0e91ae8b2d63f54d23c78dafbd924ba8a10` / tree `45726131d7f818d07b57aa8a26a9b7293b7cc129` / clean build `f5ddcb3389fa4e046d3c` はCI37905586728の763単体・261 production・全20step成功。同tree checkout486bd21e613f6b7f4c36f16887128eb398a961ffを確認。Standard原8局所指標各30回は数値内だが、Large実入力開始30回p95=10,306.79999999702msで10秒未達（検索504.6ms）。全sample、88,003記録・history/pending31・実素材72MiBのhashと未達をcandidate-8に保持する。C8のLarge復元・実7200秒・原116は未実行。

C9は同じreadonly transactionの全範囲を2048件ずつ読み、編集読込の取消をbatch間でも確認する。全schema/hash/parts/scope/作者順/固定版/欠損拒否、原子性・完全形式・上限を保持。順序だけの試作3回は遅く採用せず、分割読込dirty3回8,285/7,434/7,693msは診断だけ。新2049件の取消/末尾破損/修復を含む全764単体、関係表/一覧回帰3browser6件、実保存失敗とparts取消/再試行/cold3browser6件が成功。cleanC9の正式各30回・Large復元・実7200秒・原116を別に判定する。

固定C9 572c6df/tree1822ac/buildd20dのCI37912747066、外部main4bd4371のCI37918015985は全20step764/261成功。原Standard8指標各30回とLarge実入力開始p95=7675.7ms／検索579.9msは局所数値内。元Large完全保存の取消/再入/2通常保存/空390new・clone/coldは88,003件・履歴/回復待ち・素材72MiBの全bytes/hashが一致した。

独立原AT-N09で7拒否のnative12table不変を確認したが、5種類で対象パスが画面から欠落。C9実7200秒は10:25:36から10:45:48、21編集/試読で中断し未完了として保持。C10はBackupPanelの全10エラー境界でpathと理由を表示し、内部パス不明の読込では選択したファイル名を示す。同じ7破損fixtureの3browser通常・native15binary/下書き不変・clone原子ack/cold再試行と764/81単体がdirty準備で成功。cleanC10の全CI・正式各30回・Large復元・実7200秒・独立原116は別実行する。原文・schema・形式・上限・公開gateは不変。

C7F05の旧全体passed判断は、1章内の場面順変更だけで原『章順変更』が未観測だったため撤回した。原rawは保持し、C9の複数章通常変更/原子失敗/再試行/cold/旧版/new-clone/tick不変を別の観測へ結合する。実OS/IME/Files/録音/VoiceOver/NVDA/専用実Auth・RLS・privateStorage/実accounts/現行quota・費用と公開先の不足を未実行のまま残す。

独立した小fixtureで原AT-N05の取消→資料→試読の結果消失もC9通常productionで再現した。取消結果はunknown/truncated、正本12tableと未保存JSONは不変だったが、結果と保存導線が再入時に失われた。この追加観測は旧C9sealを変更せず別証拠へ保持する。C10は作者・作品別ReaderDraftへ結果/進捗/実行状態と共有取消を保持し、旧作者purge後の遅延書込を防ぐ。改訂後の現稿結果は再確認を明示、選択版が異なっても元対象版を保持する。dirty通常3browser×2ケースと全764/81単体が成功。原Large＋長い分岐・実時間7200秒・最終原116・実機・実APIの不足は別判定のまま。

固定C10 f76d5e9/treee5fc7/build187dのCI37927467219は764/81単体・270production・全20step成功。元Standard各30回とLarge実入力開始8851.90000000596ms/検索489.3999999910593msは局所数値内、元88,003件＋実72MiBの完全new/clone/cold復元も一致した。一方、同じ元Largeに長い分岐を追加した独立N05では初回進捗12498.9ms/取消pointer19653.4msで2秒条件を超えた。実7200秒は未開始、元116全体passed0としてcandidate-10へ封印する。

C11は固定版/世界hash検証と同じ実行器の解析をWorkerへ接続し、時間8ms目安と128状態のyieldをfanout/continueにも接続。準備時間を元30秒に含め、100,000状態/10,000遷移・原子性・ID/形式を維持する。同じ元Large全88,522件/72MiBの取消/unknown/結果保持/不正JSON再開/全27native内容不変、3browser×2通常と全770/82単体がdirty準備で成功。最初のviewStates比較位置差とChromium設定漏れ2件の失敗を保持し、clean最終30回/復元/実7200秒/原116/33境界を別実行する。実機/実権限/専用現行費用の不足と公開gate保留は維持する。

固定C11 2806287/tree85fe/builddde35は全CI21（770/82単体・270production・元Large解析1）、原Standard/Large各30回、元88,003件＋実72MiBの完全new/clone/cold、独立元Large取消・実サーバー停止offlineが局所成功。一方原AT-B01の要約だけの出来事は通常保存で名前必須により拒否された。実7200秒は14:45:13〜14:54:34の9編集/試読で中断、未合格としてcandidate-11へ保存する。

C12は出来事の名前または非空要約を許し、両空/空白、人物名、型/参照/2048CP、原子保存、旧版/ID/完全形式/公開投影を保持する。dirty773/83と3production browserで通常登録・一覧/詳細/検索・native12拒否不変・入力再開・最終入力ID→保存→cold全project/待ち一致→空390new/cloneを確認。fixture/JSON表示/全置換比較位置/Python対象の途中失敗を別保存。cleanCI・正式各30回・復元・元116/33・実7200は別実行、実OS/IME/Files/録音/VoiceOver/NVDA/実AuthRLSprivateStorage/5実accounts/現行quota費用と公開gateは保留。

[104要件の現在照合](../quality/current-review/CURRENT_REQUIREMENTS.md)は原契約と現在の関連source hashを保持する。元116の正常／境界・失敗は未実行を合格へ変えない。実iPhone／iPad／PC各OS・VoiceOver／NVDA・実Auth/RLS/private Storage・専用接続quota／費用は不足しており公開gateを保留する。以下の段階候補・main観察・工程表は各確認時点の歴史的記録として保持する。

RB09局所候補 `af0c2b983f1146cc7977f13d119b8748c867db2f` / tree `134fc3adb342600bebc8dccaa93ff5cec9254c08` は[同期・限定共有](RB09_SYNC_SHARING.md)を通常操作→原子保存→cold→完全new/cloneへ接続。735単体/結合、75 production Chromium153、Python15、schema/build/docs/plan、隔離PostgreSQLの8migration+23模擬RLS契約を確認。独立指摘の遅延許可/期限後解決/復元承認・入力DB原子性・遅延画面intentを補修。専用実接続先/5実アカウント/quota未指定、実Auth/RLS/Storage/二実端末・原116最終は未実行。公開gateは保留してRB10へ継続。

RB08局所候補 `bf0f6b07d4a3f782870ab11894d410936e7e1eff` / tree `10e62dbf528d2290a5d18222216498faaf992908` は[制作・受渡し](RB08_PRODUCTION_HANDOFF.md)を通常操作→原子保存→cold/完全復元へ接続。703単体/結合、68 production Chromium153、Python15、build/docs/plan/schemaと独立対象検査が成功。[5候補の負例](../quality/current-review/evidence/rb08-handoff/candidate-history.json)は不変保持。承認待ちの後続file busy、相談の本文IDと公開位置、有限capabilities、旧版からの受領実行再構成、入力全体のawait前capture、受領hashの固定承認を補修。元116全体・実端末・性能/Large/2時間・実API・release evidenceは未実行、RB09/10へ継続。RB07証拠63ファイルのGit梱包不足をSHA不変で候補3に補完済み。

RB07局所候補 `11cffa7aa3bfbc96c9ee0087ad1e03e797fb1dfc` / tree `343c6a53058fbbf26936bf5e434c42e26a7b1f0e` は[制作運用](RB07_PRODUCTION.md)を通常操作→原子保存→再読込/完全復元へ接続。686単体/保存・61 production Chromium153・Python15・build/docs/plan/schema、独立31部品＋fixture1・実ファイルnew/clone1・App15・production3が成功。[11候補の旧負例](../quality/current-review/evidence/rb07-production/candidate-history.json)を保持し、系統対応/演出/旧話者/再利用/旧世界pin/関係引用/経路条件/await前captureを補修した。原116全体・実端末Files/録音/支援技術/長時間/実APIは未実行、RB08全profile/ゲームは後続。

RB06の局所候補 `d64fd7dc1d14ab228511828ac6e72664dd31fdf7` / tree `07c6a8a8184d496652a24b9e790ee838ecf60058` は[完全保存・履歴・移行](RB06_RECOVERY.md)を通常操作→原子保存→再読込/復元へ接続した。664単体/保存、58 production Chromium153、Python15、build/docs/plan/schemaと独立17部品・11通常App・native移行1・production4が成功。旧負例・保存後の画面/後発ファイル/clear順序の補修を[候補履歴](../quality/current-review/evidence/rb06-recovery/candidate-history.json)へ保持。実OS Files/実端末/更新/長時間/実Authと全116最終受入は未実行。

RB05第4追加は [提示順・未回収・開始版移行・再確認](RB05_NARRATIVE_RECONFIRMATION.md) を参照。提示効果前の観測、体験上の期限、固定checkpointの明示移行、旧証跡を残す改訂稿再確認、固定借用の同一graph/章文脈を通常保存へ接続した。子graphの呼出し/復帰と、作品別の試読・保存待ち・失敗経路を画面移動から保持する。原116受入と公開出力/RB06〜RB10、実端末/実権限の完成条件は保持する。

候補 `7a40c7c52b5e3e2c8058a41bcc78c0113b9e1a0c`（tree `8362d0c22aa9eb9f5732d976227c9b37930795e5`）で単体/保存651件、production Chromium153/Linux通常操作54件、Python15件、文書/計画/schema/buildが成功。build-infoは同候補・dirty=false・base `/shinariokanri/`。独立部品12件＋Vite dev通常App12件は同じ正期待で成功し、再生完了の版表示/明示版選択の再入境界も補修した。途中候補の失敗→補修を[版別記録](../quality/current-review/evidence/rb05-narrative/candidate-history.json)に保持する。最新mainはPR #12取り込み後 `b310800`、CI run37740047138成功を2026-10-08に再確認した。マージ・本番公開・外部DB変更はこの作業で実行していない。

以下の第1〜第3追加の対象版・main観察は、その確認日時の歴史的記録として保持する。

RB05第3追加は [固定再利用](RB05_FIXED_REUSE.md) を参照。固定版の共通元を参照・独立複製・部分上書きで通常保存し、旧pinの状態・本文・開示・例外・経路を再読込／復元／cloneで検査する。独立レビューの追加境界を正期待で補修した。伏線方針・改訂後再確認・状態版引継ぎ・公開出力、RB06〜RB10と116原受入の残条件は保持する。

第3追加の候補 `686f4e9`（tree `434809f`）では608単体／保存、production Chromium44通常操作、独立53部品／保存と8実App操作が成功。build-infoは同候補・dirty=false・base `/shinariokanri/`。[結合記録](../quality/current-review/evidence/rb05-reuse/candidate-binding.json)と[独立レビュー](../quality/current-review/rb05-reuse-review/INDEPENDENT_REVIEW.md)に失敗→補修→同じ正期待の再実行を区別して保存した。最新main `47b70ab` はPR #10取り込み後、CI run37735339752がsuccess。PR #11は作業ブランチへ取り込まれ、main未反映の第2追加も次のmain向けPRへ保持する。この作業からマージ・公開を実行していない。

# 実装進捗（完成版は未公開）

RB05第2追加は [階層・反応系列・型付き途中開始](RB05_STRUCTURE_READING.md) を参照。下位call図を含む階層集計、短い反応の3方式、作品別下書き、固定版付き途中状態の通常フォームを保存・再読込・巻戻へ接続する。未知の経路を回帰確認済みに数える問題とcold start時の履歴token／保存待ち再入を独立レビューで確認し修正した。固定再利用と伏線方針等の残実装、原116受入は保持する。

第2追加の候補 `01d73eb`（tree `b2cfef8`）、[Draft PR #11](https://github.com/chameleonjp-lab/shinariokanri/pull/11) を作成した。587単体／保存、production Chromium42通常操作、独立30部品／保存＋6実App操作が成功。build-infoは同候補・dirty=false・base `/shinariokanri/` を記録する。Draft #10を基底とした追加であり、マージや公開は実行していない。

RB05の追加は [状態・全入口探索の契約](RB05_STATE_EXPLORATION.md) を参照。相互排他・提示前状態・全宣言入口・代替提示・回帰集合・二経路比較を追加し、通常Appの原子拒否→保存→再読込→再生を検査した。階層・固定再利用等の残実装は明示したまま進める。RV01〜RV10補修PR [#9](https://github.com/chameleonjp-lab/shinariokanri/pull/9)は外部で取り込まれ、最新mainは2efd4be、CI run 37722834807がsuccess。この作業からマージは実行していない。検証済みf077c9eとの製品差分はない。RB05や24工程全体の完成とは区別する。

2026-10-08の現在照合は[104要件の照合表](../quality/current-review/CURRENT_REQUIREMENTS.md)と[116原受入を保持した現在記録](../quality/current-review/current-implementation.json)を参照。開始時の最新mainは `3099c9d487fbabe8342ad8c4ee2c8dc4d4156b88`、tree `4fdc292ee4a973fbb6ae5cd8d57710066dabaeb4`、PR #8取り込み後。PR #8はレビュー文書だけで、製品コードはレビュー基準0474856から変わっていない。CI run 37715506253はsuccess。AGENTS.mdはworkspaceとrepoに存在しない。

RV01〜RV10の局所差分と追加の独立境界指摘を補修中。宣言reset・原因・禁止遷移の明示例外・採用状態・固定世界hash・選択版の入口・本文位置参照・保存待ち・設定下書き・暦確認基底・共通提示を通常画面と保存へ接続した。結果の範囲は[補修検証](../quality/current-review/REPAIR_VERIFICATION.md)に記録する。原104要件、24工程、116受入、RB05〜RB10全体の完成を宣言しない。歴史的baselineと段階証拠を保持し、残実装を環境待ちへ付け替えない。

PR #2レビュー後の残作業は[全機能の完成計画](../plan/COMPLETION_PLAN.md)、要件別の不足は[104件の作業カード](../plan/COMPLETION_TASKS.md)を参照。PR #3は計画を追加した基準版であり、以下は実装中の状態を記録する。

対象は計画書の全104要件・24工程。下表は実装中の成果物と残る完了条件であり、工程完了の宣言ではない。最終的な部品・結合検査結果はこの文書へ追記する。要件/受入レジストリの `planned` / `not_run` は設計時点の基準を保持しており、現在の部品試験の結果と同一ではない。

| 工程 | 実装した範囲・現在の作業 | 未完了の主な条件 |
| --- | --- | --- |
| WP01 | 全kindの型、strict schema、整数tick、共通条件評価、固定データ、CI | schema/全参照の結合検証と各画面の同一規則確認 |
| WP02 | 幅別ナビ・一覧/詳細・条件フォーム・保存エラー入力保持 | 全操作とIME・文字拡大・実端末の確認 |
| WP03 | IndexedDB分離tables・原子commit・履歴・補償undo・outbox | 全障害注入・過去形式の移行fixture・再起動と長時間試験 |
| WP04 | 全kindの登録/編集フォームと共通CRUD | 全雛形・メモ変換・型変更と削除影響の受入 |
| WP05 | 日本語検索・typed参照影響・統合preview | 索引/固定・動的一覧・一括変更/統合の全画面結合 |
| WP06 | 巨大/負tick・標準/独自暦・相対日時検査 | 連動日時変更preview・固定日時衝突・年齢/変更影響の全受入 |
| WP07 | 同一出来事IDの年表と人物レーン・一覧代替 | グループ多重参照・重なり・全端末/大規模性能 |
| WP08 | 意味付き関係の表/図・方向/凡例 | 一段/二段・全派生関係の編集還元・実端末 |
| WP09 | 場所/物品/認識/地図等の型とフォーム | 共通世界参照・移動/所有・家系/正体の時期別受入 |
| WP10 | 章/場面本文とID保持・要約/作者メモ分離 | 作者別案・正本/公開版保護・全構成/雛形/ルビの受入 |
| WP11 | 三値AST・型付き状態・原子effect | 算出/禁止遷移/重複発火と全状態UIの結合 |
| WP12 | 分岐/階層・条件・選択/自動/終端の試読基盤 | クエスト/再利用/上書きと全失敗系受入 |
| WP13 | 全状態巻戻・合流差分・抽選・周回・途中開始・不変版への経路保存/再生 | 周回scope/trace/checkpointの全版付き受入 |
| WP14 | 上限付き探索・進捗/取消・証人経路・網羅率 | 回帰経路管理・変更影響・大規模/総合受入 |
| WP15 | 提示順による手掛かり/回収チェック | 人物認識・回収方針/期限・全経路の総合確認 |
| WP16 | manifest/hash ZIP・strict JSON・worker検査・同一作品の復元/統合モード | 作品間mergeの明示ID対応・過去形式移行・全情報/世界/素材/公開版往復の総合受入 |
| WP17 | backend非依存の三方向merge・冪等ack・account境界契約 | 専用接続先・実Auth/RLS/private Storage・依存outbox rebase/実同期 |
| WP18 | allowlist・作者指定公開文/名前・公開ID投影・不変投影 | サーバー権限と素材/API/索引/秘密の実漏れ試験 |
| WP19 | 不変台詞ID・内容hash・原文変更時確認待ち・翻訳/収録フォーム | 分割/統合対応履歴・担当別出力/口調/用語の全受入 |
| WP20 | 非実行text・素材署名検査・安全URL・演出/資料フォーム | 全添付形式・素材版の変更影響・演出timecode受入 |
| WP21 | 制作段階別進捗・固有数/経路数分離・媒体確認待ち | 制作依存/見積/公開媒体差分の総合受入 |
| WP22 | 公開reader/汎用runtime/localization/consultation出力、対応範囲を限定した単体試遊ZIP | 未対応機能解消・別案取込と全互換性受入 |
| WP23 | Chromium/WebKit自動操作試験、決定的性能fixture | 104要件＋12総合、実iPhone/iPad/PC、VoiceOver/NVDA、性能/2時間試験 |
| WP24 | 利用/復元・依存版・公開workflowと証拠gate | 完成対象commit、費用/容量、全ガイド/互換表、公開後検証 |

## 外部条件

同期接続先は未指定。接続済みSupabaseには専用と確認できる `shinariokanri` projectがなく、別用途の `chameleonJP-Lab` projectへ書き込みをしていない。新規projectにはorganization・現行費用の確認が必要で、課金のある変更を自動実行していない。ローカル同期fixtureは実RLSの合格証拠ではない。

この環境には実iPhone/iPad/macOS Safari/VoiceOver/NVDAがない。自動WebKitをSafari実機の合格扱いにしない。公開は計画のWP23/WP24が完了するまで保留する。未実装部分も上表から削除せず、接続先や端末が必要な条件と分けて保持する。

## 部品検証の記録

2026-10-05の作業中ソースで、Vitest 255件、文書/公開gateのPython試験15件が合格した。生成JSON SchemaはAjv2020で実compileし、43kindの型と入れ子条件を検査している。production buildも成功した。これらは116受入ケースの完了結果ではない。

Chromium/WebKit各11件（計22件）のE2Eで、日本語・emojiの保存/再読込、完全ZIP作成と別ブラウザー領域への復元、幅320/390/768/1024/1440px、初期画面のaxe、条件付き選択/巻戻、固定版の経路記録/再生、不正JSONと保存失敗入力の再開保持を確認した。オフライン試験は独立配信サーバーを停止して、キャッシュからの再開/完全保存を検証した。WebKitのネットワーク切断フラグではengine内部エラーが発生したため、応答をmockせず実サーバー停止で確認した。ローカルFirefoxはprofile起動失敗のため未検証。版付きの最終結果はCIのbrowser-evidence artifactで保持する。初期画面のaxe成功を手動支援技術や全画面の合格に広げない。

基準版の保存APIは全履歴のbefore/afterを読み、履歴を含む構造・参照を再検査していた。RB01では変更行保存・内部差分履歴・編集起動時の履歴遅延読込へ変更し、取り込み時の完全検査と復元互換性を維持した。Standard 8,800件・実IndexedDB・production Chromiumの各30回で、保存区間p95は作品名714.2ms、本文577.5ms、複合573.1ms。測定条件・生データ・残条件は[RB01検証記録](../quality/rb01/README.md)を参照。実端末・添付付きLarge・UI全区間・2時間編集の合格は宣言していない。

RB02では型付き通常フォーム、作品別雛形、固定版参照、本文位置への移動、メモ変換、複合検索/保存一覧、日本語索引、一括変更/統合を追加した。作品ごとの未保存入力を保持し、保存待ちの画面移動後に追加入力が失われる競合を修正した。RB02だけを隔離したソースで単体441件（36ファイル）、文書/公開gateのPython試験15件とproduction buildが合格。独立レビューは固定版/統合/連続入力/保存競合を実画面で再現確認した。検索性能と段階ブラウザー結果は[RB02検証記録](../quality/rb02/README.md)に保持する。後続段階、116受入、実端末、実同期、完成版公開の完了とは区別する。

RB03では暦と相対日時の正規解決、日時の差分・承認・取消、重なりを保持する年表、関係表/図、地図、生涯/所属/所有/別名の時期別表示、共通世界の固定版と採用設定を追加した。借用した情報は本編へ複製せず、推移依存と旧版引用を含めて原子保存・完全保存・復元する。読み込みと保存の競合で旧履歴が新しい編集版へ付く問題も修正した。隔離ソースと通常画面の結果、独立レビューの範囲は[RB03検証記録](../quality/rb03/README.md)に記録する。これらの段階検査は116受入・実端末・実同期・完成版公開の合格結果ではない。 PR #6は最終CI（494単体・3ブラウザー96通常画面・9部品スクリプト）の合格後にmainへ取り込み済み。

RB04では作者別案の不変版・選択採用・完全保存/複製、構成の並べ替え・移動・筋からの除外、選んだ固定版での章試読と共有提示処理による記録保存を通常Appへ接続した。未保存の別案入力と本文リンクの固定版・文字位置も保持する。隔離した最終コードで単体541件（52ファイル）が合格した。基幹候補のproduction Chromium36件・実WebKit36件と構成の部品操作各4件、最終UIの保存競合・固定版リンクの厳密な部品検査各12群が合格した。追加の保存待ち・章記録再開を含む最終UIの通常画面4件も各ブラウザーで確認した。独立レビューは44コードhashを照合し、採用時の編集履歴・自動確認依頼・削除・複製・固定版由来別案の初回保存を再検証した。8件の不正な採用入力も原子拒否する。検証範囲と元の問題・修正は[RB04検証記録](../quality/rb04/INTEGRATION.md)に保持する。これらは116受入・実端末・実同期・完成版公開の合格結果ではない。

C7準備版の全763単体／81ファイル、schema生成差分なし、文書・計画・Python15は成功。対象版固定後の各30回・復元・実7200秒・原116を別に実行し、準備成功を最終受入へ換算しない。

C19固定 `01f7cc6d37aa68bcc699becfb7edae15ede5156a` / tree `5a9ba3698432975f6ff89a5af36080f7571fc804` / clean build `0159bde2fbdcb417e29c` は、CI38025297656で814単体・306通常browser等が成功。実checkout4c8c12e7573d0c230ddd92abcb69fc9484691902のtree一致、実artifact11660436837の11,508,130bytes・SHA119d32ff0ca3065ad5a11d02b18b89ed2eb5946d001e2f23738bdff14512f932と475memberのCRCを確認した。固定434入力の局所通常42件／新8ケース×3engineの実入力・完全出力24組と、Standard元8指標各30回は成功。一方、Large88,003件＋72MiBの編集開始p95=10269.799999982119msは元10,000ms超過で不合格、検索p95=885msは元2,000ms内。全30 sampleを保持し、丸め・epsilon・最良run選択で合格にしない。元180保存・旧91履歴file・Large復元・実7200秒・原116全条項はこの版で未実行。

C20準備では同じUnicode検査を非globalのUnicode-mode孤立surrogate判定へ置換し、UTC日時の元構文・実在日の結果だけを512件／64 UTF-16単位以下で再利用する。長fractionは従来の判定を毎回実行し、expiry・権限・record合否・hash・参照・schema・原子保存は省略しない。全Unicode code point位置1,114,112のうち有効scalar1,112,064と孤立surrogate2,048、JSON値・key・path、反復不正値／修正、日時境界／cache退避を含む106局所検査と全816単体／90files、dirty production buildは成功。独立は4filesの静的レビューだけで実行0。C20の固定commit・clean build・各30回・完全復元・長時間・原116・実機／実Authは別に判定する。

C20固定 `c61663e14b931edff96550af244bc50618a12e3c` / tree `6eb0be97b6e7f4a1e88500b48b11a006ad18cc84` / clean build `648343c00d09335598e0` は関連通常42件・実入力/完全出力24組とStandard元8指標各30回に成功。一方、Large88,003件/実素材72MiBは別々の30回で起動p95=10593.5msと13204.90000000596msが元10,000msを超え不合格。検索753.2000000178814ms/886.7000000178814msは元2,000ms内。初回StandardはVite依存link不足で測定前exit1、環境修正後attempt2のみ測定成功。閉じた歴史証拠のtmpfs退避はbytes/hash/mode/旧pathを保持し、FSmtime対応を別ledgerへ保存した。環境変更前後のLarge未達を両方残し、丸め・epsilon・最良回選択で合格にしない。CI38029161542は816単体/90files・306通常browser等の全step成功、実checkout2d229163a1bcbbe48a6130a3ec161c17a6fc5fd3のtree一致と、実ZIP11,645,569bytes/SHA c4c704aaaadbd3e853b191ddf565b8e5762c408c2e011dd84fb654569ae25ad6/全475CRCを照合した。CLI認証401は接続済みGitHub APIによる実取得と分けて保持する。C20独立は型検査/135件収集だけでブラウザー0、初回のfixture宣言収集失敗も保持する。元180保存・旧91履歴file・Large復元・実7200秒・原116全条項・実端末/実Authはこの版の合格としていない。

C21準備は同じ原子read transaction内の有限native rangeを4,096件にし、初回のprivate blockを使用しつつ、合法な公開本文等の再markerは独立コピーする。own enumerable objectだけを最後までfreezeしてからtrusted登録し、cold全件schema/参照/世界/固定hash/完全性検査と外部可変copy境界を維持する。4,097件の末尾までの全件/元順序、4,096境界の取消・再開・別scope/末尾不正、合法な同ID publicTextsの双方向未保存編集独立、旧pin/cache/native/完全出力不変を含む関連57件に成功した。全817件の初回は815成功、Chromium起動2件はsandbox socket権限で開始不可だった。同じ394source/26原文/runtimeで該当exports21件を実ブラウザー起動権限付き再実行し、全21が成功。初回exit1は残し、817件の期待結果を別dispositionで照合した。これらはdirty準備sourceの検査であり、clean固定候補の通常操作/性能/復元/長時間/原116の合格を先取りしない。独立ownershipレビューは実差分2filesを含む静的9filesだけ、独立実行0。

C21の後続独立レビューで、同IDかつ異本文の公開コピーがcold原稿へ混ざる別の不具合を実再現した。修正前は正期待で失敗した記録を保持する。modelの元除外4キーと同じ純粋判定を保存抽出へ適用し、コピー値を正本段落表へ展開しない。旧markerの独立読込と公開側だけの再保存、原稿blocks全行／旧pin不変、実完全fileの空環境new/cloneを検査した。修正後のfresh全単体818件/90filesは07:26:23Zにexit0で成功し、捕捉394source/26原文/runtimeは不変だった。終了後に非実行E2Eだけを末尾追記へ補正し、段落IDを保つ通常操作の期待を契約へ合わせた。旧新harness SHAを別に保持し、全394最終入力一致と主張しない。runtime実生成SHAは4fa9616f34244bf8572251a78979aa8b4b5ddbbc348cfe33f7f8725575e7ce9c。これらはdirty準備結果で、clean固定候補の型／通常画面／各30回／復元／実7200秒／原116／実機／実Authは別判定する。既に旧不具合で上書きされた本文の自動復旧は証明していない。

C21固定 `69b72504e0a02ef362491c84a78a99a501b0ada2` / tree `b6eb34654674360fb53069fdbcbd9df6ee49875d` / clean build `eeb0a4c78792e52af91d` の関連通常画面では、Chromium14件成功後、同ID公開本文の完全ファイル取込でID検査が二重所有と誤判定し、確認操作が停止した。正期待の通常画面はtimeoutで不合格。Firefox7件は製品を開く前のpage fixtureでtimeoutし、1件は自分のrunner停止でinterrupted、7件とWebKit15件は未実行。owned runnerのexit130、全trace・実入力ファイル・旧固定434入力を保持する。Firefoxは空ページの別診断でproc名前空間制約を確認し、このLinux環境だけの明示renderer設定による補正を別記録とした。実機・stock OSの安全性検証へ換算しない。

C22準備は完全取込のID走査でも元のコピー4キーを識別し、走査終了時の固定した正本集合にコピーIDを結ぶ。独立公開段落・public ID・生成物品IDと全参照を落とさず、真の所有者／別種別衝突と不足した明示対応を拒否する。正期待の修正前1件失敗、修正後の関連18件成功、実ファイルの明示対応統合→再出力→空環境new→cold復元と、確定前失敗時の既存作品不変を保持する。fresh全単体823件/90filesは07:55:08Zにexit0で成功し、捕捉394source/26原文/runtimeは不変。production build、schema生成、文書・計画、Python15件も成功した。独立レビューは静的確認だけで実行0。これはdirty準備証拠であり、C22のclean固定、同一版の通常画面・元の性能条件・完全復元・実7200秒・原116・実機／実Authの合格を先取りしない。

C22固定 `1ad5f33cda3842577161c824ab4bee913ce5ede0` / tree `5fc6298721a5eb067c1729f39473baa849a29ec6` / clean build `55b2b6577d678630df56` の関連通常45件は42件成功・3件失敗だった。公開本文の追加検査が、実フォームの「メモ」を「本文」で指定していたため3engineとも本文編集前に止まった。全trace・27入力・成功した24実download・固定434入力を保持する。C21の取込IDによる製品停止と、この検査手順の誤指定は別原因である。取込後にAppへ進んだ事実だけで新ケースの保存／new／clone成功とはしない。

C23準備は上記のnote.body操作先4箇所だけを「メモ」に補正した。場面の「本文」、fixture、期待値、全ID／旧pin／公開本文の比較、保存／cold／new／cloneの操作、時間制限、再試行数は不変。製品・単体の入力はC22で823件が実成功したものと同じであり、全394入力のうちVitest対象外のE2E1ファイルだけが異なることを旧新SHAで記録する。C22の42成功と3失敗を新候補へ移さず、C23のclean通常画面・元の数値条件・復元・実7200秒・原116・実機／実Authを別に判定する。

C23固定 `06000403915513f48f38646f64377eef61498cc6` / tree `5dae43344af9809e69df1809286903c7114e11ff` / clean build `3c164d432421b2f79dce` の通常45件は43成功・2timeout。3engineの27実入力／初回完全出力と、Chromiumの追加new／clone実出力2組を保持する。Firefox／WebKitの新ケースは初回保存・実出力から空390幅への取込まで進んだが、cold再読込直後の未mount状態で検査helperがメニューの有無を一度だけ判定し、閉じたサイドバーの操作で止まった。独立はAppのloading-screenと390幅のサイドバー規則を静的確認した。対象434入力・全trace・未観測の後半を保持し、45件全体の合格としない。

C24準備はnavigateの冒頭に既存AppShellの表示待ちを1行追加する。未表示なら元の制限内で失敗する。本文の期待、fixture、保存・cold・実file・new／clone・ID／旧pin比較、30秒の全体上限とretriesは不変。製品・単体入力はC22のactual823成功と同じで、Vitest対象外のE2Eだけの変更を旧新SHAで記録する。clean最終版の全通常45件・元の数値条件・復元・実7200秒・原116・実機／実Authを別に検証する。
