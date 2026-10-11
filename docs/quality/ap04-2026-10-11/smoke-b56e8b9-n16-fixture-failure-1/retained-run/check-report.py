import datetime
import hashlib
import json
import pathlib
import re
import sys

preparation_dir = pathlib.Path(__file__).resolve().parent
plan = json.loads((preparation_dir / 'preparation.json').read_text())

def collect(suites):
    rows = []
    for suite in suites:
        for spec in suite.get('specs', []):
            for test in spec.get('tests', []):
                rows.append({'file': spec.get('file') or suite.get('file'), 'title': spec['title'], 'project': test.get('projectName'), 'expectedStatus': test.get('expectedStatus'), 'status': test.get('status'), 'results': test.get('results', [])})
        rows.extend(collect(suite.get('suites', [])))
    return rows

mode = sys.argv[1]
out = pathlib.Path(sys.argv[2])
if mode == 'attempt':
    stage, spec, pattern, count, exit_code, tee_exit_code, binding_exit_code, artifact_exit_code = sys.argv[3:11]
    planned = next(row for row in plan['attempts'] if row['stage'] == stage)
    failures = []
    report_path = out / 'report.json'
    tests = []
    report = {}
    if report_path.is_file():
        try:
            report = json.loads(report_path.read_text())
            tests = collect(report.get('suites', []))
        except (ValueError, KeyError) as error:
            failures.append(f'Invalid JSON report: {error}')
    else:
        failures.append('JSON report missing')
    if int(exit_code):
        failures.append(f'Playwright exited {exit_code}')
    if int(tee_exit_code):
        failures.append(f'Runner log retention failed: tee exited {tee_exit_code}')
    if int(binding_exit_code):
        failures.append(f'After binding failed: binding exited {binding_exit_code}')
    if int(artifact_exit_code):
        failures.append(f'Actual artifact evidence audit failed: audit exited {artifact_exit_code}')
    artifact_audit_path = out / 'artifact-audit.json'
    artifact_audit = None
    if artifact_audit_path.is_file():
        try:
            artifact_audit = json.loads(artifact_audit_path.read_text())
        except ValueError as error:
            failures.append(f'Invalid artifact audit JSON: {error}')
    if artifact_audit is None or artifact_audit.get('status') != 'complete':
        failures.append('Actual input/download evidence is not complete')
    if len(tests) != int(count):
        failures.append(f'Expected {count} tests, observed {len(tests)}')
    if report.get('errors'):
        failures.append('Runner reported global errors')
    retained_artifacts = []
    html_index = out / 'html/index.html'
    if not html_index.is_file():
        failures.append('Required retained HTML index is missing')
    else:
        data = html_index.read_bytes()
        retained_artifacts.append({'kind': 'html-index', 'path': str(html_index), 'bytes': len(data), 'sha256': hashlib.sha256(data).hexdigest()})
    for row in tests:
        if pathlib.Path(row.get('file') or '').name != spec or not re.search(pattern, row['title']) or row['project'] != 'chromium':
            failures.append(f'Unexpected selected test: {row["title"]}')
        if row['expectedStatus'] != 'passed' or row['status'] != 'expected' or len(row['results']) != 1 or row['results'][0].get('status') != 'passed' or row['results'][0].get('retry', 0) != 0:
            failures.append(f'Test was not one unretried expected pass: {row["title"]}')
        for result in row['results']:
            # A skipped test never ran. Executed passes/failures require an actual trace.
            if result.get('status') == 'skipped':
                continue
            trace_attachments = [attachment for attachment in result.get('attachments', []) if attachment.get('name') == 'trace']
            if not trace_attachments:
                failures.append(f'Executed test has no retained trace attachment: {row["title"]}')
            for attachment in trace_attachments:
                path = pathlib.Path(attachment.get('path') or '')
                candidates = [path, pathlib.Path(plan['sourceDirectory']) / path, out / path] if not path.is_absolute() else [path]
                existing = next((candidate.resolve() for candidate in candidates if candidate.is_file() and candidate.resolve().is_relative_to(out.resolve())), None)
                if existing is None:
                    failures.append(f'Trace file absent or outside this retained attempt: {row["title"]}')
                else:
                    data = existing.read_bytes()
                    retained_artifacts.append({'kind': 'trace', 'title': row['title'], 'path': str(existing), 'bytes': len(data), 'sha256': hashlib.sha256(data).hexdigest()})
    observed = [{key: value for key, value in row.items() if key != 'results'} | {'actualStatuses': [result.get('status') for result in row['results']], 'durationsMs': [result.get('duration') for result in row['results']]} for row in tests]
    assessment = {
        'checkedAt': datetime.datetime.now(datetime.timezone.utc).isoformat(), 'stage': stage,
        'expectedCount': int(count), 'observedCount': len(tests), 'playwrightExitCode': int(exit_code),
        'teeExitCode': int(tee_exit_code), 'bindingExitCode': int(binding_exit_code),
        'artifactAuditExitCode': int(artifact_exit_code), 'artifactAudit': str(artifact_audit_path),
        'bindingVerified': int(binding_exit_code) == 0,
        'retainedArtifacts': retained_artifacts,
        'executionStatus': 'passed' if not failures else 'failed', 'tests': observed, 'failures': failures,
        'acceptanceScope': planned['acceptanceScope'], 'originalAcceptanceStatus': 'not_run',
        'originalWholeAcceptancePromotion': False, 'excludedConditions': planned['excludedConditions'],
    }
    (out / 'assessment.json').write_text(json.dumps(assessment, ensure_ascii=False, indent=2) + '\n')
    print(json.dumps({'stage': stage, 'executionStatus': assessment['executionStatus'], 'failures': failures}, ensure_ascii=False))
    raise SystemExit(0 if not failures else 1)

if mode != 'summary':
    raise SystemExit('Unknown mode')
rows = []
for planned in plan['attempts']:
    attempt = out / planned['stage']
    assessment_path = attempt / 'assessment.json'
    assessment = json.loads(assessment_path.read_text()) if assessment_path.is_file() else None
    rows.append({'stage': planned['stage'], 'file': planned['file'], 'expectedCount': planned['expectedCount'],
                 'executionStatus': assessment['executionStatus'] if assessment else ('interrupted_or_binding_failed' if attempt.exists() else 'not_run'),
                 'assessment': str(assessment_path) if assessment else None,
                 'acceptanceScope': planned['acceptanceScope'], 'originalAcceptanceStatus': 'not_run'})
result = int(sys.argv[3])
if result == 0 and (len(rows) != 10 or sum(row['expectedCount'] for row in rows) != 12 or any(row['executionStatus'] != 'passed' for row in rows)):
    result = 92
summary = {'checkedAt': datetime.datetime.now(datetime.timezone.utc).isoformat(), 'exitCode': result,
           'executionStatus': 'completed' if result == 0 else 'stopped_after_failure_or_interruption',
           'expectedTests': 12, 'expectedFiles': 10, 'attempts': rows,
           'globalAfterBindingVerified': (out / 'binding-after-exit-code.txt').is_file() and (out / 'binding-after-exit-code.txt').read_text().strip() == '0',
           'originalAcceptanceStatus': 'not_run', 'originalWholeAcceptancePromotion': False,
           'excludedOriginalConditions': plan['excludedOriginalConditions']}
(out / 'summary.json').write_text(json.dumps(summary, ensure_ascii=False, indent=2) + '\n')
print(json.dumps({'executionStatus': summary['executionStatus'], 'exitCode': result, 'originalAcceptanceStatus': 'not_run'}))
raise SystemExit(0 if result == int(sys.argv[3]) else 1)
