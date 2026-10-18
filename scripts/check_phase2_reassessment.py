"""Verify supplemental phase2 evidence; never promotes original acceptance."""
from __future__ import annotations

from datetime import datetime
import hashlib
import json
import math
from pathlib import Path, PurePosixPath
import re
import sys

FOLDER = 'docs/optimization/phase2/reassessment-20261018'
BASE = 'b32de9525c4acf5206ac3d6d1d23f5b90967ec95'
PRODUCT = '73263a85e2ef2ead9799f91125ba54fb643182b4'
MODES = ['current', 'corpus', 'results']
SEQUENCE = [{'op': 'text', 'value': value} for value in ('霧', '霧の', '門番', '記録', '霧', '霧の')]
LIMITS = {'maxTextBytes': 8388608, 'maxResultEntries': 8, 'maxResultReferences': 100000}
FIXTURES = {
    'standard': ('standard-r06-v1', 8800, 6800, 0, 'de0b9420abec95bcc37fc7fb7c3dc4c2667082258678f750af33bb53f8a557f5'),
    'large': ('large-material-rb10-v1', 88003, 68003, 75497472, '814daf96a6511cf47409f3497b03c7ba0309af250bfd87306c44a1dec5d5a917'),
}
ASSETS = ['cb2412ade4973232e3a878bab47bfe95ab73852e9c30d10e6783284e93d07ac8', '95dfa16729f2abcd367ff6a0b44d80d117d02e18be4b696b120b7a24238f298e', '7f2bed51835af886a64f04b343803cb8f86b5c368e3de147401bba2efe21b71b']


def require(ok, message):
    if not ok:
        raise ValueError(message)


def number(value):
    return type(value) in (int, float) and math.isfinite(value) and value >= 0


def integer(value):
    return type(value) is int and value >= 0


