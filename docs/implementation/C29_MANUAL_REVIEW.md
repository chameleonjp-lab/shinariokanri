# 固定候補を実端末・専用接続で確認する

製品対象はC29 `09d39faae9c7293fe77b5675cc7286605a1809a6`、tree `352863bf81bd56b3c563f76e6b7586fe5f471e24`、clean build `b59572f71d050cd96e0f`、base `/shinariokanri/`。source401・原26・配信13・runtimeの441入力は[対象版の実hash](../quality/current-review/TESTED_PRODUCT_BINDING.json)に固定する。文書を届けるcommitを実行した製品commitとして扱わない。

実機確認用の[候補ZIP](../quality/current-review/evidence/rb10-candidate/candidate-29-physical-review-package-1/candidate-static-build-with-notices.zip)は1,039,348 bytes、SHA256 `590748c12808f0e8a49d315aa3deddfc52e2f08e6c617a4d9fd1f26c64b0e0ab`。[manifest](../quality/current-review/evidence/rb10-candidate/candidate-29-physical-review-package-1/MANIFEST.json)でCRC22ファイルと配信13ファイルの実byte一致を確認済み。依存LICENSE/NOTICEを含む。ZIP内の手順は梱包時点の履歴であり、現在の判定と不足条件はこのページと[実行証拠一覧](../quality/current-review/CURRENT_EVIDENCE.md)を参照する。実機試験は、別途承認されたHTTPS確認先へ同じbytesを配信して行う。

C18検証時の2026-10-10の読み取りでは、候補 `https://chameleonjp-lab.github.io/shinariokanri/` とその `build-info.json` はHTTP404だった。公開・Pages設定・専用DBへの適用は実行していない。同じ配信bytesを提供する、別途承認されたHTTPS確認先が実端末試験に必要。このHTTP404は当時の実観測であり、C29で未実行の外部配信検査を合格・失敗として転記しない。候補配信物・fixtureの最終ファイル名とSHAは、実測後の候補証拠manifestで指定する。

## スマートフォンだけで保存・復元する短い手順

1. 確認先の `/shinariokanri/build-info.json` で上のcommit・tree・build・baseを照合する。OS、実ブラウザー版、端末機種、表示幅、対象AT、fixtureのSHAを記録する。画面を開いただけでは受入合格にしない。
2. 通常画面で空の作品を作り、名前だけの人物と要約だけの出来事、章・場面・台詞を登録する。「端末内保存済み」を確認して再読込し、一覧・詳細・検索・年表から同じIDを開く。
3. 作品名・本編開始・本文を未保存で変更し、別画面へ移動して戻る。入力を再開し、保存失敗・競合を注入する所定のfixtureでは入力・基底版を保持することを確認する。修正・明示再試行後に再読込する。
4. 固定世界の旧版と、現稿とは入口の違う旧分岐版を選ぶ。条件・本文位置・引用・経路を確認し、Unicode文字位置付きリンクから戻る。場面終了・周回の宣言初期化、禁止遷移の全体拒否、巻戻・保存再生は対応する元ATの手順で確認する。
5. 「作品・保存」→「完全保存・復元」→「完全保存ファイルを作成」で実ファイルをFiles／ダウンロードなどアプリ外へ保管する。素材bytesを除く保存を完全バックアップと扱わない。ファイル名・bytes・SHA・保存対象版を記録する。
6. 元作品を残したまま、別の空領域で「保存ファイルを読み込む」から実ファイルを選び、新規復元を確認して確定する。再読込後のID、段落／台詞、世界pin、任意の古い履歴、公開版、送信待ち、素材の実bytesを照合する。複製追加では明示ID対応と参照を確認する。
7. キャッシュ取得後に通信を切り、編集・保存・cold起動・再接続を確認する。長時間・実アプリ更新は別試験で記録する。画面表示だけで素材取得・同期済みを認定しない。

操作は端末の通常画面とFilesで行い、利用者が毎回PCを使う手順にはしない。配信先の用意と検証用fixtureの準備は公開管理側の作業。完全ファイルには作者用の秘密・没案・履歴が入るため、限定相手には承認した公開snapshotを使う。

## 実環境の記録と未実行項目

C29の原AT-B01・元参照位置/戻る操作・追加カーソル競合と3200件Worker取消/再試行の3Linux engine通常画面15件の局所成功は、実端末や元116ケース全体の成功を意味しない。元116ケースのgiven／when／then／negative_or_edgeを変更せず、手順、入力SHA、期待値、実結果、製品commit／tree／対象ファイルSHA、OS／実ブラウザー版を残す。成功・失敗・取消・未実行を別記録にする。

