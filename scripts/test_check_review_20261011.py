"""Guard against scope/evidence drift in the fixed audit, not product tests."""
from pathlib import Path
import json
import shutil
import tempfile
import unittest

from check_review_20261011 import FOLDER, validate


class ReviewRegistryTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory(prefix="scenario-review-check-")
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name)
        source = Path(__file__).resolve().parents[1]
        shutil.copytree(source / FOLDER, self.root / FOLDER)
        # Semantic checks run in shallow CI without fetching historical evidence.
        # The explicit --verify-git-blobs audit is separate from these tests.
        (self.root / "docs/data").mkdir(parents=True)
        for name in ("requirements.json", "completion_acceptance.json", "completion_tasks.json", "work_packages.json"):
            shutil.copy2(source / "docs/data" / name, self.root / "docs/data" / name)

    def change(self, name, operation):
        path = self.root / FOLDER / name
        value = json.loads(path.read_text())
        operation(value)
        path.write_text(json.dumps(value, ensure_ascii=False, indent=2) + "\n")

    def detects(self, fragment):
        self.assertTrue(any(fragment in error for error in validate(self.root)), fragment)

    def test_intact_fixed_review_passes(self):
        self.assertEqual(validate(self.root), [])

    def test_original_clause_cannot_be_relaxed(self):
        self.change("original_acceptance_audit.json", lambda rows: rows[0]["original_case"].update(negative_or_edge="省略"))
        self.detects("original four-clause drift")

    def test_removed_original_requirement_fails(self):
        self.change("requirements_audit.json", lambda rows: rows.pop())
        self.detects("original requirement coverage")

    def test_unobserved_supplemental_pass_fails(self):
        self.change("supplemental_acceptance.json", lambda rows: rows[0].update(result="passed"))
        self.detects("unobserved supplemental pass")

    def test_missing_extension_case_fails(self):
        self.change("supplemental_acceptance.json", lambda rows: rows.pop())
        self.detects("supplemental case coverage")

    def test_dependency_cycle_fails(self):
        self.change("implementation_plan.json", lambda rows: rows[0]["depends_on"].append("AP10"))
        self.detects("plan dependency cycle")

    def test_invented_existing_source_fails(self):
        self.change("extension_requirements.json", lambda rows: rows[0]["paths"].append("src/does-not-exist.ts"))
        self.detects("invented existing path")

    def test_evidence_count_overclaim_fails(self):
        self.change("review_manifest.json", lambda value: value["reported_c29_counts"].update(local_whole=116))
        self.detects("reported C29 case count drift")

    def test_baseline_code_change_allowance_fails(self):
        self.change("review_manifest.json", lambda value: value["allowed_document_updates"].append("src/App.tsx"))
        self.detects("unexpected allowance")


if __name__ == "__main__":
    unittest.main()
