import type {CommandRecord,ProjectData} from '../domain/types';
import type {NativeSyncRecovery} from './syncRecovery';
import {exportScenarioData,referencedWorlds,type ExportOptions} from './archiveData';
import type {PortableRecovery} from './recovery';
import {createSharedArrayJsonEncoder} from './sharedArrayJson';
import {sha256} from './json';
import {checkCancelled,StorageError} from './errors';
import {internImmutableRecords} from '../domain/internImmutableRecords';
import {syncRecoveryImages} from './syncRecovery';

/** One private native read image, not a caller-supplied verification result. */
export interface NativeExportCapture {
  project:ProjectData;
  pending:{operationId:string;command:CommandRecord;baseRevision:string}[];
  retained:PortableRecovery['pending'];
  serverRevision:string;
  worlds:Record<string,ProjectData>;
  availableWorlds?:Record<string,ProjectData>;
  syncRecovery:NativeSyncRecovery[];
}

/** The worker computes every complete command hash, then runs the unchanged
 * structural, integrity, recovery, asset and archive-capacity validators. */
export async function exportNativeScenarioData(capture:NativeExportCapture,options:ExportOptions={}):Promise<Uint8Array>{
  checkCancelled(options.signal);
  capture=internImmutableRecords(capture);
  let worlds=capture.worlds;
  if(capture.availableWorlds){
    worlds={};const pendingImages=[...capture.pending.map(row=>row.command),...capture.retained.map(row=>row.command)].flatMap(command=>[command.before,command.after].map(state=>({...state,history:[]})));
    let discovered=[capture.project,...pendingImages,...syncRecoveryImages(capture.syncRecovery)];
    while(discovered.length){const next:ProjectData[]=[];for(const reference of referencedWorlds(discovered,capture.availableWorlds)){if(worlds[reference.immutableSnapshotId])continue;const world=capture.availableWorlds[reference.immutableSnapshotId];if(world){worlds[reference.immutableSnapshotId]=world;next.push(world);}}discovered=next;}
  }
  const commandBytes=createSharedArrayJsonEncoder();
  const operations=new Map(capture.retained.map(row=>[row.operationId,row]));
  for(const row of capture.pending){
    checkCancelled(options.signal);
    const commandHash=await sha256(commandBytes(row.command)),previous=operations.get(row.operationId);
    if(previous&&previous.commandHash!==commandHash)throw new StorageError('OPERATION_CONFLICT','復元した送信待ちと現在の送信待ちが同じIDで異なります。');
    operations.set(row.operationId,{operationId:row.operationId,command:row.command,commandHash,origin:{projectId:capture.project.projectId,operationId:row.operationId,serverRevision:row.baseRevision}});
    options.onProgress?.({stage:'hashes',completed:operations.size,total:capture.pending.length});
    // Keep cancellation responsive on the no-worker fallback too.
    await new Promise<void>(resolve=>setTimeout(resolve,0));checkCancelled(options.signal);
  }
  const recovery:PortableRecovery|undefined=operations.size?{version:1,projectId:capture.project.projectId,sourceRevision:capture.project.revision,serverRevision:capture.serverRevision,pending:[...operations.values()]}:undefined;
  return exportScenarioData(capture.project,{...options,recovery,worlds,syncRecovery:capture.syncRecovery});
}
