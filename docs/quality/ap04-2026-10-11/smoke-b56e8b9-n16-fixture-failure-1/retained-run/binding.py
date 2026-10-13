import datetime
import hashlib
import json
import os
import pathlib
import platform
import subprocess
import sys

preparation_dir = pathlib.Path(__file__).resolve().parent
plan = json.loads((preparation_dir / 'preparation.json').read_text())
root = pathlib.Path(plan['sourceDirectory'])
out = pathlib.Path(sys.argv[2])
phase = sys.argv[1]

def sha(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()

def git(*args):
    return subprocess.check_output(['git', *args], cwd=root, text=True).strip()

reference_path = pathlib.Path(plan['fixedBuildReference']['path'])
env_script = pathlib.Path(plan['environmentScript']['path'])
failures = []
for label, path, expected in [
    ('fixed build reference', reference_path, plan['fixedBuildReference']['sha256']),
    ('browser environment script', env_script, plan['environmentScript']['sha256']),
    *[(row['path'], preparation_dir / row['path'], row['sha256']) for row in plan['harnessFiles']],
]:
    if not path.is_file() or sha(path) != expected:
        failures.append(f'{label} bytes differ from preparation')

commit = git('rev-parse', 'HEAD')
tree = git('rev-parse', 'HEAD^{tree}')
status = git('status', '--porcelain')
if commit != plan['targetCommit'] or tree != plan['targetTree'] or status:
    failures.append('Source is not the exact clean pinned commit/tree')
if phase == 'preflight':
    if (os.environ.get('NODE_OPTIONS') or '') != plan['artifactObservation']['originalNodeOptions']:
        failures.append('Inherited NODE_OPTIONS differs from prepared original environment')
    if failures:
        raise SystemExit('\n'.join(failures))
    print('Pinned environment, harness, reference, and clean source verified; browser not started.')
    raise SystemExit(0)

reference = json.loads(reference_path.read_text())
expected_files = {row['path']: row['sha256'] for key in ['sourceFiles', 'generatedFiles', 'distFiles'] for row in reference[key]}
scope = ['src', 'public', 'examples', 'scripts/build', 'vite.config.ts', 'package.json', 'package-lock.json', 'tsconfig.json', 'playwright.config.ts']
scope.extend(row['file'] for row in plan['attempts'])
scope.extend(plan['dependencies'])
tracked = subprocess.check_output(['git', 'ls-files', '-z', '--', *scope], cwd=root).decode().split('\0')
paths = {path for path in tracked if path}
for directory in ['src/portable/generated', 'public/examples/browser-game']:
    if (root / directory).exists():
        paths.update(str(path.relative_to(root)) for path in (root / directory).rglob('*') if path.is_file())

def manifest(names):
    rows = []
    digest = hashlib.sha256()
    for rel in sorted(names):
        data = (root / rel).read_bytes()
        value = hashlib.sha256(data).hexdigest()
        if expected_files.get(rel) != value:
            failures.append(f'File differs from fixed production-build reference: {rel}')
        digest.update(rel.encode() + b'\0' + data)
        rows.append({'path': rel, 'bytes': len(data), 'sha256': value})
    return {'sha256': digest.hexdigest(), 'files': rows}

source = manifest(paths)
dist_paths = {str(path.relative_to(root)) for path in (root / 'dist').rglob('*') if path.is_file()}
if dist_paths != {row['path'] for row in reference['distFiles']}:
    failures.append('Production dist inventory differs from fixed build reference')
dist = manifest(dist_paths)
info = json.loads((root / 'dist/build-info.json').read_text())
if info.get('dirty') or info.get('commit') != plan['targetCommit'] or info.get('tree') != plan['targetTree'] or info.get('version') != plan['buildHash'] or info.get('base') != plan['base']:
    failures.append('Production build commit/tree/version/base differs from pinned candidate')
environment_names = ['CI', 'TZ', 'LANG', 'LC_ALL', 'BROWSER_ENGINES', 'PLAYWRIGHT_BROWSERS_PATH', 'CHROMIUM_PATH', 'TMPDIR', 'XDG_CONFIG_HOME', 'XDG_CACHE_HOME', 'LD_LIBRARY_PATH', 'MOZ_DISABLE_CONTENT_SANDBOX', 'MOZ_DISABLE_RDD_SANDBOX', 'MOZ_DISABLE_GMP_SANDBOX', 'MOZ_DISABLE_SOCKET_PROCESS_SANDBOX', 'PLAYWRIGHT_SKIP_VALIDATE_HOST_REQUIREMENTS', 'PLAYWRIGHT_HTML_OPEN', 'NODE_OPTIONS', 'AP04_EVIDENCE_DIR', 'AP04_SMOKE_SPEC']
environment = {name: os.environ.get(name) for name in environment_names}
for name, expected in plan['pinnedEnvironment'].items():
    if environment.get(name) != expected:
        failures.append(f'Environment differs from preparation: {name}')
attempt = next((row for row in plan['attempts'] if row['stage'] == out.name), None)
expected_scope = {'AP04_EVIDENCE_DIR': str(out / 'actual-artifacts'), 'AP04_SMOKE_SPEC': pathlib.Path(attempt['file']).name} if attempt else {'AP04_EVIDENCE_DIR': '', 'AP04_SMOKE_SPEC': ''}
for name, value in expected_scope.items():
    if environment[name] != value:
        failures.append(f'Artifact observation scope differs from current attempt: {name}')
hook = preparation_dir / 'artifact-hook.cjs'
artifact_observation = {
    'hook': {'path': str(hook), 'bytes': hook.stat().st_size, 'sha256': sha(hook)},
    'moduleVersions': {name: json.loads((root / 'node_modules' / name / 'package.json').read_text())['version'] for name in ['@playwright/test', 'playwright', 'playwright-core']},
    'coreBundleSHA256': sha(root / 'node_modules/playwright-core/lib/coreBundle.js'),
    'moduleSourcesSHA256': {name: sha(root / 'node_modules' / name) for name in ['@playwright/test/index.js', 'playwright/test.js', 'playwright/lib/index.js', 'playwright/lib/globals.js', '@playwright/test/package.json', 'playwright/package.json', 'playwright-core/package.json']},
}
for name in ['hook', 'moduleVersions', 'coreBundleSHA256', 'moduleSourcesSHA256']:
    if artifact_observation[name] != plan['artifactObservation'][name]:
        failures.append(f'Artifact observation hook/module differs from preparation: {name}')
browser_path = pathlib.Path(environment.get('CHROMIUM_PATH') or '')
browser_stat = browser_path.stat() if browser_path.is_file() else None
browser_identity = {'path': str(browser_path), 'resolvedPath': str(browser_path.resolve()), 'bytes': browser_stat.st_size, 'mtimeNs': browser_stat.st_mtime_ns} if browser_stat else None
if browser_identity != plan['chromiumExecutable']:
    failures.append('Chromium executable path/size/mtime differs from preparation')
browser_metadata = root / 'node_modules/playwright-core/browsers.json'
if sha(browser_metadata) != plan['browserMetadataSHA256']:
    failures.append('Installed browser revision metadata differs from preparation')
record = {
    'phase': phase, 'checkedAt': datetime.datetime.now(datetime.timezone.utc).isoformat(),
    'targetCommit': commit, 'targetTree': tree, 'worktreeStatus': status,
    'buildInfo': info, 'sourceManifest': source, 'distManifest': dist,
    'fixedBuildReference': plan['fixedBuildReference'],
    'preparationSHA256': sha(preparation_dir / 'preparation.json'),
    'environment': environment, 'environmentScriptSHA256': sha(env_script),
    'chromiumExecutable': browser_identity,
    'browserMetadataSHA256': sha(browser_metadata),
    'browserRevisions': json.loads(browser_metadata.read_text()),
    'artifactObservation': artifact_observation,
    'system': {'platform': platform.system(), 'kernel': platform.release(), 'node': subprocess.check_output(['node', '--version'], text=True).strip()},
    'originalWholeAcceptancePromotion': False, 'physicalDevice': False,
    'actualAuthRlsStorage': False, 'bindingFailures': failures,
}
if phase == 'after':
    before_path = out / 'binding-before.json'
    if not before_path.is_file():
        failures.append('Before binding is absent')
    else:
        before = json.loads(before_path.read_text())
        for key in ['targetCommit', 'targetTree', 'worktreeStatus', 'buildInfo', 'sourceManifest', 'distManifest', 'fixedBuildReference', 'preparationSHA256', 'environment', 'environmentScriptSHA256', 'chromiumExecutable', 'browserMetadataSHA256', 'browserRevisions', 'artifactObservation', 'system']:
            if before.get(key) != record[key]:
                failures.append(f'Source/build/environment changed during retained attempt: {key}')
record['bindingFailures'] = failures
(out / f'binding-{phase}.json').write_text(json.dumps(record, ensure_ascii=False, indent=2) + '\n')
print(json.dumps({'phase': phase, 'commit': commit, 'build': info['version'], 'sourceSHA256': source['sha256'], 'distSHA256': dist['sha256'], 'bindingFailures': failures}, ensure_ascii=False))
if failures:
    raise SystemExit(1)
