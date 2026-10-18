/** Research-only comparison; never imported by the product. */
import { collectCatalogText, compileCatalogQuery, filterCatalogEntities, normalizeCatalogText } from '../../src/domain/catalog';
import { captureImmutablePlainData, isImmutablePlainData } from '../../src/domain/immutablePlainData';
import { probeCount, probeSpan } from '../../src/observability/probe';
import type { Entity, ProjectData, Query } from '../../src/domain/types';
export interface StudyOwner { account: string; role: string; project: string; revision: string; pins: string; schema: string; visibility: string; normalization: string }
export interface StudyLimits { maxTextBytes?: number; maxResultEntries?: number; maxResultReferences?: number }
const dimensions = ['account', 'role', 'project', 'revision', 'pins', 'schema', 'visibility', 'normalization'] as const;
function ownerImage(value: StudyOwner): StudyOwner {
  if (!value || typeof value !== 'object') throw new TypeError('Invalid study owner');
  const result = {} as StudyOwner;
  for (const key of dimensions) {
    const field = Object.getOwnPropertyDescriptor(value, key);
    if (!field || !Object.hasOwn(field, 'value') || typeof field.value !== 'string' || !field.value) throw new TypeError('Invalid study owner');
    result[key] = field.value;
  }
  return Object.freeze(result);
}
export function createCatalogStudy(input: ProjectData, owner: StudyOwner, mode: 'current' | 'corpus' | 'results', limits: StudyLimits = {}) {
  if (!['current', 'corpus', 'results'].includes(mode)) throw new TypeError('Unknown study mode');
  const scope = ownerImage(owner);
  if (scope.visibility !== 'author') throw new TypeError('Study is author-only; use a public projection for public search');
  if (mode !== 'current' && !isImmutablePlainData(input)) throw new TypeError('Study cache requires a deeply immutable plain source');
  const budget = (value: number | undefined, fallback: number) => {
    const result = value ?? fallback;
    if (!Number.isSafeInteger(result) || result < 0) throw new RangeError('Invalid study budget');
    return result;
  };
  const maxTextBytes = budget(limits.maxTextBytes, 8 * 1024 * 1024);
  const maxResultEntries = budget(limits.maxResultEntries, 8), maxResultReferences = budget(limits.maxResultReferences, 100_000);
  let project: ProjectData | undefined = input, textRowsBuilt = 0, cacheHits = 0, cacheMisses = 0;
  let retainedTerms = 0, retainedUtf8Bytes = 0, resultReferences = 0;
  const corpus = new Map<Entity, string[]>(), results = new Map<string, Entity[]>(), encoder = new TextEncoder();
  function close() { project = undefined; corpus.clear(); results.clear(); retainedTerms = retainedUtf8Bytes = resultReferences = 0; }
  function terms(entity: Entity) {
    const previous = corpus.get(entity);
    if (previous) { cacheHits++; return previous; }
    cacheMisses++; textRowsBuilt++;
    const value = collectCatalogText(entity).map(term => term.normalized);
    const bytes = value.reduce((total, term) => total + encoder.encode(term).byteLength, 0);
    if (bytes <= maxTextBytes - retainedUtf8Bytes && corpus.size < 100_000) {
      corpus.set(entity, value); retainedUtf8Bytes += bytes; retainedTerms += value.length;
    }
    return value;
  }
  function compile(query: Query): (entity: Entity) => boolean {
    if (query.op === 'all' || query.op === 'any') {
      const children = query.children.map(compile);
      return query.op === 'all' ? entity => children.every(matches => matches(entity)) : entity => children.some(matches => matches(entity));
    }
    if (query.op === 'text') {
      const needle = normalizeCatalogText(query.value);
      return !needle ? () => true : entity => terms(entity).some(term => term.includes(needle));
    }
    return compileCatalogQuery(project!, query);
  }
  return {
    query(query: Query, currentOwner: StudyOwner): Entity[] {
      if (!project) throw new Error('Study is closed');
      let current: StudyOwner;
      try { current = ownerImage(currentOwner); } catch { close(); throw new Error('Invalid study owner; start a new scope'); }
      if (dimensions.some(key => current[key] !== scope[key])) { close(); throw new Error('Study owner changed; start a new scope'); }
      if (mode === 'current') return filterCatalogEntities(project, query);
      if (mode === 'corpus') {
        const finish = probeSpan('query.filter'); probeCount('query.filter.rows', project.entities.length);
        try { const matches = compile(query), found = project.entities.filter(entity => !entity.deletedAt && matches(entity)); finish(); return found; }
        catch (error) { finish('error'); throw error; }
      }
      // Hooks/accessors/functions are not stable query keys. Preserve the exact full path without caching them.
      const capturedQuery = captureImmutablePlainData(query);
      if (!capturedQuery.captured) return filterCatalogEntities(project, query);
      const key = JSON.stringify(capturedQuery.value), previous = results.get(key);
      if (previous) { cacheHits++; results.delete(key); results.set(key, previous); return previous.slice(); }
      cacheMisses++;
      const found = filterCatalogEntities(project, query);
      // Bound both the key and reference sets; these are logical quantities, not heap bytes.
      if (encoder.encode(key).byteLength <= 4096 && found.length <= maxResultReferences && maxResultEntries > 0) {
        while (results.size && (results.size >= maxResultEntries || resultReferences + found.length > maxResultReferences)) {
          const oldest = results.keys().next().value!; resultReferences -= results.get(oldest)!.length; results.delete(oldest);
        }
        results.set(key, found.slice()); resultReferences += found.length;
      }
      return found;
    },
    stats() { return { closed: !project, retainedTerms, retainedUtf8Bytes, resultEntries: results.size, resultReferences, projectRows: project?.entities.length ?? 0, textRowsBuilt, cacheHits, cacheMisses }; },
    close,
  };
}
