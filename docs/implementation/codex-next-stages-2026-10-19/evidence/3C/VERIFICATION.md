# 3C：検証・逐条判定・残条件

2026-10-20 UTC、統合担当1人。**準備資料・履歴証拠の再取得と未実行判定を提出する。NP07の正式確定、NP05/06/16、段階1〜3全体は未完了。** #83のユーザーmergeを確認して更新mainから着手したが、3Bは準備/阻害記録のみで、3C正式開始条件のF/seal/raw/実終了がない。3Bや他単位の正式実行をこの依頼で代行しない。

## 開始点と候補

| 識別 | 実際の値・状態 |
| --- | --- |
| 開始main / tree | `006333705a7e556fa0e54f1054df6b2910053cde` / `a8709a2202a22380bdc323607f753c8520ae7174` |
| 依存#83 | ユーザー `chameleonjp-lab` が2026-10-20 09:44:20 UTCにmerge。最終head `16ce83def8ea54ac3a2e78b92d66ba9eea1e8259` / treeは開始mainと同じ |
| Git proof | 開始mainのparentsは#82 merge `052c423ba7079e3843f15deb03d8e8d03ccbcdc8` と#83最終head。Git Data APIで確認 |
| 読取src subtree | `6c0098365af131f13d36c53b499f458a36ae225e`。src一致だけでbuild・配信bytes一致とはしない |
| tested product / 最終F | 未固定。3Bは全5 step未起動、正式合格原本なし |
| build / 配信bytes / seal | 未取得。CIごとのbuildや1B/1Cの歴史distを現在Fへ付け替えない |
| 正式run/attempt/driver/argv/実exit/cleanup | 未取得。今回の静的検査exitは正式実行のexitと別 |
| evidence head / tree / 自PR CI | 自己参照を避け提出後のPR本文で確定。自PRは新規Draft、merge待ち |
| fixture原期待 | Standard `standard-r06-v1` / 8800、Large `large-material-rb10-v1` / 88003 / 実75497472素材bytes。原Large binary 1914098 bytes / SHA-256 `1ca2b19dcf4c8464c68a24a1bbe02cd1b1c4be20187ed2cee99d4e541822d0d0` を今回再取得・hash照合 |
| 実行環境 | 原本download/文書・Python静的検査だけ。許可済み通常測定host/保存先未提供。製品build・browser・正式/資源測定・実機・実サービスなし |

## 依存の実mergeと最新最終PR CI

GitHub APIで各PRのmerged/merged_at/merged_by/head/mergeと、そのheadの最新Validate implementation run・実attempt・latest jobsを再取得した。全9件のmerged_byは `chameleonjp-lab`。次表のsuccessはjob結果であり、今回全CI ZIPを独立照合したという意味ではない。