def verify_run(raw):
    require(raw.get('version') == 1 and raw.get('repetitions') == 30, 'run definition is not thirty')
    require(raw.get('dirty') is False and raw.get('errors') == [] and raw.get('finishedAt') and raw.get('inputUnchanged') is True, 'unsealed, failed or unfinished run')
    require(datetime.fromisoformat(raw['finishedAt']) >= datetime.fromisoformat(raw['recordedAt']), 'unsealed run chronology')
    require(raw.get('scope') == 'Supplemental Node source experiment, not original browser30/180/7200 acceptance', 'scope promotion')
    require(raw.get('productTree') == PRODUCT, 'product source differs from main')
    require(all(re.fullmatch('[0-9a-f]{40}', raw.get(key, '')) for key in ('sourceCommit', 'sourceTree')), 'unsealed source identity')
    require(raw.get('suite') in FIXTURES, 'unknown fixture suite')
    seed, records, entities, asset_bytes, digest = FIXTURES[raw['suite']]
    fixture = raw['fixture']
    require(fixture.get('seed') == seed and fixture.get('counts', {}).get('totalRecords') == records and fixture.get('assetBytes') == asset_bytes and fixture.get('sha256') == digest, 'original fixture differs')
    require(fixture.get('assets') == ([{'bytes': 25165824, 'sha256': value} for value in ASSETS] if asset_bytes else []), 'original fixture material bytes differ')
    require(raw.get('sequence') == SEQUENCE and raw.get('limits') == LIMITS, 'sequence or budget differs')
    counts = [6700, 6700, 20, 6700, 6700, 6700] if not asset_bytes else [67000, 67000, 200, 67000, 67000, 67000]
    expected = raw['expected']
    require(len(expected) == 6 and [row['count'] for row in expected] == counts and all(re.fullmatch('[0-9a-f]{64}', row.get('sha256', '')) for row in expected), 'independent expected counts differ')

    def retention(stats, closed=False):
        keys = ('retainedTerms', 'retainedUtf8Bytes', 'resultEntries', 'resultReferences', 'projectRows')
        require(all(integer(stats.get(key)) for key in keys) and stats.get('closed') is closed, 'missing/invalid retention')
        require(stats['retainedUtf8Bytes'] <= LIMITS['maxTextBytes'] and stats['resultEntries'] <= LIMITS['maxResultEntries'] and stats['resultReferences'] <= LIMITS['maxResultReferences'], 'retention exceeds budget')
        if closed:
            require(all(stats[key] == 0 for key in keys), 'close did not release logical indexes/source')
        else:
            require(stats['projectRows'] == entities, 'retention source row count differs')

    rows = raw['observations']
    require(len(rows) == 90, 'expected 90 mode/repetition observations')
    seen, timings = set(), {(mode, i): [] for mode in MODES for i in range(6)}
    for row in rows:
        mode, repetition = row['mode'], row['repetition']
        require(mode in MODES and type(repetition) is int and 0 <= repetition < 30, 'invalid observation identity')
        require((mode, repetition) not in seen, 'duplicate mode/repetition')
        seen.add((mode, repetition))
        rotation = repetition % 3
        require(row.get('order') == MODES[rotation:] + MODES[:rotation], 'rotating order differs')
        require(number(row.get('prepareMilliseconds')), 'invalid setup timing')
        require(len(row['queries']) == 6, 'incomplete query sequence')
        retention(row['retained']); retention(row['afterClose'], True)
        for i, query in enumerate(row['queries']):
            require(query.get('queryIndex') == i and {key: query.get(key) for key in ('count', 'sha256')} == expected[i], 'query result differs from original full path')
            require(number(query.get('milliseconds')), 'invalid query timing')
            timings[mode, i].append(query['milliseconds'])
    for mode in MODES:
        require(len(raw['summary'][mode]) == 6, 'incomplete summary')
        for i in range(6):
            values = sorted(timings[mode, i])
            summary = dict(count=30, minimum=values[0], median=values[14], p95=values[28], maximum=values[29])
            require(raw['summary'][mode][i] == summary, 'summary differs from all thirty raw values')
    diagnostics = raw['diagnostics']
    require(len(diagnostics) == 3 and {row['mode'] for row in diagnostics} == set(MODES), 'incomplete ON diagnostics')
    for row in diagnostics:
        retention(row['retained']); retention(row['afterClose'], True)
        require(len(row['queries']) == 6, 'incomplete ON queries')
        for i, query in enumerate(row['queries']):
            require(query.get('queryIndex') == i and {key: query.get(key) for key in ('count', 'sha256')} == expected[i], 'ON query result differs')
            require(all(number(value) for value in query['counters'].values()), 'invalid ON counters')
        probe = row['probe']
        require(probe.get('pendingTransactions') == 0 and probe.get('droppedEvents') == 0, 'incomplete probe')
        require(all(number(value) for value in probe['counters'].values()), 'invalid probe counter')
        if row['mode'] in ('current', 'corpus'):
            require(probe['counters'].get('query.filter.rows') == entities * 6, 'actual full row scan missing')


def load(path):
    def unique(pairs):
        result = {}
        for key, value in pairs:
            require(key not in result, 'duplicate JSON key')
            result[key] = value
        return result
    return json.loads(path.read_text(), object_pairs_hook=unique)


def safe_file(root, relative):
    require(isinstance(relative, str) and '\\' not in relative and '\x00' not in relative and not relative.startswith('/') and str(PurePosixPath(relative)) == relative and '..' not in PurePosixPath(relative).parts, 'unsafe artifact path')
    path = root / relative
    require(path.resolve().is_relative_to(root.resolve()) and path.is_file() and not path.is_symlink(), 'missing or unsafe artifact')
    return path


def git_hash(kind, data):
    return hashlib.sha1(f'{kind} {len(data)}\0'.encode() + data).hexdigest()


