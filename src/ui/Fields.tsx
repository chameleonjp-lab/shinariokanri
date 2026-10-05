import { useEffect, useRef, useState, type ReactNode } from 'react';
import type { Comparator, ContentAnchor, Entity, EntityKind, ProjectData, RichText } from '../domain/types';
import { KIND_LABELS, validateCondition } from '../domain/model';
import { referenceChoices } from '../domain/referenceChoices';
import { editRichText, type TextReplacement } from '../domain/text';
import { conditionInputError, defaultComparisonValue, switchComparisonOperator, type ComparisonCondition } from '../domain/conditionDraft';
import { conditionToText } from '../domain/conditions';
import { Icon, fieldText } from './components';
import type { FieldSpec } from './fieldSpecs';
import { StructuredDataField } from './StructuredDataField';
import { TextAnnotations } from './TextAnnotations';
import type { TextLinkReference } from '../domain/linkCandidates';
import { resolveUnresolvedAnnotation } from '../domain/linkCandidates';

export function dataOf(entity: Entity): Record<string, any> { return entity.data as unknown as Record<string, any>; }
export function labelOf(entity?: Entity) { return entity?.name || (entity ? KIND_LABELS[entity.kind] : '未指定'); }

export function JsonField({ value, onChange, onValid, label = 'JSON', rawOverride, onInvalidRaw, validate }: { value: unknown; onChange: (value: unknown) => void; onValid?: (valid: boolean) => void; label?: string; rawOverride?: string; onInvalidRaw?: (raw: string | undefined) => void; validate?: (value: unknown) => string | undefined }) {
  const [raw, setRaw] = useState(() => rawOverride ?? (value === undefined || value === null ? '' : JSON.stringify(value, null, 2)));
  const [error, setError] = useState('');
  useEffect(() => {
    if (rawOverride !== undefined) { setRaw(rawOverride); setError('JSONの括弧・引用符・カンマを確認してください。入力は保持しています。'); onValid?.(false); }
    else { setRaw(value === undefined || value === null ? '' : JSON.stringify(value, null, 2)); setError(''); onValid?.(true); }
  }, [value, rawOverride]);
  return <><textarea className="json-input" aria-label={label} rows={Math.max(3, Math.min(12, raw.split('\n').length))} value={raw} spellCheck={false} onChange={e => {
    const next = e.target.value;
    setRaw(next);
    try { const parsed = next.trim() ? JSON.parse(next) : undefined; const invalid = validate?.(parsed); if (invalid) { setError(invalid); onValid?.(false); onInvalidRaw?.(next); return; } setError(''); onValid?.(true); onInvalidRaw?.(undefined); onChange(parsed); }
    catch { setError('JSONの括弧・引用符・カンマを確認してください。入力は保持しています。'); onValid?.(false); onInvalidRaw?.(next); }
  }}/>{error && <span className="field-error" role="alert">{error}</span>}</>;
}

export function RefSelect({ value, onChange, project, kinds, excludeId, label = '参照先' }: { value: unknown; onChange: (id: string | undefined) => void; project: ProjectData; kinds?: string[]; excludeId?: string; label?: string }) {
  const choices = referenceChoices(project, kinds?.length === 1 && kinds[0] === 'snapshot' ? 'snapshot' : 'entity', kinds as EntityKind[] | undefined).filter(choice => choice.id !== excludeId);
  return <select aria-label={label} value={typeof value === 'string' ? value : ''} onChange={e => onChange(e.target.value || undefined)}><option value="">選択してください</option>{typeof value === 'string' && value && !choices.some(choice => choice.id === value) && <option value={value}>現在の参照を確認 · {value}</option>}{choices.map(choice => <option key={choice.id} value={choice.id}>{choice.label} · {choice.id.slice(-6)}</option>)}</select>;
}

export function RefList({ value, onChange, project, kinds, excludeId }: { value: unknown; onChange: (ids: string[]) => void; project: ProjectData; kinds?: string[]; excludeId?: string }) {
  const ids = Array.isArray(value) ? value as string[] : [];
  return <div className="reference-editor">{ids.length > 0 && <ol className="reference-list">{ids.map((id, index) => <li key={id}><span>{labelOf(project.entities.find(e => e.id === id))}</span><div className="reference-controls"><button type="button" className="icon-button small" aria-label={`${index + 1}番を前へ移動`} disabled={index === 0} onClick={() => { const next = [...ids]; [next[index - 1], next[index]] = [next[index], next[index - 1]]; onChange(next); }}>↑</button><button type="button" className="icon-button small" aria-label={`${index + 1}番を後へ移動`} disabled={index === ids.length - 1} onClick={() => { const next = [...ids]; [next[index + 1], next[index]] = [next[index], next[index + 1]]; onChange(next); }}>↓</button><button type="button" className="icon-button small" aria-label={`${labelOf(project.entities.find(e => e.id === id))}を外す`} onClick={() => onChange(ids.filter(x => x !== id))}><Icon name="close" size={16}/></button></div></li>)}</ol>}<RefSelect project={{ ...project, entities: project.entities.filter(e => !ids.includes(e.id)) }} kinds={kinds} excludeId={excludeId} value="" onChange={id => { if (id) onChange([...ids, id]); }} label="追加する対象"/></div>;
}

