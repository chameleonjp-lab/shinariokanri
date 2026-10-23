import { createEntity } from './model';
import { PROJECTION_FIELDS } from './projection';
import type { Entity, EntityKind, ProjectData, PublicTextFields } from './types';

export const ADVENTURE_RUNTIME_PROFILE = '試遊用・全3章と外部契約の演習';
export const ADVENTURE_PRODUCTION_PROFILE = '制作・翻訳用・全3章';

// This allowlist is only for the original, fictional sample. Never run this
// helper on a user's work: publication of user-authored text needs their review.
const SAMPLE_OUTPUT_KINDS = new Set<EntityKind>([
  'character', 'group', 'event', 'place', 'item', 'chapter', 'scene',
  'flow_node', 'flow_edge', 'flow_graph', 'dialogue_line', 'quest', 'lore',
  'variable', 'effect', 'assertion', 'foreshadow', 'disclosure', 'attachment',
  'source', 'cue', 'storyboard_frame', 'localization', 'recording', 'terminology',
  'map', 'gameplay_spec', 'production_task', 'voice_rule', 'external_contract',
]);

function samplePublicText(entity: Entity): PublicTextFields {
  const data = entity.data as unknown as Record<string, unknown>;
  const fields = Object.fromEntries(Object.entries(PROJECTION_FIELDS[entity.kind] ?? {})
    .filter(([key, rule]) => (rule.type === 'text' || rule.type === 'rich') && data[key] != null)
    .map(([key]) => [key, structuredClone(data[key])])) as PublicTextFields;
  if (entity.kind === 'variable' && entity.data.resetRules?.length) fields.resetReason = entity.data.resetRules.map(rule => rule.reason ?? '').join(' / ');
  if (entity.kind === 'event' && entity.data.time.mode === 'uncertain') fields.precision = entity.data.time.precision;
  if (entity.kind === 'cue' && entity.data.camera != null) fields.camera = JSON.stringify({ movement: String(entity.data.camera) });
  if (entity.kind === 'terminology') fields.variants = JSON.stringify(entity.data.variants ?? []);
  if (entity.kind === 'production_task' && entity.data.estimate) {
    fields.estimateAssumptions = JSON.stringify(entity.data.estimate.assumptions);
    fields.estimateSource = entity.data.estimate.source;
    fields.estimateUnit = entity.data.estimate.unit;
  }
  return fields;
}

function samplePublicValues(entity: Entity): Record<string, string> {
  const values = new Set<string>();
  const visit = (value: unknown) => {
    if (!value || typeof value !== 'object') return;
    if (Array.isArray(value)) { value.forEach(visit); return; }
    const record = value as Record<string, unknown>;
    if (record.type === 'enum' && typeof record.value === 'string') values.add(record.value);
    Object.values(record).forEach(visit);
  };
  visit(entity.data);
  if (entity.kind === 'variable') entity.data.allowed.values?.forEach(value => { if (typeof value === 'string') values.add(value); });
  return Object.fromEntries([...values].map(value => [value, value]));
}

/** Explicitly approve the sample's fictional text, behavior, and original assets. */
export function addAdventureRuntimeProfile(project: ProjectData): ProjectData {
  if (project.entities.some(entity => entity.kind === 'projection_profile' && entity.name === ADVENTURE_RUNTIME_PROFILE)) return project;
  const lineIds = new Set(project.entities.flatMap(entity => entity.kind === 'scene' ? entity.data.dialogueLineIds ?? [] : []));
  const selected = project.entities.filter(entity => SAMPLE_OUTPUT_KINDS.has(entity.kind)
    && !entity.deletedAt && entity.status === 'confirmed'
    && (entity.kind !== 'dialogue_line' || lineIds.has(entity.id)));
  const profiles = [true, false].map(runtime => {
    // Maps and translation records are delivered in the production bundle;
    // they have no execution semantics in the portable story player.
    const included = runtime ? selected.filter(entity => !['map', 'localization', 'recording'].includes(entity.kind)) : selected;
    const allowedKinds = [...new Set(included.map(entity => entity.kind))];
    const profile = createEntity(project.projectId, 'projection_profile', runtime ? ADVENTURE_RUNTIME_PROFILE : ADVENTURE_PRODUCTION_PROFILE, {
      audience: 'サンプルを試遊する読者・制作と翻訳の操作を学ぶ作者',
      publicTitle: '星還りの旅人・全3章の試遊', publicVersionLabel: 'サンプルの試遊・制作版',
      includedIds: included.map(entity => entity.id), allowedKinds,
      allowedFields: Object.fromEntries(allowedKinds.map(kind => [kind, Object.keys(PROJECTION_FIELDS[kind] ?? {}).filter(field => !(runtime && kind === 'place' && field === 'mapIds'))])),
      namePolicy: { defaultPolicy: { mode: 'exclude' }, byEntityId: Object.fromEntries(included.map(entity => [entity.id, { mode: 'replace' as const, replacement: entity.name }])) },
      publicTexts: Object.fromEntries(included.map(entity => [entity.id, samplePublicText(entity)])),
      publicValues: Object.fromEntries(included.filter(entity => ['variable', 'external_contract', 'assertion'].includes(entity.kind)).map(entity => [entity.id, samplePublicValues(entity)])),
      // IDs are generated afresh for each independent sample. Preserving the
      // explicitly selected IDs gives game/translation handoffs stable bindings.
      idPolicy: 'preserve', includeAuthorNotes: false, excludedFields: ['authorNotes'],
      approvedAttachmentIds: included.filter(entity => entity.kind === 'attachment').map(entity => entity.id),
      allowedRelationIds: [],
    });
    profile.status = 'confirmed';
    return profile;
  });
  return { ...project, entities: [...project.entities, ...profiles] };
}
