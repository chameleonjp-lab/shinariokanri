import { acknowledgeSettingsDraft, settingsDraftChanged, type ProjectSettingsDraft } from './ui/projectSettingsDraft';
import { reconcileSavedDrafts, updateJsonBuffer } from './ui/draftState';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { ContentAnchor, Entity, EntityKind, ProjectData, ProjectSnapshot, Relation, Tick } from './domain/types';
import { createDemoProject, createEntity, createProject, KIND_LABELS, newId, collectReferences } from './domain/model';
import { remapEditedTextReferences, remapEditedTextRelationReferences } from './domain/text';
import { deletionImpact } from './domain/maintenance';
import { WorldPanel } from './ui/WorldPanel';
import { effectiveWorldContent } from './domain/world';
import { resolvePinnedWorlds } from './domain/pinnedWorlds';
import { adoptedWorldEntityIds, mergeWorldSources } from './domain/worldSources';
import { addChangeReviews } from './domain/changeReviews';
import { scenarioStore, type AssetInput } from './storage';
import { EmptyState, Icon, Modal, normalizeSearch, downloadBytes, safeFileName, type IconName, STATUS_LABELS } from './ui/components';
import { EntityEditor } from './ui/EntityEditor';
import { CatalogPanel } from './ui/CatalogPanel';
import { useWorkspaceView } from './ui/useWorkspaceView';
import { SnapshotAnchorPreview } from './ui/SnapshotAnchorPreview';
import type { WorkspacePreferences } from './ui/viewPreferences';
import { EntityCards, KindPicker, ChapterList, BranchList, Relationships, ProductionBoard } from './ui/Lists';
import { Timeline } from './ui/Timeline';
import { WritingWorkspace, ChapterReadingView } from './ui/WritingWorkspace';
import { AuthorAlternativeStudio, acknowledgeAlternativeWorkspaceDraft, hasUnsavedAlternativeWorkspaceDraft, type AuthorAlternativeWorkspaceDraft } from './ui/AuthorAlternativeStudio';
import { recordAlternativeApplication } from './domain/writingWorkspace';
import { sealAuthorAlternative } from './domain/authorAlternativeIntegrity';
import { Reader } from './ui/Reader';
import { BackupPanel, ExportPanel, ProjectInfo, HistoryPanel } from './ui/WorkPage';
import { dataOf, labelOf } from './ui/Fields';

type Page = 'timeline' | 'structure' | 'materials' | 'search' | 'work';
const NAV: { key: Page; label: string; icon: IconName; description: string }[] = [
  { key: 'timeline', label: '年表', icon: 'timeline', description: '物語の時間と、そこで起きたこと。' },
  { key: 'structure', label: '構成', icon: 'structure', description: '章から場面へ。物語の道筋を育てる。' },
  { key: 'materials', label: '資料', icon: 'people', description: '人物と世界の情報を、ひとつの作品に。' },
  { key: 'search', label: '検索', icon: 'search', description: '本文も、設定も。作品の中から見つける。' },
  { key: 'work', label: '作品', icon: 'folder', description: '作品を保存し、いつでも続きを書けるように。' },
];
const STRUCTURE_TABS = [['chapters', '章・本文'], ['alternatives', '作者別案'], ['chapterReading', '章の試読'], ['branch', '分岐'], ['state', '状態'], ['foreshadow', '伏線'], ['reader', '試読・検査'], ['production', '制作']] as const;
const WORK_TABS = [['backup', '完全保存・復元'], ['export', '目的別出力'], ['history', '変更履歴'], ['settings', '作品の設定']] as const;
function readPreference(key: string, fallback = '') { try { return localStorage.getItem(key) || fallback; } catch { return fallback; } }
function setPreference(key: string, value: string) { try { localStorage.setItem(key, value); } catch { /* Editing and saving do not depend on personal view preferences. */ } }

