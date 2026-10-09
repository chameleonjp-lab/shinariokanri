#!/usr/bin/env python3
"""Check scope, frozen review, task ownership and acceptance evidence references.

This validates a plan. It does not execute application acceptance tests.
"""
from __future__ import annotations

import argparse
from collections import Counter
import hashlib
import json
from pathlib import Path
import re


def load(path: Path):
    def unique(pairs):
        result = {}
        for key, value in pairs:
            if key in result:
                raise ValueError(f'duplicate JSON key: {key}')
            result[key] = value
        return result
    return json.loads(path.read_text(encoding='utf-8'), object_pairs_hook=unique)


def validate(root: Path) -> list[str]:
    failures = []
    def require(ok, message):
        if not ok:
            failures.append(message)

    def index(rows, label):
        require(isinstance(rows, list), f'{label}: expected array')
        if not isinstance(rows, list):
            return {}
        keys = [r.get('id') for r in rows if isinstance(r, dict)]
        require(len(keys) == len(rows) and all(isinstance(k, str) for k in keys), f'{label}: ID missing')
        require(len(keys) == len(set(keys)), f'{label}: duplicate ID')
        return {r['id']:r for r in rows if isinstance(r,dict) and isinstance(r.get('id'),str)}

    try:
        reqs = index(load(root/'docs/data/requirements.json'), 'original requirements')
        orig_wps = index(load(root/'docs/data/work_packages.json'), 'original packages')
        orig_cases = index(load(root/'docs/data/acceptance_cases.json'), 'original cases')
        plan = load(root/'docs/data/completion_plan.json')
        baseline = load(root/plan['baseline_path'])
        tasks = index(load(root/'docs/data/completion_tasks.json'), 'completion tasks')
        acceptance = load(root/'docs/data/completion_acceptance.json')
        cases = index(acceptance['cases'], 'completion cases')
        regressions = index(acceptance['regression_groups'], 'regression groups')
        batches = index(plan['batches'], 'batches')
        packages = index(plan['work_packages'], 'completion packages')
        assessments = index(baseline['assessments'], 'review assessments')
        findings = index(baseline['findings'], 'review findings')
    except (OSError, ValueError, KeyError, TypeError) as exc:
        return [f'Cannot read plan structure: {type(exc).__name__}: {exc}']

    require(len(reqs) == plan.get('requirements_total') == 104, '104 requirements must remain in scope')
    require(len(orig_wps) == plan.get('original_work_packages_total') == 24, '24 original packages must remain')
    require(len(orig_cases) == plan.get('acceptance_total') == 116, '116 original cases must remain')
    require(set(tasks) == set(reqs) == set(assessments), 'task/review coverage differs from requirements')
    require(set(cases) == set(orig_cases), 'acceptance case coverage differs from original')
    require(set(packages) == set(orig_wps), 'work package coverage differs from original')
    require(set(batches) == {f'RB{i:02d}' for i in range(1,11)}, 'expected RB01–RB10')
    require(set(findings) == {f'R{i:02d}' for i in range(1,7)}, 'expected R01–R06 findings')
    require(set(regressions) == {f'RG-R{i:02d}' for i in range(1,7)}, 'expected six regression groups')
    require(len(regressions) == plan.get('regression_groups_total') == 6, 'regression count differs')
    require(plan.get('baseline_commit') == baseline.get('main_commit') == 'ec0eaab51eba96a75eeccc9f2e9c585263a747f8', 'main baseline mismatch')
    require(plan.get('baseline_tree') == baseline.get('tree_sha') == '100b2886c0578d44430e0afebcaf99184fc92d63', 'tree baseline mismatch')
    require(baseline.get('review_head') == 'be4c53fbe1e814b3ce66f9f1e331009c8cfe750d', 'review head mismatch')
    require(baseline.get('verified_file_count') == 103, 'baseline verification count differs')

    counts = dict(Counter(row['status'] for row in assessments.values()))
    require(counts == baseline.get('assessment_counts'), 'historical assessment counts differ')
    required_contracts = {
        'docs/data/requirements.json','docs/data/acceptance_cases.json','docs/data/work_packages.json',
        'docs/spec/REQUIREMENTS.md','docs/spec/DATA_MODEL.md','docs/spec/BEHAVIOR_CONTRACT.md',
        'docs/spec/UI_UX.md','docs/spec/SYNC_SECURITY.md','docs/spec/FILE_FORMAT.md',
        'docs/spec/NONFUNCTIONAL_REQUIREMENTS.md','docs/plan/TRACEABILITY.md',
    }
    require(set(baseline.get('contract_sha256',{})) == required_contracts, 'contract freeze coverage incomplete')
    for path, expected in baseline.get('contract_sha256',{}).items():
        target = root/path
        require(target.is_file(), f'missing contract: {path}')
        if target.is_file():
            require(hashlib.sha256(target.read_bytes()).hexdigest() == expected, f'original contract changed: {path}')

    package_owners = {}
    for bid, b in batches.items():
        for key in ('title','outcome','gate','risk','paths','work'):
            require(bool(b.get(key)), f'{bid}: missing {key}')
        deps = b.get('depends_on',[])
        require(len(deps) == len(set(deps)), f'{bid}: duplicate dependency')
        require(set(deps) <= set(batches) and bid not in deps, f'{bid}: invalid dependency')
        for path in b.get('paths',[]):
            require((root/path).is_file(), f'{bid}: starting code path missing: {path}')
        for pid in b.get('packages',[]):
            require(pid in orig_wps and pid not in package_owners, f'unknown or duplicate original package owner: {pid}')
            package_owners[pid] = bid
    require(set(package_owners) == set(orig_wps), 'package ownership incomplete')
    active, visited = set(), set()
    def visit(bid):
        if bid in active:
            failures.append(f'dependency cycle: {bid}')
            return
        if bid in visited or bid not in batches:
            return
        active.add(bid)
        for dep in batches[bid].get('depends_on',[]):
            visit(dep)
        active.remove(bid)
        visited.add(bid)
    for bid in batches:
        visit(bid)

    for pid, p in packages.items():
        old = orig_wps.get(pid,{})
        require(p.get('batch_id') == package_owners.get(pid), f'{pid}: batch owner mismatch')
        for key, original in [('original_deliverables','deliverables'),('original_completion_gate','completion_gate'),('requirement_ids','requirement_ids'),('acceptance_ids','acceptance_ids')]:
            require(p.get(key) == old.get(original), f'{pid}: original {original} lost')

    for rid, t in tasks.items():
        old, a = reqs.get(rid,{}), assessments.get(rid,{})
        require(t.get('title') == old.get('title'), f'{rid}: title changed')
        require(t.get('original_package_id') == old.get('package_id'), f'{rid}: original owner changed')
        require(t.get('batch_id') == package_owners.get(old.get('package_id')), f'{rid}: batch owner mismatch')
        require(t.get('required_behavior') == old.get('shall'), f'{rid}: original required behavior lost')
        require(t.get('acceptance_ids') == old.get('acceptance_ids'), f'{rid}: primary acceptance mapping changed')
        require(t.get('baseline_assessment') == a.get('status'), f'{rid}: historical status changed')
        require(t.get('review_gap') == a.get('missing'), f'{rid}: historical gap changed')
        require(bool(t.get('implementation_action')) and len(t.get('done_when',[])) >= 3, f'{rid}: action/gate missing')
        require(t.get('final_acceptance_batch') == 'RB10', f'{rid}: final full acceptance owner missing')
        require(old.get('failure_behavior') in t.get('done_when',[]), f'{rid}: failure behavior missing')
        expected_integrated = {aid for aid, c in orig_cases.items() if aid.startswith('AT-E') and rid in c['requirement_ids']}
        require(set(t.get('integration_ids',[])) == expected_integrated, f'{rid}: integrated cases lost')
        for path in t.get('code_paths',[]):
            require((root/path).is_file(), f'{rid}: code path missing: {path}')
    for bid, b in batches.items():
        expected = {rid for rid,t in tasks.items() if t.get('batch_id') == bid}
        require(set(b.get('requirement_ids',[])) == expected, f'{bid}: requirement ownership differs')

    for aid, c in cases.items():
        old = orig_cases.get(aid,{})
        for key in ('given','when','then','negative_or_edge','requirement_ids','package_id'):
            require(c.get(key) == old.get(key), f'{aid}: original {key} changed')
        require(c.get('batch_id') == package_owners.get(old.get('package_id')), f'{aid}: case owner mismatch')
        expected = {package_owners.get(reqs[rid]['package_id']) for rid in old.get('requirement_ids',[]) if rid in reqs}
        require(set(c.get('contributing_batches',[])) == expected, f'{aid}: contributing batches incomplete')
        require(bool(c.get('evidence_fields')), f'{aid}: evidence contract missing')
    for gid, g in regressions.items():
        fid = g.get('finding_id')
        require(fid in findings and gid == 'RG-'+str(fid), f'{gid}: finding mapping mismatch')
        require(g.get('batch_id') == 'RB01', f'{gid}: first repair owner missing')
        require(set(g.get('requirements',[])) <= set(reqs), f'{gid}: unknown requirement')
        for key in ('given','steps','expected','environments'):
            require(bool(g.get(key)), f'{gid}: missing {key}')
        original_refs = {x for x in findings.get(fid,{}).get('requirement_ids',[]) if x.startswith('REQ-')}
        require(original_refs <= set(g.get('requirements',[])), f'{gid}: original affected requirements missing')

    # Planning and results are separate. Future updates may record real evidence.
    for label, rows in [('tasks',tasks),('cases',cases),('regressions',regressions)]:
        for ident, row in rows.items():
            require(row.get('result') in {'not_run','passed','failed'}, f'{ident}: unknown result')
            require(row.get('status') in {'planned','in_progress','blocked','complete'}, f'{ident}: unknown status')
            require(row.get('result') != 'passed' or bool(row.get('evidence')), f'{ident}: passed without evidence')
            require(row.get('status') != 'complete' or row.get('result') == 'passed', f'{ident}: complete without acceptance')
    if plan.get('full_acceptance_declared'):
        require(all(r.get('result') == 'passed' and r.get('evidence') for r in list(tasks.values())+list(cases.values())+list(regressions.values())), 'full acceptance declared without complete evidence')

    expected_headings = {
        'docs/plan/COMPLETION_PLAN.md':set(batches),
        'docs/plan/COMPLETION_TASKS.md':set(reqs),
        'docs/plan/COMPLETION_ACCEPTANCE.md':set(regressions) | {x for x in cases if x.startswith('AT-E')},
    }
    try:
        for path, expected in expected_headings.items():
            text = (root/path).read_text(encoding='utf-8')
            pattern = r'^### ((?:RB\d{2}|REQ-[BFN]\d{2}|RG-R\d{2}|AT-E\d{2}))\b'
            headings = re.findall(pattern,text,re.M)
            require(set(headings) == expected and len(headings) == len(set(headings)), f'{path}: human-readable coverage differs')
        text = (root/'docs/plan/COMPLETION_ACCEPTANCE.md').read_text(encoding='utf-8')
        individual = re.findall(r'^\| (AT-[BFN]\d{2}) \|',text,re.M)
        require(set(individual) == {x for x in cases if not x.startswith('AT-E')} and len(individual) == 104, 'human-readable individual acceptance coverage differs')
        task_doc = (root/'docs/plan/COMPLETION_TASKS.md').read_text(encoding='utf-8')
        sections = {m.group(1):m.group(0) for m in re.finditer(r'^### (REQ-[BFN]\d{2})\b[^\n]*\n[\s\S]*?(?=^### |^## |\Z)',task_doc,re.M)}
        for rid,t in tasks.items():
            section = sections.get(rid,'')
            for key in ('title','retained_implementation','review_gap','implementation_action','required_behavior'):
                require(t.get(key,'') in section, f'{rid}: human-readable {key} differs from registry')
        batch_doc = (root/'docs/plan/COMPLETION_PLAN.md').read_text(encoding='utf-8')
        sections = {m.group(1):m.group(0) for m in re.finditer(r'^### (RB\d{2})\b[^\n]*\n[\s\S]*?(?=^### |^## |\Z)',batch_doc,re.M)}
        for bid,b in batches.items():
            section = sections.get(bid,'')
            for key in ('title','outcome','gate','risk'):
                require(b.get(key,'') in section, f'{bid}: human-readable {key} differs from registry')
            for work in b.get('work',[]):
                require(work in section, f'{bid}: human-readable work differs from registry')
    except OSError as exc:
        failures.append(f'missing plan document: {exc.filename}')
    return failures


if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('--root',type=Path,default=Path(__file__).resolve().parents[1])
    args = parser.parse_args()
    errors = validate(args.root.resolve())
    if errors:
        print('COMPLETION PLAN FAILED')
        for error in errors:
            print('- '+error)
        raise SystemExit(1)
    print('COMPLETION PLAN PASSED: 104 tasks / 24 packages / 116 cases / 6 regression groups / 10 batches; original contracts retained.')
