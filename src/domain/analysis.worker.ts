import type { ID, ProjectContent, ProjectData } from './types';
import type { AnalysisOptions, AnalysisProgress } from './runtime';
import { analyzeFlowVerified } from './runtimeVerified';

const scope = self as unknown as { onmessage: ((event: MessageEvent) => void) | null; postMessage: (message: unknown) => void };
let controller: AbortController | undefined;
scope.onmessage = event => {
  if (event.data.type === 'cancel') { controller?.abort(); return; }
  if (event.data.type !== 'start' || controller) return;
  const { project, options, worldSnapshots } = event.data as { project: ProjectData; options: AnalysisOptions; worldSnapshots: Record<ID, ProjectContent> };
  controller = new AbortController();
  const started = performance.now();
  let firstClockRead = true;
  // Include captured-edition verification in the original time budget. Neither
  // hashing nor a cancellation can substitute unverified content for execution.
  const now = () => { if (firstClockRead) { firstClockRead = false; return started; } return performance.now(); };
  scope.postMessage({ type: 'progress', progress: { checkedStates: 0, pendingStates: 0, elapsedMs: 0, limits: { maxStates: options.maxStates ?? 100000, maxTransitions: options.maxTransitions ?? 10000, maxMs: options.maxMs ?? 30000 } } satisfies AnalysisProgress });
  void analyzeFlowVerified(project, { ...options, signal: controller.signal, now, onProgress: progress => scope.postMessage({ type: 'progress', progress }) }, worldSnapshots)
    .then(result => scope.postMessage({ type: 'done', result }))
    .catch(error => scope.postMessage({ type: 'error', error: { name: error?.name ?? 'Error', message: error?.message ?? '分岐検査に失敗しました。', issues: error?.issues, code: error?.code ?? error?.issues?.[0]?.code } }));
};