export function richTextWithText(value: unknown, nextText: string): RichText {
  return editRichText(Array.isArray(value) ? value as RichText : [], nextText);
}

export function TypedField({ value, onChange, project, preferredType }: { value: unknown; onChange: (value: unknown) => void; project: ProjectData; preferredType?: string }) {
  const current = value && typeof value === 'object' ? value as Record<string, any> : { type: 'unknown', value: null, reason: '' };
  const type: string = current.type || 'unknown';
  const types = preferredType ? [...new Set([preferredType, 'unknown', type])] : ['boolean', 'integer', 'enum', 'text', 'ref', 'unknown'];
  return <div className="typed-editor"><select aria-label="値の型" value={type} onChange={e => { const t = e.target.value; onChange(t === 'unknown' ? { type: t, value: null, reason: '未設定' } : { type: t, value: t === 'boolean' ? false : t === 'integer' ? 0 : '' }); }}>{types.map(t => <option key={t} value={t}>{{ boolean: '真偽', integer: '整数', enum: '列挙', text: '文字列', ref: '参照', unknown: '不明・未設定' }[t] || t}{preferredType && t !== preferredType && t !== 'unknown' ? '（型が一致しません）' : ''}</option>)}</select>{type === 'unknown' ? <input aria-label="未設定の理由" placeholder="未設定の理由" value={current.reason || ''} onChange={e => onChange({ ...current, reason: e.target.value })}/> : type === 'boolean' ? <select aria-label="真偽値" value={String(current.value)} onChange={e => onChange({ type, value: e.target.value === 'true' })}><option value="false">偽（false）</option><option value="true">真（true）</option></select> : type === 'ref' ? <RefSelect value={current.value} project={project} onChange={id => onChange({ type, value: id || '' })}/> : <input aria-label="値" inputMode={type === 'integer' ? 'numeric' : 'text'} type={type === 'integer' ? 'number' : 'text'} value={current.value ?? ''} onChange={e => onChange({ type, value: type === 'integer' ? e.target.value === '' ? undefined : Number(e.target.value) : e.target.value })}/>}</div>;
}

const CONDITION_LABELS: Record<string, string> = { constant: '常に真／偽', all: 'すべて（AND）', any: 'どれか（OR）', not: '否定（NOT）', compare: '状態の比較', item: '物品の所持', known: '人物の知識', visited: '訪問回数', external: '外部値' };
const conditionDefault = (op: string) => op === 'constant' ? { op, value: true } : op === 'all' || op === 'any' ? { op, children: [{ op: 'constant', value: true }] } : op === 'not' ? { op, child: { op: 'constant', value: true } } : op === 'compare' ? { op, variableId: '', comparator: 'eq', value: { type: 'boolean', value: true } } : op === 'item' ? { op, itemId: '', quantity: 1 } : op === 'known' ? { op, assertionId: '', holderId: '' } : op === 'visited' ? { op, entityId: '', count: 1 } : { op, contractId: '' };

export function describeCondition(value: unknown, project: ProjectData): string {
  if (!value || typeof value !== 'object') return '常に真';
  const c = value as Record<string, any>;
  const target = (id: string) => labelOf(project.entities.find(e => e.id === id));
  if (c.op === 'constant') return c.value ? '常に真' : '常に偽';
  if (c.op === 'all' || c.op === 'any') return `（${(c.children || []).map((v: unknown) => describeCondition(v, project)).join(c.op === 'all' ? '、かつ、' : '、または、')}）`;
  if (c.op === 'not') return `（${describeCondition(c.child, project)}）ではない`;
  if (c.op === 'compare') {
    const typedText = (v: any) => v?.type === 'unknown' ? `不明${v.reason ? `（${v.reason}）` : ''}` : v?.type === 'boolean' ? v.value ? '真' : '偽' : String(v?.value ?? '未入力');
    return `${target(c.variableId)} ${ { eq: '＝', ne: '≠', lt: '＜', le: '≦', gt: '＞', ge: '≧', in: '∈' }[c.comparator as string] || c.comparator } ${Array.isArray(c.value) ? `（${c.value.map(typedText).join('、')}）` : typedText(c.value)}`;
  }
  if (c.op === 'item') return `${target(c.itemId)}を${c.quantity}個以上持つ`;
  if (c.op === 'known') return `${target(c.holderId)}が${target(c.assertionId)}を知る`;
  if (c.op === 'visited') return `${target(c.entityId)}に${c.count}回以上訪問`;
  return `外部値：${target(c.contractId)}`;
}

