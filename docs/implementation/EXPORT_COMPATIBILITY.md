# RB10追加の保存互換性（同一候補の最終受入前）

2026-10-09。native形式1.0.0と既存6出力profileの規則を保持する。[候補の確認条件](RB10_COMPLETION_CANDIDATE.md)を併用する。以下のRB08/RB09記録は各確認時点の範囲として残す。

| 変更 | 保持する値・対応 | 拒否・互換条件 |
| --- | --- | --- |
| 完全ファイルの `shared-records-v1` | 全kind、順序付き段落／台詞／履歴、同じIDの異なる案、変更前後、送信待ち、世界pin推移依存、素材bytesを辞書で損失なく往復 | 必須機能を宣言。未知reader、未参照辞書、破損hash、不正参照・上限超過は確定前に拒否 |
| `shared-review-source-v1` | 私有の共有指摘出所、旧公開版、Unicode引用位置、修正／確認段階。cloneではprivate IDを対応し、外部public IDは保持 | 共有指摘があるファイルだけ必須機能を宣言。作者用の対応map／認証情報を公開profileへ転用しない |
| ローカルDB v7 `recordParts` | 大きな履歴／送信待ちの元の完全値をSHA256付きpartsから返す。marker、parts、索引、古いpartsの除去を同じトランザクションで確定 | 旧v6行はそのまま読取。未知codec・欠損・改ざん・scope不一致・取消で安全に停止。専用ファイルの仕様版とは別 |
| 共有指摘migration 9 | 旧resolved=trueは修正済み。元版・公開引用は不変、確認済みへ自動昇格しない | service-only対応表と現在のmembership・session・期限を検査。実Auth/RLS/Storageは専用環境で別受入 |

portable上限はZIP64MiB、展開256MiB、JSON64MiB／file、素材32MiB／file、100,000 records、500,000 objects、深さ32を保持する。ローカルpartsの8MiB分割を、専用ファイルの上限緩和として扱わない。metadata-onlyは完全復元ではない。入力途中の持出しと完成素材bytesも区別する。

## RB08時点の互換記録

# 現在の出力互換性（RB08実装候補・最終受入保留）

2026-10-08。原104要件・116受入の条件は維持する。以下は通常画面で生成・保存・再読込する現在の実装範囲であり、全実端末／実API／最終受入の合格ではない。[制作・受渡し手順](RB08_PRODUCTION_HANDOFF.md)と対象commitの検査記録を併用する。

| 目的 | 現在の形式・挙動 | 拒否／残る条件 |
| --- | --- | --- |
| 完全保存 | native `.scenario` 1.0.0。全kind・段落／台詞ID・世界の推移依存・作者別案／採用記録・公開snapshot・全履歴・隔離送信待ち・取得済み素材bytes・公開引用の承認・ゲーム受領を往復 | 未知major／必須機能・hash不一致・危険パス・上限超過等は原子拒否。metadata-onlyは素材の完全復元ではない。実OS Files／更新／長時間／オフライン継続は別検証 |
| 読み手向け | Markdown / HTML。確認した公開名／公開文と、別に確認した固定引用版。版を名前空間に含むアンカーとUnicodeコードポイント位置 | 未承認の固定引用・対象外・公開文内の不正位置・欠落／破損pinは拒否。作者文の自動転用なし |
| runtime | `scenario-runtime` format1.0.0 / profile `scenario-runtime` **1.1.0**。同じ実行器へ復元するnative実行データ・公開ID対応・固定引用版・承認した素材bytes | 必須機能5種を明記。非公開の実行依存、未対応項目、値型、未知仕様は拒否。bytes不足はmetadata-onlyを明示し、ゲーム受取は拒否 |
| 単体試遊 | ZIP：index.html / runtime.json / manifest / 素材／引用版別素材。全宣言入口、call／return、trigger、manual／first／all_match、全三値条件、物品／認識、全効果、宣言reset／算出／排他／有限例外、提示時knowledgeEffects、反応／周回、演出ms／カメラ／絵コンテ | 本アプリと同じ条件／実行／提示モジュールをbundle。未知は停止、一経路10,000遷移。必要素材不足は拒否。外部入力はstub、実ゲーム副作用と実測証跡は含まない |
| 制作・翻訳／収録 | 公開ID／公開原文hash、担当に属する成果物と依存場面／演出／素材／用語／声。固定引用版とbytesは版別に保持 | 原文変更は確認待ち。担当ID・私的原文hash・作者系統情報は公開しない。特定engine全対応の保証はない |
| 手動相談 | 確認した公開範囲をMarkdownへ持出し、返されたMDを出所／相談対象版付き作者別案へ取り込む。別案比較・選択採用と履歴へ接続 | 正本への自動適用・AI自動送信なし。対象版不一致／改ざん／保存競合は停止 |
| 独立ゲーム受渡し | 同repoの `examples/browser-game/`。runtime1.1を受領・hash／素材／ID対応を検査し、ゲーム側の実操作・経路・受領hashをファイルで戻す | specification `scenario-browser-game/1.0.0`。stub／actual／mixedは検証した実行記録から導出。手入力分類・改ざん・重複／未知仕様は拒否。別engine／外部サーバーの実受領確認は別対象 |

