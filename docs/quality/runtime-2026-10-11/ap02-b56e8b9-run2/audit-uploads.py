import collections, hashlib, json, pathlib, sys, zipfile

run = pathlib.Path('/tmp/shinariokanri-ap02-b56e8b9-run2')
directory = run / 'uploads'
hook_path = run / 'upload-hook.cjs'
hook_bytes = hook_path.read_bytes()
hook_sha = hashlib.sha256(hook_bytes).hexdigest()
binding = json.loads((run / 'binding-before.json').read_text())
errors = []
captures = []
expected_specs = {'link-candidate-ignore.spec.ts', 'consultation-context.spec.ts', 'startup-migration-retry.spec.ts'}
target_title = '同名の二人への確定リンクを保ち、候補除外を別本文・別作品へ漏らさず通常画面から解除して完全復元する'
engines = ['chromium', 'firefox', 'webkit']
required = {(engine, name) for engine in engines for name in ['候補除外を解除する作品A', '候補除外を確認する作品B']}
observed = collections.Counter()
for path in directory.glob('observation-error-*.json'):
    errors.append({'reason': 'observation_error', 'file': str(path)})
if '[AP02_UPLOAD_OBSERVATION_ERROR]' in (run / 'runner.log').read_text(errors='replace'):
    errors.append({'reason': 'observation_error_in_runner_log'})
for path in sorted(directory.glob('upload-*.json')):
    try:
        record = json.loads(path.read_text())
        filename = record['filename']
        if pathlib.Path(filename).name != filename or not filename.startswith('upload-') or not filename.endswith('.scenario'):
            raise ValueError('Unsafe or non-synthetic retained filename')
        data = (directory / filename).read_bytes()
        sha = hashlib.sha256(data).hexdigest()
        if len(data) != record['bytes'] or sha != record['sha256'] or sha != record['forwardSourceSHA256']:
            raise ValueError('Retained bytes differ from copied and original forwarded Buffer')
        if pathlib.Path(record['file']).name not in expected_specs or record['engine'] not in engines:
            raise ValueError('Capture outside original three specs/engines')
        identity = record['hookIdentity']
        if identity['sha256'] != hook_sha or identity['bytes'] != len(hook_bytes):
            raise ValueError('Runtime hook differs from retained hook source')
        if identity['nodeOptions'] != binding['environment']['NODE_OPTIONS'] or identity['coreBundleSHA256'] != binding['coreBundleSHA256']:
            raise ValueError('Runtime hook environment/module source differs from pre-run binding')
        if any(identity['moduleVersions'].get(name) != '1.63.0' for name in ['@playwright/test', 'playwright', 'playwright-core']):
            raise ValueError('Runtime Playwright version differs from pinned modules')
        with zipfile.ZipFile(directory / filename) as archive:
            project = json.loads(archive.read('data/project.json'))
        row = {'metadata': str(path), 'filename': filename, 'bytes': len(data), 'sha256': sha, 'pid': record['pid'], 'counter': record['counter'], 'engine': record['engine'], 'title': record['title'], 'sourceName': record['sourceName'], 'mimeType': record['mimeType'], 'projectName': project['name'], 'projectId': project['projectId']}
        captures.append(row)
    except Exception as error:
        errors.append({'reason': 'invalid_capture', 'file': str(path), 'error': str(error)})
if not captures:
    errors.append({'reason': 'no_actual_upload_bytes'})
# The first two uploads in this original test are the actual random-UUID A/B
# sources. Later restored downloads with the same names cannot substitute them.
for engine in engines:
    initial = sorted([row for row in captures if row['engine'] == engine and row['title'] == target_title], key=lambda row: (row['pid'], row['counter']))[:2]
    if [row['projectName'] for row in initial] != ['候補除外を解除する作品A', '候補除外を確認する作品B']:
        errors.append({'reason': 'initial_AB_upload_order_or_presence', 'engine': engine, 'actual': [row['projectName'] for row in initial]})
    for row in initial:
        observed[(engine, row['projectName'])] += 1
for pair in sorted(required):
    if observed[pair] == 0:
        errors.append({'reason': 'missing_original_A_or_B_upload', 'engine': pair[0], 'projectName': pair[1]})
retained_files = {path.name for path in directory.glob('upload-*.scenario')}
if retained_files != {row['filename'] for row in captures}:
    errors.append({'reason': 'unpaired_or_invalid_scenario_retention'})

# Trace has only '<Buffer>', but its action count/name/type can independently
# check that the hook covered every actual original .scenario Buffer upload.
traced = collections.Counter()
trace_paths = sorted((run / 'test-results').glob('**/trace.zip'))
for path in trace_paths:
    try:
        with zipfile.ZipFile(path) as archive:
            for name in archive.namelist():
                if not name.endswith('.trace'):
                    continue
                for line in archive.read(name).splitlines():
                    event = json.loads(line)
                    if event.get('type') != 'before' or event.get('method') != 'setInputFiles':
                        continue
                    for payload in event.get('params', {}).get('payloads', []):
                        if str(payload.get('name', '')).endswith('.scenario') and payload.get('buffer') == '<Buffer>':
                            traced[(payload['name'], payload.get('mimeType'))] += 1
    except Exception as error:
        errors.append({'reason': 'invalid_trace', 'file': str(path), 'error': str(error)})
captured = collections.Counter((row['sourceName'], row['mimeType']) for row in captures)
if len(trace_paths) != 27:
    errors.append({'reason': 'missing_all_27_original_traces', 'actual': len(trace_paths)})
if captured != traced:
    errors.append({'reason': 'hook_trace_upload_count_mismatch', 'captured': {str(k): v for k, v in captured.items()}, 'traced': {str(k): v for k, v in traced.items()}})
record = {'status': 'complete' if not errors else 'incomplete', 'hook': {'path': str(hook_path), 'bytes': len(hook_bytes), 'sha256': hook_sha}, 'captures': captures,
    'requiredInitialAB': [{'engine': engine, 'projectName': name, 'observedUploadCount': observed[(engine, name)]} for engine, name in sorted(required)],
    'traceFiles': len(trace_paths), 'traceBufferUploadCount': sum(traced.values()), 'retainedUploadCount': len(captures), 'errors': errors,
    'productAndTestsEdited': False, 'originalWholeAcceptancePromotion': False}
(run / 'upload-audit.json').write_text(json.dumps(record, ensure_ascii=False, indent=2) + '\n')
print(json.dumps({'uploadEvidence': record['status'], 'captures': len(captures), 'errors': len(errors)}))
sys.exit(0 if not errors else 92)
