"""Evidence must reject plausible-looking but incomplete/altered measurements."""
import copy
import importlib.util
import json
import hashlib
from pathlib import Path
import tempfile
import unittest
import zipfile

SCRIPT = Path(__file__).with_name('check_phase2_indexes.py')


class CaptureContract(unittest.TestCase):
    def checker(self):
        self.assertTrue(SCRIPT.is_file(), 'derived-index evidence validator is missing')
        spec = importlib.util.spec_from_file_location('phase2_indexes', SCRIPT)
        module = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(module)
        return module

    def valid(self):
        checker = self.checker()
        seed, records, entities, asset_bytes, digest = checker.FIXTURES['standard']
        expected = {q: {'count': 6800 if q == '' else 20 if q == '門番' else 6700, 'sha256': 'a' * 64, 'firstNames': ['x']} for q in set(checker.SEQUENCE + [''])}
        cohorts = []
        for enabled in (False, True):
            def row(label, **kwargs):
                return dict(label=label, status='ok', apiCompletion='fulfilled', **kwargs,
                            **({'probe': {'pendingTransactions': 0, 'droppedEvents': 0, 'counters': {}}} if enabled else {'milliseconds': 1}))
            actions = [row(f'query-{n}-{i}', expectation=dict(query=q, repetition=n, queryIndex=i), query=q, count=f"{expected[q]['count']}件", names=['x']) for n in range(30) for i, q in enumerate(checker.SEQUENCE)]
            actions += [row(f'navigation-{n}-{p}', expectation=dict(page=p, repetition=n), pager=f'{p+1} / 114 · 6800件') for n in range(30) for p in (110, 111)]
            operations = [row(label) for label in ['listProjectSummaries', 'loadEditor', 'historyPage'] + [f'participant-{n}' for n in range(30)] + ['rename-one']]
            observed = dict(status='ok', options=dict(enabled=enabled, suite='standard'), fixture=dict(seed=seed, counts=dict(totalRecords=records), assetBytes=asset_bytes, sha256=digest, wireJsonSha256=digest, jsonBytes=6258972, assets=[]), nativeAssets=[], expected=expected,
                            expectedParticipant=dict(count=15, sha256='b'*64), selection=dict(index=6699, total=6800), savedSource=dict(current='c'*64, revision='1'), postReadSource=dict(current='c'*64, revision='1'), renameInput='d'*64,
                            inputUnchanged=True, orderedResultsVerified=True, afterClose=dict(owners=0, entries=0, references=0, textCodeUnits=0), operations=operations, actions=actions, startup=row('startup'))
            cohorts.append(dict(enabled=enabled, status='ok', startedAt='2026-10-18T00:00:00Z', finishedAt='2026-10-18T00:01:00Z', observations=copy.deepcopy(observed)))
        return dict(version=1, suite='standard', repetitions=30, sequence=checker.SEQUENCE, scope=checker.SCOPE, literalSourceVerified=True, status='ok', errors=[], unexpectedRequests=[], recordedAt='2026-10-18T00:00:00Z', finishedAt='2026-10-18T00:02:00Z', cohorts=cohorts,
                    summary=dict(queries=[dict(count=30, minimum=1, median=1, p95=1, maximum=1) for _ in range(6)], navigation=dict(count=60, minimum=1, median=1, p95=1, maximum=1), participant=dict(count=30, minimum=1, median=1, p95=1, maximum=1)))

    def test_complete_off_and_separate_on(self):
        self.checker().verify_capture(self.valid())

    def test_missing_last_sample_and_recomputed_summary_still_fails(self):
        raw = self.valid()
        raw['cohorts'][0]['observations']['actions'].pop()
        raw['summary']['navigation']['count'] = 59
        with self.assertRaises(ValueError): self.checker().verify_capture(raw)

    def test_on_elapsed_is_never_latency(self):
        raw = self.valid()
        raw['cohorts'][1]['observations']['actions'][0]['milliseconds'] = 0.1
        with self.assertRaises(ValueError): self.checker().verify_capture(raw)

    def test_same_count_wrong_order_oracle_is_rejected(self):
        raw = self.valid()
        raw['cohorts'][1]['observations']['expected']['霧']['sha256'] = 'e'*64
        with self.assertRaises(ValueError): self.checker().verify_capture(raw)

    def test_unknown_completion_or_unsettled_probe_is_rejected(self):
        for key, value in [('apiCompletion', 'UNKNOWN'), ('probe', dict(pendingTransactions=1, droppedEvents=0, counters={}))]:
            raw = self.valid()
            raw['cohorts'][1]['observations']['actions'][0][key] = value
            with self.assertRaises(ValueError): self.checker().verify_capture(raw)

    def test_leaked_retention_and_changed_author_source_are_rejected(self):
        for key, value in [('afterClose', dict(owners=1, entries=0, references=1, textCodeUnits=0)), ('postReadSource', dict(current='e'*64, revision='1'))]:
            raw = self.valid()
            raw['cohorts'][0]['observations'][key] = value
            with self.assertRaises(ValueError): self.checker().verify_capture(raw)

    def test_wrong_fixture_and_false_percentile_are_rejected(self):
        raw = self.valid()
        raw['cohorts'][0]['observations']['fixture']['counts']['totalRecords'] -= 1
        with self.assertRaises(ValueError): self.checker().verify_capture(raw)
        raw = self.valid()
        raw['summary']['queries'][0]['p95'] = 0.5
        with self.assertRaises(ValueError): self.checker().verify_capture(raw)

    def test_changed_build_member_is_rejected_even_if_zip_digest_is_recomputed(self):
        checker = self.checker()
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            records = [dict(path='assets/app.js', bytes=8, sha256=hashlib.sha256(b'original').hexdigest())]
            archive = root / 'build.zip'
            with zipfile.ZipFile(archive, 'w') as z: z.writestr('assets/app.js', b'original')
            def descriptor():
                data = archive.read_bytes()
                return dict(path='build.zip', bytes=len(data), sha256=hashlib.sha256(data).hexdigest())
            checker.verify_archive(root, descriptor(), records)
            with zipfile.ZipFile(archive, 'w') as z: z.writestr('assets/app.js', b'tampered')
            with self.assertRaises(ValueError): checker.verify_archive(root, descriptor(), records)

    def test_archive_extra_member_or_path_escape_is_rejected(self):
        checker = self.checker()
        for name in ('extra.js', '../escape.js'):
            with tempfile.TemporaryDirectory() as directory:
                root = Path(directory)
                with zipfile.ZipFile(root / 'build.zip', 'w') as z: z.writestr(name, b'x')
                data = (root / 'build.zip').read_bytes()
                with self.assertRaises(ValueError): checker.verify_archive(root, dict(path='build.zip', bytes=len(data), sha256=hashlib.sha256(data).hexdigest()), [])

if __name__ == '__main__': unittest.main()
