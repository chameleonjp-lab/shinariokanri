# 要件仕様書 — 原仕様の修復と追加候補

仕様版: 1.0 / 調査基準: 2026-10-11。この文書は実装前のレビュー仕様である。原104要件は既に完成対象であり、新規候補X01〜X12は提案として扱う。本PRは製品コードや保存形式を変更しない。

## 1. 適用範囲と優先規則

原仕様の必須動作は[原要件](../spec/REQUIREMENTS.md)、[データ](../spec/DATA_MODEL.md)、[動作契約](../spec/BEHAVIOR_CONTRACT.md)、[画面](../spec/UI_UX.md)、[同期と権限](../spec/SYNC_SECURITY.md)、[完全形式](../spec/FILE_FORMAT.md)、[品質](../spec/NONFUNCTIONAL_REQUIREMENTS.md)を維持する。原文は[104件の比較データ](requirements_audit.json)にコピーして照合する。原104/原24工程/原116受入/6回帰群を追加候補の都合で減らさない。

既知の差分はG01〜G05、未確認と引渡し条件はG06〜G16を規定する。Xは原F/B/Nとは別IDであり、原計画の機能を新規として数えない。P0/P1/P2は着手順の提案で、採用済み要件を完成対象から除く意味ではない。追加案の採用は対象X、保存schema、互換性、対応AC、担当と見積を持つPRで記録する。

基準main/C29/後続候補/今回の文書commitを分ける。製品tree/ビルドhash/配信baseが違えば別対象である。個別PRのCI成功を新統合候補の操作成功として転記しない。

## 2. 全追加機能へ適用する共通契約

| ID | 必須条件 |
| --- | --- |
| C01 版と正本 | 保存操作はprojectId、UUIDのoperationId、baseRevision、対象ID、確認した内容hashを持つ。Revisionは非負整数の10進文字列。端末時刻を競合の勝者に使わない。確認中に正本が変われば再確認し、全体を黙って確定しない |
| C02 原子性 | 読込→隔離解析→参照/型/上限検査→影響確認→一操作として確定→再読込の順とする。確定前の取消/失敗は正本・固定版・素材参照・履歴・送信待ちを不変にする。確定後の取消は新revisionの補償操作で、保存の取り消しが成立したと偽表示しない |
| C03 下書き | 保存失敗・容量不足・確認不足でも入力を保持し、対象欄と次の操作を示す。元データ、選択範囲、失敗した表を勝手に削除しない。下書きの復帰はaccount/project/対象版で分離する |
| C04 文字とID | 原文を勝手に正規化しない。Unicodeコードポイントで範囲を数え、IDを名前・順番から生成しない。既存Block/Line/Entity IDを保持し、複製と分割/統合は元→新の対応を残す。追従不明の注記を別の文字へ黙って移さない |
| C05 権限と秘密 | 個人privateはowner、teamは許可されたowner/editor、reviewer/readerは許可済み投影だけ、nonmemberは取得不可。役割検査は画面とAPI/Storageの両方へ適用する。索引・件数・候補・図・エラー・素材URLも同じ投影から生成する |
| C06 読取と派生物 | 比較・検索・案内・集計だけでは正本を変えない。索引/画面設定/receiptは再生成可能な端末派生物。読み込み途中を「変更なし」「0件」「正常」と表示しない。失効した権限の派生物を別アカウントへ持ち越さない |
| C07 不変版 | 公開snapshot、世界snapshot、旧traceは変更不可。現稿の操作は新revision/新snapshotを作る。過去の開始状態を新版へ無検査で差し替えない。作者別案と実行分岐は別の型/操作で扱う |
| C08 エラー | 原共通エラーを使い、位置・理由・元データの保持・再開手順を平易に表示する。容量はQUOTA_EXCEEDED、版衝突はREVISION_CONFLICT/SYNC_CONFLICT、破損はHASH_MISMATCH/INTEGRITY_FAILED、未対応はFORMAT_UNSUPPORTED/EXPORT_UNSUPPORTED、取消はCANCELLEDへ対応させる。新内部理由はエラーdetailとして版を宣言する |
| C09 操作性 | iPhone 17 Pro単独で主操作・確認・保存・Files選択・再開を完了する。タップ対象44px以上/推奨48px、ドラッグの代替、キーボード/読み上げ、200%表示を用意する。初回案内が既存の全機能への入口を奪わない |
| C10 応答と上限 | 原Standard/Largeのp95・件数・実素材・archive上限を維持する。2秒を超える処理には進捗と取消、段階名を表示する。上限で停止した探索・未読込・外部値不明を成功へ換算しない。Large完全出力600000msの元条件を延ばさない |
| C11 外部送信 | 原稿/秘密/認証情報の自動外部送信、有料サービスの自動購入、別用途DBの流用を要件にしない。相談文は手動出力、追加案の定期通知は初版ではアプリ内の任意表示に限定する |
| C12 合否の記録 | passed/failed/blocked/not_run/cancelledを区別する。対象commit/tree/build/base、入力hash/seed、実環境、手順、正常/失敗の実結果、証拠hash/取得先、日時を記録する。今回の文書検査から製品受入合格を生成しない |

