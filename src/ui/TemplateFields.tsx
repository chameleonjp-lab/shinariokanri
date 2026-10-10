import { useEffect, useRef, useState } from 'react';
import type { CustomValue, Entity, EntityKind, FieldDefinition, ProjectData, TemplateData } from '../domain/types';
import { ENTITY_KINDS, KIND_LABELS } from '../domain/model';
import {
  getEntityTemplate, isEditableFieldDefinition, normalizeTemplateDefaults, previewTemplateApplication, templateDefault, updateTemplateFieldDefinition, validateCustomFieldValue, validateTemplateDefinition,
  type TemplateBoundEntity, type TemplateEntityImpact, type TemplateReplacements,
} from '../domain/templates';
import { labelOf } from './Fields';
import type { FieldSpec } from './fieldSpecs';
import { Modal } from './components';
import { PagedSelect } from './PagedSelect';
import { WindowedList } from './WindowedList';
import './TemplateFields.css';

const TYPES: [FieldDefinition['type'], string][] = [['text', '文章'], ['number', '数値'], ['boolean', '真偽'], ['enum', '選択'], ['date', '日付'], ['ref', 'ほかの情報への参照']];
export function customValueLabel(value: unknown, project?: ProjectData): string {
  if (value === undefined) return '未設定';
  if (value === null) return '空欄（null）';
  if (typeof value !== 'object') return String(value);
  const typed = value as { type?: unknown; value?: unknown };
  if (typed.type === 'ref' && typeof typed.value === 'string') return `${labelOf(project?.entities.find(entity => entity.id === typed.value))} · ${typed.value}`;
  return String(typed.value ?? '型が不正な値');
}

export function CustomValueInput({ field, value, project, onChange, label = field.label, optional = true, scope = `${project.projectId}:custom-value:${label}:${field.key}` }: {
  field: FieldDefinition; value: CustomValue | undefined; project: ProjectData; onChange: (value: CustomValue | undefined) => void; label?: string; optional?: boolean; scope?: string;
}) {
  const [numberText, setNumberText] = useState(() => typeof value === 'number' || typeof value === 'string' ? String(value) : '');
  const numberEditing = useRef(false), lastNumberInput = useRef(value);
  useEffect(() => {
    if (!numberEditing.current || value !== lastNumberInput.current) { setNumberText(typeof value === 'number' || typeof value === 'string' ? String(value) : ''); lastNumberInput.current = value; }
  }, [value, field.type]);
  const typed = value && typeof value === 'object' ? value : undefined;
  const errors = validateCustomFieldValue(field, value, field.key, project.entities);
  const selection = value === undefined ? 'unset' : value === null ? 'null' : field.type === 'boolean' ? String(value) : `option:${field.allowedValues?.indexOf(String(value)) ?? -1}`;
  return <div className="custom-value-input">
    {field.type === 'text' && <input aria-label={label} value={typeof value === 'string' ? value : ''} onChange={event => onChange(event.target.value)}/>}
    {field.type === 'number' && <input aria-label={label} inputMode="decimal" value={numberText} onFocus={() => { numberEditing.current = true; }} onBlur={() => {
      numberEditing.current = false;
      if (typeof value === 'number') setNumberText(String(value));
    }} onChange={event => {
      const raw = event.target.value, numeric = Number(raw);
      // Keep every keystroke visible. `1.`, `-` and incomplete exponents stay
      // invalid drafts; a completed numeric value is emitted without replacing
      // the user's text or moving the caret during entry.
      const next = raw === '' ? undefined : /^[+-]?(?:\d+(?:\.\d+)?|\.\d+)(?:[eE][+-]?\d+)?$/.test(raw) && Number.isFinite(numeric) ? numeric : raw;
      setNumberText(raw); lastNumberInput.current = next; onChange(next);
    }}/>}
    {field.type === 'boolean' && <select aria-label={label} value={selection} onChange={event => {
      const next = event.target.value;
      onChange(next === 'unset' ? undefined : next === 'null' ? null : field.type === 'boolean' ? next === 'true' : field.allowedValues?.[Number(next.slice(7))]);
    }}><option value="unset">未設定</option>{field.nullable && <option value="null">空欄（null）</option>}{field.type === 'boolean' ? <><option value="true">true</option><option value="false">false</option></> : field.allowedValues?.map((candidate, index) => <option key={index} value={`option:${index}`}>{candidate}</option>)}</select>}
    {field.type === 'enum' && <PagedSelect label={label} scope={`${scope}:enum`} value={selection === 'unset' ? '' : selection} emptyLabel="未設定"
      unavailableLabel={`候補にない保存値 · ${customValueLabel(value, project)}`}
      items={[...(field.nullable ? [{ id: 'null', label: '空欄（null）' }] : []), ...(field.allowedValues ?? []).map((candidate, index) => ({ id: `option:${index}`, label: candidate }))]}
      onChange={next => onChange(next === '' ? undefined : next === 'null' ? null : field.allowedValues?.[Number(next.slice(7))])}/>}
    {field.type === 'date' && <input aria-label={label} type="date" value={typed?.type === 'date' ? typed.value : ''} onChange={event => onChange(event.target.value ? { type: 'date', value: event.target.value } : undefined)}/>}
    {field.type === 'ref' && <PagedSelect label={label} scope={`${scope}:reference:${field.targetKinds?.join(',') ?? 'all'}`} value={typed?.type === 'ref' ? typed.value : ''} emptyLabel="参照先を選択してください"
      items={project.entities.filter(entity => !entity.deletedAt && (!field.targetKinds?.length || field.targetKinds.includes(entity.kind))).map(entity => ({ id: entity.id, label: `${labelOf(entity)} · ${KIND_LABELS[entity.kind]} · ${entity.id}` }))}
      onChange={id => onChange(id ? { type: 'ref', value: id } : undefined)}/>}
    {optional && <div className="custom-value-actions">{!field.required && <button type="button" className="text-button" onClick={() => onChange(undefined)}>未設定にする</button>}{field.nullable && <button type="button" className="text-button" onClick={() => onChange(null)}>空欄にする</button>}</div>}
    {field.help && <span className="field-hint">{field.help}</span>}
    {errors.map((error, index) => <span className="field-error" role="alert" key={index}>{error.message} 現在値: {customValueLabel(value, project)}</span>)}
  </div>;
}

