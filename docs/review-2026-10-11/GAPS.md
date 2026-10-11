# 不足と残る確認16件

原104の完成を妨げる差分と、まだ確認していない条件を分けた。P0はデータ復元/統合を先に扱うもの、P1は完成前に必要な修正または受入で、機能を除外する優先度ではない。実装の不在を確認していない項目は確認待ちと記す。

| ID | 優先 | 分類 | 残件 |
| --- | --- | --- | --- |
| G01 | P0 | main未反映 | 後続修正をmainへまとめた製品版がない |
| G02 | P1 | 既知の製品差分 | 通常本文で名前リンク候補を除外できない |
| G03 | P1 | 既知の製品差分 | 相談用出力へ前後状態を通常画面から渡せない |
| G04 | P0 | 既知の製品差分 | 旧保存領域の移行失敗後に通常再試行で戻れない |
| G05 | P0 | 既存の失敗 | Largeの113履歴を含む完全保存が時間切れになる |
| G06 | P1 | 最終確認待ち | 全104要件・116受入の最終判定が揃っていない |
| G07 | P1 | 引渡し待ち | 別環境でも取り出せる最終証拠の引渡しが未確認 |
| G08 | P1 | 記録の入口 | mainの現在照合表が古い候補を入口にしている |
| G09 | P1 | 実環境確認待ち | 実iPhone/iPadで全編集とFiles往復を確認していない |
| G10 | P1 | 実環境確認待ち | 読み上げと200%表示の手動受入が残る |
| G11 | P1 | 実環境確認待ち | 専用接続先で同期・5役割・素材の実権限を確認していない |
| G12 | P1 | 配備条件待ち | 実接続先の容量・送信上限・費用が未確定 |
| G13 | P1 | 最終確認待ち | 同じ最終候補の全性能条件と2時間後の復元が未合格 |
| G14 | P1 | 最終確認待ち | 出力・固定版・ゲーム受取の全互換範囲の最終確認が残る |
| G15 | P1 | 最終確認待ち | 更新・移行・容量不足の一連の最終受入が残る |
| G16 | P1 | 通常操作確認待ち | 外部環境なしで追加確認できる原操作が残る |

## G01 後続修正をmainへまとめた製品版がない

**確認した事実**: PR #38〜#42は2026-10-11 09:31〜09:32 JSTにfix/rb10-read-batchesへ統合された。mainはその直前の#37までであり、22個の製品・検査・CIファイルが異なる。

**対応**: 各PRの差分と競合を確認し、main向けの一つの統合候補を作る。製品コード・元検査・文書を保持し、同じ候補を再検査する。

**正常時の終了条件**: 統合候補に#38/#39/#40/#41の製品修正と#42の版別記録があり、主要回帰検査が同じ製品版で成功する。

**失敗/境界で守る条件**: mainや元の作業ブランチを書き換えない。古い結果を新しい候補へコピーしない。競合では両方の修正意図を確認し、同一候補で失敗を記録する。

対応する原要件: REQ-F27、REQ-F35、REQ-F36、REQ-N04、REQ-N05、REQ-N06、REQ-N14、REQ-N18。変更/確認の入口: `src/App.tsx`、`src/ui/TextAnnotations.tsx`、`src/ui/WorkPage.tsx`、`src/storage/archiveData.ts`、`src/storage/store.ts`。

根拠: GitHub PR metadata + git diff origin/main..origin/fix/rb10-read-batches。今回の実操作再実行は0。追加確認ID: `AC-G01-N` / `AC-G01-E`。

## G02 通常本文で名前リンク候補を除外できない

**確認した事実**: mainの表示条件は候補除外用callbackを要求する。C29証拠資料も、通常本文でボタンが表示されず時間切れになったことを記録している。#38に修正がある。

**対応**: #38の修正を統合候補へ取り込み、一般語・同名・複数出現・Unicodeとアカウント/作品/本文ごとの除外を通常操作で確認する。

**正常時の終了条件**: 二つの名前を異なる人物へリンクし、一般語を除外して再読込後も候補と逆参照が正しい。

**失敗/境界で守る条件**: 除外は別アカウントや別作品へ漏れない。確定リンクは消えず、除外解除と再保存を確認できる。

対応する原要件: REQ-F27、REQ-F57、REQ-F60。変更/確認の入口: `src/ui/TextAnnotations.tsx`、`src/ui/linkCandidatePreferences.ts`、`src/ui/Fields.tsx`。

根拠: PR #38; C29 CURRENT_EVIDENCE; main TextAnnotations source。今回の実操作再実行は0。追加確認ID: `AC-G02-N` / `AC-G02-E`。

