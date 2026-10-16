"""Verify the phase-one audit bindings without changing original acceptance."""
from __future__ import annotations

import hashlib
import gzip
import io
import json
import math
from pathlib import Path, PurePosixPath
import re
import sys
import tarfile

BASE = 'f40d07afb709b91db1ec439c0a5503682ecab91b'
COUNTS = {'requirements': 104, 'cases': 116, 'clauses': 464, 'workPackages': 24, 'regressionGroups': 6, 'supplemental': 68}
FOLDER = Path('docs/optimization/phase1')
METRICS = ('cached_startup', 'selection', 'list_switch', 'compound_search', 'command_save', 'next_period', 'timeline_frames', 'graph_frames')
LIMITS = {'standard': (3000, 200, 200, 500, 1000, 200, 33.4, 33.4), 'large': (10000, None, None, 2000, None, None, None, None)}


def load(root: Path, path: str | Path):
    return json.loads((root / path).read_text())


def safe_path(path: str) -> bool:
    return bool(path) and not path.startswith('/') and '\\' not in path and all(part not in ('.', '..') for part in PurePosixPath(path).parts)


def verify_blob(root: Path, record: dict):
    path = record['path']
    if not safe_path(path):
        raise ValueError('Unsafe contract path')
    data = (root / path).read_bytes()
    digest = hashlib.sha1(f'blob {len(data)}\0'.encode() + data).hexdigest()
    if len(data) != record['bytes'] or digest != record['gitBlob']:
        raise ValueError(f'Original contract changed: {path}')


def verify_trace(requirements: list, cases: list, trace: list):
    expected = {row['id'] for row in requirements}
    ids = [row['id'] for row in trace]
    if len(ids) != 104 or len(set(ids)) != 104 or set(ids) != expected:
        raise ValueError('Original104 requirement coverage is incomplete or duplicated')
    by_requirement = {row['id']: row for row in requirements}
    for row in trace:
        original = by_requirement[row['id']]
        if row['title'] != original['title'] or row['workPackage'] != original['package_id']:
            raise ValueError('Requirement meaning/package was changed')
        if row['freshAcceptance'] != 'NOT_PERFORMED' or not row['paths'] or not row['clauses']:
            raise ValueError('Static path review cannot promote acceptance')
        expected_cases = {case['id'] for case in cases if row['id'] in case['requirementIds']}
        if {clause['case'] for clause in row['clauses']} != expected_cases:
            raise ValueError('Original clause references are incomplete')
        for clause in row['clauses']:
            match = re.fullmatch(r'docs/quality/pr49-followup-2026-10-15/CLAUSE_REVIEW.json#/cases/(\d+)/clauses', clause['pointer'])
            if not match:
                raise ValueError('Unbound original clause pointer')
            case = cases[int(match[1])]
            if case['id'] != clause['case'] or row['id'] not in case['requirementIds'] or clause['names'] != [value['name'] for value in case['clauses']]:
                raise ValueError('Mismatched original clause pointer')


