import { collectReferences, createEntity, rewriteEntityReferences } from './model';
import { adoptedRecord } from './adoption';
import { prepareAsset, type PreparedAsset } from './attachments';
import type { Entity, ID, ProjectData } from './types';
import { jsonBytes, sha256 } from '../storage/json';

const contentHash = ({ history: _history, ...content }: ProjectData) => sha256(jsonBytes(content));
export interface MaterialPlan { projectId: ID; baseRevision: string; oldAttachmentId?: ID; sourceId?: ID; replacementIds: ID[]; newAttachmentId: ID; candidate: ProjectData; candidateHash: string; asset: PreparedAsset; confirmationHash: string }
export async function previewMaterial(project: ProjectData, asset: PreparedAsset, oldAttachmentId?: ID, replacementIds: ID[] = [], sourceId?: ID): Promise<MaterialPlan> {
  const verified = await prepareAsset(asset.bytes, asset.displayName, asset.mediaType);
  if (verified.contentHash !== asset.contentHash || verified.byteSize !== asset.byteSize || verified.assetPath !== asset.assetPath || verified.mediaType !== asset.mediaType) throw new Error('INTEGRITY_FAILED: 素材の検査結果とbytesが一致しません。');
  const old = oldAttachmentId ? project.entities.find(entity => entity.id === oldAttachmentId) : undefined;
  if (oldAttachmentId && (!old || old.kind !== 'attachment' || !adoptedRecord(old))) throw new Error('REFERENCE_INVALID: 現在採用する素材を選んでください。');
  const users = old ? project.entities.filter(entity => entity.id !== old.id && adoptedRecord(entity) && collectReferences(entity).some(reference => reference.id === old.id)) : [];
  if (new Set(replacementIds).size !== replacementIds.length || replacementIds.some(id => !users.some(entity => entity.id === id))) throw new Error('REFERENCE_INVALID: 差替える確認先は現在の参照一覧から選んでください。');
  const prior = old?.kind === 'attachment' ? old : undefined;
  if (sourceId && !project.entities.some(entity => entity.id === sourceId && entity.kind === 'source' && adoptedRecord(entity))) throw new Error('REFERENCE_INVALID: 素材を結ぶ採用資料がありません。');
  const attachment = createEntity(project.projectId, 'attachment', asset.displayName, { mediaType: asset.mediaType, contentHash: asset.contentHash, byteSize: asset.byteSize, assetPath: asset.assetPath, displayName: asset.displayName, stage: prior?.data.stage ?? 'temporary', provenanceId: prior?.data.provenanceId ?? null, licenseNote: prior?.data.licenseNote ?? '', revisionHistory: prior ? [prior.id, ...prior.data.revisionHistory ?? []] : [] });
  if (prior) attachment.visibility = prior.visibility;
  const candidate = { ...project, entities: [...project.entities.map(entity => {
    if (entity.id === sourceId && entity.kind === 'source') return { ...entity, data: { ...entity.data, attachmentId: attachment.id } };
    if (!prior || !replacementIds.includes(entity.id)) return entity;
    const updated = rewriteEntityReferences(entity, { [prior.id]: attachment.id });
    if (updated.kind === 'recording') return { ...updated, data: { ...updated.data, stage: 'needs_review' as const } };
    if (updated.kind === 'media_variant') return { ...updated, data: { ...updated.data, needsReview: true } };
    return { ...updated, status: 'needs_review' as const };
  }), attachment] as Entity[] };
  const payload = { projectId: project.projectId, baseRevision: project.revision, oldAttachmentId, sourceId, replacementIds: [...replacementIds], newAttachmentId: attachment.id, candidateHash: await contentHash(candidate), assetHash: asset.contentHash };
  const { assetHash: _assetHash, ...plan } = payload;
  return { ...plan, candidate, asset: verified, confirmationHash: await sha256(jsonBytes(payload)) };
}
export async function confirmMaterial(project: ProjectData, plan: MaterialPlan) {
  const { candidate, confirmationHash, asset, ...payload } = plan;
  const verified = await prepareAsset(asset.bytes, asset.displayName, asset.mediaType);
  if (project.projectId !== plan.projectId || project.revision !== plan.baseRevision || candidate.revision !== project.revision || verified.contentHash !== asset.contentHash || await contentHash(candidate) !== plan.candidateHash || await sha256(jsonBytes({ ...payload, assetHash: asset.contentHash })) !== confirmationHash) throw new Error('REVISION_CONFLICT: 素材の確認後に作品または差分が変わりました。入力を残して再確認してください。');
  return { ...candidate, history: project.history };
}
export function materialUsers(project: ProjectData, id: ID) { return project.entities.filter(entity => entity.id !== id && adoptedRecord(entity) && collectReferences(entity).some(reference => reference.id === id)); }
export function materialAvailability(project: ProjectData, availableHashes: ReadonlySet<string>) { return project.entities.filter((entity): entity is Entity<'attachment'> => entity.kind === 'attachment' && adoptedRecord(entity)).map(entity => ({ entity, bytes: availableHashes.has(entity.data.contentHash) ? 'available' as const : 'missing' as const, stage: entity.data.stage ?? 'reference' })); }
