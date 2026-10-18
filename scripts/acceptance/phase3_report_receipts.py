"""Verify actual original release denial and fresh evidence handoff receipts."""
import hashlib,json,re
from datetime import datetime
from pathlib import Path,PurePosixPath

sha=lambda data:hashlib.sha256(data).hexdigest()
def require(condition,message):
 if not condition:raise ValueError(message)
def load(data):
 def pairs(rows):
  result={}
  for key,value in rows:
   require(key not in result,'Duplicate receipt JSON key');result[key]=value
  return result
 return json.loads(data,object_pairs_hook=pairs,parse_constant=lambda _:(_ for _ in ()).throw(ValueError('Nonfinite receipt JSON')))

def packet_reader(path,binding):
 path=Path(path).resolve();packet=load(path.read_bytes());root=path.parent
 require(packet['product']==binding['build_info'],'Receipt measured another product')
 recorded=PurePosixPath(packet['recordedRoot']);require(recorded.is_absolute() and '..' not in recorded.parts,'Invalid recorded receipt root')
 execution_root=PurePosixPath(packet.get('verificationRoot',binding['sourceRoot']));require(execution_root.is_absolute() and '..' not in execution_root.parts,'Invalid explicit verification checkout root')
 def data(key):
  row=packet['files'][key];relative=PurePosixPath(row['path'])
  require(not relative.is_absolute() and relative.as_posix()==row['path'] and '..' not in relative.parts and '\\' not in row['path'],'Unsafe retained receipt path')
  target=root/row['path'];require(target.is_file() and not target.is_symlink() and target.resolve().is_relative_to(root),'Missing/nonregular retained receipt')
  value=target.read_bytes();require(len(value)==row['bytes'] and sha(value)==row['sha256'],'Retained receipt bytes differ: '+key);return value
 def execution(name,expected_exit):
  for key,filename in [('command','command.json'),('exit','exit.json'),('log','stdout-stderr.log'),('wrapper','executed-wrapper.py')]:require(packet['files'][name+'/'+key]['path']=='receipts/'+name+'/'+filename,'Execution receipt path differs from canonical output')
  command=load(data(name+'/command'));exit=load(data(name+'/exit'));log=data(name+'/log');wrapper=data(name+'/wrapper')
  original=next(row for row in binding['source_files'] if row['path']=='scripts/acceptance/execute.py')
  require(len(wrapper)==original['bytes'] and sha(wrapper)==original['sha256'] and command['procedure']==dict(path=str(execution_root/'scripts/acceptance/execute.py'),retained='executed-wrapper.py',bytes=len(wrapper),sha256=sha(wrapper)),'Receipt wrapper differs from sealed original')
  require(command['cwd']==str(execution_root),'Actual child used another verification checkout')
  require(exit['returncode']==expected_exit and exit['childPid']==command['childPid']>0 and exit['executedWrapperBytesUnchanged'] is True and datetime.fromisoformat(command['startedAt'])<=datetime.fromisoformat(exit['finishedAt']),'Actual child did not exit as required')
  require(exit['log']==dict(path=str(recorded/'receipts'/name/'stdout-stderr.log'),bytes=len(log),sha256=sha(log)),'Actual child log descriptor differs')
  argv=command['argv'];require(argv and re.fullmatch(r'python(?:3(?:\.\d+)?)?',Path(argv[0]).name),'Expected actual Python child')
  return command,exit,log
 return packet,recorded,data,execution

def verify_source_interval(observation, command, exit, expected):
 require(observation['before']['files']==observation['after']['files']==expected,'Actual executed source bytes differ from reviewed procedure')
 require(datetime.fromisoformat(observation['before']['at'])<=datetime.fromisoformat(command['startedAt'])<=datetime.fromisoformat(exit['finishedAt'])<=datetime.fromisoformat(observation['after']['at']),'Source observations do not enclose the actual child')

def verify_ci_inventory(manifest,retention):
 members={row['path']:row for row in manifest['files']}
 require(retention['status']=='passed' and len(retention['logs'])==7 and {row['job'] for row in retention['logs']}=={'scope','documents','unit','browser (chromium)','browser (firefox)','browser (webkit)','verify'},'Original complete successful CI logs missing')
 require(len(retention['caseIndices'])==3 and len(retention['artifacts'])==4,'Original CI descriptor inventory differs')
 for row in retention['logs']+retention['caseIndices']+retention['artifacts']:
  require(row['path'] in members and all(members[row['path']][key]==row[key] for key in ('bytes','sha256')),'Original CI log/index/archive descriptor is disconnected from delivered bytes')

