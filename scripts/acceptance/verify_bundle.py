"""Bind all formal runs, actual files, retained builds and child exits together."""
from datetime import datetime
import io
import json
from pathlib import Path
import re
import sys
import zipfile

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from check_phase3 import (require, loads, sha, verify_archive, safe_relative, recorded_relative,
                         verify_exit, assess_performance, assess_saves, assess_soak,
                         verify_history, verify_pending, verify_large_assets)
from acceptance.snapshot import verify_snapshot
from acceptance.procedures import verify_execution, absolute

STEPS = ('performance-standard', 'performance-large', 'saves180', 'soak', 'exceptions')
CRITICAL = ('projects','entities','relations','blocks','snapshots','commands','outbox','assets','views','syncMetadata',
            'restorePoints','worlds','importLogs','recoveredPending','syncBases','preparedSync','syncConflicts',
            'syncAckEvidence','retainedSyncRecovery','syncAssetAcks','recordParts')


def verify_negatives(raw, source, actual):
    require(raw['status'] == 'passed_same_full_Large_negative_and_retry' and raw['completed'] is True and raw['errors'] == [] and
            raw['buildInfo'] == source['buildInfo'] and raw['sourceCommit'] == source['sourceCommit'] and raw['dirty'] is False and
            raw['input'] == source['completeFile'] and raw['environment']['quotaOverride'] is False, 'Incomplete/different full-input negatives')
    def empty(row): require(all(row['counts'][name] == 0 for name in CRITICAL), 'Failed import changed native data')
    empty(raw['initial'])
    inputs = raw['negativeInputs']
    require([r['kind'] for r in inputs] == ['hash_mismatch', 'unknown_major', 'last_material_hash_mismatch'], 'Missing full-input malformed conditions')
    original_bytes = actual(source['completeFile']['path'])
    with zipfile.ZipFile(io.BytesIO(original_bytes)) as original:
        names = original.namelist()
        require(len(names) == len(set(names)) and set(names) == {r['path'] for r in raw['originalMembers']}, 'Original full file inventory differs')
        for row in raw['originalMembers']:
            data = original.read(row['path']); require(len(data) == row['bytes'] and sha(data) == row['sha256'], 'Original member bytes differ')
        for row in inputs:
            data = actual(row['path']); require(len(data) == row['bytes'] and sha(data) == row['sha256'], 'Actual malformed input bytes differ')
            empty(row['actualRejection']['native'])
            require(any(row['changedMember'] in value for value in row['actualRejection']['alerts']), 'Malformed input rejection path missing')
            with zipfile.ZipFile(io.BytesIO(data)) as broken:
                require(len(broken.namelist()) == len(set(broken.namelist())) and set(broken.namelist()) == set(names), 'Malformed input shrank original members')
                for name in names:
                    old, changed = original.read(name), broken.read(name)
                    if name != row['changedMember']: require(old == changed, 'Unrelated malformed member changed')
                    elif row['kind'] == 'unknown_major':
                        before, after = loads(old), loads(changed)
                        require(before['formatVersion'] == '1.0.0' and after['formatVersion'] == '99.0.0', 'Unknown major differs')
                        after['formatVersion'] = before['formatVersion']; require(before == after, 'Unknown major changed other input')
                    else:
                        offset = row['offset']
                        require(len(old) == len(changed) and old[offset] == row['beforeByte'] and changed[offset] == row['afterByte'] and
                                old[:offset] == changed[:offset] and old[offset+1:] == changed[offset+1:] and old[offset] != changed[offset],
                                'Not the original one-byte corruption')
    require(len(raw['failures']) == 2, 'Missing final-transaction failure')
    for row, fault in zip(raw['failures'], ('final_native_error', 'final_native_quota')):
        empty(row['native']); tx = row['attempt']; counts = tx['counters']
        require(tx['fault'] == fault and tx['state'] == 'aborted' and counts['entities'] >= 68003 and counts['relations'] >= 20000 and
                counts['assets'] == 3 and counts['commands'] == counts['recoveredPending'] == 113 and counts['outbox'] == 1 and counts['recordParts'] > 0 and
                row['mode'] == 'new' and row['inputRetained'] is True and row['elapsedMs'] <= 600000 and row['alerts'], 'Original final failure contract differs')
    require(raw['successfulRetryProbe']['attempts'][2]['state'] == 'completed' and raw['successfulRetryProbe']['throws'] == 2 and
            raw['retryElapsedMs'] <= 600000, 'Normal retry did not commit within original limit')
    expected, native = source['expected'], raw['native']
    require(native['records'] == 88003 and native['projectId'] == expected['projectId'] and native['currentHash'] == expected['currentHash'] and
            native['importLog']['mode'] == 'new' and not native['importLog']['idMap'], 'Cold retry current image differs')
    verify_history(expected['history'], native['history'], {}); verify_pending(expected['history'], native['pending'], {})
    verify_large_assets(native['assets'], actual_hash=True)
    require(native['saveState'] == source['restoration']['new']['saveState'] and
            raw['helperRetention']['before'] == raw['helperRetention']['after'] and raw['cleanup']['status'] == 'completed' and not raw['cleanup']['errors'], 'Retry/helper/cleanup differs')
    return dict(malformedInputs=3, finalNativeFailures=2, unchangedNativeTables=21, coldNormalRetry=True)