標準の保存フローは全体を一つの作者操作として履歴/送信待ちへ接続する。CSVの一部採用は対象選択後の新しい確認planを作り、そのplan全体を原子的に確定する。同じoperationIdの再試行は同一内容だけを一回適用し、異なる内容の使い回しを拒否する。

## 3. 保存データと互換性

現行mainのProject/完全packageは1.0.0で、読込側は同版と既知requiredFeaturesを検査する。追加の永続レコードが必要な採用では、**次期のProject/完全packageを1.1.0、minimumReaderVersionも1.1.0**として別PRで実装する。これは将来の実装条件で、現行を対応済みとは表示しない。派生UIだけの追加では正本schemaを変更しない。

移行は1.0.0のコピー上で全レコード・世界・固定版・113履歴/送信待ちを検査して行い、旧完全ファイルを保持する。追加項目は未設定/空として既存の表示と意味を保つ。移行失敗は元領域を不変にし、旧readerへ新形式を強制読込しない。旧buildへ戻す場合は旧形式のbackupを使う。未知major/必須機能/保存必須項目は拒否し、未知項目の切り捨てで合格しない。

新レコードの保存先は次のように固定する。既存kindの任意payloadへ無検証で詰め込まない。

| データ | 保存と持ち出し |
| --- | --- |
| 案内・横断検索範囲・BackupReceipt・比較表示・試読へ戻る位置 | accountScope/projectIdごとの端末設定。完全packageの正本へ含めず、機密本文を診断ログに記録しない |
| 置換確認plan・翻訳取込preview | 未確定の端末下書き。確定した本文/翻訳と元→新の対応は既存の作者履歴へ保存 |
| 言語規則・NarrativeTest/RegressionSuite・素材利用条件・WritingGoal・Twee ImportSource | 型付きの作品拡張レコード。共通UUID/project/revision/visibilityと参照検査、固定版、履歴、完全保存、複製ID map、秘密投影を1.1.0で対応させる |
| 検査結果/TestRun | 固定対象hash/suiteHashに結ぶ作品内検証記録。元版の秘密/実測情報を含み得るのでprivateが既定。公開プロフィールへ含める場合は明示許可と再投影を必要とする |

作品拡張は `extensions` の版付きmapとし、採用済みのキー `localizationRules / narrativeTests / assetUsagePolicies / writingGoals / importSources / testRuns` だけをschemaに宣言する。各配列は全件100000記録上限/JSON深さ・総object数/全bytesの予算にも算入し、既存record_dictionaryとの辞書参照は同じ検証を通す。snapshot/作者別案の内容にも同じ意味で保存する。未採用キーは初版schemaに増やさない。新DBの具体番号は実装開始時の最新schemaに基づき決め、アーカイブ形式版とDB番号を同一視しない。

同期では作品拡張ごとに原役割表、サーバー検証、競合単位、再送のoperationIdを追加し、RLSとAPI grantsとprivate Storageを個別に確認する。完全保存には復元に必要な履歴/送信待ちを現行実装契約どおり保持し、token/session/実membership/接続先秘密を含めない。公開出力は正本から選択・投影して作る。

## 4. 既存範囲の修復・確認仕様

[GAPS.md](GAPS.md)のG01〜G16の正常終了条件と失敗条件をこの仕様の必須条件とする。AC-Gxx-N/Eは追加した確認で、元のATを置換しない。

| 修復/確認 | 厳密な終了条件 |
| --- | --- |
| G01 | #38〜#42の差分を保持する一つのmain向け候補を作り、同じtree/build/baseで再検査する |
| G02/G03/G04 | 通常本文の候補除外、相談の前後指定、旧DB失敗後の再試行が、保存/cold/完全復元まで成立する。取消と二度失敗は原子性を守る |
| G05/G13/G15 | 元88,003記録/72MiB実素材/113履歴・送信待ちを保持し、2時間112編集後の実ファイル生成→空new/clone/cold復元を完了する。元600000ms・元性能30回・安全上限を維持する |
| G06/G16 | 元116ケースの4節を全て構成・操作・観測し、元24工程/6回帰群へ対応させる。単体・部分・別版を最終成功としない |
| G07/G08 | 固定版と取得可能な証拠を入口から追え、別環境でhash照合できる。未取得bytesの範囲を明記する |
| G09/G10 | 原全端末条件に沿う実iPhone/iPad/PC、Files/入力/録音/通信なし、支援技術と拡大の実操作を残す |
| G11/G12/G14 | 専用同期で5役割/二端末/直接API/private素材を確認し、現行上限/費用/対応形式と汎用受取例を実測・版別に記録する |

## 5. 追加機能の個別仕様

以下のshall/失敗/データ/境界は採用したXに対して必須である。関連原要件は維持し、各Xは3件の追加ACと共通C01〜C12を同時に満たす。

### X01 用途別の入口と初回の短い案内

**追加する理由**: iPhoneで、使う順番を知らなくても人物→場面→本文→確認→保存を始められる。

**既存との差**: 雛形・表示設定・サンプル作品は既にある。次の一操作を示す案内、ゲーム/小説/動画ごとの入口を追加する。

**必須動作**: 新規作品で用途を選ぶと、人物登録・最初の場面・本文・試読・完全保存への5段階以下の案内を表示する。全機能への入口、案内を閉じる/再開する操作を常に残す。

