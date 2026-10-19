"""Independent, fail-closed supplement checks; never a formal release verdict.

RG01/02/03 are supplementary execution names, not the six original RG-R groups.
The old uncommitted 04a7 checker was unavailable: these checks are reconstructed.
"""
from __future__ import annotations
import argparse
import base64
import hashlib
import io
import json
from pathlib import Path
import re
import subprocess
import stat
import zipfile

IMMUTABLE = 'd5e132ef6f4db6a0f3fbe888228ffd1007d653f9'
ORIGINAL_N05_SHA256 = '4b8eff5530a2925557a4491c6bdb22061bc16e33d239bc8cb003578dab66456e'
ORIGINAL_N05_CONFIG_SHA256 = '325086179677c1f7a0b39031415e7c54f9fc8cc466aec281961627ff84cb3c0f'
ORIGINAL_N05_METADATA_SHA256 = '4bce4331003c6c00ead1565a5c79965beda13ddd714e1c877729e67a5c2d3158'
BASE = 'docs/quality/pr49-followup-2026-10-15/evidence/'
HISTORICAL = {
    'unaffected-local-3ab6': ('94638ab2ed3ac407b0a70a60d90d0f2a9ed81ce2e7967c02f5aebe4da67d8de1', 'rg01-same-given-3ab6f40-attempt1'),
    'additional-original-regressions-1fcadcca': ('1cf01c9b9798d03dc641d0422663cd76192cf24dea813458d36df9ab6c6de07f', 'rg02-rg03-same-given-1fcadcca-attempt1'),
}
CHECKPOINTS = ('original-prefix-and-cold', 'front-deletion', 'paragraph-split', 'paragraph-move', 'move-compensation-undo', 'paragraph-merge', 'overlapping-replacement', 'overlap-cold')
NATIVE_TABLES = set('acks assets authorToolDrafts blocks commands entities importDrafts importLogs outbox preparedSync projectSummaries projects recordParts recoveredPending relations restorePoints retainedSyncRecovery sharedSnapshots snapshots syncAckEvidence syncAssetAcks syncBases syncConflicts syncMetadata viewStates views workspaceInputs worldSources worlds'.split())


def require(condition, message):
    if not condition:
        raise ValueError(message)


def sha(raw):
    return hashlib.sha256(raw).hexdigest()


def load(path):
    return json.loads(Path(path).read_bytes())


def checked_bytes(path, row):
    raw = Path(path).read_bytes()
    require(len(raw) == row['bytes'] and sha(raw) == row['sha256'], 'Retained bytes differ: '+str(path))
    return raw


def transform(text, repository, binding, output, identity=False):
    text = text.replace('/workspace/pr49-graph-measure-source', str(repository)).replace('/workspace/pr49-measure-source', str(repository))
    text = text.replace('/workspace/pr49-checks/rg02-rg03-same-given-1fcadcca-attempt1', str(output))
    if identity:
        for old, new in [('1fcadcca703863873a57d297e83b1b184e63e778', binding['commit']), ('8ec3a03810bb0cf1b1b4', binding['build_info']['version'])]:
            require(text.count(old) == 1, 'Unexpected original identity occurrence')
            text = text.replace(old, new)
    return text


def historical_files(repository, historical, label):
    """Root trust in the immutable manifest, not a caller-created recovery receipt."""
    expected, _ = HISTORICAL[label]
    name = BASE+'bundles/'+label+'.manifest.json'
    raw = subprocess.check_output(['git', 'cat-file', 'blob', IMMUTABLE+':'+name], cwd=repository)
    require(sha(raw) == expected, 'Immutable original manifest differs')
    manifest = json.loads(raw)
    archive = checked_bytes(historical/(label+'.tar.gz'), manifest['archive'])
    # Recovery verifies tar member inventory; recheck every actual extracted member.
    rows = {r['path']: r for r in manifest['files']}
    require(len(rows) == len(manifest['files']), 'Duplicate historical member')
    import tarfile
    with tarfile.open(fileobj=io.BytesIO(archive), mode='r:gz') as tar:
        members = tar.getmembers()
        require(len(members) == len(rows) and {m.name for m in members} == set(rows), 'Historical archive inventory differs')
        for member in members:
            require(member.isfile(), 'Historical non-file member')
            data = tar.extractfile(member).read()
            require(len(data) == rows[member.name]['bytes'] and sha(data) == rows[member.name]['sha256'], 'Historical archive member differs')
    for name, row in rows.items():
        require(not Path(name).is_absolute() and '..' not in Path(name).parts, 'Unsafe historical member')
        checked_bytes(historical/label/name, row)
    return historical/label, manifest


