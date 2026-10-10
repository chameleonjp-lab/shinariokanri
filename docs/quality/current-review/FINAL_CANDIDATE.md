# 最新の固定候補と完成判定の保留

製品候補C29は `09d39faae9c7293fe77b5675cc7286605a1809a6`、tree `352863bf81bd56b3c563f76e6b7586fe5f471e24`、clean build `b59572f71d050cd96e0f`、base `/shinariokanri/`。401source・原資料26・dist13・runtimeの441入力を[実bytes/hash](TESTED_PRODUCT_BINDING.json)で固定した。証拠を届ける文書commitと、実行した製品commitを分ける。

[PR #36](https://github.com/chameleonjp-lab/shinariokanri/pull/36)は保存版反映・復元確定を待つ元検査を補修し、head `ef72dab56cc86f2f62824561e74884fafd054ed0` の[CI38053539901](https://github.com/chameleonjp-lab/shinariokanri/actions/runs/38053539901)が全success（861単体・312通常画面・Large/RB03/RB04等）、元2file×3engineのローカル30件も成功。利用者側で取り込まれた最新main `6a725b95de3b778aa589b82f0ee3815c32830fba` を自分の[Draft PR #37](https://github.com/chameleonjp-lab/shinariokanri/pull/37)へ結合した。この作業からmainへのマージは実行していない。

#37は単一transaction・全件・作者順・本文parts・固定世界・hash・全履歴を保持した8192件の読込境界、索引ID/kind検証、開始時signal/表示方式、enqueue時から全保存待ちの離脱案内を補修した。遅れて保存カーソル・参照先位置が届くと全選択が崩れて置換が追記になる不具合は、旧版の正期待検査で再現し、新しいfocus・選択・入力を優先するよう修正した。

C29同一固定版のschema生成・production build・文書/計画・Python15、全876単体/93fileが実行成功。元AT-B01、元参照位置/戻る2件、追加正期待カーソル競合1件、3200件Worker取消/再試行1件×3Linux engineの通常画面15件も成功。native12表の原子拒否・入力再開・訂正後cold/完全file/段落IDを含む。各前後の入力hash・HEAD/tree/cleanを実照合し、[JSON](current-implementation.json)のverificationへ直接判定を記録した。

C29で変更したWorker復元の実効的なpreview待ちは、旧implicit expect5000msから元ケース全体30秒の残り予算へ変わる。元3200fixture、native全表不変、取消2000ms、cold、実完全file、全3200本文一致、retry0と原ケース全体上限は保持する。この補足検査の同期変更と成功を、元N05全体・再試行中の応答や保存性能の合格へ換算しない。独立静的レビューにblocking指摘はない。

関連81通常画面は80成功/1WebKit失敗で完了。原稿/別公開本文のnew→cloneケースは元全体30秒へclone確認check中で達し、clone確定click・clone exportは未観測だった。元30秒/retry0/fixture/期待値を変えない単独WebKitの同じ1件は22.7秒で成功。両結果を保ち、原因未確定のまま失敗を成功へ置き換えない。

fresh型＋4 entry一覧は6 commands成功、132 normal＋3 componentと33 boundary＋2 Large/pointer定義・73helpers・生成146mapsの入力一致を確認したが、受入条項の観測は0。

[C29 CI38060502013](https://github.com/chameleonjp-lab/shinariokanri/actions/runs/38060502013)は全success（876単体/93files、318通常画面、Large解析1、RB03/RB04等）。実合成checkout `084fd2adc95d12a4c4350b2f605554b542e9fbc6` のtreeはC29と一致する。実joblog SHA256 `a374135db21e1f417545494bd8f33453534d22b9725a4304fd76df26cd6c5a34` と17,952,487byteの実CI証拠ZIP SHA256 `8d6633660917d293081efa85c0842d928fe4a5ec5900b94c69a5a12ad8ba76e4` を保持し、全634ファイルのCRC/安全path/hashを照合。CI artifactにdist/generated runtimeはないため、それらの実bytes一致は未確認。

Standard8,800各30回は元数値基準内：raw p95キャッシュ起動1891.699999988079ms、選択28.80000001192093ms/切替82.09999999403954ms、検索51.400000005960464ms、原子保存425.90000000596046ms（500ms debounce除外）、期間移動24.700000017881393ms、図/年表16.80000000000291ms。Linux局所値で実端末成功へ換算しない。

素材付きLarge30も元数値基準内：raw p95起動9331.700000017881ms≤10000ms、検索942.2999999821186ms≤2000ms。全30サンプル・実起点・原上限を保持し、丸め/epsilon/最良run選択で合格化していない。実素材72MiBと88,003recordsの元fixtureを使用。これはLinux局所性能の判定で、Large復元・2秒以上の進捗/取消・実7200・実端末性能とは別。

元3保存形式×30回×素材あり/なしの180回も同じC29で実行完了。6群の保存区間raw p95は238.09999999403954〜528.2000000178814ms≤1000ms。通常画面から作成した両完全ファイルを空環境390幅へ復元し、cold後の8800/8803記録・91履歴・同一本文hash・実素材3MiB・recoveredPending91と別local import outbox1を確認した。保存区間は検査開始→原子commitでdebounce除外。別UI区間は最大p951294.7999999821186msを含め全値保持し、操作200msや保存1000msの測定へ転用しない。

以前の実91履歴ファイルもbytes/hashを変えず同C29の空環境390で通常new/clone→coldを実行成功。newは91履歴、cloneは複製操作を含む92履歴、全8800記録/台詞UnicodeとID対応/関係ID/暦/本編開始/recoveredPending91/local import1を検査した。native historyPage/historyCommandで旧版8のbefore/after作品名と全8800記録を解決し、cold後も同じ内容だった。これは旧版のUI選択/復元の観測とは別である。

同じC29のLarge88,003記録/実72MiBでも、cold読込の取消→再試行、通常保存2回、完全保存の取消→再試行、空環境390の通常new/clone→coldを実行成功。取消前後の全保存画像は不変、newはrevision/history3、cloneは複製操作込みrevision/history4、いずれも全記録・3素材bytes/hash・recoveredPending3/local import1を照合した。実完全file2,501,943bytes/SHA256 b41c8346782728f899f4f4e2b64e46cdda9499fe7f5d92cbf6fdaf981e9dc876を保持する。実7200秒・独立116/464原条件は別検証であり、まだ完了を認定しない。

独立の元11寸法×上限直前/上限/超過33件＋元固定Large functional1＋pointer1が同じC29で実行成功した。33件は22正常復元→coldと11超過拒否→native12表不変を実入力hashと照合した。固定Largeは88,522記録/実72MiB/256遷移の元1ca2ファイル、取消/画面移動/未完入力再開とnative27表不変を確認。初回進捗303.7ms、最大timer324.4ms、pointer取消可視frame277.5ms≤2000msだった。総合seal SHA256 `8045b5d3df326ccc15d5ec39567d00c67acad3093cfcb7da5fb6f2e9978daaf4`は1,282,822,185論理bytesを再照合し不一致0。records+1は具体的拒否文の厳密oracleへ最小訂正し、同じ入力でnative不変まで再検査した。旧oracle/選択/guard/closure準備失敗と5stdout封印後追記の訂正を保持し、失敗を成功へ書換えていない。whole原116/464、実機/実権限/実7200の完成とは別である。

旧C28 `5061b5e5` はCI876/318/Large/RB03/RB04全success、別ローカル81は80成功/Firefox1失敗、変更なしWorker診断は1成功/FF・WebKit2失敗。追加観測profileは元5秒でFF/WK2件成功したが失敗後完了の観測はなく、失敗原因を確定しない。旧C26のCI876/315成功・ローカル81の78成功/3失敗、カーソルの正期待旧版再現失敗、検査準備のID/getter/metadata失敗も保全する。C25 Large起動p95 `10331.40000000596ms > 10000ms` の未達も保持。過去版の実結果をC29へ付け替えない。

閉鎖した通常11シナリオの原句追加レビューsealはSHA256 `d066f62281bd65c4d0b847a3de01afaa18bf06515ce74961b998b03c4c94a0fb`。原44節のうちtrue22節/partial22節を記録し、B19の必須・任意・代替・続編持越しと理解を自動認定しない元4節だけを局所wholeへ追加した。その他は対象人物改名・回収本体の参照・最初から最後への移動・資料取得位置の通常登録・確認者ID・企画各種の結合・世界改訂の作成操作・実機/実権限の不足を個別に保持する。

C29のREQ-F36には既知差分を確認した。domainの相談出力は前後状態を扱うが、通常のExportPanelはその指定を渡せず、実MDでは「前後の状態は未指定」となる。元given/shallを満たした完成として扱わない。独立seal SHA256 `0b3a67c37633262a5e7dcdc2f72d50d6a843648a02137b098bca27fcc89bafb8`。後続の別ブランチで対象・前後状態・版/公開範囲ごとの下書きと確認を補修中であり、C29の製品hashや受入結果へ混ぜない。

C29の通常本文フォームでは候補除外ボタンが表示されない。選んだ人物への2つのUnicodeリンクは保存できたが、一般語除外の操作で元240000ms timeoutした。既存のaccount/project/source別除外保存は存在し、optional callbackを必須とする表示条件が通常導線を遮断している。リンク保存と除外未成立を区別し、別ブランチで表示条件を補修して同fixtureの除外/cold/逆参照/完全new-cloneを再検査する。 独立seal SHA256 `8025971f627957f1d79798103f7f5273939f74158b318b5d82ce0805445508bf`。

別の113履歴診断も20:35:31.102152 UTC/exit1で閉鎖した。通常112編集後の現画像88003記録・全素材72MiB hash・履歴113/送信待ち113を確認したが、完全保存downloadは元600000msを超過した。実画面は「保存した操作を照合113/113」の後「内容と履歴を検査0/1」のままで、alertは未観測。raw SHA256 `e243fc3652fb6a24003d8fe7d7824e8e455bb73c89bba612d2f54da387414525`、最終PNG/進捗/元helperと441入力/HEAD/tree不変を保持する。完全ファイル・空環境最終復元・2時間受入の成功へ換算しない。履歴と送信待ちの再展開・検証の反復が調査対象であり、単独の原因や修正合格は未確定。

閉鎖remaining-5の原12ケースを4節ずつ独立照合した。10ケース40節とB04/F04の各3節、計46節をAT ID/原句で重複排除して追加。B04の自然な編集欄scrollとF04の場面4理由の詳細は未確認のまま。seal SHA256 `7733bbd7b4ab538ae0d634c01a85e5d549fea704a484a50283432264dd03272d`。監査自体の新runtimeは0で、閉鎖した実App/原子保存/cold/実完全bytesを照合した。全104/116/24/6の完成判定は変えない。

閉鎖remaining-5の分岐8題とremaining-8/9の9題を原句で独立照合し、F16/F17/F20/F40/F35の5局所wholeと計46直接句を追加した。同occurrenceId再送の通常UI、旧checkpoint実選択、未定義使用、素材だけ差替の依存コマ、暦単位/開始/日付/周期の連続操作、同fixtureの逆順二提案、実端末/実権限等の未観測は残す。seal SHA256 `d7ea1dcd803ed090b25f9caf7878d7278fe502324a450c78d4ede3b6ae54465f` と `8f8292db4b8f498f5cbe113ea8350aa654523152d4b852ed13cad35af635cb98`。監査の新runtime0、原104/116/24/6の最終結果は未実行のまま。

B04/F04/B11/F47の不足句を同じC29の別の閉鎖通常操作で補い、旧B04/F04の6直接句を重複計上せず10句・4局所wholeを追加した。複数実行のfixture/時刻/ID/実ファイルと元失敗を各出所で保持し、単一連続実行へ付け替えない。独立combinedレビューseal SHA256 `a0ddd2b0b1816b1103b4456f7d2a1d53f4f5f06435341b05e36005a7da624d7f`。原104/116/24/6の最終判定は未実行のまま。F41の要件全体に関する局所補助も別記録に保ち、原句の加算は0。

現在の原句照合は原28ケース112節の局所whole成立（B02/B03/B04/B05/B06/B07/B08/B09/B11/B12/B13/B14/B15/B17/B18/B19/B20/B21・F03/F04/F16/F17/F20/F35/F39/F40/F41/F47）と、他の部分ケースで直接確認した54節の計166節。F39は原要件全文の読取・更新・初期化・原因一覧・未使用候補を同じ実操作/固定原因/保存/復元へ独立照合済みで、要件全体の最終gateは保留する。F41は原AT4節の局所成立と、別の閉鎖操作で確認した相互排他の通常登録・明示例外・原子拒否を含む要件全文の局所補助を区別する。B11の新しい関連付け保存とF47の各finding分類は追加操作で独立照合済みである。原句の追加と要件全体の最終gateは別に保持する。

小規模通常の閉鎖した第1残り実行は15成功/22失敗/12時間切れ/1取消/74未実行、第4実行は12成功/11失敗/2時間切れ/1取消/83未実行。元の実入力・trace・終了code・441入力/73helper・封印を保持し、不正な肯定fixtureや古い私有selector/ACK待ちの手順を訂正した別実行で再確認する。部品成功や手順訂正から全ケース成功を推定しない。第4loopは17:46:47.670〜19:47:53.593 UTCの実7265.923秒、112編集・112保存画像/素材bytes照合・22オフラインcoldを実行した。その後の最終完全保存downloadは元600000msでtimeoutし、processは19:57:55.482609 UTC/exit1で閉鎖した。完全ファイルは未観測、最終空環境復元は未実行であり、N04/E11/回帰群の完成へ換算しない。raw SHA256 `5f3ab04a71bf25bb254aabea542f7e28953b0d39adb5ebbb6435e87490e13c94`、441入力/HEAD/tree不変を保持した。実helperが最終画面/alert/progressを捕捉していないため原因は未確定。別の113履歴の短い診断で保存進捗・画面・具体的拒否を確認し、2時間の成功へ転用しない。

C29の接続したコードでは、通常再利用はresolveReuseContentを通り、通常出力/限定公開はexecutionExportViewから公開投影する。古い未解決reuseの拒否文言は単独で現行未対応の証拠にしない。これは6ファイルhashを持つ静的確認であり、通常操作・固定旧版・cold/復元・実APIの合格へ換算しない。

[104要件照合](CURRENT_REQUIREMENTS.md)と[116原ケース/464句](current-implementation.json)は原文・設計planned/not_run・歴史baselineを維持する。全完成判定は同一対象版の通常操作→原子保存→cold→参照/旧版/復元と原negative/境界の直接結果で行う。未知、未実行、stub、0/0、部品成功は完成にしない。

[候補ZIPと取得manifest](evidence/rb10-candidate/candidate-29-physical-review-package-1/README.md)を文書ブランチへ実bytesのまま収録し、22 memberのCRCと13配信byte/hashを再照合した。配信先/HTTPSでの実確認と実端末合格は未実行である。

[実端末・Files・専用同期の短い手順](../../implementation/C29_MANUAL_REVIEW.md)、同じ13配信bytesと実LICENSE/NOTICEを含む22memberの候補ZIPを用意した（SHA256 `590748c12808f0e8a49d315aa3deddfc52e2f08e6c617a4d9fd1f26c64b0e0ab`）。実iPhone/iPad/PC Safari/Edge等、VoiceOver/NVDA、IME/Files/録音/回転/200%・実Auth/RLS/private Storage、専用HTTPS確認先/5role試験アカウント/region/管理者/tier/quota/現行費用は未確認または未指定。Linuxブラウザー・隔離SQL・メモリ同期をその合格へ流用しない。

原release evidence gateを変更せず、C29製品HEADから同じ対象版の[evidence](release-evidence-incomplete.json)を渡した実判定はexit1、116原受入＋24工程＋9gateの149保留、版/基底不一致0。完成・公開は保留。PR #14〜#17は番号順の競合補修・CI成功後、利用者側で取り込まれた。本番公開・新規課金・外部DB変更は実行していない。[更新前のC28文書原bytes](historical/pre-c29-view-snapshot-1/CAPTURE.json)も保持する。

旧DB移行失敗後の通常再試行に、C29の追加挙動差を実確認した。元native version10・保存内容は拒否後も不変だが、通常retryは0作品と同じエラーに留まった。独立readonly seal SHA256 `fd877beae74152f8a33a3a75c47988c1c37383c7c055bfffbdd760337d033fbf`。別候補 `5ab86a27f15bdf5205ea0fc711544e6eb7445d24` で再試行・取消・旧結果抑止を補修し検証中。後の成功をC29や旧アプリ更新の合格へ付け替えない。

後続[Draft候補の別対象検証](FOLLOW_UP_CANDIDATES.md)はC29の結果へ付け替えない。原116の未確認には実機・実接続だけでなく、Linux通常操作で追加観測できる条件も残る。
