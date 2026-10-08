import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { KIND_LABELS, newId, toJsonSchema } from '../domain/model';
import type { Entity, EntityKind, ProjectData } from '../domain/types';
import { referenceChoices, referenceProject, type ReferenceScope } from '../domain/referenceChoices';
import { clearStructuredNumberDrafts, parseStructuredNumberDrafts, reindexStructuredNumberDrafts, renameStructuredDraftPath, serializeStructuredNumberDrafts, type StructuredNumberDrafts } from './structuredNumberDrafts';
import './StructuredDataField.css';

export type JsonSchemaNode = Record<string, unknown>;
export type ReferenceKinds = Readonly<Record<string, readonly EntityKind[]>>;

export interface StructuredDataFieldProps {
  value: unknown;
  onChange: (value: unknown) => void;
  project: ProjectData;
  label: string;
  entityKind?: EntityKind;
  entity?: Entity;
  fieldKey?: string;
  schema?: JsonSchemaNode;
  schemaRoot?: JsonSchemaNode;
  required?: boolean;
  referenceKinds?: ReferenceKinds;
  onValid?: (valid: boolean) => void;
  rawOverride?: string;
  onInvalidRaw?: (raw: string | undefined) => void;
  maxVisibleItems?: number;
}

interface PreviewChange { kind: 'remove' | 'replace' | 'add'; key: string; current?: unknown; next?: unknown }
export interface VariantSwitchPlan { value: unknown; changes: PreviewChange[]; nextLabel: string }

const NumberDraftContext = createContext<{
  drafts: StructuredNumberDrafts;
  update: (path: string, raw: string | undefined) => void;
  clear: (path: string) => void;
  rename: (path: string, nextPath: string) => void;
  reindex: (path: string, mapIndex: (index: number) => number | undefined) => void;
}>({ drafts: {}, update: () => undefined, clear: () => undefined, rename: () => undefined, reindex: () => undefined });
const ReferenceVersionContext = createContext<string | undefined>(undefined);

function useValidityCleanup(path: string, onValidity: (path: string, valid: boolean) => void) {
  useEffect(() => () => onValidity(path, true), [path, onValidity]);
}

const GENERATED_SCHEMA = toJsonSchema();
const PROPERTY_LABELS: Record<string, string> = {
  id: 'ID', name: '名称', kind: '種類', type: '値の型', mode: '方式', op: '条件の種類', value: '値',
  values: '候補の値', min: '最小値', max: '最大値', start: '開始位置', end: '終了位置', startTick: '開始tick', endTick: '終了tick',
  at: '時点tick', earliest: '最も早いtick', latest: '最も遅いtick', precision: '精度', calendarId: '暦',
  reason: '理由', text: '文章', reading: '読み', label: '表示名', key: 'キー', canonical: '標準表記', language: '言語', locale: 'ロケール',
  worldRange: '世界内の有効期間', routeCondition: '経路条件', presentationAnchor: '本文の位置', validity: '有効範囲',
  entityId: '対象', blockId: '本文の段落ID', lineId: '台詞行', sourceVersionId: '対象の版', positionStatus: '位置の状態', positionReason: '位置不明の理由', quotedText: '引用した本文',
  routeScope: '出力対象の範囲', projectId: 'プロジェクト', graphId: '分岐', chapterId: '章', targetSnapshotId: '対象の確定版',
  sourceType: '資料の種類', locator: '資料の場所', accessedAt: '参照日時', excerptLocation: '引用箇所', attachmentId: '添付資料', redistributionAllowed: '再配布を許可',
  event: '起動イベント', eventKey: 'イベントキー', repeat: '繰り返し', scope: '有効範囲', deadline: '期限', trigger: 'トリガー',
  anchorEventId: '基準となる出来事', anchorPoint: '基準位置', minOffset: '最小差tick', maxOffset: '最大差tick',
  comparator: '比較方法', children: '条件の一覧', variableId: '状態変数', itemId: '物品', quantity: '個数', assertionId: '情報', holderId: '知識を持つ人物', contractId: '外部契約',
  from: '変更前', to: '変更後', exception: '例外として許可', on: '実行する時点', resetRules: 'リセット規則', transitionRules: '状態遷移',
  operation: '効果の種類', targetId: '対象', condition: '適用条件', instanceId: '個体ID', effectIds: '適用する効果',
  audienceHolderIds: '公開する相手', isPublicDefault: '標準で公開', aliases: '別名', textAlias: '別表記',
  targetKind: '対象の種類', fields: '入力項目', description: '説明', defaults: '初期値', allowedValues: '選択肢', targetKinds: '参照できる種類', required: '必須', nullable: '未設定を許可', default: '初期値', help: '入力の説明',
  field: '並べ替える項目', direction: '向き・順序', query: '検索条件', memberIds: '対象', sort: '並び順',
  fromPlaceId: '出発地', toPlaceId: '目的地', minimumTicks: '最短時間tick', maximumTicks: '最長時間tick', evidence: '根拠', pins: '地図のピン', placeId: '場所', x: '横位置', y: '縦位置',
  valueType: '状態の値型', initial: '初期状態', allowed: '許容する値', externalUseDeclared: '外部利用を宣言', ownerId: '所有者', derived: '算出式', externalContractId: '外部契約',
  parameters: '呼出しパラメーター', sceneIds: '場面', nodeIds: 'ノード', edgeIds: '接続', entryIds: '入口', exitIds: '出口',
  stage: '段階', role: '役割', status: '状態', progress: '進捗', reasonText: '理由', validityReason: '理由',
  sourceId: '参照元', pinnedSnapshotId: '参照する確定版', overrideFields: '上書きする項目', reuse: '共通場面の再利用',
  assumption: '前提', assumptions: '前提', unit: '単位', range: '範囲', unknownCount: '不明の数', source: '見積もりの根拠', speed: '速度', estimate: '見積もり',
  date: '日付', timeZone: 'タイムゾーン', time: '時刻', directionType: '向き',
  fromId: '接続元', toId: '接続先', relationType: '関係の種類', evidenceIds: '根拠',
  sceneId: '場面', characterId: '人物', groupId: 'グループ', eventId: '出来事', flowId: '分岐',
  reviewedBy: '確認者', origin: '開始状態の由来', traceId: '経路記録',
  valueVariable: '状態変数', loopNumber: '周回数', provenance: '証跡の種類', contentVersionId: '作品版',
  variableValues: '状態値', itemInstances: '所持品', assertions: '人物の認識', seenIds: '提示済みの対象', visitCounts: '訪問回数', onceTriggers: '一度だけ実行したトリガー', rngSeed: '抽選種', rngPosition: '抽選位置', callStack: '呼出し履歴', presentationPosition: '現在位置',
};

const ENUM_LABELS: Record<string, string> = {
  instant: '確定した時点', interval: '期間', uncertain: '不確かな範囲', relative: '出来事からの相対時間', unknown: '未確定',
  constant: '常に真／偽', all: 'すべて満たす（AND）', any: 'いずれかを満たす（OR）', not: '否定（NOT）', compare: '状態を比較', item: '物品の所持', known: '人物の知識', visited: '訪問回数', external: '外部値',
  eq: '等しい', ne: '等しくない', lt: 'より小さい', le: '以下', gt: 'より大きい', ge: '以上', in: '候補に含まれる',
  value: '値を使う', variable: '状態変数を使う', add: '加算', subtract: '減算', multiply: '乗算', if: '条件で分ける',
  boolean: '真偽値', integer: '整数', enum: '選択肢', text: '文字列', ref: '対象への参照', date: '日付',
  enter: '場面に入る', talk: '会話', battle_result: '戦闘結果', manual: '手動実行', custom: '独自イベント', once: '一度だけ', repeatable: '繰り返す',
  scene_end: '場面の終了', chapter_end: '章の終了', run_end: '試読の終了', new_loop: '新しい周回', full_reset: 'すべて初期化',
  before: 'より前', same_start: '同時に開始', end_gap: '終了間隔',
  set: '設定', grant: '付与', consume: '消費', move: '移動', assert: '情報を追加', mark_seen: '提示済みにする', reset: 'リセット',
  alias: '別名を使う', replace: '指定した名前に置換', exclude: '対象から除外', anonymize: '匿名名に置換',
  web: 'ウェブ', file: 'ファイル', book: '書籍', observation: '観察',
  forward: '一方向', symmetric: '双方向', ascending: '昇順', descending: '降順', asc: '昇順', desc: '降順',
  fixed: '固定', dynamic: '条件に合う対象',
};

const ENUM_LABELS_BY_KEY: Record<string, Record<string, string>> = {
  op: Object.fromEntries(['constant', 'all', 'any', 'not', 'compare', 'item', 'known', 'visited', 'external', 'value', 'variable', 'add', 'subtract', 'multiply', 'if'].map(value => [value, ENUM_LABELS[value]])),
  mode: { instant: '確定した時点', interval: '期間', uncertain: '不確かな範囲', relative: '相対時間', unknown: '未確定', alias: '別名', replace: '置換', exclude: '除外', anonymize: '匿名化', fixed: '固定', dynamic: '条件に合う対象' },
  type: { boolean: '真偽値', integer: '整数', enum: '選択肢', text: '文字列', ref: '対象への参照', date: '日付', paragraph: '段落', heading: '見出し', list_item: 'リスト項目', quote: '引用' },
  event: { enter: '場面に入る', talk: '会話', battle_result: '戦闘結果', manual: '手動実行', custom: '独自イベント' },
  comparator: { eq: '等しい', ne: '等しくない', lt: 'より小さい', le: '以下', gt: 'より大きい', ge: '以上', in: '候補に含まれる' },
  on: { scene_end: '場面の終了', chapter_end: '章の終了', run_end: '試読の終了', new_loop: '新しい周回', full_reset: 'すべて初期化' },
  operation: { set: '設定', add: '加算', grant: '付与', consume: '消費', move: '移動', assert: '情報を追加', mark_seen: '提示済みにする', reset: 'リセット' },
  sourceType: { web: 'ウェブ', file: 'ファイル', book: '書籍', observation: '観察' },
};

