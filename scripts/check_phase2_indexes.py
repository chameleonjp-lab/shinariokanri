"""Bind phase-2 supplemental measurements to literal sources and raw samples."""
from __future__ import annotations
from datetime import datetime
import argparse
import hashlib
import json
import math
from pathlib import Path
import re
import sys
import zipfile

sys.path.insert(0, str(Path(__file__).parent))
from check_phase2_reassessment import FIXTURES, ASSETS, require, number, integer, load, safe_file, safe_relative, git_hash, verify_source_files

FOLDER = 'docs/optimization/phase2/p2-06-07'
SCOPE = 'Supplemental actual-App/native-IDB observations; not formal phase3 acceptance'
SEQUENCE = ['霧', '霧の', '門番', '記録', '霧', '霧の']
FIXED_SOURCES = {'main': 'a13d8fad93b1a4a14c4cc4d45ab98783388de177', 'p206': 'b6e2120208972edb398b74dbeff951fb007111d3', 'prior': '0c378f5d7578cec090e4cedd67e0ead758e2bb69', 'full-b': '6df646113f0dc88e896cd76bf33f7b0eb57ffbc1', 'full-b-budget8': '6df646113f0dc88e896cd76bf33f7b0eb57ffbc1', 'selected': '886d0c0e664c159b53be22bb9e19cc0d7df8159d', 'budget4': '886d0c0e664c159b53be22bb9e19cc0d7df8159d'}
LABELS = set(FIXED_SOURCES)
# Independent, original-fixture authored-kind/name predicates. These hashes
# freeze result ID order as well as count; a same-count substitution fails.
EXPECTED_IDS = {
    'standard': dict(text='6b56c93f48ce89cae4cf0987f076b16cd74de2e7925b4c29ced1f0e440cb0199', gate='6a5696a888efe01f2c5923cdcfec46b790df0ee269cc472fa80f8fd62a54a79d', all='a2fcb7374095bbf2a1f29dcfa1ef67d1809ef7de5fca5db7b9266cca0d0b2ce5', participant='f7b92f908a3b2f34ac8a6387be382a66df9f45f9e90acd447d3c3641f0eb5e00'),
    'large': dict(text='c0632349f8e2e195a1c184f1ee868f48f3bcb80d15f7f212d7268f4a12c458c5', gate='e41aa4f44724913bbf1286c61164cd8a797ad3b71626d6a7ba70100a3675deaa', all='6ba113784ed5d1f5a5f9a409f797bf27a5b769a1bffde6b86da2140ed7bd523e', participant='7e179001b2a4bf7751d6c1ee6e2f328ec6842539c9593717df1e81b7c4e772f3'),
}
OVERLAYS = {'scripts/optimization/measure-derived-ui.mjs', 'tests/optimization/derived-measurement-harness.html', 'tests/optimization/derived-measurement-harness.tsx'}
EDIT_IDS = {
    'standard': dict(person='e6aa2134b5376a0a7584cd984ce3246fde8a73ae1149edf32497a8cbc137b744', archived='1e4732da2814fb7c353d5667efc9219fedfd4c59be13dc87ac76f6c45825af1a'),
    'large': dict(person='c5177db69e2ec7149589661f1df561f0f80b466db28310d7cff6ca915788e027', archived='ab88b65e3f91add37fdcadea70bad482d8a5d0fd06330b99d12ae8372e7e679a'),
}
EMPTY_IDS = '4f53cda18c2baa0c0354bb5f9a3ecbe5ed12ab4d8e11ba873c2f11161202b945'


def expected_hash(suite, query):
    return EXPECTED_IDS[suite]['all' if query == '' else 'gate' if query == '門番' else 'text']


def summary(values):
    values = sorted(values)
    return dict(count=len(values), minimum=values[0], median=values[math.ceil(len(values)*.5)-1], p95=values[math.ceil(len(values)*.95)-1], maximum=values[-1])