**データ**: 端末設定: accountScope/projectId/preset(game|novel|video|all)/guideVersion/step(0..5)/dismissed。作品内容の正本は複製しない。

**失敗時**: 案内を閉じても本文/下書きを消さず、別用途へ切り替えても隠したデータを削除しない。案内状態の保存失敗は本文保存の失敗と区別する。

**具体的な規則**: 用途切替は画面の並びと次の案内だけを変える。stepは0=未開始、1=人物、2=場面、3=本文、4=試読、5=完全保存の確認。step5の完了は生成のみと実ファイル検査済みを区別する。guideVersion不一致は案内を初期化しても本文と下書きは保持する。

**正常合格**: 空作品から用途を選び、人物・場面・本文・試読・完全保存を案内だけで完了する。閉じて再開できる。

**例外合格**: 途中入力、保存失敗、用途変更、別アカウント、縦横/200%/VoiceOverでも主操作を失わない。

**境界合格**: 既存作品はall相当から開始し、全画面へ戻れる。案内を終了済みでも再表示できる。

関連: REQ-F02、REQ-F31、REQ-F33、REQ-N01。依存: 共通契約/原保存基盤。追加AC: AC-X01-N、AC-X01-E、AC-X01-B。

既存入口: `src/App.tsx`、`src/ui/WorkPage.tsx`、`src/ui/viewPreferences.ts`。新規モジュール候補: `src/ui/GuidedWorkspace.tsx`、`src/ui/guidePreferences.ts`（未作成・既存実装の証拠ではない）。根拠: RS13、RS15、RS18、RS19。

### X02 許可された複数作品を横断して探す

**追加する理由**: 続編と共通世界を開き直しながら、同じ人物の記述を探す作業を減らす。

**既存との差**: 現在の検索/保存一覧は作品内が中心。別作品・共通世界の名前を作品IDと固定版を保って検索する範囲を追加する。

**必須動作**: 利用者が選んだローカル作品と許可済み固定世界だけを横断し、作品名・版・項目種類・安定IDを付けて結果を分割表示する。秘密を除く範囲で検索し、元位置へ戻れる。

**データ**: 端末設定: workspaceSearchScope(projectIds,worldSnapshotIds)、query、page。索引はaccount/project/snapshot/profileごとの派生物で、正本/検索対象権限を代替しない。

**失敗時**: 削除・権限失効を検出した時点とアカウント切替で索引/候補/件数を無効化する。名前が一致しても自動統合しない。未読込作品は未検索と表示する。

**具体的な規則**: 検索結果キーはaccountScope/projectId/snapshotId/entityId/fieldPath/blockId。検索対象の固定コピーで権限と投影を先に評価する。判明している許可を再確認してから本文位置へ移動する。共有元の最新権限を確認できない場合は、最終確認時刻と未確認を表示し、新規に秘密内容を取得しない。既に正当に取得したローカル作品の作者編集と、公開/共有取得の再認証を区別する。処理対象作品数、未検索数と対象版を表示し、結果件数を無権限データから数えない。

**正常合格**: 同名人物が二作品にある状態で、作品/版を区別し元本文へ移動して検索位置へ戻る。

**例外合格**: 権限撤回・公開範囲変更・世界版未取得・不正なリンクでは本文/件数を出さない。

**境界合格**: Large作品を複数選んでも2秒以降に進捗/取消を出し、分割した結果から末尾へ到達できる。

関連: REQ-F09、REQ-F27、REQ-F57、REQ-N08、REQ-N19。依存: X01。追加AC: AC-X02-N、AC-X02-E、AC-X02-B。

既存入口: `src/ui/CatalogPanel.tsx`、`src/domain/catalog.ts`、`src/storage/store.ts`、`src/domain/projection.ts`。新規モジュール候補: `src/domain/workspaceSearch.ts`、`src/ui/WorkspaceSearch.tsx`（未作成・既存実装の証拠ではない）。根拠: RS12、RS14。

### X03 確認してから行う本文の一括置換

**追加する理由**: 人名や用語の変更を、リンク・ルビ・台詞の対応を確認しながら反映できる。

**既存との差**: 検索、一括項目編集、注記位置変換はある。本文の一致箇所を選び、変更内容を見てまとめて置換する操作は別に追加する。

**必須動作**: 作品内の現在採用本文を対象に、文字列の完全一致を検索する。対象作品/項目/段落/範囲/前後文を表示し、選んだ非重複箇所だけを一操作として置換する。台詞IDは維持する。

**データ**: 置換確認: planId/projectId/baseRevision/query/replacement/targets(entityId,blockId,start,end,beforeHash)/confirmationHash。範囲は既存のUnicode文字位置規則を使う。

**失敗時**: 確認後の版変化、範囲hash不一致、重複、入力変換中、保存失敗では全体を確定せず入力を保持する。追従不能な注記は理由付き再リンク待ちへ。固定版/別案/作者メモを既定対象にしない。

