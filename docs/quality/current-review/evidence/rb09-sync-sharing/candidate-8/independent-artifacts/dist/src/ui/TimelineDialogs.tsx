import { useMemo, useState } from 'react';
import type { Entity, ID, ProjectData, Relation } from '../domain/types';
import { createEntity, newId, RELATION_TYPES } from '../domain/model';
import { Modal } from './components';
import { labelOf } from './Fields';
import { EntityChoice, type TimelineSave } from './TimelineEditors';
import { ValidityEditor } from './WorldFields';

export function TimelineRelationEditor({ project, referenceProject, relation, onClose, onSave, onSelect }: { project: ProjectData; referenceProject?: ProjectData; relation: Relation; onClose: () => void; onSave: TimelineSave; onSelect: (id: ID) => void }) {
  const [draft, setDraft] = useState(relation), [error, setError] = useState(''), [busy, setBusy] = useState(false), [evidenceQuery, setEvidenceQuery] = useState(''), [valid, setValid] = useState(true);
  const available = referenceProject ?? project;
  const events = useMemo(() => available.entities.filter(entity => entity.kind === 'event' && !entity.deletedAt), [available.entities]);
  const types = RELATION_TYPES.filter(type => type.fromKinds.includes('event') && type.toKinds.includes('event'));
  const type = types.find(candidate => candidate.key === draft.relationType), entityIndex = useMemo(() => new Map(available.entities.map(entity => [entity.id, entity])), [available.entities]);
  const errorFor = () => {
    if (!type) return 'この種類は出来事間の関係に使えません。';
    const source = entityIndex.get(draft.fromId), target = entityIndex.get(draft.toId);
    if (source?.kind !== 'event' || source.deletedAt || target?.kind !== 'event' || target.deletedAt) return '存在する出来事を始点と終点に選んでください。';
    if (draft.fromId === draft.toId && !type.allowSelf) return 'この関係は同じ出来事同士を結べません。';
    if (draft.direction === 'symmetric' && !type.allowSymmetric) return 'この関係は一方向です。';
    return '';
  };
  const persist = async (archive = false) => {
    setBusy(true); setError('');
    try {
      const invalid = errorFor(); if (invalid && !archive) throw new Error(invalid);
      const next = archive ? { ...draft, deletedAt: new Date().toISOString(), deletionOperationId: newId() } : draft;
      const exists = project.relations.some(candidate => candidate.id === next.id);
      await onSave({ ...project, relations: exists ? project.relations.map(candidate => candidate.id === next.id ? next : candidate) : [...project.relations, next] }, archive ? '年表の関係をアーカイブ' : '年表の意味付き関係を保存'); onClose();
    } catch (cause) { setError((cause as Error).message); } finally { setBusy(false); }
  };
  const evidence = evidenceQuery ? available.entities.filter(entity => !entity.deletedAt && !draft.evidenceIds.includes(entity.id) && `${entity.name} ${entity.id}`.toLocaleLowerCase().includes(evidenceQuery.toLocaleLowerCase())).slice(0, 30) : [];
  return <Modal title="年表の関係を編集" onClose={() => { if (!busy) onClose(); }}><fieldset disabled={busy} className="world-save-fields"><p className="field-hint">関係ID {draft.id} · 関係一覧と同じ情報を編集します。</p>{error && <div className="error-notice" role="alert">{error}</div>}<div className="form-field"><label>関係の意味</label><select aria-label="年表の関係の種類" value={draft.relationType} onChange={event => setDraft({ ...draft, relationType: event.target.value, direction: 'forward' })}>{types.map(candidate => <option key={candidate.key} value={candidate.key}>{candidate.label}</option>)}</select></div><div className="form-field"><label>始点</label><EntityChoice entities={events} label="年表の関係の始点" value={draft.fromId} onChange={fromId => setDraft({ ...draft, fromId })}/></div><div className="form-field"><label>終点</label><EntityChoice entities={events} label="年表の関係の終点" value={draft.toId} excludeId={type?.allowSelf ? undefined : draft.fromId} onChange={toId => setDraft({ ...draft, toId })}/></div><div className="form-field"><label>向き</label><select aria-label="年表の関係の向き" value={draft.direction} onChange={event => setDraft({ ...draft, direction: event.target.value as Relation['direction'] })}><option value="forward">始点 → 終点</option><option value="symmetric" disabled={!type?.allowSymmetric}>始点 ↔ 終点</option></select></div><div className="form-field"><label>根拠</label><ul className="timeline-evidence-list">{draft.evidenceIds.map(id => <li key={id}><button type="button" className="button subtle small" onClick={() => onSelect(id)}>{labelOf(entityIndex.get(id))}を開く</button><button type="button" className="button subtle small" aria-label={`${labelOf(entityIndex.get(id))}を根拠から外す`} onClick={() => setDraft({ ...draft, evidenceIds: draft.evidenceIds.filter(candidate => candidate !== id) })}>外す</button></li>)}</ul><input type="search" aria-label="関係の根拠を検索" placeholder="根拠を名前またはIDで検索" value={evidenceQuery} onChange={event => setEvidenceQuery(event.target.value)}/>{evidence.map(entity => <button type="button" key={entity.id} className="button subtle small" onClick={() => { setDraft({ ...draft, evidenceIds: [...draft.evidenceIds, entity.id] }); setEvidenceQuery(''); }}>{labelOf(entity)}を根拠に追加</button>)}</div><h3>有効な期間・経路</h3><ValidityEditor project={available} value={draft.validity} onChange={validity => setDraft({ ...draft, validity })} onValid={setValid}/><div className="modal-actions">{project.relations.some(candidate => candidate.id === draft.id) && <button type="button" className="button danger" disabled={busy} onClick={() => void persist(true)}>アーカイブ</button>}<button type="button" className="button secondary" disabled={busy} onClick={onClose}>中止</button><button type="button" className="button primary" disabled={busy || !valid} onClick={() => void persist()}>関係を保存</button></div></fieldset></Modal>;
}

