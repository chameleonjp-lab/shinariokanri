# NP05：第2段階の比較設計（1D）

これは比較の入力・独立期待・棄却条件を固定する設計であり、性能案の採用記録ではない。全候補の新しい速度・仕事量・保持量は未測定。元NP05の最終比較は3Bに残る。

## 基準と候補の識別

開始mainはユーザーによる#75・#76・#77統合後の commit `aa86e25b91287329c061a97d1d3f9c4e0e0e9f85`、tree `f191b5bfce8d356470bb507ab5c257c322b6fc95`、src tree `6c0098365af131f13d36c53b499f458a36ae225e`。依存の実merge・CIは[1D検証記録](../../implementation/codex-next-stages-2026-10-19/evidence/1D/VERIFICATION.md)。

| 区分 | 候補と証拠 | 使用できる範囲 |
| --- | --- | --- |
| 1Aの変更前基準 | [1A引継ぎ](../../implementation/codex-next-stages-2026-10-19/handoffs/1A.md)。base a8caf979、build/配信bytes/現行30・180・heap未取得 | 原入力・過去版の所在。性能比較の現在値には使えない |
| 1B局所候補 | db287485、tree f7f24d96、build 16a47445cc54b018cf19 | 原N05別2download・補助RG・11反例。正式速度ではない |
| 1C局所候補 | dirty build 6bcf74d891d634f05368、source/実出力は[1C引継ぎ](../../implementation/codex-next-stages-2026-10-19/handoffs/1C.md) | 局所Chromiumの接続。dirty試行をclean最終候補へ付け替えない |
| 更新main | 上記aa86e25。1B/1Cに製品src変更なしをsrc treeで確認 | 2A前に新しく封印する候補の出発点。src一致だけでbuild/driver/fixture同一を推定しない |
| 各改善直前の親候補 Pn | 各依存PRをユーザーがmergeした後のmainを再取得し、source/tree/build/配信bytes/fixture/driver/argvを固定 | 各NPの現行対照。1Aの全体基準と別列にする |
| 最終候補 F | 3A統合後に3Bで固定、現在は未指定 | NP05最終・NP06・NP16が同じ正式結果を参照。3C証拠commitは別 |

**採用停止条件：** 現行30/180・各size3標本heapの原本がないため、最初の製品変更前に1Aの不足区間を取得する。今回1Dでは代行測定しない。2Aは読取・設計まで進められるが、その不足を飛ばして製品変更・採用しない。途中の製品変更後はPnを同じ定義で再計測する。古い04a7/1fcのrawを改名しない。

## 全比較に共通する方法と採否

- 原Standard `standard-r06-v1`（8800、fixture SHA de0b9420abec95bcc37fc7fb7c3dc4c2667082258678f750af33bb53f8a557f5）、原Large `large-material-rb10-v1`（88003、SHA 814daf96a6511cf47409f3497b03c7ba0309af250bfd87306c44a1dec5d5a917、実75497472素材bytes）を固定する。[原契約](../phase1/contract-lock.json)と[暫定逐条表](../../acceptance/phase3/TRACEABILITY.json)に入力集合を保持。補助入力は別名・別hashで併記し、原入力を置換しない。
- 現行C、案A、案B（NP14は追加案Wも）のsourceを別々に封印する。同一host/OS/browser・lock依存・DB初期状態・driver bytes・計測区間・操作列で直列実行する。fixture生成、seed、独立照合は時計外。warm/cold・cache初期化条件を記録し、異なる条件を混ぜない。
- **OFF時間**、**ON仕事量**、**保持量**、**正確性**を4列にする。OFFの全生値・p95/最大と失敗を残す。ONは別DB/contextで同じ入力を使い、rows/bytes/hash calls/走査/compile/位置生成を記録。未対応counterはUNKNOWN。ON時間をOFFへ算入しない。
- 補助時間は各操作30標本を基本にnearest rankで比較し、順序と全不利値を保存する。正式8指標・180保存とは別の観測名にする。準備やhost雑音を隔離できない値から因果や有意差を断定しない。
- 独立期待は最適化経路の出力から作らない。literal full reader、別の全件再生成、原fixtureの固定ID/値/順序、保存後native/実出力を対照にする。検査器と最適化が同じ共通関数を通るだけの一致は不十分。
- 先に全件同値・原子性・権限/固定版/履歴の安全ゲート、次に原p95条件を判定する。局所の主要操作で繰返しの利点が確認でき、他操作の劣化・保持増・移行費用を説明できた案だけ採用候補にする。差が不明・利益なしなら現行を選び「比較済・不採用」。必須欠陥や比較未実施を不採用で閉じない。
- 2A〜2Cの各製品PRは元全unit/build/3engine全inventory・rb03/rb04/rb10・回収/最終verifyを維持する。ここで製品やDB schema、APIを追加しない。