**具体的な規則**: 検索は大文字小文字を含む文字列完全一致で、空queryを拒否、query=replacementは変更なしとする。同一本文の一致候補は左から非重複、適用は後方から行い、同時に注記対応を算出する。planの全beforeHashが一致したときのみ確定する。上限は原100000記録/1フィールド1MiB、全候補をページ表示し、処理打切り時は未完了とする。

**正常合格**: 同名と一般語のある本文で一部の箇所だけ置換し、リンク/ルビ/提示位置/台詞IDを確認して保存・cold・取消・完全復元する。

**例外合格**: 途中更新、絵文字、重なる注記、取消、容量不足で全体が原子的に不変か明示した追従待ちになる。

**境界合格**: 空検索・同じ検索/置換は拒否/変更なし。最初の版は正規表現非対応。結果はページ化し、上限超過時に無言で途中切断しない。

関連: REQ-B10、REQ-F21、REQ-F26、REQ-F48、REQ-N13、REQ-N18、REQ-N19。依存: X01。追加AC: AC-X03-N、AC-X03-E、AC-X03-B。

既存入口: `src/domain/text.ts`、`src/domain/maintenance.ts`、`src/ui/TextAnnotations.tsx`、`src/storage/store.ts`。新規モジュール候補: `src/domain/bulkTextReplace.ts`、`src/ui/BulkTextReplace.tsx`（未作成・既存実装の証拠ではない）。根拠: RS01、RS19。

### X04 翻訳表を出して確認して取り込む

**追加する理由**: 翻訳を一行ずつ登録する手間を減らし、原文の更新との食い違いを確認できる。

**既存との差**: 台詞ID・原文hash・言語/音声・担当別JSON出力は既にある。iPhoneで編集可能な表形式の双方向受渡しを追加する。

**必須動作**: 独自形式scenario-localization-table 1.0.0のUTF-8 CSVを出力/取り込みする。lineId/locale/sourceHash/targetTextを必須、commentを任意とし、別manifestへprojectId/snapshotId/profileHash/schema/行数/内容hashを付ける。

**データ**: manifest + CSV。キーはlineIdとlocaleの組。snapshot/profileへの対応を保持し、訳文の新規/更新/変更なし/競合/削除候補を確認表に出す。欠行は削除要求にしない。

**失敗時**: 原文不一致・同一キー重複・不明ID・別作品・不正文字・表計算の式になり得る値を黙って変換しない。既定は全体停止、作者が選んだ正当な行だけを原子的に確定する。

**具体的な規則**: CSVはUTF-8、出力BOMなし/CRLF、取込はBOM一つとLF/CRLFを許容する。ヘッダーはlineId,locale,sourceHash,targetText,comment（comment列の省略可）。区切りはカンマ、引用は二重引用符、引用内の二重引用符は二つで表す。引用内の改行を保持する。未知列/重複列/不正Unicode/NULは拒否する。空targetTextは空訳文としてpreviewに出し、欠行を削除しない。

表計算の式対策は独自のtext-prefix-v1とし、**全targetText/commentへ文字列 t: を一つ前置**する。取り込みはその一つだけを除き、先頭空白/改行/元のt:も保持する。t:欠落は入力不正として明示し、黙って除去・数式評価しない。利用者には接頭辞の後だけを編集する説明を出す。

manifestはformat/version/projectId/snapshotId/profileHash/rowCount/sourceRowsHash/exportCsvHash/encodingを持つ。sourceRowsHashは並び順を整えた(lineId,locale,sourceHash)集合のcanonical JSON SHA-256。exportCsvHashは出力時のbytes検査用で、編集後に変わることを許す。取込時の新CSV hashを別に記録する。行の追加/欠落は件数差としてpreviewに出し、原文側のキー/hashは作品の対応版と一行ずつ検査する。manifestの元rowCountを編集後の一致必須条件にしない。

原文変更/不明ID/重複等が一つでもあれば既定は全体停止。作者は正当な行だけを明示選択して新planを確認でき、競合行を勝手に上書きできない。acceptedの翻訳は原文hash一致と作者承認を必要とし、単なる取込は確認待ち。32MiB上限は入力CSVの実bytes、50000行上限はヘッダーを除く論理レコード数。

**正常合格**: 複数言語、改行/引用符/カンマ/絵文字を含む表を出し、iPhone上の編集後に取り込み、元IDと原文hash/状態を保ってcold/完全復元する。

**例外合格**: 出力後に原文変更、ID変更、重複、壊れた引用符、=から始まる台詞、保存失敗を検出し元内容を残す。

**境界合格**: 最大50,000行、ファイル32MiBまで。行数/bytesを超えたら処理前に拒否。サイズは既存作品上限も満たす。式対策の変換はmanifestに可逆符号化を宣言し、往復で元文字列を厳密復元する。

関連: REQ-F21、REQ-F23、REQ-F24、REQ-F48、REQ-N09、REQ-N10、REQ-N20。依存: X01。追加AC: AC-X04-N、AC-X04-E、AC-X04-B。

既存入口: `src/domain/exports.ts`、`src/domain/productionWorkflow.ts`、`src/storage/importWork.ts`、`src/ui/ProductionTools.tsx`。新規モジュール候補: `src/domain/localizationTable.ts`、`src/ui/LocalizationTablePanel.tsx`（未作成・既存実装の証拠ではない）。根拠: RS04、RS05、RS06。

