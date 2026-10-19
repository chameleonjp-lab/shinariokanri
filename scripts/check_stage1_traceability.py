"""Validate the 1D preparation registry; never adjudicate final acceptance."""
from __future__ import annotations
import argparse
import hashlib
import json
from pathlib import Path, PurePosixPath
import re
import sys

from check_docs import load_json
from check_phase3 import original_performance_fixture

TRACE = 'docs/acceptance/phase3/TRACEABILITY.json'
LOCK = 'docs/optimization/phase1/contract-lock.json'
# Exact immutable contract-lock blob, independently pinned at 1D start.
LOCK_BLOB = 'b1f2edd7b491e5d99a1d908466a644a4d5d07faa'
NAMES = ('given', 'when', 'then', 'negative_or_edge')
COUNTS = dict(requirements=104, cases=116, clauses=464, workPackages=24,
              regressionGroups=6, supplemental=68)
REQUESTS = [('1A', []), ('1B', ['1A']), ('1C', ['1A']), ('1D', ['1B', '1C']),
            ('2A', ['1D']), ('2B', ['2A']), ('2C', ['2A', '2B']),
            ('3A', ['2C']), ('3B', ['3A']), ('3C', ['3B'])]


def require(value, message):
    if not value:
        raise ValueError(message)


def blob(data):
    return hashlib.sha1(b'blob '+str(len(data)).encode()+b'\0'+data).hexdigest()


def index(rows, label):
    require(isinstance(rows, list) and all(isinstance(r, dict) and
            isinstance(r.get('id'), str) for r in rows), label+' ID rows differ')
    ids = [r['id'] for r in rows]
    require(len(ids) == len(set(ids)), label+' ID duplicate')
    return {r['id']: r for r in rows}


def check_dependency_graph(rows):
    by_id = index(rows, 'dependency')
    visiting, done = set(), set()
    def visit(key):
        require(key in by_id, 'dependency missing: '+key)
        require(key not in visiting, 'dependency cycle: '+key)
        if key in done:
            return
        visiting.add(key)
        for dependency in by_id[key]['depends_on']:
            visit(dependency)
        visiting.remove(key)
        done.add(key)
    for key in by_id:
        visit(key)


