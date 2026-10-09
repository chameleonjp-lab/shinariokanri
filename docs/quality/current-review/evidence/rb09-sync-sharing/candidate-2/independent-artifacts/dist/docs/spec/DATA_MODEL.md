# データ仕様 1.0（規範・レビュー案）

対象要件: REQ-B01–B24、REQ-F01–F60、REQ-N06–N13/N16/N19/N20。実装時のDB製品や画面ライブラリによらず、以下の意味と制約を維持する。

## 共通の型

| 型 | 定義・制約 |
| --- | --- |
| ID | UUID形式の小文字文字列。端末内で生成でき、名前・並び順・表示位置から作らない。作品内でentityとrelationのIDは重複不可。改名・移動・本文編集で維持する |
| Ref / Ref[] | 対象IDまたはIDの集合。参照先の種類と作品/共通世界の範囲を検査する。同じIDを集合内で重複保存しない |
| Text | UTF-8のUnicode文字列。原文を保持し、検索正規化は派生情報とする。短い名称は1–128コードポイント、要約は0–2048、本文は1フィールドUTF-8で1 MiB以下 |
| Revision | 0以上の整数を10進文字列で保存。ローカルの未送信変更とサーバー確定revisionは別。整数を端末時計で代用しない |
| Tick | 正負の10進整数文字列、絶対値の数字は38桁以下。先頭+、先頭0、-0、小数、指数表記を禁止する。厳密な検査式は表の下に示す |
| RealTime | 実世界のUTC日時をRFC 3339文字列として保存。表示タイムゾーンは個人設定。制作期限が日単位ならYYYY-MM-DDと指定タイムゾーンを別に保持する |
| MediaTime | 演出・字幕・動画用の0以上の整数ミリ秒。世界内時間と変換しない |
| Status | `confirmed / provisional / needs_review / rejected / alternate`。作品情報の採用状態。制作工程の進捗とは別型 |
| Visibility | `private / team / projection` と、公開する投影プロファイルID。個人作品はprivateが既定、共有作品では作品の既定値を継承。privateはownerのみ、teamは許可されたowner/editor。reviewer/readerは投影だけを取得する |
| RichText | 順序付きBlock配列。BlockはID、種類、文字列、ルビ、任意の確定リンク範囲を持つ。作者メモ、要約、本文は別文書。リンクは対象IDとBlock/Line IDで保存する |
| TimeSpec | 下記の確定・期間・概算・相対・未定の判別共用体。表示文字列だけを正本にしない |
| Condition | [動作契約](BEHAVIOR_CONTRACT.md)の型付き条件AST。真/偽/不明の三値結果。任意JavaScript、SQL、式文字列のevalを禁止する |
| CustomValue | 雛形で宣言した文字列・数値・真偽・列挙・日付・参照の値。未入力はnull。初期値とnullを区別する |
| TypedValue | `type`と`value`の組。booleanはJSON真偽、integerはJSON整数、enum/text/refは文字列、unknownはvalue=nullとreasonを持つ。refは対象IDを検査し、unknownは未確定の値として扱う |

Tickの検査式:

```text
^(?:0|-[1-9][0-9]{0,37}|[1-9][0-9]{0,37})$
```

