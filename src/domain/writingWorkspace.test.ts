import { describe, expect, it } from 'vitest';
import { createEntity, createProject, newId, textToRichText } from './model';
import type { Entity, ProjectData } from './types';
import {
  STRUCTURE_TEMPLATES,
  appendAlternativeVersion,
  applyAlternativeChanges,
  applyStructureOrderPreview,
  buildCharacterArc,
  buildChapterReadingSequence,
  buildStoryLanes,
  buildTensionProfile,
  diffAuthorAlternative,
  forkAuthorAlternative,
  moveChapterPresentation,
  moveScenePresentation,
  previewStructureOrder,
  projectContent,
  rollbackAlternativeApplication,
  rollbackAlternativeHead,
} from './writingWorkspace';

function fixture(): { project: ProjectData; character: Entity<'character'>; chapterA: Entity<'chapter'>; chapterB: Entity<'chapter'>; scenes: Entity<'scene'>[]; events: Entity<'event'>[]; threads: Entity<'group'>[] } {
  const project = createProject('提示と世界時刻');
  const character = createEntity(project.projectId, 'character', 'アオ');
  const organization = createEntity(project.projectId, 'group', '門番組', { groupType: 'faction', members: [character.id] });
  const place = createEntity(project.projectId, 'place', '霧の門');
  const threads = [
    createEntity(project.projectId, 'group', '恋愛の筋', { groupType: 'plot_thread' }),
    createEntity(project.projectId, 'group', '戦争の筋', { groupType: 'plot_thread' }),
  ];
  const events = [
    createEntity(project.projectId, 'event', '鍵を隠した日', { time: { mode: 'instant', at: '10', calendarId: project.calendarId }, participants: [{ characterId: character.id, role: 'actor' }], locationId: place.id }),
    createEntity(project.projectId, 'event', '門へ戻った日', { time: { mode: 'instant', at: '20', calendarId: project.calendarId }, participants: [{ characterId: character.id, role: 'witness' }], locationId: place.id }),
  ];
  const scenes = [
    createEntity(project.projectId, 'scene', '回想', { eventIds: [events[0]!.id], summary: textToRichText('古い出来事'), body: textToRichText('本文A'), threadIds: [threads[0]!.id, threads[1]!.id], tension: 2, goals: textToRichText('鍵を探す'), conflicts: textToRichText('門が閉ざされている'), results: textToRichText('鍵の場所を知る'), newInformation: textToRichText('父が隠した') }),
    createEntity(project.projectId, 'scene', '現在', { eventIds: [events[1]!.id], summary: textToRichText('現在の要約'), body: textToRichText('本文B'), threadIds: [threads[0]!.id], tension: null, importance: 8 }),
    createEntity(project.projectId, 'scene', '役割なし', { summary: [], body: [], eventIds: [], tension: 8 }),
  ];
  const chapterA = createEntity(project.projectId, 'chapter', '第一章', { sceneIds: [scenes[1]!.id, scenes[0]!.id] });
  const chapterB = createEntity(project.projectId, 'chapter', '第二章', { sceneIds: [scenes[2]!.id] });
  scenes[0]!.data.chapterId = chapterA.id;
  scenes[1]!.data.chapterId = chapterA.id;
  scenes[2]!.data.chapterId = chapterB.id;
  project.entities = [character, organization, place, ...threads, ...events, ...scenes, chapterA, chapterB];
  return { project, character, chapterA, chapterB, scenes, events, threads };
}

