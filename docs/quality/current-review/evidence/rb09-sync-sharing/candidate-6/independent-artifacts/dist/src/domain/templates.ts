import { ENTITY_SCHEMAS, ID_PATTERN, validateEntity, validateProject } from './model';
import type { CustomValue, Entity, EntityKind, FieldDefinition, ID, ProjectData, TemplateData, ValidationIssue } from './types';

/** Assignment is explicit: alternative templates never change unassigned records. */
export type TemplateBoundEntity = Entity & { templateId?: ID | null };
export type TemplateReplacements = Record<ID, Record<string, CustomValue | undefined>>;
type TemplateReferenceContext = readonly Entity[] | ReadonlyMap<ID, Entity>;
const clone = <T>(value: T): T => structuredClone(value);
const problem = (path: string, message: string, code: ValidationIssue['code'] = 'VALIDATION_FAILED'): ValidationIssue => ({ path, message, code });
const COMMON_KEYS = ['id', 'projectId', 'kind', 'revision', 'name', 'status', 'visibility', 'retainIfUnreferenced', 'projectionProfileId', 'templateId', 'createdAt', 'updatedAt', 'deletedAt', 'deletionOperationId', 'customValues', 'data'];
const RESERVED_KEYS = ['__proto__', 'prototype', 'constructor'];
const FIELD_TYPES: FieldDefinition['type'][] = ['text', 'number', 'boolean', 'enum', 'date', 'ref'];
export function isEditableFieldDefinition(value: unknown): value is FieldDefinition {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const field = value as Partial<FieldDefinition>;
  return typeof field.key === 'string' && typeof field.label === 'string' && FIELD_TYPES.includes(field.type as FieldDefinition['type'])
    && typeof field.required === 'boolean' && typeof field.nullable === 'boolean'
    && (field.help == null || typeof field.help === 'string')
    && (field.allowedValues == null || Array.isArray(field.allowedValues) && field.allowedValues.every(value => typeof value === 'string'))
    && (field.targetKinds == null || Array.isArray(field.targetKinds) && field.targetKinds.every(kind => Object.hasOwn(ENTITY_SCHEMAS, kind)));
}

export function standardFieldKeys(kind: EntityKind): string[] {
  const schema = ENTITY_SCHEMAS[kind];
  return [...COMMON_KEYS, ...(schema?.type === 'object' ? Object.keys(schema.fields) : [])];
}

export function customValueMatches(field: FieldDefinition, value: unknown, entities?: TemplateReferenceContext): boolean {
  return validateCustomFieldValue(field, value, 'customValue', entities).length === 0;
}

/** The same value checks serve previews, normal forms, saves and file imports. */
export function validateCustomFieldValue(field: FieldDefinition, value: unknown, path: string, entities?: TemplateReferenceContext): ValidationIssue[] {
  if (value === undefined) return field.required ? [problem(path, `「${field.label}」は必須項目です。`)] : [];
  if (value === null) return field.nullable ? [] : [problem(path, `「${field.label}」は空欄を許可していません。`)];
  let matches = false;
  if (field.type === 'text') matches = typeof value === 'string' && (!field.required || value.trim().length > 0);
  if (field.type === 'number') matches = typeof value === 'number' && Number.isFinite(value);
  if (field.type === 'boolean') matches = typeof value === 'boolean';
  if (field.type === 'enum') matches = typeof value === 'string' && !!field.allowedValues?.includes(value);
  if (field.type === 'date' || field.type === 'ref') {
    const typed = value && typeof value === 'object' && !Array.isArray(value) ? value as { type?: unknown; value?: unknown } : undefined;
    matches = typed?.type === field.type && typeof typed.value === 'string';
    if (matches && field.type === 'date') {
      const date = typed!.value as string;
      const parsed = /^\d{4}-\d{2}-\d{2}$/.test(date) ? new Date(`${date}T00:00:00.000Z`) : new Date(NaN);
      matches = Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === date;
    }
    if (matches && field.type === 'ref') {
      const id = typed!.value as string;
      if (!ID_PATTERN.test(id)) matches = false;
      else if (entities) {
        const target = 'get' in entities ? entities.get(id) : entities.find(entity => entity.id === id);
        if (!target || target.deletedAt || (field.targetKinds?.length && !field.targetKinds.includes(target.kind))) return [problem(path, `「${field.label}」の参照先が存在しないか、許可された種類ではありません。`, 'REFERENCE_INVALID')];
      }
    }
  }
  return matches ? [] : [problem(path, `「${field.label}」の値が宣言した${field.type}型または選択候補と一致しません。`)];
}

