from pathlib import Path
import json,hashlib,subprocess
r=Path('/workspace/shinariokanri/docs/quality/pr49-followup-2026-10-15');s=Path('/workspace/pr49-graph-measure-source');read=lambda p:json.loads(p.read_text());sha=lambda b:hashlib.sha256(b).hexdigest()
c=read(r/'CLAUSE_REVIEW.json');a=read(s/'docs/data/acceptance_cases.json');originals={x['id']:x for x in a};assert len(originals)==len(c['cases'])==116
for x in c['cases']:
 o=originals[x['id']];assert x['requirementIds']==o['requirement_ids'] and x['originalWorkPackage']==o['package_id'];assert len(x['clauses'])==4
 for q in x['clauses']:assert q['original']==o[q['name']]
 if x['wholeCaseResult']=='passed':assert all(q['authorResult']=='passed_local_original_conditions' for q in x['clauses'])
 else:assert x['pendingOriginalExternalExecution']['reason'] and x['limitation']
assert sum(x['wholeCaseResult']=='passed' for x in c['cases'])==94
source=c['currentAuthorDecisionSource'];raw=(r/source['path']).read_bytes();assert len(raw)==source['bytes'] and sha(raw)==source['sha256']
def allrows(v):
 if isinstance(v,dict):
  if 'id'in v:yield v
  for q in v.values():yield from allrows(q)
 elif isinstance(v,list):
  for q in v:yield from allrows(q)
for name,key,count in [('WORK_PACKAGE_REVIEW.json','workPackages',24),('REGRESSION_REVIEW.json','groups',6)]:
 x=read(r/name);meta=x['originalSource'];raw=(s/meta['path']).read_bytes();assert len(raw)==meta['bytes'] and sha(raw)==meta['sha256'];byid={v['id']:v for v in allrows(json.loads(raw))};assert len(x[key])==count
 for row in x[key]:assert row['original']==byid[row['id']]
w=read(r/'WORK_PACKAGE_REVIEW.json');cases={x['id']:x for x in c['cases']};states={}
for row in w['workPackages']:
 o=row['original'];expected=row['gateReviewResult']=='passed_local_gate_scope' and all(cases[i]['wholeCaseResult']=='passed'for i in o['acceptance_ids']) and all(states[i] for i in o['depends_on']);assert (row['reviewState']=='completed')==expected;states[row['id']]=expected
assert [i for i,v in states.items()if v]==['WP01']
x=read(r/'SUPPLEMENTAL_REVIEW.json');orig={v['id']:v for v in read(s/x['original']['path'])};assert len(x['checks'])==68
for row in x['checks']:assert row['original']==orig[row['id']]
assert sum(row['reviewResult']=='not_adopted'for row in x['checks'])==36
location=read(r/'evidence/bundle-location.json');assert len(location['files'])==59 and location['commit']=='d5e132ef6f4db6a0f3fbe888228ffd1007d653f9'
for p in (r/'evidence/bundles').glob('*.manifest.json'):
 expected=next(row for row in location['files'] if row['path']=='docs/quality/pr49-followup-2026-10-15/'+str(p.relative_to(r)));raw=p.read_bytes();assert len(raw)==expected['bytes'] and sha(raw)==expected['sha256']
assert not list(r.rglob('*.zip')) and not list((r/'evidence/bundles').glob('*.part*'))
record=read(r/'release-evidence.json');assessment=read(r/'evidence/release-checker-local/assessment.json');assert sha((r/'release-evidence.json').read_bytes())==assessment['recordSHA256'] and assessment['identityOrBaseFailures']==0 and assessment['failureCount']==54
assert record['commit']=='1fcadcca703863873a57d297e83b1b184e63e778' and record['manualPacket']['sha256']=='e3b131c1525447a12e45a6f40c814b595ecd80a529de1f57a5db578ae66da3f6'
print(json.dumps({'result':'passed_original_wording_identity_and_current_decision_integrity','originalCases':116,'originalClauses':464,'localPassed':94,'externalBlocked':22,'originalPackages':24,'originalRegressions':6,'originalSupplemental':68,'unadoptedChecks':36,'wholeCompletePackages':['WP01'],'publicEvidenceFiles':59,'localReleaseBlock':54}))
