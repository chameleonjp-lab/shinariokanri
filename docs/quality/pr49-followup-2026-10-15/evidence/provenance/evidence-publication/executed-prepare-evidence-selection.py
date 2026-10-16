"""Produce an explicit, inspectable selection of original test evidence files."""
import argparse
import json
from pathlib import Path

p = argparse.ArgumentParser(description=__doc__)
p.add_argument('--negative-attempt', type=Path, required=True)
p.add_argument('--output', type=Path, required=True)
a = p.parse_args()
assert not a.output.exists()
checks = Path('/workspace/pr49-checks')
bench = Path('/workspace/pr49-benchmark')
groups = []

def group(label, scope):
    row = {'label': label, 'scope': scope, 'files': []}
    groups.append(row)
    return row

def file(g, source, name=None):
    source = Path(source)
    assert source.is_file() and not source.is_symlink(), source
    g['files'].append({'source': str(source), 'path': name or str(source.relative_to(checks))})

def directory(g, source, prefix=None, exclude=()):
    source = Path(source)
    assert source.is_dir(), source
    for path in sorted(source.rglob('*')):
        if not path.is_file():
            continue
        rel = str(path.relative_to(source))
        if any(rel == e or rel.startswith(e + '/') for e in exclude):
            continue
        file(g, path, (prefix + '/' + rel) if prefix else None)

g = group('formal-1fcadcca', 'Actual clean-product Standard/Large30, original180, actual7200 and full original oracle. Managed Linux; no physical-device certification.')
for name in ['performance-standard-1fcadcca-attempt1', 'performance-large-1fcadcca-attempt1', 'original180-1fcadcca-attempt1', 'soak7200-1fcadcca-attempt1']:
    directory(g, checks / name)
directory(g, bench / 'results/pr49-1fcadcca-original180-attempt1', 'original180-actual-output')
for name in ['run-original-six-forms-1fcadcca.mjs', 'run-original-six-forms-1fcadcca.binding-only.json', 'candidate-1fcadcca-binding.json']:
    file(g, bench / name, 'benchmark-procedures/' + name)
file(g, checks / 'candidate-1fcadcca/cp05-change-impact.json')

g = group('full-large-exceptions-1fcadcca', 'Same unchanged actual full Large113 file, three malformed files, late native generic/quota aborts, normal retry and unchanged original cold oracle. Empty isolated destination only.')
directory(g, a.negative_attempt, 'actual-attempt')

g = group('product-ci-1fcadcca', 'Actual product CI merge819b178f/tree8ac6, all228 results and retained actual per-case bytes for three engines. Does not infer acceptance from counts/titles.')
directory(g, checks / 'ci-1fcadcca', exclude=('archives', 'selected-original-results.json.gz'))
# The selected report is a large duplicate of original parsed objects; actual
# per-test results and every attachment are retained in each engine index/raw.
g['files'] = [r for r in g['files'] if not r['path'].endswith('/selected-original-results.json.gz') and not r['path'].endswith('.zip')]
for name in ['verify-ci-archive-bound.py', 'index-current-case-evidence.py', 'resolve-case-evidence-references.py', 'derive-unit-execution-index.py', 'show-current-case-observations.py']:
    file(g, checks / name, 'actual-review-procedures/' + name)

g = group('additional-original-regressions-1fcadcca', 'Actual normal UI R02/R03 on exact original unchanged fixture functions; composed with original unit and3engine CI evidence, no physical certification.')
directory(g, checks / 'rg02-rg03-same-given-1fcadcca-attempt1')

