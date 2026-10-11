# C29の実行証拠と保留条件

製品対象は `09d39faae9c7293fe77b5675cc7286605a1809a6`、tree `352863bf81bd56b3c563f76e6b7586fe5f471e24`、build `b59572f71d050cd96e0f`、base `/shinariokanri/`。[441入力の実hash](TESTED_PRODUCT_BINDING.json)と照合する。文書を届けるcommitと、実行した製品commitを区別する。

[104要件の照合表](CURRENT_REQUIREMENTS.md)、[原116ケース・464節の直接結果](current-implementation.json)、[独立レビュー](INDEPENDENT_C29_REVIEW.md)、[候補と未完了条件](FINAL_CANDIDATE.md)を併せて確認する。元要件・原4節・設計時レジストリ・歴史baselineは変更しない。

## 実行済みの局所検査

| 証拠 | 同じC29の実結果 | この結果で認定しない範囲 |
| --- | --- | --- |
| schema・production build・文書・計画・Python | 成功、Python 15件 | 元全受入、実環境 |
| 既存単体 | 876件 / 93ファイル成功 | 通常画面、実機、実API |
| 保存・参照・カーソル・Worker復元 | 3 Linux engineの15件成功 | 全実ブラウザー/OS、原116全体 |
| 関連通常画面81件 | 80成功 / 1 WebKit全体30秒timeout | 81件全成功。変更なし単独1件の成功で旧失敗を消さない |
| PR #37 CI run 38060502013 | 全21 step成功、単体876・E2E318・Large・RB03/04 | CI未添付dist/runtimeの同byte認定、実機/実権限 |
| Standard 8,800件、各30回 | 元8指標のp95成功 | 他端末、VoiceOver/NVDA、Large |
| Large 88,003件・実72MiB、各30回 | 初期/キャッシュ表示の記録と検索。元2指標p95成功、最大起動11,167msも保持 | 全標本10秒以下、実端末、2時間 |
| 元3保存形態×30×素材有無 | 180測定成功、完全保存→空390環境→cold一致 | 入力debounce込みUI時間の200ms認定、未観測Worker hash回数 |
| 実旧91履歴ファイル | 新規/clone/coldとnative任意旧版8の参照成功 | 旧版8のUI選択/復元、全歴史payload/native pending row hash |
| Large取消・新規/clone復元 | 88,003件・72MiB、取消不変→実完全file→空390→cold成功 | 実端末、長時間、全kind全履歴の認定 |
| 独立の元境界と固定Large | 11寸法×直前/上限/超過33件＋固定Large functional/pointer2件成功 | 全116/464、実7200秒、実機 |
| 原F39/F41 | 同given・通常操作・固定原因・cold/new/cloneの6シナリオ成功。原2ケース8節の局所wholeを独立照合 | 追加support4件を原4ケースへ換算、全116/104/24工程/6回帰群 |
| 原B12/B14/B15/B17/B18 | 閉鎖した実操作・保存・cold/完全new・clone・厳密拒否を元4節へ独立照合。原5ケース20節の局所whole成立 | 残り通常実行の部分成功、全要件全文、実端末・実権限・工程gate |

原B13は通常の回想位置変更→原子保存→cold/new/cloneで世界tick/旧版の不変を原4節へ独立照合した。閉鎖12シナリオの独立レビューsealはSHA256 `f8bd3943e08a4dc0f77b0989dd047657249ed4a6f85455570bd0e4f1ff443e8b`。残る7ケースは原句ごとの部分観測で、公開pin/添付/限定相談の前提/改名の実参照/元解析上限の超過/実IME/実端末の具体的不足をレジストリに保持する。

Standardの保存区間はcommand検査開始から原子commitまでで、500ms入力debounceを含まない。p95は元30値から再計算し、丸め・epsilon・最良run選択をしない。Largeの保存/frameの補足値へStandardの条件を付け替えない。旧C13/C24/C25等の実結果は、それぞれの対象版を保持する。

## 実行中と未実行

