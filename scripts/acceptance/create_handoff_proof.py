"""Recover the pinned remote bundles and run every fresh handoff verification."""
import argparse, hashlib, json, shutil, subprocess, sys
from datetime import datetime, timezone
from pathlib import Path

parser = argparse.ArgumentParser()
for name in ('repository', 'binding', 'location', 'output'):
 parser.add_argument('--'+name, type=Path, required=True)
args = parser.parse_args()
repo = args.repository.resolve()
out = args.output.resolve()
binding = json.loads(args.binding.read_bytes())
assert str(repo) != binding['sourceRoot'], 'Use a separate fresh verification checkout'
def git(*args):
 return subprocess.check_output(['git',*args],cwd=repo,text=True).strip()
assert not git('status','--porcelain=v1'), 'Verification checkout must be clean'
verification_source=dict(commit=git('rev-parse','HEAD'),tree=git('rev-parse','HEAD^{tree}'),dirty=False)
out.mkdir(parents=True, exist_ok=False)
sha = lambda value: hashlib.sha256(value).hexdigest()
read = lambda path: json.loads(path.read_bytes())
launcher = Path(__file__).read_bytes()
(out/'executed-handoff-procedure.py').write_bytes(launcher)
shutil.copyfile(args.location, out/'location.json')
for source, target in [('recover_evidence.py', 'executed-recover-evidence.py'), ('scan_evidence.py', 'executed-scan-evidence.py')]:
 shutil.copyfile(repo/'scripts/acceptance'/source, out/target)
sequence = dict(format='phase3-fresh-handoff-execution/1', product=binding['build_info'], status='running', steps=[])
def save():
 (out/'sequence.json').write_text(json.dumps(sequence, indent=2)+'\n')
def observe():
 files = []
 for path in sorted((repo/'scripts').rglob('*.py')):
  assert path.is_file() and not path.is_symlink()
  value = path.read_bytes()
  files.append(dict(path=str(path), bytes=len(value), sha256=sha(value)))
 return dict(at=datetime.now(timezone.utc).isoformat(), files=files)
def run(name, argv):
 before = observe()
 row = dict(step=name, argv=argv, status='running')
 sequence['steps'].append(row)
 save()
 print(json.dumps(dict(step=name, status='running')), flush=True)
 receipt = out/'receipts'/name
 code = subprocess.call([sys.executable, str(repo/'scripts/acceptance/execute.py'), '--workdir', str(repo), '--receipt', str(receipt), '--', *argv])
 after = observe()
 (receipt/'source-provenance.json').write_text(json.dumps(dict(before=before, after=after), indent=2)+'\n')
 row.update(returncode=code, status='completed' if code == 0 else 'failed')
 save()
 assert before['files'] == after['files'], 'Reviewed Python sources changed during actual verification'
 assert Path(__file__).read_bytes() == launcher, 'Actual handoff launcher changed during execution'
 assert code == 0, 'Actual fresh handoff verification failed: '+name

