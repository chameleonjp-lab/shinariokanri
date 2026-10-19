"""Reject false promotion and original-contract drift in the provisional 1D registry."""
from __future__ import annotations
import copy
import importlib.util
import json
from pathlib import Path
import subprocess
import sys
import unittest

ROOT = Path(__file__).resolve().parents[1]
CHECKER = ROOT/'scripts/check_stage1_traceability.py'
TRACE = ROOT/'docs/acceptance/phase3/TRACEABILITY.json'


class Stage1TraceabilityTests(unittest.TestCase):
    def setUp(self):
        self.assertTrue(CHECKER.is_file(), '1D provisional-registry validator is not implemented')
        spec = importlib.util.spec_from_file_location('stage1_traceability', CHECKER)
        self.validator = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(self.validator)
        self.value = json.loads(TRACE.read_text())

    def reject(self, mutate, message):
        value = copy.deepcopy(self.value)
        mutate(value)
        with self.assertRaisesRegex(ValueError, message):
            self.validator.validate(ROOT, value)

    def test_current_registry_keeps_all_original_contracts(self):
        result = self.validator.validate(ROOT, self.value)
        self.assertEqual(result['counts'], dict(requirements=104, cases=116, clauses=464,
            workPackages=24, regressionGroups=6, supplemental=68))
        self.assertEqual(result['formalAcceptance'], 'not_assessed')
        self.assertEqual(result['lockedInputs'], 73)

    def test_same_count_substituted_case_id_is_rejected(self):
        self.reject(lambda d: d['cases'][0].update(id=d['cases'][1]['id']), 'case ID')

    def test_original_clause_text_cannot_be_reworded(self):
        self.reject(lambda d: d['cases'][0]['clauses'][0].update(original='別の同数入力'), 'original clause')

    def test_each_of_four_clauses_is_required(self):
        self.reject(lambda d: d['cases'][0]['clauses'].pop(), 'four clauses')

    def test_missing_source_or_ui_or_oracle_or_evidence_slot_is_rejected(self):
        for key in ('source_paths', 'ui_route', 'fixture', 'independent_expectation', 'evidence_slot'):
            with self.subTest(key=key):
                self.reject(lambda d: d['cases'][0]['clauses'][0].update({key: None}), 'clause binding')

    def test_unexecuted_clause_cannot_be_passed_even_with_forged_receipt(self):
        def forge(d):
            d['cases'][0]['clauses'][0]['current'].update(result='passed',
                actual_observation='case count matches', evidence=[{'path':'old/raw.json','exit':0}])
        self.reject(forge, 'unexecuted clause')

    def test_old_candidate_cannot_become_the_final_candidate(self):
        self.reject(lambda d: d.update(final_candidate={'commit':'1fcadcca703863873a57d297e83b1b184e63e778'}),
                    'final candidate')

    def test_same_count_different_fixture_hash_is_rejected(self):
        self.reject(lambda d: d['performance_fixtures']['large'].update(sha256='0'*64), 'fixture')

    def test_original_input_lock_cannot_be_replaced(self):
        self.reject(lambda d: d['locked_inputs'][0].update(gitBlob='0'*40), 'input lock')

    def test_requirement_text_is_not_a_new_requirement(self):
        self.reject(lambda d: d['requirements'][0]['original'].update(shall='縮小した義務'), 'requirement')

    def test_work_package_local_gate_does_not_promote_whole_package(self):
        self.reject(lambda d: d['work_packages'][0]['current'].update(whole_gate='passed'), 'work package')

    def test_dependency_cycle_is_rejected_independently_of_counts(self):
        with self.assertRaisesRegex(ValueError, 'cycle'):
            self.validator.check_dependency_graph([
                {'id':'a','depends_on':['b']}, {'id':'b','depends_on':['a']}])

    def test_regression_original_procedure_is_not_replaceable(self):
        self.reject(lambda d: d['regression_groups'][0]['original'].update(steps=['別手順']), 'regression')

    def test_g32_and_unadopted_x36_are_distinct(self):
        self.reject(lambda d: d['supplemental'][0].update(classification='unadopted_X'), 'supplemental')

    def test_external_conditions_are_not_dropped(self):
        self.reject(lambda d: d['external_cases'].pop(), 'external')

    def test_cli_reports_preparation_without_acceptance(self):
        result = subprocess.run([sys.executable, str(CHECKER)], cwd=ROOT, capture_output=True, text=True)
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertEqual(json.loads(result.stdout)['formalAcceptance'], 'not_assessed')


class FormalEntrypointHelpTests(unittest.TestCase):
    def test_existing_python_entrypoints_parse_documented_flags_without_execution(self):
        entries = {
            'scripts/acceptance/run_formal.py': ('--output', '--only'),
            'scripts/acceptance/seal_candidate.py': ('--output', '--verify'),
            'scripts/check_phase3.py': ('--evidence', '--soak', '--product'),
            'scripts/acceptance/pack_evidence.py': ('--source', '--output', '--format', '--label'),
            'scripts/acceptance/recover_historical.py': ('--repository', '--output'),
            'scripts/acceptance/run_supplements.py': ('--repository', '--binding', '--historical', '--output'),
        }
        for path, flags in entries.items():
            with self.subTest(path=path):
                result = subprocess.run([sys.executable, str(ROOT/path), '--help'],
                                        cwd=ROOT, capture_output=True, text=True)
                self.assertEqual(result.returncode, 0, result.stderr)
                for flag in flags:
                    self.assertIn(flag, result.stdout)
                print('1D ENTRYPOINT', path, 'argv=--help exit=0 flags='+','.join(flags))


if __name__ == '__main__':
    unittest.main()
