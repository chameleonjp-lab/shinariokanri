"""Bind phase-2 supplemental measurements to literal sources and raw samples."""
from __future__ import annotations
from datetime import datetime
import argparse
import hashlib
import json
import math
from pathlib import Path
import re
import sys
import zipfile

sys.path.insert(0, str(Path(__file__).parent))
from check_phase2_reassessment import FIXTURES, ASSETS, require, number, integer, load, safe_file, safe_relative, git_hash, verify_source_files

FOLDER = 'docs/optimization/phase2/p2-06-07'
SCOPE = 'Supplemental actual-App/native-IDB observations; not formal phase3 acceptance'
SEQUENCE = ['霧', '霧の', '門番', '記録', '霧', '霧の']


def summary(values):
    values = sorted(values)
    return dict(count=len(values), minimum=values[0], median=values[math.ceil(len(values)*.5)-1], p95=values[math.ceil(len(values)*.95)-1], maximum=values[-1])


def verify_capture(raw):
    require(raw.get('version') == 1 and raw.get('repetitions') == 30 and raw.get('sequence') == SEQUENCE, 'not the thirty-repetition definition')
    require(raw.get('scope') == SCOPE and raw.get('literalSourceVerified') is True, 'unproved source or promoted acceptance')
    require(raw.get('status') == 'ok' and raw.get('errors') == [] and raw.get('unexpectedRequests') == [], 'failed or nonlocal run')
    require(datetime.fromisoformat(raw['finishedAt']) >= datetime.fromisoformat(raw['recordedAt']), 'incomplete chronology')
    require(raw['suite'] in FIXTURES, 'unknown suite')
    seed, records, entities, asset_bytes, digest = FIXTURES[raw['suite']]
    cohorts = raw['cohorts']
    require(len(cohorts) == 2 and [c['enabled'] for c in cohorts] == [False, True], 'missing separate OFF/ON')
    shared = None
    for cohort in cohorts:
        enabled, observed = cohort['enabled'], cohort['observations']
        require(cohort.get('status') == observed.get('status') == 'ok' and not observed.get('activeAction') and not observed.get('activeOperation'), 'incomplete observation')
        require(observed['options']['enabled'] is enabled and observed['options']['suite'] == raw['suite'], 'cohort binding differs')
        fixture = observed['fixture']
        require(fixture['seed'] == seed and fixture['counts']['totalRecords'] == records and fixture['assetBytes'] == asset_bytes and fixture['sha256'] == digest, 'original fixture differs')
        require(fixture['wireJsonSha256'] == ('32e7995933c9e0ca6af2330df1036d0c182ad34810d41e45b0a9530d42998f4f' if asset_bytes else digest) and fixture['jsonBytes'] == (59407368 if asset_bytes else 6258972), 'original fixture bytes differ')
        assets = [dict(bytes=25165824, sha256=value) for value in ASSETS] if asset_bytes else []
        require(fixture['assets'] == observed['nativeAssets'] == assets, 'actual native material bytes differ')
        expected = observed['expected']
        for query in set(SEQUENCE + ['']):
            count = entities if query == '' else (200 if asset_bytes else 20) if query == '門番' else (67000 if asset_bytes else 6700)
            require(expected[query]['count'] == count and re.fullmatch('[0-9a-f]{64}', expected[query]['sha256']), 'independent expected result differs')
        require(observed['expectedParticipant']['count'] == 15 and re.fullmatch('[0-9a-f]{64}', observed['expectedParticipant']['sha256']), 'participant oracle differs')
        require(observed.get('inputUnchanged') is True and observed.get('orderedResultsVerified') is True and observed['savedSource'] == observed['postReadSource'], 'read-only UI changed source or ordered results unverified')
        bindings = {key: observed[key] for key in ('fixture', 'nativeAssets', 'expected', 'expectedParticipant', 'savedSource', 'renameInput')}
        if shared is None: shared = bindings
        else: require(shared == bindings, 'OFF/ON input or ordered oracle differs')
        after_close = observed.get('afterClose')
        # Literal baseline has no ownership API. Unsupported is null/UNKNOWN;
        # a supported candidate must release every logical counter.
        if after_close is not None:
            require(set(after_close) == {'owners', 'entries', 'references', 'textCodeUnits'} and all(type(v) is int and v == 0 for v in after_close.values()), 'close retained indexes')

        def observation(row):
            require(row.get('status', 'ok') == 'ok' and row.get('apiCompletion') == 'fulfilled', 'unknown/failed completion')
            if enabled:
                require('milliseconds' not in row, 'ON elapsed promoted to latency')
                probe = row['probe']
                require(probe['pendingTransactions'] == 0 and probe['droppedEvents'] == 0 and all(number(v) for v in probe['counters'].values()), 'incomplete probe')
            else:
                require(number(row.get('milliseconds')) and 'probe' not in row, 'invalid OFF latency or enabled probe')

        observation(observed['startup'])
        actions = observed['actions']
        require(len(actions) == 240, 'missing query/navigation samples')
        query_rows = actions[:180]
        require([(r['expectation'].get('repetition'), r['expectation'].get('queryIndex'), r['expectation'].get('query')) for r in query_rows] == [(n, i, q) for n in range(30) for i, q in enumerate(SEQUENCE)], 'query observation order differs')
        for row in query_rows:
            observation(row)
            query = row['expectation']['query']
            require(row['query'] == query and row['count'] == f"{expected[query]['count']}件" and row['names'] == expected[query]['firstNames'], 'actual UI differs from original oracle')
        selected_page = observed['selection']['index'] // 60
        nav_rows = actions[180:]
        require([(r['expectation'].get('repetition'), r['expectation'].get('page')) for r in nav_rows] == [(n, p) for n in range(30) for p in (selected_page-1, selected_page)], 'selected/page observation order differs')
        for row in nav_rows:
            observation(row)
            require(row['pager'].startswith(f"{row['expectation']['page']+1} / "), 'actual UI page differs')
        operations = observed['operations']
        labels = ['listProjectSummaries', 'loadEditor', 'historyPage'] + [f'participant-{n}' for n in range(30)] + ['rename-one']
        require([r['label'] for r in operations] == labels, 'public API/participant observations incomplete')
        for row in operations: observation(row)
    off = cohorts[0]['observations']
    expected_summary = dict(queries=[summary([r['milliseconds'] for r in off['actions'][:180] if r['expectation']['queryIndex'] == i]) for i in range(6)], navigation=summary([r['milliseconds'] for r in off['actions'][180:]]), participant=summary([r['milliseconds'] for r in off['operations'] if r['label'].startswith('participant-')]))
    require(raw['summary'] == expected_summary, 'summary differs from every raw sample')


