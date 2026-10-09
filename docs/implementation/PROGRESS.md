2026-10-09の現在作業は[RB10候補の準備と確認条件](RB10_COMPLETION_CANDIDATE.md)を参照。PR #14〜#17の競合を順に解消し、各CI成功を確認した。#17の最終headは `01676a27d1f7bbc03d421c8c64187ef385e86ed4`、CI run `37867912548` が735単体、225 productionブラウザー、RB03/RB04、Python15、文書・計画・buildで成功。取り込みは利用者側で行われ、最新mainは `33f3c8c4bd22fb0d79ebdd037c36ca9bf30aabf3` / tree `5b66f5d6295082e2eb033d3613beec516b720149`。本作業からmainへのマージ・公開・外部DB変更は行っていない。

RB10は章／執筆／分岐／制作／参照候補の分割、任意診断の実失敗導線、共有指摘→制作タスクの原子保存、同義／反対状態候補、Largeのlossless DB partsと完全ファイル辞書、取消中の入力・原子性とcold読込を接続した。開発中の単体754件と追加通常画面27件（3ブラウザー）が成功している。これらは固定した完成候補の全受入結果ではない。Standard各30回、Large素材付き／取消／空復元／2時間と独立レビューを同一候補へ結合する工程を継続する。

[104要件の現在照合](../quality/current-review/CURRENT_REQUIREMENTS.md)は原契約と現在の関連source hashを保持する。元116の正常／境界・失敗は未実行を合格へ変えない。実iPhone／iPad／PC各OS・VoiceOver／NVDA・実Auth/RLS/private Storage・専用接続quota／費用は不足しており公開gateを保留する。以下の段階候補・main観察・工程表は各確認時点の歴史的記録として保持する。

RB09局所候補 `af0c2b983f1146cc7977f13d119b8748c867db2f` / tree `134fc3adb342600bebc8dccaa93ff5cec9254c08` は[同期・限定共有](RB09_SYNC_SHARING.md)を通常操作→原子保存→cold→完全new/cloneへ接続。735単体/結合、75 production Chromium153、Python15、schema/build/docs/plan、隔離PostgreSQLの8migration+23模擬RLS契約を確認。独立指摘の遅延許可/期限後解決/復元承認・入力DB原子性・遅延画面intentを補修。専用実接続先/5実アカウント/quota未指定、実Auth/RLS/Storage/二実端末・原116最終は未実行。公開gateは保留してRB10へ継続。

RB08局所候補 `bf0f6b07d4a3f782870ab11894d410936e7e1eff` / tree `10e62dbf528d2290a5d18222216498faaf992908` は[制作・受渡し](RB08_PRODUCTION_HANDOFF.md)を通常操作→原子保存→cold/完全復元へ接続。703単体/結合、68 production Chromium153、Python15、build/docs/plan/schemaと独立対象検査が成功。[5候補の負例](../quality/current-review/evidence/rb08-handoff/candidate-history.json)は不変保持。承認待ちの後続file busy、相談の本文IDと公開位置、有限capabilities、旧版からの受領実行再構成、入力全体のawait前capture、受領hashの固定承認を補修。元116全体・実端末・性能/Large/2時間・実API・release evidenceは未実行、RB09/10へ継続。RB07証拠63ファイルのGit梱包不足をSHA不変で候補3に補完済み。

RB07局所候補 `11cffa7aa3bfbc96c9ee0087ad1e03e797fb1dfc` / tree `343c6a53058fbbf26936bf5e434c42e26a7b1f0e` は[制作運用](RB07_PRODUCTION.md)を通常操作→原子保存→再読込/完全復元へ接続。686単体/保存・61 production Chromium153・Python15・build/docs/plan/schema、独立31部品＋fixture1・実ファイルnew/clone1・App15・production3が成功。[11候補の旧負例](../quality/current-review/evidence/rb07-production/candidate-history.json)を保持し、系統対応/演出/旧話者/再利用/旧世界pin/関係引用/経路条件/await前captureを補修した。原116全体・実端末Files/録音/支援技術/長時間/実APIは未実行、RB08全profile/ゲームは後続。

RB06の局所候補 `d64fd7dc1d14ab228511828ac6e72664dd31fdf7` / tree `07c6a8a8184d496652a24b9e790ee838ecf60058` は[完全保存・履歴・移行](RB06_RECOVERY.md)を通常操作→原子保存→再読込/復元へ接続した。664単体/保存、58 production Chromium153、Python15、build/docs/plan/schemaと独立17部品・11通常App・native移行1・production4が成功。旧負例・保存後の画面/後発ファイル/clear順序の補修を[候補履歴](../quality/current-review/evidence/rb06-recovery/candidate-history.json)へ保持。実OS Files/実端末/更新/長時間/実Authと全116最終受入は未実行。