const TICK_PATTERN = /^(?:0|-[1-9][0-9]{0,37}|[1-9][0-9]{0,37})$/;
const ID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const INTRINSIC_ID_FIELDS = new Set(['id', 'blockId', 'calendarId', 'projectId', 'operationId', 'baseRevision', 'revision', 'sourceHash', 'hash']);
const COMMON_TARGET_KINDS: Record<string, EntityKind[]> = {
  characterId: ['character'], speakerId: ['character'], holderId: ['character'], ownerId: ['character', 'group'], groupId: ['group'],
  sceneId: ['scene'], chapterId: ['chapter'], eventId: ['event'], targetEventId: ['event'], fromPlaceId: ['place'], toPlaceId: ['place'], placeId: ['place'], locationId: ['place'],
  flowId: ['flow_graph'], graphId: ['flow_graph'], childGraphId: ['flow_graph'], parentGraphId: ['flow_graph'], flowGraphId: ['flow_graph'],
  variableId: ['variable'], stateVariableId: ['variable'], itemId: ['item'], typeId: ['item'], assertionId: ['assertion'], foreshadowId: ['foreshadow'],
  attachmentId: ['attachment'], referenceAssetId: ['attachment'], finalAssetId: ['attachment'], sourceLineId: ['dialogue_line'], lineId: ['dialogue_line'],
  pinnedSnapshotId: ['snapshot'], targetSnapshotId: ['snapshot'], baseSnapshotId: ['snapshot'], contentVersionId: ['snapshot'], targetVersionId: ['snapshot'], sourceVersionId: ['snapshot'],
  traceId: ['trace'], checkpointId: ['checkpoint'], startCheckpointId: ['checkpoint'], cueId: ['cue'],
  sourceId: ['source'], sourceIds: ['source', 'assertion', 'event', 'scene', 'dialogue_line'],
  targetId: [], toId: [], fromId: [], entityId: [], evidenceIds: [], adapterProfileIds: ['projection_profile'],
};

function isRecord(value: unknown): value is Record<string, unknown> { return !!value && typeof value === 'object' && !Array.isArray(value); }
function asSchema(value: unknown): JsonSchemaNode | undefined { return isRecord(value) ? value : undefined; }
function schemaString(schema: JsonSchemaNode, key: string): string | undefined { return typeof schema[key] === 'string' ? schema[key] as string : undefined; }
function schemaArray(schema: JsonSchemaNode, key: string): unknown[] { return Array.isArray(schema[key]) ? schema[key] as unknown[] : []; }
function schemaProperties(schema: JsonSchemaNode): Record<string, JsonSchemaNode> {
  const properties = asSchema(schema.properties);
  return properties ? Object.fromEntries(Object.entries(properties).flatMap(([key, value]) => asSchema(value) ? [[key, asSchema(value)!]] : [])) : {};
}
function requiredProperties(schema: JsonSchemaNode): Set<string> { return new Set(schemaArray(schema, 'required').filter((key): key is string => typeof key === 'string')); }

export function entityDataFieldSchema(entityKind: EntityKind, fieldKey: string, schemaRoot: JsonSchemaNode = GENERATED_SCHEMA): JsonSchemaNode | undefined {
  const definitions = asSchema(schemaRoot.$defs);
  const entitySchema = definitions && asSchema(definitions[`Entity_${entityKind}`]);
  const data = entitySchema && asSchema(schemaProperties(entitySchema).data);
  return data ? schemaProperties(data)[fieldKey] : undefined;
}

export function entityDataFieldRequired(entityKind: EntityKind, fieldKey: string, schemaRoot: JsonSchemaNode = GENERATED_SCHEMA): boolean {
  const definitions = asSchema(schemaRoot.$defs);
  const entitySchema = definitions && asSchema(definitions[`Entity_${entityKind}`]);
  const data = entitySchema && asSchema(schemaProperties(entitySchema).data);
  return !!data && requiredProperties(data).has(fieldKey);
}

function refName(schema: JsonSchemaNode): string | undefined {
  const ref = schemaString(schema, '$ref');
  return ref?.startsWith('#/$defs/') ? decodeURIComponent(ref.slice('#/$defs/'.length)) : undefined;
}

function resolveSchema(schema: JsonSchemaNode, root: JsonSchemaNode, depth = 0): JsonSchemaNode {
  if (depth > 20) return schema;
  const name = refName(schema), definitions = asSchema(root.$defs);
  const definition = name && definitions ? asSchema(definitions[name]) : undefined;
  return definition ? resolveSchema(definition, root, depth + 1) : schema;
}

function nullableBranches(schema: JsonSchemaNode): { nullable: boolean; valueSchema: JsonSchemaNode; unionKey?: 'anyOf' | 'oneOf'; branches?: JsonSchemaNode[] } {
  const key = Array.isArray(schema.anyOf) ? 'anyOf' : Array.isArray(schema.oneOf) ? 'oneOf' : undefined;
  if (!key) return { nullable: false, valueSchema: schema };
  const branches = (schema[key] as unknown[]).flatMap(item => asSchema(item) ? [asSchema(item)!] : []);
  const nullBranch = branches.some(branch => branch.type === 'null');
  if (!nullBranch) return { nullable: false, valueSchema: schema, unionKey: key, branches };
  const remaining = branches.filter(branch => branch.type !== 'null');
  return { nullable: true, valueSchema: remaining.length === 1 ? remaining[0] : { [key]: remaining }, unionKey: remaining.length > 1 ? key : undefined, branches: remaining.length > 1 ? remaining : undefined };
}

function schemaType(schema: JsonSchemaNode, root: JsonSchemaNode): string | string[] | undefined {
  const resolved = resolveSchema(schema, root);
  return typeof resolved.type === 'string' || Array.isArray(resolved.type) ? resolved.type as string | string[] : undefined;
}

function schemaDefault(schema: JsonSchemaNode, root: JsonSchemaNode, depth = 0, preferNull = true): unknown {
  if (depth > 20) return undefined;
  if (Object.hasOwn(schema, 'const')) return schema.const;
  if (Array.isArray(schema.enum) && schema.enum.length) return schema.enum[0];
  const nullable = nullableBranches(schema);
  if (nullable.nullable && preferNull) return null;
  if (nullable.nullable) return schemaDefault(nullable.valueSchema, root, depth + 1, false);
  const resolved = resolveSchema(schema, root);
  const unionKey = Array.isArray(resolved.anyOf) ? 'anyOf' : Array.isArray(resolved.oneOf) ? 'oneOf' : undefined;
  if (unionKey) {
    const variants = schemaArray(resolved, unionKey).flatMap(item => asSchema(item) ? [asSchema(item)!] : []);
    const branch = variants.find(item => item.type !== 'null');
    return branch ? schemaDefault(branch, root, depth + 1, false) : undefined;
  }
  const type = resolved.type;
  if (Array.isArray(type)) {
    if (type.includes('string')) return '';
    if (type.includes('integer') || type.includes('number')) return 0;
    if (type.includes('boolean')) return false;
    return null;
  }
  if (type === 'object' || resolved.additionalProperties) {
    const properties = schemaProperties(resolved), required = requiredProperties(resolved);
    if (Object.keys(properties).length) {
      const result: Record<string, unknown> = {};
      for (const key of required) if (properties[key]) result[key] = key === 'id' && refName(properties[key]) === 'ID' ? newId() : schemaDefault(properties[key], root, depth + 1, true);
      return result;
    }
    return {};
  }
  if (type === 'array') return [];
  if (type === 'null') return null;
  if (type === 'boolean') return false;
  if (type === 'integer' || type === 'number') return typeof resolved.minimum === 'number' && resolved.minimum > 0 ? resolved.minimum : 0;
  if (type === 'string') return refName(schema) === 'Tick' ? '0' : '';
  return undefined;
}

function simpleTypeMatches(type: unknown, value: unknown): boolean {
  if (type === 'null') return value === null;
  if (type === 'boolean') return typeof value === 'boolean';
  if (type === 'integer') return typeof value === 'number' && Number.isSafeInteger(value);
  if (type === 'number') return typeof value === 'number' && Number.isFinite(value);
  if (type === 'string') return typeof value === 'string';
  if (type === 'object') return isRecord(value);
  if (type === 'array') return Array.isArray(value);
  return false;
}

