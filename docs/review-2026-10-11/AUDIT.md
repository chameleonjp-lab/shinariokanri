# 計画と現在の実装の比較

調査日: 2026-10-11（日本時間）。main `3f34db00ef31bf97dec3d7668cb93212e5ba802f` / tree `352863bf81bd56b3c563f76e6b7586fe5f471e24`。ソースと仕様の静的照合、現在のGitHub情報、既存の実行資料を確認した。アプリ操作・実端末・証拠アーカイブ全bytesを今回再実行/再照合していない。

## 結論と版の区別

原104要件、24工程、116受入、6回帰群を維持する。年表、人物/世界、執筆、状態/分岐、伏線、保存、翻訳/音声、制作、同期/共有には専用処理と画面がある。型・関数・画面の存在を原受入全体の合格とは扱わない。

| 対象 | 固定した内容 | 判断 |
| --- | --- | --- |
| 現在main | `3f34db00ef31bf97dec3d7668cb93212e5ba802f` | #37まで。製品treeはC29と同一 |
| C29実行対象 | `09d39faae9c7293fe77b5675cc7286605a1809a6` / build `b59572f71d050cd96e0f` | 既存実行証拠の対象。このmainと同じ製品tree |
| 後続作業ブランチ | `5d8d3de484a454722999169ffbbbe1152f4354d4` | #38〜#42を含む。mainとは異なり、今回のPRへ製品修正を混ぜない |
| 今回の資料PR | mainを親とする別ブランチ | 新しい照合・要件・計画を追加。完成した製品の結果ではない |

#38〜#42は2026-10-11 09:31:42〜09:32:45 JSTにfix/rb10-read-batchesへ統合された。#37はその前の09:30:55 JSTにmainへ統合された。したがって「PRが統合済み」と「mainで使用できる」を同一視しない。後続との差分に22個の製品/検査/CIファイルがある。大きな証拠ファイルの追加件数を機能数に換算しない。

C29の局所集計は既存資料から読み取った報告値で、今回全bytesを独立に照合した数ではない。28ケースの原4節を局所確認、29部分、59未判定。464節中166直接、40部分、258未判定。**原116の最終結果は全て未実行として保持される。** これを完成率に換算しない。公開gateの直近既存結果も149保留/exit1であり、今回の新実行結果ではない。

## 不足と未確認の分類

| 分類 | 残件 | 意味 |
| --- | --- | --- |
| mainへの統合不足 | G01 | 別ブランチの修正がmainに入っていない |
| 確認済みの製品差分/失敗 | G02〜G05 | 候補除外、相談前後、移行再試行、Large全履歴出力 |
| 記録/引渡し不足 | G07/G08 | 元証拠の取得可能性と現在の入口 |
| 通常操作/性能/更新/互換の最終確認 | G06/G13〜G16 | コードはあるが同じ最終版の原条件が未成立/未確認 |
| 実環境の受入/配備条件 | G09〜G12 | 実端末、支援技術、専用同期、現行容量/費用 |

詳しい期待動作と終了条件は[GAPS.md](GAPS.md)、全原操作の未確認は[ACCEPTANCE.md](ACCEPTANCE.md)。原104の全shall/failure_behaviorは[requirements_audit.json](requirements_audit.json)に原文で保持する。下表のsourceは代表入口で、全ソースhash・行・実行しなかった範囲は同JSONで確認できる。

## 全104要件の照合

各行の「あり」は代表入口と関連処理があるという静的判断である。最終受入は全行未判定。C29の局所確認範囲は原ケースの報告結果であり、部分確認から要件全体を認定しない。

