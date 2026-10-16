import copy
import hashlib
from pathlib import Path
import tempfile
import unittest

import check_phase1 as checker


class Phase1ContractTests(unittest.TestCase):
    root = Path(__file__).resolve().parents[1]

    def test_original_inputs_104_paths_464_clauses_and_all_candidates(self):
        result = checker.validate(self.root)
        self.assertEqual(result['requirements'], 104)
        self.assertEqual(result['clauses'], 464)
        self.assertFalse(result['acceptancePromoted'])

    def test_detects_same_length_original_input_corruption(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            (root / 'fixture').write_bytes(b'original')
            row = {'path': 'fixture', 'bytes': 8, 'gitBlob': hashlib.sha1(b'blob 8\0original').hexdigest()}
            checker.verify_blob(root, row)
            (root / 'fixture').write_bytes(b'corrupt!')
            with self.assertRaisesRegex(ValueError, 'contract changed'):
                checker.verify_blob(root, row)

    def test_rejects_missing_duplicate_and_promoted_requirement_rows(self):
        requirements = checker.load(self.root, 'docs/data/requirements.json')
        cases = checker.load(self.root, 'docs/quality/pr49-followup-2026-10-15/CLAUSE_REVIEW.json')['cases']
        trace = checker.load(self.root, checker.FOLDER / 'requirements.json')['requirements']
        for corrupted in [trace[:-1], trace[:-1] + [trace[0]]]:
            with self.assertRaises(ValueError):
                checker.verify_trace(requirements, cases, corrupted)
        promoted = copy.deepcopy(trace)
        promoted[0]['freshAcceptance'] = 'PASSED'
        with self.assertRaisesRegex(ValueError, 'cannot promote'):
            checker.verify_trace(requirements, cases, promoted)

    def test_rejects_a_clause_pointer_bound_to_another_case(self):
        requirements = checker.load(self.root, 'docs/data/requirements.json')
        cases = checker.load(self.root, 'docs/quality/pr49-followup-2026-10-15/CLAUSE_REVIEW.json')['cases']
        trace = copy.deepcopy(checker.load(self.root, checker.FOLDER / 'requirements.json')['requirements'])
        trace[0]['clauses'][0]['pointer'] = 'docs/quality/pr49-followup-2026-10-15/CLAUSE_REVIEW.json#/cases/1/clauses'
        with self.assertRaisesRegex(ValueError, 'Mismatched'):
            checker.verify_trace(requirements, cases, trace)

    def test_original30_cannot_drop_a_sample_or_change_the_p95(self):
        original = checker.load(self.root, checker.FOLDER / 'evidence/baseline-standard30.json')
        self.assertEqual(checker.assess_original30(original)['cached_startup']['samples'], 30)
        shortened = copy.deepcopy(original)
        shortened['measurements']['cached_startup']['milliseconds'].pop()
        with self.assertRaisesRegex(ValueError, 'count/raw'):
            checker.assess_original30(shortened)
        forged = copy.deepcopy(original)
        forged['measurements']['command_save']['p95'] = 0
        with self.assertRaisesRegex(ValueError, 'Nearest-rank'):
            checker.assess_original30(forged)

    def test_large_has_only_the_original_two_limits_and_retains_actual_material_bytes(self):
        original = checker.load(self.root, checker.FOLDER / 'evidence/baseline-large30.json')
        result = checker.assess_original30(original)
        self.assertEqual(sum(value['originalLimitMs'] is not None for value in result.values()), 2)
        unverified = copy.deepcopy(original)
        unverified['finalPersisted']['assets'][0]['verified'] = False
        with self.assertRaisesRegex(ValueError, 'Actual native/material'):
            checker.assess_original30(unverified)
        original['fixture']['assetBytes'] -= 1
        with self.assertRaisesRegex(ValueError, 'material bytes'):
            checker.assess_original30(original)


if __name__ == '__main__':
    unittest.main()