export function templateDefault(template: TemplateData, field: FieldDefinition): CustomValue {
  return Object.hasOwn(template.defaults ?? {}, field.key) ? template.defaults![field.key] : field.default;
}

/** Keep effective defaults attached to their fields while a key is being typed. */
export function normalizeTemplateDefaults(template: TemplateData): TemplateData {
  const defaults = { ...template.defaults };
  const fields = template.fields.map(field => ({ ...field, default: clone(templateDefault(template, field)) }));
  for (const field of template.fields) delete defaults[field.key];
  return { ...template, fields, defaults };
}

export function updateTemplateFieldDefinition(template: TemplateData, index: number, changes: Partial<FieldDefinition>): TemplateData {
  const normalized = normalizeTemplateDefaults(template);
  return { ...normalized, fields: normalized.fields.map((field, position) => position === index ? { ...field, ...changes } : field) };
}

export function validateTemplateDefinition(data: TemplateData, path = 'data', entities?: TemplateReferenceContext): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  if (!data || !Array.isArray(data.fields)) return [problem(`${path}.fields`, '項目定義は配列で入力してください。')];
  if (!Object.hasOwn(ENTITY_SCHEMAS, data.targetKind)) issues.push(problem(`${path}.targetKind`, '対象の情報の種類を選んでください。'));
  if (data.defaults != null && (typeof data.defaults !== 'object' || Array.isArray(data.defaults))) issues.push(problem(`${path}.defaults`, '初期値は項目キーごとの辞書で指定してください。'));
  const keys = new Set<string>(), standards = new Set(standardFieldKeys(data.targetKind));
  for (const [index, field] of data.fields.entries()) {
    const fieldPath = `${path}.fields[${index}]`;
    if (!isEditableFieldDefinition(field)) { issues.push(problem(fieldPath, '項目定義のキー・表示名・型・必須・空欄・説明・候補・参照先の形式を確認してください。')); continue; }
    if (!field.key.trim() || keys.has(field.key) || standards.has(field.key) || RESERVED_KEYS.includes(field.key)) issues.push(problem(`${fieldPath}.key`, 'キーが空欄・重複・予約済み、または標準項目と衝突しています。'));
    keys.add(field.key);
    if (field.type === 'enum' && (!Array.isArray(field.allowedValues) || !field.allowedValues.length || field.allowedValues.some(value => typeof value !== 'string' || !value.trim()) || new Set(field.allowedValues).size !== field.allowedValues.length)) issues.push(problem(`${fieldPath}.allowedValues`, '選択型には空欄と重複のない候補を指定してください。'));
    if (field.type !== 'enum' && field.allowedValues?.length) issues.push(problem(`${fieldPath}.allowedValues`, '選択候補はenum型だけに設定できます。'));
    if (field.type !== 'ref' && field.targetKinds?.length) issues.push(problem(`${fieldPath}.targetKinds`, '参照先の種類はref型だけに設定できます。'));
    // A required default is validated as an actual value; an optional missing
    // default is represented explicitly by null and requires nullable=true.
    if (!Object.hasOwn(field, 'default')) issues.push(problem(`${fieldPath}.default`, '項目の初期値を指定してください。'));
    else issues.push(...validateCustomFieldValue(field, field.default, `${fieldPath}.default`, entities));
  }
  const declared = data.fields.filter(isEditableFieldDefinition);
  const defaults = data.defaults && typeof data.defaults === 'object' && !Array.isArray(data.defaults) ? data.defaults : {};
  for (const [key, value] of Object.entries(defaults)) {
    const field = declared.find(field => field.key === key);
    if (!field) issues.push(problem(`${path}.defaults.${key}`, '初期値のキーを項目定義へ追加してください。'));
    else issues.push(...validateCustomFieldValue(field, value, `${path}.defaults.${key}`, entities));
  }
  return issues;
}

export function getEntityTemplate(project: Pick<ProjectData, 'entities'>, entity: TemplateBoundEntity): Entity<'template'> | undefined {
  const template = project.entities.find((candidate): candidate is Entity<'template'> => candidate.id === entity.templateId && candidate.kind === 'template');
  return template && !template.deletedAt && template.status !== 'rejected' && template.data.targetKind === entity.kind ? template : undefined;
}

