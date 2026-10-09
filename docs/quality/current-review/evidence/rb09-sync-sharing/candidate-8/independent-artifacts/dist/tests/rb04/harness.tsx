import { useEffect, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import type { AlternativeApplyReceipt, AuthorAlternative } from '../../src/domain/writingWorkspace';
import type { Entity, ProjectData, ProjectSnapshot } from '../../src/domain/types';
import { createEntity, createProject, newId, textToRichText } from '../../src/domain/model';
import { projectContent, recordAlternativeApplication, rollbackAlternativeApplication } from '../../src/domain/writingWorkspace';
import { sealAuthorAlternative } from '../../src/domain/authorAlternativeIntegrity';
import { jsonBytes, sha256 } from '../../src/storage/json';
import { AuthorAlternativeStudio } from '../../src/ui/AuthorAlternativeStudio';
import { ChapterReadingView, WritingWorkspace } from '../../src/ui/WritingWorkspace';
import './harness.css';

interface FixtureState {
  project: ProjectData;
  alternatives: AuthorAlternative[];
  openedId: string;
  canonicalCommits: number;
  rollbackCount: number;
}

interface Fixtures {
  characterId: string;
  factionId: string;
  placeId: string;
  threadIds: string[];
  chapterIds: string[];
  sceneIds: string[];
  eventIds: string[];
  snapshotId: string;
}

function increment(revision: string) { return (BigInt(revision) + 1n).toString(); }

async function makeFixture(): Promise<{ store: FixtureState; ids: Fixtures }> {
  const project = createProject('RB04 作者の執筆確認');
  const character = createEntity(project.projectId, 'character', 'アオ', { summary: textToRichText('失われた鍵を探す記録係。') });
  const faction = createEntity(project.projectId, 'group', '記録局', { groupType: 'faction', members: [character.id] });
  const romance = createEntity(project.projectId, 'group', '約束の筋', { groupType: 'plot_thread' });
  const war = createEntity(project.projectId, 'group', '門の争い', { groupType: 'plot_thread' });
  const place = createEntity(project.projectId, 'place', '霧の門');
  const chapterOne = createEntity(project.projectId, 'chapter', '第一章・門の前');
  const chapterTwo = createEntity(project.projectId, 'chapter', '第二章・帰還');
  const flashbackEvent = createEntity(project.projectId, 'event', '鍵を預けた日', {
    time: { mode: 'instant', at: '-10', calendarId: project.calendarId },
    participants: [{ characterId: character.id, role: 'actor' }], locationId: place.id,
  });
  const presentEvent = createEntity(project.projectId, 'event', '門での対話', {
    time: { mode: 'instant', at: '10', calendarId: project.calendarId },
    participants: [{ characterId: character.id, role: 'witness' }], locationId: place.id,
  });
  const endingEvent = createEntity(project.projectId, 'event', '帰還の記録', {
    time: { mode: 'instant', at: '20', calendarId: project.calendarId },
    participants: [{ characterId: character.id, role: 'actor' }], locationId: place.id,
  });
  const nowScene = createEntity(project.projectId, 'scene', '現在：門の前', {
    chapterId: chapterOne.id, eventIds: [presentEvent.id], threadIds: [romance.id, war.id], povId: character.id,
    goals: textToRichText('門を開ける。'), conflicts: textToRichText('記録局は鍵を渡さない。'),
    results: textToRichText('門番が取引に応じる。'), newInformation: textToRichText('父は鍵を記録庫に置いた。'),
    summary: textToRichText('アオが門番と取引する。'), body: textToRichText('「鍵を見せて」アオは言った。'),
    authorNotes: textToRichText('公開本文には含めない観察。'), tension: 9, importance: 7,
  });
  const flashbackScene = createEntity(project.projectId, 'scene', '回想：鍵を預ける', {
    chapterId: chapterOne.id, eventIds: [flashbackEvent.id], threadIds: [romance.id], povId: character.id,
    goals: textToRichText('鍵の行方を知る。'), conflicts: textToRichText('父との約束を守る。'),
    results: textToRichText('鍵を記録庫へ預ける。'), newInformation: textToRichText('鍵の場所を知る。'),
    summary: textToRichText('過去に父が鍵を預けた。'), body: textToRichText('「忘れないで」父は告げた。'),
    authorNotes: textToRichText('回想の読者効果。'), tension: 2, importance: 3,
  });
  const endingScene = createEntity(project.projectId, 'scene', '帰還：記録庫', {
    chapterId: chapterTwo.id, eventIds: [endingEvent.id], threadIds: [war.id], povId: character.id,
    summary: textToRichText('アオが記録庫に戻る。'), body: textToRichText('門の記録を持ち帰った。'),
    authorNotes: [], tension: null, importance: null,
  });
  chapterOne.data.sceneIds = [nowScene.id, flashbackScene.id];
  chapterTwo.data.sceneIds = [endingScene.id];
  const goal = createEntity(project.projectId, 'goal', '鍵の所在を突き止める', {
    ownerId: character.id, description: textToRichText('父の残した記録を確かめる。'), evidenceSceneIds: [flashbackScene.id, nowScene.id],
  });
  character.data.goals = [goal.id];
  project.entities = [character, faction, romance, war, place, chapterOne, chapterTwo,
    flashbackEvent, presentEvent, endingEvent, goal, nowScene, flashbackScene, endingScene];
  const snapshotId = newId();
  const content = projectContent(project);
  project.snapshots = [{ id: snapshotId, versionLabel: '確認済み公開版', contentHash: await sha256(jsonBytes(content)), createdAt: '2026-06-01T00:00:00.000Z', content }];
  return {
    store: { project, alternatives: [], openedId: '', canonicalCommits: 0, rollbackCount: 0 },
    ids: { characterId: character.id, factionId: faction.id, placeId: place.id, threadIds: [romance.id, war.id], chapterIds: [chapterOne.id, chapterTwo.id], sceneIds: [nowScene.id, flashbackScene.id, endingScene.id], eventIds: [flashbackEvent.id, presentEvent.id, endingEvent.id], snapshotId },
  };
}

function Harness() {
  const [store, setStore] = useState<FixtureState>();
  const [ids, setIds] = useState<Fixtures>();
  const storeRef = useRef<FixtureState | undefined>(undefined);

  const publish = (next: FixtureState) => { storeRef.current = next; setStore(next); };
  useEffect(() => {
    void makeFixture().then(({ store: initial, ids: nextIds }) => { storeRef.current = initial; setStore(initial); setIds(nextIds); });
  }, []);
  if (!store || !ids) return <main><p>執筆試験の準備中です。</p></main>;

  const saveCanonical = async (candidate: ProjectData) => {
    const current = storeRef.current!;
    publish({ ...current, project: { ...candidate, revision: increment(current.project.revision), snapshots: current.project.snapshots, history: current.project.history } });
  };
  const persistAlternatives = async (next: AuthorAlternative[]) => {
    const current = storeRef.current!;
    publish({ ...current, alternatives: next });
  };
  const commitCanonical = async (candidate: ProjectData, alternative: AuthorAlternative, receipt: AlternativeApplyReceipt) => {
    const current = storeRef.current!;
    const savedRevision = increment(current.project.revision);
    const persistedAlternative = await sealAuthorAlternative(recordAlternativeApplication(alternative, receipt, savedRevision));
    const project = { ...candidate, revision: savedRevision, snapshots: current.project.snapshots, history: current.project.history };
    publish({ ...current, project, alternatives: current.alternatives.map(item => item.id === alternative.id ? persistedAlternative : item), canonicalCommits: current.canonicalCommits + 1 });
    return { savedRevision, persistedAlternative };
  };
  const rollbackCanonical = () => {
    const current = storeRef.current!;
    const lastReceipt = current.alternatives.flatMap(item => item.applyReceipts).at(-1);
    if (!lastReceipt) return;
    const rolledBack = rollbackAlternativeApplication(current.project, lastReceipt);
    publish({ ...current, project: { ...rolledBack, revision: increment(current.project.revision), snapshots: current.project.snapshots, history: current.project.history }, rollbackCount: current.rollbackCount + 1 });
  };
  const openEntity = (id: string) => { const current = storeRef.current!; publish({ ...current, openedId: id }); };
  const activeScene = store.project.entities.find(entity => entity.id === ids.sceneIds[0] && entity.kind === 'scene');
  const snapshot = store.project.snapshots[0]!;
  const snapshotScene = snapshot.content.entities.find(entity => entity.id === ids.sceneIds[0] && entity.kind === 'scene');
  const branch = store.alternatives[0];
  const branchHead = branch?.versions.find(version => version.id === branch.headVersionId)?.content;
  const branchChapter = branchHead?.entities.find(entity => entity.kind === 'chapter' && entity.id === ids.chapterIds[0]);
  const diagnostics = {
    ids,
    revision: store.project.revision,
    chapterOrder: store.project.entities.filter(entity => entity.kind === 'chapter').map(entity => entity.name),
    eventTicks: store.project.entities.filter(entity => entity.kind === 'event').map(entity => entity.kind === 'event' && entity.data.time.mode === 'instant' ? entity.data.time.at : 'unknown'),
    canonicalBody: activeScene?.kind === 'scene' ? activeScene.data.body.map(block => block.text).join('\n') : '',
    publishedBody: snapshotScene?.kind === 'scene' ? snapshotScene.data.body.map(block => block.text).join('\n') : '',
    snapshotContent: snapshot.content,
    canonicalSceneNames: store.project.entities.filter(entity => entity.kind === 'scene').map(entity => entity.name),
    alternativeCount: store.alternatives.length,
    alternativeVersions: store.alternatives[0]?.versions.length ?? 0,
    branchChapterSceneIds: branchChapter?.kind === 'chapter' ? branchChapter.data.sceneIds : [],
    branchSceneNames: branchHead?.entities.filter(entity => entity.kind === 'scene').map(entity => entity.name) ?? [],
    branchSceneBodies: branchHead?.entities.filter(entity => entity.kind === 'scene').map(entity => entity.kind === 'scene' ? entity.data.body.map(block => block.text).join('\n') : '') ?? [],
    commits: store.canonicalCommits,
    rollbacks: store.rollbackCount,
    openedId: store.openedId,
    readingSnapshots: store.project.snapshots.map(item => item.id),
    readingTraces: store.project.entities.flatMap(entity => {
      if (entity.kind !== 'trace' || !('readingPath' in entity.data)) return [];
      const data = entity.data as unknown as { mode: string; steps: unknown[]; readingPath: { sceneIds: string[]; occurrences: Array<{ entityId: string; occurrenceId: string }> } };
      return [{ mode: data.mode, stepCount: data.steps.length, sceneIds: data.readingPath.sceneIds, occurrences: data.readingPath.occurrences }];
    }),
  };

  const saveMany = async (entities: Entity[], _reason: string, _assets?: undefined, snapshots?: ProjectSnapshot[]) => {
    const current = storeRef.current!;
    publish({ ...current, project: { ...current.project, revision: increment(current.project.revision), entities: [...current.project.entities, ...entities], snapshots: [...current.project.snapshots, ...(snapshots ?? [])] } });
  };

  return <main className="rb04-harness">
    <header><h1>RB04 writing components · isolated interaction harness</h1><p>Temporary fixture host: canonical and branch states are separate; apply writes both in one state transition.</p></header>
    <div className="harness-actions">
      <button type="button" onClick={rollbackCanonical}>テストホスト：採用を取り消す</button>
      <span>詳細を開いたID: <output data-testid="opened-id">{store.openedId}</output></span>
    </div>
    <output data-testid="fixture-state" aria-label="執筆試験状態">{JSON.stringify(diagnostics)}</output>
    <WritingWorkspace project={store.project} initialAxis="character" onOpenEntity={openEntity} onSaveProject={saveCanonical}/>
    <ChapterReadingView project={store.project} onOpenEntity={openEntity} onSaveMany={saveMany}/>
    <AuthorAlternativeStudio project={store.project} alternatives={store.alternatives} onPersistAlternatives={persistAlternatives} onCommitCanonical={commitCanonical} onOpenEntity={openEntity}/>
  </main>;
}

createRoot(document.getElementById('root')!).render(<Harness/>);