### X05 翻訳の埋込み語と用語の形式を確認する

**追加する理由**: 文章としては読めても、ゲーム内で人物名等が出ないミスを見つける。

**既存との差**: 口調・用語・原文変更の再確認はある。訳文内の埋込み語の欠落/重複と、言語別の必須表記を独立に検査する。

**必須動作**: 本製品用の埋込み語{name}、文字としての波括弧{{と}}を文法として登録する。原文/訳文の名前付き埋込み語の種類と出現数を比較し、言語別用語規則/明示例外も検査する。

**データ**: localeRule(id,locale,tokenPolicy=multiset,termId,acceptedForms[],scope,exceptionReason)、finding(lineId,locale,sourceHash,ruleVersion,ranges,status)。不正文法はunknown相当の未確認にする。

**失敗時**: 任意のJavaScript/テンプレートを評価しない。訳文/原文を自動置換しない。言語規則なしは不一致でなく未設定、本文変更後は旧承認を失効する。

**具体的な規則**: 埋込み語の名前はASCII [A-Za-z_][A-Za-z0-9_]*、空白を含む{name }は不正文法とする。左から{{/}}を文字として先に読み、単独{...}をtokenとして扱う。multisetは名前→回数、順序は比較しない。用語はlocale/scopeで適用し、許容形は原文保持の完全一致、例外は規則ID/対象lineId/sourceHash/理由で固定する。許容形を自動挿入しない。

**正常合格**: {name}を二度含む原文と一度の訳文で欠落を示し、同数で順序が違う訳文は許可する。表記の明示例外は理由付きで残る。

**例外合格**: 未閉鎖括弧・不明規則・原文更新・多言語・悪意の式で勝手な実行や自動承認をしない。

**境界合格**: 全角括弧や通常の括弧表現は勝手に埋込み語へ変換しない。既存作品はtokenPolicy未設定から移行し、文字表示を変えない。

関連: REQ-F23、REQ-F40、REQ-F48、REQ-N10、REQ-N13。依存: X04。追加AC: AC-X05-N、AC-X05-E、AC-X05-B。

既存入口: `src/domain/productionChecks.ts`、`src/domain/productionWorkflow.ts`、`src/domain/text.ts`。新規モジュール候補: `src/domain/localizationChecks.ts`、`src/ui/LocalizationRuleEditor.tsx`（未作成・既存実装の証拠ではない）。根拠: RS04、RS05、RS06。

### X06 期待結果を登録した経路のまとめた再確認

**追加する理由**: 文章や条件を直した後に、重要な結末とフラグが保たれるかをまとめて確認できる。

**既存との差**: 保存経路・網羅率・再実行・変更後の再確認はある。作者が意図した到達先や状態値を宣言し、テスト集合を一括実行する機能を追加する。

**必須動作**: 固定開始状態/入力seed/版/経路から実行し、到達終端、条件結果、状態値、所持品、開示済みIDの許可集合を型付き期待値と比較する。成功/不一致/未確認/未実行/取消を別状態で保存する。

**データ**: RegressionSuite(id,versionId,testIds[]), NarrativeTest(id,checkpointId,traceId,seed,assertions[]), TestRun(targetHash,suiteHash,actuals,results,environment)。任意式を実行せず、既存条件評価を使う。

**失敗時**: 外部実結果を仮応答で代替しない。未知条件・不足開始値・上限打切り・版違いを成功にしない。期待値変更は履歴と再確認を残す。

**具体的な規則**: assertionはterminalId equals、conditionId expected=true|false、state(variableId,typedValue) equals、inventory(ownerId,itemId,quantity) equals、revealedIds subsetOf(allowedIds)の5型とする。型不一致/不存在IDは登録を拒否する。suiteはテストID順を固定し、各テストで独立した初期状態を用いる。unknownが一つでもあればpassed不可、run全体の取消は未完了テストをcancelledとして保持する。正当な既完了結果を削除せず、suiteの完全成功にしない。

**正常合格**: 二経路で別の終端/鍵/開示を期待し、一括再実行の正しい値と、一箇所を壊した不一致を対象位置付きで表示する。

**例外合格**: 分岐変更・外部値欠落・unknown・ループ上限・取消で成功数を増やさず、同じseed/版で再現する。

**境界合格**: 元探索/実行上限を維持し、全UIと無画面実行で同じ契約を使う。coverageは宣言した対象集合を分母にする。ゲームの実受領結果は別に保持する。

関連: REQ-F15、REQ-F17、REQ-F18、REQ-F42、REQ-N12、REQ-N16。依存: X01。追加AC: AC-X06-N、AC-X06-E、AC-X06-B。

既存入口: `src/domain/regressionPaths.ts`、`src/domain/runtime.ts`、`src/domain/conditions.ts`、`src/ui/RuntimeReconfirmation.tsx`。新規モジュール候補: `src/domain/narrativeTests.ts`、`src/ui/NarrativeTestPanel.tsx`、`scripts/narrative/run-suite.mjs`（未作成・既存実装の証拠ではない）。根拠: RS08、RS11。

### X07 保存量とバックアップの確認状況を見る

**追加する理由**: iPhoneのブラウザーを片付ける前に、持ち出せた内容と未確認の内容を判断できる。

