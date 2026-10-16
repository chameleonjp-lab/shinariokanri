# 比較結果と第2段階の詳細設計

本段階で確定するのは、次のPRで比較・実装するAPI、保持する不変条件、分割単位と棄却条件。選択した設計も製品への採用・着手には本成果PRのユーザーレビュー/mergeが必要である。未実装候補の改善速度を実測値として扱わない。

比較順は固定する：①データ・秘密・形式・原子性を保持する安全ゲート、②原全件対照と独立期待値、③同一入力での読込数/保持量/速度、④追加費用・移行・保守・戻しやすさ。①②を満たさない案は速度で救済しない。原Large保存等に上限を新設して元合否を書き換えない。

## 現行＋2案の比較

全行で「速度/費用」は将来の効果と追加運用費用を指す。追加の有料サービスは選択しない。正確性・異常系と元fixtureは全案共通の必須条件である。`UNKNOWN` は未実装または未測定。

| 設計/OPT | 現行 | 案A | 案B | 選択・理由・安全な戻し方 |
| --- | --- | --- | --- | --- |
| D01 / OPT-01 | 全作品のcurrentを起動時に逐次保持。OBS 1/10/50で本文行数増加 | 既存projects headerの一覧API＋選択時getProjectForEditing。本文/履歴は非選択時0を目指す。header内ID配列は残る | transaction内で更新する再生成可能なsummary表。少量一覧だがDB移行・旧headerとの整合コストが増える | **Aを先行**。現在のheaderが大きい場合だけBを比較。actor/roleを確認し破損作品だけエラー表示、一覧削除状態/件数/送信待ちを同値にする。追加費用0、移行なし、store/UI2境界。速度UNKNOWN。旧一覧APIへ切替可能 |
| D02 / OPT-02 | 8192batchで全currentを取得。global validatorへ完全像 | 選択後は完全currentを維持し、まず非選択作品を読まない。後に章/人物の依存closure APIを追加 | 正本と永続read modelを分離し、record単位のloaded/unloaded/absent/error状態を全UIへ導入 | **A→必要な画面のみBの状態設計**。一度に全UIを書き換えない。未読を参照切れ/削除と扱わず、保存前に必要な完全検査を行う。Bの依存漏れ・取消・stale結果を全件対照で棄却。Bの移行/保守大、保持量・速度UNKNOWN。全件read fallback |
| D03 / OPT-03 | request hash、normalize複数回、targetChanges、integrity、contentDelta、writeContent。差分書込は既存 | 一回の正規化されたchangesetを使い、対象差分・blocks・outbox/command情報を導出。request v2 hashとglobal検証は保持 | patch command APIを新設し、変更IDとrequest digest自体を局所化 | **A**。Bは再送意味/旧v1 hashとの互換境界が未承認・未実証。Aでも他IDの型変更、重複、anchor縮小、immutable版は全件対照。保持は一時Mapを減らせる見込み、速度UNKNOWN、追加運用費用0。旧saveProject経路を残す |
| D04 / OPT-04 | 全command本文をbulkGetしてmetadataを抽出。before/after全再構築ではない | historyIdsをsliceして30行取得 | 軽量metadataと重いdelta/checkpoint本文を分離。既存metadata全体のID/作品照合を軽量行で保ち、本文は選択時取得 | **Bを設計確定、A単独は棄却**。画面外missing rowを見逃す反例あり。最初は全metadata検査を残しO(Nmeta)と明記。O(page)化は完全性証明を別途確立した場合のみ。内部DB移行/原子二表更新/再構築が必要、外部native1.0は不変。速度UNKNOWN。旧command行も読めるfallback・移行前復元点 |
| D05 / OPT-05 | validationWorldsは全registry、cacheはMap。epoch/revision失効は既存 | current編集で必要なpinの推移closureだけ取得。inactive cacheは上限を設けて退避 | 全pinを常時共有するbounded LRU、参照countとinflight依存を管理 | **A**。history/exportには過去版closureを別計算。hash・immutableSnapshotIdをキーにし現在worldへfallbackしない。未保存draft/送信待ちは破棄対象外。循環/欠損/権限取消で旧全registry読込か拒否。保持・速度UNKNOWN、費用0、Bの複雑な寿命管理を保留 |
| D06 / OPT-06 | compile内だけ索引と正規化を共有。2compileで2build | immutable project配列＋版/世界/規則/権限に所有された弱参照のderived indexを検索間共有 | IndexedDBの永続全文/逆参照索引。versioned posting listとtransaction更新 | **A**。mutable draftは毎回再生成、account/role/scope変更で即破棄。改名/別名/削除/並び順/世界版の独立oracle一致が条件。Bは移行・文字正規化・破損復旧コストが高い。保持上限が増えるためcache budget計測必須、速度UNKNOWN、費用0。索引消去で全件再構築 |
| D07 / OPT-07 | DOMは30件。filterと全ID Mapは既にuseMemo | ordinal Mapの所有者をitemsオブジェクト配列から作者ID順序へ分離。D03の変更集合で順序不変ならMapを再利用し、filter/pageだけ更新。DBは全件読込のまま | D01/D06に基づくID順序付きcollection read model。表示pageと選択IDを分離し必要範囲を読む | **B、依存PR後**。AはDB移行なし・実装小、Map再割当を減らすがDB読込と全件検索は残る。Bは取得量を減らせる可能性とread modelの保守/失効コストを比較。いずれも表示順・戻り位置・非表示選択の完全一致が条件。保持量/速度は両案UNKNOWN。旧WindowedListへ戻せる |
| D08 / OPT-08 | scope分岐前にactive/entity候補/名前Mapを用意 | scope毎に必要な準備だけ遅延実行。calendar/project/identityはentity準備を避ける | 種類/版ごとの共通候補索引を保持して更新 | **A**。実測で不要な全走査を確認。現行と全scope・archived・pin・ID/label/orderを照合。追加費用/DB移行0、小範囲で戻しやすい。BはD06と重複・寿命リスク、保持増。速度の純改善はUNKNOWN |
| D09 / OPT-09 | model→schemaは生成済み。型/UI/検索/links/projectionは別定義 | 既存schemaから参照型等を抽出する意味descriptorと網羅検査。UI配置/文言と公開allowlistは独立 | 新DSLを導入し型・validator・UI・検索・公開を全生成 | **A**。全生成器に同じ誤りが入るBの共通原因を避ける。独立原期待と全項目一覧を先に作る。不一致を発見するまでは重複をバグと認定しない。Aは外部形式不変、費用0、保守中、速度対象外。生成物差分で復帰 |
| D10 / OPT-10 | 手動分類・確定参照・リンク候補除外・公開索引を既に区別 | 既存区分ごとに出所/版/寿命のinterfaceとテストを付ける | 既存正本を変更せず、分類/候補/確定参照を別variantで保持する再生成可能な共通派生registryを作る。公開投影後のregistryは別所有者 | **Aを先行、BはD06後に比較**。Aは移行なし・保守小、Bは索引再利用と共通失効が利点だが保持/権限/版の境界が増える。両案とも候補を真実/正式参照へ昇格させず、秘密はprojection後、過去版は不変。速度/保持量UNKNOWN、追加費用0。新作者タグ形式やX02等の採用は含めず、registryを消して復帰できる |
| D11 / OPT-11 | immutable入力・依存capture・schema signature・上限付きmemo | operation内の成功証拠を同じ依存closureで共有し、全件oracleとshadow比較 | process/global hash cacheで別operation/account間を再利用 | **Aを必要時に限定**。既存方式で十分なら変更なし。schema/world/role/同ID別内容/mutable/cycleで失効、proof不明はfull。Bは依存が完全に表現できる証拠不足、棄却。保持上限100000/256は維持、速度UNKNOWN、費用0。cache無効化のみで復帰 |
| D12 / OPT-12 | 原Large起動/検索のみ上限。他6項目は観測 | 元合否と別に、利用者の待ち時間を基準とする絶対時間目標を提案する | 元合否と別に、1件操作のDB行数/hash bytes/再走査/保持量の仕事量予算を提案し、端末速度とアルゴリズムの増加を分離する | **Aを利用者判断資料、Bを原因比較に併用**。Aは体験に直結するが端末依存、Bは増加傾向を説明できるが体験の十分条件ではない。提案A: UI保存p95≤1000ms、図/年表p95≤33.4ms。Bの閾値は移行/再送/完全性の必要量を確定してから提案。両案未採用・未達成、原閾値/合否は変更禁止。費用0、移行なし、元30回の生値と仕事量を併記 |
| D13 / OPT-13 | 全量native捕捉/検証/Worker/ZIP。113履歴/実72MiBの過去成功 | 捕捉/検証session/Worker transportの重複だけ計測し、既存形式で改善 | streaming archive v2、desktop外部DB/backupを新設 | **A**。本PRでarchive形式・quota・取消・600000msを変えない。Bは互換/実機/費用の別承認と独立実証が必要。Aも完全原oracle・new/clone/cold・最終失敗注入が通らなければ棄却。速度UNKNOWN、保持ピークは計測環境依存、旧export経路へ戻す |
| D14 / OPT-14 | 22ケースと54release不足が明示 | 実機/実サービス/ゲーム/費用/独立レビューを個別台帳で管理し、再現手順と不足を残す | 承認済み専用環境が提供された時だけ、役割/対象build/直接API拒否/実応答を束ねる共通evidence collectorで実サービス条件を自動採取する。実機条件は別台帳に残す | **Aを今回採用、Bは環境提供後まで保留**。Aは費用/移行なし・保守小、Bは再実行と証拠結合に利点があるが環境・役割・費用・権限の条件が必要。速度は対象外、Bの運用費UNKNOWN。今回は接続/費用発生なし、22件BLOCKEDを保持。mockを実環境合格に代入する方式は両案から除外 |
| D15 / OPT-15 | 限定docs-only/その他full、3engine独立job、全inventoryとtree/attempt検査 | buildを1回にして全engineへ共有artifact。配信bytesを封印する | 元全件を維持して依存/browser downloadの準備cacheと失敗分析を改善 | **Bを先行比較、CI編集は第3段階**。Aは既存engine別build identity/証拠との結合を設計し直す必要。検査削減・retry/timeout変更は禁止。準備時間効果UNKNOWN、費用は現行Actions内、cache破損は捨ててnpm ci。独立性が証明できなければ現行継続 |