## G03 相談用出力へ前後状態を通常画面から渡せない

**確認した事実**: mainの出力画面は相談対象の前後状態を指定しない。C29の実ファイルには前後の状態が未指定となった記録がある。#39に入力と保持の修正がある。

**対応**: 対象場面・開始/終了状態・公開範囲・対象版を通常フォームへ接続し、原設定と未確定事項を持つ相談文を出す。

**正常時の終了条件**: 同一場面の前後状態を選び、公開範囲を確認して実ファイルへ出し、出所付き提案を別案として読み込める。

**失敗/境界で守る条件**: 秘密と作者メモを出さない。出力/保存失敗後も入力を保持し、版変更後は再確認する。AIサービスへ自動送信しない。

対応する原要件: REQ-F36、REQ-F16、REQ-N18、REQ-N19。変更/確認の入口: `src/ui/WorkPage.tsx`、`src/domain/exports.ts`、`src/ui/AuthorAlternativeStudio.tsx`。

根拠: PR #39; C29 CURRENT_EVIDENCE; exports consultation branch。今回の実操作再実行は0。追加確認ID: `AC-G03-N` / `AC-G03-E`。

## G04 旧保存領域の移行失敗後に通常再試行で戻れない

**確認した事実**: C29では旧保存領域の移行を容量不足で拒否した後、元の保存内容は残るが通常再試行で同じ失敗状態に留まった。#41に再試行と取消の修正がある。

**対応**: 旧DBの原子拒否後に同じアカウントで開き直し、下書き/固定世界を再読込する。取消と遅延通知を区別する。

**正常時の終了条件**: 一度容量不足で失敗させ、通常の再試行だけで旧作品を開き、cold再読込・完全出力・空環境復元できる。

**失敗/境界で守る条件**: 二度失敗・取消・遅れて届く成功でも元DBと作品を壊さない。保存済み移行を取消で戻したとは表示しない。

対応する原要件: REQ-B23、REQ-F35、REQ-N06、REQ-N18。変更/確認の入口: `src/App.tsx`、`src/storage/store.ts`、`src/ui/authorOperation.ts`。

根拠: PR #41; C29 CURRENT_EVIDENCE; RB06_STARTUP_MIGRATION_RETRY。今回の実操作再実行は0。追加確認ID: `AC-G04-N` / `AC-G04-E`。

## G05 Largeの113履歴を含む完全保存が時間切れになる

**確認した事実**: 元88,003記録・72MiB素材・113履歴/送信待ちの完全出力は、C29と後続製品修正4232966で600,000ms以内にファイルを得られなかったと閉鎖記録にある。#40統合済みだけでは解消といえない。原因は未確定。

**対応**: 履歴読込・記録検証・共有解除・圧縮・ダウンロードの区間を測る。全履歴と全検証を維持し、限定した不変内容の再利用と分割処理を検討する。

**正常時の終了条件**: 同じLarge入力と113操作を使用し、元600,000ms以内に完全ファイルを得て、空環境new/clone/coldで全記録・全素材hash・履歴・送信待ち・順序が一致する。

**失敗/境界で守る条件**: 進捗2秒以降・取消・容量不足・最終段破損・未知形式を確認する。履歴削減、素材除外、検査省略、上限延長を合格手段にしない。

対応する原要件: REQ-B12、REQ-B23、REQ-F35、REQ-N04、REQ-N05、REQ-N06、REQ-N09、REQ-N12、REQ-N14。変更/確認の入口: `src/storage/archiveData.ts`、`src/storage/archiveExport.worker.ts`、`src/storage/recovery.ts`、`src/storage/store.ts`、`src/domain/projectRecordValidation.ts`。

根拠: FOLLOW_UP_CANDIDATES 2026-10-10T23:40:46Z / raw d1282213…3233ac9; RB06_LARGE_HISTORY_EXPORT。今回の実操作再実行は0。追加確認ID: `AC-G05-N` / `AC-G05-E`。

## G06 全104要件・116受入の最終判定が揃っていない

**確認した事実**: 設計レジストリとC29監査では原116ケースの最終結果が全てnot_run。局所の28ケース全節・29部分・59未判定と、464節の166直接/40部分/258未判定は最終完成数ではない。

**対応**: 同一完成候補を固定して原条件の正常/境界/失敗を全件記録する。原条件、元24工程、6回帰群を保持して不足証拠を埋める。

**正常時の終了条件**: 116ケースそれぞれに原4節、入力・手順・正常/失敗の実結果・環境・対象版・実証拠があり、24工程と6回帰群の完了条件も満たす。

