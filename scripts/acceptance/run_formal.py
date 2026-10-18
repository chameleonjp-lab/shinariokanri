"""Run original formal acceptance serially against one sealed local candidate."""
from __future__ import annotations
import argparse
from datetime import datetime, timezone
import hashlib
import json
from pathlib import Path
import subprocess
import sys

from seal_candidate import ROOT, create_binding, retain_snapshot, verify_binding
sys.path.insert(0, str(ROOT/'scripts'))
from check_phase3 import assess_performance, assess_saves, assess_soak, verify_exit, loads


def utc(): return datetime.now(timezone.utc).isoformat()
def save(path, value):
    path.parent.mkdir(parents=True, exist_ok=True)
    temporary = path.with_suffix(path.suffix+'.tmp')
    temporary.write_text(json.dumps(value, ensure_ascii=False, indent=2)+'\n'); temporary.replace(path)


def execute(command, directory):
    code = subprocess.call([sys.executable, str(ROOT/'scripts/acceptance/execute.py'),
                            '--workdir', str(ROOT), '--receipt', str(directory/'execution'), '--', *command], cwd=ROOT)
    if code: raise RuntimeError(f'Actual child failed ({code}); original evidence retained: {directory}')
    verify_exit(loads((directory/'execution/exit.json').read_bytes()))


def run(output, only=None):
    steps = ['performance-standard', 'performance-large', 'saves180', 'soak', 'exceptions']
    if not output.exists(): output.mkdir(parents=True)
    binding_path = output/'candidate.json'
    if not binding_path.exists():
        binding = create_binding(); save(binding_path, binding); retain_snapshot(binding, output/'candidate.zip')
        save(output/'sequence.json', dict(startedAt=utc(), candidate=binding['commit'], steps=[]))
    else: binding = loads(binding_path.read_bytes())
    verify_binding(binding, exact_head=True)
    sequence = loads((output/'sequence.json').read_bytes())
    for step in steps:
        if only and step != only: continue
        if any(r['step'] == step for r in sequence['steps']): raise ValueError('Never overwrite an earlier attempt: '+step)
        verify_binding(binding, exact_head=True)
        directory = output/step; directory.mkdir()
        row = dict(step=step, startedAt=utc(), status='running', sourceVerifiedBefore=True)
        sequence['steps'].append(row); save(output/'sequence.json', sequence)
        raw_path = directory/'raw.json'
        try:
            if step.startswith('performance-'):
                size = step.removeprefix('performance-')
                command = ['node', 'scripts/measure-app.mjs', '--size', size, '--samples', '30', '--mode', 'performance', '--output', str(raw_path)]
            elif step == 'saves180':
                (output/'results').mkdir(exist_ok=True)
                command = ['node', 'scripts/acceptance/measure-original-saves.mjs', '--binding', str(binding_path), '--proof', str(output), '--attempt', 'saves180']
                raw_path = output/'results/saves180/raw.json'
            elif step == 'soak':
                command = ['node', 'scripts/measure-large-history.mjs', '--soak-seconds', '7200', '--restore-storage', 'persistent', '--output', str(raw_path)]
            else:
                command = ['node', 'scripts/acceptance/measure-full-exceptions.mjs', '--binding', str(binding_path), '--source', str(output/'soak'), '--output', str(raw_path)]
            row['argv'] = command; row['raw'] = str(raw_path.relative_to(output)); save(output/'sequence.json', sequence)
            execute(command, directory)
            raw_bytes = raw_path.read_bytes(); raw = loads(raw_bytes)
            assessment = dict(product=binding['build_info'], raw=dict(bytes=len(raw_bytes), sha256=hashlib.sha256(raw_bytes).hexdigest()))
            if step.startswith('performance-'):
                original = loads((ROOT/f'docs/optimization/phase1/evidence/candidate-{size}30.json').read_bytes())['fixture']
                assessment['metrics'] = assess_performance(raw, binding['build_info'], original)
                if any(r['result'] == 'failed_local_numeric_condition' for r in assessment['metrics'].values()):
                    save(directory/'ADJUDICATION.json', assessment)
                    raise ValueError('Original numeric threshold failed; retain this attempt')
            elif step == 'soak':
                assessment.update(assess_soak(raw, binding['build_info']), actual7200='passed')
            elif step == 'saves180':
                assessment['conditions'] = assess_saves(raw, binding['build_info'])
            else:
                if raw['status'] != 'passed_same_full_Large_negative_and_retry' or not raw['completed'] or raw['errors']:
                    raise ValueError('Original full-input negatives did not complete')
            verify_binding(binding, exact_head=True)
            save(directory/'ADJUDICATION.json', assessment)
            row.update(status='completed', finishedAt=utc(), sourceVerifiedAfter=True)
            save(output/'sequence.json', sequence)
            print(json.dumps(dict(step=step, status='completed', at=utc())), flush=True)
        except BaseException as error:
            row.update(status='failed', finishedAt=utc(), error=dict(type=type(error).__name__, message=str(error)))
            save(output/'sequence.json', sequence); raise
    if {r['step'] for r in sequence['steps'] if r['status'] == 'completed'} == set(steps):
        sequence.update(finishedAt=utc(), status='completed'); save(output/'sequence.json', sequence)


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--output', type=Path, required=True)
    parser.add_argument('--only', choices=['performance-standard', 'performance-large', 'saves180', 'soak', 'exceptions'])
    args = parser.parse_args()
    run(args.output.resolve(), args.only)
