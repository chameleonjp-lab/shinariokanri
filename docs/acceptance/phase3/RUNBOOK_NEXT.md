# NP06：同一最終候補の正式runbook（1D準備）

1Dで確定するのは入力・入口・順序・保存先・失敗/再開条件。正式実行は**未実行**で、3BがNP05最終比較・NP06・NP16へ同じ結果を渡す。NP07の実逐条確定と再取得は3C。[比較設計](../../optimization/next-stages-2026-10-19/COMPARISON_DESIGN.md)／[暫定表の読み方](TRACEABILITY_NEXT.md)。

## 0. 実行を開始できる条件

- 3Aまでの依存PRがユーザーによりmerge済みで、実CIが成功している。1Aの原30/180・各size3標本heapの変更前基準がある。各改善の直前Pnと最終Fを分け、旧04a7/1fcを現在値へ改名しない。
- 許可済みの通常実行環境、Node24/Python3、lock依存、Playwrightの実browser/host libraries、原素材・十分な保存領域を確認する。Cloud environmentの使用/作成/変更、実機・実Auth・別用途/本番DB・課金・配備・公開はこの計画から追加しない。
- 最終候補checkoutと証拠提出checkoutを分ける。測定中はcandidate HEAD/全tracked source・tree・build/dist/helper/fixtureを変えず、重い測定・build・資源測定は同じhost資源で直列にする。
- 出力先はcandidate外の絶対pathで、各attemptの未使用領域とする。プロセス/receiptを残せるhostとセッション終了前の証拠回収先が必要。rawの一時領域を唯一の保管先にしない。

以下の変数は**実行者が許可済みの実pathへ設定**する。例のpath自体を環境指定としない。FORMAL_ROOTとPACKAGE_ROOTは未作成、RECORD_ROOT/RESOURCE_ROOT/SUPPLEMENT_ROOTも別の未使用領域。BASELINE_RESOURCEは既に完了した1Aのraw.jsonとする。

```sh
CANDIDATE_ROOT=/absolute/approved/final-candidate
FORMAL_ROOT=/absolute/approved/proofs/formal-attempt01
RECORD_ROOT=/absolute/approved/proofs/control-attempt01
PACKAGE_ROOT=/absolute/approved/proofs/formal-package01
RESOURCE_ROOT=/absolute/approved/proofs/resources-final01
BASELINE_RESOURCE=/absolute/approved/proofs/resources-baseline01/raw.json
HISTORICAL_ROOT=/absolute/approved/proofs/originals01
SUPPLEMENT_ROOT=/absolute/approved/proofs/supplements-final01
cd "$CANDIDATE_ROOT"
test ! -e "$FORMAL_ROOT"
test ! -e "$RECORD_ROOT"
mkdir -p "$RECORD_ROOT"
git rev-parse HEAD
git rev-parse 'HEAD^{tree}'
git rev-parse HEAD:src
git status --porcelain
```

最後の出力が空でなければ停止する。git commit raw object/tree証明はsealが保存する。人が転記したcommit/buildラベルだけでは受理しない。

## 1. 現行入口、clean buildと事前seal

1Dでは既存Python6入口の`--help`を実CIで実行しexit0を確認した。[実記録](../../implementation/codex-next-stages-2026-10-19/evidence/1D/VERIFICATION.md)。3Bでは採用後の版で再確認する。以下は現在のparser/元手順に合うargvであり、今回の正式実行記録ではない。

```sh
python3 scripts/acceptance/run_formal.py --help
python3 scripts/acceptance/seal_candidate.py --help
python3 scripts/check_phase3.py --help
python3 scripts/acceptance/pack_evidence.py --help
python3 scripts/acceptance/run_supplements.py --help
python3 scripts/acceptance/recover_historical.py --help
python3 scripts/check_stage1_traceability.py
python3 scripts/acceptance/execute.py --workdir "$CANDIDATE_ROOT" --receipt "$RECORD_ROOT/npm-ci" -- npm ci
npx playwright install --with-deps chromium firefox webkit
export CHROMIUM_PATH="$(node -p 'require("playwright").chromium.executablePath()')"
python3 scripts/acceptance/execute.py --workdir "$CANDIDATE_ROOT" --receipt "$RECORD_ROOT/build" -- npm run build
git status --porcelain
python3 scripts/acceptance/seal_candidate.py --output "$RECORD_ROOT/preflight.json"
python3 scripts/acceptance/seal_candidate.py --verify "$RECORD_ROOT/preflight.json"
```

build後もcleanであることを確認する。`dist/build-info.json`のcommit/tree/dirty=falseがHEADと一致しない場合はsealが拒否する。sealはsource、dist全配信bytes、生成runtime、原73入力、Git commit/tree証明とsnapshot ZIPを固定する。CHROMIUM_PATHは実インストールpathを選ぶだけで、browser version/OS/CPU/memory/argvと他の環境条件は実rawへ記録する。

**FORMAL_ROOTへ事前candidate.jsonだけを置かない。** `run_formal.py`はそれが存在すると既存sequence.jsonも期待する。上の事前sealはRECORD_ROOTへ置き、正式runner自身が新FORMAL_ROOTにbinding/snapshot/sequenceを作る。