export function TemplateFieldsEditor({ template, project, onChange, onValid, ownerId = template.targetKind }: {
  template: TemplateData; project: ProjectData; onChange: (data: TemplateData) => void; onValid: (valid: boolean) => void; ownerId?: string;
}) {
  const [revealedField, setRevealedField] = useState<string>();
  const scope = `${project.projectId}:${ownerId}:template-fields`;
  const errors = validateTemplateDefinition(template, 'data', project.entities);
  const errorKey = errors.map(error => `${error.path}:${error.message}`).join('|');
  useEffect(() => { onValid(!errors.length); }, [errorKey]);
  if (!Array.isArray(template.fields) || !template.fields.every(isEditableFieldDefinition)) return <section className="template-fields"><p className="field-error" role="alert">項目定義の形式を確認してください。詳細データから入力を修正できます。</p></section>;
  const update = (index: number, changes: Partial<FieldDefinition>) => onChange(updateTemplateFieldDefinition(template, index, changes));
  const changeType = (index: number, type: FieldDefinition['type']) => {
    const normalized = normalizeTemplateDefaults(template), before = normalized.fields[index];
    const value = type === 'number' ? 0 : type === 'boolean' ? false : type === 'enum' ? '未選択' : type === 'date' || type === 'ref' ? null : '';
    const field: FieldDefinition = { ...before, type, default: value, ...(value === null ? { nullable: true } : {}) };
    delete field.allowedValues; delete field.targetKinds;
    if (type === 'enum') field.allowedValues = ['未選択'];
    onChange({ ...normalized, fields: normalized.fields.map((old, position) => position === index ? field : old) });
  };
  return <section className="template-fields" aria-label="雛形の項目定義"><h3>作品の追加項目</h3><p className="field-hint">初期値は未設定の値へ適用します。既存の値と型変更の影響は、保存前の差分で確認できます。</p>
    <WindowedList items={template.fields.map((field, index) => ({ id: String(index), field }))} scope={scope} label="雛形の項目定義" size={20} selectedId={revealedField}
      render={({ field, id }, index) => <fieldset className="template-field-card" key={id}><legend>項目 {index + 1}</legend>
      <div className="form-row"><label className="nested-label">保存キー<input aria-label={`項目${index + 1}の保存キー`} value={field.key} onChange={event => update(index, { key: event.target.value })}/></label><label className="nested-label">表示名<input aria-label={`項目${index + 1}の表示名`} value={field.label} onChange={event => update(index, { label: event.target.value })}/></label></div>
      <label className="nested-label">値の型<select aria-label={`項目${index + 1}の型`} value={field.type} onChange={event => changeType(index, event.target.value as FieldDefinition['type'])}>{TYPES.map(([type, label]) => <option key={type} value={type}>{label}</option>)}</select></label>
      <div className="template-rules"><label className="check-label"><input aria-label={`項目${index + 1}を必須にする`} type="checkbox" checked={field.required} onChange={event => update(index, { required: event.target.checked })}/>必須項目</label><label className="check-label"><input aria-label={`項目${index + 1}で空欄を許可`} type="checkbox" checked={field.nullable} onChange={event => update(index, { nullable: event.target.checked })}/>空欄（null）を許可</label></div>
      {field.type === 'enum' && <label className="nested-label">選択候補（1行に1候補）<textarea rows={3} aria-label={`項目${index + 1}の選択候補`} value={field.allowedValues?.join('\n') ?? ''} onChange={event => update(index, { allowedValues: event.target.value.split('\n') })}/></label>}
      {field.type === 'ref' && <label className="nested-label">参照先の種類（選択なしなら全種類）<select multiple size={5} aria-label={`項目${index + 1}の参照先の種類`} value={field.targetKinds ?? []} onChange={event => update(index, { targetKinds: [...event.target.selectedOptions].map(option => option.value as EntityKind) })}>{ENTITY_KINDS.map(kind => <option key={kind} value={kind}>{KIND_LABELS[kind]}</option>)}</select></label>}
      <label className="nested-label">説明<input aria-label={`項目${index + 1}の説明`} value={field.help ?? ''} onChange={event => update(index, { help: event.target.value })}/></label>
      <div className="form-field"><label>初期値</label><CustomValueInput field={field} value={templateDefault(template, field)} project={project} label={`項目${index + 1}の初期値`} scope={`${scope}:${index}:default`} optional={false} onChange={value => update(index, { default: value ?? null })}/></div>
      <button type="button" className="text-button danger" onClick={() => {
        const normalized = normalizeTemplateDefaults(template);
        onChange({ ...normalized, fields: normalized.fields.filter((_, position) => position !== index) });
      }}>この項目の定義を外す</button>
    </fieldset>}/>
    <button type="button" className="button secondary small" onClick={() => {
      let number = template.fields.length + 1; while (template.fields.some(field => field.key === `field_${number}`)) number++;
      onChange({ ...template, fields: [...template.fields, { key: `field_${number}`, label: `追加項目 ${number}`, type: 'text', required: false, nullable: true, default: '' }] });
      setRevealedField(String(template.fields.length));
    }}>追加項目を作る</button>
    {errors.map((error, index) => <p className="field-error" role="alert" key={index}>{error.message}</p>)}
  </section>;
}

