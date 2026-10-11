# AP01 証拠引渡しの実確認

G07の最終引渡しは **blocked**。C29の閉鎖証拠37分割・1,858,947,725 bytesと元MANIFEST.jsonを今回の新しい作業環境から取得できなかった。Gitにある過去候補の証拠とC29静的ビルドZIPは下記の範囲でbytesを照合した。製品受入の合格は追加しない。

入口は [AP01基準と統合](README.md)、全実結果・期待hash・未取得パス・再実行用検証コードは [handover.json](handover.json)。旧資料は変更していない。

## 固定した確認対象

| 項目 | 値 |
| --- | --- |
| 証拠checkout commit | `1ad3c928b9090ab8d9d96a6a8971c597216e3be2` |
| `docs/quality/current-review` Git subtree | `75bba321a4963f16a7c3c8a20e7b692efdb03dbe` |
| bytes確認終了 | `2026-10-11T06:32:41.799067+00:00` |
| 環境 | 新規 `/workspace/shinariokanri` checkout、Linux、Python 3。詳細はJSON |
| C29歴史製品commit | `09d39faae9c7293fe77b5675cc7286605a1809a6` |
| C29歴史製品tree/build | `352863bf81bd56b3c563f76e6b7586fe5f471e24` / `b59572f71d050cd96e0f` |

このcheckoutのhashは証拠取得の対象を識別する。現在の製品候補の実検査対象は [integration.json](integration.json) で別に固定する。歴史製品の成功を新候補へ移さない。

## C29完全packetの取得不足

原記録は [DELIVERY.json](../current-review/evidence/rb10-candidate/candidate-29-final-actual-results-1/DELIVERY.json) と [歴史引渡し説明](../current-review/evidence/rb10-candidate/candidate-29-final-actual-results-1/README.md)。`availability` は `workspace_artifact_only_not_published_by_this_git_commit` で、GitHubから取得できる全binaryとしては宣言されていない。

| 対象 | 原記録 | 今回の実確認 |
| --- | --- | --- |
| 37分割 | `evidence.tar.gz.part-01`〜`part-37` | 記載の一時保存先・Git証拠フォルダーとも0/37存在。全期待size/hashはJSONへ保持 |
| 結合archive | 1,858,947,725 bytes、SHA256 `360324fda32771ed6979e354e9292c91ab4bc39cdbacc747d2e3ce0606b4cfe0` | 未取得、未照合 |
| 元MANIFEST | SHA256 `a3ae9550d925b2f04ef6d2723717816d5d4ff31f686005df395d5a2ed52235bc` | 記載の保存先に存在しない |
| 元論理ファイル | 67,646件、9,962 unique blobs、7,160,853,552 logical bytes | 元台帳と全blob未取得。metadataから存在・成功を推定しない |
| 一時保存先 | `/tmp/shinariokanri-c29-closed-evidence-packet-1` | directoryなし。`/tmp`・`/workspace`のclosed-evidence名も存在しない |
| 移送記録 | `/tmp/shinariokanri-c29-closed-evidence-relocation-1.json`、SHA256 `ab7fabc7060d680cb489057db0b76f900e0dc4b460288abd2e53fc5b0c71b51e` | 未取得 |
| 恒久取得URL・保存期間 | 指定なし | 不明。GitやCIの別packetを代用品へ昇格しない |

保存された `verification-PROCEDURE.py`・stdout・stderrの3ファイルは `verification-EXECUTION.json` のhash/sizeと一致した。stdoutは2026-10-10の1.86GB検証成功を記録するが、今回37partを再検証した結果ではない。捕捉手順は実行していない。

## Gitから取得できたbytes

50個の `MANIFEST.json` を読んだ。直接取得した440宣言行はsize/SHA256一致、別に3個のC29検証記録を照合した。重複宣言をまとめた実ファイルは429個・1,321,247,497 bytes。hash/size不一致は0件。直接展開されていない1,374宣言行も、既存tar内の対応memberでsize/hash一致を確認した。

8個のcontent-addressed packetは19part・計685,577,992 archive bytesについて、分割・結合SHA256、全7,025 blob参照と内蔵台帳を照合した。件数・bytesはpacket間の重複を除いた全体数ではない。

