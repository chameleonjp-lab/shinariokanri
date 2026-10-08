"""Negative tests for the release gate, independent of product acceptance."""
import json
import tempfile
import unittest
from pathlib import Path
from check_release import validate


class ReleaseGateTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)
        self.root = Path(self.tmp.name)
        (self.root / 'docs/data').mkdir(parents=True)
        (self.root / 'docs/implementation').mkdir()
        (self.root / 'docs/data/acceptance_cases.json').write_text(json.dumps([{'id': 'AT-B01'}]))
        (self.root / 'docs/data/work_packages.json').write_text(json.dumps([{'id': 'WP01'}]))
        self.path = self.root / 'docs/implementation/release-evidence.json'
        self.evidence = {'commit': 'abc', 'base': '/shinariokanri/', 'acceptance': {'AT-B01': {'result': 'passed', 'evidence': 'browser-run'}}, 'workPackages': {'WP01': 'complete'}}
        for gate in ('realDevices', 'accessibilityManual', 'performance', 'restoreDrill', 'syncLive', 'rlsLive', 'independentReview', 'hostingCosts', 'directLinks'):
            self.evidence[gate] = {'result': 'passed', 'evidence': 'record'}

    def write(self):
        self.path.write_text(json.dumps(self.evidence))

    def test_missing_evidence_blocks(self):
        self.assertTrue(validate(self.root, 'abc'))

    def test_matching_complete_record_passes(self):
        self.write()
        self.assertEqual(validate(self.root, 'abc'), [])

    def test_different_commit_and_not_run_case_block(self):
        self.evidence['acceptance']['AT-B01']['result'] = 'not_run'
        self.write()
        errors = validate(self.root, 'def')
        self.assertTrue(any('commit' in error for error in errors))
        self.assertTrue(any('AT-B01' in error for error in errors))

    def test_automated_browser_cannot_replace_live_rls_or_real_device_gate(self):
        del self.evidence['realDevices']
        self.evidence['rlsLive']['result'] = 'not_run'
        self.write()
        errors = validate(self.root, 'abc')
        self.assertTrue(any('realDevices' in error for error in errors))
        self.assertTrue(any('rlsLive' in error for error in errors))
