# RB10 完成候補の準備と確認条件

RB05〜RB09の原子保存、固定世界、経路、作者別案、全履歴、完全ファイル、担当別出力、受領、限定共有を保持する。104要件・24工程・116受入・6回帰群の原文は変更しない。部品・通常画面・実端末・実APIを別々に判定する。

## 通常操作と入力

章・場面・執筆・分岐・制作・参照・試読・共有編集の一覧は検索とページで末尾へ移動できる。選択と作品別表示位置、既存の図・年表の分割表示を保持する。状態の同義語・反対語候補は同じ対象・scopeの既存定義を示す。存命／死亡と未知を区別し、没を有効候補に混ぜず、自動統合・代入しない。

限定共有の作者画面で指摘を取得し、元版・公開引用・Unicode位置を確認して指摘と制作タスクを原子保存する。修正済みを保存した後に確認済みへ進む。現稿の改訂・段落削除後は現在位置が不明になり、元の固定版は開ける。元版・出所・引用は不変。共有側への反映は明示操作。旧resolved=trueは修正済みへ移行し、確認済みを推定しない。

保存中の取消はその操作を取り消し、入力と後続操作を保持する。commit前の取消・容量不足・競合で正本・履歴・送信待ち・素材を変更しない。保存失敗入力を作品／基底revision別に再開し、明示再試行できる。大規模cold読込、完全ファイルの作成・検査はworkerで処理し、進捗と取消を表示する。

## 保存形式と復元

ローカルDBv7は大きな履歴・送信待ち等をSHA256付き8MiB以下のrecordPartsへ分割する。実索引値を保持したmarkerと全partsの追加・置換・削除を同じIndexedDBトランザクションで確定する。読取APIは元の完全な値を返す。旧DB行はそのまま読める。未知codec・欠損・hash不一致は安全に停止する。素材bytesは別tableに保持する。

完全ファイルのshared-records-v1は同一記録と順序付き配列の辞書を用いる。全履歴の変更前後、同じIDの異なる案・版、送信待ち、公開snapshot、固定世界の推移依存、作者別案、素材bytesを保持する。共有指摘を含むファイルはshared-review-source-v1を宣言し、cloneのprivate ID対応と外部public ID保持を分ける。未知featureは旧readerが拒否する。専用ファイルの安全上限は引き上げず、metadata-onlyを完全復元扱いにしない。

## 任意診断と専用接続

実保存・読込・同期・認証・画面エラーからコード、操作ID、対象版、build commit/tree/base、ブラウザー／OS数値版、画面幅、online状態だけを記録する。本人が確認してファイルへ持出せる。本文・stack・個人情報・認証情報・remoteエラー文を既定診断へ含めず自動送信しない。account切替で消去する。

限定編集DBv2を維持し、9個目のSQL migrationで共有指摘lifecycleを準備する。service-onlyの元版対応表をordinary roleへ公開せず、role/session/期限をtransaction時点で再検証する。既存接続へ自動適用しない。実Auth/RLS/private Storageには専用URL、owner/editor/reviewer/reader/nonmemberの5実試験account、private bucket、許容fixture容量、利用tier、現行quota／費用が必要。

## 同一候補の検証

`npm test`、`npm run build`、`npm run schema:generate`、文書・計画・Python、production画面、隔離SQL契約を同一固定sourceで実行する。`scripts/measure-app.mjs`は実App・実IndexedDBを使い、Standard8,800件とLarge88,003件＋72MiB素材のfixture hash、全sample、測定起点、source/build/artifact hashを記録する。Standard各30回p95、Large検索／初回表示、2時間継続編集、新規・clone復元を別に実行する。保存区間はcommand開始からcommitまでで500ms入力待ちを含めない。

Linux自動Chromium／Firefox／WebKit、320/390/768/1024/1440幅、キーボード、文字拡大、offline、cache、更新、直リンクは自動ブラウザー証拠。実iPhone Safari／Chrome、iPad Safari／分割、PC各OS・実版、回転、IME、Files、録音、VoiceOver／NVDA、ドラッグ代替へ流用しない。

