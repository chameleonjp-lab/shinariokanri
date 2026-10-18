"""Trust boundaries for authored original-clause reporting, not app acceptance."""
import math
import re

def require(condition, message):
 if not condition: raise ValueError(message)

def parse_authored_clause_notes(text):
 """Read declared per-case and per-clause outcomes; no inferred local pass."""
 result={}
 for line in text.splitlines():
  if not line or line.startswith('#'):continue
  fields=line.split('|')
  require(len(fields)==6 and re.fullmatch(r'AT-[BFNE][0-9]{2}',fields[0]) is not None and fields[0] not in result,'Missing/duplicate explicit original clause decision row')
  identity,whole,*values=fields;require(whole in ('passed','blocked'),'Explicit original whole-case outcome missing')
  clauses={}
  for name,value in zip(('given','when','then','negative_or_edge'),values):
   decision,separator,note=value.partition('::')
   require(separator and decision in ('passed_local_original_conditions','not_accepted_missing_evidence') and len(note)>=12,'Explicit substantive clause outcome missing')
   clauses[name]=dict(result=decision,authorObservation=note)
  require(whole!='passed' or all(row['result']=='passed_local_original_conditions' for row in clauses.values()),'Whole case accepted without four explicit clause decisions')
  result[identity]=dict(wholeCaseResult=whole,clauses=clauses)
 return result

def verify_trace_inputs(binding, ci, formal, supp, resource):
 product=binding['build_info']
 require(ci['status']=='passed' and ci['head']==binding['commit'] and ci['sameMeasuredCandidateTree']['tree']==binding['tree'],'Fresh CI does not bind measured candidate tree')
 require(formal.get('product')==product and supp['product']==product and supp['status']=='passed_nonphysical_original_conditions','Formal/supplement candidate differs')
 steps=formal.get('formal',{})
 require(set(steps)=={'performance-standard','performance-large','saves180','soak','exceptions'} and formal.get('physicalDeviceAcceptance') is False,'Complete original five-stage formal assessment missing')
 keys=('cached_startup','selection','list_switch','compound_search','command_save','next_period','timeline_frames','graph_frames')
 limits={'standard':(3000,200,200,500,1000,200,33.4,33.4),'large':(10000,None,None,2000,None,None,None,None)}
 for size in limits:
  metrics=steps['performance-'+size];require(set(metrics)==set(keys),'Original metric assessment inventory differs')
  for key,limit in zip(keys,limits[size]):
   row=metrics[key];require(row['samples']==(330 if key.endswith('_frames') else 30) and row['originalLimitMs']==limit,'Original assessed count/limit differs')
   value=row['p95Milliseconds'];require(type(value) in (int,float) and math.isfinite(value) and value>=0,'Invalid assessed p95')
   require(row['result']==('observed_no_separate_large_limit' if limit is None else 'passed_local_numeric_condition') and (limit is None or value<=limit),'Formal original numeric condition failed')
 saves=steps['saves180'];require(isinstance(saves,list) and len(saves)==6 and all(row['samples']==30 and row['originalLimitMs']==1000 and 0<=row['commandP95Ms']<=1000 for row in saves),'Complete original 180-save assessment missing')
 soak=steps['soak']
 require(soak['actualSeconds']>=7200 and soak['records']==88003 and soak['history']==soak['pending']==113 and soak['typedOwnedIds']==162117 and soak['actualAssetBytes']==75497472 and soak['newCloneCold']=='passed_observed_full_correspondence','Original full-soak recovery assessment missing')
 for key,limit in [('exportMilliseconds',600000),('firstPaintMilliseconds',2000),('cancelMilliseconds',2000),('maximumUIIntervalMilliseconds',2000)]:
  value=soak[key];require(type(value) in (int,float) and math.isfinite(value) and 0<value<=limit,'Original assessed full-soak interval differs')
 require(steps['exceptions']==dict(malformedInputs=3,finalNativeFailures=2,unchangedNativeTables=21,coldNormalRetry=True),'Original same-input exception assessment missing')
 require(resource['status']=='verified_supplemental_observation','Actual resource assessment missing')
 proofs=resource.get('proofs',[]);require(len(proofs)==2 and {row['name'] for row in proofs}=={'baseline','candidate'},'Resource candidate/baseline inventory differs')
 candidate=next(row for row in proofs if row['name']=='candidate');baseline=next(row for row in proofs if row['name']=='baseline')
 require(candidate['commit']==binding['commit'] and candidate['build']==product and baseline['commit']=='f40d07afb709b91db1ec439c0a5503682ecab91b','Resource proof measured another candidate')
 require(all(row['actualMainRendererObservations']==18 and row['originalContracts']==73 for row in proofs) and len(resource['comparisons'])==6 and all(row['samplesEach']==3 for row in resource['comparisons']),'Resource observation scope differs')

def verify_clause_refs(refs, proof_names, local_case, case_id=None, supplements=None):
 require(isinstance(refs,list) and refs,'Missing authored clause proof reference')
 for ref in refs:
  require(isinstance(ref,dict) and ref.get('proof') in proof_names and set(ref)<={'proof','testId','section','scope'},'Unknown or historical clause proof reference')
  if ref['proof'].startswith('caseIndex-'):require(isinstance(ref.get('testId'),str) and bool(ref['testId']),'Actual clause test identity missing')
  if ref['proof']=='supplements':
   require(case_id=='AT-N05' and ref.get('section')=='n05' and isinstance(supplements,dict) and isinstance(supplements.get('n05'),dict),'Supplement reference does not exist for this original case')
   observed=supplements['n05']
   require(observed['originalFixtureSHA256']=='1ca2b19dcf4c8464c68a24a1bbe02cd1b1c4be20187ed2cee99d4e541822d0d0' and observed['nativeRecordsIncludingOriginalDeclarations']==88522 and observed['actualAssetBytes']==75497472 and len(observed['actualDownloads'])==2 and observed['allNativeTablesUnchanged']==29 and observed['resultStatus']=='unknown','Original N05 supplement scope differs')
 if local_case:require(any(ref['proof'].startswith('caseIndex-') or ref['proof']=='supplements' for ref in refs),'Local clause has no actual execution reference')

def verify_procedure_source(current, prior):
 if current['sha256']==prior['sha256']:
  require(current['bytes']==prior['bytes'],'Original procedure size differs');return None
 n06='tests/e2e/ap04-original-n-atomic-migration.spec.ts'
 require(current['path']==prior['path']==n06 and current['bytes']==prior['bytes']==13730 and prior['sha256']=='3c2857ad62360f29a56dd15c0e265cead2bf05cad4424eae4211700e4838c2ad' and current['sha256']=='926dd6ba9aefa4e8d2dc64aa0c08248d1a96557aed2fcc59fe29dbf34703212b','Unreviewed change in original case procedure')
 return 'Reviewed exact old/current SHA: nativeVersion assertion70→80 only'