def verify_capture(raw):
    require(raw.get('version') == 1 and raw.get('repetitions') == 30 and raw.get('sequence') == SEQUENCE, 'not the thirty-repetition definition')
    require(raw.get('scope') == SCOPE and raw.get('literalSourceVerified') is True, 'unproved source or promoted acceptance')
    require(raw.get('status') == 'ok' and raw.get('errors') == [] and raw.get('unexpectedRequests') == [], 'failed or nonlocal run')
    require(datetime.fromisoformat(raw['finishedAt']) >= datetime.fromisoformat(raw['recordedAt']), 'incomplete chronology')
    require(raw['suite'] in FIXTURES, 'unknown suite')
    seed, records, entities, asset_bytes, digest = FIXTURES[raw['suite']]
    cohorts = raw['cohorts']
    require(len(cohorts) == 2 and [c['enabled'] for c in cohorts] == [False, True], 'missing separate OFF/ON')
    require(datetime.fromisoformat(cohorts[0]['finishedAt']) <= datetime.fromisoformat(cohorts[1]['startedAt']), 'OFF/ON cohorts overlap')
    shared = None
    for cohort in cohorts:
        enabled, observed = cohort['enabled'], cohort['observations']
        require(cohort.get('status') == observed.get('status') == 'ok' and not observed.get('activeAction') and not observed.get('activeOperation'), 'incomplete observation')
        require(observed['options']['enabled'] is enabled and observed['options']['suite'] == raw['suite'], 'cohort binding differs')
        fixture = observed['fixture']
        require(fixture['seed'] == seed and fixture['counts']['totalRecords'] == records and fixture['assetBytes'] == asset_bytes and fixture['sha256'] == digest, 'original fixture differs')
        require(fixture['wireJsonSha256'] == ('32e7995933c9e0ca6af2330df1036d0c182ad34810d41e45b0a9530d42998f4f' if asset_bytes else digest) and fixture['jsonBytes'] == (59407368 if asset_bytes else 6258972), 'original fixture bytes differ')
        assets = [dict(bytes=25165824, sha256=value) for value in ASSETS] if asset_bytes else []
        require(fixture['assets'] == observed['nativeAssets'] == assets, 'actual native material bytes differ')
        expected = observed['expected']
        for query in set(SEQUENCE + ['']):
            count = entities if query == '' else (200 if asset_bytes else 20) if query == '門番' else (67000 if asset_bytes else 6700)
            names = ['門番1', '門番6', '門番11'] if query == '門番' else ['アオ0', '門番1', '記録係2']
            require(expected[query]['count'] == count and expected[query]['sha256'] == expected_hash(raw['suite'], query) and expected[query]['firstNames'] == names, 'independent expected result differs')
        require(observed['expectedParticipant'] == dict(count=15, sha256=EXPECTED_IDS[raw['suite']]['participant']), 'participant oracle differs')
        require(observed.get('inputUnchanged') is True and observed.get('orderedResultsVerified') is True and observed['savedSource'] == observed['postReadSource'], 'read-only UI changed source or ordered results unverified')
        bindings = {key: observed[key] for key in ('fixture', 'nativeAssets', 'expected', 'expectedParticipant', 'savedSource', 'renameInput')}
        if shared is None: shared = bindings
        else: require(shared == bindings, 'OFF/ON input or ordered oracle differs')
        after_close = observed.get('afterClose')
        # Literal baseline has no ownership API. Unsupported is null/UNKNOWN;
        # a supported candidate must release every logical counter.
        if after_close is not None:
            require(set(after_close) == {'owners', 'entries', 'references', 'textCodeUnits'} and all(type(v) is int and v == 0 for v in after_close.values()), 'close retained indexes')

        def observation(row):
            require(row.get('status', 'ok') == 'ok' and row.get('apiCompletion') == 'fulfilled', 'unknown/failed completion')
            if enabled:
                require('milliseconds' not in row, 'ON elapsed promoted to latency')
                probe = row['probe']
                require(probe['pendingTransactions'] == 0 and probe['droppedEvents'] == 0 and all(number(v) for v in probe['counters'].values()), 'incomplete probe')
            else:
                require(number(row.get('milliseconds')) and 'probe' not in row, 'invalid OFF latency or enabled probe')

        observation(observed['startup'])
        actions = observed['actions']
        require(len(actions) == 240, 'missing query/navigation samples')
        query_rows = actions[:180]
        require([(r['expectation'].get('repetition'), r['expectation'].get('queryIndex'), r['expectation'].get('query')) for r in query_rows] == [(n, i, q) for n in range(30) for i, q in enumerate(SEQUENCE)], 'query observation order differs')
        for row in query_rows:
            observation(row)
            query = row['expectation']['query']
            require(row['query'] == query and row['count'] == f"{expected[query]['count']}件" and row['names'] == expected[query]['firstNames'], 'actual UI differs from original oracle')
        selected_page = observed['selection']['index'] // 60
        nav_rows = actions[180:]
        require([(r['expectation'].get('repetition'), r['expectation'].get('page')) for r in nav_rows] == [(n, p) for n in range(30) for p in (selected_page-1, selected_page)], 'selected/page observation order differs')
        for row in nav_rows:
            observation(row)
            require(row['pager'].startswith(f"{row['expectation']['page']+1} / "), 'actual UI page differs')
        operations = observed['operations']
        labels = ['listProjectSummaries', 'loadEditor', 'historyPage'] + [f'participant-{n}' for n in range(30)] + ['rename-one']
        require([r['label'] for r in operations] == labels, 'public API/participant observations incomplete')
        for row in operations: observation(row)
    off = cohorts[0]['observations']
    expected_summary = dict(queries=[summary([r['milliseconds'] for r in off['actions'][:180] if r['expectation']['queryIndex'] == i]) for i in range(6)], navigation=summary([r['milliseconds'] for r in off['actions'][180:]]), participant=summary([r['milliseconds'] for r in off['operations'] if r['label'].startswith('participant-')]))
    require(raw['summary'] == expected_summary, 'summary differs from every raw sample')


