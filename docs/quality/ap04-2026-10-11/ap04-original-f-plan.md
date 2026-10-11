# AP04 原受入 F の通常操作入口

原20担当ケースと child F29/F32/F35/F56 の24件・96節を追加した authored 入口である。全節 `not_run`、合格0。原116件・464節と各given/when/then/negative_or_edgeの文言は変更しない。タイトル登録、ソース行、ハッシュ、過去合格、unitを原受入の成功へ転記しない。

`ap04-original-f-proof.json` に原4節の全文、対応entryの実ソース全文・行・SHA256、通常操作行、assert行、具体実行command、各節の計画した直接確認と残る独立境界を保存した。現在のworking treeは未固定なので統合候補のfreeze時に依存ハッシュを再照合する。

| 原ケース | 新spec | 原whenの実行入口 |
| --- | --- | --- |
| AT-F03 | ap04-original-f-writing.spec.ts | 通常scene詳細で二筋を追加し、恋愛カードから本文を編集・保存して戦争カードから同じ本文を開く。 |
| AT-F04 | ap04-original-f-writing.spec.ts | Sの視点A/目標/葛藤/結果/新情報を通常詳細で入力して保存し、Tを空欄のまま保存する。 |
| AT-F05 | ap04-original-f-writing.spec.ts | 通常作者別案を分岐し、導入/展開/結末へ未入力/8/2を割り当てて順序差分を確認・取消・下書き適用する。 |
| AT-F06 | ap04-original-f-writing.spec.ts | 章カードからS本文の元文字を残すnative末尾追加を行い、要約を別に変更、章選択後に横書き/縦書き/記録付き提示を通常操作する。 |
| AT-F09 | ap04-original-f-world-versions.spec.ts | Wの場所説明を通常編集し改訂固定版2を作成、Qだけ世界版差分を確認して新pinを保存、固定版参照modalをその通常閉じるcontrolで閉じてPの旧固定情報を開く。 |
| AT-F13 | ap04-original-f-hierarchy.spec.ts | 通常分岐の階層図で章折りたたみ件数を読み、場面・台詞へ掘り下げ未接続出口を正常selectorで再接続する。 |
| AT-F21 | ap04-original-f-dialogue.spec.ts | 話者名変更、sceneのL2/L1順序、L1本文変更、production toolsの独立copy/splitを通常保存する。 |
| AT-F22 | ap04-original-f-material-output.spec.ts | 章の記録付き提示で本文だけ/演出込みを通常切替し、制作素材一覧で仮/完成/bytes不足を確認する。 |
| AT-F24 | ap04-original-f-material-output.spec.ts | 通常完全保存の実downloadを空new contextへ復元し、通常目的別出力でreader/playable/runtimeと非対応profileを選んで検査する。 |
| AT-F25 | ap04-original-f-material-output.spec.ts | 公開版1から作者別案を分岐し別scene本文を保存してrejectedにし、通常flow edge追加とgraph/profile編集後にproduction/runtimeを実downloadする。 |
| AT-F28 | ap04-original-f-material-output.spec.ts | 通常source詳細で各引用箇所/ISO取得日時を保存、loreへsource IDsを追加、公開範囲の再配布を実検査する。 |
| AT-F29 | ap04-original-f-source-schema.spec.ts | 通常reviewから旧引用を開き、L本文改訂と段落の実削除を通常編集で保存、修正済み→確認済みを順に保存して元固定版引用を開く。 |
| AT-F32 | ap04-original-f-source-schema.spec.ts | 常時表示ボタンと一覧だけで関係線作成・章scene順序移動・bulk state保存をtapまたはTab/Enter/Home/ArrowDownで独立実行する。 |
| AT-F35 | ap04-original-f-source-schema.spec.ts | 実全体downloadを空newとcloneへ通常importし、通常履歴の単体影響preview/restore、同一project merge、replaceの選択と拒否を試す。 |
| AT-F51 | ap04-original-f-production.spec.ts | 出来事worldtick5→15を通常保存、未実装scene抽出、執筆taskへimplementation依存を追加して循環保存を試み、除去後作者再確認doneを保存する。 |
| AT-F52 | ap04-original-f-production.spec.ts | 通常試読で各経路を記録し、制作量panelで各traceを選び固有件数/提示量/対象版/不明数を表示、速度2と仮定を入力して見積保存する。 |
| AT-F53 | ap04-original-f-storyboard.spec.ts | 通常章提示でコマからline本文位置へ戻り、実青PNGへ参考素材の参照を選択差替え、完成stageを保存してframe finalAssetを更新する。 |
| AT-F54 | ap04-original-f-world-versions.spec.ts | W場所を改訂固定版2にしwork pin変更差分を保存。各媒体revisiontoolsの元設定差と旧本文を通常previewし、別candidateだけ保存する。 |
| AT-F55 | ap04-original-f-graph.spec.ts | B中心で入って来るA→Bを読み、49/50時点と経路checkpointを通常切替、格子/横整列後native関係を比較する。 |
| AT-F56 | ap04-original-f-source-schema.spec.ts | 正常改名、template required/nullableとenum→number差分preview/保存拒否、manifest hashが正しい型不正ファイルimport拒否を行う。 |
| AT-F57 | ap04-original-f-index.spec.ts | 読み/表記揺れ/旧名/別名を全文検索、作者索引で同名固定IDを選別、分類選択を正常保存、索引modalから実Unicode paragraphを開きHTML/Markdown公開索引を実downloadする。 |
| AT-F58 | ap04-original-f-catalog.spec.ts | 通常scene追加とevent/task参照追加、保存一覧再表示、card/tableを詳細へ開いて固定IDを読みdiagramと照合、bulk preview取消→二件目put故障→retry→履歴undoを行う。 |
| AT-F59 | ap04-original-f-graph.spec.ts | 通常graph category六種と1/2hop、legend/table/allを切替え、実derived元情報modalからflowedge編集を開き固定IDを確認して全体へ戻る。 |
| AT-F60 | ap04-original-f-catalog.spec.ts | maintenanceで残すID/全参照pathをpreviewし取消→merge→履歴undo、背景/外部保持、bulk preview取消→保存→undo、note archive→undoを行う。 |

