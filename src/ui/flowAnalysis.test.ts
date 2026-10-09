import { afterEach, describe, expect, it, vi } from 'vitest';
import { createEntity, createProject } from '../domain/model';
import { analyzeFlow, type AnalysisResult } from '../domain/runtime';
import { analyzeFlowInBrowser } from './flowAnalysis';

class ControlledWorker {
  static instances: ControlledWorker[] = [];
  messages: any[] = [];
  terminated = 0;
  onmessage: ((event: MessageEvent) => void) | null = null;
  onerror: (() => void) | null = null;
  constructor() { ControlledWorker.instances.push(this); }
  postMessage(message: unknown) { this.messages.push(structuredClone(message)); }
  terminate() { this.terminated++; }
  emit(message: unknown) { this.onmessage?.({ data: message } as MessageEvent); }
}
function fixture() {
  const project = createProject('検査元');
  const entry = createEntity(project.projectId, 'flow_node', '宣言入口', { nodeType: 'entry', executionPolicy: 'first_match' });
  const end = createEntity(project.projectId, 'flow_node', '宣言終端', { nodeType: 'terminal', terminalReason: '意図した完了' });
  const edge = createEntity(project.projectId, 'flow_edge', '完了へ', { fromId: entry.id, toId: end.id, label: '完了へ' });
  const graph = createEntity(project.projectId, 'flow_graph', '宣言した図', { nodeIds: [entry.id, end.id], edgeIds: [edge.id], entryIds: [entry.id], exitIds: [end.id] });
  project.entities.push(entry, end, edge, graph);
  return { project, result: analyzeFlow(project) };
}
afterEach(() => { vi.unstubAllGlobals(); ControlledWorker.instances = []; });
describe('browser analysis transport and cancellation', () => {
  function browser() { vi.stubGlobal('window', {}); vi.stubGlobal('Worker', ControlledWorker); }
  it('captures edition and world bytes before asynchronous messages and ignores late output', async () => {
    browser(); const { project, result } = fixture(), world = createProject('元の世界'), onProgress = vi.fn();
    const promise = analyzeFlowInBrowser(project, { onProgress }, { [world.projectId]: world });
    const worker = ControlledWorker.instances[0];
    project.name = '後の稿'; world.name = '後の世界';
    expect(worker.messages[0].project.name).toBe('検査元');
    expect(worker.messages[0].worldSnapshots[world.projectId].name).toBe('元の世界');
    const progress = { checkedStates: 1, pendingStates: 0, elapsedMs: 1, limits: result.limits };
    worker.emit({ type: 'progress', progress }); worker.emit({ type: 'done', result });
    expect(await promise).toEqual(result); expect(worker.terminated).toBe(1);
    worker.emit({ type: 'progress', progress }); worker.emit({ type: 'error', error: { name: 'Error', message: '遅い旧結果' } });
    expect(onProgress).toHaveBeenCalledExactlyOnceWith(progress); expect(worker.terminated).toBe(1);
  });
  it('queues an already requested cancellation after the captured start', async () => {
    browser(); const { project, result } = fixture(), controller = new AbortController(); controller.abort();
    const promise = analyzeFlowInBrowser(project, { signal: controller.signal });
    const worker = ControlledWorker.instances[0]; expect(worker.messages.map(m => m.type)).toEqual(['start', 'cancel']);
    worker.emit({ type: 'done', result: { ...result, status: 'unknown', truncated: true } });
    expect((await promise).truncated).toBe(true); expect(worker.terminated).toBe(1);
  });
  it('does not certify a result completed just before the cancel message arrives', async () => {
    browser(); const { project, result } = fixture(), controller = new AbortController();
    expect(result.status).toBe('passed_for_checked_scope');
    const promise = analyzeFlowInBrowser(project, { signal: controller.signal });
    const worker = ControlledWorker.instances[0]; controller.abort(); worker.emit({ type: 'done', result });
    const cancelled: AnalysisResult = await promise;
    expect(cancelled.status).toBe('unknown'); expect(cancelled.truncated).toBe(true);
    expect(cancelled.contentVersionId).toBe(result.contentVersionId); expect(cancelled.coverage).toEqual(result.coverage);
    expect(cancelled.limits).toEqual({ maxStates: 100000, maxTransitions: 10000, maxMs: 30000 });
    expect(cancelled.assumptions.at(-1)).toContain('取消');
  });
  it('preserves integrity rejection instead of returning a fabricated analysis', async () => {
    browser(); const { project } = fixture(); const promise = analyzeFlowInBrowser(project);
    const worker = ControlledWorker.instances[0], issues = [{ code: 'INTEGRITY_FAILED', path: 'snapshots.old.contentHash', message: '固定版の内容ハッシュが一致しません。' }];
    worker.emit({ type: 'error', error: { name: 'DomainValidationError', message: issues[0].message, issues } });
    await expect(promise).rejects.toMatchObject({ name: 'DomainValidationError', issues }); expect(worker.terminated).toBe(1);
  });
  it('keeps the starting signal and callback when caller options are later replaced', async () => {
    browser(); const { project, result } = fixture(), first = new AbortController(), later = new AbortController(), onProgress = vi.fn(), replacement = vi.fn();
    const remove = vi.spyOn(first.signal, 'removeEventListener'), options = { signal: first.signal, onProgress };
    const promise = analyzeFlowInBrowser(project, options), worker = ControlledWorker.instances[0];
    options.signal = later.signal; options.onProgress = replacement;
    first.abort(); worker.emit({ type: 'progress', progress: { checkedStates: 1, pendingStates: 0, elapsedMs: 1, limits: result.limits } });
    worker.emit({ type: 'done', result });
    expect((await promise).status).toBe('unknown'); expect(later.signal.aborted).toBe(false);
    expect(worker.messages.map(m => m.type)).toEqual(['start', 'cancel']);
    expect(onProgress).toHaveBeenCalledTimes(1); expect(replacement).not.toHaveBeenCalled();
    expect(remove).toHaveBeenCalledWith('abort', expect.any(Function));
  });
  it('stops safely if the worker fails and releases the cancellation listener', async () => {
    browser(); const { project } = fixture(), controller = new AbortController();
    const promise = analyzeFlowInBrowser(project, { signal: controller.signal }), worker = ControlledWorker.instances[0];
    worker.onerror?.(); await expect(promise).rejects.toThrow('作業領域'); controller.abort();
    expect(worker.messages.map(m => m.type)).toEqual(['start']); expect(worker.terminated).toBe(1);
  });
});
