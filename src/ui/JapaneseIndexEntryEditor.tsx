import { useEffect, useRef, useState } from 'react';
import type { Alias, Entity, EntityKind, ProjectData } from '../domain/types';
import { emptyValidity, newId, KIND_LABELS } from '../domain/model';
import { previewJapaneseIndexEdit } from '../domain/catalogEdits';
import type { JapaneseAuthorIndexEntry } from '../domain/catalog';
import { Icon } from './components';

const READING_KINDS = new Set<EntityKind>(['character', 'place', 'lore', 'terminology']);
const ALIAS_KINDS = new Set<EntityKind>(['character', 'place', 'lore']);

function record(entity: Entity): Record<string, unknown> { return entity.data as unknown as Record<string, unknown>; }
function stringField(entity: Entity, key: string): string { const value = record(entity)[key]; return typeof value === 'string' ? value : ''; }
function aliasField(entity: Entity): Alias[] { const value = record(entity).aliases; return Array.isArray(value) ? structuredClone(value) as Alias[] : []; }

export interface JapaneseIndexEntryEditorProps {
  project: ProjectData;
  entry: JapaneseAuthorIndexEntry;
  onSaveMany: (entities: Entity[], reason: string) => Promise<void>;
  /** Open the existing normal editor focused at a field path such as `data.aliases` or `data.reading`. */
  onOpenField: (entityId: string, fieldPath: string) => void;
  onClose?: () => void;
}

