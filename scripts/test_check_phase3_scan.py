"""Credential scanner preserves synthetic SECRET text and rejects token patterns."""
import base64,hashlib,io,json,subprocess,sys,tempfile,unittest,zipfile
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]
sha=lambda data:hashlib.sha256(data).hexdigest()

class CredentialScanBoundaryTests(unittest.TestCase):
 def run_scan(self,payload,alter=False):
  with tempfile.TemporaryDirectory() as directory:
   root=Path(directory);actual=root/'recovered/synthetic/actual';actual.mkdir(parents=True)
   (actual/'input.bin').write_bytes(payload+(b'changed' if alter else b''))
   manifest=json.dumps(dict(files=[dict(path='input.bin',bytes=len(payload),sha256=sha(payload))])).encode();(actual.parent/'manifest.json').write_bytes(manifest)
   location=root/'location.json';location.write_text(json.dumps(dict(format='phase3-evidence-location/1',bundles=[dict(label='synthetic',bytes=len(manifest),sha256=sha(manifest))])))
   output=root/'scan.json';process=subprocess.run([sys.executable,str(ROOT/'scripts/acceptance/scan_evidence.py'),'--location',str(location),'--recovered',str(root/'recovered'),'--output',str(output)],capture_output=True,text=True)
   return process,json.loads(output.read_bytes()) if output.exists() else None
 def test_synthetic_secret_marker_is_not_a_credential(self):
  process,result=self.run_scan(b'SECRET_NOT_PUBLIC synthetic manuscript fixture')
  self.assertEqual(process.returncode,0,process.stderr);self.assertEqual(result['unexpectedFindings'],[]);self.assertEqual(result['scannedActualFiles'],1)
 def test_nested_token_pattern_is_rejected_without_exposing_the_match(self):
  token=('gh'+'p_'+'A'*36).encode();buffer=io.BytesIO()
  with zipfile.ZipFile(buffer,'w') as archive:archive.writestr('synthetic.txt',b'token='+token+b'\n')
  process,result=self.run_scan(buffer.getvalue())
  self.assertEqual(process.returncode,1,process.stderr);self.assertTrue(result['unexpectedFindings']);self.assertGreater(result['scannedEntriesIncludingNested'],1)
  self.assertNotIn(token.decode(),json.dumps(result)+process.stdout+process.stderr)
 def test_changed_actual_file_is_rejected_even_without_any_credential(self):
  process,result=self.run_scan(b'no credentials',alter=True)
  self.assertNotEqual(process.returncode,0);self.assertIsNone(result)
 def test_unreadable_unpinned_zip_cannot_receive_a_successful_scan(self):
  token=('gh'+'p_'+'A'*36).encode();buffer=io.BytesIO()
  with zipfile.ZipFile(buffer,'w',compression=zipfile.ZIP_DEFLATED) as archive:archive.writestr('synthetic.txt',token)
  payload=bytearray(buffer.getvalue());payload[8:10]=(99).to_bytes(2,'little');central=payload.index(b'PK\x01\x02');payload[central+10:central+12]=(99).to_bytes(2,'little')
  process,result=self.run_scan(payload)
  self.assertNotEqual(process.returncode,0);self.assertTrue(result['invalidNestedContainers'])
 def test_inline_playwright_body_is_decoded_and_scanned(self):
  token=('gh'+'p_'+'A'*36).encode();payload=json.dumps(dict(attachments=[dict(name='synthetic.txt',contentType='text/plain',body=base64.b64encode(token).decode())])).encode()
  process,result=self.run_scan(payload)
  self.assertEqual(process.returncode,1,process.stderr);self.assertEqual(result['decodedInlineAttachments'],1);self.assertTrue(result['unexpectedFindings'])
  self.assertNotIn(token.decode(),json.dumps(result)+process.stdout+process.stderr)

if __name__=='__main__':unittest.main()
