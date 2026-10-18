"""Actual-report indexing must distinguish rejected input from complete output."""
import base64
import hashlib
import io
import json
from pathlib import Path
import subprocess
import sys
import tempfile
import unittest
import zipfile

ROOT = Path(__file__).resolve().parents[1]


class ReportEvidenceTests(unittest.TestCase):
    def archive(self, kind):
        value = io.BytesIO()
        with zipfile.ZipFile(value, 'w') as archive:
            if kind == 'unsafe': archive.writestr('../outside.json', '{}')
            elif kind == 'empty':
                archive.writestr('manifest.json', '{"files":[]}'); archive.writestr('unlisted.txt', 'unlisted')
            else:
                project = b'{"projectId":"synthetic","revision":"1","entities":[],"relations":[],"history":[]}'
                archive.writestr('data/project.json', project)
                archive.writestr('manifest.json', json.dumps(dict(formatVersion='1.0.0', files=[dict(path='data/project.json',byteSize=len(project),sha256=hashlib.sha256(project).hexdigest() if kind == 'valid' else '0'*64)])))
        return value.getvalue()

    def run_index(self, name, payload):
        attachments = [dict(name=name, contentType='application/zip', body=base64.b64encode(payload).decode())]
        if name.startswith('AT-B12-input-'):
            observation = dict(archiveSha256=hashlib.sha256(payload).hexdigest(), visibleReason='ARCHIVE_INVALID path', unchangedAuthorRecords=True, unchangedAssetBytes=True)
            attachments.append(dict(name='AT-B12-rejected-'+name.removeprefix('AT-B12-input-')+'.json',contentType='application/json',body=base64.b64encode(json.dumps(observation).encode()).decode()))
        report = dict(config=dict(workers=1,projects=[dict(retries=0,repeatEach=1)]),errors=[],stats=dict(expected=1,unexpected=0,flaky=0,skipped=0),suites=[dict(title='synthetic checker input',file='synthetic.spec.ts',specs=[dict(id='synthetic',title='AT-B12 synthetic checker input',tests=[dict(projectName='chromium',expectedStatus='passed',status='expected',results=[dict(status='passed',retry=0,errors=[],duration=1,attachments=attachments)])])])])
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory); (root/'report.json').write_text(json.dumps(report))
            process = subprocess.run([sys.executable,str(ROOT/'scripts/acceptance/index_report.py'),'--report',str(root/'report.json'),'--recorded-root','/synthetic/runner','--retained-root',str(root),'--output',str(root/'index.json'),'--expected','1'],capture_output=True,text=True)
            index = json.loads((root/'index.json').read_bytes()) if (root/'index.json').exists() else None
            return process, index

    def test_original_rejected_unsafe_input_remains_readable_evidence(self):
        process, index = self.run_index('AT-B12-input-unsafe-path.scenario', self.archive('unsafe'))
        self.assertEqual(process.returncode,0,process.stderr)
        self.assertIn('malformed',str(index['tests'][0]['attachments'][0]['archive']))

    def test_vacuous_manifest_is_never_a_complete_output(self):
        for name in ('complete-backup-001.scenario','AT-N14-cold-complete.scenario','AT-E12-new-cold-complete.scenario'):
            process, _ = self.run_index(name,self.archive('empty'))
            self.assertNotEqual(process.returncode,0,name)

    def test_named_complete_outputs_require_actual_member_hashes(self):
        for name in ('complete-backup-001.scenario','AT-N14-cold-complete.scenario','AT-E12-new-cold-complete.scenario'):
            process, _ = self.run_index(name,self.archive('wrong-hash'))
            self.assertNotEqual(process.returncode,0,name)
        process, index = self.run_index('complete-backup-001.scenario',self.archive('valid'))
        self.assertEqual(process.returncode,0,process.stderr)
        self.assertTrue(index['tests'][0]['attachments'][0]['archive']['allDeclaredFileBytesAndHashesMatch'])


if __name__ == '__main__': unittest.main()