function schemaShapeMatches(schema: JsonSchemaNode, value: unknown, root: JsonSchemaNode, depth = 0): boolean {
  if (depth > 24) return false;
  if (Object.hasOwn(schema, 'const')) return Object.is(schema.const, value);
  if (Array.isArray(schema.enum)) return schema.enum.some(option => Object.is(option, value));
  const resolved = resolveSchema(schema, root);
  if (Array.isArray(resolved.anyOf)) return schemaArray(resolved, 'anyOf').some(branch => asSchema(branch) && schemaShapeMatches(asSchema(branch)!, value, root, depth + 1));
  if (Array.isArray(resolved.oneOf)) return schemaArray(resolved, 'oneOf').filter(branch => asSchema(branch) && schemaShapeMatches(asSchema(branch)!, value, root, depth + 1)).length === 1;
  if (Array.isArray(resolved.type)) return resolved.type.some(type => simpleTypeMatches(type, value));
  if (resolved.type === 'object') {
    if (!isRecord(value)) return false;
    const props = schemaProperties(resolved), required = requiredProperties(resolved);
    if (![...required].every(key => Object.hasOwn(value, key))) return false;
    for (const [key, child] of Object.entries(value)) {
      const childSchema = props[key] ?? asSchema(resolved.additionalProperties);
      if (!childSchema) {
        if (resolved.additionalProperties === false) return false;
        continue;
      }
      if (!schemaShapeMatches(childSchema, child, root, depth + 1)) return false;
    }
    return true;
  }
  if (resolved.type === 'array') {
    if (!Array.isArray(value)) return false;
    const itemSchema = asSchema(resolved.items);
    return !itemSchema || value.every(item => schemaShapeMatches(itemSchema, item, root, depth + 1));
  }
  if (typeof resolved.type === 'string') return simpleTypeMatches(resolved.type, value);
  return true;
}

function scalarPreview(value: unknown): string {
  if (value === undefined) return '未設定';
  if (value === null) return '明示的な未設定';
  if (typeof value === 'boolean') return value ? 'はい' : 'いいえ';
  if (typeof value === 'string') return `「${value.length > 32 ? `${Array.from(value).slice(0, 32).join('')}…` : value}」`;
  if (typeof value === 'number') return String(value);
  if (Array.isArray(value)) return `${value.length}件の項目`;
  return '入力済みの複合値';
}

function discriminator(branch: JsonSchemaNode, root: JsonSchemaNode): { key: string; value: unknown } | undefined {
  const resolved = resolveSchema(branch, root), properties = schemaProperties(resolved);
  for (const key of ['op', 'type', 'mode', 'kind', 'event', 'comparator', 'sourceType']) {
    const field = properties[key];
    if (!field) continue;
    if (Object.hasOwn(field, 'const')) return { key, value: field.const };
    const enumValues = schemaArray(field, 'enum');
    if (enumValues.length === 1) return { key, value: enumValues[0] };
  }
  return undefined;
}

function variantLabel(branch: JsonSchemaNode, root: JsonSchemaNode, index: number): string {
  const tag = discriminator(branch, root);
  if (tag) return ENUM_LABELS_BY_KEY[tag.key]?.[String(tag.value)] ?? ENUM_LABELS[String(tag.value)] ?? String(tag.value);
  const resolved = resolveSchema(branch, root);
  if (resolved.type === 'string' || resolved.type === 'number' || resolved.type === 'boolean' || resolved.type === 'null') return ENUM_LABELS[String(resolved.type)] ?? String(resolved.type);
  const keys = Object.keys(schemaProperties(resolved)).slice(0, 3).map(propertyLabel);
  return keys.length ? `${keys.join('・')}の形` : `候補 ${index + 1}`;
}

function currentVariantIndex(branches: JsonSchemaNode[], value: unknown, root: JsonSchemaNode): number {
  if (isRecord(value)) {
    const matching = branches.findIndex(branch => {
      const tag = discriminator(branch, root);
      return tag && Object.is(value[tag.key], tag.value);
    });
    if (matching >= 0) return matching;
  }
  const matching = branches.findIndex(branch => schemaShapeMatches(branch, value, root));
  return matching >= 0 ? matching : 0;
}

function propertyLabel(key: string): string { return PROPERTY_LABELS[key] ?? key.replace(/([a-z])([A-Z])/g, '$1 $2'); }
function enumLabel(value: unknown, key: string): string {
  if (value === null) return '明示的な未設定';
  if (typeof value === 'boolean') return value ? 'はい' : 'いいえ';
  return ENUM_LABELS_BY_KEY[key]?.[String(value)] ?? ENUM_LABELS[String(value)] ?? KIND_LABELS[value as EntityKind] ?? String(value);
}

/** Builds a reviewed switch value while identifying every removed or replaced field. */
export function planVariantSwitch(schema: JsonSchemaNode, value: unknown, nextIndex: number, root: JsonSchemaNode = GENERATED_SCHEMA): VariantSwitchPlan | undefined {
  const resolved = resolveSchema(schema, root);
  const key = Array.isArray(resolved.oneOf) ? 'oneOf' : Array.isArray(resolved.anyOf) ? 'anyOf' : undefined;
  if (!key) return undefined;
  const branches = schemaArray(resolved, key).flatMap(branch => asSchema(branch) ? [asSchema(branch)!] : []).filter(branch => branch.type !== 'null');
  const nextBranch = branches[nextIndex];
  if (!nextBranch) return undefined;
  const nextValue = schemaDefault(nextBranch, root, 0, false);
  const changes: PreviewChange[] = [];
  const currentObject = isRecord(value) ? value : undefined;
  const nextObject = isRecord(nextValue) ? { ...nextValue } : undefined;
  if (currentObject && nextObject) {
    const nextProperties = schemaProperties(resolveSchema(nextBranch, root));
    for (const [field, current] of Object.entries(currentObject)) {
      if (!Object.hasOwn(nextProperties, field)) { changes.push({ kind: 'remove', key: field, current }); continue; }
      if (schemaShapeMatches(nextProperties[field], current, root)) { nextObject[field] = current; continue; }
      changes.push({ kind: 'replace', key: field, current, next: nextObject[field] });
    }
    for (const [field, next] of Object.entries(nextObject)) if (!Object.hasOwn(currentObject, field)) changes.push({ kind: 'add', key: field, next });
    return { value: nextObject, changes, nextLabel: variantLabel(nextBranch, root, nextIndex) };
  }
  if (schemaShapeMatches(nextBranch, value, root)) return { value, changes, nextLabel: variantLabel(nextBranch, root, nextIndex) };
  changes.push({ kind: value === undefined ? 'add' : 'replace', key: 'value', current: value, next: nextValue });
  return { value: nextValue, changes, nextLabel: variantLabel(nextBranch, root, nextIndex) };
}

export function validateTickDraft(value: string): string | undefined {
  return TICK_PATTERN.test(value) ? undefined : 'tickは0または符号付きの整数文字列で入力してください。';
}

export function validateNumericDraft(value: string, integer: boolean, minimum?: number, maximum?: number): string | undefined {
  if (!value.trim() || !/^[+-]?(?:\d+(?:\.\d+)?|\.\d+)(?:[eE][+-]?\d+)?$/.test(value.trim())) return '数値を入力してください。';
  const number = Number(value);
  if (!Number.isFinite(number)) return '有限の数値を入力してください。';
  if (integer && !Number.isSafeInteger(number)) return '安全な範囲の整数を入力してください。';
  if (minimum !== undefined && number < minimum) return `値は ${minimum} 以上にしてください。`;
  if (maximum !== undefined && number > maximum) return `値は ${maximum} 以下にしてください。`;
  return undefined;
}

export function referenceIssue(value: string, project: ProjectData, kinds?: readonly EntityKind[], scope: ReferenceScope = 'entity', versionId?: string): string | undefined {
  if (!value) return '対象を選んでください。';
  const source = scope === 'snapshot' ? project : referenceProject(project, versionId);
  if (!source) return '参照する固定版の本文が見つかりません。現在版へ推測して置き換えず、保存ファイルを確認してください。';
  if (scope !== 'entity') return referenceChoices(project, scope, kinds, { versionId, includeArchived: true }).some(choice => choice.id === value) ? undefined : 'この範囲の参照先が見つかりません。選び直してください。';
  const target = source.entities.find(entity => entity.id === value);
  if (!target) return 'この参照先は見つかりません。選び直してください。';
  if (kinds?.length && !kinds.includes(target.kind)) return `参照先は${kinds.map(kind => KIND_LABELS[kind]).join('・')}から選んでください。`;
  return undefined;
}

export function insertArrayItem<T>(items: readonly T[], index: number, value: T): T[] {
  const next = [...items]; next.splice(Math.max(0, Math.min(index, next.length)), 0, value); return next;
}
export function removeArrayItem<T>(items: readonly T[], index: number): T[] { return items.filter((_, current) => current !== index); }
export function moveArrayItem<T>(items: readonly T[], index: number, delta: -1 | 1): T[] {
  const target = index + delta;
  if (index < 0 || target < 0 || target >= items.length) return [...items];
  const next = [...items]; [next[index], next[target]] = [next[target], next[index]]; return next;
}

function getReferenceKinds(path: string, key: string | undefined, mapping: ReferenceKinds, parentValue?: unknown, schema?: JsonSchemaNode): readonly EntityKind[] | undefined {
  const metadata = schema ? schemaTargetKinds(schema) : undefined;
  if (metadata) return metadata;
  const wildcardPath = path.replace(/\.\d+(?=\.|$)/g, '.*');
  const semanticKey = path.split('.').filter(part => !/^\d+$/.test(part)).at(-1) ?? key;
  const exact = mapping[path] ?? mapping[wildcardPath] ?? (key ? mapping[key] : undefined) ?? (semanticKey ? mapping[semanticKey] : undefined);
  if (exact) return exact;
  if (key === 'value' && isRecord(parentValue) && parentValue.type === 'ref') return [];
  if (!semanticKey || INTRINSIC_ID_FIELDS.has(semanticKey)) return undefined;
  return COMMON_TARGET_KINDS[semanticKey] ?? (semanticKey === 'target' || /Ids?$/.test(semanticKey) ? [] : undefined);
}

