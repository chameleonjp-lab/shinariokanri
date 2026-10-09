# RB09 同期・限定共有の実装と確認

対象は RV25/RV26、WP17/WP18。RB09全体の完成には専用接続先でAT-E05/E06等の実証拠が必要であり、このローカル候補を完成・公開済みにしない。原104要件・116ケース・6回帰群は保持する。現在mainはc5fcce9/tree690b506、CI37768953480 success（2026-10-08再確認）。原レビュー0474856は歴史的基準である。

## 通常操作と永続保存

アカウント欄で専用URLと公開APIキーを保持し、認証した領域で作品を開く。guest作品は自動統合しない。完全保存の新規/複製復元で明示して移動する。JWT/パスワードはメモリのみ。端末内保存、native outbox、サーバー確定、素材bytes確定は別々に表示する。

作品→同期で新規登録または確定版を取得する。native outboxはサーバー確定共通元からprepared操作へまとめ、ACK後に後続を新共通元へrebaseする。ローカルCommandRecord.beforeはサーバー共通元へ流用しない。ACK・内容・ローカル履歴・サーバー基底・全対象の競合・送信待ち除去を一トランザクションで確定する。中断・通信断・quota・認証/role変更では元操作と入力を保持する。同じACKは冪等、異なるACKは拒否する。

競合は共通元/端末案/サーバー案を保存し、解決中の独立した追加入力も保持する。元の全対象と通信中に競合した別対象を解決操作に含める。基底・現在版・二案hashを固定した確認が古くなれば入力を保持して再確認する。本文位置・翻訳/収録/制作確認待ちは共通domain規則で原子更新する。

完全保存は共通元・prepared・二案・ACK・素材ACKを `data/sync-recovery.json` へ保持する。元protocol ID/hashはclone/作品間対応復元でも変更せず、再接続待ちの私有証跡にする。サーバー確認済み/送信可能と自動認定しない。全history/世界pin推移依存/公開snapshot/素材bytesを含むembedded archiveを確定内容と照合し、private backup bucketへ保持する。空端末は接続先一覧→完全保存から新規復元→確定基底接続。既存同IDは自動置換しない。

編集者は明示許可されたteam情報・項目のみ取得する。raw canonical header/history/worlds/private fieldsを返さない。別account DBにcommon/local/prepared/conflict/ACKを独立保存する。再接続待ちの編集証跡を復元して現在の権限で取得し直し、現在許可される入力を比較/確認して再開する。未知参照・範囲外・失効項目の送信を拒否する。

## 限定版・指摘・素材

固定snapshotと承認済み投影profileから公開名/文/IDを確認する。原稿改訂で既存共有本文を自動変更しない。確認local/server版・投影hashを登録前に再検証する。受取人は明示Auth ID、role、現実期限、選択snapshotで登録する。member/項目許可の確認基底が変わると再確認する。最後の管理者は失わない。

受取側は本文/検索/関係図/地図/素材/リンク/件数を同一投影から表示する。旧引用版とUnicodeコードポイント位置を維持し、元の読み位置へ戻る。段落/線指摘はsnapshot・公開版・公開ID・文字位置に固定する。他人の上書き、未知段落、NULL/範囲外位置、失効/撤回後の書込を拒否する。

private素材とarchiveは現在session/member/grantを取得前後で確認するJWT proxy。公開signed URLを発行しない。hash/bytes/MIME/署名・安全pathを検査し、metadata-onlyを完全復元済み扱いしない。オフライン限定コピーは最後の取得範囲で、既知の現実期限で表示を停止する。再接続時は撤回/失効を再検証し、拒否されたcacheを取り除く。既に外へ持ち出されたコピーの消去は保証しない。

アカウント移動は入力・保存待ちを保持する。完成ログアウト前に全作品/限定編集/入力を確認し、完全保存と入力ファイルを持ち出すか残りを明示破棄する。確認中更新や進行操作があれば停止して再確認する。未保存の作品設定・本文・雛形・作者別案とツール入力は基底付きで再開し、入力持出しは同じaccountへ明示復元する。承認計画は復元しない。

## 専用接続先の準備と未実行

`supabase/migrations` と `supabase/functions/scenario-sync` は未適用。Supabase CLI 2.120.0をchecksum確認、PostgreSQL17.11の隔離network-noneコンテナへSQLを適用している。`postgres-auth-storage-fixture.sql` はAuth/Storage構造とclaimを模したfixtureであり、実Auth/直接Data API/Storageの証拠ではない。メモリContractSyncServerも契約fixtureである。

専用Supabase URL/project/region、organization管理者、テストAuthアカウント（owner/editor/reviewer/reader/nonmember）、二端末、現在quota/保存容量/転送量/Edge上限/費用承認が未指定。別用途のchameleonJP-Lab/ランキングDBを選択・変更せず、新project/新課金を有効化していない。新しい専用環境でのみ、管理者がmigrationを確認/適用し、公開schemaをpublicだけ、RLSを全table、private bucketsを維持する。secret/service keyはEdge secretだけ、`SCENARIO_ALLOWED_ORIGINS`を正確な候補originへ設定する。EdgeはAuth.getUser＋live session/membershipをSQLlockで再確認する。JWTだけを認可根拠にしない。

