import type { Block, ContentAnchor, Entity, Relation, RichText, UnresolvedTextAnnotation } from './types';
import { newId } from './model';

export interface TextReplacement { start: number; end: number }
interface TextPosition { block: number; offset: number }
export interface TextTransform {
  blocks: RichText;
  range: (blockId: string, start: number, end: number) => { blockId: string; start: number; end: number } | undefined;
  block: (blockId: string) => string | undefined;
  lineRange: (start: number, end: number) => { start: number; end: number } | undefined;
}

const OVERLAP_REASON = '本文の置換・削除・段落分割が注記に重なり、元の文字を特定できません。';
const plain = (blocks: RichText) => blocks.map(block => block.text).join('\n');
// UI edit origins are transient. Saved files still contain only domain fields.
const editOrigins = new WeakMap<RichText, { before: RichText; transform: TextTransform; depth: number }>();

/** Character origins use Unicode code points, including the paragraph separators. */
function characterOrigins(before: string[], after: string[], replacement?: TextReplacement): (number | undefined)[] {
  const origins: (number | undefined)[] = new Array(before.length);
  let prefix = 0, suffix = 0;
  if (replacement && replacement.start >= 0 && replacement.end >= replacement.start && replacement.end <= before.length) {
    const insertedLength = after.length - (before.length - (replacement.end - replacement.start));
    if (insertedLength >= 0 && before.slice(0, replacement.start).join('') === after.slice(0, replacement.start).join('') && before.slice(replacement.end).join('') === after.slice(replacement.start + insertedLength).join('')) {
      for (let i = 0; i < replacement.start; i++) origins[i] = i;
      for (let i = replacement.end; i < before.length; i++) origins[i] = i + insertedLength - (replacement.end - replacement.start);
      return origins;
    }
  }
  while (prefix < before.length && prefix < after.length && before[prefix] === after[prefix]) { origins[prefix] = prefix; prefix++; }
  while (suffix < before.length - prefix && suffix < after.length - prefix && before[before.length - suffix - 1] === after[after.length - suffix - 1]) {
    origins[before.length - suffix - 1] = after.length - suffix - 1; suffix++;
  }
  const n = before.length - prefix - suffix, m = after.length - prefix - suffix;
  // Ordinary keystrokes need only prefix/suffix. Bound the work for large pastes:
  // unmatched characters become explicitly unresolved rather than guessed.
  if (!n || !m || n * m > 250_000) return origins;
  const width = m + 1, lcs = new Uint32Array((n + 1) * width);
  for (let i = n - 1; i >= 0; i--) for (let j = m - 1; j >= 0; j--) lcs[i * width + j] = before[prefix + i] === after[prefix + j] ? lcs[(i + 1) * width + j + 1] + 1 : Math.max(lcs[(i + 1) * width + j], lcs[i * width + j + 1]);
  let i = 0, j = 0;
  while (i < n && j < m) {
    if (before[prefix + i] === after[prefix + j]) { origins[prefix + i] = prefix + j; i++; j++; }
    else if (lcs[(i + 1) * width + j] > lcs[i * width + j + 1]) i++;
    else j++;
  }
  return origins;
}

function startsOf(blocks: { text: string }[]) {
  let offset = 0;
  return blocks.map(block => { const start = offset; offset += Array.from(block.text).length + 1; return start; });
}

