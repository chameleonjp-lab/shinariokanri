"""Retain a review record for its actual product checkout, including blocked gates."""
from __future__ import annotations
import argparse
import hashlib
import io
import json
import re
import subprocess
from pathlib import Path

RECORD = Path('docs/quality/pr49-followup-2026-10-15/release-evidence.json')
BINDING = Path('docs/quality/pr49-followup-2026-10-15/evidence/product/binding.json')
SOURCE_SCOPES = ['src', 'scripts', 'tests', 'examples', 'supabase', '.github',
    'package.json', 'package-lock.json', 'vite.config.ts', 'playwright.config.ts',
    'vitest.config.ts', 'tsconfig.json',
    'docs/quality/current-review/evidence/legacy/3099c9d-flow-trace.scenario']

def git(root: Path, *args: str, input: bytes | None = None) -> bytes:
    return subprocess.check_output(['git', *args], cwd=root, input=input)

def digest(raw: bytes) -> str:
    return hashlib.sha256(raw).hexdigest()

def load_review(root: Path) -> tuple[bytes, dict]:
    raw = (root / RECORD).read_bytes()
    record = json.loads(raw)
    if not re.fullmatch('[0-9a-f]{40}', record.get('commit', '')):
        raise ValueError('Review must name an immutable full product commit')
    if record.get('product', {}).get('commit') != record['commit']:
        raise ValueError('Review product and release target differ')
    if (record.get('base') != '/shinariokanri/'
            or record['product'].get('base') != record['base']
            or record['product'].get('dirty') is not False):
        raise ValueError('A clean measured product and original base are required')
    return raw, record

def retain(review_root: Path, product_root: Path, output: Path) -> dict:
    raw, record = load_review(review_root)
    head = git(product_root, 'rev-parse', 'HEAD').decode().strip()
    tree = git(product_root, 'rev-parse', 'HEAD^{tree}').decode().strip()
    if head != record['commit'] or tree != record['product'].get('tree'):
        raise ValueError('Actual product checkout does not match the reviewed product')
    if git(product_root, 'status', '--porcelain').strip():
        raise ValueError('Product checkout must remain clean')
    binding_raw = (review_root / BINDING).read_bytes()
    binding = json.loads(binding_raw)
    if binding['product'] != record['product']:
        raise ValueError('Sealed measured product differs from the review')
    rows = binding['sourceFiles']
    actual_paths = set(git(product_root, 'ls-files', '--', *SOURCE_SCOPES).decode().splitlines())
    if len(rows) != len(actual_paths) or {r['path'] for r in rows} != actual_paths:
        raise ValueError('Sealed source scope must equal all original product inputs')
    for row in rows:
        path = Path(row['path'])
        if path.is_absolute() or '..' in path.parts or '\n' in row['path']:
            raise ValueError('Invalid source path')
    request = ''.join(f"{head}:{r['path']}\n" for r in rows).encode()
    stream = io.BytesIO(git(product_root, 'cat-file', '--batch', input=request))
    for row in rows:
        header = stream.readline().decode().strip().split()
        if len(header) != 3 or header[1] != 'blob':
            raise ValueError('Source is not an actual product Git blob')
        expected = stream.read(int(header[2]))
        if stream.read(1) != b'\n':
            raise ValueError('Invalid Git blob framing')
        actual = (product_root / row['path']).read_bytes()
        if actual != expected or len(actual) != row['bytes'] or digest(actual) != row['sha256']:
            raise ValueError(f"Measured source differs: {row['path']}")
        if row.get('gitBlob', header[0]) != header[0]:
            raise ValueError('Recorded Git blob differs')
    if stream.read():
        raise ValueError('Unexpected trailing source data')
    output.mkdir(parents=True, exist_ok=False)
    (output / 'release-evidence.json').write_bytes(raw)
    (output / 'product-source-binding.json').write_bytes(binding_raw)
    # Run the original checker in the actual target checkout. A blocked release
    # is retained as blocked; it is never converted into a passing gate.
    result = subprocess.run(['python3', 'scripts/check_release.py', '--evidence',
        str((review_root / RECORD).resolve())], cwd=product_root,
        stdout=subprocess.PIPE, stderr=subprocess.STDOUT, check=False)
    (output / 'original-release-checker.log').write_bytes(result.stdout)
    if result.returncode not in [0, 1] or not result.stdout.startswith(
            b'RELEASE EVIDENCE PASSED' if result.returncode == 0 else b'RELEASE BLOCKED'):
        raise ValueError('Original release checker did not complete normally')
    provenance = {
        'scope': 'Review artifact retention only. No deployment, gate edits or new functional-test certification.',
        'reviewCheckout': git(review_root, 'rev-parse', 'HEAD').decode().strip(),
        'productCommit': head, 'productTree': tree, 'verifiedSourceFiles': len(rows),
        'record': {'bytes': len(raw), 'sha256': digest(raw)},
        'binding': {'bytes': len(binding_raw), 'sha256': digest(binding_raw)},
        'originalChecker': {'exitCode': result.returncode, 'bytes': len(result.stdout),
                            'sha256': digest(result.stdout)},
        'releaseGate': 'passed_by_original_checker' if result.returncode == 0 else 'blocked',
        'compiledBuild': 'Referenced measured build; compiled bytes are not rebuilt or certified by this retention job.',
    }
    (output / 'provenance.json').write_text(json.dumps(provenance, indent=2) + '\n')
    return provenance

if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('command', choices=['select', 'retain'])
    parser.add_argument('--review-root', type=Path, required=True)
    parser.add_argument('--product-root', type=Path)
    parser.add_argument('--output', type=Path)
    args = parser.parse_args()
    if args.command == 'select':
        print('target=' + load_review(args.review_root)[1]['commit'])
    else:
        if args.product_root is None or args.output is None:
            parser.error('retain requires --product-root and --output')
        print(json.dumps(retain(args.review_root.resolve(), args.product_root.resolve(), args.output.resolve())))