def validate(root, value=None):
    root = Path(root).resolve()
    value = load_json(root/TRACE) if value is None else value
    lock_bytes = (root/LOCK).read_bytes()
    require(blob(lock_bytes) == LOCK_BLOB, 'original input lock changed')
    lock = json.loads(lock_bytes)
    require(value['format'] == 'codex-stage1-provisional-traceability/1' and
            value['counts'] == COUNTS == lock['counts'], 'provisional counts/format differ')
    require(value['final_candidate'] is None, 'provisional final candidate must remain unset')
    require(value['input_lock']['path'] == LOCK and
            value['input_lock']['gitBlob'] == LOCK_BLOB and
            value['input_lock']['original_base'] == lock['baseCommit'] and
            value['locked_inputs'] == lock['files'], 'original input lock differs')
    for row in lock['files']:
        data = (root/row['path']).read_bytes()
        require(len(data) == row['bytes'] and blob(data) == row['gitBlob'],
                'original input bytes differ: '+row['path'])
    for size in ('standard', 'large'):
        require(value['performance_fixtures'][size] == original_performance_fixture(root, size),
                'original fixture differs: '+size)
    material = root/'tests/fixtures/rb10-large-analysis/original-large-long-branch.scenario'
    require(hashlib.sha256(material.read_bytes()).hexdigest() ==
            '1ca2b19dcf4c8464c68a24a1bbe02cd1b1c4be20187ed2cee99d4e541822d0d0',
            'original fixture binary SHA differs')

    source_paths = {}
    for row in value['source_inventory']:
        path = row['path']
        require(isinstance(path, str) and path and not path.startswith('/') and
                '\\' not in path and '..' not in PurePosixPath(path).parts and
                str(PurePosixPath(path)) == path and path not in source_paths,
                'source path differs')
        require(blob((root/path).read_bytes()) == row['gitBlob'], 'source bytes differ: '+path)
        source_paths[path] = row
    require(source_paths, 'source inventory missing')

    requirements = load_json(root/'docs/data/requirements.json')
    current_requirements = index(value['requirements'], 'requirement')
    require(set(current_requirements) == {r['id'] for r in requirements}, 'requirement ID set differs')
    for original in requirements:
        row = current_requirements[original['id']]
        require(row['original'] == original and row['case_ids'] == original['acceptance_ids'] and
                row['current'] == dict(result='not_run', actual_evidence=[]), 'requirement differs')

    acceptance = load_json(root/'docs/data/completion_acceptance.json')
    plan = load_json(root/'docs/completion-replan-2026-10-12/acceptance_plan.json')
    planned = index(plan['cases'], 'original case')
    external_text = (root/'docs/quality/pr49-followup-2026-10-15/EXTERNAL_CASES.md').read_text()
    external_ids = set(re.findall(r'AT-[BFNE]\d{2}', external_text))
    external = index(value['external_cases'], 'external')
    require(len(external_ids) == 22 and set(external) == external_ids and
            all(r['status'] == 'blocked' and r['actual_evidence'] == [] for r in external.values()),
            'external conditions differ')
    cases = index(value['cases'], 'case')
    require(set(cases) == {r['id'] for r in acceptance['cases']}, 'case ID set differs')
    for ordinal, original in enumerate(acceptance['cases']):
        row = cases[original['id']]
        require(row['original_contract'] == original and
                row['requirement_ids'] == original['requirement_ids'] and
                row['original_work_package'] == original['original_package_id'], 'original case differs')
        clauses = row['clauses']
        require(isinstance(clauses, list) and [r['name'] for r in clauses] == list(NAMES),
                'original four clauses differ')
        plan_clauses = {r['name']: r for r in planned[row['id']]['clauses']}
        for clause in clauses:
            name = clause['name']
            require(clause['original'] == original[name] == plan_clauses[name]['original'],
                    'original clause text differs')
            require(all(clause.get(key) for key in
                        ('source_paths', 'ui_route', 'fixture', 'independent_expectation', 'evidence_slot')),
                    'clause binding missing')
            require(all(path in source_paths for path in clause['source_paths']) and
                    clause['ui_route']['operation'] == original['when'] and
                    bool(clause['ui_route']['clause_action']), 'clause binding source/UI differs')
            fixture, oracle, slot = clause['fixture'], clause['independent_expectation'], clause['evidence_slot']
            require(fixture['given_path'] == 'docs/data/completion_acceptance.json' and
                    fixture['given_pointer'] == f'/cases/{ordinal}/given' and
                    fixture['given'] == original['given'] and fixture['locked_inputs'] == '/locked_inputs' and
                    all(fixture[k] is None for k in ('runtime_seed_or_hash', 'native_before', 'assets')) and
                    oracle['contract_path'] == 'docs/data/completion_acceptance.json' and
                    oracle['pointer'] == f'/cases/{ordinal}/{name}' and oracle['expected'] == original[name] and
                    bool(oracle['checking_rule']) and slot['planned_root'] == f"3C/cases/{row['id']}/{name}" and
                    slot['path'] is None and all(k in slot['required'] for k in
                    ('source_commit', 'tree', 'build', 'served_inventory', 'fixture_seed_or_hash',
                     'environment', 'argv', 'real_exit', 'raw_observation', 'independent_expected',
                     'native_or_download_bytes_sha256', 'checked_at')), 'clause binding fixture/oracle/slot differs')
            expected_external = plan_clauses[name]['external_requirements'] or []
            require(clause['external_requirements'] == expected_external, 'external clause differs')
            current = clause['current']
            require(current['result'] == ('blocked' if expected_external else 'not_run') and
                    current['actual_observation'] is None and current['evidence'] == [] and
                    current['target_binding'] is None and bool(current['missing']),
                    'unexecuted clause cannot be promoted or supplied with old evidence')
        require(row['current']['result'] == ('blocked' if row['id'] in external_ids else 'not_run') and
                row['current']['actual_evidence'] == [] and row['current']['missing'], 'unexecuted case differs')

    packages = load_json(root/'docs/data/work_packages.json')
    current_packages = index(value['work_packages'], 'work package')
    require(set(current_packages) == {r['id'] for r in packages}, 'work package ID set differs')
    check_dependency_graph(value['work_packages'])
    for original in packages:
        row = current_packages[original['id']]
        current = row['current']
        require(row['original'] == original and row['depends_on'] == original['depends_on'] and
                row['case_ids'] == original['acceptance_ids'] and current['local_gate'] == 'not_run' and
                current['whole_gate'] == 'blocked' and current['actual_evidence'] == [] and
                current['blocked_dependencies'] == original['depends_on'] and current['missing'],
                'work package local/whole gate differs')
    regression = index(value['regression_groups'], 'regression')
    require(set(regression) == {r['id'] for r in acceptance['regression_groups']}, 'regression ID set differs')
    for original in acceptance['regression_groups']:
        row = regression[original['id']]
        require(row['original'] == original and row['current']['result'] == 'not_run' and
                row['current']['actual_evidence'] == [], 'regression original or result differs')
    supplement_original = load_json(root/'docs/quality/pr49-followup-2026-10-15/SUPPLEMENTAL_REVIEW.json')['checks']
    supplemental = index(value['supplemental'], 'supplemental')
    require(set(supplemental) == {r['id'] for r in supplement_original}, 'supplemental ID set differs')
    classifications = []
    for original in supplement_original:
        row = supplemental[original['id']]
        is_x = original['original']['type'] == 'proposed_extension_acceptance'
        classification = 'unadopted_X' if is_x else 'existing_G'
        classifications.append(classification)
        require(row['original'] == original['original'] and row['classification'] == classification and
                row['current'] == dict(result='not_adopted' if is_x else 'not_run', actual_evidence=[]),
                'supplemental G/X original or result differs')
    require(classifications.count('existing_G') == 32 and classifications.count('unadopted_X') == 36,
            'supplemental G32/X36 differ')
    remaining = index(value['separate_remaining_conditions'], 'separate remaining condition')
    require(set(remaining) == {'AC-G02/CP04', 'C29-37parts-and-18-declarations', 'CP15'} and
            all(r['status'] == 'blocked' and r['missing'] for r in remaining.values()),
            'separate external conditions differ')
    check_dependency_graph(value['request_dependencies'])
    require(value['request_dependencies'] == [dict(id=key, depends_on=deps) for key, deps in REQUESTS],
            'request dependency contract differs')
    return dict(counts=COUNTS, lockedInputs=len(lock['files']), sourceCandidates=len(source_paths),
                formalAcceptance='not_assessed', releaseDecision='RELEASE BLOCKED')


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--root', type=Path, default=Path(__file__).resolve().parents[1])
    args = parser.parse_args()
    try:
        print(json.dumps(validate(args.root), ensure_ascii=False))
    except (OSError, ValueError, KeyError, TypeError) as error:
        print('STAGE1 PREPARATION REJECTED:', error, file=sys.stderr)
        sys.exit(1)