export function ConditionEditor({ value, onChange, project, depth = 0, onValid }: { value: unknown; onChange: (value: unknown) => void; project: ProjectData; depth?: number; onValid?: (valid: boolean) => void }) {
  const c = value && typeof value === 'object' ? value as Record<string, any> : { op: 'constant', value: true };
  const [pendingComparator, setPendingComparator] = useState<Comparator>();
  const [selectedValue, setSelectedValue] = useState(0);
  const error = !depth ? conditionInputError(c, project) : undefined;
  useEffect(() => { if (!depth) onValid?.(!error); }, [error, depth]);
  const variable = project.entities.find((entity): entity is Entity<'variable'> => entity.kind === 'variable' && entity.id === c.variableId);
  const values = Array.isArray(c.value) ? c.value : [c.value];
  const update = (key: string, val: unknown) => onChange({ ...c, [key]: val });
  return <div className={`condition-editor ${depth ? 'condition-child' : ''}`}><div className="condition-top"><select aria-label="条件の種類" value={c.op} onChange={e => onChange(conditionDefault(e.target.value))}>{Object.entries(CONDITION_LABELS).map(([op, label]) => <option key={op} value={op} disabled={depth >= 15 && ['all', 'any', 'not'].includes(op)}>{label}</option>)}</select>{c.op === 'constant' && <select aria-label="条件の真偽" value={String(c.value)} onChange={e => update('value', e.target.value === 'true')}><option value="true">真</option><option value="false">偽</option></select>}</div>
    {(c.op === 'all' || c.op === 'any') && <div className="condition-children">{(c.children || []).map((child: unknown, i: number) => <div key={i} className="condition-row"><ConditionEditor project={project} depth={depth + 1} value={child} onChange={next => update('children', c.children.map((v: unknown, j: number) => i === j ? next : v))}/><button type="button" className="icon-button small" aria-label={`条件${i + 1}を削除`} disabled={c.children.length <= 1} onClick={() => update('children', c.children.filter((_: unknown, j: number) => i !== j))}><Icon name="close" size={16}/></button></div>)}<button type="button" className="text-button" onClick={() => update('children', [...c.children, { op: 'constant', value: true }])}><Icon name="plus" size={16}/>条件を追加</button></div>}
    {c.op === 'not' && <ConditionEditor project={project} depth={depth + 1} value={c.child} onChange={next => update('child', next)}/>}
    {c.op === 'compare' && <div className="condition-parts"><RefSelect project={project} kinds={['variable']} value={c.variableId} label="比較する状態" onChange={id => {
      const nextVariable = project.entities.find((entity): entity is Entity<'variable'> => entity.kind === 'variable' && entity.id === id);
      const nextValue = c.variableId ? c.value : defaultComparisonValue(nextVariable);
      onChange({ ...c, variableId: id || '', value: c.comparator === 'in' && !Array.isArray(nextValue) ? [nextValue] : nextValue });
    }}/><select aria-label="比較演算" value={c.comparator} onChange={e => {
      const comparator = e.target.value as Comparator, next = switchComparisonOperator(c as ComparisonCondition, comparator);
      if (next) { setPendingComparator(undefined); onChange(next); }
      else { setSelectedValue(0); setPendingComparator(comparator); }
    }}>{[['eq', '等しい'], ['ne', '等しくない'], ['lt', 'より小さい'], ['le', '以下'], ['gt', 'より大きい'], ['ge', '以上'], ['in', '含まれる']].map(([v, l]) => <option key={v} value={v} disabled={['lt', 'le', 'gt', 'ge'].includes(v) && variable?.data.valueType !== 'integer' && c.comparator !== v}>{l}</option>)}</select>
      {c.comparator === 'in' ? <div className="condition-values" role="group" aria-label="含まれる値">{values.map((v: unknown, i: number) => <div className="condition-row" key={i}><div role="group" aria-label={`比較値${i + 1}`}><TypedField project={project} value={v} onChange={next => update('value', values.map((item: unknown, j: number) => i === j ? next : item))} preferredType={variable?.data.valueType}/></div><button type="button" className="icon-button small" aria-label={`比較値${i + 1}を削除`} onClick={() => update('value', values.filter((_: unknown, j: number) => i !== j))}><Icon name="close" size={16}/></button></div>)}<button type="button" className="text-button" disabled={values.length >= 256} onClick={() => update('value', [...values, defaultComparisonValue(variable)])}><Icon name="plus" size={16}/>比較値を追加</button></div> : <TypedField project={project} value={c.value} onChange={v => update('value', v)} preferredType={variable?.data.valueType}/>}
      {pendingComparator && <div className="field-hint" role="group" aria-label="演算切替の確認"><p>単値比較に残す値を選んでください。ほかの値は条件から外れます。</p><select aria-label="単値比較に残す値" value={selectedValue} onChange={e => setSelectedValue(Number(e.target.value))}>{values.map((v: any, i: number) => <option value={i} key={i}>{i + 1}: {v?.type === 'unknown' ? '不明' : String(v?.value ?? '未入力')}</option>)}</select><button type="button" className="text-button" disabled={!values.length} onClick={() => { const next = switchComparisonOperator(c as ComparisonCondition, pendingComparator, selectedValue); if (next) onChange(next); setPendingComparator(undefined); }}>選んだ値で単値比較に変更</button><button type="button" className="text-button" onClick={() => setPendingComparator(undefined)}>演算切替を取消</button></div>}
    </div>}
    {c.op === 'item' && <><RefSelect project={project} kinds={['item']} value={c.itemId} onChange={id => update('itemId', id || '')}/><input aria-label="必要な個数" type="number" min="1" value={c.quantity ?? 1} onChange={e => update('quantity', Number(e.target.value))}/></>}
    {c.op === 'known' && <><RefSelect project={project} kinds={['assertion']} value={c.assertionId} label="知識" onChange={id => update('assertionId', id || '')}/><RefSelect project={project} kinds={['character']} value={c.holderId} label="知識を持つ人物" onChange={id => update('holderId', id || '')}/></>}
    {c.op === 'visited' && <><RefSelect project={project} value={c.entityId} onChange={id => update('entityId', id || '')}/><input aria-label="訪問回数" type="number" min="1" value={c.count ?? 1} onChange={e => update('count', Number(e.target.value))}/></>}
    {c.op === 'external' && <RefSelect project={project} kinds={['external_contract']} value={c.contractId} onChange={id => update('contractId', id || '')}/>}
    {!depth && <><p className="condition-description">{describeCondition(c, project)}</p>{validateCondition(c).ok && <code className="condition-expression">{conditionToText(c as any, Object.fromEntries(project.entities.map(entity => [entity.id, labelOf(entity)])))}</code>}{error && <span className="field-error" role="alert">{error}</span>}</>}
  </div>;
}

