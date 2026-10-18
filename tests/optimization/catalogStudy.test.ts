import { describe, expect, it } from 'vitest';
import { createEntity, createProject, emptyValidity } from '../../src/domain/model';
import { captureImmutablePlainData } from '../../src/domain/immutablePlainData';
import { filterCatalogEntities } from '../../src/domain/catalog';
import { startProbe } from '../../src/observability/probe';
import { createCatalogStudy } from '../../scripts/optimization/catalogStudy';
import type { StudyOwner } from '../../scripts/optimization/catalogStudy';
import type { ProjectData, Query } from '../../src/domain/types';

const owner: StudyOwner = Object.freeze({ account: 'synthetic-account', role: 'author-1', project: 'synthetic-project', revision: '0', pins: 'pin-a:hash-a', schema: 'schema-1', visibility: 'author', normalization: 'nfkc-kana-1' });
function fixture() {
  const project = createProject('研究専用'), first = createEntity(project.projectId, 'character', '葵', {
    reading: 'あおい', aliases: [{ id: 'synthetic-alias', text: '青衣', reading: 'あおい', validity: emptyValidity(), audienceHolderIds: [], isPublicDefault: false }],
  });
  const second = createEntity(project.projectId, 'character', '葵');
  const event = createEntity(project.projectId, 'event', '夜の門', { participants: [{ characterId: first.id, role: 'witness' }] });
  const scene = createEntity(project.projectId, 'scene', '夜の場面', { eventIds: [event.id] });
  const archived = createEntity(project.projectId, 'note', '青衣'); archived.deletedAt = '2026-10-18T00:00:00Z';
  project.entities = [second, scene, first, archived, event];
  return { project, first, second, scene, event };
}
function frozen(project: ProjectData) { const result = captureImmutablePlainData(project); expect(result.captured).toBe(true); return result.value; }
const ids = (rows: { id: string }[]) => rows.map(row => row.id);

for (const mode of ['current', 'corpus', 'results'] as const) describe(`catalog study ${mode}`, () => {
  it('preserves hand-written Japanese, same-name, archive, reference and ordering expectations', () => {
    const f = fixture(), project = frozen(f.project), study = createCatalogStudy(project, owner, mode);
    const cases: [Query, string[]][] = [
      [{ op: 'text', value: 'ア オ イ' }, [f.first.id]],
      [{ op: 'text', value: '青衣' }, [f.first.id]],
      [{ op: 'text', value: '葵' }, [f.second.id, f.first.id]],
      [{ op: 'text', value: f.first.id }, []],
      [{ op: 'participant', characterId: f.first.id }, [f.scene.id, f.event.id]],
      [{ op: 'all', children: [{ op: 'participant', characterId: f.first.id }, { op: 'text', value: '場面' }] }, [f.scene.id]],
      [{ op: 'any', children: [{ op: 'kind', value: 'character' }, { op: 'text', value: '場面' }] }, [f.second.id, f.scene.id, f.first.id]],
      [{ op: 'all', children: [] }, [f.second.id, f.scene.id, f.first.id, f.event.id]],
      [{ op: 'any', children: [] }, []],
    ];
    for (const [query, expected] of cases) {
      expect(ids(study.query(query, owner))).toEqual(expected);
      expect(ids(study.query(query, owner))).toEqual(ids(filterCatalogEntities(project, query)));
    }
    study.close();
    expect(study.stats()).toMatchObject({ closed: true, retainedTerms: 0, retainedUtf8Bytes: 0, resultEntries: 0, resultReferences: 0, projectRows: 0 });
    expect(() => study.query({ op: 'text', value: '' }, owner)).toThrow(/closed/);
  });

  it('does not expose a cached result array to caller mutation', () => {
    const f = fixture(), study = createCatalogStudy(frozen(f.project), owner, mode), query: Query = { op: 'text', value: '葵' };
    const result = study.query(query, owner); result.reverse(); result.pop();
    expect(ids(study.query(query, owner))).toEqual([f.second.id, f.first.id]); study.close();
  });

  it.each(Object.keys(owner) as (keyof StudyOwner)[])('rejects changed %s and destroys the old scope before returning', key => {
    const study = createCatalogStudy(frozen(fixture().project), owner, mode);
    study.query({ op: 'text', value: '青衣' }, owner);
    expect(() => study.query({ op: 'text', value: '青衣' }, { ...owner, [key]: 'different' })).toThrow(/owner/);
    expect(study.stats()).toMatchObject({ closed: true, retainedTerms: 0, resultEntries: 0, projectRows: 0 });
  });

  it('does not share by project ID or revision when an independent image changes names, aliases or deletion', () => {
    const f = fixture(), first = frozen(f.project), oldStudy = createCatalogStudy(first, owner, mode);
    expect(ids(oldStudy.query({ op: 'text', value: '青衣' }, owner))).toEqual([f.first.id]);
    f.first.name = '桜'; f.first.data.reading = 'さくら'; f.first.data.aliases = []; f.second.deletedAt = '2026-10-18T00:00:00Z';
    const next = createCatalogStudy(frozen(f.project), owner, mode);
    expect(ids(next.query({ op: 'text', value: '青衣' }, owner))).toEqual([]);
    expect(ids(next.query({ op: 'text', value: '桜' }, owner))).toEqual([f.first.id]);
    expect(ids(next.query({ op: 'text', value: '葵' }, owner))).toEqual([]);
    expect(ids(oldStudy.query({ op: 'text', value: '青衣' }, owner))).toEqual([f.first.id]);
    oldStudy.close(); next.close();
  });
});

