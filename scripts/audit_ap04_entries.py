"""Inventory authored original-case entries without promoting any result."""
import argparse
import hashlib
import json
import re
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
DESTINATION = ROOT / 'docs/quality/ap04-2026-10-11/authored_entry_inventory.json'
AUDIT = ROOT / 'docs/review-2026-10-11/original_acceptance_audit.json'
PLAN = ROOT / 'docs/quality/ap04-2026-10-11/local_acceptance_plan.json'
TITLE = re.compile(r"\btest\(\s*(['\"`])(AT-[BFEN]\d{2})\s+([^\n]*?)\1\s*,")


def digest(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def inventory():
    planned = json.loads(PLAN.read_text())
    if len(planned['cases']) != 116 or sum(len(case['clauses']) for case in planned['cases']) != 464:
        raise ValueError('Original 116/464 registry changed')
    if digest(AUDIT) != planned['source']['sha256']:
        raise ValueError('Original acceptance audit bytes changed')
    sources, entries = [], {}
    for path in sorted((ROOT / 'tests/e2e').glob('ap04-original-*')):
        if path.suffix not in ('.ts', '.json'):
            continue
        name = str(path.relative_to(ROOT))
        sources.append({'path': name, 'bytes': path.stat().st_size, 'sha256': digest(path)})
        if not path.name.endswith('.spec.ts'):
            continue
        source = path.read_text()
        for match in TITLE.finditer(source):
            case_id = match.group(2)
            entries.setdefault(case_id, []).append({
                'path': name, 'line': source.count('\n', 0, match.start()) + 1,
                'title': case_id + ' ' + match.group(3), 'sha256': digest(path),
                'command': f'npx playwright test {name} --project chromium',
                'result': 'not_run',
            })
    ids = {case['id'] for case in planned['cases']}
    if set(entries) - ids:
        raise ValueError(f'Unknown original-case ID: {set(entries) - ids}')
    cases = []
    for case in planned['cases']:
        authored = entries.get(case['id'], [])
        cases.append({
            'id': case['id'], 'original_case': case['original_case'],
            'authored_test_entries': authored,
            'prior_entry_candidate': {
                'readiness': case['readiness'], 'test_reference_ids': case['test_reference_ids'],
                'command': case['candidate_replay_command'],
            },
            'next_action': (
                'Freeze commit/tree/build/base and fixture bytes, run this normal-UI entry, '
                'then review each original clause against its actual observations; retain '
                'partial, failed and external conditions separately.'
                if authored else case['specific_next_action']
            ),
            'clauses': [{
                'name': clause['name'], 'original': clause['original'],
                'external_requirements': clause['external_requirements'],
                'missing_observation': clause['missing_observation'],
                'next_action': clause['next_action'], 'result': 'not_run',
            } for clause in case['clauses']],
        })
    return {
        'schema': 'shinariokanri-ap04-authored-entry-inventory-v1',
        'original_audit': {'path': str(AUDIT.relative_to(ROOT)), 'sha256': digest(AUDIT)},
        'rules': {
            'title_registration_is_not_clause_evidence': True,
            'all_results_remain_not_run': True,
            'prior_results_not_transferred': True,
            'physical_devices_and_live_api_not_substituted': True,
            'inventoried_sources_require_refresh_after_edits': True,
        },
        'counts': {'original_cases': 116, 'original_clauses': 464,
                   'cases_with_authored_title': len(entries),
                   'test_entries': sum(map(len, entries.values())),
                   'source_files': len(sources), 'passed_clauses': 0, 'not_run_clauses': 464},
        'sources': sources, 'cases': cases,
    }


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--write', action='store_true')
    args = parser.parse_args()
    encoded = json.dumps(inventory(), ensure_ascii=False, indent=2) + '\n'
    if args.write:
        DESTINATION.write_text(encoded)
    elif not DESTINATION.exists() or DESTINATION.read_text() != encoded:
        raise SystemExit('AP04 ENTRY INVENTORY OUTDATED: refresh with --write; no acceptance result promoted')
    print('AP04 ENTRY INVENTORY: original 116/464 unchanged; authored entries are not execution evidence')
