import 'fake-indexeddb/auto';
import { describe, expect, it } from 'vitest';
import { unzipSync, zipSync } from 'fflate';
import { createEntity, createProject, newId, validateProject } from '../src/domain/model';
import {
  applyTemplatePreview, customValueMatches, fieldVisibilityKey, getEntityTemplate, previewTemplateApplication,
  previewTemplateChange, templateDefault, updateTemplateFieldDefinition, validateCustomFieldValue, validateTemplateAssignments, validateTemplateDefinition, visibleFieldKeys,
  type TemplateBoundEntity,
} from '../src/domain/templates';
import type { CustomValue, FieldDefinition } from '../src/domain/types';
import { exportScenario, inspectScenarioData } from '../src/storage/archive';
import { jsonBytes, sha256 } from '../src/storage/json';
import { ScenarioStore } from '../src/storage/store';

function definition(changes: Partial<FieldDefinition> = {}): FieldDefinition {
  return { key: 'affiliation', label: '所属', type: 'enum', required: false, nullable: true, default: '独立', allowedValues: ['独立', '町'], help: '人物の所属を選択', ...changes };
}
function fixture() {
  const project = createProject('作品別フォーム');
  const first = createEntity(project.projectId, 'character', '同名', { reading: 'A' }) as TemplateBoundEntity;
  const second = createEntity(project.projectId, 'character', '同名', { reading: 'B' }) as TemplateBoundEntity;
  const place = createEntity(project.projectId, 'place', '同名');
  const template = createEntity(project.projectId, 'template', '人物の入力項目', { targetKind: 'character', fields: [definition()] });
  template.status = 'confirmed';
  project.entities.push(first, second, place, template);
  return { project, first, second, place, template };
}