**失敗/境界で守る条件**: 部品/CI/局所の成功、別版の結果、未実行を最終合格へ変換しない。失敗または未確認が残れば公開gateは拒否する。

対応する原要件: 全104要件。変更/確認の入口: `scripts/check_release.py`、`docs/data/completion_acceptance.json`、`docs/plan/COMPLETION_ACCEPTANCE.md`。

根拠: docs/data/completion_acceptance.json; follow-up current-implementation literal registries。今回の実操作再実行は0。追加確認ID: `AC-G06-N` / `AC-G06-E`。

## G07 別環境でも取り出せる最終証拠の引渡しが未確認

**確認した事実**: C29資料は約1.85GBの閉鎖証拠が一時作業場所にあり、GitHubから全binaryを取れるとは認定していないと記載する。今回その全bytesは取得・再照合していない。

**対応**: 全証拠を一つの巨大PRに再複製せず、固定manifest・hash・取得先・保存期間・不足時の復帰手順を持つ引渡しを作る。携帯で読める要約を添える。

**正常時の終了条件**: 新しい空の作業環境で必要な証拠を取得し、保存されたmanifestのhashと対象版を確認できる。

**失敗/境界で守る条件**: 一時パス、metadataのみ、リンク切れは証拠引渡し成功にしない。本文/秘密/認証情報を公開証拠へ混ぜない。

対応する原要件: REQ-N12、REQ-N14、REQ-N17。変更/確認の入口: `docs/implementation/RELEASE.md`、`scripts/check_release.py`、`docs/quality/current-review/current-implementation.json`。

根拠: C29 CURRENT_EVIDENCE: evidence bytes and delivery limitation。今回の実操作再実行は0。追加確認ID: `AC-G07-N` / `AC-G07-E`。

## G08 mainの現在照合表が古い候補を入口にしている

**確認した事実**: mainの現在照合表とJSONはC15が先頭の対象で、製品treeはC29と同じ。#42の最新照合は作業ブランチ側にある。設計時のplanned/not_runも現在合否とは別である。

**対応**: 最新の対象版と確認日時を明示する入口を追加し、設計資料・歴史結果・現在の結果を参照で結ぶ。旧原文を上書きしない。

**正常時の終了条件**: 入口からmain基準、作業ブランチ、各実行対象の製品hashと未完了条件へたどれる。

**失敗/境界で守る条件**: 過去のnot_runや古い不具合を現在合否として再計上しない。文書commitを検査した製品commitに置き換えない。

対応する原要件: REQ-N12、REQ-N17、REQ-N19。変更/確認の入口: `docs/README.md`、`docs/quality/current-review/CURRENT_REQUIREMENTS.md`、`docs/quality/current-review/current-implementation.json`、`docs/implementation/PROGRESS.md`。

根拠: main CURRENT_REQUIREMENTS / JSON target_binding vs main tree / follow-up #42。今回の実操作再実行は0。追加確認ID: `AC-G08-N` / `AC-G08-E`。

## G09 実iPhone/iPadで全編集とFiles往復を確認していない

**確認した事実**: 既存記録は実iPhone/iPad、実OS/ブラウザー、入力変換、Files、録音、回転/分割の総合受入を未実行としている。Linux WebKit成功から実Safari合格は判断できない。

**対応**: 本人のiPhone 17 Proを主端末とした短い手順を用意する。PCの開発画面を使わず登録→編集→試読→保存→Files→空環境復元を行う。

**正常時の終了条件**: 実版を記録し、縦横/文字拡大/下側入力/画面キーボード/通信なしで同じIDと入力を保持できる。

**失敗/境界で守る条件**: マイク拒否、Files取消、容量不足、通信断、未取得素材でも保存済み作品を残し、失敗箇所と再開方法を示す。

対応する原要件: REQ-B24、REQ-F01、REQ-F31、REQ-F32、REQ-F33、REQ-N01、REQ-N02、REQ-N11、REQ-N13、REQ-N14、REQ-N18。変更/確認の入口: `src/App.tsx`、`src/ui/BackupPanel.tsx`、`src/ui/Timeline.tsx`、`src/ui/Relationships.tsx`、`docs/spec/UI_UX.md`。

根拠: EXTERNAL_CONDITIONS; follow-up C29 manual review conditions。今回の実操作再実行は0。追加確認ID: `AC-G09-N` / `AC-G09-E`。

## G10 読み上げと200%表示の手動受入が残る

**確認した事実**: VoiceOver/NVDA、実OSキーボード、200%表示、図の代替の最終手動受入は未実行。自動検査だけでは全条件を確定できない。

**対応**: 追加/修正画面も含めフォーカス順・読み上げ名称・図の表代替・取消後復帰・仮想一覧の末尾まで確認する。

