import {useAuthorScope} from './StoreContext';
import { useEffect, useMemo, useState } from 'react';
import type { ID, ProjectData, Tick } from '../domain/types';
import { effectiveWorldContent } from '../domain/world';
import { inspectWorldCandidates } from '../domain/worldCheck';
import { isTick } from '../domain/time';
import { labelOf } from './Fields';
import { Relationships } from './Relationships';
import { WorldCalendars } from './WorldCalendars';
import { WorldHistories } from './WorldHistories';
import { WorldMaps } from './WorldMaps';
import { WorldNames } from './WorldNames';
import { WorldVersions, type WorldVersionsProps } from './WorldVersions';
import { checkpointContext, WorldPointFields } from './WorldFields';
import { EntityChoice, TIMELINE_PAGE_SIZE, TimelinePagination, type TimelineSave } from './TimelineEditors';
import './World.css';

const TABS = { histories: '状態・生涯・履歴', maps: '地図・場所・移動', family: '家系・師弟・血統', names: '別名・正体・公開名', versions: '共通世界の固定版', calendars: '暦の規則', checks: '世界時点の確認候補' };
type WorldTab = keyof typeof TABS;
export interface WorldPanelProps {
  project: ProjectData; worlds?: ProjectData[]; onSaveProject: TimelineSave;
  onOpen: (id: ID, originProjectId?: ID, sourceVersionId?: ID) => void; selectedPlaceId?: ID | null; selectedEntityId?: ID | null;
  requestedSection?: 'histories' | 'maps';
  worldTick?: Tick | null; checkpointId?: ID; onViewPointChange?: (at: Tick | null, checkpointId: ID) => void;
  onShowTimeline?: (placeId?: ID, eventId?: ID) => void; onShowEntityTimeline?: (entityId: ID, at?: Tick | null) => void;
  onPinWorld?: WorldVersionsProps['onPinWorld']; assetUrl?: (attachmentId: ID) => Promise<string | undefined> | string | undefined;
}
function initialWorldView(project: ProjectData,scope:string) {
  try { const value = JSON.parse(localStorage.getItem(`scenario-world:v1:${scope}`) ?? 'null') as Record<string, unknown> | null; return { tab: value && typeof value.tab === 'string' && value.tab in TABS ? value.tab as WorldTab : 'histories' as WorldTab, at: value?.at === null ? null : isTick(value?.at) ? value.at : project.mainStart, checkpoint: typeof value?.checkpoint === 'string' ? value.checkpoint : '', holder: typeof value?.holder === 'string' ? value.holder : '' }; } catch { return { tab: 'histories' as WorldTab, at: project.mainStart, checkpoint: '', holder: '' }; }
}
export function WorldPanel({ project, worlds = [], onSaveProject, onOpen, selectedPlaceId, selectedEntityId, requestedSection, worldTick, checkpointId: externalCheckpoint, onViewPointChange, onShowTimeline, onShowEntityTimeline, onPinWorld, assetUrl }: WorldPanelProps) {
  const authorScope=useAuthorScope(project.projectId);
  const [initial] = useState(() => initialWorldView(project,authorScope)), [tab, setTab] = useState<WorldTab>(requestedSection ?? (selectedPlaceId ? 'maps' : initial.tab)), [visited, setVisited] = useState<WorldTab[]>([requestedSection ?? (selectedPlaceId ? 'maps' : initial.tab)]), [at, setAt] = useState<Tick | null>(worldTick !== undefined ? worldTick : initial.at), [checkpointId, setCheckpointId] = useState(externalCheckpoint ?? initial.checkpoint), [holderId, setHolderId] = useState(initial.holder), [candidatePage, setCandidatePage] = useState(0);
  const effective = useMemo(() => ({ ...project, ...effectiveWorldContent(project, worlds) }), [project, worlds]), context = useMemo(() => checkpointContext(effective, checkpointId), [effective, checkpointId]), point = useMemo(() => ({ at, context, ...(context?.state.presentationPosition ? { presentationIds: [context.state.presentationPosition] } : {}) }), [at, context]);
  const index = useMemo(() => new Map(effective.entities.map(entity => [entity.id, entity])), [effective.entities]);
  const checks = useMemo(() => visited.includes('checks') ? inspectWorldCandidates(effective, point) : undefined, [effective, point, visited]);
  const chooseTab = (next: WorldTab) => { setTab(next); setVisited(previous => previous.includes(next) ? previous : [...previous, next]); };
  useEffect(() => { if (worldTick !== undefined) setAt(worldTick); }, [worldTick]);
  useEffect(() => { if (externalCheckpoint !== undefined) setCheckpointId(externalCheckpoint); }, [externalCheckpoint]);
  useEffect(() => { if (selectedPlaceId && requestedSection !== 'histories') chooseTab('maps'); }, [selectedPlaceId]);
  useEffect(() => { if (requestedSection) chooseTab(requestedSection); }, [requestedSection]);
  useEffect(() => { try { localStorage.setItem(`scenario-world:v1:${authorScope}`, JSON.stringify({ tab, at, checkpoint: checkpointId, holder: holderId })); } catch { /* View preferences are optional. */ } }, [project.projectId, tab, at, checkpointId, holderId]);
  const changePoint = (tick: Tick | null, checkpoint: ID) => { setAt(tick); setCheckpointId(checkpoint); setCandidatePage(0); onViewPointChange?.(tick, checkpoint); };
  const sectionProps = { project: effective, localProject: project, point, onSave: onSaveProject, onOpen };
  const safePage = Math.min(candidatePage, Math.max(0, Math.ceil((checks?.candidates.length ?? 0) / TIMELINE_PAGE_SIZE) - 1));
  return <div className="world-panel"><WorldPointFields project={effective} at={at} checkpointId={checkpointId} onAtChange={tick => changePoint(tick, checkpointId)} onCheckpointChange={id => changePoint(at, id)}/><EntityChoice label="表示名・認識を確認する人物" entities={effective.entities.filter(entity => entity.kind === 'character')} value={holderId} onChange={setHolderId}/><div className="world-tabs" role="tablist" aria-label="共通世界の表示">{Object.entries(TABS).map(([key, label]) => <button type="button" key={key} role="tab" aria-selected={tab === key} aria-controls={`world-tab-${key}`} className={`button secondary ${tab === key ? 'active' : ''}`} onClick={() => chooseTab(key as WorldTab)}>{label}</button>)}</div>
    {visited.includes('histories') && <section id="world-tab-histories" role="tabpanel" hidden={tab !== 'histories'}><WorldHistories {...sectionProps} selectedId={selectedEntityId} holderId={holderId || undefined}/></section>}
    {visited.includes('maps') && <section id="world-tab-maps" role="tabpanel" hidden={tab !== 'maps'}><WorldMaps {...sectionProps} placeId={selectedPlaceId} onShowTimeline={onShowTimeline} assetUrl={assetUrl}/></section>}
    {visited.includes('family') && <section id="world-tab-family" role="tabpanel" hidden={tab !== 'family'}><Relationships project={effective} localProject={project} categoryPreset="family" worldTick={at} checkpointId={checkpointId} onViewPointChange={changePoint} selectedId={selectedEntityId} onOpen={onOpen} onSaveProject={(candidate, reason) => onSaveProject({ ...project, views: candidate.views }, reason)} onShowTimeline={onShowEntityTimeline} onSave={async relation => { if (relation.projectId !== project.projectId) throw new Error('固定した世界の関係は共通世界の元情報から改訂してください。'); const exists = project.relations.some(item => item.id === relation.id); await onSaveProject({ ...project, relations: exists ? project.relations.map(item => item.id === relation.id ? relation : item) : [...project.relations, relation] }, '家系・師弟・血統の関係を保存'); }}/></section>}
    {visited.includes('names') && <section id="world-tab-names" role="tabpanel" hidden={tab !== 'names'}><WorldNames {...sectionProps} holderId={holderId || undefined}/></section>}
    {visited.includes('versions') && <section id="world-tab-versions" role="tabpanel" hidden={tab !== 'versions'}><WorldVersions project={project} worlds={worlds} onSave={onSaveProject} onOpen={onOpen} onPinWorld={onPinWorld}/></section>}
    {visited.includes('calendars') && <section id="world-tab-calendars" role="tabpanel" hidden={tab !== 'calendars'}><WorldCalendars project={project} onSave={onSaveProject}/></section>}
    {visited.includes('checks') && <section id="world-tab-checks" role="tabpanel" hidden={tab !== 'checks'}><h3>確認候補 · {checks?.candidates.length ?? 0}件</h3><p className="field-hint">候補は登録した時期・参加役割・経路・手段・根拠から確認します。資料が足りない移動や経路は未確認として残します。検出した候補は作者の確認前にエラーへ確定しません。</p>{checks && !checks.complete && <p className="error-notice" role="alert">比較件数の上限に達しました。対象や時点を絞って再確認してください。すべてを確認済みにはしていません。</p>}{checks?.candidates.slice(safePage * TIMELINE_PAGE_SIZE, (safePage + 1) * TIMELINE_PAGE_SIZE).map(candidate => <article key={candidate.id} className={`world-check-candidate ${candidate.certainty}`}><strong>{candidate.certainty === 'intentional' ? '意図した例外' : candidate.certainty === 'supported' ? '登録情報からの確認候補' : '根拠・時点・経路が未確認'}</strong><p>{candidate.reason}</p><div className="world-inline-actions">{candidate.evidenceIds.map(id => <button type="button" key={id} className="button subtle small" onClick={() => onOpen(id, index.get(id)?.projectId)}>{labelOf(index.get(id))} · 根拠</button>)}</div></article>)}<TimelinePagination page={safePage} total={checks?.candidates.length ?? 0} onChange={setCandidatePage}/></section>}
  </div>;
}
