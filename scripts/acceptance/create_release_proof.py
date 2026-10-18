"""Run the unchanged release checker on the measured HEAD and retain its denial."""
import argparse, hashlib, json, shutil, subprocess, sys
from datetime import datetime, timezone
from pathlib import Path

parser = argparse.ArgumentParser()
for name in ('repository', 'binding', 'overlay', 'output'):
 parser.add_argument('--'+name, type=Path, required=True)
args = parser.parse_args()
repo = args.repository.resolve()
out = args.output.resolve()
binding = json.loads(args.binding.read_bytes())
assert str(repo) == binding['sourceRoot']
head = lambda: subprocess.check_output(['git', 'rev-parse', 'HEAD'], cwd=repo, text=True).strip()
assert head() == binding['commit']
out.mkdir(parents=True, exist_ok=False)
shutil.copyfile(args.overlay, out/'overlay.json')
checker = (repo/'scripts/check_release.py').read_bytes()
original = next(row for row in binding['source_files'] if row['path'] == 'scripts/check_release.py')
assert len(checker) == original['bytes'] and hashlib.sha256(checker).hexdigest() == original['sha256']
(out/'original-check-release.py').write_bytes(checker)
(out/'executed-packet-procedure.py').write_bytes(Path(__file__).read_bytes())
def observe():
 data = (repo/'scripts/check_release.py').read_bytes()
 return dict(at=datetime.now(timezone.utc).isoformat(), files=[dict(path=str(repo/'scripts/check_release.py'), bytes=len(data), sha256=hashlib.sha256(data).hexdigest())])
before = observe()
code = subprocess.call([sys.executable, str(repo/'scripts/acceptance/execute.py'),
 '--workdir', str(repo), '--receipt', str(out/'receipts/release'), '--',
 sys.executable, str(repo/'scripts/check_release.py'), '--evidence', str(out/'overlay.json')])
after = observe()
assert before['files'] == after['files'] == [dict(path=str(repo/'scripts/check_release.py'), bytes=original['bytes'], sha256=original['sha256'])]
(out/'receipts/release/source-provenance.json').write_text(json.dumps(dict(before=before, after=after), indent=2)+'\n')
assert code == 1 and head() == binding['commit'], 'Original release checker must actually deny the unchanged measured candidate'
files = {}
def retain(key, relative):
 data = (out/relative).read_bytes()
 files[key] = dict(path=relative, bytes=len(data), sha256=hashlib.sha256(data).hexdigest())
retain('overlay', 'overlay.json')
retain('checker', 'original-check-release.py')
retain('packetProcedure', 'executed-packet-procedure.py')
retain('release/sources', 'receipts/release/source-provenance.json')
for key, name in [('command', 'command.json'), ('exit', 'exit.json'), ('log', 'stdout-stderr.log'), ('wrapper', 'executed-wrapper.py')]:
 retain('release/'+key, 'receipts/release/'+name)
packet = dict(format='phase3-original-release-check/1', product=binding['build_info'],
 recordedRoot=str(out), observedHead=head(), status='blocked_verified_original_checker', files=files)
target = out/'RELEASE-PROOF.json'
target.write_text(json.dumps(packet, ensure_ascii=False, indent=2)+'\n')
sys.path.insert(0, str(repo/'scripts/acceptance'))
from phase3_report_receipts import verify_release_receipt
verified = verify_release_receipt(target, binding, json.loads((out/'overlay.json').read_bytes()))
print(json.dumps(verified))