/** Build a mapping without modifying the supplied blocks or their fixed IDs. */
export function buildTextTransform(before: RichText, after: RichText, replacement?: TextReplacement): TextTransform {
  const beforeText = plain(before), afterText = plain(after), oldChars = Array.from(beforeText), newChars = Array.from(afterText), oldStarts = startsOf(before), newStarts = startsOf(after);
  const origins = characterOrigins(oldChars, newChars, replacement);
  const oldByText = new Map<string, number[]>(), newByText = new Map<string, number[]>();
  before.forEach((block, i) => oldByText.set(block.text, [...(oldByText.get(block.text) ?? []), i]));
  after.forEach((block, i) => newByText.set(block.text, [...(newByText.get(block.text) ?? []), i]));
  const exact = new Map<number, number>(), reserved = new Set<number>();
  before.forEach((block, oldIndex) => {
    if (!replacement && oldByText.get(block.text)?.length !== newByText.get(block.text)?.length) return;
    const newIndex = after.findIndex(candidate => candidate.id === block.id && candidate.text === block.text);
    if (newIndex < 0) return;
    exact.set(oldIndex, newIndex);
    for (let j = 0; j < Array.from(block.text).length; j++) reserved.add(newStarts[newIndex] + j);
  });
  // Whole, unchanged paragraphs can move independently of the text diff.
  for (const [text, oldIndexes] of oldByText) {
    const newIndexes = newByText.get(text);
    if (!newIndexes || oldIndexes.length !== 1 || newIndexes.length !== 1) continue;
    oldIndexes.forEach((oldIndex, i) => {
      if (exact.has(oldIndex)) return;
      const newIndex = newIndexes[i]; exact.set(oldIndex, newIndex);
      for (let j = 0; j < Array.from(text).length; j++) reserved.add(newStarts[newIndex] + j);
    });
  }
  before.forEach((block, i) => {
    const exactIndex = exact.get(i);
    for (let j = 0; j < Array.from(block.text).length; j++) {
      const index = oldStarts[i] + j;
      if (exactIndex !== undefined) origins[index] = newStarts[exactIndex] + j;
      else if (origins[index] !== undefined && reserved.has(origins[index]!)) origins[index] = undefined;
      if (!replacement && !exact.has(i) && (oldByText.get(block.text)?.length ?? 0) > 1 && oldByText.get(block.text)?.length !== newByText.get(block.text)?.length) origins[index] = undefined;
    }
  });
  const positions = new Map<number, TextPosition>();
  after.forEach((block, i) => { for (let j = 0; j < Array.from(block.text).length; j++) positions.set(newStarts[i] + j, { block: i, offset: j }); });
  const oldIndexes = new Map(before.map((block, i) => [block.id, i]));
  const wholeTextPreserved = oldChars.every((_, i) => origins[i] !== undefined && origins[i] === origins[0]! + i);
  const countOccurrences = (text: string, quote: string) => {
    let count = 0, offset = 0;
    while (quote && (offset = text.indexOf(quote, offset)) >= 0) { count++; offset++; }
    return count;
  };
  const ambiguousInsertion = (quote: string) => !replacement && quote && countOccurrences(afterText, quote) > 1 && countOccurrences(beforeText, quote) !== countOccurrences(afterText, quote);
  const owners = new Map<number, number>();
  before.forEach((block, i) => {
    if (exact.has(i)) { owners.set(i, exact.get(i)!); return; }
    const counts = new Map<number, number>();
    for (let j = 0; j < Array.from(block.text).length; j++) {
      const mapped = origins[oldStarts[i] + j], position = mapped === undefined ? undefined : positions.get(mapped);
      if (position) counts.set(position.block, (counts.get(position.block) ?? 0) + 1);
    }
    const first = [...counts].sort((a, b) => a[0] - b[0])[0];
    if (first) owners.set(i, first[0]);
    else if (after.some(b => b.id === block.id)) owners.set(i, after.findIndex(b => b.id === block.id));
  });
  const contiguous = (start: number, end: number) => {
    if (start < 0 || end < start || end > oldChars.length) return undefined;
    if (start === end) {
      if (origins[start] !== undefined) return { start: origins[start]!, end: origins[start]! };
      if (start > 0 && origins[start - 1] !== undefined) return { start: origins[start - 1]! + 1, end: origins[start - 1]! + 1 };
      return undefined;
    }
    const first = origins[start]; if (first === undefined) return undefined;
    for (let i = start + 1; i < end; i++) if (origins[i] !== first + i - start) return undefined;
    return { start: first, end: first + end - start };
  };
  return {
    blocks: after,
    block: blockId => { const i = oldIndexes.get(blockId), owner = i === undefined ? undefined : owners.get(i); return owner === undefined ? undefined : after[owner]?.id; },
    lineRange: (start, end) => {
      const quoted = oldChars.slice(start, end).join('');
      if (ambiguousInsertion(quoted)) return undefined;
      if (!replacement && quoted && beforeText !== afterText && afterText.indexOf(quoted, afterText.indexOf(quoted) + 1) >= 0 && beforeText.indexOf(quoted, beforeText.indexOf(quoted) + 1) < 0) return undefined;
      if (!replacement && !wholeTextPreserved && quoted && beforeText.indexOf(quoted, beforeText.indexOf(quoted) + 1) >= 0) return undefined;
      return contiguous(start, end);
    },
    range: (blockId, start, end) => {
      const i = oldIndexes.get(blockId); if (i === undefined || end > Array.from(before[i].text).length) return undefined;
      const quoted = Array.from(before[i].text).slice(start, end).join('');
      if (!exact.has(i) && ambiguousInsertion(quoted)) return undefined;
      if (!replacement && !exact.has(i) && quoted && beforeText !== afterText && afterText.indexOf(quoted, afterText.indexOf(quoted) + 1) >= 0 && beforeText.indexOf(quoted, beforeText.indexOf(quoted) + 1) < 0) return undefined;
      // Without the actual textarea edit range, repeated text cannot identify
      // which occurrence survived a destructive edit. Keep it for relinking.
      if (!replacement && !wholeTextPreserved && !exact.has(i) && quoted && beforeText.indexOf(quoted, beforeText.indexOf(quoted) + 1) >= 0) return undefined;
      const result = contiguous(oldStarts[i] + start, oldStarts[i] + end); if (!result) return undefined;
      const first = positions.get(result.start) ?? (start === end ? positions.get(result.start - 1) : undefined);
      const last = positions.get(result.end - 1) ?? first;
      if (!first || !last || first.block !== last.block) return undefined;
      const offset = result.start - newStarts[first.block];
      return { blockId: after[first.block].id, start: offset, end: offset + end - start };
    },
  };
}

