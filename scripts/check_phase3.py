"""Independent phase-three evidence assessment. Never changes release criteria."""
from __future__ import annotations

import argparse
from datetime import datetime
import hashlib
import io
import json
import math
from pathlib import Path, PurePosixPath
import re
import sys
import zipfile

from check_phase1 import assess_original30

CONTRACT = dict(seed='large-material-rb10-v1', records=88003, actualAssetBytes=75497472,
                normalEdits=112, completeHistory=113, portablePending=113,
                downloadLimitMs=600000, progressLimitMs=2000, minimumActualSoakSeconds=7200)
ASSETS = {'cb2412ade4973232e3a878bab47bfe95ab73852e9c30d10e6783284e93d07ac8',
          '95dfa16729f2abcd367ff6a0b44d80d117d02e18be4b696b120b7a24238f298e',
          '7f2bed51835af886a64f04b343803cb8f86b5c368e3de147401bba2efe21b71b'}
FORMS = ('project_name_one_field', 'one_dialogue_text', 'atomic_two_dialogue_records')
SAVE_FIXTURES = ('a15eb7d1c10e6c008c9881cc215239a67fa80e28eef0f7627e4742a2de05c13e',
                 '2949e36167c88dc4ce0c776df5373047dd227fad03b67391709c672257518e99')
SAVE_ASSETS = ('4e36271cced61a01f5c6c575306bdef387beb6849837295a963ff293bd819148',
               'b3fbf0cf76486f67d1860bd9721aab841925e901cd63e43cdc6b0f10e2cf99bf',
               'b9924f2a66131701ec4409ce244bad47d6ce44b9a82824db31a71b72e3e4480f')


def require(value, message):
    if not value: raise ValueError(message)


def number(value):
    return type(value) in (int, float) and math.isfinite(value) and value >= 0


def sha(data): return hashlib.sha256(data).hexdigest()


def safe_relative(path):
    require(isinstance(path, str) and path and '\\' not in path and '\0' not in path and
            not path.startswith('/') and str(PurePosixPath(path)) == path and
            '..' not in PurePosixPath(path).parts, 'Unsafe evidence path')
    return path


def loads(data):
    def unique(pairs):
        result = {}
        for key, value in pairs:
            require(key not in result, 'Duplicate JSON key')
            result[key] = value
        return result
    def invalid(value): raise ValueError('Non-finite JSON number: ' + value)
    return json.loads(data, object_pairs_hook=unique, parse_constant=invalid)


def verify_archive(data, rows):
    require(len(rows) == len({r['path'] for r in rows}), 'Duplicate manifest member')
    expected = {safe_relative(r['path']): r for r in rows}
    result = {}
    with zipfile.ZipFile(io.BytesIO(data)) as archive:
        require(archive.namelist() == list(dict.fromkeys(archive.namelist())) and set(archive.namelist()) == set(expected),
                'Archive inventory differs')
        for member in archive.infolist():
            safe_relative(member.filename)
            require(not member.is_dir() and (member.external_attr >> 16) & 0o170000 != 0o120000, 'Unsafe archive member')
            value = archive.read(member)  # Full read also checks CRC.
            row = expected[member.filename]
            require(len(value) == row['bytes'] and sha(value) == row['sha256'], 'Archive bytes/SHA differ: '+member.filename)
            result[member.filename] = value
    return result


def recorded_relative(root, path):
    require(isinstance(root, str) and root.startswith('/') and isinstance(path, str) and path.startswith('/'), 'Expected recorded absolute path')
    try: relative = PurePosixPath(path).relative_to(PurePosixPath(root)).as_posix()
    except ValueError: raise ValueError('Artifact outside the recorded evidence root')
    return safe_relative(relative)


def verify_exit(receipt):
    require(type(receipt.get('returncode')) is int and receipt['returncode'] == 0 and
            receipt.get('executedWrapperBytesUnchanged') is True, 'Missing or unsuccessful actual child exit')


def verify_identity(raw, product):
    require(raw['sourceCommit'] == product['commit'] and raw['sourceTree'] == product['tree'] and
            raw['buildInfo'] == product and raw['dirty'] is False and product['dirty'] is False,
            'Source/build identity differs')


