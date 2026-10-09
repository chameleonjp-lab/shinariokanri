import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { createEntity, createProject, emptyRuntimeState, toJsonSchema, newId, textToRichText, validateProject } from '../domain/model';
import { jsonBytes, sha256 } from '../storage/json';
import { DataField } from './Fields';
import { serializeStructuredNumberDrafts } from './structuredNumberDrafts';
import type { Entity, ProjectData } from '../domain/types';
import {
  entityDataFieldRequired,
  entityDataFieldSchema,
  insertArrayItem,
  moveArrayItem,
  planVariantSwitch,
  referenceIssue,
  removeArrayItem,
  validateNumericDraft,
  validateTickDraft,
  StructuredDataField,
} from './StructuredDataField';

function fixture() {
  const project = createProject('構造化フィールド');
  const character = createEntity(project.projectId, 'character', 'アオ');
  const group = createEntity(project.projectId, 'group', '門の守り手', { groupType: 'faction' });
  const place = createEntity(project.projectId, 'place', '霧の門');
  const item = createEntity(project.projectId, 'item', '鍵', { itemMode: 'instance', properties: { type: 'ref', value: group.id } });
  project.entities = [character, group, place, item];
  return { project, character, group, place, item };
}

const props = (project: ProjectData, entityKind: Entity['kind'], fieldKey: string, value: unknown, referenceKinds?: Record<string, readonly Entity['kind'][]>) => ({
  project,
  entityKind,
  fieldKey,
  value,
  label: fieldKey,
  referenceKinds,
  onChange: () => undefined,
  onValid: () => undefined,
});

