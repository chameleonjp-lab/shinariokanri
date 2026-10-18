"""Scan pinned recovered evidence for credential patterns without printing matches."""
import argparse,base64,hashlib,io,json,re,tempfile,zipfile
from datetime import datetime,timezone
from pathlib import Path,PurePosixPath

p=argparse.ArgumentParser();p.add_argument('--location',type=Path,required=True);p.add_argument('--recovered',type=Path,required=True);p.add_argument('--output',type=Path,required=True);a=p.parse_args()
sha=lambda data:hashlib.sha256(data).hexdigest()
started=datetime.now(timezone.utc).isoformat();location_bytes=a.location.read_bytes();location=json.loads(location_bytes)
assert location['format']=='phase3-evidence-location/1'
patterns={
 'github-personal-token':re.compile(rb'(?<![A-Za-z0-9])(?:gh[pousr]_[A-Za-z0-9]{36,255}|github_pat_[A-Za-z0-9_]{70,255})(?![A-Za-z0-9])'),
 'aws-access-key':re.compile(rb'(?<![A-Z0-9])(?:AKIA|ASIA)[A-Z0-9]{16}(?![A-Z0-9])'),
 'private-key-material':re.compile(rb'-----BEGIN (?:RSA |EC |OPENSSH |DSA |ENCRYPTED )?PRIVATE KEY-----'),
 'supabase-secret-key':re.compile(rb'(?<![A-Za-z0-9])sb_secret_[A-Za-z0-9_-]{20,255}'),
 'signed-amazon-url':re.compile(rb'https?://[^\s<>"\x27]{1,3000}X-Amz-Signature=[0-9a-fA-F]{64}'),
 'signed-azure-url':re.compile(rb'https?://[^\s<>"\x27]{1,3000}\.blob\.core\.windows\.net/[^\s<>"\x27]{1,3000}[?&]sig=[^\s<>"\x27]{16,1000}'),
}
jwt=re.compile(rb'eyJ[A-Za-z0-9_-]{5,1000}\.(eyJ[A-Za-z0-9_-]{5,3000})\.[A-Za-z0-9_-]{16,1000}')
pinned_original_negatives={
 'd29eaf524888cf9355e3ce92b22569dd92da38efbf68c82c88a1d061c28fb09e','1aa359b6566139d9b8fc56c3b8974876762f7b9832956022454e87fb2b48ecab',
 '59f4ea500669586957993644e86238f9f45e59083aedf6ccbb2aff0fe7a5d8fe','f15e70d2a6c8a2328a2d8abf1a539279445f359cab4e3283c2aeef9f04086699',
 '03b1eb184ae72f51f52e84c3b1376b5369aa38f6fb0f8b0966aa1b82d083e975','a1518d4c781b2a7009a332d4b7e4886dcc892035ad618f34dd4fbca607600d0d',
 'ed62c26e0f8b2fae9ed51faba4ee3a8b03b82dd22156ed073793e5ca508c9f04'}
findings=[];containers=[];invalid_containers=[];inline_inventory=[];scanned_entries=0;scanned_bytes=0
def inspect_chunk(chunk,name):
 for code,pattern in patterns.items():
  for match in pattern.finditer(chunk):findings.append(dict(path=name,kind=code,matchSHA256=sha(match.group()),scope='Pattern match; value deliberately withheld'))
 for match in jwt.finditer(chunk):
  try:
   part=match.group(1);payload=json.loads(base64.urlsafe_b64decode(part+b'='*((-len(part))%4)))
  except (ValueError,UnicodeDecodeError):continue
  if isinstance(payload,dict) and payload.get('role')=='service_role':findings.append(dict(path=name,kind='service-role-jwt',matchSHA256=sha(match.group()),scope='Privileged service role pattern; value deliberately withheld'))
