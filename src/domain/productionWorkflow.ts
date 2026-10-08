import { createEntity, newId, collectReferences } from './model';
import { dialogueContentHash } from './production';
import { sha256, jsonBytes } from '../storage/json';
import type { Block, ContentAnchor, DialogueLineage, Entity, ID, ProjectData, RichText } from './types';

const active = (entity: Entity | undefined): entity is Entity => !!entity && !entity.deletedAt && !['rejected', 'alternate'].includes(entity.status);
const lineOf = (project: ProjectData, id: ID): Entity<'dialogue_line'> => { const line = project.entities.find(entity => entity.id === id); if (!active(line) || line.kind !== 'dialogue_line') throw new Error('REFERENCE_INVALID: 現在採用する台詞を選んでください。'); return line; };
const contentHash = (project: ProjectData) => { const { history: _history, ...content } = project; return sha256(jsonBytes(content)); };
export type DialogueChangeRequest = { mode: 'copy'; sourceIds: [ID]; reason: string } | { mode: 'split'; sourceIds: [ID]; blockId: ID; offset: number; reason: string } | { mode: 'merge'; sourceIds: ID[]; reason: string };
export interface DialogueChangePlan { projectId: ID; baseRevision: string; request: DialogueChangeRequest; sourceHashes: Record<ID, string>; candidate: ProjectData; candidateHash: string; newLineIds: ID[]; warnings: string[]; confirmationHash: string }