g = group('unaffected-local-3ab6', 'Actual original N05 Large and same-given R01 evidence executed on3ab6. Explicit unchanged-source impact binding permits only named unaffected local carry; real IME remains unrun.')
directory(g, checks / 'n05-original-3ab6f40-attempt2', exclude=('downloads', 'test-results'))
directory(g, checks / 'rg01-same-given-3ab6f40-attempt1')
# Preserve original duplicate download paths in the capture/retention metadata,
# while storing one physical copy of each byte-identical actual download.
seen = {}
kept = []
g['byteIdenticalActualSources'] = []
for row in g['files']:
    if '/retained-downloads/' in row['path']:
        size = Path(row['source']).stat().st_size
        import hashlib
        key = (size, hashlib.sha256(Path(row['source']).read_bytes()).hexdigest())
        if key in seen:
            g['byteIdenticalActualSources'].append({'originalSourcePath': row['source'],
                'sameBytesAs': seen[key]['path'], 'bytes': size, 'sha256': key[1],
                'scope': 'Two separately captured actual downloads have exactly equal bytes. One physical bundle copy preserves both byte identities; original capture metadata remains separate.'})
            continue
        seen[key] = row
    kept.append(row)
g['files'] = kept

g = group('historical-and-failed-checks', 'Preserved historical failed Standard measurements and diagnostic0 full recovery, with actual executed sources. Not fresh product acceptance or actual7200 evidence.')
for name in ['performance-standard-3ab6f40-attempt1', 'large-3ab6f40-attempt1']:
    directory(g, checks / name, exclude=('source-snapshot', 'dist'))
for name in ['graph-props-precommit-standard30-attempt1', 'graph-subtrees-precommit-standard30-attempt1', 'graph-batched-coordinates-precommit-standard30-attempt1', 'graph-containment-precommit-standard30-attempt1', 'graph-numeric-buckets-precommit-standard30-attempt1', 'graph-edge-reuse-precommit-standard30-attempt1', 'graph-canvas-layer-precommit-standard30-attempt1', 'label-geometry-equivalence-precommit-attempt1', 'graph-final-precommit-e2e-attempt1']:
    directory(g, checks / name)
for name in ['import-398c32-persistent-clone-observed-attempt2', 'import-472f546-new-attempt1', 'import-8d97372-persistent-clone-cpu-attempt2', 'import-a72fb0c-new-attempt1', 'import-a8d3abc-new-attempt1']:
    directory(g, checks / name, exclude=('empty-persistent-profile',))
for name in ['native-capacity-small-values-472-attempt1', 'native-capacity-small-values-persistent-batched-472-attempt1']:
    directory(g, checks / name)

g = group('historical-ci-3ab6', 'Actual historical CI3ab6, preserved under its own source/build identity. Fresh1fc acceptance uses its separate current CI evidence.')
directory(g, checks / 'ci-3ab6')
g['files'] = [r for r in g['files'] if not r['path'].endswith('/selected-original-results.json.gz') and not r['path'].endswith('.zip')]
for name in ['ci-3ab6-chromium.log', 'ci-3ab6-firefox.log', 'ci-3ab6-unit.log', 'ci-3ab6-webkit.log']:
    file(g, checks / name)

g = group('retention-delivery-1e77', 'Actual provisional retention workflow and delivery CI provenance. The provisional release checker was blocked; this is not the final release record.')
directory(g, checks / 'retention-1e77dd40')

for g in groups:
    assert len({r['path'] for r in g['files']}) == len(g['files'])
    assert not any('manual-candidate' in Path(r['source']).name for r in g['files'])
    for row in g['files']:
        assert 'profile' not in Path(row['source']).parts
    print(json.dumps({'group': g['label'], 'files': len(g['files']),
        'bytes': sum(Path(r['source']).stat().st_size for r in g['files']),
        'largest': sorted([{'path': r['path'], 'bytes': Path(r['source']).stat().st_size} for r in g['files']], key=lambda r: -r['bytes'])[:5]}))
a.output.write_text(json.dumps({'scope': 'Explicit retained evidence selection. Actual source/dist identity is sealed separately; no manual distribution packet or CI archive duplication. Original provider ZIPs and reserialized selected-original-results.json.gz duplicates are intentionally omitted, never claimed as locally retained bundle members. Current CI exact whole results.json bytes are retained separately in the index SHA-addressed raw gzip; original provider links/digests/expiry and historical subset scope remain explicit.', 'groups': groups}, ensure_ascii=False, indent=2) + '\n')
