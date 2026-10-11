"""Release evidence guard; passing the document checker does not pass this gate."""
import json
import argparse
import subprocess
import sys
from pathlib import Path


def validate(root: Path, commit: str, evidence_path: Path | None = None) -> list[str]:
    errors = []
    evidence_path = evidence_path or root / 'docs/implementation/release-evidence.json'
    if not evidence_path.exists():
        return ['release-evidence.jsonがありません。完成版の公開は保留です。']
    try:
        evidence = json.loads(evidence_path.read_text())
        cases = json.loads((root / 'docs/data/acceptance_cases.json').read_text())
        packages = json.loads((root / 'docs/data/work_packages.json').read_text())
    except (ValueError, OSError) as exc:
        return [f'公開証拠の構造を確認できません: {type(exc).__name__}']
    if evidence.get('commit') != commit:
        errors.append('公開対象commitと証拠commitが一致しません。')
    if evidence.get('base') != '/shinariokanri/':
        errors.append('基底パスの検証記録がありません。')
    results = evidence.get('acceptance', {})
    if set(results) != {case['id'] for case in cases}:
        errors.append('全116受入ケースの結果がそろっていません。')
    for case in cases:
        row = results.get(case['id'], {})
        if row.get('result') != 'passed' or not row.get('evidence'):
            errors.append(f"{case['id']}: 合格証拠がありません。")
    states = evidence.get('workPackages', {})
    for package in packages:
        if states.get(package['id']) != 'complete':
            errors.append(f"{package['id']}: 完了していません。")
    for gate in ('realDevices', 'accessibilityManual', 'performance', 'restoreDrill', 'syncLive', 'rlsLive', 'independentReview', 'hostingCosts', 'directLinks'):
        row = evidence.get(gate, {})
        if row.get('result') != 'passed' or not row.get('evidence'):
            errors.append(f'{gate}: 合格証拠がありません。')
    return errors


if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('--evidence', type=Path)
    arguments = parser.parse_args()
    root = Path(__file__).resolve().parents[1]
    commit = subprocess.check_output(['git', 'rev-parse', 'HEAD'], cwd=root, text=True).strip()
    failures = validate(root, commit, arguments.evidence)
    if failures:
        print('RELEASE BLOCKED')
        for failure in failures:
            print('- ' + failure)
        sys.exit(1)
    print('RELEASE EVIDENCE PASSED: target commit and all completion gates recorded.')