def verify_failed_receipts(root,manifest,binding):
 root=Path(root);members={row['path']:row for row in manifest['files']}
 def actual(name):
  row=members[name];value=(root/name).read_bytes()
  require(len(value)==row['bytes'] and sha(value)==row['sha256'],'Actual failed-run file differs');return value
 plan=load(actual('formal-01/sequence.json'));failed=load(actual('formal-01/candidate.json'));raw=load(actual('formal-01/soak/raw.json'))
 require(failed['commit']==plan['candidate']=='e15c237e8e8e576600f9e4f5f1150e0dd9b6b0aa' and failed['sourceRoot']==binding['sourceRoot'],'Original failed candidate differs')
 require([row['step'] for row in plan['steps']]==['performance-standard','performance-large','saves180','soak'] and [row['status'] for row in plan['steps']]==['completed','completed','completed','failed'],'Original failed attempt was overwritten or promoted')
 require(raw['sourceCommit']==failed['commit'] and raw['buildInfo']==failed['build_info'] and raw['completed'] is False and raw['status']=='failed' and raw['errors'],'Original failed-soak observation missing')
 recorded=PurePosixPath(plan['steps'][0]['argv'][-1]).parent.parent
 wrapper=next(row for row in failed['source_files'] if row['path']=='scripts/acceptance/execute.py')
 for row,expected_code in zip(plan['steps'],(0,0,0,1)):
  prefix='formal-01/'+row['step']+'/execution/'
  command=load(actual(prefix+'command.json'));exit=load(actual(prefix+'exit.json'));log=actual(prefix+'stdout-stderr.log');procedure=actual(prefix+'executed-wrapper.py')
  require(command['cwd']==failed['sourceRoot'] and command['argv']==row['argv'] and command['childPid']==exit['childPid']>0 and exit['returncode']==expected_code and exit['executedWrapperBytesUnchanged'] is True,'Actual failed child identity/exit differs')
  require(len(procedure)==wrapper['bytes'] and sha(procedure)==wrapper['sha256'] and command['procedure']==dict(path=failed['sourceRoot']+'/scripts/acceptance/execute.py',retained='executed-wrapper.py',bytes=len(procedure),sha256=sha(procedure)),'Failed-run original wrapper differs')
  require(exit['log']==dict(path=str(recorded/row['step']/'execution/stdout-stderr.log'),bytes=len(log),sha256=sha(log)),'Actual failed child log differs')
  require(datetime.fromisoformat(row['startedAt'])<=datetime.fromisoformat(command['startedAt'])<=datetime.fromisoformat(exit['finishedAt'])<=datetime.fromisoformat(row['finishedAt']),'Failed child outside original execution interval')
 return dict(originalFailedCandidate=failed['commit'],actualChildReceipts=4,failedSoakExit=1,originalUnfavorableObservationsRetained=True)

def verify_release_receipt(path,binding,overlay):
 packet,recorded,data,execution=packet_reader(path,binding)
 require(packet['format']=='phase3-original-release-check/1' and packet['status']=='blocked_verified_original_checker','Actual original release denial missing')
 require(packet['files']['overlay']['path']=='overlay.json','Original release overlay path differs')
 require(load(data('overlay'))==overlay,'Release receipt checked another acceptance overlay')
 checker=data('checker');original=next(row for row in binding['source_files'] if row['path']=='scripts/check_release.py')
 require(len(checker)==original['bytes'] and sha(checker)==original['sha256'],'Original release checker was changed')
 command,exit,log=execution('release',1)
 require(command['cwd']==binding['sourceRoot'] and command['argv'][1:]==[binding['sourceRoot']+'/scripts/check_release.py','--evidence',str(recorded/'overlay.json')],'Noncanonical original release-check command')
 require(packet['files']['release/sources']['path']=='receipts/release/source-provenance.json','Actual checker source provenance missing')
 verify_source_interval(load(data('release/sources')),command,exit,[dict(path=binding['sourceRoot']+'/scripts/check_release.py',bytes=len(checker),sha256=sha(checker))])
 require(data('packetProcedure')==Path(__file__).with_name('create_release_proof.py').read_bytes(),'Release source observer differs from reviewed launcher')
 gates=('realDevices','accessibilityManual','performance','restoreDrill','syncLive','rlsLive','independentReview','hostingCosts','directLinks')
 expected=[key for key,row in overlay['acceptance'].items() if row['result']!='passed' or not row['evidence']]+[key for key,state in overlay['workPackages'].items() if state!='complete']+[key for key in gates if overlay[key]['result']!='passed' or not overlay[key]['evidence']]
 lines=log.decode().splitlines();require(lines and lines[0]=='RELEASE BLOCKED' and [line[2:].split(':',1)[0] for line in lines[1:]]==expected and all(line.startswith('- ') for line in lines[1:]),'Original release denial differs from current pending cases/packages/gates')
 require(overlay['commit']==binding['commit'] and packet['observedHead']==binding['commit'],'Release check did not use measured candidate HEAD')
 return dict(status='verified_original_release_blocked',blockedConditions=len(expected),targetCommit=binding['commit'])

