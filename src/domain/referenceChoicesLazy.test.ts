import { describe, expect, it } from 'vitest';
import { createEntity, createProject, ENTITY_KINDS } from './model';
import { referenceChoices, type ReferenceOptions } from './referenceChoices';
import { referenceChoices as baseline } from '../../scripts/optimization/referenceChoicesBaseline';
import { referenceEdgeProject, referenceScopes } from '../../scripts/optimization/referenceChoicesCases';
import { probeEnabled, startProbe } from '../observability/probe';
import type { EntityKind } from './types';

const versions = [undefined, 'project', 'pin', 'missing'];
const kindSets: Array<readonly EntityKind[] | undefined> = [undefined, [], ...ENTITY_KINDS.map(kind => [kind]), ['character', 'note'], ['snapshot', 'flow_node']];

describe('lazy reference preparation', () => {
  // An eager filter/map/name preparation in any of these scopes must fail here.
  it.each(['calendar', 'project', 'identity'] as const)('%s never reads entity rows with probe off or on', scope => {
    for (const enabled of [false, true]) for (const versionId of versions) {
      const project = referenceEdgeProject();
      const expected = baseline(project, scope, undefined, { versionId });
      const content = versionId === 'pin' ? project.snapshots[0].content : project;
      content.entities = new Proxy(content.entities, { get(target, key, receiver) {
        if (typeof key === 'string' && /^\d+$/.test(key)) throw new Error('unnecessary entity preparation');
        return Reflect.get(target, key, receiver);
      } });
      const capture = enabled ? startProbe() : undefined;
      try {
        expect(referenceChoices(project, scope, undefined, { versionId })).toEqual(expected);
        if (capture) expect(capture.snapshot().counters['reference.choices.rows'] ?? 0).toBe(0);
      } finally { capture?.stop(); }
      expect(probeEnabled()).toBe(false);
    }
  });

  it.each(['relation', 'block', 'alias'] as const)('%s avoids unused entity choice labels and kind filtering', scope => {
    const project = referenceEdgeProject();
    const expected = baseline(project, scope, ['note']);
    for (const entity of project.entities) Object.defineProperty(entity, 'kind', { get() { throw new Error('unnecessary entity kind read'); } });
    expect(referenceChoices(project, scope, ['note'])).toEqual(expected);
  });

  it.each(referenceScopes)('preserves baseline ID/label/order for %s across every kind, archive flag and pin', scope => {
    const project = referenceEdgeProject();
    for (const kinds of kindSets) for (const includeArchived of [false, true]) for (const versionId of versions) {
      const options = { includeArchived, versionId };
      expect(referenceChoices(project, scope, kinds, options), JSON.stringify({ scope, kinds, options })).toEqual(baseline(project, scope, kinds, options));
    }
  });

  it('matches every real entity kind with independent kind labels and full option matrix', () => {
    const project = createProject('All kinds');
    project.entities = ENTITY_KINDS.map((kind, index) => {
      const entity = createEntity(project.projectId, kind, `Kind ${kind}`);
      entity.id = `kind-${kind}`;
      if (index % 3 === 0) entity.deletedAt = '2026-10-17T00:00:00Z';
      return entity;
    });
    const { snapshots: _snapshots, history: _history, ...content } = structuredClone(project);
    project.snapshots = [{ id: 'pin', content, contentHash: 'c'.repeat(64), createdAt: '2026-10-17T00:00:00Z', versionLabel: 'All kinds' }];
    for (const scope of referenceScopes) for (const kinds of kindSets) for (const includeArchived of [false, true]) for (const versionId of [undefined, project.projectId, 'pin', 'missing']) {
      const options = { includeArchived, versionId };
      expect(referenceChoices(project, scope, kinds, options)).toEqual(baseline(project, scope, kinds, options));
    }
    expect(referenceChoices(project, 'entity', ['external_contract'], { includeArchived: true })).toEqual([{ id: 'kind-external_contract', label: 'Kind external_contract · 外部契約' }]);
    expect(referenceChoices(project, 'entity', ['projection_profile'], { includeArchived: true })).toEqual([{ id: 'kind-projection_profile', label: 'Kind projection_profile · 公開投影' }]);
  });

  it('has independent literal expectations for names, order, kinds, archive, aliases, public text and trigger', () => {
    const project = referenceEdgeProject();
    expect(referenceChoices(project, 'entity')).toEqual([
      { id: 'a', label: 'Same · 人物' }, { id: 'b', label: 'Same · 人物' }, { id: 'note', label: '無題 · メモ' },
      { id: 'flow', label: 'Flow · 進行ノード' }, { id: 'policy', label: 'Policy · 公開投影' }, { id: 'authored-pin', label: 'Authored pin · 公開版' },
    ]);
    expect(referenceChoices(project, 'entity', ['note'], { includeArchived: true })).toEqual([{ id: 'note', label: '無題 · メモ' }, { id: 'archived', label: 'Archived · メモ' }]);
    expect(referenceChoices(project, 'relation', ['note'])).toEqual([{ id: 'relation', label: 'trust · Same → 不明' }]);
    expect(referenceChoices(project, 'relation', undefined, { includeArchived: true })).toEqual([{ id: 'relation', label: 'trust · Same → Archived' }, { id: 'archived-relation', label: 'trust · Same → 不明' }]);
    expect(referenceChoices(project, 'alias', ['note'])).toEqual([{ id: 'alias', label: 'Same · 別名 AKA' }]);
    const blocks = [{ id: 'block', label: ` · ${'x'.repeat(40)}` }, { id: 'heading', label: ' · Heading' }, { id: 'list', label: ' · List' }, { id: 'quote', label: ' · Quote' }, { id: 'current-public', label: 'Policy · Current public' }];
    expect(referenceChoices(project, 'block', ['character'])).toEqual(blocks);
    expect(referenceChoices(project, 'presentation', ['note'])).toEqual([{ id: 'note', label: '無題 · メモ' }, ...blocks]);
    expect(referenceChoices(project, 'record', ['character'])).toEqual([{ id: 'a', label: 'Same · 人物' }, { id: 'b', label: 'Same · 人物' }, { id: 'relation', label: 'trust · Same → 不明' }]);
    expect(referenceChoices(project, 'projection_record', ['note'], { versionId: 'pin' })).toEqual([
      { id: 'note', label: '無題 · メモ' }, { id: 'relation', label: 'trust · Before → 不明' }, ...blocks.slice(0, 4),
      { id: 'public', label: 'Policy · Public' }, { id: 'current-public', label: 'Policy · Current public' }, { id: 'trigger', label: 'Flow · 起動条件' },
    ]);
    expect(referenceChoices(project, 'calendar')).toEqual([{ id: 'calendar', label: 'Calendar' }]);
    expect(referenceChoices(project, 'project', undefined, { versionId: 'pin' })).toEqual([{ id: 'project', label: 'Pinned project' }, { id: 'world', label: '参照する共通世界' }]);
    expect(referenceChoices(project, 'snapshot', ['note'], { versionId: 'missing' })).toEqual([{ id: 'project', label: '現在の作品版' }, { id: 'pin', label: '固定版 · Captured' }, { id: 'authored-pin', label: '固定版 · Authored pin' }, { id: 'world-pin', label: '固定した共通世界版' }]);
    expect(referenceChoices(project, 'identity')).toEqual([]);
    for (const scope of referenceScopes.filter(scope => scope !== 'snapshot')) expect(referenceChoices(project, scope, undefined, { versionId: 'missing' })).toEqual([]);
  });

  it('counts actual preparation passes and emits only numeric diagnostics', () => {
    const project = referenceEdgeProject();
    // Seven source rows, six active rows. Entity choices visit 7+6+6;
    // relation names and each rich-text/trigger walk visit six more rows.
    const expectedRows = { entity: 19, relation: 13, record: 25, projection_record: 37, presentation: 25, block: 13, alias: 13, snapshot: 14, project: 0, calendar: 0, identity: 0 };
    for (const scope of referenceScopes) {
      const capture = startProbe();
      try {
        referenceChoices(project, scope);
        const report = capture.snapshot();
        expect(report.counters['reference.choices.rows'] ?? 0, scope).toBe(expectedRows[scope]);
        expect(report.events).toHaveLength(1);
        expect(JSON.stringify(report)).not.toMatch(/Same|Archived|Policy|Current public|trigger/);
      } finally { capture.stop(); }
    }
    expect(referenceChoices(project)).toEqual(referenceChoices(project, 'entity'));
  });

  it('keeps current public policy semantics separate from pinned source and archived options', () => {
    const project = referenceEdgeProject();
    project.entities[4].deletedAt = '2026-10-17T00:00:00Z';
    const pinned = referenceChoices(project, 'projection_record', undefined, { versionId: 'pin', includeArchived: true });
    expect(pinned).toContainEqual({ id: 'public', label: 'Policy · Public' });
    expect(pinned.some(choice => choice.id === 'current-public')).toBe(false);
    project.entities[4].deletedAt = undefined;
    project.entities[4].name = 'Current policy';
    expect(referenceChoices(project, 'projection_record', undefined, { versionId: 'pin' })).toContainEqual({ id: 'current-public', label: 'Current policy · Current public' });
    project.snapshots[0].id = 'replaced-pin';
    expect(referenceChoices(project, 'projection_record', undefined, { versionId: 'pin' })).toEqual([]);
    expect(referenceChoices(project, 'projection_record', undefined, { versionId: 'replaced-pin' })).toEqual(baseline(project, 'projection_record', undefined, { versionId: 'replaced-pin' }));
  });

  it('deduplicates at first position using the last label and observes mutable input immediately', () => {
    const project = referenceEdgeProject();
    project.calendars.push({ ...project.calendars[0], name: 'Last label' });
    expect(referenceChoices(project, 'calendar')).toEqual([{ id: 'calendar', label: 'Last label' }]);
    const options: ReferenceOptions = { versionId: 'pin' };
    referenceChoices(project, 'projection_record', undefined, options);
    project.snapshots[0].content.entities[0].name = 'Pin edit';
    project.entities[4].data = { ...project.entities[4].data, publicTexts: { a: { body: [{ id: 'replacement', kind: 'paragraph', text: 'Replacement' }] } } } as never;
    expect(referenceChoices(project, 'projection_record', undefined, options)).toEqual(baseline(project, 'projection_record', undefined, options));
    expect(referenceChoices(project, 'entity', undefined, options)[0]).toEqual({ id: 'a', label: 'Pin edit · 人物' });
    project.entities[0].name = 'Current edit'; project.entities[1].deletedAt = '2026-10-17T00:00:00Z';
    expect(referenceChoices(project, 'entity', ['character'])).toEqual([{ id: 'a', label: 'Current edit · 人物' }]);
    options.versionId = 'missing'; expect(referenceChoices(project, 'projection_record', undefined, options)).toEqual([]);
  });
});