class Attachments:
    def __init__(self, result, report):
        rows = result.get('attachments', [])
        self.rows = {r['name']: r for r in rows}
        require(len(self.rows) == len(rows), 'Duplicate attachment name')
        self.report = Path(report)

    def raw(self, name):
        require(name in self.rows, 'Missing attachment: '+name)
        row = self.rows[name]
        require(('body' in row) != ('path' in row), 'Ambiguous attachment: '+name)
        if 'body' in row:
            return base64.b64decode(row['body'], validate=True)
        path = Path(row['path'])
        path = path if path.is_absolute() else self.report.parent/path
        # Only output artifacts may satisfy attachments; no external source substitution.
        require(path.resolve().is_relative_to(self.report.parent.resolve()), 'External attachment path')
        return path.read_bytes()

    def json(self, name):
        return json.loads(self.raw(name))


def reports(path):
    report = load(path)
    require(not report.get('errors') and report.get('stats', {}).get('unexpected', 0) == 0, 'Reporter errors')
    found = {}
    def visit(suite):
        for spec in suite.get('specs', []):
            title = spec['title']
            require(title not in found and spec.get('ok') is True, 'Duplicate or failed test title')
            tests = spec['tests']
            require(len(tests) == 1 and tests[0]['expectedStatus'] == 'passed', 'Unexpected test inventory')
            test = tests[0]
            results = test['results']
            require(len(results) == 1 and results[0]['status'] == 'passed' and results[0].get('retry', 0) == 0 and not results[0].get('errors'), 'Test retried, skipped, incomplete or failed')
            evidence = Attachments(results[0], path)
            evidence.test_id = spec['id']
            evidence.project = test.get('projectName')
            evidence.timeout = test['timeout']
            found[title] = evidence
        for child in suite.get('suites', []):
            visit(child)
    visit(report)
    require(found, 'Empty report')
    return found


def receipt(repository, directory, argv, selectors=None):
    command, result = load(directory/'command.json'), load(directory/'exit.json')
    wrapper = (repository/'scripts/acceptance/execute.py').read_bytes()
    require(command['argv'] == argv and command['cwd'] == str(repository), 'Actual argv/cwd differs')
    require(command['procedure'] == dict(path=str(repository/'scripts/acceptance/execute.py'), retained='executed-wrapper.py', bytes=len(wrapper), sha256=sha(wrapper)), 'Actual wrapper differs')
    require((directory/'executed-wrapper.py').read_bytes() == wrapper, 'Retained wrapper differs')
    require(result['returncode'] == 0 and result['executedWrapperBytesUnchanged'] is True and result['childPid'] == command['childPid'], 'Missing or failed real child exit')
    require(command['startedAt'] <= result['finishedAt'], 'Exit precedes start')
    require(result['log']['path'] == str(directory/'stdout-stderr.log'), 'Exit log path differs')
    log = checked_bytes(directory/'stdout-stderr.log', result['log'])
    require(bool(log.strip()), 'Empty execution log')
    for key, value in (selectors or {}).items():
        require(command['environmentSelectors'].get(key) == value, 'Execution selector differs: '+key)


def scenario(raw):
    with zipfile.ZipFile(io.BytesIO(raw)) as archive:
        names = archive.namelist()
        require(len(names) == len(set(names)), 'Duplicate scenario member')
        manifest = json.loads(archive.read('manifest.json'))
        for row in manifest['files']:
            data = archive.read(row['path'])
            require(len(data) == row['byteSize'] and sha(data) == row['sha256'], 'Scenario internal hash differs')
        project = json.loads(archive.read('data/project.json'))
        assets = {n: archive.read(n) for n in names if n.startswith('assets/')}
        return project, assets


