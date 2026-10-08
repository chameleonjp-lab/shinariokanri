import {describe,it,expect} from 'vitest';
import {detectAsset,prepareAsset,safeExternalUrl} from '../src/domain/attachments';
describe('attachment boundaries',()=>{
 it('rejects an HTML/SVG payload even when named as an image',async()=>{
  await expect(prepareAsset(new TextEncoder().encode('<svg onload="alert(1)"></svg>'),'photo.png')).rejects.toThrow('VALIDATION_FAILED');
 });
 it('hashes bytes, derives a safe path and keeps display names out of paths',async()=>{
  const asset=await prepareAsset(new Uint8Array([137,80,78,71,13,10,26,10]),'../../secret.png');
  expect(asset.assetPath).toMatch(/^assets\/[0-9a-f]{64}\.png$/);expect(asset.byteSize).toBe(8);expect(asset.displayName).toBe('../../secret.png');
 });
 it('never embeds PDF and blocks active URLs',()=>{
  expect(detectAsset(new TextEncoder().encode('%PDF-1.7')).preview).toBe('download_only');
  for(const url of ['javascript:alert(1)','data:text/html,hello','https://user:secret@example.com','file:///etc/passwd'])expect(safeExternalUrl(url)).toBeNull();
  expect(safeExternalUrl('https://example.com/')).toBe('https://example.com/');
 });
});
