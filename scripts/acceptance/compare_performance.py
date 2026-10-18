"""Compute transparent comparisons from retained original raw observations."""
import argparse,hashlib,json,math,statistics
from pathlib import Path
p=argparse.ArgumentParser();p.add_argument('--repository',type=Path,required=True);p.add_argument('--first',type=Path,required=True);p.add_argument('--final',type=Path,required=True);p.add_argument('--output',type=Path,required=True);a=p.parse_args()
sha=lambda b:hashlib.sha256(b).hexdigest()
def read(path):
 data=path.read_bytes();return json.loads(data),dict(path=str(path),bytes=len(data),sha256=sha(data))
keys=('cached_startup','selection','list_switch','compound_search','command_save','next_period','timeline_frames','graph_frames')
limits={'standard':(3000,200,200,500,1000,200,33.4,33.4),'large':(10000,None,None,2000,None,None,None,None)}
result=dict(format='phase3-formal-performance-comparison/1',unit='milliseconds',p95='nearest rank: sorted sample at ceil(0.95*n)-1; no interpolation',scope='Historical baseline and earlier formal attempt remain separate. Host/browser/build and time differ; relative differences alone do not establish causal product improvement. No new pass limit is assigned to the six original unbounded Large metrics.',sizes={})
for size in ('standard','large'):
 paths={'historical59':a.repository/f'docs/optimization/phase1/evidence/baseline-{size}30.json','historicalPhase1Candidate':a.repository/f'docs/optimization/phase1/evidence/candidate-{size}30.json','firstFormalAttempt':a.first/f'performance-{size}/raw.json','finalFormalCandidate':a.final/f'performance-{size}/raw.json'}
 runs={};descriptions={}
 for name,path in paths.items():
  run,description=read(path);runs[name]=run;descriptions[name]=dict(**description,sourceCommit=run['sourceCommit'],build=run['buildInfo'],environment=run['environment'],fixture=run['fixture'])
 for run in runs.values():assert run['fixture']==runs['finalFormalCandidate']['fixture']
 rows=[]
 for key,limit in zip(keys,limits[size]):
  values={}
  for name,run in runs.items():
   metric=run['measurements'][key];samples=metric['milliseconds'];n=len(samples);assert n==(330 if key in ('timeline_frames','graph_frames') else 30)
   rank=sorted(samples)[math.ceil(0.95*n)-1];assert metric['p95']==rank
   values[name]=dict(samples=n,p95=rank,median=statistics.median(samples),maximum=max(samples))
  final=values['finalFormalCandidate']['p95'];baseline=values['historical59']['p95']
  rows.append(dict(metric=key,originalLimitMs=limit,finalOriginalNumericResult='observation_only_no_original_upper_bound' if limit is None else 'passed' if final<=limit else 'failed',observations=values,finalMinusHistorical59Ms=final-baseline,finalRelativeHistorical59Percent=(final/baseline-1)*100))
 command=runs['finalFormalCandidate']['measurements']['command_save'];stages=[v['milliseconds'] for v in command['stages']];assert len(stages)==30
 means={k:statistics.fmean(v[k] for v in stages) for k in stages[0]}
 stage_summary={k:dict(meanMs=mean,p95Ms=sorted(v[k] for v in stages)[28],shareOfMeanInstrumentedTotal=mean/means['total']) for k,mean in means.items()}
 result['sizes'][size]=dict(sources=descriptions,metrics=rows,finalSaveStageMeans=stage_summary,stageScope='Thirty corresponding original command samples. Means may be compared as contributions to mean total. Per-stage p95 values are not added; no latency or correctness requirement is relaxed.')
with a.output.open('x') as f:json.dump(result,f,ensure_ascii=False,indent=2);f.write('\n')
for size,row in result['sizes'].items():
 print(size,[(m['metric'],m['observations']['finalFormalCandidate']['p95'],m['finalRelativeHistorical59Percent']) for m in row['metrics']])
 print('save stage means', {k:round(v['meanMs'],2) for k,v in row['finalSaveStageMeans'].items()})