## APIと所有境界

### 一覧と編集（D01/D02/D05）

`listProjectSummaries({signal})` は認可された `projectId/name/revision/counts/saveState` と個別 `error` を返す。`ProjectData[]` の代用ではない。既存のheaderはID配列を含むので「軽量」の実証はbytes/読込数で行う。同期状態はsummary生成後に古くなり得るため、操作時にaccount/role/revisionを再確認する。

`loadEditor(projectId,{signal,expectedRevision})` は現行の完全current/履歴tokenを返す段階を先行する。後の部分APIは `unloaded | loading | loaded | absent | error` を明示し、absentに縮退させない。`{account,roleGeneration,projectId,revision,pinIds,schemaSignature,requestGeneration}` を持つ読込所有者と照合してからUIへ反映する。選択を変えた遅延応答は捨て、draftは別の永続入力所有者に残す。全文検索・完全保存・完全検査は必要な全データを別captureする。

### 保存の一回生成（D03）

changesetは `baseRevision/operationId/normalizedCurrent/changedEntities/changedRelations/changedBlocks/headerChanges/targetChanges/contentDelta/invalidatedDependencies` を所有する。入力captureを最初のawait前に完了し、storeが再帰的に不変と確認した値だけ共有する。`requestHashVersion=2` の元bytesと旧v1再送経路は保持する。現行全配列request hashのコストはこの段階では消せない。

