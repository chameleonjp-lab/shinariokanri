"""Synthetic evidence-receipt boundaries; no real release/handoff is certified."""
import hashlib,json,tempfile
from pathlib import Path
import unittest
from acceptance.phase3_report_receipts import packet_reader,verify_delivery_inventory,verify_ci_inventory,verify_source_interval

sha=lambda data:hashlib.sha256(data).hexdigest()

class HandoffProofBoundaryTests(unittest.TestCase):
 def fixture(self):
  paths={
   'formal-02':['candidate.json','candidate.zip','sequence.json','performance-standard/raw.json','performance-large/raw.json','results/saves180/raw.json','soak/raw.json','soak/raw-complete.scenario','exceptions/raw.json'],
   'post-formal-02':['package.json','module-context.json','original-module-context/rg01-package.json','original-module-context/rg02-rg03-package.json','sequence.json','executed-coordinator.py','original-supplements/sequence.json','original-supplements/rg01/results.json','original-supplements/rg02-rg03/results.json','original-supplements/n05/results.json','n05-actual-downloads/results.json','n05-actual-downloads/actual-downloads.json','baseline-source.json','baseline-source.zip','baseline-resources/raw.json','candidate-resources/raw.json'],
   'audit-and-assessments':['formal-assessment.json','supplement-assessment.json','resource-assessment.json','performance-comparison.json','historical/manifests/unaffected-local-3ab6.manifest.json','historical/manifests/additional-original-regressions-1fcadcca.manifest.json'],
   'failed-and-diagnostic':['formal-01/sequence.json','formal-01/candidate.json','formal-01/candidate.zip','formal-01/soak/raw.json','pr70-ci-fix/initial-run.json','pr70-ci-fix/failed-incomplete-commit.log','pr70-ci-fix/watch/FINAL.json']+['formal-01/'+step+'/execution/'+name for step in ('performance-standard','performance-large','saves180','soak') for name in ('command.json','exit.json','stdout-stderr.log','executed-wrapper.py')],
  }
  ci=['provider/run.json','provider/jobs.json','provider/artifacts.json','provider/merge-commit.json','RETENTION.json','actual-log-index.json']+['case-index-'+engine+'.json' for engine in ('chromium','firefox','webkit')]+['archives/'+name+'.zip' for name in ('browser-evidence','browser-evidence-chromium-attempt1','browser-evidence-firefox-attempt1','browser-evidence-webkit-attempt1')]
  paths['ci-04']=ci+['logs/'+str(i)+'.log' for i in range(7)];paths['ci-3ac']=ci+['logs/'+str(i)+'.log' for i in range(7)]
  manifests={label:dict(files=[dict(path=path,bytes=1,sha256='0'*64) for path in names]) for label,names in paths.items()}
  return self.inputs(manifests)
 def inputs(self,manifests):
  location=dict(bundles=[dict(label=label,sha256=sha(json.dumps(value,sort_keys=True).encode())) for label,value in manifests.items()])
  recovery=dict(bundles=[dict(label=row['label'],manifestSHA256=row['sha256'],actualFiles=len(manifests[row['label']]['files'])) for row in location['bundles']])
  inventory=[dict(path=label+'/'+row['path'],bytes=row['bytes'],sha256=row['sha256']) for label,value in manifests.items() for row in value['files']]
  scan=dict(scannedActualFiles=len(inventory),scannedInventorySHA256=sha(json.dumps(sorted(inventory,key=lambda row:row['path']),sort_keys=True,separators=(',',':')).encode()),bundles=[dict(label=row['label'],manifestSHA256=row['manifestSHA256'],actualFiles=row['actualFiles']) for row in recovery['bundles']])
  return location,recovery,scan,manifests
 def test_complete_synthetic_inventory_and_coverage_are_recognized(self):
  result=verify_delivery_inventory(*self.fixture());self.assertEqual(result['bundles'],6)
 def test_missing_post_bundle_is_rejected_even_if_all_declarations_agree(self):
  manifests=self.fixture()[3];del manifests['post-formal-02']
  with self.assertRaises(ValueError):verify_delivery_inventory(*self.inputs(manifests))
 def test_missing_resource_raw_or_baseline_snapshot_cannot_be_resealed_as_complete(self):
  for name in ('baseline-source.zip','candidate-resources/raw.json'):
   manifests=self.fixture()[3];rows=manifests['post-formal-02']['files'];rows[:]=[row for row in rows if row['path']!=name]
   with self.subTest(name=name),self.assertRaises(ValueError):verify_delivery_inventory(*self.inputs(manifests))
 def test_failed_child_receipts_cannot_be_deleted_and_resealed(self):
  for name in ('command.json','exit.json','stdout-stderr.log','executed-wrapper.py'):
   manifests=self.fixture()[3];rows=manifests['failed-and-diagnostic']['files'];rows[:]=[row for row in rows if row['path']!='formal-01/soak/execution/'+name]
   with self.subTest(name=name),self.assertRaises(ValueError):verify_delivery_inventory(*self.inputs(manifests))
 def test_fixed_ci_logs_cannot_be_deleted_and_resealed(self):
  manifests=self.fixture()[3];rows=manifests['ci-3ac']['files'];rows[:]=[row for row in rows if not row['path'].startswith('logs/')]
  with self.assertRaises(ValueError):verify_delivery_inventory(*self.inputs(manifests))
 def test_ci_descriptor_hashes_must_match_each_delivered_member(self):
  manifest=self.fixture()[3]['ci-3ac'];rows={row['path']:row for row in manifest['files']}
  jobs=('scope','documents','unit','browser (chromium)','browser (firefox)','browser (webkit)','verify')
  retention=dict(status='passed',logs=[dict(**rows['logs/'+str(i)+'.log'],job=job) for i,job in enumerate(jobs)],caseIndices=[row for row in manifest['files'] if row['path'].startswith('case-index-')],artifacts=[row for row in manifest['files'] if row['path'].startswith('archives/')])
  verify_ci_inventory(manifest,retention)
  for field in ('logs','caseIndices','artifacts'):
   changed=json.loads(json.dumps(retention));changed[field][0]['sha256']='f'*64
   with self.subTest(field=field),self.assertRaises(ValueError):verify_ci_inventory(manifest,changed)
 def test_changed_checker_and_unbounded_source_observations_are_rejected(self):
  expected=[dict(path='/source/scripts/check_release.py',bytes=10,sha256='a'*64)]
  command=dict(startedAt='2026-10-18T00:00:01+00:00');exit=dict(finishedAt='2026-10-18T00:00:02+00:00')
  observation=dict(before=dict(at='2026-10-18T00:00:00+00:00',files=expected),after=dict(at='2026-10-18T00:00:03+00:00',files=expected))
  verify_source_interval(observation,command,exit,expected)
  for side in ('before','after'):
   changed=json.loads(json.dumps(observation));changed[side]['files'][0]['sha256']='f'*64
   with self.subTest(side=side),self.assertRaises(ValueError):verify_source_interval(changed,command,exit,expected)
  changed=json.loads(json.dumps(observation));changed['before']['at']='2026-10-18T00:00:02+00:00'
  with self.assertRaises(ValueError):verify_source_interval(changed,command,exit,expected)
 def test_partial_credential_scan_and_mismatched_child_pid_are_rejected(self):
  args=self.fixture();args[2]['scannedActualFiles']=1
  with self.assertRaises(ValueError):verify_delivery_inventory(*args)
  with tempfile.TemporaryDirectory() as directory:
   root=Path(directory);wrapper=b'synthetic wrapper input only';product=dict(commit='synthetic');binding=dict(build_info=product,sourceRoot='/synthetic/source',source_files=[dict(path='scripts/acceptance/execute.py',bytes=len(wrapper),sha256=sha(wrapper))])
   log=b'synthetic result\n';recorded='/synthetic/packet';files={}
   command=dict(cwd='/synthetic/source',startedAt='2026-10-18T00:00:00+00:00',argv=['python3','synthetic.py'],childPid=10,procedure=dict(path='/synthetic/source/scripts/acceptance/execute.py',retained='executed-wrapper.py',bytes=len(wrapper),sha256=sha(wrapper)))
   exit=dict(finishedAt='2026-10-18T00:00:01+00:00',returncode=0,childPid=11,executedWrapperBytesUnchanged=True,log=dict(path=recorded+'/receipts/recovery/stdout-stderr.log',bytes=len(log),sha256=sha(log)))
   target=root/'receipts/recovery';target.mkdir(parents=True)
   names=dict(command='command.json',exit='exit.json',log='stdout-stderr.log',wrapper='executed-wrapper.py')
   for key,data in [('command',json.dumps(command).encode()),('exit',json.dumps(exit).encode()),('log',log),('wrapper',wrapper)]:
    filename=names[key];(target/filename).write_bytes(data);files['recovery/'+key]=dict(path='receipts/recovery/'+filename,bytes=len(data),sha256=sha(data))
   packet=root/'packet.json';packet.write_text(json.dumps(dict(product=product,recordedRoot=recorded,files=files)))
   execute=packet_reader(packet,binding)[3]
   with self.assertRaises(ValueError):execute('recovery',0)
   exit['childPid']=10;data=json.dumps(exit).encode();(target/'exit.json').write_bytes(data);files['recovery/exit'].update(bytes=len(data),sha256=sha(data));packet.write_text(json.dumps(dict(product=product,recordedRoot=recorded,files=files)))
   self.assertEqual(packet_reader(packet,binding)[3]('recovery',0)[1]['childPid'],10)
   packet.write_text(json.dumps(dict(product=product,recordedRoot=recorded,verificationRoot='/synthetic/fresh',files=files)))
   with self.assertRaises(ValueError):packet_reader(packet,binding)[3]('recovery',0)
   command['cwd']='/synthetic/fresh';command['procedure']['path']='/synthetic/fresh/scripts/acceptance/execute.py';data=json.dumps(command).encode();(target/'command.json').write_bytes(data);files['recovery/command'].update(bytes=len(data),sha256=sha(data))
   packet.write_text(json.dumps(dict(product=product,recordedRoot=recorded,verificationRoot='/synthetic/fresh',files=files)))
   self.assertEqual(packet_reader(packet,binding)[3]('recovery',0)[0]['cwd'],'/synthetic/fresh')


if __name__=='__main__':unittest.main()
