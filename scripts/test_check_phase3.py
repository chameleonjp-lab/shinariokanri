"""Adversarial evidence checks; synthetic kernel inputs are never acceptance results."""
import copy
import importlib.util
import json
from pathlib import Path
import sys
import tempfile
import unittest
import io
import hashlib
import zipfile
import gzip
import warnings

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / 'scripts'))
try:
    import check_phase3 as checker
except ImportError:
    checker = None


class Phase3EvidenceTests(unittest.TestCase):
    def setUp(self):
        self.assertIsNotNone(checker, 'Phase-three evidence validator is not implemented')

    def performance(self, size='standard'):
        return json.loads((ROOT / f'docs/optimization/phase1/evidence/candidate-{size}30.json').read_text())

    def test_original_thirty_and_exact_limits(self):
        for size in ('standard', 'large'):
            raw = self.performance(size)
            result = checker.assess_performance(raw, raw['buildInfo'], raw['fixture'])
            self.assertEqual(len(result), 8)
            self.assertTrue(all(r['result'] != 'failed_local_numeric_condition' for r in result.values()))

    def test_false_p95_rejected(self):
        raw = self.performance()
        raw['measurements']['selection']['p95'] = 0
        with self.assertRaises(ValueError):
            checker.assess_performance(raw, raw['buildInfo'], raw['fixture'])

    def test_missing_sample_and_boolean_latency_rejected(self):
        for edit in ('missing', 'boolean', 'nan'):
            raw = self.performance()
            values = raw['measurements']['selection']['milliseconds']
            if edit == 'missing': values.pop()
            else: values[0] = True if edit == 'boolean' else float('nan')
            with self.assertRaises(ValueError):
                checker.assess_performance(raw, raw['buildInfo'], raw['fixture'])

    def test_same_count_different_fixture_or_build_rejected(self):
        for key in ('fixture', 'build'):
            raw = self.performance()
            product, fixture = copy.deepcopy(raw['buildInfo']), copy.deepcopy(raw['fixture'])
            if key == 'fixture': raw['fixture']['sha256'] = '0' * 64
            else: raw['buildInfo']['version'] = 'other-build'
            with self.assertRaises(ValueError): checker.assess_performance(raw, product, fixture)

    def test_threshold_failure_is_not_rounded_or_hidden(self):
        raw = self.performance()
        row = raw['measurements']['graph_frames']
        row.update(milliseconds=[33.400000000001455] * 330, count=330,
                   p95=33.400000000001455, maximum=33.400000000001455,
                   gestures=[{'frames': [33.400000000001455] * 11, 'before': 0, 'after': 240 if i % 2 == 0 else -240} for i in range(30)])
        result = checker.assess_performance(raw, raw['buildInfo'], raw['fixture'])
        self.assertEqual(result['graph_frames']['result'], 'failed_local_numeric_condition')

    def test_unfocused_startup_and_unperformed_gesture_rejected(self):
        for key in ('startup', 'gesture'):
            raw = self.performance()
            if key == 'startup': raw['measurements']['cached_startup']['editableProbes'][0]['focused'] = False
            else: raw['measurements']['graph_frames']['gestures'][0]['after'] = raw['measurements']['graph_frames']['gestures'][0]['before']
            with self.assertRaises(ValueError): checker.assess_performance(raw, raw['buildInfo'], raw['fixture'])

    def workload(self):
        return dict(completed=True, fullInputRecoveryCompleted=True, status='completed', errors=[],
                    runKind='actual_7200_second_soak',
                    contract=dict(seed='large-material-rb10-v1', records=88003, actualAssetBytes=75497472,
                                  normalEdits=112, completeHistory=113, portablePending=113,
                                  downloadLimitMs=600000, progressLimitMs=2000, minimumActualSoakSeconds=7200),
                    soak=dict(completed=True, requiredSeconds=7200, elapsedSeconds=7200.01),
                    edits=[dict(index=i) for i in range(112)], checkpoints=[{} for _ in range(14)],
                    soakChecks=[dict(records=88003, historyCount=i+2, pendingCount=i+2) for i in range(112)],
                    activities=[dict(edit=i, search=dict(query=f'継続編集{i}', matchingSourceRendered=True),
                                     trial=dict(completed=True), viewport=dict(width=390 if i % 2 == 0 else 1440, height=844 if i % 2 == 0 else 1000, physicalOrientation=False),
                                     **({'offlineCold': dict(completed=True)} if (i+1) % 5 == 0 else {})) for i in range(112)])

    def test_actual_soak_workload_kernel(self):
        self.assertIsNone(checker.verify_soak_workload(self.workload()))

    def test_short_or_incomplete_soak_rejected(self):
        for key in ('short', 'missing_edit', 'missing_trial', 'missing_offline', 'pending', 'diagnostic'):
            raw = self.workload()
            if key == 'short': raw['soak']['elapsedSeconds'] = 7199.99
            elif key == 'missing_edit': raw['edits'].pop()
            elif key == 'missing_trial': raw['activities'][0]['trial']['completed'] = False
            elif key == 'missing_offline': del raw['activities'][4]['offlineCold']
            elif key == 'pending': raw['soakChecks'][-1]['pendingCount'] = 112
            else: raw['runKind'] = 'diagnostic_full_input'
            with self.assertRaises(ValueError, msg=key): checker.verify_soak_workload(raw)

    def test_exit_must_be_observed_and_successful(self):
        for receipt in ({}, {'returncode': None}, {'returncode': 1}, {'returncode': False}, {'returncode': 0, 'executedWrapperBytesUnchanged': False}):
            with self.assertRaises(ValueError): checker.verify_exit(receipt)
        checker.verify_exit({'returncode': 0, 'executedWrapperBytesUnchanged': True})

    def test_native_history_compares_identity_order_and_hash(self):
        expected = [dict(operationId='a', revision='1', hash='x'), dict(operationId='b', revision='2', hash='y')]
        actual = [dict(operationId='a', revision='1', sourceHash='x', actualHash='x'), dict(operationId='b', revision='2', sourceHash='y', actualHash='y')]
        checker.verify_history(expected, actual, {})
        for edit in ('order', 'identity', 'hash', 'missing'):
            changed = copy.deepcopy(actual)
            if edit == 'order': changed.reverse()
            elif edit == 'identity': changed[0]['operationId'] = 'c'
            elif edit == 'hash': changed[0]['actualHash'] = 'other'
            else: changed.pop()
            with self.assertRaises(ValueError): checker.verify_history(expected, changed, {})

    def test_pending_requires_all_sequences_origins_and_real_parts(self):
        expected = [dict(sequence=0, operationId='a', hash='x', origin={'operationId': 'a'})]
        actual = [dict(sequence=0, operationId='a', sourceHash='x', actualHash='x', commandHash='x', origin={'operationId': 'a'},
                       nativeParts=[dict(sequence=0, bytes=1, sha256='a' * 64)])]
        checker.verify_pending(expected, actual, {})
        for edit in ('sequence', 'origin', 'parts', 'hash'):
            changed = copy.deepcopy(actual)
            if edit == 'sequence': changed[0]['sequence'] = 1
            elif edit == 'origin': changed[0]['origin'] = {'operationId': 'forged'}
            elif edit == 'parts': changed[0]['nativeParts'] = []
            else: changed[0]['commandHash'] = 'forged'
            with self.assertRaises(ValueError): checker.verify_pending(expected, changed, {})

    def test_unchanged_id_pending_cannot_substitute_both_actual_hashes(self):
        source = [dict(sequence=0, operationId='a', hash='original', origin={'operationId': 'a'})]
        actual = [dict(sequence=0, operationId='a', sourceHash='original', actualHash='0'*64,
                       commandHash='0'*64, origin={'operationId':'a'},
                       nativeParts=[dict(sequence=0, bytes=1, sha256='a'*64)])]
        with self.assertRaises(ValueError): checker.verify_pending(source, actual, {})
        # A clone has re-keyed command bytes; normalized source correspondence is separate.
        actual[0]['operationId'] = 'clone'
        checker.verify_pending(source, actual, {'a':'clone'})

    def test_clone_mapping_requires_disjoint_bijection(self):
        checker.verify_mapping({'a', 'b'}, {'a': 'x', 'b': 'y'})
        for mapping in ({'a': 'x'}, {'a': 'x', 'b': 'x'}, {'a': 'b', 'b': 'x'}):
            with self.assertRaises(ValueError): checker.verify_mapping({'a', 'b'}, mapping)

    def test_safe_paths_and_duplicate_json_rejected(self):
        for path in ('../escape', '/absolute', 'a/../escape', 'a\\b', './a'):
            with self.assertRaises(ValueError): checker.safe_relative(path)
        for payload in ('{"x":1,"x":2}', '{"milliseconds":NaN}'):
            with self.assertRaises(ValueError): checker.loads(payload)

    def test_bundle_inventory_bytes_and_duplicate_members(self):
        data = io.BytesIO()
        with zipfile.ZipFile(data, 'w') as z: z.writestr('actual.txt', b'actual')
        rows = [dict(path='actual.txt', bytes=6, sha256=hashlib.sha256(b'actual').hexdigest())]
        self.assertEqual(checker.verify_archive(data.getvalue(), rows), {'actual.txt': b'actual'})
        for changed in ([], [{**rows[0], 'sha256':'0'*64}], [rows[0], rows[0]]):
            with self.assertRaises(ValueError): checker.verify_archive(data.getvalue(), changed)
        duplicate = io.BytesIO()
        with warnings.catch_warnings():
            warnings.simplefilter('ignore', UserWarning)
            with zipfile.ZipFile(duplicate, 'w') as z:
                z.writestr('a', b'x'); z.writestr('a', b'y')
        with self.assertRaises(ValueError): checker.verify_archive(duplicate.getvalue(), rows)

    def test_recorded_paths_cannot_escape_or_guess_by_basename(self):
        self.assertEqual(checker.recorded_relative('/synthetic/run', '/synthetic/run/new/raw.json'), 'new/raw.json')
        for path in ('/synthetic/other/raw.json', '/synthetic/run/../other/raw.json', 'raw.json'):
            with self.assertRaises(ValueError): checker.recorded_relative('/synthetic/run', path)

    def test_original_six_forms_reject_missing_and_same_count_substitution(self):
        payload = gzip.decompress((ROOT/'tests/fixtures/phase3/historical-original180.json.gz').read_bytes())
        original = json.loads(payload)
        product = dict(commit=original['commit'], tree=original['tree'], version=original['build'])
        self.assertEqual(len(checker.assess_saves(original, product)), 6)
        for edit in ('fixture', 'missing', 'duplicate', 'writes', 'hash'):
            raw = copy.deepcopy(original)
            if edit == 'fixture': raw['cases'][0]['fixture']['fixtureSHA256'] = '0'*64
            elif edit == 'missing': raw['cases'][0]['forms'][0]['samples'].pop()
            elif edit == 'duplicate': raw['cases'][0]['forms'][0]['samples'][0]['operationId'] = raw['cases'][0]['forms'][0]['samples'][1]['operationId']
            elif edit == 'writes': raw['cases'][0]['forms'][0]['samples'][0]['calls']['entities.put'] = 1
            else: raw['cases'][0]['forms'][0]['samples'][0]['digestCalls'] = 5000
            with self.assertRaises(ValueError, msg=edit): checker.assess_saves(raw, product)

    def test_saved_and_restored_materials_must_match_original_native_hashes(self):
        original = json.loads(gzip.decompress((ROOT/'tests/fixtures/phase3/historical-original180.json.gz').read_bytes()))
        product = dict(commit=original['commit'], tree=original['tree'], version=original['build'])
        for phases in (('after', 'afterCold', 'empty390ColdRestoration'),
                       ('before', 'after', 'afterCold', 'empty390ColdRestoration')):
            raw = copy.deepcopy(original)
            for phase in phases:
                for row in raw['cases'][1][phase]['assets']: row['hash'] = '0'*64
            with self.assertRaises(ValueError): checker.assess_saves(raw, product)

    def test_procedure_and_canonical_command_reject_self_consistent_tampering(self):
        from acceptance.procedures import canonical_command, portable_driver, verify_execution
        repo, proof, commit = '/synthetic/repo', '/synthetic/proof', 'a'*40
        snapshot = {p: (ROOT/p).read_bytes() for p in (
            'scripts/acceptance/originals/six-save-forms.mjs',
            'scripts/acceptance/originals/full-large-exceptions.mjs')}
        for step in ('performance-standard', 'performance-large', 'saves180', 'soak', 'exceptions'):
            argv = canonical_command(step, proof)
            command = dict(argv=argv, cwd=repo)
            expected = portable_driver(step, snapshot, repo, proof, commit)
            verify_execution(step, command, argv, repo, proof, commit, snapshot, expected)
            changed = copy.deepcopy(command); changed['argv'] = ['node', 'unapproved.mjs']
            with self.assertRaises(ValueError):
                verify_execution(step, changed, changed['argv'], repo, proof, commit, snapshot, expected)
            changed = copy.deepcopy(command); changed['cwd'] = '/synthetic/other'
            with self.assertRaises(ValueError):
                verify_execution(step, changed, argv, repo, proof, commit, snapshot, expected)
            if expected is not None:
                # Recomputing the raw SHA cannot legitimize a changed assertion.
                altered = expected.replace(b'8800', b'8799', 1) if step == 'saves180' else expected.replace(b'7200', b'0000', 1)
                self.assertNotEqual(altered, expected)
                with self.assertRaises(ValueError):
                    verify_execution(step, command, argv, repo, proof, commit, snapshot, altered)


if __name__ == '__main__': unittest.main()