## NPごとの現行＋2案と独立検査

| 対象／所有path・依存 | 現行C | 案A | 案B |
| --- | --- | --- | --- |
| NP09・2A前半：`src/storage/store.ts:historyPage` / `src/ui/HistoryPanel.tsx`。実装者1人 | UIのlive判定で表示を抑えても、古い要求のDB/metadata/filter処理が続く。任意Signalなし | 要求専用AbortSignalを入口・await後・全metadata走査の境界へ渡す。共有transaction全体をabortせず、自要求の後続処理を止める | 同じ所有者内で要求を直列coalesceし、最新要求だけを開始する。開始済み処理の停止可否と待ち時間は別計測 |
| NP10・2A後半：同store、`src/storage/historyMetadata.ts`、互換decoder。NP09後に直列 | store-ownedかつ閾値内のpacked commandだけmetadata fast path。inline/原Large過大metadataはfull fallback。全ID/metadata/part-key照合あり | inlineも原本文を残した検証可能なheader表現の候補として比較。metadataが閾値外ならfull fallbackを維持し、Largeで効果がない結果も残す | 原本文と対応する軽量metadata側表を全writerで原子更新し、cold/移行時の全件照合・破損時full fallbackを行う案。移行を要するため独立した小PR設計が前提 |
| NP11・2B保存：`store.ts:saveProject` とnormalize/reconcile呼出元。storeの編集者1人 | exact v1/v2 request bytes、複数normalize/global検査、既存差分書込 | `reconcileDeliverables` が入力entitiesを変えなかったことをoperation内の不変identityで証明できる場合だけ、2回目normalizeを省く。証明不能は現行 | 2回のnormalize内だけで同じprevious/draft recordの正規化結果をoperation-localに再利用する。targetChanges/contentDelta/writeContentへMapを持ち回らず、operation終了で解放 |
| NP13・2B検索：`src/domain/catalog*.ts` / `derivedIndexes.ts` / `src/ui/CatalogPanel.tsx` / `WindowedList.tsx`。保存担当とpathが分離できる場合のみ並行 | 採用済derived owner/8Mi text予算、全filter/Map・全matching本文位置の生成が残る | 全結果ID/順序/件数の判定を保持し、詳細な本文一致位置だけ表示page/選択結果の必要時に生成 | 検索scopeごとの必要入力準備を要求内で遅延し、必要な既存indexだけ利用。正本・永続posting・新providerを導入しない |
| NP12・2C前半：`store.ts` / `src/App.tsx` / `src/ui/EntityEditor.tsx`。2A/2B統合後、実装者1人 | 選択作品の完全current、非選択本文は一覧から分離済み | 下記の選択人物一画面に限った非永続read model＋依存closure。未対応操作は完全読込へ戻す | 完全currentのままimmutable依存の再利用と画面構成の遅延だけ行う。取得量が減らないことを明示し、Aの複雑さに見合うかの対照にする |
| NP14・2C後半：`worldClosure.ts` / `worldPins.ts` / `store.ts` cache / App読込所有者 / `derivedIndexes.ts`。NP12後に直列 | inactive graph4件。current/history/export別closure、未知owner full registry、8Mi text予算 | 同じeviction単位で8件 | 同じeviction単位で16件。追加Wとして4/8/16MiBのinactive推定payload予算も比較し、単位・見積りと実heapを分ける |