RB05第4追加は [提示順・未回収・開始版移行・再確認](RB05_NARRATIVE_RECONFIRMATION.md) を参照。提示効果前の観測、体験上の期限、固定checkpointの明示移行、旧証跡を残す改訂稿再確認、固定借用の同一graph/章文脈を通常保存へ接続した。子graphの呼出し/復帰と、作品別の試読・保存待ち・失敗経路を画面移動から保持する。原116受入と公開出力/RB06〜RB10、実端末/実権限の完成条件は保持する。

候補 `7a40c7c52b5e3e2c8058a41bcc78c0113b9e1a0c`（tree `8362d0c22aa9eb9f5732d976227c9b37930795e5`）で単体/保存651件、production Chromium153/Linux通常操作54件、Python15件、文書/計画/schema/buildが成功。build-infoは同候補・dirty=false・base `/shinariokanri/`。独立部品12件＋Vite dev通常App12件は同じ正期待で成功し、再生完了の版表示/明示版選択の再入境界も補修した。途中候補の失敗→補修を[版別記録](../quality/current-review/evidence/rb05-narrative/candidate-history.json)に保持する。最新mainはPR #12取り込み後 `b310800`、CI run37740047138成功を2026-10-08に再確認した。マージ・本番公開・外部DB変更はこの作業で実行していない。

以下の第1〜第3追加の対象版・main観察は、その確認日時の歴史的記録として保持する。

RB05第3追加は [固定再利用](RB05_FIXED_REUSE.md) を参照。固定版の共通元を参照・独立複製・部分上書きで通常保存し、旧pinの状態・本文・開示・例外・経路を再読込／復元／cloneで検査する。独立レビューの追加境界を正期待で補修した。伏線方針・改訂後再確認・状態版引継ぎ・公開出力、RB06〜RB10と116原受入の残条件は保持する。

第3追加の候補 `686f4e9`（tree `434809f`）では608単体／保存、production Chromium44通常操作、独立53部品／保存と8実App操作が成功。build-infoは同候補・dirty=false・base `/shinariokanri/`。[結合記録](../quality/current-review/evidence/rb05-reuse/candidate-binding.json)と[独立レビュー](../quality/current-review/rb05-reuse-review/INDEPENDENT_REVIEW.md)に失敗→補修→同じ正期待の再実行を区別して保存した。最新main `47b70ab` はPR #10取り込み後、CI run37735339752がsuccess。PR #11は作業ブランチへ取り込まれ、main未反映の第2追加も次のmain向けPRへ保持する。この作業からマージ・公開を実行していない。

# 実装進捗（完成版は未公開）

RB05第2追加は [階層・反応系列・型付き途中開始](RB05_STRUCTURE_READING.md) を参照。下位call図を含む階層集計、短い反応の3方式、作品別下書き、固定版付き途中状態の通常フォームを保存・再読込・巻戻へ接続する。未知の経路を回帰確認済みに数える問題とcold start時の履歴token／保存待ち再入を独立レビューで確認し修正した。固定再利用と伏線方針等の残実装、原116受入は保持する。

