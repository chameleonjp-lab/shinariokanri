# アプリ内マニュアルの機能対応

更新日: 2026-10-23。これは実装済み機能の説明箇所を点検する対応表であり、正式な受入・実端末・認証/権限検証の合格記録ではない。

本文の正本は [src/manuals/content.ts](../../src/manuals/content.ts)。トップと作品メニューのマニュアルに表示し、同じデータから [生成スクリプト](../../scripts/build/manuals.mjs) で人間向け・AI向けMarkdownを生成する。AI向けには独自の作業契約に加え、全共通操作を `ai-reference-<人間向け節ID>` として含める。そのためAI向けファイル単体でも操作手順を参照できる。

公開テキスト版: [人間向け](https://chameleonjp-lab.github.io/shinariokanri/manuals/human.md) / [AI向け](https://chameleonjp-lab.github.io/shinariokanri/manuals/ai.md)。アプリで検索、目次、全文コピー、保存が可能。

## 操作単位の対応

| 画面・機能 | 人間向け節ID | 説明範囲 | 実装根拠 |
| --- | --- | --- | --- |
| トップ・作品一覧 | `start` | 新規作成、既存作品、全3章サンプル、マニュアル入口 | [App](../../src/App.tsx) |
| 保存・未保存入力 | `save` | 端末内保存、未保存の持出し、再試行、オフライン、更新 | [App](../../src/App.tsx) |
| 共通詳細編集 | `records` | 登録、制作状態、参照、ID、詳細JSON、アーカイブ | [EntityEditor](../../src/ui/EntityEditor.tsx) |
| 人物・組織・動機・話し方 | `characters` | 人物、グループ、目標、口調 | [fieldSpecs](../../src/ui/fieldSpecs.ts) |
| 世界資料 | `world-materials` | 場所、物品、設定、用語、資料と出所 | [fieldSpecs](../../src/ui/fieldSpecs.ts) |
| メモ | `notes` | 文章、画像・音声、マイク録音、人物/場面/伏線への変換 | [NotesTools](../../src/ui/NotesTools.tsx) |
| 本文と注釈 | `text` | 段落、ルビ、リンク、候補除外、分割・結合・移動、再リンク | [TextAnnotations](../../src/ui/TextAnnotations.tsx) |
| 章・本文 | `chapters` | 章と場面、構成項目、視点、提示順、台詞、日時との区別 | [WritingWorkspace](../../src/ui/WritingWorkspace.tsx) / [Lists](../../src/ui/Lists.tsx) |
| 章の試読 | `chapter-reading` | 章順・任意経路、縦書き、記録付き読書、保存・再開 | [WritingWorkspace](../../src/ui/WritingWorkspace.tsx) |
| 世界内年表 | `timeline` | 全日時モード、参加役割、レーン、表示単位、制約、連動移動、一括移動・取消 | [Timeline](../../src/ui/Timeline.tsx) / [TimelineEditors](../../src/ui/TimelineEditors.tsx) |
| 関係表・図 | `relationships` | 向きと根拠、時期、家系・師弟、図位置、表示保存、キーボード | [Relationships](../../src/ui/Relationships.tsx) |
| 状態・生涯・履歴 | `world-history` | 期間付き状態、所有・所属・居場所、認識、生死、例外、確認候補 | [WorldHistories](../../src/ui/WorldHistories.tsx) / [WorldPanel](../../src/ui/WorldPanel.tsx) |
| 地図・場所・移動 | `maps` | 場所階層、地図画像、ピン、親地図、経路の時間・方向・根拠 | [WorldMaps](../../src/ui/WorldMaps.tsx) |
| 別名・正体・公開名 / 暦の規則 | `names-calendars` | 保有者・時期付きの名前、独自暦、影響確認、tick保持 | [WorldNames](../../src/ui/WorldNames.tsx) / [WorldCalendars](../../src/ui/WorldCalendars.tsx) |
| 共通世界・共通場面 | `world-reuse` | 固定版、採用設定、更新差分、固定参照・複製・部分上書き | [WorldVersions](../../src/ui/WorldVersions.tsx) / [ReuseManager](../../src/ui/ReuseManager.tsx) |
| 分岐 | `branches` | ノード/線/図、条件、方針、呼出し、トリガー、反応系列、階層診断 | [Lists](../../src/ui/Lists.tsx) / [ReactionBuilder](../../src/ui/ReactionBuilder.tsx) / [FlowHierarchy](../../src/ui/FlowHierarchy.tsx) |
| 状態 | `state` | 型・scope・初期値、遷移、排他、リセット、算出、効果、クエスト、外部契約 | [fieldSpecs](../../src/ui/fieldSpecs.ts) / [StateMeaningPanel](../../src/ui/StateMeaningPanel.tsx) |
| 真実・伏線 | `truth-foreshadow` | 真実/証言/認識/仮説、嘘/誤解/引用、開示、期限、代替、回収方針 | [NarrativeClaims](../../src/ui/NarrativeClaims.tsx) / [fieldSpecs](../../src/ui/fieldSpecs.ts) |
| 試読・検査 | `runtime` | 状態差、変更元、抽選、巻戻し、再送、周回、初期化、開始点・記録 | [Reader](../../src/ui/Reader.tsx) |
| 探索・回帰・改訂 | `checks-regression` | 到達性、打切り、中止、JSON保存、経路再実行・比較、移行 | [Reader](../../src/ui/Reader.tsx) / [RuntimeReconfirmation](../../src/ui/RuntimeReconfirmation.tsx) |
| 作者別案 | `alternatives` | 作成、版保存、構成プレビュー、比較、競合、選択採用、過去版 | [AuthorAlternativeStudio](../../src/ui/AuthorAlternativeStudio.tsx) |
| 検索・整理 | `search` | 複合条件、索引、本文位置、固定/動的一覧、4表示、一括編集、統合、使用箇所、見直し、最近/お気に入り | [CatalogPanel](../../src/ui/CatalogPanel.tsx) / [CatalogResultViews](../../src/ui/CatalogResultViews.tsx) |
| 雛形・表示 | `templates` | 型付き追加項目、未設定/空欄、初期値、型変更、適用解除、非表示、配色 | [TemplateFields](../../src/ui/TemplateFields.tsx) |
| 制作 | `production` | 企画、判断、ゲーム仕様、工程、依存、期限、作業量、見積、再確認 | [ProductionPlanningPanel](../../src/ui/ProductionPlanningPanel.tsx) / [ProductionDependencies](../../src/ui/ProductionDependencies.tsx) |
| 台詞・翻訳・収録 | `dialogue-localization` | 台詞分割/統合/複製、ID対応、原文hash、工程、口調/用語検査 | [ProductionTools](../../src/ui/ProductionTools.tsx) / [ProductionReviewPanel](../../src/ui/ProductionReviewPanel.tsx) |
| 素材・演出 | `assets-cues` | 実bytes、出所・権利、差替え、参考/仮/完成、本文位置、ms、絵コンテ | [WorkPage](../../src/ui/WorkPage.tsx) / [PresentationCues](../../src/ui/PresentationCues.tsx) |
| レビュー・媒体版 | `reviews-media` | 指摘/修正/確認、対象版・引用、制作タスク、元版、媒体改訂比較 | [ReviewActions](../../src/ui/ReviewActions.tsx) / [MediaConsultationTools](../../src/ui/MediaConsultationTools.tsx) |
| 手動相談 | `consultation` | 範囲、対象・前後状態、プレビュー、Markdown返答、別案取り込み | [ConsultationContext](../../src/ui/ConsultationContext.tsx) / [MediaConsultationTools](../../src/ui/MediaConsultationTools.tsx) |
| 目的別出力 | `export` | 公開名/本文/値/素材、目的6種、版/担当範囲、引用承認、公開索引、検査 | [WorkPage](../../src/ui/WorkPage.tsx) / [ExportCitationTools](../../src/ui/ExportCitationTools.tsx) |
| ゲーム受渡し | `game-handoff` | 対応先の実装境界、runtime仕様、単体試遊、受領hash・ID対応・実結果 | [GameHandoffPanel](../../src/ui/GameHandoffPanel.tsx) |
| 完全保存・復元 | `backup` | 外部保管、検査、新規/複製/置換、ID対応統合、失敗と容量、素材 | [BackupPanel](../../src/ui/BackupPanel.tsx) |
| 履歴・設定 | `history-settings` | 履歴検索、局所/全体復元、復元点、確定版、作品設定 | [HistoryPanel](../../src/ui/HistoryPanel.tsx) / [WorkPage](../../src/ui/WorkPage.tsx) |
| 専用同期 | `sync` | 接続先、認証、作品登録/取得、保存待ち、競合、ログアウト前の持出し | [AccountWorkspace](../../src/ui/AccountWorkspace.tsx) / [SyncPanel](../../src/ui/SyncPanel.tsx) |
| 限定共有 | `sharing` | 固定版・受取人・権限、許可素材、指摘CRUD、制作取り込み、team編集、失効/撤回 | [LimitedSharePanel](../../src/ui/LimitedSharePanel.tsx) / [SharedPortal](../../src/ui/SharedPortal.tsx) / [SharedReviewInbox](../../src/ui/SharedReviewInbox.tsx) |
| 診断と限界 | `diagnostics` | エラー、操作ID、版、診断持出し、再読込、未受入範囲 | [DiagnosticPanel](../../src/ui/DiagnosticPanel.tsx) |

## データ種別の網羅性

`manualKindCoverage: Record<EntityKind, string>` は全43種を人間向け節へ対応させる。型の追加時にはTypeScriptが未対応の種別を検出する。対応先が実在することと、AI側の共通操作節も存在することは内容検査で確認できる。

| 種別 | 用途 | 節ID |
| --- | --- | --- |
| character / group / goal / voice_rule | 人物・組織・目標・口調 | `characters` |
| place / item / lore / terminology / source | 場所・物品・設定・用語・資料 | `world-materials` |
| event | 出来事・世界内日時 | `timeline` |
| note | メモ・変換元 | `notes` |
| chapter / scene | 章・場面 | `chapters` |
| flow_graph / flow_node / flow_edge | 分岐の図・ノード・接続 | `branches` |
| dialogue_line / localization / recording | 台詞・翻訳・収録 | `dialogue-localization` |
| variable / effect / quest / external_contract | 状態・更新・クエスト・外部境界 | `state` |
| assertion / foreshadow / disclosure | 真実・認識・伏線・提示と回収 | `truth-foreshadow` |
| checkpoint / trace | 開始状態・試読記録 | `runtime` |
| attachment / cue / storyboard_frame | 素材・演出・絵コンテ | `assets-cues` |
| map / travel_route | 地図・移動経路 | `maps` |
| template | 型付き追加項目 | `templates` |
| collection | 固定/動的一覧・回帰集合 | `search` |
| review / media_variant | 指摘・媒体版 | `reviews-media` |
| creative_brief / decision / gameplay_spec / production_task | 企画・判断・ゲーム仕様・工程 | `production` |
| snapshot | 不変の確定版 | `history-settings` |
| projection_profile | 公開対象・名前・本文・値・引用 | `export` |

## AI独自の契約

`ai-role`（役割）、`ai-context`（相談パック）、`ai-contract`（ID・版・型・時間）、`ai-model-world`（世界モデル）、`ai-model-story`（本文・伏線）、`ai-model-runtime`（実行モデル）、`ai-production`（制作）、`ai-search-templates`（整理）、`ai-proposal`（返答Markdown）、`ai-adoption`（別案と採用）、`ai-verification`（検証）、`ai-export`（公開とruntime）、`ai-storage-sync`（保全・権限）、`ai-sample`（教材）を説明する。これらの後に全35節の共通操作を再利用する。

提案Markdownはアプリの命令言語ではない。対象本文を選んだ取り込みでは、提案テキストが対象の本文（chapterでは要約）になるため、差替え本文と説明を分けて返すよう記載した。同期・共有・録音・実ゲーム受領はサンプルの内容が存在するだけでは実行済みにならないことも明示する。
