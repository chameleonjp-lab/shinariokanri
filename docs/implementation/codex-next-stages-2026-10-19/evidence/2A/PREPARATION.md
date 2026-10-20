# 2A：NP09から再開するための準備

対象は[依頼2A](../../requests/2A.md)の読取・設計だけ。NP09実装・安全性検証、NP10実装・性能比較は未実行で、性能案の採否は保留。これは既存[1D比較設計](../../../../optimization/next-stages-2026-10-19/COMPARISON_DESIGN.md)の2A入口を具体化する記録であり、基準不足を解除しない。

## 着手判定と今回の変更前後

開始mainはユーザーによる#78のmerge後 `14d78659320fda40babe751116df171b767055bc`、tree `0192abee58609a81132aec37dd55b4fa630fb863`。#75〜78の実mergeと最終PR CIを[検証記録](VERIFICATION.md)で照合した。開始時に `handoffs/2A.md` は存在せず、open PRもなかった。過去全履歴から補完していない。

[1D引継ぎ](../../handoffs/1D.md)と[比較設計の採用停止条件](../../../../optimization/next-stages-2026-10-19/COMPARISON_DESIGN.md)は、最初の製品変更前に1Aの現行30/180・各size3標本heap原本を要求する。[1A引継ぎ](../../handoffs/1A.md)・[BASELINE_NEXT](../../BASELINE_NEXT.md)では未取得のまま。#78のmergeやCI成功から、これらの実測完了を推定しない。

| 比較する項目 | 変更前main | 今回の提出後 |
| --- | --- | --- |
| NP09 API / UI | 任意Signalなし、UIのlive guardのみ | 同じ製品bytes。取消実装なし |
| NP10取得経路 | canonical packedの限定metadata経路とinline/過大metadataのfull fallback | 同じ製品bytes。内部形式・全writer・decoder変更なし |
| 現行OFF時間 / ON仕事量 / 保持量 / 正確性の実行 | 1A基準不足。新規原本なし | 新規測定・動的検証なし。数値差はUNKNOWN |
| 2A再開情報 | 自分のhandoffなし、依頼と1D設計が入口 | 本記録・検証記録・短いhandoffを追加 |
| 全体STATUS / 原契約 / fixture / CI | 既存版 | 差分なし。最終tree比較はPR本文で確定 |

[GUARDRAILS G06](../../GUARDRAILS.md)の「Codex Cloud environmentsは使用・作成・変更しない」を維持する。初期読取時にCloud shellでcloneを試みたが、この条件を読んだ後に停止した。完了checkout・build・計測の証拠ではなく、以後はGitHub連携で読取・文書提出、既存Actionsで検査する。通常環境の代わりにCloudやCIで正式baselineを代行しない。

## NP09：変更する境界の候補

以下の行番号は開始mainに固定した読取位置。製品コードには反映していない。参照blobは[検証記録](VERIFICATION.md)に残す。

| 既存箇所 | 静的に確認した現状 | 実装時に守る境界 |
| --- | --- | --- |
| `src/ui/HistoryPanel.tsx:36,38` | page/detailのeffectはliveをfalseにするだけ。pageはrevisionに依存、detailはkeyとoperationIdに依存 | 各effectの要求専用controllerと表示世代を結合。検索・page・作品/版・store identity・unmountで旧要求を失効し、draft/選択は保持 |
| `src/ui/StoreContext.tsx:15` | author scopeはaccount＋作品。scope文字列だけではstore再生成を区別できない | account/role世代とstore寿命をstore側でも検証。同じscope・revisionで別storeへ変わる負例を含める |
| `src/storage/store.ts:866–887` | pageは全historyIdsを取得して全行対応を検査。detailはheader/command取得後にmaterialize | 入口、await後、公開直前をfenceする。任意signal未指定の呼出互換と全metadata検査・既存errorを保持 |
| `src/storage/historyMetadata.ts:readHistoryPageCommands` | private DBCore getMany requestだけにmetadata capabilityを付与 | 取消の所有も要求に閉じる。共有native transactionをabortしたり、別要求のsignalを上書きしない |
| `src/storage/recordPartsDatabase.ts:34–64` | getMany後の行ごとのdecode、part payload取得、unpack、seal/key検査がある | 後続行/本文batch・復号の前後を停止境界にする。実行中native requestや同期処理の物理停止を約束しない |
| `src/storage/store.ts:610–627` | detailは親操作を再帰取得しcheckpointから復元。現在signalなし | 親取得・再帰・patch適用の境界まで自要求の取消/所有を通す。64復元点・cycle・別作品拒否を保持 |

