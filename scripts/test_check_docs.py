"""Negative cases for the documentation checker, not product acceptance tests."""
from pathlib import Path
import json
import shutil
import tempfile
import unittest

from check_docs import validate


class DocumentCheckerTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory(prefix="scenario-doc-check-")
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name) / "repo"
        source = Path(__file__).resolve().parents[1]
        shutil.copytree(source, self.root, ignore=shutil.ignore_patterns(".git", "__pycache__", "node_modules", "dist", "test-results", "playwright-report"))

    def change(self, name, mutation):
        path = self.root / name
        value = json.loads(path.read_text())
        mutation(value)
        path.write_text(json.dumps(value, ensure_ascii=False, indent=2) + "\n")

    def detects(self, fragment):
        self.assertTrue(any(fragment in e for e in validate(self.root)), fragment)

    def test_intact_documents_pass(self):
        self.assertEqual(validate(self.root), [])

    def test_generated_dependency_documents_are_not_repository_sources(self):
        dependency = self.root / "node_modules" / "example"
        dependency.mkdir(parents=True)
        (dependency / "README.md").write_text("[upstream](missing.md)\n")
        self.assertEqual(validate(self.root), [])

    def test_omitted_proposal_fails(self):
        self.change("docs/data/feature_catalog.json", lambda rows: rows.pop())
        self.detects("research scope")

    def test_missing_acceptance_fails(self):
        self.change("docs/data/acceptance_cases.json", lambda rows: rows.pop(0))
        self.detects("missing acceptance case")

    def test_dependency_cycle_fails(self):
        self.change("docs/data/work_packages.json", lambda rows: rows[0]["depends_on"].append("WP24"))
        self.detects("dependency cycle")

    def test_duplicate_id_fails(self):
        self.change("docs/data/requirements.json", lambda rows: rows.append(rows[0].copy()))
        self.detects("duplicate registry ID")

    def test_broken_link_fails(self):
        path = self.root / "README.md"
        path.write_text(path.read_text() + "\n[broken](docs/missing.md)\n")
        self.detects("broken local link")

    def test_changed_pdf_fails(self):
        path = self.root / "docs/research/Game_Scenario_Manager_Research_2026-10-05.pdf"
        path.write_bytes(path.read_bytes() + b"changed")
        self.detects("provenance hash mismatch")

    def test_claimed_app_pass_fails(self):
        self.change("docs/data/acceptance_cases.json", lambda rows: rows[0].update(result="passed"))
        self.detects("application case must remain not_run")

    def test_document_registry_drift_fails(self):
        path = self.root / "docs/spec/REQUIREMENTS.md"
        path.write_text(path.read_text().replace("### REQ-F60", "### OMITTED-F60"))
        self.detects("spec section coverage")

    def test_broken_example_route_fails(self):
        self.change("docs/examples/branching-clue.example.json", lambda value: value["expectedRoutes"][0]["edgeIds"].reverse())
        self.detects("example disconnected route")


if __name__ == "__main__":
    unittest.main()
