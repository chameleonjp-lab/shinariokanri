#!/usr/bin/env python3
"""Validate this planning snapshot; never certify application acceptance."""
import argparse
import hashlib
import json
import re
import subprocess
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
FOLDER = Path(__file__).resolve().parent
CLAUSES = ('given', 'when', 'then', 'negative_or_edge')


def validate(verify_git=False):
    errors = []

    def require(ok, message):
        if not ok:
            errors.append(message)

    def read(path):
        return json.loads(path.read_text(encoding='utf-8'))

    def digest(raw):
        return hashlib.sha256(raw).hexdigest()

    def ids(rows):
        result = {r['id'] for r in rows}
        require(len(result) == len(rows), 'duplicate IDs')
        return result

    m = read(FOLDER/'manifest.json')
    original_req = read(ROOT/'docs/data/requirements.json')
    original_cases = read(ROOT/'docs/data/completion_acceptance.json')
    original_wp = read(ROOT/'docs/data/work_packages.json')
    old_ap = read(ROOT/'docs/review-2026-10-11/implementation_plan.json')
    old_g = read(ROOT/'docs/review-2026-10-11/gap_register.json')
    old_x = read(ROOT/'docs/review-2026-10-11/extension_requirements.json')
    old_ac = read(ROOT/'docs/review-2026-10-11/supplemental_acceptance.json')
    req = read(FOLDER/'requirements_comparison.json')
    case = read(FOLDER/'acceptance_plan.json')
    gaps = read(FOLDER/'gap_updates.json')
    tasks = read(FOLDER/'implementation_plan.json')['tasks']
    remote = read(FOLDER/'remote_observations.json')
    req_ids, at_ids, wp_ids = ids(original_req), ids(original_cases['cases']), ids(original_wp)
    ap_ids, gap_ids, x_ids, ac_ids = ids(old_ap), ids(old_g), ids(old_x), ids(old_ac)
    t_ids = ids(tasks)
    require(m['counts'] == dict(original_requirements=104,original_acceptance_cases=116,
            original_clauses=464,original_work_packages=24,original_regression_groups=6,
            original_gaps=16,proposed_extensions=12,supplemental_cases=68,
            mandatory_tasks=15,conditional_tasks=4,total_tasks=19), 'declared counts drift')
    require(len(req_ids)==104 and len(at_ids)==116 and len(wp_ids)==24,
            'original requirement/case/package count drift')
    require(ids(req)==req_ids and ids(case['cases'])==at_ids, 'original coverage drift')
    require(ids(gaps['gaps'])==gap_ids and ids(gaps['extensions'])==x_ids, 'gap/extension coverage drift')
    require(m['original_regression_groups']==original_cases['regression_groups']
            and len(original_cases['regression_groups'])==6, 'original regression drift')
    require(set(m['supplemental_case_ids'])==ac_ids and len(ac_ids)==68, 'supplemental coverage drift')
    require(m['runtime_reexecuted'] is False and m['scope_changed'] is False
            and m['all_c29_evidence_bytes_reverified'] is False, 'review scope claim drift')
    require(remote['main']==m['main'] and remote['pr48']==m['pr48'], 'remote observation binding drift')
    require(remote['pr48']['run']['conclusion']=='failure'
            and remote['pr48']['run']['e2e_passed']==667
            and remote['pr48']['run']['e2e_failed']==2, 'fixed CI observation drift')
    require(remote['main']['commit']!=remote['pr48']['head'], 'main and unmerged PR conflated')
    require(case['target'] is None, 'new acceptance target must remain unassigned in planning snapshot')

    original_by_id = {r['id']:r for r in original_cases['cases']}
    req_by_id = {r['id']:r for r in original_req}
    sources = {r['path']:r for r in m['source_files']}
    for row in req:
        require(row['original_requirement']==req_by_id[row['id']], f"original requirement drift: {row['id']}")
        require(set(row['source_paths'])<=set(sources), f"source coverage drift: {row['id']}")
        require(set(row['next_tasks'])<=t_ids and bool(row['next_tasks']), f"unassigned requirement: {row['id']}")
        require(row['final_acceptance_result']=='not_run' and row['runtime_reexecuted'] is False,
                f"unsupported new acceptance claim: {row['id']}")
    clause_count = 0
    for row in case['cases']:
        original = original_by_id[row['id']]
        require(row['requirement_ids']==original['requirement_ids'], f"case requirement drift: {row['id']}")
        require([c['name'] for c in row['clauses']]==list(CLAUSES), f"case clause shape drift: {row['id']}")
        for c in row['clauses']:
            clause_count += 1
            require(c['original']==original[c['name']], f"original clause drift: {row['id']}:{c['name']}")
            require(c['final_result']=='not_run' and c['evidence']==[] and c['target_binding'] is None,
                    f"unsupported clause credit: {row['id']}:{c['name']}")
        require(row['final_result']=='not_run', f"unsupported case credit: {row['id']}")
        require(set(row['tasks'])<=t_ids and bool(row['tasks']), f"unassigned case: {row['id']}")
    require(clause_count==464, '464 clause coverage drift')

    require(len([t for t in tasks if t['scope']=='mandatory'])==15
            and len([t for t in tasks if t['scope']=='conditional'])==4, 'task scope drift')
    require(t_ids=={f'CP{i:02}' for i in range(1,20)}, 'task ID drift')
    for t in tasks:
        for field, allowed in [('depends_on',t_ids),('original_ap_ids',ap_ids),
                ('gap_ids',gap_ids),('extension_ids',x_ids),('requirement_ids',req_ids),
                ('original_acceptance_ids',at_ids),('work_package_ids',wp_ids),
                ('supplemental_acceptance_ids',ac_ids)]:
            require(set(t[field])<=allowed, f"unknown reference: {t['id']}:{field}")
        require(t['id'] not in t['depends_on'], f"self dependency: {t['id']}")
        require(t['status']=='planned' and t['result']=='not_run' and t['evidence']==[],
                f"unsupported task completion: {t['id']}")
        require(len(t['steps'])>=3 and bool(t['acceptance_gate']) and bool(t['rollback']),
                f"non-actionable task: {t['id']}")
    for field, expected in [('original_ap_ids',ap_ids),('gap_ids',gap_ids),
            ('extension_ids',x_ids),('supplemental_acceptance_ids',ac_ids)]:
        require({s for t in tasks for s in t[field]}==expected, f"task coverage drift: {field}")
    require({s for t in tasks if t['scope']=='mandatory' for s in t['requirement_ids']}==req_ids,
            'mandatory 104 requirement coverage drift')
    graph = {t['id']:t['depends_on'] for t in tasks}
    visited, active = set(), set()

    def visit(node):
        if node in active:
            errors.append('dependency cycle: '+node)
            return
        if node in visited:
            return
        active.add(node)
        for parent in graph[node]:
            if parent in graph:
                visit(parent)
        active.remove(node)
        visited.add(node)

    for node in graph:
        visit(node)
    for row in gaps['extensions']:
        require(row['decision']=='proposed_not_adopted' and row['result']=='not_run',
                f"unapproved extension claim: {row['id']}")
    for row in gaps['gaps']:
        require(set(row['next_steps'])<=t_ids and row['final_acceptance_result']=='not_run',
                f"gap binding drift: {row['id']}")

    for p in m['protected_contracts']:
        raw = (ROOT/p['path']).read_bytes()
        require(len(raw)==p['bytes'] and digest(raw)==p['sha256'], 'protected contract changed: '+p['path'])
    if verify_git:
        for s in m['source_files']:
            for prefix, ref in [('main',m['main']['commit']),('pr48',m['pr48']['head'])]:
                raw = subprocess.check_output(['git','-C',str(ROOT),'show',ref+':'+s['path']])
                require(len(raw)==s[prefix+'_bytes'] and digest(raw)==s[prefix+'_sha256'],
                        f"fixed source mismatch: {prefix}:{s['path']}")
    for filename in ('README.md','AUDIT.md','IMPLEMENTATION_PLAN.md','ACCEPTANCE.md','CODEX_REQUEST.md','VALIDATION.md'):
        p = FOLDER/filename
        require(p.is_file(), 'missing document: '+filename)
        if not p.is_file():
            continue
        text = p.read_text(encoding='utf-8')
        if filename=='IMPLEMENTATION_PLAN.md':
            headings = re.findall(r'^### (CP\d\d) ', text, re.M)
            require(len(headings)==19 and set(headings)==t_ids, 'task document headings drift')
        for target in re.findall(r'\]\(([^)]+)\)',text):
            if '://' not in target and not target.startswith('#'):
                require((FOLDER/target.split('#')[0]).exists(), f"broken document link: {filename}:{target}")
    return errors


if __name__=='__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--verify-git',action='store_true',help='verify frozen main/PR48 source bytes; refs must exist locally')
    args = parser.parse_args()
    try:
        problems = validate(args.verify_git)
    except (OSError,ValueError,KeyError,subprocess.CalledProcessError) as exc:
        problems = ['malformed or missing planning data: '+str(exc)]
    if problems:
        print('REPLAN DOCUMENT CHECK FAILED')
        for message in problems:
            print('- '+message)
        raise SystemExit(1)
    print('REPLAN DOCUMENT CHECK PASSED: 104 requirements / 116 cases / 464 clauses / 24 packages / 6 groups / 16 gaps / 12 proposals / 68 AC / 19 tasks.')
    print('Exact clauses, traceability, dependencies, fixed source hashes and proposal scope checked; application acceptance remains not_run.')
