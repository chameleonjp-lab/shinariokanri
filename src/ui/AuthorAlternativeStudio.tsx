import { useEffect, useMemo, useRef, useState } from 'react';
import type { Entity, EntityKind, ProjectContent, ProjectData, Status } from '../domain/types';
import { createEntity, KIND_LABELS, validateProject } from '../domain/model';
import {
  STRUCTURE_TEMPLATES,
  appendAlternativeVersion,
  applyAlternativeChanges,
  diffAuthorAlternative,
  forkAuthorAlternative,
  headAlternativeContent,
  projectContent,
  rollbackAlternativeHead,
  type AlternativeApplyReceipt,
  type AlternativeChange,
  type AuthorAlternative,
  type StructurePlan,
} from '../domain/writingWorkspace';
import { canonicalJson } from '../storage/json';
import { sealAuthorAlternative, validateStructurePlan } from '../domain/authorAlternativeIntegrity';
import { fieldText } from './components';
import { FIELD_SPECS } from './fieldSpecs';
import { resolvePinnedWorlds } from '../domain/pinnedWorlds';
import { DataField } from './Fields';
import { remapEditedTextReferences, remapEditedTextRelationReferences } from '../domain/text';
import { ChapterReadingView, StructurePreview } from './WritingWorkspace';
import { PagedSelect } from './PagedSelect';
import { WindowedList } from './WindowedList';
import './WritingWorkspace.css';

const BRANCH_STATUS_LABEL: Record<AuthorAlternative['status'], string> = {
  active: '作業中', provisional: '仮', needs_review: '要確認', rejected: '没', accepted: '採用済み',
};
const ENTITY_STATUS_LABEL: Record<Status, string> = {
  confirmed: '確定', provisional: '仮', needs_review: '要確認', rejected: '没', alternate: '別案',
};

interface AlternativeEditorDraft {
  headVersionId: string;
  content?: ProjectContent;
  structurePlan?: StructurePlan;
  branchName: string;
  selectedEntityId: string;
  newSceneChapterId: string;
  versionLabel: string;
  jsonBuffers?: Record<string, Record<string, string>>;
  invalidFieldKeys?: string[];
  newEntityKind?: EntityKind;
  newEntityName?: string;
}
export interface AuthorAlternativeWorkspaceDraft {
  selectedAlternativeId: string;
  newBranchName: string;
  sourceSnapshotId: string;
  branches: Record<string, AlternativeEditorDraft>;
}

export function hasUnsavedAlternativeWorkspaceDraft(draft: AuthorAlternativeWorkspaceDraft, alternatives: readonly AuthorAlternative[]): boolean {
  if (draft.newBranchName.trim()) return true;
  return Object.entries(draft.branches).some(([id, editor]) => {
    const alternative = alternatives.find(item => item.id === id);
    const head = alternative?.versions.find(version => version.id === alternative.headVersionId);
    if (editor.newEntityName?.trim() || editor.invalidFieldKeys?.length || Object.values(editor.jsonBuffers ?? {}).some(fields => Object.keys(fields).length)) return true;
    return !!editor.content && (!alternative || !head || editor.headVersionId !== alternative.headVersionId
      || editor.branchName !== alternative.name || canonicalJson(editor.content) !== canonicalJson(head.content)
      || canonicalJson(editor.structurePlan ?? null) !== canonicalJson(head.structurePlan ?? null));
  });
}

/** Rebase a retained editor only after this host has acknowledged its own append. */
export function acknowledgeAlternativeWorkspaceDraft(draft: AuthorAlternativeWorkspaceDraft, before: readonly Pick<AuthorAlternative, 'id' | 'headVersionId'>[], after: readonly Pick<AuthorAlternative, 'id' | 'headVersionId'>[]): AuthorAlternativeWorkspaceDraft {
  let branches = draft.branches;
  for (const previous of before) {
    const stored = after.find(item => item.id === previous.id);
    const editor = branches[previous.id];
    if (!stored || !editor || previous.headVersionId === stored.headVersionId || editor.headVersionId !== previous.headVersionId) continue;
    branches = { ...branches, [previous.id]: { ...editor, headVersionId: stored.headVersionId } };
  }
  return branches === draft.branches ? draft : { ...draft, branches };
}

