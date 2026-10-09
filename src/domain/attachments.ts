/** Never display active documents (HTML/SVG) or trust a filename/MIME supplied by a file. */
export type SafeAssetKind = 'png' | 'jpg' | 'gif' | 'webp' | 'wav' | 'mp3' | 'ogg' | 'mp4' | 'webm' | 'pdf' | 'txt' | 'json' | 'bin';
export interface PreparedAsset { bytes: Uint8Array; contentHash: string; byteSize: number; mediaType: string; assetPath: string; displayName: string; preview: 'image' | 'audio' | 'video' | 'download_only' }
const MAX = 32 * 1024 * 1024;
function ascii(bytes: Uint8Array, offset: number, text: string) { return [...text].every((char,i)=>bytes[offset+i]===char.charCodeAt(0)); }
export function detectAsset(bytes: Uint8Array, declaredType?: string): { kind: SafeAssetKind; mediaType: string; preview: PreparedAsset['preview'] } {
 if(bytes.length>=8 && [137,80,78,71,13,10,26,10].every((v,i)=>bytes[i]===v)) return {kind:'png',mediaType:'image/png',preview:'image'};
 if(bytes.length>=3 && bytes[0]===255 && bytes[1]===216 && bytes[2]===255) return {kind:'jpg',mediaType:'image/jpeg',preview:'image'};
 if(ascii(bytes,0,'GIF87a') || ascii(bytes,0,'GIF89a')) return {kind:'gif',mediaType:'image/gif',preview:'image'};
 if(ascii(bytes,0,'RIFF') && ascii(bytes,8,'WEBP')) return {kind:'webp',mediaType:'image/webp',preview:'image'};
 if(ascii(bytes,0,'RIFF') && ascii(bytes,8,'WAVE')) return {kind:'wav',mediaType:'audio/wav',preview:'audio'};
 if(ascii(bytes,0,'ID3') || (bytes.length>=2 && bytes[0]===255 && (bytes[1]! & 0xe0)===0xe0)) return {kind:'mp3',mediaType:'audio/mpeg',preview:'audio'};
 if(ascii(bytes,0,'OggS')) return {kind:'ogg',mediaType:'audio/ogg',preview:'audio'};
 if(ascii(bytes,4,'ftyp')) return {kind:'mp4',mediaType:'video/mp4',preview:'video'};
 if([26,69,223,163].every((value,index)=>bytes[index]===value)) return {kind:'webm',mediaType:'video/webm',preview:'video'};
 // PDFs can include JavaScript and external content: offer download, never embed.
 if(ascii(bytes,0,'%PDF-')) return {kind:'pdf',mediaType:'application/pdf',preview:'download_only'};
 if (declaredType === 'text/plain' || declaredType === 'application/json') {
  const text = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
  if (declaredType === 'application/json') JSON.parse(text);
  return { kind: declaredType === 'application/json' ? 'json' : 'txt', mediaType: declaredType, preview: 'download_only' };
 }
 if (declaredType === 'application/octet-stream' && !ascii(bytes,0,'MZ') && !ascii(bytes,0,'\u007fELF') && !ascii(bytes,0,'#!') && !/^\s*<(?:!doctype\s+html|html|script|svg)\b/i.test(new TextDecoder().decode(bytes.slice(0,512)))) return { kind:'bin',mediaType:'application/octet-stream',preview:'download_only' };
 throw new Error('VALIDATION_FAILED: この素材形式は安全な表示の対象外です。HTML・SVG・実行ファイルは添付できません。');
}
export async function prepareAsset(input: Uint8Array, displayName: string, declaredType?: string): Promise<PreparedAsset> {
 if(!input.length || input.length>MAX) throw new Error('IMPORT_LIMIT: 添付は1 byte〜32 MiBです。');
 const bytes = new Uint8Array(input);
 const type=detectAsset(bytes, declaredType);
 const digest=await crypto.subtle.digest('SHA-256',bytes);
 const contentHash=[...new Uint8Array(digest)].map(v=>v.toString(16).padStart(2,'0')).join('');
 return {bytes,contentHash,byteSize:bytes.length,mediaType:type.mediaType,assetPath:`assets/${contentHash}.${type.kind}`,displayName,preview:type.preview};
}
export function safeExternalUrl(input: string): string | null {
 try {const url=new URL(input); return ['https:','http:'].includes(url.protocol) && !url.username && !url.password ? url.href : null;}catch{return null;}
}
