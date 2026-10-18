"""Prepare actual-result reading packets; this does not decide acceptance."""
import argparse,hashlib,json
from pathlib import Path
p=argparse.ArgumentParser();p.add_argument('--repository',type=Path,required=True);p.add_argument('--index',type=Path,required=True);p.add_argument('--output',type=Path,required=True);a=p.parse_args()
root=a.repository;old=json.loads((root/'docs/quality/pr49-followup-2026-10-15/CLAUSE_REVIEW.json').read_bytes());actual=json.loads(a.index.read_bytes());idx={t['testId']:t for t in actual['tests']}
rows=[]
for case in old['cases']:
 prior=next((e for e in case.get('executionEvidence',[]) if e.get('engine')=='chromium'),dict(testIds=[]))
 ids=set(prior['testIds'])|{t['testId'] for t in actual['tests'] if case['id'] in t['caseIds']}
 ts=[idx[i] for i in sorted(ids)]
 sources=[]
 for source in case['procedureSources']:
  data=(root/source['path']).read_bytes();sources.append(dict(path=source['path'],bytes=len(data),currentSHA256=hashlib.sha256(data).hexdigest(),oldSHA256=source['sha256'],unchanged=hashlib.sha256(data).hexdigest()==source['sha256']))
 rows.append(dict(id=case['id'],clauses=[dict(name=c['name'],original=c['original'],sourceInterpretation=c['authorSourceObservation']) for c in case['clauses']],sources=sources,tests=ts,scope='Current observed report and actual attachment bytes; old test IDs are a lookup hint only. No old outcome/UUID/hash is current proof.'))
with a.output.open('x') as f:json.dump(rows,f,ensure_ascii=False,indent=2);f.write('\n')
print(json.dumps(dict(cases=len(rows),clauses=sum(len(r['clauses']) for r in rows),mappedTests=sum(len(r['tests']) for r in rows),changedSources=sorted({s['path'] for r in rows for s in r['sources'] if not s['unchanged']}))))
