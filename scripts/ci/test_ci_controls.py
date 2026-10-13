"""Exercise omissions, stale evidence, retries and real Git rename boundaries."""
import copy
import json
from pathlib import Path
import subprocess
import tempfile
import unittest

from ci_controls import ENGINES, changed_paths, select_scope, validate_results


class ScopeTests(unittest.TestCase):
    def test_explanation_only_pr_avoids_product_checks(self):
        self.assertEqual(select_scope("pull_request", ["README.md", "docs/quality/CI_EXECUTION.md"]), (False, "documentation-only"))

    def test_product_inputs_and_unclassified_documents_run_everything(self):
        for path in (
            "src/storage/archive.ts", "tests/fixtures/input.scenario", "package-lock.json",
            "docs/data/acceptance_cases.json", "docs/review-2026-10-11/original_acceptance_audit.json",
            "docs/spec/REQUIREMENTS.md", "docs/quality/proof.json", "docs/quality/input.scenario",
            "scripts/check_docs.py", ".github/workflows/ci.yml", "unclassified.md",
        ):
            with self.subTest(path=path):
                self.assertTrue(select_scope("pull_request", ["README.md", path])[0])

    def test_missing_diff_and_non_pr_events_never_skip_product_checks(self):
        for event, paths in (("pull_request", None), ("pull_request", []), ("push", ["README.md"]), ("workflow_dispatch", ["README.md"]), ("", None)):
            self.assertTrue(select_scope(event, paths)[0])

    def test_ambiguous_or_control_character_paths_run_everything(self):
        for path in ("/README.md", "../README.md", "docs/quality/../spec/x.md", "docs\\quality\\x.md", "docs/quality/x\ny.md", ""):
            self.assertTrue(select_scope("pull_request", [path])[0])

    def test_moving_product_source_to_documentation_does_not_hide_deletion(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            def git(*args):
                return subprocess.check_output(["git", *args], cwd=root, text=True).strip()
            git("init", "-q")
            git("config", "user.name", "CI scope test")
            git("config", "user.email", "ci-scope@example.invalid")
            (root / "src").mkdir()
            (root / "src/logic.ts").write_text("production source\n")
            git("add", ".")
            git("commit", "-qm", "base")
            base = git("rev-parse", "HEAD")
            (root / "docs/quality").mkdir(parents=True)
            git("mv", "src/logic.ts", "docs/quality/explanation.md")
            git("commit", "-qm", "rename")
            head = git("rev-parse", "HEAD")
            paths = changed_paths({"pull_request": {"base": {"sha": base}, "head": {"sha": head}}}, root)
            self.assertEqual(set(paths), {"src/logic.ts", "docs/quality/explanation.md"})
            self.assertTrue(select_scope("pull_request", paths)[0])

    def test_unavailable_or_invalid_commits_fall_back_to_full_checks(self):
        self.assertIsNone(changed_paths({}, Path.cwd()))
        self.assertIsNone(changed_paths({"pull_request": {"base": {"sha": "--output=bad"}, "head": {"sha": "a" * 40}}}, Path.cwd()))
        with tempfile.TemporaryDirectory() as directory:
            self.assertIsNone(changed_paths({"pull_request": {"base": {"sha": "a" * 40}, "head": {"sha": "b" * 40}}}, Path(directory)))


class EvidenceTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name)
        self.commit, self.run = "a" * 40, "123"
        self.needs = {name: {"result": "success"} for name in ("scope", "documents", "unit", "browser")}
        self.needs["scope"]["outputs"] = {"run_product": "true", "reason": "product-test-input-or-unknown-path"}
        for engine in ENGINES:
            self.make_evidence(engine, 1)

    def make_evidence(self, engine, attempt):
        folder = self.root / f"browser-evidence-{engine}-attempt{attempt}" / "ci-browser-evidence"
        folder.mkdir(parents=True)
        source = {"engine": engine, "commit": self.commit, "tree": "b" * 40, "run_id": self.run, "attempt": attempt}
        report = {
            "suites": [{"suites": [{"specs": [{"id": "first", "tests": [{"projectName": engine}]}, {"id": "second", "tests": [{"projectName": engine}]}]}]}],
            "stats": {"expected": 2, "unexpected": 0, "flaky": 0, "skipped": 0},
        }
        for name, value in (("source", source), ("inventory", report), ("results", report)):
            (folder / f"{name}.json").write_text(json.dumps(value))
        return folder

    def change(self, engine, name, operation, attempt=1):
        path = self.root / f"browser-evidence-{engine}-attempt{attempt}" / "ci-browser-evidence" / f"{name}.json"
        value = json.loads(path.read_text())
        operation(value)
        path.write_text(json.dumps(value))

    def verify(self, needs=None, attempt=1):
        return validate_results(needs or self.needs, self.root, self.commit, self.run, attempt)

    def test_complete_three_browser_evidence_passes(self):
        self.assertEqual([row["tests"] for row in self.verify()["browsers"]], [2, 2, 2])

    def test_any_required_failure_cancellation_or_skip_fails(self):
        for name in self.needs:
            for state in ("failure", "cancelled", "skipped"):
                with self.subTest(name=name, state=state):
                    needs = copy.deepcopy(self.needs)
                    needs[name]["result"] = state
                    with self.assertRaises(ValueError):
                        self.verify(needs)

    def test_documentation_only_is_explicit_and_does_not_claim_product_pass(self):
        needs = copy.deepcopy(self.needs)
        needs["scope"]["outputs"] = {"run_product": "false", "reason": "documentation-only"}
        for name in ("unit", "browser"):
            needs[name]["result"] = "skipped"
        self.assertEqual(self.verify(needs)["product_checks"], "not_run_documentation_only")
        needs["scope"]["outputs"]["reason"] = "unknown-or-empty-diff"
        with self.assertRaises(ValueError):
            self.verify(needs)

    def test_missing_scope_output_and_unexpected_skip_fail(self):
        for output in ({}, {"run_product": "maybe"}, {"run_product": "true"}):
            needs = copy.deepcopy(self.needs)
            needs["scope"]["outputs"] = output
            if output.get("run_product") == "true":
                needs["browser"]["result"] = "skipped"
            with self.assertRaises(ValueError):
                self.verify(needs)

    def test_mismatched_source_run_and_engine_fail(self):
        for key, value in (("commit", "c" * 40), ("run_id", "456"), ("engine", "chromium"), ("attempt", 2)):
            original = json.loads((self.root / "browser-evidence-webkit-attempt1/ci-browser-evidence/source.json").read_text())
            self.change("webkit", "source", lambda row: row.update({key: value}))
            with self.assertRaises(ValueError):
                self.verify()
            self.change("webkit", "source", lambda row: row.update(original))

    def test_partial_inventory_and_duplicate_or_other_browser_tests_fail(self):
        original = json.loads((self.root / "browser-evidence-firefox-attempt1/ci-browser-evidence/results.json").read_text())
        for operation in (
            lambda row: row["suites"][0]["suites"][0]["specs"].pop(),
            lambda row: row["suites"][0]["suites"][0]["specs"].append(row["suites"][0]["suites"][0]["specs"][0]),
            lambda row: row["suites"][0]["suites"][0]["specs"][0]["tests"][0].update(projectName="chromium"),
        ):
            self.change("firefox", "results", operation)
            with self.assertRaises(ValueError):
                self.verify()
            self.change("firefox", "results", lambda row: row.update(copy.deepcopy(original)))

    def test_failed_flaky_skipped_or_wrong_count_fail(self):
        for key, value in (("unexpected", 1), ("flaky", 1), ("skipped", 1), ("expected", 1)):
            self.change("chromium", "results", lambda row: row["stats"].update({key: value}))
            with self.assertRaises(ValueError):
                self.verify()
            self.change("chromium", "results", lambda row: row["stats"].update({"expected": 2, "unexpected": 0, "flaky": 0, "skipped": 0}))

    def test_missing_report_or_source_tree_drift_fail(self):
        self.change("webkit", "source", lambda row: row.update(tree="c" * 40))
        with self.assertRaises(ValueError):
            self.verify()
        self.change("webkit", "source", lambda row: row.update(tree="b" * 40))
        (self.root / "browser-evidence-webkit-attempt1/ci-browser-evidence/results.json").unlink()
        with self.assertRaises(OSError):
            self.verify()

    def test_retry_uses_latest_engine_attempt_and_retains_earlier_evidence(self):
        self.change("webkit", "results", lambda row: row["stats"].update(unexpected=1, expected=1))
        self.make_evidence("webkit", 2)
        result = self.verify(attempt=2)
        self.assertEqual([row["attempt"] for row in result["browsers"]], [1, 1, 2])
        self.assertTrue((self.root / "browser-evidence-webkit-attempt1/ci-browser-evidence/results.json").exists())
        self.change("webkit", "results", lambda row: row["stats"].update(skipped=1), attempt=2)
        with self.assertRaises(ValueError):
            self.verify(attempt=2)


if __name__ == "__main__":
    unittest.main()