def assess_performance(raw, product, fixture):
    verify_identity(raw, product)
    require(raw['mode'] == 'performance' and raw['fixture']['sha256'] == fixture['sha256'] and
            raw['fixture']['assetHashes'] == fixture['assetHashes'], 'Original fixture identity differs')
    result = assess_original30(raw)
    final = raw['finalPersisted']
    require(final['revision'] == '31' and final['historyCount'] == final['outboxCount'] == 31 and
            final['recoveredPendingCount'] == 0, 'Original thirty saves were not durably retained')
    measurements = raw['measurements']
    starts = measurements['cached_startup']
    require(len(starts['editableProbes']) == 30, 'Missing editable startup observations')
    for value, probe in zip(starts['milliseconds'], starts['editableProbes']):
        require(probe['timeOrigin'] > 0 and probe['firstCardLabel'] and probe['firstCardLabel'] == probe['editorName'] and
                all(probe[key] is True for key in ('enabled', 'visible', 'focused', 'renderConfirmed')) and
                probe['readOnly'] is False and probe['inert'] is False and probe['stages']['confirmedAt'] == value,
                'Startup did not reach the matching usable editor')
        visibility = probe['visibilityEvidence']
        require(visibility['visible'] is True and visibility['intersection']['width'] > 0 and
                visibility['intersection']['height'] > 0 and visibility['effectiveOpacity'] > 0 and
                all(row['display'] != 'none' and row['visibility'] not in ('hidden', 'collapse') for row in visibility['styles']),
                'Startup editor was not visibly rendered')
    for key in ('timeline_frames', 'graph_frames'):
        row = measurements[key]
        require(len(row['gestures']) == 30, 'Missing original gestures')
        gestures = [g if isinstance(g, list) else g['frames'] for g in row['gestures']]
        require(all(len(g) == 11 for g in gestures) and [v for g in gestures for v in g] == row['milliseconds'],
                'Frame samples differ from original thirty gestures')
    require(all(g['after'] - g['before'] == (240 if i % 2 == 0 else -240)
                for i, g in enumerate(measurements['graph_frames']['gestures'])), 'Graph did not actually move')
    return result


def verify_soak_workload(raw):
    require(raw['contract'] == CONTRACT and raw['runKind'] == 'actual_7200_second_soak' and
            raw['completed'] is True and raw['fullInputRecoveryCompleted'] is True and raw['status'] == 'completed' and
            raw['errors'] == [], 'Incomplete original soak/full-input run')
    soak = raw['soak']
    require(soak['completed'] is True and soak['requiredSeconds'] == 7200 and
            number(soak['elapsedSeconds']) and soak['elapsedSeconds'] >= 7200, 'Actual 7200 seconds not observed')
    require(len(raw['edits']) == len(raw['activities']) == len(raw['soakChecks']) == 112 and
            len(raw['checkpoints']) == 14, 'Original workload/checkpoints incomplete')
    for index, (edit, activity, check) in enumerate(zip(raw['edits'], raw['activities'], raw['soakChecks'])):
        require(edit['index'] == activity['edit'] == index and
                activity['search']['query'] == f'継続編集{index}' and activity['search']['matchingSourceRendered'] is True and
                activity['trial']['completed'] is True, 'Missing normal edit/search/trial')
        viewport = activity['viewport']
        require(viewport['width'] == (390 if index % 2 == 0 else 1440) and
                viewport['height'] == (844 if index % 2 == 0 else 1000) and viewport['physicalOrientation'] is False,
                'Original viewport workload differs')
        require(bool(activity.get('offlineCold', {}).get('completed')) == ((index+1) % 5 == 0), 'Original offline cold workload missing')
        require(check['records'] == 88003 and check['historyCount'] == check['pendingCount'] == index+2,
                'Normal source history/pending order differs')


def verify_history(expected, actual, mapping):
    require(len(expected) == len(actual), 'Missing restored history')
    for source, restored in zip(expected, actual):
        require(source['revision'] == restored['revision'] and
                source['hash'] == restored['sourceHash'] == restored['actualHash'] and
                restored['operationId'] == mapping.get(source['operationId'], source['operationId']),
                'Restored history identity/order/hash differs')


def verify_pending(expected, actual, mapping):
    by_sequence = {r['sequence']: r for r in expected}
    require(len(by_sequence) == len(expected) == len(actual) and
            {r['sequence'] for r in actual} == set(by_sequence), 'Missing/duplicate pending sequence')
    for row in actual:
        source = by_sequence[row['sequence']]
        require(row['sourceHash'] == source['hash'] and row['commandHash'] == row['actualHash'] and
                row['origin'] == source['origin'] and
                row['operationId'] == mapping.get(source['operationId'], source['operationId']), 'Pending identity/hash/origin differs')
        parts = row['nativeParts']
        require(parts and [p['sequence'] for p in parts] == list(range(len(parts))) and
                all(type(p['bytes']) is int and p['bytes'] > 0 and re.fullmatch('[0-9a-f]{64}', p['sha256']) for p in parts),
                'Missing/invalid actual native pending parts')


