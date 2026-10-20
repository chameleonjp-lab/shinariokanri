# 2C準備：人物一画面の読込・世界保持の比較設計

2026-10-20 UTC。対象はNP12→NP14の独立した読取・比較準備だけ。**両NPは未実装・動的検証／実測未実行、採否保留**。製品変更・比較済み・第2段階完了を報告する文書ではない。

開始点は#80ユーザーmerge後main `4930bd5bf3c3f53cf65483e270e8df94d515be2c` / tree `a4b99bb5497cc49ce7c2922e7db367b31a6f95e4`。[実merge・CI・読取原本](VERIFICATION.md)。#79/80は準備3文書ずつで、2A NP09/NP10・2B NP11/NP13の必要成果は未完了。1Aの現行30/180・heap・clean build/配信bytes/sealも不足する。加えて開始mainの全CIはunit timeoutで失敗している。

原方針は[1D比較設計](../../../../optimization/next-stages-2026-10-19/COMPARISON_DESIGN.md)、[D02/D05/D11](../../../../optimization/phase1/DESIGN.md)、[P2-05採用境界](../../../../optimization/phase2/p2-05/DESIGN.md)、[2C依頼](../../requests/2C.md)。既存の世界closure・4件保持・保存整合性修正を再実装しない。

## 今回の変更前後

| 項目 | 開始main | 今回の提出後 |
| --- | --- | --- |
| 人物一画面・完全current・保存／検索／全量検査 | 既存製品 | 同じ製品bytes。部分APIを導入しない |
| 世界closure・whole row・4件保持・save/ACK guard | 既存P2-05 | 同じ製品bytes。保持上限の変更なし |
| latency / rows・bytes / 保持量 / 動的正確性 | 現行基準不足 | 新規値なし、前後差UNKNOWN |
| 2C再開情報 | 自handoff・局所比較記録なし | 選択画面、保存・失効境界、C/A/B/W、独立負例と阻害を明示 |
| 第2段階STATUS | 1D当時のスナップショット | #75〜80の実merge/CIと未完了区間へ更新 |

## 現mainで確認した接点

| 接点 | 静的に確認したこと／比較時の注意 |
| --- | --- |
| `store.ts:readEditingProject/loadEditor` | 完全currentと履歴tokenを返す。native header fingerprintを再確認し、access/store寿命/取消でfenceする。header一致は未読本文の完全性証明ではない |
| `App.tsx:openProject` | 選択作品を完全loadしてから人物を選ぶ。request generationとAbortControllerを通過した結果だけをpublishし、前editorをreleaseする |
| `EntityEditor.tsx` | `project: ProjectData`前提。reuse、参照候補、関連、逆参照、削除影響、他タブなどに全件依存がある。名前だけ変えて部分値を渡せない |
| `App.tsx:saveEntity/persist` | 最新完全像へ編集を反映し、本文参照のremap・レビュー等を通して保存。単純な人物row更新で代替できない |
| `store.ts:saveProject` | previous/head/historyのtupleをawait前に捕捉、cache非publishでも同一read imageの返却像を使用。全量request hash、完全検査、checkpoint64、原子writeを保持 |
| `worldClosure.ts:readWorldClosure` | discoveryだけ。explicit retained owner→typed参照、直接outer row照合、whole row保持。未知形状/ownerはfull registry fallback、検証を省略しない |
| `store.ts:rememberProject/invalidateProjectCache` | projects/heads/historyIds/completeHistoriesを同時に退避。identity再利用を避け、access/lifetime/versionで遅延publishを拒否する |
| `store.ts:guardWorldRegistry` と既存ACK検査 | retained snapshot IDの異outer row衝突を拒否。ACK最終write transaction内の再検査は容量比較から独立した必須条件 |

関数内の確認範囲とGit blobはVERIFICATIONに記録した。速度の原因や、新規案の安全性が実証済みという意味ではない。

## NP12：選択人物の基本情報一画面

