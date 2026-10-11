import type { Entity, ID, ProjectContent, Relation, RelationTypeDefinition } from './types';
import type { DomainReference, ProjectValidationOptions } from './model';
import { captureImmutablePlainData, isImmutablePlainData } from './immutablePlainData';

export interface ContentValidationMemo {
  has(content: ProjectContent, ids: Set<ID>, versions: Map<ID, ProjectContent>): boolean;
  remember(content: ProjectContent, ids: Set<ID>, versions: Map<ID, ProjectContent>): void;
  entityReferences(entity: Entity): DomainReference[] | undefined;
  relationReferences(relation: Relation): DomainReference[] | undefined;
  rememberEntity(entity: Entity, references: DomainReference[]): void;
  rememberRelation(relation: Relation, references: DomainReference[]): void;
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
  // These are only successful record-schema observations. Every content still
  // checks its namespace, reference targets, rules and fixed-version anchors.
  // Different ordered arrays can contain the same immutable records.
  let entities = new WeakMap<Entity, DomainReference[]>(), relations = new WeakMap<Relation, DomainReference[]>(), records = 0;
  const rememberRecord = (record: Entity | Relation, references: DomainReference[], entity: boolean) => {
    if (!isImmutablePlainData(record)) return;
    // A reference kind list originates in the public schema registry. Do not
    // keep an alias to a detached schema when its equal replacement is active.
    const owned = captureImmutablePlainData(references);
    if (!owned.captured) return;
    if (records >= 100_000) { entities = new WeakMap(); relations = new WeakMap(); records = 0; }
    if (entity) entities.set(record as Entity, owned.value); else relations.set(record as Relation, owned.value);
    records++;
  };
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
    entityReferences: entity => entities.get(entity),
    relationReferences: relation => relations.get(relation),
    rememberEntity: (entity, references) => rememberRecord(entity, references, true),
    rememberRelation: (relation, references) => rememberRecord(relation, references, false),
    has: (content, ids, versions) => successful.some(proof => same(proof, content, ids, versions)),
    remember(content, ids, versions) {
      if (successful.length >= 256) successful = [];
      successful.push({ content, ids: new Set(ids), versions: new Map(versions) });
    },
  } };
}