function schemaTargetKinds(schema: JsonSchemaNode): readonly EntityKind[] | undefined {
  let kinds: unknown = schema['x-targetKinds'];
  if (kinds === undefined && typeof schema.$comment === 'string') {
    try { kinds = (JSON.parse(schema.$comment) as Record<string, unknown>).targetKinds; } catch { /* unrelated schema comments are ignored */ }
  }
  return Array.isArray(kinds) && kinds.every(kind => typeof kind === 'string') ? kinds as EntityKind[] : undefined;
}

function schemaReferenceScope(schema: JsonSchemaNode): ReferenceScope | undefined {
  try { const scope: unknown = typeof schema.$comment === 'string' ? JSON.parse(schema.$comment).referenceScope : undefined; return typeof scope === 'string' && ['entity','relation','record','projection_record','presentation','block','alias','snapshot','project','calendar','identity'].includes(scope) ? scope as ReferenceScope : undefined; } catch { return undefined; }
}

function isEntityReference(schema: JsonSchemaNode, path: string, parentValue: unknown, referenceKinds: ReferenceKinds): boolean {
  const scope = schemaReferenceScope(schema);
  if (scope === 'identity') return false;
  if (scope) return true;
  if (refName(schema) !== 'ID') return false;
  const key = path.split('.').filter(part => !/^\d+$/.test(part)).at(-1);
  if (schemaTargetKinds(schema)) return true;
  if (key === 'value' && isRecord(parentValue)) return parentValue.type === 'ref';
  if (key === 'blockId' || key === 'calendarId' || key === 'projectId' || key === 'id') return false;
  return getReferenceKinds(path, key, referenceKinds) !== undefined || key === 'target';
}

function pathId(path: string): string { return `sd-${path.replace(/[^a-zA-Z0-9_-]/g, '-')}`; }
function recordEntryPath(path: string, key: string): string { return `${path}.${encodeURIComponent(key).replace(/\./g, '%2E')}`; }

function formatValidation(schema: JsonSchemaNode, value: unknown, path: string, root: JsonSchemaNode, project: ProjectData, referenceKinds: ReferenceKinds, depth = 0, parentValue?: unknown, versionId?: string): string[] {
  if (depth > 24) return [`${path}の構造が深すぎます。`];
  if (value === undefined) return [];
  if (value === null) return schemaShapeMatches(schema, null, root) ? [] : [`${path}は値を入力してください。`];
  if (Object.hasOwn(schema, 'const')) return Object.is(schema.const, value) ? [] : [`${path}の種類を選び直してください。`];
  if (Array.isArray(schema.enum)) return schema.enum.some(option => Object.is(option, value)) ? [] : [`${path}から選択してください。`];
  const originalRef = refName(schema), resolved = resolveSchema(schema, root);
  if (Array.isArray(resolved.anyOf)) {
    const branches = schemaArray(resolved, 'anyOf').flatMap(branch => asSchema(branch) ? [asSchema(branch)!] : []);
    return branches.some(branch => formatValidation(branch, value, path, root, project, referenceKinds, depth + 1, parentValue, versionId).length === 0) ? [] : [`${path}の形式を確認してください。`];
  }
  if (Array.isArray(resolved.oneOf)) {
    const branches = schemaArray(resolved, 'oneOf').flatMap(branch => asSchema(branch) ? [asSchema(branch)!] : []);
    const valid = branches.filter(branch => formatValidation(branch, value, path, root, project, referenceKinds, depth + 1, parentValue, versionId).length === 0);
    return valid.length === 1 ? [] : [`${path}の種類を選び直してください。`];
  }
  if (originalRef === 'Tick') return typeof value === 'string' && !validateTickDraft(value) ? [] : [`${path}はlossless tick文字列で入力してください。`];
  if ((originalRef === 'ID' || schemaReferenceScope(schema)) && isEntityReference(schema, path, parentValue, referenceKinds)) {
    const kinds = getReferenceKinds(path, path.split('.').at(-1), referenceKinds, parentValue, schema);
    const issue = referenceIssue(String(value), project, kinds, schemaReferenceScope(schema), versionId);
    return issue ? [`${path}: ${issue}`] : [];
  }
  const type = resolved.type;
  if (Array.isArray(type)) {
    if (!type.some(candidate => simpleTypeMatches(candidate, value))) return [`${path}の型が一致しません。`];
    if (typeof value === 'number' && !Number.isFinite(value)) return [`${path}は有限の数値を入力してください。`];
    return [];
  }
  if (resolved.type === 'object' || resolved.additionalProperties) {
    if (!isRecord(value)) return [`${path}を入力してください。`];
    const properties = schemaProperties(resolved), required = requiredProperties(resolved), errors: string[] = [];
    const anchorVersion = typeof value.entityId === 'string' && typeof value.sourceVersionId === 'string' ? value.sourceVersionId : versionId;
    const propertyNames = asSchema(resolved.propertyNames);
    if (propertyNames) for (const key of Object.keys(value)) errors.push(...formatValidation(propertyNames, key, `${path}.${key}.$key`, root, project, referenceKinds, depth + 1, value, anchorVersion));
    for (const key of required) if (!Object.hasOwn(value, key) || value[key] === undefined) errors.push(`${path}.${propertyLabel(key)}は必須です。`);
    for (const [key, child] of Object.entries(value)) {
      const childSchema = properties[key] ?? asSchema(resolved.additionalProperties);
      if (child === undefined && !required.has(key)) continue;
      if (childSchema) errors.push(...formatValidation(childSchema, child, `${path}.${key}`, root, project, referenceKinds, depth + 1, value, anchorVersion));
      else if (resolved.additionalProperties === false) errors.push(`${path}.${propertyLabel(key)}はこの種類では使えません。`);
    }
    return errors;
  }
  if (resolved.type === 'array') {
    if (!Array.isArray(value)) return [`${path}は一覧で入力してください。`];
    const errors: string[] = [], item = asSchema(resolved.items);
    if (typeof resolved.minItems === 'number' && value.length < resolved.minItems) errors.push(`${path}には${resolved.minItems}件以上必要です。`);
    if (typeof resolved.maxItems === 'number' && value.length > resolved.maxItems) errors.push(`${path}は${resolved.maxItems}件以下にしてください。`);
    if (item) value.forEach((child, index) => {
      if (child === undefined) errors.push(`${path}.${index}の値を入力してください。`);
      else errors.push(...formatValidation(item, child, `${path}.${index}`, root, project, referenceKinds, depth + 1, value, versionId));
    });
    return errors;
  }
  if (typeof resolved.type === 'string' && !simpleTypeMatches(resolved.type, value)) return [`${path}の型が一致しません。`];
  if (resolved.type === 'string' && typeof value === 'string') {
    if (typeof resolved.minLength === 'number' && value.length < resolved.minLength) return [`${path}を入力してください。`];
    if (typeof resolved.pattern === 'string' && !(new RegExp(resolved.pattern).test(value))) return [`${path}の形式を確認してください。`];
  }
  if ((resolved.type === 'integer' || resolved.type === 'number') && typeof value === 'number') {
    if (resolved.type === 'integer' && !Number.isSafeInteger(value)) return [`${path}は安全な整数を入力してください。`];
    if (!Number.isFinite(value)) return [`${path}は有限の数値を入力してください。`];
    if (typeof resolved.minimum === 'number' && value < resolved.minimum) return [`${path}は${resolved.minimum}以上にしてください。`];
    if (typeof resolved.maximum === 'number' && value > resolved.maximum) return [`${path}は${resolved.maximum}以下にしてください。`];
  }
  return [];
}

function TextValue({ value, schema, label, path, onChange, onValidity, root }: {
  value: unknown; schema: JsonSchemaNode; label: string; path: string; onChange: (value: unknown) => void; onValidity: (path: string, valid: boolean) => void; root: JsonSchemaNode;
}) {
  useValidityCleanup(path, onValidity);
  const [draft, setDraft] = useState(typeof value === 'string' ? value : '');
  const [error, setError] = useState('');
  const ref = refName(schema), format = schemaString(resolveSchema(schema, root), 'format'), pattern = schemaString(resolveSchema(schema, root), 'pattern');
  const isTick = ref === 'Tick';
  const validate = (next: string) => {
    if (isTick) return validateTickDraft(next);
    if (format === 'date' && next && !/^\d{4}-\d{2}-\d{2}$/.test(next)) return '日付をYYYY-MM-DD形式で入力してください。';
    if (pattern && next && !(new RegExp(pattern).test(next))) return '入力形式を確認してください。';
    const min = resolveSchema(schema, root).minLength;
    if (typeof min === 'number' && next.length < min) return `1文字以上で入力してください。`;
    return undefined;
  };
  useEffect(() => {
    const next = typeof value === 'string' ? value : '';
    const issue = validate(next);
    setDraft(next); setError(issue ?? ''); onValidity(path, !issue);
  }, [value, path, isTick, format, pattern, onValidity]);
  return <div className="sd-control">
    <label htmlFor={pathId(path)}>{label}</label>
    <input id={pathId(path)} type={format === 'date' ? 'date' : 'text'} inputMode={isTick ? 'numeric' : undefined} value={draft} onChange={event => {
      const next = event.target.value, issue = validate(next);
      setDraft(next); setError(issue ?? ''); onValidity(path, !issue);
      onChange(next);
    }} onBlur={() => {
      const issue = validate(draft); setError(issue ?? ''); onValidity(path, !issue);
    }}/>
    {error && <span className="field-error" role="alert">{error}</span>}
    {isTick && <span className="field-hint">0または符号付き整数を文字列のまま保存します。</span>}
  </div>;
}