export function TemplateImpactList({ impacts, template, project, replacements, onReplacements }: {
  impacts: TemplateEntityImpact[]; template: Entity<'template'>; project: ProjectData; replacements: TemplateReplacements; onReplacements: (next: TemplateReplacements) => void;
}) {
  return <div className="template-impact-list"><WindowedList items={impacts.map(impact => ({ ...impact, id: impact.entityId }))} scope={`${project.projectId}:${template.id}:template-impacts`} label="雛形の影響先" size={10} searchText={impact => impact.name} render={impact => <section className="template-impact" key={impact.entityId}><h4>{impact.name || '無題'} <small>{impact.entityId}</small></h4>
    {impact.reassigned && <p className="field-hint">この雛形を適用します。既存の保存値は保持します。</p>}
    <WindowedList items={impact.fields.map((field, index) => ({ id: String(index), field }))} scope={`${project.projectId}:${template.id}:${impact.entityId}:template-impact-fields`} label={`${impact.name}の項目差分`} size={20} render={({ field, id }) => <div className="template-impact-field" key={id}><strong>{field.label}</strong><dl><dt>現在</dt><dd>{customValueLabel(field.before, project)}</dd><dt>適用後</dt><dd>{customValueLabel(field.after, project)}</dd></dl>
      <span className="field-hint">{field.kind === 'retired' ? '定義を外した項目の値も保持します。' : field.kind === 'default' ? '未設定のため初期値を追加します。' : field.kind === 'replacement' ? '指定した置換値を適用します。' : '現在の値を保持します。'}</span>
      {(field.issues.length > 0 || Object.hasOwn(replacements[impact.entityId] ?? {}, field.key)) && (() => {
        const definition = template.data.fields.find(definition => definition.key === field.key);
        return definition && <div className="template-replacement"><label>適合する置換値を指定</label><CustomValueInput field={definition} project={project} label={`${impact.name}の${definition.label}の置換値`} scope={`${project.projectId}:${template.id}:${impact.entityId}:${field.key}:replacement`} value={field.after} onChange={value => onReplacements({ ...replacements, [impact.entityId]: { ...replacements[impact.entityId], [field.key]: value } })}/></div>;
      })()}
    </div>}/>
    {impact.issues.filter(issue => issue.path.endsWith('.templateId')).map((issue, index) => <p className="field-error" role="alert" key={index}>{issue.message}</p>)}
  </section>}/></div>;
}

