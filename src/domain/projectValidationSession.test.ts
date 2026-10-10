import { describe, expect, it } from 'vitest';
import { createEntity, createProject, createProjectValidator, emptyValidity, newId, RELATION_TYPES, textToRichText, validateProject } from './model';
import { captureImmutablePlainData } from './immutablePlainData';
import { createProjectValidationSession, validateProjectIntegrity } from './projectRecordValidation';
import type { ContentState, ProjectContent, ProjectData, Relation, ValidationResult } from './types';
import { createWorldSnapshot } from './world';
import { jsonBytes, sha256 } from '../storage/json';
import { exportScenario, inspectScenario } from '../storage/archive';

const own = <T>(input: T): T => captureImmutablePlainData(input).value;
const refused = (result: ValidationResult<ProjectData>, path: string) => {
  expect(result.ok).toBe(false);
  if (!result.ok) expect(result.issues.some(issue => issue.path.includes(path)), result.issues.map(issue => `${issue.path}: ${issue.message}`).join('\n')).toBe(true);
};

async function citationFixture() {
  let project = createProject('固定本文を参照する作品');
  const scene = createEntity(project.projectId, 'scene', '旧本文', { body: textToRichText('😀e\u0301門') });
  project.entities.push(scene);
  project = await createWorldSnapshot(project, '固定された旧版');
  const pin = project.snapshots[0];
  const note = createEntity(project.projectId, 'note', '引用', { body: [{ id: newId(), kind: 'paragraph', text: '案内',
    links: [{ start: 0, end: 2, target: { entityId: scene.id, sourceVersionId: pin.id, blockId: scene.data.body![0].id, start: 1, end: 4 } }] }] });
  project.entities.push(note);
  return { project: own(project), scene, note };
}