export interface AuthorAlternativeStudioProps {
  initialDraft?: AuthorAlternativeWorkspaceDraft;
  onDraftChange?: (draft: AuthorAlternativeWorkspaceDraft) => void;
  project: ProjectData;
  worldSnapshots?: Record<string, ProjectContent>;
  alternatives: AuthorAlternative[];
  /**
   * Persist these records as part of ProjectData so backups, restores, sync, and integrity checks include them.
   * This must not be implemented as localStorage or a UI-only sidecar.
   */
  onPersistAlternatives: (next: AuthorAlternative[]) => void | Promise<void>;
  /** Atomically save the canonical candidate and its updated, sealed alternative receipt in ProjectData. */
  onCommitCanonical?: (candidate: ProjectData, alternative: AuthorAlternative, receipt: AlternativeApplyReceipt) => Promise<{ savedRevision: string; persistedAlternative: AuthorAlternative }>;
  onOpenEntity?: (id: string) => void;
}

function entityLabel(entity: Entity): string { return `${entity.name || KIND_LABELS[entity.kind]} · ${KIND_LABELS[entity.kind]}`; }

function displayDiffValue(value: unknown, project: ProjectData): string {
  if (value === undefined || value === null) return '（未設定）';
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') return String(value);
  if (Array.isArray(value)) {
    if (value.every(item => item && typeof item === 'object' && 'text' in item)) return value.map(item => String((item as { text: unknown }).text ?? '')).join('\n') || '（空）';
    if (value.every(item => typeof item === 'string')) return value.map(id => project.entities.find(entity => entity.id === id)?.name ?? id).join('、') || '（空）';
    return `項目 ${value.length}件`;
  }
  if (typeof value === 'object') {
    const record = value as Record<string, unknown>;
    if (typeof record.id === 'string') return project.entities.find(entity => entity.id === record.id)?.name ?? '参照先の変更';
    if ('mode' in record) return `方式「${String(record.mode)}」を含む設定の変更`;
    return '構造化された値の変更';
  }
  return '（未設定）';
}

function cloneContent(content: ProjectContent): ProjectContent { return structuredClone(content); }

