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
        expected = {q: {'count': 6800 if q == '' else 20 if q == '門番' else 6700, 'sha256': checker.expected_hash('standard',q), 'firstNames': ['門番1','門番6','門番11'] if q=='門番' else ['アオ0','門番1','記録係2']} for q in set(checker.SEQUENCE + [''])}
        cohorts = []
        for enabled in (False, True):
            def row(label, **kwargs):
                return dict(label=label, status='ok', apiCompletion='fulfilled', **kwargs,
                            **({'probe': {'pendingTransactions': 0, 'droppedEvents': 0, 'counters': {}}} if enabled else {'milliseconds': 1}))
            actions = [row(f'query-{n}-{i}', expectation=dict(query=q, repetition=n, queryIndex=i), query=q, count=f"{expected[q]['count']}件", names=expected[q]['firstNames']) for n in range(30) for i, q in enumerate(checker.SEQUENCE)]
            actions += [row(f'navigation-{n}-{p}', expectation=dict(page=p, repetition=n), pager=f'{p+1} / 114 · 6800件') for n in range(30) for p in (110, 111)]
            operations = [row(label) for label in ['listProjectSummaries', 'loadEditor', 'historyPage'] + [f'participant-{n}' for n in range(30)] + ['rename-one']]
            observed = dict(status='ok', options=dict(enabled=enabled, suite='standard'), fixture=dict(seed=seed, counts=dict(totalRecords=records), assetBytes=asset_bytes, sha256=digest, wireJsonSha256=digest, jsonBytes=6258972, assets=[]), nativeAssets=[], expected=expected,
                            expectedParticipant=dict(count=15, sha256=checker.EXPECTED_IDS['standard']['participant']), selection=dict(index=6699, total=6800), savedSource=dict(current='c'*64, revision='1'), postReadSource=dict(current='c'*64, revision='1'), renameInput='d'*64,
                            inputUnchanged=True, orderedResultsVerified=True, afterClose=dict(owners=0, entries=0, references=0, textCodeUnits=0), operations=operations, actions=actions, startup=row('startup'))
            cohorts.append(dict(enabled=enabled, status='ok', startedAt='2026-10-18T00:01:00Z' if enabled else '2026-10-18T00:00:00Z', finishedAt='2026-10-18T00:02:00Z' if enabled else '2026-10-18T00:01:00Z', observations=copy.deepcopy(observed)))
        return dict(version=1, suite='standard', repetitions=30, sequence=checker.SEQUENCE, scope=checker.SCOPE, literalSourceVerified=True, status='ok', errors=[], unexpectedRequests=[], recordedAt='2026-10-18T00:00:00Z', finishedAt='2026-10-18T00:02:00Z', cohorts=cohorts,
                    summary=dict(queries=[dict(count=30, minimum=1, median=1, p95=1, maximum=1) for _ in range(6)], navigation=dict(count=60, minimum=1, median=1, p95=1, maximum=1), participant=dict(count=30, minimum=1, median=1, p95=1, maximum=1)))

    def test_complete_off_and_separate_on(self):
        self.checker().verify_capture(self.valid())

    def test_packaged_literal_sources_samples_and_required_artifacts(self):
        # The existing documents job discovers this test; saved evidence is
        # checked there without binding future product edits to old bytes.
        self.assertEqual(len(self.checker().validate(SCRIPT.parents[1])),14)

    def test_missing_last_sample_and_recomputed_summary_still_fails(self):
        raw = self.valid()
        raw['cohorts'][0]['observations']['actions'].pop()
        raw['summary']['navigation']['count'] = 59
        with self.assertRaises(ValueError): self.checker().verify_capture(raw)

    def test_on_elapsed_is_never_latency(self):
        raw = self.valid()
        raw['cohorts'][1]['observations']['actions'][0]['milliseconds'] = 0.1
        with self.assertRaises(ValueError): self.checker().verify_capture(raw)

    def test_overlapping_off_on_sessions_are_rejected(self):
        raw = self.valid()
        raw['cohorts'][1]['startedAt'] = raw['cohorts'][0]['startedAt']
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

    def test_empty_matrix_manifest_cannot_delete_every_required_comparison(self):
        checker = self.checker()
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            folder = root / checker.FOLDER
            folder.mkdir(parents=True)
            (folder / 'evidence-manifest.json').write_text(json.dumps(dict(releaseState='RELEASE BLOCKED', originalAcceptancePerformed=False, files=[], runs=[], labels=[], sources={})))
            with self.assertRaises(ValueError): checker.validate(root)

    def test_missing_main_and_wrong_literal_sources_are_rejected_before_artifacts(self):
        checker = self.checker()
        original = dict(releaseState='RELEASE BLOCKED', originalAcceptancePerformed=False, files=[], runs=[], labels=sorted(checker.LABELS), sources=checker.FIXED_SOURCES)
        for field, value in [('labels', sorted(checker.LABELS-{'main'})), ('sources', dict(checker.FIXED_SOURCES, main='e'*40))]:
            with tempfile.TemporaryDirectory() as directory:
                root = Path(directory); folder = root / checker.FOLDER; folder.mkdir(parents=True)
                manifest = dict(original); manifest[field] = value
                (folder/'evidence-manifest.json').write_text(json.dumps(manifest))
                with self.assertRaisesRegex(ValueError, 'labels|source'): checker.validate(root)

    def order_proof(self):
        checker = self.checker(); ui = self.valid(); ui.update(sourceCommit='1'*40,productTree='2'*40)
        observed = ui['cohorts'][0]['observations']; phases=[]
        for label,queries in [('original',['霧','霧の','門番','記録','']),('renamed-alias',['計測変更後の人物','追加した独立別名','記録名0','霧']),('archived',['計測変更後の人物','追加した独立別名','霧'])]:
            rows=[]
            for query in queries:
                if label=='original': value={k:observed['expected'][query][k] for k in ('count','sha256')}
                elif label=='renamed-alias': value=dict(count=6700,sha256=checker.EXPECTED_IDS['standard']['text']) if query=='霧' else dict(count=0,sha256=checker.EMPTY_IDS) if query=='記録名0' else dict(count=1,sha256=checker.EDIT_IDS['standard']['person'])
                else: value=dict(count=6699,sha256=checker.EDIT_IDS['standard']['archived']) if query=='霧' else dict(count=0,sha256=checker.EMPTY_IDS)
                provider=dict(ids=value,pages=value,pageSize=60,allPageStates='loaded',hiddenSelection=None)
                rows.append(copy.deepcopy(dict(text=query,expected=value,full=value,provider=provider)))
            phases.append(dict(label=label,queries=rows))
        return dict(version=1,scope='Independent functional full-order oracle with fake IndexedDB; not browser latency or native persistence proof',suite='standard',sourceCommit=ui['sourceCommit'],productTree=ui['productTree'],status='ok',errors=[],environment=dict(node='v24.19.0',execArgv=['--experimental-transform-types'],backend='fake-indexeddb',timingsCaptured=False),fixture=observed['fixture'],normalizedCurrentSHA256=observed['savedSource']['current'],textCodeUnits=None,providerSupported=True,phases=phases,afterClose=dict(owners=0,entries=0,references=0,textCodeUnits=0)),ui

    def test_complete_full_filter_provider_ids_and_pages_proof(self):
        proof,ui=self.order_proof(); self.checker().verify_order_proof(proof,ui)

    def test_same_count_substitution_in_every_saved_edit_result_is_rejected(self):
        proof,ui=self.order_proof(); row=proof['phases'][1]['queries'][0]
        for target in (row['expected'],row['full'],row['provider']['ids'],row['provider']['pages']): target['sha256']='e'*64
        with self.assertRaises(ValueError): self.checker().verify_order_proof(proof,ui)

    def test_provider_page_order_or_native_input_mismatch_is_rejected(self):
        proof,ui=self.order_proof(); proof['phases'][0]['queries'][0]['provider']['pages']=dict(count=6700,sha256='e'*64)
        with self.assertRaises(ValueError): self.checker().verify_order_proof(proof,ui)
        proof,ui=self.order_proof(); proof['normalizedCurrentSHA256']='e'*64
        with self.assertRaises(ValueError): self.checker().verify_order_proof(proof,ui)

    def test_functional_backend_and_no_latency_scope_cannot_be_promoted(self):
        for key,value in [('backend','native IndexedDB'),('timingsCaptured',True),('execArgv',[])]:
            proof,ui=self.order_proof(); proof['environment'][key]=value
            with self.assertRaises(ValueError): self.checker().verify_order_proof(proof,ui)

    def design(self):
        checker=self.checker();ui=self.valid();ui.update(sourceCommit='1'*40,productTree='2'*40)
        modes=['full-array','ordinal-A','provider-B'];rows=[]
        for n in range(30):
            for mode in modes[n%3:]+modes[:n%3]:
                rows.append(dict(repetition=n,mode=mode,prepareMilliseconds=1,milliseconds=1,orderedOracle=True,retained=dict(entries=0,references=0,textCodeUnits=0),afterClose=dict(entries=0,references=0,textCodeUnits=0),containers=dict(fullResultRows=0 if mode=='provider-B' else 6800,ordinalEntries=0 if mode=='full-array' else 6800,requestedPageRows=20,selectedRows=1)))
        return dict(version=1,scope='Supplemental Node collection preparation/acquisition comparison; not App/DB/formal acceptance',suite='standard',sourceCommit=ui['sourceCommit'],productTree=ui['productTree'],status='ok',errors=[],repetitions=30,recordedAt='2026-10-18T00:00:00Z',finishedAt='2026-10-18T00:00:01Z',fixture=ui['cohorts'][0]['observations']['fixture'],definition=dict(modes=modes),expected=dict(count=6800,sha256=checker.EXPECTED_IDS['standard']['all'],selectedId='cc6e3fcd-0000-4000-8000-000000003779',selectedIndex=6799,hiddenId='cc6e3fcd-0000-4000-8000-000000000004'),observations=rows,diagnostics=[dict(mode=m,probe=dict(counters={},pendingTransactions=0,droppedEvents=0)) for m in modes],summary={m:dict(prepare=checker.summary([1]*30),read=checker.summary([1]*30)) for m in modes}),ui

    def test_complete_rotating_source_design_comparison(self):
        raw,ui=self.design();self.checker().verify_design(raw,ui,dict(entries=100000,references=750000,textCodeUnits=8388608))

    def test_missing_mode_false_p95_or_full_result_disguised_as_page_is_rejected(self):
        for mutate in [lambda d:d['observations'].pop(),lambda d:d['summary']['provider-B']['read'].update(p95=0.1),lambda d:d['observations'][2]['containers'].update(requestedPageRows=6800),lambda d:d['observations'][0]['afterClose'].update(references=1),lambda d:d['observations'][0].update(mode='provider-B')]:
            raw,ui=self.design();mutate(raw)
            with self.assertRaises(ValueError): self.checker().verify_design(raw,ui,dict(entries=100000,references=750000,textCodeUnits=8388608))
if __name__ == '__main__': unittest.main()