def complete(attachments, ordinal):
    name = f'complete-backup-{ordinal:03d}.scenario'
    raw, meta = attachments.raw(name), attachments.json(name+'.json')
    require(meta['sequence'] == ordinal and meta['fileName'] == name and meta['fileBytes'] == len(raw) and meta['fileSHA256'] == sha(raw), 'Complete output descriptor differs')
    return raw, scenario(raw)[0]


class Canonical:
    """Alpha-rename generated UUIDs, retaining every other state/given value."""
    def __init__(self):
        self.ids = {}

    def __call__(self, value):
        if isinstance(value, dict):
            return {self(k): self(v) for k, v in sorted(value.items()) if k not in ('createdAt', 'updatedAt')}
        if isinstance(value, list):
            return [self(v) for v in value]
        if isinstance(value, str) and re.fullmatch(r'[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}', value):
            if value not in self.ids:
                self.ids[value] = '@'+str(len(self.ids))
            return self.ids[value]
        return value


def assert_given(current, original):
    left, right = Canonical(), Canonical()
    # Full original fixture author model; only generated identifiers/timestamps vary.
    require(left(current) == right(original), 'Original given values changed')
    return left, right


def assess_rg01(attachments, given):
    procedures = attachments.json('supplemental-original-RG01-summary.json')['procedures']
    require([r['label'] for r in procedures] == list(CHECKPOINTS), 'RG01 original eight checkpoint inventory differs')
    duration = attachments.json('unchanged-original-procedure-duration.json')
    require(duration['originalProcedureCompleted'] is True and 0 <= duration['milliseconds'] <= 30000, 'RG01 original duration differs')
    scene = next(e for e in given['entities'] if e['name'] == '注記付き本文')
    character = next(e for e in given['entities'] if e['name'] == 'アオ')
    disclosure = next(e for e in given['entities'] if e['name'] == '本文の提示位置')
    block_id = scene['data']['body'][0]['id']
    for index, label in enumerate(CHECKPOINTS):
        row = attachments.json('actual-'+label+'.json')
        require(row == procedures[index], 'RG01 checkpoint differs from summary')
        raw, project = complete(attachments, index+1)
        actual_scene = next(e for e in project['entities'] if e['id'] == scene['id'])
        actual_disclosure = next(e for e in project['entities'] if e['id'] == disclosure['id'])
        require(row['sceneId'] == scene['id'] and row['revision'] == project['revision'] and row['body'] == actual_scene['data']['body'] and row['anchor'] == actual_disclosure['data']['anchor'] and row['latestCommand'] == project['history'][-1], 'RG01 actual complete file differs')
        require(row['actualFileBytes'] == len(raw) and row['actualFileSHA256'] == sha(raw), 'RG01 complete file hash differs')
        if index < 6:
            start = 4 if index == 0 else 0
            blocks = row['body']
            block = next(b for b in blocks if b['id'] == block_id)
            require(block['ruby'] == [dict(start=start, end=start+2, text='あお')] and block['links'] == [dict(start=start, end=start+2, target=dict(entityId=character['id']))], 'RG01 ruby/link values differ')
            anchor = row['anchor']
            require(all(anchor.get(k) == v for k, v in dict(entityId=scene['id'], blockId=block_id, start=start, end=start+2).items()) and anchor.get('positionStatus') != 'unresolved', 'RG01 intact anchor differs')
            require(block['text'][start:start+2] == 'アオ', 'RG01 Unicode position differs')
            expected_text = ('昨日、😀アオが歩く。', 'アオが歩く。', 'アオ\nが歩く。', 'が歩く。\nアオ', 'アオ\nが歩く。', 'アオが歩く。')[index]
            require('\n'.join(b['text'] for b in blocks) == expected_text and len(blocks) == (2 if index in (2, 3, 4) else 1), 'RG01 exact paragraph transformation differs')
        else:
            block, anchor = row['body'][0], row['anchor']
            require(len(row['body']) == 1 and block['text'] == 'クロが歩く。' and not block.get('ruby') and not block.get('links'), 'RG01 overlapping replacement differs')
            unresolved = block['unresolvedAnnotations']
            require(any(a.get('kind') == 'ruby' and a.get('originalText') == 'アオ' and a.get('reading') == 'あお' for a in unresolved) and any(a.get('kind') == 'link' and a.get('originalText') == 'アオ' and a.get('target') == {'entityId':character['id']} for a in unresolved), 'RG01 lost unresolved annotation')
            require(all(anchor.get(k) == v for k, v in dict(entityId=scene['id'], blockId=block_id, positionStatus='unresolved', quotedText='アオ').items()) and 'start' not in anchor and 'end' not in anchor, 'RG01 unresolved anchor differs')
    split, moved, undone = procedures[2:5]
    second_id = split['body'][1]['id']
    require(second_id != block_id and [b['id'] for b in moved['body']] == [second_id, block_id] and [b['id'] for b in undone['body']] == [block_id, second_id], 'RG01 block identity differs')
    require(undone['latestCommand']['compensatesOperationId'] == moved['latestCommand']['operationId'], 'RG01 compensation target differs')
    require(procedures[7]['body'] == procedures[6]['body'] and procedures[7]['anchor'] == procedures[6]['anchor'], 'RG01 cold retained values differ')


