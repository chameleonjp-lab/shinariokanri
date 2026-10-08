import { checkChapterForeshadows, chapterNarrativeOccurrences } from '../domain/presentation';
import { reuseTargetAnchor } from '../domain/reuse';
import { useEffect, useMemo, useRef, useState } from 'react';
import type { ContentAnchor, Entity, ProjectContent, ProjectData, ProjectSnapshot } from '../domain/types';
import {
  STRUCTURE_TEMPLATES,
  applyStructureOrderPreview,
  buildCharacterArc,
  buildChapterReadingSequence,
  buildStoryLanes,
  buildTensionProfile,
  moveChapterPresentation,
  moveScenePresentation,
  moveSceneWithinPresentation,
  previewStructureOrder,
  type ArcOrder,
  type StoryLaneAxis,
  type StructurePlan,
  type StructureOrderPreview,
  type StructureTemplate,
} from '../domain/writingWorkspace';
import { createEntity, KIND_LABELS, newId } from '../domain/model';
import { NarrativeClaims } from './NarrativeClaims';
import { DialoguePresentation } from './DialoguePresentation';
import { backChapterReading, pinChapterReadingRecord, presentNextChapterScene, replayChapterReading, startChapterReading, type ChapterReadingSession } from '../domain/presentation';
import { jsonBytes, sha256 } from '../storage/json';
import { fieldText } from './components';
import { labelOf, RichTextView } from './Fields';
import './WritingWorkspace.css';

const AXIS_LABELS: Record<StoryLaneAxis, string> = {
  character: '人物', organization: '組織', place: '場所', chapter: '章', thread: '物語の筋',
};

export interface WritingWorkspaceProps {
  project: ProjectData;
  initialAxis?: StoryLaneAxis;
  onOpenEntity: (id: string) => void;
  /** The host saves this as a canonical project command, including revision/history updates. */
  onSaveProject?: (project: ProjectData, reason: string) => unknown | Promise<unknown>;
}

function sceneTitle(project: ProjectData, sceneId: string): string {
  return project.entities.find(entity => entity.id === sceneId)?.name || '名称未設定の場面';
}

function laneAxisControl(axis: StoryLaneAxis, onChange: (next: StoryLaneAxis) => void) {
  return <label className="form-field">
    <span>物語の並べ方</span>
    <select aria-label="物語の並べ方" value={axis} onChange={event => onChange(event.target.value as StoryLaneAxis)}>
      {(Object.keys(AXIS_LABELS) as StoryLaneAxis[]).map(value => <option value={value} key={value}>{AXIS_LABELS[value]}</option>)}
    </select>
  </label>;
}

