from pathlib import Path
import json, hashlib, datetime, subprocess
root = Path('/workspace/shinariokanri-rb06-large-history-export')
folder = Path(__file__).parent
binding = json.loads((folder / 'source-and-build-binding.json').read_text())
supervisor = json.loads((folder / 'large-113-history-export-diagnostic-1-SUPERVISOR.json').read_text())
raw = folder / 'measurements/large-113-history-export-diagnostic-1.json'
data = json.loads(raw.read_text())
diagnostic = data['diagnostic']
sha = lambda path: hashlib.sha256(path.read_bytes()).hexdigest()
assert supervisor['exitCode'] == 1 and supervisor['status'] == 'process_completed_unadjudicated'
assert sha(raw) == supervisor['rawSHA256']
for row in binding['source_files'] + binding['artifact_files']:
    assert sha(root / row['path']) == row['sha256'], row['path']
git = lambda *args: subprocess.check_output(['git', *args], cwd=root, text=True).strip()
assert git('rev-parse', 'HEAD') == binding['commit']
assert git('rev-parse', 'HEAD^{tree}') == binding['tree']
assert git('status', '--porcelain') == ''
timestamp = lambda value: datetime.datetime.fromisoformat(value.replace('Z', '+00:00'))
progress = diagnostic['progress']
gaps = [{'before': first['at'], 'after': second['at'], 'seconds': (timestamp(second['at']) - timestamp(first['at'])).total_seconds()} for first, second in zip(progress, progress[1:])]
maximum = max(gaps, key=lambda item: item['seconds'])
files = [{'path': str(path.relative_to(folder)), 'bytes': path.stat().st_size, 'sha256': sha(path)} for path in sorted(folder.rglob('*')) if path.is_file() and path.name != 'EXECUTION.json']
result = {
    'recordedAt': datetime.datetime.now(datetime.timezone.utc).isoformat(),
    'commit': binding['commit'], 'tree': binding['tree'], 'build': binding['build_info']['version'],
    'startedAt': supervisor['launchedAt'], 'finishedAt': supervisor['finishedAt'], 'exitCode': 1,
    'result': 'failed_download_timeout_600000ms', 'errors': data['errors'],
    'normalUiEditsCompleted': len(diagnostic['edits']), 'sourceCheckpointsCompleted': len(diagnostic['checks']),
    'lastActuallyObservedCheckpoint': diagnostic['checks'][-1],
    'exportStartedAt': diagnostic['exportStartedAt'], 'lastProgress': progress[-1],
    'maximumObservedPageProgressGap': maximum, 'completeFile': diagnostic.get('completeFile'),
    'newCloneColdRestoreExecuted': False, 'inputBytesUnchangedAfterRun': True,
    'headTreeCleanUnchangedAfterRun': True, 'sourceFileCount': len(binding['source_files']),
    'artifactFileCount': len(binding['artifact_files']),
    'bindingSHA256': sha(folder / 'source-and-build-binding.json'), 'rawSHA256': sha(raw),
    'supervisorSHA256': sha(folder / 'large-113-history-export-diagnostic-1-SUPERVISOR.json'),
    'memoryEventsAtLaunch': supervisor['memoryEventsAtLaunch'],
    'memoryEventsAtFinish': supervisor['memoryEventsCurrent'], 'physicalDevice': False,
    'actualAuthRlsStorage': False,
    'scope': 'Actual local production browser failure. Successful112 normal edits/14 source checkpoints do not pass113-history export, long-operation response/cancel, complete restoration, original full AT or physical/live conditions. No successful file was available; strict restore helper remained unexecuted. Timer/caps/fixture unchanged. A progress-observation gap is not a measured frame or cancel latency.',
    'files': files,
}
destination = folder / 'EXECUTION.json'
assert not destination.exists(), 'Do not overwrite a closed execution record'
destination.write_text(json.dumps(result, ensure_ascii=False, indent=2) + '\n')
print(json.dumps({'executionSHA256': sha(destination), 'rawSHA256': result['rawSHA256'], 'result': result['result'], 'maximumObservedPageProgressGap': maximum, 'files': len(files), 'lastCheckpointRevision': result['lastActuallyObservedCheckpoint']['revision']}, ensure_ascii=False))