def stream(source,name,depth=0):
 global scanned_entries,scanned_bytes
 scanned_entries+=1;digest=hashlib.sha256();count=0;tail=b'';first=source.read(65536);nested=first[:4] in (b'PK\x03\x04',b'PK\x05\x06',b'PK\x07\x08')
 probe=first[3:] if first.startswith(b'\xef\xbb\xbf') else first
 meaningful=probe.lstrip();is_json=meaningful[:1] in (b'{',b'[') if meaningful else None
 spool=tempfile.SpooledTemporaryFile(max_size=16*1024*1024) if nested or is_json is not False else None
 try:
  block=first
  while block:
   count+=len(block);digest.update(block);scanned_bytes+=len(block);inspect_chunk(tail+block,name);tail=(tail+block)[-8192:]
   if is_json is None and block is not first:
    meaningful=block.lstrip()
    if meaningful:
     is_json=meaningful[:1] in (b'{',b'[')
     if is_json is False and not nested and spool is not None:spool.close();spool=None
   if spool is not None:spool.write(block)
   block=source.read(1024*1024)
  if nested:
   assert depth<12,'Excessive nested evidence ZIP depth';spool.seek(0)
   try:
    with zipfile.ZipFile(spool) as archive:
     for member in archive.infolist():
      if member.is_dir():continue
      with archive.open(member) as entry:stream(entry,name+'!/'+member.filename,depth+1)
    containers.append(dict(path=name,result='nested_entry_streams_scanned'))
   except (zipfile.BadZipFile,NotImplementedError,RuntimeError) as error:
    pinned=digest.hexdigest() in pinned_original_negatives
    invalid_containers.append(dict(path=name,sha256=digest.hexdigest(),exception=type(error).__name__,immutableOriginalNegative=pinned,scope='Actual raw bytes scanned; expansion exception is allowed only for exact immutable original N09 fixture SHA'))
    if not pinned:findings.append(dict(path=name,kind='unreadable-unpinned-compressed-content',matchSHA256=digest.hexdigest(),scope='Cannot give a complete credential-scan result for this arbitrary unreadable container'))
  elif is_json:
   spool.seek(0)
   try:value=json.load(spool)
   except (ValueError,UnicodeDecodeError,RecursionError):value=None
   stack=[(value,'$')]
   while stack:
    node,pointer=stack.pop()
    if isinstance(node,dict):
     attachments=node.get('attachments')
     if isinstance(attachments,list):
      for ordinal,row in enumerate(attachments):
       if not isinstance(row,dict) or 'body' not in row or not isinstance(row.get('name'),str) or not isinstance(row.get('contentType'),str):continue
       label=name+'!inline/'+pointer+'/attachments/'+str(ordinal)
       try:payload=base64.b64decode(row['body'],validate=True)
       except (ValueError,TypeError):
        findings.append(dict(path=label,kind='unreadable-inline-attachment',matchSHA256=sha(json.dumps(row,sort_keys=True).encode()),scope='Inline body is not valid base64'));continue
       assert depth<12,'Excessive nested inline evidence depth'
       inline_inventory.append(dict(path=label,bytes=len(payload),sha256=sha(payload),contentType=row['contentType']))
       stream(io.BytesIO(payload),label,depth+1)
     stack.extend((child,pointer+'/'+str(key)) for key,child in node.items() if isinstance(child,(dict,list)))
    elif isinstance(node,list):stack.extend((child,pointer+'/'+str(index)) for index,child in enumerate(node) if isinstance(child,(dict,list)))
  return count,digest.hexdigest()
 finally:
  if spool is not None:spool.close()
actual_files=0;bundles=[];scanned_inventory=[]
for row in location['bundles']:
 label=row['label'];relative=PurePosixPath(label);assert not relative.is_absolute() and '..' not in relative.parts and relative.as_posix()==label
 root=a.recovered/label;raw=(root/'manifest.json').read_bytes();assert len(raw)==row['bytes'] and sha(raw)==row['sha256'];manifest=json.loads(raw)
 expected={item['path']:item for item in manifest['files']};assert len(expected)==len(manifest['files'])
 actual={str(path.relative_to(root/'actual')) for path in (root/'actual').rglob('*') if path.is_file()};assert actual==set(expected)
 for name,record in expected.items():
  relative=PurePosixPath(name);assert not relative.is_absolute() and '..' not in relative.parts and relative.as_posix()==name
  path=root/'actual'/name;assert path.is_file() and not path.is_symlink()
  with path.open('rb') as source:count,digest=stream(source,label+'/'+name)
  assert count==record['bytes'] and digest==record['sha256'];actual_files+=1
  scanned_inventory.append(dict(path=label+'/'+name,bytes=count,sha256=digest))
 bundles.append(dict(label=label,manifestSHA256=sha(raw),actualFiles=len(expected)))
unique={(row['path'],row['kind'],row['matchSHA256']):row for row in findings};findings=list(unique.values())
inventory_bytes=json.dumps(sorted(scanned_inventory,key=lambda row:row['path']),sort_keys=True,separators=(',',':')).encode()
inline_bytes=json.dumps(sorted(inline_inventory,key=lambda row:row['path']),sort_keys=True,separators=(',',':')).encode()
result=dict(format='phase3-evidence-credential-scan/1',status='passed_no_unexpected_credentials' if not findings else 'rejected_incomplete_or_potential_credentials',startedAt=started,finishedAt=datetime.now(timezone.utc).isoformat(),locationSHA256=sha(location_bytes),procedureSHA256=sha(Path(__file__).read_bytes()),scannedActualFiles=actual_files,scannedInventorySHA256=sha(inventory_bytes),scannedEntriesIncludingNested=scanned_entries,scannedBytesIncludingNested=scanned_bytes,bundles=bundles,decodedInlineAttachments=len(inline_inventory),decodedInlineInventorySHA256=sha(inline_bytes),inlineAttachmentScanComplete=True,unexpectedFindings=findings,nestedContainers=len(containers),invalidNestedContainers=invalid_containers,scope='Pattern scan over every manifest-pinned actual file, decoded Playwright inline attachment bodies and their nested ZIP entries. Unreadable arbitrary containers reject success; only exact original N09 hashes permit an expansion exception. High-confidence tokens, private keys, privileged service JWTs and signed cloud URLs are checked; synthetic SECRET text is not a credential. This is not a general secrecy, authorization or native-importability certification.')
with a.output.open('x') as output:json.dump(result,output,ensure_ascii=False,indent=2);output.write('\n')
print(json.dumps(dict(status=result['status'],actualFiles=actual_files,entries=scanned_entries,potentialCredentialCount=len(findings))))
raise SystemExit(1 if findings else 0)
