"""Verify the phase-one audit bindings without changing original acceptance."""
from __future__ import annotations

import hashlib
import json
from pathlib import Path, PurePosixPath
import re
import sys

BASE = 'f40d07afb709b91db1ec439c0a5503682ecab91b'
COUNTS = {'requirements': 104, 'cases': 116, 'clauses': 464, 'workPackages': 24, 'regressionGroups': 6, 'supplemental': 68}
FOLDER = Path('docs/optimization/phase1')


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
        for path in row['paths'] + row['procedureSources']:
            if not safe_path(path) or not (root / path).is_file():
                raise ValueError(f'Missing concrete production/procedure path: {path}')
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
    return {'originalContracts': len(paths), **COUNTS, 'auditCandidates': 23, 'optimizationCandidates': 15, 'acceptancePromoted': False}


if __name__ == '__main__':
    try:
        print(json.dumps(validate(Path(__file__).resolve().parents[1]), ensure_ascii=False))
    except (OSError, ValueError, KeyError, IndexError, TypeError) as error:
        print(f'Phase1 binding failed: {error}', file=sys.stderr)
        sys.exit(1)
