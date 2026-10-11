# 大量履歴と送信待ちの完全保存

REQ-B03/B16/B22/F32/F35/N04/N05/N12/N18、RB06/RB10の追補。元C29 `09d39faae9c7293fe77b5675cc7286605a1809a6` のLarge 88,003件・素材72MiB・履歴113件の完全保存は、元の600,000msで実ファイルを作成できず失敗した。実際の2時間継続112編集と別の短時間113履歴検査は別証拠として保持する。既存の3履歴のLarge復元成功を113履歴や2時間の合格に置き換えない。

## 保持する契約

保存時に取得した同じ原子readの履歴コマンドを送信待ちの具体化にも使う。通常の少数ターゲットは必要なIDだけ検索し、多数ターゲットへ広がる配列だけ索引化する。大きい索引は同時4配列、少数検索の結果は各配列32IDまでとし、同一IDの優先順・古い直接before/after形式・全操作の順序を変えない。

完全保存と復元の検査は私的に取得したplain own-dataを不変化して使う。作者の入力を凍結しない。getter・独自prototype・疎配列・循環・非JSON値は従来の検査/encode経路を維持し、未知項目や不正Unicodeを正常化して消さない。公開する復元結果は従来どおり編集可能な独立copyを返す。

export WorkerのMessageEventで既に私有copyされた入力にも同じplain own-data証明を適用し、全履歴をさらにcopyしない。Workerの境界の外にある作者入力は凍結しない。schema・内容・hash・上限の検査は続ける。

同じ操作内で、不変の順序付き配列のcanonical bytesだけを共有する。cacheの論理payloadは64MiB・128件までであり、各操作の完全な新しい出力bufferやSHA256処理を省略しない。元のファイル・素材・JSON・レコード・depth・object・条件・文字項目の上限と中止規則を保持する。

内容検査の成功proofは最大256件・そのvalidation sessionだけに保つ。依存世界/関係辞書/runtimeの規則を開始時に固定し、作品ID・形式版・本編開始・暦ID・4配列・固定世界参照・全snapshot IDと同IDの実内容が同じ場合だけ共有する。各呼出しのheader・未知項目・履歴/公開版metadata・全command hash・before/afterの非同期integrityは引き続き確認する。callerのskip flagは追加しない。

異なる履歴配列にある同じ不変レコードのschema成功と型付き参照位置も、同じsessionの最大100,000レコードまで共有する。名前空間・参照先の存在/型・固定本文の位置・状態と関係の規則・全体の重複/循環は各内容で再確認する。本文フィールド上限の同じ不変部分も同じ呼出し内だけで共有し、変更された文字列と各素材/JSON/展開全量の上限は確認する。

schema registryとkind/status/scope辞書の置換・内部変更をcanonical内容で検出すると、内容とレコードのproofをともに失効させる。schemaがplain JSONとして固定確認できない場合は従来の全検査へ戻す。参照proofのkind配列は私有したcopyを持ち、同値に置換した後の旧schema変更を受けない。独立静的レビューで指摘されたこれらの境界と、同一IDの参照先が別kind/削除/消失へ変わる境界を回帰検査へ追加した。

## 検証の区分

新しい回帰検査は、checkpoint 64を越える67回の原子保存、人物名/関係状態/Unicode本文変更、全履歴と全送信待ちのhash、旧固定版、coldで任意の履歴を選ぶ読込、完全ファイルの空環境復元を検査する。検査済み内容でも未知metadata・重複操作・同ID固定本文の位置切れ・違う版集合・mutable入力・world/relation/runtime依存差・不正hashが拒否されることを確認する。

未commit準備検査4では、production buildと関連7 files / 61 testsが2026-10-10 21:38:41.284345〜21:38:54.245124 UTCに成功。stdout SHA256 `f47913e9dfd998af229eee932d68548124d42a71ee5aa8d62b38f8a7fe899bd5`、455入力の前後hash不変。準備検査3の59成功/2失敗（新検査の既存error-code期待誤りと復元戻り値のread-only差）は保持し、後者を実装修正した。cache evictionの追補とcommit後の全体/実Large検査は別実行として記録する。

元104要件・116ケース・24工程・6回帰群、歴史的baseline、元受入句は変更しない。実Large 113履歴・空環境new/clone・2時間最終復元・実端末・実Auth/RLS/Storage・release完成は、それぞれの同一対象版の実証拠が閉じるまで未確認のまま保持する。

2026-10-10のcommit `5448c30b6f950418b9747052f1c1525f25f7e171` の887単体・schema/build・文書/計画・Python15は成功したが、通常112保存→113履歴/送信待ち・88,003記録・72MiBの完全保存は22:18:09.297〜22:28:11.600999 UTCに元600,000ms上限で失敗した。raw SHA256 `a166b479d8da5f2beedd1069b61da0d180e5f22394cc32d457c9b83ce8cc96ab`、封印SHA256 `353e9d50c11c7eb2a2748d3589c53c0ae1848273728945989ae7b50b49349c32`、source456/build14の前後hash/clean不変。失敗を消さず、新しいschema/上限検査の共有は別の対象版で再検証する。実ファイルと空環境復元はこの失敗実行では未観測である。

commit `4232966214e5c4cc90007e3247a2f3adba169c9d` のclean局所検査は2026-10-10 22:51:23〜23:03:01 UTCにschema/build/docs/plan/Python15と単体890件/96 filesが成功した。一方、GitHub CI run38093333559は単体888成功/2失敗で、`rb06Recovery.test.ts` の71回保存後の旧版復元と明示ID対応統合が既存5000ms timeoutへ到達した。build/browserはskippedである。既存の5000ms・全assertion・fixtureを保持し、CIの単体file並列だけを止め、clean局所検査と同じ `--maxWorkers=1 --fileParallelism=false` を使用する。製品の応答/検索/保存・解析・600000ms export条件を変更しない。失敗runとserial局所成功は別記録であり、修正CIと実Large結果は対象版ごとに再確認する。
