"""Build the final truthful release record from independently retained actual evidence and explicit authored original decisions."""
from pathlib import Path
import json,hashlib
from datetime import datetime,timezone
r=Path('/workspace/shinariokanri/docs/quality/pr49-followup-2026-10-15');s=Path('/workspace/pr49-checks');read=lambda p:json.loads(p.read_text());sha=lambda b:hashlib.sha256(b).hexdigest();write=lambda p,x:p.write_text(json.dumps(x,ensure_ascii=False,indent=2)+'\n')
assert read(s/'evidence-publication-preparation/local-verification-execution/exit.json')['returncode']==0
assert read(s/'evidence-publication-preparation/portable-fetch-execution/exit.json')['returncode']==0
assert read(s/'evidence-publication-preparation/remote-verification-execution/exit.json')['returncode']==0
c=read(r/'CLAUSE_REVIEW.json');w=read(r/'WORK_PACKAGE_REVIEW.json');g=read(r/'REGRESSION_REVIEW.json');supp=read(r/'SUPPLEMENTAL_REVIEW.json');binding=read(r/'evidence/product/binding.json');product=binding['product']
soak=read(s/'soak7200-1fcadcca-attempt1/ADJUDICATION.json');negative=read(s/'large-negatives-1fcadcca-attempt1/ADJUDICATION.json');extra=read(s/'rg02-rg03-same-given-1fcadcca-attempt1/ADJUDICATION.json');manual=read(s/'manual-final-pr58-preparation/verification.json')
assert soak['actual7200']=='passed' and negative['result']=='passed_local_same_full_input_negative_retry' and extra['passed']==12
assert manual['result']=='passed_local_packet_integrity_and_link_targets' and manual['product']==product
assert len(c['cases'])==116 and sum(len(row['clauses']) for row in c['cases'])==464 and len(w['workPackages'])==24 and len(g['groups'])==6 and len(supp['checks'])==68
actual_cases={row['id']:row for row in c['cases']}
acceptance={i:{'result':'passed' if v['wholeCaseResult']=='passed' else 'not_run_original_external_conditions','evidence':['CLAUSE_REVIEW.json#'+i],'scope':'Four original clauses individually reviewed; actual execution identity and bytes are referenced at case level.','remainingOriginalCondition':v.get('limitation')} for i,v in actual_cases.items()}
states={row['id']:'complete' if row['reviewState']=='completed' else 'pending_original_conditions_or_dependencies' for row in w['workPackages']}
assert sum(v['result']=='passed' for v in acceptance.values())==94 and [i for i,v in states.items() if v=='complete']==['WP01']
manifest_rows=[]
for p in sorted((r/'evidence/bundles').glob('*.manifest.json')):
 b=p.read_bytes();x=json.loads(b);manifest_rows.append({'path':str(p.relative_to(r)),'bytes':len(b),'sha256':sha(b),'label':x['label'],'files':len(x['files']),'archiveBytes':x['archive']['bytes'],'parts':len(x['archive']['parts'])})