def assess_original30(raw: dict):
    size = raw['size']
    if raw['errors'] or not raw.get('finishedAt') or raw['samples'] != 30 or raw['dirty'] or raw['buildInfo']['dirty']:
        raise ValueError('Incomplete or unsealed original30 run')
    fixture = raw['fixture']
    if fixture['seed'] != ('standard-r06-v1' if size == 'standard' else 'large-material-rb10-v1') or fixture['counts']['totalRecords'] != (8800 if size == 'standard' else 88003) or fixture['assetBytes'] != (0 if size == 'standard' else 75497472):
        raise ValueError('Original fixture/seed/material bytes differ')
    for point in ('initialAssetsVerified', 'finalPersisted'):
        observation = raw[point]
        assets = observation['assets']
        if observation['records'] != fixture['counts']['totalRecords'] or len(assets) != (0 if size == 'standard' else 3) or sum(row['bytes'] for row in assets) != fixture['assetBytes'] or any(row['verified'] is not True for row in assets):
            raise ValueError('Actual native/material byte verification differs')
        if size == 'large' and [(row['hash'], row['bytes']) for row in assets] != [(row['hash'], row['bytes']) for row in fixture['assetHashes']]:
            raise ValueError('Actual material SHA binding differs')
    if raw['helperRetention']['status'] != 'retained_and_verified_before_after':
        raise ValueError('Original helper build was not sealed')
    for point in ('before', 'after'):
        retention = raw['helperRetention'][point]
        if not retention['sourceUnchanged'] or not retention['retainedUnchanged']:
            raise ValueError('Served/retained helper changed')
    result = {}
    for key, limit in zip(METRICS, LIMITS[size]):
        metric = raw['measurements'][key]
        values = metric['milliseconds']
        expected = 330 if key in ('timeline_frames', 'graph_frames') else 30
        if len(values) != expected or metric['count'] != expected or any(type(value) not in (int, float) or not math.isfinite(value) or value < 0 for value in values):
            raise ValueError(f'Original count/raw values differ: {key}')
        p95 = sorted(values)[math.ceil(len(values) * .95) - 1]
        if p95 != metric['p95'] or max(values) != metric['maximum']:
            raise ValueError(f'Nearest-rank/raw maximum differs: {key}')
        result[key] = {'samples': len(values), 'p95Milliseconds': p95, 'originalLimitMs': limit, 'result': 'observed_no_separate_large_limit' if limit is None else 'passed_local_numeric_condition' if p95 <= limit else 'failed_local_numeric_condition'}
    return result


def verify_build_retention(folder: Path):
    binding = json.loads((folder / 'build-retention.json').read_text())
    if not safe_path(binding['archive']):
        raise ValueError('Unsafe build archive path')
    compressed = (folder / binding['archive']).read_bytes()
    if hashlib.sha256(compressed).hexdigest() != binding['archiveSHA256']:
        raise ValueError('Build archive SHA differs')
    # Read the complete gzip stream, including its CRC, then inspect without extraction.
    with tarfile.open(fileobj=io.BytesIO(gzip.decompress(compressed)), mode='r:') as archive:
        actual = archive.getmembers()
        expected = binding['members']
        if [row.name for row in actual] != [row['path'] for row in expected] or len({row.name for row in actual}) != len(actual):
            raise ValueError('Build archive member set differs')
        by_path = {row['path']: row for row in expected}
        for member, record in zip(actual, expected):
            if not member.isfile() or not safe_path(member.name):
                raise ValueError('Unsafe build archive member')
            data = archive.extractfile(member).read()
            if len(data) != record['bytes'] or hashlib.sha256(data).hexdigest() != record['sha256']:
                raise ValueError('Retained served build bytes differ')
    for row in binding['bindings']:
        raw = json.loads((folder / row['raw']).read_text())
        for record in raw.get('artifactFiles', raw.get('buildFiles', [])):
            if record['path'].startswith('measurement-helper/'):
                path = row['helperPrefix'] + '/' + record['path'].removeprefix('measurement-helper/')
            else:
                path = row['productionPrefix'] + '/' + record['path'].removeprefix('dist/')
            retained = by_path[path]
            if retained['bytes'] != record['bytes'] or retained['sha256'] != record['sha256']:
                raise ValueError('Raw measurement/retained build binding differs')
    return len(expected)