def verify_delivery_inventory(location,recovery,scan,manifests):
 required={
  'formal-02':{'candidate.json','candidate.zip','sequence.json','performance-standard/raw.json','performance-large/raw.json','results/saves180/raw.json','soak/raw.json','soak/raw-complete.scenario','exceptions/raw.json'},
  'post-formal-02':{'package.json','module-context.json','original-module-context/rg01-package.json','original-module-context/rg02-rg03-package.json','sequence.json','executed-coordinator.py','original-supplements/sequence.json','original-supplements/rg01/results.json','original-supplements/rg02-rg03/results.json','original-supplements/n05/results.json','n05-actual-downloads/results.json','n05-actual-downloads/actual-downloads.json','baseline-source.json','baseline-source.zip','baseline-resources/raw.json','candidate-resources/raw.json'},
  'audit-and-assessments':{'formal-assessment.json','supplement-assessment.json','resource-assessment.json','performance-comparison.json','historical/manifests/unaffected-local-3ab6.manifest.json','historical/manifests/additional-original-regressions-1fcadcca.manifest.json'},
  'failed-and-diagnostic':{'formal-01/candidate.json','formal-01/candidate.zip','formal-01/sequence.json','formal-01/soak/raw.json','pr70-ci-fix/initial-run.json','pr70-ci-fix/failed-incomplete-commit.log','pr70-ci-fix/watch/FINAL.json'}|{'formal-01/'+step+'/execution/'+name for step in ('performance-standard','performance-large','saves180','soak') for name in ('command.json','exit.json','stdout-stderr.log','executed-wrapper.py')},
 }
 ci_paths={'provider/run.json','provider/jobs.json','provider/artifacts.json','provider/merge-commit.json','RETENTION.json','actual-log-index.json'}|{'case-index-'+engine+'.json' for engine in ('chromium','firefox','webkit')}|{'archives/'+name+'.zip' for name in ('browser-evidence','browser-evidence-chromium-attempt1','browser-evidence-firefox-attempt1','browser-evidence-webkit-attempt1')}
 required['ci-04']=ci_paths;required['ci-3ac']=ci_paths
 labels={row['label']:row for row in location['bundles']};actual={row['label']:row for row in recovery['bundles']}
 require(len(labels)==len(location['bundles']) and len(actual)==len(recovery['bundles']) and set(required)<=set(labels) and set(labels)==set(actual)==set(manifests),'Mandatory formal/post/resource/CI/failure/audit evidence bundle missing')
 inventory=[];expected_scan=[]
 for label,manifest in manifests.items():
  rows=manifest['files'];members={row['path']:row for row in rows};require(len(rows)==len(members) and required.get(label,set())<=set(members),'Mandatory actual proof member missing: '+label)
  if label in ('ci-04','ci-3ac'):require(len([name for name in members if name.startswith('logs/')])==7,'Complete original seven CI logs missing: '+label)
  require(actual[label]['actualFiles']==len(rows) and actual[label]['manifestSHA256']==labels[label]['sha256'],'Recovered manifest/member count differs')
  expected_scan.append(dict(label=label,manifestSHA256=labels[label]['sha256'],actualFiles=len(rows)))
  inventory.extend(dict(path=label+'/'+row['path'],bytes=row['bytes'],sha256=row['sha256']) for row in rows)
 encoded=json.dumps(sorted(inventory,key=lambda row:row['path']),sort_keys=True,separators=(',',':')).encode()
 require(scan['scannedActualFiles']==len(inventory) and scan['scannedInventorySHA256']==sha(encoded) and sorted(scan['bundles'],key=lambda row:row['label'])==sorted(expected_scan,key=lambda row:row['label']),'Credential scan did not cover every recovered actual file and hash')
 return dict(bundles=len(labels),actualFiles=len(inventory),scannedInventorySHA256=sha(encoded))