固定再利用と固定世界は元pinのhashを確認して、出力用の読取ビューへ展開する。正本へ借用本文を複製しない。旧本文の引用は `projection_profile.citedVersions` に元版・その版を確認した公開範囲・公開版IDを明示する。`blockSources` は編集可能な公開段落のIDと元版段落の対応を保持する。同一素材IDでも旧版と新版のbytesを混同せず、`公開版ID:素材公開ID` と版別パスを使う。

secretな自由文を機械的に安全認定しない。公開名・公開文・公開列挙値・公開理由／例外／カメラ等を作者が確認する。出力の除外・警告・対象版を確認して保存する。実行依存を除外して挙動を変えるsilent dropは禁止する。公開範囲外の素材・名前・本文・作者メモを出力へ埋めない。

## 歴史的互換記録（下記の未対応欄は当時の範囲）

# 現在の出力範囲（完成版の互換性表ではない）

RB05追加で `variable.exclusions`、`foreshadow.alternativeInfo`、`scene.dialogueLineIds`、台詞の主張・意図、回帰collection、提示前状態と母数の由来を任意項目として追加した。完全保存・履歴・cloneは型付きID対応を保持し、追加欄がない旧章／分岐記録も再生する。runtime出力は排他・代替・主張等の未対応項目を明示拒否する。公開範囲外の台詞をsceneから省略して実行内容を変える出力は生成しない。

2026-10-08補修で、作者用完全形式1.0.0に `effect/transition.exceptionDetails`、試読状態の任意 `resetCauses`、経路の任意 `initialWorldTick` を追加した。strict schema、型による参照収集・clone、履歴と完全保存へ同時に反映する。一般の `effect.reason` は例外許可にならない。旧形式の良好な章・分岐経路fixtureを変更せず検査し、原因がない旧状態へ空配列を挿入しない。実行条件を変える明示例外の公開runtime出力は未対応として拒否し、黙って削除しない。借用世界情報は正本へ複製せず、hash付き固定版を完全保存・復元で使用する。