export function CustomFieldsEditor({ entity, project, hidden, onChange, onValid }: {
  entity: TemplateBoundEntity; project: ProjectData; hidden: string[]; onChange: (entity: Entity) => void; onValid: (valid: boolean) => void;
}) {
  const template = getEntityTemplate(project, entity);
  const errors = template?.data.fields.flatMap(field => validateCustomFieldValue(field, entity.customValues[field.key], field.key, project.entities)) ?? [];
  const errorKey = errors.map(error => `${error.path}:${error.message}`).join('|');
  useEffect(() => { onValid(!errors.length); }, [errorKey, template?.id]);
  if (!template) return null;
  return <section className="custom-fields" aria-label="追加項目"><h3>追加項目 · {labelOf(template)}</h3><WindowedList items={template.data.fields.filter(field => !hidden.includes(`custom:${field.key}`)).map(field => ({ ...field, id: field.key }))} scope={`${project.projectId}:${entity.id}:custom-fields`} label="追加項目" size={20} render={field => <div className="form-field" data-field={field.key} key={field.key}><label>{field.label}{field.required && <span className="field-hint">必須{field.nullable ? ' · 空欄の指定可' : ''}</span>}</label><CustomValueInput field={field} value={entity.customValues[field.key]} project={project} scope={`${project.projectId}:${entity.id}:custom:${field.key}`} onChange={value => {
    const customValues = { ...entity.customValues }; if (value === undefined) delete customValues[field.key]; else customValues[field.key] = value;
    onChange({ ...entity, customValues });
  }}/></div>}/>{errors.length > 0 && <p className="field-error" role="alert">追加項目の入力を確認してください。非表示の項目も保存前に検査します。</p>}</section>;
}