1Dの選択を維持し、原Largeの人物1000件のうち固定した同一IDのID/name/summaryと、この画面に必要な正式参照label・版だけを対象にする。章のfixture追加、全タブ・全画面のpartial化へ広げない。未保存本文/作者メモ/JSON bufferは別の作者入力ownerに残す。

| 案 | 変える範囲 | 費用・比較条件 |
| --- | --- | --- |
| C：現行 | `loadEditor`の完全current＋既存EntityEditor | global検査・参照・編集・保存の全費用を対照にする |
| A：screen-only read model | storeが人物と必要依存を別型で返す。Appの専用一画面branchから表示し、他タブ/未対応操作は完全読込へ戻す | `editorReadModel.ts`や専用基本情報componentは将来案で未作成。元EntityEditorへcastしない。完全captureとread viewの重複保持も計測 |
| B：完全currentのまま遅延 | immutable依存再利用と画面構成の遅延だけを局所比較 | DB取得量は減らない。既存再利用との差分がなければ同じ効果を新成果に数えない |

**入口の費用を隠さない。** 現行openProjectが先に全件loadした後でAを呼ぶだけなら、一画面のDB取得削減の証拠にならない。cold作品選択→同じ人物が入力可能、人物切替、完全fallback、保存→検索→復帰までを記録する。必要な作品一覧/選択ID準備や既存画面のmountが完全読込を強制するなら、その費用を含め、対象を狭めるかAを不採用とする。全面一覧改修を暗黙の前提にしない。

### 状態・所有・保存の契約（設計のみ）

- `unloaded / loading / loaded / absent / error`をdiscriminated unionで分け、view自体にも`kind: character-read-view`、`completeness: screen-only`を持たせる。参照の集合全体と各依存の読込状態を区別する。不在は該当ID/版を照合できた範囲でだけ確定し、未読やerrorを削除・参照切れ表示へ変換しない。
- owner/proofはaccount、role/access generation、project/revision、world pinのproject/snapshot/hash、schema signature、native header fingerprint、store lifetime、request generationを含む。await後とUI publish前、保存captureの開始/確定境界で照合する。A→B→Aの同IDでも古いidentityを再利用しない。
- 保存入力は所有proofと作者のedit intent。store内で同じnative read imageの完全current・必要世界・history/headをcaptureし、最新像との差分・本文参照remap等の既存意味を保つ。別版へ黙ってrebaseしない。proof不一致/取消/失敗時はdraftとraw bufferを保持する。
- 部分viewは`saveProject(ProjectData)`の入力にしない。新しいscreen入口にはstore発行の偽造できないcapture能力と実行時照合が必要。`as unknown as ProjectData`、spread＋未読を`[]`補完、viewのmarkerを落とすadapterも、書込前に拒否されることを負例で証明する。
- **空配列だけでは部分値を識別できない。** 正当な完全空作品の保存は維持する。markerだけを見た拒否や型検査だけでは不十分。screen入口の証明と完全captureからの組立てを実行境界で担保できなければAは採用しない。既存完全writerを壊す全API移行を無断追加しない。
- 完全保存/全文検索/全量検査/履歴/完全出力・復元は独立した完全captureへ戻す。画面外不正参照や破損が完全検査で引き続き拒否されることを確認し、一画面loadedを作品全体検証済みに昇格しない。

### 先に固定する独立期待・負例

以下は追加検査の設計であり、RED/GREEN実行済みのケースではない。原116/464や元fixtureを置換・改名しない。原入力にない負例は別ID/seed/hashの補助fixtureへ分ける。