| 対象 | 独立期待・負例 | OFF／ON／保持と採用条件 | 戻し方 |
| --- | --- | --- | --- |
| NP09 | 原100/1000/10000履歴・Standard/Large、全page/query/orderをfull readerと全件照合。連続入力・選択切替・unmount・account/role・store close/reopen・遅延応答、取消後の次要求。取消で破損を合格にしない | 入力→最新page表示、cancel→自要求の後続停止。ONは取消前後のDB/metadata/filter work。保持は保留要求/closure数。A/B双方の待ち時間と不要仕事を比較 | 任意signal/coalesce経路を停止し現行へ。UI世代guardは保持 |
| NP10 | 全履歴ID/作品/順序/query/親cycle/checkpoint64/importOrigin/本文hashを別full decoderで照合。画面外missing、intact-keyの本文破損、metadata再計算、未知版、inline/過大、全writer・new/clone/cold | page/selected/full/save/exportそれぞれのOFFとwriter/reader hash・parts/metadata rows/bytes。移行時間・一時Map/側表保持も計測。全metadata照合はO(Nmeta)のまま。本文未読は未検証と表示上も判定上も区別 | 新表現対応full decoderを残しfast path停止。旧binaryへ戻すには全本文検証後、旧envelopeへ原子的書戻し。DB downgrade/削除は禁止 |
| NP11 | 原3保存形式×2 fixture、独立native差分、旧v1/v2実request bytes・同operationId再送・同ID別request、作者順序変更、二重送信、snapshot/pin変更、quota/最終故障/cold、stale draft・fake/遅延ACK | UI区間・command全体・prepare/reconcileと残るfull hashを分離。ONはnormalize走査/生成/解放・hash bytes・commit rows。Aの同一identityだけでは値同一の証拠不足なら不採用。Bの保持/比較費用が利益を上回れば現行 | 個別省略/memoを無効化。save tuple capture/generation fence/ACK最終guardは残す。request版やDB契約は変更しない |
| NP13 | 独立全件compileからID/順序/件数/labelと全page連結・位置を比較。同名異ID/別名/Unicode正規化/archived/非表示選択/秘密/role/pin/schema差替、予算外尾部・保存直後・複数作品 | 元操作列 `霧→霧の→門番→記録→霧→霧の` とnavigation。OFF入力→確定UI、ON走査/position生成/match数、保持owner/entries/references/code units。表示30件をDB30件や全走査ゼロと解釈しない | 位置生成/遅延準備を現行へ戻し、派生cache消去で再生成。作者分類/候補/確定参照/公開投影は混ぜない |
| NP12 | 同一人物の全表示値と参照label、編集→保存→検索→cold・完全出力をfull currentと独立照合。未読/不在/エラー、依存外不正参照、同revision header差替、途中取消・切替・ABA・draft保持 | cold人物選択→入力可能、保存は完全capture込みで測る。ONはentity/relation/block/world rowsと未取得量。read view/完全capture重複保持も計測。画面だけ速く保存/安全が悪化する場合を開示し不採用判断 | 一画面を既存loadEditor/EntityEditorへ戻す。保存失敗時のdraftを保持し、部分値をProjectDataとして渡さない |
| NP14 | 同じ原操作列でcurrent・history/exportの推移closureを別全registry oracleと比較。同ID別hash/過去版/retained owner・unknown/cycle/取消・access/store寿命、draft/inflight eviction・同時save/ACK | 冷却再読込/切替/保存/履歴/exportのOFF、ON読込/hash/evictと4/8/16/Wの保持。各size3標本・2GC後のmain renderer V8 heapを別測定。peak/RSS/Worker/native/作者draftは別範囲 | 容量値/weighted policyだけ戻す。未知owner full fallback、同一read-image save、反映世代/ACK guardは保持。canonical世界や入力を削除しない |

