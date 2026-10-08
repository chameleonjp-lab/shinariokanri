# 実環境で残る確認条件

現在のmain、部品/CI/production Chromium、模擬HTTP/隔離PostgreSQLの成功を実端末・実Auth/RLS/Storage・原116受入の完成に換算しない。公開、mainへのマージ、有料機能の有効化、既存の別用途DB変更は行っていない。

| 必要な環境 | 必要な指定と実確認 |
|---|---|
| 専用同期 | 専用URL/public key、project ID/region、管理者、fixture tenant。owner/editor/reviewer/reader/nonmemberの5実アカウントと権限。二つの実端末、同時編集/削除対編集/重複再送/通信断/認証失効/account切替/権限撤回。直接Data API・private Storage・添付bytes・実quotaを確認 |
| 実携帯・タブレット | iPhone Safari/Chrome、iPad Safari/分割、OS/ブラウザー実版。320/390/768/1024/1440、回転、IME、Files、録音、オフライン、200%文字、ドラッグ代替。毎回PCを使わず端末で保存/持出し/復元できること |
| 実PC・支援技術 | Windows/macOSのChrome/Edge/Firefox/Safari、実版、キーボード、VoiceOver/NVDA。Linux PlaywrightのFirefox/WebKitをmacOS Safariや支援技術の代用にしない |
| 性能 | 固定seed/実件数/hashと同じ最終commit。仕様の起点から各30回/p95、Standard 8,800、Large実bytes、進捗/取消、2時間継続編集。保存の500ms入力待ちは測定区間外 |
| 公開 | 完成対象commit、base `/shinariokanri/`、build-info/tree/cache、直リンク、費用・quota、復元・競合・互換・ライセンス、公開後確認。release evidence gateを変更せず不足では停止 |

## 公表料金と実tenant

2026-10-08、[Supabase料金](https://supabase.com/pricing)と[Compute/Disk](https://supabase.com/docs/guides/platform/compute-and-disk)を読み取り確認した。次は公表値の抜粋であり、契約・残枠・地域・税・実費の確認ではない。

| 公表プラン | 基本料金/月 | 主な掲載枠 |
|---|---|---|
| Free | USD 0 | DB 500MB、Storage 1GB、egress 5GB、cached egress 5GB、MAU 50,000、Edge 500,000/月。upload上限50MB。非活動1週間でpause、active projects 2 |
| Pro | USD 25から | DB 8GB/project、Storage 100GB、egress/cached各250GB、MAU 100,000、Edge 2,000,000/月。compute credit USD10/月、追加project compute USD10/月から。超過・追加項目は別料金 |

専用tenantのtier/region/使用量/残枠/StorageとEdge制限/spend cap/メール等は未指定。アプリの完全保存上限64MiBとFree upload上限50MBを同一視しない。通信前のアプリ上限だけで実Storage成功を認定しない。接続先の現在設定を確認し、超過/失敗時は端末の作品・bytes・送信待ちを保持する。新規project、課金、add-onを自動で有効化しない。

実API準備: [live-plan.example.json](../../scripts/sync/live-plan.example.json)と[同期手順](RB09_SYNC_SHARING.md)でUUID/hash/対象commit/tree/役割を固定する。原116の正常・境界/失敗条件と実結果を記録し、未実行条件を合格に置換しない。
