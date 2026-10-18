import type { Entity } from '../../src/domain/types';
import { collectCatalogText } from '../../src/domain/catalog';
import { collectReferences, ENTITY_KINDS, ENTITY_SCHEMAS } from '../../src/domain/model';
import { PROJECTION_FIELDS } from '../../src/domain/projection';
import { FIELD_SPECS } from '../../src/ui/fieldSpecs';

/** Audit inventory, not a product generator or a new source of field semantics. */
export function fieldSemanticInventory() {
  return ENTITY_KINDS.flatMap(kind => {
    const schema = ENTITY_SCHEMAS[kind];
    if (schema.type !== 'object') throw new Error('Expected original object registry');
    return Object.entries(schema.fields).map(([field, { schema: model }]) => {
      const item = model.type === 'array' ? model.item : undefined;
      const reference = model.type === 'ref' ? model : item?.type === 'ref' ? item : undefined;
      const ui = FIELD_SPECS[kind]?.find(spec => spec.key === field), projected = PROJECTION_FIELDS[kind]?.[field];
      return { kind, field, model: model.type, item: item?.type ?? null,
        reference: reference ? { scope: reference.scope ?? 'entity', kinds: reference.kinds ?? [] } : null,
        values: model.type === 'enum' ? [...model.values] : null,
        ui: ui?.type ?? null, uiKinds: ui?.kinds ?? [],
        public: projected?.type ?? null, publicValues: projected?.type === 'enum' ? [...projected.values] : null };
    });
  });
}

/** Return paths and scopes only: never copy the author's reference IDs or text into diagnostics. */
export function indexedFormalReferencePaths(entity: Entity): { path: string; scope: string }[] {
  const indexed = new Set(collectCatalogText(entity).map(term => term.path));
  return collectReferences(entity).filter(reference => indexed.has(reference.path)).map(({ path, scope }) => ({ path, scope }));
}
