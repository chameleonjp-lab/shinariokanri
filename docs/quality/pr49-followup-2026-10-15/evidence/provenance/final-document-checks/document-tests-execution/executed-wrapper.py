"""Run a single authorized verification and retain its real child exit status."""
import argparse, hashlib, json, os, subprocess, sys, time
from datetime import datetime, timezone
from pathlib import Path

p=argparse.ArgumentParser(description=__doc__)
p.add_argument('--workdir',type=Path,required=True)
p.add_argument('--receipt',type=Path,required=True)
p.add_argument('command',nargs=argparse.REMAINDER)
a=p.parse_args();command=a.command[1:] if a.command and a.command[0]=='--' else a.command
assert command
a.receipt.mkdir(parents=True,exist_ok=False)
utc=lambda:datetime.now(timezone.utc).isoformat()
sha=lambda raw:hashlib.sha256(raw).hexdigest()
def write(name,value):
 target=a.receipt/name;temporary=target.with_suffix(target.suffix+'.tmp')
 temporary.write_text(json.dumps(value,ensure_ascii=False,indent=2)+'\n');temporary.replace(target)
procedure_bytes=Path(__file__).read_bytes();(a.receipt/'executed-wrapper.py').write_bytes(procedure_bytes)
record={'startedAt':utc(),'cwd':str(a.workdir),'argv':command,'procedure':{'path':str(Path(__file__).resolve()),'retained':'executed-wrapper.py','bytes':len(procedure_bytes),'sha256':sha(procedure_bytes)},'environmentSelectors':{key:os.environ[key] for key in ['CHROMIUM_PATH','PLAYWRIGHT_BROWSERS_PATH','RG01_OUTPUT_DIR','N05_DOWNLOADS_PATH','PLAYWRIGHT_JSON_OUTPUT_NAME','CI','APP_BASE'] if key in os.environ},'scope':'Real child status retained by its parent across tool-session reconnection. Wrapper wall time is not a performance metric.'}
write('command.json',record);started=time.monotonic();log=a.receipt/'stdout-stderr.log'
try:
 with log.open('xb') as output:
  child=subprocess.Popen(command,cwd=a.workdir,stdout=output,stderr=subprocess.STDOUT)
  record['childPid']=child.pid;write('command.json',record)
  print(json.dumps({'started':True,'childPid':child.pid,'receipt':str(a.receipt)}),flush=True)
  code=child.wait()
 result={'finishedAt':utc(),'returncode':code,'elapsedWallSeconds':time.monotonic()-started,'log':{'path':str(log),'bytes':log.stat().st_size,'sha256':sha(log.read_bytes())},'childPid':child.pid,'executedWrapperBytesUnchanged':Path(__file__).read_bytes()==procedure_bytes,'scope':'Observed child exit code; acceptance is judged separately from actual retained results.'}
 write('exit.json',result);print(json.dumps(result),flush=True)
except BaseException as error:
 write('wrapper-error.json',{'at':utc(),'type':type(error).__name__,'message':str(error),'elapsedWallSeconds':time.monotonic()-started});raise
raise SystemExit(code if code>=0 else 128-code)