export function validateTemplateAssignments(project: Pick<ProjectData, 'entities'>, path = 'project', referenceEntities: readonly Entity[] = project.entities): ValidationIssue[] {
  const templates = new Map(referenceEntities.filter((entity): entity is Entity<'template'> => entity.kind === 'template').map(template => [template.id, template]));
  const issues: ValidationIssue[] = [];
  const referenceIndex = new Map(referenceEntities.map(entity => [entity.id, entity]));
  project.entities.forEach((entity, index) => {
    const bound = entity as TemplateBoundEntity;
    if (entity.deletedAt || !bound.templateId) return;
    const location = `${path}.entities[${index}]`, template = templates.get(bound.templateId);
    if (!template || template.deletedAt || template.status === 'rejected' || template.data.targetKind !== entity.kind) {
      issues.push(problem(`${location}.templateId`, '適用した雛形が存在しない・不採用・削除済み、または対象の種類が異なります。', 'REFERENCE_INVALID'));
      return;
    }
    for (const field of template.data.fields) issues.push(...validateCustomFieldValue(field, entity.customValues[field.key], `${location}.customValues.${field.key}`, referenceIndex));
  });
  return issues;
}

export interface TemplateFieldImpact {
  key: string;
  label: string;
  before: CustomValue | undefined;
  after: CustomValue | undefined;
  kind: 'default' | 'replacement' | 'retained' | 'retired';
  issues: ValidationIssue[];
}
export interface TemplateEntityImpact {
  entityId: ID;
  name: string;
  before: TemplateBoundEntity;
  after: TemplateBoundEntity;
  fields: TemplateFieldImpact[];
  issues: ValidationIssue[];
  reassigned: boolean;
}
export interface TemplatePreview {
  projectId: ID;
  baseRevision: string;
  template: Entity<'template'>;
  impacts: TemplateEntityImpact[];
  entities: TemplateBoundEntity[];
  issues: ValidationIssue[];
  canApply: boolean;
}
export interface TemplatePreviewOptions {
  /** In addition to existing assignments, explicitly chosen records receive this template. */
  targetIds?: ID[];
  replacements?: TemplateReplacements;
}
function sameValue(left: unknown, right: unknown): boolean {
  if (left === right) return true;
  if (!left || !right || typeof left !== 'object' || typeof right !== 'object') return false;
  const a = left as { type?: unknown; value?: unknown }, b = right as { type?: unknown; value?: unknown };
  return a.type === b.type && a.value === b.value;
}

export function previewTemplateApplication(project: Pick<ProjectData, 'entities'>, entity: TemplateBoundEntity, template: Entity<'template'>, replacements: Record<string, CustomValue | undefined> = {}): TemplateEntityImpact {
  const references = new Map(project.entities.map(entity => [entity.id, entity]));
  return templateApplicationImpact(entity, template, replacements, references, validateTemplateDefinition(template.data, `${template.id}.data`, references));
}

function templateApplicationImpact(entity: TemplateBoundEntity, template: Entity<'template'>, replacements: Record<string, CustomValue | undefined>, references: TemplateReferenceContext, definitionIssues: ValidationIssue[]): TemplateEntityImpact {
  const after = clone(entity);
  const issues = [...definitionIssues];
  if (issues.length) return { entityId: entity.id, name: entity.name, before: clone(entity), after, fields: [], issues, reassigned: false };
  after.templateId = template.id;
  if (entity.kind !== template.data.targetKind || template.deletedAt || template.status === 'rejected') issues.push(problem(`${entity.id}.templateId`, 'この種類へ適用できる採用済みの雛形を選んでください。', 'REFERENCE_INVALID'));
  const fields: TemplateFieldImpact[] = [];
  for (const field of template.data.fields) {
    const before: CustomValue | undefined = entity.customValues[field.key];
    let value: CustomValue | undefined = before;
    let kind: TemplateFieldImpact['kind'] = 'retained';
    if (Object.hasOwn(replacements, field.key)) { value = replacements[field.key]; kind = 'replacement'; }
    else if (!Object.hasOwn(entity.customValues, field.key)) { value = clone(templateDefault(template.data, field)); kind = 'default'; }
    if (value === undefined) delete after.customValues[field.key];
    else after.customValues[field.key] = clone(value);
    const fieldIssues = validateCustomFieldValue(field, value, `${entity.id}.customValues.${field.key}`, references);
    issues.push(...fieldIssues);
    fields.push({ key: field.key, label: field.label, before: clone(before), after: clone(value), kind, issues: fieldIssues });
  }
  const defined = new Set(template.data.fields.map(field => field.key));
  for (const [key, value] of Object.entries(entity.customValues)) if (!defined.has(key)) fields.push({ key, label: key, before: clone(value), after: clone(value), kind: 'retired', issues: [] });
  for (const key of Object.keys(replacements)) if (!defined.has(key)) issues.push(problem(`${entity.id}.customValues.${key}`, '置換値のキーが雛形にありません。'));
  return { entityId: entity.id, name: entity.name, before: clone(entity), after, fields, issues, reassigned: entity.templateId !== template.id };
}

