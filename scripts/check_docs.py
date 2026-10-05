#!/usr/bin/env python3
"""Validate documentation traceability offline using only the standard library.

This is a document checker, not an application/schema/ZIP/device test runner.
"""
from __future__ import annotations

import argparse
import hashlib
import json
from pathlib import Path
import re
import sys
from urllib.parse import unquote
import uuid


def load_json(path: Path):
    def no_duplicate_keys(pairs):
        result = {}
        for key, value in pairs:
            if key in result:
                raise ValueError(f"duplicate JSON key: {key}")
            result[key] = value
        return result

    return json.loads(path.read_text(encoding="utf-8"), object_pairs_hook=no_duplicate_keys)


def validate(root: Path) -> list[str]:
    errors: list[str] = []
    root = root.resolve()

    def require(condition, message):
        if not condition:
            errors.append(message)

    paths = {
        "requirements": "docs/data/requirements.json",
        "packages": "docs/data/work_packages.json",
        "cases": "docs/data/acceptance_cases.json",
        "catalog": "docs/data/feature_catalog.json",
        "sources": "docs/research/sources.json",
        "technical": "docs/research/technical_sources.json",
        "provenance": "docs/research/PROVENANCE.json",
        "example": "docs/examples/branching-clue.example.json",
    }
    data = {}
    for key, path in paths.items():
        try:
            data[key] = load_json(root / path)
        except (OSError, ValueError) as exc:
            errors.append(f"JSON invalid or missing: {path}: {exc}")
    if len(data) != len(paths):
        return errors

    indices = {}
    for key in ("requirements", "packages", "cases", "catalog", "sources", "technical"):
        rows = data[key]
        if not isinstance(rows, list) or not all(isinstance(r, dict) and isinstance(r.get("id"), str) for r in rows):
            errors.append(f"registry is not an ID-bearing array: {key}")
            return errors
        ids = [r["id"] for r in rows]
        require(len(ids) == len(set(ids)), f"duplicate registry ID: {key}")
        indices[key] = {r["id"]: r for r in rows}

    def expected(prefix, count):
        return {f"{prefix}{n:02d}" for n in range(1, count + 1)}

    require(set(indices["requirements"]) == expected("REQ-B", 24) | expected("REQ-F", 60) | expected("REQ-N", 20), "requirement scope must be B01–B24/F01–F60/N01–N20")
    require(set(indices["catalog"]) == expected("F", 60), "research scope must contain all F01–F60")
    require(set(indices["packages"]) == expected("WP", 24), "plan must contain WP01–WP24")
    require(set(indices["cases"]) == expected("AT-B", 24) | expected("AT-F", 60) | expected("AT-N", 20) | expected("AT-E", 12), "acceptance scope must contain 104 individual + 12 integrated cases")
    require(set(indices["sources"]) == expected("S", 48), "original source scope must be S01–S48")
    require(set(indices["technical"]) == expected("T", 10), "technical source scope must be T01–T10")

    known_sources = set(indices["sources"]) | set(indices["technical"])
    for s in data["sources"] + data["technical"]:
        for field in ("title", "url", "scope"):
            require(bool(s.get(field)), f"source {s['id']} missing {field}")
        require(s.get("url", "").startswith("https://"), f"source must use HTTPS: {s['id']}")

    for f in data["catalog"]:
        for field in ("group", "group_title", "title", "description", "acceptance", "origin"):
            require(bool(f.get(field)), f"proposal {f['id']} missing {field}")
        require(set(f.get("source_refs", [])) <= set(indices["sources"]), f"proposal has unknown original source: {f['id']}")
        r = indices["requirements"].get("REQ-" + f["id"])
        require(bool(r), f"proposal missing requirement: {f['id']}")
        if r:
            require(r.get("source_feature_id") == f["id"], f"proposal mapping wrong: {f['id']}")
            require(r.get("title") == f["title"], f"proposal title drift: {f['id']}")
            require(r.get("shall", "").startswith(f["description"].removesuffix("。")), f"proposal description drift: {f['id']}")
            require(r.get("source_refs") == f.get("source_refs"), f"proposal source drift: {f['id']}")
            a = indices["cases"].get("AT-" + f["id"])
            require(a and a.get("then") == f["acceptance"], f"proposal acceptance drift: {f['id']}")

    for r in data["requirements"]:
        rid = r["id"]
        for field in ("title", "provenance", "shall", "failure_behavior"):
            require(bool(r.get(field)), f"requirement {rid} missing {field}")
        require(r.get("implementation_status") == "planned", f"not an implementation result: {rid}")
        require(r.get("release_scope") == "complete_v1", f"scope dropped from complete v1: {rid}")
        require(set(r.get("source_refs", [])) <= known_sources, f"unknown requirement source: {rid}")
        require(r.get("package_id") in indices["packages"], f"unknown owner package: {rid}")
        require(r.get("acceptance_ids") == ["AT-" + rid.removeprefix("REQ-")], f"primary acceptance mapping wrong: {rid}")
        if rid.startswith(("REQ-F", "REQ-N")):
            require(r.get("decision_status") == "review_proposal", f"unreviewed proposal presented as adopted: {rid}")
        for aid in r.get("acceptance_ids", []):
            case = indices["cases"].get(aid)
            require(case is not None, f"missing acceptance case: {rid} -> {aid}")
            if case:
                require(rid in case.get("requirement_ids", []), f"missing case backlink: {aid}")
                require(case.get("package_id") == r.get("package_id"), f"case owner disagrees: {aid}")

    for c in data["cases"]:
        aid = c["id"]
        for field in ("given", "when", "then", "negative_or_edge"):
            require(bool(c.get(field)), f"acceptance {aid} missing {field}")
        require(c.get("result") == "not_run", f"application case must remain not_run: {aid}")
        require(bool(c.get("requirement_ids")), f"case has no requirements: {aid}")
        require(set(c.get("requirement_ids", [])) <= set(indices["requirements"]), f"unknown case requirement: {aid}")
        require(c.get("package_id") in indices["packages"], f"unknown case package: {aid}")

    for p in data["packages"]:
        pid = p["id"]
        deps = p.get("depends_on", [])
        require(len(deps) == len(set(deps)), f"duplicate dependency: {pid}")
        require(set(deps) <= set(indices["packages"]), f"unknown dependency: {pid}")
        require(p.get("status") == "planned", f"package is not implemented: {pid}")
        require(p.get("estimate_status") == "unestimated", f"package has unsupported estimate: {pid}")
        require(p.get("stage") in list("ABCDEF"), f"unknown plan stage: {pid}")
        for field in ("deliverables", "completion_gate", "primary_risk"):
            require(bool(p.get(field)), f"package {pid} missing {field}")
        owned = {r["id"] for r in data["requirements"] if r.get("package_id") == pid}
        checks = {a["id"] for a in data["cases"] if a.get("package_id") == pid}
        require(set(p.get("requirement_ids", [])) == owned, f"package requirement mapping incomplete: {pid}")
        require(set(p.get("acceptance_ids", [])) == checks, f"package acceptance mapping incomplete: {pid}")
        for dep in deps:
            q = indices["packages"].get(dep)
            if q:
                require(q.get("stage", "Z") <= p.get("stage", "A"), f"later-stage dependency: {pid} -> {dep}")

    visited, active = set(), set()
    def visit(pid):
        if pid in active:
            errors.append(f"dependency cycle at {pid}")
            return
        if pid in visited or pid not in indices["packages"]:
            return
        active.add(pid)
        for dep in indices["packages"][pid].get("depends_on", []):
            visit(dep)
        active.remove(pid)
        visited.add(pid)
    for pid in indices["packages"]:
        visit(pid)

    # Compare the human-readable normative sections with their registries.
    documents = {}
    for label, path in (
        ("spec", "docs/spec/REQUIREMENTS.md"),
        ("tests", "docs/quality/ACCEPTANCE_TESTS.md"),
        ("trace", "docs/plan/TRACEABILITY.md"),
        ("plan", "docs/plan/IMPLEMENTATION_PLAN.md"),
        ("catalog", "docs/research/FEATURE_CATALOG.md"),
        ("sources", "docs/research/SOURCES.md"),
    ):
        try:
            documents[label] = (root / path).read_text(encoding="utf-8")
        except OSError:
            errors.append(f"missing document: {path}")
    if len(documents) == 6:
        def sections(text, prefix):
            return {m.group(1): m.group(0) for m in re.finditer(r"^### (" + re.escape(prefix) + r"[A-Z]?\d{2})\b[^\n]*\n[\s\S]*?(?=^### |^## |\Z)", text, re.M)}
        spec_sections = sections(documents["spec"], "REQ-")
        case_sections = sections(documents["tests"], "AT-")
        feature_sections = sections(documents["catalog"], "F")
        require(set(spec_sections) == set(indices["requirements"]), "spec section coverage differs from registry")
        require(set(case_sections) == set(indices["cases"]), "test section coverage differs from registry")
        require(set(feature_sections) == set(indices["catalog"]), "catalog section coverage differs from registry")
        for r in data["requirements"]:
            section = spec_sections.get(r["id"], "")
            for value in (r["title"], r["shall"], r["failure_behavior"], r["package_id"], *r["acceptance_ids"]):
                require(value in section, f"spec drift: {r['id']} -> {value[:30]}")
            require(f"| {r['id']} | {r['title']} | {r.get('source_feature_id', '—')} | {r['package_id']} | {', '.join(r['acceptance_ids'])} |" in documents["trace"], f"trace table drift: {r['id']}")
        for c in data["cases"]:
            section = case_sections.get(c["id"], "")
            for value in (c["given"], c["when"], c["then"], c["negative_or_edge"], c["package_id"]):
                require(value in section, f"test document drift: {c['id']}")
        for f in data["catalog"]:
            section = feature_sections.get(f["id"], "")
            for value in (f["title"], f["description"], f["acceptance"], f["origin"]):
                require(value in section, f"catalog document drift: {f['id']}")
        for p in data["packages"]:
            for value in (p["id"], p["title"], p["deliverables"], p["completion_gate"], p["primary_risk"]):
                require(value in documents["plan"], f"plan document drift: {p['id']}")
        for s in data["sources"] + data["technical"]:
            require(s["id"] in documents["sources"] and s["url"] in documents["sources"], f"source table missing: {s['id']}")

    prov = data["provenance"]
    for file_path, digest_field in (
        (prov.get("pdf_path", ""), "pdf_sha256"),
        (paths["catalog"], "feature_catalog_sha256"),
        (paths["sources"], "sources_sha256"),
    ):
        p = root / file_path
        if p.is_file():
            require(hashlib.sha256(p.read_bytes()).hexdigest() == prov.get(digest_field), f"provenance hash mismatch: {file_path}")
        else:
            errors.append(f"provenance file missing: {file_path}")
    pdf = root / prov.get("pdf_path", "")
    if pdf.is_file():
        require(pdf.stat().st_size == prov.get("pdf_bytes"), "research PDF size changed")
        require(pdf.read_bytes().startswith(b"%PDF-"), "research PDF header invalid")
    require(prov.get("pdf_pages") == 27 and prov.get("tool_count") == 15 and prov.get("source_count") == 48 and prov.get("proposal_count") == 60, "research manifest count mismatch")

    # The illustrative fixture is deliberately not a native archive.
    ex = data["example"]
    require(ex.get("isNativeArchive") is False, "example must not claim to be a native archive")
    groups = [ex.get("characters", []), ex.get("events", []), ex.get("variables", []), ex.get("foreshadows", []), ex.get("disclosures", []), ex.get("graph", {}).get("nodes", []), ex.get("graph", {}).get("edges", [])]
    ids = [row.get("id") for rows in groups for row in rows]
    require(len(ids) == len(set(ids)), "duplicate example ID")
    for eid in ids + [ex.get("projectId"), ex.get("graph", {}).get("id")]:
        try:
            require(str(uuid.UUID(eid)) == eid, f"example UUID not normalized: {eid}")
        except (ValueError, TypeError, AttributeError):
            errors.append(f"example invalid UUID: {eid}")
    nodes = {n["id"] for n in ex.get("graph", {}).get("nodes", [])}
    edges = {e["id"]: e for e in ex.get("graph", {}).get("edges", [])}
    for eid, edge in edges.items():
        require(edge.get("fromId") in nodes and edge.get("toId") in nodes, f"example broken edge: {eid}")
    for route in ex.get("expectedRoutes", []):
        current = ex.get("graph", {}).get("entryId")
        for eid in route.get("edgeIds", []):
            edge = edges.get(eid)
            require(edge is not None, f"example route missing edge: {eid}")
            if edge:
                require(edge.get("fromId") == current, f"example disconnected route: {eid}")
                current = edge.get("toId")
    require(set(ex.get("acceptanceIds", [])) <= set(indices["cases"]), "example cites unknown acceptance case")

    # All local markdown links must resolve inside this repository.
    for md in sorted(root.rglob("*.md")):
        if ".git" in md.relative_to(root).parts:
            continue
        content = md.read_text(encoding="utf-8")
        for match in re.finditer(r"\]\(([^\n]+?)\)", content):
            target = match.group(1).split(' "', 1)[0]
            if re.match(r"^(https?://|mailto:|#)", target):
                continue
            relative = unquote(target.split("#", 1)[0])
            resolved = (md.parent / relative).resolve()
            require(resolved.is_relative_to(root), f"local link leaves repository: {md.relative_to(root)} -> {target}")
            require(resolved.exists(), f"broken local link: {md.relative_to(root)} -> {target}")
        require("/workspace/scratch/" not in content and "libfile_" not in content and "sediment://" not in content, f"private workspace metadata leaked: {md.relative_to(root)}")
        require(not re.search(r"(?:ghp_[A-Za-z0-9]{20,}|github_pat_[A-Za-z0-9_]{20,}|sb_secret_[A-Za-z0-9]{20,})", content), f"possible secret in document: {md.relative_to(root)}")

    return errors


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--root", type=Path, default=Path(__file__).resolve().parents[1])
    args = parser.parse_args()
    errors = validate(args.root)
    if errors:
        print("DOCUMENT VALIDATION FAILED", file=sys.stderr)
        for message in errors:
            print("- " + message, file=sys.stderr)
        return 1
    print("DOCUMENT VALIDATION PASSED: 104 requirements, 60 proposals, 24 work packages, 116 planned cases, 48 original + 10 technical sources.")
    print("Checked: IDs, scope, sources, two-way traceability, acyclic dependencies, document/registry consistency, file hashes, fixture structure, local links.")
    print("Application, full JSON Schema, archive import/export, security, performance and real-device tests: NOT RUN.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