**既存との差**: 保存状態・完全出力・復元はある。保存領域の見積、最後に実ファイルを検査した版、復元確認済み版をまとめて示す。

**必須動作**: 使用量/容量の推定、永続保存の許可状態、最後の完全ファイル検査の版/hash/日時、最後の空環境復元確認を別々に表示する。取得不能は不明と書く。

**データ**: 端末限定BackupReceipt(projectId,revision,contentHash,fileHash,createdAt,receiptState=generated|file_verified|restore_verified)。estimateは未保証の推定。生成時点だけでfile_verifiedにしない。

**失敗時**: ダウンロード開始はFiles保存成功と認定しない。利用者が選び直した実ファイルを検査して内容を対応させる。領域が不足しても自動削除せず完全保存/小さな下書き出力を案内する。

**具体的な規則**: receiptStateはgenerated→file_verified→restore_verifiedの順。ただし実ファイル検査と空環境復元の対象revision/contentHash/fileHashが一致した場合だけ進める。作品更新後は古いreceiptのまま表示し現在版の安全表示へ昇格しない。ファイル名/日時だけの一致は不可。estimate/persisted API未対応時も完全保存ボタンへ到達できる。

**正常合格**: 完全保存を開始した段階と、Filesから実ファイルを選び直して検査した段階を区別し、版変更後の古いbackupを表示する。

**例外合格**: 取消・容量取得不可・許可拒否・異版/破損ファイル・失敗でも健康状態を成功にしない。

**境界合格**: 同じ配信元の容量は他作品/キャッシュを含む推定であると表示する。復元検証の対象版が違う場合は同じ版の確認にしない。通知はアプリ内で任意。外部の定期通知を勝手に作らない。

関連: REQ-F35、REQ-N06、REQ-N09、REQ-N11、REQ-N14、REQ-N17。依存: X01。追加AC: AC-X07-N、AC-X07-E、AC-X07-B。

既存入口: `src/ui/BackupPanel.tsx`、`src/storage/archive.ts`、`src/storage/store.ts`、`src/ui/DiagnosticPanel.tsx`。新規モジュール候補: `src/domain/backupHealth.ts`、`src/ui/BackupHealthPanel.tsx`（未作成・既存実装の証拠ではない）。根拠: RS15、RS17。

### X08 試読で見つけた文章を直して同じ経路へ戻る

**追加する理由**: 条件を調べている最中に気付いた文章の修正で、試していた経路を失わない。

**既存との差**: 試読と本文編集、固定版リンクへの移動はある。試読位置から修正候補を作り、変更後の版で同じ経路を再確認する一連の操作を追加する。

**必須動作**: 作者の試読から元の版/項目/段落/範囲を開き、現在稿への修正候補を保存する。元trace/旧snapshotは変更せず、採用後に同じ開始条件の新しい経路を再確認する。

**データ**: ReviewEditContext(traceId,sourceVersionId,sourceAnchor,targetRevision,draftKey,replayStatus)。原稿編集は既存作者操作/履歴を使う。

**失敗時**: 公開閲覧者に原稿編集権限を与えない。現稿が変わっていたら差分を確認し、本文未保存のまま試読に戻って変更済みと扱わない。

**具体的な規則**: 試読中の元位置と現稿への位置対応を表示し、不明なら対象を選び直す。採用保存の完了後に新snapshotへ開始条件をコピーして既存の型/参照/版検査を通す。新traceを別IDで保存し旧traceへ上書きしない。試読へ戻る操作は未保存下書きを保持し、再実行未完了を「確認済み」としない。

**正常合格**: 試読の台詞から修正し、旧経路を残して新版を同じ条件で再実行し変更点を見る。

**例外合格**: 公開閲覧・旧版位置不明・編集競合・保存失敗・再実行取消でtrace/現稿を壊さない。

**境界合格**: 本文だけの変更でも対象版が変わるので再確認を必要とする。途中状態を新版へ無検査で注入しない。

関連: REQ-B10、REQ-B16、REQ-F06、REQ-F16、REQ-F17、REQ-N19。依存: X06、X09。追加AC: AC-X08-N、AC-X08-E、AC-X08-B。

既存入口: `src/ui/Reader.tsx`、`src/ui/RuntimeReconfirmation.tsx`、`src/ui/editorNavigation.ts`、`src/ui/WritingWorkspace.tsx`。新規モジュール候補: `src/ui/TrialEditReturn.tsx`（未作成・既存実装の証拠ではない）。根拠: RS07、RS08、RS09。

### X09 二つの版を文章と設定の違いで比べる

**追加する理由**: 何が変わったかを、内部のデータ記法を読まずに判断できる。

**既存との差**: 履歴検索、差分の項目名、単体復元、別案比較はある。任意二snapshotを原稿/設定/状態/素材で読み比べる表示を追加する。

**必須動作**: 二つの同作品の固定版、または現稿の確認時固定コピーを選び、追加/削除/変更/順序/注記位置を安定IDで比較する。本文を横または縦の二列、携帯では前後切替で読める。

**データ**: VersionComparison(leftVersionHash,rightVersionHash,scopeIds,fieldIds,summary,annotationStatus)。表示は派生物。単体復元/採用は別の明示操作。