/** Edits author-side index terms and category memberships while retaining their normal entity fields. */
export function JapaneseIndexEntryEditor({ project, entry, onSaveMany, onOpenField, onClose }: JapaneseIndexEntryEditorProps) {
  const entity = project.entities.find(candidate => candidate.id === entry.entityId && !candidate.deletedAt);
  const sourceRevision = useRef(entity?.revision);
  const categoryGroups = project.entities.filter((candidate): candidate is Entity<'group'> => candidate.kind === 'group' && !candidate.deletedAt && candidate.data.groupType === 'category');
  const [name, setName] = useState(entity?.name ?? entry.entityName);
  const [reading, setReading] = useState(entity ? stringField(entity, 'reading') : entry.reading);
  const [canonical, setCanonical] = useState(entity ? stringField(entity, 'canonical') : '');
  const [aliases, setAliases] = useState<Alias[]>(entity ? aliasField(entity) : []);
  const [variants, setVariants] = useState(entity && entity.kind === 'terminology' ? [...(entity.data.variants ?? [])] : []);
  const [selectedCategories, setSelectedCategories] = useState<string[]>([]);
  const [newCategoryDraft, setNewCategoryDraft] = useState('');
  const [variantDraft, setVariantDraft] = useState('');
  const [newCategories, setNewCategories] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  useEffect(() => {
    if (!entity) return;
    sourceRevision.current = entity.revision;
    setName(entity.name); setReading(stringField(entity, 'reading')); setCanonical(stringField(entity, 'canonical'));
    setAliases(aliasField(entity)); setVariants(entity.kind === 'terminology' ? [...(entity.data.variants ?? [])] : []);
    setSelectedCategories(categoryGroups.filter(group => (group.data.members ?? []).includes(entity.id)).map(group => group.id));
    setNewCategories([]); setNewCategoryDraft(''); setVariantDraft(''); setError(''); setNotice('');
  }, [entry.entityId]);

  if (!entity) return <section className="settings-card"><p role="status">索引の対象が見つかりません。作品の情報を更新してから開き直してください。</p><button type="button" className="button secondary" onClick={onClose}>閉じる</button></section>;

  const setAlias = (id: string, field: 'text' | 'reading' | 'isPublicDefault', value: string | boolean) => {
    setAliases(current => current.map(alias => alias.id === id ? { ...alias, [field]: value } : alias));
  };

  const addAlias = () => setAliases(current => [...current, { id: newId(), text: '', reading: '', validity: emptyValidity(), audienceHolderIds: [], isPublicDefault: false }]);
  const removeAlias = (id: string) => setAliases(current => current.filter(alias => alias.id !== id));
  const addCategory = () => {
    const value = newCategoryDraft.trim();
    if (!value) return;
    setNewCategories(current => current.includes(value) ? current : [...current, value]); setNewCategoryDraft('');
  };

  const save = async () => {
    if (busy) return;
    setBusy(true); setError(''); setNotice('');
    try {
      if (entity.revision !== sourceRevision.current) throw new Error('対象が別の操作で更新されています。入力は保持しています。現在版と比較してから開き直してください。');
      const proposal = previewJapaneseIndexEdit(project, entity.id, {
        name, ...(READING_KINDS.has(entity.kind) ? { reading } : {}), ...(ALIAS_KINDS.has(entity.kind) ? { aliases } : {}),
        ...(entity.kind === 'terminology' ? { canonical, variants } : {}), categoryGroupIds: selectedCategories,
        newCategoryNames: newCategories, newCategoryIds: newCategories.map(() => newId()), createdAt: new Date().toISOString(),
      });
      await onSaveMany(proposal.entities, '日本語索引の表記・読み・分類を更新');
      setNotice('索引の表記・読み・分類を保存しました。');
      onClose?.();
    } catch (failure) { setError((failure as Error).message); }
    finally { setBusy(false); }
  };

  const openField = (path: string) => onOpenField(entity.id, path);

  return <section className="settings-card japanese-index-editor" aria-labelledby="index-entry-editor-heading">
    <fieldset disabled={busy} className="index-editor-controls">
    <div className="section-heading"><div><span className="eyebrow">{KIND_LABELS[entity.kind]} · {entry.source}</span><h3 id="index-entry-editor-heading">索引の表記・読み・分類</h3></div>{onClose && <button type="button" className="icon-button" aria-label="索引編集を閉じる" onClick={onClose}><Icon name="close" size={18}/></button>}</div>
    <p className="field-hint">原文の表記を保ったまま、検索に使う読み・別名・分類を編集します。変更は元の対象と分類グループへ保存されます。</p>
    <div className="form-field" data-field="name"><label htmlFor="index-entity-name">項目名</label><input id="index-entity-name" value={name} onChange={event => setName(event.target.value)}/><button type="button" className="text-button" onClick={() => openField('name')}>通常フォームの名前欄を開く</button></div>

    {READING_KINDS.has(entity.kind) ? <div className="form-field" data-field="reading"><label htmlFor="index-reading">読み</label><input id="index-reading" value={reading} onChange={event => setReading(event.target.value)} placeholder="ひらがな・カタカナなど"/><button type="button" className="text-button" onClick={() => openField('data.reading')}>通常フォームの読み欄を開く</button></div> : <p className="info-notice">この種類には読みを保存する項目がありません。現在のデータ形式へ項目を追加した後に編集できます。</p>}

    {ALIAS_KINDS.has(entity.kind) && <section className="references-section" aria-labelledby="index-alias-heading"><div className="section-heading"><h4 id="index-alias-heading">別名・旧名</h4><button type="button" className="text-button" onClick={() => openField('data.aliases')}>通常フォームの別名欄を開く</button></div>{aliases.map((alias, index) => <div className="form-field alias-index-row" key={alias.id} data-field={`aliases.${index}`}><div className="form-row"><label>表記<input aria-label={`別名${index + 1}の表記`} value={alias.text} onChange={event => setAlias(alias.id, 'text', event.target.value)}/></label><label>読み<input aria-label={`別名${index + 1}の読み`} value={alias.reading} onChange={event => setAlias(alias.id, 'reading', event.target.value)}/></label></div><label className="check-label"><input type="checkbox" checked={alias.isPublicDefault} onChange={event => setAlias(alias.id, 'isPublicDefault', event.target.checked)}/>公開時の既定名として使う</label><span className="field-hint">閲覧者限定: {alias.audienceHolderIds.length ? alias.audienceHolderIds.join('、') : 'なし'} · 有効範囲と閲覧者の詳細は通常フォームで編集できます。</span><button type="button" className="text-button danger" onClick={() => removeAlias(alias.id)}>別名を外す</button></div>)}<button type="button" className="button secondary small" onClick={addAlias}>別名を追加</button></section>}

    {entity.kind === 'terminology' && <section className="references-section"><div className="form-field" data-field="canonical"><label htmlFor="index-canonical">標準表記</label><input id="index-canonical" value={canonical} onChange={event => setCanonical(event.target.value)}/><button type="button" className="text-button" onClick={() => openField('data.canonical')}>通常フォームの標準表記欄を開く</button></div><div className="form-field" data-field="variants"><label htmlFor="index-variant-draft">表記候補・略称</label>{variants.map((variant, index) => <div className="form-row" key={index}><input aria-label={`表記候補${index + 1}`} value={variant} onChange={event => setVariants(current => current.map((value, i) => i === index ? event.target.value : value))}/><button type="button" className="button secondary small" aria-label={`表記候補${index + 1}を外す`} onClick={() => setVariants(current => current.filter((_, i) => i !== index))}>外す</button></div>)}<div className="form-row"><input id="index-variant-draft" aria-label="追加する表記候補" value={variantDraft} onChange={event => setVariantDraft(event.target.value)} placeholder="略称・表記ゆれ"/><button type="button" className="button secondary small" disabled={!variantDraft.trim()} onClick={() => { const value = variantDraft.trim(); setVariants(current => current.includes(value) ? current : [...current, value]); setVariantDraft(''); }}>候補を追加</button></div><button type="button" className="text-button" onClick={() => openField('data.variants')}>通常フォームの表記候補欄を開く</button></div></section>}

    <section className="references-section" aria-labelledby="index-classification-heading"><div className="section-heading"><h4 id="index-classification-heading">分類索引</h4></div><p className="field-hint">分類グループへの所属を編集します。複数の分類を選べます。</p>{categoryGroups.length === 0 && <p className="field-hint">分類グループはまだありません。</p>}{categoryGroups.map(group => <div className="check-label" key={group.id}><label><input type="checkbox" checked={selectedCategories.includes(group.id)} onChange={event => setSelectedCategories(current => event.target.checked ? [...current, group.id] : current.filter(id => id !== group.id))}/>{group.name}<small> · {(group.data.members ?? []).length}件</small></label><button type="button" className="text-button" onClick={() => onOpenField(group.id, 'data.members')}>分類グループを開く</button></div>)}
      {newCategories.map((value, index) => <p className="check-label" key={`${value}-${index}`}>保存時に新しい分類「{value}」を作成し、この項目を追加します。<button type="button" className="text-button danger" onClick={() => setNewCategories(current => current.filter((_, i) => i !== index))}>取消</button></p>)}
      <div className="form-row"><label htmlFor="index-new-category">新しい分類<input id="index-new-category" value={newCategoryDraft} onChange={event => setNewCategoryDraft(event.target.value)} placeholder="分類名"/></label><button type="button" className="button secondary small" disabled={!newCategoryDraft.trim()} onClick={addCategory}>分類を追加</button></div>
    </section>
    {error && <div className="error-notice" role="alert"><strong>索引を保存できませんでした</strong><p>{error}</p><span className="field-hint">入力は保持されています。内容を修正して再試行できます。</span></div>}{notice && <p className="success-notice" role="status">{notice}</p>}
    <div className="modal-actions"><button type="button" className="button primary" disabled={busy || !name.trim()} onClick={() => void save()}>{busy ? '保存中…' : '索引項目を保存'}</button></div>
    </fieldset>
  </section>;
}