## 2. 5実行を原順序で直列実行

```sh
python3 scripts/acceptance/execute.py --workdir "$CANDIDATE_ROOT" --receipt "$RECORD_ROOT/formal-launch" -- python3 scripts/acceptance/run_formal.py --output "$FORMAL_ROOT"
python3 scripts/acceptance/seal_candidate.py --verify "$FORMAL_ROOT/candidate.json"
```

外側wrapperは親が観測した実child exit・PID・log SHA・wallを保存する。wallは性能指標ではない。runnerは各stepでも独立のexecution/command.json・exit.json・stdout-stderr.logと前後sealを保存する。外側toolの返答やrawのcompletedだけでは実終了・cleanup成功にしない。

| step | runnerが実行するcanonical argv | rawの場所（FORMAL_ROOT相対） |
| --- | --- | --- |
| performance-standard | `node scripts/measure-app.mjs --size standard --samples 30 --mode performance --output FORMAL_ROOT/performance-standard/raw.json` | `performance-standard/raw.json` |
| performance-large | `node scripts/measure-app.mjs --size large --samples 30 --mode performance --output FORMAL_ROOT/performance-large/raw.json` | `performance-large/raw.json` |
| saves180 | `node scripts/acceptance/measure-original-saves.mjs --binding FORMAL_ROOT/candidate.json --proof FORMAL_ROOT --attempt saves180` | `results/saves180/raw.json` |
| soak | `node scripts/measure-large-history.mjs --soak-seconds 7200 --restore-storage persistent --output FORMAL_ROOT/soak/raw.json` | `soak/raw.json` |
| exceptions | `node scripts/acceptance/measure-full-exceptions.mjs --binding FORMAL_ROOT/candidate.json --source FORMAL_ROOT/soak --output FORMAL_ROOT/exceptions/raw.json` | `exceptions/raw.json` |

表のFORMAL_ROOTは`procedures.canonical_command`が正規化した実絶対pathへ展開する表記。手動で別driverへ置換せずrunnerから起動する。saves180のrawだけはstep directory直下ではない。5つのstatus=completed、実終了0、前後sourceVerified=true、finishedAt/cleanupと重複しない時系列を確認する。

## 3. 保持する原条件と独立期待

