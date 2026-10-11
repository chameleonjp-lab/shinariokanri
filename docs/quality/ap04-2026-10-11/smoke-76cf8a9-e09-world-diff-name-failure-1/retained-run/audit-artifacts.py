"""Read retained evidence only; never replay an API or reconstruct an input."""
import collections
import datetime
import hashlib
import json
import pathlib
import re
import sys
import zipfile


KINDS = {"hook-install", "frame-install", "page-install", "upload", "download-event", "download", "observation-error"}


def audit(out):
    failures, inventories, test_rows, trace_rows = [], [], [], []
    counts = collections.defaultdict(lambda: collections.Counter())

    def fail(message):
        failures.append(message)

    def read_json(path):
        return json.loads(path.read_text())

    def digest(data):
        return hashlib.sha256(data).hexdigest()

    result = {
        "checkedAt": datetime.datetime.now(datetime.timezone.utc).isoformat(),
        "attemptDirectory": str(out), "status": "incomplete",
        "originalAcceptanceStatus": "not_run", "originalWholeAcceptancePromotion": False,
        "observationOnly": True, "failures": failures, "rawArtifacts": inventories,
        "tests": test_rows, "traceComparisons": trace_rows,
    }
    try:
        preparation = read_json(pathlib.Path(__file__).resolve().parent / "preparation.json")
        matches = [item for item in preparation["attempts"] if item["stage"] == out.name]
        if len(matches) != 1:
            raise ValueError("Attempt directory does not identify one planned stage")
        planned = matches[0]
        source_root = pathlib.Path(preparation["sourceDirectory"]).resolve()
        expected_file = (source_root / planned["file"]).resolve()
        expected_engine = preparation["project"]
        result.update(stage=planned["stage"], acceptanceScope=planned["acceptanceScope"],
                      excludedConditions=planned["excludedConditions"])
        before = read_json(out / "binding-before.json")
        expected_observation = before["artifactObservation"]
        expected_hook = expected_observation["hook"]
        expected_options = before["environment"].get("NODE_OPTIONS")
        if not expected_options:
            fail("Before binding has no pinned NODE_OPTIONS")
        expected_scope = {"AP04_EVIDENCE_DIR": str(out / "actual-artifacts"),
                          "AP04_SMOKE_SPEC": pathlib.Path(planned["file"]).name}
        for field, wanted in expected_scope.items():
            if before["environment"].get(field) != wanted:
                fail(f"Before binding has incorrect artifact scope: {field}")
        if before.get("bindingFailures"):
            fail("Before binding records identity failures")
        hook_path = pathlib.Path(expected_hook["path"])
        hook_bytes = hook_path.read_bytes()
        if len(hook_bytes) != expected_hook["bytes"] or digest(hook_bytes) != expected_hook["sha256"]:
            fail("Retained hook source differs from before binding")
        after_path = out / "binding-after.json"
        if after_path.is_file():
            after = read_json(after_path)
            if after.get("artifactObservation") != expected_observation:
                fail("Hook/module identity changed in after binding")
            if after.get("environment", {}).get("NODE_OPTIONS") != expected_options:
                fail("NODE_OPTIONS changed in after binding")
            for field, wanted in expected_scope.items():
                if after.get("environment", {}).get(field) != wanted:
                    fail(f"After binding has incorrect artifact scope: {field}")
            if after.get("bindingFailures"):
                fail("After binding records identity failures")
        else:
            fail("After binding is missing")

        def identity(record, label):
            value = record.get("hookIdentity")
            if not isinstance(value, dict):
                fail(f"{label}: missing hook identity")
                return
            expected = {
                "source": expected_hook["path"], "bytes": expected_hook["bytes"],
                "sha256": expected_hook["sha256"], "nodeOptions": expected_options,
                "moduleVersions": expected_observation["moduleVersions"],
                "moduleSourcesSHA256": expected_observation["moduleSourcesSHA256"],
                "coreBundleSHA256": expected_observation["coreBundleSHA256"],
                "evidenceDirectory": str(out / "actual-artifacts"),
                "selectedSpec": pathlib.Path(planned["file"]).name,
            }
            for field, wanted in expected.items():
                if value.get(field) != wanted:
                    fail(f"{label}: hook identity mismatch in {field}")

        report = read_json(out / "report.json")
        report_tests = []

        def collect(suites):
            for suite in suites:
                for spec in suite.get("specs", []):
                    for test in spec.get("tests", []):
                        report_tests.append({
                            "file": spec.get("file") or suite.get("file"),
                            "title": spec.get("title"), "testId": spec.get("id"),
                            "engine": test.get("projectName"), "results": test.get("results", []),
                        })
                collect(suite.get("suites", []))

        collect(report.get("suites", []))
        if len(report_tests) != planned["expectedCount"]:
            fail("Report test count differs from planned file selection")
        for index, test in enumerate(report_tests):
            test["auditId"] = index
            if (pathlib.Path(test.get("file") or "").name != expected_file.name
                    or not isinstance(test["title"], str)
                    or not re.search(planned["grep"], test["title"])
                    or test["engine"] != expected_engine):
                fail(f"Report test {index} is outside the planned file/title/engine")
            for attempt in test["results"]:
                if attempt.get("retry", 0) != 0:
                    fail(f"Report test {index} includes a retry")

        def scope(record, label):
            raw_file = pathlib.Path(record.get("file") or "")
            actual_file = raw_file.resolve() if raw_file.is_absolute() else (source_root / raw_file).resolve()
            if actual_file != expected_file:
                fail(f"{label}: file is outside the selected spec")
            if record.get("engine") != expected_engine or record.get("retry") != 0:
                fail(f"{label}: engine/retry is outside the planned scope")
            if not isinstance(record.get("workerIndex"), int):
                fail(f"{label}: missing worker identity")
            candidates = [test for test in report_tests if test["title"] == record.get("title")
                          and test["engine"] == record.get("engine")
                          and pathlib.Path(test.get("file") or "").name == raw_file.name]
            by_id = [test for test in candidates if test.get("testId")
                     and test["testId"] == record.get("testId")]
            if len(by_id) == 1:
                return by_id[0]["auditId"]
            if len(candidates) == 1:
                return candidates[0]["auditId"]
            fail(f"{label}: test identity does not resolve uniquely in report")
            return None

        evidence_dir = out / "actual-artifacts"
        if not evidence_dir.is_dir():
            raise ValueError("Actual artifact directory is missing")
        parsed, records, declared_raw = {}, [], set()
        for metadata_path in sorted(evidence_dir.glob("*.json")):
            try:
                value = read_json(metadata_path)
            except (OSError, ValueError) as error:
                parsed[metadata_path] = error
                continue
            parsed[metadata_path] = value
            if isinstance(value, dict) and value.get("kind") in KINDS:
                records.append((metadata_path, value))
                if value["kind"] in {"upload", "download"} and isinstance(value.get("filename"), str):
                    declared_raw.add((evidence_dir / value["filename"]).resolve())
        # A raw JSON download is data, not metadata. Its declared filename is
        # learned from the genuine download record without parsing that payload.
        for metadata_path, value in parsed.items():
            if metadata_path.resolve() in declared_raw:
                continue
            if not isinstance(value, dict) or value.get("kind") not in KINDS:
                fail(f"Unrecognized observation metadata: {metadata_path.name}")
        records = [(path, value) for path, value in records if path.resolve() not in declared_raw]
        hooks = [item for item in records if item[1]["kind"] == "hook-install"]
        if not hooks:
            fail("No retained hook installation")
        for metadata_path, record in records:
            if record["kind"] == "observation-error":
                fail(f"Retained observation error: {metadata_path.name}")
            else:
                identity(record, metadata_path.name)
        log_path = out / "runner.log"
        if not log_path.is_file():
            fail("Runner log is missing for observation error audit")
        elif "[AP04_ARTIFACT_OBSERVATION_ERROR]" in log_path.read_text(errors="replace"):
            fail("Runner log contains an artifact observation error marker")

        by_kind = {kind: {} for kind in ("upload", "download-event", "download")}
        record_scope, paired_paths = {}, set()
        for metadata_path, record in records:
            kind = record["kind"]
            if kind not in by_kind:
                continue
            key = record.get("key")
            if not isinstance(key, str) or not key:
                fail(f"{metadata_path.name}: missing artifact key")
                continue
            if key in by_kind[kind]:
                fail(f"Duplicate {kind} key: {key}")
            by_kind[kind][key] = record
            test_id = scope(record, metadata_path.name)
            record_scope[id(record)] = test_id
            counts[test_id][kind] += 1
            if not isinstance(record.get("pageId"), str) or not record["pageId"]:
                fail(f"{key}: missing observed page ID")
            if kind == "download-event":
                continue
            if kind == "upload" and record.get("sourceKind") == "path":
                fail(f"{key}: retained path input requires a separate localPaths trace audit; this selection audits scenario Buffers")
            filename = record.get("filename")
            if not isinstance(filename, str) or not filename:
                fail(f"{key}: missing raw filename")
                continue
            raw_path = (evidence_dir / filename).resolve()
            if not raw_path.is_relative_to(evidence_dir.resolve()) or not raw_path.is_file():
                fail(f"{key}: raw bytes missing or outside the evidence directory")
                continue
            if raw_path in paired_paths:
                fail(f"Distinct raw records share one retained file: {filename}")
            paired_paths.add(raw_path)
            data = raw_path.read_bytes()
            sha256 = digest(data)
            if len(data) != record.get("bytes") or sha256 != record.get("sha256"):
                fail(f"{key}: raw SHA/byte count differs from metadata")
            source_field = "forwardSourceSHA256" if kind == "upload" else "sourceSHA256"
            if record.get(source_field) != sha256:
                fail(f"{key}: original source SHA differs from retained raw bytes")
            inventories.append({
                "kind": kind, "key": key, "path": str(raw_path), "filename": filename,
                "sourceName": record.get("sourceName"), "suggestedFilename": record.get("suggestedFilename"),
                "mimeType": record.get("mimeType"), "bytes": len(data), "sha256": sha256,
                "file": record.get("file"), "title": record.get("title"),
                "testId": record.get("testId"), "engine": record.get("engine"),
                "retry": record.get("retry"), "workerIndex": record.get("workerIndex"),
                "pageId": record.get("pageId"), "url": record.get("url"),
            })

        for key, event in by_kind["download-event"].items():
            captured = by_kind["download"].get(key)
            if captured is None:
                fail(f"Download event has no retained raw capture: {key}")
                continue
            for field in ("pageId", "url", "suggestedFilename", "file", "title", "testId",
                          "engine", "retry", "workerIndex", "hookIdentity"):
                if event.get(field) != captured.get(field):
                    fail(f"{key}: event/raw metadata mismatch in {field}")
        for key in by_kind["download"]:
            if key not in by_kind["download-event"]:
                fail(f"Raw download has no observed event: {key}")
        metadata_paths = {path.resolve() for path, _ in records}
        for path in evidence_dir.rglob("*"):
            if path.is_file() and path.resolve() not in paired_paths | metadata_paths:
                fail(f"Unpaired evidence file: {path.relative_to(evidence_dir)}")

        def trace_path(attachment):
            value = pathlib.Path(attachment.get("path") or "")
            candidates = [value] if value.is_absolute() else [source_root / value, out / value]
            return next((path.resolve() for path in candidates if path.is_file()
                         and path.resolve().is_relative_to(out)), None)

        for test in report_tests:
            test_id = test["auditId"]
            executed = [item for item in test["results"] if item.get("status") != "skipped"]
            expected_uploads, expected_downloads, traces = [], [], set()
            for attempt in executed:
                attachments = [item for item in attempt.get("attachments", []) if item.get("name") == "trace"]
                if not attachments:
                    fail(f"Executed test has no trace for independent artifact audit: {test['title']}")
                for attachment in attachments:
                    path = trace_path(attachment)
                    if path is None:
                        fail(f"Trace missing/outside attempt: {test['title']}")
                        continue
                    traces.add(path)
            for path in sorted(traces):
                try:
                    with zipfile.ZipFile(path) as archive:
                        for name in archive.namelist():
                            if not name.endswith(".trace"):
                                continue
                            for line in archive.read(name).splitlines():
                                if not line.strip():
                                    continue
                                event = json.loads(line)
                                params = event.get("params", {})
                                if event.get("type") == "before" and event.get("method") == "setInputFiles":
                                    for payload in params.get("payloads", []):
                                        if (isinstance(payload, dict) and isinstance(payload.get("name"), str)
                                                and payload["name"].endswith(".scenario")
                                                and payload.get("buffer") == "<Buffer>"):
                                            expected_uploads.append((payload["name"], payload.get("mimeType")))
                                if (event.get("type") == "event" and event.get("class") == "BrowserContext"
                                        and event.get("method") == "download"):
                                    expected_downloads.append((params.get("pageId"), params.get("url"),
                                                               params.get("suggestedFilename")))
                except (OSError, ValueError, zipfile.BadZipFile) as error:
                    fail(f"Cannot read independent trace {path.name}: {error}")
            observed_uploads = [(value.get("sourceName"), value.get("mimeType"))
                                for value in by_kind["upload"].values()
                                if record_scope.get(id(value)) == test_id]
            observed_downloads = [(value.get("pageId"), value.get("url"), value.get("suggestedFilename"))
                                  for value in by_kind["download-event"].values()
                                  if record_scope.get(id(value)) == test_id]
            uploads_match = collections.Counter(expected_uploads) == collections.Counter(observed_uploads)
            downloads_match = collections.Counter(expected_downloads) == collections.Counter(observed_downloads)
            if not uploads_match:
                fail(f"Trace/hook scenario Buffer upload multiset differs: {test['title']}")
            if not downloads_match:
                fail(f"Trace/hook download event multiset differs: {test['title']}")
            trace_rows.append({"file": test["file"], "title": test["title"], "testId": test["testId"],
                               "engine": test["engine"], "traces": [str(path) for path in sorted(traces)],
                               "scenarioUploads": {"trace": expected_uploads, "hook": observed_uploads, "match": uploads_match},
                               "downloadEvents": {"trace": expected_downloads, "hook": observed_downloads, "match": downloads_match}})
            test_rows.append({"file": test["file"], "title": test["title"], "testId": test["testId"],
                              "engine": test["engine"], "executedResults": len(executed),
                              "counts": dict(counts[test_id]), "originalAcceptanceStatus": "not_run"})
        result["hookInstallCount"] = len(hooks)
        result["counts"] = {kind: len(values) for kind, values in by_kind.items()}
        result["status"] = "complete" if not failures else "incomplete"
    except Exception as error:
        fail(f"Artifact audit could not complete: {type(error).__name__}: {error}")
    finally:
        (out / "artifact-audit.json").write_text(json.dumps(result, ensure_ascii=False, indent=2) + "\n")
    return result["status"] == "complete"


if __name__ == "__main__":
    attempt_directory = pathlib.Path(sys.argv[1]).resolve()
    raise SystemExit(0 if audit(attempt_directory) else 1)