def validate(folder):
    folder = folder.resolve(); root = Path(__file__).resolve().parents[2]
    manifest = loads((folder/'manifest.json').read_bytes())
    require(manifest['format'] == 'phase3-formal-evidence/1', 'Unknown formal evidence format')
    archive = (folder/safe_relative(manifest['archive']['path'])).read_bytes()
    require(len(archive) == manifest['archive']['bytes'] and sha(archive) == manifest['archive']['sha256'], 'Formal bundle bytes differ')
    files = verify_archive(archive, manifest['files'])
    def read(path): return files[safe_relative(path)]
    def actual(path): return read(recorded_relative(manifest['recordedRoot'], path))
    def descriptor(row):
        data = actual(row['path']); require(len(data) == row['bytes'] and sha(data) == row['sha256'], 'Actual file descriptor differs'); return data
    binding_bytes = read('candidate.json'); binding = loads(binding_bytes)
    snapshot = verify_snapshot(binding, read('candidate.zip'), root)
    absolute(binding['sourceRoot']); absolute(manifest['recordedRoot'])
    product = binding['build_info']; sequence = loads(read('sequence.json'))
    require(sequence['candidate'] == product['commit'] and sequence['status'] == 'completed' and
            [row['step'] for row in sequence['steps']] == list(STEPS), 'Missing/reordered final formal sequence')
    previous, raws, assessments = None, {}, {}
    for row in sequence['steps']:
        step = row['step']; started = datetime.fromisoformat(row['startedAt']); finished = datetime.fromisoformat(row['finishedAt'])
        require(row['status'] == 'completed' and row['sourceVerifiedBefore'] is True and row['sourceVerifiedAfter'] is True and
                finished >= started and (previous is None or started >= previous), 'Formal runs overlapped or failed')
        previous = finished
        receipt = loads(read(step+'/execution/exit.json')); verify_exit(receipt)
        command = loads(read(step+'/execution/command.json'))
        driver = read('results/saves180/executed-procedure.mjs') if step == 'saves180' else (
            read('exceptions/executed-driver.mjs') if step == 'exceptions' else None)
        verify_execution(step, command, row['argv'], binding['sourceRoot'], manifest['recordedRoot'],
                         binding['commit'], snapshot, driver)
        require(command['argv'] == row['argv'] and read(step+'/execution/executed-wrapper.py') == snapshot['scripts/acceptance/execute.py'] and
                command['procedure'] == dict(path=binding['sourceRoot']+'/scripts/acceptance/execute.py', retained='executed-wrapper.py',
                    bytes=len(snapshot['scripts/acceptance/execute.py']), sha256=sha(snapshot['scripts/acceptance/execute.py'])),
                'Actual command/wrapper differs from sealed procedure')
        descriptor(receipt['log'])
        data = read(row['raw']); raw = loads(data); raws[step] = raw
        assessment = loads(read(step+'/ADJUDICATION.json'))
        require(assessment['product'] == product and assessment['raw'] == dict(bytes=len(data), sha256=sha(data)), 'Adjudication raw identity differs')
        if step.startswith('performance-') or step == 'soak':
            require(raw['sourceCommit'] == binding['commit'] and raw['sourceTree'] == binding['tree'], 'Mixed measured source')
            scopes = ('src/', 'scripts/', 'tests/') if step == 'soak' else ('src/', 'scripts/', 'tests/', 'examples/', 'supabase/', '.github/')
            names = ('package.json', 'package-lock.json', 'vite.config.ts') if step == 'soak' else ('package.json', 'package-lock.json', 'vite.config.ts', 'playwright.config.ts', 'vitest.config.ts')
            expected = [r for r in binding['source_files'] if r['path'].startswith(scopes) or r['path'] in names]
            require(raw['sourceFiles'] == sorted(expected, key=lambda r:r['path']), 'Raw measurement source inventory differs')
            dist = {r['path']: r for r in binding['artifact_files']}
            require({r['path']: r for r in raw['artifactFiles'] if r['path'].startswith('dist/')} == dist, 'Raw served build differs')
            retention = raw['helperRetention']; require(retention['status'] == 'retained_and_verified_before_after', 'Missing actual helper retention')
            prefix = 'large-history-helper/' if step == 'soak' else 'measurement-helper/'
            helper_rows = [r for r in raw['artifactFiles'] if r['path'].startswith(prefix)]
            for phase in ('before', 'after'):
                require(retention[phase]['sourceUnchanged'] is True and retention[phase]['retainedUnchanged'] is True and
                        retention[phase]['retainedFiles'] == helper_rows, 'Served/retained helper differs')
            for helper in helper_rows:
                data = actual(retention['directory']+'/'+helper['path'].removeprefix(prefix))
                require(len(data) == helper['bytes'] and sha(data) == helper['sha256'], 'Actual retained helper bytes differ')
        if step.startswith('performance-'):
            size = step.removeprefix('performance-'); require(raw['size'] == size, 'Formal size differs')
            expected = loads((root/f'docs/optimization/phase1/evidence/candidate-{size}30.json').read_bytes())['fixture']
            metrics = assess_performance(raw, product, expected)
            require(all(r['result'] != 'failed_local_numeric_condition' for r in metrics.values()), 'Original final numeric threshold failed')
            require(raw['measurementContract']['helperSha256'] == sha(snapshot['scripts/measure-app.mjs']), 'Original measured procedure changed')
            assessments[step] = metrics
        elif step == 'saves180':
            require(raw['sourceBindingSHA256'] == sha(binding_bytes) and sha(read('results/saves180/executed-procedure.mjs')) == raw['procedureSHA256'], 'Original saves procedure/binding differs')
            helper = loads(read('results/saves180/HELPER_INPUTS.json'))
            require(helper['sourceBindingSHA256'] == sha(binding_bytes) and helper['entry'] == sha(read('results/saves180/entry.mjs')), 'Actual save helper input differs')
            for record in helper['helperFiles']:
                data = read('results/saves180/'+record['path']); require(len(data) == record['bytes'] and sha(data) == record['sha256'], 'Actual save helper changed')
            for case in raw['cases']:
                data = descriptor(case['completeFile'])
                with zipfile.ZipFile(io.BytesIO(data)) as native: require(native.testzip() is None, 'Save complete ZIP CRC differs')
            assessments[step] = assess_saves(raw, product)
        elif step == 'soak':
            require(receipt['elapsedWallSeconds'] >= 7200 and '--soak-seconds' in row['argv'] and
                    row['argv'][row['argv'].index('--soak-seconds')+1] == '7200', 'Short/diagnostic soak substituted')
            descriptor(raw['completeFile']); assessments[step] = assess_soak(raw, product)
        else:
            source_bytes = read('soak/raw.json')
            require(raw['sourceOriginalRun']['bytes'] == len(source_bytes) and raw['sourceOriginalRun']['sha256'] == sha(source_bytes) and
                    raw['executedDriverSHA256'] == sha(read('exceptions/executed-driver.mjs')), 'Exception source/driver changed')
            assessments[step] = verify_negatives(raw, raws['soak'], actual)
    return dict(product=product, formal=assessments, sourceFiles=len(binding['source_files']), actualRetainedFiles=len(files),
                releaseDecision='RELEASE BLOCKED', physicalDeviceAcceptance=False)
