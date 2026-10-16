"""Apply explicit author decisions to original clauses using bound actual evidence."""
import argparse
from datetime import datetime, timezone
import hashlib
import json
from pathlib import Path

p = argparse.ArgumentParser(description=__doc__)
p.add_argument('--review', type=Path, required=True)
p.add_argument('--ci', type=Path, required=True)
p.add_argument('--decisions', type=Path, required=True)
p.add_argument('--original-cases', type=Path, required=True)
a = p.parse_args()
sha = lambda raw: hashlib.sha256(raw).hexdigest()
decisions = json.loads(a.decisions.read_text())
assert decisions['authorReviewedActualCurrentContent'] is True
assert decisions['wholeCaseAcceptanceInferredFromCountsOrTitles'] is False
review_path = a.review / 'CLAUSE_REVIEW.json'
review = json.loads(review_path.read_text())
assert not review.get('currentAuthorDecisionSource'), 'Preserve an existing final adjudication'
originals = {r['id']: r for r in json.loads(a.original_cases.read_text())}
binding = json.loads((a.review / 'evidence/product/binding.json').read_text())
product = binding['product']
assert product['commit'] == decisions['productCommit'] == '1fcadcca703863873a57d297e83b1b184e63e778'
assert len(originals) == len(review['cases']) == len(decisions['cases']) == 116
assert set(originals) == {r['id'] for r in review['cases']} == set(decisions['cases'])
indices = {}
for engine in ['chromium', 'firefox', 'webkit']:
    path = a.ci / ('case-evidence-' + engine) / 'index.json'
    raw = path.read_bytes()
    assert sha(raw) == decisions['reviewedIndexSHA256'][engine]
    index = json.loads(raw)
    assert index['source']['engine'] == engine and index['source']['tree'] == product['tree']
    assert index['source']['commit'] == '819b178f8d47048d3bc5aaa6988b67c220a71947'
    assert index['source']['pr_head'] == product['commit']
    assert index['source']['run_id'] == '38792131626' and index['source']['attempt'] == 1
    assert len(index['retainedTestResults']) == 228 and not index['unavailableAttachments']
    assert all(r['status'] == 'passed' and r['retry'] == 0 for r in index['retainedTestResults'])
    indices[engine] = index

now = datetime.now(timezone.utc).isoformat()
for case in review['cases']:
    ident = case['id']
    authored = decisions['cases'][ident]
    assert case['requirementIds'] == originals[ident]['requirement_ids']
    assert case['originalWorkPackage'] == originals[ident]['package_id']
    assert authored['result'] in ['passed_local_original_conditions', 'blocked_original_conditions']
    assert authored['freshContentObservation']
    assert set(authored['clauses']) == {r['name'] for r in case['clauses']} == {'given', 'when', 'then', 'negative_or_edge'}
    evidence = []
    for engine, index in indices.items():
        tests = [r for r in index['retainedTestResults'] if ident in r['caseIds']]
        if tests:
            evidence.append({'engine': engine, 'source': index['source'],
                'bundleManifest': 'evidence/bundles/product-ci-1fcadcca.manifest.json',
                'retainedIndex': 'ci-1fcadcca/case-evidence-' + engine + '/index.json',
                'indexSHA256': decisions['reviewedIndexSHA256'][engine],
                'testIds': [r['testId'] for r in tests],
                'scope': 'Actual original given/operations/assertions and retained actual inputs/outputs read by author; see indexed raw attachments. Case IDs/status alone are not the decision.'})
    if authored['result'] == 'passed_local_original_conditions':
        assert len(evidence) == 3 or ident == 'AT-N05'
        assert not case.get('pendingOriginalExternalExecution')
    else:
        assert case['pendingOriginalExternalExecution']['reason'] and authored['remainingOriginalCondition']
    if ident == 'AT-N05':
        carry = json.loads((a.review / 'evidence/unaffected-local-3ab6-carry.json').read_text())
        assert carry['targetProduct'] == product and carry['noExecutionRelabeled']
        raw_adjudication = Path(carry['N05']['adjudication']).read_bytes()
        old = json.loads(raw_adjudication)
        assert old['product'] == carry['testedProduct']
        assert old['result'] == 'passed_original_local_N05_observed_checks' and old['actualChildExitCode'] == 0
        assert old['fixture']['totalRecords'] == 88522 and old['fixture']['actualAssetBytes'] == 75497472
        assert old['all27NativeTablesBeforeAfterEqual']
        assert authored['unaffectedCarryAdjudicationSHA256'] == sha(raw_adjudication)
        for condition in carry['unchangedConditions']:
            source = next(r for r in binding['sourceFiles'] if r['path'] == condition['path'])
            assert source['bytes'] == condition['bytes'] and source['sha256'] == condition['sha256']
        evidence.insert(0, {'testedProduct': old['product'],
            'bundleManifest': 'evidence/bundles/unaffected-local-3ab6.manifest.json',
            'actualAdjudication': 'n05-original-3ab6f40-attempt2/ADJUDICATION.json',
            'adjudicationSHA256': sha(raw_adjudication),
            'changeImpact': 'evidence/unaffected-local-3ab6-carry.json',
            'scope': 'Actual original full Large N05; explicitly unaffected carry. Fresh small CI fixtures alone do not establish the original Large given.'})
    if case.get('executionEvidence'):
        case['priorPreparationExecutionEvidence'] = case['executionEvidence']
    for clause in case['clauses']:
        name = clause['name']
        assert clause['original'] == originals[ident][name]
        decision = authored['clauses'][name]
        assert decision['authoredObservation']
        assert decision['result'] in ['passed_local_original_conditions', 'partial_local_support', 'not_run_original_conditions']
        if authored['result'] == 'passed_local_original_conditions':
            assert decision['result'] == 'passed_local_original_conditions'
        clause['authorResult'] = decision['result']
        clause['observedEvidence'] = ([{'caseId': ident, 'property': 'executionEvidence',
            'scope': 'Actual evidence is retained once at case level; this clause-specific authored observation explains its coverage.'}] if evidence else [])
        clause['authorCurrentObservation'] = decision['authoredObservation']
        clause['observationScope'] = 'Final authored current evidence review; original wording and historical/source-only preparation observations are preserved.'
        clause['limitation'] = authored.get('remainingOriginalCondition')
    case['executionEvidence'] = evidence
    case['wholeCaseResult'] = 'passed' if authored['result'] == 'passed_local_original_conditions' else 'blocked_original_conditions'
    case['authorCurrentObservation'] = {'at': now, 'product': product,
        'freshContentObservation': authored['freshContentObservation'],
        'scope': 'Managed Linux original local conditions, or explicitly named unaffected3ab6 carry. Physical/sync/role/game external gates remain separate.'}
    case['limitation'] = authored.get('remainingOriginalCondition')
review['recordedAt'] = now
review['finalRunPending'] = False
review['currentAuthorDecisionSource'] = {'path': str(a.decisions.relative_to(a.review)),
    'bytes': a.decisions.stat().st_size, 'sha256': sha(a.decisions.read_bytes())}
review['sourceNotesScope'] = 'Historical/source-only preparation observations are preserved. Final authorResult and authorCurrentObservation identify the current adjudication; pending text inside old preparation notes is historical.'
review_path.write_text(json.dumps(review, ensure_ascii=False, indent=2) + '\n')
print(json.dumps({'cases': 116, 'clauses': 464, 'passedLocal': sum(c['wholeCaseResult'] == 'passed' for c in review['cases']),
                  'blockedOriginalConditions': sum(c['wholeCaseResult'] != 'passed' for c in review['cases'])}))