export function TemplateChooser({ entity, project, onChange }: { entity: TemplateBoundEntity; project: ProjectData; onChange: (entity: Entity) => void }) {
  const [selected, setSelected] = useState(entity.templateId ?? '');
  const [reviewing, setReviewing] = useState(false);
  const [replacements, setReplacements] = useState<Record<string, CustomValue | undefined>>({});
  useEffect(() => { setSelected(entity.templateId ?? ''); setReviewing(false); setReplacements({}); }, [entity.id, entity.templateId]);
  const templates = project.entities.filter((candidate): candidate is Entity<'template'> => candidate.kind === 'template' && candidate.data.targetKind === entity.kind && !candidate.deletedAt && candidate.status !== 'rejected');
  const template = templates.find(template => template.id === selected);
  const impact = template ? previewTemplateApplication(project, entity, template, replacements) : undefined;
  return <section className="template-chooser"><PagedSelect label="使用する雛形" scope={`${project.projectId}:${entity.id}:template-choice`} value={selected} emptyLabel="雛形を適用しない"
    items={templates.map(template => ({ id: template.id, label: `${labelOf(template)} · ${template.id}` }))} onChange={id => { setSelected(id); setReplacements({}); }}/>
    {(selected !== (entity.templateId ?? '') || template) && <button type="button" className="text-button" onClick={() => setReviewing(true)}>{selected ? '雛形の適用差分を確認' : '雛形の解除を確認'}</button>}
    {reviewing && <Modal title="雛形の適用差分" onClose={() => setReviewing(false)}>{template && impact ? <TemplateImpactList impacts={[impact]} template={template} project={project} replacements={{ [entity.id]: replacements }} onReplacements={next => setReplacements(next[entity.id] ?? {})}/> : selected ? <p className="field-error" role="alert">選択した雛形を利用できません。現在の作品から選び直してください。</p> : <p>雛形の適用を解除します。現在の追加項目の保存値は保持します。</p>}<div className="modal-actions"><button type="button" className="button secondary" onClick={() => { setReviewing(false); setReplacements({}); }}>中止</button><button type="button" className="button primary" disabled={!!impact?.issues.length || !!selected && !impact} onClick={() => {
      if (impact) onChange(impact.after);
      else { const next = { ...entity }; delete next.templateId; onChange(next); }
      setReviewing(false);
    }}>この差分を適用する</button></div></Modal>}
  </section>;
}

export interface EditorDisplayPreferences { hiddenFields: string[]; hiddenTabs: string[] }
export const EMPTY_EDITOR_DISPLAY: EditorDisplayPreferences = { hiddenFields: [], hiddenTabs: [] };
export function loadEditorDisplayPreferences(storage: Pick<Storage, 'getItem'>, key: string): EditorDisplayPreferences {
  try {
    const value = JSON.parse(storage.getItem(key) ?? '{}');
    return { hiddenFields: Array.isArray(value.hiddenFields) ? value.hiddenFields.filter((key: unknown): key is string => typeof key === 'string') : [], hiddenTabs: Array.isArray(value.hiddenTabs) ? value.hiddenTabs.filter((key: unknown): key is string => typeof key === 'string') : [] };
  } catch { return { hiddenFields: [], hiddenTabs: [] }; }
}
export function FieldVisibilityControls({ fields, customFields, tabs, preferences, onChange, scope = 'editor-display-fields' }: {
  fields: FieldSpec[]; customFields: FieldDefinition[]; tabs: readonly (readonly [string, string])[]; preferences: EditorDisplayPreferences; onChange: (preferences: EditorDisplayPreferences) => void; scope?: string;
}) {
  const toggle = (collection: 'hiddenFields' | 'hiddenTabs', key: string, shown: boolean) => onChange({ ...preferences, [collection]: shown ? preferences[collection].filter(value => value !== key) : [...new Set([...preferences[collection], key])] });
  return <details className="advanced-details"><summary>この端末での項目と画面の表示</summary><p className="field-hint">非表示にしても保存値と入力規則は維持します。</p><WindowedList
    items={[...fields.map(field => ({ id: field.key, key: field.key, label: field.label })), ...customFields.map(field => ({ id: `custom:${field.key}`, key: `custom:${field.key}`, label: `追加項目 · ${field.label}` }))]}
    scope={scope} label="表示する項目" size={30} searchText={field => field.label} render={field => <label className="check-label" key={field.key}><input type="checkbox" aria-label={`${field.label}を表示`} checked={!preferences.hiddenFields.includes(field.key)} onChange={event => toggle('hiddenFields', field.key, event.target.checked)}/>{field.label}</label>}/>{tabs.length > 0 && <div className="template-display-tabs"><h4>編集画面</h4>{tabs.map(([key, label]) => <label className="check-label" key={key}><input type="checkbox" aria-label={`${label}の編集画面を表示`} checked={!preferences.hiddenTabs.includes(key)} onChange={event => toggle('hiddenTabs', key, event.target.checked)}/>{label}</label>)}</div>}</details>;
}