describe('RB02: explicit template assignments and atomic preview', () => {
  it('retains both legacy default overrides through a temporary duplicate key and a final unique rename', () => {
    const f = fixture();
    const data = { ...f.template.data, fields: [definition({ key: 'a', type: 'text', default: 'base A', allowedValues: undefined }), definition({ key: 'b', type: 'text', default: 'base B', allowedValues: undefined })], defaults: { a: 'override A', b: 'override B' } };
    const original = JSON.stringify(data);
    const collision = updateTemplateFieldDefinition(data, 0, { key: 'b' });
    expect(collision.fields.map(field => field.key)).toEqual(['b', 'b']);
    expect(collision.fields.map(field => templateDefault(collision, field))).toEqual(['override A', 'override B']);
    expect(validateTemplateDefinition(collision).some(issue => issue.message.includes('重複'))).toBe(true);
    // A closed editor can recover the invalid intermediate draft without a private UI cache.
    const recovered = JSON.parse(JSON.stringify(collision)) as typeof collision;
    const renamed = updateTemplateFieldDefinition(recovered, 0, { key: 'c' });
    expect(renamed.fields.map(field => [field.key, templateDefault(renamed, field)])).toEqual([['c', 'override A'], ['b', 'override B']]);
    expect(validateTemplateDefinition(renamed)).toEqual([]); expect(JSON.stringify(data)).toBe(original);
  });
  it('adds an optional described enum to the selected name-only character after preview', () => {
    const f = fixture(), original = JSON.stringify(f.project);
    const preview = previewTemplateChange(f.project, f.template, { targetIds: [f.first.id] });
    expect(preview.canApply).toBe(true);
    expect(preview.impacts).toHaveLength(1);
    expect(preview.impacts[0].fields[0]).toMatchObject({ kind: 'default', before: undefined, after: '独立' });
    expect(JSON.stringify(f.project)).toBe(original);
    const applied = applyTemplatePreview(f.project, preview);
    expect(applied.ok).toBe(true);
    if (!applied.ok) throw new Error(JSON.stringify(applied.issues));
    const updated = applied.project.entities.find(entity => entity.id === f.first.id) as TemplateBoundEntity;
    expect(updated.templateId).toBe(f.template.id);
    expect(updated.customValues).toEqual({ affiliation: '独立' });
    expect(applied.project.entities.find(entity => entity.id === f.second.id)).toEqual(f.second);
    expect(getEntityTemplate(applied.project, updated)?.id).toBe(f.template.id);
    expect(validateProject(applied.project).ok).toBe(true);
  });

  it('preserves incompatible values, refuses the batch, and applies only explicit replacements', () => {
    const f = fixture();
    f.first.templateId = f.template.id;
    f.first.customValues.affiliation = '町';
    const next = structuredClone(f.template);
    next.data.fields = [definition({ type: 'number', default: 0, required: true, nullable: false, allowedValues: undefined })];
    const original = JSON.stringify(f.project);
    const blocked = previewTemplateChange(f.project, next);
    expect(blocked.canApply).toBe(false);
    expect(blocked.impacts[0].fields[0]).toMatchObject({ before: '町', after: '町', kind: 'retained' });
    expect(applyTemplatePreview(f.project, blocked).ok).toBe(false);
    expect(JSON.stringify(f.project)).toBe(original);
    const reviewed = previewTemplateChange(f.project, next, { replacements: { [f.first.id]: { affiliation: 7 } } });
    expect(reviewed.canApply).toBe(true);
    expect(reviewed.impacts[0].fields[0]).toMatchObject({ before: '町', after: 7, kind: 'replacement' });
    const result = applyTemplatePreview(f.project, reviewed);
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error(JSON.stringify(result.issues));
    expect(result.project.entities.find(entity => entity.id === f.first.id)?.customValues.affiliation).toBe(7);
    expect(JSON.stringify(f.project)).toBe(original);
  });

  it('shows required/nullable changes without deleting an existing null', () => {
    const f = fixture();
    f.first.templateId = f.template.id;
    f.first.customValues.affiliation = null;
    const next = structuredClone(f.template);
    next.data.fields[0].required = true;
    next.data.fields[0].nullable = false;
    const preview = previewTemplateChange(f.project, next);
    expect(preview.canApply).toBe(false);
    expect(preview.impacts[0].fields[0].after).toBeNull();
    expect(preview.impacts[0].fields[0].issues[0].message).toContain('空欄');
    expect(f.first.customValues.affiliation).toBeNull();
  });

  it('retains values when defaults change or field definitions are removed', () => {
    const f = fixture();
    f.first.templateId = f.template.id;
    f.first.customValues.affiliation = '町';
    const changed = structuredClone(f.template);
    changed.data.defaults = { affiliation: '独立' };
    expect(previewTemplateChange(f.project, changed).impacts[0].after.customValues.affiliation).toBe('町');
    changed.data.fields = []; changed.data.defaults = {};
    const preview = previewTemplateChange(f.project, changed);
    expect(preview.impacts[0].fields[0]).toMatchObject({ kind: 'retired', before: '町', after: '町' });
    const result = applyTemplatePreview(f.project, preview);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.project.entities.find(entity => entity.id === f.first.id)?.customValues.affiliation).toBe('町');
  });

  it('allows multiple unassigned alternative templates without enforcing an arbitrary schema', () => {
    const f = fixture();
    const alternate = createEntity(f.project.projectId, 'template', '別の人物雛形', { targetKind: 'character', fields: [definition({ type: 'number', default: 0, allowedValues: undefined })] });
    alternate.status = 'alternate'; f.project.entities.push(alternate);
    f.second.customValues.affiliation = '旧形式の自由入力';
    f.first.templateId = f.template.id; f.first.customValues.affiliation = '町';
    expect(validateProject(f.project).ok).toBe(true);
    expect(getEntityTemplate(f.project, f.second)).toBeUndefined();
    expect(previewTemplateChange(f.project, alternate).impacts).toEqual([]);
  });

  it('keeps typed references to one same-name character stable after a rename', () => {
    const f = fixture();
    f.template.data.fields = [definition({ key: 'mentor', label: '師匠', type: 'ref', default: { type: 'ref', value: f.second.id }, targetKinds: ['character'], allowedValues: undefined })];
    const preview = previewTemplateChange(f.project, f.template, { targetIds: [f.first.id] });
    const applied = applyTemplatePreview(f.project, preview);
    expect(applied.ok).toBe(true);
    if (!applied.ok) throw new Error(JSON.stringify(applied.issues));
    applied.project.entities.find(entity => entity.id === f.second.id)!.name = '改名後';
    expect(validateProject(applied.project).ok).toBe(true);
    expect(applied.project.entities.find(entity => entity.id === f.first.id)?.customValues.mentor).toEqual({ type: 'ref', value: f.second.id });
    expect(customValueMatches(f.template.data.fields[0], { type: 'ref', value: f.place.id }, f.project.entities)).toBe(false);
  });

  it('refuses stale previews without changing the newer project', () => {
    const f = fixture(), preview = previewTemplateChange(f.project, f.template, { targetIds: [f.first.id] });
    const newer = { ...f.project, revision: '1' }, original = JSON.stringify(newer);
    expect(applyTemplatePreview(newer, preview)).toMatchObject({ ok: false, issues: [expect.objectContaining({ path: 'revision' })] });
    expect(JSON.stringify(newer)).toBe(original);
  });

  it('refuses invalid assignment kinds and rejected templates, while retaining values', () => {
    const f = fixture();
    const source = JSON.stringify(f.place);
    const wrong = previewTemplateApplication(f.project, f.place, f.template);
    expect(wrong.issues[0].code).toBe('REFERENCE_INVALID');
    expect(JSON.stringify(f.place)).toBe(source);
    f.first.templateId = f.template.id; f.first.customValues.affiliation = '町'; f.template.status = 'rejected';
    expect(validateTemplateAssignments(f.project)[0].code).toBe('REFERENCE_INVALID');
    expect(validateProject(f.project).ok).toBe(false);
  });

  it('saves the schema and explicit conversion as one undoable IndexedDB operation', async () => {
    const f = fixture(); f.first.templateId = f.template.id; f.first.customValues.affiliation = '町';
    const store = new ScenarioStore({ databaseName: `template-atomic-${newId()}` });
    try {
      const saved = (await store.saveProject(f.project, { reason: '初期フォーム' })).project;
      const next = structuredClone(saved.entities.find(entity => entity.id === f.template.id)!);
      if (next.kind !== 'template') throw new Error('雛形がありません。');
      next.data.fields = [definition({ type: 'number', default: 0, nullable: false, allowedValues: undefined })];
      const preview = previewTemplateChange(saved, next, { replacements: { [f.first.id]: { affiliation: 7 } } });
      const result = applyTemplatePreview(saved, preview);
      expect(result.ok).toBe(true);
      if (!result.ok) throw new Error(JSON.stringify(result.issues));
      const changed = await store.saveProject(result.project, { reason: '型変更と置換の差分を適用' });
      // Every command includes the project header that advances the local revision.
      expect([...(changed.project.history.at(-1)?.targetIds ?? [])].sort()).toEqual([f.project.projectId, f.template.id, f.first.id].sort());
      const undone = await store.undo(f.project.projectId);
      expect(undone.project.entities.find(entity => entity.id === f.first.id)?.customValues.affiliation).toBe('町');
      expect((undone.project.entities.find(entity => entity.id === f.template.id) as typeof f.template).data.fields[0].type).toBe('enum');
      expect(validateProject(undone.project).ok).toBe(true);
    } finally { await store.deleteDatabase(); }
  });

  it.each(['schema', 'value', 'ref_kind'] as const)('rejects incompatible incremental %s edits before commit and retains the input', async changeKind => {
    const f = fixture(); f.first.templateId = f.template.id; f.first.customValues.affiliation = '町';
    if (changeKind === 'ref_kind') {
      f.template.data.fields = [definition({ key: 'mentor', label: '師匠', type: 'ref', default: null, targetKinds: ['character'], allowedValues: undefined })];
      f.first.customValues = { mentor: { type: 'ref', value: f.second.id } };
    }
    const databaseName = `template-reject-${newId()}`, store = new ScenarioStore({ databaseName });
    try {
      const saved = (await store.saveProject(f.project, { reason: '検査済みの初期入力' })).project;
      const edited = structuredClone(saved), template = edited.entities.find(entity => entity.id === f.template.id)!;
      if (template.kind !== 'template') throw new Error('雛形がありません。');
      if (changeKind === 'schema') template.data.fields.push(definition({ key: 'age', label: '年齢', type: 'number', required: true, nullable: false, default: 0, allowedValues: undefined }));
      if (changeKind === 'value') edited.entities.find(entity => entity.id === f.first.id)!.customValues.affiliation = 7;
      if (changeKind === 'ref_kind') template.data.fields[0].targetKinds = ['place'];
      const input = JSON.stringify(edited);
      expect(validateProject(edited).ok).toBe(false);
      await expect(store.saveProject(edited, { reason: '適合しない変更' })).rejects.toMatchObject({ code: 'VALIDATION_FAILED' });
      expect(JSON.stringify(edited)).toBe(input);
      store.close();
      const reader = new ScenarioStore({ databaseName });
      try {
        const reopened = await reader.getProject(f.project.projectId);
        expect(reopened?.revision).toBe(saved.revision);
        expect(reopened?.entities.find(entity => entity.id === f.first.id)?.customValues).toEqual(saved.entities.find(entity => entity.id === f.first.id)?.customValues);
        expect(validateProject(reopened).ok).toBe(true);
      } finally { reader.close(); }
    } finally { await store.deleteDatabase(); }
  });
});