commitは既存と同じ取引でrevision・操作再送・world pinを再検査する。単なる「変更IDの宣言」は信頼せず、変更なしとされた値/所有ID/参照先型/固定版/全体規則を検証する。成功後だけcacheを更新する。二重送信、同ID別request、fake ACK、quota、最終段階失敗、未保存入力と冷却読込が必須反例。

### 履歴metadata（D04）

内部移行案：既存commandを残しつつ、`{projectId,sequence,operationId,revision,baseRevision,targetIds,reason,createdAt,sourceSchema}` の軽量行を原子生成する。本文/delta/checkpointとの対応とheader順序を完全照合してから切替え、途中migrationや未知rowは旧全件経路で拒否/再構築する。本文を読まないpageでも、現在のID/作品/欠損検査はmetadataの正本側で維持する。最初の案では全metadataの照合を残す。O(30)だけを理由に画面外の破損検査を除去しない。

metadataを無条件に信用する、外部からのnative破損を検出できない、同revisionの別履歴やimportOriginを取り違える場合は切替不可。paged本文復元は親operationIDと64checkpointから行い、履歴不変・旧行互換・完全ファイルへの全履歴を別に照合する。部分取得の本格採用には、検査時点と保証範囲を原条件のまま説明する証拠が必要。

### 派生索引と意味定義（D06/D08/D09/D10/D11）

索引所有者は `{account,roleGeneration,projectId,revision,worldSnapshotIds+hashes,schemaSignature,visibilityScope,normalizationVersion}`。派生索引は再生成可能であり、作者の入力/確定参照/分類/候補除外判断を正本から移さない。author indexとpublic indexを共用しない。UI array WeakMapの現在の安全性を失わない。

最初は共有再生成だけで比較し、差分更新は旧索引を消去して作った独立全件結果とID・順序・label・公開IDの完全一致を取る。参照種別・本文block範囲・世界版・削除・公開範囲が変われば依存先も失効する。UNKNOWN/可変/循環/異常終了は全件へ戻す。型/schema/参照意味は共通descriptorから導けても、UIラベル・layout・公開allowlist・旧形式移行の意味は独立確認を残す。

## 製品・環境方式の比較

| 方式 | iPhone単独/互換/安全 | 性能と保持 | 費用・移行・保守 | 結論 |
| --- | --- | --- | --- | --- |
| 現行Web＋上記取得/派生分離 | 元端末範囲とnative1.0を保持。既存IDB原子性を再利用 | 本PRの行数実測を根拠に改善単位を限定。純改善速度UNKNOWN | 新規運用費0、段階PR、local DB移行は個別復元点 | 第2段階の基準方式 |
| Desktop WebView/SQLite等 | iPhone要件を単独では満たせず、保存/移行/署名/更新/権限の実機検証が必要 | 全件走査を包むだけの高速化は未実証 | 配布・移行・保守費UNKNOWN、外部形式の互換作業大 | 性能対策として先行採用しない |
| 専用クラウド中心 | local単独・offline・role・秘密・二端末競合を追加実環境で証明する必要 | network/費用/認証/素材往復を含む純効果UNKNOWN | 新規構成・費用の承認が必要、既存別用途環境は流用しない | 今回採用/接続しない |

全面書換え・新形式・X機能の追加は、今回の行数・走査数の証拠から正当化できない。因果が未実証のWorker移送・描画・GC・global検証は、計測で主要因と確認できたものだけ後続へ進める。