/** Preview is read-only. Invalid values remain in after and block the atomic apply. */
export function previewTemplateChange(project: ProjectData, template: Entity<'template'>, options: TemplatePreviewOptions = {}): TemplatePreview {
  const structural = validateEntity(template, template.id);
  if (!structural.ok) return { projectId: project.projectId, baseRevision: project.revision, template: clone(template), impacts: [], entities: [clone(template)], issues: structural.issues, canApply: false };
  const references = new Map(project.entities.map(entity => [entity.id, entity]));
  const definitionIssues = validateTemplateDefinition(template.data, `${template.id}.data`, references);
  const issues = [...definitionIssues];
  if (template.projectId !== project.projectId) issues.push(problem(`${template.id}.projectId`, '別の作品の雛形は適用できません。', 'REFERENCE_INVALID'));
  const selected = new Set(options.targetIds ?? []);
  for (const id of selected) if (!project.entities.some(entity => entity.id === id && !entity.deletedAt)) issues.push(problem('targetIds', '適用先の情報が存在しません。', 'REFERENCE_INVALID'));
  const targets = project.entities.filter(entity => !entity.deletedAt && ((entity as TemplateBoundEntity).templateId === template.id || selected.has(entity.id))) as TemplateBoundEntity[];
  const impacts = targets.map(entity => templateApplicationImpact(entity.id === template.id ? template : entity, template, options.replacements?.[entity.id] ?? {}, references, definitionIssues));
  issues.push(...impacts.flatMap(impact => impact.issues));
  const changed = new Map<ID, TemplateBoundEntity>([[template.id, clone(template)]]);
  for (const impact of impacts) if (impact.reassigned || impact.fields.some(field => !sameValue(field.before, field.after))) changed.set(impact.entityId, impact.after);
  const entities = [...changed.values()];
  return { projectId: project.projectId, baseRevision: project.revision, template: clone(template), impacts, entities, issues, canApply: issues.length === 0 };
}

export function applyTemplatePreview(project: ProjectData, preview: TemplatePreview): { ok: true; project: ProjectData } | { ok: false; issues: ValidationIssue[] } {
  if (preview.projectId !== project.projectId || preview.baseRevision !== project.revision) return { ok: false, issues: [problem('revision', '差分確認後に作品が更新されました。現在版で確認し直してください。')] };
  if (!preview.canApply || preview.issues.length) return { ok: false, issues: clone(preview.issues) };
  const replacements = new Map(preview.entities.map(entity => [entity.id, clone(entity)]));
  const entities = project.entities.map(entity => replacements.get(entity.id) ?? clone(entity));
  const existing = new Set(project.entities.map(entity => entity.id));
  entities.push(...[...replacements.values()].filter(entity => !existing.has(entity.id)));
  const candidate = { ...clone(project), entities };
  const checked = validateProject(candidate);
  return checked.ok ? { ok: true, project: candidate } : { ok: false, issues: checked.issues };
}

/** Device-local display choices only; hiding fields never edits source values. */
export function fieldVisibilityKey(projectId: ID, kind: EntityKind, key: string): string { return `${projectId}:${kind}:${key}`; }
export function visibleFieldKeys(keys: readonly string[], hidden: readonly string[]): string[] {
  const invisible = new Set(hidden);
  return keys.filter(key => !invisible.has(key));
}