def verify_source_files(root, raw):
    proof = raw['sourceProof']
    require(git_hash('commit', proof['commit'].encode()) == raw['sourceCommit'] and proof['commit'].splitlines()[0] == 'tree ' + raw['sourceTree'], 'measured commit binding differs')
    trees = proof['trees']
    for digest, entries in trees.items():
        names, encoded = set(), []
        for entry in entries:
            name, mode = entry['name'], entry['mode']
            require(name not in names and name not in ('.', '..') and name and '/' not in name and '\x00' not in name, 'invalid source tree name')
            require(mode in ('040000', '100644', '100755') and entry['type'] == ('tree' if mode == '040000' else 'blob') and re.fullmatch('[0-9a-f]{40}', entry['sha']), 'invalid source tree entry')
            names.add(name)
            encoded.append(((name + ('/' if mode == '040000' else '')).encode(), mode.lstrip('0').encode() + b' ' + name.encode() + b'\0' + bytes.fromhex(entry['sha'])))
        require(git_hash('tree', b''.join(value for _, value in sorted(encoded))) == digest, 'source tree digest differs')
    source_paths = set()
    for record in raw['sourceFiles']:
        relative = record['path']
        require(relative not in source_paths, 'duplicate source file')
        source_paths.add(relative)
        data = safe_file(root, relative).read_bytes()
        require(len(data) == record['bytes'] and hashlib.sha256(data).hexdigest() == record['sha256'], f'measured source changed: {relative}')
        current = raw['sourceTree']
        for part in PurePosixPath(relative).parts:
            entry = next((entry for entry in trees[current] if entry['name'] == part), None)
            require(entry is not None, 'source path not in measured commit')
            current = entry['sha']
        require(current == git_hash('blob', data), 'source blob not in measured commit')
    expected = set()

    def visit(digest, prefix):
        for entry in trees[digest]:
            path = prefix + entry['name']
            selected = path in ('package.json', 'package-lock.json') or any(path == target or path.startswith(target + '/') or target.startswith(path + '/') for target in ('src', 'scripts/optimization', 'tests/optimization'))
            if not selected:
                continue
            if entry['type'] == 'tree':
                visit(entry['sha'], path + '/')
            else:
                expected.add(path)
    visit(raw['sourceTree'], '')
    require(source_paths == expected, 'source manifest coverage differs')
    require(next(entry['sha'] for entry in trees[raw['sourceTree']] if entry['name'] == 'src') == raw['productTree'], 'product tree not in measured commit')


def validate(root):
    folder = root / FOLDER
    manifest = load(folder / 'evidence-manifest.json')
    require(manifest.get('baseCommit') == BASE and manifest.get('releaseState') == 'RELEASE BLOCKED' and manifest.get('originalAcceptancePerformed') is False, 'baseline/release status changed')
    paths = set()
    for record in manifest['files']:
        require(record['path'] not in paths, 'duplicate artifact')
        paths.add(record['path'])
        data = safe_file(root, record['path']).read_bytes()
        require(len(data) == record['bytes'] and hashlib.sha256(data).hexdigest() == record['sha256'], f'artifact bytes differ: {record["path"]}')
    for suite in FIXTURES:
        relative = f'{FOLDER}/evidence/{suite}.json'
        require(relative in paths, 'missing measurement manifest entry')
        raw = load(root / relative); verify_run(raw)
        verify_source_files(root, raw)
    lock = load(root / 'docs/optimization/phase1/contract-lock.json')
    require(lock['counts'] == dict(requirements=104, cases=116, clauses=464, workPackages=24, regressionGroups=6, supplemental=68) and len(lock['files']) == 73, 'original scope changed')
    for record in lock['files']:
        data = safe_file(root, record['path']).read_bytes()
        require(len(data) == record['bytes'] and hashlib.sha1(f'blob {len(data)}\0'.encode() + data).hexdigest() == record['gitBlob'], f'original input changed: {record["path"]}')
    trace = load(folder / 'traceability.json')
    original = load(root / 'docs/optimization/phase1/requirements.json')['requirements']
    require(len(trace) == 104 and {row['id'] for row in trace} == {row['id'] for row in original}, '104 trace coverage changed')
    by_id = {row['id']: row for row in original}
    for row in trace:
        require(row['clauses'] == by_id[row['id']]['clauses'] and row['freshOriginalAcceptance'] == 'NOT_PERFORMED', 'original clause/acceptance promotion')
        require(row['paths'] == by_id[row['id']]['paths'], 'trace path coverage changed')
        for relative in row['paths']:
            safe_file(root, relative)
    integration = load(folder / 'integration.json')
    require(integration['main']['sha'] == BASE and integration['productChangesPerformed'] is False and integration['phase2PrerequisitesInMain'] == {'63': False, '64': False, '65': False}, 'prerequisite/adoption status changed')
    return len(paths)


if __name__ == '__main__':
    try:
        count = validate(Path(__file__).resolve().parents[1])
        print(f'PHASE2 REASSESSMENT VERIFIED: {count} artifacts; supplemental only; RELEASE BLOCKED')
    except (OSError, ValueError, KeyError, TypeError, StopIteration) as error:
        print(f'PHASE2 REASSESSMENT FAILED: {error}', file=sys.stderr)
        sys.exit(1)
