import json,zipfile,hashlib,re,subprocess
from pathlib import Path
from urllib.parse import urlparse,unquote
b=Path('/workspace/pr49-checks');root=Path('/workspace/pr49-graph-measure-source');p=b/'manual-candidate-1fcadcca-final-pr58.zip';receipt=json.loads((b/'manual-final-pr58-preparation/build-execution/stdout-stderr.log').read_text());sha=lambda v:hashlib.sha256(v).hexdigest();raw=p.read_bytes();assert len(raw)==receipt['bytes'] and sha(raw)==receipt['sha256']
binding=json.loads((b/'candidate-1fcadcca/binding.json').read_text())
with zipfile.ZipFile(p) as z:
 assert len(z.namelist())==25 and len(set(z.namelist()))==25 and z.testzip() is None
 manifest=json.loads(z.read('MANIFEST.json'));assert manifest['target']==binding['product']
 assert {f['path'] for f in manifest['files']}|{'MANIFEST.json'}==set(z.namelist())
 for f in manifest['files']:v=z.read(f['path']);assert len(v)==f['bytes'] and sha(v)==f['sha256']
 for f in binding['distFiles']:v=z.read('shinariokanri/'+f['path']);assert len(v)==f['bytes'] and sha(v)==f['sha256']
 guide=z.read('MANUAL_REVIEW.md').decode();assert 'https://github.com/chameleonjp-lab/shinariokanri/pull/58' in guide and '別アカウント' in guide
 links=re.findall(r'\]\(([^)]+)\)',guide)
 for url in links:
  assert url.startswith('https://')
  parsed=urlparse(url)
  if '/blob/'+binding['product']['commit']+'/' in parsed.path:
   path=unquote(parsed.path.split('/blob/'+binding['product']['commit']+'/',1)[1]);subprocess.check_call(['git','cat-file','-e',binding['product']['commit']+':'+path],cwd=root)
 assert sha(z.read('AT-F01-given.scenario'))=='71a6a7abd67ea17b45113628ab366a98bae810ee77f4bc3306ae9a9cae8bc043'
 out={'result':'passed_local_packet_integrity_and_link_targets','zip':p.name,'bytes':len(raw),'sha256':sha(raw),'members':25,'exactDistFiles':13,'manifestAllFilesVerified':True,'guideHTTPSLinks':links,'product':binding['product'],'upload':'not_performed; prior086 Drive auto-review rejection and unanswered explicit payload approval remain','physicalAcceptance':False}
(b/'manual-final-pr58-preparation/verification.json').write_text(json.dumps(out,ensure_ascii=False,indent=2)+'\n');print(json.dumps(out,ensure_ascii=False))