def verify_archive(folder, descriptor, records):
    data = safe_file(folder, descriptor['path']).read_bytes()
    require(len(data) == descriptor['bytes'] and hashlib.sha256(data).hexdigest() == descriptor['sha256'], 'archive bytes differ')
    expected = {r['path']: r for r in records}
    require(len(expected) == len(records), 'duplicate manifest member')
    with zipfile.ZipFile(safe_file(folder, descriptor['path'])) as archive:
        require(len(archive.infolist()) == len(expected) and {m.filename for m in archive.infolist()} == set(expected), 'archive coverage/duplicate differs')
        for member in archive.infolist():
            safe_relative(member.filename)
            payload = archive.read(member)
            require(len(payload) == expected[member.filename]['bytes'] and hashlib.sha256(payload).hexdigest() == expected[member.filename]['sha256'], 'archived member bytes differ')


def archived_limits(folder, raw):
    if not any(row['path'] == 'src/domain/derivedIndexes.ts' for row in raw['sourceFiles']): return None
    with zipfile.ZipFile(safe_file(folder, raw['sourceArchive']['path'])) as archive:
        code = archive.read('src/domain/derivedIndexes.ts').decode()
    declaration = next(line for line in code.splitlines() if 'export const DEFAULT_DERIVED_INDEX_LIMITS:' in line)
    return {key: int(re.search(key+r':([0-9_]+)', declaration)[1].replace('_','')) for key in ('entries', 'references', 'textCodeUnits')}


