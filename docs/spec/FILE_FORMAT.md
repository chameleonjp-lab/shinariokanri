# 専用ファイル・出力仕様 1.0（規範・レビュー案）

対応: REQ-B12、REQ-F24/F35/F36/F42、REQ-N09/N14/N20。目的は、作品を端末や保存製品に閉じ込めず、完全に持ち出して読み戻せること。

## 出力プロファイル

| プロファイル | 形式・対象 | 既定の扱い |
| --- | --- | --- |
| authoring_full | `.scenario`、ZIPコンテナー、JSONと取得済み添付 | 全採用状態・作者メモ・ID・条件・線・版・使用世界snapshot・素材を保つ。認証情報とmembership/端末情報は含めない |
| authoring_light | 同形式、assetMode=metadata_only | 素材bytesを除く。未取得添付の数と復元不足を明示し「完全バックアップ」と呼ばない |
| reader | UTF-8 MarkdownまたはHTML、選択範囲の読み物 | 確定稿と公開投影。作者メモ・没案・秘密を除外。HTMLは非実行テンプレートとする |
| playable_preview | 静的HTML+JSONのZIP | 対応した条件と効果だけで簡易選択体験。投影済み版を使う。外部処理は仮結果または未対応を明示 |
| runtime_json | 版付きUTF-8 JSON | 安定ID、flow、台詞、状態、条件/効果、演出/素材対応。正本版と対応先profileを固定し、秘密の作者メモを含めない |
| localization / production | UTF-8 JSONと人が読める表形式Markdown | 台詞ID・言語・原文hash・素材IDを保持し担当範囲だけ出す。対応先がCSVを要求する場合は個別adapterで列/改行/数式解釈を規定する |
| consultation | Markdown+参照ID一覧 | 選んだ設定、前後状態、未確定事項、対象版。手動で持ち出す。外部AIへ自動送信しない |

画面では目的を選び、対象版、対象範囲、含める情報、除外数、未対応、素材の取得状態を事前表示する。authoring_fullは機密情報を持つ作者保存であり、公開用投影と取り違えない。汎用runtime JSONを必須とし、Unity/Unreal/ink/Yarn等への個別adapterは互換表で実装対象・試験版・制限を明示する。

## 専用コンテナー

ZIPの保存/Deflate方式のみ、暗号化ZIP、symlink、重複ファイル名、絶対パス、`..`、NUL、逆スラッシュのパスを拒否する。拡張子だけで判断せずヘッダーとmanifestを確認する。

| パス | 内容 |
| --- | --- |
| `manifest.json` | format=`scenario-package`、formatVersion=`1.0.0`、projectId、snapshotId、exportedAt、assetMode、files配列、minimumReaderVersion |
| `data/project.json` | projectId/name/formatVersion/calendar/mainStart、worldReferences、entities、relations、snapshots、履歴、保存ビュー定義 |
| `worlds/{snapshotId}.json` | 参照した共通世界の不変snapshot。必要な部分が出力済みでオンライン取得に依存しない |
| `assets/{sha256}.{safeExtension}` | 素材bytes。extensionは検査済み種類から決定。表示名を保存パスに使わない。同じ内容は一回だけ含める |

JSONはUTF-8、BOMなし。重複key、NaN/Infinity、無効Unicodeを拒否する。dataのキー順やインデントに意味を持たせない。ID/Tick/Revisionは文字列。manifestのfiles項目は `path, byteSize, sha256, role` を持ち、manifest自身以外の全ファイルを列挙する。未列挙ファイルと列挙済み欠落ファイルは拒否する。SHA-256は展開後のファイルbytesを対象とし、manifestは自己hashを持たない。

project.jsonは[データ仕様](DATA_MODEL.md)の全kindを保存する。condition AST、effectの順序、宣言した未完成参照、作者別案、段落/台詞ID、公開snapshot、素材の原hashを含む。派生検索索引と端末内送信待ちは再構築/運用情報であり保存対象外。履歴は現在版と公開版の復元に必要な情報を含める。履歴を省く軽量保存は明示したauthoring_lightに限る。

authoring_fullは全添付bytesの取得を検査し、未取得があれば完全出力を停止する。外部URL資料はURL・書誌・参照箇所のみを保存し、外部全文を勝手に添付しない。再配布を許可した添付だけをreader/runtimeへ出す。外部URLが後で消えることを自分の完全保存の欠落と混同しない。

## v1の安全上限