def assess_rg23(current, original, build, build_hash):
    require(set(current) == set(original) and len(current) == 12, 'RG02/03 exact six plus six conditions differ')
    for title, attachments in current.items():
        reference = original[title]
        product = attachments.json('actual-product.json')
        require(product['build'] == build and product['buildInfoSHA256'] == build_hash, 'RG actual build differs')
        group = 'RG-R02' if title.startswith('RG-R02 ') else 'RG-R03'
        given_raw, expected_raw = attachments.raw(group+'-given.scenario'), reference.raw(group+'-given.scenario')
        given, expected = scenario(given_raw)[0], scenario(expected_raw)[0]
        left, right = assert_given(given, expected)
        facts = attachments.json(group+'-given.json')
        require(facts['fixtureSha256'] == sha(given_raw) and facts['fixtureBytes'] == len(given_raw), 'RG given hash differs')
        require(left(facts['facts']) == right(reference.json(group+'-given.json')['facts']), 'RG condition facts differ')
        actual, expected_actual = attachments.json(group+'-actual.json'), reference.json(group+'-actual.json')
        if group == 'RG-R02':
            raw, project = complete(attachments, 1)
            _, original_project = complete(reference, 1)
            trace = next(e for e in project['entities'] if e['kind'] == 'trace')
            original_trace = next(e for e in original_project['entities'] if e['kind'] == 'trace')
            require(actual['traceId'] == trace['id'] and actual['sourceVersionId'] == trace['data']['contentVersionId'] and actual['finalState'] == trace['data']['steps'][-1]['after'], 'RG02 full trace/final state differs')
            # Seed UUID maps in the same structural order before checking all states.
            require(left(trace['data']) == right(original_trace['data']), 'RG02 original full trace states/conditions differ')
            expected_observation = {k:v for k,v in expected_actual.items() if k != 'actualCompleteSHA256'}
            require(left({k:v for k,v in actual.items() if k != 'actualCompleteSHA256'}) == right(expected_observation), 'RG02 original observation values differ')
            require(actual['actualCompleteSHA256'] == sha(raw), 'RG02 actual complete hash differs')
        else:
            before_raw, before = complete(attachments, 1)
            after_raw, after = complete(attachments, 2)
            require(before == after and scenario(before_raw)[1] == scenario(after_raw)[1], 'RG03 failed operation changed author data/assets/history')
            require(actual['actualCompleteSHA256'] == sha(after_raw), 'RG03 actual complete hash differs')
            require({k:v for k,v in actual.items() if k != 'actualCompleteSHA256'} == {k:v for k,v in expected_actual.items() if k != 'actualCompleteSHA256'}, 'RG03 policy/mixed/rejection observation differs')