assert len(manifest_rows)==8
record={'recordPhase':'final_authored_local_followup; original external release conditions remain blocked','recordedAt':datetime.now(timezone.utc).isoformat(),'commit':product['commit'],'base':product['base'],'product':product,'productBinding':'evidence/product/binding.json','originalCounts':{'requirements':104,'cases':116,'clauses':464,'workPackages':24,'regressionGroups':6,'supplemental':68},'acceptance':acceptance,'workPackages':states,
'authorReview':{'clauses':'CLAUSE_REVIEW.json','authorDecisions':'evidence/author-current-decisions.json','workPackages':'WORK_PACKAGE_REVIEW.json','regressions':'REGRESSION_REVIEW.json','supplemental':'SUPPLEMENTAL_REVIEW.json','localCasesPassed':94,'casesBlockedOriginalConditions':22,'individuallySatisfiedLocalPackageGates':18,'wholePackagesCompleted':1,'scope':'Local gates, owned acceptance cases and original dependencies are assessed separately. Counts are a summary of explicit decisions, not their evidence.'},
'actual7200':{'result':'passed_local_original_conditions','actualElapsedSeconds':7200.018523761,'adjudication':soak,'bundleManifest':'evidence/bundles/formal-1fcadcca.manifest.json'},
'additionalSameFullInputNegatives':{'result':negative['result'],'adjudication':negative,'bundleManifest':'evidence/bundles/full-large-exceptions-1fcadcca.manifest.json'},
'additionalOriginalRegressionUI':{'result':extra['result'],'passed':12,'actualArchives':30,'bundleManifest':'evidence/bundles/additional-original-regressions-1fcadcca.manifest.json'},
'localOriginalChecks':read(r/'evidence/local-formal-summary.json'),
'ci':{'runId':38792131626,'result':'all7_jobs_success','unitFiles':122,'unitPassed':1132,'browserPerEngine':228,'actualMergeCommit':'819b178f8d47048d3bc5aaa6988b67c220a71947','actualMergeTree':product['tree'],'artifactIndependentValidation':'passed_actual_provider_SHA_CRC_all228_inventory_12_originals_and481_metadata_byte_checks_per_engine','bundleManifest':'evidence/bundles/product-ci-1fcadcca.manifest.json','engineBuilds':{'chromium':'f26008444ed75dd8c5af','firefox':'fdfa60b47e1db110ce41','webkit':'7824d3a0bf4a81f63fe8'},'scope':'Actual CI merge/build identity is retained; it is not relabeled as local build8ec.'},
'evidenceBundles':manifest_rows,
'manualPacket':manual,
'realDevices':{'result':'not_run','evidence':[],'remaining':'Actual iPhone/iPad/PC OS/browser and original touch/IME/Files/rotation/split procedures.'},
'accessibilityManual':{'result':'not_run','evidence':[],'remaining':'Actual VoiceOver/NVDA/OS keyboard/200% browser text and original focus/speech checks.'},
'performance':{'result':'partial_local_passed_physical_target_measurements_not_run','evidence':['evidence/local-formal-summary.json','evidence/bundles/formal-1fcadcca.manifest.json'],'remaining':'Specified real target devices per N04/E11/R06. Local original30/180/7200 results are complete.'},
'restoreDrill':{'result':'partial_full_native_new_clone_cold_passed_physical_handoff_not_run','evidence':['evidence/bundles/formal-1fcadcca.manifest.json','evidence/bundles/full-large-exceptions-1fcadcca.manifest.json'],'remaining':'Actual OS Files cancellation and physical separate-device/old-application handoff are unexecuted; logical complete-file recovery is passed.'},
'syncLive':{'result':'not_run','evidence':[],'remaining':'Dedicated authorized HTTPS/Auth endpoint and two actual offline devices unspecified.'},
'rlsLive':{'result':'not_run','evidence':[],'remaining':'Dedicated DataAPI/private Storage and5 actual roles/direct calls/revocation unspecified.'},
'independentReview':{'result':'not_run','evidence':[],'remaining':'Independent reviewer has not executed/approved the concrete fixed handoff; no notification sent.'},
'hostingCosts':{'result':'not_run','evidence':[],'remaining':'Actual dedicated tier/region/usage/quota/cost are unspecified; public documentation is not the current contract.'},
'directLinks':{'result':'not_run','evidence':[],'remaining':'Approved dedicated HTTPS candidate URL unavailable; observed Pages build-info404 is retained separately.'}}
record['evidenceLocation']='evidence/bundle-location.json'
record['evidencePublication']={'commit':'d5e132ef6f4db6a0f3fbe888228ffd1007d653f9','branch':'evidence/pr49-followup-20261015-1fcadcca','actualAnonymousDownloadedFiles':59,'freshDownloadedVerifierPassedBundles':8,'remoteFetchReceipt':'evidence/provenance/evidence-publication/portable-fetch-receipt.json','remoteVerifierReceipt':'evidence/provenance/evidence-publication/remote-verification-execution/exit.json','scope':'Actual public immutable retrieval and byte verification, separate from independent human acceptance.'}
record['reviewDelivery']={'pullRequest':58,'predecessorPR57':'Externally merged2026-10-16T06:07:44Z into main1f642457; this task did not perform the merge.'}
write(r/'release-evidence.json',record)
print(json.dumps({'record':'release-evidence.json','sha256':sha((r/'release-evidence.json').read_bytes()),'localPassed':94,'originalExternalBlocked':22,'wholeCompletePackages':1,'nineOriginalReleaseGates':'allheld','bundleGroups':8},ensure_ascii=False))