- Standard/Largeそれぞれ原8指標×30回。未丸め生値とnearest-rank p95/最大を保持する。図/年表は原30 gestures×11 frames＝330生値であり、30値へ切り詰めない。起動は実際に見えて入力可能な同じ作品のeditorまで。元p95上限は[比較設計の表](../../optimization/next-stages-2026-10-19/COMPARISON_DESIGN.md#原時間条件と未採用の追加目標)。Large上限なし6項目へ追加目標案を混ぜない。
- 原3保存形式（project_name_one_field / one_dialogue_text / atomic_two_dialogue_records）×Standard/Large×30＝180保存。各条件の原command p95≤1000ms。debounceを含むUI時間とcommand時間は別欄。元fixture hash・v1/v2実bytes・再送/原子性は維持する。
- 実7200秒、112通常編集、88003記録、113履歴・113送信待ち、実75497472素材bytes（3×25165824、各hash）を使う。時間短縮、同数別seed、素材placeholder、履歴/送信待ちの間引きは不可。
- 完全出力は原600000ms以内、進捗/取消/heartbeatは原2000ms。newとcloneを別々に実行しcold reopen後の全current、全owned ID、113operationの順序/parent/checkpoint64/importOrigin・hash、全pending、各素材実bytesを独立照合。cloneは全IDのdisjoint bijectionも必要。
- exceptionsは直前soakの**同じ完全ファイル**の全memberを使う。hash mismatch、unknown major、最後の素材の1byte破損、最終native一般error、quota、通常再試行→coldを保持する。拒否後全21 critical tables不変、入力保持、helper前後一致とcleanupを確認する。小fixtureへ置換しない。
- `check_phase3.original_performance_fixture`はimmutable旧rawのfixture定義だけを期待値として読み、過去の測定値を現在値へ移さない。113復元は独立expectedの全162117 owned IDs・全operation/nativeと実出力を対照する。

## 4. 同じ候補の補助原本と資源測定

正式5実行の完走・実cleanup後、同じclean候補でN05の2実download/原RG補助を新outputへ取得する。旧原本の回収だけにimmutable evidence branchを使う。既存1Bの成功原本は履歴であり、Fへの新実行を代替しない。

```sh
git fetch origin evidence/pr49-followup-20261015-1fcadcca
python3 scripts/acceptance/recover_historical.py additional-original-regressions-1fcadcca --repository "$CANDIDATE_ROOT" --output "$HISTORICAL_ROOT"
python3 scripts/acceptance/recover_historical.py unaffected-local-3ab6 --repository "$CANDIDATE_ROOT" --output "$HISTORICAL_ROOT"
python3 scripts/acceptance/run_supplements.py --repository "$CANDIDATE_ROOT" --binding "$FORMAL_ROOT/candidate.json" --historical "$HISTORICAL_ROOT" --output "$SUPPLEMENT_ROOT"
test -f "$BASELINE_RESOURCE"
node scripts/acceptance/measure_resources.mjs --repository "$CANDIDATE_ROOT" --tools-root "$CANDIDATE_ROOT" --output "$RESOURCE_ROOT" --compare "$BASELINE_RESOURCE"
python3 scripts/acceptance/seal_candidate.py --verify "$FORMAL_ROOT/candidate.json"
```

`measure_resources.mjs`はNodeの`--help`対応入口ではない。必要な3引数と任意`--compare`は現行source/元READMEから確認した。各size3標本を原順序で採り、強制2GC後のmain renderer V8 heapとlogical retentionを記録する。peak/RSS/Worker/native/全プロセスメモリの合格には使えない。baseline未取得・browser/fixture不一致では比較を止める。正式OFF時間と同時実行しない。

## 5. 原本封入、独立verify、再取得

```sh
python3 scripts/acceptance/pack_evidence.py --source "$FORMAL_ROOT" --output "$PACKAGE_ROOT" --format formal --label formal-final-attempt01
python3 scripts/acceptance/execute.py --workdir "$CANDIDATE_ROOT" --receipt "$RECORD_ROOT/independent-formal-verify" -- python3 scripts/check_phase3.py --evidence "$PACKAGE_ROOT"
python3 scripts/acceptance/seal_candidate.py --verify "$FORMAL_ROOT/candidate.json"
```

`verify_bundle.py`はCLIではない。後続checkは上記`check_phase3.py --evidence DIR`から呼ぶ。sequenceの原順序/全実終了/実argv・cwd/driver限定変換/時間区間、source/tree/dist/helperの実bytes、raw SHAと独立数値、113復元と同全量異常系、全ZIP member/CRCを再検査する。

formal ZIPは既存の95MiB未満制約を保持する。超過した場合は失敗output・全raw/native/source/dist/helper・失敗試行を保存し、証拠を削減しない。既存`--format delivery`は4MiB分割の輸送形式だが、formal checkerが直接受ける形式ではない。別途輸送/checker互換をレビューし、全partと再結合全体・全memberのbytes/SHA一致を証明するまで正式束の検証完了にしない。

3Cは候補と別の証拠checkoutへ説明/manifestを追加する。tested product commit/tree/build/配信bytes、証拠commit、CI実checkout/PR head/run/attemptを別々に記録する。空の別領域へ提出物を再取得し、各ZIP・各member/CRC/bytes/SHA、source/dist/helper/raw/native/失敗試行を独立照合する。CIの各engine/集約ZIPも全memberを照合する。116/464の実結果は原文・独立期待・実観測を読んでから別の正式判定成果へ結び、件数/旧94・22/CI成功から自動昇格しない。元check_release.pyの9gateと外部BLOCKEDを維持する。

## 6. 中断・失敗時の判断

| 現在の状態 | 次の一操作 |
| --- | --- |
| PIDが生存、exit.jsonなし、step running | 元wrapper/childの実終了を確認する。二重起動・receipt書換え・別candidateの作成で成功へ移さない |
| プロセス不明/消滅、終了receipt欠損、running行だけ残る | 当該attemptは未成立の原本として保持する。記録をcompletedへ編集しない。同じclean候補でも新outputで必要な正式5実行をやり直す |
| step間で中断。先行行はcanonical順のcompletedだけで実終了/cleanupあり、後続directory/rowは存在しない | 同じHEAD/build/dist/fixture/bindingの前後seal・receiptを確認し、下記--onlyで**次の未実施stepだけ**継続する |
| failed行、数値不合格、別argv/fixture、raw/receiptの不一致 | 同じoutputのstepを上書きしない。失敗と原因を保持。再実行は新outputで正式一式を取得し直す |
| 修正でsource/tree/buildが変わった | 旧成功stepを移さず新候補・clean build・新seal・新outputで正式一式を実行 |

例：最初の2 stepだけが正常終了し、saves180以降が未着手の場合に限る。

```sh
python3 scripts/acceptance/seal_candidate.py --verify "$FORMAL_ROOT/candidate.json"
python3 scripts/acceptance/run_formal.py --output "$FORMAL_ROOT" --only saves180
python3 scripts/acceptance/run_formal.py --output "$FORMAL_ROOT" --only soak
python3 scripts/acceptance/run_formal.py --output "$FORMAL_ROOT" --only exceptions
```

既存outputへ引数なしで全体再開すると、最初の既記録stepで拒否される。既存runnerに--resumeや--bindingを足した架空の呼び方は使わない。継続中も各未実施stepの実exit・cleanup・sealを保存する。完走後は3節の原条件を再確認し、未実施の4節（補助原本・資源測定）→5節（独立verify・再取得）の順で実行する。

## 1D時点の未実行

clean最終F、原30/180・実7200/full113・同全量異常系、最終資源比較、正式束の生成/再取得、原116/464最終判定は未実行。1A baseline不足、原外部22件、AC-G02/CP04・旧C29/18宣言・CP15の別3条件も未解消。手順を用意したことは合格ではない。
