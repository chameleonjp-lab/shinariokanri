import { describe, expect, it } from 'vitest';
import { createEntity, createProject, createProjectValidator, emptyValidity, newId, RELATION_TYPES, ENTITY_SCHEMAS, ENTITY_KINDS, textToRichText, validateProject } from './model';
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

it('rechecks unchanged conditions when a same-ID dependency changes after a successful captured image', () => {
  const source = createProject('参照先の型が変わる履歴');
  const variable = createEntity(source.projectId, 'variable', '許可', {
    key: 'permit', valueType: 'boolean', initial: {type: 'boolean', value: false}, allowed: {values: [false, true]},
  });
  const character = createEntity(source.projectId, 'character', '人物', {aliases: [{
    id: newId(), text: '条件付きの別名', reading: '', audienceHolderIds: [], isPublicDefault: false,
    validity: {...emptyValidity(), routeCondition: {op: 'compare', variableId: variable.id, comparator: 'eq', value: {type: 'boolean', value: true}}},
  }]});
  source.entities.push(variable, character);
  const captured = own(source), validate = createProjectValidator();
  expect(validate(captured).ok).toBe(true);
  const renamed = own({...captured, name: '名前だけの変更', revision: '1'});
  expect(validate(renamed).ok).toBe(true);
  const integer = {...variable, data: {...variable.data, valueType: 'integer' as const, initial: {type: 'integer' as const, value: 1}, allowed: {min: 0, max: 10}}};
  const changed = own({...captured, revision: '2', entities: [integer, captured.entities[1]]});
  refused(validate(changed), '.aliases[0].validity.routeCondition.value');
  expect(validate(changed)).toEqual(validateProject(changed));
  expect(validate(captured).ok).toBe(true);
});

