"""Check authored AP04 clause bindings; never execute tests or change acceptance results.

The proof plans intentionally use several schemas. This checker accepts callback
bodies, complete test excerpts, test.step locations, title locations and explicit
line lists. A location-only mapping is only checked for bounds and case scope;
it does not become a clause-level observation. Source hashes must be refreshed by
their owners after edits, and a final commit/tree/build still needs to be bound.
"""
import argparse
import hashlib
import json
import re
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
DIRECTORY = Path('docs/quality/ap04-2026-10-11')
AUDIT = Path('docs/review-2026-10-11/original_acceptance_audit.json')
PLAN = DIRECTORY / 'local_acceptance_plan.json'
NAMES = ('given', 'when', 'then', 'negative_or_edge')
TITLE = re.compile(r"\btest(?:\.(?:only|skip|fixme))?\(\s*(['\"`])(AT-[BFEN]\d{2})\s+([^\n]*?)\1\s*,")
BODY = re.compile(r'async\s*\(\s*\)\s*=>\s*\{')
SHA = re.compile(r'[a-f0-9]{64}\Z')


def sha(data):
    return hashlib.sha256(data).hexdigest()


class Checker:
    def __init__(self, root):
        self.root = root
        self.files = {}
        self.findings = []
        self.bindings = []
        self.documents = []
        self.hash_checks = 0
        self.location_checks = 0
        self.literal_checks = 0

    def finding(self, code, document, pointer, **details):
        self.findings.append({'code': code, 'document': str(document), 'pointer': pointer, **details})

    def file(self, name, document, pointer, base=''):
        if not isinstance(name, str):
            self.finding('invalid_source_path', document, pointer, source=name)
            return None
        path = self.root / name
        try:
            if not path.exists() and base:
                path = self.root / base / name
        except OSError as cause:
            self.finding('invalid_source_path', document, pointer, source=name, reason=str(cause))
            return None
        try:
            relative = path.resolve().relative_to(self.root.resolve())
        except ValueError:
            self.finding('source_outside_repository', document, pointer, source=name)
            return None
        key = str(relative)
        if key not in self.files:
            if not path.is_file():
                self.finding('source_missing', document, pointer, source=key)
                return None
            data = path.read_bytes()
            try:
                text = data.decode('utf-8')
            except UnicodeDecodeError:
                text = None
            self.files[key] = {'path': key, 'bytes': len(data), 'sha256': sha(data),
                               'text': text, 'lines': text.splitlines() if text is not None else []}
        return self.files[key]

    def hash_file(self, name, expected, document, pointer, base='', expected_bytes=None):
        source = self.file(name, document, pointer, base)
        if source is None:
            return
        self.hash_checks += 1
        if not isinstance(expected, str) or not SHA.fullmatch(expected):
            self.finding('invalid_hash', document, pointer, source=source['path'], expected=expected)
        elif source['sha256'] != expected:
            self.finding('source_hash_refresh_required', document, pointer, source=source['path'],
                         expected=expected, actual=source['sha256'])
        if expected_bytes is not None and expected_bytes != source['bytes']:
            self.finding('source_size_refresh_required', document, pointer, source=source['path'],
                         expected=expected_bytes, actual=source['bytes'])

    def line(self, name, number, document, pointer, case_id=None, title=None):
        source = self.file(name, document, pointer)
        self.location_checks += 1
        if source is None:
            return None
        if not isinstance(number, int) or isinstance(number, bool) or not 1 <= number <= len(source['lines']):
            self.finding('source_line_out_of_bounds', document, pointer, source=source['path'], line=number,
                         actual_line_count=len(source['lines']))
            return None
        text = source['lines'][number - 1]
        if title is not None:
            matches = list(TITLE.finditer(text))
            if not any(match.group(2) + ' ' + match.group(3) == title for match in matches):
                self.finding('test_title_location_refresh_required', document, pointer,
                             source=source['path'], line=number, expected_title=title, actual_line=text)
        if case_id:
            starts = [(source['text'].count('\n', 0, match.start()) + 1, match.group(2))
                      for match in TITLE.finditer(source['text'])]
            previous = next(((start, ident) for start, ident in reversed(starts) if start <= number), None)
            if previous is None or previous[1] != case_id:
                self.finding('line_outside_original_case', document, pointer, source=source['path'],
                             line=number, expected_case=case_id, nearest_test=previous)
        return text

    def span(self, node, document, pointer):
        name = node.get('file', node.get('path'))
        start, end = node.get('line'), node.get('end_line')
        source = self.file(name, document, pointer)
        if source is None or self.line(name, start, document, pointer) is None or self.line(name, end, document, pointer) is None:
            return
        if end < start:
            self.finding('source_span_reversed', document, pointer, source=name, line=start, end_line=end)
            return
        raw = '\n'.join(source['lines'][start - 1:end])
        if 'excerpt_sha256' in node:
            # F owner stores complete test source including its final newline.
            actual, expected, stored = raw + '\n', node['excerpt_sha256'], node.get('source_excerpt')
        elif 'callback_sha256' in node:
            expected, stored = node['callback_sha256'], node.get('callback_source')
            if re.search(r"\bclause\(\s*['\"]AT-", raw):
                # BM owner stores the body without clause(...) / async wrapper.
                opening = BODY.search(raw)
                if opening is None or raw.rfind('}') < opening.end():
                    self.finding('callback_wrapper_missing', document, pointer, source=name, line=start)
                    return
                actual = raw[opening.end():raw.rfind('}')].strip()
            else:
                # E07 owner stores the exact inclusive test.step source span.
                actual = raw
        else:
            return
        if stored is not None and sha(stored.encode('utf-8')) != expected:
            self.finding('stored_excerpt_hash_mismatch', document, pointer, source=name, expected=expected,
                         actual=sha(stored.encode('utf-8')))
        if sha(actual.encode('utf-8')) != expected:
            self.finding('source_span_refresh_required', document, pointer, source=name, line=start,
                         end_line=end, expected=expected, actual=sha(actual.encode('utf-8')))
        if stored is not None and actual != stored:
            self.finding('stored_excerpt_source_refresh_required', document, pointer, source=name,
                         line=start, end_line=end)

    def walk_sources(self, value, document, pointer='$', inherited_file=None, base=''):
        if isinstance(value, list):
            for index, child in enumerate(value):
                self.walk_sources(child, document, f'{pointer}[{index}]', inherited_file, base)
            return
        if not isinstance(value, dict):
            return
        # External-condition records stay blocked; every actual candidate
        # execution result stays unrun, including supplemental controls.
        for key in ('result', 'result_on_new_target', 'runtime_result', 'execution', 'test_execution'):
            if key in value and value[key] not in ('not_run', 'blocked_external_condition'):
                self.finding('acceptance_result_promoted', document, pointer + '.' + key, actual=value[key])
        for key in ('browser_run', 'browser_executed', 'actual_execution_observed',
                    'browser_build_unit_tsc_run', 'browser_build_unit_tsc_current_target_run',
                    'heavy_build_or_test_executed', 'heavy_tests_run'):
            if key in value and value[key] is not False and value[key] != 'not_run':
                self.finding('authored_plan_execution_claim', document, pointer + '.' + key, actual=value[key])
        # F operation/assertion records call a source-code line "source", too.
        # Only repository-shaped source strings are paths; code inherits its file.
        own_file = next((value[key] for key in ('file', 'path', 'source')
                         if isinstance(value.get(key), str) and
                         (key != 'source' or re.match(r'^(?:docs|src|tests|scripts)/', value[key]))), None)
        name = own_file or inherited_file
        if isinstance(value.get('original_negative_fixture_manifest'), str):
            base = str(Path(value['original_negative_fixture_manifest']).parent)
        if 'sha256' in value and own_file:
            self.hash_file(own_file, value['sha256'], document, pointer + '.sha256', base,
                           value.get('bytes'))
        if isinstance(value.get('source_sha256'), str) and isinstance(value.get('source'), str):
            self.hash_file(value['source'], value['source_sha256'], document, pointer + '.source_sha256')
        for path_key, hash_key in (
            ('original_audit', 'original_audit_sha256'), ('source_plan', 'source_plan_sha256'),
            ('source_candidates', 'source_candidates_sha256')):
            if isinstance(value.get(path_key), str) and hash_key in value:
                self.hash_file(value[path_key], value[hash_key], document, pointer + '.' + hash_key)
        for key, path in (('original_cases_sha256', 'docs/data/acceptance_cases.json'),
                          ('original_requirements_sha256', 'docs/data/requirements.json')):
            if key in value:
                self.hash_file(path, value[key], document, pointer + '.' + key)
        hashes = value.get('authored_file_sha256')
        if isinstance(hashes, dict):
            for path, expected in hashes.items():
                self.hash_file(path, expected, document, pointer + '.authored_file_sha256.' + path)
        elif isinstance(hashes, str) and isinstance(value.get('candidate_file'), str):
            self.hash_file(value['candidate_file'], hashes, document, pointer + '.authored_file_sha256')
        if 'end_line' in value and ('callback_sha256' in value or 'excerpt_sha256' in value):
            self.span(value, document, pointer)
        elif 'line' in value and name:
            self.line(name, value['line'], document, pointer, title=value.get('title'))
        for number in value.get('test_line_numbers', []):
            self.line(name, number, document, pointer + '.test_line_numbers')
        for key, child in value.items():
            if key != 'authored_file_sha256':
                self.walk_sources(child, document, pointer + '.' + key, name, base)

    def clause_bindings(self, case, clause, document_data):
        bindings = []
        for field in ('source', 'entry', 'test_callback'):
            if isinstance(clause.get(field), dict):
                bindings.append(clause[field])
        for field in ('sources', 'source_entry_refs', 'test_callbacks'):
            bindings.extend(clause.get(field, []))
        source = case.get('source', document_data.get('source'))
        if 'callback_line' in clause:
            bindings.append({'file': source, 'line': clause['callback_line'], 'kind': 'clause_callback_line'})
        if 'source_lines' in clause:
            bindings.append({'file': source, 'lines': clause['source_lines'], 'kind': 'declared_line_list'})
        return bindings

    def check_case(self, case, registry, document, pointer, document_data, require_mapping=False):
        original = case.get('original_case')
        case_id = case.get('id', case.get('case_id', original.get('id') if isinstance(original, dict) else None))
        if case_id not in registry:
            self.finding('unknown_original_case', document, pointer, case_id=case_id)
            return
        expected = registry[case_id]['original_case']
        if not isinstance(original, dict):
            self.finding('original_case_missing', document, pointer, case_id=case_id)
            return
        for name in ('id', 'requirement_ids', 'package_id', *NAMES):
            if original.get(name) != expected.get(name):
                self.finding('original_case_literal_mismatch', document, pointer + '.original_case.' + name,
                             case_id=case_id, expected=expected.get(name), actual=original.get(name))
        clauses = case.get('clauses', [])
        if len(clauses) != 4 or {q.get('name') for q in clauses} != set(NAMES):
            self.finding('original_four_clauses_missing_or_duplicated', document, pointer, case_id=case_id)
        for key in ('result', 'result_on_new_target'):
            if key in case and case[key] != 'not_run':
                self.finding('acceptance_result_promoted', document, pointer + '.' + key, case_id=case_id,
                             actual=case[key])
        for index, clause in enumerate(clauses):
            location = f'{pointer}.clauses[{index}]'
            name = clause.get('name')
            self.literal_checks += 1
            if name not in NAMES or clause.get('original') != expected.get(name):
                self.finding('clause_literal_mismatch', document, location, case_id=case_id, clause=name,
                             expected=expected.get(name), actual=clause.get('original'))
            result = clause.get('result', clause.get('result_on_new_target'))
            if result != 'not_run':
                self.finding('acceptance_result_promoted', document, location, case_id=case_id, clause=name,
                             actual=result)
            bindings = self.clause_bindings(case, clause, document_data)
            if require_mapping and not bindings:
                self.finding('clause_source_mapping_missing', document, location, case_id=case_id, clause=name)
            for binding in bindings:
                filename = binding.get('file', binding.get('path'))
                numbers = binding.get('lines', [binding['line']] if 'line' in binding else [])
                for number in numbers:
                    line = self.line(filename, number, document, location, case_id=case_id)
                    if binding.get('kind') == 'clause_callback_line' and line is not None:
                        step_marker = re.escape(case_id) + r'\s+' + re.escape(str(name)) + r'\s*:'
                        clause_marker = r"\bclause\(\s*['\"]" + re.escape(case_id) + r"['\"]\s*,\s*['\"]" + re.escape(str(name)) + r"['\"]\s*,"
                        if not re.search(step_marker, line) and not re.search(clause_marker, line):
                            self.finding('clause_callback_location_refresh_required', document, location,
                                         source=filename, line=number, case_id=case_id, clause=name)
                if binding.get('end_line') is not None:
                    self.line(filename, binding['end_line'], document, location, case_id=case_id)
            self.bindings.append({'document': str(document), 'case_id': case_id, 'name': name,
                                  'original': clause.get('original'), 'declared_bindings': bindings,
                                  'result': 'not_run', 'static_location_only': all('end_line' not in b for b in bindings)})

    def run(self):
        audit_bytes = (self.root / AUDIT).read_bytes()
        audit = json.loads(audit_bytes)
        plan_bytes = (self.root / PLAN).read_bytes()
        plan = json.loads(plan_bytes)
        registry = {case['id']: case for case in audit}
        if len(audit) != 116 or len(registry) != 116 or sum(len(c['clauses']) for c in audit) != 464:
            self.finding('original_116_464_registry_changed', AUDIT, '$')
        if (len(plan['cases']) != 116 or sum(len(c['clauses']) for c in plan['cases']) != 464
                or {c['id'] for c in plan['cases']} != set(registry)):
            self.finding('original_116_464_plan_changed', PLAN, '$')
        self.hash_file(str(AUDIT), plan['source']['sha256'], PLAN, '$.source.sha256')
        for index, case in enumerate(plan['cases']):
            self.check_case(case, registry, PLAN, f'$.cases[{index}]', plan)
        paths = sorted((self.root / DIRECTORY).glob('*proof.json'))
        paths += sorted((self.root / 'tests/e2e').glob('ap04-original-*-candidates.json'))
        inventory = self.root / DIRECTORY / 'authored_entry_inventory.json'
        inventory_data = None
        if inventory.exists():
            paths.append(inventory)
        for path in paths:
            document = path.relative_to(self.root)
            document_bytes = path.read_bytes()
            data = json.loads(document_bytes)
            self.documents.append({'path': str(document), 'sha256': sha(document_bytes)})
            if path == inventory:
                inventory_data = data
            for key in ('passing_case_count', 'passing_clause_count'):
                if data.get(key, 0) != 0:
                    self.finding('acceptance_result_promoted', document, '$.' + key, actual=data[key])
            for key in ('test_execution', 'all_original_clause_results'):
                if key in data and data[key] != 'not_run':
                    self.finding('acceptance_result_promoted', document, '$.' + key, actual=data[key])
            if data.get('acceptance_pass_inferred', False) or data.get('browser_executed', False):
                self.finding('authored_plan_execution_claim', document, '$')
            for group in ('totals', 'counts', 'results'):
                for key in ('passed', 'passed_clauses', 'clauses_passed', 'cases_passed'):
                    if data.get(group, {}).get(key, 0) != 0:
                        self.finding('acceptance_result_promoted', document, '$.' + group + '.' + key)
            cases = list(data.get('cases', [data] if 'original_case' in data else []))
            cases += data.get('additional_original_f_cases', [])
            for index, case in enumerate(cases):
                require_mapping = path.name.endswith('proof.json')
                self.check_case(case, registry, document, f'$.cases[{index}]', data, require_mapping)
            self.walk_sources(data, document)
        refresh_sources = sorted({finding['source'] for finding in self.findings
                                  if finding['code'].endswith('refresh_required') and 'source' in finding})
        # Titles inventory navigation entries; four-clause source plans remain
        # a separate declaration and still do not establish execution evidence.
        mapped = {}
        for binding in self.bindings:
            if binding['document'].endswith('proof.json') and binding['declared_bindings']:
                mapped.setdefault(binding['case_id'], set()).add(binding['name'])
        authored_without_bindings = []
        if inventory_data is not None:
            for case in inventory_data['cases']:
                if case['authored_test_entries'] and mapped.get(case['id'], set()) != set(NAMES):
                    authored_without_bindings.append({
                        'case_id': case['id'],
                        'authored_test_entries': case['authored_test_entries'],
                        'declared_clause_names': sorted(mapped.get(case['id'], set())),
                        'result': 'not_run',
                    })
        return {
            'schema': 'shinariokanri-ap04-clause-plan-static-check-v1',
            'static_validation': 'matched' if not self.findings else 'needs_correction_or_refresh',
            'acceptance_evidence': False, 'browser_or_product_code_executed': False,
            'original_cases': len(audit), 'original_clauses': sum(len(c['clauses']) for c in audit),
            'original_registry_expected': {'cases': 116, 'clauses': 464},
            'original_audit_sha256': sha(audit_bytes),
            'original_plan': {'file': str(PLAN), 'sha256': sha(plan_bytes), 'bytes': len(plan_bytes)},
            'checker_source': {'file': 'scripts/check_ap04_clause_plans.py',
                               'sha256': sha(Path(__file__).read_bytes())},
            'all_acceptance_results_remain_not_run': not any(f['code'] in ('acceptance_result_promoted', 'authored_plan_execution_claim') for f in self.findings),
            'counts': {'proof_documents': len(self.documents), 'literal_checks': self.literal_checks,
                       'source_hash_checks': self.hash_checks, 'location_checks': self.location_checks,
                       'findings': len(self.findings), 'source_files_read': len(self.files)},
            'proof_documents': self.documents, 'refresh_required_sources': refresh_sources,
            'findings': self.findings, 'clause_bindings': self.bindings,
            'authored_titles_without_four_clause_source_bindings': authored_without_bindings,
            'limits': ['Static literals, hashes and positions do not establish assertion correctness or execution success.',
                       'Location-only plans have bounds/case checks; no stronger span proof is invented.',
                       'Final source edits require owner hash/span refresh, then exact commit/tree/build binding.',
                       'No original audit/plan, product source, E2E content or acceptance result is modified.'],
        }


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--report', type=Path, help='Write the static report JSON only; never change input plans')
    args = parser.parse_args()
    report = Checker(ROOT).run()
    if args.report:
        destination = args.report if args.report.is_absolute() else ROOT / args.report
        destination.write_text(json.dumps(report, ensure_ascii=False, indent=2) + '\n')
    print('AP04 CLAUSE PLAN STATIC CHECK: ' + report['static_validation'])
    print(json.dumps(report['counts'], ensure_ascii=False))
    print('Original registry expected: 116/464. Input results are not modified; static checks are not acceptance evidence.')
    if report['findings']:
        categories = {}
        for finding in report['findings']:
            categories[finding['code']] = categories.get(finding['code'], 0) + 1
        print(json.dumps({'findings_by_code': categories, 'refresh_required_sources': report['refresh_required_sources']}, ensure_ascii=False))
        return 1
    return 0


if __name__ == '__main__':
    raise SystemExit(main())