| 目的 | 出力 | 作者情報・素材 | 現在の制限 |
| --- | --- | --- | --- |
| 完全保存 | `.scenario` ZIP | 作者メモ、全履歴、推移する固定世界、取得済み素材、隔離した送信待ちを含む | 形式1.0.0。新規/複製/同一作品置換・統合/別作品の明示ID対応。旧1.0.0 fixtureとDB v1更新を検査。未知major/必須機能は拒否 |
| 素材を除く保存 | `.scenario` ZIP | 素材metadataのみ、作者情報は含む | 素材本体の別保管が必要。完全バックアップとして扱わない |
| 読み手向け | Markdown / HTML | 指定した公開名・公開文のみ。素材bytesなし | 公開プロファイルと対象版を検査。作者本文を自動採用しない |
| 制作用runtime | `scenario-runtime` JSON 1.0.0 | 安定した公開IDと許可した実行情報。素材bytesなし | 特定ゲームエンジンへ直接取り込める保証はない。算出/再利用/未対応の項目や挙動を変える除外は拒否 |
| 単体試遊 | ZIP内の `index.html` / runtime JSON / manifest | 公開本文と対応した実行情報のみ。作者の正本を変更しない | 単一開始グラフ、手動選択/優先候補、定数/論理/比較/訪問条件、boolean/integer/enumのset/add/reset・既読。呼出/trigger/all_match/外部状態/物品/認識/提示時の開示knowledgeEffects/演出/素材は事前拒否 |
| 翻訳・収録/制作 | 公開IDを用いるJSON | 承認された公開台詞と翻訳・収録metadata | 原文の内容変更は確認待ち。ID対応を省いた制作出力は拒否 |
| 手動相談 | Markdown | 明示した公開範囲・相談対象のみ | 手動で持ち出す。AI自動更新・提案の作者別案取込は未実装 |

出力前にプレビューの対象版、除外、警告を確認する。没案・作者別案・秘密の自由文を自動判定して安全にしたと扱わない。公開文や公開名にも秘密を書けば公開されるため、作者が内容を選ぶ。

簡易試遊はZIPを展開して `index.html` を開く。戻る操作は実行状態を復元し、再開は初期状態へ戻す。実ゲームとの一致、実端末全対応、全受入完了を示す証跡ではない。未対応の効果を黙って削って生成しない。
# RB05第2追加の保存互換

階層表示と反応系列は既存の章・場面・台詞ID／flow graph／条件を使用し、新たな出力専用の実行規則を追加しない。型付き途中開始は既存checkpointと固定snapshotの一操作保存であり、native保存／clone／再読込後も`partial`を保つ。実行が未知／未完の場合は回帰確認済みへ数えない。試遊ZIPの既存未対応機能は引き続き明示拒否し、未対応を合格・silent dropへ変えない。

# RB05第3追加の保存互換

`scene.reuse`、`reuse.bindings`は旧形式にない場合も維持する任意項目。実行namespaceのID対応を完全保存・履歴・clone・明示別作品ID対応に含める。参照元と推移依存のsnapshotをhash確認し、借用した本文や状態は正本／経路snapshotへ複製しない。本文・段落／台詞・固定リンクは対象版を保持する。欠落した旧reference/overrideの対応は確認して再設定し、無断で現在稿へ置換しない。

固定参照／部分上書きの公開投影はRV22の残実装である。公開出力で`reuse`を無視することを防ぎ、選択した参照／上書きには`EXPORT_UNSUPPORTED`を返す。完全保存と公開投影は別の検査結果として記録する。

RB05提示順追加では、foreshadow.presentationDeadline、checkpoint.migration、trace.reconfirmationを既存1.0.0の任意欄として扱う。既存データでの欠落は従来の意味を保ち、移行元checkpoint/trace・固定版は型付きIDとしてnative/clone/明示ID対応の対象とする。公開投影のpresentationDeadlineは既存anchorの公開ID・位置規則を用いる。未対応の実行期限・例外・認識等は既存の互換検査で明示拒否し、silent dropを完成扱いにしない。内部実行と同じ規則を提供する試遊・汎用受渡しはRB08/RV22〜RV23で継続する。

RB05再確認の追加契約：`trace.initialStubValues`は状態変数／外部宣言の型付きIDを保持し、`readingPath.selection`は章単位と場面単位を区別する。native/cloneは入力・選択範囲・旧新証跡を保存し、旧stubの個別入力が不明なら明示の移行・再作成を要求する。選択単位のない旧章記録は記録した場面列を保持する。未知の拡張を受け取る旧readerは通常のschema検査で拒否し、黙って脱落させない。

RB05追加互換: checkpoint.worldTick と trace.initialStubBaseState は任意の型付き情報として保存する。日時なしの旧記録は引き続き検証し、矛盾する経路時点は拒否する。initialStubValues が記録された経路は固定版の入力から開始状態を再構成して照合する。入力のない旧stubの再生証跡を保持するが、新版再確認には明示した開始状態の移行・再作成を要求する。本文のID文字列は型付き参照へ置換しない。