def assess_n05(detail, downloads, expected_fixture):
    require(detail.get('fixture') == expected_fixture, 'N05 fixed original fixture differs')
    require(len(downloads) == 2 and downloads[0] == downloads[1] == detail['result'], 'N05 two actual results differ')
    result = detail['result']
    require(result['status'] == 'unknown' and result['truncated'] is True and result['limits'] == dict(maxStates=100000, maxTransitions=10000, maxMs=30000), 'N05 original unknown/caps differ')
    require(len(set(result['declaredEntryIds'])) == 2, 'N05 declared entries differ')
    require(set(detail['nativeBefore']) == NATIVE_TABLES and detail['nativeBefore'] == detail['nativeAfter'], 'N05 all 29 native fingerprints differ')
    for row in detail['nativeBefore'].values():
        require(isinstance(row['count'], int) and row['count'] >= 0 and re.fullmatch('[0-9a-f]{64}', row['sha256']), 'N05 invalid table fingerprint')
    before = detail['nativeBefore']
    require(before['entities']['count']+before['relations']['count'] == 88522 and before['assets']['count'] == 3 and before['workspaceInputs']['count'] > 0, 'N05 fixed original counts/input retention differ')
    timing = detail['timing']
    require(0 < timing['firstPaintAt']-timing['startedAt'] <= 2000 and 0 <= timing['largestTimerGap'] <= 2000 and '状態を確認中' in detail['progress'], 'N05 original responsiveness differs')


def download_payloads(directory, events, provenance):
    rows = events
    require(len(rows) == 2 and [r['event'] for r in rows] == [1, 2], 'N05 missing/sequenced download event')
    values = []
    for index, row in enumerate(rows, 1):
        relative = f'downloads/{index}.json'
        require(all(row.get(k) == v for k,v in provenance.items()), 'N05 mixed event provenance')
        require(row['completed'] is True and row['path'] == relative and row['savedPath'] == str(directory/relative) and bool(row['filename']) and row['url'].startswith('blob:'), 'N05 event was not separately saved')
        path = directory/relative
        require(not (directory/'downloads').is_symlink() and stat.S_ISREG(path.lstat().st_mode) and path.resolve().parent == (directory/'downloads').absolute(), 'N05 original is not a regular saved file')
        values.append(json.loads(checked_bytes(path, row)))
    first, second = directory/rows[0]['path'], directory/rows[1]['path']
    require(not first.samefile(second), 'N05 originals alias the same file')
    return values


