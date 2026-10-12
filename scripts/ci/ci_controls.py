"""Select conservative PR scope and verify independent browser evidence."""
from __future__ import annotations

import argparse
import json
import os
from pathlib import Path, PurePosixPath
import re
import subprocess
import sys

ENGINES = ("chromium", "firefox", "webkit")
MARKDOWN_ROOTS = (
    "docs/implementation/",
    "docs/completion-replan-2026-10-12/",
    "docs/quality/",
)


def documentation_only(path: str) -> bool:
    if not path or any(ord(c) < 32 for c in path) or "\\" in path:
        return False
    parts = PurePosixPath(path).parts
    if path.startswith("/") or any(part in (".", "..") for part in parts):
        return False
    return path == "README.md" or (
        path.endswith(".md") and path.startswith(MARKDOWN_ROOTS)
    )


def select_scope(event: str, paths: list[str] | None) -> tuple[bool, str]:
    if event != "pull_request":
        return True, "full-event"
    if not paths:
        return True, "unknown-or-empty-diff"
    if all(documentation_only(path) for path in paths):
        return False, "documentation-only"
    return True, "product-test-input-or-unknown-path"


def changed_paths(payload: dict, root: Path) -> list[str] | None:
    try:
        base = payload["pull_request"]["base"]["sha"]
        head = payload["pull_request"]["head"]["sha"]
        if not all(isinstance(value, str) and re.fullmatch(r"[a-f0-9]{40}", value) for value in (base, head)):
            return None
        result = subprocess.run(
            ["git", "diff", "--name-only", "--no-renames", "-z", base, head, "--"],
            cwd=root, check=True, capture_output=True,
        )
        return result.stdout.decode("utf-8").rstrip("\0").split("\0") if result.stdout else []
    except (KeyError, TypeError, OSError, UnicodeError, subprocess.CalledProcessError):
        return None


def write_scope() -> int:
    paths = None
    try:
        payload = json.loads(Path(os.environ["GITHUB_EVENT_PATH"]).read_text())
        paths = changed_paths(payload, Path.cwd())
    except (KeyError, OSError, ValueError, TypeError):
        pass
    product, reason = select_scope(os.environ.get("GITHUB_EVENT_NAME", ""), paths)
    output = f"run_product={str(product).lower()}\nreason={reason}\n"
    if os.environ.get("GITHUB_OUTPUT"):
        with Path(os.environ["GITHUB_OUTPUT"]).open("a") as file:
            file.write(output)
    if os.environ.get("GITHUB_STEP_SUMMARY"):
        with Path(os.environ["GITHUB_STEP_SUMMARY"]).open("a") as file:
            file.write(f"Scope: `{reason}`; product checks: `{str(product).lower()}`; changed paths: `{len(paths) if paths is not None else 'unknown'}`.\n")
    print(output, end="")
    return 0


def record_browser(engine: str, output: Path) -> int:
    payload = json.loads(Path(os.environ["GITHUB_EVENT_PATH"]).read_text())
    commit = subprocess.check_output(["git", "rev-parse", "HEAD"], text=True).strip()
    if commit != os.environ["GITHUB_SHA"]:
        raise ValueError("Checkout does not match the workflow commit")
    record = {
        "engine": engine, "commit": commit,
        "tree": subprocess.check_output(["git", "rev-parse", "HEAD^{tree}"], text=True).strip(),
        "pr_head": payload.get("pull_request", {}).get("head", {}).get("sha"),
        "run_id": os.environ["GITHUB_RUN_ID"],
        "attempt": int(os.environ["GITHUB_RUN_ATTEMPT"]),
    }
    output.parent.mkdir(parents=True, exist_ok=True)
    output.write_text(json.dumps(record, indent=2) + "\n")
    return 0


def test_keys(report: dict, engine: str) -> set[tuple[str, str]]:
    keys = []
    def visit(suite):
        for spec in suite.get("specs", []):
            for test in spec["tests"]:
                if test["projectName"] != engine:
                    raise ValueError("Report contains another browser")
                keys.append((spec["id"], test["projectName"]))
        for child in suite.get("suites", []):
            visit(child)
    for suite in report["suites"]:
        visit(suite)
    if not keys or len(keys) != len(set(keys)):
        raise ValueError("Empty or duplicate browser inventory")
    return set(keys)


