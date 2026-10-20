# 3C：空領域への実再取得・独立照合

**準備資料と履歴証拠の再取得完了。最終Fの正式証拠再取得はBLOCKED。** 取得元は#83ユーザーmerge後main `006333705a7e556fa0e54f1054df6b2910053cde` / tree `a8709a2202a22380bdc323607f753c8520ae7174`。GitHubのtree一覧（truncated=false、14069 entries）を固定し、最初は空だった `/workspace/3c-reacquired-0063337` へ別cloneでcommitを取得し、各実ファイルをcommit指定のraw URLから実downloadした。作業checkoutのファイル・Git object cache・整形JSONのコピーは使用していない。

実取得期間 2026-10-20 09:56:06〜09:57:07 UTC、150ファイル / 36613017 bytes。全150件の実bytes・Git blobを取得元treeへ照合し、全73固定入力をimmutable contract-lockのbytes/Git blobにも照合した。SHA-256は末尾の受領台帳に保存する。52 source候補は資料のbytesを確認したもので、現在の実行coverageは未評価。

## 実行と途中失敗

| 実コマンド／操作 | exit / 実結果 | 有効範囲 |
| --- | --- | --- |
| `git clone --filter=blob:none --depth 1 --no-checkout --branch main https://github.com/chameleonjp-lab/shinariokanri.git /workspace/3c-reacquired-0063337` | 0、HEADは上記main | 別取得先のcommit。製品buildなし |
| `python3 /tmp/3c-reacquire.py` | 0、初回149件/36607747 bytes | 下記再現コードの取得処理。外部条件表の欠落を次行で検出 |
| 初回 `python3 scripts/check_stage1_traceability.py` | 1、`EXTERNAL_CASES.md` 未取得 | 検査器は変更せず失敗を保持 |
| 不足1原本を同一commitのraw URLで追加取得 | curl exit0、5270 bytes / blob `a497abb1456ef703acf48af3a1ca4f48692cccb4` | 修正版の再現入力は初めから150件を指定 |
| 再取得先で `python3 scripts/check_stage1_traceability.py` | 0、104/116/464/24/6/68、lockedInputs73、sourceCandidates52 | `currentSourceCoverage=not_assessed` / `formalAcceptance=not_assessed` / `releaseDecision=RELEASE BLOCKED` |
| 再取得先で `python3 scripts/check_release.py` | 1、`RELEASE BLOCKED`、`release-evidence.jsonがありません。完成版の公開は保留です。` | 原checkerを実行。入口manifest欠如で戻るため9個別gateは今回個別評価されていない |
| `python3 /tmp/3c-audit-archives.py` | 0、全outer member＋1B nested member/CRC/bytes/SHA・歴史Git source proof照合 | 下記再現コード。ブラウザー再実行やF受入ではない |

通常checkoutの初回cloneは既定sandboxのproxy接続でexit128。ネットワーク有効化後の全blob cloneは約1.5GiB取得途中で停止し、別pathのpartial cloneで開始mainを固定した。未完cloneを候補checkout・正式試行と扱わない。元の検査器、原fixture、時間条件を変更していない。文書/原本の静的照合だけを行い、Cloudで製品依存導入・build・browser実行・正式/資源測定をしていない。

## 上位の履歴証拠結合（正式manifestではない）

| 履歴包 | 実bytes / SHA-256 | 全member | 内側manifest SHA-256 |
| --- | --- | --- | --- |
| [1B原包](../1B/supplement-evidence.zip) / [各memberのbytes・SHA](../1B/supplement-evidence-manifest.json) | 17750581 / `7b1a29cd32875e2cb206666b5bf81511216578baf1190360ae407f63ec73babf` | 260、CRC/bytes/SHA全件一致 | `f05f76a7c32a146262436f866b656f027095f794bfbed5cc7135d2a021ee506b` |
| [1C原包](../1C/local-evidence.zip) / [各memberのbytes・SHA](../1C/local-evidence-manifest.json) | 8737659 / `aa19943be164f3a0dbd910f5edbe3b8006e69eba9d7d1f78819cc165647ca368` | 775、CRC/bytes/SHA全件一致 | `6078cb6d15a793f3f5b3662d8bfc2dbf5e05d461b654ecf05b56a9c16485a70b` |

outerの各memberは、既存外側inventoryの全行と内側MANIFEST.jsonそのものを照合した。全path集合・重複なし・全CRC・実展開bytes・SHAを確認し、内外inventoryの一致も確認した。原本/失敗試行の削除や再整形をしていない。

| 1B nested ZIP | 元commit / tree / build | member / 実bytes / SHA-256 |
| --- | --- | --- |
| `local/candidate.zip` | `d291579f6d4620f86588096739d3e720f41d6563` / `bf23dde4209a68def2ab280c549bf97616da15ae` / `82225937364aa23d1c73` | 689 / 5071270 / `9f21a50a7fe641949dc8c11f6b86b587125f3be31ef0f183aff65babd616dbbf` |
| `local/candidate2.zip` | `db2874852e958e63261876d0cb5477ee4cc5a6d4` / `f7f24d96f84765f0a664396b350dac2c202997d7` / `16a47445cc54b018cf19` | 689 / 5071642 / `41fe61f0942c25603e826e4288a3b54ed89598f3c9ed1a8f9c64968218095aee` |

nested ZIPはbindingのsource_files / artifact_files / original_documents / generated_runtimeの全inventoryを重複整合付きで結合し、全memberのCRC/bytes/SHAを確認した。取得した原 `verify_snapshot` を、nestedから別の歴史専用directoryへ抽出した全bytesに対して実行し、commit/treeのGit proof・全source・dist build-info・73原契約の一致を確認した。これはその歴史候補自身の証明であり、現在mainや未固定Fとの一致判定ではない。

1Bの2実download原本は `local/supplements-attempt2/n05/downloads/1.json` と `2.json`。各32013522 bytes / SHA-256 `b42e5e7e429a96558a13f80cad68d6debe28b33a38085e9f29b1b27ea40a34bb`。保持eventsのevent番号1/2・別URL・別savedPath・completed・trial/bindingと各実原本bytesを確認した。今回新たなブラウザーdownloadを2回発生させたという意味ではない。1Bの原11反例と初回失敗、1Cの失敗試行/dirty dist/実nativeも全member照合に含むが、反例・制作導線を今回再実行したとは扱わない。

1Cはdirty=true・commit/tree unknownの開発試行を保持する包であり、1Bのclean sealと結合して同一候補にしない。正式F用source/dist/helper/raw/native/失敗attemptは未取得。CI各engine/集約ZIPはFに結び付く一式がなく今回全member独立監査未実行。現在mainの進行中CIや過去PRのjob successだけで代替しない。

両既存包は各95MiB未満。新しいformal包は未作成なので、正式輸送完了・容量制約をクリアしたとは判定しない。将来95MiB以上なら全証拠を維持し、`pack_evidence.py` のformal拒否を変更せず、delivery輸送/再結合/checker互換を別レビューする。`index_report.py` の索引作成、`pack_evidence.py` での正式封入、`check_phase3.py --evidence DIR` 経由のformal `verify_bundle` はF原本なしで未実行。

