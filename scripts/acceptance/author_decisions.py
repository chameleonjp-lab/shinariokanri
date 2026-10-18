"""Bind explicit author readings to fresh verified proof; never infer pass from counts."""
import argparse, ast, hashlib, json
from pathlib import Path
from datetime import datetime, timezone
from phase3_trace_proofs import verify_trace_inputs,parse_authored_clause_notes

p=argparse.ArgumentParser()
for flag in ('repository','binding','ci','formal-assessment','supplement-assessment','resource-assessment','case-notes','gate-notes','review-procedure','output'):
 p.add_argument('--'+flag,type=Path,required=True)
p.add_argument('--release-proof',type=Path);p.add_argument('--delivery-proof',type=Path)
a=p.parse_args()
read=lambda path:json.loads(path.read_bytes())
sha=lambda data:hashlib.sha256(data).hexdigest()
def require(condition,message):
 if not condition:raise ValueError(message)
def descriptor(path):
 data=path.read_bytes();return dict(path=str(path.resolve()),bytes=len(data),sha256=sha(data))
repo=a.repository.resolve();binding=read(a.binding);product=binding['build_info']
ci=read(a.ci/'RETENTION.json');formal=read(a.formal_assessment);supp=read(a.supplement_assessment);resources=read(a.resource_assessment)
verify_trace_inputs(binding,ci,formal,supp,resources)
proofs={name:descriptor(path) for name,path in [('candidate',a.binding),('ci',a.ci/'RETENTION.json'),('actualLogs',a.ci/'actual-log-index.json'),('formal',a.formal_assessment),('supplements',a.supplement_assessment),('resources',a.resource_assessment)]}
for key,path in [('release',a.release_proof),('delivery',a.delivery_proof)]:
 if path:proofs[key]=descriptor(path)
indices={}
for engine in ('chromium','firefox','webkit'):
 path=a.ci/('case-index-'+engine+'.json');proofs['caseIndex-'+engine]=descriptor(path)
 record=next(row for row in ci['caseIndices'] if row['path']==path.name)
 require(record['bytes']==proofs['caseIndex-'+engine]['bytes'] and record['sha256']==proofs['caseIndex-'+engine]['sha256'],'Actual CI index changed after retention')
 index=read(path);indices[engine]={row['testId']:row for row in index['tests']}
 # The exact inventory is a provenance guard, never an acceptance decision.
 require(len(indices[engine])==249,'Original measured candidate inventory differs')
original=read(repo/'docs/data/acceptance_cases.json')
protocol=read(repo/'docs/quality/pr49-followup-2026-10-15/CLAUSE_REVIEW.json');protocol={row['id']:row for row in protocol['cases']}
notes=parse_authored_clause_notes(a.case_notes.read_text())
# These explicit external reasons are current author readings, not historical
# outcomes. Read the literal dictionary without importing an argparse program.
tree=ast.parse(a.review_procedure.read_text());external=None
for node in tree.body:
 if isinstance(node,ast.Assign) and any(isinstance(t,ast.Name) and t.id=='external' for t in node.targets):external=ast.literal_eval(node.value)
require(isinstance(external,dict) and len(external)==22,'Explicit original external readings missing')
require(not (set(notes)&set(external)) and set(notes)|set(external)=={row['id'] for row in original},'Original cases lack explicit local or external author readings')
cases=[]
for case in original:
 identity=case['id'];refs=[]
 for engine,index in indices.items():
  lookup=next((row for row in protocol[identity].get('executionEvidence',[]) if row.get('engine')==engine),dict(testIds=[]))
  ids=set(lookup['testIds'])|{key for key,row in index.items() if identity in row['caseIds']}
  require(ids<=set(index),'Original test identity missing from fresh actual report')
  refs.extend(dict(proof='caseIndex-'+engine,testId=key) for key in sorted(ids))
 if identity=='AT-N05':refs.append(dict(proof='supplements',section='n05'))
 if identity in external:refs.append(dict(proof='candidate',scope='Source only; original external execution explicitly not_run'))
 else:require(refs,'No fresh actual execution for explicit local case')
 clauses=[]
 for name in ('given','when','then','negative_or_edge'):
  note=('原外部条件の全'+name+'を合格認定しない。'+external[identity]) if identity in external else notes[identity]['clauses'][name]['authorObservation']
  require(len(note)>=12,'Missing substantive clause reading: '+identity+' '+name)
  clauses.append(dict(name=name,originalSHA256=sha(case[name].encode()),authorObservation=note,result='blocked_original_external_conditions' if identity in external else notes[identity]['clauses'][name]['result'],evidenceRefs=refs))
 cases.append(dict(id=identity,wholeCaseResult='blocked' if identity in external else notes[identity]['wholeCaseResult'],clauses=clauses))
