# 実行境界と次の一操作

実機試験は今回の対象外。専用実サービス・実権限・対象ゲームは許可された隔離環境の指定がない。以下の原22ケースは、局所自動試験が成功しても原条件のBLOCKEDを維持する。元原文は[外部条件表](../../quality/pr49-followup-2026-10-15/EXTERNAL_CASES.md)と[116ケース](../../data/acceptance_cases.json)にある。

| 区分 | 原ケース | 次に必要な一操作 |
| --- | --- | --- |
| 実タッチ・端末だけの編集/回転/表示設定 | AT-B24, AT-F31, AT-F33, AT-N02, AT-E01 | ユーザーが指定実iPhone/iPad/PCで元手順を実行し、OS/browser/固定版と実結果を記録 |
| 実支援技術・実IME・指定端末性能 | AT-N03, AT-N04, AT-N13, AT-E11 | 元指定端末でVoiceOver/NVDA・日本語変換途中・OS文字200%・原30回を実行 |
| 実端末＋専用実同期/録音/容量/更新 | AT-F01, AT-F34, AT-N07, AT-N11, AT-E06, AT-E12 | 別用途DBと独立した許可済み専用接続・2実端末・OS Files/機内モード/旧buildを指定 |
| 実認証・役割・直接API・private素材 | AT-F29, AT-F30, AT-N08, AT-E05 | 隔離Auth/DataAPI/private Storageと5役割の実資格情報を安全な方法で用意して元権限手順を実行 |
| 対象ゲーム | AT-F42, AT-E10 | engine/version/adapterと実対象を指定し、stubと区別した実戦闘/探索receiptを取得 |
| 実契約/費用/検証先 | AT-N17 | 実tier/region/使用量/残量/費用と対象buildを確認できる許可済みHTTPS先を提示 |

複数区分を含むケースは元の全条件が必要であり、表の一分類だけを満たしても完了しない。実OS Files/旧アプリ更新はLinuxのプログラム取消やcache ID変更で置換しない。

元ケース外の残条件：AC-G02の実2account切替、旧C29の37part/MANIFESTと旧不足18宣言の実bytes、正式独立受入の確認者・結果。fresh agentによるコードレビューと原CP15の独立ユーザー受入は別である。旧配布保留や旧404は過去の観測であり、今回の配布/公開を実行した意味にはならない。

本番DB・別用途Supabase・実作品・認証/権限・支払/課金・hosting設定を変更しない。新しいCloud environmentの作成/設定、実機、merge、配備、公開は実行しない。原9公開gateと`check_release.py`はそのまま使う。

## NP08の個別準備（2026-10-19）

[独立準備台帳 VERIFICATION.md](VERIFICATION.md) に原22IDの各given/when/then/negative_or_edgeを逐語保持し、必要な実端末・実役割・二実端末・ゲーム/実費用の要否、隔離入力、記録手順、安全な空のJSON記録欄、次の一操作を個別化した。各caseの **PREPAREDは手順/記録様式の準備完了**、**BLOCKED / 未実行は原実条件の未充足**を意味する。実サービスや実Authへ接続した実績はない。

| 独立分類 | 原ID（22件、重複なし） | 台帳入口 |
| --- | --- | --- |
| 実機 9 | AT-B24, AT-F31, AT-F33, AT-N02, AT-N03, AT-N04, AT-N13, AT-E01, AT-E11 | [各caseの環境・四条項・手順](VERIFICATION.md#at-b24) |
| 実機＋実サービス 6 | AT-F01, AT-F34, AT-N07, AT-N11, AT-E06, AT-E12 | [実二端末/機内モード/更新等](VERIFICATION.md#at-f01) |
| 実Auth 4 | AT-F29, AT-F30, AT-N08, AT-E05 | [実reviewerと役割検証](VERIFICATION.md#at-f29) |
| ゲーム 2 | AT-F42, AT-E10 | [対象ゲームとstub/actual](VERIFICATION.md#at-f42) |
| 契約/費用 1 | AT-N17 | [実構成・契約と対象build](VERIFICATION.md#at-n17) |

同台帳に元22件とは別の3欄を保持する。AC-G02-N/E・CP04の実2account、旧C29の37part/MANIFESTと旧不足18宣言の各実bytes、CP15の独立確認者/結果はいずれも未取得である。元9release gatesとcheckerを維持し、原外部表・実条件の結果は変更しない。
