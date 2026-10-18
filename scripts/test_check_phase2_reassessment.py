import copy
import math
import hashlib
from pathlib import Path
import tempfile
import unittest

from check_phase2_reassessment import verify_run, verify_source_files


def capture():
    stats = {'closed': False, 'retainedTerms': 0, 'retainedUtf8Bytes': 0, 'resultEntries': 0, 'resultReferences': 0, 'projectRows': 6800}
    cleared = dict(stats, closed=True, projectRows=0)
    expected = [{'count': count, 'sha256': 'a' * 64} for count in (6700, 6700, 20, 6700, 6700, 6700)]
    modes = ['current', 'corpus', 'results']
    queries = [dict(row, queryIndex=i, milliseconds=float(i + 1)) for i, row in enumerate(expected)]
    rows = [dict(repetition=n, mode=mode, order=modes[n % 3:] + modes[:n % 3], prepareMilliseconds=0.1,
                 queries=copy.deepcopy(queries), retained=dict(stats), afterClose=dict(cleared)) for n in range(30) for mode in modes]
    return {'version': 1, 'suite': 'standard', 'repetitions': 30, 'dirty': False, 'sourceCommit': '1' * 40, 'sourceTree': '2' * 40,
            'productTree': '73263a85e2ef2ead9799f91125ba54fb643182b4', 'errors': [], 'finishedAt': '2026-10-18T00:00:01Z', 'recordedAt': '2026-10-18T00:00:00Z',
            'inputUnchanged': True, 'scope': 'Supplemental Node source experiment, not original browser30/180/7200 acceptance',
            'fixture': {'seed': 'standard-r06-v1', 'counts': {'totalRecords': 8800}, 'assetBytes': 0, 'assets': [], 'sha256': 'de0b9420abec95bcc37fc7fb7c3dc4c2667082258678f750af33bb53f8a557f5', 'wireJsonSha256': 'de0b9420abec95bcc37fc7fb7c3dc4c2667082258678f750af33bb53f8a557f5', 'jsonBytes': 6258972},
            'sequence': [{'op': 'text', 'value': value} for value in ('霧', '霧の', '門番', '記録', '霧', '霧の')], 'expected': expected,
            'limits': {'maxTextBytes': 8388608, 'maxResultEntries': 8, 'maxResultReferences': 100000}, 'observations': rows,
            'diagnostics': [dict(mode=mode, retained=dict(stats), afterClose=dict(cleared), queries=[dict(row, queryIndex=i, counters={'query.filter.rows': (i + 1) * 6800}) for i, row in enumerate(expected)], probe={'counters': {'query.filter.rows': 40800}, 'pendingTransactions': 0, 'droppedEvents': 0}) for mode in modes],
            'summary': {mode: [dict(count=30, minimum=float(i+1), median=float(i+1), p95=float(i+1), maximum=float(i+1)) for i in range(6)] for mode in modes}}