/** Keep unchanged annotation text, and detach any range that cannot be traced. */
export function editRichText(before: RichText, nextText: string, replacement?: TextReplacement): RichText {
  if (plain(before) === nextText) return before;
  const after: RichText = nextText === '' && !before.length ? [] : nextText.split('\n').map(text => ({ id: newId(), kind: 'paragraph', text }));
  let transform = buildTextTransform(before, after, replacement);
  const used = new Set<Block>();
  before.forEach((block, i) => {
    const owner = transform.block(block.id), target = after.find(b => b.id === owner) ?? (i === 0 && nextText === '' ? after[0] : undefined);
    if (target && !used.has(target)) { used.add(target); target.id = block.id; target.kind = block.kind; }
  });
  transform = buildTextTransform(before, after, replacement);
  const pending = (block: Block, annotation: UnresolvedTextAnnotation) => {
    const target = after.find(b => b.id === transform.block(block.id)) ?? after[0];
    if (target) target.unresolvedAnnotations = [...(target.unresolvedAnnotations ?? []), structuredClone(annotation)];
  };
  for (const block of before) {
    for (const annotation of block.unresolvedAnnotations ?? []) pending(block, annotation);
    for (const ruby of block.ruby ?? []) {
      const range = transform.range(block.id, ruby.start, ruby.end), target = range && after.find(b => b.id === range.blockId);
      if (range && target) target.ruby = [...(target.ruby ?? []), { start: range.start, end: range.end, text: ruby.text }];
      else pending(block, { kind: 'ruby', originalText: Array.from(block.text).slice(ruby.start, ruby.end).join(''), reason: OVERLAP_REASON, reading: ruby.text });
    }
    for (const link of block.links ?? []) {
      const range = transform.range(block.id, link.start, link.end), target = range && after.find(b => b.id === range.blockId);
      if (range && target) target.links = [...(target.links ?? []), { start: range.start, end: range.end, target: structuredClone(link.target) }];
      else pending(block, { kind: 'link', originalText: Array.from(block.text).slice(link.start, link.end).join(''), reason: OVERLAP_REASON, target: structuredClone(link.target) });
    }
  }
  const previous = editOrigins.get(before);
  if (previous && previous.depth >= 64) editOrigins.delete(before);
  editOrigins.set(after, { before, transform, depth: previous && previous.depth < 64 ? previous.depth + 1 : 1 });
  return after;
}

export function transformAnchor(anchor: ContentAnchor, entityId: string, before: RichText, transform: TextTransform, currentVersionId?: string): ContentAnchor {
  if (anchor.entityId !== entityId || (anchor.sourceVersionId && anchor.sourceVersionId !== currentVersionId) || anchor.positionStatus === 'unresolved') return anchor;
  const oldBlock = before.find(block => block.id === anchor.blockId);
  if (!oldBlock && anchor.lineId !== entityId) return anchor;
  const hasRange = typeof anchor.start === 'number' && typeof anchor.end === 'number';
  if (hasRange) {
    const range = oldBlock ? transform.range(oldBlock.id, anchor.start!, anchor.end!) : transform.lineRange(anchor.start!, anchor.end!);
    if (range) {
      if (range.start === anchor.start && range.end === anchor.end && (!oldBlock || 'blockId' in range && range.blockId === anchor.blockId)) return anchor;
      return { ...anchor, ...(oldBlock ? range : { start: range.start, end: range.end }) };
    }
  } else if (oldBlock) {
    const blockId = transform.block(oldBlock.id);
    if (blockId) return blockId === anchor.blockId ? anchor : { ...anchor, blockId };
  } else return anchor;
  const result: ContentAnchor = { ...anchor, positionStatus: 'unresolved', positionReason: OVERLAP_REASON, quotedText: hasRange ? Array.from(oldBlock?.text ?? plain(before)).slice(anchor.start!, anchor.end!).join('') : oldBlock?.text ?? '' };
  delete result.start; delete result.end;
  if (oldBlock) { const blockId = transform.block(oldBlock.id); if (blockId) result.blockId = blockId; else delete result.blockId; }
  return result;
}

