"""Original performance expectations must survive a consistent metadata substitution."""
import json
from pathlib import Path
import tempfile
import unittest

from check_phase3 import original_performance_fixture

ROOT=Path(__file__).resolve().parents[1]


class OriginalPerformanceFixtureTests(unittest.TestCase):
    def test_known_immutable_original_expectations(self):
        for size in ('standard','large'):
            path=ROOT/f'docs/optimization/phase1/evidence/candidate-{size}30.json'
            self.assertEqual(original_performance_fixture(ROOT,size),json.loads(path.read_bytes())['fixture'])

    def substituted(self,size,change):
        temporary=tempfile.TemporaryDirectory();self.addCleanup(temporary.cleanup)
        root=Path(temporary.name);relative=f'docs/optimization/phase1/evidence/candidate-{size}30.json'
        value=json.loads((ROOT/relative).read_bytes());change(value['fixture'])
        path=root/relative;path.parent.mkdir(parents=True);path.write_text(json.dumps(value))
        return root

    def test_forged_fixture_hash_is_not_a_new_expected_value(self):
        root=self.substituted('standard',lambda fixture:fixture.update(sha256='0'*64))
        with self.assertRaisesRegex(ValueError,'Original performance expectation'):
            original_performance_fixture(root,'standard')

    def test_missing_materials_are_not_a_new_large_expectation(self):
        root=self.substituted('large',lambda fixture:fixture.update(assetBytes=0,assetHashes=[]))
        with self.assertRaisesRegex(ValueError,'Original performance expectation'):
            original_performance_fixture(root,'large')

    def test_unknown_size_cannot_select_another_expectation(self):
        with self.assertRaisesRegex(ValueError,'original performance size'):
            original_performance_fixture(ROOT,'small')


if __name__=='__main__':unittest.main()