小規模通常の閉鎖した第1残り実行は15成功/22失敗/12時間切れ/1取消/74未実行、第4実行は12成功/11失敗/2時間切れ/1取消/83未実行。元の実入力・trace・終了code・441入力/73helper・封印を保持し、不正な肯定fixtureや古い私有selector/ACK待ちの手順を訂正した別実行で再確認する。部品成功や手順訂正から全ケース成功を推定しない。第4loopは17:46:47.670〜19:47:53.593 UTCの実7265.923秒、112編集・112保存画像/素材bytes照合・22オフラインcoldを実行した。その後の最終完全保存downloadは元600000msでtimeoutし、processは19:57:55.482609 UTC/exit1で閉鎖した。完全ファイルは未観測、最終空環境復元は未実行であり、N04/E11/回帰群の完成へ換算しない。raw SHA256 `5f3ab04a71bf25bb254aabea542f7e28953b0d39adb5ebbb6435e87490e13c94`、441入力/HEAD/tree不変を保持した。実helperが最終画面/alert/progressを捕捉していないため原因は未確定。別の113履歴の短い診断で保存進捗・画面・具体的拒否を確認し、2時間の成功へ転用しない。

型検査・登録件数・起動・途中経過を成功へ換算しない。7200補助手順の起動/旧tab/mobile一覧待機失敗も保持し、元fixture・期待・上限・実時間を緩和しない。

閉鎖した通常11シナリオの原句追加レビューsealはSHA256 `d066f62281bd65c4d0b847a3de01afaa18bf06515ce74961b998b03c4c94a0fb`。原44節のうちtrue22節/partial22節を記録し、B19の必須・任意・代替・続編持越しと理解を自動認定しない元4節だけを局所wholeへ追加した。その他は対象人物改名・回収本体の参照・最初から最後への移動・資料取得位置の通常登録・確認者ID・企画各種の結合・世界改訂の作成操作・実機/実権限の不足を個別に保持する。

C29のREQ-F36には既知差分を確認した。domainの相談出力は前後状態を扱うが、通常のExportPanelはその指定を渡せず、実MDでは「前後の状態は未指定」となる。元given/shallを満たした完成として扱わない。独立seal SHA256 `0b3a67c37633262a5e7dcdc2f72d50d6a843648a02137b098bca27fcc89bafb8`。後続の別ブランチで対象・前後状態・版/公開範囲ごとの下書きと確認を補修中であり、C29の製品hashや受入結果へ混ぜない。

C29の通常本文フォームでは候補除外ボタンが表示されない。選んだ人物への2つのUnicodeリンクは保存できたが、一般語除外の操作で元240000ms timeoutした。既存のaccount/project/source別除外保存は存在し、optional callbackを必須とする表示条件が通常導線を遮断している。リンク保存と除外未成立を区別し、別ブランチで表示条件を補修して同fixtureの除外/cold/逆参照/完全new-cloneを再検査する。 独立seal SHA256 `8025971f627957f1d79798103f7f5273939f74158b318b5d82ce0805445508bf`。

別の113履歴診断も20:35:31.102152 UTC/exit1で閉鎖した。通常112編集後の現画像88003記録・全素材72MiB hash・履歴113/送信待ち113を確認したが、完全保存downloadは元600000msを超過した。実画面は「保存した操作を照合113/113」の後「内容と履歴を検査0/1」のままで、alertは未観測。raw SHA256 `e243fc3652fb6a24003d8fe7d7824e8e455bb73c89bba612d2f54da387414525`、最終PNG/進捗/元helperと441入力/HEAD/tree不変を保持する。完全ファイル・空環境最終復元・2時間受入の成功へ換算しない。履歴と送信待ちの再展開・検証の反復が調査対象であり、単独の原因や修正合格は未確定。

閉鎖remaining-5の原12ケースを4節ずつ独立照合した。10ケース40節とB04/F04の各3節、計46節をAT ID/原句で重複排除して追加。B04の自然な編集欄scrollとF04の場面4理由の詳細は未確認のまま。seal SHA256 `7733bbd7b4ab538ae0d634c01a85e5d549fea704a484a50283432264dd03272d`。監査自体の新runtimeは0で、閉鎖した実App/原子保存/cold/実完全bytesを照合した。全104/116/24/6の完成判定は変えない。