def verify_n05(repository, binding_path, binding, directory):
    capture, events = load(directory/'capture.json'), load(directory/'events.json')
    original = (repository/'tests/rb10/large-analysis.spec.ts').read_bytes()
    require(sha(original) == ORIGINAL_N05_SHA256 and sha((repository/'tests/rb10/playwright.config.ts').read_bytes()) == ORIGINAL_N05_CONFIG_SHA256, 'Fixed original N05 source/config changed')
    require((directory/'executed-original.spec.ts').read_bytes() == original, 'N05 original body differs')
    old = b"import {test,expect,type Page} from '@playwright/test';"
    require(original.startswith(old+b'\n') and original.count(old) == 1, 'Unexpected N05 import')
    staged = original.replace(old, b"import {test,expect,type Page} from './capture-bridge';", 1)
    stage = directory/'staging'
    require((stage/'capture-original.spec.ts').read_bytes() == staged and sha(staged) == capture['stagedSHA256'], 'N05 body was changed')
    require((directory/'executed-driver.mjs').read_bytes() == (repository/'scripts/acceptance/capture_n05_downloads.mjs').read_bytes(), 'N05 driver differs')
    metadata_raw = (repository/'tests/fixtures/rb10-large-analysis/metadata.json').read_bytes()
    require(sha(metadata_raw) == ORIGINAL_N05_METADATA_SHA256, 'Fixed original N05 metadata changed')
    metadata = json.loads(metadata_raw)
    fixture_raw = (repository/'tests/fixtures/rb10-large-analysis'/metadata['archive']).read_bytes()
    require(len(fixture_raw) == 1914098 and sha(fixture_raw) == '1ca2b19dcf4c8464c68a24a1bbe02cd1b1c4be20187ed2cee99d4e541822d0d0', 'Fixed original N05 archive differs')
    provenance = dict(format='phase3-n05-downloads/1', trial=capture['trial'], bindingSHA256=sha(binding_path.read_bytes()), candidate=binding['commit'], tree=binding['tree'], build=binding['build_info'], originalSHA256=sha(original), fixture=dict(metadataSHA256=sha(metadata_raw), archive=metadata['archive'], bytes=len(fixture_raw), sha256=sha(fixture_raw)))
    require(re.fullmatch(r'[0-9a-f-]{36}', capture['trial']), 'Invalid trial')
    require(all(capture.get(k) == v and events.get(k) == v for k,v in provenance.items()), 'N05 mixed trial/candidate/build/fixture')
    require(capture['status'] == 'completed' and capture['returncode'] == 0 and capture['repository'] == str(repository) and capture['output'] == str(directory), 'N05 actual driver incomplete')
    require(events['retry'] == 0 and events['project'] == 'chromium', 'N05 wrong attempt/project')
    # Regenerate bridge/config from the sealed real driver instead of trusting descriptor hashes.
    script = "import {bridgeSource} from "+json.dumps((repository/'scripts/acceptance/capture_n05_downloads.mjs').as_uri())+";process.stdout.write(bridgeSource(JSON.parse(process.argv[1]),process.argv[2]));"
    bridge = subprocess.check_output(['node', '--input-type=module', '-e', script, json.dumps(provenance, separators=(',', ':'), ensure_ascii=False), str(directory)])
    require((stage/'capture-bridge.ts').read_bytes() == bridge and sha(bridge) == capture['bridgeSHA256'], 'N05 event bridge differs')
    quote = lambda x: json.dumps(str(x), ensure_ascii=False, separators=(',', ':'))
    config = f"import original from {quote(repository/'tests/rb10/playwright.config.ts')};\nexport default {{...original,testDir:{quote(stage)},testMatch:'capture-original.spec.ts',reporter:[['list'],['json',{{outputFile:{quote(directory/'results.json')}}}]],webServer:{{...original.webServer,cwd:{quote(repository)}}}}};\n".encode()
    require((stage/'playwright.config.ts').read_bytes() == config and sha(config) == capture['configSHA256'], 'N05 actual config differs')
    argv = ['npx', 'playwright', 'test', '-c', str(stage/'playwright.config.ts'), '--project=chromium', '--output', str(directory/'test-results')]
    require(capture['argv'] == argv, 'N05 capture argv differs')
    receipt(repository, directory/'execution', argv, {'CI':'1'})
    tests = reports(directory/'results.json')
    original_title = re.search(r"test\('([^']+)'", original.decode()).group(1)
    require(set(tests) == {original_title}, 'N05 original test inventory differs')
    attachments = tests[original_title]
    require(events['testId'] == attachments.test_id and attachments.project == 'chromium' and attachments.timeout == 1200000, 'N05 event/test execution identity differs')
    require(attachments.json('n05-download-events') == events, 'N05 event reporter attachment differs')
    rows = events['events']
    values = download_payloads(directory, rows, provenance)
    assess_n05(attachments.json('original-large-analysis-result'), values, metadata)
    return dict(trial=capture['trial'], downloads=[dict(path=r['path'], bytes=r['bytes'], sha256=r['sha256']) for r in rows], nativeTables=29)


def verify_n05_step(repository, binding_path, output, row):
    driver = repository/'scripts/acceptance/capture_n05_downloads.mjs'
    argv = ['node', str(driver), '--repository', str(repository), '--binding', str(binding_path), '--output', str(output/'n05')]
    require(row['step'] == 'n05' and row['argv'] == argv and row['status'] == 'passed' and row['returncode'] == 0, 'N05 outer runner argv/exit differs')
    require(row['originalSHA256'] == ORIGINAL_N05_SHA256 and row['driverSHA256'] == sha(driver.read_bytes()), 'N05 outer runner driver/source differs')
    receipt(repository, output/'n05-capture-execution', argv, {'CI':'1'})


