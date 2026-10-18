"""Verify sealed source against real Git objects without fetching old history."""
import hashlib
from pathlib import Path, PurePosixPath
import re
import sys

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from check_phase3 import require, loads, sha, safe_relative, verify_archive
from acceptance.seal_candidate import SCOPES


def git_hash(kind, data): return hashlib.sha1(f'{kind} {len(data)}\0'.encode()+data).hexdigest()


def verify_snapshot(binding, archive_bytes, root):
    records = {}
    for row in binding['source_files'] + binding['artifact_files'] + binding['original_documents'] + [binding['generated_runtime']]:
        path = safe_relative(row['path'])
        require(path not in records or records[path] == row, 'Conflicting sealed file record')
        records[path] = row
    contents = verify_archive(archive_bytes, list(records.values()))
    proof = binding['sourceProof']; trees = proof['trees']
    require(git_hash('commit', proof['commit'].encode()) == binding['commit'] and
            proof['commit'].splitlines()[0] == 'tree '+binding['tree'], 'Candidate commit proof differs')
    for oid, entries in trees.items():
        names, encoded = set(), []
        for row in entries:
            name, mode = row['name'], row['mode']
            require(name and name not in names and name not in ('.', '..') and '/' not in name and '\0' not in name and
                    mode in ('040000', '100644', '100755') and row['type'] == ('tree' if mode == '040000' else 'blob') and
                    re.fullmatch('[0-9a-f]{40}', row['sha']), 'Invalid Git tree entry')
            names.add(name)
            encoded.append(((name+('/' if mode == '040000' else '')).encode(),
                            mode.lstrip('0').encode()+b' '+name.encode()+b'\0'+bytes.fromhex(row['sha'])))
        require(git_hash('tree', b''.join(data for _, data in sorted(encoded))) == oid, 'Candidate tree proof differs')
    for row in binding['source_files'] + binding['original_documents']:
        current = binding['tree']
        for part in PurePosixPath(row['path']).parts:
            entry = next((e for e in trees[current] if e['name'] == part), None)
            require(entry is not None, 'Source path outside candidate tree'); current = entry['sha']
        require(current == git_hash('blob', contents[row['path']]), 'Source bytes outside measured commit')
    expected = set()
    def visit(oid, prefix=''):
        for entry in trees[oid]:
            path = prefix+entry['name']
            if not any(path == target or path.startswith(target+'/') or target.startswith(path+'/') for target in SCOPES): continue
            if entry['type'] == 'tree': visit(entry['sha'], path+'/')
            else: expected.add(path)
    visit(binding['tree'])
    require(len(binding['source_files']) == len(expected) and {r['path'] for r in binding['source_files']} == expected, 'Incomplete sealed source inventory')
    lock = loads((root/'docs/optimization/phase1/contract-lock.json').read_bytes())
    require(len(binding['original_documents']) == 73 and {r['path'] for r in binding['original_documents']} == {r['path'] for r in lock['files']}, 'Original contract inventory differs')
    for original in lock['files']:
        data = contents[original['path']]
        require(len(data) == original['bytes'] and git_hash('blob', data) == original['gitBlob'], 'Original contract changed')
    require(loads(contents['dist/build-info.json']) == binding['build_info'] and
            binding['build_info']['commit'] == binding['commit'] and binding['build_info']['tree'] == binding['tree'] and
            binding['build_info']['dirty'] is False, 'Sealed actual distribution identity differs')
    # Final reporting/evidence tooling may be added after measurements. The
    # measured production, original procedures and all test inputs must match.
    for path in expected:
        if path.startswith(('src/', 'tests/', 'examples/', 'supabase/', '.github/')) or path in SCOPES or path in (
                'scripts/measure-app.mjs', 'scripts/measure-large-history.mjs', 'scripts/large-history-verification-entry.mjs') or path.startswith('scripts/acceptance/'):
            require((root/path).read_bytes() == contents[path], 'Current production/test input changed after measurement: '+path)
    return contents