export function WritingWorkspace({ project, initialAxis = 'character', onOpenEntity, onSaveProject }: WritingWorkspaceProps) {
  const [axis, setAxis] = useState<StoryLaneAxis>(initialAxis);
  const [busy, setBusy] = useState(false), [error, setError] = useState(''), saving = useRef(false);
  const saveCandidate = async (candidate: ProjectData, reason: string) => {
    if (!onSaveProject || saving.current) return;
    saving.current = true; setBusy(true); setError('');
    try { await onSaveProject(candidate, reason); }
    catch (cause) { setError(cause instanceof Error ? cause.message : '構成の変更を保存できませんでした。入力を確認して再試行してください。'); }
    finally { saving.current = false; setBusy(false); }
  };
  const [arcOrder, setArcOrder] = useState<ArcOrder>('presentation');
  const lanes = useMemo(() => buildStoryLanes(project, axis), [project, axis]);
  const characters = project.entities.filter((entity): entity is Entity<'character'> => entity.kind === 'character' && !entity.deletedAt);
  const chapters = project.entities.filter((entity): entity is Entity<'chapter'> => entity.kind === 'chapter' && !entity.deletedAt);
  const canEdit = Boolean(onSaveProject);

  const removeFromThread = async (sceneId: string, threadId: string) => {
    if (!onSaveProject) return;
    const next = { ...structuredClone(project), history: project.history };
    const scene = next.entities.find((entity): entity is Entity<'scene'> => entity.id === sceneId && entity.kind === 'scene');
    if (!scene) return;
    scene.data.threadIds = (scene.data.threadIds ?? []).filter(id => id !== threadId);
    await saveCandidate(next, '場面を物語の筋から外す');
  };

  return <section className="writing-workspace" aria-label="物語の構成"><fieldset disabled={busy} className="writing-save-fields">
    <div className="section-heading"><h2>物語を並べて見る</h2><span>同じ場面IDを切り替えて表示します</span></div>
    {laneAxisControl(axis, setAxis)}
    {axis === 'character' && <label className="form-field">
      <span>人物の変化を見る順</span>
      <select aria-label="人物の変化を見る順" value={arcOrder} onChange={event => setArcOrder(event.target.value as ArcOrder)}>
        <option value="presentation">読者への提示順</option><option value="world">世界内の時点</option>
      </select>
    </label>}
    {!lanes.length && <p className="field-hint">この軸に表示できる項目はありません。</p>}
    <div className="story-lanes">
      {lanes.map(lane => {
        const arc = lane.kind === 'character' ? buildCharacterArc(project, lane.id, arcOrder) : undefined;
        const sceneIds = arc ? arc.entries.map(entry => entry.scene.id) : lane.sceneIds;
        const actualChapter = lane.kind === 'chapter' ? chapters.find(chapter => chapter.id === lane.id) : undefined;
        return <section className="story-lane" key={lane.id} data-lane-id={lane.id}>
          <header className="story-lane-heading">
            <h3>{lane.label}</h3><span>{lane.sceneIds.length}場面</span>
            {lane.kind !== 'unassigned' && <button type="button" className="text-button" onClick={() => onOpenEntity(lane.id)}>{KIND_LABELS[lane.kind]}</button>}
            {axis === 'chapter' && actualChapter && onSaveProject && <span className="chapter-order-actions" aria-label={`${actualChapter.name || '章'}の提示順`}>
              <button type="button" className="text-button" aria-label={`${actualChapter.name || '章'}を上へ`} disabled={chapters.findIndex(chapter => chapter.id === actualChapter.id) === 0} onClick={() => void saveCandidate(moveChapterPresentation(project, actualChapter.id, -1), '章の提示順を変更')}>章を上へ</button>
              <button type="button" className="text-button" aria-label={`${actualChapter.name || '章'}を下へ`} disabled={chapters.findIndex(chapter => chapter.id === actualChapter.id) === chapters.length - 1} onClick={() => void saveCandidate(moveChapterPresentation(project, actualChapter.id, 1), '章の提示順を変更')}>章を下へ</button>
            </span>}
          </header>
          {!lane.sceneIds.length && <p className="field-hint">場面はまだありません。</p>}
          <ol className="story-lane-scenes">
            {sceneIds.map((sceneId, index) => {
              const scene = project.entities.find((entity): entity is Entity<'scene'> => entity.id === sceneId && entity.kind === 'scene');
              if (!scene) return null;
              const entry = arc?.entries.find(item => item.scene.id === sceneId);
              const memberIndex = actualChapter?.data.sceneIds.indexOf(sceneId) ?? -1;
              return <li key={sceneId} data-scene-id={sceneId}>
                <button type="button" className="story-scene-link" onClick={() => onOpenEntity(sceneId)}>
                  <strong>{index + 1}. {scene.name || '名称未設定の場面'}</strong>
                  <span>{fieldText(scene.data.summary) || '要約は未入力です。'}</span>
                </button>
                {entry && <section className="character-arc-record" aria-label={`${scene.name || '場面'}の人物変化`}>
                  <div className="character-arc-phase">
                    <h4>場面に入る前</h4>
                    <dl><dt>目的</dt><dd>{fieldText(entry.before.purpose) || '未入力'}</dd>
                      <dt>葛藤</dt><dd>{fieldText(entry.before.conflict) || '未入力'}</dd></dl>
                  </div>
                  <div className="character-arc-phase">
                    <h4>場面を終えた後</h4>
                    <dl><dt>変化・結果</dt><dd>{fieldText(entry.after.change) || '未入力'}</dd>
                      <dt>新しい情報</dt><dd>{fieldText(entry.after.newInformation) || '未入力'}</dd></dl>
                  </div>
                  {entry.worldTicks.length > 0 && <p className="character-arc-time"><strong>世界時点</strong> {entry.worldTicks.join('、')}</p>}
                </section>}
                <div className="story-lane-actions">
                  {axis === 'chapter' && actualChapter && memberIndex >= 0 && onSaveProject && <>
                    <button type="button" className="text-button" disabled={memberIndex === 0} onClick={() => void saveCandidate(moveSceneWithinPresentation(project, actualChapter.id, scene.id, -1), '章内の場面提示順を変更')}>前へ</button>
                    <button type="button" className="text-button" disabled={memberIndex === actualChapter.data.sceneIds.length - 1} onClick={() => void saveCandidate(moveSceneWithinPresentation(project, actualChapter.id, scene.id, 1), '章内の場面提示順を変更')}>後へ</button>
                  </>}
                  {axis === 'thread' && scene.data.threadIds?.includes(lane.id) && onSaveProject && <button type="button" className="text-button danger" onClick={() => void removeFromThread(scene.id, lane.id)}>この筋から外す</button>}
                  {axis === 'chapter' && chapters.length > 1 && onSaveProject && <label className="inline-move-control">章を移す
                    <select aria-label={`${scene.name || '場面'}の移動先の章`} value={scene.data.chapterId ?? ''} onChange={event => void saveCandidate(moveScenePresentation(project, scene.id, event.target.value || null, 999), '場面の所属章と提示順を変更')}>
                      {chapters.map(chapter => <option key={chapter.id} value={chapter.id}>{chapter.name || '名称未設定の章'}</option>)}
                      <option value="">章に所属させない</option>
                    </select>
                  </label>}
                </div>
              </li>;
            })}
          </ol>
          {lane.kind === 'character' && arc && <>
            <section className="character-arc-goals" aria-label={`${lane.label}の人物目標`}>
              <h4>人物の目的</h4>
              {!arc.goals.length ? <p className="field-hint">登録された目的はありません。</p> : <ul>
                {arc.goals.map(goal => <li key={goal.id}>
                  <strong>{goal.name || '名称未設定の目的'}</strong>
                  <p>{fieldText(goal.data.description) || '説明は未入力です。'}</p>
                  {goal.data.evidenceSceneIds?.length ? <ul className="goal-evidence-scenes" aria-label={`${goal.name || '人物の目的'}の根拠場面`}>
                    {goal.data.evidenceSceneIds.map(sceneId => {
                      const evidenceScene = project.entities.find((entity): entity is Entity<'scene'> => entity.kind === 'scene' && entity.id === sceneId && !entity.deletedAt);
                      return <li key={sceneId}>{evidenceScene
                        ? <button type="button" className="text-button" aria-label={`${goal.name || '人物の目的'}の根拠場面 ${evidenceScene.name || '名称未設定の場面'}を開く`} onClick={() => onOpenEntity(evidenceScene.id)}>{evidenceScene.name || '名称未設定の場面'}</button>
                        : <span>参照先の場面が見つかりません（{sceneId.slice(-6)}）</span>}</li>;
                    })}
                  </ul> : <p className="field-hint">根拠場面はまだ結び付いていません。</p>}
                </li>)}
              </ul>}
            </section>
            <p className="field-hint">人物の目的は{arc.goals.length}件です。場面の役割欄が空でも保存できます。</p>
          </>}
        </section>;
      })}
    </div>
    {!canEdit && <p className="field-hint">並べ替えや筋からの除外を行うには、保存先を指定してください。</p>}
    {busy && <p role="status">構成の変更を保存中…</p>}{error && <p role="alert" className="field-error">{error}</p>}
  </fieldset></section>;
}