describe('catalog study safety and resource limits', () => {
  it('rejects an inherited owner rather than losing all guard dimensions', () => {
    expect(() => createCatalogStudy(frozen(fixture().project), Object.create(owner), 'results')).toThrow(/owner/);
  });
  it('does not invoke a query JSON hook or cache its forged serialization', () => {
    const f = fixture(), study = createCatalogStudy(frozen(f.project), owner, 'results'); let calls = 0;
    const unusual = { op: 'text' as const, value: '青衣', toJSON() { calls++; return { op: 'text', value: '場面' }; } };
    expect(ids(study.query(unusual, owner))).toEqual([f.first.id]);
    expect(ids(study.query({ op: 'text', value: '場面' }, owner))).toEqual([f.scene.id]);
    expect(calls).toBe(0); study.close();
  });
  it('records the actual full row scan in corpus mode despite reusing normalization', () => {
    const study = createCatalogStudy(frozen(fixture().project), owner, 'corpus'), capture = startProbe();
    try {
      study.query({ op: 'text', value: '青衣' }, owner); study.query({ op: 'text', value: '場面' }, owner);
      expect(capture.snapshot().counters['query.filter.rows']).toBe(10);
      expect(capture.snapshot().counters['query.text.rows']).toBe(4);
    } finally { capture.stop(); study.close(); }
  });
  it.each(['corpus', 'results'] as const)('reduces actual catalog text work on repeated queries in %s mode', mode => {
    const study = createCatalogStudy(frozen(fixture().project), owner, mode), query: Query = { op: 'text', value: '葵' };
    const capture = startProbe();
    try {
      study.query(query, owner); const first = capture.snapshot().counters['query.text.rows'];
      expect(first).toBe(4); study.query(query, owner);
      expect(capture.snapshot().counters['query.text.rows']).toBe(first);
    } finally { capture.stop(); study.close(); }
  });
  it('rejects a public owner at construction instead of indexing author content', () => {
    expect(() => createCatalogStudy(frozen(fixture().project), { ...owner, visibility: 'public' }, 'corpus')).toThrow(/author-only/);
  });
  it.each([NaN, Infinity, -1, 0.5])('rejects invalid budget %s', maxTextBytes => {
    expect(() => createCatalogStudy(frozen(fixture().project), owner, 'corpus', { maxTextBytes })).toThrow(/budget/);
  });
  it.each(['corpus', 'results'] as const)('rejects mutable and shallow-frozen %s sources without freezing the input', mode => {
    const f = fixture();
    expect(() => createCatalogStudy(f.project, owner, mode)).toThrow(/immutable/);
    expect(Object.isFrozen(f.first)).toBe(false);
    Object.freeze(f.project); Object.freeze(f.project.entities);
    expect(() => createCatalogStudy(f.project, owner, mode)).toThrow(/immutable/);
    expect(Object.isFrozen(f.first.data)).toBe(false);
  });
  it('keeps the full current path responsive to a mutable draft', () => {
    const f = fixture(), study = createCatalogStudy(f.project, owner, 'current');
    expect(ids(study.query({ op: 'text', value: '桜' }, owner))).toEqual([]);
    f.first.name = '桜'; expect(ids(study.query({ op: 'text', value: '桜' }, owner))).toEqual([f.first.id]); study.close();
  });
  it('never retains more normalized UTF-8 bytes than the corpus budget, including with a multibyte term', () => {
    const f = fixture(), study = createCatalogStudy(frozen(f.project), owner, 'corpus', { maxTextBytes: 3 });
    for (let i = 0; i < 3; i++) expect(ids(study.query({ op: 'text', value: '青衣' }, owner))).toEqual([f.first.id]);
    expect(study.stats().retainedUtf8Bytes).toBeLessThanOrEqual(3); study.close();
  });
  it('bounds result entries and references, while returning the full exact result on an oversized miss', () => {
    const f = fixture(), study = createCatalogStudy(frozen(f.project), owner, 'results', { maxResultEntries: 1, maxResultReferences: 1 });
    expect(ids(study.query({ op: 'text', value: '葵' }, owner))).toEqual([f.second.id, f.first.id]);
    for (const text of ['青衣', '場面', '門']) {
      expect(ids(study.query({ op: 'text', value: text }, owner))).toEqual(ids(filterCatalogEntities(f.project, { op: 'text', value: text })));
      expect(study.stats().resultEntries).toBeLessThanOrEqual(1); expect(study.stats().resultReferences).toBeLessThanOrEqual(1);
    }
    study.close();
  });
  it('exposes numeric diagnostics only, with no synthetic private text, IDs or owner in the diagnostic object', () => {
    const f = fixture(), study = createCatalogStudy(frozen(f.project), owner, 'corpus'); study.query({ op: 'text', value: '青衣' }, owner);
    for (const value of Object.values(study.stats())) expect(['number', 'boolean']).toContain(typeof value);
    const encoded = JSON.stringify(study.stats()); for (const secret of ['青衣', f.first.id, owner.account]) expect(encoded).not.toContain(secret); study.close();
  });
});
