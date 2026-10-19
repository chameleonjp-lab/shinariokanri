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

## NP04: 同じ作品を専門操作へ渡す境界（2026-10-19）

既存共通E2Eの空作品から作ったproject/人物/章/場面IDと、既存の「復元前の固定版」を `phase3-persona-handoff.ts` へ渡す。同じテスト内の通常UIで専門操作を行い、実出力の完全scenarioに戻す。補助helperは別fixtureをimportしない。既存の専門E2Eは参照専用で維持する。新しい6本の長いE2Eは追加しない。製品変更はない。

| 職種 | 同じ作品での開始→専門操作 | 実成果物と境界の期待 | 完全保存/復元→再編集 | 元専門E2E（独立条件を継続） |
| --- | --- | --- | --- | --- |
| 小説/脚本 | 空作品→人物/章/場面の通常作成→型付き章/人物参照→本文/作者メモ→検索/章試読→固定版 | 実公開Markdownの本文あり/秘密なし。場面/人物/章IDを実完全fileと照合 | new/coldでproject全体一致→browser offlineで同じ場面IDの名称再編集、本文/参照/秘密と旧pin保持 | `ap04-original-f-writing` のF03/F04/F05/F06。ルビ/筋/作者別案等の全原条件の成功へは転記しない |
| ゲーム | 同じ場面ID→入口/終端/線/分岐図を通常UIで登録→実試読→一手戻る→同じ台詞へ戻る→経路記録 | 実完全scenario内のtrace 1件、同じedge ID、入口scene ID/graph IDを照合。対象ゲームのactual受領とは別 | complete/cold/offline再編集後も同じ入口/線/graph/traceと元pin。場面重複を作らない | `ap04-original-e03-state`、`ap04-original-e10-exploration`。unknown/抽選/上限/対象ゲームは元検査/外部台帳を維持 |
| 世界設定監修 | 同じ場面ID/固定版ID→小説媒体を登録→改訂候補入力→画面移動→再開→差分確認→旧媒体を保持して候補保存 | 旧media ID/baseSnapshotId/sourceIds/本文不変、新候補は別ID・provisional/needsReview。改訂用元版が追加されても元pin全体不変 | 実完全scenario→new/cold→offline再編集後に旧mediaと候補/元pinを再照合 | `ap04-original-f-world-versions` の共通世界W/旧作P/続編Qと版1/2は別fixtureの原条件。今回の同じ場面の媒体境界と区別 |
| 素材/翻訳 | 同じ人物/場面→台詞ID→同じ原文hashの英訳→通常UIで実WAV追加→台詞/翻訳/添付を収録へ接続→現在原文の確認 | 実WAV bytes/hash、台詞/翻訳/収録/添付IDとsourceHash。確認後翻訳stage reviewed | 完全scenarioの素材bytes SHAをcomplete/cold/offline再編集後に同じ期待と照合 | `ap04-original-e08-deliverables` の分割/差戻し/単体復元・再確認、`ap04-original-f-material-output` のPNG/欠落素材/公開制御は元検査を維持 |
| ディレクター/レビュー | 同じ場面/固定版→実相談Markdownを読み込む→出所/対象版/本文対象を選択→移動/cold再開→quota拒否→同じ入力で再試行→作者別案保存 | 添付した実proposal.md、別案内の同じ場面IDの提案本文と出所/相談版customValues。正本本文/秘密は不変 | complete/cold/offline再編集後に別案の同じ対象/出所/元版を照合。実reviewer認証や原指摘lifecycleは未代替 | `rb08-handoff` の相談MD/受領/旧媒体境界、原F29実reviewerは外部台帳 |
| 個人offline制作 | 共通本文の未保存draft→native quota拒否→検索から同じ場面へ戻る→入力復帰/再試行→保存→同作品の各専門成果物 | 拒否前後のauthorFingerprint一致、本文draft保持、検索語/結果から同じ場面へ戻る。専用fileは実download bytes | 実new/coldでproject全体一致とpending元全件＋復元監査1件→狭幅browser offline再編集→historyちょうど+1、全専門成果物/固定版保持 | `ap04-original-n-mobile-offline`、`ap04-original-e12-continuity` のnative/更新/不在素材等を維持。実OS/実旧アプリ更新は外部待ち |

中断/再試行は、本文のnative quota拒否（正本非変更）、媒体改訂候補の画面移動、相談MDの画面移動/coldと保存拒否で固定する。相談の版/対象ID選択は再開後のselect値で照合する。本文の検索語と同じ場面の結果1件の特定（変更確認noteの別結果は除外しない）、試読の一手戻り後の同台詞を戻り位置として照合する。長一覧のscroll pixelや実OSのFiles取消を、この小規模fixtureで確認したとは扱わない。未保存入力は作品の正本/完全fileと別であり、拒否中の正本一致と再試行後の実完全fileを区別する。

初期の元固定版1件というassertは専門helper呼出前に維持する。媒体改訂の既存機能が追加する元設定版を期待から削除しない。new/coldの全project一致・pending検査・offline history+1・全pin不変という既存assertは維持する。timeout180秒・retry0・skip・engine/fixtureの原条件は緩めない。#72 RG-R05および専門原回帰は変更していない。

実検査argv/exit・添付・局所環境の制約は [VERIFICATION.md](VERIFICATION.md) と提出REPORTへ記録し、実行済のengineだけを実結果とする。別fixtureの専門成功を同一作品の全原工程成功へ転記しない。実Auth/実機/対象ゲームの未実行はNP08台帳のBLOCKEDを維持する。
