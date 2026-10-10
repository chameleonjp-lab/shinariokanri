import type { Entity, ProjectData, TypedValue } from '../domain/types';
import { PagedSelect } from './PagedSelect';
import { WindowedList } from './WindowedList';
import { RefList, TypedField, labelOf } from './Fields';

export interface ConsultationDraft {
  focusIds: string[];
  beforeValues: Record<string, TypedValue>;
  afterValues: Record<string, TypedValue>;
  integerInputs?: Partial<Record<'beforeValues' | 'afterValues', Record<string, string>>>;
  confirmedBinding?: string;
}

export const EMPTY_CONSULTATION_DRAFT: ConsultationDraft = { focusIds: [], beforeValues: {}, afterValues: {} };

export function hasConsultationContext(draft: ConsultationDraft): boolean {
  return draft.focusIds.length > 0 || Object.keys(draft.beforeValues).length > 0 || Object.keys(draft.afterValues).length > 0;
}

const validInteger = (text: string) => /^-?\d+$/.test(text) && Number.isSafeInteger(Number(text));
export function hasInvalidConsultationInteger(draft: ConsultationDraft): boolean {
  return (['beforeValues', 'afterValues'] as const).some(field => Object.entries(draft.integerInputs?.[field] ?? {}).some(([id, text]) => draft[field][id]?.type === 'integer' && !validInteger(text)));
}

export function ConsultationContext({ project, policy, draft, binding, scope, onChange }: {
  project: ProjectData;
  policy: Entity<'projection_profile'> | undefined;
  draft: ConsultationDraft;
  binding: string;
  scope: string;
  onChange: (draft: ConsultationDraft) => void;
}) {
  const included = new Set(policy?.data.includedIds ?? []);
  const approved = project.entities.filter(entity => included.has(entity.id) && !entity.deletedAt && !['rejected', 'alternate'].includes(entity.status));
  const approvedProject = { ...project, entities: approved };
  const variables = approved.filter((entity): entity is Entity<'variable'> => entity.kind === 'variable');
  const used = [...new Set([...Object.keys(draft.beforeValues), ...Object.keys(draft.afterValues)])];
  const rows = used.map(id => ({ id, variable: variables.find(variable => variable.id === id) }));
  const change = (next: ConsultationDraft) => onChange({ ...next, confirmedBinding: undefined });
  const label = (id: string) => {
    const names = policy?.data.namePolicy;
    const replacement = names && 'mode' in names ? names : names?.byEntityId?.[id] ?? names?.defaultPolicy;
    return replacement?.mode === 'replace' ? replacement.replacement : labelOf(approved.find(entity => entity.id === id));
  };
  const missing = draft.focusIds.some(id => !approved.some(entity => entity.id === id)) || rows.some(row => !row.variable);
  return <section className="consultation-context" aria-label="相談に添える対象と前後状態">
    <h3>相談に添える対象と前後状態</h3>
    <p className="field-hint">選択した版・公開範囲で作者が指定する状態です。試読の実測や読み手の理解を認定する値ではありません。不明な値は未確定のまま出力します。</p>
    <div className="form-field"><label>相談する人物・場面</label><RefList project={approvedProject} kinds={['character', 'scene']} value={draft.focusIds} onChange={focusIds => change({ ...draft, focusIds })}/></div>
    <PagedSelect label="相談へ前後状態を追加" scope={`${scope}:add-state`} value="" emptyLabel="公開範囲の状態を選ぶ" items={variables.filter(variable => !used.includes(variable.id)).map(variable => ({ id: variable.id, label: label(variable.id) }))} onChange={id => {
      if (!id || !variables.some(variable => variable.id === id)) return;
      const unknown: TypedValue = { type: 'unknown', value: null, reason: '作者が前後状態を未指定' };
      change({ ...draft, beforeValues: { ...draft.beforeValues, [id]: unknown }, afterValues: { ...draft.afterValues, [id]: unknown } });
    }}/>
    <WindowedList items={rows} scope={`${scope}:states`} size={20} label="相談の前後状態" searchText={row => row.variable ? label(row.id) : row.id} render={row => <div className="consultation-state">
      <h4>{row.variable ? label(row.id) : '公開範囲にない状態'}</h4>
      {row.variable ? <>{(['beforeValues', 'afterValues'] as const).map(field => <fieldset key={field} aria-label={`${field === 'beforeValues' ? '前の状態' : '後の状態'} · ${label(row.id)}`}>
        <legend>{field === 'beforeValues' ? '前の状態' : '後の状態'}</legend>
        <TypedField project={approvedProject} preferredType={row.variable!.data.valueType} value={draft[field][row.id]} onChange={value => {
          const raw = { ...draft.integerInputs?.[field] }; delete raw[row.id];
          change({ ...draft, [field]: { ...draft[field], [row.id]: value as TypedValue }, integerInputs: { ...draft.integerInputs, [field]: raw } });
        }} integerInput={draft[field][row.id]?.type === 'integer' ? { text: draft.integerInputs?.[field]?.[row.id] ?? String(draft[field][row.id].value), onChange: text => change({ ...draft,
          [field]: validInteger(text) ? { ...draft[field], [row.id]: { type: 'integer', value: Number(text) } } : draft[field],
          integerInputs: { ...draft.integerInputs, [field]: { ...draft.integerInputs?.[field], [row.id]: text } },
        }) } : undefined}/>
      </fieldset>)}</> : <p role="alert">入力した状態を保持しています。公開範囲・対象版を戻すか、この状態を相談から外してください。</p>}
      <button className="text-button" type="button" onClick={() => {
        const beforeValues = { ...draft.beforeValues }, afterValues = { ...draft.afterValues };
        const beforeInputs = { ...draft.integerInputs?.beforeValues }, afterInputs = { ...draft.integerInputs?.afterValues };
        delete beforeValues[row.id]; delete afterValues[row.id]; delete beforeInputs[row.id]; delete afterInputs[row.id];
        change({ ...draft, beforeValues, afterValues, integerInputs: { beforeValues: beforeInputs, afterValues: afterInputs } });
      }}>この前後状態を相談から外す</button>
    </div>}/>
    {missing && <p role="alert">相談の対象が公開範囲にありません。入力を保持しているので、範囲・版を戻すか対象を選び直してください。</p>}
    {hasConsultationContext(draft) && draft.confirmedBinding !== binding && <p role="alert">選択した版・公開範囲の前後状態を確認してください。更新後の版には以前の確認を引き継ぎません。</p>}
    {hasInvalidConsultationInteger(draft) && <p role="alert">整数の入力途中です。文字を保持しているので、符号と数字で安全な範囲の整数を入力するか、状態を未確定にしてください。</p>}
    <button className="button secondary" type="button" disabled={missing || !hasConsultationContext(draft) || hasInvalidConsultationInteger(draft)} onClick={() => onChange({ ...draft, confirmedBinding: binding })}>この範囲・版の相談内容を確認</button>
    {hasConsultationContext(draft) && draft.confirmedBinding === binding && <p className="field-hint">表示した対象版と公開範囲で確認しました。値の型・範囲・公開用表記は出力時に検査します。</p>}
  </section>;
}
