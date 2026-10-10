import { KIND_LABELS } from './model';
import { editRichText } from './text';
import type { Block, ContentAnchor, Entity, ProjectData, RichText, Ruby, TextLink, UnresolvedTextAnnotation } from './types';

export type LinkCandidateSource = 'name' | 'reading' | 'alias' | 'alias_reading';

export interface LinkCandidate {
  id: string;
  ignoreKey: string;
  term: string;
  entityId: string;
  entityName: string;
  entityKind: Entity['kind'];
  label: string;
  start: number;
  end: number;
  sources: LinkCandidateSource[];
  suggestedReading?: string;
  targetAnchor: ContentAnchor;
}

export interface LinkCandidateOptions {
  sourceEntityId?: string;
  excludeEntityIds?: readonly string[];
  ignoredKeys?: ReadonlySet<string>;
  projectId?: string;
}

export interface TextLinkReference {
  sourceEntityId: string;
  sourceEntityName: string;
  sourceEntityKind: Entity['kind'];
  sourceField: string;
  sourceBlockId: string;
  start: number;
  end: number;
  text: string;
  target: ContentAnchor;
}

export type AnnotationResult<T> = { ok: true; value: T } | { ok: false; reason: string };

const RICH_TEXT_FIELDS = new Set([
  'summary', 'body', 'text', 'description', 'question', 'intent', 'caption',
  'usageNotes', 'interpretation', 'authorNotes', 'goals', 'conflicts', 'results',
  'newInformation', 'action', 'tutorial', 'examples', 'experience', 'theme', 'tone',
  'scope', 'targetAudience', 'reason', 'resolution', 'notes', 'phrasing',
]);
const ANCHORABLE_TEXT_FIELDS = new Set([...RICH_TEXT_FIELDS].filter(field => field !== 'authorNotes'));

function record(value: unknown): Record<string, unknown> | undefined {
  return value !== null && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : undefined;
}

function dataRecord(entity: Entity): Record<string, unknown> {
  return entity.data as unknown as Record<string, unknown>;
}

function isRichText(value: unknown): value is RichText {
  return Array.isArray(value) && value.every(item => {
    const block = record(item);
    return !!block && typeof block.id === 'string' && typeof block.text === 'string' && typeof block.kind === 'string';
  });
}

function codePointLength(value: string): number { return Array.from(value).length; }

function nextCodePointIndex(value: string, index: number): number {
  const point = value.codePointAt(index);
  return index + (point !== undefined && point > 0xffff ? 2 : 1);
}

/** Finds exact, case-sensitive occurrences and reports offsets in Unicode code points. */
export function findTextOccurrences(text: string, phrase: string): Array<{ start: number; end: number }> {
  const needle = phrase.trim();
  if (!needle) return [];
  const found: Array<{ start: number; end: number }> = [];
  const length = codePointLength(needle);
  let from = 0;
  while (from <= text.length - needle.length) {
    const index = text.indexOf(needle, from);
    if (index < 0) break;
    const start = codePointLength(text.slice(0, index));
    found.push({ start, end: start + length });
    from = nextCodePointIndex(text, index);
  }
  return found;
}

/** Stable key for suppressing a target/term suggestion in user or device preferences. */
export function ignoredLinkCandidateKey(projectId: string, sourceEntityId: string, targetEntityId: string, term: string): string {
  const normalized = term.trim().normalize('NFC');
  return ['link-candidate', projectId, sourceEntityId, targetEntityId, normalized].map(value => encodeURIComponent(value)).join(':');
}

function entityTerms(entity: Entity): Array<{ term: string; source: LinkCandidateSource; reading?: string }> {
  const data = dataRecord(entity);
  const terms: Array<{ term: string; source: LinkCandidateSource; reading?: string }> = [];
  const add = (term: unknown, source: LinkCandidateSource, reading?: unknown) => {
    if (typeof term !== 'string' || !term.trim()) return;
    terms.push({ term: term.trim(), source, reading: typeof reading === 'string' && reading.trim() ? reading.trim() : undefined });
  };
  add(entity.name, 'name', data.reading);
  add(data.reading, 'reading');
  if (Array.isArray(data.aliases)) for (const item of data.aliases) {
    const alias = record(item);
    if (!alias) continue;
    add(alias.text, 'alias', alias.reading);
    add(alias.reading, 'alias_reading');
  }
  return terms;
}

function disambiguatedEntityLabel(entity: Entity, duplicateName: boolean): string {
  const base = `${entity.name || KIND_LABELS[entity.kind]} · ${KIND_LABELS[entity.kind]}`;
  return duplicateName ? `${base} · ${entity.id.slice(-6)}` : base;
}

/**
 * Points to the first exact occurrence in one of the target's readable rich-text fields.
 * If no paragraph contains the phrase, it intentionally falls back to the entity anchor.
 */