| 確認環境 | 必要な実操作 |
| --- | --- |
| iPhone Safari／Chrome | 320／390相当の実幅、回転、IME、Files、録音、offline、文字200%、VoiceOver、ドラッグ代替 |
| iPad Safari | 768／1024相当、分割・回転、IME、Files、キーボード、VoiceOver、選択と戻り位置 |
| Windows／macOS PC | Chrome／Edge／Firefox／Safariの実OS・実版、1440幅、キーボード、200%、NVDA／VoiceOver、ドラッグ代替 |
| 各対象端末の性能 | 元Standard8,800・各30回のp95、Large素材付き・起動10秒／検索2秒、2秒以上の進捗／取消、実時間2時間 |

Linux PlaywrightのChromium／Firefox／WebKit、仮想390幅、axe、jsdomは上表の実証拠を代替しない。保存の測定区間はcommand検査開始→原子commitで、500ms入力debounceを混ぜない。操作応答200ms・検索500ms・保存1000ms・キャッシュ起動3000ms・図／年表33.4msの元閾値を丸め・epsilon・最良runの選択で緩和しない。

## 専用同期と限定共有

必要な指定は専用URL／public key、project ID／region／管理者、fixture tenant、owner／editor／reviewer／reader／nonmemberの5実アカウント、private bucket、現在のtier／quota／費用と確認先origin。認証情報を証拠JSONや診断へ書かない。別用途のchameleonJP-Lab／ランキングDBは使わない。

[専用接続手順](RB09_SYNC_SHARING.md)と[plan雛形](../../scripts/sync/live-plan.example.json)に同じ製品commit／tree、fixture UUID／snapshot／公開段落・素材ID／hashを固定する。`scripts/sync/live-contract.mjs` の実書込み用opt-inは、指定された専用fixture環境の承認後だけ使用する。現依頼ではmigration適用・deploy・実書込み・新規課金を実行しない。

二端末の同時編集、削除対編集、重複再送、通信断、認証失効、アカウント切替、権限撤回、依存rebaseと原子ACKを確認する。直接Data APIとprivate素材を5roleで検査し、本文・検索・図・地図・素材・リンク・ファイル名・秘密の子件数まで同じ投影を確認する。メモリサーバー・隔離PostgreSQL・模擬HTTPの結果は実Auth／RLS／Storageへ転用しない。

## 配信、互換、ライセンス、公開後

[互換表](EXPORT_COMPATIBILITY.md)、[利用・復元](USER_GUIDE.md)、[実環境と費用](EXTERNAL_CONDITIONS.md)、[公開条件](RELEASE.md)を同じ候補へ結合する。通常出力、完全保存、公開投影、ID対応、履歴、素材bytesを用途ごとに確認し、未知featureの拒否を成功にしない。

実lockfileに対応する配信依存はDexie4.4.6（Apache-2.0）、fflate0.8.3／React19.3.0／ReactDOM19.3.0／scheduler0.28.0（MIT）。元LICENSE／NOTICEを候補配信物へ添付する。リポジトリ独自コード・利用者素材の再配布許可を、この依存宣言から推定しない。外部資料は許可がない全文を出力せず、出所・参照箇所・取得日時・解釈を保持する。

公開は原release evidence gateが同一対象版の実証拠で満たされるまで保留。別途承認して公開した後、直接リンク、build-info、base、cache更新、cold／offline、保存・完全復元、限定共有の撤回を確認する。公表料金表のFree表示を、実tenantの残枠や現在費用ゼロの証拠として扱わない。

C29補足復元検査の実効待ちは、旧暗黙expect5秒から元ケース全体30秒の残り予算へ変更した。元fixture・原子拒否・cold・完全file・全3200本文一致・取消2000msは保持する。この局所成功を再試行中の応答、元N05全体や保存性能の合格にしない。同版LinuxのStandard/Large各30回・元3保存形態180回・Large取消/完全復元・元境界33件の局所結果は実行証拠一覧に記録済み。原116/464全体、実端末・実権限は別に確認する。同版C29の実2時間loopは7,265.923秒・通常編集112回・offline cold22回を観測したが、その後の完全保存が元600,000msで時間切れした。別の短い113履歴の通常出力も同じ元上限に達し、空環境への最終復元を確認できなかった。2時間の工程やRG06の合格へ換算しない。通常本文の候補除外、相談の前後状態入力、旧DB移行の原子拒否後の通常再試行にもC29の追加差分を確認している。別候補PR #38/#39/#40と起動再試行の補修で検証し、後の成功をこのC29へ付け替えない。