第2追加の候補 `01d73eb`（tree `b2cfef8`）、[Draft PR #11](https://github.com/chameleonjp-lab/shinariokanri/pull/11) を作成した。587単体／保存、production Chromium42通常操作、独立30部品／保存＋6実App操作が成功。build-infoは同候補・dirty=false・base `/shinariokanri/` を記録する。Draft #10を基底とした追加であり、マージや公開は実行していない。

RB05の追加は [状態・全入口探索の契約](RB05_STATE_EXPLORATION.md) を参照。相互排他・提示前状態・全宣言入口・代替提示・回帰集合・二経路比較を追加し、通常Appの原子拒否→保存→再読込→再生を検査した。階層・固定再利用等の残実装は明示したまま進める。RV01〜RV10補修PR [#9](https://github.com/chameleonjp-lab/shinariokanri/pull/9)は外部で取り込まれ、最新mainは2efd4be、CI run 37722834807がsuccess。この作業からマージは実行していない。検証済みf077c9eとの製品差分はない。RB05や24工程全体の完成とは区別する。

2026-10-08の現在照合は[104要件の照合表](../quality/current-review/CURRENT_REQUIREMENTS.md)と[116原受入を保持した現在記録](../quality/current-review/current-implementation.json)を参照。開始時の最新mainは `3099c9d487fbabe8342ad8c4ee2c8dc4d4156b88`、tree `4fdc292ee4a973fbb6ae5cd8d57710066dabaeb4`、PR #8取り込み後。PR #8はレビュー文書だけで、製品コードはレビュー基準0474856から変わっていない。CI run 37715506253はsuccess。AGENTS.mdはworkspaceとrepoに存在しない。

RV01〜RV10の局所差分と追加の独立境界指摘を補修中。宣言reset・原因・禁止遷移の明示例外・採用状態・固定世界hash・選択版の入口・本文位置参照・保存待ち・設定下書き・暦確認基底・共通提示を通常画面と保存へ接続した。結果の範囲は[補修検証](../quality/current-review/REPAIR_VERIFICATION.md)に記録する。原104要件、24工程、116受入、RB05〜RB10全体の完成を宣言しない。歴史的baselineと段階証拠を保持し、残実装を環境待ちへ付け替えない。

PR #2レビュー後の残作業は[全機能の完成計画](../plan/COMPLETION_PLAN.md)、要件別の不足は[104件の作業カード](../plan/COMPLETION_TASKS.md)を参照。PR #3は計画を追加した基準版であり、以下は実装中の状態を記録する。

対象は計画書の全104要件・24工程。下表は実装中の成果物と残る完了条件であり、工程完了の宣言ではない。最終的な部品・結合検査結果はこの文書へ追記する。要件/受入レジストリの `planned` / `not_run` は設計時点の基準を保持しており、現在の部品試験の結果と同一ではない。

| 工程 | 実装した範囲・現在の作業 | 未完了の主な条件 |
| --- | --- | --- |
| WP01 | 全kindの型、strict schema、整数tick、共通条件評価、固定データ、CI | schema/全参照の結合検証と各画面の同一規則確認 |
| WP02 | 幅別ナビ・一覧/詳細・条件フォーム・保存エラー入力保持 | 全操作とIME・文字拡大・実端末の確認 |
| WP03 | IndexedDB分離tables・原子commit・履歴・補償undo・outbox | 全障害注入・過去形式の移行fixture・再起動と長時間試験 |
| WP04 | 全kindの登録/編集フォームと共通CRUD | 全雛形・メモ変換・型変更と削除影響の受入 |
| WP05 | 日本語検索・typed参照影響・統合preview | 索引/固定・動的一覧・一括変更/統合の全画面結合 |
| WP06 | 巨大/負tick・標準/独自暦・相対日時検査 | 連動日時変更preview・固定日時衝突・年齢/変更影響の全受入 |
| WP07 | 同一出来事IDの年表と人物レーン・一覧代替 | グループ多重参照・重なり・全端末/大規模性能 |
| WP08 | 意味付き関係の表/図・方向/凡例 | 一段/二段・全派生関係の編集還元・実端末 |
| WP09 | 場所/物品/認識/地図等の型とフォーム | 共通世界参照・移動/所有・家系/正体の時期別受入 |
| WP10 | 章/場面本文とID保持・要約/作者メモ分離 | 作者別案・正本/公開版保護・全構成/雛形/ルビの受入 |
| WP11 | 三値AST・型付き状態・原子effect | 算出/禁止遷移/重複発火と全状態UIの結合 |
| WP12 | 分岐/階層・条件・選択/自動/終端の試読基盤 | クエスト/再利用/上書きと全失敗系受入 |
| WP13 | 全状態巻戻・合流差分・抽選・周回・途中開始・不変版への経路保存/再生 | 周回scope/trace/checkpointの全版付き受入 |
| WP14 | 上限付き探索・進捗/取消・証人経路・網羅率 | 回帰経路管理・変更影響・大規模/総合受入 |
| WP15 | 提示順による手掛かり/回収チェック | 人物認識・回収方針/期限・全経路の総合確認 |
| WP16 | manifest/hash ZIP・strict JSON・worker検査・同一作品の復元/統合モード | 作品間mergeの明示ID対応・過去形式移行・全情報/世界/素材/公開版往復の総合受入 |
| WP17 | backend非依存の三方向merge・冪等ack・account境界契約 | 専用接続先・実Auth/RLS/private Storage・依存outbox rebase/実同期 |
| WP18 | allowlist・作者指定公開文/名前・公開ID投影・不変投影 | サーバー権限と素材/API/索引/秘密の実漏れ試験 |
| WP19 | 不変台詞ID・内容hash・原文変更時確認待ち・翻訳/収録フォーム | 分割/統合対応履歴・担当別出力/口調/用語の全受入 |
| WP20 | 非実行text・素材署名検査・安全URL・演出/資料フォーム | 全添付形式・素材版の変更影響・演出timecode受入 |
| WP21 | 制作段階別進捗・固有数/経路数分離・媒体確認待ち | 制作依存/見積/公開媒体差分の総合受入 |
| WP22 | 公開reader/汎用runtime/localization/consultation出力、対応範囲を限定した単体試遊ZIP | 未対応機能解消・別案取込と全互換性受入 |
| WP23 | Chromium/WebKit自動操作試験、決定的性能fixture | 104要件＋12総合、実iPhone/iPad/PC、VoiceOver/NVDA、性能/2時間試験 |
| WP24 | 利用/復元・依存版・公開workflowと証拠gate | 完成対象commit、費用/容量、全ガイド/互換表、公開後検証 |

## 外部条件

同期接続先は未指定。接続済みSupabaseには専用と確認できる `shinariokanri` projectがなく、別用途の `chameleonJP-Lab` projectへ書き込みをしていない。新規projectにはorganization・現行費用の確認が必要で、課金のある変更を自動実行していない。ローカル同期fixtureは実RLSの合格証拠ではない。

この環境には実iPhone/iPad/macOS Safari/VoiceOver/NVDAがない。自動WebKitをSafari実機の合格扱いにしない。公開は計画のWP23/WP24が完了するまで保留する。未実装部分も上表から削除せず、接続先や端末が必要な条件と分けて保持する。

## 部品検証の記録

2026-10-05の作業中ソースで、Vitest 255件、文書/公開gateのPython試験15件が合格した。生成JSON SchemaはAjv2020で実compileし、43kindの型と入れ子条件を検査している。production buildも成功した。これらは116受入ケースの完了結果ではない。

Chromium/WebKit各11件（計22件）のE2Eで、日本語・emojiの保存/再読込、完全ZIP作成と別ブラウザー領域への復元、幅320/390/768/1024/1440px、初期画面のaxe、条件付き選択/巻戻、固定版の経路記録/再生、不正JSONと保存失敗入力の再開保持を確認した。オフライン試験は独立配信サーバーを停止して、キャッシュからの再開/完全保存を検証した。WebKitのネットワーク切断フラグではengine内部エラーが発生したため、応答をmockせず実サーバー停止で確認した。ローカルFirefoxはprofile起動失敗のため未検証。版付きの最終結果はCIのbrowser-evidence artifactで保持する。初期画面のaxe成功を手動支援技術や全画面の合格に広げない。

基準版の保存APIは全履歴のbefore/afterを読み、履歴を含む構造・参照を再検査していた。RB01では変更行保存・内部差分履歴・編集起動時の履歴遅延読込へ変更し、取り込み時の完全検査と復元互換性を維持した。Standard 8,800件・実IndexedDB・production Chromiumの各30回で、保存区間p95は作品名714.2ms、本文577.5ms、複合573.1ms。測定条件・生データ・残条件は[RB01検証記録](../quality/rb01/README.md)を参照。実端末・添付付きLarge・UI全区間・2時間編集の合格は宣言していない。

RB02では型付き通常フォーム、作品別雛形、固定版参照、本文位置への移動、メモ変換、複合検索/保存一覧、日本語索引、一括変更/統合を追加した。作品ごとの未保存入力を保持し、保存待ちの画面移動後に追加入力が失われる競合を修正した。RB02だけを隔離したソースで単体441件（36ファイル）、文書/公開gateのPython試験15件とproduction buildが合格。独立レビューは固定版/統合/連続入力/保存競合を実画面で再現確認した。検索性能と段階ブラウザー結果は[RB02検証記録](../quality/rb02/README.md)に保持する。後続段階、116受入、実端末、実同期、完成版公開の完了とは区別する。

RB03では暦と相対日時の正規解決、日時の差分・承認・取消、重なりを保持する年表、関係表/図、地図、生涯/所属/所有/別名の時期別表示、共通世界の固定版と採用設定を追加した。借用した情報は本編へ複製せず、推移依存と旧版引用を含めて原子保存・完全保存・復元する。読み込みと保存の競合で旧履歴が新しい編集版へ付く問題も修正した。隔離ソースと通常画面の結果、独立レビューの範囲は[RB03検証記録](../quality/rb03/README.md)に記録する。これらの段階検査は116受入・実端末・実同期・完成版公開の合格結果ではない。 PR #6は最終CI（494単体・3ブラウザー96通常画面・9部品スクリプト）の合格後にmainへ取り込み済み。

RB04では作者別案の不変版・選択採用・完全保存/複製、構成の並べ替え・移動・筋からの除外、選んだ固定版での章試読と共有提示処理による記録保存を通常Appへ接続した。未保存の別案入力と本文リンクの固定版・文字位置も保持する。隔離した最終コードで単体541件（52ファイル）が合格した。基幹候補のproduction Chromium36件・実WebKit36件と構成の部品操作各4件、最終UIの保存競合・固定版リンクの厳密な部品検査各12群が合格した。追加の保存待ち・章記録再開を含む最終UIの通常画面4件も各ブラウザーで確認した。独立レビューは44コードhashを照合し、採用時の編集履歴・自動確認依頼・削除・複製・固定版由来別案の初回保存を再検証した。8件の不正な採用入力も原子拒否する。検証範囲と元の問題・修正は[RB04検証記録](../quality/rb04/INTEGRATION.md)に保持する。これらは116受入・実端末・実同期・完成版公開の合格結果ではない。