def verify_delivery_receipt(path,binding,formal,supp,resource,tools_root):
 packet,recorded,data,execution=packet_reader(path,binding)
 verification_root=packet['verificationRoot'];verification_source=packet['verificationSource']
 require(verification_root!=binding['sourceRoot'] and verification_source['dirty'] is False and re.fullmatch('[0-9a-f]{40}',verification_source['commit']) is not None and re.fullmatch('[0-9a-f]{40}',verification_source['tree']) is not None,'Handoff did not use a separate clean verification checkout')
 require(packet['format']=='phase3-remote-evidence-handoff/1' and packet['status']=='passed_fresh_recovery_and_credential_check','Actual remote evidence handoff missing')
 require(packet['files']['packetProcedure']['path']=='executed-handoff-procedure.py' and data('packetProcedure')==(Path(tools_root)/'scripts/acceptance/create_handoff_proof.py').read_bytes(),'Actual handoff launcher differs from reviewed source')
 python_sources=[]
 for source in sorted((Path(tools_root)/'scripts').rglob('*.py')):
  require(source.is_file() and not source.is_symlink(),'Nonregular current Python source')
  value=source.read_bytes();python_sources.append(dict(path=verification_root+'/'+source.relative_to(tools_root).as_posix(),bytes=len(value),sha256=sha(value)))
 raw_execution=execution
 def execution(name,expected_exit):
  command,exit,log=raw_execution(name,expected_exit)
  require(packet['files'][name+'/sources']['path']=='receipts/'+name+'/source-provenance.json','Actual fresh-check source interval missing')
  verify_source_interval(load(data(name+'/sources')),command,exit,python_sources)
  return command,exit,log
 paths={'location':'location.json','recovery':'recovered/RECOVERY.json','recoveryProcedure':'executed-recover-evidence.py','credentialScan':'credential-scan.json','scanProcedure':'executed-scan-evidence.py','offlineCI':'offline-ci/RETENTION.json','offlineFixedCI':'offline-fixed-ci/RETENTION.json','formalAssessment':'recovered/audit-and-assessments/actual/formal-assessment.json','supplementAssessment':'recovered/audit-and-assessments/actual/supplement-assessment.json','resourceAssessment':'recovered/audit-and-assessments/actual/resource-assessment.json','freshSupplementAssessment':'recovered-supplement-assessment/ASSESSMENT.json','freshResourceAssessment':'recovered-resource-assessment.json'}
 for key,expected in paths.items():require(packet['files'][key]['path']==expected,'Handoff receipt path differs from actual canonical child output: '+key)
 location=load(data('location'));recovery=load(data('recovery'))
 require(location['format']=='phase3-evidence-location/1' and location['repository']=='https://github.com/chameleonjp-lab/shinariokanri.git' and re.fullmatch('[0-9a-f]{40}',location['commit']) is not None,'Handoff location is not immutable original repository evidence')
 require(recovery['format']=='phase3-recovered-evidence/1' and recovery['commit']==location['commit'] and recovery['locationSHA256']==sha(data('location')) and recovery['cacheExistedBefore'] is False and recovery['outputExistedBefore'] is False and recovery['remoteFetchPerformed'] is True,'Handoff was not recovered into a fresh directory from immutable remote bytes')
 bundles={row['label']:row for row in location['bundles']};actual={row['label']:row for row in recovery['bundles']}
 require(len(bundles)==len(location['bundles']) and set(actual)==set(bundles) and all(row['result']=='all_actual_bytes_verified' and row['actualFiles']>0 and row['manifestSHA256']==bundles[key]['sha256'] for key,row in actual.items()),'Not all declared evidence bundles were recovered')
 source=data('recoveryProcedure');require(source==(Path(tools_root)/'scripts/acceptance/recover_evidence.py').read_bytes() and sha(source)==recovery['procedureSHA256'],'Executed recovery procedure differs from reviewed current source')
 command,exit,log=execution('recovery',0)
 require(command['argv'][1:]==[str(recorded/'executed-recover-evidence.py'),'--location',str(recorded/'location.json'),'--cache',str(recorded/'empty-cache.git'),'--output',str(recorded/'recovered')],'Noncanonical fresh recovery command')
 require(datetime.fromisoformat(command['startedAt'])<=datetime.fromisoformat(recovery['startedAt'])<=datetime.fromisoformat(recovery['finishedAt'])<=datetime.fromisoformat(exit['finishedAt']),'Recovery observation outside actual child interval')
 scan=load(data('credentialScan'));scan_source=data('scanProcedure')
 require(scan_source==(Path(tools_root)/'scripts/acceptance/scan_evidence.py').read_bytes() and scan['format']=='phase3-evidence-credential-scan/1' and scan['status']=='passed_no_unexpected_credentials' and scan['locationSHA256']==sha(data('location')) and scan['procedureSHA256']==sha(scan_source) and scan['unexpectedFindings']==[] and scan['scannedActualFiles']>0,'Credential scan did not verify this delivered evidence')
 require(scan['inlineAttachmentScanComplete'] is True and scan['decodedInlineAttachments']>0 and re.fullmatch('[0-9a-f]{64}',scan['decodedInlineInventorySHA256']) is not None and all(row['immutableOriginalNegative'] is True for row in scan['invalidNestedContainers']),'Inline or unreadable-container credential coverage incomplete')
 command,exit,log=execution('scan',0)
 require(command['argv'][1:]==[str(recorded/'executed-scan-evidence.py'),'--location',str(recorded/'location.json'),'--recovered',str(recorded/'recovered'),'--output',str(recorded/'credential-scan.json')],'Noncanonical evidence credential-scan command')
 require(datetime.fromisoformat(command['startedAt'])<=datetime.fromisoformat(scan['startedAt'])<=datetime.fromisoformat(scan['finishedAt'])<=datetime.fromisoformat(exit['finishedAt']),'Credential scan outside actual child interval')
 manifests={}
 for label,row in bundles.items():
  require(packet['files']['manifest-'+label]['path']=='recovered/'+label+'/manifest.json','Recovered manifest path differs')
  raw=data('manifest-'+label);require(len(raw)==row['bytes'] and sha(raw)==row['sha256'],'Handoff original manifest bytes differ');manifests[label]=load(raw)
 coverage=verify_delivery_inventory(location,recovery,scan,manifests)
 for label in ('ci-04','ci-3ac'):
  key='retention-'+label;require(packet['files'][key]['path']=='recovered/'+label+'/actual/RETENTION.json','Delivered CI descriptor path differs')
  raw=data(key);row=next(row for row in manifests[label]['files'] if row['path']=='RETENTION.json')
  require(len(raw)==row['bytes'] and sha(raw)==row['sha256'],'Delivered CI descriptor bytes differ from original manifest')
  verify_ci_inventory(manifests[label],load(raw))
 expected_failure_inventory=load((Path(tools_root)/'docs/acceptance/phase3/failed-evidence-inventory.json').read_bytes())
 require(expected_failure_inventory['format']=='phase3-original-failure-inventory/1' and expected_failure_inventory['files']==manifests['failed-and-diagnostic']['files'],'Original complete failed/diagnostic inventory was reduced or substituted')
 failed_checks=verify_failed_receipts(Path(path).resolve().parent/'recovered/failed-and-diagnostic/actual',manifests['failed-and-diagnostic'],binding)
 for key,expected in [('formalAssessment',formal),('supplementAssessment',supp),('resourceAssessment',resource)]:require(load(data(key))==expected,'Delivered assessment differs from current actual proof: '+key)
 formal_label=packet['formalLabel'];ci_label=packet['ciLabel'];require(formal_label in bundles and ci_label in bundles,'Required formal/CI handoff bundle missing')
 command,exit,log=execution('formal',0)
 require(command['cwd']==verification_root and command['argv'][1:]==[verification_root+'/scripts/check_phase3.py','--evidence',str(recorded/'recovered'/formal_label)],'Noncanonical recovered formal verification')
 require(load(log)==formal,'Fresh recovered formal assessment differs from original actual assessment')
 offline=load(data('offlineCI'));command,exit,log=execution('ci',0)
 require(offline['status']=='passed' and offline['head']==binding['commit'] and offline['sameMeasuredCandidateTree']['tree']==binding['tree'] and offline['providerScope'].startswith('Offline verification of pinned original provider outputs'),'Recovered actual CI was not independently verified')
 require(command['argv'][1:]==[verification_root+'/scripts/acceptance/retain_ci.py','--repository','chameleonjp-lab/shinariokanri','--run',offline['runId'],'--head',binding['commit'],'--checkout',verification_root,'--output',str(recorded/'offline-ci'),'--index-procedure',verification_root+'/scripts/acceptance/index_report.py','--offline-retention',str(recorded/'recovered'/ci_label/'actual'),'--candidate-binding',str(recorded/'recovered'/formal_label/'actual/candidate.json')],'Noncanonical recovered offline CI verification')
 fixed=load(data('offlineFixedCI'));command,exit,log=execution('ci-fixed',0)
 require(fixed['status']=='passed' and fixed['head']=='3ac43524f7762b71b5030a16054d069304701131' and fixed['runId']=='39152878973' and fixed['providerScope'].startswith('Offline verification of pinned original provider outputs'),'Recovered fixed PR70 CI was not independently verified')
 require(command['argv'][1:]==[verification_root+'/scripts/acceptance/retain_ci.py','--repository','chameleonjp-lab/shinariokanri','--run',fixed['runId'],'--head',fixed['head'],'--checkout',verification_root,'--output',str(recorded/'offline-fixed-ci'),'--index-procedure',verification_root+'/scripts/acceptance/index_report.py','--offline-retention',str(recorded/'recovered/ci-3ac/actual')],'Noncanonical recovered fixed PR70 CI verification')
 post=str(recorded/'recovered/post-formal-02/actual');candidate=str(recorded/'recovered'/formal_label/'actual/candidate.json');historical=str(recorded/'recovered/audit-and-assessments/actual/historical')
 command,exit,log=execution('supplements',0)
 require(command['argv'][1:]==[verification_root+'/scripts/acceptance/assess_supplements.py','--repository',verification_root,'--post',post,'--binding',candidate,'--index-procedure',verification_root+'/scripts/acceptance/index_report.py','--historical',historical,'--output',str(recorded/'recovered-supplement-assessment')],'Noncanonical recovered original supplement verification')
 fresh_supp=load(data('freshSupplementAssessment'));require({key:value for key,value in fresh_supp.items() if key!='indices'}=={key:value for key,value in supp.items() if key!='indices'},'Recovered supplementary facts differ')
 command,exit,log=execution('resources',0)
 require(command['argv'][1:]==[verification_root+'/scripts/acceptance/assess_resources.py','--repository',verification_root,'--post',post,'--candidate-binding',candidate,'--baseline-binding',post+'/baseline-source.json','--snapshot-procedure',verification_root+'/scripts/acceptance/snapshot.py','--historical',historical,'--output',str(recorded/'recovered-resource-assessment.json')],'Noncanonical recovered resource verification')
 fresh_resource=load(data('freshResourceAssessment'));require(fresh_resource['status']==resource['status'] and fresh_resource['comparisons']==resource['comparisons'] and fresh_resource['originalFixtureInputs']==resource['originalFixtureInputs'],'Recovered resource facts differ')
 normalize=lambda rows:[{**row,'raw':{key:value for key,value in row['raw'].items() if key!='path'}} for row in rows]
 require(normalize(fresh_resource['proofs'])==normalize(resource['proofs']),'Recovered resource proof measured different source/build/raw bytes')
 return dict(status='verified_fresh_remote_handoff',commit=location['commit'],verificationSource=verification_source,verificationRoot=verification_root,**coverage,failedAttempt=failed_checks,credentials='no_unexpected_findings',formal='verified_again_from_recovered_bytes',ci='original_provider_bytes_verified_offline',supplements='original_given_and_actual_download_bytes_verified_again',resources='baseline_candidate_snapshots_and_all_raw_points_verified_again')