これは設計上の検査値であり、全端末の処理能力の保証ではない。超える作品は既存データを変更せず停止し、分割出力や素材を分けた方法を案内する。上限を変える実装では版と受入試験を更新する。

| 対象 | 上限 |
| --- | --- |
| 入力archiveの圧縮bytes | 64 MiB |
| 展開後の全bytes | 256 MiB |
| 一つのJSONファイル | 64 MiB |
| 一つの添付ファイル | 32 MiB |
| ファイル数 | 5,000 |
| entity+relation数（参照世界を含む） | 100,000 |
| JSONの構造深さ / 総オブジェクト数 | 32 / 500,000 |
| 条件の深さ / ノード数 | 16 / 256（1条件） |
| 一フィールドの本文bytes | 1 MiB |

展開前メタデータだけを信用せず、実際の展開bytesを数えて上限で停止する。処理をworker等へ分離し、進捗と取消を用意する。容量不足・メモリ不足は上限以内でも発生し得るため、未確定作業領域を破棄し既存作品を維持する。

## 読み込みの手順と確定点

1. ファイル形式・版・安全パス・展開上限を検査する。未対応のmajor版、同majorでも未知の必須機能宣言はFORMAT_UNSUPPORTEDで停止する。未知フィールドを黙って落とさない。
2. manifestの全byteSize/hashを確認し、JSONを隔離作業領域へ解析する。全kind・型・IDの一意性・参照型・世界snapshot・循環禁止・条件/effectを検査する。
3. 形式移行が必要ならコピー上で移行する。変換表・変更数・変換不能値を示す。旧ファイルと移行前復元点を保持する。移行が失敗したら全体中止。
4. 作品名、件数、素材量、既存との重複・不足・変更を事前表示し、次のモードを選ぶ。これは通常のアプリ操作上の確認で、開発者への再承認要求ではない。
5. 全変更・履歴・ID対応・添付参照を原子的に確定する。途中の失敗/取消は既存データ不変。成功後に検索索引等を再構築し、完了と未送信状態を表示する。

| モード | IDと既存データの規則 |
| --- | --- |
| 新規復元 | projectIdを含め保存IDを維持する。既存と衝突する場合は別領域で開くか複製を選び、上書きしない |
| 複製して追加 | project/全entity/relation/line/blockへ新IDを割り当て、内部参照を全て写す。元ID対応mapを履歴へ保持する。共通世界の不変snapshotはhashで再利用可 |
| 既存作品を置換 | 事前に完全復元点を作り、対象projectIdと全影響を確認。同じ作品の保存IDは維持。同期中の未送信変更があれば競合解決か別領域復元を必要とする |
| 統合 | projectの一致または明示mapを必要とし、同ID・異内容を競合として提示。名前の一致だけで人物等を統合しない。採用した残すIDと参照書換えを一括保存 |

単体復元も現在の参照先・公開版・翻訳への影響を表示し、新revisionの補償操作として適用する。公開不変snapshotを破壊しない。

## 往復の同一性

完全保存→新規復元で、正規化したproject/全entity/relation/blocks/conditions/effects/snapshot/hashを比較する。順序付き配列は順序込み、集合はIDで整列して比較する。除外できる差はexportedAt、再構築索引、端末別画面位置、認証・membershipだけ。元のID・本文・負/巨大tick・未定日時・素材bytesが一致すること。ZIP圧縮bytesの同一性は要求しない。

[サンプル作品](../examples/branching-clue.example.json)は分岐・状態・提示順の説明用であり、ZIP全形式の実装済み証明ではない。実行可能schema、移行fixturesと上限/失敗注入はWP01/WP16で作成し、AT-E07で往復する。

## 出力互換性と外部契約

runtime profileは `profileId, profileVersion, schemaVersion, supportedNodeTypes, supportedConditions, supportedEffects, externalContracts, assetTypes, omissions` を持つ。対象が未知の条件/effect/未完成参照を含む場合はEXPORT_UNSUPPORTEDで停止し、安易にtrueやno-opへ変換しない。reader出力の安全な省略は省略一覧を事前表示する。

外部値は管理元・型・入力/出力・欠損時処理をexternal_contractで宣言。仮戦闘結果等はstub、ゲーム内実測はactualの証跡。番号対応とhashを渡し、台詞・翻訳・音声の対応を失わない。手動の相談用取り込みは別案として出所と対象版を保持し、確定稿へ自動適用しない。