| 入力・操作 | 独立期待／拒否条件 |
| --- | --- |
| 同名別ID、参照label、参照が循環 | 手計算で固定したID/版/label・順序と別の完全readerを照合。同名で集約しない。循環を検出して既存完全経路/拒否へ戻し無限走査しない |
| 未読依存、既知ID欠損、取得error | unloaded/loadingと証明済absent/errorを別に観測。空候補/削除表示で済ませない。実欠損を健康なloadedにしない |
| 固定世界版、同hash別版、同ID別hash/内容 | 明示したproject/snapshot/hashと正式参照が完全結果と一致。現在worldや同hashだけの別版へ置換しない |
| 別作品、別account、role取消 | 同じ人物IDを含む補助入力でも所有を混ぜない。取消後の旧結果・保存がUI/DBへ混入しない |
| 同revisionのheaderだけ差替 | fingerprint不一致で旧proofを拒否。revisionだけの一致でpublish/saveしない |
| store close/reopen、release→再取得のABA | 旧lifetime/identityの遅延read・save応答を拒否。新要求は通常に読める |
| 途中取消、画面/人物切替の遅延返却 | barrierで順序を固定し旧結果をpublishしない。最新画面と戻り位置を維持 |
| 未保存本文/summary/JSON、保存中の追加編集 | 入力文字列と版を事前固定し、切替・失敗・遅い成功後も新しい入力を保持。提出分だけをacknowledge |
| 部分値→`[]`補完・cast・marker除去 | 型検査と実行入口の双方で拒否。全native table/素材/outboxの前後が一致。完全空作品の正常保存も別に確認 |
| 画面外不正参照、全量出力、new/clone/cold | full oracle/独立期待で完全検査の拒否と全件・全履歴/素材の一致を確認。部分表示の成功で不正を救済しない |

対照は最適化closureの出力を流用せず、native全件と全world registryを読む別経路＋固定literalの人物/参照/編集期待を使う。保存後native/実出力とも照合する。同じ収集関数だけを通る二経路の一致では独立性を満たさない。

### 実行する比較と採否

1A全体基準と、2A/2B製品統合後の改善直前Pnを別識別する。原Standard/Large、同じhost/lock/browser/DB初期状態/driver/操作列でC/A/Bを直列実行し、source/tree/build/配信bytes/fixture/argv/run/attempt/実終了/cleanup/sealを結ぶ。生成・seed・独立照合は時計外、cold/warmを別記録する。

| 列 | 記録するもの |
| --- | --- |
| OFF速度 | 人物入力可能まで、切替/fallback、完全capture込み保存、検索/復帰。各補助操作30生値、nearest-rank p95/最大、全失敗・不利値。元8指標/180保存とは区別 |
| ON仕事量 | header/entity/relation/block/world/commandの実取得rows・bytes、要求数/復号/hash/検証回数、closure走査、未取得範囲。表示件数とDB取得件数を分ける |
| 保持 | read view、完全current/capture、世界row、作者draft、保留要求、派生索引、重複参照を分離。payloadと各size3標本・強制2GC後main renderer V8 heap、計測可能peak/RSS/Worker/nativeを別列。不可能なcounterはUNKNOWN |
| 正確性 | 独立全件結果と全表示値/ID/版/参照、全保存/検索/出力/復元、全負例、元全CIの結果 |

ON診断時間をOFFへ混ぜない。安全ゲート→独立全件一致→原数値条件→局所利益/追加費用の順で判断する。全captureが毎操作を遅くする、重複保持が増える、利益不明、依存完全性が証明できない場合は、比較後にC/Bを選ぶ。**未実行の現在は比較済・不採用ではなく保留**。

## NP14：NP12の採用境界確定後に比較

ここで行ったのは設計だけ。NP12が実比較の結果不採用でも、結果を閉じて現行完全currentを対照にすればNP14へ進める。採用していないpartial APIを前提にしない。同じ操作列を固定し直し、NP12の未完了と並行して保持方針の製品変更・実測を始めない。

| 案 | inactive保持単位・予算 |
| --- | --- |
| C | 現行4件。projects/heads/historyIds/completeHistoriesと関連ownerの既存退避単位 |
| A | 同じ単位で8件 |
| B | 同じ単位で16件 |
| W | 同じ単位で推定payload 4/8/16MiBを別条件として比較。サイズ見積りの定義とmetadata分を固定し、見積り計算の実費もOFFへ含める。超過1rowの扱いも明記 |

