"""Integration checks for source identity and honest blocked-release retention."""
import hashlib
import json
import shutil
import subprocess
import tempfile
import unittest
from pathlib import Path
import retain_release_review as retention

REPO = Path(__file__).resolve().parents[2]

class RetainReleaseReviewTests(unittest.TestCase):
    def setUp(self):
        self.temporary = tempfile.TemporaryDirectory()
        self.addCleanup(self.temporary.cleanup)
        root = Path(self.temporary.name)
        self.product, self.review, self.output = root/'product', root/'review', root/'artifact'
        for directory in [self.product, self.review]:
            directory.mkdir()
            self.git(directory, 'init', '-q')
            self.git(directory, 'config', 'user.name', 'Evidence fixture')
            self.git(directory, 'config', 'user.email', 'fixture@example.invalid')
        for name in ['scripts/check_release.py', 'docs/data/acceptance_cases.json', 'docs/data/work_packages.json']:
            target = self.product/name
            target.parent.mkdir(parents=True, exist_ok=True)
            shutil.copyfile(REPO/name, target)
        self.git(self.product, 'add', '.')
        self.git(self.product, 'commit', '-qm', 'Original checker fixture')
        self.target = self.git(self.product, 'rev-parse', 'HEAD')
        tree = self.git(self.product, 'rev-parse', 'HEAD^{tree}')
        product = {'commit':self.target, 'tree':tree, 'dirty':False,
                   'base':'/shinariokanri/', 'version':'0'*20}
        cases = json.loads((self.product/'docs/data/acceptance_cases.json').read_text())
        packages = json.loads((self.product/'docs/data/work_packages.json').read_text())
        self.record = {'commit':self.target, 'base':'/shinariokanri/', 'product':product,
            'acceptance':{r['id']:{'result':'not_run','evidence':[]} for r in cases},
            'workPackages':{r['id']:'not_started' for r in packages}}
        code = (self.product/'scripts/check_release.py').read_bytes()
        self.binding = {'product':product, 'sourceFiles':[{'path':'scripts/check_release.py',
            'bytes':len(code),'sha256':hashlib.sha256(code).hexdigest()}]}
        self.write_review()
        self.git(self.review, 'add', '.')
        self.git(self.review, 'commit', '-qm', 'Review fixture')

    def git(self, root, *args):
        return subprocess.check_output(['git',*args],cwd=root,text=True).strip()

    def write_review(self):
        for relative, value in [(retention.RECORD,self.record),(retention.BINDING,self.binding)]:
            path = self.review/relative
            path.parent.mkdir(parents=True,exist_ok=True)
            path.write_text(json.dumps(value,ensure_ascii=False,indent=2)+'\n')

    def test_retains_exact_record_and_real_original_blocked_result(self):
        actual = retention.retain(self.review,self.product,self.output)
        self.assertEqual(actual['releaseGate'],'blocked')
        self.assertEqual(actual['originalChecker']['exitCode'],1)
        self.assertEqual(actual['productCommit'],self.target)
        self.assertEqual((self.review/retention.RECORD).read_bytes(),(self.output/'release-evidence.json').read_bytes())
        self.assertEqual(json.loads((self.output/'release-evidence.json').read_text()),self.record)
        log = (self.output/'original-release-checker.log').read_text()
        self.assertTrue(log.startswith('RELEASE BLOCKED'))
        self.assertEqual(len([line for line in log.splitlines() if line.startswith('- ')]),149)

    def test_rejects_wrong_actual_product_checkout_before_retention(self):
        self.record['commit']='f'*40
        self.record['product']['commit']='f'*40
        self.write_review()
        with self.assertRaisesRegex(ValueError,'Actual product checkout'):
            retention.retain(self.review,self.product,self.output)
        self.assertFalse(self.output.exists())

    def test_rejects_source_tampering_before_retention(self):
        self.binding['sourceFiles'][0]['sha256']='0'*64
        self.write_review()
        with self.assertRaisesRegex(ValueError,'Measured source differs'):
            retention.retain(self.review,self.product,self.output)
        self.assertFalse(self.output.exists())

    def test_rejects_omitted_measured_inputs_before_retention(self):
        self.binding['sourceFiles']=[]
        self.write_review()
        with self.assertRaisesRegex(ValueError,'Sealed source scope'):
            retention.retain(self.review,self.product,self.output)
        self.assertFalse(self.output.exists())

if __name__ == '__main__':
    unittest.main()