def verify_artifacts(folder, raw):
    for descriptor, records in [('sourceArchive', 'sourceFiles'), ('runtimeArchive', 'runtimeFiles'), ('overlayArchive', 'overlays'), ('buildArchive', 'buildFiles')]:
        verify_archive(folder, raw[descriptor], raw[records])
    verify_source_files(folder, raw, safe_file(folder, raw['sourceArchive']['path']))
    require({r['path'] for r in raw['overlays']} == OVERLAYS and len(raw['overlays']) == 3, 'measurement overlay coverage differs')
    product = {r['path']: r for r in raw['sourceFiles']}
    for row in raw['overlays']:
        if row['path'] in product: require(product[row['path']] == row, 'measurement overlay changed committed source')
    expected_runtime = set()

    def visit_runtime(tree, prefix=''):
        for entry in raw['sourceProof']['trees'][tree]:
            path = prefix + entry['name']
            targets = ('scripts/build', 'public', 'examples/browser-game')
            selected = any(path == t or path.startswith(t+'/') or t.startswith(path+'/') for t in targets) or bool(re.fullmatch(r'tsconfig.*\.json', path)) or path == 'vite.config.ts'
            if not selected: continue
            if entry['type'] == 'tree': visit_runtime(entry['sha'], path+'/')
            else: expected_runtime.add(path)
    visit_runtime(raw['sourceTree'])
    require({r['path'] for r in raw['runtimeFiles']} == expected_runtime and len(raw['runtimeFiles']) == len(expected_runtime), 'runtime source coverage differs')
    owned = any(row['path'] == 'src/domain/derivedIndexes.ts' for row in raw['sourceFiles'])
    limits = archived_limits(folder,raw)
    for cohort in raw['cohorts']:
        observed = cohort['observations']
        require((observed['afterClose'] is not None) is owned, 'retention support misreported')
        if owned:
            cap = observed['options'].get('textCodeUnits', limits['textCodeUnits'])
            for key in ('afterStartup', 'afterQueries', 'afterParticipant'):
                stats = observed[key]
                require(all(integer(value) for value in stats.values()) and stats['owners'] <= 4 and stats['entries'] <= limits['entries'] and stats['references'] <= limits['references'] and stats['textCodeUnits'] <= cap, 'logical retention exceeds store budget')
    # Additional build/runtime paths are bound to the same commit/tree. They
    # cannot be smuggled into the original helper's exact source coverage.
    with zipfile.ZipFile(safe_file(folder, raw['runtimeArchive']['path'])) as archive:
        for row in raw['runtimeFiles']:
            current = raw['sourceTree']
            for part in Path(row['path']).parts:
                entry = next((e for e in raw['sourceProof']['trees'][current] if e['name'] == part), None)
                require(entry is not None, 'runtime path outside measured commit')
                current = entry['sha']
            require(current == git_hash('blob', archive.read(row['path'])), 'runtime blob outside measured commit')


def verify_order_proof(raw, ui):
    require(raw.get('version') == 1 and raw.get('scope') == 'Independent functional full-order oracle with fake IndexedDB; not browser latency or native persistence proof' and raw.get('status') == 'ok' and raw.get('errors') == [], 'failed or promoted functional proof')
    environment=raw.get('environment',{})
    require(environment.get('backend')=='fake-indexeddb' and environment.get('timingsCaptured') is False and '--experimental-transform-types' in environment.get('execArgv',[]) and re.fullmatch(r'v24\.[0-9]+\.[0-9]+',environment.get('node','')), 'functional backend/runtime scope differs')
    require(raw['suite'] == ui['suite'] and raw['sourceCommit'] == ui['sourceCommit'] and raw['productTree'] == ui['productTree'], 'functional/UI source differs')
    observed = ui['cohorts'][0]['observations']
    require(raw['fixture'] == observed['fixture'] and raw['normalizedCurrentSHA256'] == observed['savedSource']['current'] and raw['textCodeUnits'] == observed['options'].get('textCodeUnits'), 'functional/native UI input differs')
    require([phase['label'] for phase in raw['phases']] == ['original', 'renamed-alias', 'archived'], 'missing saved-edit phase')
    queries = [['霧', '霧の', '門番', '記録', ''], ['計測変更後の人物', '追加した独立別名', '記録名0', '霧'], ['計測変更後の人物', '追加した独立別名', '霧']]
    text_count = 67000 if ui['suite'] == 'large' else 6700
    for phase, required in zip(raw['phases'], queries):
        require([r['text'] for r in phase['queries']] == required, 'missing functional query')
        for row in phase['queries']:
            expected = row['expected']
            require(integer(expected['count']) and re.fullmatch('[0-9a-f]{64}', expected['sha256']) and row['full'] == expected, 'full result differs from independent functional oracle')
            if phase['label'] == 'original': require(expected == {k: observed['expected'][row['text']][k] for k in ('count', 'sha256')}, 'original ordered ID oracle changed')
            elif phase['label'] == 'renamed-alias':
                count, digest = (text_count, EXPECTED_IDS[ui['suite']]['text']) if row['text'] == '霧' else (0, EMPTY_IDS) if row['text'] == '記録名0' else (1, EDIT_IDS[ui['suite']]['person'])
                require(expected == dict(count=count,sha256=digest), 'saved rename/alias oracle differs')
            else:
                count, digest = (text_count-1, EDIT_IDS[ui['suite']]['archived']) if row['text'] == '霧' else (0, EMPTY_IDS)
                require(expected == dict(count=count,sha256=digest), 'saved archive oracle differs')
            if raw['providerSupported']:
                provider = row['provider']
                require(provider['ids'] == provider['pages'] == expected and provider['pageSize'] == 60 and provider['allPageStates'] == 'loaded', 'provider IDs/all pages differ from independent oracle')
                hidden = provider['hiddenSelection']
                require(hidden is None or hidden['state'] == 'loaded' and hidden['id'] == hidden['actualId'], 'independent selected row differs')
            else: require(row['provider'] is None, 'unsupported provider reported as measured')
    if raw['afterClose'] is not None: require(all(type(v) is int and v == 0 for v in raw['afterClose'].values()), 'functional close retained indexes')


