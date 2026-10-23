import { describe, expect, it } from 'vitest';
import { createAdventureSampleProject } from './adventureSample';
import { ENTITY_KINDS, getEntitiesByKind, validateProject } from './model';
import { replaySavedTrace, checkTrialForeshadows } from './runtime';
import { sha256, jsonBytes } from '../storage/json';
import { createProjection } from './projection';
import { previewWorldVersion, worldStateCandidates, WORLD_PREDICATES } from './world';

describe('three chapter adventure sample', () => {
  it('connects every information kind to three complete chapters and stores real, verifiable assets and editions', async () => {
    const { project, assets } = await createAdventureSampleProject();
    expect(validateProject(project)).toMatchObject({ ok: true });
    expect(new Set(project.entities.map(entity => entity.kind))).toEqual(new Set(ENTITY_KINDS));
    const chapters = getEntitiesByKind(project, 'chapter');
    expect(chapters).toHaveLength(3);
    expect(chapters.map(chapter => chapter.data.sceneIds.length)).toEqual([4, 4, 4]);
    const scenes = getEntitiesByKind(project, 'scene');
    expect(scenes).toHaveLength(12);
    expect(scenes.every(scene => scene.data.body.length >= 3 && scene.data.eventIds.length > 0 && scene.data.dialogueLineIds!.length > 0)).toBe(true);
    expect(getEntitiesByKind(project, 'character')).toHaveLength(8);
    expect(getEntitiesByKind(project, 'place')).toHaveLength(8);
    const gate = getEntitiesByKind(project, 'place').find(place => place.name === '星還りの門')!;
    expect(worldStateCandidates(project, gate.id, WORLD_PREDICATES.placeState, { at: '59' }).definite[0].assertion.data.value).toEqual({ type: 'enum', value: '封鎖' });
    expect(worldStateCandidates(project, gate.id, WORLD_PREDICATES.placeState, { at: '60' }).definite[0].assertion.data.value).toEqual({ type: 'enum', value: '順次接続' });
    expect(scenes[0].data.body.flatMap(block => block.links ?? [])).toHaveLength(1);
    for (const scene of scenes) {
      const event = getEntitiesByKind(project, 'event').find(event => event.id === scene.data.eventIds[0])!;
      const speakers = getEntitiesByKind(project, 'dialogue_line').filter(line => scene.data.dialogueLineIds!.includes(line.id)).map(line => line.data.speakerId);
      expect(speakers.every(id => event.data.participants!.some(participant => participant.characterId === id))).toBe(true);
    }
    for (const attachment of getEntitiesByKind(project, 'attachment')) {
      const asset = assets.find(candidate => candidate.contentHash === attachment.data.contentHash)!;
      expect(asset.bytes.length).toBe(attachment.data.byteSize);
      expect(await sha256(asset.bytes)).toBe(attachment.data.contentHash);
    }
    for (const snapshot of project.snapshots) expect(await sha256(jsonBytes(snapshot.content))).toBe(snapshot.contentHash);
    expect(project.authorAlternatives).toHaveLength(1);
    const proposedEnding = project.authorAlternatives![0].versions.at(-1)!.content.entities.find(entity => entity.id === scenes[11].id)!;
    expect(JSON.stringify(proposedEnding.data)).toContain('未採用の比較用提案');
    expect(JSON.stringify(scenes[11].data)).not.toContain('未採用の比較用提案');
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
    expect(sessions[0].trace.length).toBeGreaterThan(sessions[1].trace.length);
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
      expect(projection.projection.entities.filter(entity => entity.kind === 'scene')).toHaveLength(12);
      expect(JSON.stringify(projection.projection)).not.toContain('この場面の役割');
    }
  }, 20000);
});