original_groups={
 'workPackages':read(repo/'docs/data/work_packages.json'),
 'regressions':read(repo/'docs/data/completion_acceptance.json')['regression_groups'],
 'supplemental':read(repo/'docs/review-2026-10-11/supplemental_acceptance.json'),
}
if isinstance(original_groups['supplemental'],dict):original_groups['supplemental']=original_groups['supplemental']['cases']
gate_notes={name:{} for name in original_groups}
for line in a.gate_notes.read_text().splitlines():
 if not line or line.startswith('#'):continue
 fields=line.split('|');require(len(fields)==5,'Invalid explicit gate reading row')
 kind,identity,result,note,refs=fields
 require(kind in gate_notes and identity not in gate_notes[kind] and len(note)>=20,'Duplicate/missing substantive gate reading')
 gate_notes[kind][identity]=dict(result=result,authorObservation=note,evidenceRefs=refs.split(','))
x_notes={
 'X01':'用途別入口は未採用。既存雛形/表示設定との差を比較し、原連続制作の検証を優先する。',
 'X02':'横断検索は未採用。account/role撤回・索引所有・秘密隔離と性能の別設計が必要。',
 'X03':'本文一括置換は未採用。Unicode/注記/成果物hashと独立preview・原子取消を別受入にする。',
 'X04':'翻訳表の往復は未採用。既存JSONとID/hashを守る版付き交換形式の承認が必要。',
 'X05':'翻訳の埋込語検査は未採用。言語別規則とfalse positiveを作者が確認する設計が必要。',
 'X06':'期待経路test集合は未採用。原trace/seed/unknown/版を保つ期待schemaの別受入が必要。',
 'X07':'BackupReceiptは未採用。estimate・生成・実file検査・実復元確認を別状態として設計する。',
 'X08':'試読から修正と同経路確認は未採用。旧固定版を編集しない作者別案方式の比較が必要。',
 'X09':'任意二版比較は未採用。完全二版oracle・世界closure・Large保持予算の独立設計が必要。',
 'X10':'素材利用条件の拡張は未採用。旧licenseNoteを保ち用途別許可をunknownから移行する設計が必要。',
 'X11':'任意文字数目標は未採用。Unicode算定と重複場面の計数定義を原制作量と分けて承認する。',
 'X12':'限定Twee3は未採用。macroを実行しない対応構文・隔離・sidecar互換の独立設計が必要。',
}
reviews={}
for kind,originals in original_groups.items():
 rows=[]
 for original_row in originals:
  identity=original_row['id']
  if kind=='supplemental' and original_row['owner_id'] in x_notes:
   require(identity not in gate_notes[kind],'X extension must have explicit unadopted policy')
   note=dict(result='unadopted_not_implemented',authorObservation=x_notes[original_row['owner_id']],evidenceRefs=['candidate'])
  else:
   require(identity in gate_notes[kind],'Missing explicit gate reading: '+identity);note=gate_notes[kind][identity]
  require(all(ref in proofs for ref in note['evidenceRefs']),'Unknown proof reference: '+identity)
  encoded=json.dumps(original_row,ensure_ascii=False,sort_keys=True,separators=(',',':')).encode()
  rows.append(dict(id=identity,originalSHA256=sha(encoded),**note))
 require(set(gate_notes[kind])<={row['id'] for row in originals},'Unknown original gate reading')
 reviews[kind]=rows
for identity,key,path in [('AC-G06-E','release',a.release_proof),('AC-G07-E','delivery',a.delivery_proof)]:
 review=next(row for row in reviews['supplemental'] if row['id']==identity)
 if review['result']=='passed_local_original_conditions':require(path is not None and key in review['evidenceRefs'],'Original release/handoff proof not supplied')
result=dict(format='phase3-authored-clause-decisions/1',recordedAt=datetime.now(timezone.utc).isoformat(),product=product,independentHumanReleaseAcceptance=False,scope='Author readings of all original clauses and current actual evidence. These are not independent human release acceptance; whole-case, local gate and dependency completion remain separate.',proofInputs=proofs,readingInputs=[descriptor(a.case_notes),descriptor(a.gate_notes),descriptor(a.review_procedure)],cases=cases,**reviews)
with a.output.open('x') as output:json.dump(result,output,ensure_ascii=False,indent=2);output.write('\n')
print(json.dumps(dict(cases=len(cases),clauses=sum(len(row['clauses']) for row in cases),wholeCaseOutcomes={name:sum(row['wholeCaseResult']==name for row in cases) for name in ('passed','blocked')},reviews={key:len(rows) for key,rows in reviews.items()})))
