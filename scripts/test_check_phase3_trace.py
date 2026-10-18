"""Synthetic checker boundaries; these tests do not certify product acceptance."""
import copy,hashlib,json
from pathlib import Path
import unittest
from acceptance.phase3_trace_proofs import verify_clause_refs,verify_procedure_source,verify_trace_inputs,parse_authored_clause_notes

ROOT=Path(__file__).resolve().parents[1]

class TraceProofBoundaryTests(unittest.TestCase):
 def authored_row(self,whole='passed',clause='passed_local_original_conditions'):
  return '|'.join(['AT-B01',whole]+[clause+'::原の条項と実際の対象証拠を明示して照合する。' for _ in range(4)])
 def test_declared_local_block_is_preserved_instead_of_inferred_pass(self):
  passed=parse_authored_clause_notes(self.authored_row());self.assertEqual(passed['AT-B01']['wholeCaseResult'],'passed')
  blocked=parse_authored_clause_notes(self.authored_row('blocked','not_accepted_missing_evidence'))
  self.assertEqual(blocked['AT-B01']['wholeCaseResult'],'blocked');self.assertTrue(all(row['result']=='not_accepted_missing_evidence' for row in blocked['AT-B01']['clauses'].values()))
 def test_missing_or_contradictory_explicit_clause_decisions_are_rejected(self):
  value=self.authored_row();bad=[value.replace('|passed|','|not_run|',1),value.replace('passed_local_original_conditions::','',1),value.replace('passed_local_original_conditions::','not_accepted_missing_evidence::',1),value+'\n'+value,'|'.join(value.split('|')[:5])]
  for text in bad:
   with self.subTest(text=text[:70]),self.assertRaises(ValueError):parse_authored_clause_notes(text)
 def inputs(self):
  binding=dict(commit='candidate',tree='sealed-tree',build_info=dict(commit='candidate',tree='sealed-tree',version='sealed-build'))
  ci=dict(status='passed',head='candidate',sameMeasuredCandidateTree=dict(tree='sealed-tree'))
  formal=dict(product=binding['build_info'],physicalDeviceAcceptance=False,formal={})
  keys=('cached_startup','selection','list_switch','compound_search','command_save','next_period','timeline_frames','graph_frames')
  for size,limits in [('standard',(3000,200,200,500,1000,200,33.4,33.4)),('large',(10000,None,None,2000,None,None,None,None))]:
   formal['formal']['performance-'+size]={key:dict(samples=330 if key.endswith('_frames') else 30,originalLimitMs=limit,p95Milliseconds=1,result='observed_no_separate_large_limit' if limit is None else 'passed_local_numeric_condition') for key,limit in zip(keys,limits)}
  formal['formal']['saves180']=[dict(samples=30,originalLimitMs=1000,commandP95Ms=1) for _ in range(6)]
  formal['formal']['soak']=dict(actualSeconds=7200.1,records=88003,history=113,pending=113,typedOwnedIds=162117,actualAssetBytes=75497472,newCloneCold='passed_observed_full_correspondence',exportMilliseconds=1,firstPaintMilliseconds=1,cancelMilliseconds=1,maximumUIIntervalMilliseconds=1)
  formal['formal']['exceptions']=dict(malformedInputs=3,finalNativeFailures=2,unchangedNativeTables=21,coldNormalRetry=True)
  supp=dict(product=binding['build_info'],status='passed_nonphysical_original_conditions')
  resource=dict(status='verified_supplemental_observation',proofs=[dict(name='candidate',commit='candidate',build=binding['build_info'],actualMainRendererObservations=18,originalContracts=73),dict(name='baseline',commit='f40d07afb709b91db1ec439c0a5503682ecab91b',build={},actualMainRendererObservations=18,originalContracts=73)],comparisons=[dict(samplesEach=3) for _ in range(6)])
  return binding,ci,formal,supp,resource
 def test_complete_synthetic_assessment_structure_is_recognized(self):
  verify_trace_inputs(*self.inputs())
 def test_product_only_formal_and_missing_formal_stage_are_rejected(self):
  for changed in ('product-only','missing-exceptions'):
   with self.subTest(changed=changed):
    args=list(self.inputs())
    if changed=='product-only':args[2]={'product':args[0]['build_info']}
    else:del args[2]['formal']['exceptions']
    with self.assertRaises(ValueError):verify_trace_inputs(*args)
 def test_successful_resource_from_another_commit_or_build_is_rejected(self):
  for field in ('commit','build'):
   args=self.inputs();args[4]['proofs'][0][field]='another-candidate'
   with self.subTest(field=field),self.assertRaises(ValueError):verify_trace_inputs(*args)
 def test_short_soak_or_relaxed_original_numeric_limit_is_rejected(self):
  for changed in ('seconds','limit','samples','cold'):
   args=self.inputs();formal=args[2]['formal']
   if changed=='seconds':formal['soak']['actualSeconds']=7199
   elif changed=='limit':formal['performance-standard']['selection']['originalLimitMs']=201
   elif changed=='samples':formal['saves180'][0]['samples']=2
   else:formal['soak']['newCloneCold']='not_run'
   with self.subTest(changed=changed),self.assertRaises(ValueError):verify_trace_inputs(*args)
 def test_clause_refs_reject_nonexistent_old_or_candidate_only_local_proofs(self):
  names={'candidate','caseIndex-chromium','supplements'}
  for refs in (['old-e15-proof'],[{'proof':'nonexistent'}],[{'proof':'caseIndex-chromium'}],[{'proof':'candidate'}],[{'proof':'supplements','section':'nonexistent-F02-proof'}]):
   with self.subTest(refs=refs),self.assertRaises(ValueError):verify_clause_refs(refs,names,True)
  verify_clause_refs([dict(proof='caseIndex-chromium',testId='actual-test')],names,True)
  verify_clause_refs([dict(proof='candidate',scope='external not_run')],names,False)
  observed=dict(originalFixtureSHA256='1ca2b19dcf4c8464c68a24a1bbe02cd1b1c4be20187ed2cee99d4e541822d0d0',nativeRecordsIncludingOriginalDeclarations=88522,actualAssetBytes=75497472,actualDownloads=[{},{}],allNativeTablesUnchanged=29,resultStatus='unknown')
  ref=[dict(proof='supplements',section='n05')]
  verify_clause_refs(ref,names,True,'AT-N05',dict(n05=observed))
  with self.assertRaises(ValueError):verify_clause_refs(ref,names,True,'AT-F02',dict(n05=observed))
 def test_n06_path_does_not_authorize_arbitrary_assertion_changes(self):
  path='tests/e2e/ap04-original-n-atomic-migration.spec.ts';data=(ROOT/path).read_bytes()
  current=dict(path=path,bytes=len(data),sha256=hashlib.sha256(data).hexdigest())
  prior=dict(path=path,bytes=13730,sha256='3c2857ad62360f29a56dd15c0e265cead2bf05cad4424eae4211700e4838c2ad')
  self.assertIn('70→80',verify_procedure_source(current,prior))
  changed=data.replace(b'expect((await image(page)).version).toBe(80);',b'// assertion removed')
  self.assertNotEqual(changed,data)
  forged=dict(path=path,bytes=len(changed),sha256=hashlib.sha256(changed).hexdigest())
  with self.assertRaises(ValueError):verify_procedure_source(forged,prior)

if __name__=='__main__':unittest.main()
