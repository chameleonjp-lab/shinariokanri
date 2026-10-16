# 後続対応の作業履歴

以下は最終照合前の作業記録であり、途中状態と旧製品の記述を含む。現在の判定は[README](README.md)と[判定記録](release-evidence.json)を参照する。各段階の原結果を保持するため、保存時の本文を以下へそのまま残した。

保存日時: 2026-10-15T21:59:47.276092+00:00。元README本文のSHA-256: `0a1c62a8c51fe78841466b3bc5ba31b719c7e5f9e348bcbfe01bebf2986ba4e4`。

---

# PR #49の後続対応（2026-10-15）

[原計画CP01〜CP15](../../completion-replan-2026-10-12/IMPLEMENTATION_PLAN.md)と、指定Driveの2026-10-14後続調査に従う。[PR #56](https://github.com/chameleonjp-lab/shinariokanri/pull/56)は外部でmainへ取り込まれた。この作業からmerge・公開切替・別用途DB変更・課金は実行していない。追加X01〜X12は未採用を維持する。

最新mainは `a6a6c97e43081d7fc9872f780531ff95beb34ec0` / tree `dfaf863f32132f6137ce5c23e8b1141ea5d4772c`。2026-10-15T18:14:53ZにPR #56が外部で取り込まれた。開始時main `ed238a7a3635237829c4f68f2d352785dfd889f7` と既取り込み#48〜#55の記録は履歴として保持する。参照チャット本文を読む `read_thread` はこの実行環境に提供されていなかったため、チャット名から状態を推測せず、GitHubの実状態と計画書・Drive資料を根拠にした。

## 今回の変更

- 原Largeの実ファイルで復元確定後の600,000ms失敗を再現し、処理区間とCPU traceを保存した。検査用private graphの凍結を、一つずつプロパティ記述子を読む方式へ変更。型・深さ・密な配列・アクセサ・prototypeの条件、全体確認後に凍結する順序を維持する。
- 取り込みの全履歴・送信待ちを最大2件ずつ分割保存する。各行の完全なv1記録と一つのnative transactionを維持し、後の処理失敗で先の行・全partsも取り消す。行の省略、送信待ちの参照だけへの置換、保存形式の変更は行わない。
- 履歴は既存native差分形式から全own値とキー順を完全に再構成できる場合だけ差分保存する。不一致は完全記録、非連続履歴と64件ごとの区切りは完全な復元点とし、既存行を新しい差分の親に使わない。公開の現在稿の編集可能性とaliasを維持し、送信待ちは独立した完全記録を保持する。
- AT-N14のresumed/coldとAT-E12のnew/cloneで、既に生成していた完全保存bytesを添付する。CIは各engineの4原本を観測SHA・容量・ZIP内部の全宣言ファイルと照合し、実ファイルとmanifestをartifactへ保存する。原本の欠落・改変、失敗・再試行、別engineを成功にしない。
- 共通の原受入helperでも、各完全保存の実bytesと容量/SHAを検査前に添付する。後続のassertが失敗した場合も、それまでに実際に生成したファイルを保持する。
- AT-F01の原文にある文章「塔の鍵は鳥が持つ」・PNG・実WAVを同じ作品へ入れる局所検査を追加した。通常UIの場面変換後、元メモ・変換先ID・参照・新旧段落・履歴before/after・元の送信待ち・全素材を、coldと空環境new復元まで直接比較する。新規復元が追加する1件の取込監査も元の送信待ちと区別する。
- 原F27の二人の葵・一般語・別名と同じ作品に引用資料を加えた。cold/new/cloneで出所・引用文・引用先のID対応を直接比較し、元の候補選択・除外・旧版の期待を維持する。
- 前候補086255aの実機用に13配信ファイル、依存LICENSE/NOTICE、隔離fixture、当時の操作手順、結果記録欄を用意し、ZIP内の25ファイルを照合した。当時の手順は旧ZIP内に保持し、現候補の手順とは区別する。このZIPは前候補に固定され、現候補の配布物・公開・実機操作の成功を意味しない。

先の製品3ab6の実機引渡し用ZIPもローカルに固定した。配信13ファイル、実依存LICENSE/NOTICE、互換用の隔離メモfixture、[短い実機手順](MANUAL_REVIEW.md)と未実行の記録欄、manifestの25ファイルを照合した。ZIPは1,097,357bytes、SHA-256 `fb9d49441a6fb4f77d77ec5d534e97484cf0a4c4343e5f05c692415141cfe38b`。旧086の実fixtureは入力として明記し、現候補の生成結果・実機合格へ読み替えない。公開・Drive保存は実行していない。

原104要件・116ケース/464条項・24工程・6回帰群・68補助確認、既存fixture/assert/timeout/retry/skip、native1.0.0等の形式を変更していない。[逐条レビュー表](CLAUSE_REVIEW.json)は原4節すべてへsourceで確認した操作・照合対象・不足条件を記録し、最終実結果との照合前に合格へ変更しない。[24工程](WORK_PACKAGE_REVIEW.json)と[6回帰群](REGRESSION_REVIEW.json)も原完了条件と対応sourceを保持する。[補助確認68件](SUPPLEMENTAL_REVIEW.json)は必須G系32件と未採用X系36件を区別する。

## 現在の追加候補

[Draft PR #57](https://github.com/chameleonjp-lab/shinariokanri/pull/57)の測定対象製品は `1fcadcca703863873a57d297e83b1b184e63e778` / tree `8ac6e33a98455204aa265be5ce86ee5be168a97b` / clean build `8ec3a03810bb0cf1b1b4`。source513件と配信13件を実Git blob/実bytesから事前に固定した。変更は関係図の3ファイルと幾何テストだけで、元26文書・形式・fixture・操作・assert・timeout・retry・skipは変更していない。

precommitの関連unit29件・既存画面5件と、元コードに対するラベル座標/寸法128組の完全一致は成功した。準備版の結果は転記せず、上記clean製品版で正式Standard全8指標各30回が条件内となった。関係図p95は丸めなしの33.30000000000291ms（元上限33.4ms）。Largeも全8指標各30回を記録し、明示された起動5731.5ms/検索562.8000000044703msは元上限10000/2000ms以内。他6指標はLarge独立上限がない観測値である。元6条件×30回の180保存は全6条件のcommand p95が1000ms以内で、全91履歴cold/空環境完全復元を確認した。[製品全CI run38792131626](https://github.com/chameleonjp-lab/shinariokanri/actions/runs/38792131626)は全7job成功（unit122ファイル/1132件、3ブラウザー各228件と後続回帰）。実ZIPの独立照合と、同固定版の実7200秒および最終全113履歴/新規/複製/cold復元は継続中である。

証拠保存用の配布commit `1e77dd40544df541bf50bebb0071d8137e2362d4` は製品版と区別する。追加workflowは別checkoutの製品513sourceを封印SHAと照合し、元の公開checkerを製品commitで実行した。暫定記録の実exit1/blockedをそのまま `release-evidence` artifact12003939531へ保存した。保持処理の追加4統合テストはCIで成功。workflow成功を受入全体・公開承認へ換算しない。

現製品1fcadccaの実機用ZIPはローカルに固定した25ファイル・1,097,752bytes、SHA-256 `d08076439e02e42010a232a43aa919eac7e54e48379e349c0911cbdd1ae51902`。配信13ファイル/依存LICENSE・NOTICE/互換fixture/手順/記録欄/manifestを照合済み。Driveへは未保存で、実機操作の合格でもない。

CP05は下記3ab6の実検証版を明記して引き継ぐ。新旧の差分は図の表示だけで、helperが使うstorage/domain/testing全source、実5worker bytes、原計画文書は不変。原計画の変更影響による引継ぎ規則に従い、全113復元の実結果を新候補で再実行したとは扱わない。影響を受ける画面・正式各30回・元180保存・実7200秒と最終完全復元はこの候補で取り直す。

## 先の製品候補3ab6と検証記録

先の製品候補は `3ab6f40080754c4dec92ca8fc88c8049b278eede` / tree `dfaf863f32132f6137ce5c23e8b1141ea5d4772c` / clean build `5476ab952776d316c609` / base `/shinariokanri/`。clean checkoutのsource495件がGit実blobと一致し、配信13ファイルを実行前に固定した。[全CI run38765080015](https://github.com/chameleonjp-lab/shinariokanri/actions/runs/38765080015)は全7job成功（121ファイル/unit1,130件・3engine各228件と後続回帰）。実3ZIPのprovider digest・全CRC・全inventory・12原本の全内部宣言/SHA、sourceと実merge Git parents/treeを独立照合した。3engineの実結果をケース別に参照し、各432件の添付容量/SHAを照合した。後から解決した7入力参照は元indexを変更せず別indexへ保持する。同じ既存原Large実ファイルのcloneは、通常の空persistent profile・quota上書きなし・元600,000ms以内の536,340.9msで画面完了へ到達した。source495件/配信13件の不変・recordParts Worker119件の生成/終了・同時最大2（pack/unpackは区別しない）を確認し、既存原本の診断として保持する。

続けて原112通常編集と14回のnative検証から、新しい113全履歴/送信待ち・88,003レコード・72MiB素材の完全ファイルを取得した。取消46ms、完全取得244,074.7ms、最初の進捗35.3ms、最大UI間隔876.6msは原条件内。実ファイル2,720,991bytes、SHA-256 `0d37c3eb2dc3b679d8c27b2eeab703f2cc988c80f2d14824d26e07300626f25b`。全113履歴のbefore/after・順序・送信待ち・162,117 typed owned ID・全素材の独立oracleが成功した。空new復元とcold全native照合、空の別profileのcloneとcold全native・ID対応の照合まで17:58:03Zに成功した。全113元command・送信待ち・全素材・162,117 typed owned IDの対応を保持し、追加1件の取込監査を別に確認した。helperの前後一致と全cleanupも成功した。環境再接続で元のCLI sessionが失われ、OS終了codeは未観測であるためexit0とは記載しない。14回はnative再読込の検証であり、公開snapshotやStoredCommandのcheckpointが14件あるという意味ではない。正式Standard各30回では8指標中7指標が元条件内だが、関係図のp95は66.70000000000437msで33.4msを超え、不合格である。実行CLI exit0と性能合否を区別する。最新mainから `fix/pr49-graph-performance-20261015` を分岐し、追加の描画修正を検証中。Large各30回・元180保存・実7200秒は最終コードで直列実行する。

source495件はapp/testを中心とする初回固定範囲であり、runner全入力の512件とは区別する。初回runner headerに実行前のSHA/容量があった追加17件を実Git blobと照合し、後から物理保持した512件の補足sealも残した。後からの保持を実行前の存在へ読み替えない。Standardの独立判定はこの512件と実510入力の対応を検査している。

同じWorkerが所有する不変な記録の全own値比較と、実計算した全command hashを処理内で再利用する。hash宣言は毎回照合し、全構造・参照・内容のvalidatorを元の順序で呼ぶ。符号化intrinsic/prototype hookの変更時はhashと一時bytesを破棄し、mutable/未対応データは再計算する。新規unitを含む128件、最後の比較scope修正後は関連93件、型検査・buildが成功した。N14/N09/Worker取消の実ブラウザー3件も成功。dirty `3a564fb5b82d6228b3cf`であり、clean候補へ転記しない。

前候補6582aa3 / clean `8139904cd0347a800b72` のcloneは原子保存へ進んだが、元600,000msで失敗した。packing worker56件終了・最大同時2、source493/配信13件の不変を照合した。全内容/native/coldの成功にしない。同候補のCIは120ファイル/unit1,122件成功後、新たな製品修正pushで3engineが中止され、全7job成功には数えない。


新規・複製の確定前処理を同じWorker内で続け、各工程で全履歴を送り返す処理を除いた。全構造・履歴・hash検証を元の順序ですべて実行し、preview・素材bytes確認・監査command構築はstoreへ問い合わせる。取消とcallback失敗はWorkerを終了し、既存native transactionへ進ませない。関連単体149件と型検査・buildがprecommitで成功。N14/N09と実Worker取消・応答・全表一致・再試行/coldも成功した。初回取消テストは旧通信形式だけを観測して失敗し、実工程通知へ観測を対応させて、同じassert/timeoutで成功した。dirty buildの結果をclean候補の全CIへ転記しない。

実ファイルを読む際の原bytesを検査・変更前に保持するhelperを追加した。7件の出力系テストがprecommitで成功し、実添付の容量/SHAを独立照合した。fixtureの読み込みも明記し、filenameだけを実出力や受入成功の根拠にしない。

前候補8d97372 / tree `bf411f201ba05400da71cc0ac59de4ad6fff4bef` / clean build `72dec6ae03426875f1c6` の[run38749249601](https://github.com/chameleonjp-lab/shinariokanri/actions/runs/38749249601)は全7job成功。120ファイル/unit1,122件、3engine各228件と後続回帰が成功した。実merge `38ab76594ce9d096725416396d0bc2cf3a1299f0` のparents/tree、3実artifactのprovider digest/CRC・全inventory・12実原本の内部宣言/容量/SHAを独立照合した。同原本のcloneは原600,000msで保存前検査が失敗し、source490件/配信13件の不変を照合した。CPU traceはbufferが満杯となり、復元Workerは最初の約300秒だけのsamplingである。全600秒の段階記録と区別し、末尾hash区間全体のCPUを測れたとは扱わない。


復元で同じ共有履歴を繰り返し比較する区間を修正した。元65,536組の比較キャッシュの中で、全値の比較が完了した記録と大きな配列を保持する。また同じschema・世界依存で、全own値・key順・prototypeまで一致する不変な履歴prefixだけをprivateなfull validatorの入力へ再利用する。現在稿と新commandを含む全履歴を従来のvalidatorへ渡し、失敗・取消・reset・並行処理の破棄を保持する。公開結果の編集可能性・aliasと、送信待ち全commandの独立したv1保存は維持する。

関連unit132件（4ファイル）、型検査・build、F35とN01両幅の画面操作3件がprecommitで成功した。画面操作のbuildはdirty `a367015a4734ad5092c2`であり、clean候補へ結果を付け替えない。F31では同じN01 given上の未完成JSON・5幅・人物/条件/関係の通常編集・実完全fileのnew/coldを補った。F35では同じ実givenで通常local HTTP登録の確定後、replaceの容量失敗・全author/sync表rollback・再試行・cold再認証後の全内容/素材一致を追加した。実Auth/RLSや実端末の成功にはしない。

原Largeからの複製113履歴を使った[部品の実結果](evidence/warm-history-prefix-component.json)では、113 commandすべての前後hash・順序が一致した。現在版更新後の再検証は20,906.4ms。初回のfull検証は85,157.3ms（CPU samplingなし）、次の版はsamplingありであり、正式な同条件30回比較ではない。[実行bundle/source mapからのsource bytes照合](evidence/warm-history-prefix-binding.json)は後の8d97372 commitへ一致するが、precommit実行をclean候補の全復元合格へ読み替えない。

### 前候補の検証記録

前候補398c32は `398c32cbe750336e57e5745dd29698d333867808` / tree `f3ddaf0dfa0eeb361b9230bd3e275458b9f93b0f` / clean build `69f3cb4a27a7a2e7eee0` / base `/shinariokanri/`。隔離したclean checkoutからbuildし、source 488件の実bytesがGit blobと一致することと、実配信13ファイルを固定してから原本復元の診断を開始した。本資料だけを加えたdelivery commitを、この製品buildの試験対象へ付け替えない。

Worker専用の分割処理は、コピーされたown-dataからentries配列と文字列ごとの一時bytesを作る回数を減らす。生成した数値/タグnodeだけintrinsic JSONを使い、各非同期digestの後にprototype/toJSON/関数を再確認する。公開関数のgetter/iterator順、文字列の検査、全v1 bytes/SHA/分割境界/上限は維持する。

前候補472f546のprecommit関連unit23件（最後のguard変更後は15件を再検査）と型検査・build、関連E2E28件はprecommit時点で成功した。E2Eのbuildは `61036463b1c012adafe6` / dirty=trueであり、上記clean候補の合格に付け替えない。原3288版の固定sourceを独立byte oracleとし、Unicode境界、非同期中のJSON hook変更、不正入力と取消を確認した。原本の最後の完全commandを新プロセスで6回交互測定し、各14分割の実bytesが保存済み086原本とすべて一致。中央値は従来1,722.1ms、Worker用1,052.1msだった。部品診断であり、復元全体や原30回の正式性能合格ではない。

398c32では取り込み時だけ、既に検査・生成したv1配列を128KiBを目安に再分割する。各項目の全bytes・順序・参照、行ごとの独立した全commandを保持する。単一の大きな項目と元8MiB/256MiBの上限を維持し、追加の区切りが元総量を超える場合は元分割を使う。旧3288 decoderで全内容を直接比較した。関連unit35件、通常E2E22件、型検査・buildはprecommit dirty版で成功。clean版へ結果を付け替えない。

元最後の全commandは14分割から214分割へ変わり、追加は区切りの200bytesだけだった。全内容のhashは不変。部品処理はencoder1,095.1ms＋再分割212.4ms。実分割bytesを113件分、3,034,922,586bytes、通常の空プロファイルの一つのnative transactionへ書き、旧decoderで照合した元commandの容量診断は成功した。部品の成功を作品全体の復元へ昇格しない。

前候補472f546の空newは、原600,000ms内の584秒で実容量拒否となり失敗した。全118 Worker終了、最大同時2、source486件・配信13件は不変。シークレット領域はRAMから計算する実quotaを持ち、公開estimateの10GiBと異なる。同じ実bytesの容量診断でも拒否した。原Large helperのdefaultはそのまま保持し、`--restore-storage persistent` で通常の空プロファイルを明示選択できるようにした。quotaの上書き、入力/検査/原上限の変更は行わない。原新規/複製/coldの全照合とcleanupを保つ。

前候補472f546の [run38729464367](https://github.com/chameleonjp-lab/shinariokanri/actions/runs/38729464367) は119ファイル/1,113unitとChromium/Firefox各228件が成功。各4実原本、provider digest、実merge Git parents/treeと全inventoryを独立照合済み。WebKitとverifyも成功し、全7jobが完了した。WebKitの実artifactも独立照合し、12実原本すべてのSHA・容量・内部宣言と一致した。現候補398c32のcommit/treeをGit実体へ一致させ、前CI完了後にPRのrefを期待head付き・forceなしで更新した。現候補の[run38736460437](https://github.com/chameleonjp-lab/shinariokanri/actions/runs/38736460437)も全7jobが成功。120ファイル/1,117unit、3engine各228件と後続回帰を完了した。実merge checkout `df5b3dcff578fad23aee97cebaa5a196bcc4cc2c` のparents/treeをGit実体で照合した。同じ原Large実ファイルの通常空プロファイルnewは593,661.9msで画面完了に到達したが、全native/cold対応の判定はしていない。cloneは原600,000msで保存前検査が時間切れとなり、native commitとrecordParts workerは未開始。source488件/配信13件の前後不変を確認し、失敗を保持した。Workerの処理段階だけを記録する同一原本の診断を継続中。正式な112編集からのLarge全手順・各30回・180保存・実7200秒は未実行。

前候補 `a72fb0c70ea72e7212d8188e1bf3de4d28fa3631` / tree `6b04f4eb8d3e046c7c9a3cc4ea132890f966f0a5` / build `5e579fa9a47bf7b51d98` では関連unit88件とclean E2E13件が成功した。しかし同じLarge原本の空new復元は600,000msで失敗し、pack worker89件終了・最大同時2件・警告なしだった。source485件と配信13件の前後一致を確認して失敗を保持した。元113履歴だけを同じprivate helperで処理した部品診断では112件が完全一致する差分、2復元点、1完全記録だった。原子保存前の処理時間は21.55秒で、parentの不一致はなかった。UI全体の成功へ昇格しない。[run38724829830](https://github.com/chameleonjp-lab/shinariokanri/actions/runs/38724829830) はunit/Chromium/Firefox成功後、新pushでWebKitが中止され、全体はcancelled、verifyはfailure。3engine全成功には数えない。

次の二段落は前候補 `a8d3abc2d1993a7b63e6bde72cf928a963606c86` / tree `06c62beed4db2ddf388c190c450d6eff4fffdc9a` / clean build `cb157ca480c8fe94f12a` の記録である。

型検査は成功。全unit117ファイル/1,095件では1,093件成功、2件は標準Chromiumが `file:` を `ERR_BLOCKED_BY_ADMINISTRATOR` で拒否した。当該HTML出力ファイルの21件はCIと同じChromiumで全件成功した。凍結・同時処理の上限・後続失敗時の全取消も含む。別の問題として見えた追加テストの終了済みDexie文脈は、テストの外側で待ち合わせていたことが原因だった。通常の保存完了を待つ手順へ直し、製品のquery/getManyを変える暫定差分は除去した。失敗記録を保持し、最初の全unit実行を一括成功へ書き換えない。

clean buildの関連E2Eは計12件成功。初回11成功/1失敗のAT-E12は隔離checkoutに元の旧fixtureがなく、実行前に停止した。同じcommitの元blob（`9fd42ec75edc31fd5c1c8f7e04fa2acd2d673f86`）を取得して1件を再実行し成功した。[run38719853808](https://github.com/chameleonjp-lab/shinariokanri/actions/runs/38719853808) はunit/Chromium/Firefox成功後、新候補pushで中止された。WebKitを全成功には数えない。同じLarge実原本の空new復元は再び原600,000msで失敗した。原子保存中のpack workerが129件完了し、同時数は最大2、警告はなかったが、画面の最終完了・native対応・clone/coldは未確認。source483件と配信13件の前後一致を確認して失敗を閉鎖した。

以下は前候補 `086255ab3ee07bb3a522fc2dc8cf6d249afca4a7` / tree `56beca7ab1be5150bab892087cfb563cdaf92b9a` / clean build `4b56d699080fb7cbd49d` の保存済み記録である。現候補の完了へ転記しない。

GitHub全CIは [run38704523630](https://github.com/chameleonjp-lab/shinariokanri/actions/runs/38704523630) の全7jobが成功。unitは117ファイル/1,091件、E2EはChromium・Firefox・WebKit各228件（計684件、skip/flaky/unexpected 0）で、後続のLarge/部品検査も実行済み。実CI checkoutはmerge commit `0cd0714bc7698a19d4a158ece54318e80bff871e`。そのparentsとtreeをGit実体で確認し、上記候補とtreeが一致した。CI buildとローカルbuildの生成時刻を同一とは扱わない。

3engineのartifactを実際に取得し、provider digest・ZIP CRC・source/実checkout・結果一覧・各4原本の観測SHA/容量・ZIP内部の全宣言ファイルを独立照合した。前候補086255aの12原本はすべて一致。[実原本と該当2 spec/resultの抜粋](evidence/ci-38704523630/README.md)を本資料へ保持し、保存期間と各digestは [EVIDENCE.json](EVIDENCE.json) に記録した。旧実行の欠落原本を回収したとは扱わない。共通helperへの追加保存はこのCIの後の差分であり、現候補のCIで検証する。

元Large 88,003記録・実素材75,497,472bytes・112編集→113履歴/送信待ちの `measure-large-history.mjs --soak-seconds 0` は失敗を保持した。完全保存の実ファイル2,721,068bytes（SHA-256 `aec98eab53ec793d7d3fe3bdce7c211bc6f100dafffa095da7d2ec2787286416`）は247,731.7msで取得。取消描画43.2ms、最初の進捗描画28.2ms、最大UI timer gap818.6msで、各原上限を満たした。独立oracleは113件すべての履歴before/after・順序・送信待ち・全素材・162,117件のtyped owned IDを照合し成功した。しかし空環境new復元後の `.app-shell` 待機が原600,000msで失敗し、newの最終native対応とclone/coldは未確認である。同じ原本と封印buildで、画面警告・処理区間・Workerを記録する再現診断を継続している。正式30回・180保存・実7200秒は未実行。

準備検査では、関連6ファイル19件のWebKitが全件成功。Chromiumは18成功、AT-N10のdata:文書を開く操作が管理ポリシーの `ERR_BLOCKED_BY_ADMINISTRATOR` で失敗した。各engineの4復元原本はそれぞれ独立照合に成功。Firefoxはプロファイル作成で起動不可だった。WebKitの追加共有ライブラリ配置とhost要件の検出省略、初期buildのgit子プロセス権限不足によるunknown版は環境補正として保持し、これらをclean候補の全受入へ昇格しない。

文書・完成計画・#43監査・#49固定source checker、既存Python24件、CI制御Python21件（新6件含む）が成功。文書/部品の件数を原116ケースの合格数には変換しない。

## 旧証拠の個別確認

[元パス・期待hash・取得元ごとの台帳](evidence/old-proof-audit.json)でC29の37partと旧不足32宣言を一件ずつ確認した。37partと元MANIFESTは未取得。32宣言のうち14宣言（10 unique hashes）は、保存済み歴史C13 archiveの実member bytesが元期待size/SHAへ一致したため[補足](evidence/old32-recovered/RECOVERY.json)へ保持した。元の欠落パスは変更せず、残り18宣言と旧実行の成立は未確認。

C24の同じlogical pathに置かれたRETENTION 2版は、元2part・結合archiveの全SHAと選択した2blobの実bytesを照合した。[SHA別の補足対応](evidence/c24-retention-variants/MAPPING.json)に両版をgzipで保持し、展開後の原size/SHAも確認した。どちらかを正本へ選んだり元packetの重複を成功へ変えたりしていない。旧run38515797862の[不足12原本の元宣言](evidence/old-run38515797862-missing-recovery-outputs.json)も保持し、候補の新ファイルで旧bytesを回収したとは扱わない。

## 原計画の残条件

| CP | 今回確認・準備した範囲 | 最終判定に残るもの |
| --- | --- | --- |
| CP01〜CP04 | 最新main/取り込み済みPRを固定。3ab6f40の原3spec・既知復元/保存補修を含む全CI 7jobが成功。現在入口を更新。 | 原F27/F36/E12の全条件・実環境を区別して判定。 |
| CP05〜CP07 | 旧版の失敗を保持。3ab6f40は既存原本clone診断が元時間内で画面完了。原112編集からの新しい完全fileと全113履歴/素材の独立oracleが成功し、空new/cold全native照合が成功し、clone画面完了後のcold全native照合中。 | 空new/clone/coldの全対応、全30回/180保存・実7200秒の成功。 |
| CP08〜CP09 | メモ変換・引用等の直接操作に加え、F31の同given操作とF35の通常local置換/rollbackを補強。復元と互換の元検査を全CIへ保持。 | 全116ケース/464条項を同一候補・原given/操作/境界へ逐条対応。実端末同期等を局所操作へ換算しない。 |
| CP10 | 新候補の復元原本の保存・欠落検出を追加。 | 旧C29原37分割/MANIFEST等の実bytesは未取得。旧run38515797862の不足12原本を新候補の別ファイルで復元したとは扱わない。 |
| CP11〜CP12 | 固定配信ZIP・隔離サンプル・短い実機/Files/IME/支援技術の手順と記録欄を用意。 | 実iPhone/iPad/PC、VoiceOver/NVDA、実OSキーボード/200%文字の操作。 |
| CP13〜CP14 | 接続projectとPagesを読取り。公式Storage/Edge制限を再取得。 | 指定済み専用Auth/Storage・5実役割・二端末、実tier/容量/残枠/費用、候補を取得できるHTTPS URL。 |
| CP15 | 前候補086255aの元release checkerは116+24+9の149保留、版/基底不一致0でexit1。現候補は未実行。 | 全原条件と9gate・独立レビュー。checkerを緩めず完成・公開を保留。 |

Driveへの固定候補ZIP保存は自動承認審査で拒否された。理由は、payloadの指定先への明示許可と接続先所有確認の不足。ファイルはローカルに保持し、拒否を別経路の外部アップロードで回避していない。コード・CI・実行結果の引渡しはPR内で継続する。公開GitHubリンクと現在の判定をまとめた[Drive報告](https://docs.google.com/document/d/1aQ3FI-SmsomUbUBiG0NQ7vp4KdQIqGfbjQ92elvLU9g/edit)を後続フォルダーへ保存し、本文と保存先を読み戻した。ビルドZIPは含めていない。

## 参照

- [Drive後続調査](https://docs.google.com/document/d/1MPtTFVH82UpuqY0Ab7tz0lcZ99-NXMnocbRTRMkpeCk/edit)
- [原受入と証拠の条件](../../completion-replan-2026-10-12/ACCEPTANCE.md)
- [原本照合コード](../../../scripts/ci/verify_recovery_artifacts.py) / [欠落・改変等の負例](../../../scripts/ci/test_verify_recovery_artifacts.py)
- [原公開checker](../../../scripts/check_release.py) / [旧証拠の不足と取得条件](../ap01-2026-10-11/HANDOVER.md)
