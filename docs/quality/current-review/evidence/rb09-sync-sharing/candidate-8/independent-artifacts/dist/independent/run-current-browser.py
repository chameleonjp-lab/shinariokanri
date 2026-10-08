import subprocess,json,pathlib
r=pathlib.Path('/tmp/shinariokanri-independent-rb09-af0c2b9')
files=['browser-current.mjs', 'browser-extra-contracts.mjs', 'browser-account-boundaries.mjs', 'browser-comment-corrected.mjs', 'browser-canonical-cache-corrected.mjs', 'browser-canonical-inputs-observed.mjs', 'browser-canonical-width-final.mjs', 'browser-authority-expiry-corrected.mjs', 'browser-pending-authority-corrected.mjs', 'browser-pending-authority-current.mjs', 'browser-current-expiry-renewal-observed.mjs', 'browser-grant-content-mask.mjs']
results=[]
for f in files:
 with (r/"independent"/(f[:-4]+".log")).open("xb") as out:
  p=subprocess.run(["node","independent/"+f],cwd=r,stdout=out,stderr=subprocess.STDOUT)
 results.append({"file":f,"exitCode":p.returncode})
 print(json.dumps(results[-1]),flush=True)
with (r/"independent"/"browser-run-status.json").open("x") as out:json.dump(results,out,ensure_ascii=False,indent=2);out.write("\n")
