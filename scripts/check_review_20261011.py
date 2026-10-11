#!/usr/bin/env python3
"""Validate the fixed 2026-10-11 review registries, not application acceptance."""
from __future__ import annotations

import argparse
from collections import Counter
import hashlib
import json
from pathlib import Path
import re
import subprocess
import sys
from urllib.parse import urlparse

FOLDER = "docs/review-2026-10-11"
CLAUSES = ("given", "when", "then", "negative_or_edge")
BASE = "3f34db00ef31bf97dec3d7668cb93212e5ba802f"
COUNTS = {"original_requirements": 104, "original_cases": 116, "original_clauses": 464,
          "original_packages": 24, "original_regression_groups": 6, "gaps": 16,
          "proposed_extensions": 12, "supplemental_cases": 68,
          "new_work_packages": 10, "official_sources": 22}


def validate(root: Path, worktree: bool = False, verify_git: bool = False) -> list[str]:
    errors: list[str] = []
    folder = root / FOLDER

    def require(condition, message):
        if not condition:
            errors.append(message)

    def read(name):
        return json.loads((folder / name).read_text(encoding="utf-8"))

    def git(*args):
        return subprocess.check_output(["git", "-C", str(root), *args], stderr=subprocess.PIPE)

    def baseline(path):
        return git("show", BASE + ":" + path) if verify_git else (root / path).read_bytes()

    def digest(content):
        return hashlib.sha256(content).hexdigest()

    def unique(rows, label):
        ids = [r["id"] for r in rows]
        require(len(ids) == len(set(ids)), f"duplicate {label} ID")
        return {r["id"]: r for r in rows}

    def acyclic(rows, field, label):
        graph = {r["id"]: r.get(field, []) for r in rows}
        visiting, done = set(), set()

        def visit(node):
            if node in visiting:
                require(False, f"{label} dependency cycle: {node}")
                return
            if node in done:
                return
            visiting.add(node)
            for child in graph[node]:
                require(child in graph, f"unknown {label} dependency: {child}")
                if child in graph:
                    visit(child)
            visiting.remove(node)
            done.add(node)

        for node in graph:
            visit(node)

    manifest = read("review_manifest.json")
    audit = read("requirements_audit.json")
    cases = read("original_acceptance_audit.json")
    gaps = read("gap_register.json")
    extensions = read("extension_requirements.json")
    extra = read("supplemental_acceptance.json")
    plans = read("implementation_plan.json")
    sources = read("research_sources.json")
    requirements = json.loads(baseline("docs/data/requirements.json"))
    original = json.loads(baseline("docs/data/completion_acceptance.json"))
    tasks = json.loads(baseline("docs/data/completion_tasks.json"))
    packages = json.loads(baseline("docs/data/work_packages.json"))
    req = unique(requirements, "original requirement")
    at = unique(original["cases"], "original acceptance")
    task = unique(tasks, "original task")
    a = unique(audit, "audit")
    c = unique(cases, "case")
    g = unique(gaps, "gap")
    x = unique(extensions, "extension")
    ac = unique(extra, "supplemental acceptance")
    ap = unique(plans, "plan")
    rs = unique(sources, "research source")
    require(manifest["main_commit"] == BASE, "fixed baseline drift")
    require(manifest["counts"] == COUNTS, "declared count drift")
    observed = [len(audit), len(cases), sum(len(r["clauses"]) for r in cases), len(packages),
                len(original["regression_groups"]), len(gaps), len(extensions), len(extra),
                len(plans), len(sources)]
    require(observed == list(COUNTS.values()), "observed registry count drift")
    require(manifest["runtime_tests_reexecuted"] == 0 and
            manifest["evidence_archive_bytes_reverified"] == 0, "runtime evidence overclaim")
    require(manifest["original_scope_unchanged"] is True, "original scope changed")
    require(manifest.get("allowed_document_updates") == ["README.md", "docs/README.md"],
            "unexpected allowance for baseline changes")
    require(set(a) == set(req), "original requirement coverage")
    require(set(c) == set(at), "original acceptance coverage")
    reported = manifest["reported_c29_counts"]
    local = Counter(r["reported_c29_local_result"] for r in cases)
    clauses = Counter(v["reported_c29_result"] for r in cases for v in r["clauses"])
    require(local == {
        "independently_adjudicated_whole_original_local_C29": reported["local_whole"],
        "independently_adjudicated_partial_original_local_C29": reported["local_partial"],
        "unadjudicated_C29_original_combination": reported["unjudged"]}, "reported C29 case count drift")
    require(clauses == {
        "independently_adjudicated_original_local_clause_C29": reported["direct_clauses"],
        "partial_original_literal_observation_C29": reported["partial_clauses"],
        "not_yet_observed_on_fixed_C29": reported["unobserved_clauses"]}, "reported C29 clause count drift")
    require(reported["final_case_not_run"] == len(cases), "reported final count drift")
    require(set(g) == {f"G{i:02}" for i in range(1, 17)}, "gap ID coverage")
    require(set(x) == {f"X{i:02}" for i in range(1, 13)}, "extension ID coverage")
    require(set(ap) == {f"AP{i:02}" for i in range(1, 11)}, "plan ID coverage")
    require(set(rs) == {f"RS{i:02}" for i in range(1, 23)}, "source ID coverage")
    if verify_git:
        require(manifest["main_tree"] == git("rev-parse", BASE + "^{tree}").decode().strip(),
                "baseline tree mismatch")
        require(git("rev-parse", manifest["c29_product_commit"] + "^{tree}") ==
                git("rev-parse", BASE + "^{tree}"), "C29/main product tree mismatch")
    source_paths = {e["path"] for e in manifest["source_manifest"]}

    for r in audit:
        rid = r["id"]
        require(r["original_requirement"] == req.get(rid), f"original requirement drift: {rid}")
        require(r["owner_batch"] == task[rid]["batch_id"], f"owner drift: {rid}")
        require(r["original_work_package"] == req[rid]["package_id"], f"package drift: {rid}")
        require(r["final_acceptance_result"] == "not_run" and not r["runtime_reexecuted"] and
                not r["reported_c29_evidence_reverified"], f"unobserved acceptance claim: {rid}")
        require(set(r["original_acceptance_ids"]) <= set(at), f"unknown original AT: {rid}")
        require(r["current_source_evidence"], f"missing source evidence: {rid}")
        require(set(r["gap_ids"]) == {i for i, v in g.items() if rid in v["requirements"]},
                f"gap mapping mismatch: {rid}")
        require(set(r["proposal_ids"]) == {i for i, v in x.items() if rid in v["related"]},
                f"extension mapping mismatch: {rid}")
        for evidence in r["current_source_evidence"]:
            require(evidence["path"] in source_paths, f"unregistered source evidence: {rid}")
            require(bool(re.fullmatch(r"[0-9a-f]{64}", evidence["sha256"])), f"invalid source hash: {rid}")
            if verify_git:
                content = baseline(evidence["path"])
                require(digest(content) == evidence["sha256"], f"source hash drift: {rid}")
                line = evidence["line"]
                lines = content.decode("utf-8").splitlines()
                require(1 <= line <= len(lines) and lines[line - 1].startswith(evidence["anchor"]),
                        f"source anchor drift: {rid}")
    for r in cases:
        aid = r["id"]
        expected = {k: at[aid][k] for k in ("id", "requirement_ids", "package_id", *CLAUSES)}
        require(r["original_case"] == expected, f"original four-clause drift: {aid}")
        require({v["name"] for v in r["clauses"]} == set(CLAUSES), f"missing clause: {aid}")
        for clause in r["clauses"]:
            require(clause["original"] == at[aid][clause["name"]], f"literal clause drift: {aid}")
            require(clause["result_for_new_target"] == "not_run", f"unobserved clause pass: {aid}")
        require(r["new_target_result"] == "not_run" and not r["reported_evidence_reverified"],
                f"unobserved original pass: {aid}")
    for r in gaps:
        require(set(r["requirements"]) <= set(req), f"unknown gap requirement: {r['id']}")
        require(set(r["sources"]) <= set(rs), f"unknown gap source: {r['id']}")
        require(set(r["original_acceptance_ids"]) <= set(at), f"unknown gap AT: {r['id']}")
        require(not r["runtime_reexecuted"], f"gap evidence overclaim: {r['id']}")
    for r in extensions:
        require(r["release_scope"] == "proposed_extension" and
                r["implementation_status"] == "not_implemented_by_this_pr", f"proposal scope drift: {r['id']}")
        require(set(r["related"]) <= set(req) and set(r["sources"]) <= set(rs),
                f"unknown proposal reference: {r['id']}")
        require(set(r["acceptance_ids"]) == {"AC-" + r["id"] + "-" + s for s in ("N", "E", "B")},
                f"proposal acceptance coverage: {r['id']}")
        for path in r["paths"]:
            exists = bool(git("ls-tree", BASE, "--", path)) if verify_git else path in source_paths
            require(exists, f"invented existing path: {path}")
        for path in r["modules"]:
            exists = bool(git("ls-tree", BASE, "--", path)) if verify_git else path in source_paths
            require(not exists, f"planned module already present: {path}")
    expected_ac = {f"AC-{i}-{s}" for i in g for s in ("N", "E")} | {
        f"AC-{i}-{s}" for i in x for s in ("N", "E", "B")}
    require(set(ac) == expected_ac, "supplemental case coverage")
    for r in extra:
        require(r["owner_id"] in g or r["owner_id"] in x, f"unknown AC owner: {r['id']}")
        require(r["result"] == "not_run", f"unobserved supplemental pass: {r['id']}")
        require(all(r[k] for k in ("given", "when", "then", "required_evidence")),
                f"incomplete AC: {r['id']}")
    for r in plans:
        owners = set(r["gap_ids"] + r["extension_ids"])
        require(set(r["gap_ids"]) <= set(g) and set(r["extension_ids"]) <= set(x),
                f"unknown plan subject: {r['id']}")
        require(set(r["acceptance_ids"]) == {i for i, v in ac.items() if v["owner_id"] in owners},
                f"plan acceptance mismatch: {r['id']}")
        mapped = {rid for i in r["gap_ids"] for rid in g[i]["requirements"]} | {
            rid for i in r["extension_ids"] for rid in x[i]["related"]}
        require(set(r["original_requirement_ids"]) == mapped, f"plan requirement mismatch: {r['id']}")
        require(set(r["original_work_packages"]) == {req[i]["package_id"] for i in mapped},
                f"plan original package mismatch: {r['id']}")
        require(r["status"] == "planned" and r["estimate_status"] == "unestimated",
                f"unobserved plan completion: {r['id']}")
        require(set(r.get("optional_dependencies", [])) <= set(ap), f"unknown optional dependency: {r['id']}")
    require({i for p in plans for i in p["gap_ids"]} == set(g), "unassigned gap")
    for xid in x:
        require(sum(xid in p["extension_ids"] for p in plans) == 1, f"proposal owner coverage: {xid}")
    acyclic(plans, "depends_on", "plan")
    acyclic(extensions, "depends", "extension")
    for r in sources:
        require(urlparse(r["url"]).scheme == "https" and r["authority"] == "official_documentation",
                f"source provenance: {r['id']}")
        require(r["checked_at"] == "2026-10-11", f"source date drift: {r['id']}")
        require(set(r["applies_to"]) <= set(g) | set(x) | {"existing", "deferred"},
                f"unknown source applicability: {r['id']}")
    for e in manifest["protected_contracts"] + manifest["source_manifest"]:
        require(bool(re.fullmatch(r"[0-9a-f]{64}", e["sha256"])), f"invalid baseline hash: {e['path']}")
        if verify_git:
            require(digest(baseline(e["path"])) == e["sha256"], f"baseline hash mismatch: {e['path']}")
        if worktree and e["path"] not in manifest["allowed_document_updates"]:
            path = root / e["path"]
            require(path.is_file() and digest(path.read_bytes()) == e["sha256"],
                    f"worktree baseline changed/missing: {e['path']}")
    for e in manifest["follow_up_read_sources"]:
        require(e["commit"] == manifest["follow_up_commit"] and bool(re.fullmatch(r"[0-9a-f]{64}", e["sha256"])),
                f"follow-up reference drift: {e['path']}")
        if verify_git:
            content = git("show", e["commit"] + ":" + e["path"])
            require(len(content) == e["bytes"] and digest(content) == e["sha256"],
                    f"follow-up source mismatch: {e['path']}")
    required_docs = ("README.md", "AUDIT.md", "GAPS.md", "RESEARCH.md", "REQUIREMENTS.md",
                     "IMPLEMENTATION_PLAN.md", "ACCEPTANCE.md", "VALIDATION.md")
    for name in required_docs:
        require((folder / name).is_file(), f"missing review document: {name}")
    for name, pattern, expected in [("GAPS.md", r"^## (G\d\d) ", set(g)),
                                    ("REQUIREMENTS.md", r"^### (X\d\d) ", set(x)),
                                    ("IMPLEMENTATION_PLAN.md", r"^### (AP\d\d) ", set(ap)),
                                    ("ACCEPTANCE.md", r"^### (AC-[GX]\d\d-[NEB])$", set(ac))]:
        found = re.findall(pattern, (folder / name).read_text(), re.MULTILINE)
        require(len(found) == len(set(found)) and set(found) == expected,
                f"document section coverage drift: {name}")
    return errors


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--root", type=Path, default=Path(__file__).resolve().parents[1])
    parser.add_argument("--check-worktree", action="store_true",
                        help="also verify this documentation PR did not change fixed baseline contracts/code")
    parser.add_argument("--verify-git-blobs", action="store_true",
                        help="verify immutable historical Git blobs/trees; requires the fixed commits locally")
    args = parser.parse_args()
    try:
        errors = validate(args.root.resolve(), args.check_worktree, args.verify_git_blobs)
    except (OSError, KeyError, TypeError, ValueError, subprocess.CalledProcessError) as exc:
        print(f"REVIEW VALIDATION FAILED: malformed/incomplete input: {exc}", file=sys.stderr)
        return 1
    if errors:
        print("REVIEW VALIDATION FAILED", file=sys.stderr)
        for message in errors:
            print("- " + message, file=sys.stderr)
        return 1
    print("REVIEW VALIDATION PASSED: original 104/116/464/24/6; gaps 16; proposals 12; AC 68; plans 10; sources 22.")
    print("Checked exact original clauses, IDs, traceability, dependencies and proposal scope.")
    if args.verify_git_blobs:
        print("Also checked immutable Git blobs/trees, source hashes/anchors and follow-up evidence document bytes.")
    if args.check_worktree:
        print("Also checked protected contracts/code in the worktree, allowing only the two document index updates.")
    print("This checker does not run the application or certify release/device/sync acceptance.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