公開は保留する。116ケース、24工程、9品質gateに同一完成版の実証拠がそろうまで`check_release.py`を緩めない。local成功だけで実機・支援技術・実同期／権限・専用接続費用を合格扱いにしない。

## C1 の失敗と次候補の補修

固定C1 `71159f2` の原結果は `docs/quality/current-review/evidence/rb10-candidate/candidate-1/` に保持する。CI単体754件と文書／計画／Python／buildは成功したが、E2Eは開始点selectと検索欄のlabelが一致した3件で失敗。元の操作・期待値を保ち、selectをexact comboboxで指定する。

Standard各30回の局所p95は基準内。Large検索は基準内だがcold local初回表示30回p95は12,390.7msで未達。次候補では一覧取得でheader全体を先にdecodeせず主キーを取得し、同一read transactionで取得済みのprivate headerを再利用する。cold成立検査は同じUnicode・有限数・循環・JSON不可値の拒否規則を保ち、使用しないcanonical文字列の構築を省く。全構造・ID・参照・固定世界・snapshot hash・復元検査は保持する。

dirty予備測定3回の成功は最終30回の代用にしない。次候補のclean commit／tree／buildを固定し、全CI、各30回、Large完全復元と2時間の実継続編集を再実行する。

固定C2 `0c8f625` の全単体756件とCI（通常画面252件、RB03/RB04を含む）は成功した。原結果は `evidence/rb10-candidate/candidate-2/` に保持する。Standard30回のactive関係図p95が50msで33.4ms基準を超えたため、C2も性能未達。Largeの最終確認をC2へ流用しない。

次候補では関係図の変わらない線・項目をmemo化し、全ノードの既定座標はgraph更新時に計算して移動中は表示中の点だけを読む。layoutのcallbackと切替時fallbackは作品／作者／端末scope別に保持する。条件・採用状態・意味・参照・未知・ページの規則は同じ。実ドラッグ、矢印キー、座標入力、移動ボタン、線端点、390/1440配置、関係の原子保存、cold再読込、完全ファイルで一致を確認する。

PR #18 は外部操作で `2026-10-09T02:52:19Z` にmain `c590b47`（C2と同一tree）へ取り込まれた。次候補はこの最新mainから `feat/rb10-graph-performance` にまとめる。C2のCI成功と図の性能未達を分け、mainへ入ったことを完成判定に置き換えない。

固定C3 `e4987df` / tree `7d92a7e` のCI run 37878165457は756単体・255通常画面と全検査が成功。Standard30回の原局所8指標は基準内、active図p95=16.734ms。一方Large初回表示30回p95=11,094.5msで10秒未達。検索p95=692.9msは2秒内。原結果と遅いsampleを `evidence/rb10-candidate/candidate-3/` へ保持する。初回1回やdirty3回を代用しない。

次候補C4ではrich-text検査schema、同種record schemaとTextEncoderの再生成を減らし、Unicodeコードポイントを配列なしで数える。公開schemaが置換された場合はcacheを更新し、可変fieldsも毎回読む。cold読取は本文markerの祖先だけをcopy-on-changeで複製し、入力行・block・固定snapshotを変更しない。条件・未知・参照・世界・全hash・ID・上限の検査は保持。原2048コードポイント・UTF-8 1MiB・不正surrogate・ruby位置、cold draftとraw行SHA不変、完全fileを確認する。予備3回p95=7,367.1msは診断のみで最終30回に換算しない。追加fixtureの上限誤記と型エラー、修正前後の結果は `working-cold-read/` に残す。照合JSONの更新は最初にoriginal_requirement.idの参照を誤り中断し、コード/証拠のcommit b2806b2には最新照合が入らなかった。原文不変と全source SHAを確認して補正後にC4対象版を固定する。

## C4の測定終点とC5の入力開始補修

