"""Retain the actual recovery files, bound to their browser observations."""
from __future__ import annotations

import argparse
import base64
import hashlib
import io
import json
from pathlib import Path
import zipfile


def test_nodes(suite):
    for spec in suite.get("specs", []):
        yield from spec.get("tests", [])
    for child in suite.get("suites", []):
        yield from test_nodes(child)


def attachment_bytes(attachment):
    # These four small files are attached with TestInfo.attach(body), so the
    # JSON report contains their exact bytes without an ephemeral local path.
    if "body" not in attachment:
        raise ValueError(f"Inline original is missing: {attachment['name']}")
    return base64.b64decode(attachment["body"], validate=True)


def archive_files(report, engine):
    tests = [test for suite in report["suites"] for test in test_nodes(suite)
             if test["projectName"] == engine]
    retained = []
    for observation_name in ("AT-N14-observation.json", "AT-E12-local-observed.json"):
        matches = [(test, result) for test in tests for result in test.get("results", [])
                   if any(item["name"] == observation_name for item in result.get("attachments", []))]
        if len(matches) != 1:
            raise ValueError(f"Expected one observed case: {observation_name}")
        test, result = matches[0]
        if len(test["results"]) != 1 or result["status"] != "passed":
            raise ValueError(f"Recovery case did not pass once: {observation_name}")
        attachments = {item["name"]: item for item in result["attachments"]}
        if len(attachments) != len(result["attachments"]):
            raise ValueError(f"Duplicate attachment names: {observation_name}")
        observation = json.loads(attachment_bytes(attachments[observation_name]))
        if observation_name.startswith("AT-N14"):
            expected = [(f"AT-N14-{phase}-complete.scenario", observation[f"{phase}FileSha256"], None)
                        for phase in ("resumed", "cold")]
        else:
            expected = []
            for mode in ("new", "clone"):
                proof = observation["recovery"][mode]
                name = f"AT-E12-{mode}-cold-complete.scenario"
                if proof["fileName"] != name:
                    raise ValueError(f"Recovery phase filename mismatch: {name}")
                expected.append((name, proof["fileSHA256"], proof["fileBytes"]))
        for name, expected_hash, expected_size in expected:
            if name not in attachments:
                raise ValueError(f"Original recovery file is missing: {name}")
            raw = attachment_bytes(attachments[name])
            if hashlib.sha256(raw).hexdigest() != expected_hash or (expected_size is not None and len(raw) != expected_size):
                raise ValueError(f"Original recovery file does not match observation: {name}")
            with zipfile.ZipFile(io.BytesIO(raw)) as archive:
                if len(archive.namelist()) != len(set(archive.namelist())):
                    raise ValueError(f"Duplicate ZIP paths: {name}")
                manifest = json.loads(archive.read("manifest.json"))
                for member in manifest["files"]:
                    payload = archive.read(member["path"])
                    if len(payload) != member["byteSize"] or hashlib.sha256(payload).hexdigest() != member["sha256"]:
                        raise ValueError(f"Archive member mismatch: {name}/{member['path']}")
            retained.append((name, raw))
    return retained


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--results", type=Path, required=True)
    parser.add_argument("--source", type=Path, required=True)
    parser.add_argument("--engine", choices=("chromium", "firefox", "webkit"), required=True)
    parser.add_argument("--output", type=Path, required=True)
    args = parser.parse_args()
    source = json.loads(args.source.read_text())
    if source["engine"] != args.engine:
        raise ValueError("Browser source does not match requested engine")
    files = archive_files(json.loads(args.results.read_text()), args.engine)
    # Validate everything before writing; an existing attempt is never replaced.
    args.output.mkdir(parents=True, exist_ok=False)
    manifest = {"source": source, "scope": "Four original recovery files and archive member bytes/hashes; not whole acceptance", "files": []}
    for name, raw in files:
        (args.output / name).write_bytes(raw)
        manifest["files"].append({"path": name, "bytes": len(raw), "sha256": hashlib.sha256(raw).hexdigest()})
    (args.output / "manifest.json").write_text(json.dumps(manifest, indent=2) + "\n")
    print(f"RECOVERY ORIGINALS VERIFIED: {args.engine}, {len(files)} files, {sum(len(raw) for _, raw in files)} bytes")


if __name__ == "__main__":
    main()
