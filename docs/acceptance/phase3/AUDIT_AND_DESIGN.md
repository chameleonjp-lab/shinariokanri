# 第3段階の監査と設計判断

監査起点はmain `67bef6a08f63a737d64d5bab0c8a17e3364bbc0a` / tree `9fd71d58d745153e363cddb750aefa33c00ed795`。#59は2026-10-16 15:33:26 UTCにmerge済み。#60–68はmerge済み、#63–65も#67経由でmainの実祖先へ到達している。open PRは着手時0、main保護はAPIでdisabled。設定は変更しない。

本監査は[登録された統合計画](../../implementation/codex-three-phase-2026-10-17/PLAN_ALL_STAGES.md)と[第3段階依頼](../../implementation/codex-three-phase-2026-10-17/PHASE_3_ACCEPTANCE.md)の実行である。旧「#63–65未統合」や旧94/22判定を現在の実結果へ転記しない。

## 採用済み実装の境界

`App.tsx` → `ScenarioStoreProvider` → `ScenarioStore` → native IndexedDB。作品一覧はsummary、選択後は検証した編集image。UIのページ60件はDB60行の証拠にはならない。保存は既存の全不変条件検査、変更行、差分履歴、64操作の復元点、commands/outbox/assetsの原子transactionを維持する。編集用history省略は完全保存や独立復元検査へ持ち込まない。

履歴metadataのv8内部headerはP2-04の互換decoderを使用する。固定世界は編集closureと履歴/export closureを区別し、storeが非active保持と失効を所有する。P2-06派生索引は実immutable entity・schema・版・role・epochの所有証明付きであり、認可や正本ではない。P2-07の共通定義は元43kind/345fieldの独立期待を維持する。

## AUD-001–023の再監査

| AUD | 現在の実装・入口 | 第3段階の確認と扱い |
| --- | --- | --- |
| 001 | `App` / `store.listProjectSummaries`、P2-01 | header一覧と選択後検証、破損別作品隔離の既存原検査を継続 |
| 002 | `store.loadEditor` / `AccountWorkspace` | 未読・不在・検査中を区別。古い選択/cancel/late response原反例を再実行 |
| 003 | `derivedIndexes` / StoreContext / account scope | schema/header/role/epoch/close失効。原所有・外国object・mutable反例を保持 |
| 004 | `store` / `recordParts` | 分割行と原子一括確定を区別。完全Largeの最終error/quotaで全21表空を照合 |
| 005 | `catalog` / `derivedIndexes` | 連続検索の前段比較は補助。正式原compound検索30回を再実行 |
| 006 | CatalogPanel / ListWindow / WindowedList | 一覧provider Bの棄却を維持、全件filter＋既存ページ表示。hidden選択/戻り位置を再確認 |
| 007 | `referenceChoices` / scoped preparation | P2-02のID/label/orderとP2-06所有・失効を維持。通常UIで人物/章参照を連結 |
| 008 | `referenceIndex` / impact preview | 同名別ID・改名・分割・統合・削除の原ケースを再実行 |
| 009 | catalog / public projection / candidate preferences | 作者分類・正式参照・提案・ignore・公開索引を混ぜない。公開前の明示確認も保持 |
| 010 | model descriptors / fieldSpecs / schema | 元独立345field期待・11例外・公開allowlistを再実行、schema bytes不変 |
| 011 | `saveProject` / command validation | P2-03 changeset試作は棄却済み。180保存で実書込行・hashとUI/command区間を分離 |
| 012 | history metadata / immutable command hash | 113全履歴・順序・hash・native pending partsをnew/clone/coldで照合 |
| 013 | archiveData / pack Worker / sharedArrayJson | native1.0の検査・全hash・転送・実保存bytesを維持。完全file600000msを再測定 |
| 014 | original Standard/Large generator | 前段値は過去。8指標×2size各30、nearest-rankと原上限を再判定 |
| 015 | BackupPanel / import Worker / store atomic import | 途中取消、unknown major、project1byte/最後の24MiB1byte破損、最終失敗→通常再試行 |
| 016 | production service worker / local area | 自動offline reloadとcoldは実行可能。実OS領域寿命・Filesは外部待ち |
| 017 | contentValidationMemo / recovery validation sessions | own-data成功証明だけの限定再利用。mutable/偽hash/異所有者は全検査の元反例を保持 |
| 018 | model validators / reference/owned ID validation | 作品内一意性、真実/証言/仮説、全参照、unknown/false、安全整数を原全件で検査 |
| 019 | archive/import Workers / retained helper | 配信dist/helper実bytesとsourceを封印。counterをlatencyに混ぜず、終了/cleanupも照合 |
| 020 | WritingWorkspace / Reader / Timeline / World | 空作品の連続導線と元職種別原E2Eを結合。原図/年表30gestureを変更しない |
| 021 | local/outbox / sync ACK/RLS contracts | 重複・偽ACK・別account・取消・拒否の既存隔離contractは実行。専用実接続は未指定 |
| 022 | release guard / configuration boundaries | 本番・別用途project・認証/権限/課金・hosting・merge・公開を操作しない |
| 023 | original CI controls / actual receipts | 3engine全inventory・attempt・原復元添付を元aggregatorで検査し、取得ZIPまで照合 |

## OPT-01–15と採否

