# C29から分けて確認する後続候補

C29製品 `09d39faae9c7293fe77b5675cc7286605a1809a6` の原28ケース・166句の直接局所照合と、下記の別commitの補修検査を分ける。全104要件・116ケース・24工程・6回帰群は未完成である。元の条件、失敗、未実行とrelease evidence gateを保持する。

## 依頼されたPRの状態

2026-10-10 22:48 UTCのGitHub実応答では、[PR #36](https://github.com/chameleonjp-lab/shinariokanri/pull/36)のhead `ef72dab56cc86f2f62824561e74884fafd054ed0`、[CI run 38053539901](https://github.com/chameleonjp-lab/shinariokanri/actions/runs/38053539901)はsuccess。利用者側で取り込み済みで、merge commitは `6a725b95de3b778aa589b82f0ee3815c32830fba`。この作業からmainへmergeしていない。

[Draft PR #37](https://github.com/chameleonjp-lab/shinariokanri/pull/37)はopen・mergeable。headはC29、baseは上記main、[CI run 38060502013](https://github.com/chameleonjp-lab/shinariokanri/actions/runs/38060502013)はsuccess。元失敗と修正後の保存版反映・復元確定・カーソル競合の正期待検査を保持する。CI成功は全受入・実端末・実権限の成功ではない。

## 別候補の結果

| Draft | 対象commit | 起きたことと補修 | 実行結果・残る条件 |
| --- | --- | --- | --- |
| [#38](https://github.com/chameleonjp-lab/shinariokanri/pull/38) | `7e8e08830a8c9aefc8dc73d0319a571d1d8b5051` | 通常本文編集で候補除外ボタンが表示されない条件を補修。既存のaccount/project/source別除外を使用 | 同fixtureのUnicodeリンク・除外・cold・逆参照・完全new/cloneを3 Linux engineで成功。CI38087396512 success。原AT-F27全句・実端末・統合候補は別判定 |
| [#39](https://github.com/chameleonjp-lab/shinariokanri/pull/39) | `4655e1f36252020ac35c2b701d83330061e93bbc` | 相談MDの対象版・前後状態を通常入力し、版/出力範囲の下書きと確認を保持。整数の未保存入力・別作品の後着下書きも補修 | 12通常画面・旧fixture4単体成功、CI38088398517 success。元の疎checkoutによるfixture未取得失敗も保持。正本へ自動適用・AIサービスへ自動送信していない。全REQ-F36・統合候補は別判定 |
| [#40](https://github.com/chameleonjp-lab/shinariokanri/pull/40) | 旧 `5448c30b6f950418b9747052f1c1525f25f7e171`、製品補修 `4232966214e5c4cc90007e3247a2f3adba169c9d`、CI補修 `f9b4248d5646e1bea5976c48f90d37dea6d6b997` | 同じ原子readの履歴と送信待ちを共有し、不変内容/recordの検証成功だけを再利用。規則変更・参照先欠落は再検査。索引保持とWorkerの再copyを抑制 | 旧887単体/build/docs/plan/Python15とCI38089881873は成功したが、実113履歴・88,003記録・72MiBのdownloadは元600000msで失敗。raw SHA256 `a166b479d8da5f2beedd1069b61da0d180e5f22394cc32d457c9b83ce8cc96ab`。製品補修4232966のclean890単体/96 files・schema/build/docs/plan/Python15は成功。CI38093333559は888成功/既存5000ms timeout2失敗でbuild/browser skipped。CIだけserialにしたf9b4248でCI38094307282を実行中。同じ実Large入力の完全保存/空new-clone復元は別実行。2時間最終復元を未合格のまま保持 |
| [#41](https://github.com/chameleonjp-lab/shinariokanri/pull/41) | `5ab86a27f15bdf5205ea0fc711544e6eb7445d24` | 原子的な旧native DB移行の拒否後、通常retryでfailed-openを再使用する問題を補修。取消と旧結果の後着も抑止 | 関連45単体と3 engine×3条件の9通常画面成功。1回/2回の容量拒否、旧version10不変、retry→version70/cold/旧全行/完全file、取消を検査。CI38090726802は23:10 UTCの実応答でsuccess。旧アプリbuild取得不可の原E12、実更新/実端末/全受入は別の未確認 |

各候補はC29をbaseにした独立Draftであり、4候補を組み合わせた単一完成commitの結果ではない。新候補のCIと通常画面が成功しても、C29の既知差分を同じ対象版で修正済みへ書き換えない。

## 証拠と実行条件

PR #40旧実Large診断は通常112編集→113履歴/送信待ち、14回の全現在画像/素材hash照合を実行した。22:18:09.297〜22:28:11.600999 UTCに元download上限で閉じ、source456/build14・HEAD/tree/cleanは不変。最終seal SHA256 `353e9d50c11c7eb2a2748d3589c53c0ae1848273728945989ae7b50b49349c32`。保存ファイルは未観測なので、復元helperの型や準備成功を実復元へ換算しない。

新PR #40には静的レビューで見つかったschema registry変更、live kind/status/scope辞書、旧schemaの参照配列aliasの境界を補修した。封印した最新8差分レビューSHA256 `4b24e814bde4222ef1cec29579885c209deef2f8c8b563c3c7fee9ea250c5db3`、runtime実行0。型準備でのfindLast未対応はcompiler設定を変えず逆順loopで訂正した。成功を最新sourceへ移記せず、全検査をclean新対象に固定する。

PR #41の実手順は `/tmp/shinariokanri-rb06-startup-migration-retry-final-3/EXECUTION.json`、SHA256 `964465da3aba4ba05a825d1899173018f03939cfa31bf3cfc90a31858cc76b54`。source508/build14/HEAD/tree/clean不変。Linux production browser/native IndexedDBの結果であり、実iPhone/iPad、実OS更新やAuth/RLS/Storageの証拠ではない。

実端末・支援技術・専用接続に必要な環境と短い操作手順は[C29手順](../../implementation/C29_MANUAL_REVIEW.md)に記載する。専用HTTPS/Auth/private bucket、5 role試験アカウント、quota/tier/現行費用は未指定。公開・main merge・課金・外部DB変更は実行していない。

2026-10-10 22:59 UTCに#40 head4232966のpush/mergeable/Draftを再確認し、新headのCI38093333559が進行中だった。[API観測記録](evidence/rb10-candidate/candidate-29-final-actual-results-1/pull-request-observations-3.json)は旧headの成功CIと分けて保持する。新clean buildは1e602577597734d0cf32、schema/build/docs/plan/Python15成功。全単体と実Large113は別に終了/対象不変を判定する。

2026-10-10 23:10〜23:14 UTCの[API追加観測](evidence/rb10-candidate/candidate-29-final-actual-results-1/pull-request-observations-4.json)は#36 closed/取り込み済み、#37 open/Draft/mergeable、#41最新head CI successを再確認した。#40新head4232966のCI failureを明示して保持し、`.github/workflows/ci.yml` のfile並列だけを止めたf9b4248を同Draftへ通常pushした。全assertion/fixture/既存timeout・製品の性能/解析/export上限は変更していない。CI97は別対象版の結果として終了を確認する。新worktreeの最初の文書検査は疎checkoutの19リンク先未取得で失敗し、同じf9b4248 Git blob 2,006,476 bytesをmaterializeして再検査が成功した。元失敗記録も保持する。

113履歴の4232966再検査準備3は、実行用TMPDIR未作成のためブラウザーlaunch前にENOENTで停止した。製品の保存失敗/合格へ換算しない。準備4は先にTMPDIRを作り、元helper SHA256 `c6ba11d80c6e5e8ec3a342d68b6b1877a2a9dffd55ae99c093af3d5ad6a52216`、同fixture/元600000ms capを保持して23:12:28 UTCに実行開始した。source456/build14は4232966へ固定し、CIだけのf9b4248へ実結果を移記しない。実helper13入力を実行中にbyte/hash捕捉し、正常112保存・113履歴・完全file・空環境new/cloneは終了と原子性の証拠が閉じるまで未確認である。