**正常時の終了条件**: 主操作をキーボード/読み上げで完了し、選択先が隠れず、拡大でも本文と警告を読める。

**失敗/境界で守る条件**: 色だけで結果を区別せず、モーダルで移動不能にしない。ピンチ無効化等を理由に200%の文字表示確認を省かない。

対応する原要件: REQ-B24、REQ-F31、REQ-F32、REQ-N03、REQ-N18。変更/確認の入口: `src/ui/components.tsx`、`src/ui/Timeline.tsx`、`src/ui/Relationships.tsx`、`src/ui/WindowedList.tsx`、`docs/spec/UI_UX.md`。

根拠: N03/UI_UX; official RS18/RS19。今回の実操作再実行は0。追加確認ID: `AC-G10-N` / `AC-G10-E`。

## G11 専用接続先で同期・5役割・素材の実権限を確認していない

**確認した事実**: 画面・送信待ち・競合・9 migration・API準備はある。専用HTTPS/Auth/private Storage、5役割、実二端末と直接APIの受入が未実施。実験場のキーを流用しない。

**対応**: 専用構成を具体化し、送信確認/再送/同じ本文の競合/削除対編集/権限撤回/アカウント切替を通常操作と直接APIで確認する。

**正常時の終了条件**: owner/editor/reviewer/reader/nonmemberの5実アカウントで許可表どおりに取得・編集・指摘・素材取得でき、実二端末で競合を解決する。

**失敗/境界で守る条件**: 非メンバー、失効、撤回、重複再送、古い権限、公開索引/件数/素材URLから秘密が取得できない。無許可の外部DB変更・課金をしない。

対応する原要件: REQ-F29、REQ-F30、REQ-F34、REQ-N07、REQ-N08。変更/確認の入口: `src/sync/supabaseClient.ts`、`src/sync/edgeEntry.ts`、`src/sync/editorStore.ts`、`src/sync/publicShare.ts`、`supabase/migrations`、`scripts/sync`。

根拠: RB09_SYNC_SHARING; EXTERNAL_CONDITIONS; RS20/RS21/RS22。今回の実操作再実行は0。追加確認ID: `AC-G11-N` / `AC-G11-E`。

## G12 実接続先の容量・送信上限・費用が未確定

**確認した事実**: 公表値の過去確認と専用tenantの現設定は別。アプリの完全ファイル上限、単一素材上限、配信先/素材サービスの上限と残量を同じ値とはみなせない。

**対応**: 接続先が決まった時点で現行の無料範囲、1ファイル/通信/DB/認証/配信の上限と実使用量を記録し、超過時のローカル継続を確認する。

**正常時の終了条件**: 実構成と対象日を添えた容量/費用表と上限直前・直後の試験があり、新しい課金を前提にしない。

**失敗/境界で守る条件**: 枠不足・upload拒否・通信制限でも元作品/素材/送信待ちを保つ。文書だけで費用ゼロやアップロード可能と断定しない。

対応する原要件: REQ-N04、REQ-N05、REQ-N08、REQ-N17、REQ-N20。変更/確認の入口: `docs/implementation/EXTERNAL_CONDITIONS.md`、`src/sync/archiveTransfer.ts`、`src/sync/nativeBridge.ts`。

根拠: EXTERNAL_CONDITIONS; original FILE_FORMAT/N17; live tenant not designated。今回の実操作再実行は0。追加確認ID: `AC-G12-N` / `AC-G12-E`。

## G13 同じ最終候補の全性能条件と2時間後の復元が未合格

**確認した事実**: Standard/Largeの局所30回成功は保持するが、2時間112編集後の完全保存失敗が残る。実端末と最終統合候補の全性能を満たした証拠は揃っていない。

**対応**: 元のseed/平均文字数/関連データ/素材量で全指標を30回測る。2時間の編集後に外部ファイルの空環境復元まで実行する。

**正常時の終了条件**: Standard 200ms/検索500ms/保存1000ms/起動3秒/図33.4msとLarge検索2秒/初回10秒の各p95を満たし、2時間後も全内容を復元する。

**失敗/境界で守る条件**: 入力待ち500msを保存時間から外す規則、元終点、実素材、元件数、元上限を維持する。診断数回・異なる候補・仮想端末から実端末の合格を作らない。

対応する原要件: REQ-N04、REQ-N05、REQ-N11、REQ-N12、REQ-N14。変更/確認の入口: `docs/spec/NONFUNCTIONAL_REQUIREMENTS.md`、`src/performance.ts`、`src/testing/performanceFixture.ts`、`tests/performanceFixture.test.ts`。