describe('writing workspace projections and branch changes', () => {
  it('moves chapter presentation without changing world dates or shared scene-event references', () => {
    const { project, chapterA, chapterB, scenes, events } = fixture();
    const nativeHistoryToken = project.history;
    const oldTimes = events.map(event => structuredClone(event.data.time));
    const oldRefs = scenes.map(scene => [...scene.data.eventIds]);
    const moved = moveScenePresentation(project, scenes[0]!.id, chapterB.id, 0);
    expect(moved.history).toBe(nativeHistoryToken);
    expect(moved.entities.find((entity): entity is Entity<'chapter'> => entity.id === chapterA.id && entity.kind === 'chapter')?.data.sceneIds).toEqual([scenes[1]!.id]);
    expect(moved.entities.find((entity): entity is Entity<'chapter'> => entity.id === chapterB.id && entity.kind === 'chapter')?.data.sceneIds).toEqual([scenes[0]!.id, scenes[2]!.id]);
    expect(moved.entities.filter((entity): entity is Entity<'event'> => entity.kind === 'event').map(event => event.data.time)).toEqual(oldTimes);
    expect(moved.entities.filter((entity): entity is Entity<'scene'> => entity.kind === 'scene').map(scene => scene.data.eventIds)).toEqual(oldRefs);
    expect(project.entities.find((entity): entity is Entity<'chapter'> => entity.id === chapterA.id && entity.kind === 'chapter')?.data.sceneIds).toEqual([scenes[1]!.id, scenes[0]!.id]);
    const reordered = moveChapterPresentation(project, chapterB.id, -1);
    expect(reordered.entities.filter(entity => entity.kind === 'chapter').map(entity => entity.id)).toEqual([chapterB.id, chapterA.id]);
    expect(reordered.history).toBe(nativeHistoryToken);
  });

  it('projects one canonical scene into several story lanes and keeps thread removal from deleting its body', () => {
    const { project, character, scenes, threads } = fixture();
    const scene = scenes[0]!;
    const loveLane = buildStoryLanes(project, 'thread').find(lane => lane.id === threads[0]!.id)!;
    const warLane = buildStoryLanes(project, 'thread').find(lane => lane.id === threads[1]!.id)!;
    expect(loveLane.sceneIds).toContain(scene.id);
    expect(warLane.sceneIds).toContain(scene.id);
    expect(buildStoryLanes(project, 'character').find(lane => lane.id === character.id)?.sceneIds).toContain(scenes[1]!.id);
    expect(buildStoryLanes(project, 'organization').some(lane => lane.sceneIds.includes(scenes[1]!.id))).toBe(true);
    expect(buildStoryLanes(project, 'place').some(lane => lane.sceneIds.includes(scenes[0]!.id))).toBe(true);

    const withRemoval = structuredClone(project);
    const edited = withRemoval.entities.find((entity): entity is Entity<'scene'> => entity.id === scene.id)!;
    edited.data.threadIds = edited.data.threadIds!.filter(id => id !== threads[0]!.id);
    expect(buildStoryLanes(withRemoval, 'thread').find(lane => lane.id === threads[1]!.id)?.sceneIds).toContain(scene.id);
    expect(withRemoval.entities.find((entity): entity is Entity<'scene'> => entity.id === scene.id && entity.kind === 'scene')?.data.body).toEqual(scene.data.body);
  });

  it('shows optional character purpose, conflict, results and new information in either order without inventing roles', () => {
    const { project, character, scenes, events } = fixture();
    const goal = createEntity(project.projectId, 'goal', '門を開ける', { ownerId: character.id, evidenceSceneIds: [scenes[0]!.id] });
    project.entities.push(goal);
    const presentation = buildCharacterArc(project, character.id, 'presentation')!;
    const world = buildCharacterArc(project, character.id, 'world')!;
    expect(presentation.entries.map(entry => entry.scene.id)).toEqual([scenes[1]!.id, scenes[0]!.id]);
    expect(world.entries.map(entry => entry.scene.id)).toEqual([scenes[0]!.id, scenes[1]!.id]);
    const memory = presentation.entries.find(entry => entry.scene.id === scenes[0]!.id)!;
    expect(memory.before.purpose?.[0]?.text).toBe('鍵を探す');
    expect(memory.before.conflict?.[0]?.text).toBe('門が閉ざされている');
    expect(memory.after.change?.[0]?.text).toBe('鍵の場所を知る');
    expect(memory.after.newInformation?.[0]?.text).toBe('父が隠した');
    const missingRole = buildCharacterArc(project, character.id)?.entries.find(entry => entry.scene.id === scenes[2]!.id);
    expect(missingRole).toBeUndefined();
    expect(scenes[2]!.data.eventIds).toEqual([]);
    expect(events[0]!.data.time).toMatchObject({ mode: 'instant', at: '10' });
  });

  it('keeps missing tension unknown and previews a structure template before applying it', () => {
    const { project, chapterA, scenes } = fixture();
    const profile = buildTensionProfile(project, chapterA.data.sceneIds);
    expect(profile.points.map(point => point.value)).toEqual([null, 2]);
    expect(profile.measuredCount).toBe(1);
    expect(profile.missingCount).toBe(1);
    expect(profile.importanceMeasuredCount).toBe(1);

    const template = STRUCTURE_TEMPLATES.find(item => item.id === 'kishotenketsu')!;
    const preview = previewStructureOrder(template, chapterA, { 起: scenes[0]!.id, 承: scenes[1]!.id });
    expect(preview.before).toEqual([scenes[1]!.id, scenes[0]!.id]);
    expect(preview.after).toEqual([scenes[0]!.id, scenes[1]!.id]);
    expect(preview.unassignedSceneIds).toEqual([]);
    expect(chapterA.data.sceneIds).toEqual(preview.before);
    const branchLike = applyStructureOrderPreview(project, chapterA.id, preview);
    expect(branchLike.history).toBe(project.history);
    expect(branchLike.entities.find((entity): entity is Entity<'chapter'> => entity.id === chapterA.id && entity.kind === 'chapter')?.data.sceneIds).toEqual(preview.after);
    expect(project.entities.find((entity): entity is Entity<'chapter'> => entity.id === chapterA.id && entity.kind === 'chapter')?.data.sceneIds).toEqual(preview.before);
  });

  it('reads chapter order or an explicit route while sharing the same scene IDs and never selecting author notes', () => {
    const { project, chapterA, chapterB, scenes } = fixture();
    const all = buildChapterReadingSequence(project);
    expect(all.map(entry => entry.scene.id)).toEqual([scenes[1]!.id, scenes[0]!.id, scenes[2]!.id]);
    const route = buildChapterReadingSequence(project, undefined, [scenes[2]!.id, scenes[0]!.id, scenes[0]!.id]);
    expect(route.map(entry => entry.scene.id)).toEqual([scenes[2]!.id, scenes[0]!.id, scenes[0]!.id]);
    expect(buildChapterReadingSequence(project, [chapterB.id]).map(entry => entry.scene.id)).toEqual([scenes[2]!.id]);
    expect(all[0]?.scene.data.body[0]?.id).toBe(scenes[1]!.data.body[0]?.id);
    expect(all[0]?.scene.data.authorNotes).toEqual([]);
    expect(chapterA.data.sceneIds).toContain(all[1]!.scene.id);
  });

  it('keeps unassigned scenes outside an explicit chapter range including an explicitly empty selection', () => {
    const { project, chapterA, scenes } = fixture();
    const orphan = createEntity(project.projectId, 'scene', '未所属の参照元'); project.entities.push(orphan);
    expect(buildChapterReadingSequence(project, [chapterA.id]).map(entry => entry.scene.id)).toEqual([scenes[1]!.id, scenes[0]!.id]);
    expect(buildChapterReadingSequence(project, []).map(entry => entry.scene.id)).toEqual([]);
    expect(buildChapterReadingSequence(project).map(entry => entry.scene.id)).toContain(orphan.id);
    expect(buildChapterReadingSequence(project, [], [orphan.id]).map(entry => entry.scene.id)).toEqual([orphan.id]);
  });

  it('uses canonical chapter scene order across story lanes, deduplicates membership and skips rejected defaults', () => {
    const { project, chapterA, chapterB, scenes } = fixture();
    chapterA.data.sceneIds = [scenes[1]!.id, scenes[0]!.id, scenes[1]!.id];
    const expected = [scenes[1]!.id, scenes[0]!.id, scenes[2]!.id];
    expect(buildStoryLanes(project, 'chapter').flatMap(lane => lane.sceneIds)).toEqual(expected);
    expect(buildStoryLanes(project, 'character').find(lane => lane.id === project.entities.find(entity => entity.kind === 'character')?.id)?.sceneIds).toEqual(expected.slice(0, 2));

    chapterA.status = 'rejected'; scenes[1]!.status = 'rejected';
    expect(buildChapterReadingSequence(project).map(entry => entry.scene.id)).toEqual([scenes[2]!.id]);
    expect(() => buildChapterReadingSequence(project, [chapterA.id])).toThrow(/不採用/);
    expect(() => buildChapterReadingSequence(project, undefined, [scenes[1]!.id])).toThrow(/不採用/);
    expect(buildChapterReadingSequence(project, [chapterB.id]).map(entry => entry.scene.id)).toEqual([scenes[2]!.id]);
  });

  it('forks from a published snapshot, diffs selected changes, applies atomically, and can safely roll back', () => {
    const { project, scenes } = fixture();
    const snapshotId = newId(), publishedBody = structuredClone(scenes[0]!.data.body);
    const publishedContent = projectContent(project);
    project.snapshots.push({ id: snapshotId, versionLabel: '公開版1', contentHash: 'a'.repeat(64), createdAt: '2025-01-01T00:00:00.000Z', content: publishedContent });
    const alternative = forkAuthorAlternative(project, '別展開', { snapshotId, id: newId(), now: '2025-01-02T00:00:00.000Z' });
    const branch = projectContent(alternative.versions[0]!.content);
    const branchScene = branch.entities.find((entity): entity is Entity<'scene'> => entity.id === scenes[0]!.id)!;
    branchScene.data.body[0]!.text = '別案だけの本文';
    branchScene.status = 'alternate';
    const editedAlternative = appendAlternativeVersion(alternative, branch, '別案の場面を編集', '2025-01-03T00:00:00.000Z', newId());
    const changes = diffAuthorAlternative(editedAlternative, project);
    expect(changes.some(change => change.label.includes('body') && change.conflict === false)).toBe(true);
    expect(changes.some(change => change.label.includes('status') && change.alternativeValue === 'alternate')).toBe(true);
    const selected = new Set(changes.filter(change => change.label.includes('body') || change.label.includes('status')).map(change => change.key));
    const adopted = applyAlternativeChanges(project, editedAlternative, changes, selected, '2025-01-04T00:00:00.000Z', newId());
    expect((adopted.project.entities.find(entity => entity.id === scenes[0]!.id && entity.kind === 'scene') as Entity<'scene'>).data.body[0]?.text).toBe('別案だけの本文');
    expect(adopted.project.snapshots).toEqual(project.snapshots);
    expect(project.snapshots[0]!.content.entities.find(entity => entity.id === scenes[0]!.id && entity.kind === 'scene')?.data).toEqual(scenes[0]!.data);
    const restored = rollbackAlternativeApplication(adopted.project, adopted.receipt);
    expect((restored.entities.find(entity => entity.id === scenes[0]!.id && entity.kind === 'scene') as Entity<'scene'>).data.body).toEqual(publishedBody);
    expect(restored.snapshots).toEqual(project.snapshots);
    expect(() => rollbackAlternativeApplication({ ...adopted.project, entities: adopted.project.entities.map(entity => entity.id === scenes[0]!.id ? { ...entity, name: '別の編集' } : entity) }, adopted.receipt)).not.toThrow();
  });

  it('rolls back added entities before deleting them from a changed presentation and leaves inputs untouched on failure', () => {
    const { project, chapterA, scenes } = fixture();
    const baseSnapshot = { id: newId(), versionLabel: '公開版', contentHash: 'b'.repeat(64), createdAt: '2025-01-01T00:00:00.000Z', content: projectContent(project) };
    project.snapshots = [baseSnapshot];
    const alternative = forkAuthorAlternative(project, '別の場面を加える案', { snapshotId: baseSnapshot.id, id: newId(), now: '2025-01-02T00:00:00.000Z' });
    const branch = projectContent(alternative.versions[0]!.content);
    const addedScene = createEntity(project.projectId, 'scene', '採用する新場面', { chapterId: chapterA.id, summary: textToRichText('別の展開'), body: textToRichText('門は閉じたままだ。') });
    branch.entities.push(addedScene);
    const branchChapter = branch.entities.find((entity): entity is Entity<'chapter'> => entity.kind === 'chapter' && entity.id === chapterA.id)!;
    branchChapter.data.sceneIds = [addedScene.id, ...chapterA.data.sceneIds];
    const editedAlternative = appendAlternativeVersion(alternative, branch, '新場面と章順', '2025-01-03T00:00:00.000Z', newId());
    const changes = diffAuthorAlternative(editedAlternative, project);
    const addChange = changes.find(change => change.scope === 'entity' && change.itemId === addedScene.id)!;
    const presentationChange = changes.find(change => change.scope === 'presentation')!;
    const applied = applyAlternativeChanges(project, editedAlternative, changes, new Set([addChange.key, presentationChange.key]), '2025-01-04T00:00:00.000Z', newId());
    expect(applied.receipt.patches.map(patch => patch.scope)).toEqual(['entity', 'presentation']);
    expect(applied.project.entities.some(entity => entity.id === addedScene.id)).toBe(true);
    expect(applied.project.snapshots).toEqual([baseSnapshot]);

    const restored = rollbackAlternativeApplication(applied.project, applied.receipt);
    expect(restored.entities.some(entity => entity.id === addedScene.id)).toBe(false);
    expect(restored.entities.find((entity): entity is Entity<'chapter'> => entity.kind === 'chapter' && entity.id === chapterA.id)?.data.sceneIds).toEqual(chapterA.data.sceneIds);
    expect(restored.snapshots).toEqual([baseSnapshot]);
    expect(project.entities.some(entity => entity.id === addedScene.id)).toBe(false);
    expect(project.entities.find((entity): entity is Entity<'scene'> => entity.kind === 'scene' && entity.id === scenes[0]!.id)?.data.body).toEqual(scenes[0]!.data.body);

    const laterEdit = structuredClone(applied.project);
    laterEdit.entities.find((entity): entity is Entity<'chapter'> => entity.kind === 'chapter' && entity.id === chapterA.id)!.data.sceneIds.reverse();
    const untouched = structuredClone(laterEdit);
    expect(() => rollbackAlternativeApplication(laterEdit, applied.receipt)).toThrow(/上書きせず/);
    expect(laterEdit).toEqual(untouched);
  });

  it('rejects same-field stale edits, protects later canonical edits from rollback, and changes branch head without deleting versions', () => {
    const { project, scenes } = fixture();
    const alternative = forkAuthorAlternative(project, '分岐', { id: newId(), now: '2025-02-01T00:00:00.000Z' });
    const content = projectContent(alternative.versions[0]!.content);
    const branchScene = content.entities.find((entity): entity is Entity<'scene'> => entity.id === scenes[0]!.id)!;
    branchScene.name = '別案の回想';
    const withEdit = appendAlternativeVersion(alternative, content, '名称変更', '2025-02-02T00:00:00.000Z', newId());
    const changedCanonical = structuredClone(project);
    (changedCanonical.entities.find((entity): entity is Entity<'scene'> => entity.id === scenes[0]!.id)!).name = '正本で変更';
    const changes = diffAuthorAlternative(withEdit, changedCanonical);
    expect(changes.find(change => change.label.includes('name'))?.conflict).toBe(true);
    expect(() => applyAlternativeChanges(changedCanonical, withEdit, changes, new Set(changes.map(change => change.key)))).toThrow(/競合/);

    const cleanChanges = diffAuthorAlternative(withEdit, project), rename = cleanChanges.find(change => change.label.includes('name'))!;
    const applied = applyAlternativeChanges(project, withEdit, cleanChanges, new Set([rename.key]));
    const later = structuredClone(applied.project);
    (later.entities.find((entity): entity is Entity<'scene'> => entity.id === scenes[0]!.id)!).name = '正本の新しい編集';
    const unchangedAfterError = structuredClone(later);
    expect(() => rollbackAlternativeApplication(later, applied.receipt)).toThrow(/上書きせず/);
    expect(later).toEqual(unchangedAfterError);

    const secondVersion = withEdit.versions[0]!.id;
    const rolledHead = rollbackAlternativeHead(withEdit, secondVersion, '2025-02-03T00:00:00.000Z');
    expect(rolledHead.headVersionId).not.toBe(secondVersion);
    expect(rolledHead.versions).toHaveLength(3);
    expect(rolledHead.versions.map(version => version.id).slice(0, 2)).toEqual(withEdit.versions.map(version => version.id));
    expect(rolledHead.versions.at(-1)?.parentVersionId).toBe(withEdit.headVersionId);
    expect(rolledHead.versions.at(-1)?.content.entities.find(entity => entity.id === scenes[0]!.id)?.name).toBe(alternative.versions[0]!.content.entities.find(entity => entity.id === scenes[0]!.id)?.name);
  });

  it('keeps structure template assignments with immutable alternative versions', () => {
    const { project, chapterA, scenes } = fixture();
    const alternative = forkAuthorAlternative(project, '構成案', { id: newId(), now: '2025-03-01T00:00:00.000Z' });
    const plan = { chapterId: chapterA.id, templateId: 'kishotenketsu', beatLabels: ['起', '転'], assignments: { 起: scenes[0]!.id, 転: scenes[1]!.id } };
    const edited = appendAlternativeVersion(alternative, projectContent(project), '起承転結の案', '2025-03-02T00:00:00.000Z', newId(), plan);
    expect(edited.versions.find(version => version.id === edited.headVersionId)?.structurePlan).toEqual(plan);
    const restored = rollbackAlternativeHead(edited, alternative.headVersionId, '2025-03-03T00:00:00.000Z');
    expect(restored.versions).toHaveLength(3);
    expect(restored.versions.find(version => version.id === restored.headVersionId)?.structurePlan).toBeUndefined();
    expect(edited.versions.find(version => version.id === edited.headVersionId)?.structurePlan).toEqual(plan);
  });
});
