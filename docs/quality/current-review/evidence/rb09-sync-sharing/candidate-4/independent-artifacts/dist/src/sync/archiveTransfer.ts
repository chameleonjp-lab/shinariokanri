import {inspectScenarioData,type PreparedScenario} from '../storage/archive';
import {nativeDocuments} from './nativeBridge';
import {sameValue,SyncProtocolError,type SyncDocument} from './protocol';
/** Full recovery bytes are accepted only for the confirmed image; local history revisions are independent. */
export async function inspectConfirmedArchive(bytes:Uint8Array,projectId:string,documents:SyncDocument[],signal?:AbortSignal):Promise<PreparedScenario>{
 if(bytes.byteLength>64*1024*1024)throw new SyncProtocolError('PROTOCOL_INVALID');const result=await inspectScenarioData(bytes,{signal});
 const content=(items:SyncDocument[])=>items.map(({revision:_revision,...doc})=>doc).sort((a,b)=>a.id.localeCompare(b.id));
 if(result.manifest.assetMode!=='embedded'||result.summary.missingAssets||result.project.projectId!==projectId||!sameValue(content(nativeDocuments(result.project,'0')),content(documents)))throw new SyncProtocolError('REVISION_CHANGED');return result;
}
export async function encodeSyncBytes(bytes:Uint8Array,signal?:AbortSignal,onProgress?:(done:number,total:number)=>void){let raw='';for(let start=0;start<bytes.length;start+=65536){if(signal?.aborted)throw new SyncProtocolError('CANCELLED');raw+=Array.from(bytes.subarray(start,start+65536),v=>String.fromCharCode(v)).join('');onProgress?.(Math.min(start+65536,bytes.length),bytes.length);if(start%1048576===0)await new Promise(resolve=>setTimeout(resolve,0));}if(signal?.aborted)throw new SyncProtocolError('CANCELLED');return btoa(raw);}