def verify_mapping(ids, mapping):
    require(set(mapping) == ids and len(set(mapping.values())) == len(ids) and not ids.intersection(mapping.values()),
            'Clone mapping is not a disjoint full bijection')


def verify_large_assets(rows, actual_hash=False):
    require(len(rows) == 3 and {r['hash'] for r in rows} == ASSETS and
            all(r['bytes'] == 25165824 and (not actual_hash or r['actualHash'] == r['hash']) for r in rows),
            'Actual 72MiB material bytes/hashes differ')


def assess_saves(raw, product):
    require(raw['commit'] == product['commit'] and raw['tree'] == product['tree'] and raw['build'] == product['version'] and
            raw['result'] == 'passed_local_original_three_save_forms_and_native_cold_empty_complete_restore' and
            raw['errors'] == [] and raw['finishedAt'] and raw['samplesPerForm'] == 30 and len(raw['cases']) == 2,
            'Incomplete original 180-save run')
    result, operations = [], []
    for index, case in enumerate(raw['cases']):
        fixture = case['fixture']
        require(fixture['seed'] == 'standard-r06-v1' and fixture['coreRecords'] == 8800 and fixture['records'] == 8800+index*3 and
                fixture['fixtureSHA256'] == SAVE_FIXTURES[index] and
                fixture['assetHashes'] == ([dict(hash=h, bytes=1048576) for h in SAVE_ASSETS] if index else []) and
                [r['form'] for r in case['forms']] == list(FORMS), 'Original six save conditions differ')
        require(case['before']['historyCount'] == case['before']['outboxCount'] == 1 and case['after'] == case['afterCold'], 'Cold save state differs')
        final, restored = case['after'], case['empty390ColdRestoration']
        require(final['records'] == 8800+index*3 and final['revision'] == '91' and final['historyCount'] == final['outboxCount'] == 91 and
                final['recoveredPendingCount'] == 0 and restored['contentHash'] == final['contentHash'] and restored['records'] == final['records'] and
                restored['historyCount'] == restored['recoveredPendingCount'] == 91 and restored['outboxCount'] == 1 and
                case['restorationProgress']['stage'] == 'native_hash_history_pending_assets_confirmed', 'Original 91-command/cold/empty recovery differs')
        require(len(final['assets']) == 3*index and final['assets'] == restored['assets'] and
                all(r['bytes'] == 1048576 and r['verified'] is True for r in final['assets']), 'Actual attached save assets differ')
        for form_index, form in enumerate(case['forms']):
            samples = form['samples']; summary = form['summary']
            require(len(samples) == summary['count'] == 30, 'Missing original save samples')
            command = [r['commandMilliseconds'] for r in samples]; ui = [r['uiMilliseconds'] for r in samples]
            require(all(number(v) for v in command+ui), 'Invalid original command/UI interval')
            p95 = lambda values: sorted(values)[math.ceil(len(values)*.95)-1]
            require(p95(command) == summary['commandP95'] <= 1000 and p95(ui) == summary['uiP95'] and
                    summary['commandTarget'] == 1000 and summary['commandNumericResult'] == 'within_original_limit', 'Original save threshold/summary differs')
            for row in samples:
                operations.append(row['operationId'])
                writes = sum(v for k, v in row['calls'].items() if re.fullmatch(r'entities\.(put|add|delete)', k))
                require(writes == form_index and not any(re.fullmatch(r'commands\.(index\.[^.]+\.)?(getAll|getAllKeys|openCursor|openKeyCursor)', k) for k in row['calls']) and
                        type(row['digestCalls']) is int and 0 <= row['digestCalls'] < 5000, 'Original actual write/read/hash contract differs')
            result.append(dict(fixture=case['label'], form=form['form'], samples=30, commandP95Ms=p95(command), uiP95Ms=p95(ui), originalLimitMs=1000))
    require(len(operations) == len(set(operations)) == 180, 'Missing/duplicate actual save operation')
    return result