**失敗時**: 同名別IDを同一視せず、公開投影同士の比較に私有正本を混ぜない。権限失効、比較中の現稿更新は再確認が必要。比較表示だけで復元を行わない。

**具体的な規則**: 比較順はID→fieldPath→Block/Line IDとし、順序付き配列の並べ替えを追加/削除から区別する。本文はコードポイント差分、素材はhash差分、未取得snapshotは未比較。比較元のscope/profile/sourceVersionを固定し、両側が閲覧可能な投影の共通範囲だけを読取る。差分採用は別の作者確認planを必要とする。

**正常合格**: 本文・台詞順・所持品・関係時点・素材hashの変更を二版で見分け、原ID/固定版を変えず元位置へ戻る。

**例外合格**: 削除・同名・引用固定世界・注記の追従不明・権限撤回でも正しい差分/未比較を示す。

**境界合格**: LargeはID索引とページ表示を使い、変更ゼロを未読込から推定しない。差分の文字位置はUnicode規則に一致する。

関連: REQ-B23、REQ-F25、REQ-F26、REQ-F35、REQ-N19。依存: X01。追加AC: AC-X09-N、AC-X09-E、AC-X09-B。

既存入口: `src/ui/HistoryPanel.tsx`、`src/domain/authorAlternativeIntegrity.ts`、`src/storage/recovery.ts`。新規モジュール候補: `src/domain/versionComparison.ts`、`src/ui/VersionComparisonPanel.tsx`（未作成・既存実装の証拠ではない）。根拠: RS14。

### X10 素材の利用条件と出力の表記を確認する

**追加する理由**: 参考画像をそのまま公開物に含めるミスや、必要な表記の抜けを確認しやすくする。

**既存との差**: licenseNote・出所・redistributionAllowedは既にある。出力用途/表記条件/確認根拠/素材hashを持つ構造化した記録と出力前確認を追加する。

**必須動作**: 素材版ごとに出所URL/作者名/条件名/条件URL/確認日/許可根拠/用途別許可/必要表記を記録する。公開/制作出力前に含まれる素材の確認状態を一覧し、許可済みの条件でクレジット文を生成する。

**データ**: AssetUsagePolicy(assetHash,sourceId,creator,licenseLabel,licenseUrl,checkedAt,permissions={public,production,redistribute}:allowed|denied|unknown,creditText,reviewer,reason)。作者私有の確認記録を既定公開しない。

**失敗時**: unknown/deniedの素材bytesは公開出力を停止するか、利用者が確認したリンク/書誌情報のみの出力へする。AI生成を理由に法律上の許可/権利を自動判定しない。

**具体的な規則**: 許可はcontentHashと用途に結び付け、素材差替えではunknownへ戻す。permissionsはallowed/denied/unknownだけを許し、allowedにはreviewer/checkedAt/reasonが必須。creditTextは原文として保持し、HTML出力では非実行文字としてescapeする。既存redistributionAllowed=falseはredistribute=denied、それ以外は自動allowedにしない。選択したprofileの用途に必要な全許可がallowedの場合だけbytesを含める。

**正常合格**: 許可済みと不明素材を混ぜた出力で対象hashと必要表記を示し、許可範囲だけの成果物と表記ファイルを作る。

**例外合格**: 素材差替え・出所更新・用途変更・期限不明・私有素材で旧許可を流用しない。URL確認不能は確認済みにしない。

**境界合格**: 自分の完全保存への持ち出しと他者への公開は区別する。既存licenseNoteは保存し、移行後の構造化許可はunknownから開始する。権利の法律判断を代行しない。

関連: REQ-F22、REQ-F24、REQ-F28、REQ-N08、REQ-N10、REQ-N20。依存: X01。追加AC: AC-X10-N、AC-X10-E、AC-X10-B。

既存入口: `src/domain/materials.ts`、`src/domain/projection.ts`、`src/domain/exports.ts`、`src/ui/ProductionTools.tsx`、`src/ui/fieldSpecs.ts`。新規モジュール候補: `src/domain/assetUsagePolicy.ts`、`src/ui/AssetUsagePolicyEditor.tsx`（未作成・既存実装の証拠ではない）。根拠: RS06、RS15。

### X11 任意の文字数目標と執筆の増減を見る

**追加する理由**: 今日どこまで書くかを決め、制作タスクの完了と別に進み具合を見られる。

**既存との差**: 文章量/制作量/一経路の量の計算はある。作品/章/作業単位の作者が決める目標を追加する。

**必須動作**: 採用本文だけを対象に作品/章/明示開始終了した作業の目標を持つ。Unicodeコードポイント数と空白除外数を区別し、開始時と現在の差分を表示する。

**データ**: WritingGoal(id,scope=work|chapter|session,scopeId,metric=codepoints|nonWhitespaceCodepoints,target>=0,baselineVersion,startedAt,endedAt)。世間の日次境界と混ぜず、初版は明示セッションに限定する。

**失敗時**: 作者メモ/引用/ルビ読みを二重加算せず、削除による負の増減を隠さない。本文の自動水増し、ノルマ未達の操作制限、外部通知をしない。