def validate_results(needs: dict, evidence: Path, commit: str, run_id: str, attempt: int) -> dict:
    for name in ("scope", "documents"):
        if needs.get(name, {}).get("result") != "success":
            raise ValueError(f"{name} did not succeed")
    product = needs["scope"].get("outputs", {}).get("run_product")
    reason = needs["scope"].get("outputs", {}).get("reason")
    if product not in ("true", "false"):
        raise ValueError("Scope output is missing or invalid")
    if product == "false":
        if reason != "documentation-only" or any(needs.get(name, {}).get("result") != "skipped" for name in ("unit", "browser")):
            raise ValueError("Unexpected product-check omission")
        return {"scope": reason, "product_checks": "not_run_documentation_only", "browsers": []}
    if reason not in ("full-event", "unknown-or-empty-diff", "product-test-input-or-unknown-path"):
        raise ValueError("Full-check scope reason is missing or invalid")
    if any(needs.get(name, {}).get("result") != "success" for name in ("unit", "browser")):
        raise ValueError("A required product job failed, was cancelled, or was skipped")
    observations = []
    for engine in ENGINES:
        candidates = []
        for directory in evidence.glob(f"browser-evidence-{engine}-attempt*"):
            match = re.fullmatch(f"browser-evidence-{engine}-attempt([1-9][0-9]*)", directory.name)
            if match and int(match[1]) <= attempt:
                candidates.append((int(match[1]), directory))
        if not candidates:
            raise ValueError(f"Missing {engine} evidence")
        selected_attempt, directory = max(candidates, key=lambda pair: pair[0])
        folder = directory / "ci-browser-evidence"
        source = json.loads((folder / "source.json").read_text())
        if any(source.get(key) != value for key, value in {"engine": engine, "commit": commit, "run_id": run_id, "attempt": selected_attempt}.items()):
            raise ValueError(f"Stale or mismatched {engine} evidence")
        inventory = test_keys(json.loads((folder / "inventory.json").read_text()), engine)
        report = json.loads((folder / "results.json").read_text())
        if test_keys(report, engine) != inventory:
            raise ValueError(f"{engine} did not execute its complete inventory")
        stats = report["stats"]
        if stats.get("expected") != len(inventory) or any(stats.get(key) != 0 for key in ("unexpected", "flaky", "skipped")):
            raise ValueError(f"{engine} has unsuccessful or omitted tests")
        observations.append({"engine": engine, "tests": len(inventory), "attempt": selected_attempt, "tree": source["tree"]})
    if len({row["tree"] for row in observations}) != 1:
        raise ValueError("Browser source trees differ")
    return {"scope": reason, "product_checks": "passed", "browsers": observations}


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    sub = parser.add_subparsers(dest="command", required=True)
    sub.add_parser("scope")
    record = sub.add_parser("record")
    record.add_argument("--engine", choices=ENGINES, required=True)
    record.add_argument("--output", type=Path, required=True)
    verify = sub.add_parser("verify")
    verify.add_argument("--evidence", type=Path, required=True)
    args = parser.parse_args()
    try:
        if args.command == "scope":
            return write_scope()
        if args.command == "record":
            return record_browser(args.engine, args.output)
        result = validate_results(
            json.loads(os.environ["SCENARIO_CI_NEEDS"]), args.evidence,
            os.environ["GITHUB_SHA"], os.environ["GITHUB_RUN_ID"], int(os.environ["GITHUB_RUN_ATTEMPT"]),
        )
        print(json.dumps(result, indent=2))
        if os.environ.get("GITHUB_STEP_SUMMARY"):
            with Path(os.environ["GITHUB_STEP_SUMMARY"]).open("a") as file:
                file.write("```json\n" + json.dumps(result, indent=2) + "\n```\n")
        return 0
    except (KeyError, OSError, TypeError, ValueError) as error:
        print(f"CI verification failed: {error}", file=sys.stderr)
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
