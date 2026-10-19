"""Re-execute exact original supplementary UI regressions and retain N05 detail."""
import argparse,hashlib,json,os,shutil,subprocess,sys,tempfile
from pathlib import Path
p=argparse.ArgumentParser();p.add_argument('--repository',type=Path,required=True);p.add_argument('--binding',type=Path,required=True);p.add_argument('--historical',type=Path,required=True);p.add_argument('--output',type=Path,required=True);a=p.parse_args()
repo=a.repository.resolve();a.binding=a.binding.resolve();a.historical=a.historical.resolve();output=a.output.resolve();output.mkdir(exist_ok=False)
binding=json.loads(a.binding.read_bytes());build=binding['build_info']
sha=lambda b:hashlib.sha256(b).hexdigest()
def git(*args):return subprocess.check_output(['git',*args],cwd=repo,text=True).strip()
def seal():
 assert git('rev-parse','HEAD')==binding['commit'] and git('status','--porcelain')==''
 for row in binding['source_files']+binding['artifact_files']+binding['original_documents']+[binding['generated_runtime']]:
  b=(repo/row['path']).read_bytes();assert len(b)==row['bytes'] and sha(b)==row['sha256']
seal();shutil.copyfile(__file__,output/'executed-procedure.py')
source1=a.historical/'unaffected-local-3ab6/rg01-same-given-3ab6f40-attempt1/executed-inputs'
source23=a.historical/'additional-original-regressions-1fcadcca/rg02-rg03-same-given-1fcadcca-attempt1/executed-inputs'
plan={'format':'phase3-supplementary-originals/1','product':build,'bindingSHA256':sha(a.binding.read_bytes()),'steps':[],'scope':'Exact original RG01/02/03 supplementary procedures with checkout/build/output paths rebound; original tests, fixtures, assertion limits and counts preserved. N05 original test uses JSON reporter to retain successful inline attachments. Physical IME remains not_run.'}
def save(): (output/'sequence.json').write_text(json.dumps(plan,ensure_ascii=False,indent=2)+'\n')
save()
def portable(path):
 text=path.read_text();return text.replace('/workspace/pr49-graph-measure-source',str(repo)).replace('/workspace/pr49-measure-source',str(repo))
def run(name,inputs,config,env):
 seal();directory=output/name;directory.mkdir();originals=directory/'originals';retained=directory/'executed-inputs';originals.mkdir();retained.mkdir()
 with tempfile.TemporaryDirectory(prefix='phase3-extra-',dir=output.parent) as stage:
  stage=Path(stage);(stage/'node_modules').symlink_to(repo/'node_modules',target_is_directory=True)
  rows=[]
  for name1,source,content in inputs:
   old=source.read_bytes();(originals/name1).write_bytes(old);data=content.encode();(stage/name1).write_bytes(data);(retained/name1).write_bytes(data)
   rows.append(dict(path=name1,originalBytes=len(old),originalSHA256=sha(old),executedBytes=len(data),executedSHA256=sha(data)))
  (stage/'playwright.config.mjs').write_text(config);(retained/'playwright.config.mjs').write_text(config)
  row=dict(step=name,inputs=rows,configSHA256=sha(config.encode()),stagingDirectory=str(stage),status='running');plan['steps'].append(row);save()
  command=['npx','playwright','test','-c',str(stage/'playwright.config.mjs')]
  wrapper=[sys.executable,str(repo/'scripts/acceptance/execute.py'),'--workdir',str(repo),'--receipt',str(directory/'execution'),'--',*command]
  code=subprocess.call(wrapper,cwd=repo,env={**os.environ,**env});row['returncode']=code;row['status']='passed' if code==0 else 'failed';save()
  assert code==0,(name,code)
 seal()

# Exact original body and seed; all original operation/time assertions remain.
d=output/'rg01';config=portable(source1/'playwright.config.mjs')
run('rg01',[(n,source1/n,portable(source1/n)) for n in ('rg01.spec.ts','rebound-original-seed.ts','package.json')],config,{'RG01_OUTPUT_DIR':str(d),'CI':'1'})
# Bind the two existing exact product assertions to this clean candidate.
text=portable(source23/'same-given.spec.ts')
for old,new in [('1fcadcca703863873a57d297e83b1b184e63e778',binding['commit']),('8ec3a03810bb0cf1b1b4',build['version'])]:
 assert text.count(old)==1;text=text.replace(old,new)
d=output/'rg02-rg03';config=portable(source23/'playwright.config.mjs').replace('/workspace/pr49-checks/rg02-rg03-same-given-1fcadcca-attempt1',str(d))
original_source=(source23/'original-runtime-regressions.test.ts').read_bytes();current=(repo/'tests/runtime-regressions.test.ts').read_bytes()
assert original_source==current,'Original runtime fixture source has changed; inspect before proceeding'
run('rg02-rg03',[(n,source23/n,text if n=='same-given.spec.ts' else portable(source23/n)) for n in ('same-given.spec.ts','original-fixtures.ts','original-runtime-regressions.test.ts','package.json')],config,{'CI':'1'})
# The driver wraps the unchanged N05 body with an automatic download fixture.
# It owns the unused n05 directory and retains the real Playwright child receipt.
seal();d=output/'n05';driver=repo/'scripts/acceptance/capture_n05_downloads.mjs'
command=['node',str(driver),'--repository',str(repo),'--binding',str(a.binding),'--output',str(d)]
row=dict(step='n05',argv=command,originalSHA256=sha((repo/'tests/rb10/large-analysis.spec.ts').read_bytes()),driverSHA256=sha(driver.read_bytes()),status='running');plan['steps'].append(row);save()
code=subprocess.call([sys.executable,str(repo/'scripts/acceptance/execute.py'),'--workdir',str(repo),'--receipt',str(output/'n05-capture-execution'),'--',*command],cwd=repo,env={**os.environ,'CI':'1'})
row['returncode']=code;row['status']='passed' if code==0 else 'failed';save();assert code==0;seal()
plan['status']='completed';save()
# Assess original manifests, allowed transformations, real exits and attachments.
verifier=repo/'scripts/acceptance/verify_supplements.py';shutil.copyfile(verifier,output/'executed-verifier.py')
command=[sys.executable,str(verifier),'--repository',str(repo),'--binding',str(a.binding),'--historical',str(a.historical),'--output',str(output)]
code=subprocess.call([sys.executable,str(repo/'scripts/acceptance/execute.py'),'--workdir',str(repo),'--receipt',str(output/'assessment-execution'),'--',*command],cwd=repo)
plan['assessment']=dict(argv=command,verifierSHA256=sha(verifier.read_bytes()),returncode=code,status='passed' if code==0 else 'failed');save();assert code==0;seal()
print('Original supplementary executions and independent attachment assessment passed; formal and external acceptance remain separate')
