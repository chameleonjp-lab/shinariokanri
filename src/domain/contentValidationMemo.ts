import type { ID, ProjectContent, RelationTypeDefinition } from './types';
import type { ProjectValidationOptions } from './model';
import { captureImmutablePlainData, isImmutablePlainData } from './immutablePlainData';

export interface ContentValidationMemo {
  has(content: ProjectContent, ids: Set<ID>, versions: Map<ID, ProjectContent>): boolean;
  remember(content: ProjectContent, ids: Set<ID>, versions: Map<ID, ProjectContent>): void;
}

/** A full-validation session with captured dependencies owns this proof. Metadata and
 * headers remain checked at every path. Mutable/shallow-frozen content and
 * unsupported options retain the complete uncached validator. */
export function contentValidationContext(input: unknown, options: ProjectValidationOptions, defaultRelations: RelationTypeDefinition[]):
  { options: ProjectValidationOptions; memo: ContentValidationMemo } | undefined {
  if (!isImmutablePlainData(input)) return undefined;
  const captured = captureImmutablePlainData(options);
  if (!captured.captured) return undefined;
  const context = captureImmutablePlainData({ ...captured.value, relationTypes: captured.value.relationTypes ?? defaultRelations });
  if (!context.captured) return undefined;
  type Proof = { content: ProjectContent; ids: Set<ID>; versions: Map<ID, ProjectContent> };
  let successful: Proof[] = [];
  const same = (proof: Proof, content: ProjectContent, ids: Set<ID>, versions: Map<ID, ProjectContent>) => {
    const before = proof.content;
    return before.projectId === content.projectId && before.formatVersion === content.formatVersion
      && before.calendarId === content.calendarId && before.mainStart === content.mainStart
      && before.entities === content.entities && before.relations === content.relations
      && before.calendars === content.calendars && before.views === content.views && before.worldReferences === content.worldReferences
      && proof.ids.size === ids.size && [...ids].every(id => proof.ids.has(id))
      && proof.versions.size === versions.size && [...versions].every(([id, value]) => proof.versions.get(id) === value);
  };
  return { options: context.value, memo: {
    has: (content, ids, versions) => successful.some(proof => same(proof, content, ids, versions)),
    remember(content, ids, versions) {
      if (successful.length >= 256) successful = [];
      successful.push({ content, ids: new Set(ids), versions: new Map(versions) });
    },
  } };
}
