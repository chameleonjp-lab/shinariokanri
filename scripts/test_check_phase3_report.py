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
            else:
                project = b'{"projectId":"10000000-0000-4000-8000-000000000001","formatVersion":"1.0.0","revision":"1","entities":[],"relations":[],"history":[]}'
                archive.writestr('data/project.json', project)
                archive.writestr('manifest.json', json.dumps(dict(format='scenario-package',formatVersion='1.0.0',minimumReaderVersion='1.0.0',projectId='10000000-0000-4000-8000-000000000001',snapshotId='10000000-0000-4000-8000-000000000002',exportedAt='2026-10-18T00:00:00Z',assetMode='embedded',files=[dict(path='data/project.json',role='project',byteSize=len(project),sha256=hashlib.sha256(project).hexdigest() if kind == 'valid' else '0'*64)])))
        if kind == 'empty':
            return CompleteReportTests().native(dict(files=[]))
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


INDEX = ROOT/'scripts/acceptance/index_report.py'

class CompleteReportTests(unittest.TestCase):
 def native(self,overrides=None,wrong_hash=False):
  identity='10000000-0000-4000-8000-000000000001'
  project=json.dumps(dict(projectId=identity,formatVersion='1.0.0',revision='1',entities=[],relations=[],history=[])).encode()
  manifest=dict(format='scenario-package',formatVersion='1.0.0',minimumReaderVersion='1.0.0',projectId=identity,snapshotId='10000000-0000-4000-8000-000000000002',exportedAt='2026-10-18T00:00:00Z',assetMode='embedded',files=[dict(path='data/project.json',role='project',byteSize=len(project),sha256='0'*64 if wrong_hash else hashlib.sha256(project).hexdigest())])
  manifest.update(overrides or {});buffer=io.BytesIO()
  with zipfile.ZipFile(buffer,'w') as z:z.writestr('manifest.json',json.dumps(manifest));z.writestr('data/project.json',project)
  return buffer.getvalue()
 def attachment(self,name,data,kind='application/octet-stream'):
  return dict(name=name,contentType=kind,body=base64.b64encode(data).decode())
 def run_index(self,title,attachments):
  report=dict(config=dict(workers=1,projects=[dict(retries=0,repeatEach=1)]),errors=[],stats=dict(expected=1,unexpected=0,flaky=0,skipped=0),suites=[dict(title='synthetic checker input only',file='synthetic.spec.ts',specs=[dict(id='synthetic',title=title,tests=[dict(projectName='chromium',expectedStatus='passed',status='expected',results=[dict(status='passed',retry=0,errors=[],duration=1,attachments=attachments)])])])])
  with tempfile.TemporaryDirectory() as directory:
   root=Path(directory);(root/'report.json').write_text(json.dumps(report))
   argv=[sys.executable,str(INDEX),'--report',str(root/'report.json'),'--recorded-root','/synthetic/runner','--retained-root',str(root),'--output',str(root/'index.json'),'--expected','1']
   process=subprocess.run(argv,capture_output=True,text=True)
   return process,json.loads((root/'index.json').read_bytes()) if (root/'index.json').exists() else None
 def test_duplicate_names_preserve_every_actual_file_and_observation(self):
  attachments=[]
  for number,data in enumerate((b'first actual download',b'second distinct actual download')):
   attachments.append(self.attachment('consultation.md',data,'text/markdown'))
   descriptor=dict(fileName='consultation.md',fileSHA256=hashlib.sha256(data).hexdigest(),fileBytes=len(data))
   attachments.append(self.attachment('descriptor.json',json.dumps(descriptor).encode(),'application/json'))
  process,index=self.run_index('synthetic duplicate attachment input',attachments)
  self.assertEqual(process.returncode,0,process.stderr)
  row=index['tests'][0];self.assertEqual(len(row['attachments']),4)
  self.assertEqual([r['occurrence'] for r in row['attachments']],[1,1,2,2])
  self.assertEqual([o['matchesAttachmentOrdinals'] for o in row['observationRecords']],[[0],[2]])
  self.assertEqual(len(row['observations']['descriptor.json']),2)
  self.assertEqual([r['valuePath'] for r in row['observationRecords']],[['observations','descriptor.json',0],['observations','descriptor.json',1]])
  forged=json.loads(base64.b64decode(attachments[-1]['body']));forged['fileSHA256']='0'*64
  attachments[-1]=self.attachment('descriptor.json',json.dumps(forged).encode(),'application/json')
  self.assertNotEqual(self.run_index('synthetic duplicate attachment input',attachments)[0].returncode,0)
 def test_all_pinned_original_n09_rejection_bytes_are_read_without_promoting_output(self):
  fixture=ROOT/'tests/fixtures/rb10-import-errors';manifest=json.loads((fixture/'MANIFEST.json').read_bytes());attachments=[]
  for number,row in enumerate(manifest['negative']):
   data=(fixture/row['path']).read_bytes();name=f'filesystem-read-{number:03d}-'+row['path']
   attachments.append(self.attachment(name,data,'application/zip'))
   attachments.append(self.attachment(name+'.json',json.dumps(dict(filename=row['path'],bytes=len(data),sha256=hashlib.sha256(data).hexdigest())).encode(),'application/json'))
  process,index=self.run_index('AT-N09 synthetic original rejection evidence',attachments)
  self.assertEqual(process.returncode,0,process.stderr)
  self.assertEqual(sum(r.get('role')=='unchanged-original-negative-fixture' for r in index['tests'][0]['attachments']),len(manifest['negative']))
  payload=bytearray(base64.b64decode(attachments[0]['body']));payload[-1]^=1
  attachments[0]=self.attachment(attachments[0]['name'],payload,'application/zip')
  self.assertNotEqual(self.run_index('AT-N09 synthetic original rejection evidence',attachments)[0].returncode,0)
 def test_extensionless_actual_downloads_receive_native_hash_verification(self):
  name='filesystem-read-003-actual-download-inode'
  process,index=self.run_index('synthetic extensionless actual file',[self.attachment(name,self.native())])
  self.assertEqual(process.returncode,0,process.stderr)
  self.assertTrue(index['tests'][0]['attachments'][0]['archive']['allDeclaredFileBytesAndHashesMatch'])
  process,_=self.run_index('synthetic extensionless actual file',[self.attachment(name,self.native(wrong_hash=True))])
  self.assertNotEqual(process.returncode,0)
 def test_positive_native_outputs_require_original_compatible_format(self):
  for changed in (dict(format='foreign-package'),dict(formatVersion='99.0.0'),dict(minimumReaderVersion='1.1.0'),dict(minimumReaderVersion='01.0.0'),dict(requiredFeatures=['unknown-feature']),dict(requiredFeatures='portable-recovery-v1')):
   process,_=self.run_index('synthetic unknown positive output',[self.attachment('complete-backup-001.scenario',self.native(changed))])
   self.assertNotEqual(process.returncode,0,str(changed))
 def test_positive_manifest_fields_and_project_binding_are_required(self):
  for changed in (dict(projectId='not-an-id'),dict(projectId='10000000-0000-4000-8000-000000000099'),dict(snapshotId=None),dict(exportedAt='invalidZ'),dict(exportedAt='2026-W42-7T00:00:00Z'),dict(exportedAt='2026-10-18+00:00Z'),dict(assetMode='unknown')):
   process,_=self.run_index('synthetic invalid positive header',[self.attachment('complete-backup-001.scenario',self.native(changed))])
   self.assertNotEqual(process.returncode,0,str(changed))
  raw=self.native();buffer=io.BytesIO()
  with zipfile.ZipFile(io.BytesIO(raw)) as original,zipfile.ZipFile(buffer,'w') as changed:
   manifest=json.loads(original.read('manifest.json'));manifest['files'][0]['role']='asset'
   changed.writestr('manifest.json',json.dumps(manifest));changed.writestr('data/project.json',original.read('data/project.json'))
  self.assertNotEqual(self.run_index('synthetic wrong declared role',[self.attachment('complete-backup-001.scenario',buffer.getvalue())])[0].returncode,0)
 def test_required_features_match_native_members_and_dictionary_dependencies(self):
  def with_members(features, members):
   buffer=io.BytesIO()
   with zipfile.ZipFile(io.BytesIO(self.native())) as original,zipfile.ZipFile(buffer,'w') as changed:
    manifest=json.loads(original.read('manifest.json'));manifest['requiredFeatures']=features
    changed.writestr('data/project.json',original.read('data/project.json'))
    for path,role in members:
     data=b'{}';changed.writestr(path,data)
     manifest['files'].append(dict(path=path,role=role,byteSize=len(data),sha256=hashlib.sha256(data).hexdigest()))
    changed.writestr('manifest.json',json.dumps(manifest))
   return buffer.getvalue()
  pairs=[('shared-records-v1','data/records.json','record_dictionary'),('portable-recovery-v1','data/recovery.json','recovery'),('native-sync-recovery-v1','data/sync-recovery.json','sync_recovery')]
  invalid=[([feature],[]) for feature,path,role in pairs]+[([] ,[(path,role)]) for feature,path,role in pairs]
  invalid += [([feature],[]) for feature in ('shared-record-deltas-v1','shared-calendar-records-v1')]
  for features,members in invalid:
   with self.subTest(features=features,members=members):
    process,_=self.run_index('synthetic inconsistent native header',[self.attachment('complete-backup-001.scenario',with_members(features,members))])
    self.assertNotEqual(process.returncode,0,process.stderr)
  # This checker only confirms header/member agreement. Semantic recovery and
  # dictionary decoding remain assertions of the original application.
  features=[feature for feature,path,role in pairs[1:]]
  members=[(path,role) for feature,path,role in pairs[1:]]
  process,index=self.run_index('synthetic header-only member agreement',[self.attachment('fixture.scenario',with_members(features,members))])
  self.assertEqual(process.returncode,0,process.stderr)
  self.assertTrue(index['tests'][0]['attachments'][0]['archive']['originalManifestHeaderCompatible'])
 def test_metadata_only_native_is_never_labeled_complete_output(self):
  payload=self.native(dict(assetMode='metadata_only'))
  process,_=self.run_index('synthetic incomplete positive output',[self.attachment('complete-backup-001.scenario',payload)])
  self.assertNotEqual(process.returncode,0)
  process,index=self.run_index('synthetic metadata-only input',[self.attachment('fixture.scenario',payload)])
  self.assertEqual(process.returncode,0,process.stderr)
  self.assertFalse(index['tests'][0]['attachments'][0]['archive']['completeEmbeddedAssetMode'])

if __name__ == '__main__': unittest.main()