export function AuthorAlternativeStudio({ project, alternatives: incoming, worldSnapshots = {}, onPersistAlternatives, onCommitCanonical, onOpenEntity, initialDraft, onDraftChange }: AuthorAlternativeStudioProps) {
  const [alternatives, setAlternatives] = useState(incoming);
  const [selectedAlternativeId, setSelectedAlternativeId] = useState(initialDraft?.selectedAlternativeId ?? incoming[0]?.id ?? '');
  const [branchName, setBranchName] = useState('');
  const [newBranchName, setNewBranchName] = useState(initialDraft?.newBranchName ?? '');
  const [sourceSnapshotId, setSourceSnapshotId] = useState(initialDraft?.sourceSnapshotId ?? '');
  const [newSceneChapterId, setNewSceneChapterId] = useState('');
  const [contentDraft, setContentDraft] = useState<ProjectContent>();
  const [structurePlanDraft, setStructurePlanDraft] = useState<StructurePlan>();
  const [selectedEntityId, setSelectedEntityId] = useState('');
  const [versionLabel, setVersionLabel] = useState('別案の編集');
  const [branchJsonBuffers, setBranchJsonBuffers] = useState<Record<string, Record<string, string>>>({});
  const [invalidFieldKeys, setInvalidFieldKeys] = useState<string[]>([]);
  const [newEntityKind, setNewEntityKind] = useState<EntityKind>('scene');
  const [newEntityName, setNewEntityName] = useState('');
  const [selectedChangeKeys, setSelectedChangeKeys] = useState<ReadonlySet<string>>(new Set());
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false), saving = useRef(false);

  const branchDrafts = useRef<Record<string, AlternativeEditorDraft>>(initialDraft?.branches ?? {});
  const [draftOwner, setDraftOwner] = useState<{ id: string; headVersionId: string }>();
  const draftCallback = useRef(onDraftChange);
  draftCallback.current = onDraftChange;
  if (draftOwner && contentDraft) branchDrafts.current[draftOwner.id] = {
    headVersionId: draftOwner.headVersionId, content: contentDraft, structurePlan: structurePlanDraft,
    branchName, selectedEntityId, newSceneChapterId, versionLabel,
    jsonBuffers: branchJsonBuffers, invalidFieldKeys, newEntityKind, newEntityName,
  };
  useEffect(() => { draftCallback.current?.({ selectedAlternativeId, newBranchName, sourceSnapshotId, branches: { ...branchDrafts.current } }); },
    [selectedAlternativeId, newBranchName, sourceSnapshotId, contentDraft, structurePlanDraft, branchName, selectedEntityId, newSceneChapterId, versionLabel, draftOwner, branchJsonBuffers, invalidFieldKeys, newEntityKind, newEntityName]);

  useEffect(() => {
    setAlternatives(incoming);
    if (!incoming.some(item => item.id === selectedAlternativeId)) setSelectedAlternativeId(incoming[0]?.id ?? '');
  }, [incoming, selectedAlternativeId]);

  const alternative = alternatives.find(item => item.id === selectedAlternativeId);
  useEffect(() => {
    if (!alternative) { setDraftOwner(undefined); setContentDraft(undefined); setStructurePlanDraft(undefined); setSelectedEntityId(''); setBranchName(''); return; }
    try {
      const savedDraft = branchDrafts.current[alternative.id];
      const head = savedDraft?.content ?? headAlternativeContent(alternative);
      setContentDraft(head);
      setStructurePlanDraft(savedDraft ? savedDraft.structurePlan : alternative.versions.find(version => version.id === alternative.headVersionId)?.structurePlan);
      setSelectedEntityId(savedDraft?.selectedEntityId ?? head.entities.find(entity => !entity.deletedAt)?.id ?? '');
      setBranchName(savedDraft?.branchName ?? alternative.name);
      setNewSceneChapterId(savedDraft?.newSceneChapterId ?? '');
      setVersionLabel(savedDraft?.versionLabel ?? '別案の編集');
      setBranchJsonBuffers(savedDraft?.jsonBuffers ?? {}); setInvalidFieldKeys(savedDraft?.invalidFieldKeys ?? []);
      setNewEntityKind(savedDraft?.newEntityKind ?? 'scene'); setNewEntityName(savedDraft?.newEntityName ?? '');
      setDraftOwner({ id: alternative.id, headVersionId: savedDraft?.headVersionId ?? alternative.headVersionId });
    } catch (reason) { setError(reason instanceof Error ? reason.message : '別案を開けません。'); }
  }, [alternative?.id, alternative?.headVersionId]);

  useEffect(() => {
    const acknowledged = initialDraft?.branches[selectedAlternativeId];
    if (draftOwner?.id === selectedAlternativeId && acknowledged && acknowledged.headVersionId === alternative?.headVersionId && draftOwner.headVersionId !== acknowledged.headVersionId) {
      setDraftOwner({ id: selectedAlternativeId, headVersionId: acknowledged.headVersionId });
    }
  }, [initialDraft, selectedAlternativeId, alternative?.headVersionId, draftOwner]);

  const chapters = contentDraft?.entities.filter((entity): entity is Entity<'chapter'> => entity.kind === 'chapter' && !entity.deletedAt) ?? [];
  const entities = contentDraft?.entities.filter(entity => !entity.deletedAt) ?? [];
  const selectedEntity = entities.find(entity => entity.id === selectedEntityId);
  const head = alternative?.versions.find(version => version.id === alternative.headVersionId);
  const changes = useMemo(() => alternative ? diffAuthorAlternative(alternative, project) : [], [alternative, project]);
  const activeSnapshot = project.snapshots.find(snapshot => snapshot.id === sourceSnapshotId);

  const persist = async (next: AuthorAlternative[], selectId?: string) => {
    if (saving.current) return false;
    saving.current = true; setBusy(true); setError('');
    try {
      const sealed = await Promise.all(next.map(sealAuthorAlternative));
      await onPersistAlternatives(sealed);
      const selectedBefore = alternatives.find(item => item.id === selectedAlternativeId);
      const selectedAfter = sealed.find(item => item.id === selectedAlternativeId);
      if (selectedBefore && selectedAfter && selectedBefore.headVersionId !== selectedAfter.headVersionId) {
        delete branchDrafts.current[selectedBefore.id];
        const acknowledged = headAlternativeContent(selectedAfter);
        setContentDraft(acknowledged);
        setStructurePlanDraft(selectedAfter.versions.find(version => version.id === selectedAfter.headVersionId)?.structurePlan);
        setBranchName(selectedAfter.name);
        setSelectedEntityId(current => acknowledged.entities.some(entity => entity.id === current && !entity.deletedAt) ? current : acknowledged.entities.find(entity => !entity.deletedAt)?.id ?? '');
        setBranchJsonBuffers({}); setInvalidFieldKeys([]);
        setDraftOwner({ id: selectedAfter.id, headVersionId: selectedAfter.headVersionId });
      }
      setAlternatives(sealed);
      if (selectId) setSelectedAlternativeId(selectId);
      return true;
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : '別案を保存できませんでした。');
      return false;
    } finally { saving.current = false; setBusy(false); }
  };

  const createBranch = async () => {
    try {
      const created = forkAuthorAlternative(project, newBranchName, { snapshotId: sourceSnapshotId || null });
      const next = [...alternatives, created];
      if (await persist(next, created.id)) { setNewBranchName(''); setSourceSnapshotId(''); }
    } catch (reason) { setError(reason instanceof Error ? reason.message : '別案を作成できませんでした。'); }
  };

  const updateMetadata = async (updates: Partial<Pick<AuthorAlternative, 'name' | 'status'>>) => {
    if (!alternative) return;
    const updated = { ...alternative, ...updates, updatedAt: new Date().toISOString() };
    await persist(alternatives.map(item => item.id === updated.id ? updated : item));
  };

  const updateEntity = (update: (entity: Entity) => Entity) => {
    if (!contentDraft || !selectedEntity) return;
    const edited = update(selectedEntity);
    const entities = contentDraft.entities.map(entity => entity.id === edited.id ? edited : entity);
    setContentDraft({ ...contentDraft,
      entities: remapEditedTextReferences(entities, selectedEntity, edited),
      relations: remapEditedTextRelationReferences(contentDraft.relations, selectedEntity, edited),
    });
  };

  const reloadSavedVersion = () => {
    if (!alternative) return;
    const content = headAlternativeContent(alternative);
    delete branchDrafts.current[alternative.id];
    setContentDraft(content);
    setStructurePlanDraft(alternative.versions.find(version => version.id === alternative.headVersionId)?.structurePlan);
    setBranchName(alternative.name);
    setSelectedEntityId(content.entities.find(entity => !entity.deletedAt)?.id ?? '');
    setNewSceneChapterId(''); setVersionLabel('別案の編集'); setError('');
    setBranchJsonBuffers({}); setInvalidFieldKeys([]); setNewEntityKind('scene'); setNewEntityName('');
    setDraftOwner({ id: alternative.id, headVersionId: alternative.headVersionId });
  };

  const saveVersion = async () => {
    if (!alternative || !contentDraft) return;
    if (invalidFieldKeys.length || Object.values(branchJsonBuffers).some(fields => Object.keys(fields).length)) { setError('入力中の未確定な値を確認してから版を保存してください。'); return; }
    if (draftOwner?.headVersionId !== alternative.headVersionId) { setError('保存済みの別案が更新されています。入力を確認し、最新の版と比較してから保存してください。'); return; }
    if (structurePlanDraft) {
      const planIssues = validateStructurePlan(structurePlanDraft, contentDraft);
      if (planIssues.length) { setError(`構成計画を保存できません：${planIssues.slice(0, 3).join('、')}`); return; }
    }
    const candidate: ProjectData = { ...project, ...contentDraft, snapshots: project.snapshots, history: project.history };
    const validation = validateProject(candidate, { worldSnapshots });
    if (!validation.ok) {
      setError(`別案を保存できません。内容を確認してください：${validation.issues.slice(0, 4).map(issue => issue.message).join('、')}`);
      return;
    }
    const updated = appendAlternativeVersion({ ...alternative, name: branchName.trim() || alternative.name }, contentDraft, versionLabel, new Date().toISOString(), undefined, structurePlanDraft);
    await persist(alternatives.map(item => item.id === updated.id ? updated : item));
  };

  const rollbackHead = async (versionId: string) => {
    if (!alternative) return;
    const updated = rollbackAlternativeHead(alternative, versionId);
    await persist(alternatives.map(item => item.id === updated.id ? updated : item));
  };

  const addBranchScene = () => {
    if (!contentDraft) return;
    const next = cloneContent(contentDraft);
    const scene = createEntity(next.projectId, 'scene', '別案の場面');
    scene.status = 'alternate';
    if (newSceneChapterId) {
      const chapter = next.entities.find((entity): entity is Entity<'chapter'> => entity.kind === 'chapter' && entity.id === newSceneChapterId);
      if (chapter) { chapter.data.sceneIds = [...chapter.data.sceneIds, scene.id]; scene.data.chapterId = chapter.id; }
    }
    next.entities.push(scene);
    setContentDraft(next); setSelectedEntityId(scene.id);
  };

  const addBranchEntity = () => {
    if (!contentDraft) return;
    const entity = createEntity(contentDraft.projectId, newEntityKind, newEntityName.trim() || `別案の${KIND_LABELS[newEntityKind]}`);
    entity.status = 'alternate';
    setContentDraft({ ...contentDraft, entities: [...contentDraft.entities, entity] });
    setSelectedEntityId(entity.id); setNewEntityName('');
  };
  const formProject = contentDraft ? { ...project, ...contentDraft, entities: [...contentDraft.entities, ...resolvePinnedWorlds(contentDraft, worldSnapshots).worlds.flatMap(world => world.entities)] } : project;
  const updateFieldValidity = (entityId: string, key: string, valid: boolean) => setInvalidFieldKeys(current => {
    const marker = `${entityId}:${key}`, present = current.includes(marker);
    return valid ? present ? current.filter(item => item !== marker) : current : present ? current : [...current, marker];
  });
  const updateFieldBuffer = (entityId: string, key: string, raw: string | undefined) => setBranchJsonBuffers(current => {
    if (current[entityId]?.[key] === raw) return current;
    const fields = { ...(current[entityId] ?? {}) };
    if (raw === undefined) delete fields[key]; else fields[key] = raw;
    const next = { ...current }; if (Object.keys(fields).length) next[entityId] = fields; else delete next[entityId];
    return next;
  });

  const adoptSelected = async () => {
    if (!alternative || !onCommitCanonical || saving.current) return;
    saving.current = true; setBusy(true); setError('');
    try {
      const result = applyAlternativeChanges(project, alternative, changes, selectedChangeKeys);
      const validation = validateProject(result.project, { worldSnapshots });
      if (!validation.ok) {
        setError(`採用後の正本に不整合があります：${validation.issues.slice(0, 4).map(issue => issue.message).join('、')}`);
        return;
      }
      const saved = await onCommitCanonical(result.project, alternative, result.receipt);
      const applied = saved.persistedAlternative.applyReceipts.find(item => item.id === result.receipt.id);
      if (saved.persistedAlternative.id !== alternative.id || applied?.appliedRevision !== saved.savedRevision) throw new Error('正本と作者別案の採用記録を同時に保存できませんでした。保存状態を確認してください。');
      setAlternatives(current => current.map(item => item.id === saved.persistedAlternative.id ? saved.persistedAlternative : item));
      setSelectedChangeKeys(new Set());
    } catch (reason) { setError(reason instanceof Error ? reason.message : '別案を正本へ採用できませんでした。'); }
    finally { saving.current = false; setBusy(false); }
  };

  const toggleChange = (change: AlternativeChange, checked: boolean) => {
    setSelectedChangeKeys(current => {
      const next = new Set(current);
      if (checked) next.add(change.key); else next.delete(change.key);
      return next;
    });
  };

  const displayValue = (value: unknown) => displayDiffValue(value, project);
  const currentBaseLabel = activeSnapshot ? `公開版「${activeSnapshot.versionLabel}」` : '現在の正本';

  return <section className="author-alternative-studio" aria-label="作者別案と正本の管理"><fieldset disabled={busy} className="writing-save-fields">
    <div className="section-heading"><h2>作者別案</h2><span>ゲーム内の選択分岐とは別の制作案です</span></div>
    <div className="alternative-panel">
      <h3>別案を作る</h3>
      <label className="form-field"><span>別案の名前</span><input aria-label="新しい別案の名前" value={newBranchName} onChange={event => setNewBranchName(event.target.value)} placeholder="例：門を開けない展開"/></label>
      <PagedSelect label="別案の分岐元" scope={`${project.projectId}:alternatives:source`} value={sourceSnapshotId} onChange={setSourceSnapshotId}
        emptyLabel="現在の正本" items={project.snapshots.map(snapshot => ({ id: snapshot.id, label: `公開版：${snapshot.versionLabel}` }))}/>
      <button type="button" className="button secondary small" disabled={busy || !newBranchName.trim()} onClick={() => void createBranch()}>分岐して別案を作る</button>
    </div>

    {!alternatives.length ? <p className="field-hint">別案はまだありません。正本や公開版を保ったまま、新しい制作案を作れます。</p> : <>
      <PagedSelect label="編集する作者別案" scope={`${project.projectId}:alternatives:edit`} value={selectedAlternativeId} onChange={setSelectedAlternativeId}
        items={alternatives.map(item => ({ id: item.id, label: `${item.name} · ${BRANCH_STATUS_LABEL[item.status]}` }))}/>
      {alternative && contentDraft && draftOwner?.id === alternative.id && <>
        <div className="alternative-heading">
          <label className="form-field"><span>別案の名前</span><input aria-label="別案の名前" value={branchName} onChange={event => setBranchName(event.target.value)}/></label>
          <label className="form-field"><span>別案の状態</span><select aria-label="別案の状態" value={alternative.status} onChange={event => void updateMetadata({ status: event.target.value as AuthorAlternative['status'] })}>
            {(Object.keys(BRANCH_STATUS_LABEL) as AuthorAlternative['status'][]).map(status => <option key={status} value={status}>{BRANCH_STATUS_LABEL[status]}</option>)}
          </select></label>
        </div>
        <button type="button" className="text-button" onClick={reloadSavedVersion}>未保存の編集を破棄して保存済みの版に戻す</button>
        <p className="field-hint">分岐元：{alternative.sourceSnapshotId ? `公開版 ${alternative.sourceSnapshotId.slice(-6)}` : '現在の正本'} · 基準 revision {alternative.baseRevision}。正本や公開版をこの画面で直接編集しません。</p>

        <div className="alternative-panel">
          <div className="alternative-heading"><h3>別案の本文・場面</h3><button type="button" className="button secondary small" onClick={addBranchScene}>別案の場面を作る</button></div>
          {chapters.length > 0 && <PagedSelect label="新しい場面を加える章" scope={`${project.projectId}:${alternative.id}:alternatives:scene-chapter`} value={newSceneChapterId}
            onChange={setNewSceneChapterId} emptyLabel="章に所属させない" items={chapters.map(chapter => ({ id: chapter.id, label: chapter.name || '名称未設定の章' }))}/>}
          <PagedSelect label="別案内の編集対象" scope={`${project.projectId}:${alternative.id}:alternatives:entity`} value={selectedEntityId} onChange={setSelectedEntityId}
            items={entities.map(entity => ({ id: entity.id, label: entityLabel(entity) }))}/>
          <div className="form-row">
            <label className="form-field"><span>別案に追加する情報の種類</span><select aria-label="別案に追加する情報の種類" value={newEntityKind} onChange={event => setNewEntityKind(event.target.value as EntityKind)}>{Object.entries(KIND_LABELS).map(([kind, label]) => <option key={kind} value={kind}>{label}</option>)}</select></label>
            <label className="form-field"><span>追加する情報の名前</span><input aria-label="別案に追加する情報の名前" value={newEntityName} onChange={event => setNewEntityName(event.target.value)}/></label>
            <button type="button" className="button secondary small" onClick={addBranchEntity}>別案に情報を追加</button>
          </div>
          {selectedEntity && <div className="alternative-editor-fields" key={`${alternative.id}:${draftOwner.headVersionId}:${selectedEntity.id}`}>
            <label className="form-field"><span>名称</span><input aria-label="別案内の情報名" value={selectedEntity.name} onChange={event => updateEntity(entity => ({ ...entity, name: event.target.value }))}/></label>
            <label className="form-field"><span>制作状態</span><select aria-label="別案内の情報の制作状態" value={selectedEntity.status} onChange={event => updateEntity(entity => ({ ...entity, status: event.target.value as Status }))}>
              {(Object.keys(ENTITY_STATUS_LABEL) as Status[]).map(status => <option key={status} value={status}>{ENTITY_STATUS_LABEL[status]}</option>)}
            </select></label>
            {selectedEntity.kind === 'scene' && <>
              <label className="form-field"><span>要約</span><DataField field={{ key: 'summary', type: 'rich', label: '別案内の場面要約' }} value={selectedEntity.data.summary} project={{ ...project, ...contentDraft }} entity={selectedEntity} onValid={() => {}} onChange={value => updateEntity(entity => entity.kind === 'scene' ? { ...entity, data: { ...entity.data, summary: value } } as Entity : entity)}/></label>
              <label className="form-field"><span>本文</span><DataField field={{ key: 'body', type: 'rich', label: '別案内の場面本文' }} value={selectedEntity.data.body} project={{ ...project, ...contentDraft }} entity={selectedEntity} onValid={() => {}} onChange={value => updateEntity(entity => entity.kind === 'scene' ? { ...entity, data: { ...entity.data, body: value } } as Entity : entity)}/></label>
            </>}
            {selectedEntity.kind === 'chapter' && <label className="form-field"><span>章の要約</span><DataField field={{ key: 'summary', type: 'rich', label: '別案内の章要約' }} value={selectedEntity.data.summary} project={{ ...project, ...contentDraft }} entity={selectedEntity} onValid={() => {}} onChange={value => updateEntity(entity => entity.kind === 'chapter' ? { ...entity, data: { ...entity.data, summary: value } } as Entity : entity)}/></label>}
            {(FIELD_SPECS[selectedEntity.kind] ?? []).filter(field => !(selectedEntity.kind === 'scene' && ['body', 'summary'].includes(field.key) || selectedEntity.kind === 'chapter' && field.key === 'summary')).map(field => <label className="form-field" key={`${alternative.id}:${selectedEntity.id}:${field.key}`}>
              <span>{field.label}</span><DataField field={field} value={(selectedEntity.data as unknown as Record<string, unknown>)[field.key]} entity={selectedEntity} project={formProject}
                rawOverride={branchJsonBuffers[selectedEntity.id]?.[field.key]} onInvalidRaw={raw => updateFieldBuffer(selectedEntity.id, field.key, raw)}
                onValid={valid => updateFieldValidity(selectedEntity.id, field.key, valid)} onChange={value => updateEntity(entity => ({ ...entity, data: { ...entity.data, [field.key]: value } } as Entity))}/>
            </label>)}
            {onOpenEntity && project.entities.some(entity => entity.id === selectedEntity.id) && <button type="button" className="text-button" onClick={() => onOpenEntity(selectedEntity.id)}>同じIDの正本情報を開く</button>}
          </div>}
          <div className="reference-controls">
            <input aria-label="別案の版名" value={versionLabel} onChange={event => setVersionLabel(event.target.value)} placeholder="版の説明"/>
            <button type="button" className="button primary small" disabled={busy} onClick={() => void saveVersion()}>別案を新しい版として保存</button>
          </div>
        </div>

        <StructurePreview key={`${alternative.id}:${head?.id ?? ''}`} project={{ ...project, ...contentDraft }} initialPlan={head?.structurePlan}
          onPlanChange={setStructurePlanDraft} onApplyToDraft={next => setContentDraft(projectContent(next))}/>

        <div className="alternative-panel">
          <div className="alternative-heading"><h3>別案の版履歴</h3><span>保存済み {alternative.versions.length}版</span></div>
          <WindowedList items={[...alternative.versions].reverse()} scope={`${project.projectId}:${alternative.id}:alternatives:versions`} label="別案の版履歴" as="ol" selectedId={alternative.headVersionId} followSelected={false}
            searchText={version => `${version.label} ${version.createdAt}`} render={version => <li key={version.id}>
            <span>{version.label} · {new Date(version.createdAt).toLocaleString()}</span>
            {version.id === alternative.headVersionId ? <strong>現在の版</strong> : <button type="button" className="text-button" disabled={busy} onClick={() => void rollbackHead(version.id)}>この版を現在に戻す</button>}
          </li>}/>
          {head && <p className="field-hint">現在の版「{head.label}」を編集しても、過去の別案版は残ります。</p>}
        </div>

        {head && <details className="alternative-panel">
          <summary>保存済みの別案を章順で試読</summary>
          <p className="field-hint">保存済みの版「{head.label}」を読みます。未保存の編集は、版を保存してから試読へ反映してください。</p>
          <ChapterReadingView key={`${alternative.id}:${head.id}`} project={{ ...head.content, history: [], snapshots: project.snapshots }} worldSnapshots={worldSnapshots} currentVersionLabel={`保存済みの別案 · ${head.label}`}/>
        </details>}

        <div className="alternative-panel">
          <div className="alternative-heading"><h3>正本との差分</h3><span>{currentBaseLabel}との比較</span></div>
          {!changes.length && <p className="field-hint">この別案には正本との差分がありません。</p>}
          <WindowedList items={changes.map(change => ({ ...change, id: change.key }))} scope={`${project.projectId}:${alternative.id}:alternatives:diffs`} label="正本との差分" className="alternative-diff-list"
            searchText={change => change.label} render={change => <div className={`alternative-diff-row ${change.conflict ? 'alternative-conflict' : ''}`} key={change.key}>
              <label><input type="checkbox" checked={selectedChangeKeys.has(change.key)} disabled={change.conflict || !onCommitCanonical} onChange={event => toggleChange(change, event.target.checked)}/>
                <span><strong>{change.label}</strong><p>正本：{displayValue(change.canonicalValue)} → 別案：{displayValue(change.alternativeValue)}</p>
                  {change.conflict && <small>分岐元の後に正本側も変更された項目です。別案を最新の正本から分岐し直して確認してください。</small>}
                </span>
              </label>
            </div>}/>
          <button type="button" className="button primary small" disabled={busy || !onCommitCanonical || !selectedChangeKeys.size} onClick={() => void adoptSelected()}>選択した変更を正本へ採用</button>
          {!onCommitCanonical && <p className="field-hint">正本へ採用するには、正本・別案・適用記録を同じ保存処理で確定するホスト連携が必要です。</p>}
          {alternative.applyReceipts.length > 0 && <p className="field-hint">正本へ採用した記録 {alternative.applyReceipts.length}件 · 最後の適用 revision {alternative.applyReceipts.at(-1)?.appliedRevision ?? '未設定'}</p>}
        </div>
      </>}
    </>}
    {error && <p className="field-error" role="alert">{error}</p>}
    <p className="field-hint">別案は完全保存ファイルにも保持されます。本編へ採用するときは、取り込む変更を選んで確認してください。</p>
  </fieldset></section>;
}