class ReassessmentCheckerTests(unittest.TestCase):
    def test_complete_supplemental_capture(self):
        verify_run(capture())

    def rejected(self, modify, message):
        raw = capture()
        modify(raw)
        with self.assertRaisesRegex(ValueError, message):
            verify_run(raw)

    def test_missing_repetition_is_not_thirty(self):
        self.rejected(lambda r: r['observations'].pop(), '90')

    def test_duplicate_repetition_cannot_replace_missing_row(self):
        self.rejected(lambda r: r['observations'].__setitem__(-1, r['observations'][0]), 'duplicate')

    def test_wrong_order_is_rejected(self):
        self.rejected(lambda r: r['observations'][3].__setitem__('order', ['current', 'corpus', 'results']), 'order')

    def test_nan_and_boolean_are_not_timings(self):
        for value in (math.nan, math.inf, -1, True):
            with self.subTest(value=value):
                self.rejected(lambda r: r['observations'][0]['queries'][0].__setitem__('milliseconds', value), 'timing')

    def test_p95_is_recomputed_from_every_raw_value(self):
        self.rejected(lambda r: r['summary']['corpus'][0].__setitem__('p95', 0.5), 'summary')

    def test_wrong_result_is_not_saved_as_fast(self):
        self.rejected(lambda r: r['observations'][1]['queries'][0].__setitem__('sha256', 'b' * 64), 'result')

    def test_fabricated_expected_count_is_not_an_oracle(self):
        self.rejected(lambda r: r['expected'][0].__setitem__('count', 0), 'expected')

    def test_original_fixture_digest_cannot_be_replaced(self):
        self.rejected(lambda r: r['fixture'].__setitem__('sha256', 'c' * 64), 'fixture')

    def test_raw_json_digest_and_size_cannot_be_relabelled(self):
        self.rejected(lambda r: r['fixture'].__setitem__('wireJsonSha256', 'd' * 64), 'fixture')
        self.rejected(lambda r: r['fixture'].__setitem__('jsonBytes', 1), 'fixture')

    def test_dirty_failed_and_unfinished_runs_are_not_success(self):
        self.rejected(lambda r: r.__setitem__('dirty', True), 'unsealed')
        self.rejected(lambda r: r.__setitem__('errors', [{'message': 'failure'}]), 'unsealed')
        self.rejected(lambda r: r.pop('finishedAt'), 'unsealed')

    def test_missing_or_excess_retention_is_not_zero(self):
        self.rejected(lambda r: r['observations'][1]['retained'].pop('retainedUtf8Bytes'), 'retention')
        self.rejected(lambda r: r['observations'][1]['retained'].__setitem__('retainedUtf8Bytes', 8388609), 'retention')

    def test_close_must_release_logical_indexes_and_source(self):
        self.rejected(lambda r: r['observations'][1]['afterClose'].__setitem__('projectRows', 6800), 'close')

    def test_corpus_full_scan_cannot_disappear_from_diagnostics(self):
        self.rejected(lambda r: r['diagnostics'][1]['probe']['counters'].pop('query.filter.rows'), 'scan')

    def test_probe_must_have_no_pending_native_work(self):
        self.rejected(lambda r: r['diagnostics'][0]['probe'].__setitem__('pendingTransactions', 1), 'probe')

    def test_product_tree_and_acceptance_scope_cannot_be_promoted(self):
        self.rejected(lambda r: r.__setitem__('productTree', 'd' * 40), 'product')
        self.rejected(lambda r: r.__setitem__('scope', 'original browser acceptance passed'), 'scope')

    def source_capture(self, root):
        data = b'export const value = 1;\n'
        (root / 'src').mkdir(); (root / 'src/a.ts').write_bytes(data)
        def oid(kind, payload):
            return hashlib.sha1(kind.encode() + b' ' + str(len(payload)).encode() + b'\0' + payload).hexdigest()
        blob = oid('blob', data)
        subtree = oid('tree', b'100644 a.ts\0' + bytes.fromhex(blob))
        tree = oid('tree', b'40000 src\0' + bytes.fromhex(subtree))
        commit = f'tree {tree}\nauthor Test <test@example.invalid> 0 +0000\ncommitter Test <test@example.invalid> 0 +0000\n\nsource proof\n'
        return {'sourceCommit': oid('commit', commit.encode()), 'sourceTree': tree, 'productTree': subtree,
                'sourceFiles': [{'path': 'src/a.ts', 'bytes': len(data), 'sha256': hashlib.sha256(data).hexdigest()}],
                'sourceProof': {'commit': commit, 'trees': {
                    tree: [{'mode': '040000', 'type': 'tree', 'sha': subtree, 'name': 'src'}],
                    subtree: [{'mode': '100644', 'type': 'blob', 'sha': blob, 'name': 'a.ts'}]}}}

    def test_source_proof_works_without_git_history_or_a_git_directory(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory); raw = self.source_capture(root)
            verify_source_files(root, raw)

    def test_changed_source_and_relabelled_source_tree_are_rejected(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory); raw = self.source_capture(root)
            modified = copy.deepcopy(raw); modified['sourceFiles'] = []
            with self.assertRaisesRegex(ValueError, 'coverage'):
                verify_source_files(root, modified)
            modified = copy.deepcopy(raw); modified['sourceProof']['trees'][raw['sourceTree']][0]['sha'] = 'b' * 40
            with self.assertRaisesRegex(ValueError, 'tree digest'):
                verify_source_files(root, modified)
            (root / 'src/a.ts').write_text('changed')
            with self.assertRaisesRegex(ValueError, 'source changed'):
                verify_source_files(root, raw)

    def test_source_proof_cannot_relabel_a_different_commit(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory); raw = self.source_capture(root)
            raw['sourceProof']['commit'] += 'changed'
            with self.assertRaisesRegex(ValueError, 'commit binding'):
                verify_source_files(root, raw)


if __name__ == '__main__':
    unittest.main()