export interface ChapterReadingViewProps {
  project: ProjectData;
  currentVersionLabel?: string;
  worldSnapshots?: Record<string, ProjectContent>;
  chapterIds?: readonly string[];
  /** A chosen route preserves its supplied order, including a deliberate revisit to a scene. */
  scenePath?: readonly string[];
  onOpenEntity?: (id: string) => void;
  onOpenTarget?: (anchor: ContentAnchor) => void;
  onSaveMany?: (entities: Entity[], reason: string, assets?: undefined, snapshots?: ProjectSnapshot[]) => Promise<void>;
}

export function ChapterReadingView({ project, chapterIds, scenePath, currentVersionLabel = '現在の編集稿', worldSnapshots = {}, onOpenEntity, onOpenTarget, onSaveMany }: ChapterReadingViewProps) {
  const [vertical, setVertical] = useState(false);
  const [contentVersionId, setContentVersionId] = useState('');
  const [worldTick, setWorldTick] = useState('');
  const selectedSnapshot = project.snapshots.find(snapshot => snapshot.id === contentVersionId);
  const readingSource = useMemo(() => selectedSnapshot ? { ...project, ...selectedSnapshot.content } : project, [project, selectedSnapshot]);
  const chapters = readingSource.entities.filter((entity): entity is Entity<'chapter'> => entity.kind === 'chapter' && !entity.deletedAt && entity.status !== 'rejected');
  const [selectedChapterIds, setSelectedChapterIds] = useState<string[]>(() => [...(chapterIds ?? chapters.map(chapter => chapter.id))]);
  const [routeMode, setRouteMode] = useState<'chapters' | 'custom'>(scenePath === undefined ? 'chapters' : 'custom');
  const [routeSceneIds, setRouteSceneIds] = useState<string[]>(() => [...(scenePath ?? [])]);
  const [routeSceneToAdd, setRouteSceneToAdd] = useState('');
  const [session, setSession] = useState<ChapterReadingSession | null>(null);
  const [busy, setBusy] = useState(false);
  const operation = useRef(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  useEffect(() => {
    if (contentVersionId && session?.contentVersionId === contentVersionId) {
      setSelectedChapterIds([...session.chapterIds]);
      setRouteMode('custom'); setRouteSceneIds([...session.sceneIds]);
    } else {
      setSelectedChapterIds(chapters.map(chapter => chapter.id));
      setRouteSceneIds([]);
    }
    setRouteSceneToAdd('');
  }, [contentVersionId]);
  const savedReadingRecords = project.entities.filter((entity): entity is Entity<'trace'> => entity.kind === 'trace' && !entity.deletedAt && entity.data.mode === 'chapters');

  const effectiveChapterIds = chapterIds ?? selectedChapterIds.filter(id => chapters.some(chapter => chapter.id === id));
  const effectiveRoute = scenePath !== undefined ? scenePath : routeMode === 'custom' ? routeSceneIds : undefined;
  const effectiveRouteMode = effectiveRoute === undefined ? 'chapters' : 'custom';
  const displayedRouteSceneIds = scenePath !== undefined ? scenePath : routeSceneIds;
  const sceneOptions = readingSource.entities.filter((entity): entity is Entity<'scene'> => entity.kind === 'scene' && !entity.deletedAt && entity.status !== 'rejected');
  const readingPreview = useMemo(() => {
    try { return { entries: buildChapterReadingSequence(readingSource, effectiveRouteMode === 'chapters' ? effectiveChapterIds : undefined, effectiveRoute), error: '' }; }
    catch (cause) { return { entries: [], error: cause instanceof Error ? cause.message : '選択した章や経路を確認してください。' }; }
  }, [readingSource, effectiveChapterIds, effectiveRouteMode, effectiveRoute]);
  const entries = readingPreview.entries;
  const openReadingTarget = (anchor: ContentAnchor, versionId = contentVersionId) => {
    const inherited = session ? reuseTargetAnchor(session.content, anchor) : anchor;
    const target = { ...inherited, ...(inherited.sourceVersionId ? {} : versionId && versionId !== project.projectId ? { sourceVersionId: versionId } : {}) };
    if (onOpenTarget) onOpenTarget(target);
    else if (!target.sourceVersionId || target.sourceVersionId === project.projectId) onOpenEntity?.(target.entityId);
  };
  const openReadingEntity = (id: string, versionId = contentVersionId) => openReadingTarget({ entityId: id }, versionId);
  const stale = !!session && session.contentVersionId === project.projectId && session.contentRevision !== project.revision;
  const currentOccurrence = session?.occurrences.at(-1);
  const presentedScene = currentOccurrence ? session?.content.entities.find((entity): entity is Entity<'scene'> => entity.kind === 'scene' && entity.id === currentOccurrence.entityId && !entity.deletedAt) : undefined;
  const setChapterSelected = (chapterId: string, checked: boolean) => setSelectedChapterIds(current => {
    const next = new Set(current);
    if (checked) next.add(chapterId); else next.delete(chapterId);
    return chapters.filter(chapter => next.has(chapter.id)).map(chapter => chapter.id);
  });
  const addRouteScene = () => {
    if (!sceneOptions.some(scene => scene.id === routeSceneToAdd)) return;
    setRouteMode('custom');
    setRouteSceneIds(current => [...current, routeSceneToAdd]);
    setRouteSceneToAdd('');
  };
  const moveRouteScene = (index: number, delta: -1 | 1) => setRouteSceneIds(current => {
    const destination = index + delta;
    if (destination < 0 || destination >= current.length) return current;
    const next = [...current]; [next[index], next[destination]] = [next[destination]!, next[index]!];
    return next;
  });
  const startReading = async () => {
    if (operation.current) return;
    operation.current = true;
    setError(''); setNotice(''); setBusy(true);
    try {
      setSession(await startChapterReading(project, {
        ...{ worldSnapshots, worldTick: worldTick || undefined },
        ...(effectiveRouteMode === 'custom' ? { sceneIds: [...(effectiveRoute ?? [])] } : { chapterIds: [...effectiveChapterIds] }),
        ...(contentVersionId ? { contentVersionId } : {}),
      }));
    } catch (reason) { setError(reason instanceof Error ? reason.message : '読書を開始できませんでした。'); }
    finally { operation.current = false; setBusy(false); }
  };
  const presentNext = () => {
    if (operation.current || !session || stale || session.status !== 'ready') return;
    const next = presentNextChapterScene(project, session);
    setSession(next);
    setError('');
  };
  const goBack = () => {
    if (operation.current || !session) return;
    setSession(backChapterReading(session));
    setError('');
  };
  const replayReadingRecord = async (trace: Entity<'trace'>) => {
    if (operation.current) return;
    operation.current = true; setBusy(true); setError(''); setNotice('');
    try {
      const checkpoint = project.entities.find((entity): entity is Entity<'checkpoint'> => entity.kind === 'checkpoint' && !entity.deletedAt && entity.id === trace.data.startCheckpointId);
      if (!checkpoint) throw new Error('保存した章読み通しの開始状態を確認できません。');
      const restored = await replayChapterReading(project, trace.data, checkpoint.data, { worldSnapshots });
      setSession(restored); setWorldTick(restored.worldTick ?? ''); setContentVersionId(trace.data.contentVersionId);
      setSelectedChapterIds([...restored.chapterIds]); setRouteMode('custom'); setRouteSceneIds([...restored.sceneIds]);
      setNotice('保存した章読み通しを再実行し、提示順と状態を検証しました。');
    } catch (reason) { setError(reason instanceof Error ? reason.message : '保存した章読み通しを再開できませんでした。'); }
    finally { operation.current = false; setBusy(false); }
  };
  const saveReadingRecord = async () => {
    if (operation.current || !session || !onSaveMany || !session.occurrences.length) return;
    operation.current = true;
    setBusy(true); setError(''); setNotice('');
    try {
      const checkpointId = newId(), snapshotId = newId();
      const record = pinChapterReadingRecord(session, { checkpointId, snapshotId }, project);
      const checkpoint = { ...createEntity(project.projectId, 'checkpoint', `章読み通しの開始状態 · ${new Date().toLocaleString('ja-JP')}`, record.checkpoint), id: checkpointId };
      const trace = createEntity(project.projectId, 'trace', `章読み通し経路 · ${session.occurrences.length}場面`, record.trace);
      const snapshot: ProjectSnapshot = { id: snapshotId, content: record.content, contentHash: await sha256(jsonBytes(record.content)), createdAt: new Date().toISOString(), versionLabel: `章読み通しの固定版 ${session.contentRevision}` };
      await onSaveMany([checkpoint, trace], '章読み通しの開始状態と提示記録を保存', undefined, [snapshot]);
      setNotice('開始状態と実際に提示した場面を保存しました。');
    } catch (reason) { setError(reason instanceof Error ? reason.message : '読み通し記録を保存できませんでした。'); }
    finally { operation.current = false; setBusy(false); }
  };
  return <section className="chapter-reading-view" aria-label="章順・選択経路の通読">
    <div className="section-heading"><h2>{effectiveRouteMode === 'custom' ? '選んだ経路を読む' : '章順に読む'}</h2><span>{entries.length}場面</span></div>
    <div className="reference-controls reading-route-mode" role="group" aria-label="読む順の選択">
      <button type="button" className="button secondary small" aria-pressed={effectiveRouteMode === 'chapters'} disabled={busy || scenePath !== undefined} onClick={() => setRouteMode('chapters')}>選んだ章の順</button>
      <button type="button" className="button secondary small" aria-pressed={effectiveRouteMode === 'custom'} disabled={busy || scenePath !== undefined} onClick={() => setRouteMode('custom')}>自分で経路を作る</button>
    </div>
    {effectiveRouteMode === 'chapters' && chapters.length > 0 && <fieldset className="reading-chapter-picker">
      <legend>読む章を選ぶ</legend>
      {chapters.map(chapter => <label key={chapter.id}><input type="checkbox" checked={effectiveChapterIds.includes(chapter.id)} disabled={busy || chapterIds !== undefined} onChange={event => setChapterSelected(chapter.id, event.target.checked)}/>{chapter.name || '名称未設定の章'}</label>)}
    </fieldset>}
    {effectiveRouteMode === 'custom' && <section className="reading-route-builder" aria-label="選んだ経路の編集">
      <label className="form-field"><span>経路に加える場面</span><select aria-label="経路に加える場面" value={routeSceneToAdd} disabled={busy || scenePath !== undefined} onChange={event => setRouteSceneToAdd(event.target.value)}>
        <option value="">場面を選択</option>{sceneOptions.map(scene => <option key={scene.id} value={scene.id}>{scene.name || '名称未設定の場面'}</option>)}
      </select></label>
      <button type="button" className="button secondary small" disabled={busy || scenePath !== undefined || !routeSceneToAdd} onClick={addRouteScene}>経路の末尾に加える</button>
      {!displayedRouteSceneIds.length && scenePath === undefined && <p className="field-hint">経路に場面を加えてください。同じ場面を複数回加えて再訪を表せます。</p>}
      {!!displayedRouteSceneIds.length && <ol className="reading-route-draft" aria-label="選んだ場面の順序">
        {displayedRouteSceneIds.map((sceneId, index) => <li key={`${sceneId}:${index}`}>
          <span>{index + 1}. {sceneOptions.find(scene => scene.id === sceneId)?.name ?? `見つからない場面 ${sceneId.slice(-6)}`}</span>
          <button type="button" className="text-button" aria-label={`${index + 1}番目の場面を上へ`} disabled={busy || scenePath !== undefined || index === 0} onClick={() => moveRouteScene(index, -1)}>上へ</button>
          <button type="button" className="text-button" aria-label={`${index + 1}番目の場面を下へ`} disabled={busy || scenePath !== undefined || index === routeSceneIds.length - 1} onClick={() => moveRouteScene(index, 1)}>下へ</button>
          <button type="button" className="text-button danger" aria-label={`${index + 1}番目の場面を経路から外す`} disabled={busy || scenePath !== undefined} onClick={() => setRouteSceneIds(current => current.filter((_, itemIndex) => itemIndex !== index))}>外す</button>
        </li>)}
      </ol>}
    </section>}
    <div className="reference-controls" aria-label="通読の表示方向">
      <button type="button" className="button secondary small" aria-pressed={!vertical} onClick={() => setVertical(false)}>横書き</button>
      <button type="button" className="button secondary small" aria-pressed={vertical} onClick={() => setVertical(true)}>縦書き</button>
    </div>
    <div className="reading-session-controls">
      <label className="form-field"><span>読む作品の版</span><select aria-label="読む作品の版" disabled={busy} value={contentVersionId} onChange={event => setContentVersionId(event.target.value)}>
        <option value="">{currentVersionLabel} · 版 {project.revision}</option>{project.snapshots.map(snapshot => <option value={snapshot.id} key={snapshot.id}>固定版：{snapshot.versionLabel}</option>)}
      </select></label>
      <label>提示する世界内tick<input aria-label="章試読の世界内tick" disabled={busy} inputMode="numeric" value={worldTick} onChange={event => setWorldTick(event.target.value)}/></label><button type="button" className="button primary small" disabled={busy || !entries.length} onClick={() => void startReading()}>{session ? '読み直す' : '記録付き読書を始める'}</button>
      <p className="field-hint">一覧を表示しただけでは提示証拠は残りません。記録付き読書では「次の場面を提示」を押した場面だけが状態・伏線判定へ進みます。</p>
    </div>
    {savedReadingRecords.length > 0 && <section className="saved-reading-records" aria-label="保存した章読み通しの再開">
      <h3>保存した章読み通しを再開</h3>
      <p className="field-hint">保存版で経路を再実行し、提示順と状態を確認して続きから読みます。</p>
      {savedReadingRecords.map(trace => <button key={trace.id} type="button" className="reference-link" disabled={busy} onClick={() => void replayReadingRecord(trace)}>{trace.name || '名称未設定の章読み通し'}</button>)}
    </section>}
    {readingPreview.error && <p className="field-error" role="alert">{readingPreview.error}</p>}
    {error && <p className="field-error" role="alert">{error}</p>}{notice && <p className="success-notice" role="status">{notice}</p>}
    {!entries.length && !session && <p className="field-hint">選択した章や経路に場面はありません。</p>}
    {!session && <ol className="chapter-reading-sequence">
      {entries.map((entry, index) => <li key={`${entry.scene.id}:${index}`} data-scene-id={entry.scene.id}>
        <article>
          <header><span>{index + 1}.</span>{onOpenEntity || onOpenTarget ? <button type="button" className="text-button" onClick={() => openReadingEntity(entry.scene.id)} disabled={!!contentVersionId && !onOpenTarget}>{entry.scene.name || '名称未設定の場面'}{contentVersionId ? 'の固定版を開く' : 'を編集'}</button> : <span>{entry.scene.name || '名称未設定の場面'}</span>}</header>
          <div className="reading-summary"><strong>要約</strong><RichTextView value={entry.scene.data.summary} vertical={vertical} onOpenTarget={onOpenEntity || onOpenTarget ? anchor => openReadingTarget(anchor) : undefined}/></div>
          <div className="reading-body"><strong>本文</strong><RichTextView value={entry.scene.data.body} vertical={vertical} onOpenTarget={onOpenEntity || onOpenTarget ? anchor => openReadingTarget(anchor) : undefined}/></div>
        </article>
      </li>)}
    </ol>}
    {session && <section className="chapter-reading-session" aria-label="記録付き読書">
      <div className="section-heading"><h3>記録付き読書</h3><span>{session.occurrences.length} / {session.sceneIds.length}場面を実際に提示</span></div>
      <p className="field-hint">この読書の順序と作品版は開始時の内容で固定しています。上の章・経路・版を変えて「読み直す」と、新しい条件で始められます。</p>
      {stale && <p className="info-notice">現在の編集稿が変わりました。この記録は開始時の内容を保持しています。最新稿を読むには開始し直してください。</p>}
      {session.issues.map((issue, index) => <p className="reader-issue" key={`${issue.path}:${index}`}>{issue.message}</p>)}
      {!currentOccurrence && <p className="field-hint">まだ場面を提示していません。次の場面を提示すると、その時点の状態を評価します。</p>}
      {presentedScene && <article className="chapter-reading-presented" data-presented-scene-id={presentedScene.id}>
        <header><span>{session.occurrences.length}回目の提示 · {session.occurrences.at(-1)?.occurrenceId}</span>{onOpenEntity || onOpenTarget ? <button type="button" className="text-button" onClick={() => openReadingEntity(presentedScene.id, session.contentVersionId)} disabled={session.contentVersionId !== project.projectId && !onOpenTarget}>{presentedScene.name || '名称未設定の場面'}{session.contentVersionId !== project.projectId ? 'の固定版を開く' : 'を編集'}</button> : <span>{presentedScene.name || '名称未設定の場面'}</span>}</header>
        <div className="reading-summary"><strong>要約</strong><RichTextView value={presentedScene.data.summary} vertical={vertical} onOpenTarget={onOpenEntity || onOpenTarget ? anchor => openReadingTarget(anchor, session.contentVersionId) : undefined}/></div>
        <div className="reading-body"><strong>本文</strong><RichTextView value={presentedScene.data.body} vertical={vertical} onOpenTarget={onOpenEntity || onOpenTarget ? anchor => openReadingTarget(anchor, session.contentVersionId) : undefined}/></div>
        <DialoguePresentation key={presentedScene.id} project={session.content} lineIds={presentedScene.data.dialogueLineIds ?? []} vertical={vertical} onOpenTarget={anchor => openReadingTarget(anchor, session.contentVersionId)}/>
      </article>}
      <section aria-label="章の伏線と回収"><h3>章の提示順・伏線と回収</h3><p>対象は選択した章・場面の提示順です。途中開始と未知は通し確認へ換算しません。</p>{checkChapterForeshadows(session).map((finding, index) => <article key={index}><strong>{finding.status === 'intentional' ? '意図した未回収' : finding.status === 'unknown' ? '未確認' : '確認候補'}</strong><p>{finding.message}</p>{finding.targetId && <button className="text-button" onClick={() => openReadingTarget({ entityId: finding.targetId! }, session.contentVersionId)}>伏線と出所へ戻る</button>}<p>根拠の提示順：{finding.path.map(id => labelOf(session.content.entities.find(entity => entity.id === id))).join(' → ')}</p></article>)}</section>
      {(onOpenEntity || onOpenTarget) && <NarrativeClaims project={session.content} occurrences={chapterNarrativeOccurrences(session)} referenceEntities={session.referenceEntities} state={session.state} onOpenTarget={anchor => openReadingTarget(anchor, session.contentVersionId)}/>}
      <div className="reference-controls">
        <button type="button" className="button primary small" disabled={busy || stale || session.status !== 'ready'} onClick={presentNext}>{session.status === 'terminal' ? '全場面を提示しました' : '次の場面を提示'}</button>
        <button type="button" className="button secondary small" disabled={busy || !session.occurrences.length} onClick={goBack}>一場面戻る</button>
        {onSaveMany && <button type="button" className="button secondary small" disabled={busy || !session.occurrences.length} onClick={() => void saveReadingRecord()}>{busy ? '記録を保存中' : '開始状態と経路を保存'}</button>}
      </div>
      {!onSaveMany && <p className="field-hint">この試読の記録は画面内で保持します。</p>}
    </section>}
    <p className="field-hint">本文と要約を表示しています。作者メモは通読に含めません。</p>
  </section>;
}

export interface StructurePreviewProps {
  project: ProjectData;
  /** Apply only to a draft/alternative, then persist it as a new branch version. */
  onApplyToDraft: (project: ProjectData, reason: string) => void;
  initialPlan?: StructurePlan;
  onPlanChange?: (plan: StructurePlan) => void;
}

export function StructurePreview({ project, onApplyToDraft, initialPlan, onPlanChange }: StructurePreviewProps) {
  const chapters = project.entities.filter((entity): entity is Entity<'chapter'> => entity.kind === 'chapter' && !entity.deletedAt);
  const initialTemplate = STRUCTURE_TEMPLATES.find(item => item.id === initialPlan?.templateId) ?? STRUCTURE_TEMPLATES[0]!;
  const [chapterId, setChapterId] = useState(initialPlan?.chapterId ?? chapters[0]?.id ?? '');
  const [templateId, setTemplateId] = useState(initialPlan?.templateId ?? initialTemplate.id);
  const [beatLabels, setBeatLabels] = useState(initialPlan?.beatLabels.join('\n') ?? initialTemplate.beats.join('\n'));
  const [assignments, setAssignments] = useState<Record<string, string>>(initialPlan?.assignments ?? {});
  const [preview, setPreview] = useState<StructureOrderPreview>();
  const [error, setError] = useState('');
  const chapter = chapters.find(item => item.id === chapterId);
  const scenes = project.entities.filter((entity): entity is Entity<'scene'> => entity.kind === 'scene' && !entity.deletedAt);
  const template = STRUCTURE_TEMPLATES.find(item => item.id === templateId) ?? STRUCTURE_TEMPLATES[0]!;
  const activeTemplate: StructureTemplate = { ...template, name: templateId === 'custom' ? '自由構成' : template.name, beats: beatLabels.split('\n').map(label => label.trim()).filter(Boolean) };
  const profile = chapter ? buildTensionProfile(project, chapter.data.sceneIds) : undefined;
  const chartPoints = profile?.points ?? [];
  const x = (index: number) => chartPoints.length < 2 ? 260 : 24 + index * (472 / (chartPoints.length - 1));
  const y = (value: number) => 100 - Math.max(0, Math.min(10, value)) * 9;

  const publishPlan = (next: { chapterId?: string; templateId?: string; beatLabels?: string[]; assignments?: Record<string, string> }) => {
    if (!onPlanChange) return;
    onPlanChange({ chapterId: next.chapterId ?? chapterId, templateId: next.templateId ?? templateId,
      beatLabels: [...(next.beatLabels ?? activeTemplate.beats)], assignments: { ...(next.assignments ?? assignments) } });
  };
  const chooseTemplate = (id: string) => {
    setTemplateId(id);
    const chosen = STRUCTURE_TEMPLATES.find(item => item.id === id);
    const labels = chosen?.beats ?? beatLabels.split('\n').map(label => label.trim()).filter(Boolean);
    const nextAssignments: Record<string, string> = {};
    setBeatLabels(labels.join('\n'));
    setAssignments(nextAssignments); setPreview(undefined); setError('');
    publishPlan({ templateId: id, beatLabels: labels, assignments: nextAssignments });
  };
  const createPreview = () => {
    if (!chapter) return;
    setPreview(previewStructureOrder(activeTemplate, chapter, assignments));
  };
  const applyPreview = () => {
    if (!chapter || !preview) return;
    try { onApplyToDraft(applyStructureOrderPreview(project, chapter.id, preview), '構成雛形の順序を別案の下書きへ適用'); setPreview(undefined); setError(''); }
    catch (reason) { setError(reason instanceof Error ? reason.message : '順序を適用できません。差分を確認し直してください。'); }
  };

  return <section className="structure-preview" aria-label="構成雛形と盛り上がり">
    <div className="section-heading"><h3>構成を試す</h3><span>雛形はプレビュー後に別案の下書きへ適用</span></div>
    {!chapters.length ? <p className="field-hint">章を作成すると、構成順を試せます。</p> : <>
      <label className="form-field"><span>対象の章</span><select aria-label="構成を試す章" value={chapterId} onChange={event => { setChapterId(event.target.value); setAssignments({}); setPreview(undefined); setError(''); publishPlan({ chapterId: event.target.value, assignments: {} }); }}>
        {chapters.map(item => <option key={item.id} value={item.id}>{item.name || '名称未設定の章'}</option>)}
      </select></label>
      <label className="form-field"><span>構成雛形</span><select aria-label="構成雛形" value={templateId} onChange={event => chooseTemplate(event.target.value)}>
        {STRUCTURE_TEMPLATES.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}<option value="custom">自由構成</option>
      </select></label>
      <label className="form-field"><span>構成の役割（1行に1つ）</span><textarea aria-label="構成の役割" rows={Math.min(8, Math.max(3, activeTemplate.beats.length))} value={beatLabels} onChange={event => { const labels = event.target.value.split('\n').map(label => label.trim()).filter(Boolean); setTemplateId('custom'); setBeatLabels(event.target.value); setPreview(undefined); setError(''); publishPlan({ templateId: 'custom', beatLabels: labels }); }}/></label>
      {activeTemplate.beats.map((beat, index) => <label className="form-field" key={`${beat}:${index}`}><span>{beat}に置く場面</span>
        <select aria-label={`${beat}に置く場面`} value={assignments[beat] ?? ''} onChange={event => { const next = { ...assignments }; if (event.target.value) next[beat] = event.target.value; else delete next[beat]; setAssignments(next); publishPlan({ assignments: next }); }}>
          <option value="">未割当</option>{(chapter?.data.sceneIds ?? []).map(id => <option key={id} value={id}>{sceneTitle(project, id)}</option>)}
        </select>
      </label>)}
      {error && <p className="field-error" role="alert">{error}</p>}
      <button type="button" className="button secondary small" onClick={createPreview} disabled={!chapter}>順序の差分を確認</button>
      {preview && <div className="structure-order-diff" role="region" aria-label="構成順の差分">
        <p>変更前：{preview.before.map(id => sceneTitle(project, id)).join(' → ') || '場面なし'}</p>
        <p>変更後：{preview.after.map(id => sceneTitle(project, id)).join(' → ') || '場面なし'}</p>
        {preview.unassignedSceneIds.length > 0 && <p>雛形に割り当てていない場面：{preview.unassignedSceneIds.map(id => sceneTitle(project, id)).join('、')}</p>}
        <div className="reference-controls"><button type="button" className="button secondary small" onClick={() => setPreview(undefined)}>取消</button><button type="button" className="button primary small" onClick={applyPreview}>別案の下書きへ適用</button></div>
      </div>}
      {profile && <div className="tension-profile">
        <div className="section-heading"><h4>緊張度・重要度</h4><span>値は作者の入力</span></div>
        <p className="field-hint">緊張度 {profile.measuredCount}/{profile.points.length}件を集計。未入力 {profile.missingCount}件は空欄のままです。重要度入力 {profile.importanceMeasuredCount}件。</p>
        <svg viewBox="0 0 520 120" role="img" aria-label="章順に沿った緊張度。未入力は線で補間しません。">
          <line x1="24" y1="100" x2="496" y2="100" stroke="currentColor" opacity=".35"/>
          {chartPoints.slice(0, -1).map((point, index) => {
            const next = chartPoints[index + 1]!;
            return point.value === null || next.value === null ? null : <line key={`line-${point.sceneId}`} x1={x(index)} y1={y(point.value)} x2={x(index + 1)} y2={y(next.value)} stroke="currentColor" strokeWidth="2"/>;
          })}
          {chartPoints.map((point, index) => point.value === null
            ? <g key={point.sceneId}><circle cx={x(index)} cy="108" r="5" fill="none" stroke="currentColor" strokeDasharray="2 2"/><text x={x(index)} y="119" textAnchor="middle" fontSize="9">未入力</text></g>
            : <g key={point.sceneId}><circle cx={x(index)} cy={y(point.value)} r="5" fill="currentColor"/><text x={x(index)} y={y(point.value) - 8} textAnchor="middle" fontSize="10">{point.value}</text></g>)}
        </svg>
        <ol className="tension-values">{chartPoints.map(point => <li key={point.sceneId}><span>{point.sceneName}</span><span>緊張度 {point.value === null ? '未入力' : point.value} · 重要度 {point.importance === null ? '未入力' : point.importance}</span></li>)}</ol>
      </div>}
    </>}
  </section>;
}
