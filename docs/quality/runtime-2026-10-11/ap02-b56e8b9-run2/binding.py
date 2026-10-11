import datetime, hashlib, json, os, pathlib, platform, subprocess, sys

root = pathlib.Path('/workspace/runtime-verification')
out = pathlib.Path('/tmp/shinariokanri-ap02-b56e8b9-run2')
phase = sys.argv[1]
expected_commit = 'b56e8b953ee5398a8c4b97031b4a426bb6a9f512'
expected_tree = '46927ebcc8c8b016f5a23845d19745ccb05c0049'
expected_build = '1dc95b9eb4d844a28134'
reference_path = pathlib.Path('/tmp/ap04-fixed-b56e8b9/after-build-binding.json')
reference = json.loads(reference_path.read_text())
specs = ['tests/e2e/link-candidate-ignore.spec.ts', 'tests/e2e/consultation-context.spec.ts', 'tests/e2e/startup-migration-retry.spec.ts']
legacy = 'docs/quality/current-review/evidence/legacy/3099c9d-flow-trace.scenario'
tracked = subprocess.check_output(['git', 'ls-files', '-z', '--', 'src', 'public', 'examples', 'scripts/build', 'vite.config.ts', 'package.json', 'package-lock.json', 'tsconfig.json', 'playwright.config.ts', legacy, *specs], cwd=root).decode().split('\0')
paths = {p for p in tracked if p}
for generated in ['src/portable/generated', 'public/examples/browser-game']:
    if (root / generated).exists():
        paths.update(str(p.relative_to(root)) for p in (root / generated).rglob('*') if p.is_file())
expected = {row['path']: row['sha256'] for name in ['sourceFiles', 'generatedFiles', 'distFiles'] for row in reference[name]}

def manifest(names):
    rows = []
    digest = hashlib.sha256()
    for rel in sorted(names):
        data = (root / rel).read_bytes()
        sha = hashlib.sha256(data).hexdigest()
        if expected.get(rel) != sha:
            raise SystemExit(f'File differs from fixed production-build binding: {rel}')
        digest.update(rel.encode() + b'\0' + data)
        rows.append({'path': rel, 'bytes': len(data), 'sha256': sha})
    return {'sha256': digest.hexdigest(), 'files': rows}

source = manifest(paths)
dist_paths = {str(p.relative_to(root)) for p in (root / 'dist').rglob('*') if p.is_file()}
if dist_paths != {row['path'] for row in reference['distFiles']}:
    raise SystemExit('Production dist file inventory differs from fixed build binding')
dist = manifest(dist_paths)
info = json.loads((root / 'dist/build-info.json').read_text())
environment_names = ['CI', 'TZ', 'LANG', 'LC_ALL', 'BROWSER_ENGINES', 'PLAYWRIGHT_BROWSERS_PATH', 'CHROMIUM_PATH', 'TMPDIR', 'XDG_CONFIG_HOME', 'XDG_CACHE_HOME', 'LD_LIBRARY_PATH', 'MOZ_DISABLE_CONTENT_SANDBOX', 'MOZ_DISABLE_RDD_SANDBOX', 'MOZ_DISABLE_GMP_SANDBOX', 'MOZ_DISABLE_SOCKET_PROCESS_SANDBOX', 'PLAYWRIGHT_SKIP_VALIDATE_HOST_REQUIREMENTS', 'NODE_OPTIONS']
environment = {name: os.environ.get(name) for name in environment_names}
env_script = pathlib.Path('/workspace/shinariokanri/.playwright-browsers/env.sh')
external_files = [out / 'upload-hook.cjs', out / 'audit-uploads.py', out / 'run.sh', out / 'binding.py']
external_observation = [{'path': str(path), 'bytes': path.stat().st_size, 'sha256': hashlib.sha256(path.read_bytes()).hexdigest()} for path in external_files]
module_versions = {name: json.loads((root / 'node_modules' / name / 'package.json').read_text())['version'] for name in ['@playwright/test', 'playwright', 'playwright-core']}
module_bundle_sha = hashlib.sha256((root / 'node_modules/playwright-core/lib/coreBundle.js').read_bytes()).hexdigest()
record = {
    'checkedAt': datetime.datetime.now(datetime.timezone.utc).isoformat(), 'phase': phase,
    'targetCommit': subprocess.check_output(['git', 'rev-parse', 'HEAD'], cwd=root, text=True).strip(),
    'productTree': subprocess.check_output(['git', 'rev-parse', 'HEAD^{tree}'], cwd=root, text=True).strip(),
    'worktreeStatus': subprocess.check_output(['git', 'status', '--porcelain'], cwd=root, text=True),
    'buildInfo': info, 'sourceManifest': source, 'distManifest': dist,
    'fixedBuildReference': {'file': str(reference_path), 'sha256': hashlib.sha256(reference_path.read_bytes()).hexdigest(), 'sourceDigest': reference['sourceDigest'], 'distDigest': reference['distDigest'], 'generatedDigest': reference['generatedDigest']},
    'environment': environment, 'environmentScriptSHA256': hashlib.sha256(env_script.read_bytes()).hexdigest(),
    'externalObservation': external_observation, 'moduleVersions': module_versions, 'coreBundleSHA256': module_bundle_sha,
    'system': {'platform': platform.system(), 'kernel': platform.release(), 'node': subprocess.check_output(['node', '--version'], text=True).strip()},
    'browserRevisions': json.loads((root / 'node_modules/playwright-core/browsers.json').read_text()),
    'specs': specs, 'actualLegacySource': legacy, 'physicalDevice': False, 'actualAuthRlsStorage': False, 'originalWholeAcceptancePromotion': False,
}
if record['targetCommit'] != expected_commit or record['productTree'] != expected_tree or record['worktreeStatus'] or info['dirty'] or info['commit'] != expected_commit or info['tree'] != expected_tree or info['version'] != expected_build:
    raise SystemExit('Candidate is not the clean exact pinned commit/tree/build')
if environment['BROWSER_ENGINES'] != 'all' or environment['CI'] != '1':
    raise SystemExit('All engines and a fresh fixed-checkout production preview are required')
if '--require=/tmp/shinariokanri-ap02-b56e8b9-run2/upload-hook.cjs' not in (environment['NODE_OPTIONS'] or '') or any(version != '1.63.0' for version in module_versions.values()):
    raise SystemExit('External evidence hook and pinned Playwright modules are required')
(out / f'binding-{phase}.json').write_text(json.dumps(record, ensure_ascii=False, indent=2) + '\n')
if phase == 'after':
    before = json.loads((out / 'binding-before.json').read_text())
    for key in ['targetCommit', 'productTree', 'worktreeStatus', 'buildInfo', 'sourceManifest', 'distManifest', 'fixedBuildReference', 'environment', 'environmentScriptSHA256', 'system', 'browserRevisions', 'externalObservation', 'moduleVersions', 'coreBundleSHA256']:
        if before[key] != record[key]:
            raise SystemExit(f'Candidate or environment changed during AP02: {key}')
print(json.dumps({'phase': phase, 'targetCommit': record['targetCommit'], 'buildHash': info['version'], 'sourceSHA256': source['sha256'], 'distSHA256': dist['sha256'], 'unchanged': phase == 'after'}))
