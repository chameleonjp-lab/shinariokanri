import type { ContentAnchor, Entity, ProjectData, RichText } from './types';
import { normalizeCatalogText } from './catalog';
import {probeEnabled,probeCount,probeSpan} from '../observability/probe';
export interface CatalogTextPosition { id: string; entityId: string; name: string; fieldPath: string; text: string; anchor: ContentAnchor }
function tracedText(text: string) {
  const parts: string[] = [], starts: number[] = [], ends: number[] = []; let offset = 0;
  const segments = new Intl.Segmenter('ja', { granularity: 'grapheme' }).segment(text);
  for (const item of segments) {
    const length = Array.from(item.segment).length;
    const normalized = item.segment.normalize('NFKC').toLocaleLowerCase('ja').replace(/[ァ-ヶ]/g, char => String.fromCharCode(char.charCodeAt(0) - 0x60));
    for (const char of Array.from(normalized)) {
      if (/\s/u.test(char)) continue;
      parts.push(char);
      starts.push(offset); ends.push(offset + length);
    }
    offset += length;
  }
  if (parts.at(-1) === ' ') { parts.pop(); starts.pop(); ends.pop(); }
  return { text: parts.join(''), starts, ends };
}
// Saved records share unchanged blocks between revisions. Reuse their Unicode
// mapping without retaining discarded records; mutable caller inputs must still
// be checked against the exact current text.
const traces = new WeakMap<object, { source: string; trace: ReturnType<typeof tracedText> }>();
type TraceWork={blocks:number;builds:number;hits:number};
function blockTrace(block: RichText[number],work?:TraceWork) {
  const cached = traces.get(block);
  if (cached?.source === block.text) {if(work)work.hits++;return cached.trace;}
  if(work)work.builds++;
  const trace = tracedText(block.text);
  traces.set(block, { source: block.text, trace });
  return trace;
}
/** Search normalization is traced back to the untouched Unicode text, including width expansions. */
export function findCatalogTextPositions(project: ProjectData, entities: Entity[], query: string): CatalogTextPosition[] {
  const needle = normalizeCatalogText(query); if (!needle) return [];
  const work=probeEnabled()?{blocks:0,builds:0,hits:0}:undefined,finish=probeSpan('query.positions');
  probeCount('query.positions.rows',entities.length);
  const positions: CatalogTextPosition[] = [];
  try{
  for (const entity of entities) {
    if (entity.deletedAt || entity.projectId !== project.projectId) continue;
    for (const [key, value] of Object.entries(entity.data)) {
      if (!Array.isArray(value) || !value.every(block => block && typeof block === 'object' && typeof block.id === 'string' && typeof block.text === 'string' && ['paragraph', 'heading', 'list_item', 'quote'].includes(String(block.kind)))) continue;
      for (const block of value as RichText) {
        if(work)work.blocks++;
        const trace = blockTrace(block,work); let offset = 0;
        while ((offset = trace.text.indexOf(needle, offset)) >= 0) {
          const first = Array.from(trace.text.slice(0, offset)).length, last = first + Array.from(needle).length - 1;
          const start = trace.starts[first], end = trace.ends[last];
          if (start !== undefined && end !== undefined) positions.push({ id: `${entity.id}:${key}:${block.id}:${start}:${end}`, entityId: entity.id, name: entity.name, fieldPath: `data.${key}`, text: block.text, anchor: { entityId: entity.id, blockId: block.id, start, end, ...(entity.kind === 'dialogue_line' && key === 'text' ? { lineId: entity.id } : {}) } });
          offset += Math.max(1, needle.length);
        }
      }
    }
  }
  if(work){probeCount('query.positions.blocks',work.blocks);probeCount('query.positions.traceBuilds',work.builds);probeCount('query.positions.traceHits',work.hits);}
  probeCount('query.positions.matches',positions.length);finish();
  return positions;
  }catch(error){finish('error');throw error;}
}