def verify_design(raw,ui,limits):
    modes=['full-array','ordinal-A','provider-B']
    require(raw.get('version')==1 and raw.get('scope')=='Supplemental Node collection preparation/acquisition comparison; not App/DB/formal acceptance' and raw.get('status')=='ok' and raw.get('errors')==[], 'failed or promoted source experiment')
    require(raw['sourceCommit']==ui['sourceCommit'] and raw['productTree']==ui['productTree'] and raw['suite']==ui['suite'] and raw['fixture']==ui['cohorts'][0]['observations']['fixture'], 'source experiment/UI source or input differs')
    require(datetime.fromisoformat(raw['finishedAt'])>=datetime.fromisoformat(raw['recordedAt']) and raw['repetitions']==30 and raw['definition']['modes']==modes, 'source experiment definition differs')
    large=raw['suite']=='large';count=68003 if large else 6800;prefix='859ae1ea' if large else 'cc6e3fcd'
    require(raw['expected']==dict(count=count,sha256=EXPECTED_IDS[raw['suite']]['all'],selectedId=prefix+'-0000-4000-8000-'+('f00000000002' if large else '000000003779'),selectedIndex=count-1,hiddenId=prefix+'-0000-4000-8000-000000000004'), 'source experiment independent oracle differs')
    require([(r['repetition'],r['mode']) for r in raw['observations']]==[(n,m) for n in range(30) for m in modes[n%3:]+modes[:n%3]], 'source experiment rotating samples missing')
    for row in raw['observations']:
        require(number(row['prepareMilliseconds']) and number(row['milliseconds']) and row['orderedOracle'] is True, 'incomplete OFF source experiment')
        require(row['containers']==dict(fullResultRows=0 if row['mode']=='provider-B' else count,ordinalEntries=0 if row['mode']=='full-array' else count,requestedPageRows=count%60,selectedRows=1), 'source experiment acquisition/container differs')
        require(set(row['retained'])==set(limits) and all(integer(v) and v<=limits[k] for k,v in row['retained'].items()) and set(row['afterClose'])==set(limits) and all(type(v) is int and v==0 for v in row['afterClose'].values()), 'source experiment retention differs')
    require([r['mode'] for r in raw['diagnostics']]==modes, 'missing separate ON source experiment')
    for row in raw['diagnostics']:
        require('milliseconds' not in row and 'prepareMilliseconds' not in row and row['probe']['droppedEvents']==row['probe']['pendingTransactions']==0 and all(number(v) for v in row['probe']['counters'].values()), 'invalid ON source experiment')
    require(raw['summary']=={mode:dict(prepare=summary([r['prepareMilliseconds'] for r in raw['observations'] if r['mode']==mode]),read=summary([r['milliseconds'] for r in raw['observations'] if r['mode']==mode])) for mode in modes}, 'source experiment false percentile')