## 再現方法

以下のコードは今回使用した取得/静的照合手順の再掲。repoのrunner・workflow・検査器を追加/変更するものではない。未使用pathへ別cloneし、取得元のHEADが固定SHAと異なれば停止する。再取得先と元作業checkoutの役割はコード内で明示する。通常の許可済み作業環境で使用する。

取得（初回の欠落修正を反映済み）：

```python
import concurrent.futures
import datetime
import hashlib
import json
from pathlib import Path
import subprocess
from urllib.parse import quote

SHA = '006333705a7e556fa0e54f1054df6b2910053cde'
ROOT = Path('/workspace/3c-reacquired-0063337')
LOCAL = Path('/workspace/shinariokanri-3c')
OUT = Path('/tmp/3c-reacquisition-results.json')
trace = json.loads((LOCAL/'docs/acceptance/phase3/TRACEABILITY.json').read_bytes())
tree = json.loads(Path('/tmp/3c-start-tree.json').read_bytes())
assert tree['sha'] == 'a8709a2202a22380bdc323607f753c8520ae7174' and not tree['truncated']
index = {r['path']: r for r in tree['tree'] if r['type'] == 'blob'}
paths = {r['path'] for r in trace['locked_inputs'] + trace['source_inventory']}
paths.update({
    'AGENTS.md', 'docs/acceptance/phase3/TRACEABILITY.json',
    'docs/optimization/phase1/contract-lock.json',
    'docs/quality/pr49-followup-2026-10-15/EXTERNAL_CASES.md',
    'docs/optimization/phase1/evidence/candidate-standard30.json',
    'docs/optimization/phase1/evidence/candidate-large30.json',
    'tests/fixtures/rb10-large-analysis/original-large-long-branch.scenario',
    'scripts/check_docs.py', 'scripts/check_phase1.py', 'scripts/check_phase3.py',
    'scripts/check_stage1_traceability.py', 'scripts/check_release.py',
    'docs/implementation/codex-next-stages-2026-10-19/evidence/1B/supplement-evidence.zip',
    'docs/implementation/codex-next-stages-2026-10-19/evidence/1B/supplement-evidence-manifest.json',
    'docs/implementation/codex-next-stages-2026-10-19/evidence/1C/local-evidence.zip',
    'docs/implementation/codex-next-stages-2026-10-19/evidence/1C/local-evidence-manifest.json',
})
paths.update(r['path'] for r in tree['tree'] if r['type'] == 'blob' and r['path'].startswith('scripts/acceptance/') and r['path'].endswith('.py'))
assert subprocess.check_output(['git', 'rev-parse', 'HEAD'], cwd=ROOT, text=True).strip() == SHA
assert not any((ROOT/p).exists() for p in paths), 'Acquisition destination must contain no reused files'

def acquire(path):
    target = ROOT/path
    target.parent.mkdir(parents=True, exist_ok=True)
    url = 'https://raw.githubusercontent.com/chameleonjp-lab/shinariokanri/'+SHA+'/'+quote(path, safe='/')
    start = datetime.datetime.now(datetime.timezone.utc).isoformat()
    result = subprocess.run(['curl', '--fail', '--silent', '--show-error', '--location', '--max-time', '60', '--retry', '0', '--output', str(target), url], capture_output=True)
    assert result.returncode == 0, (path, result.returncode, result.stderr.decode())
    data = target.read_bytes()
    blob = hashlib.sha1(b'blob '+str(len(data)).encode()+b'\0'+data).hexdigest()
    assert len(data) == index[path]['size'] and blob == index[path]['sha'], path
    return dict(path=path, bytes=len(data), gitBlob=blob, sha256=hashlib.sha256(data).hexdigest(), url=url, startedAt=start, finishedAt=datetime.datetime.now(datetime.timezone.utc).isoformat(), exit=0)

with concurrent.futures.ThreadPoolExecutor(max_workers=4) as pool:
    rows = list(pool.map(acquire, sorted(paths)))
for row in trace['locked_inputs']:
    actual = next(r for r in rows if r['path'] == row['path'])
    assert actual['bytes'] == row['bytes'] and actual['gitBlob'] == row['gitBlob']
summary = dict(source=SHA, tree=tree['sha'], root=str(ROOT), files=rows, filesCount=len(rows), bytes=sum(r['bytes'] for r in rows), lockedInputsVerified=len(trace['locked_inputs']))
OUT.write_text(json.dumps(summary, ensure_ascii=False, indent=2)+'\n')
print(json.dumps({k:v for k,v in summary.items() if k != 'files'}))
```

全archiveの独立照合（初回実行用。歴史専用抽出directoryの再利用を拒否）：

```python
import hashlib
import io
import json
from pathlib import Path
import subprocess
import sys
import zipfile

root = Path('/workspace/3c-reacquired-0063337')
sys.path.insert(0, str(root/'scripts'))
from check_phase3 import verify_archive
from acceptance.snapshot import verify_snapshot

sha = lambda b: hashlib.sha256(b).hexdigest()
results = []
for label, base in [('1B', 'supplement-evidence'), ('1C', 'local-evidence')]:
    folder = root/'docs/implementation/codex-next-stages-2026-10-19/evidence'/label
    meta = json.loads((folder/(base+'-manifest.json')).read_bytes())
    payload = (folder/(base+'.zip')).read_bytes()
    assert len(payload) == meta['archive']['bytes'] and sha(payload) == meta['archive']['sha256']
    with zipfile.ZipFile(io.BytesIO(payload)) as archive:
        manifest = archive.read('MANIFEST.json')
    assert sha(manifest) == meta['manifestSHA256']
    inner = json.loads(manifest)
    assert inner['files'] == meta['files']
    rows = meta['files'] + [dict(path='MANIFEST.json', bytes=len(manifest), sha256=sha(manifest))]
    actual = verify_archive(payload, rows)
    assert len(actual) == meta['verifiedMembers']
    result = dict(label=label, archiveBytes=len(payload), archiveSHA256=sha(payload), manifestSHA256=sha(manifest), members=len(actual), allMemberCRCBytesSHA='passed', nested=[])
    if label == '1B':
        for name in ('candidate', 'candidate2'):
            binding = json.loads(actual['local/'+name+'.json'])
            descriptors = binding['source_files']+binding['artifact_files']+binding['original_documents']+[binding['generated_runtime']]
            records = {}
            for row in descriptors:
                assert row['path'] not in records or records[row['path']] == row
                records[row['path']] = row
            data = actual['local/'+name+'.zip']
            files = verify_archive(data, list(records.values()))
            target = root/('historical-1b-'+name)
            target.mkdir(exist_ok=False)
            for path, content in files.items():
                dest = target/path
                dest.parent.mkdir(parents=True, exist_ok=True)
                dest.write_bytes(content)
            lock = 'docs/optimization/phase1/contract-lock.json'
            dest = target/lock
            if not dest.exists():
                dest.parent.mkdir(parents=True, exist_ok=True)
                dest.write_bytes((root/lock).read_bytes())
            proof = verify_snapshot(binding, data, target)
            assert set(proof) == set(files)
            result['nested'].append(dict(path='local/'+name+'.zip', bytes=len(data), sha256=sha(data), members=len(files), commit=binding['commit'], tree=binding['tree'], build=binding['build_info']['version'], allMemberCRCBytesSHA='passed', historicalGitSourceProof='passed'))
        events = json.loads(actual['local/supplements-attempt2/n05/events.json'])
        assert len(events['events']) == 2 and [r['event'] for r in events['events']] == [1, 2]
        assert len({r['savedPath'] for r in events['events']}) == 2
        assert len({r['url'] for r in events['events']}) == 2
        for r in events['events']:
            data = actual['local/supplements-attempt2/n05/'+r['path']]
            assert len(data) == r['bytes'] == 32013522 and sha(data) == r['sha256'] and r['completed']
            assert r['candidate'] == events['candidate'] and r['bindingSHA256'] == events['bindingSHA256']
        result['n05RetainedEvents'] = [dict(event=r['event'],path=r['path'],bytes=r['bytes'],sha256=r['sha256']) for r in events['events']]
        result['n05Scope'] = 'Retained historical two-event originals only; no fresh browser download or final-candidate acceptance'
        probe = json.loads(actual['local/actual-eleven-probe/probe.json'])
        result['retainedCounterexamples'] = len(probe['cases'])
    else:
        result['scope'] = 'Historical dirty development candidate; no clean final-candidate seal or fresh execution'
    results.append(result)
Path('/tmp/3c-archive-audit.json').write_text(json.dumps(results, ensure_ascii=False, indent=2)+'\n')
print(json.dumps(results, ensure_ascii=False))
```