def assess_soak(raw, product):
    verify_identity(raw, product)
    verify_soak_workload(raw)
    require(raw['before'] == raw['afterCancel'] == raw['afterExport'], 'Cancel/export mutated durable source')
    before = raw['before']
    require(before['records'] == 88003 and before['historyCount'] == before['pendingCount'] == 113 and
            before['revision'] == '113', 'Source is not the full original 113/113')
    verify_large_assets(before['assets'])
    for row in raw['checkpoints'] + raw['soakChecks']: verify_large_assets(row['assets'])
    cancel, export = raw['cancelTiming'], raw['exportTiming']
    require(cancel['status'] == 'measured' and cancel['limitMs'] == 2000 and number(cancel['elapsedMs']) and
            0 < cancel['elapsedMs'] <= 2000 and cancel['elapsedMs'] == cancel['alertPaintAt']-cancel['pointerAt'], 'Cancel timing unmeasured/outside original limit')
    require(export['status'] == export['firstPaintStatus'] == export['heartbeatStatus'] == 'measured' and
            all(number(export[k]) for k in ('elapsedMs', 'firstPaintElapsedMs', 'maximumTimerGap')) and
            export['timerTicks'] > 0 and 0 < export['elapsedMs'] <= 600000 and
            0 < export['firstPaintElapsedMs'] <= 2000 and 0 < export['maximumTimerGap'] <= 2000 and
            export['firstPaintElapsedMs'] == export['firstPaintAt']-export['startedAt'] and
            export['elapsedMs'] == export['finishedAt']-export['startedAt'], 'Export/progress/heartbeat outside original limits')
    expected = raw['expected']
    ids = {r['id'] for r in expected['owned']}
    require(len(expected['owned']) == len(ids) == 162117 and
            len(expected['history']) == len({r['operationId'] for r in expected['history']}) == 113 and
            {r['sequence'] for r in expected['history']} == set(range(113)), 'Incomplete independent full-input oracle')
    verify_large_assets(expected['assetHashes'])
    require(set(raw['restoration']) == {'new', 'clone'}, 'Missing new/clone cold recovery')
    for mode, restored in raw['restoration'].items():
        require(restored['records'] == 88003 and restored['currentHash'] == expected['currentHash'] and
                restored['revision'] == ('113' if mode == 'new' else '114'), 'Restored current edition differs')
        mapping = restored['importLog']['idMap']
        if mode == 'new': require(not mapping and restored['projectId'] == expected['projectId'], 'New recovery changed identity')
        else:
            verify_mapping(ids, mapping)
            require(mapping[expected['projectId']] == restored['projectId'], 'Clone project identity differs')
        verify_history(expected['history'], restored['history'], mapping)
        verify_pending(expected['history'], restored['pending'], mapping)
        verify_large_assets(restored['assets'], actual_hash=True)
        require(restored['saveState'] == dict(localSaved=True, pendingCount=1, recoveredPendingCount=113,
                                            pendingAssetCount=3, serverRevision='0', syncState='pending'), 'Restored durable save/pending state differs')
    require(raw['helperRetention']['status'] == 'retained_and_verified_before_after' and
            all(raw['helperRetention'][phase]['sourceUnchanged'] is True and raw['helperRetention'][phase]['retainedUnchanged'] is True
                for phase in ('before', 'after')) and raw['helperRetention']['before']['retainedFiles'] == raw['helperRetention']['after']['retainedFiles'],
            'Original helper changed')
    cleanup = raw['cleanup']
    require(cleanup['status'] == 'completed' and cleanup['errors'] == [] and
            all(cleanup[k] == 'closed' for k in ('browser', 'server', 'temporary_helper')), 'Run cleanup incomplete')
    return dict(actualSeconds=raw['soak']['elapsedSeconds'], records=88003, history=113, pending=113,
                typedOwnedIds=len(ids), actualAssetBytes=75497472, exportMilliseconds=export['elapsedMs'],
                firstPaintMilliseconds=export['firstPaintElapsedMs'], cancelMilliseconds=cancel['elapsedMs'],
                maximumUIIntervalMilliseconds=export['maximumTimerGap'], newCloneCold='passed_observed_full_correspondence')


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--soak', type=Path)
    parser.add_argument('--product', type=Path)
    parser.add_argument('--evidence', type=Path)
    args = parser.parse_args()
    if args.evidence:
        from acceptance.verify_bundle import validate
        try: print(json.dumps(validate(args.evidence), ensure_ascii=False))
        except (OSError, ValueError, KeyError, TypeError, zipfile.BadZipFile) as error:
            print('PHASE3 EVIDENCE REJECTED:', error, file=sys.stderr); sys.exit(1)
    elif args.soak and args.product:
        try: print(json.dumps(assess_soak(loads(args.soak.read_bytes()), loads(args.product.read_bytes())['build_info']), ensure_ascii=False))
        except (OSError, ValueError, KeyError, TypeError) as error:
            print('PHASE3 EVIDENCE REJECTED:', error, file=sys.stderr)
            sys.exit(1)
    else: parser.error('--soak and --product are required')