describe('StructuredDataField schema-driven form', () => {
  it('uses generated Entity data schemas for remaining JSON fields', () => {
    const trigger = entityDataFieldSchema('flow_node', 'trigger');
    const constraints = entityDataFieldSchema('event', 'constraints');
    const query = entityDataFieldSchema('collection', 'query');
    expect((trigger?.anyOf as Record<string, unknown>[])[0]?.type).toBe('object');
    expect((constraints?.anyOf as Record<string, unknown>[])[0]?.type).toBe('array');
    const definitions = toJsonSchema().$defs as Record<string, Record<string, unknown>>;
    expect(entityDataFieldSchema('collection', 'query')?.anyOf).toBeDefined();
    expect(definitions.Query.oneOf).toBeDefined();
    expect(entityDataFieldSchema('flow_node', 'reuse')?.anyOf).toBeDefined();
    expect((entityDataFieldSchema('map', 'pins')?.anyOf as Record<string, unknown>[])[0]?.type).toBe('array');
    expect((entityDataFieldSchema('production_task', 'estimate')?.anyOf as Record<string, unknown>[])[0]?.type).toBe('object');
    expect(entityDataFieldSchema('template', 'fields')?.type).toBe('array');
    expect(entityDataFieldRequired('template', 'fields')).toBe(true);
    expect(entityDataFieldRequired('event', 'constraints')).toBe(false);
    expect(entityDataFieldRequired('disclosure', 'anchor')).toBe(true);
  });

  it('previews removed and replaced discriminator values without mutating the current value', () => {
    const schema = toJsonSchema(), definitions = schema.$defs as Record<string, Record<string, unknown>>;
    const condition = definitions.Condition;
    const branches = condition.oneOf as Record<string, unknown>[];
    const allIndex = branches.findIndex(branch => ((branch.properties as Record<string, Record<string, unknown>>).op?.const) === 'all');
    const current = { op: 'constant', value: true };
    const before = structuredClone(current);
    const plan = planVariantSwitch(condition, current, allIndex, schema);
    expect(plan?.nextLabel).toContain('すべて');
    expect(plan?.value).toMatchObject({ op: 'all', children: [] });
    expect(plan?.changes).toEqual(expect.arrayContaining([
      expect.objectContaining({ kind: 'remove', key: 'value', current: true }),
      expect.objectContaining({ kind: 'add', key: 'children' }),
    ]));
    expect(current).toEqual(before);

    const typed = definitions.TypedValue;
    const typedBranches = typed.oneOf as Record<string, unknown>[];
    const integerIndex = typedBranches.findIndex(branch => {
      const values = ((branch.properties as Record<string, Record<string, unknown>>).type?.enum);
      return Array.isArray(values) && values[0] === 'integer';
    });
    const typedCurrent = { type: 'boolean', value: true };
    const typedPlan = planVariantSwitch(typed, typedCurrent, integerIndex, schema);
    expect(typedPlan?.value).toEqual({ type: 'integer', value: 0 });
    expect(typedPlan?.changes).toEqual(expect.arrayContaining([
      expect.objectContaining({ kind: 'replace', key: 'type', current: 'boolean', next: 'integer' }),
      expect.objectContaining({ kind: 'replace', key: 'value', current: true, next: 0 }),
    ]));
    expect(typedCurrent).toEqual({ type: 'boolean', value: true });
  });

  it('shows a replacement when a nested object no longer matches the next variant schema', () => {
    const schema = {
      oneOf: [
        { type: 'object', properties: { op: { const: 'count' }, detail: { type: 'object', properties: { amount: { type: 'integer' } }, required: ['amount'], additionalProperties: false } }, required: ['op', 'detail'], additionalProperties: false },
        { type: 'object', properties: { op: { const: 'label' }, detail: { type: 'object', properties: { text: { type: 'string' } }, required: ['text'], additionalProperties: false } }, required: ['op', 'detail'], additionalProperties: false },
      ],
    };
    const current = { op: 'count', detail: { amount: 12 } };
    const plan = planVariantSwitch(schema, current, 1, {});
    expect(plan?.value).toEqual({ op: 'label', detail: { text: '' } });
    expect(plan?.changes).toEqual(expect.arrayContaining([
      expect.objectContaining({ kind: 'replace', key: 'detail', current: { amount: 12 }, next: { text: '' } }),
    ]));
  });

  it('retains ticks as validated strings and rejects unsafe or incomplete numeric drafts', () => {
    expect(validateTickDraft('90000000000000000000000000000000000000')).toBeUndefined();
    expect(validateTickDraft('-90000000000000000000000000000000000000')).toBeUndefined();
    expect(validateTickDraft('00017')).toContain('tick');
    expect(validateTickDraft('12-')).toContain('tick');
    expect(validateNumericDraft('9007199254740991', true)).toBeUndefined();
    expect(validateNumericDraft('9007199254740992', true)).toContain('安全');
    expect(validateNumericDraft('1.', false)).toContain('数値');
    expect(validateNumericDraft('1.25', false)).toBeUndefined();
  });

  it('reports missing and wrong-kind references and leaves a visible repair selector', () => {
    const { project, character, group, item } = fixture();
    expect(referenceIssue(character.id, project, ['character'])).toBeUndefined();
    expect(referenceIssue(group.id, project, ['character'])).toContain('人物');
    expect(referenceIssue('missing-id', project, ['character'])).toContain('見つかりません');
    const markup = renderToStaticMarkup(createElement(StructuredDataField, props(project, 'item', 'properties', { type: 'ref', value: group.id }, { value: ['character'] })));
    expect(markup).toContain('種類が一致しない対象');
    expect(markup).toContain('人物から選択します');
    expect(markup).toContain(group.id);
    expect(item.data.properties).toEqual({ type: 'ref', value: group.id });
  });

  it('renders normal nested controls for aliases, triggers, maps, and template definitions without raw JSON', () => {
    const { project, character, place } = fixture();
    const trigger = { event: 'enter', eventKey: 'door_enter', repeat: 'once', deadline: { mode: 'instant', at: '9007199254740993', calendarId: project.calendarId } };
    const triggerMarkup = renderToStaticMarkup(createElement(StructuredDataField, props(project, 'flow_node', 'trigger', trigger)));
    expect(triggerMarkup).toContain('起動イベント');
    expect(triggerMarkup).toContain('場面に入る');
    expect(triggerMarkup).toContain('文字列のまま保存します');
    expect(triggerMarkup).toContain('繰り返し');
    expect(triggerMarkup).not.toContain('<textarea');

    character.data.aliases = [{ id: newId(), text: '青', reading: 'あお', validity: { worldRange: null, routeCondition: null, presentationAnchor: null }, audienceHolderIds: [character.id], isPublicDefault: true }];
    const aliasMarkup = renderToStaticMarkup(createElement(StructuredDataField, props(project, 'character', 'aliases', character.data.aliases)));
    expect(aliasMarkup).toContain('公開する相手');
    expect(aliasMarkup).toContain('項目を追加');
    expect(aliasMarkup).toContain('人物');

    const pin = { id: newId(), placeId: place.id, x: 0.25, y: 0.75, label: '門' };
    const mapMarkup = renderToStaticMarkup(createElement(StructuredDataField, props(project, 'map', 'pins', [pin])));
    expect(mapMarkup).toContain('横位置');
    expect(mapMarkup).toContain('縦位置');
    expect(mapMarkup).toContain('場所');
    expect(mapMarkup).toContain('前へ');

    const templateProps = { ...props(project, 'template', 'fields', [{ key: 'reading', label: '読み', type: 'text', required: false, nullable: true, default: null, targetKinds: ['character'] }]), label: '型付きの入力項目' };
    const templateMarkup = renderToStaticMarkup(createElement(StructuredDataField, templateProps));
    expect(templateMarkup).toContain('入力項目');
    expect(templateMarkup).toContain('型');
    expect(templateMarkup).toContain('値の型');
    expect(templateMarkup).toContain('文字列');
  });

  it('keeps array add, remove, and reorder operations stable', () => {
    expect(insertArrayItem(['a', 'c'], 1, 'b')).toEqual(['a', 'b', 'c']);
    expect(moveArrayItem(['a', 'b', 'c'], 1, -1)).toEqual(['b', 'a', 'c']);
    expect(moveArrayItem(['a', 'b', 'c'], 1, 1)).toEqual(['a', 'c', 'b']);
    expect(removeArrayItem(['a', 'b', 'c'], 1)).toEqual(['a', 'c']);
  });

  it('limits record-key selectors to schema-defined variable references', () => {
    const { project, character } = fixture();
    const variable = createEntity(project.projectId, 'variable', '扉の状態'); project.entities.push(variable);
    const state = emptyRuntimeState(project.projectId); state.variableValues[variable.id] = { type: 'boolean', value: false };
    const markup = renderToStaticMarkup(createElement(StructuredDataField, props(project, 'checkpoint', 'runtimeState', state)));
    const keySelect = markup.match(/<select id="sd-runtimeState-variableValues-[^"]+-key"[^>]*>(.*?)<\/select>/)?.[1];
    expect(keySelect).toBeDefined(); expect(keySelect).toContain(variable.id); expect(keySelect).not.toContain(character.id);
    const invalid = { ...state, variableValues: { [character.id]: { type: 'boolean', value: false } } };
    const invalidMarkup = renderToStaticMarkup(createElement(StructuredDataField, props(project, 'checkpoint', 'runtimeState', invalid)));
    expect(invalidMarkup).toContain('参照先は状態変数から選んでください');
  });

  it('restores unfinished numeric drafts alongside the last valid pin coordinate', () => {
    const { project, place } = fixture();
    const pin = { id: newId(), placeId: place.id, x: 0.25, y: 0.75, label: '門' };
    const markup = renderToStaticMarkup(createElement(StructuredDataField, {
      ...props(project, 'map', 'pins', [pin]), rawOverride: serializeStructuredNumberDrafts({ 'pins.0.x': '-' }),
    }));
    expect(markup).toContain('id="sd-pins-0-x"'); expect(markup).toContain('value="-"'); expect(pin.x).toBe(0.25);
  });
  it('keeps actual alias, checkpoint, trace and review forms valid against a real immutable version', async () => {
    const project = createProject('版固定の通常フォーム');
    const source = createEntity(project.projectId, 'character', '固定版の人物', { body: textToRichText('元の語句') });
    const variable = createEntity(project.projectId, 'variable', '固定版の数値', { key: 'old_value', valueType: 'integer', initial: { type: 'integer', value: 7 }, allowed: { min: 0, max: 10 } });
    const node = createEntity(project.projectId, 'flow_node', '固定版の開始点', { nodeType: 'entry' });
    project.entities = [source, variable, node];
    const { history: _history, snapshots: _snapshots, ...content } = structuredClone(project);
    const snapshotId = newId(), blockId = source.data.body![0].id;
    project.snapshots.push({ id: snapshotId, content, contentHash: await sha256(jsonBytes(content)), createdAt: new Date().toISOString(), versionLabel: '公開版' });
    const anchor = { entityId: source.id, blockId, start: 0, end: 2 };
    const character = createEntity(project.projectId, 'character', '現在版の人物', { aliases: [{ id: newId(), text: '公開別名', reading: '', validity: { worldRange: null, routeCondition: null, presentationAnchor: { ...anchor, sourceVersionId: snapshotId } }, audienceHolderIds: [], isPublicDefault: true }] });
    const state = emptyRuntimeState(snapshotId); state.provenance = 'partial'; state.seenIds = [source.id, blockId]; state.variableValues[variable.id] = { type: 'integer', value: 7 };
    const checkpoint = createEntity(project.projectId, 'checkpoint', '固定版の状態', { contentVersionId: snapshotId, origin: 'partial', runtimeState: state });
    const trace = createEntity(project.projectId, 'trace', '固定版の経路', { contentVersionId: snapshotId, startCheckpointId: checkpoint.id, steps: [{ nodeId: node.id, edgeIds: [], before: state, after: state }] });
    const review = createEntity(project.projectId, 'review', '固定版への指摘', { targetVersionId: snapshotId, target: anchor });
    project.entities = [character, checkpoint, trace, review];
    const validation = validateProject(project); expect(validation.ok, validation.ok ? undefined : JSON.stringify(validation.issues)).toBe(true);
    const fields = [[character, 'aliases', character.data.aliases], [checkpoint, 'runtimeState', state], [trace, 'steps', trace.data.steps], [review, 'target', anchor]] as const;
    for (const [entity, key, value] of fields) {
      const markup = renderToStaticMarkup(createElement(DataField, { project, entity, field: { key, label: key, type: 'json' }, value, onChange: () => undefined, onValid: () => undefined }));
      expect(markup, key).not.toContain('sd-validation');
      expect(markup, key).not.toContain('参照先は見つかりません');
      expect(markup, key).toContain(source.name);
    }
    expect(referenceIssue(source.id, project, ['character'], 'entity', snapshotId)).toBeUndefined();
    expect(referenceIssue(source.id, project, ['character'])).toContain('見つかりません');
    expect(referenceIssue(source.id, project, ['character'], 'entity', newId())).toContain('固定版の本文');
  });
  it('accepts already saved current references to archived records and blocks, with an archive label', () => {
    const project = createProject('現在版のアーカイブ参照');
    const source = createEntity(project.projectId, 'character', 'アーカイブされた人物', { body: textToRichText('保持する本文') });
    source.deletedAt = new Date().toISOString(); source.deletionOperationId = newId();
    const character = createEntity(project.projectId, 'character', '参照を保持する人物', { aliases: [{ id: newId(), text: '保持する別名', reading: '', validity: { worldRange: null, routeCondition: null, presentationAnchor: { entityId: source.id, blockId: source.data.body![0].id, sourceVersionId: project.projectId } }, audienceHolderIds: [], isPublicDefault: true }] });
    project.entities = [source, character];
    const validation = validateProject(project); expect(validation.ok, validation.ok ? undefined : JSON.stringify(validation.issues)).toBe(true);
    const markup = renderToStaticMarkup(createElement(DataField, { project, entity: character, field: { key: 'aliases', label: 'aliases', type: 'json' }, value: character.data.aliases, onChange: () => undefined, onValid: () => undefined }));
    expect(markup).not.toContain('sd-validation');
    expect(markup).toContain('アーカイブ済みの保存された参照');
  });
});
