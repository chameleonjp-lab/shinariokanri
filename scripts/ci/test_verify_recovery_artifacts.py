"""A passing test title or digest without the original bytes is insufficient."""
import base64
import copy
import hashlib
import io
import json
import unittest
import zipfile

from verify_recovery_artifacts import archive_files


def attached(name, raw):
    return {"name": name, "body": base64.b64encode(raw).decode()}


class RecoveryOriginalTests(unittest.TestCase):
    def setUp(self):
        self.tests = []
        self.files = []
        for case, phases in (("AT-N14", ("resumed", "cold")), ("AT-E12", ("new", "clone"))):
            observation = {"recovery": {}} if case == "AT-E12" else {}
            attachments = []
            for phase in phases:
                payload = f"{case} {phase}".encode()
                member = {"path": "project.json", "byteSize": len(payload), "sha256": hashlib.sha256(payload).hexdigest()}
                output = io.BytesIO()
                with zipfile.ZipFile(output, "w") as archive:
                    archive.writestr("manifest.json", json.dumps({"files": [member]}))
                    archive.writestr("project.json", payload)
                raw = output.getvalue()
                name = f"{case}-{phase}{'-cold' if case == 'AT-E12' else ''}-complete.scenario"
                attachments.append(attached(name, raw))
                self.files.append((name, raw))
                if case == "AT-N14":
                    observation[f"{phase}FileSha256"] = hashlib.sha256(raw).hexdigest()
                else:
                    observation["recovery"][phase] = {"fileName": name, "fileBytes": len(raw), "fileSHA256": hashlib.sha256(raw).hexdigest()}
            observation_name = f"{case}-{'observation' if case == 'AT-N14' else 'local-observed'}.json"
            attachments.append(attached(observation_name, json.dumps(observation).encode()))
            self.tests.append({"projectName": "webkit", "results": [{"status": "passed", "attachments": attachments}]})
        self.report = {"suites": [{"suites": [{"specs": [{"tests": self.tests}]}]}]}

    def test_retains_all_four_exact_originals(self):
        self.assertEqual(archive_files(self.report, "webkit"), self.files)

    def test_missing_original_cannot_be_replaced_by_its_digest(self):
        self.tests[0]["results"][0]["attachments"].pop(0)
        with self.assertRaisesRegex(ValueError, "Original recovery file is missing"):
            archive_files(self.report, "webkit")

    def test_changed_bytes_or_inaccessible_path_are_rejected(self):
        for replacement in ({"body": base64.b64encode(b"changed").decode()}, {"path": "/gone/original.scenario"}):
            report = copy.deepcopy(self.report)
            item = report["suites"][0]["suites"][0]["specs"][0]["tests"][0]["results"][0]["attachments"][0]
            item.pop("body")
            item.update(replacement)
            with self.assertRaises(ValueError):
                archive_files(report, "webkit")

    def test_duplicates_failures_retries_and_other_engine_are_rejected(self):
        for kind in ("duplicate", "failed", "retry", "engine"):
            report = copy.deepcopy(self.report)
            test = report["suites"][0]["suites"][0]["specs"][0]["tests"][0]
            if kind == "duplicate":
                test["results"][0]["attachments"].append(test["results"][0]["attachments"][0])
            elif kind == "failed":
                test["results"][0]["status"] = "failed"
            elif kind == "retry":
                test["results"].append(copy.deepcopy(test["results"][0]))
            else:
                test["projectName"] = "firefox"
            with self.subTest(kind=kind), self.assertRaises(ValueError):
                archive_files(report, "webkit")

    def test_declared_size_is_checked(self):
        attachments = self.tests[1]["results"][0]["attachments"]
        observation = json.loads(base64.b64decode(attachments[-1]["body"]))
        observation["recovery"]["new"]["fileBytes"] += 1
        attachments[-1] = attached(attachments[-1]["name"], json.dumps(observation).encode())
        with self.assertRaisesRegex(ValueError, "does not match observation"):
            archive_files(self.report, "webkit")

    def test_rehashed_outer_zip_does_not_hide_a_changed_member(self):
        attachments = self.tests[1]["results"][0]["attachments"]
        original = base64.b64decode(attachments[0]["body"])
        output = io.BytesIO()
        with zipfile.ZipFile(io.BytesIO(original)) as source, zipfile.ZipFile(output, "w") as target:
            target.writestr("manifest.json", source.read("manifest.json"))
            target.writestr("project.json", b"changed member")
        raw = output.getvalue()
        attachments[0] = attached(attachments[0]["name"], raw)
        observation = json.loads(base64.b64decode(attachments[-1]["body"]))
        observation["recovery"]["new"].update(fileSHA256=hashlib.sha256(raw).hexdigest(), fileBytes=len(raw))
        attachments[-1] = attached(attachments[-1]["name"], json.dumps(observation).encode())
        with self.assertRaisesRegex(ValueError, "Archive member mismatch"):
            archive_files(self.report, "webkit")


if __name__ == "__main__":
    unittest.main()
