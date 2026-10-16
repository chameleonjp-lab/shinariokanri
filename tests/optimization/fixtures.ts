import { createEntity, createProject, emptyValidity } from '../../src/domain/model';
import type { CommandRecord, ContentState, Entity, EntityKind, ProjectData } from '../../src/domain/types';

export const PHASE1_SEED = 'phase1-20261016-v1';
const epoch = '2026-10-16T00:00:00.000Z';
/** Separate synthetic inputs; never changes the original Standard/Large generator. */
export function growthProject(index = 0, density = 4): ProjectData {
  let serial = 1;
  const id = () => `${(0xa1100000 + index).toString(16)}-0000-4000-8000-${(serial++).toString(16).padStart(12, '0')}`;
  const project = createProject(`計測専用作品${index}`); project.projectId = id();
  const add = <K extends EntityKind>(kind: K, name: string, data: Partial<Entity<K>['data']> = {}) => {
    const entity = createEntity(project.projectId, kind, name, data);
    entity.id = id(); entity.createdAt = entity.updatedAt = epoch; project.entities.push(entity); return entity;
  };
  const character = add('character', 'アオ', { reading: 'あお', aliases: [{ id: id(), text: '記録係', reading: 'きろくがかり', validity: emptyValidity(), audienceHolderIds: [], isPublicDefault: true }] });
  const other = add('character', 'アオ', { reading: 'あお' });
  const event = add('event', '密参照の出来事', { participants: [{ characterId: character.id, role: 'actor' }] });
  add('scene', '固定された場面', { eventIds: [event.id], povId: character.id, body: [{ id: id(), kind: 'paragraph', text: '本文を保持する', links: [{ start: 0, end: 2, target: { entityId: character.id } }] }] });
  add('dialogue_line', '台詞一件', { speakerId: character.id, text: [{ id: id(), kind: 'paragraph', text: '元の台詞' }] });
  add('note', '秘密資料', { body: [{ id: id(), kind: 'paragraph', text: 'SYNTHETIC_PRIVATE_CANARY_作品本文' }] });
  for (let i = 0; i < density; i++) project.relations.push({ id: id(), projectId: project.projectId, revision: '0', fromId: character.id, toId: other.id, relationType: 'trust', direction: 'forward', evidenceIds: [event.id], validity: emptyValidity(), status: 'provisional', visibility: 'private' });
  return project;
}

/** Minimal native v1 history series: the header order and every 64th checkpoint
 * are explicit. Isolated DB seeding only, not an archive/import acceptance fixture. */
export function historySeries(count: 100 | 1000 | 10000) {
  const project = createProject('履歴0'); project.projectId = 'a1200000-0000-4000-8000-000000000001';
  const historyIds: string[] = [], rows: Array<Record<string, unknown>> = [];
  let previous: ContentState = { ...project }; delete (previous as Partial<ProjectData>).history;
  for (let i = 1; i <= count; i++) {
    const operationId = `a1200000-0000-4000-8000-${(i + 1).toString(16).padStart(12, '0')}`;
    const after = { ...previous, name: `履歴${i}`, revision: String(i) };
    const metadata: Omit<CommandRecord, 'before' | 'after'> = { operationId, projectId: project.projectId, baseRevision: String(i - 1), revision: String(i), reason: `計測変更${i}`, createdAt: epoch, targetIds: [project.projectId] };
    rows.push({ operationId, projectId: project.projectId, revision: String(i), delta: { metadata, ...(i % 64 === 1 ? { checkpoint: previous } : { parentOperationId: historyIds.at(-1) }), patch: { header: { name: after.name, revision: after.revision }, entities: [], relations: [] } } });
    historyIds.push(operationId); previous = after;
  }
  return { header: { ...previous, entityIds: [], relationIds: [], snapshotIds: [], viewIds: [], historyIds, contentHeadOperationId: historyIds.at(-1) }, rows };
}

export const GROWTH_MANIFEST = Object.freeze({
  version: 1, seed: PHASE1_SEED, projectCounts: [1, 10, 50], historyCounts: [100, 1000, 10000],
  density: 4, bytesOfAssets: 0, recordsPerProject: 10,
  operations: ['rename-one', 'dialogue-one', 'dense-reference', 'pinned-world', 'secret', 'corrupt-row'],
  expected: { participantNames: ['密参照の出来事', '固定された場面'], textNames: ['アオ', 'アオ'],
    historyFirstPageLatestRevisions: { '100': '100', '1000': '1000', '10000': '10000' },
    renamedCurrent: 'アオ改名', pinnedName: 'アオ', dialogueBefore: '元の台詞', dialogueAfter: '新しい台詞',
    corruptCode: 'SAVE_FAILED' },
});