PR #19は外部操作で2026-10-09T04:08:16Zにmain `ff69ac1304554b4ccd5705e6e23ab280abbfcf63` / tree `f476ea0723d8f309833db7e7c56658a1d39cb14d`へ取り込まれた。固定C4 `746cc68` と同一tree。CI run 37880375499は758単体・255 production画面・RB03/RB04・Python15・全20stepが成功した。原結果とsource/build/hashを `evidence/rb10-candidate/candidate-4/` に保持する。

C4 Standard各30回の局所値は基準内。Large検索p95=470.8ms、一覧描画起動p95=7,642.7msも局所の数値基準内。ただし既存起動probeの終点は最初の一覧cardとrAFで、入力可能の確認がない。別の補足probeは最初の実cardから対象名の入力欄を開き、enabled・readOnly=false・inertなし・CSS祖先の表示/opacity・画面内交差・focus・次frameを確認する。入力/変更イベントや正本保存は行わず、前後内容hash・履歴・待ち件数・素材bytesを照合する。

補足v1のLarge30回p95=9,515.1msは弱い可視性確認の値として保持。強いCSS終点のStandard30回p95=1,839.2msは3秒内。Largeの同じ強い30回は19回で実行環境が停止し、正式30回未完了。実行再開後の診断3回p95=10,569.3msは10秒を超えた。前の一覧描画値、途中19回、別probeや3回を正式入力開始の合格にしない。probe自体の可視性確認は各0.2〜0.4msだった。

EntityEditorの同期逆参照検査が最初の編集欄描画を待たせていたため、C5では元のcollectReferencesを保ち、派生索引を短い区間に分けて入力を先に表示する。全件確認前は未確認を示し、取消・失敗・再試行を区別する。完了した索引だけをimmutable source配列別に公開し、遅れた旧source結果を現稿へ混ぜない。全ID/本文位置/版/採用状態/参照検査は保持し、正本・履歴・outbox・partsに派生索引を書き込まない。既存の検索/30件ページ/戻り位置を維持する。

補修中の99単体/結合と12,002件の実通常画面が3ブラウザーで成功。pointer取消の位置が進捗の桁で動くFirefoxの差分も補修した。取消→同じ対象で12,000件再試行→別対象6,000件→末尾検索→原子保存→cold→完全fileの全note不変を検査する。失敗fixture・selector・watchdog・一時並走と実製品差分を `working-reference-index/` に分けて残す。予備Large入力開始3回p95=8,413.6msはdirty buildの診断のみ。C5は最新mainから独立ブランチへまとめ、clean commit/tree/buildを固定して正式各30回・復元・実2時間・原116を検証する。全品質gateと実機/実Auth不足は保留のまま。

## C5の未達とC6のcold読取補修

固定C5 `5720bc8` / tree `a2d73e6`、clean build `27f23e6d00216dccad52` はStandard各30回の局所8指標が数値内。Largeの同じCSS/focus入力開始30回はp95=10,082.6msで10秒未達。全sample・fixture・source/build・環境・実素材72MiB・history/outbox31を `evidence/rb10-candidate/candidate-5/` に保持する。別の起動終点や予備3回を代用しない。

CI37889230895は761単体/build/docs/plan/Python15成功、production257成功/Firefox1全体watchdog失敗。元の12,002件と22expectを保持し、機能検査全体watchdog240秒と5段階名を追加。保存の60秒待ち、10秒入力開始等の性能条件は変えない。CI成功を原116や実端末の完成へ換算しない。

C6はmarkerがないcold DB配列を二度コピーせず、markerがあれば全marker検証を保って一度コピーする。header順のMap作成と不足検査で全件の一時配列を省く。コードポイント・Unicode・schema・hash・parts・native atomic transaction・元ファイル上限は保持。欠損/foreign/corruptを全拒否しnative8tableが読み取り前後で不変な検査を追加する。dirty3回p95=7,728msは診断のみ。単体fixtureと型の途中失敗は `working-cold-allocation/` に残す。freezeのfor-in置換は比較上遅いため採用していない。

次のclean対象を固定し、全CI、正式30回、Large全bytes復元、実7200秒の編集と独立原116の正常/境界を進める。実機/支援技術/実Auth/専用費用の不足と公開gate保留は維持する。