function isRichText(value: unknown): value is RichText {
  return Array.isArray(value) && value.length > 0 && value.every(block => block && typeof block === 'object' && typeof block.id === 'string' && typeof block.text === 'string' && ['paragraph', 'heading', 'list_item', 'quote'].includes(block.kind));
}

/** Current references change in the same save command as their source text. Pinned versions stay fixed. */
function editedTextRemapper(beforeEntity: Entity, afterEntity: Entity): ((value: unknown) => unknown) | undefined {
  const beforeData = beforeEntity.data as unknown as Record<string, unknown>, afterData = afterEntity.data as unknown as Record<string, unknown>;
  const edits = Object.entries(beforeData).flatMap(([key, before]) => {
    const after = afterData[key];
    if (!isRichText(before) || !Array.isArray(after) || JSON.stringify(before) === JSON.stringify(after)) return [];
    const chain: { before: RichText; transform: TextTransform }[] = [];
    let cursor = after as RichText;
    for (let i = 0; i < 64; i++) {
      const edit = editOrigins.get(cursor); if (!edit) break;
      chain.unshift({ before: edit.before, transform: edit.transform });
      if (JSON.stringify(edit.before) === JSON.stringify(before)) return chain;
      cursor = edit.before;
    }
    return [{ before, transform: buildTextTransform(before, after as RichText) }];
  });
  if (!edits.length) return undefined;
  const walk = (value: unknown): unknown => {
    if (Array.isArray(value)) {
      const changed = value.map(walk); return changed.some((child, i) => child !== value[i]) ? changed : value;
    }
    if (!value || typeof value !== 'object') return value;
    const object = value as Record<string, unknown>;
    let result = value;
    if (typeof object.entityId === 'string') for (const edit of edits) result = transformAnchor(result as ContentAnchor, beforeEntity.id, edit.before, edit.transform, beforeEntity.projectId);
    const next = result as Record<string, unknown>, changes = Object.entries(next).map(([key, child]) => [key, walk(child)] as const);
    return changes.some(([key, child]) => child !== next[key]) ? Object.fromEntries(changes) : result;
  };
  return walk;
}

export function remapEditedTextReferences(entities: Entity[], beforeEntity: Entity, afterEntity: Entity): Entity[] {
  const walk = editedTextRemapper(beforeEntity, afterEntity); if (!walk) return entities;
  const textEdits=Object.entries(beforeEntity.data).flatMap(([key,before])=>{const after=(afterEntity.data as unknown as Record<string,unknown>)[key];return isRichText(before)&&Array.isArray(after)&&JSON.stringify(before)!==JSON.stringify(after)?[{before,transform:buildTextTransform(before,after as RichText)}]:[];});
  return entities.map(entity => {
    // Review targets name the historical targetVersionId even without sourceVersionId.
    const historicalReview = entity.kind === 'review' && entity.data.targetVersionId !== beforeEntity.projectId;
    const data = entity.data;
    const fields = historicalReview ? Object.entries(data).map(([key, value]) => [key, key === 'target' ? value : walk(value)] as const) : undefined;
    let changed = fields ? fields.some(([key, value]) => value !== (data as unknown as Record<string, unknown>)[key]) ? Object.fromEntries(fields) : data : walk(data);
    if (entity.id === beforeEntity.id && entity.kind === 'scene' && entity.data.blockIds?.length) {
      const blockIds = [...new Set(entity.data.blockIds.map(blockId => {
        const anchor = walk({ entityId: entity.id, blockId }) as ContentAnchor;
        return anchor.blockId ?? blockId;
      }))];
      if (blockIds.some((id, index) => id !== entity.data.blockIds![index]) || blockIds.length !== entity.data.blockIds.length) changed = { ...(changed as object), blockIds };
    }
    if(entity.kind==='projection_profile'&&(!entity.data.sourceVersionId||entity.data.sourceVersionId===beforeEntity.projectId)){
      const sources={...entity.data.blockSources};let affected=false;
      for(const [publicBlock,sourceBlock]of Object.entries(sources))for(const edit of textEdits)if(edit.before.some(block=>block.id===sourceBlock)){affected=true;const next=edit.transform.block(sourceBlock);if(next)sources[publicBlock]=next;else delete sources[publicBlock];}
      if(affected)return {...entity,status:'needs_review',data:{...(changed as Entity<'projection_profile'>['data']),blockSources:sources}};
    }
    return changed === data ? entity : { ...entity, data: changed } as Entity;
  });
}

export function remapEditedTextRelationReferences(relations: Relation[], beforeEntity: Entity, afterEntity: Entity): Relation[] {
  const walk = editedTextRemapper(beforeEntity, afterEntity); if (!walk) return relations;
  return relations.map(relation => {
    const validity = walk(relation.validity) as Relation['validity'];
    return validity === relation.validity ? relation : { ...relation, validity };
  });
}