function NumberValue({ value, schema, label, path, onChange, onValidity, root }: {
  value: unknown; schema: JsonSchemaNode; label: string; path: string; onChange: (value: unknown) => void; onValidity: (path: string, valid: boolean) => void; root: JsonSchemaNode;
}) {
  useValidityCleanup(path, onValidity);
  const numericDrafts = useContext(NumberDraftContext);
  const retainedRaw = numericDrafts.drafts[path];
  const resolved = resolveSchema(schema, root), integer = resolved.type === 'integer';
  const [draft, setDraft] = useState(retainedRaw ?? (typeof value === 'number' ? String(value) : ''));
  const editing = useRef(false), lastInput = useRef(value);
  const [error, setError] = useState('');
  const minimum = typeof resolved.minimum === 'number' ? resolved.minimum : undefined;
  const maximum = typeof resolved.maximum === 'number' ? resolved.maximum : undefined;
  useEffect(() => {
    const next = retainedRaw ?? (typeof value === 'number' ? String(value) : '');
    const issue = validateNumericDraft(next, integer, minimum, maximum);
    if (retainedRaw !== undefined || !editing.current || value !== lastInput.current) setDraft(next);
    setError(issue ?? ''); onValidity(path, !issue); lastInput.current = value;
  }, [value, retainedRaw, integer, minimum, maximum, path, onValidity]);
  return <div className="sd-control">
    <label htmlFor={pathId(path)}>{label}</label>
    <input id={pathId(path)} type="text" inputMode={integer ? 'numeric' : 'decimal'} value={draft} onFocus={() => { editing.current = true; }} onChange={event => {
      const next = event.target.value, issue = validateNumericDraft(next, integer, minimum, maximum);
      setDraft(next); setError(issue ?? ''); onValidity(path, !issue);
      numericDrafts.update(path, issue ? next : undefined);
      if (!issue) { const number = Number(next); lastInput.current = number; onChange(number); }
    }} onBlur={() => {
      editing.current = false;
      const issue = validateNumericDraft(draft, integer, minimum, maximum); setError(issue ?? ''); onValidity(path, !issue);
      numericDrafts.update(path, issue ? draft : undefined);
      if (!issue) { const number = Number(draft); lastInput.current = number; setDraft(String(number)); onChange(number); }
    }}/>
    {error && <span className="field-error" role="alert">{error}</span>}
  </div>;
}

function ReferenceValue({ value, label, path, project, kinds, scope = 'entity', onChange, onValidity }: {
  value: unknown; label: string; path: string; project: ProjectData; kinds?: readonly EntityKind[]; scope?: ReferenceScope; onChange: (value: unknown) => void; onValidity: (path: string, valid: boolean) => void;
}) {
  useValidityCleanup(path, onValidity);
  const versionId = useContext(ReferenceVersionContext);
  const id = typeof value === 'string' ? value : '';
  const target = referenceProject(project, scope === 'snapshot' ? undefined : versionId)?.entities.find(entity => entity.id === id);
  const issue = id ? referenceIssue(id, project, kinds, scope, versionId) : '対象を選んでください。';
  useEffect(() => { onValidity(path, !issue); }, [path, issue]);
  const choices = referenceChoices(project, scope, kinds, { versionId });
  const hasOption = choices.some(entity => entity.id === id);
  return <div className="sd-control">
    <label htmlFor={pathId(path)}>{label}</label>
    <select id={pathId(path)} value={id} onChange={event => { onChange(event.target.value); onValidity(path, !!event.target.value); }}>
      <option value="">対象を選択</option>
      {id && !hasOption && <option value={id}>{target ? `${target.deletedAt ? 'アーカイブ済みの保存された参照' : '種類が一致しない対象'} · ${target.name} · ${KIND_LABELS[target.kind]}` : `見つからない参照 · ${id}`}</option>}
      {choices.map(choice => <option value={choice.id} key={choice.id}>{choice.label} · {choice.id.slice(-6)}</option>)}
    </select>
    {issue && id && <span className="field-error" role="alert">{issue}</span>}
    {kinds?.length ? <span className="field-hint">{kinds.map(kind => KIND_LABELS[kind]).join('・')}から選択します。</span> : null}
    {versionId && versionId !== project.projectId && scope !== 'snapshot' && <span className="field-hint">参照先の固定版から選択しています。</span>}
  </div>;
}

function CalendarValue({ value, label, path, project, onChange }: { value: unknown; label: string; path: string; project: ProjectData; onChange: (value: unknown) => void }) {
  const versionId = useContext(ReferenceVersionContext);
  return <div className="sd-control"><label htmlFor={pathId(path)}>{label}</label><select id={pathId(path)} value={typeof value === 'string' ? value : ''} onChange={event => onChange(event.target.value)}><option value="">暦を選択</option>{referenceChoices(project, 'calendar', undefined, { versionId }).map(calendar => <option key={calendar.id} value={calendar.id}>{calendar.label} · {calendar.id}</option>)}</select></div>;
}

function BooleanValue({ value, label, path, onChange }: { value: unknown; label: string; path: string; onChange: (value: unknown) => void }) {
  return <label className="check-label sd-check"><input id={pathId(path)} type="checkbox" checked={value === true} onChange={event => onChange(event.target.checked)}/>{label}</label>;
}

function EnumValue({ value, schema, label, path, onChange, root }: { value: unknown; schema: JsonSchemaNode; label: string; path: string; onChange: (value: unknown) => void; root: JsonSchemaNode }) {
  const options = schemaArray(schema, 'enum');
  return <div className="sd-control"><label htmlFor={pathId(path)}>{label}</label><select id={pathId(path)} value={value === undefined ? '' : JSON.stringify(value)} onChange={event => {
    if (!event.target.value) return;
    try { onChange(JSON.parse(event.target.value)); } catch { onChange(event.target.value); }
  }}>
    <option value="">選択してください</option>
    {options.map((option, index) => <option key={`${String(option)}-${index}`} value={JSON.stringify(option)}>{enumLabel(option, path.split('.').at(-1) ?? '')}</option>)}
  </select>
  </div>;
}

function PropertyField({ schema, value, exists, required, label, path, parentValue, onChange, root, project, referenceKinds, onValidity, maxVisibleItems }: {
  schema: JsonSchemaNode; value: unknown; exists: boolean; required: boolean; label: string; path: string; parentValue: unknown;
  onChange: (value: unknown, exists?: boolean) => void; root: JsonSchemaNode; project: ProjectData; referenceKinds: ReferenceKinds; onValidity: (path: string, valid: boolean) => void; maxVisibleItems: number;
}) {
  const numericDrafts = useContext(NumberDraftContext);
  const nullable = nullableBranches(schema);
  const valueState = !exists ? 'unset' : value === null ? 'null' : 'value';
  const schemaWithoutNull = nullable.valueSchema;
  const choices = nullable.branches;
  const needsStateSelect = !required || nullable.nullable;
  const canSetValue = nullable.nullable ? schemaWithoutNull : schema;
  const chooseState = (state: string) => {
    if (state === 'unset') { numericDrafts.clear(path); onChange(undefined, false); onValidity(path, true); }
    else if (state === 'null') { numericDrafts.clear(path); onChange(null, true); onValidity(path, true); }
    else if (state === 'value') onChange(schemaDefault(canSetValue, root, 0, false), true);
  };
  const activeSchema = value === null ? undefined : (nullable.nullable ? schemaWithoutNull : schema);
  const child = valueState === 'value' && activeSchema ? <SchemaValue
    schema={activeSchema}
    value={value}
    label={label}
    path={path}
    parentValue={parentValue}
    onChange={next => onChange(next, true)}
    root={root}
    project={project}
    referenceKinds={referenceKinds}
    onValidity={onValidity}
    maxVisibleItems={maxVisibleItems}
  /> : null;
  return <div className={`sd-property ${required ? 'required' : 'optional'}`}>
    {needsStateSelect && <div className="sd-presence">
      <label htmlFor={pathId(`${path}-presence`)}>{label}{required ? ' · 必須' : ''}</label>
      <select id={pathId(`${path}-presence`)} value={required && valueState === 'unset' ? '' : valueState} onChange={event => chooseState(event.target.value)}>
        {required && valueState === 'unset' && <option value="" disabled>必須項目です</option>}
        {!required && <option value="unset">設定しない</option>}
        {nullable.nullable && <option value="null">明示的な未設定</option>}
        <option value="value">値を設定</option>
      </select>
    </div>}
    {!needsStateSelect && <span className="sd-property-label">{label} · 必須</span>}
    {valueState === 'value' ? child : valueState === 'null' ? <span className="field-hint">明示的な未設定を保存します。</span> : required ? <button type="button" className="button secondary small" onClick={() => onChange(schemaDefault(canSetValue, root, 0, false), true)}>必須項目の入力を始める</button> : <span className="field-hint">この項目は保存されません。</span>}
  </div>;
}