**具体的な規則**: 章の採用scene/block/lineの物理ID集合を先に作り重複を除く。nonWhitespaceCodepointsはJavaScript Unicode White_Space propertyで判定し、対応Unicode版を表示に記録する。ルビは本文文字のみで読みを加算しない。targetは安全な非負整数、null=目標なし、0=目標0と区別する。セッション開始/終了は明示操作で、日付が変わっても自動終了しない。

**正常合格**: 絵文字/ルビ/空白/共通場面を含む章を数え、前後の増減と目標を表示する。

**例外合格**: 章移動、別案採用、取消、同じ場面の複数参照、未取得世界、セッション中の版変更を正しく区別する。

**境界合格**: 同じ場面は物理IDごとに一度計上し、一経路の反復量と混同しない。Unicode計数を人が見る文字の数と同一と断言せず数え方を明記する。

関連: REQ-F03、REQ-F06、REQ-F52、REQ-N13。依存: X01。追加AC: AC-X11-N、AC-X11-E、AC-X11-B。

既存入口: `src/domain/textMetrics.ts`、`src/domain/productionPlanning.ts`、`src/ui/WritingWorkspace.tsx`。新規モジュール候補: `src/domain/writingGoals.ts`、`src/ui/WritingGoalPanel.tsx`（未作成・既存実装の証拠ではない）。根拠: RS10。

### X12 限定したTwee 3の取り込みと出力

**追加する理由**: 他ツールで書いた小さな分岐を、場面と選択肢の形から整理できる。

**既存との差**: 汎用JSONと専用形式はある。外部の場面データを作者案として取り込むTwee 3の限定対応を追加する。

**必須動作**: UTF-8のTwee 3ヘッダー、StoryTitle/StoryData、名前/タグ/位置、通常文字と明示リンク[[text->target]]だけを対応範囲として宣言する。実行コード/CSS/各形式macroを評価しない。

**データ**: ImportSource(format=twee3,parserVersion,sourceHash,passageIds,idMapping,unsupportedSpans,originalText)。新規取り込みは作者別案。独自ID/参照を維持するsidecar付き往復だけをlosslessと宣言する。

**失敗時**: script/stylesheetは隔離資料にする。macroや不明構文は原文を保って未対応として示し、動くゲームだと説明しない。不明target/重複名/不正headerを確認前に確定しない。

**具体的な規則**: 対応仕様はRS03のTwee 3 v3.0.2。名前/タグの\によるescapeを往復し、行頭::をheaderとして解析する。StoryDataはifid必須、IFIDは外部規格の大文字UUID、内部UUIDは小文字とし別対応mapを持つ。start/position/sizeは型を検査して保持する。未対応metadataは原文と場所を隔離して示す。StoryTitle/StoryDataを本文場面と混同しない。

[[text->target]]は本製品adapterの限定リンク文法であり、Twee本体が全ストーリー形式へ共通実行文法を定めるという意味ではない。自己リンク/循環は原探索上限で扱い、条件付きmacroに意味を推定しない。script/stylesheet付きpassageは原文資料として保存し、DOMへ挿入せず非実行表示する。

sidecarはformat/version/sourceTweeHash/sourceProjectHash/idMap/unsupportedSpans/元独自設定を持ち、完全packageと同じ型・参照・安全上限を検査する。改ざん/対応hash不一致は往復復元を拒否する。sidecarなしは文字と明示リンクの限定変換、ID/独自設定の無損失を主張しない。正当な引用元とライセンスはImportSourceへ残す。

**正常合格**: 三場面と二選択の限定fixtureを新規別案へ取り込み、ID対応を確認して出し直し、対応範囲を往復する。

**例外合格**: 任意script、macro、外部URL、巨大入力、不明target、重複名、sidecar改ざんを拒否/隔離し、現作品を不変に保つ。

**境界合格**: 最大10MiB/10,000passages。対応外の設定/伏線/独自暦/所持品はsidecar以外へ潰さない。ink/Yarn/Fountain/Unity/Unrealへの対応はこの合格から推定しない。

関連: REQ-F24、REQ-F42、REQ-F56、REQ-N09、REQ-N10、REQ-N20。依存: X04、X09。追加AC: AC-X12-N、AC-X12-E、AC-X12-B。

既存入口: `src/domain/exports.ts`、`src/storage/importMapping.ts`、`src/storage/importWork.ts`、`src/ui/BackupPanel.tsx`。新規モジュール候補: `src/domain/adapters/twee3.ts`、`src/ui/ExternalStoryImport.tsx`（未作成・既存実装の証拠ではない）。根拠: RS02、RS03、RS09。

## 6. 未確定事項の扱い

担当、工数、納期、現在の専用同期/公開接続先、実端末OS/ブラウザー、現行容量/転送/料金、証拠の配布先は未確定である。具体的な構成・負担・確認対象を作ってPRへ載せる。現実の上限はG12で実測/公式確認して表にし、不明を無料/無制限/合格へ換算しない。

追加schemaの具体JSON Schema・DBmigration・同期payloadは採用工程AP07〜AP09の成果物とする。本書の型/既定値/確定点/互換/失敗条件を満たさない変更は、その要件とACを同じPRでレビューする。元のrelease gateの緩和で差分を解消しない。
