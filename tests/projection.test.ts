import { describe, expect, it } from 'vitest';
import { createEntity, createProject, emptyValidity } from '../src/domain/model';
import { createProjection, createProjectionSnapshot, searchProjection } from '../src/domain/projection';
import type { Entity, RichText } from '../src/domain/types';

const id = (value: number) => `00000000-0000-4000-8000-${value.toString(16).padStart(12, '0')}`;
const rich = (value: number, text: string): RichText => [{ id: id(value), kind: 'paragraph', text }];
function fixture() {
  const project = createProject('SECRET_PROJECT_TITLE');
  project.projectId = id(1);
  const character = createEntity(project.projectId, 'character', 'SECRET_REAL_NAME', { reading: 'SECRET_REAL_READING', summary: rich(101, 'SECRET_AUTHOR_SUMMARY'), authorNotes: rich(102, 'SECRET_AUTHOR_NOTE') });
  character.id = id(2);
  character.data.aliases = [{ id: id(90), text: '門番', reading: 'SECRET_ALIAS_READING', isPublicDefault: true, audienceHolderIds: [], validity: emptyValidity() }];
  const hidden = createEntity(project.projectId, 'character', 'SECRET_FATHER_NAME'); hidden.id = id(3);
  const place = createEntity(project.projectId, 'place', 'SECRET_PLACE_NAME'); place.id = id(4);
  const hiddenPlace = createEntity(project.projectId, 'place', 'SECRET_PLACE'); hiddenPlace.id = id(5);
  const scene = createEntity(project.projectId, 'scene', 'SECRET_SCENE_NAME', { body: rich(103, 'SECRET_REAL_NAMEが父と会った。'), authorNotes: rich(104, 'SECRET_SCENE_NOTE'), povId: character.id }); scene.id = id(6);
  const future = createEntity(project.projectId, 'scene', 'SECRET_FUTURE_SCENE'); future.id = id(7);
  const chapter = createEntity(project.projectId, 'chapter', 'SECRET_CHAPTER', { sceneIds: [scene.id, future.id] }); chapter.id = id(8);
  const event = createEntity(project.projectId, 'event', 'SECRET_EVENT_NAME', { summary: rich(105, 'SECRET_EVENT_BODY'), time: { mode: 'instant', at: '-12345678901234567890123456789012345678', calendarId: project.calendarId }, participants: [{ characterId: character.id, role: 'witness' }, { characterId: hidden.id, role: 'actor' }] }); event.id = id(9);
  const map = createEntity(project.projectId, 'map', 'SECRET_MAP_NAME', { placeId: place.id, pins: [{ id: id(106), placeId: place.id, x: .4, y: .6, label: 'SECRET_PIN_LABEL' }, { id: id(107), placeId: hiddenPlace.id, x: .5, y: .5 }] }); map.id = id(10);
  const asset = createEntity(project.projectId, 'attachment', 'SECRET_FILENAME.jpg', { mediaType: 'image/jpeg', contentHash: 'a'.repeat(64), byteSize: 100, assetPath: 'assets/SECRET_FILENAME.jpg', displayName: 'SECRET_FILENAME.jpg' }); asset.id = id(11);
  const publicBody = rich(201, '門番が門を見ている。');
  publicBody[0].ruby = [{ start: 0, end: 2, text: 'もんばん' }];
  publicBody[0].links = [{ start: 0, end: 2, target: { entityId: hidden.id } }, { start: 3, end: 4, target: { entityId: place.id } }];
  const profile = createEntity(project.projectId, 'projection_profile', 'SECRET_PROFILE_NAME', {
    audience: 'reader', includedIds: [character.id, place.id, scene.id, chapter.id, event.id, map.id], allowedKinds: ['character', 'place', 'scene', 'chapter', 'event', 'map'],
    namePolicy: { defaultPolicy: { mode: 'exclude' }, byEntityId: {
      [character.id]: { mode: 'alias', aliasId: id(90) }, [place.id]: { mode: 'replace', replacement: '門' }, [scene.id]: { mode: 'replace', replacement: '霧の門' },
      [chapter.id]: { mode: 'replace', replacement: '第一章' }, [event.id]: { mode: 'replace', replacement: '古い記録' }, [map.id]: { mode: 'replace', replacement: '地図' },
    } }, publicTitle: '霧の門', publicTexts: {
      [character.id]: { reading: 'もんばん', summary: rich(202, '門を守る人物。') }, [scene.id]: { body: publicBody }, [event.id]: { summary: rich(203, '門には古い記録が残されている。') },
      [id(301)]: { relationType: '秘密の家系を含まない関係名' }, [id(302)]: { relationType: '訪れた' },
    }, allowedRelationIds: [id(301), id(302)],
  }); profile.id = id(20);
  project.entities = [character, hidden, place, hiddenPlace, scene, future, chapter, event, map, asset, profile];
  project.entities.forEach(entity => { entity.status = 'confirmed'; });
  project.relations = [
    { id: id(301), projectId: project.projectId, revision: '0', fromId: character.id, toId: hidden.id, relationType: 'SECRET_PARENT_TYPE', direction: 'forward', validity: emptyValidity(), evidenceIds: [], status: 'confirmed', visibility: 'private' },
    { id: id(302), projectId: project.projectId, revision: '0', fromId: character.id, toId: place.id, relationType: 'SECRET_RELATION_TYPE', direction: 'forward', validity: emptyValidity(), evidenceIds: [scene.id, hidden.id], status: 'confirmed', visibility: 'private' },
  ];
  return { project, profile, character, hidden, place, scene, event, map, publicBody };
}

