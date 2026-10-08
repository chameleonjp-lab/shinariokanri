from pathlib import Path
import subprocess,time,json
p=Path('/tmp/shinariokanri-independent-rb09-4d14113');q=p/'independent';name='shinariokanri-independent-rb09-4d14113';rows=[]
for _ in range(30):
 x=subprocess.run(['docker','exec',name,'pg_isready','-U','postgres'],stdout=subprocess.PIPE,stderr=subprocess.PIPE)
 if x.returncode==0:break
 time.sleep(.2)
else:raise RuntimeError('Independent SQL never ready')
files=[p/'tests/fixtures/sync/postgres-auth-storage-fixture.sql',*sorted((p/'supabase/migrations').glob('*.sql')),p/'tests/fixtures/sync/rls-contract.sql',q/'sql-original-seed-committed.sql',q/'sql-null-comment-refusal-adapter.sql']
for i,f in enumerate(files):
 log=q/('sql-auth-storage-mock.log' if i==0 else 'sql-migration'+str(i)+'.log' if 1<=i<=8 else 'sql-original-rls.log' if i==9 else 'sql-seed-committed.log' if i==10 else 'sql-null-comment-refusal.log')
 r=subprocess.run(['docker','exec','-i',name,'psql','-U','postgres','-d','postgres','-v','ON_ERROR_STOP=1','-f','-'],input=f.read_bytes(),stdout=subprocess.PIPE,stderr=subprocess.STDOUT);log.write_bytes(r.stdout);rows.append({'file':str(f.relative_to(p)),'log':str(log.relative_to(p)),'exitCode':r.returncode})
 if r.returncode:break
(q/'sql-setup-results.json').write_text(json.dumps({'freshNetworkNoneOnly':True,'rows':rows},ensure_ascii=False,indent=2)+'\n');print(json.dumps(rows,ensure_ascii=False))
if any(r['exitCode'] for r in rows):raise SystemExit(1)