取得元treeは `gh api "repos/chameleonjp-lab/shinariokanri/git/trees/a8709a2202a22380bdc323607f753c8520ae7174?recursive=1" > /tmp/3c-start-tree.json` で取得する。取得コードのLOCALは指定mainの読取checkout、ROOTは新しい空領域からの別cloneで、OUTと一時script名も未使用pathを選ぶ。上記実pathを同じ内容で新規作成するか、path定数だけ対応する新取得先へ変えて実行する。既存のoriginal helper/sourceの内容・argv・判定条件は変えない。

## 実取得した150ファイルの受領台帳

全行の取得URLは `https://raw.githubusercontent.com/chameleonjp-lab/shinariokanri/006333705a7e556fa0e54f1054df6b2910053cde/<path>`、curl実exit0。Git blobは別取得した開始treeと一致し、73固定原本はcontract-lockとも一致した。次のSHAは今回の実bytesに対するSHA-256。生ログや原包を新規公開添付していない。

| path | 実bytes | Git blob | SHA-256 |
| --- | --- | --- | --- |
| `AGENTS.md` | 2251 | `0920e85a1de4a5fc6658f7caf776f1f09efbc4c8` | `7406213de86d39abb5549a7e6da58e0cf6f9a2659403d384f26b87bd3e9fdecf` |
| `docs/acceptance/phase3/TRACEABILITY.json` | 1785851 | `9fc2823df8c76202538594c4da6988307cbfd178` | `2c7adc4445ef1fce122939c7f2327c2845d6e3eee306a431ad432a781c031a0d` |
| `docs/acceptance/phase3/VERIFICATION.md` | 69335 | `7753a030e191ee883444692d1c81981f31b1e77b` | `ead0d0bcdbf40c537de83981aed392e8e44aee1b9368bfe8ccbe9c62edd08f59` |
| `docs/completion-replan-2026-10-12/ACCEPTANCE.md` | 12554 | `c69a697d0c0e55fe224077785cc20d61c30cbb32` | `fba44aedd4e0b3c8cce4fb8df410f06ea831d32ec989a65e03058534a653638e` |
| `docs/completion-replan-2026-10-12/AUDIT.md` | 25555 | `968a10aedee422af6d7719ff8ac69bce9838709c` | `b555e7f83a9f279b7b402deda3b04e1fdf1fa5d3edb42e6281b0b2bdc76b7586` |
| `docs/completion-replan-2026-10-12/CODEX_REQUEST.md` | 4236 | `1e68a67114896ba6d6abfbb2854eecdef8d2dd8b` | `9cccb1381851ec7f6eafab9fef0b95efefd93220be31bc0e36c7c8c5041ba06b` |
| `docs/completion-replan-2026-10-12/IMPLEMENTATION_PLAN.md` | 38951 | `bc3f300d9a70f9a1b6daa1db002476107dc971bb` | `6b66fd513cb0136b48b027a52a352e9a5a23b012f09545b08cc0e0969741360d` |
| `docs/completion-replan-2026-10-12/README.md` | 1908 | `d2a043db42dc4ceeb6cbd01773b93bb6a7614fa9` | `f4c193b2d6674a7cff27c407e51df9b1e7c8dc284ba633b828b961971cfd5461` |
| `docs/completion-replan-2026-10-12/VALIDATION.md` | 2242 | `4980862e7d666f8ac7315aa3d3ce66db9c4ade03` | `17254f5d4a1b92970838bdbf338b9c3805c0619bbc5a7a79d40f5bb8f5d7193b` |
| `docs/completion-replan-2026-10-12/acceptance_plan.json` | 459591 | `a97a1955f8728fc5537759d27c16b55265bf1a39` | `8edc0295ed7484191ad13768acfdde039de5fd103a162f5ff694ec45131f1869` |
| `docs/completion-replan-2026-10-12/gap_updates.json` | 40354 | `4e5a9cdfac11b3d20b2a1c182452d4b5ac17145e` | `58e703d66bfa610bf3f987c5d0a4278502043503bc1cc668151b1eb7e1c7d4f7` |
| `docs/completion-replan-2026-10-12/implementation_plan.json` | 69120 | `08a3c2daf217a52cf3c11a9c044f7ca14bdd0153` | `ca13be4deea9ff868f626470cfcd7a68eea60f79cb71668b9f5e1eb3bc242754` |
| `docs/completion-replan-2026-10-12/manifest.json` | 76943 | `71710e6e74aa6315a79d0ab4e5b339246598ee5e` | `2c198fcefaa1f9aaafc19a941ea1caabcb24d3a5237fbc3a83023d21864c8047` |
| `docs/completion-replan-2026-10-12/remote_observations.json` | 4390 | `5196f24dc4907fb91e6491ee9f87e1d31c3f244c` | `4dc7a8adf7bb9a9b73fcab6d052768d46f80125b743c5901234765737e48ba09` |
| `docs/completion-replan-2026-10-12/requirements_comparison.json` | 176148 | `e40019d008ea3926efe3e39c5f492c514aff21a1` | `a483d5feab1791b5fb5811c644123ad9c099e1d18cf85c2adc867cae6249cbee` |
| `docs/completion-replan-2026-10-12/validate.py` | 9475 | `1e8bd9d4792bdf2c06a41b223f4f1f4f3745d99f` | `4f578b7d572f151c8ae4304202a78dc4d6a832a51e21cf42ae3fcb6939dab554` |
| `docs/data/acceptance_cases.json` | 64743 | `4505bc7b59f4574edc11b3bbf2bafb4f201866ed` | `e1e4b06a3bb1cd79fc590239ab6350103323335f2e1ee87a2e6a283755834c4f` |
| `docs/data/completion_acceptance.json` | 139849 | `014dbfe0011b00454df34ddc21fdac975585a89a` | `f0d955342d5c130705481a751a0d84b2487c456ce4d7aea3f1aa169d37c6a18f` |
| `docs/data/completion_plan.json` | 39757 | `e4fb6ec5da4b3af2557852edc3c2d102ea18b919` | `c493dfb16c842c146e01da59a6addd7b85a87dbeb327b911abf2b9d21e34a253` |
| `docs/data/completion_tasks.json` | 175457 | `8e2ad85ef5bcfaa98735b7b5f751a77fbb916f33` | `e360be8f38ea890cd33643342ee5940b54e61bd8bfd99ad2b953e4089895449a` |
| `docs/data/feature_catalog.json` | 37478 | `2462cf4be1c739344aafd59aa6b0cf684ecd7cdd` | `26329264e32501ce8b3c12b4e897646df786e8b7620c124d8ae9a5d70089ddef` |
| `docs/data/requirements.json` | 76029 | `116895254fd47ff78acd00433e637232f4010ac8` | `df11649ab7ec25c31ae2aad6aacdca98d7324aba2e701352f9a78136c3bed0dc` |
| `docs/data/work_packages.json` | 21316 | `6c57b2387b468ee141b90b2b87737a4364ba5a2b` | `8125d35075c856c1e267b9c48a3ba610a632e60ac7d498dba32f5759a4fda95f` |
| `docs/implementation/codex-next-stages-2026-10-19/evidence/1B/supplement-evidence-manifest.json` | 58467 | `0054dfd5bf7e7fbddf8526eaec7b4e0840f29f0d` | `b7892fb6edc47aa1de026b8dd2e5655902225c4c6b145ce028f5155f09522226` |
| `docs/implementation/codex-next-stages-2026-10-19/evidence/1B/supplement-evidence.zip` | 17750581 | `0411c0b9e47996034aaba1b28018a23d17efdd27` | `7b1a29cd32875e2cb206666b5bf81511216578baf1190360ae407f63ec73babf` |
| `docs/implementation/codex-next-stages-2026-10-19/evidence/1C/local-evidence-manifest.json` | 139045 | `6e84b1410ac507179dc0dddc2cfc688488c177fa` | `2c4b770daa65134d257f8d705aeb717327846ff4497b0e7d618aaad049ee757f` |
| `docs/implementation/codex-next-stages-2026-10-19/evidence/1C/local-evidence.zip` | 8737659 | `1d720b3557e2da7b7d37d5b1fcfb2a3e97de3823` | `aa19943be164f3a0dbd910f5edbe3b8006e69eba9d7d1f78819cc165647ca368` |
| `docs/implementation/codex-three-phase-2026-10-17/PHASE_1_AUDIT_AND_DESIGN.md` | 7446 | `62148b7f560255927b18fa9439bb2f8a3b8eea0e` | `af7390fd9f96f220423e723972d87fd685e4643663af59f856652da8c1daa7bd` |
| `docs/implementation/codex-three-phase-2026-10-17/PHASE_2_OPTIMIZATION.md` | 7869 | `b3545a52957aca83d8a119c645d5527e5bbd6636` | `9667d06d7e3d6abb80e2b7a25bb7da870eb6bf394d860459f5064ed7ffd11ac1` |
| `docs/implementation/codex-three-phase-2026-10-17/PHASE_3_ACCEPTANCE.md` | 8176 | `37bfac1ac3c1542d0cf6fcf754e97e85b1a886a9` | `aada561e3c548846690179d1a585d3193e7a260a1b4f170127e36912111e52d6` |
| `docs/implementation/codex-three-phase-2026-10-17/PLAN_ALL_STAGES.md` | 16630 | `15d4208632466183584705b57f6580db5e19f7fd` | `21c75983e8127cee1b9c9febfc96c79bff2216b23caa8ad29df997746d2105e2` |
| `docs/implementation/codex-three-phase-2026-10-17/README.md` | 4270 | `a619359a7c9425204bb57a24f54a2bf91aedd7e7` | `4b1f6f8a07f590869698c3e390f1da9b5e47bd178637d349d349e1724cf95d4c` |
| `docs/implementation/codex-three-phase-2026-10-17/TRACEABILITY.md` | 7299 | `f5b5027e781b73f5b6a5dfd343e76dfe9391f5ff` | `dcfb05f28d5886aa03ed571b9d8bcf247a57aa7679d2df8bc147bd912eaa5898` |
| `docs/optimization/phase1/contract-lock.json` | 11883 | `b1f2edd7b491e5d99a1d908466a644a4d5d07faa` | `154001995722317c635366d082d1fefbd93b1b2cfd601804914d879ef4810001` |
| `docs/optimization/phase1/evidence/candidate-large30.json` | 314322 | `b7a015e5e2e0452d5580c83bcb5613a26d70f4d3` | `d43e30a67238a920b72973a6e936fae0cf00802fd8ffde14559e7a00b1b67f66` |
| `docs/optimization/phase1/evidence/candidate-standard30.json` | 317715 | `4039e887fd9b61929d35668e6d9bdd9244ba10d9` | `31bbe08bcbf137bff3cd47c2ecb5e5e2ba893a700b1889eb721d2b29a46e8f24` |
| `docs/plan/COMPLETION_ACCEPTANCE.md` | 22299 | `460848b79335c481acc7af7446949de33645f34a` | `216155e42bf66396f6ad2a81865682ea17e8e5edf69a7ca3f490194ca0b46c0d` |
| `docs/plan/COMPLETION_PLAN.md` | 33564 | `eb77f500a1b33cd10f70817004ac0159a8db3434` | `85c02db58502862720f8cecf9122ddb6c449123d88be74a6be26b2e2154c7a55` |
| `docs/plan/COMPLETION_TASKS.md` | 117122 | `bc287034224a7878815be85562b8e41976615ea7` | `7a2256ce0cbc8af0452fb61ed9b8e7071b8c8cb80d73c8b0f52179d17fa6dabd` |
| `docs/plan/IMPLEMENTATION_PLAN.md` | 13663 | `d8929f25309c2af94cae9a85b288f8eec7a284c0` | `dae9fc9852361404d77475e4f155a3d0c08860c5fb903aa9c210db1901249a8d` |
| `docs/plan/TRACEABILITY.md` | 9869 | `4ac0d68d3cd1904925d560fa41d34d8043382d7d` | `b5e36e645bdea46a77ec07bbca8509974651e599da3b9bdbaf2ec58545aa00e4` |
| `docs/quality/pr49-followup-2026-10-15/CLAUSE_REVIEW.json` | 1161113 | `1610787757b3915d02adba866e26ef33781e1303` | `c0f7fd2a77391c0708c74c381c83c65f1d121f655cc2b175b422a4c4dfb693f4` |
| `docs/quality/pr49-followup-2026-10-15/EXTERNAL_CASES.md` | 5270 | `a497abb1456ef703acf48af3a1ca4f48692cccb4` | `8948290f8293e9d093d8d10a98364f620a6934464f5e5ef5de990fa8526576d2` |
| `docs/quality/pr49-followup-2026-10-15/REGRESSION_REVIEW.json` | 51258 | `5db2199cc0b8c0cec95eacab0d453564d3ee1414` | `647e830f7296a372db7e8ce13c8b7faef236400150271b296680368d65231482` |
| `docs/quality/pr49-followup-2026-10-15/SUPPLEMENTAL_REVIEW.json` | 126080 | `1f81bb467dda67b87da02ac76c674f2c9ac6f3ff` | `5335d45bd083d07bf3071283bc8771067cb14ce37d4fb3f8032b597642a3a062` |
| `docs/quality/pr49-followup-2026-10-15/WORK_PACKAGE_REVIEW.json` | 86398 | `6d6e6241fc9ff3f860dced95b6e4d708ab5f756e` | `80afe57a99ab015af55cec596a00706258e670cbf813c6d48f59f49f11667d23` |
| `docs/quality/pr49-followup-2026-10-15/evidence/local-formal-summary.json` | 13097 | `ae40a5286bb840784fa9298fcee4037b68b00265` | `1eee5adbf3a60a80985612144f1bb087328048cc7f769982424bb2f596cc83b5` |
| `docs/quality/pr49-followup-2026-10-15/release-evidence.json` | 65674 | `fd8ce396e91fd13823744aec21d58f07264a7967` | `849c68bc4fd5bc2e7a117f01e05f49b41425a4009f64b5325b08df8a99944f53` |
| `docs/spec/BEHAVIOR_CONTRACT.md` | 14157 | `3821e01ae1583852796b5d18d6b5ed7daa921882` | `685feaf6de80b9b424460d0ce9e422247d773053089232a9be8c993e33e42d5f` |
| `docs/spec/DATA_MODEL.md` | 24706 | `debff098fb41860cb8eb2b1dd7ff649948346132` | `1aa5a8a6ffebf354e4089164987de32fdd3cf81c342834f287dfbdb213f4b389` |
| `docs/spec/FILE_FORMAT.md` | 9097 | `592941af629869f1ed82cd6b2a33b8a22f1831f8` | `8301bfc044ce6d22e5b2ebd7afd24c67a0b5174353789a8ae4aac12927241386` |
| `docs/spec/NONFUNCTIONAL_REQUIREMENTS.md` | 5876 | `8deebe8e2b7e222407370433a28b085d77e0fbe6` | `b67a3ceafaf2bb897c1877bcd2c81670bfcc58dc2911043e1e61c67986a2c491` |
| `docs/spec/REQUIREMENTS.md` | 86731 | `de6c0499ac0ceb49c17508ac379dab04e1f4f233` | `60f305b028f31d0b553bec6d0d4940d76c6219748ac9696e6f90e6350f9b61cf` |
| `docs/spec/SYNC_SECURITY.md` | 9996 | `101218b98c01d48d972305d5163ade3d7419b154` | `fc91c8f866f5117aee82cc4df6ce3711315379f396c91ff6a6e056b97257a5ed` |
| `docs/spec/UI_UX.md` | 9237 | `d19d9c5a7c70e33be8f090212d486edc70e7f639` | `46be9bb0b4c131c7c3c8892432f967a8f2bd0a394ffde5c90aa508ec047fdea4` |
| `scripts/acceptance/execute.py` | 2548 | `c3ce0a815589515ed4400d5dd6d33dcbc87f02f4` | `db61c915be7743bcba0e328cf02d48cdcf65f06d578c4029b9ac258db5827a39` |
| `scripts/acceptance/index_report.py` | 6776 | `0a6a4f730408b4c5dca36221f9327e308a9ec453` | `9b4f60a350b83bacd05af506a89094294e4476b5d2a998b90bb9b749f6a9f0ec` |
| `scripts/acceptance/pack_evidence.py` | 2256 | `8cfbbf6d792cf0595c099c3eea3501811a42f429` | `466462eaaf93598d7b10c784366ce7ab71eafddd01ffcdcc929060a9b5b65c90` |
| `scripts/acceptance/procedures.py` | 3730 | `6bef738d2116f7ee6bb1b5dc6194fe1ad67f2465` | `31a084a476e962908d25a3bad76b26f786ebf55d5a86000f81e818c64562b528` |
| `scripts/acceptance/recover_historical.py` | 2269 | `039027f15fecae3cb18276f098cfab64676e796a` | `22bf53eebb076f89d63471626eba6d6936dd196205def3e70ea6aec09c353cdb` |
| `scripts/acceptance/run_formal.py` | 5172 | `154aaed6dbf0c810a6368f650634f12a02152edc` | `1a6fdf68a1aff9ae28c1ba18ebcd9eb1aced173b75e9e48c1681fd8b814bf676` |
| `scripts/acceptance/run_supplements.py` | 6305 | `cdb1f48dc8e040b3d34357b847873a71007ddd02` | `bb0316158668d42d0a398cf2a73fc523ef0498a6ea529ec697a917219ee7803a` |
| `scripts/acceptance/seal_candidate.py` | 4646 | `19a58986b373efcce899c469061ece0fb619c018` | `9c1a4dc96497eeb54d8c4bb343a42d5d814b8054475ccff9e3fdfb4a83f9ff95` |
| `scripts/acceptance/snapshot.py` | 4774 | `22faec2a5f6c11bcf9e2da01adf375e6f8e971f0` | `199f550798f59653e28c6a7d50a78ca63b7a07a7bb9f7e48e08f4505a06e169b` |
| `scripts/acceptance/verify_bundle.py` | 14012 | `ed0ac942d759806e8d15d5e16327472d43fdc35e` | `6dafdc52fedb83a32f2a10f1b4af335759b22112dcb9470fb58a16d27bdb10ea` |
| `scripts/acceptance/verify_supplements.py` | 29768 | `0d2860b7403b7e20d3832fdf4acb6fd2fd375f0b` | `17d154c15b8f283a3ee758a06b093600753250933dfdd1471b92ca1504991c6b` |
| `scripts/check_docs.py` | 15598 | `a06681d9f773e5cec3db0e49f06fad9adbc31ac3` | `4da15d99d2a8814c8fd2c8d1ce7222d630295a5e81e07daa28d5fd2c1b64b8dc` |
| `scripts/check_phase1.py` | 12239 | `3012f117d025c381e9ae6b379ed264b75d8c7164` | `a16889ec3ee0680e451770ee69ae203b408d28dd46a83e044c427a3031288d3a` |
| `scripts/check_phase3.py` | 19497 | `f000bdd6b85f387576c5cf2676a068a746538820` | `ece979516671d2212bee3d8ad2687711c72c6c3099a386ab1561c35d2419e270` |
| `scripts/check_release.py` | 2637 | `a5beb559bfb646c2bcfc276c9e827bc101ad0fd5` | `3128cdbc0bdba458765a325671be08562de139f16fee7e7fde5cd69f08bce2dd` |
| `scripts/check_stage1_traceability.py` | 12782 | `4a6da9f69ef553fa674cf2396bc0bc1a13dc11d3` | `c638c9739e0b4e2ef34a0b7709556ca60316e3cecbd2c247d0c332cbf50190f2` |
| `src/domain/schema.json` | 760789 | `7977a773554a0ec6c94802ce0d1b5885d554ec55` | `992d28d6cc10bfd7f6778b60c6c385a1c87c03b15906ae50237e255f933245b7` |
| `src/testing/performanceFixture.ts` | 6219 | `21efbbd69b999043195f46fa706800990215c316` | `41f6eb244ee7c0c53736bcf7003473b8b0b818711f758fa6be1d7bf6bb6fd571` |
| `tests/e2e/ap04-original-bm-archive.spec.ts` | 8096 | `0c106d4bbf037e2563f197c0b94d4992b07ffeaa` | `154d6c9f994fb80fcd85b368363915f5e4bf91ad3a7c6956f7db56b41e272ccf` |
| `tests/e2e/ap04-original-bm-author.spec.ts` | 19650 | `0bdcffc27ccacf65fb19e8dccc7621e92af46e6e` | `7f716a0a0786d33be3258cc8f94cf9a00e8d3352c4a31eed6623f98831d43837` |
| `tests/e2e/ap04-original-bm-f07-12-private-projection.spec.ts` | 9319 | `518d06f4b34d84e89ff743a1c3d3202757bd0bb2` | `eff10727d7ab79a6c21299407a9f82b89c060fb2bedac60bb3a26c45c56115a1` |
| `tests/e2e/ap04-original-bm-f07-12-time.spec.ts` | 12510 | `09b4a89ede0c18c093f4237ba9ebf8c1c23350e6` | `169008091119d5a5773c019788a815c7dba2691842bb54abf09a226bd85e0edf` |
| `tests/e2e/ap04-original-bm-f07-12-world.spec.ts` | 13451 | `59414c8391ba4aa588ef20b76b240d7565a3b7e1` | `880da26bfd85cb63959cf00c47424708e7968f61f30c717c329fff0f58b268e5` |
| `tests/e2e/ap04-original-bm-runtime.spec.ts` | 13712 | `0ea077d2b76879f30f1f86cd711e380e42908454` | `33b4c6fae1ce35c7af2d9d17422409783a441f83ab2e447c5c060dd148e45c31` |
| `tests/e2e/ap04-original-bm-timeline.spec.ts` | 26216 | `cc0426c127c4dcd93dd3c696c0cbf93921d5789c` | `40382df2b0dc0da6feb0412fdad32d8e4c23237cd90fa86593904d3a5533495e` |
| `tests/e2e/ap04-original-bm-world-narrative.spec.ts` | 16992 | `3977cfd11e685be27edd5386871b2c567b19b604` | `4470b8af9ecdf39f97f36f1ab9f46f8adc23f23e5771bca6c21d4e4f067776b7` |
| `tests/e2e/ap04-original-checkpoint-production.spec.ts` | 18232 | `235b8ca8493034124161014b98f26516eb703f61` | `83b7ee07189b1904bb6dfdf1ffac47eba579c1806119f7e06a9dedd88ee37708` |
| `tests/e2e/ap04-original-e-f37-42-state.spec.ts` | 35557 | `538cdebba5bfce07c1df0d38aea993465a28c2cb` | `73398a06f03d2e4102025ba955a63e1e08eb0553085668818cee87042b154e60` |
| `tests/e2e/ap04-original-e-f43-47-narrative.spec.ts` | 26227 | `56ffa9582823bc7576584674b41be3a7b1ff800d` | `9a6e3ad36bc91b0c73971fae542a999c4fe8523daafd2ec3fe941746d3526bd9` |
| `tests/e2e/ap04-original-e-f48-50-production.spec.ts` | 19721 | `e19c425fc24cc730141396d8260fe5a085266037` | `d481931a29aaa342f6127189156debf6fa1ab9e04166fd1cf076175f8321d49b` |
| `tests/e2e/ap04-original-e02-time-presentation.spec.ts` | 8090 | `68786dfaba347e3587784ea02a4631ab9db41484` | `7f27eafe99b0eb50b1fc14e0f5e02d9fb58f1581afe3b6274955bbdce4a04d7b` |
| `tests/e2e/ap04-original-e03-state.spec.ts` | 9604 | `97b822487b38ad2798fd8422472db39d789ea054` | `6cb154f65e76555027708bf69bd22a0158d172b13b0fdf73efa3cd643913efc4` |
| `tests/e2e/ap04-original-e04-narrative.spec.ts` | 9449 | `978ec598fe091cedf340bf904a0b3fd90cfa223d` | `7b6b602d7bb4bb1fded82040c7d90e0afdfa3bd7f12ebdb1bda03ba3da058bb5` |
| `tests/e2e/ap04-original-e07-safety-bounds.spec.ts` | 5602 | `85a8a68d1708ccd0294dd332ff72970f11dc3f14` | `e50f5ce7f2600474d39869f04ee1f3cab6fa1a9c6b21b61e938538ce11ec8715` |
| `tests/e2e/ap04-original-e08-deliverables.spec.ts` | 11463 | `0e2223a2b5fcd6db2ec379d129676ca0ac50ec6d` | `66c765076f08be521b5dcd747ea6a2a367fd22866543ab4badd2bf8144d41a16` |
| `tests/e2e/ap04-original-e09-world-production.spec.ts` | 17114 | `93ae60cb05388696b4bc1cbdbffcb514115a0cb4` | `35537c84ddbb9537e1f46a316a8b6f5c89184cfc5e1cac6586b64ba0096b6ee6` |
| `tests/e2e/ap04-original-e10-exploration.spec.ts` | 13423 | `2536078c3149223af75489135530f76d97dd4b92` | `45411742867c871a364363910dc91f59fd2166da6ab5e4f0f5a571b3a3e43718` |
| `tests/e2e/ap04-original-e12-continuity.spec.ts` | 24715 | `b9bc1bf2e4ff7801c3e09a88e7f96624f11d9e11` | `7b91f8a112ab0dd2b0f9d6db5d3f53f30073fc6100d403c78843de9af42cf338` |
| `tests/e2e/ap04-original-f-catalog.spec.ts` | 20090 | `6b61b08dd6026b8f0e08d08b5ef1471a39b3f88d` | `f6d96f30b252011bc6ef6371bcafb65f3ce221f7d081accfb034933492955346` |
| `tests/e2e/ap04-original-f-dialogue.spec.ts` | 15270 | `f7993e48c227566794f65c3bfabb5e14afc21d06` | `45418e390f524da7e644407473d4c71716f0e07af6e37fdc258308f8a8385682` |
| `tests/e2e/ap04-original-f-graph.spec.ts` | 17975 | `c81d8be7c5898cf852545f381d2f6f5eb30832be` | `9b9f6abc97d531e760f9b01f610386ae83b17b9e20bc04cf44cd951c43a02179` |
| `tests/e2e/ap04-original-f-hierarchy.spec.ts` | 6932 | `9536e5473d30b6d812cf192885dd3418b488fbae` | `c9e14994e6ec85ebbf9cb98e0693ab6a0a7522e7dcbebcda8606b053fd6cecfe` |
| `tests/e2e/ap04-original-f-index.spec.ts` | 15852 | `aa39b22a811760ec2b995fdc46b53b32fa132dc0` | `f3d27d2e0272e3f36a62a845531acebff932442994f9ff862f695e183c7ff7f3` |
| `tests/e2e/ap04-original-f-material-output.spec.ts` | 38253 | `58862b498b6de5e14f4fafabf4a95d21692ef53b` | `767507207ffed3c03f68650abf3394923378eb5cca0b95aadcc14f1b7eb0e9c0` |
| `tests/e2e/ap04-original-f-production.spec.ts` | 14914 | `587236007ff93a979dd8195a982a6521302db549` | `a9432f02d1c9ccdf7cc61a0ea336988bcb1eebe468057610092b5443abc843c8` |
| `tests/e2e/ap04-original-f-resume-recovery.spec.ts` | 13066 | `e57b4c17c0fc31d51bf5a95be00e0085579e4e62` | `1137a9edecc842a3d0ab4c5bd8105623500e87795be22997ea05e3124784f9c3` |
| `tests/e2e/ap04-original-f-source-schema.spec.ts` | 53900 | `b703265bf7297ca3a49b286c3284dde5bb144248` | `2fc8f4145853b354c8a1bdbabb599932cc40fe9e53024aa4e58b705de7caed64` |
| `tests/e2e/ap04-original-f-storyboard.spec.ts` | 8361 | `f2e9de467d4256e2e67895239a7c5ab245263f8f` | `92bcb0c626bd332b7d47cd31d16be48b7b41fca9ed42e8a46d5caa6fb3db1f59` |
| `tests/e2e/ap04-original-f-world-versions.spec.ts` | 12995 | `818925828053647f17664fcbdad6b504477f044a` | `405734931b4611082efa490086acf0c129d9023af7365b7cb8812b8f6a7f8e49` |
| `tests/e2e/ap04-original-f-writing.spec.ts` | 22934 | `3c5a1ac52b2623263829215b56ab8b7238067627` | `827b4221cc988cb389de32af54e3ff11da829121fa171867b236148ed48f8772` |
| `tests/e2e/ap04-original-f31-same-work-helper.ts` | 5726 | `bb277f1606c9dea4b8ec197abfadcde05a0e41b3` | `b25743826fed5afe8c6b76f6056fa8b1a3416020f37b8d634fcc1fecc4dfaa5c` |
| `tests/e2e/ap04-original-identity-impact.spec.ts` | 10222 | `daa141be8a38f3f7685ad5290655a06902239936` | `52d9e467401c91a0b0140235fa1ad061dba0cbf84cdd55416a8dbe3b69edc793` |
| `tests/e2e/ap04-original-n-atomic-migration.spec.ts` | 13730 | `0cf8d38324530b385fbf495e84245d1f8cd48afa` | `926dd6ba9aefa4e8d2dc64aa0c08248d1a96557aed2fcc59fe29dbf34703212b` |
| `tests/e2e/ap04-original-n-condition-parity.spec.ts` | 14632 | `f7cf497bb67193a1380aeeb3b44394e326fc0406` | `fb4531c77e656e42cf4715af423e967857fc029fe38b8320c2905fc221735740` |
| `tests/e2e/ap04-original-n-f14-trigger.spec.ts` | 9200 | `ae9bdfcbe01fceb58aef17d70ba34334337b54f0` | `d0cc69cc57c671d9ad006d3e27f1e54d152af9d47c8472129b18c6e0742f8644` |
| `tests/e2e/ap04-original-n-f16-20.spec.ts` | 47441 | `ca213487c0a64e7f18f090eb13b2f1426980eed3` | `b9c6c40548695901520fa26993b4f7d621a07ff6a99aeb9ead9094dae5503728` |
| `tests/e2e/ap04-original-n-failure-retry.spec.ts` | 11242 | `12dd304da88dd2d62951e2877a43089f928677c5` | `9a1d29b77392e58f6fce7a65c6997cf55440de71514cc65331f1bc1074dae76f` |
| `tests/e2e/ap04-original-n-mobile-offline.spec.ts` | 20044 | `b389f70fb41976302cfe56210b535c99c38f0c37` | `904b32fa30f25842094b043ec5332c1c817e375c395251cbe1ccbea4959858a3` |
| `tests/e2e/ap04-original-n-random-replay.spec.ts` | 9731 | `b6280eedc3a8c88ea30a670165e91fceb6cbc27a` | `5c6138ffa58b8582dc2e02100cf3581c30209e52680a9c7865589feb132b6da6` |
| `tests/e2e/ap04-original-n-safety-recovery.spec.ts` | 31131 | `5ec5985ec1a611f0abfc2878d37aed9357a86fd1` | `58688c977fc412225d0ff8df96957aa2a28250e15122253c32374bfb7082079f` |
| `tests/e2e/ap04-original-n20-targets.spec.ts` | 13154 | `b6a94e34092c5281136f45739e701dfbb24911a1` | `9b2f7d761b29ad456418788b3b58da78adb5beb56c3ad7f90905b152b301c776` |
| `tests/e2e/ap04-original-root-restoration-output.spec.ts` | 19461 | `bc1eee27f8aada03f10ff012bad66b1595174733` | `a5f30aff8b2fe840e3fd83d009d06e0e7c64506318d9b34aa214d5e1b4d95707` |
| `tests/e2e/basic-registration.spec.ts` | 9414 | `b341b60c8e53e431532d9d8e2df0a3abdec4e64c` | `2b1b8d851d18f2a1d90190a6109db656c96fc65e3cf16e5ba3fa640503f09262` |
| `tests/e2e/catalog-notes.spec.ts` | 17585 | `1453e17eed49d5eeaa87a544a1b8d9050c8c415c` | `1c41ee2f6ccfdbb0e4e02976f24695c3bbc6afe8dab3d97fc1baee13a50d4cf1` |
| `tests/e2e/consultation-context.spec.ts` | 26256 | `253042db45abfc4c1e2ae5a1266dd5479322c9b3` | `aca0cc7af7d31d23079dd8689ced06ed146b00fd85126f6a791bc8b85ae41d3f` |
| `tests/e2e/link-candidate-ignore.spec.ts` | 16621 | `1c7d259dd45d70eeecd6109d68ac39645c377ece` | `79af378ca0d7041fa4bceb504a21392e29aa535ca0e61ab227474e5b8934dba1` |
| `tests/e2e/rb10-import-errors.spec.ts` | 8391 | `4006000717017e12bcd4db8a98486392c4cea6b7` | `3e031432e2ce3c6a0b5a9dabd6f768953bcaab9aafb834796488acdea50f414c` |
| `tests/e2e/templates.spec.ts` | 13807 | `119b7ce1be8e3e7eec201769cbdfcb078da0ff52` | `e79219f1afd655db02db7be3e3ed9865a42afccbf0ba1e5220fbb68d3a83ea73` |
| `tests/fixtures/media-provenance.json` | 784 | `9982f3ff06bbcd7c393c61ed5d1b6f0ba35f0771` | `bceeb8bae7c74ceb09a698a8eede73f44d70285ef43f441925ee0857ee17141b` |
| `tests/fixtures/media/fixture-blue.mp4` | 1734 | `7117a00d754a68e734edee78e75abd4d781a22a5` | `c72fcb46361caa5f0ea5267101ebace3627157da2dd92872c1cb0335466fff05` |
| `tests/fixtures/media/fixture-tone.wav` | 4078 | `7f9403f9025278bdbc064781b4b79e83a97c7230` | `9d32f6d21a9c5da7a62fe802f9e30f2f4467e0e91ec21641ebfeb97cadbeaebd` |
| `tests/fixtures/rb05-fixed-child-call.json` | 27027 | `7ee27b2cbb1e5aa73c5596643f69506d0a84a006` | `903015704dbf0f60a817ebd9417ef5a33c67b19c96a2ab6f1c7d811045518372` |
| `tests/fixtures/rb05-reader-editions.json` | 135543 | `feb53243ae1e41d057ea07db0b85518822b30357` | `e6c19af2a629d56be29a268f316ce0af2bcf8ac25f2887d486a9390f1344bd7e` |
| `tests/fixtures/rb06-history.scenario` | 17571 | `14d1afa7c1521abb5f70395c6ffe0a64bdf54ec3` | `d5cb57db596d4e41c11033b9f0b5158088de3388709857c37eeffce00bd03513` |
| `tests/fixtures/rb07-production.scenario` | 2281 | `8e7f631fe46c5ef3a5e3e401e21afd91fdeb5e79` | `b67fdd9412bf6d1cd8426a4180483475c6fec831a8907bb97869b4de7895e1d4` |
| `tests/fixtures/rb10-import-errors/MANIFEST.json` | 3607 | `e67d6954a9a85d767ae46e28da67980d35b3068f` | `f36c1333783c48b94c2362524c3f351676010e9c39ad08948db41e27211c7424` |
| `tests/fixtures/rb10-import-errors/broken-typed-reference.scenario` | 12880 | `eea2a8998bbcce86226b4d08fe5e0df5ae87e176` | `f15e70d2a6c8a2328a2d8abf1a539279445f359cab4e3283c2aeef9f04086699` |
| `tests/fixtures/rb10-import-errors/complete.scenario` | 12864 | `c890e4238b8ca7022a219f4d4c8b558811be18a3` | `09a837f1572c72e763d06e82102f52347cf777dd698c68fc1c7b554445caf593` |
| `tests/fixtures/rb10-import-errors/dangerous-path.scenario` | 12974 | `82edaaeb2d9175df8342606ec3fa9b9778967319` | `59f4ea500669586957993644e86238f9f45e59083aedf6ccbb2aff0fe7a5d8fe` |
| `tests/fixtures/rb10-import-errors/duplicate-attachment-ZIP-path.scenario` | 12864 | `65f8f06931dabba1e3ce068386e324203144e8c8` | `ed62c26e0f8b2fae9ed51faba4ee3a8b03b82dd22156ed073793e5ca508c9f04` |
| `tests/fixtures/rb10-import-errors/owned-ID-collision.scenario` | 12873 | `ebed6f22441ccae9e13718255169b98f71189c4e` | `03b1eb184ae72f51f52e84c3b1376b5369aa38f6fb0f8b0966aa1b82d083e975` |
| `tests/fixtures/rb10-import-errors/project-hash-mismatch.scenario` | 12866 | `29711222db18069937fb4eb1d6b72c81d83dd55a` | `d29eaf524888cf9355e3ce92b22569dd92da38efbf68c82c88a1d061c28fb09e` |
| `tests/fixtures/rb10-import-errors/understated-compressed-payload.scenario` | 18978 | `ba61d45074051aed55a90dd7e7d4f81fc4fbebe2` | `a1518d4c781b2a7009a332d4b7e4886dcc892035ad618f34dd4fbca607600d0d` |
| `tests/fixtures/rb10-import-errors/unknown-major-format.scenario` | 12867 | `e47725c470b565b48795f54762311bd7606283a9` | `1aa359b6566139d9b8fc56c3b8974876762f7b9832956022454e87fb2b48ecab` |
| `tests/fixtures/rb10-large-analysis/metadata.json` | 735 | `b4c448d34df555c3beb53f007b59f21cba83bb1d` | `4bce4331003c6c00ead1565a5c79965beda13ddd714e1c877729e67a5c2d3158` |
| `tests/fixtures/rb10-large-analysis/original-large-long-branch.scenario` | 1914098 | `566cd06cc4602d31aff08b0bdd5830c29888c039` | `1ca2b19dcf4c8464c68a24a1bbe02cd1b1c4be20187ed2cee99d4e541822d0d0` |
| `tests/fixtures/sync/browser/editor-base.json` | 916 | `854dee1f78f50c41010e7742bcc9d7e60d120d4c` | `7becda112fe108b5592d64e5ddae0349c5292acfebdb898ed8d11119ed4b0d40` |
| `tests/fixtures/sync/browser/provenance.json` | 1045 | `05a5a83d71523405d710dffed6f0cfc84c75eeb3` | `bf4fd9853343e2a35f8d19d6f3953288293c8763ecae6232880572e1a759fe6c` |
| `tests/fixtures/sync/browser/remote-complete.scenario` | 3328 | `c8673182f1418371fe05cf599ce24d32d342a8d3` | `ed3c49fe6d16e2fcf1c4830a89c3057e8133c2adaedce4a74e12e0bc27cda430` |
| `tests/fixtures/sync/browser/remote-native.json` | 11269 | `1e596fe0a84e1c9d0407bf57afa2506c757a77b3` | `44e2bfec75f98d8454a1cc0cfba4c331a4e2c6c44633cacc9062ce50aa365b61` |
| `tests/fixtures/sync/browser/shared.json` | 2470 | `d61fd011ec41242c5714a2af9a1aacc6a9b84887` | `562e90218030e0cb874dfef76c92e8faddc4520e0c077cf5ca2993dfaf61992a` |
| `tests/fixtures/sync/postgres-auth-storage-fixture.sql` | 1686 | `66456f039bf8ed9598c24080d03163834371eaa7` | `825678c499dce863d639de949fb6249f9520e585b8bc5a9e8c63eaa1ef154ebe` |
| `tests/fixtures/sync/review-lifecycle-contract.sql` | 7884 | `9a833002d1bb3d4b78fb4aa6874d6ab4dacfc1b1` | `ce0a32aaed06b854168ff87cdd701ca05b4ba61418f4b16955203ce5643dae5f` |
| `tests/fixtures/sync/rls-contract.sql` | 8491 | `117bcbd0f2d9489c23aa31a83103be9aa0bd9a53` | `6ae9b8059ea83b7eac150a826aff514e19e39c31ba53363e95b1e336c53c720e` |
| `tests/rb10/large-analysis.spec.ts` | 9712 | `e2f10d0356d1a4443c117628998aa4f5e1da3a12` | `4b8eff5530a2925557a4491c6bdb22061bc16e33d239bc8cb003578dab66456e` |