候補APIは `historyPage(projectId, {query?, page?, size?, signal?})` と `historyCommand(projectId, operationId, {signal?} = {})`。既存 `StorageError('CANCELLED', ...)` と `checkCancelled` を使う方向で、共有型への新契約は今回追加しない。

所有確認は `accessGeneration` / `cacheLifetime` だけで完結させない。G01のproject/revision、同revisionのnative header fingerprint、world pinのproject/snapshot/hash、schemaを含むread imageの照合を設計・検査する。正規の権限更新時に古い結果を返さないことを確認し、今回の準備で認証/権限方式は変更しない。

現行の単一getManyは、取消を受ける前に全行を返す可能性がある。chunk案を使っても、取消しない要求は全historyIdsを検査してから結果を返す。UIイベントが入るyieldとDexie transaction寿命を実ブラウザーで検証し、同期mapにsignal判定だけを追加して「途中停止できる」としない。返却済みpayload量と後続復号削減量は別々に記録する。

## NP09：独立期待と比較

| 候補 | 待ち時間OFF | 仕事量ON | 保持量 | 正確性 |
| --- | --- | --- | --- | --- |
| C：現行live guard | 未測定 | 未測定 | 未測定 | 今回は静的読取のみ |
| A：要求専用Signalを境界まで伝播 | 未測定 | 未測定 | 未測定 | 下表の全負例を予定 |
| B：同じ所有者で最新要求へcoalesce | 未測定。開始済み旧要求による待ちを分離 | 未測定。未開始要求の削減と開始済み仕事を分離 | 未測定 | 下表の全負例を予定 |

採用案は未決定。1Dどおり、原100/1000/10000履歴、原Standard/Largeを同じfixture/host/browser/driverで直列比較する。A/Bはそれぞれ別sourceとして封印し、OFF各操作30標本とON別contextを混ぜない。最新入力→表示とcancel→後続停止、全metadata/body rows・bytes、decode/hash/part-key仕事、保留要求/closureを記録し、未対応counterを0としない。利点が不明・追加費用だけなら採用しない。

独立期待は[凍結full-reader oracle](../../../../../tests/optimization/history-page-oracle.ts)とfixtureのliteral ID/値/順序から作る。候補から期待を生成しない。下表は**未実行の検査設計**であり、RED/GREENの結果ではない。

| 入力・操作 | 独立して確認する結果 |
| --- | --- |
| 遅い旧query→速い新query、page 0→1→0 | 最新要求だけが表示される。旧結果でquery/page/選択を戻さず、全pageのID/順序/検索/totalはoracle一致 |
| 取消済みsignalで開始、次batch/行/復号直前に取消 | CANCELLEDで不完了。開始前はDB仕事なし、以後は実行中分を分離して後続仕事の抑制を確認 |
| 作品切替、同ID別作品、account/role撤回、close/reopen、同scope別store | 古い要求は新しい所有者へ返却/表示しない。次の正常要求は成功し、draftと選択を保持 |
| 同revisionのheader/pin/hash/schema差替、ABAの遅延完了 | 単なるrevision一致では採用しない。旧read imageを混入しない |
| detail取得中、親履歴取得中、unmountで取消 | 後続parent/batch/復号を止める。別のpage/detail/full readerや同じ親transactionの読取を巻き込まない |
| signalなしで画面外missing、別作品/同ID、未知row、cycle、破損本文 | 元のerrorと検出時点を保持。取消を空一覧や完全性合格へ変換しない |
| cancelと破損/DB errorの競合 | 完了しなかった検査は未検証。取消していない要求の元errorを隠さず、他要求へ成功を転用しない |