def validate(root, verify_current_source=False):
    folder = root / FOLDER
    manifest = load(folder / 'evidence-manifest.json')
    require(manifest['releaseState'] == 'RELEASE BLOCKED' and manifest['originalAcceptancePerformed'] is False, 'release/acceptance promoted')
    require(set(manifest['labels']) == LABELS and len(manifest['labels']) == len(LABELS) and set(manifest['sources']) == LABELS, 'mandatory comparison labels missing')
    require(all(manifest['sources'][label] == commit for label, commit in FIXED_SOURCES.items()), 'literal main/P206/prior source changed')
    require(len(manifest['files']) > 0 and len({r['path'] for r in manifest['files']}) == len(manifest['files']), 'empty/duplicate evidence file list')
    listed = {r['path'] for r in manifest['files']}
    for row in manifest['files']:
        data = safe_file(root, row['path']).read_bytes()
        require(len(data) == row['bytes'] and hashlib.sha256(data).hexdigest() == row['sha256'], 'manifest artifact bytes differ')
    require(manifest['generatorLogsArchive']['path'] in listed and len(manifest['generatorLogFiles'])==14, 'generator stdout archive missing')
    verify_archive(root,manifest['generatorLogsArchive'],manifest['generatorLogFiles'])
    require(manifest['ciRepairArchive']['path'] in listed and len(manifest['ciRepairFiles'])>0, 'CI repair evidence archive missing')
    verify_archive(root,manifest['ciRepairArchive'],manifest['ciRepairFiles'])
    runs = []
    for record in manifest['runs']:
        raw_path = safe_file(root, record['path'])
        require(record['path'] in listed, 'run missing from artifact manifest')
        raw = load(raw_path); verify_capture(raw); verify_artifacts(raw_path.parent, raw)
        for key in ('sourceArchive', 'runtimeArchive', 'overlayArchive', 'buildArchive'):
            require(str((raw_path.parent / raw[key]['path']).relative_to(root)) in listed, 'required archive missing from artifact manifest')
        raw['label'] = record['label']; runs.append(raw)
    require({(r['label'], r['suite']) for r in runs} == {(label, suite) for label in manifest['labels'] for suite in FIXTURES}, 'incomplete source/suite matrix')
    require(len(runs) == len(manifest['labels'])*2, 'duplicate source/suite capture')
    for previous, current in zip(runs, runs[1:]):
        require(datetime.fromisoformat(previous['finishedAt']) <= datetime.fromisoformat(current['recordedAt']), 'heavy measurements overlap')
    for raw in runs:
        require(raw['sourceCommit'] == manifest['sources'][raw['label']] and raw['overlays'] == runs[0]['overlays'] and raw['environment'] == runs[0]['environment'], 'source, overlay or environment cohort differs')
        for cohort in raw['cohorts']:
            require(cohort['observations']['options'].get('textCodeUnits') == (8388608 if raw['label'] == 'full-b-budget8' else 4194304 if raw['label'] == 'budget4' else None), 'budget cohort binding differs')
    for suite in FIXTURES:
        cohort = [r for r in runs if r['suite'] == suite]
        for raw in cohort[1:]:
            for key in ('fixture', 'expected', 'expectedParticipant', 'savedSource', 'renameInput'):
                require(raw['cohorts'][0]['observations'][key] == cohort[0]['cohorts'][0]['observations'][key], 'matched-source input differs')
    proof_labels = LABELS-{'prior'}
    records = manifest['orderProofs']
    require(len(records) == len(proof_labels)*2 and {(r['label'],r['suite']) for r in records} == {(label,suite) for label in proof_labels for suite in FIXTURES}, 'missing independent full-order source/suite proof')
    runner_hash = None
    for record in records:
        require(record['path'] in listed, 'functional proof missing from artifact manifest')
        path = safe_file(root,record['path']); proof = load(path)
        ui = next(raw for raw in runs if raw['label']==record['label'] and raw['suite']==record['suite'])
        verify_order_proof(proof,ui)
        require(proof['providerSupported'] is any(row['path']=='src/domain/orderedCollection.ts' for row in proof['sourceFiles']), 'functional provider support misreported')
        verify_archive(path.parent,proof['sourceArchive'],proof['sourceFiles'])
        verify_source_files(path.parent,proof,safe_file(path.parent,proof['sourceArchive']['path']))
        for artifact in (proof['sourceArchive'],proof['runner']):
            artifact_path = path.parent/artifact['path']
            require(str(artifact_path.relative_to(root)) in listed, 'functional source/tool missing from artifact manifest')
            payload = safe_file(path.parent,artifact['path']).read_bytes()
            require(len(payload)==artifact['bytes'] and hashlib.sha256(payload).hexdigest()==artifact['sha256'], 'functional source/tool bytes differ')
        if runner_hash is None: runner_hash=proof['runner']['sha256']
        else: require(proof['runner']['sha256']==runner_hash, 'functional verification tools differ across sources')
    selected = next(raw for raw in runs if raw['label']=='selected')
    require(next(row for row in selected['sourceFiles'] if row['path']=='scripts/optimization/verify-derived-results.mjs')['sha256']==runner_hash, 'functional verifier differs from sealed selected tool')
    designs=manifest['designs']
    require(len(designs)==4 and {(r['label'],r['suite']) for r in designs}=={(label,suite) for label in ('full-b','selected') for suite in FIXTURES}, 'missing source design comparison')
    design_tool_hash=None
    for record in designs:
        require(record['path'] in listed, 'source experiment missing from artifact manifest')
        path=safe_file(root,record['path']);design=load(path)
        ui=next(raw for raw in runs if raw['label']==record['label'] and raw['suite']==record['suite'])
        verify_design(design,ui,archived_limits(path.parent,design))
        verify_archive(path.parent,design['sourceArchive'],design['sourceFiles'])
        verify_source_files(path.parent,design,safe_file(path.parent,design['sourceArchive']['path']))
        require(str((path.parent/design['sourceArchive']['path']).relative_to(root)) in listed, 'source experiment archive missing from artifact manifest')
        tool=next(row['sha256'] for row in design['sourceFiles'] if row['path']=='scripts/optimization/compare-collection-designs.mjs')
        if design_tool_hash is None: design_tool_hash=tool
        else: require(tool==design_tool_hash, 'source experiment tools differ')
    require(next(row['sha256'] for row in selected['sourceFiles'] if row['path']=='scripts/optimization/compare-collection-designs.mjs')==design_tool_hash, 'source experiment tool differs from sealed selected source')
    if verify_current_source:
        current_src = {str(p.relative_to(root)) for p in (root/'src').rglob('*') if p.is_file() and not str(p.relative_to(root)).startswith('src/portable/generated/')}
        measured_src = {r['path'] for r in selected['sourceFiles'] if r['path'].startswith('src/')}
        require(current_src == measured_src, 'current product source coverage differs from selected measurement')
        for row in selected['sourceFiles']:
            if row['path'] in measured_src or row['path'] in ('package.json', 'package-lock.json'):
                data = safe_file(root, row['path']).read_bytes()
                require(len(data) == row['bytes'] and hashlib.sha256(data).hexdigest() == row['sha256'], 'current product bytes differ from selected measurement')
    return runs


if __name__ == '__main__':
    parser = argparse.ArgumentParser(); parser.add_argument('--root', type=Path, default=Path(__file__).resolve().parents[1]); parser.add_argument('--capture', type=Path); parser.add_argument('--verify-current-source', action='store_true'); args = parser.parse_args()
    if args.capture:
        raw = load(args.capture); verify_capture(raw); verify_artifacts(args.capture.parent, raw)
    else: validate(args.root, args.verify_current_source)
    print('phase2 derived-index evidence: PASS (supplemental only; RELEASE BLOCKED)')