| packet | archive bytes | 論理ファイル行 | 今回の結果 |
| --- | ---: | ---: | --- |
| C19 text-validation / C18 final | 100,669,168 | 5,281 | bytes・logical map一致 |
| C20 Unicode / C19 final | 103,198,578 | 4,485 | bytes・logical map一致 |
| C21 private-read / C20 final | 114,624,534 | 6,343 | bytes・logical map一致 |
| C21 public-body preparation | 5,147,034 | 2,603 | bytes・logical map一致 |
| C22 import-copy / C21 failed-normal | 30,839,577 | 3,831 | bytes・logical map一致 |
| C23 note-harness / C22 failed-normal | 81,247,163 | 1,235 | bytes・logical map一致 |
| C24 navigation-readiness / C23 failed-normal | 90,328,753 | 1,935 | container/blob一致、logical map失敗 |
| C25 responsive-recovery / C24 actual-results | 159,523,185 | 6,977 | bytes・logical map一致 |

C24には `actual-metadata-and-procedures/RETENTION.json` が異なる2版で同じlogical pathに登録されている。1,935行に対して一意パスは1,934。既存 `verify_candidate_evidence.py` の実行もexit 1、`ValueError: Duplicate logical evidence path`となった。bytesが一致していても一意な復元先を保証できないため、復元可能なpacketの成功にしない。旧2版とpacketを保持し、取得元へ由来を確認して、必要なら別名対応を明示した新しい補足台帳を作る。

[C29静的ビルドZIP](../current-review/evidence/rb10-candidate/candidate-29-physical-review-package-1/MANIFEST.json) は1,039,348 bytes、SHA256 `590748c12808f0e8a49d315aa3deddfc52e2f08e6c617a4d9fd1f26c64b0e0ab`と一致し、22memberのCRCを読み直した。これはC29製品の配布用歴史artifactで、閉鎖証拠packet、実端末検査、公開許可を代替しない。

このZIPを含む34個の既存tar/ZIPを読み、3,387件の宣言member hashを照合した。`working-cold-allocation` の2個の旧MANIFESTについて、各16件・計32件のartifactは指定相対パスでも検査したarchive内でも対応を取得できなかった。全不足パスと期待hashはJSONへ保存した。後続packet内にコピーがある可能性を、由来の対応が未確認のまま取得済みへ換算しない。

4個の旧split-tar群は個々の宣言part/fileのhash検査までとした。元tarの完全再構築・復元手順は今回実行していない。50MANIFESTに宣言されていない証拠、歴史的な外部一時raw-log、証拠subtree全体の全bytesを再照合したとは記録しない。

## 再取得と復帰

Git収録分の取得元は `https://github.com/chameleonjp-lab/shinariokanri` の上記固定commit。別環境でそのcommitを一度checkoutし、証拠subtree hashと必要なMANIFESTを確認する。branch名や最新mainだけを取得対象にしない。Git収録分の明示的な保存期間保証は不明。

検証は読み取りだけで行える。[handover.json](handover.json) の `verificationProcedure.source` は今回使った検証コードで、SHA256は `6a45b4fd926a9f75306f92fef8407121a69dbd4b4c3c1c19f0f448ae5d227888`。以下は新しい一時ファイルへコードを取り出し、hash確認後に実行する手順。捕捉されたアプリ・テスト・SQL・Shellコードは実行しない。

```sh
python3 - <<'PY'
import hashlib, json, pathlib
record = json.loads(pathlib.Path('docs/quality/ap01-2026-10-11/handover.json').read_text())
procedure = record['verificationProcedure']
source = procedure['source'].encode()
assert hashlib.sha256(source).hexdigest() == procedure['sourceSHA256']
path = pathlib.Path('/tmp/ap01-handover-recheck.py')
with path.open('xb') as output:
    output.write(source)
PY
python3 /tmp/ap01-handover-recheck.py "$PWD" --output /tmp/ap01-handover-recheck.json
```

検証はtarをstreamで読み、巨大binaryを複製・展開しない。既に一時出力先がある場合は別の新しい名前を使う。記録日時・ローカルパスは環境ごとに変わるため、比較対象は入力hash・件数・不足・実結果。

C29完全packetは元作業環境の保管者から37part・元MANIFEST・移送記録を変更せず再取得し、認められた保管先のURL、閲覧権限、保存期間を記録する。入手時は `DELIVERY.json` の各hash、元MANIFEST hash、対象C29 commit/tree/build/bindingを先に照合し、その後に既存verifierで全blobをstream検査する。一時パスだけを再掲してG07を閉じない。取得不能ならG07 blockedを維持し、失われた元実行の全証拠を別候補の局所結果から再構成しない。

AC-G07-Nは最終packetの取得不足でblocked、AC-G07-Eの製品受入手順はnot_run。元104要件・116受入・24工程・6回帰群と公開gateは変更しない。