| PR | 最終head | 実merge commit | run / attempt | 実結果・範囲 |
| --- | --- | --- | --- | --- |
| [#75](https://github.com/chameleonjp-lab/shinariokanri/pull/75) | `760dd507749d62778ac5456566eb7d42cd5fa22e` | `6611287b986553f90c6d8587c7bff2d64afac458` | [39208529291](https://github.com/chameleonjp-lab/shinariokanri/actions/runs/39208529291) / 1 | scope/documents/verify成功、unit/browser skipped |
| [#76](https://github.com/chameleonjp-lab/shinariokanri/pull/76) | `37839fa12a30b1475c8d0ac646e4b87dc595d90c` | `bd9e74164ccc54b2f480116e546e2af73ffc4c82` | [39213058156](https://github.com/chameleonjp-lab/shinariokanri/actions/runs/39213058156) / 1 | 全7 jobs成功 |
| [#77](https://github.com/chameleonjp-lab/shinariokanri/pull/77) | `3dd828078a31b4264bf621c36d2196487e3d619c` | `aa86e25b91287329c061a97d1d3f9c4e0e0e9f85` | [39213727737](https://github.com/chameleonjp-lab/shinariokanri/actions/runs/39213727737) / 1 | 全7 jobs成功 |
| [#78](https://github.com/chameleonjp-lab/shinariokanri/pull/78) | `e0ba37ae1c6ac36e4b847d39dcc06ffbd046fafc` | `14d78659320fda40babe751116df171b767055bc` | [39275412553](https://github.com/chameleonjp-lab/shinariokanri/actions/runs/39275412553) / 2 | 全7 jobs成功 |
| [#79](https://github.com/chameleonjp-lab/shinariokanri/pull/79) | `192127931f2f5313af0c34df19aaaad078009088` | `4a67e85fd7f292e26b2d7d766baa0dd3ab348b6e` | [39351906891](https://github.com/chameleonjp-lab/shinariokanri/actions/runs/39351906891) / 1 | scope/documents/verify成功、unit/browser skipped |
| [#80](https://github.com/chameleonjp-lab/shinariokanri/pull/80) | `20242c1bceb8fea6fdafbd98b3aa5ace503481e7` | `4930bd5bf3c3f53cf65483e270e8df94d515be2c` | [39367868843](https://github.com/chameleonjp-lab/shinariokanri/actions/runs/39367868843) / 1 | scope/documents/verify成功、unit/browser skipped |
| [#81](https://github.com/chameleonjp-lab/shinariokanri/pull/81) | `68c3bd57457ec8738074e00b93e6d7309550301e` | `4f3110963794eb142340282b2267a266feac585f` | [39392670959](https://github.com/chameleonjp-lab/shinariokanri/actions/runs/39392670959) / 1 | scope/documents/verify成功、unit/browser skipped |
| [#82](https://github.com/chameleonjp-lab/shinariokanri/pull/82) | `0c98e6271f90f68877a8eb684410dffc640a4430` | `052c423ba7079e3843f15deb03d8e8d03ccbcdc8` | [39395617121](https://github.com/chameleonjp-lab/shinariokanri/actions/runs/39395617121) / 1 | scope/documents/verify成功、unit/browser skipped |
| [#83](https://github.com/chameleonjp-lab/shinariokanri/pull/83) | `16ce83def8ea54ac3a2e78b92d66ba9eea1e8259` | `006333705a7e556fa0e54f1054df6b2910053cde` | [39401425723](https://github.com/chameleonjp-lab/shinariokanri/actions/runs/39401425723) / 1 | scope/documents/verify成功、unit/browser skipped |

開始mainの[run39402880500 / attempt1](https://github.com/chameleonjp-lab/shinariokanri/actions/runs/39402880500)は、この記録時点でscope/documents/unit成功、Chromium/Firefox/WebKit実行中、verify未確定。前mainのrun39400397936も別の進行中runであり、成功と扱わない。提出時の最新観測は最終PR本文へ記録する。#81/82/83はすべて準備だけのmergeで、依存成果の未実施を解除しない。

旧#80 mergeのrun39388952025/attempt1のLarge fixtureケース5000ms timeout・unit exit1/後続skipは履歴として保持する。今回原因・再現性を調査していないので、別runの成功や今回の文書CIで解消済み/flakyと断定しない。

## NP07の逐条結論と再取得範囲

[全464原文と未実行判定](CLAUSE_AUDIT.md)でTの各条項へsource/UI・fixture・仕様由来の独立期待と実観測の不足を結合した。原104/116/464/24/6/68の集合・全文と73固定入力は、空領域で取得した原検査器の実exit0で照合済み。原JSONのstatus変更や索引・旧94/22による昇格はしていない。

| 領域 | 今回確認できたこと | 未成立の実条件 |
| --- | --- | --- |
| 104要件 | 全ID/原文/case対応を保持 | 同一Fの実結果は全件未取得 |
| 116ケース / 464条項 | caseはnot_run94/blocked22、条項はnot_run405/blocked59、passed0 | F入力・実操作・literal独立期待/観測・原本path/bindingなし。正式逐条確定は未完了 |
| 24工程 | local_gateと依存込みwhole_gateを別々に照合 | local24未実行、whole24 blocked。local部品成功で工程全体を完了しない |
| 6回帰 / 68補助 | RG-R01〜06と補助RG01〜03を分離、G32/X36の原文を保持 | 原6群/F補助は未実行、Xは未採用 |
| source/dist/helper/raw/native/失敗 | [150件と既存1B/1C包](REACQUISITION.md)を実再取得し全member照合 | 履歴候補のbytes照合。Fの正式包、FのCI各engine/集約ZIPの全member監査ではない |
| 元release checker | 再取得先で実行、exit1 / RELEASE BLOCKED | default `docs/implementation/release-evidence.json` がない。9個別gateの実行前に拒否。捏造manifestで埋めない |

NP05/06/07の準備・実施・確定を分ける。NP05は比較設計済み/現行baseline・最終実比較なし/確定なし。NP06はrunbook済み/正式5実行なし/合格なし。NP07は暫定表・今回原文照合/履歴再取得済み/同一Fの実逐条確定と正式包再取得なし。NP16はNP06と**同じ正式一式**を参照すべきだが、その実行自体がない。二重起動しない。

| 最終比較列 | baseline / F |
| --- | --- |
| Standard / Large 8指標×30の生値・nearest-rank p95 | 未取得 / 未取得、比較不能 |
| 6条件×30=180保存のcommand p95、UI時間は別欄 | 未取得 / 未取得、比較不能 |
| 仕事量 / 論理保持量 | 未取得 / 未取得、比較不能 |
| 各size3標本・2GC後main renderer V8 heap | 未取得 / 未取得、比較不能 |
| peak / RSS / Worker / native memory | 未測定。heapやcache予算から外挿しない |

実7200秒/112編集/88003記録/full113履歴・送信待ち/実75497472素材bytes、new/clone/coldと同全量の破損・unknown major・最終error/quota/通常retryは未実行。600000ms・2000msを維持。製品・build・fixture・配信bytesが変わればG03/G05/RUNBOOK_NEXTに従って新F・新seal・新outputで必要一式を再取得する。失敗attemptは残す。今回製品・配信bytesを新たに生成/変更していない。

## NP08：原22外部条件

原文は[EXTERNAL_CASES.md](../../../../quality/pr49-followup-2026-10-15/EXTERNAL_CASES.md)と116ケースから確認した。1Cの[88逐語条項・隔離入力・実施手順/空記録様式](../../../../acceptance/phase3/VERIFICATION.md)はPREPARED。以下の実条件は全件BLOCKED / 未実行。実機9＋実機/サービス6＋実Auth4＋ゲーム2＋契約費用1の全22ID、重複なし。原22条件を新しい条件/件数へ置き換えない。

| 原ID / 分類 | 未実行の原条件（原外部表の逐語） | 準備 / 実受入 | 次の一操作（別依頼） |
| --- | --- | --- | --- |
| AT-B24 / 実機 | 原given/whenの実タッチ端末で絞り込み、関係線と条件をマウスなしで編集する操作が未実行。PCのclickや部品成功を同操作へ転記しない。 | PREPARED / BLOCKED・未実行 | 許可された実タッチ端末・固定版を指定し、マウスなしの原操作を別依頼 |
| AT-F01 / 実機＋実サービス | 実スマートフォンの素材取込/録音とPC側への実同期・権限拒否は未実行。原メモ/実PNG/WAVの通常変換と全native/cold/newはローカル補助として保持。 | PREPARED / BLOCKED・未実行 | 専用許可済み接続と実スマホ/PCを指定し、録音/取込/同期/拒否を別依頼 |
| AT-F29 / 実Auth | 原givenの実reviewer認証が未実行。固定UUID/import済みreviewの版/引用/削除後位置/lifecycle保護は局所補助に限定。 | PREPARED / BLOCKED・未実行 | 隔離実reviewerの安全な資格情報供給と対象snapshotを指定して別依頼 |
| AT-F30 / 実Auth | 専用HTTPS/Auth/DataAPI/private Storageでの実reader/reviewer/editor権限・直接API・撤回/失効を未実行。 | PREPARED / BLOCKED・未実行 | 専用Auth/DataAPI/private Storageと各実役割を指定して権限/撤回を別依頼 |
| AT-F31 / 実機 | 実端末だけの編集、実回転/iPad SplitView、ソフトキーボードで確定欄へ到達する条件が未実行。CSS5幅の同一作品/完全復元とは区別。 | PREPARED / BLOCKED・未実行 | 実iPhone/iPad・Split View・keyboard・対象版を指定して別依頼 |
| AT-F33 / 実機 | 実PCと実スマートフォンの別端末表示設定・同内容受渡しが未実行。同ブラウザーの幅class分離/再開案内/取消は局所補助。 | PREPARED / BLOCKED・未実行 | 実PC/スマホ2端末と同じ作品の受渡し先を指定して別依頼 |
| AT-F34 / 実機＋実サービス | 専用実Authと二つの実端末で、機内モードの同本文変更/削除対編集/順逆再送/競合解決を未実行。 | PREPARED / BLOCKED・未実行 | 専用実Auth/二実端末/同一作品を指定し機内モード競合/逆順再送を別依頼 |
| AT-F42 / ゲーム | 対象ゲームのengine/version/adapter/実戦闘結果が未提供。汎用Linuxブラウザーreceiverのactual-mode receiptを対象ゲーム実証跡へ昇格しない。 | PREPARED / BLOCKED・未実行 | 対象ゲームengine/version/adapterと隔離入力を指定して実戦闘receiptを別依頼 |
| AT-N02 / 実機 | 原UI_UX表の実iPhone/iPad/PC・OS・Safari/Edge等の総合実行が未実行。Linux自動3engineを実環境合格としない。 | PREPARED / BLOCKED・未実行 | 原UI_UX表のOS/browser/実端末と固定版を指定して総合実行を別依頼 |
| AT-N03 / 実機 | 実VoiceOverまたはNVDAで作成から出力までの焦点/読上げ/エラー/完了通知を未実行。 | PREPARED / BLOCKED・未実行 | 実VoiceOver/NVDAと確認者・固定版を指定して焦点/通知を別依頼 |
| AT-N04 / 実機 | 原指定の実測対象端末での30回p95が未実行。固定Linuxの正式全量30回結果は別の局所証拠。 | PREPARED / BLOCKED・未実行 | 原指定の実測端末と環境を指定して原30回p95を別依頼 |
| AT-N07 / 実機＋実サービス | 専用実接続と二つの実オフライン端末での同本文競合/順逆同期/冪等性が未実行。 | PREPARED / BLOCKED・未実行 | 専用接続と実オフライン2端末を指定して順逆同期/冪等性を別依頼 |
| AT-N08 / 実Auth | 専用実Authの非メンバー/限定閲覧者による直接DataAPI/private素材取得が未実行。 | PREPARED / BLOCKED・未実行 | 専用実Authの非メンバー/限定閲覧者とprivate素材を指定して別依頼 |
| AT-N11 / 実機＋実サービス | 原givenの実OS機内モードと実未cache remote素材の条件が未実行。productionSWのbrowser offline/cold/native cache lossは局所補助。 | PREPARED / BLOCKED・未実行 | 実OS機内モードと実未cache remote素材のcontrolを指定して別依頼 |
| AT-N13 / 実機 | 実日本語OS IMEの変換途中に保存/検索/出力/読戻し/操作キーを使う条件が未実行。Unicode文字列の自動入力だけで置き換えない。 | PREPARED / BLOCKED・未実行 | 実日本語OS IMEと対象端末/固定版を指定して変換途中操作を別依頼 |
| AT-N17 / 契約/費用 | 実専用構成/tier/region/使用量/残量/費用と対象buildを確認できる検証URLが未提供。現Pages build-infoは実404観測、公式一般上限は契約値ではない。 | PREPARED / BLOCKED・未実行 | 実tier/region/使用量/残量/費用と許可済みHTTPS検証先を提示して別依頼 |
| AT-E01 / 実機 | 実iPhone縦画面からPCなしの作成・条件・線・Files保存/取消・空環境復元・回転/キーボードの一連操作が未実行。 | PREPARED / BLOCKED・未実行 | 実iPhone縦・OS Files/取消/空復元/回転/keyboardの実施者を指定して別依頼 |
| AT-E05 / 実Auth | 限定共有snapshotを実Auth各役割と直接API/private Storageで調べ、projectID差替え/権限撤回後取得を拒否する条件が未実行。 | PREPARED / BLOCKED・未実行 | 隔離Auth各役割・対象snapshot・直接API/private Storageを指定して別依頼 |
| AT-E06 / 実機＋実サービス | 二つの実オフライン端末と実Authでの編集/削除/逆順重複送信/容量不足/認証失効を未実行。 | PREPARED / BLOCKED・未実行 | 専用実Auth/二実端末/容量不足と失効の隔離手順を指定して別依頼 |
| AT-E10 / ゲーム | 探索/抽選の局所実証拠はあるが、原thenの対象ゲーム実結果が未実行。汎用受信例のreceiptは別証拠のまま。 | PREPARED / BLOCKED・未実行 | 対象ゲームengine/version/adapterと探索/抽選の実受信先を指定して別依頼 |
| AT-E11 / 実機 | 原指定実端末、実VoiceOver/OS200%文字/日本語IME/性能の総合条件が未実行。 | PREPARED / BLOCKED・未実行 | 指定実端末/VoiceOver/OS200%/日本語IMEと実施者を指定して別依頼 |
| AT-E12 / 実機＋実サービス | 実旧アプリbuildからの更新、実機機内モード、実未取得素材controlとOS Files保存先取消は未実行。cacheIDだけ変えたSW/旧nativeコピー/プログラム取消を代替合格にしない。 | PREPARED / BLOCKED・未実行 | 実旧build/端末/機内モード/未取得素材control/OS Filesを指定して別依頼 |

## 元22件外の別3条件

| 条件 | 準備 / 実結果 | 必要な一操作 |
| --- | --- | --- |
| AC-G02-N/E・CP04 | 手順準備済み / 実2アカウント切替・cold・解除の証拠なし、BLOCKED | 許可された2実accountと同作品・安全な資格情報供給を指定し別依頼 |
| 旧C29 / AC-G07・CP10 | 37分割＋MANIFEST、旧不足18宣言の各実bytesは未回収 / BLOCKED | 原保管者が元の37part/MANIFESTと18宣言の取得元を提示する。新生成物で旧原本を代替しない |
| CP15 | 手順あり / 独立確認者・独立ユーザー受入結果は未取得、BLOCKED | 確認者を指名し、同じ製品/証拠の受領と原手順の結果を別依頼 |

fresh agentの独立文書/コードレビューはCP15とは別結果として最終PRに記録する。AIレビューが成功してもCP15確認者・受入欄は未取得のまま。旧配布保留/404は過去の観測であり、今回の公開先を検証/変更したとは扱わない。原X01〜X12とX36は未採用のまま。

原9 gate＝`realDevices / accessibilityManual / performance / restoreDrill / syncLive / rlsLive / independentReview / hostingCosts / directLinks` を変更しない。今回のdefault checkerはmanifest欠如で早期RELEASE BLOCKED。9 gateの実合格を主張せず、環境/独立受入/正式結果/公開先の不足を残す。本番・別用途Supabase・認証/権限/課金・実作品・配備/公開・実機試験を開始しない。

## 変更・検証・引渡し境界

変更は `STATUS.md`、自handoff、`evidence/3C/CLAUSE_AUDIT.md`・`REACQUISITION.md`・この文書の5 Markdownのみ。原TRACEABILITY/release JSON・契約/fixture・製品・API/共有型/manifest・runner・workflow・依存・検査条件は変更しない。新たな性能案の採用なし、未実測を比較済・不採用としない。原字句の転記と受領台帳の整合性を検査し、低影響の文書変更を写す新テストは追加しない。

元ci.ymlの4文書コマンドとscope/verifyを新Draft PR最終版で確認する。実コマンド、exit、head/tree、実checkout、run/attempt、未実行/取消を最終PR本文へ固定する。文書scopeによるunit/build/3engine skippedと正式未実行を分ける。最終自己SHAは本文にだけ記載し、この文書へ自己参照させない。

### 提出前のローカル検証（10:06〜10:07 UTC）

| 元コマンド | 実結果 | 原因・有効範囲 |
| --- | --- | --- |
| `python3 scripts/check_docs.py` | exit1、broken local link 35件 | partial/sparse checkoutで既存archive・大きいJSONを未取得。新しい2リンクも同じ既存1B/1C包を参照する。原150件の別取得先では両包を取得・全照合済み |
| `python3 scripts/check_completion_plan.py` | exit0 | 原104 tasks / 24 packages / 116 cases / 6 groupsを保持 |
| `python3 -m unittest discover -s scripts -p 'test_check_*.py' -v` | exit1、135件中2 fail＋3 error | 2 failは文書リンクの未checkout、3 errorは既存phase1/phase2証拠archiveの未checkout。製品検査の失敗と読み替えない |
| `python3 -m unittest discover -s scripts/ci -p 'test_*.py' -v` | exit0、25件成功 | scope/verify/retention/recovery helperの既存検査 |

原logは `/tmp/3c-local-checks/1.log`〜`4.log`、argv/実exit/時刻は同 `results.json` に保持し、自動公開添付しない。未checkoutの参照先は開始main treeに実在することを照合する。既存ファイル・assert・検査対象を修正/除外して通さず、完全checkoutの最終PR Actionsで元4コマンドを再確認する。各ローカル失敗を最終head成功へ付け替えない。

別の構造照合はexit0：新表の全464原文/status/pointerがTと完全一致、104/24/6/68の全IDを保持、原22外部表の原文一致、NP01〜16の全行、150受領行の実bytes/Git blob/SHA一致を確認した。これは転記/結合の検査であり正式逐条受入ではない。

戻し方は今回5 Markdownの差分をrevert。DB downgrade/削除やデータ変更はない。次の一操作はユーザーが本Draftの実施範囲とBLOCKEDを確認すること。その後の不足baseline取得は1D handoff末尾の1A再開文を用いた別依頼。依存成果とユーザーmerge→3Bの同一F正式結果がそろった時点でのみ3Cの残りを再開する。merge/公開はユーザーのみ。

[第3段階スナップショット](../../STATUS.md)／[3C引継ぎ](../../handoffs/3C.md)