function ObjectValue({ schema, value, label, path, onChange, root, project, referenceKinds, onValidity, maxVisibleItems }: {
  schema: JsonSchemaNode; value: unknown; label: string; path: string; onChange: (value: unknown) => void; root: JsonSchemaNode; project: ProjectData; referenceKinds: ReferenceKinds; onValidity: (path: string, valid: boolean) => void; maxVisibleItems: number;
}) {
  const numericDrafts = useContext(NumberDraftContext);
  const objectValue = isRecord(value) ? value : {};
  const properties = schemaProperties(schema), required = requiredProperties(schema);
  const recordSchema = asSchema(schema.additionalProperties);
  const isRecordOnly = !Object.keys(properties).length && !!recordSchema;
  const extras = recordSchema ? [] : Object.keys(objectValue).filter(key => !Object.hasOwn(properties, key));
  const update = (key: string, next: unknown, exists = true) => {
    const copy = { ...objectValue };
    if (!exists) { delete copy[key]; numericDrafts.clear(`${path}.${key}`); onValidity(`${path}.${key}`, true); } else copy[key] = next;
    onChange(copy);
  };
  return <div className={`sd-object ${isRecordOnly ? 'sd-record' : ''}`}>
    {!isRecordOnly && <div className="sd-section-heading"><strong>{label}</strong><span>{Object.keys(properties).length}個の項目</span></div>}
    {Object.entries(properties).map(([key, childSchema]) => <PropertyField
      key={key} schema={childSchema} value={objectValue[key]} exists={Object.hasOwn(objectValue, key)} required={required.has(key)}
      label={propertyLabel(key)} path={`${path}.${key}`} parentValue={objectValue} onChange={(next, exists) => update(key, next, exists !== false)}
      root={root} project={project} referenceKinds={referenceKinds} onValidity={onValidity} maxVisibleItems={maxVisibleItems}
    />)}
    {recordSchema && <RecordValue schema={schema} entries={objectValue} path={path} onChange={onChange} root={root} project={project} referenceKinds={referenceKinds} onValidity={onValidity} maxVisibleItems={maxVisibleItems}/>}
    {extras.length > 0 && <details className="sd-unknown" open>
      <summary>スキーマにない項目（{extras.length}件、保持中）</summary>
      <p className="field-hint">この項目はスキーマにありません。削除を選ぶまで値を保持します。</p>
      {extras.map(key => <div className="sd-unknown-row" key={key}>
        <div className="sd-control"><label>{propertyLabel(key)}</label><SchemaValue schema={inferSchema(objectValue[key])} value={objectValue[key]} label={propertyLabel(key)} path={`${path}.${key}`} parentValue={objectValue} onChange={next => update(key, next)} root={root} project={project} referenceKinds={referenceKinds} onValidity={onValidity} maxVisibleItems={maxVisibleItems}/></div>
        <button type="button" className="button subtle small" onClick={() => update(key, undefined, false)}>この項目を削除</button>
      </div>)}
    </details>}
    {isRecordOnly && <p className="field-hint">{Object.keys(objectValue).length}件を保持しています。キーと値を個別に編集できます。</p>}
  </div>;
}

function RecordKeyInput({ entryKey, entries, label, path, propertyNames, project, root, referenceKinds, onRename, onValidity }: {
  entryKey: string; entries: Record<string, unknown>; label: string; path: string; propertyNames?: JsonSchemaNode; project: ProjectData; root: JsonSchemaNode; referenceKinds: ReferenceKinds; onRename: (next: string) => void; onValidity: (path: string, valid: boolean) => void;
}) {
  const numericDrafts = useContext(NumberDraftContext), versionId = useContext(ReferenceVersionContext);
  const inputPath = `${recordEntryPath(path, entryKey)}.$keyInput`, retainedRaw = numericDrafts.drafts[inputPath];
  useValidityCleanup(inputPath, onValidity);
  const [draft, setDraft] = useState(retainedRaw ?? entryKey);
  const issueFor = (next: string) => next !== entryKey && Object.hasOwn(entries, next) ? '同じキーがすでにあります。入力は保持しています。'
    : propertyNames ? formatValidation(propertyNames, next, inputPath, root, project, referenceKinds, 0, entries, versionId).at(0) : undefined;
  const issue = issueFor(retainedRaw ?? draft);
  useEffect(() => { setDraft(retainedRaw ?? entryKey); }, [entryKey, retainedRaw]);
  useEffect(() => { onValidity(inputPath, !issue); }, [inputPath, issue, onValidity]);
  return <div className="sd-control"><input aria-label={label} value={draft} onChange={event => {
    const next = event.target.value, error = issueFor(next);
    setDraft(next); onValidity(inputPath, !error); numericDrafts.update(inputPath, error ? next : undefined);
    if (!error) onRename(next);
  }}/>{issue && <span className="field-error" role="alert">{issue}</span>}</div>;
}

function RecordValue({ schema, entries, path, onChange, root, project, referenceKinds, onValidity, maxVisibleItems }: {
  schema: JsonSchemaNode; entries: Record<string, unknown>; path: string; onChange: (value: unknown) => void; root: JsonSchemaNode; project: ProjectData; referenceKinds: ReferenceKinds; onValidity: (path: string, valid: boolean) => void; maxVisibleItems: number;
}) {
  useValidityCleanup(`${path}.$newKey`, onValidity);
  const numericDrafts = useContext(NumberDraftContext);
  const versionId = useContext(ReferenceVersionContext);
  const [newKey, setNewKey] = useState('');
  const rowIds = useRef(new Map<string, string>());
  const rowId = (key: string) => { let id = rowIds.current.get(key); if (!id) { id = newId(); rowIds.current.set(key, id); } return id; };
  const additional = asSchema(schema.additionalProperties) ?? { type: 'string' };
  const propertyNames = asSchema(schema.propertyNames);
  const entriesList = Object.entries(entries);
  const visible = entriesList.slice(0, maxVisibleItems);
  const keyError = newKey && Object.hasOwn(entries, newKey) ? '同じキーがすでにあります。' : '';
  const keyChoices = propertyNames && (refName(propertyNames) === 'ID' || schemaReferenceScope(propertyNames))
    ? referenceChoices(project, schemaReferenceScope(propertyNames) ?? 'entity', getReferenceKinds(path, undefined, referenceKinds, entries, propertyNames), { versionId }).filter(choice => !Object.hasOwn(entries, choice.id)) : undefined;
  const add = () => {
    if (!newKey || keyError) return;
    const issue = propertyNames ? validateNestedValue(propertyNames, newKey, root) || formatValidation(propertyNames, newKey, `${path}.$newKey`, root, project, referenceKinds, 0, entries, versionId).at(0) : undefined;
    if (issue) { onValidity(`${path}.$newKey`, false); return; }
    onChange({ ...entries, [newKey]: schemaDefault(additional, root, 0, false) });
    onValidity(`${path}.$newKey`, true); setNewKey('');
  };
  const rename = (oldKey: string, nextKey: string) => {
    if (nextKey === oldKey || Object.hasOwn(entries, nextKey)) return;
    rowIds.current.set(nextKey, rowId(oldKey)); rowIds.current.delete(oldKey);
    numericDrafts.rename(recordEntryPath(path, oldKey), recordEntryPath(path, nextKey)); onValidity(recordEntryPath(path, oldKey), true);
    // Keep the row in the same place, as well as keeping its mounted controls.
    onChange(Object.fromEntries(Object.entries(entries).map(([key, value]) => [key === oldKey ? nextKey : key, value])));
  };
  return <div className="sd-record-rows">
    {visible.map(([key, value], index) => <div className="sd-record-row" key={rowId(key)}>
      {propertyNames && refName(propertyNames) === 'ID' ? <ReferenceValue value={key} label={`項目${index + 1}のキー`} path={`${recordEntryPath(path, key)}.$key`} project={project} scope={schemaReferenceScope(propertyNames)} kinds={getReferenceKinds(path, key, referenceKinds, entries, propertyNames)} onChange={next => rename(key, String(next))} onValidity={onValidity}/> : <RecordKeyInput entryKey={key} entries={entries} label={`項目${index + 1}のキー`} path={path} propertyNames={propertyNames} project={project} root={root} referenceKinds={referenceKinds} onRename={next => rename(key, next)} onValidity={onValidity}/>}
      <PropertyField schema={additional} value={value} exists required label={`項目${index + 1}の値`} path={recordEntryPath(path, key)} parentValue={entries} onChange={(next, exists) => {
        if (exists === false || next === undefined) { const copy = { ...entries }; delete copy[key]; rowIds.current.delete(key); numericDrafts.clear(recordEntryPath(path, key)); onChange(copy); onValidity(recordEntryPath(path, key), true); }
        else onChange({ ...entries, [key]: next });
      }} root={root} project={project} referenceKinds={referenceKinds} onValidity={onValidity} maxVisibleItems={maxVisibleItems}/>
      <button type="button" className="button subtle small" aria-label={`項目${index + 1}を削除`} onClick={() => { const copy = { ...entries }; delete copy[key]; rowIds.current.delete(key); numericDrafts.clear(recordEntryPath(path, key)); onValidity(recordEntryPath(path, key), true); onChange(copy); }}>削除</button>
    </div>)}
    {entriesList.length > maxVisibleItems && <p className="field-hint">件数が多いため、最初の{maxVisibleItems}件のみ表示しています。絞り込みまたは分割して編集してください。</p>}
    <div className="sd-add-row">{keyChoices ? <select aria-label="新しいキー" value={newKey} onChange={event => { setNewKey(event.target.value); onValidity(`${path}.$newKey`, true); }}><option value="">対象を選択</option>{keyChoices.map(choice => <option key={choice.id} value={choice.id}>{choice.label} · {choice.id.slice(-6)}</option>)}</select> : <input aria-label="新しいキー" value={newKey} onChange={event => { setNewKey(event.target.value); onValidity(`${path}.$newKey`, true); }} placeholder="新しいキー"/>}<button type="button" className="button secondary small" onClick={add} disabled={!newKey || !!keyError}>項目を追加</button></div>
    {keyError && <span className="field-error" role="alert">{keyError}</span>}
  </div>;
}