| OPT | 統合済みの判断 | 第3段階での結論・証拠 |
| --- | --- | --- |
| 01/02 | P2-01 summary/選択後fullを採用 | 二重実装しない。正式起動と既存異常系で確認 |
| 03 | P2-03共有changeset試作を棄却 | 全不変条件を保持し180保存で再計測。棄却案を復活させない |
| 04 | P2-04互換metadata headerを採用 | 元全文検査とpaged metadata双方の原テストを保持 |
| 05 | P2-05閉包・保持制限を採用 | fixed/hash/history/registry、閉じたownerとdraftの寿命を検査 |
| 06 | P2-06 store所有派生索引を採用 | 元全再生成対照・独立原期待を保持。正式compound検索は別測定 |
| 07 | 一覧provider B・ordinal Aは研究のみ | 現行UIを採用。単にページ移動が速いという理由で正本取得を省かない |
| 08 | P2-02 scoped参照を採用 | 原22条件/全scopeと新連続UI参照を継続 |
| 09 | P2-07 model参照descriptorを採用 | 正式独立定義/画面/公開/schema期待を維持 |
| 10 | タグ類の役割分離を維持 | 未採用X02/X03などを追加しない。秘密/公開出力を独立に確認 |
| 11 | 検証証拠の限定再利用を維持 | 全履歴/native/hash/拒否/原子性の元対照を再実行 |
| 12 | Largeの未設定6上限を作らない | 観測値と改善目標案を分離。原起動10000/検索2000msのみ原合否 |
| 13 | 日常操作と完全復元を別評価 | 180保存と7200/full113は別の元手順で実行 |
| 14 | 外部22件を個別分類 | [EXTERNAL.md](EXTERNAL.md)。自動WebKit/Unicode/模擬APIを実条件へ昇格しない |
| 15 | 現行7job / 独立3runnerを継続 | 下記比較。元workflow・ケース・timeout/retry/skipは変更しない |

## 最小補完・広域改修・現行維持の比較

| 方式 | 正確性・速度・資源・費用 | 採否と戻し方 |
| --- | --- | --- |
| 現行と過去証拠だけを提出 | 前段実装は保持できるが、最終候補の180/7200/full113が未実証 | 不採用。原最終受入を満たさない |
| 現行製品＋原runner可搬化＋独立検査＋不足連結UI | 正本/形式/認可を変更せず、実終了と全量oracleへ結合できる。正式試験の実時間と証拠保持費用は必要 | **採用**。追加測定/検査/文書のrevertで戻る。DB migrationなし |
| 新しい保存契約・永続検索read model・X機能を含め再設計 | 再移行/破損/同期/公開と独立期待の拡大が必要。今回の再現結果から採用根拠なし | 不採用。既承認範囲を超える |

## 制作導線と例外

新しい`phase3-authoring-continuity.spec.ts`は、空作品→人物/章/場面→型付き人物/章参照→日本語本文と作者メモ→検索→章試読→変更履歴→固定版→未確認公開範囲の拒否→明示確認→秘密を除く実Markdown→完全file→空new/cold全本文→offline再編集→固定版不変を、通常UIで一連実行する。

公開範囲は作成しただけではconfirmedにならない。初回試験がこの必要な確認を飛ばした失敗は保持し、製品側の確認を省く修正はしない。復元後は元pending全件と別の復元監査命令1件を検査する。元の完全ファイルへ追加監査命令を黙って削る期待は採用しない。

| 作業者 | 元の専門導線・fixture/原条件を持つ既存手順 | 共通接続 |
| --- | --- | --- |
| 小説/脚本 | `ap04-original-f-writing`, `writing-workspace`, `ap04-original-e04-narrative` | 同一場面/段落、固定版、章試読、原稿/公開出力 |
| ゲーム制作者 | `ap04-original-e03-state`, `ap04-original-e10-exploration`, `ap04-original-bm-runtime` | 状態/分岐/unknown、実汎用出力、保存経路。対象ゲームは外部待ち |
| 世界設定監修 | `ap04-original-f-world-versions`, `ap04-original-e09-world-production` | 版1/版2、同名別ID、参照closureと旧公開版を保持 |
| 素材/翻訳 | `ap04-original-e08-deliverables`, `ap04-original-f-material-output` | 実WAV/PNG、台詞hash/分割/差戻し、素材同一性、再確認 |
| ディレクター/レビュー | `ap04-original-f-source-schema`, `review-runtime`, `rb08-handoff` | 引用位置/原版、確認状態、担当出力。実reviewer認証は外部待ち |
| 個人offline制作 | `ap04-original-n-mobile-offline`, `ap04-original-e12-continuity`, 新連続導線 | local commit、送信待ち、cold、完全復元後の再編集 |

参照不在・同名異ID・改名/分割/統合・世界違版・真実/証言/仮説・矛盾/到達不能・秘密・role変更/偽ACK/別account・取消・未知major・破損・最終quotaの元negativeは削らない。局所mockと実サービスの境界を各結果で維持する。

## CI運用の比較

基準は#68成功run `39129493044`：unit367.15秒、browser本体Chromium23.7分/Firefox30.0分/WebKit41.1分（別runnerの過去観測）。独立matrixは導入済み。

現行方式は各runnerがnpm/buildを準備し、元全inventoryと後続検査を1workerで実行する。共有build配布案は準備重複を減らせるが、build metadata/SW identity・実engine添付とsourceの結合を変更する。追加shard案は時間短縮余地があるが、global/setup/実添付・欠落検出の独立性を新たに証明する必要がある。現行の準備時間に対し本体の長時間が支配的で、今回その追加費用に見合う実証はない。現行を継続し、必須全件・3engine・失敗証拠を保つ。未実測の共有/shardを高速と断定しない。

速度、論理保持量、実heapは別物である。P2-06の8Mi文字予算とclose後0は論理観測であり、実heap/peak/実機の上限合格にはしない。今回の原30/180/7200はheap計測を暗黙に追加した結果でもない。