根拠: original NONFUNCTIONAL_REQUIREMENTS; C29/FOLLOW_UP_CANDIDATES。今回の実操作再実行は0。追加確認ID: `AC-G13-N` / `AC-G13-E`。

## G14 出力・固定版・ゲーム受取の全互換範囲の最終確認が残る

**確認した事実**: 再利用の解決・公開投影・汎用ブラウザー受取例は接続済み。昔の未対応メッセージだけでは現在不足といえない。全原ケースの最終結果は未確定。

**対応**: 宣言した実対応の条件・効果・ID・固定世界・部分上書き・公開範囲・台詞/素材を出力先ごとに確認し、実受領結果を同じ対象版へ戻す。

**正常時の終了条件**: 各対応プロファイルが実ファイルと受領版/hashを持ち、原条件に沿って未対応を明示する。旧公開版の内容を保持する。

**失敗/境界で守る条件**: 作者メモ/秘密/私有素材を出さず、未対応engine/commandや版/hash不一致を拒否する。全engine対応と表記しない。

対応する原要件: REQ-F19、REQ-F21、REQ-F24、REQ-F42、REQ-F54、REQ-N08、REQ-N19、REQ-N20。変更/確認の入口: `src/domain/exports.ts`、`src/domain/gameProtocol.ts`、`src/domain/projection.ts`、`src/portable/gameReceiver.ts`、`docs/implementation/EXPORT_COMPATIBILITY.md`。

根拠: exports/gameProtocol/source; EXPORT_COMPATIBILITY; C29 static note about resolveReuseContent。今回の実操作再実行は0。追加確認ID: `AC-G14-N` / `AC-G14-E`。

## G15 更新・移行・容量不足の一連の最終受入が残る

**確認した事実**: 更新待ちの配信処理、版付き保存形式、履歴・復元処理はある。旧アプリから更新し、入力/送信待ち/世界/素材を保った実端末の総合受入は未確認。

**対応**: 旧build・旧完全ファイルを固定してコピー上の移行、拒否、取消、更新待ち、複数タブ、再試行、再起動を確認する。

**正常時の終了条件**: 更新の前後で同じ全ID/内容/履歴/送信待ちを確認でき、実完全ファイルを空環境へ復元できる。

**失敗/境界で守る条件**: 未知版・破損・容量不足・遅延完了・途中取消で現在作品を壊さない。更新で未保存入力を消さず、未取得アプリを通信なしで利用可能と偽表示しない。

対応する原要件: REQ-B12、REQ-B23、REQ-F35、REQ-N06、REQ-N09、REQ-N11、REQ-N14、REQ-N18、REQ-N19。変更/確認の入口: `scripts/build/service-worker.mjs`、`src/storage/recovery.ts`、`src/storage/readValidationCore.ts`、`src/ui/BackupPanel.tsx`、`src/App.tsx`。

根拠: original AT-E12/N06/N09/N11; #41 scoped verification only。今回の実操作再実行は0。追加確認ID: `AC-G15-N` / `AC-G15-E`。

## G16 外部環境なしで追加確認できる原操作が残る

**確認した事実**: C29の原句表には、人物の改名/復元、同じ発火ID再送、旧版開始状態の選択、素材だけの差替え、同fixtureの逆順二案等の追加観測が残る。全てを実端末待ちにはできない。

**対応**: 原116ケース表の未観測/部分観測を各操作のまま試す。別対象の似た操作で代用せず、明確な不一致だけを修正候補にする。

**正常時の終了条件**: 同じgivenで本人の通常操作からwhenを実行し、thenとnegative_or_edgeを確定した原文どおりに観測する。

**失敗/境界で守る条件**: 台詞の改名を人物の改名に換算しない。初期条件・対象版・未定義状態・素材欠落を都合のよいfixtureへ置換しない。外部条件が要る部分は理由付き未実行として残す。

対応する原要件: REQ-B01、REQ-B10、REQ-B23、REQ-F01、REQ-F02、REQ-F14、REQ-F15、REQ-F18、REQ-F21、REQ-F22、REQ-F23、REQ-F26、REQ-F36、REQ-F48、REQ-F53、REQ-F56、REQ-F58、REQ-F60。変更/確認の入口: `tests/e2e`、`src/ui/Reader.tsx`、`src/ui/ProductionTools.tsx`、`src/ui/WorldCalendars.tsx`、`src/ui/AuthorAlternativeStudio.tsx`。

根拠: C29 current-implementation literal_clause_results and remaining_conditions。今回の実操作再実行は0。追加確認ID: `AC-G16-N` / `AC-G16-E`。
