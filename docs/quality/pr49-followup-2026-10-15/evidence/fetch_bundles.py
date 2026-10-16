"""Retrieve explicitly published review evidence into a fresh empty directory."""
import argparse
from datetime import datetime, timezone
import hashlib
import json
from pathlib import Path, PurePosixPath
import re
import urllib.request

p = argparse.ArgumentParser(description=__doc__)
p.add_argument('--location', type=Path, required=True)
p.add_argument('--destination', type=Path, required=True)
p.add_argument('--receipt', type=Path, required=True)
a = p.parse_args()
location = json.loads(a.location.read_text())
assert location['format'] == 'pr49-evidence-location/1' and location['repository'] == 'chameleonjp-lab/shinariokanri'
a.commit = location['commit']
assert re.fullmatch('[a-f0-9]{40}', a.commit)
assert not a.destination.exists() and not a.receipt.exists()
rows = location['files']
assert rows and len({r['path'] for r in rows}) == len(rows)
prefix = 'docs/quality/pr49-followup-2026-10-15/evidence/'
for row in rows:
    value = row['path']
    path = PurePosixPath(value)
    assert str(path) == value and not path.is_absolute() and '..' not in path.parts
    assert not any(c in value for c in ['\\', '\x00', ':']) and value.startswith(prefix)
    tail = value[len(prefix):]
    assert tail in ['verify_bundles.py', 'product/binding.json'] or re.fullmatch('bundles/[a-z0-9-]+(?:\\.manifest\\.json|\\.tar\\.gz\\.part[0-9]{3})', tail)
    assert re.fullmatch('[a-f0-9]{40}', row['gitBlob']) and row['bytes'] >= 0
a.destination.mkdir(parents=True)
observed = []
for row in rows:
    url = 'https://raw.githubusercontent.com/chameleonjp-lab/shinariokanri/' + a.commit + '/' + row['path']
    target = a.destination / row['path']
    target.parent.mkdir(parents=True, exist_ok=True)
    sha = hashlib.sha256()
    git = hashlib.sha1(b'blob ' + str(row['bytes']).encode() + b'\x00')
    size = 0
    with urllib.request.urlopen(url, timeout=60) as response, target.open('xb') as out:
        assert response.status == 200
        for block in iter(lambda: response.read(1024 * 1024), b''):
            out.write(block)
            size += len(block)
            assert size <= row['bytes']
            sha.update(block)
            git.update(block)
    assert size == row['bytes'] and git.hexdigest() == row['gitBlob'] and sha.hexdigest() == row['sha256']
    observed.append({**row, 'url': url, 'sha256': sha.hexdigest(), 'status': 200})
result = {'recordedAt': datetime.now(timezone.utc).isoformat(), 'publicationCommit': a.commit,
          'scope': 'Actual anonymous immutable public-repository downloads into a new directory; no pre-existing proof files or local source fallback.',
          'files': observed, 'allExpectedGitBlobsMatched': True}
a.receipt.write_text(json.dumps(result, ensure_ascii=False, indent=2) + '\n')
print(json.dumps({'publicationCommit': a.commit, 'downloadedFiles': len(observed),
                  'bytes': sum(r['bytes'] for r in observed), 'allExpectedGitBlobsMatched': True}))
