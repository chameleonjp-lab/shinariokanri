import 'fake-indexeddb/auto';
import {expect, it} from 'vitest';
import {createEntity, createProject, newId} from '../src/domain/model';
import type {Entity, ProjectData} from '../src/domain/types';
import {createWorldSnapshot} from '../src/domain/world';
import {findReplacementOccurrences} from '../src/domain/selectiveEdits';
import {ScenarioStore} from '../src/storage/store';

it.each(['replace', 'restore'] as const)('%s creates and reopens dependency reviews in the same atomic author command', async method => {
  let project = createProject('人物の要約を選んで変更する');
  const block = {id: newId(), kind: 'paragraph' as const, text: 'Alice'};
  const person = createEntity(project.projectId, 'character', 'Alice', {summary: [block]});
  const scene = createEntity(project.projectId, 'scene', '見直す場面', {povId: person.id, body: [{id: newId(), kind: 'paragraph', text: '本文は自動変更しない'}]});
  project.entities.push(person, scene);
  project = await createWorldSnapshot(project, 'Aliceの稿');
  project.entities = project.entities.map(entity => entity.id === person.id && entity.kind === 'character'
    ? {...entity, data: {...entity.data, summary: [{...block, text: 'Alicia'}]}} : entity);
  project = await createWorldSnapshot(project, 'Aliciaの稿');
  let fail = false;
  const store = new ScenarioStore({databaseName: `f-dependency-${newId()}`, faultInjector: () => {if (fail) throw new DOMException('full', 'QuotaExceededError');}});
  try {
    const current = (await store.saveProject(project, {reason: '試験の初期状態'})).project;
    const pins = structuredClone(current.snapshots);
    async function apply(input: ProjectData, sourceIndex: 0 | 1) {
      if (method === 'restore') {
        const preview = await store.previewParagraphRestore(input.projectId, input.snapshots[sourceIndex].id, input.snapshots[1 - sourceIndex].id,
          [{entityId: person.id, field: 'summary', blockId: block.id}]);
        return (await store.restoreParagraphs(input.projectId, preview)).project;
      }
      const term = sourceIndex === 0 ? 'Alicia' : 'Alice', replacement = sourceIndex === 0 ? 'Alice' : 'Alicia';
      const selected = findReplacementOccurrences(input, term).filter(row => row.entityId === person.id && row.field === 'summary');
      expect(selected).toHaveLength(1);
      const preview = await store.previewOccurrenceReplacement(input.projectId, term, replacement, selected);
      return (await store.replaceOccurrences(input.projectId, preview)).project;
    }
    fail = true;
    await expect(apply(current, 0)).rejects.toBeDefined();
    expect(await store.getProject(current.projectId)).toEqual(current);
    fail = false;
    const first = await apply(current, 0);
    const reviews = first.entities.filter((entity): entity is Entity<'review'> => entity.kind === 'review' && !entity.deletedAt);
    expect(reviews).toHaveLength(1);
    const review = reviews[0];
    expect(review).toMatchObject({status: 'needs_review', visibility: 'private', data: {target: scene.id, stage: 'open'},
      customValues: {'changeReview.generatedBy': 'semantic-change-review/v1'}});
    expect(JSON.parse(String(review.customValues['changeReview.sourceFields']))).toEqual({[person.id]: ['data.summary']});
    expect(first.entities.find(entity => entity.id === scene.id)?.data).toEqual(scene.data);
    expect(first.history).toHaveLength(current.history.length + 1);
    expect(first.snapshots).toEqual(pins);
    const checkedReview = {...review, data: {...review.data, stage: 'verified' as const,
      resolution: [{id: newId(), kind: 'paragraph' as const, text: '以前の確認内容'}]}};
    const checked = (await store.saveProject({...first, entities: first.entities.map(entity => entity.id === review.id ? checkedReview : entity)}, {reason: '見直しを確認済みにする'})).project;
    const beforeReview = checked.entities.find(entity => entity.id === review.id)!;
    const second = await apply(checked, 1);
    const reopened = second.entities.filter((entity): entity is Entity<'review'> => entity.kind === 'review' && !entity.deletedAt);
    expect(reopened).toHaveLength(1);
    expect(reopened[0]).toMatchObject({id: review.id, status: 'needs_review', data: {stage: 'open', resolution: checkedReview.data.resolution}});
    expect(JSON.parse(String(reopened[0].customValues['changeReview.sourceRevisions']))).toEqual({[person.id]: '2'});
    expect(second.entities.find(entity => entity.id === scene.id)?.data).toEqual(scene.data);
    expect(second.snapshots).toEqual(pins);
    expect(second.history).toHaveLength(checked.history.length + 1);
    expect(second.history.at(-1)?.before.entities).toContainEqual(beforeReview);
    expect(second.history.at(-1)?.after.entities).toContainEqual(reopened[0]);
    const undone = (await store.undo(second.projectId)).project;
    expect(undone.entities.find(entity => entity.id === person.id)?.data).toMatchObject({summary: [{text: 'Alice'}]});
    expect(undone.entities.find(entity => entity.id === review.id)?.data).toEqual(beforeReview.data);
    expect(undone.snapshots).toEqual(pins);
  } finally {await store.deleteDatabase();}
});
