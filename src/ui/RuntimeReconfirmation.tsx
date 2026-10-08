import { useEffect, useRef, useState } from 'react';
import type { Entity, ProjectContent, ProjectData, ProjectSnapshot } from '../domain/types';
import { confirmedCheckpointMigration, previewCheckpointMigration, type CheckpointMigrationPlan } from '../domain/checkpoints';
import { confirmTraceReconfirmation, prepareTraceReconfirmation, traceRevisionChanges, type ReconfirmationPlan } from '../domain/traceReconfirmation';
import { adoptedRecord } from '../domain/adoption';
import { labelOf } from './Fields';
import { ListPager, useListWindow } from './ListWindow';
type Draft = { checkpointId: string; traceId: string; migration?: CheckpointMigrationPlan; reconfirmation?: ReconfirmationPlan; busy: boolean; error: string; progress: number; savedIds?: string[]; savedSnapshotIds?: string[]; notice?: string };
const drafts = new Map<string, Draft>(), EVENT = 'scenario-runtime-reconfirmation';
const fresh = (): Draft => ({ checkpointId: '', traceId: '', busy: false, error: '', progress: 0 });
function load(projectId: string) {
  if (drafts.has(projectId)) return drafts.get(projectId)!;
  try { const preferences = JSON.parse(localStorage.getItem(`scenario-reconfirmation-selection:${projectId}`) ?? '{}'); return { ...fresh(), checkpointId: typeof preferences.checkpointId === 'string' ? preferences.checkpointId : '', traceId: typeof preferences.traceId === 'string' ? preferences.traceId : '' }; } catch { return fresh(); }
}
export const runtimeReconfirmationBusy = (projectId: string) => load(projectId).busy;
export function RuntimeReconfirmation({ project, version, entryId, selectedCheckpointId, worldSnapshots, disabled, onBusy, onSaveMany, mode = 'flow' }: {
  project: ProjectData; version: string; entryId: string; selectedCheckpointId: string; worldSnapshots: Record<string, ProjectContent>; disabled: boolean; onBusy: (busy: boolean) => void; mode?: 'flow' | 'chapters';
  onSaveMany: (entities: Entity[], reason: string, assets?: undefined, snapshots?: ProjectSnapshot[], expectedRevision?: string) => Promise<void>;
}) {
  const [draft, setDraft] = useState(() => load(project.projectId)), latest = useRef(project), actions = useRef(onBusy), ownedBusy = useRef(false), controller = useRef<AbortController | null>(null); latest.current = project; actions.current = onBusy;
  const update = (change: Partial<Draft>) => { const next = { ...load(project.projectId), ...change }; drafts.set(project.projectId, next); try { localStorage.setItem(`scenario-reconfirmation-selection:${project.projectId}`, JSON.stringify({ checkpointId: next.checkpointId, traceId: next.traceId })); } catch { /* Selection still survives navigation in memory. */ } window.dispatchEvent(new CustomEvent(EVENT, { detail: project.projectId })); };
  useEffect(() => { const sync = (event?: Event) => { if (event && (event as CustomEvent).detail !== project.projectId) return; const current = load(project.projectId); setDraft(current); const previous = ownedBusy.current; ownedBusy.current = current.busy; if (current.busy || previous) actions.current(current.busy); }; sync(); window.addEventListener(EVENT, sync); return () => { window.removeEventListener(EVENT, sync); controller.current?.abort(); }; }, [project.projectId]);
  useEffect(() => { const current = load(project.projectId); if (current.savedIds?.every(id => project.entities.some(entity => entity.id === id)) && current.savedSnapshotIds?.every(id => project.snapshots.some(snapshot => snapshot.id === id))) update({ busy: false, savedIds: undefined, savedSnapshotIds: undefined, migration: undefined, reconfirmation: undefined, notice: '開始状態・対象版・新しい証跡を端末内に保存しました。旧版の証跡も保持しています。' }); }, [project, draft.savedIds, draft.savedSnapshotIds]);
  const checkpoints = project.entities.filter((entity): entity is Entity<'checkpoint'> => entity.kind === 'checkpoint' && adoptedRecord(entity) && entity.data.contentVersionId !== (version || project.projectId));
  const traces = project.entities.filter((entity): entity is Entity<'trace'> => entity.kind === 'trace' && adoptedRecord(entity));
  const checkpointPage = useListWindow({ items: checkpoints, scope: `${project.projectId}:checkpoint-migration`, selectedId: draft.checkpointId });
  const tracePage = useListWindow({ items: traces, scope: `${project.projectId}:trace-reconfirmation`, selectedId: draft.traceId });
  const migrationChanges = useListWindow({ items: (draft.migration?.changes ?? []).map((change, i) => ({ ...change, id: `${i}:${change.id}`, targetId: change.id })), scope: `${project.projectId}:checkpoint-migration-changes` });
  const traceChanges = useListWindow({ items: draft.reconfirmation?.changes ?? [], scope: `${project.projectId}:trace-reconfirmation-changes` });
  const busy = disabled || draft.busy, staleMigration = !!draft.migration && (draft.migration.baseRevision !== project.revision || draft.migration.targetVersionId !== (version || project.projectId) || draft.migration.targetEntryId !== (entryId || null) || draft.migration.targetMode !== mode), staleTrace = !!draft.reconfirmation && (draft.reconfirmation.baseRevision !== project.revision || draft.reconfirmation.startCheckpointId !== (selectedCheckpointId || null));
  const prepare = async (kind: 'migration' | 'trace') => {
    if (disabled || load(project.projectId).busy) return;
    update({ busy: true, error: '', notice: '', progress: 0 }); actions.current(true);
    const abort = new AbortController(); controller.current = abort;
    try {
      if (kind === 'migration') update({ migration: await previewCheckpointMigration(project, draft.checkpointId, { contentVersionId: version || undefined, entryId: entryId || undefined, chapterStart: mode === 'chapters', worldSnapshots }) });
      else update({ reconfirmation: await prepareTraceReconfirmation(project, draft.traceId, { worldSnapshots, checkpointId: selectedCheckpointId || undefined, signal: abort.signal, onProgress: progress => update({ progress }) }) });
    } catch (cause) { update({ error: (cause as Error).message }); }
    finally { controller.current = null; update({ busy: false }); actions.current(false); }
  };
  const save = async (kind: 'migrate' | 'recreate' | 'trace') => {
    if (disabled || load(project.projectId).busy) return;
    const submitted = load(project.projectId), base = latest.current;
    update({ busy: true, error: '', notice: '' }); actions.current(true);
    try {
      const result = kind === 'trace' ? await confirmTraceReconfirmation(base, submitted.reconfirmation!) : await confirmedCheckpointMigration(base, submitted.migration!, kind, worldSnapshots).then(prepared => ({ entities: [prepared.checkpoint], snapshots: prepared.snapshots }));
      const expectedRevision = kind === 'trace' ? submitted.reconfirmation!.baseRevision : submitted.migration!.baseRevision;
      if (latest.current.revision !== expectedRevision) throw new Error('保存待ちに作品が更新されました。入力を保持して再確認してください。');
      await onSaveMany(result.entities, kind === 'trace' ? '変更後の経路・回帰集合・固定版を原子保存' : '確認した開始状態の版移行と固定版を原子保存', undefined, result.snapshots, expectedRevision);
      update({ savedIds: result.entities.map(entity => entity.id), savedSnapshotIds: result.snapshots.map(snapshot => snapshot.id) });
      // Completion remains pending until the host delivers the persisted records.
    } catch (cause) { update({ busy: false, error: (cause as Error).message }); actions.current(false); }
  };
  if (!checkpoints.length && !traces.length && !draft.migration && !draft.reconfirmation) return null;
  return <section aria-label="開始版の移行と経路の再確認"><h3>開始版の移行・変更後の経路確認</h3><p>旧版を保持し、確認した基底revisionで新しい状態と証跡を保存します。移行した開始状態は途中開始として扱います。</p>
    {draft.error && <p role="alert" className="error-notice">{draft.error}</p>}{draft.notice && <p role="status">{draft.notice}</p>}
    {draft.busy && <p role="status">確認・保存中 · {draft.progress}手<button className="text-button" disabled={!controller.current} onClick={() => controller.current?.abort()}>再実行を中止</button></p>}
    {!!checkpoints.length && <details open={!!draft.checkpointId}><summary>別版の開始状態を移行する</summary><ListPager {...checkpointPage} label="移行元の開始状態"/>{checkpointPage.items.map(checkpoint => <label className="check-label" key={checkpoint.id}><input type="radio" name="migration-checkpoint" disabled={busy} checked={draft.checkpointId === checkpoint.id} onChange={() => update({ checkpointId: checkpoint.id, migration: undefined })}/>{labelOf(checkpoint)} · 固定版 {checkpoint.data.contentRevision ?? '未記録'} · {checkpoint.data.origin ?? '途中開始'}</label>)}<button className="button secondary" disabled={busy || !draft.checkpointId} onClick={() => void prepare('migration')}>開始状態の移行差分を確認</button></details>}
    {draft.migration && <div><p>確認基底revision {draft.migration.baseRevision}。移行対象 {draft.migration.targetVersionId === project.projectId ? '現在稿' : draft.migration.targetVersionId}。確認した開始点 {draft.migration.targetEntryId ? labelOf(project.entities.find(entity => entity.id === draft.migration!.targetEntryId)) : '章の提示開始'} · {draft.migration.targetEntryId ?? '章試読'}</p>{staleMigration && <p role="alert">確認後に作品版・開始点・読み方が変わりました。入力を保持して差分を再確認してください。</p>}<ListPager {...migrationChanges} label="開始状態の移行差分"/>{migrationChanges.items.map(change => <p key={change.id}>{change.action === 'carry' ? '持ち越す' : change.action === 'reset' ? '初期化する' : '外す'} · {labelOf(project.entities.find(entity => entity.id === change.targetId))} · {change.reason}</p>)}<button className="button primary" disabled={busy || staleMigration} onClick={() => void save('migrate')}>確認した状態を新しい途中開始へ移行</button><button className="button secondary" disabled={busy || staleMigration} onClick={() => void save('recreate')}>対象版の初期値から途中開始を再作成</button></div>}
    {!!traces.length && <details open={!!draft.traceId}><summary>保存した経路を改訂稿で再確認する</summary><ListPager {...tracePage} label="再確認する経路"/>{tracePage.items.map(trace => { const changes = traceRevisionChanges(project, trace); return <label className="check-label" key={trace.id}><input type="radio" name="reconfirm-trace" disabled={busy} checked={draft.traceId === trace.id} onChange={() => update({ traceId: trace.id, reconfirmation: undefined })}/>{labelOf(trace)} · {changes.length ? `再確認待ち ${changes.length}箇所` : '宣言・本文の変更なし'} · {trace.data.mode === 'chapters' ? '章順' : '分岐'} · {trace.data.externalMode ?? '内部状態'}</label>; })}<button className="button secondary" disabled={busy || !draft.traceId} onClick={() => void prepare('trace')}>旧経路を改訂稿で再実行して確認</button></details>}
    {draft.reconfirmation && <div><p>再実行基底revision {draft.reconfirmation.baseRevision}。新しい固定版 {draft.reconfirmation.targetVersionId}。旧経路を残して回帰集合へ新しい経路を追加します。</p>{staleTrace && <p role="alert">再実行後に作品が変わりました。結果を保持して再実行してください。</p>}<ListPager {...traceChanges} label="経路の変更影響"/>{traceChanges.items.map(change => <p key={change.id}>{labelOf(project.entities.find(entity => entity.id === change.id))} · {change.reason}</p>)}{draft.reconfirmation.findings.map((finding, i) => <p key={i}>{finding.status} · {finding.message}</p>)}<button className="button primary" disabled={busy || staleTrace} onClick={() => void save('trace')}>再実行した新しい経路と証跡を保存</button></div>}
  </section>;
}