NP11は[棄却したP2-03 shared changeset](../phase2/p2-03/README.md)の再採用ではない。同案はOFF4観測中3不利かつprior Map保持の費用があった。A/Bはnormalize局所に限定した別案で、shared target/delta/write Mapや新request APIを入れない。効果はUNKNOWNのまま比較する。

NP13は[棄却したprovider B/ordinal A](../phase2/p2-06-07/MEASUREMENTS.md)を名称変更して採用しない。既存ownerを保ち、全matching位置生成またはscope準備の局所費用だけを対象にする。NP10のhistoryIds.slice(page)単独も画面外欠損を見逃すため比較候補から除外した。[採用済み限定範囲](../phase2/p2-04/README.md)と[世界保持の既存費用](../phase2/p2-05/DESIGN.md)はそのまま残す。

## NP12で最初に扱う一画面と保存境界

**選択人物の詳細・基本情報一画面**を最初の対象にする。原Large fixtureには人物1000件があり、章を新しくfixtureへ加えず比較できる。人物ID/name/summaryと、その画面に必要な正式参照のlabel・版を表示対象にする。人物の全タブ・関連全文・検索/図/年表・履歴・完全出力への展開は、完全読込または別の明示した依存読込へ戻す。既存EntityEditorは完全ProjectData前提なので、部分値のcastや空配列で代用しない。

設計上の状態型（この1Dで製品型へ追加しない）：

```ts
type ReadSlot<T> =
  | { state: 'unloaded' }
  | { state: 'loading'; requestGeneration: number }
  | { state: 'loaded'; value: T; proof: ReadProof }
  | { state: 'absent'; proof: ReadProof }
  | { state: 'error'; error: Error; retryable: boolean };
type CharacterReadView = {
  kind: 'character-read-view';
  owner: ReadOwner;
  character: ReadSlot<CharacterBasicFields>;
  referenceLabels: ReadSlot<readonly ReferenceLabel[]>;
  completeness: 'screen-only';
};
```

ReadOwner/ReadProofはaccount、role/access generation、project、revision、世界pinのproject/snapshot/hash、schema signature、native header fingerprint、store lifetime、request generationを含める。同revisionでheaderだけ差し替わる場合やclose/reopenも失効する。不在は照合済みの完全性範囲でのみ確定し、未読・失敗をabsentにしない。

保存は作者のedit intentと所有proofを渡し、storeが同じnative read imageの完全currentと必要世界をcaptureし直す境界にする。既存の完全global検証、request v1/v2、history token/64checkpoint、projects/entities/commands/outbox/assetsの原子確定をすべて通す。proof不一致はdraftを保持して再確認し、別版へ黙って再baseしない。部分read modelは保存APIのProjectData入力にならない。Aの依存完全性を証明できなければB/Cを選ぶ。

## 原時間条件と未採用の追加目標

| 指標（原順序） | Standard p95 ms | Large p95 ms |
| --- | ---: | ---: |
| cached_startup | 3000 | 10000 |
| selection | 200 | 上限なし・観測 |
| list_switch | 200 | 上限なし・観測 |
| compound_search | 500 | 2000 |
| command_save | 1000 | 上限なし・観測 |
| next_period | 200 | 上限なし・観測 |
| timeline_frames | 33.4 | 上限なし・観測 |
| graph_frames | 33.4 | 上限なし・観測 |

別契約の原180保存command p95≤1000msは両fixtureの各条件で維持する。Largeの上限なし6指標へは**追加目標案・未採用**の欄だけを設ける。UI保存p95≤1000ms、図/年表p95≤33.4msは提案であり、原合否・達成実績にしない。cache4件/8Mi code unitsも総メモリ上限ではない。

次は1D統合と不足baseline取得が先。2Aの実装、候補採用、3Bの正式測定はこのPRへ含めない。