function ArrayValue({ schema, value, label, path, onChange, root, project, referenceKinds, onValidity, maxVisibleItems }: {
  schema: JsonSchemaNode; value: unknown; label: string; path: string; onChange: (value: unknown) => void; root: JsonSchemaNode; project: ProjectData; referenceKinds: ReferenceKinds; onValidity: (path: string, valid: boolean) => void; maxVisibleItems: number;
}) {
  const numericDrafts = useContext(NumberDraftContext);
  const [page, setPage] = useState(0);
  const items = Array.isArray(value) ? value : [];
  const start = page * maxVisibleItems, visible = items.slice(start, start + maxVisibleItems);
  const itemSchema = asSchema(schema.items) ?? { type: 'string' };
  const maximum = typeof schema.maxItems === 'number' ? schema.maxItems : 100_000;
  const canAdd = items.length < maximum;
  const update = (index: number, next: unknown) => onChange(items.map((item, itemIndex) => itemIndex === index ? next : item));
  const remove = (index: number) => {
    numericDrafts.reindex(path, current => current === index ? undefined : current > index ? current - 1 : current);
    onValidity(path, true); onChange(removeArrayItem(items, index));
    if (start >= items.length - 1) setPage(Math.max(0, page - 1));
  };
  const move = (index: number, delta: -1 | 1) => {
    const target = index + delta;
    numericDrafts.reindex(path, current => current === index ? target : current === target ? index : current);
    onValidity(path, true); onChange(moveArrayItem(items, index, delta));
  };
  return <div className="sd-array">
    <div className="sd-section-heading"><strong>{label}</strong><span>{items.length}件</span></div>
    {items.length > maxVisibleItems && <div className="sd-array-pages"><button type="button" className="text-button" disabled={page === 0} onClick={() => setPage(Math.max(0, page - 1))}>前の{maxVisibleItems}件</button><span>{start + 1}〜{Math.min(start + maxVisibleItems, items.length)}件</span><button type="button" className="text-button" disabled={start + maxVisibleItems >= items.length} onClick={() => setPage(page + 1)}>次の{maxVisibleItems}件</button></div>}
    {visible.map((item, localIndex) => {
      const index = start + localIndex;
      return <div className="sd-array-item" key={`${path}.${index}`}>
        <PropertyField schema={itemSchema} value={item} exists required label={`${label} ${index + 1}`} path={`${path}.${index}`} parentValue={items} onChange={next => {
          if (next === undefined) remove(index); else update(index, next);
        }} root={root} project={project} referenceKinds={referenceKinds} onValidity={onValidity} maxVisibleItems={maxVisibleItems}/>
        <div className="sd-array-controls">
          <button type="button" className="icon-button small" aria-label={`${label} ${index + 1}を前へ`} disabled={index === 0} onClick={() => move(index, -1)}>↑</button>
          <button type="button" className="icon-button small" aria-label={`${label} ${index + 1}を後へ`} disabled={index === items.length - 1} onClick={() => move(index, 1)}>↓</button>
          <button type="button" className="button subtle small" aria-label={`${label} ${index + 1}を削除`} onClick={() => remove(index)}>削除</button>
        </div>
      </div>;
    })}
    <button type="button" className="button secondary small" disabled={!canAdd} onClick={() => { onChange(insertArrayItem(items, items.length, schemaDefault(itemSchema, root, 0, false))); setPage(Math.floor(items.length / maxVisibleItems)); }}>項目を追加</button>
    {!canAdd && <span className="field-hint">この一覧には最大{maximum}件まで追加できます。</span>}
  </div>;
}

function TypeArrayValue({ schema, value, label, path, onChange, root, project, referenceKinds, onValidity, maxVisibleItems }: {
  schema: JsonSchemaNode; value: unknown; label: string; path: string; onChange: (value: unknown) => void; root: JsonSchemaNode; project: ProjectData; referenceKinds: ReferenceKinds; onValidity: (path: string, valid: boolean) => void; maxVisibleItems: number;
}) {
  const numericDrafts = useContext(NumberDraftContext);
  const types = schemaArray(resolveSchema(schema, root), 'type').filter((type): type is string => typeof type === 'string');
  const selected = types.find(type => simpleTypeMatches(type, value)) ?? types[0];
  const [pending, setPending] = useState<{ type: string; nextValue: unknown }>();
  const nextValue = (type: string) => schemaDefault({ type }, root, 0, false);
  return <div className="sd-union">
    <div className="sd-control"><label htmlFor={pathId(`${path}-type`)}>{label}の種類</label><select id={pathId(`${path}-type`)} value={selected ?? ''} onChange={event => setPending({ type: event.target.value, nextValue: nextValue(event.target.value) })}>{types.map(type => <option value={type} key={type}>{ENUM_LABELS[type] ?? type}</option>)}</select></div>
    {pending && <SwitchPreview current={value} next={pending.nextValue} label={`${label}の種類`} nextLabel={ENUM_LABELS[pending.type] ?? pending.type} changes={[{ kind: 'replace', key: 'value', current: value, next: pending.nextValue }]} onCancel={() => setPending(undefined)} onConfirm={() => { numericDrafts.clear(path); onChange(pending.nextValue); onValidity(path, true); setPending(undefined); }}/ >}
    <div hidden={!!pending}><SchemaValue schema={{ type: selected }} value={value} label={label} path={path} parentValue={undefined} onChange={onChange} root={root} project={project} referenceKinds={referenceKinds} onValidity={onValidity} maxVisibleItems={maxVisibleItems}/ ></div>
  </div>;
}

function SwitchPreview({ current, next, label, nextLabel, changes, onCancel, onConfirm }: {
  current: unknown; next: unknown; label: string; nextLabel: string; changes: PreviewChange[]; onCancel: () => void; onConfirm: () => void;
}) {
  return <div className="sd-switch-preview" role="group" aria-label={`${label}の切替確認`}>
    <strong>切替内容を確認</strong>
    <p>現在の種類「{scalarPreview(current)}」から「{nextLabel}」へ切り替えます。</p>
    {!changes.length ? <p>入力済みの項目をそのまま保てます。</p> : <ul>{changes.map((change, index) => <li key={`${change.kind}-${change.key}-${index}`}>
      {change.kind === 'remove' ? `${propertyLabel(change.key)}を削除します（現在：${scalarPreview(change.current)}）。` : change.kind === 'replace' ? `${propertyLabel(change.key)}を置き換えます（現在：${scalarPreview(change.current)}、切替後：${scalarPreview(change.next)}）。` : `${propertyLabel(change.key)}を新しく追加します（初期値：${scalarPreview(change.next)}）。`}
    </li>)}</ul>}
    <div className="reference-controls"><button type="button" className="button primary small" onClick={onConfirm}>内容を確認して切り替える</button><button type="button" className="button secondary small" onClick={onCancel}>切替を取り消す</button></div>
  </div>;
}

function UnionValue({ schema, value, label, path, onChange, root, project, referenceKinds, onValidity, maxVisibleItems }: {
  schema: JsonSchemaNode; value: unknown; label: string; path: string; onChange: (value: unknown) => void; root: JsonSchemaNode; project: ProjectData; referenceKinds: ReferenceKinds; onValidity: (path: string, valid: boolean) => void; maxVisibleItems: number;
}) {
  const numericDrafts = useContext(NumberDraftContext);
  const unionKey = Array.isArray(schema.oneOf) ? 'oneOf' : 'anyOf';
  const branches = schemaArray(schema, unionKey).flatMap(branch => asSchema(branch) ? [asSchema(branch)!] : []).filter(branch => branch.type !== 'null');
  const selected = currentVariantIndex(branches, value, root);
  const [pending, setPending] = useState<{ index: number; plan: VariantSwitchPlan }>();
  const branch = branches[selected];
  const planSwitch = (index: number) => {
    const plan = planVariantSwitch(schema, value, index, root);
    if (plan) setPending({ index, plan });
  };
  return <div className="sd-union">
    <div className="sd-control"><label htmlFor={pathId(`${path}-variant`)}>{label}の種類</label><select id={pathId(`${path}-variant`)} value={selected} onChange={event => planSwitch(Number(event.target.value))}>{branches.map((option, index) => <option key={index} value={index}>{variantLabel(option, root, index)}</option>)}</select></div>
    {pending && <SwitchPreview current={value} next={pending.plan.value} label={label} nextLabel={pending.plan.nextLabel} changes={pending.plan.changes} onCancel={() => setPending(undefined)} onConfirm={() => { numericDrafts.clear(path); onChange(pending.plan.value); onValidity(path, true); setPending(undefined); }}/ >}
    {branch && <div hidden={!!pending}><SchemaValue schema={branch} value={value} label={label} path={path} parentValue={undefined} onChange={onChange} root={root} project={project} referenceKinds={referenceKinds} onValidity={onValidity} maxVisibleItems={maxVisibleItems}/ ></div>}
  </div>;
}

interface SchemaValueProps {
  schema: JsonSchemaNode; value: unknown; label: string; path: string; parentValue: unknown; onChange: (value: unknown) => void; root: JsonSchemaNode; project: ProjectData; referenceKinds: ReferenceKinds; onValidity: (path: string, valid: boolean) => void; maxVisibleItems: number;
}

function SchemaValue(props: SchemaValueProps): ReactNode {
  const inheritedVersion = useContext(ReferenceVersionContext);
  const value = props.value;
  const version = isRecord(value) && typeof value.entityId === 'string' && typeof value.sourceVersionId === 'string' ? value.sourceVersionId : inheritedVersion;
  return <ReferenceVersionContext.Provider value={version}><SchemaContents {...props}/></ReferenceVersionContext.Provider>;
}