export function targetAnchorForTerm(entity: Entity, term: string): ContentAnchor {
  const data = dataRecord(entity);
  const preferredFields = Object.keys(data).filter(key => ANCHORABLE_TEXT_FIELDS.has(key)).sort();
  for (const field of preferredFields) {
    const blocks = data[field];
    if (!isRichText(blocks)) continue;
    for (const block of blocks) {
      const occurrence = findTextOccurrences(block.text, term)[0];
      if (occurrence) return {
        entityId: entity.id,
        blockId: block.id,
        start: occurrence.start,
        end: occurrence.end,
      };
    }
  }
  return { entityId: entity.id };
}

/** Suggest every exact text occurrence for names, readings, and aliases in live entities. */
export function suggestLinkCandidates(text: string, entities: readonly Entity[], options: LinkCandidateOptions = {}): LinkCandidate[] {
  const excluded = new Set(options.excludeEntityIds ?? []);
  if (options.sourceEntityId) excluded.add(options.sourceEntityId);
  const live = entities.filter(entity => !entity.deletedAt && !excluded.has(entity.id));
  const counts = new Map<string, number>();
  for (const entity of live) {
    const key = entity.name.normalize('NFC');
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }

  const candidates = new Map<string, LinkCandidate>();
  for (const entity of live) {
    const label = disambiguatedEntityLabel(entity, (counts.get(entity.name.normalize('NFC')) ?? 0) > 1);
    for (const entry of entityTerms(entity)) {
      for (const occurrence of findTextOccurrences(text, entry.term)) {
        const id = `${entity.id}:${occurrence.start}:${occurrence.end}:${encodeURIComponent(entry.term.normalize('NFC'))}`;
        const ignoreKey = ignoredLinkCandidateKey(options.projectId ?? '', options.sourceEntityId ?? '', entity.id, entry.term);
        if (options.ignoredKeys?.has(ignoreKey)) continue;
        const prior = candidates.get(id);
        if (prior) {
          if (!prior.sources.includes(entry.source)) prior.sources.push(entry.source);
          prior.suggestedReading ||= entry.reading;
          continue;
        }
        candidates.set(id, {
          id,
          ignoreKey,
          term: entry.term,
          entityId: entity.id,
          entityName: entity.name,
          entityKind: entity.kind,
          label,
          start: occurrence.start,
          end: occurrence.end,
          sources: [entry.source],
          suggestedReading: entry.reading,
          targetAnchor: targetAnchorForTerm(entity, entry.term),
        });
      }
    }
  }
  return [...candidates.values()].sort((a, b) => a.start - b.start || a.end - b.end || a.label.localeCompare(b.label) || a.term.localeCompare(b.term));
}

function blockIndex(blocks: RichText, blockId: string): number { return blocks.findIndex(block => block.id === blockId); }

function validRange(block: Block | undefined, start: number, end: number): boolean {
  if (!block || !Number.isInteger(start) || !Number.isInteger(end) || start < 0 || end <= start || end > codePointLength(block.text)) return false;
  const selected = Array.from(block.text).slice(start, end).join('');
  return !!selected;
}

function overlaps(block: Block, start: number, end: number): boolean {
  return [...(block.ruby ?? []), ...(block.links ?? [])].some(mark => start < mark.end && mark.start < end);
}

function withUpdatedBlock(blocks: RichText, index: number, block: Block): RichText {
  const next = structuredClone(blocks);
  next[index] = block;
  return next;
}

export function addRubyAnnotation(blocks: RichText, blockId: string, start: number, end: number, reading: string): AnnotationResult<RichText> {
  const index = blockIndex(blocks, blockId), block = blocks[index];
  if (!validRange(block, start, end)) return { ok: false, reason: '本文の範囲を選び直してください。' };
  if (!reading.trim()) return { ok: false, reason: '読みを入力してください。' };
  if (overlaps(block, start, end)) return { ok: false, reason: 'この範囲にはすでにルビまたはリンクがあります。' };
  const updated = structuredClone(block);
  updated.ruby = [...(updated.ruby ?? []), { start, end, text: reading.trim() }];
  return { ok: true, value: withUpdatedBlock(blocks, index, updated) };
}

export function addTextLink(blocks: RichText, blockId: string, start: number, end: number, target: ContentAnchor): AnnotationResult<RichText> {
  const index = blockIndex(blocks, blockId), block = blocks[index];
  if (!validRange(block, start, end)) return { ok: false, reason: '本文の範囲を選び直してください。' };
  if (!target.entityId) return { ok: false, reason: 'リンク先を選んでください。' };
  if (overlaps(block, start, end)) return { ok: false, reason: 'この範囲にはすでにルビまたはリンクがあります。' };
  const updated = structuredClone(block);
  updated.links = [...(updated.links ?? []), { start, end, target: structuredClone(target) }];
  return { ok: true, value: withUpdatedBlock(blocks, index, updated) };
}

