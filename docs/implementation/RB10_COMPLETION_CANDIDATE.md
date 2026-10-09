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

限定編集DBv2を維持し、9個目のSQL migrationで共有指摘lifecycleを準備する。service-onlyの元版対応表をordinary roleへ公開せず、role/session/期限をtransaction時点で再検証する。既存接続へ自動適用しない。実Auth/RLS/private Storageには専用URL、owner/editor/commenter/viewerの実試験account、private bucket、許容fixture容量、利用tier、現行quota／費用が必要。

## 同一候補の検証

`npm test`、`npm run build`、`npm run schema:generate`、文書・計画・Python、production画面、隔離SQL契約を同一固定sourceで実行する。`scripts/measure-app.mjs`は実App・実IndexedDBを使い、Standard8,800件とLarge88,003件＋72MiB素材のfixture hash、全sample、測定起点、source/build/artifact hashを記録する。Standard各30回p95、Large検索／初回表示、2時間継続編集、新規・clone復元を別に実行する。保存区間はcommand開始からcommitまでで500ms入力待ちを含めない。

Linux自動Chromium／Firefox／WebKit、320/390/768/1024/1440幅、キーボード、文字拡大、offline、cache、更新、直リンクは自動ブラウザー証拠。実iPhone Safari／Chrome、iPad Safari／分割、PC各OS・実版、回転、IME、Files、録音、VoiceOver／NVDA、ドラッグ代替へ流用しない。

公開は保留する。116ケース、24工程、9品質gateに同一完成版の実証拠がそろうまで`check_release.py`を緩めない。local成功だけで実機・支援技術・実同期／権限・専用接続費用を合格扱いにしない。

## C1 の失敗と次候補の補修

固定C1 `71159f2` の原結果は `docs/quality/current-review/evidence/rb10-candidate/candidate-1/` に保持する。CI単体754件と文書／計画／Python／buildは成功したが、E2Eは開始点selectと検索欄のlabelが一致した3件で失敗。元の操作・期待値を保ち、selectをexact comboboxで指定する。

Standard各30回の局所p95は基準内。Large検索は基準内だがcold local初回表示30回p95は12,390.7msで未達。次候補では一覧取得でheader全体を先にdecodeせず主キーを取得し、同一read transactionで取得済みのprivate headerを再利用する。cold成立検査は同じUnicode・有限数・循環・JSON不可値の拒否規則を保ち、使用しないcanonical文字列の構築を省く。全構造・ID・参照・固定世界・snapshot hash・復元検査は保持する。

dirty予備測定3回の成功は最終30回の代用にしない。次候補のclean commit／tree／buildを固定し、全CI、各30回、Large完全復元と2時間の実継続編集を再実行する。