def verify_archive(folder, descriptor, records):
    data = safe_file(folder, descriptor['path']).read_bytes()
    require(len(data) == descriptor['bytes'] and hashlib.sha256(data).hexdigest() == descriptor['sha256'], 'archive bytes differ')
    expected = {r['path']: r for r in records}
    require(len(expected) == len(records), 'duplicate manifest member')
    with zipfile.ZipFile(safe_file(folder, descriptor['path'])) as archive:
        require(len(archive.infolist()) == len(expected) and {m.filename for m in archive.infolist()} == set(expected), 'archive coverage/duplicate differs')
        for member in archive.infolist():
            safe_relative(member.filename)
            payload = archive.read(member)
            require(len(payload) == expected[member.filename]['bytes'] and hashlib.sha256(payload).hexdigest() == expected[member.filename]['sha256'], 'archived member bytes differ')


def verify_artifacts(folder, raw):
    for descriptor, records in [('sourceArchive', 'sourceFiles'), ('runtimeArchive', 'runtimeFiles'), ('overlayArchive', 'overlays'), ('buildArchive', 'buildFiles')]:
        verify_archive(folder, raw[descriptor], raw[records])
    verify_source_files(folder, raw, safe_file(folder, raw['sourceArchive']['path']))
    # Additional build/runtime paths are bound to the same commit/tree. They
    # cannot be smuggled into the original helper's exact source coverage.
    with zipfile.ZipFile(safe_file(folder, raw['runtimeArchive']['path'])) as archive:
        for row in raw['runtimeFiles']:
            current = raw['sourceTree']
            for part in Path(row['path']).parts:
                entry = next((e for e in raw['sourceProof']['trees'][current] if e['name'] == part), None)
                require(entry is not None, 'runtime path outside measured commit')
                current = entry['sha']
            require(current == git_hash('blob', archive.read(row['path'])), 'runtime blob outside measured commit')


def validate(root):
    folder = root / FOLDER
    manifest = load(folder / 'evidence-manifest.json')
    require(manifest['releaseState'] == 'RELEASE BLOCKED' and manifest['originalAcceptancePerformed'] is False, 'release/acceptance promoted')
    for row in manifest['files']:
        data = safe_file(root, row['path']).read_bytes()
        require(len(data) == row['bytes'] and hashlib.sha256(data).hexdigest() == row['sha256'], 'manifest artifact bytes differ')
    runs = []
    for record in manifest['runs']:
        raw_path = safe_file(root, record['path'])
        raw = load(raw_path); verify_capture(raw); verify_artifacts(raw_path.parent, raw)
        raw['label'] = record['label']; runs.append(raw)
    require({(r['label'], r['suite']) for r in runs} == {(label, suite) for label in manifest['labels'] for suite in FIXTURES}, 'incomplete source/suite matrix')
    require(len(runs) == len(manifest['labels'])*2, 'duplicate source/suite capture')
    for previous, current in zip(runs, runs[1:]):
        require(datetime.fromisoformat(previous['finishedAt']) <= datetime.fromisoformat(current['recordedAt']), 'heavy measurements overlap')
    for raw in runs:
        require(raw['sourceCommit'] == manifest['sources'][raw['label']] and raw['overlays'] == runs[0]['overlays'] and raw['environment'] == runs[0]['environment'], 'source, overlay or environment cohort differs')
    for suite in FIXTURES:
        cohort = [r for r in runs if r['suite'] == suite]
        for raw in cohort[1:]:
            for key in ('fixture', 'expected', 'expectedParticipant', 'savedSource', 'renameInput'):
                require(raw['cohorts'][0]['observations'][key] == cohort[0]['cohorts'][0]['observations'][key], 'matched-source input differs')
    return runs


if __name__ == '__main__':
    parser = argparse.ArgumentParser(); parser.add_argument('--root', type=Path, default=Path(__file__).resolve().parents[1]); parser.add_argument('--capture', type=Path); args = parser.parse_args()
    if args.capture:
        raw = load(args.capture); verify_capture(raw); verify_artifacts(args.capture.parent, raw)
    else: validate(args.root)
    print('phase2 derived-index evidence: PASS (supplemental only; RELEASE BLOCKED)')