describe('public projection boundary', () => {
  it('regenerates names, links, maps, family relations and search without source secrets or IDs', () => {
    const { project, profile, character, hidden, scene, event, map } = fixture();
    const before = JSON.stringify(project);
    const result = createProjection(project, profile.id);
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error(JSON.stringify(result.issues));
    const encoded = JSON.stringify(result.projection);
    expect(encoded).not.toContain('SECRET');
    for (const entity of project.entities) expect(encoded).not.toContain(entity.id);
    expect(encoded).not.toContain('authorNotes');
    expect(encoded).not.toContain('aliases');
    expect(result.projection.relations).toHaveLength(1);
    expect(result.projection.relations[0].evidenceIds).toEqual([result.idMap[scene.id]]);
    expect(result.projection.entities.find(entity => entity.id === result.idMap[event.id])?.data.participants).toEqual([{ characterId: result.idMap[character.id], role: 'witness' }]);
    expect(result.projection.entities.find(entity => entity.id === result.idMap[map.id])?.data.pins).toHaveLength(1);
    const body = result.projection.entities.find(entity => entity.id === result.idMap[scene.id])!.data.body as { links: { targetId: string }[] }[];
    expect(body[0].links).toHaveLength(1);
    expect(body[0].links[0].targetId).not.toBe(hidden.id);
    expect(searchProjection(result.projection, 'もんばん')).toHaveLength(1);
    expect(searchProjection(result.projection, 'SECRET_REAL_NAME')).toHaveLength(0);
    expect(JSON.stringify(project)).toBe(before);
  });

  it('stops when a source body has no author-provided public replacement', () => {
    const { project, profile, scene } = fixture();
    delete profile.data.publicTexts![scene.id].body;
    const result = createProjection(project, profile.id);
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error('Expected a stopped export');
    expect(result.issues).toContainEqual(expect.objectContaining({ code: 'PUBLIC_TEXT_REQUIRED', entityId: scene.id, field: 'body' }));
  });

  it('does not claim to recognize secrets in author-approved free text', () => {
    const { project, profile, scene } = fixture();
    profile.data.publicTexts![scene.id].body = rich(201, '作者が選んだ自由文。');
    const result = createProjection(project, profile.id);
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error('Expected an approved document');
    expect(JSON.stringify(result.projection)).toContain('作者が選んだ自由文。');
  });

  it('refuses author-note fields and an explicit request to include notes', () => {
    const first = fixture(); first.profile.data.allowedFields = { character: ['authorNotes'] };
    const second = fixture(); second.profile.data.includeAuthorNotes = true;
    for (const { project, profile } of [first, second]) {
      const result = createProjection(project, profile.id);
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.issues.some(issue => issue.code === 'FORBIDDEN')).toBe(true);
    }
  });

  it('refuses unknown kinds, prototype property names and a foreign project ID', () => {
    const first = fixture(); first.profile.data.allowedKinds = ['__proto__' as never];
    const second = fixture(); second.character.projectId = id(999);
    const third = fixture(); third.profile.data.allowedFields = { character: ['constructor'] };
    for (const { project, profile } of [first, second, third]) expect(createProjection(project, profile.id).ok).toBe(false);
  });

  it('intersects an explicit chapter scope with approved IDs and excludes unrelated records', () => {
    const { project, profile, scene } = fixture();
    const chapter = project.entities.find((entity): entity is Entity<'chapter'> => entity.kind === 'chapter')!;
    const outside = createEntity(project.projectId, 'scene', 'SECRET_OUTSIDE_CHAPTER'); outside.id = id(801); outside.status = 'confirmed';
    const unrelated = createEntity(project.projectId, 'character', 'SECRET_UNRELATED_PERSON'); unrelated.id = id(802); unrelated.status = 'confirmed';
    project.entities.push(outside, unrelated); profile.data.includedIds.push(outside.id, unrelated.id);
    const names = profile.data.namePolicy as { byEntityId: Record<string, unknown> };
    names.byEntityId[outside.id] = { mode: 'replace', replacement: '別の章の場面' }; names.byEntityId[unrelated.id] = { mode: 'replace', replacement: '別の章の人物' };
    profile.data.routeScope = { projectId: project.projectId, chapterId: chapter.id };
    const result = createProjection(project, profile.id);
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error(JSON.stringify(result.issues));
    expect(result.idMap[scene.id]).toBeDefined();
    expect(result.idMap[outside.id]).toBeUndefined(); expect(result.idMap[unrelated.id]).toBeUndefined();
    expect(JSON.stringify(result.projection)).not.toContain('別の章');
    expect(result.omissions).toContainEqual(expect.objectContaining({ entityId: outside.id, reason: '指定した章またはグラフの範囲外' }));
  });

  it('refuses an unimplemented conditional scope or a different pinned snapshot', () => {
    const first = fixture(); first.profile.data.routeScope = { projectId: first.project.projectId, routeCondition: { op: 'constant', value: true } };
    const second = fixture(); second.profile.data.routeScope = { projectId: second.project.projectId, targetSnapshotId: id(900) };
    for (const { project, profile } of [first, second]) expect(createProjection(project, profile.id).ok).toBe(false);
  });

  it('preserves distinct calendar math without publishing private calendar or month names', () => {
    const { project, profile } = fixture();
    project.calendars.push({ id: 'SECRET_PRIVATE_CALENDAR_ID', name: 'SECRET_CALENDAR_NAME', kind: 'repeating', originLabel: 'SECRET_ORIGIN', ticksPerDay: '1000', years: [{ months: [{ name: 'SECRET_MONTH', days: 12 }] }] });
    const other = createEntity(project.projectId, 'event', 'SECRET_EVENT', { time: { mode: 'instant', at: '99999999999999999999999999999999999999', calendarId: 'SECRET_PRIVATE_CALENDAR_ID' }, summary: [] }); other.id = id(803); other.status = 'confirmed';
    project.entities.push(other); profile.data.includedIds.push(other.id);
    (profile.data.namePolicy as { byEntityId: Record<string, unknown> }).byEntityId[other.id] = { mode: 'replace', replacement: 'もう一つの暦の記録' };
    const result = createProjection(project, profile.id);
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error(JSON.stringify(result.issues));
    expect(result.projection.calendars).toHaveLength(2);
    expect(result.projection.calendars[1].ticksPerDay).toBe('1000');
    expect(result.projection.calendars[1].years?.[0].months).toEqual([{ name: '月1', days: 12 }]);
    const projected = result.projection.entities.find(entity => entity.id === result.idMap[other.id])!;
    expect(projected.data.time).toEqual({ mode: 'instant', at: '99999999999999999999999999999999999999', calendarId: result.projection.calendars[1].id });
    expect(JSON.stringify(result.projection)).not.toContain('SECRET');
  });

  it('does not keep a link to a public block in an excluded field', () => {
    const { project, profile, scene, place, publicBody } = fixture();
    profile.data.publicTexts![place.id] = { body: rich(250, 'この公開候補は今回の範囲外。') };
    profile.data.allowedFields = { place: [] };
    publicBody[0].links = [{ start: 3, end: 4, target: { entityId: place.id, blockId: id(250) } }];
    const result = createProjection(project, profile.id);
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error('Expected a safely pruned link');
    const body = result.projection.entities.find(entity => entity.id === result.idMap[scene.id])!.data.body as { links?: unknown[] }[];
    expect(body[0].links).toBeUndefined();
    expect(result.idMap[id(250)]).toBeUndefined();
  });

  it('rejects duplicate public block identities and missing executable dependencies', () => {
    const duplicate = fixture(); duplicate.profile.data.publicTexts![duplicate.character.id].summary = rich(201, '重複した段落ID');
    expect(createProjection(duplicate.project, duplicate.profile.id).ok).toBe(false);
    const strict = fixture();
    expect(createProjection(strict.project, strict.profile.id, { strictReferences: true }).ok).toBe(false);
  });

  it('omits draft content for readers while retaining explicitly selected consultation status', () => {
    const { project, profile, scene } = fixture(); scene.status = 'provisional'; profile.data.includedStatuses = ['confirmed', 'provisional'];
    // Remove public links so the chapter pruning is the only scope difference.
    profile.data.publicTexts![scene.id].body![0].links = [];
    const reader = createProjection(project, profile.id, { confirmedOnly: true });
    const consultation = createProjection(project, profile.id);
    expect(reader.ok && !reader.projection.entities.some(entity => entity.kind === 'scene')).toBe(true);
    expect(consultation.ok && consultation.projection.entities.some(entity => entity.kind === 'scene' && entity.status === 'provisional')).toBe(true);
  });

  it('publishes attachment metadata only with approval and replaces the private filename/path', () => {
    const { project, profile } = fixture();
    const asset = project.entities.find((entity): entity is Entity<'attachment'> => entity.kind === 'attachment')!;
    profile.data.includedIds.push(asset.id); profile.data.allowedKinds!.push('attachment');
    (profile.data.namePolicy as { byEntityId: Record<string, unknown> }).byEntityId[asset.id] = { mode: 'replace', replacement: '門の画像' };
    profile.data.publicTexts![asset.id] = { displayName: '門.jpg' };
    expect(createProjection(project, profile.id).ok).toBe(false);
    profile.data.approvedAttachmentIds = [asset.id];
    const result = createProjection(project, profile.id);
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error('Expected approved metadata');
    const projectedAsset = result.projection.entities.find(entity => entity.kind === 'attachment')!;
    expect(projectedAsset.data.assetPath).toBe(`assets/${projectedAsset.id}.jpg`);
    expect(projectedAsset.data.bytesIncluded).toBe(false);
    expect(JSON.stringify(projectedAsset)).not.toContain('SECRET');
  });

  it('freezes a detached immutable release with a content hash', async () => {
    const { project, profile } = fixture();
    const result = createProjection(project, profile.id);
    if (!result.ok) throw new Error('Expected a release');
    const snapshot = await createProjectionSnapshot(result.projection, { id: id(700), sourceRevision: '0', createdAt: '2026-10-05T00:00:00Z' });
    const originalTitle = snapshot.projection.title;
    result.projection.title = '公開候補を改訂';
    expect(snapshot.projection.title).toBe(originalTitle);
    expect(snapshot.contentHash).toMatch(/^[a-f0-9]{64}$/);
    expect(Object.isFrozen(snapshot.projection.entities[0].data)).toBe(true);
    expect(() => { (snapshot.projection as unknown as { title: string }).title = '上書き'; }).toThrow();
  });
});