function SchemaContents({ schema: rawSchema, value, label, path, parentValue, onChange, root, project, referenceKinds, onValidity, maxVisibleItems }: SchemaValueProps): ReactNode {
  const originalRef = refName(rawSchema), schema = resolveSchema(rawSchema, root);
  const type = schema.type;
  if (path.split('.').filter(part => !/^\d+$/.test(part)).at(-1) === 'calendarId') return <CalendarValue value={value} label={label} path={path} project={project} onChange={onChange}/>;
  if (originalRef === 'Tick') return <TextValue value={value} schema={rawSchema} label={label} path={path} onChange={onChange} onValidity={onValidity} root={root}/>;
  if ((originalRef === 'ID' || schemaReferenceScope(rawSchema)) && isEntityReference(rawSchema, path, parentValue, referenceKinds)) return <ReferenceValue value={value} label={label} path={path} project={project} scope={schemaReferenceScope(rawSchema)} kinds={getReferenceKinds(path, path.split('.').at(-1), referenceKinds, parentValue, rawSchema)} onChange={onChange} onValidity={onValidity}/>;
  if (Array.isArray(schema.anyOf) || Array.isArray(schema.oneOf)) return <UnionValue schema={schema} value={value} label={label} path={path} onChange={onChange} root={root} project={project} referenceKinds={referenceKinds} onValidity={onValidity} maxVisibleItems={maxVisibleItems}/>;
  if (Array.isArray(type)) return <TypeArrayValue schema={schema} value={value} label={label} path={path} onChange={onChange} root={root} project={project} referenceKinds={referenceKinds} onValidity={onValidity} maxVisibleItems={maxVisibleItems}/>;
  if (type === 'object' || schema.additionalProperties) return <ObjectValue schema={schema} value={value} label={label} path={path} onChange={onChange} root={root} project={project} referenceKinds={referenceKinds} onValidity={onValidity} maxVisibleItems={maxVisibleItems}/>;
  if (type === 'array') return <ArrayValue schema={schema} value={value} label={label} path={path} onChange={onChange} root={root} project={project} referenceKinds={referenceKinds} onValidity={onValidity} maxVisibleItems={maxVisibleItems}/>;
  if (Array.isArray(schema.enum)) return <EnumValue value={value} schema={schema} label={label} path={path} onChange={onChange} root={root}/>;
  if (type === 'boolean') return <BooleanValue value={value} label={label} path={path} onChange={onChange}/>;
  if (type === 'integer' || type === 'number') return <NumberValue value={value} schema={schema} label={label} path={path} onChange={onChange} onValidity={onValidity} root={root}/>;
  if (type === 'string') return <TextValue value={value} schema={rawSchema} label={label} path={path} onChange={onChange} onValidity={onValidity} root={root}/>;
  if (type === 'null') return <span className="field-hint">明示的な未設定</span>;
  if (typeof schema.const === 'string' || typeof schema.const === 'number' || typeof schema.const === 'boolean') return <span className="field-hint">{enumLabel(schema.const, path.split('.').at(-1) ?? '')}</span>;
  return <div className="sd-unsupported"><span>{label}の入力形式を確認できません。現在の値は保持されています。</span><button type="button" className="button subtle small" onClick={() => onChange(undefined)}>この値を削除</button></div>;
}

function validateNestedValue(schema: JsonSchemaNode, value: unknown, root: JsonSchemaNode): string | undefined {
  if (schemaShapeMatches(schema, value, root)) return undefined;
  const resolved = resolveSchema(schema, root);
  if (typeof value === 'string' && typeof resolved.pattern === 'string' && !new RegExp(resolved.pattern).test(value)) return 'キーの形式を確認してください。';
  return 'キーの形式が一致しません。';
}

function inferSchema(value: unknown): JsonSchemaNode {
  if (value === null) return { type: 'null' };
  if (Array.isArray(value)) return { type: 'array', items: value.length ? inferSchema(value[0]) : { type: 'string' } };
  if (isRecord(value)) return { type: 'object', properties: Object.fromEntries(Object.entries(value).map(([key, child]) => [key, inferSchema(child)])), required: Object.keys(value), additionalProperties: false };
  if (typeof value === 'boolean') return { type: 'boolean' };
  if (typeof value === 'number') return { type: Number.isInteger(value) ? 'integer' : 'number' };
  return { type: 'string' };
}

export function StructuredDataField({
  value,
  onChange,
  project,
  label,
  entityKind,
  entity,
  fieldKey,
  schema: suppliedSchema,
  schemaRoot: suppliedRoot,
  required,
  referenceKinds = {},
  onValid,
  rawOverride,
  onInvalidRaw,
  maxVisibleItems = 25,
}: StructuredDataFieldProps) {
  const rootSchema = suppliedRoot ?? GENERATED_SCHEMA;
  const versionId = entity?.kind === 'review' && fieldKey === 'target' ? entity.data.targetVersionId
    : entity?.kind === 'checkpoint' && ['runtimeState', 'presentationResults'].includes(fieldKey ?? '') ? entity.data.contentVersionId
    : entity?.kind === 'trace' && ['steps', 'initialExternalValues'].includes(fieldKey ?? '') ? entity.data.contentVersionId
    : entity?.kind === 'projection_profile' && ['includedIds','publicTexts','blockSources','publicIds','publicValues','namePolicy','allowedRelationIds','approvedAttachmentIds'].includes(fieldKey ?? '') ? entity.data.sourceVersionId : undefined;
  const schema = useMemo(() => suppliedSchema ?? (entityKind && fieldKey ? entityDataFieldSchema(entityKind, fieldKey, rootSchema) : undefined), [suppliedSchema, entityKind, fieldKey, rootSchema]);
  const fieldRequired = required ?? (!!entityKind && !!fieldKey && entityDataFieldRequired(entityKind, fieldKey, rootSchema));
  const [numberDrafts, setNumberDrafts] = useState<StructuredNumberDrafts>(() => parseStructuredNumberDrafts(rawOverride));
  const numberDraftsRef = useRef(numberDrafts); numberDraftsRef.current = numberDrafts;
  const invalidRawCallback = useRef(onInvalidRaw); invalidRawCallback.current = onInvalidRaw;
  const retainedRawRef = useRef(rawOverride);
  useEffect(() => {
    if (rawOverride !== retainedRawRef.current) { retainedRawRef.current = rawOverride; setNumberDrafts(parseStructuredNumberDrafts(rawOverride)); }
  }, [rawOverride]);
  const updateDrafts = useCallback((next: StructuredNumberDrafts) => {
    const raw = serializeStructuredNumberDrafts(next);
    if (raw === serializeStructuredNumberDrafts(numberDraftsRef.current)) return;
    numberDraftsRef.current = next; retainedRawRef.current = raw; setNumberDrafts(next);
    invalidRawCallback.current?.(raw);
  }, []);
  const numberDraftContext = useMemo(() => ({
    drafts: numberDrafts,
    update: (path: string, raw: string | undefined) => {
      const next = { ...numberDraftsRef.current }; if (raw === undefined) delete next[path]; else next[path] = raw;
      updateDrafts(next);
    },
    clear: (path: string) => updateDrafts(clearStructuredNumberDrafts(numberDraftsRef.current, path)),
    rename: (path: string, nextPath: string) => updateDrafts(renameStructuredDraftPath(numberDraftsRef.current, path, nextPath)),
    reindex: (path: string, mapIndex: (index: number) => number | undefined) => updateDrafts(reindexStructuredNumberDrafts(numberDraftsRef.current, path, mapIndex)),
  }), [numberDrafts, updateDrafts]);
  const [invalidPaths, setInvalidPaths] = useState<Record<string, boolean>>({});
  const reportValidity = useCallback((path: string, valid: boolean) => setInvalidPaths(current => {
    if (!valid) return current[path] === false ? current : { ...current, [path]: false };
    const next = Object.fromEntries(Object.entries(current).filter(([fieldPath]) => fieldPath !== path && !fieldPath.startsWith(`${path}.`)));
    return Object.keys(next).length === Object.keys(current).length ? current : next;
  }), []);
  const fieldErrors = schema ? formatValidation(schema, value, label, rootSchema, project, referenceKinds, 0, undefined, versionId ?? undefined) : ['構造スキーマがありません。'];
  const valid = !!schema && (!fieldRequired || value !== undefined) && !fieldErrors.length && !Object.keys(numberDrafts).length && Object.values(invalidPaths).every(Boolean);
  useEffect(() => { onValid?.(valid); }, [valid, onValid]);

  return <NumberDraftContext.Provider value={numberDraftContext}><ReferenceVersionContext.Provider value={versionId ?? undefined}><section className="structured-data-field" aria-label={`${label}の構造化入力`}>
    <div className="sd-section-heading"><h3>{label}</h3><span>{fieldRequired ? '必須' : '任意'}の構造化データ</span></div>
    {!schema ? <p className="field-error" role="alert">この項目の構造スキーマを取得できません。既存値は保持されています。</p> : <PropertyField
      schema={schema}
      value={value}
      exists={value !== undefined}
      required={fieldRequired}
      label={label}
      path={fieldKey ?? label}
      parentValue={undefined}
      onChange={(next, exists) => onChange(exists === false ? undefined : next)}
      root={rootSchema}
      project={project}
      referenceKinds={referenceKinds}
      onValidity={reportValidity}
      maxVisibleItems={Math.max(1, Math.min(100, maxVisibleItems))}
    />}
    {schema && fieldErrors.length > 0 && <div className="sd-validation" role="status"><strong>入力を確認してください</strong><ul>{fieldErrors.slice(0, 5).map((issue, index) => <li key={`${issue}-${index}`}>{issue}</li>)}</ul></div>}
  </section></ReferenceVersionContext.Provider></NumberDraftContext.Provider>;
}

export default StructuredDataField;
