import type { ProjectData } from './types';
import {createEntity,textToRichText} from './model';
import {createWorldSnapshot} from './world';
import {exportProject,type ExportOptions} from './exports';
import {jsonBytes,sha256,canonicalJson} from '../storage/json';
import {receiveGamePackage,verifyGameReceipt} from './gameProtocol';
import {captureGameExecutionBindings} from './gameEvidence';
export * from './gameProtocol';
/** Re-export the chosen immutable/working edition to verify reception, then store only an audited record. */
export async function previewGameReceiptImport(input:ProjectData,raw:unknown,options:Omit<ExportOptions,'profile'>){
 const project=structuredClone({...input,history:[]}),request=structuredClone(options),capturedReceipt=structuredClone(raw),result=await exportProject(project,{...request,profile:'runtime_json'});
 if(!result.ok)throw Error(result.issues.map(issue=>issue.message).join(' '));
 const pkg=await receiveGamePackage(JSON.parse(result.artifact.content)),receipt=await verifyGameReceipt(pkg,capturedReceipt);
 const approval=createEntity(project.projectId,'note','ゲーム受領hashの固定承認',{body:[],});approval.status='confirmed';approval.visibility='private';approval.customValues={gamePackageHash:receipt.packageHash,gameReceiptHash:receipt.receiptHash};project.entities.push(approval);
 const candidate=await createWorldSnapshot(project,'ゲーム受領の公開確認版'),verificationVersionId=candidate.snapshots.at(-1)!.id,sourceVersionId=request.targetVersionId??verificationVersionId;
 const execution=await captureGameExecutionBindings(candidate,{...request,profile:'runtime_json'},sourceVersionId,verificationVersionId);
 const profileVersionId=candidate.snapshots.find(pin=>pin.id===verificationVersionId)!.content.entities.some(e=>e.id===request.projectionProfileId&&e.kind==='projection_profile')?verificationVersionId:sourceVersionId;
 const note=createEntity(project.projectId,'note','ゲーム受領・実結果',{body:textToRichText(`受領 ${receipt.receiverId} / ${receipt.specification}\n受領hash ${receipt.packageHash}\n実行証跡からの分類 ${receipt.mode} / ${receipt.actions.length}操作 / 最終 ${receipt.status}`),handoffReceipt:{approval:{entityId:approval.id,sourceVersionId:verificationVersionId},sourceVersionId,verificationVersionId,profileVersionId,sourceRevision:request.targetRevision??project.snapshots.find(pin=>pin.id===request.targetVersionId)!.content.revision,profileId:request.projectionProfileId,packageHash:receipt.packageHash,receiptHash:receipt.receiptHash,mode:receipt.mode,rawJson:canonicalJson(receipt),idMappings:Object.entries(result.preview.sourceIdMap??{}).filter(([,publicId])=>pkg.entities.some(entity=>entity.id===publicId)).map(([entityId,publicId])=>({entityId,sourceVersionId,publicId})),...execution}});
 note.status='confirmed';candidate.entities.push(note);
 const payload={projectId:project.projectId,baseRevision:project.revision,noteId:note.id,candidateHash:await sha256(jsonBytes(candidate))};return {...payload,candidate,receipt,confirmationHash:await sha256(jsonBytes(payload))};
}
export async function confirmGameReceiptImport(input:ProjectData,inputPlan:Awaited<ReturnType<typeof previewGameReceiptImport>>){const project=structuredClone({...input,history:[]}),plan=structuredClone(inputPlan),{candidate,receipt:_receipt,confirmationHash,...payload}=plan;if(project.projectId!==plan.projectId||project.revision!==plan.baseRevision||await sha256(jsonBytes(candidate))!==plan.candidateHash||await sha256(jsonBytes(payload))!==confirmationHash)throw Error('REVISION_CONFLICT: ゲーム受領の確認後に作品または証跡が変わりました。');return {...candidate,history:input.history};}