it('rechecks block collisions and changed target text after immutable content IDs were observed', () => {
  const source = createProject('履歴間の本文位置と重複');
  const first = createEntity(source.projectId, 'note', '本文', {body: textToRichText('😀門の前')});
  const anchor = createEntity(source.projectId, 'note', '本文へのリンク', {body: [{id: newId(), kind: 'paragraph', text: '参照', links: [{
    start: 0, end: 2, target: {entityId: first.id, blockId: first.data.body[0].id, start: 0, end: 3},
  }]}]});
  source.entities.push(first, anchor);
  const captured = own(source), validate = createProjectValidator();
  expect(validate(captured).ok).toBe(true);
  const shared = createEntity(source.projectId, 'note', '同じ段落ID', {body: captured.entities[0].kind === 'note' ? captured.entities[0].data.body : []});
  const duplicate = own({...captured, entities: [...captured.entities, shared]});
  refused(validate(duplicate), '.body[0].id');
  expect(validate(duplicate)).toEqual(validateProject(duplicate));
  const short = {...first, data: {...first.data, body: [{...first.data.body[0], text: '😀'}]}};
  const changed = own({...captured, entities: [short, captured.entities[1]]});
  refused(validate(changed), '.links[0].target.end');
  expect(validate(changed)).toEqual(validateProject(changed));
  expect(validate(captured).ok).toBe(true);
});

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
  it('rechecks changed live kinds and keeps cached reference kinds independent from a detached schema', () => {
    const source = createProject('参照先の種類を保持する'), place = createEntity(source.projectId, 'place', '街');
    source.entities.push(place, createEntity(source.projectId, 'event', '街の出来事', { locationId: place.id }));
    const project = own(source), validate = createProjectValidator(), kinds = [...ENTITY_KINDS], prior = ENTITY_SCHEMAS.event;
    try {
      expect(validate(project).ok).toBe(true);
      ENTITY_KINDS.splice(ENTITY_KINDS.indexOf('place'), 1);
      expect(validate(project).ok).toBe(false);
      expect(validate(own({ ...project, entities: [...project.entities] })).ok).toBe(false);
      expect(validateProject(project).ok).toBe(false);
      ENTITY_KINDS.splice(0, ENTITY_KINDS.length, ...kinds);
      expect(validate(project).ok).toBe(true);
      ENTITY_SCHEMAS.event = structuredClone(prior);
      if (prior.type !== 'object' || prior.fields.locationId.schema.type !== 'ref') throw new Error('Expected typed event location reference');
      const oldKinds = prior.fields.locationId.schema.kinds;
      if (!oldKinds) throw new Error('Expected allowed event location kinds');
      const originalOldKinds = [...oldKinds];
      try {
        oldKinds.splice(0, oldKinds.length, 'character');
        expect(validateProject(project).ok).toBe(true);
        expect(validate(own({ ...project, entities: [...project.entities] })).ok).toBe(true);
      } finally { oldKinds.splice(0, oldKinds.length, ...originalOldKinds); }
    } finally { ENTITY_KINDS.splice(0, ENTITY_KINDS.length, ...kinds); ENTITY_SCHEMAS.event = prior; }
    expect(validate(project).ok).toBe(true);
  });

  it('rechecks the same successful immutable image and records when the schema registry is replaced or edited', () => {
    const p = createProject('検証規則を変える'); p.entities.push(createEntity(p.projectId, 'character', '人物'));
    const project = own(p), validate = createProjectValidator(), prior = ENTITY_SCHEMAS.character;
    try {
      expect(validate(project).ok).toBe(true);
      ENTITY_SCHEMAS.character = { type: 'object', fields: { requiredExtra: { required: true, schema: { type: 'text' } } } };
      refused(validate(project), 'requiredExtra');
      refused(validate(own({ ...project, entities: [...project.entities] })), 'requiredExtra');
      ENTITY_SCHEMAS.character = prior;
      expect(validate(project).ok).toBe(true);
      if (prior.type !== 'object') throw new Error('Expected normal character schema');
      prior.fields.requiredExtra = { required: true, schema: { type: 'text' } };
      refused(validate(project), 'requiredExtra');
      refused(validate(own({ ...project, entities: [...project.entities] })), 'requiredExtra');
    } finally {
      if (prior.type === 'object') delete prior.fields.requiredExtra;
      ENTITY_SCHEMAS.character = prior;
    }
    expect(validate(project).ok).toBe(true);
  });

  it('invalidates successful proofs when a shared schema leaf changes in both owning paths', () => {
    const source = createProject('共有する読みの検証規則');
    source.entities.push(createEntity(source.projectId, 'character', '人物', {
      reading: 'あ', aliases: [{ id: newId(), text: '別名', reading: 'い', validity: emptyValidity(), audienceHolderIds: [], isPublicDefault: false }],
    }));
    const project = own(source), validate = createProjectValidator(), character = ENTITY_SCHEMAS.character;
    if (character.type !== 'object') throw new Error('Expected character schema');
    const reading = character.fields.reading.schema, aliases = character.fields.aliases.schema;
    if (reading.type !== 'text' || aliases.type !== 'array' || aliases.item.type !== 'object') throw new Error('Expected typed readings and aliases');
    expect(aliases.item.fields.reading.schema).toBe(reading);
    const minimum = reading.min;
    try {
      expect(validate(project).ok).toBe(true);
      reading.min = 2;
      const result = validate(project);
      refused(result, '.data.reading');
      refused(result, '.data.aliases[0].reading');
      reading.min = minimum;
      expect(validate(project).ok).toBe(true);
    } finally { reading.min = minimum; }
  });

  it('does not coerce a nonfinite schema limit into an earlier successful nullable limit', () => {
    const source = createProject('非有限の検証規則も再確認する');
    source.entities.push(createEntity(source.projectId, 'character', '人物', {reading: 'あ'}));
    const project = own(source), validate = createProjectValidator(), character = ENTITY_SCHEMAS.character;
    if (character.type !== 'object' || character.fields.reading.schema.type !== 'text') throw new Error('Expected reading text schema');
    const reading = character.fields.reading.schema, minimum = reading.min;
    try {
      // Registry values are mutable at runtime, including unsupported values.
      reading.min = null as unknown as number; expect(validate(project).ok).toBe(true);
      reading.min = Infinity; refused(validate(project), '.data.reading');
      expect(validateProject(project).ok).toBe(false);
      reading.min = minimum; expect(validate(project).ok).toBe(true);
    } finally { reading.min = minimum; }
  });

  it('checks each changed namespace and reference target after immutable record schemas already succeeded', () => {
    const source = createProject('同じ人物・出来事・関係を持つ履歴');
    const a = createEntity(source.projectId, 'character', '人物A'), b = createEntity(source.projectId, 'character', '人物B');
    const place = createEntity(source.projectId, 'place', '街'), event = createEntity(source.projectId, 'event', '街の出来事', { locationId: place.id });
    const relation: Relation = { id: newId(), projectId: source.projectId, fromId: a.id, toId: b.id, relationType: 'trust', direction: 'forward',
      revision: '0', evidenceIds: [], status: 'confirmed', visibility: 'private', validity: emptyValidity() };
    source.entities.push(a, b, place, event); source.relations.push(relation);
    const project = own(source), validate = createProjectValidator({ runtime: true });
    expect(validate(project).ok).toBe(true);
    const revised = own({ ...project, revision: '1', entities: [...project.entities].reverse() });
    expect(validate(revised).ok).toBe(true);
    refused(validate(own({ ...project, entities: project.entities.filter(entity => entity.id !== place.id) })), 'locationId');
    const wrongPlace = own(createEntity(project.projectId, 'character', '同IDの人物'));
    refused(validate(own({ ...project, entities: project.entities.map(entity => entity.id === place.id ? { ...wrongPlace, id: place.id } : entity) })), 'locationId');
    const wrongRecipient = own(createEntity(project.projectId, 'scene', '同IDの場面'));
    refused(validate(own({ ...project, entities: project.entities.map(entity => entity.id === b.id ? { ...wrongRecipient, id: b.id } : entity) })), 'toId');
    refused(validate(own({ ...project, entities: [...project.entities, project.entities[0]] })), 'id');
    const wrongMetadata = own({ ...project, entities: project.entities.map(entity => entity.id === a.id ? { ...entity, unexpected: true } : entity) });
    refused(validate(wrongMetadata), 'unexpected');
    const deleted = own({ ...project, entities: project.entities.map(entity => entity.id === place.id ? { ...entity, deletedAt: '2026-10-10T00:00:00Z', deletionOperationId: newId() } : entity) });
    refused(validate(deleted), 'locationId');
    // Previous successful record observations never turn a failed containing
    // image into proof. The unchanged original and reordered revision remain valid.
    expect(validate(project).ok).toBe(true); expect(validate(revised).ok).toBe(true);
  });

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