describe('RB02: shared custom-field validation and file import', () => {
  const cases: { type: FieldDefinition['type']; value: CustomValue; valid: boolean; allowedValues?: string[] }[] = [
    { type: 'text', value: '日本語の文章', valid: true }, { type: 'text', value: 7, valid: false },
    { type: 'number', value: 1.25, valid: true }, { type: 'number', value: '1.25', valid: false },
    { type: 'boolean', value: false, valid: true }, { type: 'boolean', value: 'false', valid: false },
    { type: 'enum', value: '町', allowedValues: ['町'], valid: true }, { type: 'enum', value: '未定', allowedValues: ['町'], valid: false },
    { type: 'date', value: { type: 'date', value: '2024-02-29' }, valid: true }, { type: 'date', value: { type: 'date', value: '2025-02-29' }, valid: false },
  ];
  it.each(cases)('$type value=$value valid=$valid', ({ type, value, valid, allowedValues }) => {
    const field = definition({ type, allowedValues });
    expect(customValueMatches(field, value)).toBe(valid);
  });

  it('distinguishes missing required values from explicitly permitted nulls', () => {
    const field = definition({ required: true, nullable: true });
    expect(validateCustomFieldValue(field, undefined, 'value')).toHaveLength(1);
    expect(validateCustomFieldValue(field, null, 'value')).toEqual([]);
    expect(validateCustomFieldValue({ ...field, nullable: false }, null, 'value')).toHaveLength(1);
  });

  it.each(['name', 'body', 'templateId', '__proto__', 'constructor'])('rejects standard or reserved custom key %s', key => {
    const f = fixture(); f.template.data.fields[0].key = key;
    expect(validateTemplateDefinition(f.template.data).some(issue => issue.path.endsWith('.key'))).toBe(true);
    expect(validateProject(f.project).ok).toBe(false);
  });

  it('rejects duplicate keys, invalid enum defaults and unknown default keys', () => {
    const f = fixture(); f.template.data.fields.push(definition());
    f.template.data.fields[0].default = '候補外'; f.template.data.defaults = { unknown: 7 };
    const issues = validateTemplateDefinition(f.template.data);
    expect(issues.some(issue => issue.path.endsWith('.key'))).toBe(true);
    expect(issues.some(issue => issue.path.endsWith('.default'))).toBe(true);
    expect(issues.some(issue => issue.path.endsWith('.unknown'))).toBe(true);
  });

  it('returns errors for malformed advanced definitions without changing existing values', () => {
    const f = fixture(), source = JSON.stringify(f.first);
    const broken = structuredClone(f.template);
    broken.data.fields = [null] as unknown as FieldDefinition[];
    broken.data.defaults = { affiliation: '町' };
    expect(validateTemplateDefinition(broken.data).length).toBeGreaterThan(0);
    expect(previewTemplateApplication(f.project, f.first, broken).issues.length).toBeGreaterThan(0);
    expect(JSON.stringify(f.first)).toBe(source);
  });

  it('checks override defaults and their reference kinds with the same rules as values', () => {
    const f = fixture();
    f.template.data.fields = [definition({ key: 'mentor', type: 'ref', default: null, targetKinds: ['character'], allowedValues: undefined })];
    f.template.data.defaults = { mentor: { type: 'ref', value: f.place.id } };
    const issues = validateTemplateDefinition(f.template.data, 'data', f.project.entities);
    expect(issues).toContainEqual(expect.objectContaining({ path: 'data.defaults.mentor', code: 'REFERENCE_INVALID' }));
    expect(validateProject(f.project).ok).toBe(false);
  });

  it('rejects a checksum-correct imported file with a type-incompatible assigned custom value', async () => {
    const f = fixture(); f.first.templateId = f.template.id; f.first.customValues.affiliation = '町';
    const files = unzipSync(await exportScenario(f.project));
    const malformed = JSON.parse(new TextDecoder().decode(files['data/project.json']));
    malformed.entities.find((entity: { id: string }) => entity.id === f.first.id).customValues.affiliation = 7;
    files['data/project.json'] = jsonBytes(malformed).slice();
    const manifest = JSON.parse(new TextDecoder().decode(files['manifest.json']));
    const entry = manifest.files.find((file: { path: string }) => file.path === 'data/project.json');
    entry.byteSize = files['data/project.json'].byteLength; entry.sha256 = await sha256(files['data/project.json']);
    files['manifest.json'] = jsonBytes(manifest).slice();
    await expect(inspectScenarioData(zipSync(files, { level: 0 }))).rejects.toMatchObject({ code: 'VALIDATION_FAILED', path: 'data/project.json' });
    expect(f.first.customValues.affiliation).toBe('町');
  });

  it('changes displayed fields only and scopes preferences to each project and kind', () => {
    const f = fixture(); f.first.customValues.affiliation = '町';
    const before = JSON.stringify(f.first);
    expect(visibleFieldKeys(['body', 'affiliation'], ['affiliation'])).toEqual(['body']);
    expect(fieldVisibilityKey(f.project.projectId, 'character', 'affiliation')).not.toBe(fieldVisibilityKey(f.project.projectId, 'scene', 'affiliation'));
    expect(fieldVisibilityKey(f.project.projectId, 'character', 'affiliation')).not.toBe(fieldVisibilityKey(newId(), 'character', 'affiliation'));
    expect(JSON.stringify(f.first)).toBe(before);
  });
});