閉鎖remaining-5の分岐8題とremaining-8/9の9題を原句で独立照合し、F16/F17/F20/F40/F35の5局所wholeと計46直接句を追加した。同occurrenceId再送の通常UI、旧checkpoint実選択、未定義使用、素材だけ差替の依存コマ、暦単位/開始/日付/周期の連続操作、同fixtureの逆順二提案、実端末/実権限等の未観測は残す。seal SHA256 `d7ea1dcd803ed090b25f9caf7878d7278fe502324a450c78d4ede3b6ae54465f` と `8f8292db4b8f498f5cbe113ea8350aa654523152d4b852ed13cad35af635cb98`。監査の新runtime0、原104/116/24/6の最終結果は未実行のまま。

B04/F04/B11/F47の不足句を同じC29の別の閉鎖通常操作で補い、旧B04/F04の6直接句を重複計上せず10句・4局所wholeを追加した。複数実行のfixture/時刻/ID/実ファイルと元失敗を各出所で保持し、単一連続実行へ付け替えない。独立combinedレビューseal SHA256 `a0ddd2b0b1816b1103b4456f7d2a1d53f4f5f06435341b05e36005a7da624d7f`。原104/116/24/6の最終判定は未実行のまま。F41の要件全体に関する局所補助も別記録に保ち、原句の加算は0。

現在の原句照合は原28ケース112節の局所whole成立（B02/B03/B04/B05/B06/B07/B08/B09/B11/B12/B13/B14/B15/B17/B18/B19/B20/B21・F03/F04/F16/F17/F20/F35/F39/F40/F41/F47）と、他の部分ケースで直接確認した54節の計166節。F39は原要件全文の読取・更新・初期化・原因一覧・未使用候補を同じ実操作/固定原因/保存/復元へ独立照合済みで、要件全体の最終gateは保留する。F41は原AT4節の局所成立と、別の閉鎖操作で確認した相互排他の通常登録・明示例外・原子拒否を含む要件全文の局所補助を区別する。B11の新しい関連付け保存とF47の各finding分類は追加操作で独立照合済みである。原句の追加と要件全体の最終gateは別に保持する。

C29の接続したコードでは、通常再利用はresolveReuseContentを通り、通常出力/限定公開はexecutionExportViewから公開投影する。古い未解決reuseの拒否文言は単独で現行未対応の証拠にしない。これは6ファイルhashを持つ静的確認であり、通常操作・固定旧版・cold/復元・実APIの合格へ換算しない。

B24/E01の実touch端末・OSキーボード・Filesは未実行。PR #36のマージ済みとPR #37のDraft・競合なし、両最新headのCI successは22:48 UTCに再確認した。

実iPhone/iPad・実PC各OS/ブラウザー・Files/録音/IME・VoiceOver/NVDA・200%文字・実向き変更、指定専用接続の二端末Auth/RLS/private Storageと直接API、現行quota/費用、HTTPS配信/直リンクは未実行。Linux Playwright/axe/jsdom・メモリ同期・隔離PostgreSQLから実環境の合格へ転用しない。[スマートフォン操作を含む短い手順と具体的不足情報](../../implementation/C29_MANUAL_REVIEW.md)を使う。

## 証拠bytesの照合

[検証ツール](verify_candidate_evidence.py)はPython標準ライブラリだけを使い、収録コードの実行や外部送信をしない。閉鎖後の証拠packetについて、番号順の各part・結合全体・全blob・内外manifest・logical path/件数を照合する。成功はbytesの一致を示すもので、受入・実環境・公開の成功を示さない。

```sh
python3 docs/quality/current-review/verify_candidate_evidence.py PACKET_DIRECTORY
python3 docs/quality/current-review/verify_candidate_evidence.py PACKET_DIRECTORY --materialize NEW_EMPTY_DIRECTORY
```