describe('captured full-validation sessions', () => {
  it('checks headers, history metadata and snapshot metadata after the same contents already succeeded', async () => {
    const { project } = await citationFixture(), validate = createProjectValidator();
    expect(validate(project).ok).toBe(true);
    expect(validate(own({ ...project, name: '名前だけ変更', revision: '1' })).ok).toBe(true);
    refused(validate(own({ ...project, projectId: newId() })), 'projectId');
    refused(validate(own({ ...project, calendarId: 'missing-calendar' })), 'calendarId');
    refused(validate(own({ ...project, revision: '-1' })), 'revision');
    refused(validate(own({ ...project, unexpected: '未知の項目' })), 'unexpected');
    const { history: _history, ...state } = project;
    const before: ContentState = { ...state, revision: '0' }, after: ContentState = { ...state, revision: '1' };
    const command = { operationId: newId(), projectId: project.projectId, baseRevision: '0', revision: '1', targetIds: [], reason: '作品名の通常保存', createdAt: '2026-10-10T00:00:00Z', before, after };
    const retained = own({ ...project, revision: '1', history: [command] });
    expect(validate(retained).ok).toBe(true);
    refused(validate(own({ ...retained, history: [{ ...command, unexpected: true }] })), 'history[0].unexpected');
    refused(validate(own({ ...retained, history: [{ ...command, before: { ...before, unexpected: true } }] })), 'history[0].before.unexpected');
    refused(validate(own({ ...retained, history: [command, command] })), 'operationId');
    refused(validate(own({ ...project, snapshots: [{ ...project.snapshots[0], createdAt: '日時不明' }] })), 'createdAt');
    refused(validate(own({ ...project, snapshots: [{ ...project.snapshots[0], unexpected: true }] })), 'snapshots[0].unexpected');
    refused(validate(own({ ...project, snapshots: [project.snapshots[0], project.snapshots[0]] })), 'snapshots[1].id');
  });

  it('revalidates a fixed Unicode citation against the exact same-ID replacement contents and changed declared versions', async () => {
    const { project, scene } = await citationFixture(), validate = createProjectValidator();
    expect(validate(project).ok).toBe(true);
    const pin = project.snapshots[0];
    const short: ProjectContent = { ...pin.content, entities: pin.content.entities.map(entity => entity.id === scene.id && entity.kind === 'scene'
      ? { ...entity, data: { ...entity.data, body: [{ ...entity.data.body![0], text: '門' }] } } : entity) };
    const changed = own({ ...project, snapshots: [{ ...pin, content: short, contentHash: await sha256(jsonBytes(short)) }] });
    // Current entity collections deliberately retain their identities. The
    // referenced fixed content, not those current collections, changed.
    expect(changed.entities).toBe(project.entities);
    refused(validate(changed), 'target');
    expect(validateProject(changed).ok).toBe(false);
    refused(validate(own({ ...project, snapshots: [{ ...pin, id: newId() }] })), 'sourceVersionId');
    refused(validate(own({ ...project, snapshots: [] })), 'sourceVersionId');
    expect(validate(project).ok).toBe(true);
  });

  it('recaptures mutable and shallow-frozen caller graphs and leaves author inputs mutable', async () => {
    const { project, note } = await citationFixture(), source = structuredClone(project), validate = createProjectValidator();
    Object.freeze(source);
    expect(validate(source).ok).toBe(true);
    expect(Object.isFrozen(source.entities)).toBe(false);
    const changed = source.entities.find(entity => entity.id === note.id)!;
    if (changed.kind !== 'note') throw new Error('Missing normal note fixture');
    changed.data.body[0].links![0].target.end = 99;
    refused(validate(source), 'target');
    changed.data.body[0].links![0].target.end = 4;
    expect(validate(source).ok).toBe(true);
  });

  it('keeps captured world dependencies fixed across asynchronous integrity checks and rejects a changed or missing registry in a fresh scope', async () => {
    let world = createProject('固定世界');
    const place = createEntity(world.projectId, 'place', '固定版の街'); world.entities.push(place);
    world = await createWorldSnapshot(world, '第一版'); const pin = world.snapshots[0];
    const project = createProject('世界を借りる作品');
    project.worldReferences.push({ projectId: world.projectId, immutableSnapshotId: pin.id, contentHash: pin.contentHash });
    project.entities.push(createEntity(project.projectId, 'event', '街の出来事', { locationId: place.id }));
    const registry = { [pin.id]: pin.content }, session = createProjectValidationSession({ worldSnapshots: registry });
    expect(session.validate(project).ok).toBe(true);
    const pending = session.integrity(project);
    registry[pin.id] = { ...pin.content, entities: [] };
    expect(Object.isFrozen(pin.content)).toBe(false);
    expect(await pending).toEqual([]);
    expect(session.validate(project).ok).toBe(true);
    expect(await session.integrity(project)).toEqual([]);
    const replacement = createProjectValidationSession({ worldSnapshots: registry });
    expect(replacement.validate(project).ok).toBe(false);
    expect((await replacement.integrity(project)).length).toBeGreaterThan(0);
    expect(createProjectValidationSession().validate(project).ok).toBe(false);
  });

  it('does not reuse a proof from different relation rules or draft/runtime requirements', () => {
    const project = createProject('自己関係の明示規則');
    const person = createEntity(project.projectId, 'character', '人物'); project.entities.push(person);
    const relation: Relation = { id: newId(), projectId: project.projectId, fromId: person.id, toId: person.id, relationType: 'trust', direction: 'forward',
      revision: '0', evidenceIds: [], status: 'confirmed', visibility: 'private', validity: emptyValidity() };
    project.relations.push(relation);
    const relationTypes = structuredClone(RELATION_TYPES); relationTypes.find(type => type.key === 'trust')!.allowSelf = true;
    const options = { relationTypes, runtime: false }, session = createProjectValidationSession(options);
    expect(session.validate(project).ok).toBe(true);
    relationTypes.find(type => type.key === 'trust')!.allowSelf = false;
    expect(session.validate(project).ok).toBe(true);
    expect(createProjectValidationSession(options).validate(project).ok).toBe(false);
    const draft = createProject('初期値は未定の稿'); draft.entities.push(createEntity(draft.projectId, 'variable', '未定状態', { key: 'undecided' }));
    const draftOptions = { runtime: false }, draftSession = createProjectValidationSession(draftOptions);
    expect(draftSession.validate(draft).ok).toBe(true); draftOptions.runtime = true;
    expect(draftSession.validate(draft).ok).toBe(true);
    refused(createProjectValidationSession(draftOptions).validate(draft), 'initial');
  });

  it('keeps complete-file snapshot digest checks and the original image integrity result', async () => {
    const { project } = await citationFixture(), session = createProjectValidationSession();
    expect(await session.integrity(project)).toEqual(await validateProjectIntegrity(project));
    expect(await session.integrity(project)).toEqual([]);
    const wrong = own({ ...project, snapshots: [{ ...project.snapshots[0], contentHash: '0'.repeat(64) }] });
    const issues = await session.integrity(wrong);
    expect(issues).toEqual(await validateProjectIntegrity(wrong));
    await expect(exportScenario(wrong)).rejects.toMatchObject({ code: 'HASH_MISMATCH' });
    const restored = await inspectScenario(await exportScenario(project), { worker: false });
    expect(restored.project).toEqual(project);
    expect(await session.integrity(project)).toEqual([]);
  });
});