C6準備sourceで全単体763件／81ファイル、schema生成差分なし、文書・計画・Python15、対象通常操作3ブラウザーが成功。次のclean対象と各実証拠を別に固定する。

## C6のCI・性能成功とC7の作品一覧再入補修

固定C6 eab9812/tree8cc78のCI37893273502は763単体・258 production・全20step成功。checkout ad793affは同じsource tree。強い入力開始の正式Standard/Large各30回は局所数値内（Large8,483.2ms、検索462.4ms）。全asset bytes/hash・88003記録・history31・pending31が一致。source/build/helper/環境と全sampleをcandidate-6に保持する。

後の元Large復元手順で、取消→再試行→作品一覧の再入後に通常保存がproject.idの未知項目で拒否された。元helperの120秒timeoutと、同じ操作に失敗UIだけを加えた診断を区別して保持。表示用idが正本へ混入した実装差分をC7で直す。schema、原子性、履歴、ID、固定snapshot、完全形式と上限を保持する。

通常回帰は2作品の同名人物・Unicodeリンク・旧snapshotを使い、保存容量不足/native8table不変/入力保持→別作品保存→未保存入力再開→保存/cold→空390幅new/clone復元まで確認。dirty3ブラウザーで全3成功。検査側の元履歴0とclone追加commandの期待補正、coldのメニュー準備待ち、全失敗rawはworking-library-canonicalへ保存。

PR20は利用者側でmain ae22dcaへ取り込まれた。C7は新ブランチでclean対象を固定し全CI・同じ強い各30回・元復元helper・実7200秒・独立原116を再検証する。全体完成・実端末・実Auth/RLS/Storage・専用現行費用と公開gateは保留する。

C7準備版の全763単体／81ファイル、schema生成差分なし、文書・計画・Python15は成功。対象版固定後の各30回・復元・実7200秒・原116を別に実行し、準備成功を最終受入へ換算しない。

## C7の固定結果とC8の320px補修

C7 905aad8997bd4218fc3da84bba96687120ebb4dd / tree b89ea2600f3b9d5298e6cb0bda227a822ea27f8c / build4aa7686ea50ba1b3f89eのCI37898131383は763単体・261 production・全20step成功。同tree checkout c1abadd2bbad5757a329595470ae0ef115e3e29d。実入力開始を測るStandard/Large各30回は局所数値内（Large7997.8ms、検索446.3ms）。元Large取消／一覧再選択／通常編集／完全new/clone／coldは88,003記録・履歴・回復待ち・素材72MiBを全hashで確認した。

独立53部品・8通常成功後、320pxで条件の由来ラベルがページ全体58px横スクロールを発生。390/768/1024/1440の成功から320合格を推定しない。C8は全文を折り返すCSSを加え、元graph検査の正常・cold・配置・関係・完全出力期待を保持して320/200%を追加した。初回は人物中心の絞込みを解除し忘れた検査手順の失敗、2回目は通常comboboxで解除し3browser成功。全文を省略・非表示にしない。

C7のStandard60秒診断は旧名「試読」を探して停止し、Large実7200秒は未開始。新measure-appは現行「試読・検査」とApp準備待ちを使う。時間・fixture・操作・原子性・冷再読込／完全復元条件は不変。補足性能helper v4の測定区間も不変：実行artifactSHA、生成元の旧scriptSHA、現在tracked helperSHA、C8製品source/distを別々に結合し、performanceモードだけを使用する。soak/recoveryは新tracked helperを実行する。

歴史candidate-7の633独立証拠／269実artifactはSHA照合済みtar.gzと主要JSONに保持。C7台帳の2文書SHAが後の追記で古くなった準備失敗も残し、C8は全本文更新後に104関連source SHAと359source、26原文不変を再照合する。cleanC8の全CI・各30回・Large復元・実7200秒・独立原116が未確認の間は未実行のまま扱う。実機・支援技術・実Auth/RLS/privateStorage・専用quota／費用の公開gateを維持する。
