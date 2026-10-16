"""Verify and extract retained test evidence using Python standard libraries."""
import argparse
import hashlib
import json
from pathlib import Path, PurePosixPath
import tarfile
import tempfile

p = argparse.ArgumentParser(description=__doc__)
p.add_argument('manifests', type=Path, nargs='+', help='Manifest files or their directory')
p.add_argument('--extract', type=Path, required=True, help='New destination directory')
p.add_argument('--binding', type=Path, default=Path(__file__).parent / 'product/binding.json')
a = p.parse_args()
product = json.loads(a.binding.read_text())['product']
procedure_sha = hashlib.sha256(Path(__file__).read_bytes()).hexdigest()

def safe_path(value):
    q = PurePosixPath(value)
    if not value or any(c in value for c in ('\\', ':', '\x00')) or q.is_absolute() or '..' in q.parts or str(q) != value:
        raise ValueError('Invalid relative evidence path')
    return Path(*q.parts)

manifests = []
for path in a.manifests:
    manifests.extend(sorted(path.glob('*.manifest.json')) if path.is_dir() else [path])
if not manifests:
    p.error('No bundle manifests were found')
assert len({q.resolve() for q in manifests}) == len(manifests)
a.extract.mkdir(parents=True, exist_ok=False)
for manifest_path in manifests:
    m = json.loads(manifest_path.read_text())
    assert m['format'] == 'pr49-retained-test-evidence/1'
    assert m['product'] == product
    assert m['verificationProcedure']['sha256'] == procedure_sha
    label = safe_path(m['label'])
    assert len(label.parts) == 1
    expected = {row['path']: row for row in m['files']}
    assert len(expected) == len(m['files'])
    for name in expected:
        safe_path(name)
    for alias in m.get('byteIdenticalActualSources', []):
        row = expected[alias['sameBytesAs']]
        assert alias['bytes'] == row['bytes'] and alias['sha256'] == row['sha256']
    seen = set()
    with tempfile.TemporaryFile() as combined:
        archive_sha = hashlib.sha256()
        archive_bytes = 0
        for part in m['archive']['parts']:
            part_path = manifest_path.parent / safe_path(part['name'])
            h = hashlib.sha256()
            size = 0
            with part_path.open('rb') as f:
                while block := f.read(1024 * 1024):
                    combined.write(block)
                    h.update(block)
                    archive_sha.update(block)
                    size += len(block)
            assert size == part['bytes'] and h.hexdigest() == part['sha256']
            archive_bytes += size
        assert archive_bytes == m['archive']['bytes']
        assert archive_sha.hexdigest() == m['archive']['sha256']
        combined.seek(0)
        with tarfile.open(fileobj=combined, mode='r|gz') as tar:
            for member in tar:
                if not member.isfile() or member.name not in expected or member.name in seen:
                    raise ValueError('Unexpected evidence member')
                row = expected[member.name]
                assert member.size == row['bytes']
                target = a.extract / label / safe_path(member.name)
                target.parent.mkdir(parents=True, exist_ok=True)
                h = hashlib.sha256()
                size = 0
                with tar.extractfile(member) as f, target.open('xb') as out:
                    while block := f.read(1024 * 1024):
                        out.write(block)
                        h.update(block)
                        size += len(block)
                assert size == row['bytes'] and h.hexdigest() == row['sha256']
                seen.add(member.name)
    assert seen == set(expected)
    print(json.dumps({'bundle': m['label'], 'verifiedFiles': len(seen),
                      'productCommit': product['commit'], 'archiveSHA256': m['archive']['sha256'],
                      'scope': 'Retained bytes verified; acceptance results remain in the authored review record.'}))