export function TimelineLaneEditor({ project, onClose, onSave, collapsed, onCollapse }: { project: ProjectData; onClose: () => void; onSave: TimelineSave; collapsed: ID[]; onCollapse: (id: ID) => void }) {
  const groups = project.entities.filter((entity): entity is Entity<'group'> => entity.kind === 'group' && !entity.deletedAt && ['display', 'faction'].includes(entity.data.groupType));
  const characters = project.entities.filter((entity): entity is Entity<'character'> => entity.kind === 'character' && !entity.deletedAt);
  const [draft, setDraft] = useState<Entity<'group'> | null>(null), [remove, setRemove] = useState(false), [busy, setBusy] = useState(false), [error, setError] = useState(''), [dragged, setDragged] = useState<ID | null>(null);
  const saveGroup = async (group: Entity<'group'>) => {
    setBusy(true); setError('');
    try { const exists = project.entities.some(entity => entity.id === group.id); await onSave({ ...project, entities: exists ? project.entities.map(entity => entity.id === group.id ? group : entity) : [...project.entities, group] }, '年表のグループを保存'); setDraft(null); setRemove(false); }
    catch (cause) { setError((cause as Error).message); } finally { setBusy(false); }
  };
  const reorder = async (from: ID, to: ID) => {
    const source = groups.find(group => group.id === from), target = groups.find(group => group.id === to);
    if (!source || !target || source.id === target.id) return;
    if ((source.data.parentId ?? null) !== (target.data.parentId ?? null)) { setError('同じ親のグループ同士を並べ替えてください。階層は親グループ欄で変更できます。'); return; }
    const ids = groups.map(group => group.id), a = ids.indexOf(from), b = ids.indexOf(to); ids.splice(a, 1); ids.splice(b, 0, from);
    const ordered = new Map(groups.map(group => [group.id, group])); let cursor = 0; const groupIds = new Set(ids);
    setBusy(true); setError('');
    try { await onSave({ ...project, entities: project.entities.map(entity => groupIds.has(entity.id) ? ordered.get(ids[cursor++])! : entity) }, '年表のグループ順を変更'); }
    catch (cause) { setError((cause as Error).message); } finally { setBusy(false); }
  };
  const moveMember = (from: ID, to: ID) => {
    if (!draft || from === to) return;
    const members = [...(draft.data.members ?? [])], a = members.indexOf(from), b = members.indexOf(to);
    if (a < 0 || b < 0) return; members.splice(a, 1); members.splice(b, 0, from); setDraft({ ...draft, data: { ...draft.data, members } });
  };
  const archiveGroup = async () => {
    if (!draft) return; setBusy(true); setError('');
    try { const archived = { ...draft, deletedAt: new Date().toISOString(), deletionOperationId: newId() }; await onSave({ ...project, entities: project.entities.map(entity => entity.id === draft.id ? archived : entity.kind === 'group' && entity.data.parentId === draft.id ? { ...entity, data: { ...entity.data, parentId: null } } : entity) }, 'グループをアーカイブし人物参照を保持'); setDraft(null); setRemove(false); }
    catch (cause) { setError((cause as Error).message); } finally { setBusy(false); }
  };
  return <Modal title="グループ・人物レーンを編集" onClose={() => { if (!busy) onClose(); }} wide><fieldset disabled={busy} className="world-save-fields">{error && <div className="error-notice" role="alert">{error}</div>}<p className="field-hint">矢印ボタンとドラッグで並べ替えられます。複数グループから同じ人物を参照できます。</p><div className="timeline-group-editor-list">{groups.map(group => {
    const siblings = groups.filter(candidate => (candidate.data.parentId ?? null) === (group.data.parentId ?? null)), position = siblings.findIndex(candidate => candidate.id === group.id);
    return <div key={group.id} className="timeline-group-editor-row" draggable={!busy} onDragStart={() => setDragged(group.id)} onDragOver={event => event.preventDefault()} onDrop={event => { event.preventDefault(); if (dragged) void reorder(dragged, group.id); setDragged(null); }}><strong>{group.name}</strong><small>{group.data.parentId ? `親：${labelOf(groups.find(candidate => candidate.id === group.data.parentId))}` : '最上位'} · {(group.data.members ?? []).filter(id => characters.some(character => character.id === id)).length}人物</small><div><button type="button" className="button subtle small" onClick={() => onCollapse(group.id)} aria-expanded={!collapsed.includes(group.id)}>{collapsed.includes(group.id) ? '展開' : '折りたたむ'}</button><button type="button" className="button subtle small" aria-label={`${group.name}を前へ`} disabled={busy || position === 0} onClick={() => void reorder(group.id, siblings[position - 1].id)}>↑</button><button type="button" className="button subtle small" aria-label={`${group.name}を後へ`} disabled={busy || position === siblings.length - 1} onClick={() => void reorder(group.id, siblings[position + 1].id)}>↓</button><button type="button" className="button secondary small" disabled={busy} onClick={() => { setDraft(structuredClone(group)); setRemove(false); }}>改名・階層・人物を編集</button></div></div>;
  })}</div><button type="button" className="button secondary" disabled={busy} onClick={() => { setDraft(createEntity(project.projectId, 'group', '', { groupType: 'display' })); setRemove(false); }}>グループを追加</button>
    {draft && <section className="timeline-group-draft"><div className="form-field"><label>グループ名</label><input aria-label="年表のグループ名" value={draft.name} onChange={event => setDraft({ ...draft, name: event.target.value })}/></div><div className="form-field"><label>親グループ</label><select aria-label="年表の親グループ" value={draft.data.parentId ?? ''} onChange={event => setDraft({ ...draft, data: { ...draft.data, parentId: event.target.value || null } })}><option value="">最上位</option>{groups.filter(group => group.id !== draft.id).map(group => <option key={group.id} value={group.id}>{group.name}</option>)}</select></div><h3>人物の参照と順序</h3><ol className="timeline-member-list">{(draft.data.members ?? []).map((id, i, members) => <li key={id} draggable={!busy} onDragStart={() => setDragged(id)} onDragOver={event => event.preventDefault()} onDrop={event => { event.preventDefault(); if (dragged) moveMember(dragged, id); setDragged(null); }}><span>{labelOf(project.entities.find(entity => entity.id === id))}</span><div><button type="button" className="button subtle small" aria-label={`${i + 1}番の人物を前へ`} disabled={i === 0} onClick={() => moveMember(id, members[i - 1])}>↑</button><button type="button" className="button subtle small" aria-label={`${i + 1}番の人物を後へ`} disabled={i === members.length - 1} onClick={() => moveMember(id, members[i + 1])}>↓</button><button type="button" className="button subtle small" onClick={() => setDraft({ ...draft, data: { ...draft.data, members: members.filter(member => member !== id) } })}>参照を外す</button></div></li>)}</ol><EntityChoice entities={characters.filter(character => !(draft.data.members ?? []).includes(character.id))} label="グループへ参照を追加する人物" value="" onChange={id => { if (id) setDraft({ ...draft, data: { ...draft.data, members: [...(draft.data.members ?? []), id] } }); }}/>
      {remove && <div className="timeline-delete-impact" role="status"><strong>グループの表示への影響</strong><p>{(draft.data.members ?? []).length}件の人物参照を年表のグループから外します。人物と出来事の本体・IDは保持します。{groups.filter(group => group.data.parentId === draft.id).length}件の子グループを最上位へ移します。</p><button type="button" className="button danger" disabled={busy} onClick={() => void archiveGroup()}>影響を確認してグループを外す</button></div>}
      <div className="modal-actions">{project.entities.some(entity => entity.id === draft.id) && <button type="button" className="button danger" disabled={busy} onClick={() => setRemove(true)}>グループを外す前に確認</button>}<button type="button" className="button secondary" disabled={busy} onClick={() => setDraft(null)}>編集を中止</button><button type="button" className="button primary" disabled={busy || !draft.name.trim()} onClick={() => void saveGroup(draft)}>グループを保存</button></div></section>}
  </fieldset></Modal>;
}
