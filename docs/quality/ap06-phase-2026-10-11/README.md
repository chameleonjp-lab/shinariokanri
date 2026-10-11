AP06のmain基準分離packageです。main `8285608c75791ed1ea01380751abb3805913b639` から作成し、AP03 package `4d0f844535e7976153514830809ca52a2734aa94` をこのbranchだけへローカルmergeしました。前提AP01/AP02/AP03のcommitを保持しています。AP03は[Draft PR46](https://github.com/chameleonjp-lab/shinariokanri/pull/46)で、工程受入とCI46は未観測です。mainや前提PRをmergeしたという意味ではありません。

対象はG11/G12/G14、原E05/E06/E09/N07/N08/N17/N20とAC-G11-N/E・AC-G12-N/E・AC-G14-N/Eです。工程の原REQ/WPと成果物は[原計画](../../review-2026-10-11/IMPLEMENTATION_PLAN.md)と[phase-source.json](phase-source.json)に保持します。原104要件・116ケース/464条項・24工程・6回帰群・元fixture・閾値・公開gateは変更していません。

工程固有の製品修復は、受取契約のmetadata検査と制作対応先の選択・不一致表示です。`592d29e` / `7271171` のreceiver補修を選択し、`70fa53b` のexports 11 hunksのうちruntime-targetの2〜9、WorkPage、runtimeTargetCompatibility testだけを分割しました。AP04のpublicCatalog import・reader index renderer・CatalogPanel・JapaneseIndexEntryEditor・readerPublicIndex test、AP04の借用/関係/構造/復元UI製品は含めていません。

実装済みの対応先はscenario-runtime profile1.1.0のみです。Unity/Unreal/ink/Yarnは互換確認用の選択先として実行用出力を拒否します。自動fallbackはありません。作者がreader目的とbody-only公開範囲を明示して選び直した場合だけ本文を出します。任意外部commandの意味や実ゲームでの実行は実装・実証していません。

source authoring snapshotは `4a435029e13a5e27af208b7ebe3c939bf0baa7e8` / tree `5e058d4969d011eac423ef760bc0a81f24aaf15d` です。これはこのpackageの製品・test・原資料を固定したcommitで、buildと受入の証拠ではありません。文書の追記後はphase-sourceのsource/test/dependency hashesと最終tipを別に照合します。

| AP06 phaseの確認 | 状態 |
| --- | --- |
| patch分離と元exportsへの再結合、原資料bytes/hash、非生成の相対import存在、未生成依存の識別、proof原4節/依存SHA、差分のscope/空白 | source-only静的確認。実行結果はphase-sourceに記録 |
| syntax parser / typecheck | NOT_RUN（既存TypeScript7 native配布にcompiler APIがなく、fresh phase依存は未install） |
| dependency install / portable runtime / browser-game生成 | NOT_RUN |
| production build / build-info / source-dist前後binding | NOT_RUN |
| whole/focused unit / N20通常UI / 汎用受取例・receipt実往復 | NOT_RUN |
| 専用5役割/二実端末/直接Auth・RLS・private Storage・quota境界 | NOT_RUN・専用接続条件未指定 |
| hosted CI / 原116の工程受入 / release | NOT_RUN |

[N20 authored proof](../ap04-2026-10-11/ap04-original-n20-target-proof.json)と原local_acceptance_planは元4節をそのまま保持し、全not_runです。source hashをこの工程の実bytesへ更新しましたが、統合候補b56e8b9やPR44 CIの成功は転記していません。補助正常fixtureの成功が後に得られても、原未対応command givenの成功とは別に扱います。既存[receiver診断説明](../../implementation/AP06_GAME_RECEIVER.md)にある過去診断は、その記載対象の部品観測です。

[公開上限資料](../runtime-2026-10-11/ap06-public-limits/fetch-manifest.json)は取得済み原bytesとSHAを変更せず保持しています。公式公表値は専用tenantの契約・設定・残枠・費用ゼロの実証ではありません。[実環境残条件](../../implementation/EXTERNAL_CONDITIONS.md)と[既存read-only discovery](../runtime-2026-10-11/external-prerequisites.json)の時刻・対象を保持し、工程branchで再実行したと扱いません。Supabase migration、DBデータ、権限、Storage、課金を変更していません。

次の独立検証はこのphase tipで依存を用意し、portable/runtime/browser-gameを生成（exportsのgenerated/runtime.js等へのraw importは未生成のため、この時点では不存在）、production buildのcommit/tree/base/dirty/versionと前後hashを固定してから行います。focused receiver・target unit、N20実UI、実ファイル選択→独立汎用browser受領→receipt持帰りを元guardとtimeoutで検査し、raw結果/入力/出力/trace/manifestを別runへ保持します。G11/G12と原E09/N17の実条件は、その専用接続先・5役割・二端末・実容量/配信情報が揃った範囲だけ実行し、未取得条件を残します。

工程固有commitを戻せばreceiver/selector補修を戻せます。native1.0.0 / runtime形式1.0.0 / profile1.1.0 / browser-game1.0.0と保存schemaは維持します。生成artifactは戻したsourceから再生成してhashを固定します。公開・main merge・外部DB変更・push/PR作成はこのsource package準備では行っていません。