TickのJSON型は文字列である。[RFC 8259](https://www.rfc-editor.org/rfc/rfc8259)の数値相互運用上の精度を踏まえた設計選択で、38桁は本製品の設計上限。演算には整数処理を使い、描画時だけ原点からの差分を画面座標へ変換する。原文・ID・Tickは浮動小数の近似値へ書き戻さない。

## 共通レコード

各entityは `id, projectId, kind, revision, name, status, visibility, createdAt, updatedAt, customValues, data` を持つ。createdAt/updatedAtは実日時であり、競合勝者の根拠ではない。nameが不要な台詞等は空文字を許す。任意フィールドは未設定ならnullまたは省略を許すが、空配列は「集合が空」を意味する。削除は `deletedAt` と削除操作IDを持つtombstoneとして保持し、履歴と同期が安全になる前に物理削除しない。

同名は原則許可。人が選び分けるため種類・グループ・読み・短い識別メモを表示する。作品内の `variable.key`、言語コード、カスタム項目keyだけは所定スコープで一意。表示名を一意キーにしない。標準項目IDとカスタム項目keyの衝突を禁止する。

## 情報の種類とpayload

以下は論理契約。必須フィールドは「必須」に記載する。任意の配列の既定は空、任意の本文/文字列は空、任意の単一参照/日時はnull。参照を持つ値は全てRefとして扱う。WP01でこの契約を実行可能な型・schemaへ写し、フィールドの追加時は本書と専用形式版を更新する。

| kind | dataの必須フィールド | dataの任意フィールドと意味 |
| --- | --- | --- |
| character | なし | reading:Text、aliases:Alias[]、summary/body/authorNotes:RichText、birth/death:TimeSpec、goals:Ref[]、voiceRules:Ref[]。生存は時点/経路付きassertionから判定 |
| group | groupType: `display / faction / plot_thread / category` | members:Ref[]、parentId:Ref、summary:RichText。表示グループと世界内組織を区別 |
| event | summary:RichText、time:TimeSpec（未定可）、laneRole:`common / participants / both` | participants:Participant[]、locationId:Ref、itemIds:Ref[]、authorNotes:RichText、constraints:TimeConstraint[] |
| place | なし | parentId:Ref、reading:Text、aliases:Alias[]、body:RichText、mapIds:Ref[]、changes:Ref[]。世界→地方→街→建物はplaceの木、循環不可 |
| item | itemMode:`type / instance` | typeId:Ref（個体なら必須）、body:RichText、properties:CustomValue、changes:Ref[]。個体の所在/所有はassertionで記録 |
| note | body:RichText | attachmentIds:Ref[]、convertedToIds:Ref[]、originNoteId:Ref。一時メモ変換の系譜を保存 |
| chapter | sceneIds:順序付きRef[] | summary/authorNotes:RichText、structureRole:Text。並び順は世界時間ではない |
| scene | summary/body/authorNotes:別々のRichText、eventIds:Ref[] | chapterId:Ref、threadIds:Ref[]、povId:Ref、goals/conflicts/results/newInformation:RichText、tension/importance:数値0–10またはnull、blockIds:Ref[] |
| goal | ownerId:Ref、description:RichText | changes:Ref[]、evidenceSceneIds:Ref[]、validity:Validity。目標の変化を場面に結ぶ |
| flow_node | nodeType:`scene / choice / automatic / call / entry / exit / terminal` | sceneId:Ref、childGraphId:Ref、terminalReason:Text、trigger:Trigger、gate:Condition、executionPolicy:Policy、fallbackId:Ref、reuse:Reuse。terminalには意図した終了理由を必要とする |
| flow_edge | fromId:Ref、toId:Refまたは明示した未完成参照、edgeType:`choice / automatic / call_return` | label:Text、condition:Condition（既定true）、effectIds:順序付きRef[]、priority:整数、choiceLineId:Ref。未完成参照はruntime出力禁止 |
| flow_graph | nodeIds:Ref[]、edgeIds:Ref[]、entryIds:Ref[]、exitIds:Ref[] | parentGraphId:Ref、parameters:Parameter[]。グラフ階層の循環を禁止 |
| dialogue_line | text:RichText | speakerId:Ref、choiceEdgeId:Ref、cueIds:Ref[]、originLineIds:Ref[]。lineのidが不変の台詞番号 |
| quest | key:Text、stateVariableId:Ref | description:RichText、flowIds:Ref[]、transitionRules:Transition[]、gameplaySpecIds:Ref[]。状態を別の複製値として二重更新しない |
| lore | body:RichText | assertionIds:Ref[]、sourceIds:Ref[]、reading:Text、aliases:Alias[]。確定設定と作者の解釈は分離 |
| variable | key:Text、valueType:`boolean / integer / enum`、scope:Scope、initial:TypedValue、allowed:Allowed | description:RichText、ownerId:Ref、derived:Expression、externalContractId:Ref、resetRules:ResetRule[]、transitionRules:Transition[]、externalUseDeclared:boolean（既定false） |
| effect | operation: `set / add / grant / consume / move / assert / mark_seen / reset`、targetId:Ref | value:TypedValue、condition:Condition、instanceId:Ref、reason:Text。operationごとの入力型と副作用は動作契約に従う |
| assertion | subjectId:Ref、predicate:Text、value:TypedValueまたはRef、truthKind:`author_truth / testimony / belief / hypothesis` | holderId:Ref、sourceIds:Ref[]、evidenceLocation:ContentAnchor、validity:Validity、reason:Text。beliefにはholder、testimonyには出所を必須とする |
| foreshadow | question/intent:RichText、resolutionPolicy:ResolutionPolicy | truthAssertionIds:Ref[]、clueIds:Ref[]、payoffIds:Ref[]、requiredInfo:Ref[]、deadline:TargetScope、exceptions:Exception[] |
| disclosure | foreshadowId:Ref、anchor:ContentAnchor、stage:`hint / suspicion / reinforce / reveal / alternative`、role:`clue / payoff` | condition:Condition、knowledgeEffects:Ref[]、targetScope:TargetScope。世界日付ではなく提示位置で評価 |
| checkpoint | contentVersionId:Ref、runtimeState:RuntimeState | origin:`full_play / partial / imported`、traceId:Ref。途中開始は由来を保持 |
| trace | contentVersionId:Ref、startCheckpointId:Ref、steps:TraceStep[] | seed:Text、engineVersion:Text、externalMode:`stub / actual / mixed`、coverage:Coverage。証拠を版に固定 |
| attachment | mediaType:Text、contentHash:SHA-256、byteSize:整数、assetPath:安全な相対パス | displayName:Text、provenanceId:Ref、licenseNote:Text、stage:`reference / temporary / final`、revisionHistory:Ref[]。外部URLはsourceで扱う |
| source | sourceType:`web / file / book / observation`、locator:Text | accessedAt:RealTime、excerptLocation:Text、interpretation:RichText、attachmentId:Ref、redistributionAllowed:boolean（既定false） |
| cue | anchor:ContentAnchor、cueType:Text | attachmentId:Ref、speakerId:Ref、expression:Text、waitMs:MediaTime、camera:CustomValue、mediaTime:MediaTime、stage:Text |
| storyboard_frame | anchor:ContentAnchor、mediaStartMs:MediaTime | mediaEndMs:MediaTime、referenceAssetId:Ref、finalAssetId:Ref、cueIds:Ref[]、caption:RichText。endはstart以上 |
| localization | sourceLineId:Ref、language:Text、sourceHash:SHA-256、text:RichText | stage:`draft / reviewed / needs_review`、reviewedBy:Ref、recordingIds:Ref[]。language+sourceLine+版を一意とする |
| recording | sourceLineId:Ref、language:Text、sourceHash:SHA-256 | translationId:Ref、attachmentId:Ref、notes:RichText、stage:`planned / recorded / reviewed / needs_review`、reviewedBy:Ref |
| terminology | canonical:Text、reading:Text | variants:Text[]、language:Text、usageNotes:RichText、validity:Validity、exceptions:Exception[]、voiceOwnerId:Ref |
| map | placeId:Ref、coordinateSystem:`normalized` | attachmentId:Ref、parentMapId:Ref、pins:MapPin[]。画像なし可、pinは0–1の座標とplaceId |
| travel_route | fromPlaceId:Ref、toPlaceId:Ref、direction:`one_way / two_way` | method:Text、minimumTicks:Tick、maximumTicks:Tick、evidence:Ref[]、validity:Validity。未設定時間はunknown |
| template | targetKind:Text、fields:FieldDefinition[] | description:Text、version:Revision、defaults:CustomValue。既存情報の変換は影響確認付き |
| collection | mode:`dynamic / fixed` | query:Query（dynamicなら必須）、memberIds:Ref[]（fixedなら必須）、sort:Sort。絞り込みの結果と固定選択を区別 |
| review | target:ContentAnchorまたはRef、targetVersionId:Ref、body:RichText、stage:`open / fixed / verified` | assigneeId:Ref、quotedText:Text、resolution:RichText。元版への参照を維持 |
| creative_brief | targetAudience/experience/theme/tone/scope:RichText | deliverableIds:Ref[]、decisionIds:Ref[]。空欄を許す |
| decision | subject:Text、reason:RichText、targetVersionId:Ref、outcome:`accepted / rejected / deferred` | priority:Text、requirementIds:Text[]、reviewIds:Ref[]。判断の根拠を履歴に残す |
| gameplay_spec | sceneId:Ref、action:RichText | mechanic:Text、tutorial:RichText、reward:TypedValue、questId:Ref、taskIds:Ref[]、intentionalDifference:Text |
| production_task | targetIds:Ref[]、stage:`writing / review / implementation / translation / recording / verification / publication`、progress:`todo / doing / done / needs_review` | assigneeId:Ref、deadline:RealDate、dependsOn:Ref[]、estimate:Estimate、blockingReason:Text。依存循環は拒否 |
| media_variant | medium:`game / novel / video / audio / promotion / custom`、baseSnapshotId:Ref | body:RichText、releaseAt:RealTime、projectionProfileId:Ref、sourceIds:Ref[]、needsReview:boolean。本文は自動置換しない |
| voice_rule | characterId:Ref、validity:Validity | firstPerson:Text、addressing:Text、phrasing:Text、examples:RichText、exceptions:Exception[] |
| external_contract | key:Text、owner:`tool / game`、inputType:Text、outputType:Text、missingPolicy:`unknown / block` | description:RichText、stubValues:TypedValue[]、adapterProfileIds:Ref[]、version:Text |
| snapshot | versionLabel:Text、contentHash:SHA-256、immutable:boolean（必ずtrue） | parentVersionIds:Ref[]、releasedAt:RealTime、referencedWorldVersionIds:Ref[]。正本改訂は別snapshotを作る |
| projection_profile | audience:Text、includedIds:Ref[]、namePolicy:NamePolicy | allowedKinds:Text[]、excludedFields:Text[]、routeScope:TargetScope、includeAuthorNotes:boolean（既定false）。結果は別データ投影 |

作品自体は専用形式のprojectヘッダーで保持する。世界共通設定は別作品として持ち、worldReferencesには `projectId, immutableSnapshotId, contentHash` を指定する。専用ファイルへ必要なsnapshotを含め、読み込み時にオンライン参照がないと読めない形式にしない。

### 補助型の規則

| 型 | フィールドと規則 |
| --- | --- |
| Participant | characterId、role:`actor / witness / mentioned / informed / custom`、任意の根拠・認識効果ID。目撃しても自動で知識取得しない |
| Alias | id、text、reading、validity、audienceHolderIds、isPublicDefault。idは変更されないUUID。別名は本体の人物IDへ結び、本名への投影は別規則 |
| Validity | worldRange:TimeRangeまたはnull、routeCondition:Conditionまたはnull、presentationAnchor:ContentAnchorまたはnull。経路条件に不足値があるなら可能/不明表示 |
| TimeRange | start/end:Tickまたはnull、片端未定可。期間は半開区間 `[start,end)`、start<end。瞬間は別のinstantで扱う |
| ContentAnchor | entityId、任意のblockId/lineId、任意の文字範囲start/end。文字範囲はUnicodeコードポイントで数え、元版も保存する |
| TargetScope | projectId、任意のgraphId/chapterId/routeCondition、任意のtargetSnapshotId。続編等は対象を明示 |
| Reuse | mode:`reference / clone / override`、sourceId、pinnedSnapshotId、overrideFields。cloneでは新ID、参照の版更新は差分確認 |
| FieldDefinition | key、label、type、required、nullable、default、allowedValues、targetKinds、help。requiredとnullableを別にし、未知の型は拒否 |
| Exception | reason、targetScope、validity、evidenceIds。理由なしの永久除外を既定にしない |
| Estimate | valueまたはrange、unit、assumptions、scope、unknownCount、source。本文量からの時間見積もりは速度を必須にする |
| Query | 型・タグ・参加者・本文・制作状態・時期等の型付きAND/OR条件。検索対象は権限投影後。任意SQLを保存しない |
| NamePolicy | 使用するAliasのIDまたは名前置換、非公開時は対象を除外するか公開用匿名IDへ置換。別名不足なら安全側に出力停止 |

## 世界内時間

projectはcalendarIdとmainStart:Tickを持つ。mainStartを動かす操作は相対表示だけを変える。イベントの時間は暦の原点からのTickで、暦IDと対にする。世界時刻には実世界のタイムゾーンや夏時間を勝手に適用しない。実日の締切と制作公開日時は別のRealTime/RealDate型。

TimeSpecは以下の一つ。unknownにも任意の説明文を付けられる。

| mode | 必須値 | 判定 |
| --- | --- | --- |
| instant | at:Tick、calendarId | 確定した瞬間 |
| interval | start/end:Tick、calendarId | start<end、半開区間 |
| uncertain | earliest/latest:Tick、calendarId、precision:Text | earliest≤latest。精度ラベルは計算へ勝手に換算しない |
| relative | anchorEventId、anchorPoint:`start / end`、minOffset/maxOffset:Tick | min≤max、循環禁止。アンカー未定なら未解決 |
| unknown | reason:Text（空可） | 数値の推測値を自動保存しない |

標準暦は先発グレゴリオ暦、天文学的年番号で年0を扱い、1日86400tick（tick=秒）を基準設計とする。独自暦は原点ラベル・ticksPerDay・時刻単位・月名と月の日数・1–400年の繰返し年周期をデータで定義する。月数1–24、各月日数1–400、ticksPerDayは正の整数10進文字列。周期外への換算は同周期を繰返す。循環コード等を読み込んで実行しない。繰返し暦で表現できない規則は明示した未対応とし、手動ラベルとtickで保持できる。

暦変更には「ラベルを変える」「同じ瞬間を保ち換算する」「世界日付を移動する」の別操作を用意する。換算が一意でない場合は適用せず候補を示す。日付制約は先行・同時・最小/最大差を保持し、連動移動は[動作契約](BEHAVIOR_CONTRACT.md)に従う。

## 意味付きの関係

relationは `id, projectId, revision, fromId, toId, relationType, direction, validity, evidenceIds, status, visibility` を持つ。directionは `forward / symmetric`。種類辞書は許す始点/終点kind、自己関係の可否、対称関係の可否を宣言する。信頼、因果、前提、手掛かり→回収、親子、制作依存、参照を別種とする。逆向き関係や推移関係を自動追加しない。対称関係は明示的に対称の種類として一つのIDで保持する。

event.participants、scene.eventIds、flow_edge、production_task.dependsOn等の専用フィールドは、それぞれの関係の正本である。一般のrelationへ同じ関係を独立して複製しない。統合関係ビューはそれらを派生線として読み、編集は正本フィールドへ戻す。relation本体は信頼・因果・家系等の独立した意味付き関係を保持する。索引にも出所IDを付ける。

viewStateは図の座標・並び順・折りたたみ・拡大率・フィルター・最後に開いた対象を持ち、`userId/deviceClass/viewId` で分ける。図の配置を変えてもrelationや世界時間を変更しない。共有する保存ビューは別のview定義として選択し、個人の画面位置を他端末へ強制しない。

## 状態と試読

RuntimeStateは `contentVersionId, variableValues, itemInstances, assertions, seenIds, visitCounts, onceTriggers, rngSeed, rngPosition, callStack, presentationPosition, loopNumber, provenance` を含む。取り消しと経路再現は全項目を対象とする。作者の設定、試読の状態、ゲームからの外部応答は別のデータ。

状態のscopeは `scene / chapter / character / run / across_runs`。characterではownerId必須。runは一回のプレイ、across_runsは周回をまたぐ。全リセットは全scopeを初期値へ、周回はrun/scene/chapterを初期化して宣言したacross_runsを保持する。明示resetRulesで変更する場合は持越し一覧を表示する。

## 整合性と削除

- 存在しないID参照は保存しない。未完成の分岐先は `unresolved:{label,reason}` として明示し、文字列の偽IDで代用しない。未完成情報を作者保存には含めるがruntime出力は拒否する。
- place/group/graphの親子、相対日時、算出状態、制作依存は各種類の循環規則を検査する。ゲーム内の再訪ループは許し、解析の上限と終了可能性を別扱いにする。
- 統合は残すID、フィールド選択、参照書換え、旧ID→残すIDのalias mapを一操作で保存する。旧IDを別の情報へ再利用しない。取消は最新revisionに対する補償操作。
- 本体の削除でコメント・伏線・台詞履歴を連鎖削除しない。再リンク待ちにできる情報と、削除不能な公開snapshot参照を区別して影響一覧を示す。
- 派生索引・集計・図位置は正本の代替ではない。派生索引は版を付けて再構築でき、未更新なら「更新中」とする。

## 保存先への写像

端末内はIndexedDBでentity、relation、document blocks、command history、outbox、viewState、asset bytesを分け、projectIdとkind/参照先/検索キーを索引にする。サーバーはproject_idを必ず持ち、membership(project_id,user_id)等の検索対象に索引を用意する。参照が同じ作品または明示した世界snapshotに属するかをサーバー側でも検証する。型付き項目と関係を一つの非検証JSONへ押し込まない。

DBの物理DDL、完全schema、索引の実測選択はWP01/WP17の成果物。本PRは物理DBを作成しない。SQLの検証と実装時の参照は[設計判断](../decisions/ARCHITECTURE_DECISIONS.md)に示す。

## 実装時に具体化した投影と保存snapshot（形式1.0.0）

WP01/WP18で、秘密を含む元テキストを自動的に安全化したと仮定しないよう、`projection_profile.data` の公開用入力を具体化する。対象はREQ-N08/N19/N20、AT-E05/E07。元データの作者メモ/秘密ID/別名/素材名をそのまま閲覧者へ渡さず、作者が明示した公開名と公開文から投影する。未指定または整合不成立なら公開出力を拒否する。自由文の秘密を機械が完全検出したという保証ではない。

追加の任意フィールド:

- `namePolicy` は単一NamePolicyに加え、`{defaultPolicy?,byEntityId?}` を許す。個別IDごとに公開名/別名/除外を指定する。
- `publicTitle`, `publicVersionLabel` は作品名/作者版ラベルの公開用表記。`publicTexts` は対象ID→公開フィールドのmap。原本文を暗黙に採用しない。
- `allowedFields` はkindごとの公開フィールド集合、`allowedRelationIds` は許可する独立関係ID集合。未知のフィールドや任意の作者payloadを許可する拡張ではない。
- `publicIds` は対象ID→公開UUID対応、`idPolicy` は `remap / preserve`。公開IDは投影内の全参照へ一貫して適用する。作者用対応mapを公開ファイルに含めない。runtimeの不変番号は明示した公開IDで維持する。
- `publicValues` は対象変数/契約ID→列挙値の公開表記map。条件と初期値へ同じ対応を適用し、秘密のenum表記を漏らさない。
- `includedStatuses` は公開対象状態集合。没案/作者別案を公開するための許可とはしない。`approvedAttachmentIds` は再配布が許された素材の明示集合。素材bytesの取得/権限は別に検査する。
- `sourceVersionId` は参照元版。出力時は現在revisionまたは不変snapshotを一つ明示選択し、旧版を現在本文で代用しない。

作品の `snapshots` 配列は `id,versionLabel,contentHash,createdAt,content` を持つ。`content` はその版の作品ヘッダー・entities・relations・views・固定世界参照を保持し、historyとsnapshotsを再帰的に含めない。hashは正規化JSONのSHA-256。snapshot作成後の内容変更/削除を保存層が拒否し、改訂は新IDのsnapshotを追加する。snapshot entityのメタデータだけを保存して旧本文を復元できたと扱わない。

実行可能型とschemaは `src/domain`、保存と復元の検査は `src/storage` に置く。これらの追加は未実行受入を合格へ変更するものではない。

試読中の本文と実行状態は開始時の作品版を使う。現在の編集稿から経路を記録するときは、その開始版の不変snapshotとcheckpoint/traceを一つの保存処理で追加し、実行状態と全遷移の `contentVersionId` をそのsnapshot IDへ結ぶ。記録保存による現在revisionの増加や、その後の本文編集で過去の経路を現在稿へ付け替えない。`checkpoint.data.contentRevision` と `trace.data.contentRevision` は編集稿の版を識別する任意フィールドで、不変snapshotを持たない旧記録の版不一致を検出する。