実装時は予定 `tests/optimization/history-cancellation.test.ts` と既存history/UI検査で、制御した遅延点と独立期待を先に確定してREDを観測する。テストだけの境界制御を製品APIへ入れない。G01のdraft回帰と既存metadata capabilityの並行full-read検査を維持する。

## NP10：NP09安全性確認後に開く残区間

以下はコード入口の整理であり、NP10の比較・実装開始ではない。NP09の局所検査・比較・元必須CIが成立するまで変更しない。PRを分けるならNP09をユーザーがmergeした後の更新mainで再開する。

- canonical packedだけが軽量経路に入る。`canonicalHistoryHeader` のshape/size判定と既存 `history.write.fallbackShape/fallbackSize`、native representation別のinline/packed/canonicalを計測入口にする。inlineは `needsRecordParts` falseでheader化されず、過大metadataはsize fallbackとなるという静的分岐を確認した。実割合/時間/bytesは未測定。
- Cは現行、Aは原本文を残す検証可能なinline header、Bは全writer原子更新のmetadata側表という1D候補を維持。BにはDB版・移行前復元点・cold全件再照合・途中移行・旧/未知形式fallbackを含む別の具体設計が必要で、今回schemaを決めない。
- 原Standardの既存本文0を維持し、原Large/inline/過大metadataで実body削減を測る。旧P2-04の観測は[元記録](../../../../optimization/phase2/p2-04/README.md)にあり、現在mainの実測へ転記しない。O(Nmetadata)と全historyIds/part-key照合を維持し、単純な `historyIds.slice` やmetadata O(page)案は保留。
- writer入口は `saveProject:1129`、`importScenario:1730–1762`（new/clone/replaceと2行batch）、`commitPreparedAck:1391`、`confirmSyncResolution:1419`。共通middlewareだけを見て全writer合格とせず、各経路で本文/metadata/native/外部native1.0を独立照合する。
- 既存history-metadata検査の全件oracle、importOrigin、64復元点/cycle、未知row、画面外missing、本文破損・自己整合metadata、quota/取消/atomic、cold/full/exportを保持。移行・全writer・新表現対応full decoderによるrollbackも初段階で検証する。本文未読を検証済みにしない。
- NP09の戻し方は任意signal/取消経路を戻しUI世代guardを保持。NP10は新表現対応full decoderを残して高速経路停止、旧binary復帰は全本文検証後の旧envelopeへの原子的書戻し。DB downgrade/削除は禁止。今回の文書PRを戻す操作とは別である。

## 条件が整った後の順序

1. 1A担当が許可済み通常環境で `BASELINE_NEXT.md` の残りを再開し、clean source/tree/build/配信bytes/seal・原30/180・各size3標本heapを固定する。これは今回2Aで代行しない。旧rawやCI buildを基準へ付け替えない。
2. 2A担当が更新mainと実merge/CI、1A原本bindingを再確認。1A全体基準とNP09直前Pnを分離し、同時編集者なしを確認してNP09のRED→実装→安全性/比較→元全CIへ進む。
3. NP09確認後だけNP10を比較・実装。各製品PRは元全unit/build・3engine全inventory・rb03/rb04/rb10・回収/最終verifyを保ち、正式受入合格を開始条件には追加しない。
4. 同じ未統合文書PRの追記は既存branchを使い、後日の製品差分は新Draft PRでレビューする。2Aを完了にせず、2Bへ進まない。STATUSは更新しない。