def verify(repository, binding_path, historical, output):
    repository, binding_path, historical, output = [Path(p).resolve() for p in (repository, binding_path, historical, output)]
    binding = load(binding_path)
    # Same candidate seal as the runner, including served artifact bytes.
    require(subprocess.check_output(['git', 'rev-parse', 'HEAD'], cwd=repository).decode().strip() == binding['commit'], 'Candidate HEAD differs')
    require(not subprocess.check_output(['git', 'status', '--porcelain'], cwd=repository).strip(), 'Candidate checkout changed')
    for row in binding['source_files']+binding['artifact_files']+binding['original_documents']+[binding['generated_runtime']]:
        checked_bytes(repository/row['path'], row)
    require(load(repository/'dist/build-info.json') == binding['build_info'], 'Served build differs')
    plan = load(output/'sequence.json')
    require(plan['product'] == binding['build_info'] and plan['bindingSHA256'] == sha(binding_path.read_bytes()), 'Supplement binding differs')
    require(plan['status'] == 'completed' and [r['step'] for r in plan['steps']] == ['rg01', 'rg02-rg03', 'n05'], 'Supplement sequence incomplete')
    require((output/'executed-procedure.py').read_bytes() == (repository/'scripts/acceptance/run_supplements.py').read_bytes(), 'Supplement runner differs')
    originals = {}
    for label, (_, prefix) in HISTORICAL.items():
        base, _ = historical_files(repository, historical, label)
        originals['rg01' if label.startswith('unaffected') else 'rg02-rg03'] = base/prefix
    for step in plan['steps'][:2]:
        name = step['step']
        require(step['status'] == 'passed' and step['returncode'] == 0, 'RG sequence child failed')
        directory, source = output/name, originals[name]/'executed-inputs'
        names = ('rg01.spec.ts','rebound-original-seed.ts') if name == 'rg01' else ('same-given.spec.ts','original-fixtures.ts','original-runtime-regressions.test.ts')
        rows = []
        for n in names:
            original = (source/n).read_bytes()
            actual = transform(original.decode(), repository, binding, directory, identity=n=='same-given.spec.ts').encode()
            require((directory/'originals'/n).read_bytes() == original and (directory/'executed-inputs'/n).read_bytes() == actual, 'RG original/limited transformation differs: '+n)
            rows.append(dict(path=n,originalBytes=len(original),originalSHA256=sha(original),executedBytes=len(actual),executedSHA256=sha(actual)))
        require(step['inputs'] == rows, 'RG input descriptor differs')
        config = transform((source/'playwright.config.mjs').read_text(), repository, binding, directory).encode()
        require((directory/'executed-inputs/playwright.config.mjs').read_bytes() == config and step['configSHA256'] == sha(config), 'RG original config differs')
        argv = ['npx','playwright','test','-c',step['stagingDirectory']+'/playwright.config.mjs']
        selectors = {'CI':'1', **({'RG01_OUTPUT_DIR':str(directory)} if name == 'rg01' else {})}
        receipt(repository, directory/'execution', argv, selectors)
        current, original_reports = reports(directory/'results.json'), reports(originals[name]/'results.json')
        require(set(current) == set(original_reports), 'RG original test names differ')
        if name == 'rg01':
            given = scenario((directory/'actual-given.scenario').read_bytes())[0]
            expected = scenario((originals[name]/'actual-given.scenario').read_bytes())[0]
            assert_given(given, expected)
            require(len(current) == 1, 'RG01 original test count differs')
            assess_rg01(next(iter(current.values())), given)
        else:
            assess_rg23(current, original_reports, binding['build_info'], sha((repository/'dist/build-info.json').read_bytes()))
    verify_n05_step(repository, binding_path, output, plan['steps'][2])
    require((output/'executed-verifier.py').read_bytes() == Path(__file__).read_bytes(), 'Executed verifier differs')
    n05 = verify_n05(repository, binding_path, binding, output/'n05')
    return dict(format='phase3-supplement-assessment/1', product=binding['build_info'], bindingSHA256=sha(binding_path.read_bytes()), supplementaryRG01Checkpoints=8, supplementaryRG02Conditions=6, supplementaryRG03Conditions=6, n05=n05, formalAcceptance='not_assessed', physical='not_run', historicalChecker='reconstructed; uncommitted 04a7 source unavailable')


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    for name in ('repository','binding','historical','output'):
        parser.add_argument('--'+name, type=Path, required=True)
    args = parser.parse_args()
    result = verify(args.repository, args.binding, args.historical, args.output)
    (args.output/'assessment.json').write_text(json.dumps(result, ensure_ascii=False, indent=2)+'\n')
    print(json.dumps(result, ensure_ascii=False))


if __name__ == '__main__':
    main()