実行時は同じfixed candidate/build/base/inputを使い、given `.scenario` とhash、実操作、失敗/取消/再試行、cold状態、実ダウンロード成果物、元ID/版/Unicode段落・範囲/各素材bytesを一続きで記録する。IDBは正本の読取比較だけに使う。quota故障は明示した実transaction失敗注入であり、成功データを直接書き換えない。

F13はscene→graph ID集合と既存診断dedupで上位へ入口/出口/条件errorを集計する。静的図の算出条件は既存per-condition try/catchで診断し、runtimeの初期化器は変更しない。F57は既存public projectionのpublicCatalogだけをHTML/Markdownへ接続し、実public paragraph/edition IDへリンクする。作者索引modalを閉じて既存onOpenTargetへ確定rich field/block/Unicode CP範囲を渡す。秘密名/読み/alias/作者メモ/参照数は実成果物で否定する。F51のauthor reconfirmation doneはE ownerが担当するsourceAffected修正に依存し、oracleをneeds_reviewへ緩めない。

F29のreviewer UUIDはfixtureの識別であり実reviewer Auth/comment作成を証明しない。ローカルの旧引用・対象版・段落削除・二段階確認・cold/new/clone保護を独立確認する。F32のtap/keyboardは別通常context、DOMfont-size200%は補助で実browser文字拡大は未観測。F35のnew/clone/mergeとrollbackを正常UIで検査し、outboxが未同期のreplace拒否をreplace成功と扱わない。実sync後の成功replaceは独立not_run。F57のタグは既存custom enum欄を使い全文と作者indexを分ける。専用tag query実装の証拠とはしない。F59の実reader成果物の秘密count不在をlive limited-role graphに代用しない。

F30/F34は実Auth/二端末、F31/F33は実smartphone/別端末が最終境界として残る。既存responsiveや再開の補助手順は原句への具体commandと不足部分を別記し、実端末条件をローカルviewportで合格にしない。削除済み再開marksの既知ローカル欠落はAppで案内へ接続し、F33追加補助specで正常登録/実archive/cold/履歴undo/同ID本文保持を検査する。元24件96節とは別補助として全not_runを記録し、原F33全4節の成功は付けない。実際にnativeから欠けたIDの通常手順も未観測。F31/F33の補助commandと各原条項の不足部分はproofのindependent_support_entries_not_in_96_clause_countへ具体化した。重い検査は統合担当の許可通知を待つ。