export function TimeEditor({ value, onChange, project }: { value: unknown; onChange: (v: unknown) => void; project: ProjectData }) {
  const t = value && typeof value === 'object' ? value as Record<string, any> : { mode: 'unknown', reason: '' };
  const update = (key: string, v: unknown) => onChange({ ...t, [key]: v });
  const tick = (key: string, label: string) => <label className="nested-label" key={key}>{label}<input inputMode="numeric" aria-label={label} placeholder="0" value={t[key] ?? ''} onChange={e => update(key, e.target.value)}/></label>;
  return <div className="time-editor"><select aria-label="日時の種類" value={t.mode} onChange={e => {
    const mode = e.target.value, calendarId = project.calendarId;
    onChange(mode === 'instant' ? { mode, calendarId, at: '0' } : mode === 'interval' ? { mode, calendarId, start: '0', end: '1' } : mode === 'uncertain' ? { mode, calendarId, earliest: '0', latest: '1', precision: '概算' } : mode === 'relative' ? { mode, anchorEventId: '', anchorPoint: 'start', minOffset: '0', maxOffset: '0' } : { mode, reason: '' });
  }}><option value="unknown">日時未定</option><option value="instant">確定した瞬間</option><option value="interval">期間</option><option value="uncertain">不確定な範囲</option><option value="relative">出来事からの相対日時</option></select>
    {t.mode === 'instant' && tick('at', '世界内tick')}
    {t.mode === 'interval' && <div className="form-row">{tick('start', '開始tick')}{tick('end', '終了tick（含まない）')}</div>}
    {t.mode === 'uncertain' && <><div className="form-row">{tick('earliest', '最も早いtick')}{tick('latest', '最も遅いtick')}</div><input aria-label="精度の説明" placeholder="精度の説明" value={t.precision || ''} onChange={e => update('precision', e.target.value)}/></>}
    {t.mode === 'relative' && <><RefSelect project={project} kinds={['event']} value={t.anchorEventId} label="基準となる出来事" onChange={id => update('anchorEventId', id || '')}/><select aria-label="基準位置" value={t.anchorPoint} onChange={e => update('anchorPoint', e.target.value)}><option value="start">開始から</option><option value="end">終了から</option></select><div className="form-row">{tick('minOffset', '最小差tick')}{tick('maxOffset', '最大差tick')}</div></>}
    {t.mode === 'unknown' && <input aria-label="日時未定の理由" placeholder="日時未定の理由（任意）" value={t.reason || ''} onChange={e => update('reason', e.target.value)}/>}
    <span className="field-hint">負の値も使用できます。日時は表示単位を変えても維持されます。</span>
  </div>;
}

