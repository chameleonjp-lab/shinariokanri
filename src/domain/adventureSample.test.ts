import { describe, expect, it } from 'vitest';
import { createAdventureSampleProject } from './adventureSample';
import { ENTITY_KINDS, getEntitiesByKind, validateProject } from './model';
import { replaySavedTrace, checkTrialForeshadows } from './runtime';
import { sha256, jsonBytes } from '../storage/json';
import { createProjection } from './projection';
import { previewWorldVersion, worldStateCandidates, WORLD_PREDICATES } from './world';
import { resolveEventTimes, validateEventTimes } from './time';
import { inspectWorldCandidates } from './worldCheck';
import type { RichText } from './types';

const plain = (blocks?: RichText | null) => (blocks ?? []).map(block => block.text).join('\n');

describe('three chapter adventure sample', () => {
  it('connects every information kind to three complete chapters and stores real, verifiable assets and editions', async () => {
    const { project, assets } = await createAdventureSampleProject();
    expect(validateProject(project)).toMatchObject({ ok: true });
    expect(new Set(project.entities.map(entity => entity.kind))).toEqual(new Set(ENTITY_KINDS));
    const chapters = getEntitiesByKind(project, 'chapter');
    expect(chapters).toHaveLength(3);
    expect(chapters.map(chapter => chapter.data.sceneIds.length)).toEqual([12, 12, 12]);
    const allScenes = getEntitiesByKind(project, 'scene');
    const scenes = chapters.flatMap(chapter => chapter.data.sceneIds.map(id => allScenes.find(scene => scene.id === id)!));
    expect(allScenes).toHaveLength(36);
    expect(new Set(scenes.map(scene => scene.id)).size).toBe(36);
    const events = getEntitiesByKind(project, 'event');
    const characters = getEntitiesByKind(project, 'character');
    const places = getEntitiesByKind(project, 'place');
    const items = getEntitiesByKind(project, 'item');
    expect(characters.length).toBeGreaterThanOrEqual(24);
    expect(places.length).toBeGreaterThanOrEqual(24);
    expect(items.length).toBeGreaterThanOrEqual(30);
    expect(getEntitiesByKind(project, 'lore').length).toBeGreaterThanOrEqual(20);
    expect(events.length).toBeGreaterThanOrEqual(65);
    expect(scenes.reduce((length, scene) => length + plain(scene.data.body).length, 0)).toBeGreaterThan(20000);
    for (const chapter of chapters) {
      expect(plain(chapter.data.summary).length, chapter.name).toBeGreaterThan(70);
      expect(chapter.data.structureRole, chapter.name).toBeTruthy();
      expect(chapter.data.sceneIds.every(id => scenes.find(scene => scene.id === id)?.data.chapterId === chapter.id)).toBe(true);
    }
    for (const character of characters) {
      expect(plain(character.data.body).length, character.name).toBeGreaterThan(100);
      expect(character.data.goals?.length, character.name).toBeGreaterThan(0);
      expect(character.data.voiceRules?.length, character.name).toBeGreaterThan(0);
      expect(events.some(event => event.data.participants?.some(participant => participant.characterId === character.id)), character.name).toBe(true);
    }
    const eventPlaceIds = new Set(events.flatMap(event => event.data.locationId ? [event.data.locationId] : []));
    const usedPlaceIds = new Set(eventPlaceIds);
    for (const id of eventPlaceIds) {
      let place = places.find(candidate => candidate.id === id);
      const visited = new Set<string>();
      while (place?.data.parentId && !visited.has(place.id)) {
        visited.add(place.id); usedPlaceIds.add(place.data.parentId);
        place = places.find(candidate => candidate.id === place!.data.parentId);
      }
    }
    for (const place of places) expect(usedPlaceIds.has(place.id), place.name).toBe(true);
    const usedItemIds = new Set(events.flatMap(event => event.data.itemIds ?? []));
    for (const item of items.filter(item => item.data.itemMode === 'instance' && usedItemIds.has(item.id))) {
      if (item.data.typeId) usedItemIds.add(item.data.typeId);
    }
    for (const item of items) expect(usedItemIds.has(item.id), item.name).toBe(true);
    expect(validateEventTimes(events)).toEqual([]);
    const worldChecks = inspectWorldCandidates(project);
    expect(worldChecks.complete).toBe(true);
    expect(worldChecks.candidates.filter(candidate => candidate.certainty === 'supported').map(candidate => ({
      kind: candidate.kind, reason: candidate.reason,
      targets: candidate.targetIds.map(id => project.entities.find(entity => entity.id === id)?.name ?? id),
    }))).toEqual([]);
    const times = resolveEventTimes(events);
    const sceneTicks = scenes.map(scene => {
      const time = times.get(scene.data.eventIds[0])!;
      expect(time.status, scene.name).toBe('resolved');
      return time.status === 'resolved' ? BigInt(time.earliest) : 0n;
    });
    expect(sceneTicks.every((tick, index) => index === 0 || tick > sceneTicks[index - 1])).toBe(true);
    expect([...times.values()].filter(time => time.status === 'resolved' && BigInt(time.latest) < 0).length).toBeGreaterThanOrEqual(10);
    const sceneEventIds = new Set(scenes.flatMap(scene => scene.data.eventIds));
    expect(events.filter(event => !sceneEventIds.has(event.id) && (() => {
      const time = times.get(event.id)!;
      return time.status === 'resolved' && BigInt(time.earliest) >= 0 && BigInt(time.latest) <= 230;
    })()).length).toBeGreaterThanOrEqual(10);
    const gate = getEntitiesByKind(project, 'place').find(place => place.name === '星還りの門')!;
    expect(worldStateCandidates(project, gate.id, WORLD_PREDICATES.placeState, { at: '223' }).definite[0].assertion.data.value).toEqual({ type: 'enum', value: '封鎖' });
    expect(worldStateCandidates(project, gate.id, WORLD_PREDICATES.placeState, { at: '224' }).definite[0].assertion.data.value).toEqual({ type: 'enum', value: '順次接続' });
    expect(scenes[0].data.body.flatMap(block => block.links ?? []).length).toBeGreaterThan(0);
    for (const scene of scenes) {
      expect(scene.data.body.length, scene.name).toBeGreaterThanOrEqual(3);
      expect(plain(scene.data.body).length, scene.name).toBeGreaterThan(450);
      for (const field of ['goals', 'conflicts', 'results', 'newInformation'] as const) expect(plain(scene.data[field]).length, `${scene.name}: ${field}`).toBeGreaterThan(5);
      expect(scene.data.eventIds.length, scene.name).toBeGreaterThan(0);
      expect(scene.data.dialogueLineIds?.length, scene.name).toBeGreaterThan(0);
      const participants = events.filter(event => scene.data.eventIds.includes(event.id)).flatMap(event => event.data.participants ?? []);
      const speakers = getEntitiesByKind(project, 'dialogue_line').filter(line => scene.data.dialogueLineIds!.includes(line.id)).map(line => line.data.speakerId);
      expect(speakers.every(id => participants.some(participant => participant.characterId === id)), scene.name).toBe(true);
    }
    const foreshadows = getEntitiesByKind(project, 'foreshadow');
    expect(foreshadows.length).toBeGreaterThanOrEqual(9);
    for (const foreshadow of foreshadows) {
      expect(foreshadow.data.resolutionPolicy).toBe('this_work');
      expect(foreshadow.data.clueIds?.length, foreshadow.name).toBeGreaterThan(0);
      expect(foreshadow.data.payoffIds?.length, foreshadow.name).toBeGreaterThan(0);
      for (const id of [...foreshadow.data.clueIds!, ...foreshadow.data.payoffIds!]) {
        const disclosure = getEntitiesByKind(project, 'disclosure').find(entity => entity.id === id)!;
        const scene = scenes.find(entity => entity.id === disclosure.data.anchor.entityId)!;
        expect(scene, foreshadow.name).toBeDefined();
        expect(scene.data.body.find(block => block.id === disclosure.data.anchor.blockId)?.text.length, foreshadow.name).toBeGreaterThan(20);
      }
      const disclosures = getEntitiesByKind(project, 'disclosure');
      const positions = (ids: string[]) => ids.map(id => scenes.findIndex(scene => scene.id === disclosures.find(disclosure => disclosure.id === id)!.data.anchor.entityId));
      expect(Math.max(...positions(foreshadow.data.clueIds!)), foreshadow.name).toBeLessThan(Math.min(...positions(foreshadow.data.payoffIds!)));
    }
    for (const attachment of getEntitiesByKind(project, 'attachment')) {
      const asset = assets.find(candidate => candidate.contentHash === attachment.data.contentHash)!;
      expect(asset.bytes.length).toBe(attachment.data.byteSize);
      expect(await sha256(asset.bytes)).toBe(attachment.data.contentHash);
    }
    for (const snapshot of project.snapshots) expect(await sha256(jsonBytes(snapshot.content))).toBe(snapshot.contentHash);
    expect(project.authorAlternatives).toHaveLength(1);
    const ending = scenes.at(-1)!;
    const proposedEnding = project.authorAlternatives![0].versions.at(-1)!.content.entities.find(entity => entity.id === ending.id)!;
    expect(JSON.stringify(proposedEnding.data)).toContain('未採用の比較用提案');
    expect(JSON.stringify(ending.data)).not.toContain('未採用の比較用提案');
    expect(project.history).toEqual([]);
  }, 20000);

  it('replays both generated journeys to a safe return and keeps the skipped scenes distinct', async () => {
    const { project } = await createAdventureSampleProject();
    const traces = getEntitiesByKind(project, 'trace');
    expect(traces).toHaveLength(2);
    const sessions = traces.map(trace => replaySavedTrace(project, trace.id));
    for (const session of sessions) {
      expect(session.status, JSON.stringify(session.issues)).toBe('terminal');
      expect(session.issues).toEqual([]);
      const quest = getEntitiesByKind(project, 'variable').find(variable => variable.data.key === 'starway_quest')!;
      expect(session.state.variableValues[quest.id]).toEqual({ type: 'enum', value: '帰還' });
      expect(checkTrialForeshadows(project, session)).toEqual([]);
    }
    const nodes = getEntitiesByKind(project, 'flow_node');
    const stateOnArrival = (title: string) => {
      const scene = getEntitiesByKind(project, 'scene').find(scene => scene.name.endsWith(`　${title}`))!;
      const node = nodes.find(node => node.data.sceneId === scene.id)!;
      return sessions[0].trace.find(step => step.toId === node.id)!.after;
    };
    const questState = getEntitiesByKind(project, 'variable').find(variable => variable.data.key === 'starway_quest')!;
    expect(stateOnArrival('銀貨五枚の使い道').variableValues[questState.id]).toEqual({ type: 'enum', value: '調査中' });
    const crystal = getEntitiesByKind(project, 'item').find(item => item.name === '遺跡で得る第一星核片')!;
    expect(stateOnArrival('森番の消えない線').itemInstances.find(item => item.instanceId === crystal.id)).toMatchObject({ quantity: 1, consumed: false });
    expect(stateOnArrival('二つの世界の手紙').variableValues[questState.id]).toEqual({ type: 'enum', value: '修復済み' });
    const visitedScenes = sessions.map(session => [session.trace[0].fromId, ...session.trace.map(step => step.toId)]
      .map(id => nodes.find(node => node.id === id)?.data.sceneId).filter(Boolean));
    const chapterOrder = getEntitiesByKind(project, 'chapter').flatMap(chapter => chapter.data.sceneIds);
    expect(visitedScenes[0]).toEqual(chapterOrder);
    expect(visitedScenes[1]).toHaveLength(30);
    expect(visitedScenes[1]).toEqual(chapterOrder.filter(id => visitedScenes[1].includes(id)));
    expect(sessions[0].trace.length - sessions[1].trace.length).toBe(6);
  }, 20000);

  it('exports a reader projection and makes each new sample an independent work', async () => {
    const [{ project }, second] = await Promise.all([createAdventureSampleProject(), createAdventureSampleProject()]);
    expect(second.project.projectId).not.toBe(project.projectId);
    const ids = new Set(project.entities.map(entity => entity.id));
    expect(second.project.entities.every(entity => !ids.has(entity.id))).toBe(true);
    const worldPin = project.snapshots[0];
    const lore = getEntitiesByKind(project, 'lore')[0];
    const sharedWorld = await previewWorldVersion(second.project, project, worldPin.id, [lore.id], [project, second.project]);
    expect(sharedWorld.canApply).toBe(true);
    expect(validateProject(sharedWorld.candidate, { worldSnapshots: { [worldPin.id]: worldPin.content } })).toMatchObject({ ok: true });
    const profile = getEntitiesByKind(project, 'projection_profile')[0];
    const projection = createProjection(project, profile.id);
    expect(projection.ok, JSON.stringify(projection)).toBe(true);
    if (projection.ok) {
      expect(projection.projection.entities.filter(entity => entity.kind === 'chapter')).toHaveLength(3);
      expect(projection.projection.entities.filter(entity => entity.kind === 'scene')).toHaveLength(36);
      expect(JSON.stringify(projection.projection)).not.toContain('この場面の役割');
    }
  }, 20000);
});