`npm run sync:build` でself-contained coreを生成してから、管理者が専用環境へdeployする。現依頼では適用/deployしない。Deno入口はverify_jwt=falseだが全POSTを手動の実Auth確認へ通す。anon/authenticatedにはservice RPC実行/正本書込を許さない。

実API用 `scripts/sync/live-contract.mjs` は専用fixture tenantと明示opt-inがなければリクエストを行わない。SCENARIO_SYNC_URL/PUBLISHABLE_KEY、各ROLE_AUTHのemail/passwordをプロセス環境へ用意し、fixtureOnly/専用origin/candidate commit/tree/project/snapshot/public paragraph+asset IDs/hash/5account IDsをplanへ固定する。`--run-authorized-fixture-writes --plan ... --out ...` でrole別直接API、private Storage、コメント、role撤回、実logout、共有撤回を実行する。出力へtoken/本文/stackを残さない。サーバー確定操作、二端末の同時/削除対編集/重複再送/通信断/アカウント切替、添付quotaと物理端末は別検査が必要。

実接続・実端末が未実行のまま、RB09/116/release gateは保留する。途中の失敗、fixture訂正、dirty build、修正後の候補結果は異なる記録で保持する。

実API planの雛形は `scripts/sync/live-plan.example.json`。fixtureで既存作品を使わず、UUID・hash・対象source commit/treeを全て埋める。撤回・指摘はfixtureへ書込み、終了後の復旧は専用環境管理者が確認する。費用はproject/tier/region/quotaが未指定なので未確認。pricingの表示だけで当該projectの無料枠や課金を合格にしない。

受信した確定画像の整合確認は `origin: received_image` とし、サーバーがprepared操作を適用したACKとは区別する。固定世界の推移依存素材bytesもupload/download対象へ含める。限定版の直リンクは一覧取得後に開き、一覧とのbusy競合で要求を捨てない。自分の指摘の本文修正・対応状態・削除は同じ対象版とサーバー所有権検査へ通す。


## 最終局所候補と入力・権限の境界

候補C8 `af0c2b983f1146cc7977f13d119b8748c867db2f` / tree `134fc3adb342600bebc8dccaa93ff5cec9254c08`。735単体/結合、75 production Chromium153、Python15、schema/build/docs/plan、8migration+23模擬SQL契約を実行。独立レビューは別の源・raw・hashを封印し、古い候補の失敗を保持する。原116の最終受入や実API/実機の合格とは別である。

native DBv6のworkspaceInputsとauthorToolDraftsは同じtransactionで入力復元する。DB失敗では両方の現在入力を保持し、任意の表示キャッシュだけが失敗した場合はDBに確定した入力をcold再開する。保存・復元・画面移動のintent世代を保持し、通信完了で後の画面を奪わない。アカウント操作欄はPC/狭幅でも到達でき、logoutは対象アカウントの入力・限定版・私有bytesを明示確認して消去する。guest領域は保持する。

限定編集DBv2は古いstampなしのv1入力・common・二案・prepared・ACKを元の再接続待ち証跡として保持し、active許可へ昇格しない。内容revisionとauthorizationRevisionは別々に単調評価し、遅れた旧応答と同権限版での項目拡大を拒否する。明示的な新しい権限版だけが再付与する。authorizationExpiresAtを受信、保存、prepared、ACK、競合解決、復元の確認/承認、DB確定内で再検証する。期限後の解決・承認では現在の全入力・基底・prepared・ACKが不変である。Edgeもmembership_revisionと現在scopeをSQLlockと応答時に再確認する。

公表料金の確認は[外部条件](EXTERNAL_CONDITIONS.md)へ記す。公表値と実tenantのquota/費用確認は別であり、料金承認や有料機能の有効化は行っていない。

C8は確定ACKの内容版と認可観測を別に保持する。内容版が古く認可だけ新しい受信では、既知の最新本文へ受信許可maskを適用し、未知の新項目本文は利用しない。`permissionObservation`には元の許可観測を保持し、同じ認可の現行本文を取得してもそのmask外へ拡大しない。同じ内容版・認可番号の現行取得は期限到来による縮小を優先する。復旧は保存baseとの差分入力だけを適用し、旧workの未変更値で最新リモート値を上書きしない。旧work全体・未ACK操作・共通元・二案は証跡として保持し、自動再送へ転用しない。

独立C8は105部品（実ネットワークを遮断したPostgreSQLのtyped RPC21を含む）と18通常production群、8migration・模擬RLS23・NULL2に成功。C1〜C7の失敗と元期待を保持したままE07〜E10を補修した。これは実Supabase Auth/RLS/Storageの証明ではない。
