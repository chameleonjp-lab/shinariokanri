"""Reject self-consistent substitutions in supplementary proof, not product tests."""
import copy
import json
from pathlib import Path
import tempfile
import unittest

from acceptance.phase3_post_procedures import (
 N05_CURRENT_STORES,resource_entry,sha,verify_n05_downloads,
 verify_n05_observation,verify_resource_provenance,
)

ROOT=Path(__file__).resolve().parents[1]

class SupplementProofTests(unittest.TestCase):
 def setUp(self):
  self.temporary=tempfile.TemporaryDirectory();self.addCleanup(self.temporary.cleanup);self.root=Path(self.temporary.name)
  self.procedure=(ROOT/'scripts/acceptance/measure_resources.mjs').read_bytes();self.repository=Path('/recorded/product')
  self.command={'startedAt':'2026-10-18T10:00:00+00:00'};self.receipt={'finishedAt':'2026-10-18T10:01:00+00:00'}

 def resource(self):
  (self.root/'helper').mkdir();data=b'export const retained=true;';(self.root/'helper/entry.js').write_bytes(data)
  entry=resource_entry(self.procedure,self.repository);(self.root/'entry.mjs').write_bytes(entry)
  return dict(helperFiles=[dict(path='entry.js',bytes=len(data),sha256=sha(data))],entrySHA256=sha(entry),startedAt='2026-10-18T10:00:01+00:00',finishedAt='2026-10-18T10:00:59+00:00')

 def verify_resource(self,raw):verify_resource_provenance(self.root,raw,self.procedure,self.repository,self.command,self.receipt)

 def test_exact_sealed_entry_and_complete_helper_inventory(self):
  raw=self.resource();self.verify_resource(raw)
  for path in ('src/storage/store.ts','src/testing/performanceFixture.ts','src/storage/json.ts'):self.assertIn(json.dumps(str(self.repository/path)).encode(),(self.root/'entry.mjs').read_bytes())

 def test_wrong_checkout_import_even_with_recomputed_entry_hash(self):
  raw=self.resource();data=resource_entry(self.procedure,Path('/another/checkout'));(self.root/'entry.mjs').write_bytes(data);raw['entrySHA256']=sha(data)
  with self.assertRaisesRegex(ValueError,'sealed exact repository'):self.verify_resource(raw)

 def test_undeclared_helper_member(self):
  raw=self.resource();(self.root/'helper/unreported.js').write_bytes(b'different')
  with self.assertRaisesRegex(ValueError,'complete helper inventory'):self.verify_resource(raw)

 def test_resource_result_outside_corresponding_real_command(self):
  raw=self.resource();raw['finishedAt']='2026-10-18T10:02:00+00:00'
  with self.assertRaisesRegex(ValueError,'corresponding actual child'):self.verify_resource(raw)

 def observation(self):
  metadata={'totalRecords':88522,'fixtureIdentity':'synthetic checker fixture only'}
  native={name:dict(count=0,sha256='a'*64) for name in N05_CURRENT_STORES};native['entities']['count']=88522;native['assets']['count']=3
  value=dict(fixture=metadata,physical='not_run',actualAuth='not_run',nativeBefore=native,nativeAfter=copy.deepcopy(native),timing=dict(startedAt=100,firstPaintAt=110,largestTimerGap=100),progress='状態を確認中',result=dict(status='unknown',truncated=True,limits=dict(maxStates=100000,maxTransitions=10000,maxMs=30000)))
  return value,metadata

 def test_all_current_native_stores_and_original_caps(self):
  value,metadata=self.observation();verify_n05_observation(value,metadata);self.assertEqual(len(N05_CURRENT_STORES),29)

 def test_missing_store_from_both_sides_is_not_all_native_equality(self):
  value,metadata=self.observation()
  for key in ('nativeBefore','nativeAfter'):del value[key]['workspaceInputs']
  with self.assertRaisesRegex(ValueError,'omitted a current schema store'):verify_n05_observation(value,metadata)

 def test_different_fixture_with_same_record_counts(self):
  value,metadata=self.observation();value['fixture']={**metadata,'fixtureIdentity':'substitute'}
  with self.assertRaisesRegex(ValueError,'fixed metadata'):verify_n05_observation(value,metadata)

 def test_longer_analysis_caps_are_not_accepted(self):
  value,metadata=self.observation();value['result']['limits']['maxMs']=30001
  with self.assertRaisesRegex(ValueError,'safety proof'):verify_n05_observation(value,metadata)

 def downloads(self):
  (self.root/'retained-downloads').mkdir();result={'status':'unknown','syntheticCheckerFixture':True};raw=json.dumps(result).encode();events=[];recorded=Path('/recorded/capture')
  for identity in ('a'*32,'b'*32):
   name=identity+'.raw';(self.root/'retained-downloads'/name).write_bytes(raw)
   events.append(dict(source=str(recorded/'downloads'/identity),retained=str(recorded/'retained-downloads'/name),capturedAt='2026-10-18T10:00:30+00:00',eventMask=8,sameActualInodeAtCapture=True,parsedJSONStatus='unknown',bytes=len(raw),sha256=sha(raw)))
  return dict(result='retained_actual_downloads',childReturncode=0,errors=[],events=events),recorded,result

 def verify_downloads(self,data,recorded,result):return verify_n05_downloads(data,self.root,recorded,result,self.command,self.receipt)

 def test_two_different_retained_actual_events(self):
  data,recorded,result=self.downloads();self.assertEqual(len(self.verify_downloads(data,recorded,result)),2)

 def test_duplicate_event_does_not_prove_two_downloads(self):
  data,recorded,result=self.downloads();data['events'][1]=copy.deepcopy(data['events'][0])
  with self.assertRaisesRegex(ValueError,'duplicated'):self.verify_downloads(data,recorded,result)

 def test_changed_actual_file_even_with_recomputed_descriptor(self):
  data,recorded,result=self.downloads();row=data['events'][1];raw=b'{"status":"unknown","different":true}';(self.root/'retained-downloads'/Path(row['retained']).name).write_bytes(raw);row.update(bytes=len(raw),sha256=sha(raw))
  with self.assertRaisesRegex(ValueError,'actual N05 bytes/result'):self.verify_downloads(data,recorded,result)

if __name__=='__main__':unittest.main()