save()
run('recovery', [sys.executable, str(out/'executed-recover-evidence.py'), '--location', str(out/'location.json'), '--cache', str(out/'empty-cache.git'), '--output', str(out/'recovered')])
run('scan', [sys.executable, str(out/'executed-scan-evidence.py'), '--location', str(out/'location.json'), '--recovered', str(out/'recovered'), '--output', str(out/'credential-scan.json')])
run('formal', [sys.executable, str(repo/'scripts/check_phase3.py'), '--evidence', str(out/'recovered/formal-02')])
run_id = read(out/'recovered/ci-04/actual/RETENTION.json')['runId']
run('ci', [sys.executable, str(repo/'scripts/acceptance/retain_ci.py'), '--repository', 'chameleonjp-lab/shinariokanri', '--run', run_id, '--head', binding['commit'], '--checkout', str(repo), '--output', str(out/'offline-ci'), '--index-procedure', str(repo/'scripts/acceptance/index_report.py'), '--offline-retention', str(out/'recovered/ci-04/actual'), '--candidate-binding', str(out/'recovered/formal-02/actual/candidate.json')])
fixed = read(out/'recovered/ci-3ac/actual/RETENTION.json')
run('ci-fixed', [sys.executable, str(repo/'scripts/acceptance/retain_ci.py'), '--repository', 'chameleonjp-lab/shinariokanri', '--run', fixed['runId'], '--head', fixed['head'], '--checkout', str(repo), '--output', str(out/'offline-fixed-ci'), '--index-procedure', str(repo/'scripts/acceptance/index_report.py'), '--offline-retention', str(out/'recovered/ci-3ac/actual')])
post = str(out/'recovered/post-formal-02/actual')
candidate = str(out/'recovered/formal-02/actual/candidate.json')
historical = str(out/'recovered/audit-and-assessments/actual/historical')
run('supplements', [sys.executable, str(repo/'scripts/acceptance/assess_supplements.py'), '--repository', str(repo), '--post', post, '--binding', candidate, '--index-procedure', str(repo/'scripts/acceptance/index_report.py'), '--historical', historical, '--output', str(out/'recovered-supplement-assessment')])
run('resources', [sys.executable, str(repo/'scripts/acceptance/assess_resources.py'), '--repository', str(repo), '--post', post, '--candidate-binding', candidate, '--baseline-binding', post+'/baseline-source.json', '--snapshot-procedure', str(repo/'scripts/acceptance/snapshot.py'), '--historical', historical, '--output', str(out/'recovered-resource-assessment.json')])
files = {}
def retain(key, relative):
 value = (out/relative).read_bytes()
 files[key] = dict(path=relative, bytes=len(value), sha256=sha(value))
for key, relative in {
 'packetProcedure':'executed-handoff-procedure.py', 'location':'location.json', 'recovery':'recovered/RECOVERY.json',
 'recoveryProcedure':'executed-recover-evidence.py', 'credentialScan':'credential-scan.json', 'scanProcedure':'executed-scan-evidence.py',
 'offlineCI':'offline-ci/RETENTION.json', 'offlineFixedCI':'offline-fixed-ci/RETENTION.json',
 'formalAssessment':'recovered/audit-and-assessments/actual/formal-assessment.json',
 'supplementAssessment':'recovered/audit-and-assessments/actual/supplement-assessment.json',
 'resourceAssessment':'recovered/audit-and-assessments/actual/resource-assessment.json',
 'freshSupplementAssessment':'recovered-supplement-assessment/ASSESSMENT.json', 'freshResourceAssessment':'recovered-resource-assessment.json',
}.items():
 retain(key, relative)
for label in [row['label'] for row in read(out/'location.json')['bundles']]:
 retain('manifest-'+label, 'recovered/'+label+'/manifest.json')
for label in ('ci-04', 'ci-3ac'):
 retain('retention-'+label, 'recovered/'+label+'/actual/RETENTION.json')
for row in sequence['steps']:
 for key, name in [('command','command.json'), ('exit','exit.json'), ('log','stdout-stderr.log'), ('wrapper','executed-wrapper.py'), ('sources','source-provenance.json')]:
  retain(row['step']+'/'+key, 'receipts/'+row['step']+'/'+name)
packet = dict(format='phase3-remote-evidence-handoff/1', product=binding['build_info'], recordedRoot=str(out), verificationRoot=str(repo), verificationSource=verification_source,
 status='passed_fresh_recovery_and_credential_check', formalLabel='formal-02', ciLabel='ci-04', files=files)
target = out/'HANDOFF-PROOF.json'
target.write_text(json.dumps(packet, ensure_ascii=False, indent=2)+'\n')
sys.path.insert(0, str(repo/'scripts/acceptance'))
from phase3_report_receipts import verify_delivery_receipt
formal = read(out/'recovered/audit-and-assessments/actual/formal-assessment.json')
supp = read(out/'recovered/audit-and-assessments/actual/supplement-assessment.json')
resource = read(out/'recovered/audit-and-assessments/actual/resource-assessment.json')
assert git('rev-parse','HEAD')==verification_source['commit'] and not git('status','--porcelain=v1'), 'Fresh verification checkout changed'
result = verify_delivery_receipt(target, binding, formal, supp, resource, repo)
sequence.update(status='completed', verified=result)
save()
print(json.dumps(result), flush=True)