function fragment(block: Block, start: number, end: number): Block {
  for (const range of [...block.ruby ?? [], ...block.links ?? []]) if (range.start < start && range.end > start || range.start < end && range.end > end) throw new Error('VALIDATION_FAILED: 分割位置がルビ・リンクの途中です。注記の外の文字位置を選ぶか、先に注記を修正してください。');
  const move = <T extends { start: number; end: number }>(ranges?: T[]) => ranges?.filter(range => range.start >= start && range.end <= end).map(range => ({ ...structuredClone(range), start: range.start - start, end: range.end - start }));
  return { ...structuredClone(block), id: newId(), text: Array.from(block.text).slice(start, end).join(''), ...(block.ruby ? { ruby: move(block.ruby) } : {}), ...(block.links ? { links: move(block.links) } : {}) };
}
function remapAnchor(anchor: ContentAnchor, projectId: ID, sourceIds: ID[], segments: DialogueLineage['segments'], replacements: ID[]): ContentAnchor {
  if (anchor.sourceVersionId && anchor.sourceVersionId !== projectId) return anchor;
  const sourceId = anchor.lineId && sourceIds.includes(anchor.lineId) ? anchor.lineId : sourceIds.includes(anchor.entityId) ? anchor.entityId : undefined;
  if (!sourceId || anchor.positionStatus === 'unresolved') return anchor;
  const possible = segments.filter(segment => segment.source.entityId === sourceId && (!anchor.blockId || segment.source.blockId === anchor.blockId) && (anchor.start == null || (segment.source.start ?? 0) <= anchor.start) && (anchor.end == null || (segment.source.end ?? Infinity) >= anchor.end));
  const targetIds = [...new Set(possible.map(segment => segment.target.entityId))];
  const ambiguous = targetIds.length !== 1 || anchor.blockId && possible.length !== 1 || !anchor.blockId && (anchor.start != null || anchor.end != null);
  if (ambiguous) return { ...anchor, positionStatus: 'unresolved', positionReason: `台詞の${replacements.length > 1 ? '分割' : '統合'}により位置の採用が必要です。旧台詞とID対応から再リンクしてください。` };
  const target = possible[0].target, shift = possible[0].source.start ?? 0;
  return { ...anchor, entityId: sourceIds.includes(anchor.entityId) ? target.entityId : anchor.entityId, ...(anchor.lineId ? { lineId: target.entityId } : {}), ...(anchor.blockId ? { blockId: target.blockId } : {}), ...(anchor.start != null ? { start: anchor.start - shift } : {}), ...(anchor.end != null ? { end: anchor.end - shift } : {}) };
}
function anchorsIn(value: unknown, transform: (anchor: ContentAnchor) => ContentAnchor): unknown {
  if (Array.isArray(value)) return value.map(item => anchorsIn(item, transform));
  if (!value || typeof value !== 'object') return value;
  const object = value as Record<string, unknown>;
  if (typeof object.entityId === 'string') return transform(object as unknown as ContentAnchor);
  return Object.fromEntries(Object.entries(object).map(([key, item]) => [key, anchorsIn(item, transform)]));
}
export async function previewDialogueChange(project: ProjectData, request: DialogueChangeRequest): Promise<DialogueChangePlan> {
  request = structuredClone(request);
  if (!request.reason.trim() || new Set(request.sourceIds).size !== request.sourceIds.length || request.sourceIds.length > 50) throw new Error('VALIDATION_FAILED: 理由と重複しない台詞を指定してください（最大50件）。');
  const sources = request.sourceIds.map(id => lineOf(project, id)), first = sources[0];
  if (!first || ['split','copy'].includes(request.mode) && sources.length !== 1 || request.mode === 'merge' && sources.length < 2) throw new Error('VALIDATION_FAILED: 分割は一つ、統合は二つ以上の台詞を選んでください。');
  if (sources.some(source => source.data.speakerId !== first.data.speakerId || source.data.choiceEdgeId !== first.data.choiceEdgeId || source.data.assertionIntent !== first.data.assertionIntent)) throw new Error('VALIDATION_FAILED: 話者・選択肢・発言の意図が異なります。先に採用する内容を個別に確認してください。');
  const parts: { block: Block; sourceId: ID; start: number; end: number }[][] = [];
  if (request.mode === 'split') {
    const index = first.data.text.findIndex(block => block.id === request.blockId), block = first.data.text[index], offset = request.offset;
    if (!block || !Number.isSafeInteger(offset) || offset < 0 || offset > Array.from(block.text).length) throw new Error('VALIDATION_FAILED: 台詞内のUnicodeコードポイント位置を指定してください。');
    const left = first.data.text.slice(0, index).map(block => ({ block, sourceId: first.id, start: 0, end: Array.from(block.text).length })), right = first.data.text.slice(index + 1).map(block => ({ block, sourceId: first.id, start: 0, end: Array.from(block.text).length }));
    if (offset) left.push({ block, sourceId: first.id, start: 0, end: offset }); if (offset < Array.from(block.text).length) right.unshift({ block, sourceId: first.id, start: offset, end: Array.from(block.text).length });
    if (!left.length || !right.length) throw new Error('VALIDATION_FAILED: 台詞の先頭・末尾では分割できません。'); parts.push(left, right);
  } else parts.push(sources.flatMap(source => source.data.text.map(block => ({ block, sourceId: source.id, start: 0, end: Array.from(block.text).length }))));
  const segments: DialogueLineage['segments'] = [], newLines = parts.map((part, index) => {
    const line = createEntity(project.projectId, 'dialogue_line', `${first.name || '台詞'} · ${request.mode === 'split' ? `分割${index + 1}` : request.mode === 'copy' ? '独立複製' : '統合'}`, { ...structuredClone(first.data), text: [], originLineIds: [...new Set(sources.flatMap(source => [source.id, ...source.data.originLineIds ?? []]))], cueIds: [...new Set(sources.flatMap(source => source.data.cueIds ?? []))], claimAssertionIds: [...new Set(sources.flatMap(source => source.data.claimAssertionIds ?? []))] });
    delete line.data.replacedByLineIds;
    const reasons = [...new Set(sources.map(source => source.data.assertionReason?.trim()).filter((reason): reason is string => !!reason))];
    if (reasons.length) line.data.assertionReason = reasons.join('\n');
    const ownSegments: DialogueLineage['segments'] = [];
    line.data.text = part.map(({ block, sourceId, start, end }) => { const target = fragment(block, start, end), range = end > start ? { start, end } : {}, targetRange = end > start ? { start: 0, end: end - start } : {}; ownSegments.push({ source: { entityId: sourceId, lineId: sourceId, blockId: block.id, ...range }, target: { entityId: line.id, lineId: line.id, blockId: target.id, ...targetRange } }); return target; });
    line.data.lineage = { mode: request.mode, baseRevision: project.revision, reason: request.reason, segments: ownSegments }; line.status = first.status; line.visibility = first.visibility; segments.push(...ownSegments); return line;
  });
  const newLineIds = newLines.map(line => line.id), warnings: string[] = [], sourceSet = new Set(request.sourceIds);
  const transform = (anchor: ContentAnchor) => { const next = remapAnchor(anchor, project.projectId, request.sourceIds, segments, newLineIds); if (next.positionStatus === 'unresolved' && anchor.positionStatus !== 'unresolved') warnings.push(`位置を再確認: ${anchor.entityId}${anchor.blockId ? ` / ${anchor.blockId}` : ''}`); return next; };
  let entities = project.entities.map(entity => {
    if (request.mode === 'copy') return entity;
    if (sourceSet.has(entity.id)) return { ...entity, status: 'rejected' as const, data: { ...entity.data, replacedByLineIds: newLineIds } } as Entity;
    let next = { ...entity, data: anchorsIn(entity.data, transform) } as Entity;
    if (entity.kind === 'scene' && entity.data.dialogueLineIds?.some(id => sourceSet.has(id)) && (!entity.data.reuse || entity.data.reuse.mode === 'clone' || entity.data.reuse.overrideFields.includes('dialogueLineIds'))) {
      const ids = entity.data.dialogueLineIds, firstIndex = ids.findIndex(id => sourceSet.has(id));
      if (request.mode === 'merge' && request.sourceIds.some((id, index) => ids[firstIndex + index] !== id)) throw new Error('VALIDATION_FAILED: すべての使用場面で統合対象が同じ順序で隣接する必要があります。共通台詞の影響を確認してください。');
      next = { ...entity, data: { ...entity.data, dialogueLineIds: ids.flatMap((id, index) => sourceSet.has(id) ? index === firstIndex ? newLineIds : [] : [id]) } };
    }
    if ((next.kind === 'localization' || next.kind === 'recording') && sourceSet.has(next.data.sourceLineId)) next = { ...next, data: { ...next.data, stage: 'needs_review' } } as Entity;
    if (next.kind === 'flow_edge' && next.data.choiceLineId && sourceSet.has(next.data.choiceLineId)) { if (newLineIds.length !== 1) warnings.push(`選択肢の台詞対応は旧IDを保持: ${next.id}`); else next = { ...next, data: { ...next.data, choiceLineId: newLineIds[0] } }; }
    return next;
  });
  if (request.mode === 'copy') for (const line of newLines) {
    const copiedCues = (line.data.cueIds ?? []).map(id => {
      const cue = project.entities.find(entity => entity.id === id && entity.kind === 'cue');
      if (!cue || cue.kind !== 'cue') throw new Error('REFERENCE_INVALID: 複製する演出がありません。');
      const data = anchorsIn(cue.data, transform) as Entity<'cue'>['data'];
      const copied = createEntity(project.projectId, 'cue', `${cue.name} · 独立複製`, data); copied.status = cue.status; copied.visibility = cue.visibility;
      if (data.anchor.sourceVersionId && data.anchor.sourceVersionId !== project.projectId) { copied.data.anchor = { ...data.anchor, positionStatus:'unresolved',positionReason:'固定版の演出位置は複製先へ明示して再リンクしてください。' }; warnings.push(`固定演出の再リンク待ち: ${cue.name || cue.id}`); }
      entities.push(copied); return copied.id;
    });
    line.data.cueIds = copiedCues;
  }
  entities = [...entities, ...newLines.map(line => ({ ...line, data: { ...line.data, text: anchorsIn(line.data.text, transform) as RichText } }))];
  // Positional cues follow the resolved new line, so a split does not play them twice.
  entities = entities.map(entity => {
    if (entity.kind !== 'dialogue_line' || !newLineIds.includes(entity.id)) return entity;
    return { ...entity, data: { ...entity.data, cueIds: entity.data.cueIds?.filter(id => {
      const cue = entities.find(candidate => candidate.id === id && candidate.kind === 'cue');
      return !cue || cue.kind !== 'cue' || cue.data.anchor.positionStatus === 'unresolved' || (cue.data.anchor.lineId ?? cue.data.anchor.entityId) === entity.id || !sourceSet.has(cue.data.anchor.entityId) && !sourceSet.has(cue.data.anchor.lineId ?? '') && !newLineIds.includes(cue.data.anchor.entityId) && !newLineIds.includes(cue.data.anchor.lineId ?? '');
    }) } };
  });
  const candidate = { ...project, entities }, sourceHashes = Object.fromEntries(await Promise.all(sources.map(async source => [source.id, await dialogueContentHash(project, source)] as const))), candidateHash = await contentHash(candidate);
  const payload = { projectId: project.projectId, baseRevision: project.revision, request, sourceHashes, candidateHash, newLineIds, warnings: [...new Set(warnings)] };
  return { ...payload, candidate, confirmationHash: await sha256(jsonBytes(payload)) };
}
export async function confirmDialogueChange(project: ProjectData, plan: DialogueChangePlan): Promise<ProjectData> {
  const { candidate, confirmationHash, ...payload } = plan;
  if (project.projectId !== plan.projectId || project.revision !== plan.baseRevision || candidate.revision !== plan.baseRevision || await sha256(jsonBytes(payload)) !== confirmationHash || await contentHash(candidate) !== plan.candidateHash) throw new Error('REVISION_CONFLICT: 台詞の確認後に作品または差分が変わりました。入力を残して再確認してください。');
  for (const [id, hash] of Object.entries(plan.sourceHashes)) if (await dialogueContentHash(project, lineOf(project, id)) !== hash) throw new Error('REVISION_CONFLICT: 元の台詞が確認後に変わりました。');
  return { ...candidate, history: project.history };
}
export async function previewSourceApproval(project: ProjectData, deliverableId: ID) {
  const deliverable = project.entities.find(entity => entity.id === deliverableId);
  if (!active(deliverable) || !['localization', 'recording'].includes(deliverable.kind)) throw new Error('REFERENCE_INVALID: 翻訳または収録を選んでください。');
  const target = deliverable as Entity<'localization' | 'recording'>, line = lineOf(project, target.data.sourceLineId), sourceHash = await dialogueContentHash(project, line);
  const payload = { projectId: project.projectId, baseRevision: project.revision, deliverableId, deliverableHash: await sha256(jsonBytes(deliverable)), sourceLineId: line.id, sourceRevision: line.revision, sourceHash };
  return { ...payload, confirmationHash: await sha256(jsonBytes(payload)) };
}
export async function confirmSourceApproval(project: ProjectData, plan: Awaited<ReturnType<typeof previewSourceApproval>>) {
  const fresh = await previewSourceApproval(project, plan.deliverableId);
  if (fresh.confirmationHash !== plan.confirmationHash || await sha256(jsonBytes(Object.fromEntries(Object.entries(plan).filter(([key]) => key !== 'confirmationHash')))) !== plan.confirmationHash) throw new Error('REVISION_CONFLICT: 原文確認後に作品・台詞・翻訳・収録が変わりました。再確認してください。');
  return { ...project, entities: project.entities.map(entity => entity.id === plan.deliverableId ? { ...entity, data: { ...entity.data, sourceHash: plan.sourceHash, stage: 'reviewed' } } as Entity : entity) };
}
export function productionDependents(project: ProjectData, id: ID) { return project.entities.filter(entity => active(entity) && collectReferences(entity).some(reference => reference.id === id)); }
