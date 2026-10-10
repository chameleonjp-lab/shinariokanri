from pathlib import Path
import datetime
import hashlib
import json
import os
import re

NOW = datetime.datetime.now(datetime.timezone.utc).isoformat()


def digest(data):
    return hashlib.sha256(data).hexdigest()


def write(path, value):
    path.write_text(json.dumps(value, ensure_ascii=False, indent=2) + '\n')


own = Path(__file__).parent
write(own / 'PREVIOUS_METADATA_FAILURE.json', {
    'classification': 'OWN_METADATA_SEAL_SCRIPT_ERROR_NOT_PRODUCT_OR_TEST_OUTCOME',
    'originalToolOutput': 'Traceback (most recent call last):\n  File "<stdin>", line 41, in <module>\nKeyError: \'actualHostObservation\'\n',
    'reason': 'Attempt 1 captured no host observation field. The metadata script incorrectly assumed attempt 2 shape.',
    'correction': 'Use each actual capture format; missing attempt-1 environment stays unobserved. Do not infer its browser or OS from attempt 2.',
    'originalTypeAndCollectionRecordsUnchanged': True,
})

summary = []
for number in ['1', '2']:
    root = Path('/workspace/shinariokanri-independent-c20-type-collection-' + number)
    assert not (root / 'FINAL_SEAL.json').exists()
    status = json.loads((root / 'STATUS.json').read_text())
    capture = json.loads((root / 'INPUT_CAPTURE.json').read_text())
    plan = json.loads((root / 'PLAN.json').read_text())
    assert status.get('finishedAt') and status.get('browserExecutions') == 0
    assert status.get('SQLExecutions') == 0
    for item in capture['files']:
        path = root / 'inputs' / item['path']
        data = path.read_bytes()
        assert len(data) == item['bytes'] and digest(data) == item['sha256'], str(path)

    compiled = []
    for path in sorted((root / 'private-pw-transform-cache').rglob('*')):
        if path.is_file():
            data = path.read_bytes()
            compiled.append({'path': str(path.relative_to(root)), 'bytes': len(data), 'sha256': digest(data)})
    if number == '1':
        old = json.loads((root / 'PRIVATE_COMPILED_CAPTURE.json').read_text())
        assert [(f['bytes'], f['sha256']) for f in old['files']] == [(f['bytes'], f['sha256']) for f in compiled]
    else:
        write(root / 'PRIVATE_COMPILED_CAPTURE.json', {
            'phase': 'ACTUAL_CORRECTED_TYPE_AND_LIST_TRANSFORMS_NO_BROWSER_EXECUTION',
            'capturedAt': NOW, 'files': compiled, 'count': len(compiled),
            'bytes': sum(f['bytes'] for f in compiled), 'typesActualExit': 0,
            'normalCollectionActualExit': 0, 'componentCollectionActualExit': 0,
            'browserExecutions': 0, 'noCleanupPerformed': True,
        })

    collected = []
    if number == '2':
        for group, expected in [('normal', 132), ('component', 3)]:
            report = json.loads((root / 'results' / (group + '-list-reporter') / 'playwright.json').read_text())
            assert report.get('errors') == []
            specs = []

            def walk(value):
                specs.extend(value.get('specs', []))
                for child in value.get('suites', []):
                    walk(child)

            walk(report)
            assert len(specs) == expected and sum(len(s.get('tests', [])) for s in specs) == expected
            for spec in specs:
                labels = sorted(set('AT-' + match for match in re.findall(
                    r'(?<![A-Za-z0-9_])(?:AT-)?([BFEN]\d{2})(?!\d)', spec['title'])))
                collected.append({
                    'group': group, 'title': spec['title'], 'file': spec['file'],
                    'line': spec['line'], 'id': spec['id'],
                    'declaredOriginalCaseLabels': labels, 'actualBodyExecutions': 0,
                })
        write(root / 'ACTUAL_COLLECTED_DEFINITIONS.json', {
            'phase': 'ACTUAL_LIST_ONLY_DEFINITIONS_NOT_OBSERVED_ORIGINAL_CLAUSES',
            'candidate': 'C20', 'count': 135, 'normal': 132, 'componentSupportOnly': 3,
            'tests': collected, 'allOriginalClauseAcceptanceNotRun': True,
        })

    failure = None
    if number == '1':
        failure = {
            'classification': 'OWN_PLAYWRIGHT_FIXTURE_DECLARATION_ERROR_NOT_PRODUCT_FAILURE',
            'message': 'First argument must use the object destructuring pattern: context',
            'occurrences': (root / 'results' / 'collection-stderr.txt').read_text().count(
                'First argument must use the object destructuring pattern: context'),
            'originalFailurePreserved': True,
        }
    stages = [{key: command.get(key) for key in ['stage', 'exitCode', 'startedAt', 'finishedAt']}
              for command in status['commands']]
    preparation_hash = plan.get('immutablePreparationSealSHA256')
    if preparation_hash is None:
        preparation_hash = plan['oldImmutableSeal']['sha256']
    write(root / 'ADJUDICATION.json', {
        'phase': 'C20_AUTHORIZED_PRIVATE_HELPER_PREFLIGHT_FINAL_RECORD_NO_BROWSER_OR_AT_ACCEPTANCE',
        'capturedAt': NOW, 'candidate': {key: plan[key] for key in ['candidate', 'commit', 'tree', 'build']},
        'inputFilesVerified': len(capture['files']), 'types': 'passed',
        'normalList': 132 if number == '2' else 0, 'componentSupportList': 3 if number == '2' else 0,
        'browserExecutions': 0, 'SQLExecutions': 0, 'sharedWrites': 0, 'C21Acceptances': 0,
        'original116WholePasses': 0, 'original464ObservedClauses': 0, 'stages': stages,
        'actualNodeVersion': (root / 'results' / 'compiler-environment-stdout.txt').read_text().strip()
        if number == '2' else 'not_observed_in_attempt1',
        'actualHostObservation': capture.get('actualHostObservation', 'not_observed_in_attempt1'),
        'actualBrowserVersion': 'not_observed_no_browser', 'failure': failure,
        'correctionLineage': plan.get('correctionLineage', []),
        'skippedStatsExplanation': 'Playwright --list reports collected definitions as skipped; no fixtures or test bodies ran. Skipped is not a product outcome.',
        'immutableOriginalPreparationSealSHA256': preparation_hash,
        'newAttemptRequiredForFinalC21': True,
    })

    members = []
    links = []
    for folder, directories, names in os.walk(root, followlinks=False):
        directories.sort()
        names.sort()
        for name in list(directories):
            path = Path(folder) / name
            if path.is_symlink():
                links.append({'path': str(path.relative_to(root)), 'target': os.readlink(path)})
                directories.remove(name)
        for name in names:
            path = Path(folder) / name
            if path.name == 'FINAL_SEAL.json' and path.parent == root:
                continue
            if path.is_symlink():
                links.append({'path': str(path.relative_to(root)), 'target': os.readlink(path)})
                continue
            data = path.read_bytes()
            members.append({'path': str(path.relative_to(root)), 'bytes': len(data), 'sha256': digest(data)})
    seal = {
        'phase': 'COMPLETED_C20_PRIVATE_TYPE_COLLECTION_SEAL_NO_BROWSER_AT_ACCEPTANCE',
        'createdAt': NOW, 'pathBase': str(root), 'files': members, 'links': links,
        'count': len(members), 'bytes': sum(f['bytes'] for f in members),
        'externalCompilerEntriesCapturedBeforeLaunch': capture['actualCompilerEntry'],
        'candidate': {key: plan[key] for key in ['candidate', 'commit', 'tree', 'build']},
        'actualResultScope': 'Type and test collection only', 'browserExecutions': 0, 'wholeATPasses': 0,
    }
    write(root / 'FINAL_SEAL.json', seal)
    for folder, directories, names in os.walk(root, followlinks=False):
        for name in names:
            path = Path(folder) / name
            if not path.is_symlink():
                path.chmod(0o444)
    for folder, directories, names in os.walk(root, topdown=False, followlinks=False):
        path = Path(folder)
        if not path.is_symlink():
            path.chmod(0o555)
    summary.append({
        'root': str(root), 'sealSHA256': digest((root / 'FINAL_SEAL.json').read_bytes()),
        'files': seal['count'], 'bytes': seal['bytes'], 'compiledFiles': len(compiled),
        'compiledBytes': sum(f['bytes'] for f in compiled), 'stages': stages, 'browserExecutions': 0,
    })

write(own / 'RESULT.json', {'phase': 'METADATA_ONLY_SEALING_COMPLETE', 'attempts': summary})
print(json.dumps(summary, ensure_ascii=False))