def validate(root: Path):
    lock = load(root, FOLDER / 'contract-lock.json')
    if lock['baseCommit'] != BASE or lock['counts'] != COUNTS:
        raise ValueError('Original scope/base cannot be reduced')
    paths = [row['path'] for row in lock['files']]
    if len(paths) != len(set(paths)) or len(paths) < 70:
        raise ValueError('Missing or duplicate original inputs')
    for record in lock['files']:
        verify_blob(root, record)
    requirements = load(root, 'docs/data/requirements.json')
    cases = load(root, 'docs/quality/pr49-followup-2026-10-15/CLAUSE_REVIEW.json')['cases']
    if len(requirements) != 104 or len(cases) != 116 or sum(len(row['clauses']) for row in cases) != 464:
        raise ValueError('Original requirement/case/clause count changed')
    trace = load(root, FOLDER / 'requirements.json')
    if trace['baseCommit'] != BASE:
        raise ValueError('Trace base differs')
    verify_trace(requirements, cases, trace['requirements'])
    for row in trace['requirements']:
        if not row['auditCandidates'] or any(not re.fullmatch(r'AUD-(?:00[1-9]|01[0-9]|02[0-3])', value) for value in row['auditCandidates']):
            raise ValueError('Unbound audit-to-requirement trace')
        for path in row['paths'] + row['procedureSources']:
            if not safe_path(path) or not (root / path).is_file():
                raise ValueError(f'Missing concrete production/procedure path: {path}')
    index = load(root, FOLDER / 'trace-index.json')['audit']
    if [row['id'] for row in index] != [f'AUD-{i:03}' for i in range(1, 24)]:
        raise ValueError('Incomplete audit reverse index')
    for row in index:
        expected = {requirement['id'] for requirement in trace['requirements'] if row['id'] in requirement['auditCandidates']}
        if set(row['requirements']) != expected or not expected:
            raise ValueError('Audit reverse index differs')
    audit = (root / FOLDER / 'AUDIT.md').read_text()
    if not all(f'| {i:03} |' in audit for i in range(1, 24)):
        raise ValueError('Incomplete AUD001-023 review')
    design = (root / FOLDER / 'DESIGN.md').read_text()
    if not all(f'D{i:02} / OPT-{i:02}' in design for i in range(1, 16)):
        raise ValueError('Incomplete OPT01-15 comparisons')
    sources = load(root, FOLDER / 'sources.json')
    if sources['releaseDecision'] != 'RELEASE BLOCKED' or sources['externalUnexecuted'] != 22:
        raise ValueError('External conditions were promoted')
    manifest = root / FOLDER / 'evidence/manifest.json'
    if manifest.exists():
        packet = json.loads(manifest.read_text())
        if packet['baseCommit'] != BASE or packet['acceptancePromoted'] is not False:
            raise ValueError('Evidence identity or acceptance claim differs')
        for record in packet['files']:
            path = record['path']
            if not safe_path(path):
                raise ValueError('Unsafe evidence path')
            data = (root / FOLDER / 'evidence' / path).read_bytes()
            if len(data) != record['bytes'] or hashlib.sha256(data).hexdigest() != record['sha256']:
                raise ValueError(f'Evidence bytes differ: {path}')
        for label in ('baseline', 'candidate'):
            for size in ('standard', 'large'):
                raw = load(root, FOLDER / f'evidence/{label}-{size}30.json')
                commit = BASE if label == 'baseline' else packet['productCommit']
                if raw['sourceCommit'] != commit or raw['buildInfo']['commit'] != commit or raw['sourceTree'] != raw['buildInfo']['tree']:
                    raise ValueError('Raw source/build identity differs')
                assessed = assess_original30(raw)
                if any(value['result'] == 'failed_local_numeric_condition' for value in assessed.values()):
                    raise ValueError(f'Original local threshold failed: {label}/{size}')
        for size in ('standard', 'large'):
            if load(root, FOLDER / f'evidence/baseline-{size}30.json')['fixture']['sha256'] != load(root, FOLDER / f'evidence/candidate-{size}30.json')['fixture']['sha256']:
                raise ValueError('Before/after original fixture SHA differs')
        verify_build_retention(root / FOLDER / 'evidence')
    return {'originalContracts': len(paths), **COUNTS, 'auditCandidates': 23, 'optimizationCandidates': 15, 'acceptancePromoted': False}


if __name__ == '__main__':
    try:
        print(json.dumps(validate(Path(__file__).resolve().parents[1]), ensure_ascii=False))
    except (OSError, ValueError, KeyError, IndexError, TypeError) as error:
        print(f'Phase1 binding failed: {error}', file=sys.stderr)
        sys.exit(1)