/** Add the replacement first; clear unresolved intent only after the new mark is valid. */
export function resolveUnresolvedAnnotation(
  blocks: RichText,
  ownerBlockId: string,
  annotationIndex: number,
  destinationBlockId: string,
  start: number,
  end: number,
  targetOverride?: ContentAnchor,
): AnnotationResult<RichText> {
  const ownerIndex = blockIndex(blocks, ownerBlockId), annotation = blocks[ownerIndex]?.unresolvedAnnotations?.[annotationIndex];
  if (!annotation) return { ok: false, reason: '再リンク待ちの注記が見つかりません。' };
  const created = annotation.kind === 'ruby'
    ? addRubyAnnotation(blocks, destinationBlockId, start, end, annotation.reading)
    : addTextLink(blocks, destinationBlockId, start, end, targetOverride ?? annotation.target);
  if (!created.ok) return created;
  const next = created.value;
  const targetOwner = next[ownerIndex];
  targetOwner.unresolvedAnnotations = targetOwner.unresolvedAnnotations?.filter((_, index) => index !== annotationIndex);
  if (!targetOwner.unresolvedAnnotations?.length) delete targetOwner.unresolvedAnnotations;
  return { ok: true, value: next };
}

export function removeUnresolvedAnnotation(blocks: RichText, blockId: string, annotationIndex: number): RichText {
  const index = blockIndex(blocks, blockId), current = blocks[index];
  if (!current?.unresolvedAnnotations?.[annotationIndex]) return blocks;
  const next = structuredClone(blocks);
  next[index].unresolvedAnnotations = next[index].unresolvedAnnotations!.filter((_, i) => i !== annotationIndex);
  if (!next[index].unresolvedAnnotations!.length) delete next[index].unresolvedAnnotations;
  return next;
}

export function removeTextAnnotation(blocks: RichText, blockId: string, kind: 'ruby' | 'link', annotationIndex: number): RichText {
  const index = blockIndex(blocks, blockId), current = blocks[index];
  if (!current || !current[kind === 'ruby' ? 'ruby' : 'links']?.[annotationIndex]) return blocks;
  const next = structuredClone(blocks), updated = next[index];
  if (kind === 'ruby') {
    updated.ruby = updated.ruby!.filter((_, i) => i !== annotationIndex);
    if (!updated.ruby.length) delete updated.ruby;
  } else {
    updated.links = updated.links!.filter((_, i) => i !== annotationIndex);
    if (!updated.links.length) delete updated.links;
  }
  return next;
}

export function splitRichTextBlock(blocks: RichText, blockId: string, offset: number): AnnotationResult<RichText> {
  const index = blockIndex(blocks, blockId), block = blocks[index], length = block ? codePointLength(block.text) : 0;
  if (!block || !Number.isInteger(offset) || offset <= 0 || offset >= length) return { ok: false, reason: '段落の途中を分割位置に選んでください。' };
  const all = blocks.map(item => item.text).join('\n'), global = blocks.slice(0, index).reduce((sum, item) => sum + codePointLength(item.text) + 1, 0) + offset;
  const chars = Array.from(all); chars.splice(global, 0, '\n');
  return { ok: true, value: editRichText(blocks, chars.join(''), { start: global, end: global }) };
}

export function mergeRichTextBlocks(blocks: RichText, firstBlockId: string): AnnotationResult<RichText> {
  const index = blockIndex(blocks, firstBlockId);
  if (index < 0 || index >= blocks.length - 1) return { ok: false, reason: '結合する次の段落がありません。' };
  const boundary = blocks.slice(0, index + 1).reduce((sum, block) => sum + codePointLength(block.text) + 1, 0) - 1;
  const chars = Array.from(blocks.map(block => block.text).join('\n'));
  chars.splice(boundary, 1);
  return { ok: true, value: editRichText(blocks, chars.join(''), { start: boundary, end: boundary + 1 }) };
}

/** Reorder whole blocks without changing their identity, text, or internal annotations. */
export function moveRichTextBlock(blocks: RichText, blockId: string, delta: -1 | 1): RichText {
  const index = blockIndex(blocks, blockId), nextIndex = index + delta;
  if (index < 0 || nextIndex < 0 || nextIndex >= blocks.length) return blocks;
  const next = structuredClone(blocks), [moved] = next.splice(index, 1);
  next.splice(nextIndex, 0, moved);
  return next;
}

/** Index incoming links once without changing their source order or pinned targets. */
export function indexTextLinkReferences(project: ProjectData): Map<string, TextLinkReference[]> {
  const byTarget = new Map<string, TextLinkReference[]>();
  for (const entity of project.entities) {
    if (entity.deletedAt) continue;
    for (const [sourceField, raw] of Object.entries(dataRecord(entity))) {
      if (!RICH_TEXT_FIELDS.has(sourceField) || !isRichText(raw)) continue;
      for (const block of raw) for (const link of block.links ?? []) {
        const refs = byTarget.get(link.target.entityId) ?? [];
        refs.push({
          sourceEntityId: entity.id,
          sourceEntityName: entity.name,
          sourceEntityKind: entity.kind,
          sourceField,
          sourceBlockId: block.id,
          start: link.start,
          end: link.end,
          text: Array.from(block.text).slice(link.start, link.end).join(''),
          target: structuredClone(link.target),
        });
        byTarget.set(link.target.entityId, refs);
      }
    }
  }
  return byTarget;
}

export function findTextLinkReferences(project: ProjectData, targetEntityId: string): TextLinkReference[] {
  return indexTextLinkReferences(project).get(targetEntityId) ?? [];
}
