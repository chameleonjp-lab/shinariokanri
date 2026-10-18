"""Seal a clean local candidate, including the actual Git tree and served bytes."""
from __future__ import annotations
import argparse
import hashlib
import json
from pathlib import Path
import subprocess
import zipfile

ROOT = Path(__file__).resolve().parents[2]
SCOPES = ('src', 'scripts', 'tests', 'examples', 'supabase', '.github', 'package.json',
          'package-lock.json', 'vite.config.ts', 'playwright.config.ts', 'vitest.config.ts', 'tsconfig.json')


def git(*args): return subprocess.check_output(['git', *args], cwd=ROOT).decode().strip()
def digest(data): return hashlib.sha256(data).hexdigest()
def record(path):
    data = (ROOT/path).read_bytes()
    return dict(path=path, bytes=len(data), sha256=digest(data))


def verify_binding(binding, exact_head=False):
    if exact_head and (git('rev-parse', 'HEAD') != binding['commit'] or git('status', '--porcelain')):
        raise ValueError('Candidate must still be the exact clean sealed HEAD')
    for row in binding['source_files'] + binding['artifact_files'] + binding['original_documents'] + [binding['generated_runtime']]:
        if record(row['path']) != row: raise ValueError('Sealed bytes changed: '+row['path'])
    if json.loads((ROOT/'dist/build-info.json').read_text()) != binding['build_info']:
        raise ValueError('Served build identity changed')


def create_binding():
    if git('status', '--porcelain'): raise ValueError('Commit all candidate work before sealing')
    commit, tree = git('rev-parse', 'HEAD'), git('rev-parse', 'HEAD^{tree}')
    build = json.loads((ROOT/'dist/build-info.json').read_text())
    if build['commit'] != commit or build['tree'] != tree or build['dirty']:
        raise ValueError('Clean production build must match candidate HEAD/tree')
    sources = [record(p) for p in sorted(git('ls-files', '--', *SCOPES).splitlines())]
    lock = json.loads((ROOT/'docs/optimization/phase1/contract-lock.json').read_text())
    documents = [record(r['path']) for r in lock['files']]
    for row, original in zip(documents, lock['files']):
        data = (ROOT/row['path']).read_bytes()
        blob = hashlib.sha1(f'blob {len(data)}\0'.encode()+data).hexdigest()
        if blob != original['gitBlob']: raise ValueError('Original contract changed: '+row['path'])
    artifacts = [record(str(p.relative_to(ROOT))) for p in sorted((ROOT/'dist').rglob('*')) if p.is_file()]
    dirs = {''}
    for row in sources + documents:
        parent = Path(row['path']).parent
        while str(parent) != '.':
            dirs.add(parent.as_posix()); parent = parent.parent
    proof = dict(commit=subprocess.check_output(['git', 'cat-file', 'commit', commit], cwd=ROOT).decode(), trees={})
    for directory in sorted(dirs):
        ref = commit+(':'+directory if directory else '^{tree}')
        entries = subprocess.check_output(['git', 'ls-tree', '-z', ref], cwd=ROOT).decode().split('\0')
        rows = []
        for entry in filter(None, entries):
            meta, name = entry.split('\t', 1); mode, kind, oid = meta.split(' ')
            rows.append(dict(mode=mode, type=kind, sha=oid, name=name))
        proof['trees'][git('rev-parse', ref)] = rows
    return dict(format='phase3-candidate/1', commit=commit, tree=tree, build_info=build,
                source_files=sources, artifact_files=artifacts, original_documents=documents,
                generated_runtime=record('src/portable/generated/runtime.js'), sourceProof=proof)


def retain_snapshot(binding, destination):
    with zipfile.ZipFile(destination, 'x', compression=zipfile.ZIP_DEFLATED, compresslevel=6) as archive:
        rows = {r['path']: r for r in binding['source_files'] + binding['artifact_files'] + binding['original_documents'] + [binding['generated_runtime']]}
        for path in sorted(rows): archive.writestr(path, (ROOT/path).read_bytes())


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--output', type=Path)
    parser.add_argument('--verify', type=Path)
    args = parser.parse_args()
    if args.verify:
        verify_binding(json.loads(args.verify.read_text()), exact_head=True)
        print('SEALED CANDIDATE UNCHANGED')
    elif args.output:
        binding = create_binding()
        with args.output.open('x') as out: json.dump(binding, out, indent=2); out.write('\n')
        retain_snapshot(binding, args.output.with_suffix('.zip'))
        print(json.dumps(dict(commit=binding['commit'], tree=binding['tree'], build=binding['build_info']['version'], sourceFiles=len(binding['source_files']))))
    else: parser.error('--output or --verify is required')