export function ParticipantsEditor({ value, onChange, project }: { value: unknown; onChange: (v: unknown) => void; project: ProjectData }) {
  const participants = Array.isArray(value) ? value as any[] : [];
  return <div className="participant-editor">{participants.map((p, i) => <div className="participant-row" key={i}><RefSelect project={project} kinds={['character']} value={p.characterId} label={`参加者${i + 1}`} onChange={id => onChange(participants.map((v, j) => i === j ? { ...v, characterId: id || '' } : v))}/><select aria-label={`参加者${i + 1}の役割`} value={p.role} onChange={e => onChange(participants.map((v, j) => i === j ? { ...v, role: e.target.value } : v))}>{[['actor', '当事者'], ['witness', '目撃者'], ['mentioned', '言及される'], ['informed', '情報を得る'], ['custom', '独自の役割']].map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select><button type="button" className="icon-button small" aria-label={`参加者${i + 1}を外す`} onClick={() => onChange(participants.filter((_, j) => i !== j))}><Icon name="close" size={16}/></button></div>)}<button type="button" className="text-button" onClick={() => onChange([...participants, { characterId: '', role: 'actor' }])}><Icon name="plus" size={16}/>参加者を追加</button><span className="field-hint">参加・目撃・知識取得を別の役割として記録します。</span></div>;
}

function RichTextEditor({ value, onChange, label, rows, placeholder, project, entity, fieldKey, onOpenTarget, onOpenReferences, onOpenReference }: { value: unknown; onChange: (value: RichText) => void; label: string; rows: number; placeholder: string; project: ProjectData; entity: Entity; fieldKey: string; onOpenTarget?: (anchor: ContentAnchor, sourceAnchor?: ContentAnchor) => void; onOpenReferences?: (targetEntityId: string) => void; onOpenReference?: (reference: TextLinkReference) => void }) {
  const blocks = Array.isArray(value) ? value as RichText : [];
  const [raw, setRaw] = useState(fieldText(value));
  const [selectionError, setSelectionError] = useState('');
  const composing = useRef(false), textarea = useRef<HTMLTextAreaElement>(null), beforeInput = useRef<TextReplacement | undefined>(undefined);
  const history = useRef<RichText[]>([]);
  const text = fieldText(value);
  useEffect(() => { if (!composing.current) setRaw(text); }, [text]);
  const selection = (element: HTMLTextAreaElement): TextReplacement => ({ start: Array.from(element.value.slice(0, element.selectionStart)).length, end: Array.from(element.value.slice(0, element.selectionEnd)).length });
  // React's synthetic before-input event does not cover every native insertion
  // path (notably Firefox insertText). Capture the actual pre-edit range.
  useEffect(() => {
    const element = textarea.current; if (!element) return;
    const capture = () => { if (!composing.current) beforeInput.current = selection(element); };
    element.addEventListener('beforeinput', capture);
    return () => element.removeEventListener('beforeinput', capture);
  }, []);
  const editorId = `rich-text-editor-${entity.id}-${fieldKey}`;
  let blockStart = 0;
  const blockAnchors = blocks.map(block => {
    const anchor = { id: block.id, start: blockStart };
    blockStart += Array.from(block.text).length + 1;
    return anchor;
  });
  const change = (next: string, inputType?: string) => {
    setRaw(next);
    if (composing.current) return;
    if (inputType === 'historyUndo' || inputType === 'historyRedo') {
      for (let i = history.current.length - 1; i >= 0; i--) if (fieldText(history.current[i]) === next) { history.current.push(structuredClone(blocks)); onChange(structuredClone(history.current[i])); return; }
    }
    history.current.push(structuredClone(blocks));
    if (history.current.length > 100) history.current.shift();
    let replacement = beforeInput.current;
    if (replacement && replacement.start === replacement.end && inputType?.startsWith('delete')) {
      const removed = Array.from(text).length - Array.from(next).length;
      replacement = inputType.endsWith('Backward') ? { start: Math.max(0, replacement.start - removed), end: replacement.end } : { start: replacement.start, end: replacement.end + removed };
    }
    onChange(editRichText(blocks, next, replacement));
    beforeInput.current = undefined;
  };
  const relink = (owner: number, annotationIndex: number) => {
    const element = textarea.current; if (!element) return;
    const range = selection(element), chars = Array.from(raw), prefix = chars.slice(0, range.start).join(''), selected = chars.slice(range.start, range.end).join('');
    if (!selected || selected.includes('\n')) { setSelectionError('本文で一つの段落の文字を選択してから、再リンクしてください。'); return; }
    const blockIndex = prefix.split('\n').length - 1, offset = Array.from(prefix.split('\n').at(-1) ?? '').length;
    const annotation = blocks[owner].unresolvedAnnotations?.[annotationIndex], target = blocks[blockIndex];
    if (!annotation || !target) return;
    const mark = { start: offset, end: offset + Array.from(selected).length };
    const result = resolveUnresolvedAnnotation(blocks, blocks[owner].id, annotationIndex, target.id, mark.start, mark.end);
    if (!result.ok) { setSelectionError(result.reason); return; }
    setSelectionError(''); onChange(result.value);
  };
  return <div className="rich-text-editor"><textarea ref={textarea} id={editorId} data-rich-text-editor="true" aria-label={label} rows={rows} value={raw} placeholder={placeholder}
    onKeyDown={e => { if (!composing.current) beforeInput.current = selection(e.currentTarget); }}
    onPaste={e => { if (!composing.current) beforeInput.current = selection(e.currentTarget); }}
    onCut={e => { if (!composing.current) beforeInput.current = selection(e.currentTarget); }}
    onCompositionStart={e => { beforeInput.current = selection(e.currentTarget); composing.current = true; }}
    onCompositionEnd={e => { composing.current = false; change(e.currentTarget.value); }}
    onChange={e => change(e.target.value, (e.nativeEvent as InputEvent).inputType)}/>
    <div className="rich-text-block-anchors" aria-hidden="true">{blockAnchors.map(block => <span key={block.id} data-block-id={block.id} data-editor-id={editorId} data-block-start={block.start}/>)}</div>
    {blocks.map((block, i) => block.unresolvedAnnotations?.map((annotation, j) => <div className="field-error" key={`${block.id}-${j}`} role="status"><strong>{annotation.kind === 'ruby' ? 'ルビ' : 'リンク'}の再リンク待ち：「{annotation.originalText}」</strong><p>{annotation.reason}</p><button type="button" className="text-button" onClick={() => relink(i, j)}>選択範囲に再リンク</button></div>))}
    {selectionError && <span className="field-error" role="alert">{selectionError}</span>}
    {fieldKey !== 'authorNotes' && <TextAnnotations value={blocks} project={project} sourceEntityId={entity.id} fieldLabel={label} onChange={onChange} onOpenTarget={onOpenTarget} onOpenReferences={onOpenReferences} onOpenReference={onOpenReference}/>}
  </div>;
}

export function DataField({ field, value, onChange, project, entity, onValid, rawOverride, onInvalidRaw, onOpenTarget, onOpenReferences, onOpenReference }: { field: FieldSpec; value: unknown; onChange: (v: unknown) => void; project: ProjectData; entity: Entity; onValid: (valid: boolean) => void; rawOverride?: string; onInvalidRaw?: (raw: string | undefined) => void; onOpenTarget?: (anchor: ContentAnchor, sourceAnchor?: ContentAnchor) => void; onOpenReferences?: (targetEntityId: string) => void; onOpenReference?: (reference: TextLinkReference) => void }) {
  let input: ReactNode;
  if (field.type === 'rich') input = <RichTextEditor label={field.label} rows={field.key === 'body' || field.key === 'text' ? 9 : 3} value={value} onChange={onChange} project={project} entity={entity} fieldKey={field.key} onOpenTarget={onOpenTarget} onOpenReferences={onOpenReferences} onOpenReference={onOpenReference} placeholder={field.key === 'authorNotes' ? '読者には公開しない制作メモ' : 'あとから詳しく書くこともできます'}/>;
  else if (field.type === 'enum') input = <select aria-label={field.label} value={typeof value === 'string' ? value : ''} onChange={e => onChange(e.target.value)}><option value="">選択してください</option>{field.options?.map(([v, label]) => <option key={v} value={v}>{label}</option>)}</select>;
  else if (field.type === 'ref' && entity.kind === 'flow_edge' && field.key === 'toId') {
    const unfinished = typeof value === 'object' && value !== null && 'unresolved' in value;
    const unresolved = unfinished ? (value as any).unresolved : { label: '', reason: '未完成' };
    input = <div className="destination-editor"><label className="check-label"><input type="checkbox" checked={unfinished} onChange={e => onChange(e.target.checked ? { unresolved: { label: '', reason: '未完成' } } : undefined)}/>行き先未定の下書き</label>{unfinished ? <><input aria-label="未完成の行き先の名称" placeholder="行き先の仮の名称" value={unresolved.label} onChange={e => onChange({ unresolved: { ...unresolved, label: e.target.value } })}/><input aria-label="行き先未定の理由" placeholder="未定の理由" value={unresolved.reason} onChange={e => onChange({ unresolved: { ...unresolved, reason: e.target.value } })}/></> : <RefSelect value={value} project={project} kinds={field.kinds} label={field.label} onChange={onChange}/>}</div>;
  }
  else if (field.type === 'ref') input = <RefSelect value={value} project={project} kinds={field.kinds} excludeId={entity.id} label={field.label} onChange={onChange}/>;
  else if (field.type === 'refs') input = <RefList value={value} project={project} kinds={field.kinds} excludeId={entity.id} onChange={onChange}/>;
  else if (field.type === 'time') input = <TimeEditor project={project} value={value} onChange={onChange}/>;
  else if (field.type === 'condition') input = <ConditionEditor project={project} value={value} onChange={onChange} onValid={onValid}/>;
  else if (field.type === 'typed') input = <TypedField project={project} value={value} onChange={onChange} preferredType={entity.kind === 'variable' ? dataOf(entity).valueType : undefined}/>;
  else if (field.type === 'participants') input = <ParticipantsEditor value={value} project={project} onChange={onChange}/>;
  else if (field.type === 'json' && ['anchor', 'evidenceLocation'].includes(field.key)) {
    const anchor = value && typeof value === 'object' ? value as any : { entityId: '' };
    const pinned = anchor.sourceVersionId ? project.snapshots.find(snapshot => snapshot.id === anchor.sourceVersionId) : undefined;
    const sourceEntities = anchor.sourceVersionId && anchor.sourceVersionId !== project.projectId ? pinned?.content.entities ?? [] : project.entities;
    const sourceProject = { ...project, entities: sourceEntities };
    const target = sourceEntities.find(e => e.id === anchor.entityId);
    const lines = sourceEntities.filter(e => e.kind === 'dialogue_line' && !e.deletedAt && (e.id === anchor.entityId || target?.kind === 'scene'));
    const line = lines.find(e => e.id === anchor.lineId);
    const textTarget = line ?? target;
    const blocks = textTarget ? ['body', 'text', 'summary', 'description'].flatMap(key => Array.isArray(dataOf(textTarget)[key]) ? dataOf(textTarget)[key].map((block: any, i: number) => ({ id: block.id, text: `${key === 'body' ? '本文' : key === 'summary' ? '要約' : '文章'} ${i + 1} · ${block.text.slice(0, 30)}` })) : []) : [];
    const resolved = { ...anchor }; delete resolved.positionStatus; delete resolved.positionReason; delete resolved.quotedText;
    input = <div className="anchor-editor">{anchor.positionStatus === 'unresolved' && <p className="field-error" role="status">位置不明・再リンク待ち：「{anchor.quotedText}」 {anchor.positionReason}</p>}<label className="nested-label">参照する版<select aria-label="参照する版" value={anchor.sourceVersionId ?? ''} onChange={event => onChange({ entityId: anchor.entityId, ...(event.target.value ? { sourceVersionId: event.target.value } : {}) })}><option value="">現在版（本文の編集に追従）</option>{anchor.sourceVersionId === project.projectId && <option value={project.projectId}>現在版（作品ID指定）</option>}{project.snapshots.map(snapshot => <option key={snapshot.id} value={snapshot.id}>{snapshot.versionLabel} · 固定版</option>)}{anchor.sourceVersionId && anchor.sourceVersionId !== project.projectId && !pinned && <option value={anchor.sourceVersionId}>保存された参照版を確認</option>}</select></label>{anchor.sourceVersionId && anchor.sourceVersionId !== project.projectId && <p className="field-hint">参照先の固定版を表示しています。現在版の本文変更は、この位置へ適用しません。</p>}<RefSelect project={sourceProject} value={anchor.entityId} label="提示する場面・情報" onChange={id => onChange(id ? { entityId: id, ...(anchor.sourceVersionId ? { sourceVersionId: anchor.sourceVersionId } : {}) } : undefined)}/>{lines.length > 0 && <label className="nested-label">台詞<select aria-label="参照する台詞" value={anchor.lineId ?? ''} onChange={event => onChange({ entityId: anchor.entityId, ...(anchor.sourceVersionId ? { sourceVersionId: anchor.sourceVersionId } : {}), ...(event.target.value ? { lineId: event.target.value } : {}) })}><option value="">対象の本文</option>{lines.map(line => <option key={line.id} value={line.id}>{labelOf(line)} · {line.id.slice(-6)}</option>)}</select></label>}<select aria-label="本文の段落" value={anchor.blockId || ''} onChange={e => onChange({ ...resolved, blockId: e.target.value || undefined })}><option value="">対象全体（段落を限定しない）</option>{blocks.map(block => <option key={block.id} value={block.id}>{block.text}</option>)}</select><div className="form-row"><label className="nested-label">開始位置（任意）<input type="number" min="0" value={anchor.start ?? ''} onChange={e => onChange({ ...resolved, start: e.target.value === '' ? undefined : Number(e.target.value) })}/></label><label className="nested-label">終了位置（任意）<input type="number" min="0" value={anchor.end ?? ''} onChange={e => onChange({ ...resolved, end: e.target.value === '' ? undefined : Number(e.target.value) })}/></label></div><span className="field-hint">文字の位置はUnicodeコードポイントで数えます。</span></div>;
  }
  else if (field.type === 'json') input = <StructuredDataField label={field.label} value={value} onChange={onChange} onValid={onValid} project={project} entity={entity} entityKind={entity.kind} fieldKey={field.key} rawOverride={rawOverride} onInvalidRaw={onInvalidRaw}/>;
  else if (field.type === 'boolean') input = <label className="check-label"><input type="checkbox" checked={value === true} onChange={e => onChange(e.target.checked)}/>{field.label}</label>;
  else if (field.type === 'number') input = <input aria-label={field.label} type="number" min={field.min} max={field.max} value={typeof value === 'number' ? value : ''} onChange={e => onChange(e.target.value === '' ? undefined : Number(e.target.value))}/>;
  else if (field.type === 'date') input = <input aria-label={field.label} type="date" value={typeof value === 'string' ? value : (value as any)?.date || ''} onChange={e => onChange(e.target.value ? { date: e.target.value, timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone } : undefined)}/>;
  else input = <input aria-label={field.label} value={typeof value === 'string' ? value : ''} onChange={e => onChange(e.target.value)}/>;
  return <div className={`form-field field-${field.type}`} data-field={field.key}>{field.type !== 'boolean' && <label>{field.label}</label>}{input}{field.hint && <span className="field-hint">{field.hint}</span>}</div>;
}

export function RichTextView({ value, vertical = false, onOpen, onOpenTarget }: { value: unknown; vertical?: boolean; onOpen?: (id: string) => void; onOpenTarget?: (anchor: ContentAnchor) => void }) {
  const blocks = Array.isArray(value) ? value as any[] : [];
  const inline = (block: any) => {
    const chars = Array.from(String(block.text || ''));
    const grouped = new Map<string, { start: number; end: number; reading?: string; target?: any }>();
    for (const ruby of block.ruby || []) grouped.set(`${ruby.start}:${ruby.end}`, { ...grouped.get(`${ruby.start}:${ruby.end}`), start: ruby.start, end: ruby.end, reading: ruby.text });
    for (const link of block.links || []) grouped.set(`${link.start}:${link.end}`, { ...grouped.get(`${link.start}:${link.end}`), start: link.start, end: link.end, target: link.target });
    const marks = [...grouped.values()].sort((a, b) => a.start - b.start);
    const output: ReactNode[] = [];
    let cursor = 0;
    marks.forEach((mark, i) => { if (mark.start < cursor || mark.end > chars.length || mark.end <= mark.start) return; output.push(chars.slice(cursor, mark.start).join('')); const text = chars.slice(mark.start, mark.end).join(''); const ruby = mark.reading === undefined ? text : <ruby key={i}>{text}<rt>{mark.reading}</rt></ruby>; output.push(mark.target ? <button className="inline-link" key={i} onClick={() => onOpenTarget ? onOpenTarget(mark.target) : onOpen?.(mark.target?.entityId)} type="button">{ruby}</button> : ruby); cursor = mark.end; });
    output.push(chars.slice(cursor).join(''));
    return output;
  };
  return <div className={`rich-text ${vertical ? 'vertical-text' : ''}`}>{blocks.map(b => b.kind === 'heading' ? <h3 key={b.id}>{inline(b)}</h3> : b.kind === 'quote' ? <blockquote key={b.id}>{inline(b)}</blockquote> : <p key={b.id}>{inline(b) || <br/>}</p>)}</div>;
}