既存`world-ownership-measurement-core`のStandard/Largeとsupplementalの6作品/世界source操作を保持する。NP12で固定した人物選択・切替・編集→保存→検索→復帰を全案へ同じ順序で適用し、冷却再読込/履歴/完全出力、draftとinflight操作を保持したevictionも観測する。1/10/50作品の追加入力は原fixtureから区別する。試行中に操作を減らして大型案だけ有利にしない。

選択作品の依存発見走査、whole row取得/復号・hash、unknown owner時full fallback、inactive再読込/evictionを別区間・counterにする。currentとhistory/export/pending/recoveryのclosureは別の根で比較する。既存unknown ownerのO(registry)費用やACKのfull guardをO(closure)と表現しない。

全registry oracle＋literal期待により、unknown owner/未知形状、循環、欠損、同hash別snapshot、同snapshot ID別hash/内容、異outer rowのretained ID衝突を確認する。健全なretained copyで衝突したdirect rowを隠さない。権限取消、draftを保持した切替、cache消去→再生成、遅延read/ACKをbarrierで固定し、全native tableの原子性を照合する。

既存の`world-cache-ownership`、`world-operation-closure`、`world-ack-collision`、`world-ownership-measurement`各testを保ち、予算変更案でも新しい独立期待と必要な反例RED→GREENを先行する。既存4件上限のassertを無条件に緩めず、候補別policyと元4件モードの両契約を検査する。

論理graph数、payload bytes、GC後heap、計測可能peak、各画面/保存/再読込のlatencyを別列にする。App保持・caller-held detail・作者draft・保留save/history token・Worker/native memoryは4/8/16件枠の外にも存在する。容量値やtext予算8Mi code unitsからアプリ全体のmemory上限を宣言しない。cacheを消しても正本・固定世界・履歴・送信待ちと復元結果は変わらないことが条件。

## 採否・戻し方・再開順

| 対象 | 現在の採否／理由 | 戻し方 |
| --- | --- | --- |
| NP12 A/B | 保留。基準・依存成果不足で実比較なし | 一画面を既存loadEditor＋EntityEditorの完全currentへ戻す。draft/入力保存と正本形式は維持 |
| NP14 8/16/W | 保留。NP12判断未了、保持/再読込/heap実測なし。4件の最適性も未証明 | 容量/weighted policyだけ既存4件へ戻す。canonical削除やDB downgradeをしない |
| 既存save tuple/generation/ACK最終guard | 保存整合性の既存必須修正として保持。性能案と一緒にrevertしない | 最適化停止後も同一read image・所有fence・最終transaction guardを残す |
| 今回4 Markdown | 準備・実状態集約として提出、製品/API/共有型/manifest変更なし | この文書2件・自handoffの追加とSTATUS差分だけをrevert |

再開は、許可済み通常環境で1A残測定→2A NP09安全性/NP10必要成果→2B NP11/NP13必要成果の実統合・CI確認→更新main/Pn→NP12独立反例/実装/C-A-B比較/元全CI→採否を閉じる→NP14同操作列C-A-B-W比較/元全CI→2C統合判定の順。小PRなら依存差分のユーザーmerge後の更新mainから続ける。統合担当1人、store/App/共有型を同時編集する子担当は追加しない。

原104/116/464/24/6/68、原fixture/seed/実bytes、v1/v2 request・再送同一性、原子確定、checkpoint64、native1.0、秘密/role、7200秒・112編集・88003記録・113履歴/送信待ち・75497472素材bytes、出力600000ms・進捗/取消2000msを維持する。正式Fの30/180・完全復元/異常系とNP05/06/07/16の確定は3B/3Cに残る。外部22＋別3条件、未採用X、元9release gate/BLOCKEDは解除しない。**3Aへの着手可とはしない。**