後者は新しい空の場所へlogical pathを再構成し、既存データを置換しない。実結果に残した絶対パスは当時の実行場所であり、再構成したlogical pathとmanifestのSHAを使って読む。実保存ファイル、元fixture、当時のhelper/maps、trace/report、失敗、独立sealを保持する。私有artifact署名URL/credential transportと、公開が自動承認審査で拒否されたPR本文の全payloadは明示basenameで除外する。拒否理由・payloadのhash/sizeを公開用metadataへ分離し、private投影fixtureやSQLの証拠は保持する。

原release evidence gateは同一製品対象の実証拠で再判定する。元条件を緩和して公開可能にせず、マージ・公開・新規課金・外部DB変更は実行しない。

旧DB移行失敗後の通常再試行に、C29の追加挙動差を実確認した。元native version10・保存内容は拒否後も不変だが、通常retryは0作品と同じエラーに留まった。独立readonly seal SHA256 `fd877beae74152f8a33a3a75c47988c1c37383c7c055bfffbdd760337d033fbf`。別候補 `5ab86a27f15bdf5205ea0fc711544e6eb7445d24` で再試行・取消・旧結果抑止を補修し検証中。後の成功をC29や旧アプリ更新の合格へ付け替えない。

閉鎖した証拠は[取得manifestと照合結果](evidence/rb10-candidate/candidate-29-final-actual-results-1/DELIVERY.json)に記録した。67,646 logical files / 9,962 blobs / 37 parts / 1,858,947,725 archive bytes、全体SHA256 `360324fda32771ed6979e354e9292c91ab4bc39cdbacc747d2e3ce0606b4cfe0`。portable verifierは22:48:59〜22:49:13 UTCに全parts・全blob・内外ledgerのbytes一致を確認した。アーカイブは作業成果物 `/tmp/shinariokanri-c29-closed-evidence-packet-1` にあり、GitHubからbinaryを取得できるとは認定していない。移送前後の39ファイルは全bytes/hash一致、read-only封印を保持する。準備verifierのmetadata size拒否も別結果で保持し、製品上限と受入gateは変更していない。

後続[Draft候補の別対象検証](FOLLOW_UP_CANDIDATES.md)はC29の結果へ付け替えない。原116の未確認には実機・実接続だけでなく、Linux通常操作で追加観測できる条件も残る。

2026-10-10 22:55:08 UTCに同一C29製品から現在の未完了evidenceを渡してrelease gateを再実行した。exit1・149保留・対象commit/base不一致0。evidence SHA256 `ab4b8cf807aabccb61c3f59f21c589d881fb9382c122f71ecf393e626e96ad41`、checker SHA256 `3128cdbc0bdba458765a325671be08562de139f16fee7e7fde5cd69f08bce2dd`。[実行記録](evidence/rb10-candidate/candidate-29-final-actual-results-1/release-gate-EXECUTION.json)を保持し、旧14:56判定も書き換えない。

23:11:55 UTCには最新の局所登録d57f3c79525ef2e25e333ec2d954c0815852a5d8c01e1f60e3b54cfdd91d8877を反映したevidence968457dbf02ba4841f14a9dedee4f0065fd6d9a15bf359bf80e96064f08396c6で、同一C29・同じcheckerを実行した。[新実行記録](evidence/rb10-candidate/candidate-29-final-actual-results-1/release-gate-current-EXECUTION.json)もexit1・149保留・対象不一致0。原116の最終not_run/evidence空を維持し、局所28whole/29partial/59未判定と464句166direct/40partial/258未判定だけを現在表へ一致させた。旧14:56/22:55入力ab4b8cf…はhistoricalと[旧入力](evidence/rb10-candidate/candidate-29-final-actual-results-1/release-gate-input-at-2255.json)へbyte-exactで保存している。

独立配送レビューstatic6は元104/116/464/24/6、C29入力閉鎖、全件局所status対応、原final/gateと新旧release実行を照合し、旧F41待機説明と古いgate残条件の2所見の訂正を確認した。seal SHA256 `72dfecf11ed9ae1ba2a137868f5060277491f687aac2239f18db5431f206da39`、58 files/20,013,721 bytes、製品/runtime/共有書込0。後続別候補の最新CI/実Largeは[別対象結果](FOLLOW_UP_CANDIDATES.md)に記録する。