| 要件 | 計画の内容 | 担当/元工程 | 現在の代表入口 | C29原ケースの報告範囲 | 残件 |
| --- | --- | --- | --- | --- | --- |
| REQ-B01 | 作品の作成と情報の登録 | RB02/WP04 | `src/ui/EntityEditor.tsx` あり | 未判定・最終未実行 | G06 / G16 |
| REQ-B02 | 共通の出来事と人物別の出来事 | RB03/WP07 | `src/domain/catalogPositions.ts` あり | 原4節の局所確認・最終未実行 | G06 |
| REQ-B03 | グループと人物レーン | RB03/WP07 | `src/domain/timelineLayout.ts` あり | 原4節の局所確認・最終未実行 | G06 |
| REQ-B04 | 人物ラベルを固定して横移動 | RB03/WP07 | `src/ui/Timeline.tsx` あり | 原4節の局所確認・最終未実行 | G06 |
| REQ-B05 | 年表の表示単位 | RB03/WP06 | `src/ui/WorldCalendars.tsx` あり | 原4節の局所確認・最終未実行 | G06 |
| REQ-B06 | 過去への延長と本編開始 | RB03/WP06 | `src/ui/projectSettingsDraft.ts` あり | 原4節の局所確認・最終未実行 | G06 |
| REQ-B07 | 出来事間の意味付き矢印 | RB03/WP08 | `src/domain/relationGraph.ts` あり | 原4節の局所確認・最終未実行 | G06 |
| REQ-B08 | 出来事の関係者とメモ | RB02/WP04 | `src/ui/EntityEditor.tsx` あり | 原4節の局所確認・最終未実行 | G06 |
| REQ-B09 | 人物関係図との連携 | RB03/WP08 | `src/ui/Relationships.tsx` あり | 原4節の局所確認・最終未実行 | G06 |
| REQ-B10 | 名前からのリンクと逆参照 | RB02/WP05 | `src/ui/TextAnnotations.tsx` あり | 未判定・最終未実行 | G06 / G16 |
| REQ-B11 | 場所と物品の一覧 | RB02/WP04 | `src/ui/EntityEditor.tsx` あり | 原4節の局所確認・最終未実行 | G06 |
| REQ-B12 | 専用ファイルへの出力と読み込み | RB06/WP16 | `src/ui/BackupPanel.tsx` あり | 原4節の局所確認・最終未実行 | G05 / G06 / G15 |
| REQ-B13 | 世界の出来事と提示順の分離 | RB04/WP10 | `src/domain/presentation.ts` あり | 原4節の局所確認・最終未実行 | G06 |
| REQ-B14 | 分岐・合流と条件・効果 | RB05/WP12 | `src/ui/FlowHierarchy.tsx` あり | 原4節の局所確認・最終未実行 | G06 |
| REQ-B15 | 状態とフラグの管理 | RB05/WP11 | `src/domain/stateRules.ts` あり | 原4節の局所確認・最終未実行 | G06 |
| REQ-B16 | 試し読みと操作の巻き戻し | RB05/WP13 | `src/ui/Reader.tsx` あり | 部分・最終未実行 | G06 |
| REQ-B17 | 真実・人物の認識・プレイヤーの認識 | RB05/WP15 | `src/domain/narrative.ts` あり | 原4節の局所確認・最終未実行 | G06 |
| REQ-B18 | 関係・所属・位置・所有の変化 | RB03/WP09 | `src/domain/world.ts` あり | 原4節の局所確認・最終未実行 | G06 |
| REQ-B19 | 伏線と回収の管理 | RB05/WP15 | `src/domain/narrative.ts` あり | 原4節の局所確認・最終未実行 | G06 |
| REQ-B20 | 人物の目的と変化 | RB04/WP10 | `src/ui/WritingWorkspace.tsx` あり | 原4節の局所確認・最終未実行 | G06 |
| REQ-B21 | 不確かな日時と独自暦 | RB03/WP06 | `src/domain/timeEditing.ts` あり | 原4節の局所確認・最終未実行 | G06 |
| REQ-B22 | クエスト・会話・設定資料 | RB05/WP12 | `src/ui/Reader.tsx` あり | 未判定・最終未実行 | G06 |
| REQ-B23 | 安定ID・保存・取り消し・履歴 | RB06/WP03 | `src/storage/store.ts` あり | 部分・最終未実行 | G04 / G05 / G06 / G15 / G16 |
| REQ-B24 | 検索・絞り込み・確認候補・タッチ操作 | RB02/WP05 | `src/ui/EntityEditor.tsx` あり | 未判定・最終未実行 | G06 / G09 / G10 |
| REQ-F01 | 思いつきを一時置きする | RB02/WP04 | `src/ui/NotesTools.tsx` あり | 未判定・最終未実行 | G06 / G09 / G16 |
| REQ-F02 | 入力項目と雛形を変える | RB02/WP04 | `src/ui/TemplateFields.tsx` あり | 未判定・最終未実行 | G06 / G16 |
| REQ-F03 | 人物以外の筋で並べる | RB04/WP10 | `src/ui/WritingWorkspace.tsx` あり | 原4節の局所確認・最終未実行 | G06 |
| REQ-F04 | 場面の役割を記録する | RB04/WP10 | `src/ui/WritingWorkspace.tsx` あり | 原4節の局所確認・最終未実行 | G06 |
| REQ-F05 | 構成の雛形と盛り上がりを見る | RB04/WP10 | `src/ui/WritingWorkspace.tsx` あり | 未判定・最終未実行 | G06 |
| REQ-F06 | 要約と本文を行き来する | RB04/WP10 | `src/ui/WritingWorkspace.tsx` あり | 未判定・最終未実行 | G06 |
| REQ-F07 | 年齢と生涯を表示する | RB03/WP06 | `src/ui/Timeline.tsx` あり | 未判定・最終未実行 | G06 |
| REQ-F08 | 時間差と前後関係を守る | RB03/WP06 | `src/ui/Timeline.tsx` あり | 未判定・最終未実行 | G06 |
| REQ-F09 | 一つの世界を複数作品で使う | RB03/WP09 | `src/ui/WorldVersions.tsx` あり | 未判定・最終未実行 | G06 |
| REQ-F10 | 地図と年表を連動する | RB03/WP09 | `src/ui/WorldMaps.tsx` あり | 部分・最終未実行 | G06 |
| REQ-F11 | 移動と場所の変化を記録する | RB03/WP09 | `src/ui/WorldHistories.tsx` あり | 未判定・最終未実行 | G06 |
| REQ-F12 | 家系・別名・正体を扱う | RB03/WP09 | `src/ui/WorldNames.tsx` あり | 未判定・最終未実行 | G06 |
| REQ-F13 | 図を章・場面・会話へ分ける | RB05/WP12 | `src/ui/FlowHierarchy.tsx` あり | 未判定・最終未実行 | G06 |
| REQ-F14 | 発生のきっかけと条件を分ける | RB05/WP12 | `src/ui/Reader.tsx` あり | 部分・最終未実行 | G06 / G16 |
| REQ-F15 | 途中状態から試し読みする | RB05/WP13 | `src/domain/checkpoints.ts` あり | 部分・最終未実行 | G06 / G16 |
| REQ-F16 | 選択前後と別の道を比べる | RB05/WP13 | `src/ui/RuntimeReconfirmation.tsx` あり | 原4節の局所確認・最終未実行 | G03 / G06 |
| REQ-F17 | 確認した経路を保存する | RB05/WP14 | `src/domain/regressionPaths.ts` あり | 原4節の局所確認・最終未実行 | G06 |
| REQ-F18 | 条件と行き止まりを検査する | RB05/WP14 | `src/domain/analysis.worker.ts` あり | 部分・最終未実行 | G06 / G16 |
| REQ-F19 | 共通の会話や場面を再利用する | RB05/WP12 | `src/ui/ReuseManager.tsx` あり | 未判定・最終未実行 | G06 / G14 |
| REQ-F20 | 短い反応と周回を扱う | RB05/WP13 | `src/domain/reactions.ts` あり | 原4節の局所確認・最終未実行 | G06 |
| REQ-F21 | 台詞に変わらない番号を付ける | RB07/WP19 | `src/ui/ProductionTools.tsx` あり | 未判定・最終未実行 | G06 / G14 / G16 |
| REQ-F22 | 演出と必要な素材を結ぶ | RB07/WP20 | `src/domain/materials.ts` あり | 未判定・最終未実行 | G06 / G16 |
| REQ-F23 | 翻訳と音声の見直しを管理する | RB07/WP19 | `src/domain/productionWorkflow.ts` あり | 部分・最終未実行 | G06 / G16 |
| REQ-F24 | 目的に応じて書き出す | RB08/WP22 | `src/domain/exports.ts` あり | 部分・最終未実行 | G06 / G14 |
| REQ-F25 | 採用状態と別案を記録する | RB04/WP10 | `src/ui/AuthorAlternativeStudio.tsx` あり | 未判定・最終未実行 | G06 |
| REQ-F26 | 変更で見直す箇所を示す | RB02/WP05 | `src/domain/changeReviews.ts` あり | 部分・最終未実行 | G06 / G16 |
| REQ-F27 | 未リンクの名前と参照元を探す | RB02/WP05 | `src/ui/TextAnnotations.tsx` あり | 未判定・最終未実行 | G01 / G02 / G06 |
| REQ-F28 | 資料と設定の根拠を残す | RB07/WP20 | `src/ui/fieldSpecs.ts` あり | 未判定・最終未実行 | G06 |
| REQ-F29 | 指摘と次の作業を場面に結ぶ | RB09/WP18 | `src/ui/SharedReviewInbox.tsx` あり | 未判定・最終未実行 | G06 / G11 |
| REQ-F30 | 秘密を隠して確認してもらう | RB09/WP18 | `src/ui/SharedPortal.tsx` あり | 部分・最終未実行 | G06 / G11 |
| REQ-F31 | 画面の広さに合わせて編集する | RB02/WP02 | `src/ui/WindowedList.tsx` あり | 部分・最終未実行 | G06 / G09 / G10 |
| REQ-F32 | 指・マウス・キーボードに対応する | RB02/WP02 | `src/ui/EntityEditor.tsx` あり | 未判定・最終未実行 | G06 / G09 / G10 |
| REQ-F33 | 表示と作業の続きへ戻る | RB02/WP02 | `src/ui/viewPreferences.ts` あり | 部分・最終未実行 | G06 / G09 |
| REQ-F34 | 通信なしの編集と同期を区別する | RB09/WP17 | `src/ui/SyncPanel.tsx` あり | 部分・最終未実行 | G06 / G11 |
| REQ-F35 | 履歴とファイルを確実に持ち出す | RB06/WP16 | `src/ui/HistoryPanel.tsx` あり | 原4節の局所確認・最終未実行 | G01 / G04 / G05 / G06 / G15 |
| REQ-F36 | 相談用に必要な情報だけ集める | RB08/WP22 | `src/ui/WorkPage.tsx` あり | 部分・最終未実行 | G01 / G03 / G06 / G16 |
| REQ-F37 | 状態の意味と初期値を登録する | RB05/WP11 | `src/domain/stateMeaning.ts` あり | 部分・最終未実行 | G06 |
| REQ-F38 | 有効範囲・初期化・算出を決める | RB05/WP11 | `src/domain/stateRules.ts` あり | 未判定・最終未実行 | G06 |
| REQ-F39 | 読む箇所・変更箇所・理由を追う | RB05/WP11 | `src/domain/stateUsage.ts` あり | 原4節の局所確認・最終未実行 | G06 |
| REQ-F40 | 条件を組み立て、成立理由を見る | RB05/WP11 | `src/domain/conditionDraft.ts` あり | 原4節の局所確認・最終未実行 | G06 |
| REQ-F41 | 状態が変わる順番を定義する | RB05/WP11 | `src/domain/stateRules.ts` あり | 原4節の局所確認・最終未実行 | G06 |
| REQ-F42 | ゲーム側との受け渡しを定める | RB08/WP22 | `src/ui/GameHandoffPanel.tsx` あり | 未判定・最終未実行 | G06 / G14 |
| REQ-F43 | 伏線を独立した項目として持つ | RB05/WP15 | `src/domain/narrative.ts` あり | 部分・最終未実行 | G06 |
| REQ-F44 | 体験順に開示の段階を確認する | RB05/WP15 | `src/domain/presentation.ts` あり | 部分・最終未実行 | G06 |
| REQ-F45 | 手掛かりを見られる道を調べる | RB05/WP15 | `src/domain/narrative.ts` あり | 部分・最終未実行 | G06 |
| REQ-F46 | 知識・証言・誤解の出所を残す | RB05/WP15 | `src/ui/NarrativeClaims.tsx` あり | 部分・最終未実行 | G06 |
| REQ-F47 | 未回収の意図と期限を記録する | RB05/WP15 | `src/domain/narrative.ts` あり | 原4節の局所確認・最終未実行 | G06 |
| REQ-F48 | 人物の声と用語の基準を持つ | RB07/WP19 | `src/domain/productionChecks.ts` あり | 未判定・最終未実行 | G06 / G16 |
| REQ-F49 | 企画の基準と判断理由を残す | RB08/WP21 | `src/ui/ProductionTools.tsx` あり | 未判定・最終未実行 | G06 |
| REQ-F50 | 物語とプレイヤーの行動を結ぶ | RB08/WP21 | `src/ui/GameplayProductionLinks.tsx` あり | 部分・最終未実行 | G06 |
| REQ-F51 | 制作日程と依存する作業を持つ | RB08/WP21 | `src/ui/ProductionDependencies.tsx` あり | 未判定・最終未実行 | G06 |
| REQ-F52 | 制作量と一経路の量を分ける | RB08/WP21 | `src/ui/ProductionPlanningPanel.tsx` あり | 未判定・最終未実行 | G06 |
| REQ-F53 | 本文と絵コンテ・演出を並べる | RB07/WP20 | `src/ui/PresentationCues.tsx` あり | 部分・最終未実行 | G06 / G16 |
| REQ-F54 | 媒体ごとの派生内容を管理する | RB08/WP21 | `src/ui/MediaConsultationTools.tsx` あり | 部分・最終未実行 | G06 / G14 |
| REQ-F55 | 共通の情報と意味付きの関係を持つ | RB03/WP08 | `src/domain/relationGraph.ts` あり | 未判定・最終未実行 | G06 |
| REQ-F56 | 項目の型と入力規則を定める | RB02/WP04 | `src/domain/generate-schema.mjs` あり | 未判定・最終未実行 | G06 / G16 |
| REQ-F57 | 日本語の索引と用語集を作る | RB02/WP05 | `src/ui/JapaneseIndexEntryEditor.tsx` あり | 未判定・最終未実行 | G02 / G06 |
| REQ-F58 | 一覧・カード・図を同じ情報で使う | RB02/WP05 | `src/ui/CatalogResultViews.tsx` あり | 未判定・最終未実行 | G06 / G16 |
| REQ-F59 | 線の意味を選んで可視化する | RB03/WP08 | `src/ui/Relationships.tsx` あり | 未判定・最終未実行 | G06 |
| REQ-F60 | 重複・未参照・変更待ちを整理する | RB02/WP05 | `src/domain/maintenance.ts` あり | 未判定・最終未実行 | G02 / G06 / G16 |
| REQ-N01 | 全端末での編集 | RB02/WP02 | `src/ui/EntityEditor.tsx` あり | 未判定・最終未実行 | G06 / G09 |
| REQ-N02 | 対応ブラウザーと実端末 | RB10/WP23 | `src/diagnostics.ts` あり | 部分・最終未実行 | G06 / G09 |
| REQ-N03 | アクセシビリティ | RB10/WP23 | `src/diagnostics.ts` あり | 未判定・最終未実行 | G06 / G10 |
| REQ-N04 | 標準データの応答目標 | RB10/WP23 | `src/diagnostics.ts` あり | 未判定・最終未実行 | G01 / G05 / G06 / G12 / G13 |
| REQ-N05 | 大規模データと処理の中断 | RB05/WP14 | `src/ui/Reader.tsx` あり | 未判定・最終未実行 | G01 / G05 / G06 / G12 / G13 |
| REQ-N06 | 保存と移行の原子性 | RB06/WP03 | `src/storage/store.ts` あり | 未判定・最終未実行 | G01 / G04 / G05 / G06 / G15 |
| REQ-N07 | 同期の競合と再送 | RB09/WP17 | `src/sync/merge.ts` あり | 部分・最終未実行 | G06 / G11 |
| REQ-N08 | 権限と秘密の投影 | RB09/WP18 | `src/domain/projection.ts` あり | 部分・最終未実行 | G06 / G11 / G12 / G14 |
| REQ-N09 | 読み込みの制限と検証 | RB06/WP16 | `src/storage/archiveData.ts` あり | 未判定・最終未実行 | G05 / G06 / G15 |
| REQ-N10 | 入力と添付の安全な表示 | RB07/WP20 | `src/domain/externalInputs.ts` あり | 未判定・最終未実行 | G06 |
| REQ-N11 | 通信なしでの継続 | RB06/WP03 | `scripts/build/service-worker.mjs` あり | 未判定・最終未実行 | G06 / G09 / G13 / G15 |
| REQ-N12 | 再現可能な確認記録 | RB05/WP14 | `src/domain/regressionPaths.ts` あり | 未判定・最終未実行 | G05 / G06 / G07 / G08 / G13 |
| REQ-N13 | 日本語と時間の正確性 | RB02/WP05 | `src/domain/text.ts` あり | 部分・最終未実行 | G06 / G09 |
| REQ-N14 | 復元手順の完了 | RB06/WP16 | `src/ui/BackupPanel.tsx` あり | 未判定・最終未実行 | G01 / G05 / G06 / G07 / G09 / G13 / G15 |
| REQ-N15 | 診断とプライバシー | RB10/WP24 | `src/diagnostics.ts` あり | 未判定・最終未実行 | G06 |
| REQ-N16 | 拡張性と検証可能性 | RB02/WP01 | `src/domain/types.ts` あり | 未判定・最終未実行 | G06 |
| REQ-N17 | 公開構成と費用の明示 | RB10/WP24 | `scripts/check_release.py` あり | 未判定・最終未実行 | G06 / G07 / G08 / G12 |
| REQ-N18 | 失敗時の説明と入力保持 | RB02/WP02 | `src/ui/inputRecovery.ts` あり | 未判定・最終未実行 | G01 / G03 / G04 / G06 / G09 / G10 / G15 |
| REQ-N19 | 正本と公開版の保護 | RB04/WP10 | `src/domain/authorAlternativeIntegrity.ts` あり | 未判定・最終未実行 | G03 / G06 / G08 / G14 / G15 |
| REQ-N20 | 持ち出しと互換性 | RB08/WP22 | `src/domain/exports.ts` あり | 未判定・最終未実行 | G06 / G12 / G14 |

## 今回言える範囲

ソース位置と対象版の差分、原要件の対応、既知資料に記録された成功/失敗/未実行を確認した。全通常操作・全実端末の再受入、約1.85GBの閉鎖証拠の再取得、公開状態の最終検証は行っていない。現在の動作を知らない箇所は確認待ちであり、新たに壊れていると断定しない。