RB06の運用情報往復は[完全保存・任意履歴・明示対応](RB06_RECOVERY.md)の互換表を参照する。送信待ちがある1.0.0ファイルには必須機能 `portable-recovery-v1` と `data/recovery.json` を付ける。未知の旧readerが送信待ちを黙って落とすことを防ぐ。元サーバーrevisionは接続時の参考記録であり、ローカル履歴をサーバー共通元へ転用せず、元操作を隔離して接続・権限・確定基底を再検証する。

## RB07追加（最終受入は保留）

台詞lineage/split/merge/copyの旧→新位置対応はstrict native1.0/schema/cloneへ保持し、作者情報として公開投影から除外する。担当別翻訳/収録は公開文・公開ID・公開hashと選んだ成果物の依存素材のみを出力する。新資料形式の動画MP4/WebM/Ogg・UTF-8文章・JSON・非実行binaryは署名/bytes/hash検査と安全な保存表示へ接続。旧readerの未対応必須機能/未知版拒否は維持する。v3→v4はauthorToolDrafts追加、入力bytesは完成した素材bytesの合格へ換算しない。

RB09: 完全専用形式は元protocol ID/hashを保つsync-recovery共通元/prepared/二案/ACK/素材ACKと世界pin推移依存のbytesを含む。clone/ID対応統合後は再接続待ちであり、自動送信しない。限定編集v1証跡はv2で保全し現権限へ再接続する。許可されたteam入力はnative私有履歴へ置き換えない。承認済み投影と公開版/Unicode位置を持つ限定共有、private byte proxy、own段落/線コメントは別の実API受入を必要とする。

RB09 C8の限定編集workでは任意の`permissionObservation`を私的復旧記録へ保持する。旧DBの無認可stampはactiveへ昇格せず、元workを復旧側へ残す。最新内容＋新許可maskの導出は現在の値だけを使用し、未知の新本文は取得まで停止する。公開profileにはこの私的認可・復旧・アカウント入力を含めない。

## C10の復元エラー表示

C9→C10で完全形式・requiredFeatures・DBv7・ID対応・上限・出力profileは変更しない。元のStorageError.pathを完全保存/復元の画面へ渡し、理由と共に表示する。拒否時の正本・素材bytes・復元下書き不変、同じ元ファイルの再試行と冷間復元を確認する。表示修正は未対応profileの拒否や互換条件を緩めない。

## C11の分岐解析Worker

ブラウザー分岐検査は同じ固定版/共通世界のhash検証と実行規則をWorkerで実行する。完全ファイル/requiredFeatures/DBv7/公開投影/素材bytes/ID対応/6出力profileは不変。準備時間を含む30秒・100,000状態・一経路10,000遷移を保持し、取消/未探索/未知を全経路安全へ換算しない。キャッシュ対象に生成Workerを含む。Worker起動拒否は入力と保存済み内容を保ってエラーを表示する。

## C12の要約だけの出来事

出来事は名称または非空の要約を必要とする。要約だけの既存データを共通domain検査・cold・完全ファイル・旧snapshot・new/clone・同期の準備検査が同じ規則で受け入れる。人物等の名称必須、全型/参照/ID/上限/requiredFeatures/DBv7/公開投影は不変。旧版へ名前を捏造・複製しない。本文/要約の明示編集で生じた新段落と、保存/復元時のID保持、cloneのID再割当を区別する。

## C13の検索位置の再利用

保存形式・ID・Unicodeコードポイント・公開投影・引用版・履歴・ZIP上限は不変。端末内の検索解析のみ、同一ブロックかつ本文文字列一致で再利用し、改名・段落ID変更・可変本文の更新を都度反映する。キャッシュはWeakMapの派生値で完全保存へ追加しない。C12の保存数値未達と検査手順停止は歴史的記録として保持し、最終対象版の再検証と区別する。
