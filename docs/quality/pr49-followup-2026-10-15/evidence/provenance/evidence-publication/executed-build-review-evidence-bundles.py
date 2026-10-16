"""Package an explicit selection of completed test evidence without changing bytes."""
import argparse
import hashlib
import json
from pathlib import Path, PurePosixPath
import tarfile
from datetime import datetime, timezone

p = argparse.ArgumentParser(description=__doc__)
p.add_argument('--selection', type=Path, required=True)
p.add_argument('--binding', type=Path, required=True)
p.add_argument('--soak-adjudication', type=Path, required=True)
p.add_argument('--soak-exit', type=Path, required=True)
p.add_argument('--negative-adjudication', type=Path, required=True)
p.add_argument('--output', type=Path, required=True)
p.add_argument('--archive-cache', type=Path, required=True)
p.add_argument('--verifier', type=Path, required=True)
a = p.parse_args()

def sha_file(path):
    h = hashlib.sha256()
    with path.open('rb') as f:
        while block := f.read(1024 * 1024):
            h.update(block)
    return h.hexdigest()

def relative(value):
    path = PurePosixPath(value)
    if not value or any(c in value for c in ('\\', ':', '\x00')) or path.is_absolute() or '..' in path.parts or str(path) != value:
        raise ValueError('Bundle paths must be normalized relative paths')
    return value

binding = json.loads(a.binding.read_text())
closed = json.loads(a.soak_adjudication.read_text())
exit_receipt = json.loads(a.soak_exit.read_text())
assert closed['product'] == binding['product']
assert closed['actual7200'] == 'passed' and closed['realChildExitCode'] == 0
assert closed['fullInputRecovery'] == 'passed_observed_assertions'
assert closed['newCloneColdNative'] == 'passed_observed_full_correspondence'
assert closed['cleanup'] == 'completed'
assert exit_receipt['returncode'] == 0 and exit_receipt['executedWrapperBytesUnchanged']
negative = json.loads(a.negative_adjudication.read_text())
assert negative['product'] == binding['product']
assert negative['result'] == 'passed_local_same_full_input_negative_retry' and negative['realChildExitCode'] == 0
selection_raw = a.selection.read_bytes()
selection = json.loads(selection_raw)
a.output.mkdir(parents=True, exist_ok=False)
a.archive_cache.mkdir(parents=True, exist_ok=False)

for group in selection['groups']:
    label = relative(group['label'])
    assert '/' not in label
    files = []
    seen = set()
    for item in sorted(group['files'], key=lambda v: v['path']):
        path = relative(item['path'])
        if path in seen:
            raise ValueError('Duplicate bundle member')
        source = Path(item['source'])
        if source.is_symlink() or not source.is_file():
            raise ValueError('Only explicit regular evidence files can be retained')
        if 'manual-candidate' in source.name:
            raise ValueError('Manual delivery packet is outside this evidence publication')
        files.append({'path': path, 'sourcePath': str(source),
                      'bytes': source.stat().st_size, 'sha256': sha_file(source)})
        seen.add(path)
    archive = a.archive_cache / (label + '.tar.gz')
    with tarfile.open(archive, 'w:gz', compresslevel=6, dereference=True) as tar:
        for row in files:
            source = Path(row['sourcePath'])
            tar.add(source, arcname=row['path'], recursive=False)
            assert source.stat().st_size == row['bytes'] and sha_file(source) == row['sha256']
    parts = []
    with archive.open('rb') as f:
        number = 1
        while block := f.read(4 * 1024 * 1024):
            name = f'{label}.tar.gz.part{number:03}'
            (a.output / name).write_bytes(block)
            parts.append({'name': name, 'bytes': len(block),
                          'sha256': hashlib.sha256(block).hexdigest()})
            number += 1
    for alias in group.get('byteIdenticalActualSources', []):
        selected = next(row for row in files if row['path'] == alias['sameBytesAs'])
        assert alias['bytes'] == selected['bytes'] and alias['sha256'] == selected['sha256']
        original = Path(alias['originalSourcePath'])
        assert original.stat().st_size == alias['bytes'] and sha_file(original) == alias['sha256']
    manifest = {
        'format': 'pr49-retained-test-evidence/1',
        'label': label, 'recordedAt': datetime.now(timezone.utc).isoformat(),
        'product': binding['product'],
        'productIdentityScope': 'Review target only. Historical and failed files retain their own actual execution identities; the target does not retag those runs.',
        'scope': group['scope'],
        'selection': {'bytes': len(selection_raw), 'sha256': hashlib.sha256(selection_raw).hexdigest()},
        'verificationProcedure': {'path': a.verifier.name, 'sha256': sha_file(a.verifier)},
        'archive': {'format': 'tar+gzip', 'bytes': archive.stat().st_size,
                    'sha256': sha_file(archive), 'parts': parts},
        'files': files,
        'byteIdenticalActualSources': group.get('byteIdenticalActualSources', []),
        'acceptanceInference': False,
    }
    (a.output / (label + '.manifest.json')).write_text(json.dumps(manifest, ensure_ascii=False, indent=2)+'\n')
    print(json.dumps({'label': label, 'files': len(files), 'parts': len(parts),
                      'archiveBytes': archive.stat().st_size, 'archiveSHA256': manifest['archive']['sha256']}))