export default function App() {
  const [projects, setProjects] = useState<ProjectData[]>([]);
  const [loading, setLoading] = useState(true);
  const [library, setLibrary] = useState(true);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [hiddenPages, setHiddenPages] = useState<Page[]>([]);
  const [page, setPage] = useState<Page>('timeline');
  const [structureTab, setStructureTab] = useState('chapters');
  const [workTab, setWorkTab] = useState('backup');
  const [timelineTab, setTimelineTab] = useState('timeline');
  const [worldRequestedSection, setWorldRequestedSection] = useState<'histories' | 'maps'>();
  const [worldRegistry, setWorldRegistry] = useState<Record<string, ProjectData>>({});
  const [worldTick, setWorldTick] = useState<Tick | null>();
  const [worldCheckpoint, setWorldCheckpoint] = useState('');
  const [worldPlace, setWorldPlace] = useState<string | null>(null);
  const worldSources = useMemo(() => mergeWorldSources(projects, worldRegistry), [projects, worldRegistry]);
  const [kind, setKind] = useState<EntityKind>('character');
  const [pinnedAnchor, setPinnedAnchor] = useState<ContentAnchor | null>(null);
  const [pinnedSourceProject, setPinnedSourceProject] = useState<ProjectData | null>(null);
  const [navigationTarget, setNavigationTarget] = useState<{ anchor: ContentAnchor; fieldPath?: string } | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const alternativeDraftAcknowledgements = useRef<Record<string, Array<{ before: Array<{ id: string; headVersionId: string }>; after: Array<{ id: string; headVersionId: string }> }>>>({});
  const reconcileAlternativeEditor = (projectId: string, draft: AuthorAlternativeWorkspaceDraft) => (alternativeDraftAcknowledgements.current[projectId] ?? []).reduce((current, ack) => acknowledgeAlternativeWorkspaceDraft(current, ack.before, ack.after), draft);
  const [alternativeDrafts, setAlternativeDrafts] = useState<Record<string, AuthorAlternativeWorkspaceDraft>>({});
  const [settingsDrafts, setSettingsDrafts] = useState<Record<string, ProjectSettingsDraft>>({});
  const [settingsSaving, setSettingsSaving] = useState<Record<string, boolean>>({});
  const [drafts, setDrafts] = useState<Record<string, Entity>>({});
  const [jsonBuffers, setJsonBuffers] = useState<Record<string, Record<string, string>>>({});
  const [query, setQuery] = useState('');
  const [searchKind, setSearchKind] = useState('all');
  const [statusFilter, setStatusFilter] = useState('all');
  const [newName, setNewName] = useState('');
  const [newKind, setNewKind] = useState<EntityKind>('character');
  const [newEntityName, setNewEntityName] = useState('');
  const [addData, setAddData] = useState<Record<string, unknown>>({});
  const [addOpen, setAddOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [recoverOpen, setRecoverOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [theme, setTheme] = useState(readPreference('scenario-theme', 'system'));
  const [online, setOnline] = useState(navigator.onLine);
  const projectRef = useRef<ProjectData | null>(null);
  const activeIdRef = useRef(activeId);
  activeIdRef.current = activeId;
  const libraryRef = useRef(library), importOpenRef = useRef(importOpen);
  libraryRef.current = library; importOpenRef.current = importOpen;
  const viewIntent = useRef({ signature: '', epoch: 0 });
  const viewSignature = JSON.stringify([library, activeId, page, workTab, structureTab, timelineTab, importOpen, selectedId, query, searchKind, statusFilter, kind, worldTick, worldCheckpoint, worldPlace]);
  if (viewIntent.current.signature !== viewSignature) viewIntent.current = { signature: viewSignature, epoch: viewIntent.current.epoch + 1 };
  const importViewEpoch = viewIntent.current.epoch;
  const project = projects.find(p => p.projectId === activeId) || null;
  const selected = selectedId && (drafts[(project?.projectId ?? "") + ":" + selectedId] || project?.entities.find(e => e.id === selectedId));
  if (project && (!projectRef.current || projectRef.current.projectId !== project.projectId || BigInt(project.revision) > BigInt(projectRef.current.revision))) projectRef.current = project;
  const fixedWorldContents = useMemo(() => Object.fromEntries([...worldSources.flatMap(source => source.snapshots.map(snapshot => [snapshot.id, snapshot.content])), ...Object.values(worldRegistry).flatMap(source => source.snapshots.map(snapshot => [snapshot.id, snapshot.content]))]), [worldSources, worldRegistry]);
  const referenceProject = useMemo(() => {
    if (!project) return undefined;
    const effective = effectiveWorldContent(project, worldSources);
    const worldSnapshots = resolvePinnedWorlds(project, fixedWorldContents).references.flatMap(reference => worldSources.find(source => source.projectId === reference.projectId)?.snapshots.filter(snapshot => snapshot.id === reference.immutableSnapshotId) ?? []);
    return { ...project, ...effective, snapshots: [...project.snapshots, ...worldSnapshots] };
  }, [project, worldSources, fixedWorldContents]);
  const borrowedSelection = useMemo(() => {
    if (!project || !selectedId || selected) return undefined;
    for (const reference of resolvePinnedWorlds(project, fixedWorldContents).references) {
      const source = worldSources.find(world => world.projectId === reference.projectId), snapshot = source?.snapshots.find(value => value.id === reference.immutableSnapshotId && value.contentHash === reference.contentHash);
      if (source && (snapshot?.content.entities.some(entity => entity.id === selectedId) || snapshot?.content.relations.some(relation => relation.id === selectedId))) return { source, anchor: { entityId: selectedId, sourceVersionId: reference.immutableSnapshotId } };
    }
    return undefined;
  }, [project, selectedId, selected, fixedWorldContents, worldSources]);
  const queue = useRef<Promise<unknown>>(Promise.resolve());
  const previousScroll = useRef(0);
  const editorHistory = useRef<string[]>([]);

  useEffect(() => {
    let live = true;
    void scenarioStore.listProjectsForEditing().then(found => { if (!live) return; setProjects(found); const last = readPreference('scenario-last-project'); if (found.some(p => p.projectId === last)) { setActiveId(last); setLibrary(false); } }).catch(e => { if (live) setError((e as Error).message || '端末内の作品を読み込めませんでした。'); }).finally(() => { if (live) setLoading(false); });
    void scenarioStore.listWorldSnapshots().then(found => { if (live) setWorldRegistry(found); }).catch(e => { if (live) setError((e as Error).message); });
    return () => { live = false; };
  }, []);
  useEffect(() => { setPreference('scenario-theme', theme); const media = window.matchMedia('(prefers-color-scheme: dark)'); const update = () => document.documentElement.dataset.theme = theme === 'system' ? media.matches ? 'dark' : 'light' : theme; update(); media.addEventListener('change', update); return () => media.removeEventListener('change', update); }, [theme]);
  useEffect(() => { const update = () => setOnline(navigator.onLine); window.addEventListener('online', update); window.addEventListener('offline', update); return () => { window.removeEventListener('online', update); window.removeEventListener('offline', update); }; }, []);
  useEffect(() => { const handler = (e: BeforeUnloadEvent) => { if (Object.values(settingsDrafts).some(settingsDraftChanged) || Object.values(settingsSaving).some(Boolean) || Object.keys(drafts).length || Object.keys(jsonBuffers).length || Object.entries(alternativeDrafts).some(([id, draft]) => hasUnsavedAlternativeWorkspaceDraft(draft, projects.find(item => item.projectId === id)?.authorAlternatives ?? []))) { e.preventDefault(); e.returnValue = ''; } }; window.addEventListener('beforeunload', handler); return () => window.removeEventListener('beforeunload', handler); }, [drafts, jsonBuffers, alternativeDrafts, projects, settingsDrafts, settingsSaving]);

  const restoreView = useCallback((next: WorkspacePreferences, selected: string | null) => {
    setWorldTick(next.worldTick); setWorldCheckpoint(next.worldCheckpoint ?? ''); setWorldPlace(next.worldPlace ?? null); setHiddenPages(next.hiddenPages ?? []); setPage(next.hiddenPages?.includes(next.page) ? 'work' : next.page); setStructureTab(next.structureTab); setWorkTab(next.workTab); setTimelineTab(next.timelineTab); setKind(next.kind); setSearchKind(next.searchKind); setStatusFilter(next.statusFilter); setQuery(next.query); setSelectedId(selected); editorHistory.current = [];
  }, []);
  const navigation = useWorkspaceView(library ? null : activeId, { page, structureTab, workTab, timelineTab, kind, searchKind, statusFilter, query, hiddenPages, worldTick, worldCheckpoint, worldPlace, scrollY: 0 } as WorkspacePreferences, selectedId, restoreView);

  const applyProject = useCallback((updated: ProjectData) => {
    if (activeIdRef.current === updated.projectId || !activeIdRef.current) projectRef.current = updated;
    setProjects(previous => previous.some(p => p.projectId === updated.projectId) ? previous.map(p => p.projectId === updated.projectId ? updated : p) : [...previous, updated]);
  }, []);
  const enqueue = <T,>(operation: () => Promise<T>): Promise<T> => { const next = queue.current.then(operation, operation); queue.current = next.catch(() => undefined); return next; };
  const persist = async (candidate: ProjectData, reason: string, assets?: AssetInput[]) => {
    const latest = projectRef.current;
    const withReviews = latest?.projectId === candidate.projectId ? addChangeReviews(latest, candidate) : candidate;
    const result = await scenarioStore.saveProject(withReviews, { reason, assets, includeHistory: false });
    applyProject(result.project);
    return result.project;
  };
  const saveProject = (candidate: ProjectData, reason: string, assets?: AssetInput[]) => enqueue(async () => {
    const latest = projectRef.current;
    if (latest?.projectId === candidate.projectId && latest.revision !== candidate.revision) throw new Error('別の変更が保存されました。この画面の入力を保持し、現在版を確認して再試行してください。');
    return persist(candidate, reason, assets);
  });
  const pinWorld = (world: ProjectData, snapshotId: string, candidate: ProjectData) => enqueue(async () => {
    const latest = projectRef.current;
    if (!latest || latest.projectId !== candidate.projectId || latest.revision !== candidate.revision) throw new Error('差分確認後に作品が変わりました。入力を保持して、固定版の差分を再確認してください。');
    const dependencies = { ...worldRegistry };
    for (const source of worldSources) for (const snapshot of source.snapshots) dependencies[snapshot.id] ??= source;
    const result = await scenarioStore.saveProject(addChangeReviews(latest, candidate), { reason: '確認した共通世界の固定版・採用設定を保存', includeHistory: false, worldPin: { world, snapshotId, dependencies } });
    applyProject(result.project); setWorldRegistry(await scenarioStore.listWorldSnapshots()); return result.project;
  });
  const changeWorldPoint = (at: Tick | null, checkpointId: string) => { setWorldTick(at); setWorldCheckpoint(checkpointId); };
  const saveEntity = (entity: Entity) => enqueue(async () => {
    const latest = projectRef.current;
    if (!latest || latest.projectId !== entity.projectId) throw new Error('この入力の作品を開いてから保存してください。');
    const existing = latest.entities.find(e => e.id === entity.id);
    if (existing && existing.revision !== entity.revision) throw new Error('この情報が別の操作で更新されました。入力は保持されています。現在版と比較してから再試行してください。');
    let entities = existing ? latest.entities.map(e => e.id === entity.id ? entity : e) : [...latest.entities, entity];
    if (existing) entities = remapEditedTextReferences(entities, existing, entity);
    if (entity.kind === 'scene') {
      entities = entities.map(e => { if (e.kind !== 'chapter') return e; const belongs = e.id === entity.data.chapterId; return { ...e, data: { ...e.data, sceneIds: belongs ? e.data.sceneIds.includes(entity.id) ? e.data.sceneIds : [...e.data.sceneIds, entity.id] : e.data.sceneIds.filter(id => id !== entity.id) } }; });
    } else if (entity.kind === 'chapter') {
      entities = entities.map(e => e.kind === 'scene' ? entity.data.sceneIds.includes(e.id) ? { ...e, data: { ...e.data, chapterId: entity.id } } : e.data.chapterId === entity.id ? { ...e, data: { ...e.data, chapterId: null } } : e : e.kind === 'chapter' && e.id !== entity.id ? { ...e, data: { ...e.data, sceneIds: e.data.sceneIds.filter(id => !entity.data.sceneIds.includes(id)) } } : e);
    }
    const relations = existing ? remapEditedTextRelationReferences(latest.relations, existing, entity) : latest.relations;
    const saved = await persist({ ...latest, entities, relations }, `${existing ? '編集' : '追加'} · ${KIND_LABELS[entity.kind]}「${entity.name || '無題'}」`);
    const stored = saved.entities.find(e => e.id === entity.id)!;
    // Completion belongs to the submitted record even if its editor was closed.
    setDrafts(previous => reconcileSavedDrafts(previous, entity, stored));
    return stored;
  });
  const saveMany = (entities: Entity[], reason: string, assets?: AssetInput[], snapshots?: ProjectSnapshot[], expectedRevision?: string) => enqueue(async () => {
    const latest = projectRef.current;
    if (!latest || entities.some(e => e.projectId !== latest.projectId)) throw new Error('対象の作品を開いてください。');
    if (expectedRevision !== undefined && latest.revision !== expectedRevision) throw new Error('影響確認後に作品が更新されました。入力を保持して差分を再確認してください。');
    if (new Set(entities.map(entity => entity.id)).size !== entities.length) throw new Error('保存する情報のIDが重複しています。');
    for (const entity of entities) { const prior = latest.entities.find(candidate => candidate.id === entity.id); if (prior && prior.revision !== entity.revision) throw new Error('対象が別の操作で更新されました。入力を保持し、現在版を確認して再試行してください。'); }
    const next = [...latest.entities]; entities.forEach(entity => { const i = next.findIndex(e => e.id === entity.id); if (i >= 0) next[i] = entity; else next.push(entity); });
    await persist({ ...latest, entities: next, snapshots: [...latest.snapshots, ...(snapshots || [])] }, reason, assets);
  });
  const saveRelation = (relation: Relation) => enqueue(async () => {
    const latest = projectRef.current;
    if (!latest || relation.projectId !== latest.projectId) throw new Error('対象の作品を開いてください。');
    const prior = latest.relations.find(r => r.id === relation.id);
    if (prior && prior.revision !== relation.revision) throw new Error('関係の版が更新されています。現在の関係を開いて比較してください。');
    await persist({ ...latest, relations: prior ? latest.relations.map(r => r.id === relation.id ? relation : r) : [...latest.relations, relation] }, `${prior ? '関係を編集' : '関係を追加'} · ${relation.relationType}`);
  });
  const archiveEntity = async (entity: Entity) => {
    const latest = projectRef.current;
    if (!latest) return;
    const impact = deletionImpact(latest, entity.id).filter(item => !item.snapshotId);
    if (impact.length) throw new Error(`${impact.length}件の参照があるためアーカイブできません。${impact.slice(0, 3).map(i => i.sourceName).join('、')}の参照先を更新してから再試行してください。`);
    await saveEntity({ ...entity, deletedAt: new Date().toISOString(), deletionOperationId: newId() });
  };

  const openProject = (target: ProjectData) => { void scenarioStore.listWorldSnapshots().then(setWorldRegistry).catch(e => setError((e as Error).message)); projectRef.current = target; setActiveId(target.projectId); activeIdRef.current = target.projectId; setPreference('scenario-last-project', target.projectId); setLibrary(false); setSelectedId(null); setPinnedAnchor(null); setPinnedSourceProject(null); setWorldTick(undefined); setWorldCheckpoint(''); setWorldPlace(null); setWorldRequestedSection(undefined); setNavigationTarget(null); editorHistory.current = []; setMenuOpen(false); setError(''); setNotice(''); };
  const created = async (demo = false) => {
    setBusy(true); setError('');
    try { const candidate = demo ? createDemoProject() : createProject(newName.trim()); const saved = await persist(candidate, demo ? 'サンプル作品を作成' : '作品を作成'); openProject(saved); setNewName(''); }
    catch (e) { setError((e as Error).message); }
    finally { setBusy(false); }
  };
  const openEntity = (id: string, originProjectId?: string, sourceVersionId?: string) => {
    if (sourceVersionId) { const source = worldSources.find(world => (!originProjectId || world.projectId === originProjectId) && world.snapshots.some(snapshot => snapshot.id === sourceVersionId)); const snapshot = source?.snapshots.find(value => value.id === sourceVersionId); if (source && (snapshot?.content.entities.some(entity => entity.id === id) || snapshot?.content.relations.some(relation => relation.id === id))) { setSelectedId(id); setNavigationTarget(null); setPinnedSourceProject(source); setPinnedAnchor({ entityId: id, sourceVersionId }); return; } }
    if (project && (!project.entities.some(entity => entity.id === id) || originProjectId && originProjectId !== project.projectId)) {
      for (const reference of resolvePinnedWorlds(project, fixedWorldContents).references) {
        if (originProjectId && reference.projectId !== originProjectId) continue;
        const source = worldSources.find(world => world.projectId === reference.projectId);
        const snapshot = source?.snapshots.find(value => value.id === reference.immutableSnapshotId && value.contentHash === reference.contentHash);
        if (source && (snapshot?.content.entities.some(entity => entity.id === id) || snapshot?.content.relations.some(relation => relation.id === id))) { setSelectedId(id); setNavigationTarget(null); setPinnedSourceProject(source); setPinnedAnchor({ entityId: id, sourceVersionId: snapshot.id }); return; }
      }
      if (originProjectId) { setError('参照先の固定版が見つかりません。世界版の選択を確認してください。'); return; }
    }

    if (selectedId && selectedId !== id) editorHistory.current.push(selectedId);
    if (!selectedId) previousScroll.current = window.scrollY;
    setSelectedId(id); setNavigationTarget(null); navigation.recordRecent(id);
    setNotice('');
    if (window.innerWidth < 768) window.scrollTo(0, 0);
  };
  const openTarget = (anchor: ContentAnchor, fieldPath?: string) => {
    if (anchor.sourceVersionId && anchor.sourceVersionId !== project?.projectId) { setPinnedSourceProject(project?.snapshots.some(snapshot => snapshot.id === anchor.sourceVersionId) ? null : worldSources.find(source => source.snapshots.some(snapshot => snapshot.id === anchor.sourceVersionId)) ?? null); setPinnedAnchor(anchor); return; }
    const line = anchor.lineId && project?.entities.find(entity => entity.id === anchor.lineId && entity.kind === 'dialogue_line');
    openEntity(line ? line.id : anchor.entityId); setNavigationTarget({ anchor, fieldPath });
  };
  const closeEntity = () => { const previous = editorHistory.current.pop(); setSelectedId(previous || null); if (!previous && window.innerWidth < 768) requestAnimationFrame(() => window.scrollTo(0, previousScroll.current)); };
  const navigate = (target: Page) => { setPage(target); setSelectedId(null); editorHistory.current = []; setMenuOpen(false); setError(''); setNotice(''); };
  const add = (targetKind: EntityKind = kind, initial: Record<string, unknown> = {}) => { setNewKind(targetKind); setNewEntityName(''); setAddData(initial); setAddOpen(true); };
  const beginEntity = () => { if (!project) return; const entity = createEntity(project.projectId, newKind, newEntityName, addData); setDrafts(previous => ({ ...previous, [entity.projectId + ":" + entity.id]: entity })); setAddOpen(false); editorHistory.current = []; openEntity(entity.id); };
  const onDraft = useCallback((entity: Entity, dirty: boolean) => setDrafts(previous => { if (dirty) return previous[entity.projectId + ":" + entity.id] === entity ? previous : { ...previous, [entity.projectId + ":" + entity.id]: entity }; if (!((entity.projectId + ":" + entity.id) in previous)) return previous; const next = { ...previous }; delete next[entity.projectId + ":" + entity.id]; return next; }), []);
  const currentNav = NAV.find(n => n.key === page)!;
  const activeEntities = project?.entities.filter(e => !e.deletedAt) || [];
  const activeAlternativeDraft = activeId ? alternativeDrafts[activeId] : undefined;
  const unsavedAlternativeIds = activeAlternativeDraft ? Object.keys(activeAlternativeDraft.branches).filter(id => hasUnsavedAlternativeWorkspaceDraft({ ...activeAlternativeDraft, newBranchName: '', branches: { [id]: activeAlternativeDraft.branches[id]! } }, project?.authorAlternatives ?? [])) : [];
  const alternativeDraftCount = unsavedAlternativeIds.length + (activeAlternativeDraft?.newBranchName.trim() ? 1 : 0);
  const activeSettingsDraft = project ? settingsDrafts[project.projectId] : undefined;
  const settingsDraftCount = activeSettingsDraft && settingsDraftChanged(activeSettingsDraft) ? 1 : 0;
  const draftCount = new Set([...Object.values(drafts).filter(e => e.projectId === activeId).map(e => e.id), ...Object.keys(jsonBuffers).filter(key => key.startsWith(activeId + ":")).map(key => key.slice((activeId ?? "").length + 1))]).size + alternativeDraftCount + settingsDraftCount;
  const unsavedIds = [...new Set([...Object.values(drafts).filter(e => e.projectId === activeId).map(e => e.id), ...Object.keys(jsonBuffers).filter(key => key.startsWith(activeId + ":")).map(key => key.slice((activeId ?? "").length + 1))])];

  if (loading) return <div className="loading-screen" role="status"><div className="brand-mark">S</div><h1>シナリオ管理</h1><span className="spinner"/>端末内の作品を読み込んでいます</div>;
  if (library || !project) return <div className="library-page"><header className="library-header"><a href="#main-content" className="skip-link">本文へ移動</a><div className="brand"><span className="brand-mark">S</span><span>シナリオ管理</span></div><button className="icon-button" aria-label="配色を切り替え" onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}><Icon name={theme === 'dark' ? 'sun' : 'moon'}/></button></header><main id="main-content" className="library-content"><div className="library-intro"><span className="eyebrow">YOUR STORY, CONNECTED.</span><h1>物語をつなぐ。<br/><span>次の一行へ。</span></h1><p>人物、出来事、本文、分岐。<br/>作品のすべてを、ひとつのノートに。</p></div><div className="library-workspace"><section className="new-project-card"><span className="panel-icon"><Icon name="spark" size={28}/></span><h2>新しい作品をはじめる</h2><p>まずはタイトルだけ。詳細はあとから。</p><form onSubmit={e => { e.preventDefault(); if (newName.trim()) void created(); }}><label htmlFor="new-project-name">作品名</label><input id="new-project-name" autoComplete="off" placeholder="あなたの物語のタイトル" value={newName} onChange={e => setNewName(e.target.value)}/><button type="submit" className="button primary" disabled={busy || !newName.trim()}>{busy ? '保存中…' : '作品を作成'}<Icon name="arrow" size={18}/></button></form><div className="library-secondary-actions"><button type="button" className="text-button" disabled={busy} onClick={() => void created(true)}>サンプルで試す<Icon name="arrow" size={16}/></button><button type="button" className="text-button" onClick={() => setImportOpen(true)}><Icon name="upload" size={16}/>保存ファイルを読み込む</button></div></section><section className="library-projects"><div className="section-heading"><h2>あなたの作品</h2><span className="count-pill">{projects.length}</span></div>{projects.length ? <div className="project-cards">{projects.map((p, i) => <button type="button" key={p.projectId} className="project-card" onClick={() => openProject(p)}><span className={`project-cover cover-${i % 4}`}><Icon name="folder" size={28}/></span><span><strong>{p.name}</strong><small>{p.entities.filter(e => !e.deletedAt).length}件の情報 · 端末内保存</small></span><Icon name="arrow" size={20}/></button>)}</div> : <div className="first-project-note"><Icon name="folder" size={32}/><p>はじめての作品が、ここに並びます。</p><span>作成した作品はこのブラウザーの端末内に保存されます。</span></div>}</section></div>{error && <div className="error-notice" role="alert">{error}<button className="text-button" onClick={() => { setLoading(true); void scenarioStore.listProjectsForEditing().then(setProjects).catch(e => setError((e as Error).message)).finally(() => setLoading(false)); }}>読み込みを再試行</button></div>}<footer className="library-footer"><span><span className="save-dot"/>作品はこのブラウザーに保存されます</span><span>設定した同期接続先はありません</span></footer></main>{importOpen && <Modal title="作品ファイルを読み込む" wide onClose={() => setImportOpen(false)}><BackupPanel project={null} projects={projects} onImported={p => { applyProject(p); if (viewIntent.current.epoch === importViewEpoch && libraryRef.current && importOpenRef.current && activeIdRef.current === activeId) { openProject(p); setImportOpen(false); } }}/></Modal>}</div>;

  const structureKind = structureTab === 'state' ? 'variable' : structureTab === 'foreshadow' ? 'foreshadow' : structureTab === 'branch' ? 'flow_node' : structureTab === 'production' ? 'production_task' : 'chapter';
  const addKind = page === 'timeline' ? 'event' : page === 'structure' ? structureKind : page === 'materials' ? kind : 'note';
  return <div className={`app-shell ${selected ? 'has-detail' : ''}`}><a href="#main-content" className="skip-link">本文へ移動</a>{menuOpen && <button className="sidebar-backdrop" aria-label="ナビゲーションを閉じる" onClick={() => setMenuOpen(false)}/>}<aside className={`sidebar ${menuOpen ? 'sidebar-open' : ''}`} aria-label="主要ナビゲーション"><div className="brand"><span className="brand-mark">S</span><span>シナリオ管理</span><button className="icon-button sidebar-close" aria-label="メニューを閉じる" onClick={() => setMenuOpen(false)}><Icon name="close"/></button></div><button className="project-switch" onClick={() => setLibrary(true)}><span className="project-mini-cover"><Icon name="folder" size={19}/></span><span><strong>{project.name}</strong><small>作品一覧へ</small></span><span>⌄</span></button><span className="sidebar-caption">WORKSPACE</span><nav>{NAV.filter(n => n.key !== 'work' && !hiddenPages.includes(n.key)).map(n => <button key={n.key} className={`nav-item ${page === n.key ? 'active' : ''}`} aria-current={page === n.key ? 'page' : undefined} onClick={() => navigate(n.key)}><Icon name={n.icon}/>{n.label}{n.key === 'materials' && <span>{activeEntities.filter(e => e.kind === 'character').length}</span>}</button>)}</nav><div className="sidebar-quick"><span className="sidebar-caption">QUICK NOTE</span><button className="quick-note" onClick={() => add('note')}><Icon name="plus" size={18}/><span>アイデアを残す</span></button></div><div className="sidebar-bottom"><button className={`nav-item ${page === 'work' ? 'active' : ''}`} onClick={() => navigate('work')}><Icon name="folder"/>作品・保存</button><div className="sidebar-storage"><span className="save-dot"/><div><strong>この端末に保存</strong><small>{online ? '同期接続先は未設定' : 'オフラインで作業中'}</small></div></div><button className="theme-toggle" onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}><Icon name={theme === 'dark' ? 'sun' : 'moon'} size={16}/>{theme === 'dark' ? '明るい配色にする' : '暗い配色にする'}</button></div></aside>
    <div className="app-main"><header className="topbar"><div className="topbar-left"><button className="icon-button mobile-menu" aria-label="メニューを開く" aria-expanded={menuOpen} onClick={() => setMenuOpen(true)}><Icon name="menu"/></button><span className="breadcrumb-project" title={project.name}>{project.name}</span><span className="breadcrumb-divider">/</span><span>{currentNav.label}</span></div><div className="topbar-status" role="status"><span className={`save-dot ${draftCount ? 'pending' : ''}`}/><>{draftCount ? <button type="button" className="unsaved-status-button" onClick={() => setRecoverOpen(true)}>{draftCount}件の未保存入力</button> : <span>端末内保存済み</span>}</><span className="offline-pill">{online ? 'LOCAL' : 'OFFLINE'}</span></div></header>
      <main id="main-content" className="workspace"><div className="workspace-heading"><div><div className="eyebrow">{page === 'timeline' ? 'STORY TIMELINE' : page === 'structure' ? 'STORY STRUCTURE' : page === 'materials' ? 'STORY ELEMENTS' : page === 'search' ? 'FIND IN YOUR STORY' : 'YOUR PROJECT'}</div><h1>{currentNav.label}</h1><p>{currentNav.description}</p></div>{page !== 'work' && <button className="button primary add-button" onClick={() => add(addKind as EntityKind)}><Icon name="plus" size={20}/>{page === 'timeline' ? '出来事を追加' : page === 'materials' ? `${KIND_LABELS[kind]}を追加` : '追加'}</button>}</div>
        {error && <div className="error-notice" role="alert">{error}</div>}{notice && <div className="success-notice" role="status">{notice}</div>}
        {page === 'structure' && <div className="section-tabs" role="tablist" aria-label="構成の表示">{STRUCTURE_TABS.map(([key, label]) => <button key={key} role="tab" aria-selected={structureTab === key} className={structureTab === key ? 'active' : ''} onClick={() => { setStructureTab(key); setSelectedId(null); editorHistory.current = []; }}>{label}</button>)}</div>}
        {page === 'work' && <div className="section-tabs" role="tablist" aria-label="作品の管理">{WORK_TABS.map(([key, label]) => <button key={key} role="tab" aria-selected={workTab === key} className={workTab === key ? 'active' : ''} onClick={() => { setWorkTab(key); setSelectedId(null); }}>{label}</button>)}</div>}
        {page === 'timeline' && <div className="section-tabs" role="tablist" aria-label="年表と関係">{[['timeline', '世界内年表'], ['relations', '関係表・図'], ['world', '世界・地図・履歴']].map(([key, label]) => <button role="tab" aria-selected={timelineTab === key} className={timelineTab === key ? 'active' : ''} key={key} onClick={() => { setWorldRequestedSection(undefined); setTimelineTab(key); }}>{label}</button>)}</div>}
        {page === 'materials' && <div className="materials-filter"><div className="filter-pills">{[['character', '人物'], ['group', 'グループ'], ['place', '場所'], ['item', '物品'], ['lore', '設定'], ['note', 'メモ']].map(([key, label]) => <button type="button" key={key} className={kind === key ? 'active' : ''} onClick={() => { setKind(key as EntityKind); setSelectedId(null); }}>{label}<span>{activeEntities.filter(e => e.kind === key).length}</span></button>)}</div><KindPicker value={kind} onChange={value => { setKind(value as EntityKind); setSelectedId(null); }}/></div>}
        <details className="navigation-marks"><summary>最近開いた情報・お気に入り</summary>
          {selectedId && <button type="button" className="button secondary small" onClick={() => navigation.toggleFavorite(selectedId)}>{navigation.marks.favoriteIds.includes(selectedId) ? 'お気に入りから外す' : 'お気に入りに登録'}</button>}
          {([['お気に入り', navigation.marks.favoriteIds], ['最近開いた情報', navigation.marks.recentIds]] as const).map(([title, ids]) => <section key={title}><h2>{title}</h2>{ids.map(id => project.entities.find(entity => entity.id === id && !entity.deletedAt)).filter((entity): entity is Entity => !!entity).map(entity => <button type="button" className="reference-link" key={entity.id} onClick={() => openEntity(entity.id)}>{labelOf(entity)} <small>{KIND_LABELS[entity.kind]}</small></button>)}</section>)}
        </details>
        <div className="workspace-layout"><div className="workspace-list">
          {page === 'timeline' && (timelineTab === 'timeline' ? <Timeline key={project.projectId} project={project} selectedId={selectedId} onSelect={openEntity} onAdd={() => add('event')} onSaveProject={saveProject} referenceEntities={effectiveWorldContent(project, worldSources).entities.filter(entity => entity.projectId !== project.projectId)} referenceRelations={effectiveWorldContent(project, worldSources).relations.filter(relation => relation.projectId !== project.projectId)} adoptedReferenceIds={adoptedWorldEntityIds(project)} referenceCalendars={effectiveWorldContent(project, worldSources).calendars} placeFilterId={worldPlace} worldTick={worldTick} checkpointId={worldCheckpoint} onViewPointChange={changeWorldPoint} onShowMap={(placeId, eventId) => { setWorldRequestedSection('maps'); setWorldPlace(placeId); if (eventId) setSelectedId(eventId); setTimelineTab('world'); }} onShowRelationships={(id, at) => { setSelectedId(id); setWorldTick(at); setTimelineTab('relations'); }} onShowWorldHistory={(id, at) => { setSelectedId(id); setWorldTick(at); setWorldPlace(null); setWorldRequestedSection('histories'); setTimelineTab('world'); }}/> : timelineTab === 'world' ? <WorldPanel key={project.projectId} project={project} worlds={worldSources} onSaveProject={saveProject} onOpen={openEntity} selectedPlaceId={worldPlace} selectedEntityId={selectedId} requestedSection={worldRequestedSection} worldTick={worldTick} checkpointId={worldCheckpoint} onViewPointChange={changeWorldPoint} onPinWorld={pinWorld} onShowTimeline={(placeId, eventId) => { setWorldPlace(placeId ?? null); if (eventId) setSelectedId(eventId); setTimelineTab('timeline'); }} onShowEntityTimeline={(id, at) => { setSelectedId(id); setWorldTick(at); setWorldPlace(null); setTimelineTab('timeline'); }}/> : <Relationships project={project} referenceEntities={effectiveWorldContent(project, worldSources).entities.filter(entity => entity.projectId !== project.projectId)} referenceRelations={effectiveWorldContent(project, worldSources).relations.filter(relation => relation.projectId !== project.projectId)} referenceCalendars={effectiveWorldContent(project, worldSources).calendars} onOpen={openEntity} onSave={saveRelation} onSaveProject={saveProject} selectedId={selectedId} worldTick={worldTick} checkpointId={worldCheckpoint} onViewPointChange={changeWorldPoint} onShowTimeline={(id, at) => { setSelectedId(id); setWorldTick(at); setWorldPlace(null); setTimelineTab('timeline'); }}/>)}
          {page === 'materials' && <><div className="list-heading"><h2>{KIND_LABELS[kind]}</h2><span>{activeEntities.filter(e => e.kind === kind).length}件</span></div><EntityCards key={kind} entities={activeEntities.filter(e => e.kind === kind)} project={project} selectedId={selectedId} onSelect={openEntity} onAdd={() => add(kind)}/></>}
          {page === 'structure' && structureTab === 'chapters' && <><WritingWorkspace project={project} onOpenEntity={openEntity} onSaveProject={saveProject}/><ChapterList project={project} selectedId={selectedId} onSelect={openEntity} onAdd={add} onSave={saveEntity}/></>}
          {page === 'structure' && structureTab === 'chapterReading' && <ChapterReadingView key={project.projectId} project={project} worldSnapshots={fixedWorldContents} onOpenEntity={openEntity} onOpenTarget={openTarget} onSaveMany={saveMany}/>}
          {page === 'structure' && structureTab === 'alternatives' && <AuthorAlternativeStudio key={project.projectId} project={project} alternatives={project.authorAlternatives ?? []} initialDraft={alternativeDrafts[project.projectId]} onDraftChange={draft => setAlternativeDrafts(current => ({ ...current, [project.projectId]: reconcileAlternativeEditor(project.projectId, draft) }))} worldSnapshots={fixedWorldContents} onOpenEntity={openEntity} onPersistAlternatives={async next => {
            const saved = await saveProject({ ...project, authorAlternatives: next }, '作者別案を保存');
            const acknowledgements = alternativeDraftAcknowledgements.current[project.projectId] ??= [];
            acknowledgements.push({ before: (project.authorAlternatives ?? []).map(({ id, headVersionId }) => ({ id, headVersionId })), after: (saved.authorAlternatives ?? []).map(({ id, headVersionId }) => ({ id, headVersionId })) });
            setAlternativeDrafts(current => current[project.projectId] ? { ...current, [project.projectId]: reconcileAlternativeEditor(project.projectId, current[project.projectId]!) } : current);
          }} onCommitCanonical={async (candidate, alternative, receipt) => {
            const expectedRevision = (BigInt(candidate.revision) + 1n).toString();
            const sealed = await sealAuthorAlternative(recordAlternativeApplication(alternative, receipt, expectedRevision));
            const saved = await saveProject({ ...candidate, authorAlternatives: (project.authorAlternatives ?? []).map(item => item.id === sealed.id ? sealed : item) }, '作者別案の選択した変更を正本と採用記録へ一括保存');
            const persistedAlternative = saved.authorAlternatives?.find(item => item.id === sealed.id);
            if (!persistedAlternative) throw new Error('作者別案の採用記録が保存結果にありません。');
            return { savedRevision: saved.revision, persistedAlternative };
          }}/>}
          {page === 'structure' && structureTab === 'branch' && <BranchList key={project.projectId} project={project} selectedId={selectedId} onSelect={openEntity} onAdd={add} onSaveProject={saveProject} onOpenTarget={openTarget}/>}
          {page === 'structure' && structureTab === 'state' && <><div className="list-toolbar"><div className="filter-pills">{[['variable', '状態変数'], ['effect', '効果'], ['assertion', '事実・認識'], ['external_contract', '外部契約']].map(([key, label]) => <button key={key} className={kind === key ? 'active' : ''} onClick={() => setKind(key as EntityKind)}>{label}</button>)}</div><button className="button secondary small" onClick={() => add(['variable', 'effect', 'assertion', 'external_contract'].includes(kind) ? kind : 'variable')}><Icon name="plus" size={16}/>状態の情報を追加</button></div><EntityCards entities={activeEntities.filter(e => e.kind === (['variable', 'effect', 'assertion', 'external_contract'].includes(kind) ? kind : 'variable'))} project={project} selectedId={selectedId} onSelect={openEntity} onAdd={() => add('variable')}/></>}
          {page === 'structure' && structureTab === 'foreshadow' && <><div className="info-notice">伏線の問いと作者の意図を分けて記録します。開示は世界日時と別に、本文や分岐の提示位置へ結びます。</div><div className="list-toolbar"><div className="filter-pills">{[['foreshadow', '伏線'], ['disclosure', '手掛かり・回収']].map(([key, label]) => <button className={kind === key || key === 'foreshadow' && kind !== 'disclosure' ? 'active' : ''} key={key} onClick={() => setKind(key as EntityKind)}>{label}</button>)}</div><button className="button secondary small" onClick={() => add(kind === 'disclosure' ? 'disclosure' : 'foreshadow')}><Icon name="plus" size={16}/>伏線の情報を追加</button></div><EntityCards entities={activeEntities.filter(e => e.kind === (kind === 'disclosure' ? 'disclosure' : 'foreshadow'))} project={project} selectedId={selectedId} onSelect={openEntity} onAdd={() => add('foreshadow')}/></>}
          {page === 'structure' && structureTab === 'reader' && <Reader key={project.projectId} project={project} worldSnapshots={fixedWorldContents} onOpen={openEntity} onOpenTarget={openTarget} onSaveMany={saveMany}/>}
          {page === 'structure' && structureTab === 'production' && <ProductionBoard project={project} onSelect={openEntity} onAdd={() => add('production_task')} onSave={saveEntity}/>}
          {page === 'search' && <CatalogPanel key={project.projectId} project={project} selectedId={selectedId} onOpen={openEntity} onSave={saveEntity} onSaveProject={saveProject} onSaveMany={saveMany} onOpenTarget={openTarget} onOpenField={(entityId, fieldPath) => openTarget({ entityId }, fieldPath)} searchState={{ text: query, kind: searchKind, status: statusFilter }} onSearchStateChange={next => { setQuery(next.text); setSearchKind(next.kind); setStatusFilter(next.status); }}/>}
          {page === 'work' && workTab === 'backup' && <BackupPanel project={project} projects={projects} onImported={p => { applyProject(p); if (viewIntent.current.epoch === importViewEpoch && !libraryRef.current && activeIdRef.current === project.projectId && p.projectId !== project.projectId) openProject(p); }}/>}
          {page === 'work' && workTab === 'export' && <ExportPanel project={project} onSave={saveEntity} onOpen={openEntity}/>}
          {page === 'work' && workTab === 'history' && <HistoryPanel project={project} onUpdated={applyProject} onOpen={openEntity}/>}
          {page === 'work' && workTab === 'settings' && <><details className="settings-card"><summary>この端末で使う画面</summary><p>画面を隠しても作品のデータは保持します。ここで再表示できます。</p>{NAV.filter(item => item.key !== 'work').map(item => <label className="check-label" key={item.key}><input type="checkbox" checked={!hiddenPages.includes(item.key)} onChange={event => setHiddenPages(previous => event.target.checked ? previous.filter(key => key !== item.key) : [...previous, item.key])}/>{item.label}</label>)}</details><ProjectInfo key={project.projectId} project={project} initialDraft={settingsDrafts[project.projectId]} saving={!!settingsSaving[project.projectId]} onDraftChange={draft => setSettingsDrafts(current => ({ ...current, [draft.projectId]: draft }))} onSavingChange={saving => setSettingsSaving(current => ({ ...current, [project.projectId]: saving }))} onDraftSaved={(submitted, saved, consumedSnapshotName) => setSettingsDrafts(current => { const retained = current[submitted.projectId]; if (!retained) return current; const next = acknowledgeSettingsDraft(retained, submitted, saved, consumedSnapshotName); const result = { ...current }; if (settingsDraftChanged(next)) result[submitted.projectId] = next; else delete result[submitted.projectId]; return result; })} onSaveProject={saveProject} onSaveEntities={saveMany} onOpen={openEntity} theme={theme} setTheme={setTheme}/></>}
        </div>{selected && <EntityEditor key={project.projectId + ":" + selected.id} entity={selected} project={project} referenceProject={referenceProject} isNew={!project.entities.some(e => e.id === selected.id)} hasUnsavedDraft={!!drafts[project.projectId + ":" + selected.id]} onSave={saveEntity} onClose={closeEntity} onDraft={onDraft} jsonBuffers={jsonBuffers[project.projectId + ":" + selected.id] || {}} onJsonBuffer={(field, raw, expectedRaw) => setJsonBuffers(previous => updateJsonBuffer(previous, project.projectId + ":" + selected.id, field, raw, expectedRaw))} onArchive={archiveEntity} onOpen={openEntity} onSaveMany={saveMany} onSaveProject={saveProject} onOpenTarget={openTarget} navigationTarget={navigationTarget}/>}{borrowedSelection && <aside className="detail-panel" aria-label="共通世界の固定情報"><div className="detail-actions"><button className="button secondary" onClick={closeEntity}>詳細を閉じる</button></div><p className="field-hint">参照する世界の固定版を表示しています。</p><SnapshotAnchorPreview project={borrowedSelection.source} anchor={borrowedSelection.anchor} worldSnapshots={fixedWorldContents}/></aside>}{selectedId && !selected && !borrowedSelection && <aside className="detail-panel"><EmptyState title="対象を開けませんでした">対象が削除・変更された可能性があります。変更履歴から確認できます。</EmptyState><button className="button secondary" onClick={() => { setSelectedId(null); setPage('work'); setWorkTab('history'); }}>履歴を開く</button></aside>}</div>
      </main><footer className="workspace-footer"><span>端末内の作品 · 版 {project.revision}</span><span>{activeEntities.length}件の情報 · {project.relations.filter(r => !r.deletedAt).length}件の関係</span></footer>
    </div>{recoverOpen && <Modal title="未保存の入力" onClose={() => setRecoverOpen(false)}><p>この作業中に保持している入力です。保存済みの作品にまだ反映されていません。</p>{unsavedIds.map(id => { const entity=drafts[project.projectId + ":" + id] || project.entities.find(e=>e.id===id); if(!entity)return null; return <div className="unsaved-entry" key={id}><button className="reference-link" onClick={()=>{setRecoverOpen(false);openEntity(id);}}><Icon name="note" size={16}/>{labelOf(entity)}<small>入力へ戻る</small></button><button className="text-button" onClick={()=>downloadBytes(JSON.stringify({entity,invalidJsonInput:jsonBuffers[project.projectId + ":" + id] || {}},null,2),`${safeFileName(entity.name)}-未保存入力.json`)}><Icon name="download" size={16}/>一時ファイルへ保存</button></div>;})}{settingsDraftCount > 0 && <div className="unsaved-entry"><button className="reference-link" onClick={() => { setRecoverOpen(false); setPage('work'); setWorkTab('settings'); }}>作品設定の入力へ戻る{settingsSaving[project.projectId] && <small>保存待ち</small>}</button><button className="text-button" onClick={() => downloadBytes(JSON.stringify(activeSettingsDraft, null, 2), `${safeFileName(project.name)}-作品設定の未保存入力.json`)}>一時ファイルへ保存</button></div>}{alternativeDraftCount > 0 && <div className="unsaved-entry"><button className="reference-link" onClick={() => { setRecoverOpen(false); setPage('structure'); setStructureTab('alternatives'); }}>作者別案の入力へ戻る <small>{alternativeDraftCount}件</small></button><button className="text-button" onClick={() => downloadBytes(JSON.stringify(activeAlternativeDraft, null, 2), `${safeFileName(project.name)}-作者別案の未保存入力.json`)}>一時ファイルへ保存</button></div>}</Modal>}{pinnedAnchor && <Modal title="固定版の参照先" wide onClose={() => setPinnedAnchor(null)}><SnapshotAnchorPreview project={pinnedSourceProject ?? project} anchor={pinnedAnchor} worldSnapshots={fixedWorldContents}/>{pinnedSourceProject && <p className="field-hint">この作品が参照する不変の世界版です。世界作品の現在の編集とは区別して表示しています。</p>}</Modal>}{addOpen && <Modal title="情報を追加" onClose={() => setAddOpen(false)}><form onSubmit={e => { e.preventDefault(); beginEntity(); }}><div className="form-field"><label>情報の種類</label><KindPicker value={newKind} onChange={value => { setNewKind(value as EntityKind); setAddData({}); }}/></div><div className="form-field"><label htmlFor="new-entity-name">名前</label><input id="new-entity-name" autoFocus value={newEntityName} onChange={e => setNewEntityName(e.target.value)} placeholder={`${KIND_LABELS[newKind]}の名前`}/></div><p className="field-hint">必須の参照先がある種類は、次の画面で詳細を入力して保存できます。</p><div className="modal-actions"><button type="button" className="button secondary" onClick={() => setAddOpen(false)}>中止</button><button type="submit" className="button primary">編集を始める<Icon name="arrow" size={16}/></button></div></form></Modal>}
  </div>;
}
