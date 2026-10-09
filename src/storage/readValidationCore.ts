import type {ProjectData} from '../domain/types';
import {validateProjectIntegrity} from '../domain/projectRecordValidation';
import {verifySnapshotHashes,verifyWorlds,worldSnapshotContents} from './archiveData';
import {canonicalJson} from './json';
import {checkCancelled,StorageError} from './errors';

export type ReadStage='structure'|'worlds'|'hashes'|'integrity';
type Options={signal?:AbortSignal;onStage?:(stage:ReadStage)=>void};
/** The full cold-read contract, also used inside the dedicated local worker. */
export async function validateReadImage(project:ProjectData,worlds:Record<string,ProjectData>,onStage?:Options['onStage']){
 const current={...project,history:[]},worldSnapshots=worldSnapshotContents(worlds);
 onStage?.('structure');canonicalJson(current);
 // Integrity validation includes the full structural/reference validator. Cold
 // reads must complete it once, alongside every world and snapshot hash check.
 onStage?.('integrity');const issues=await validateProjectIntegrity(current,{worldSnapshots},false);
 if(issues.length)throw Object.assign(new StorageError('VALIDATION_FAILED',issues.map(issue=>`${issue.path}: ${issue.message}`).join('\n')),{issues});
 onStage?.('worlds');verifyWorlds([current],worlds);
 onStage?.('hashes');await verifySnapshotHashes([current]);
}
