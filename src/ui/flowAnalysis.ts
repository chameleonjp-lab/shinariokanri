import type { ID, ProjectContent, ProjectData } from '../domain/types';
import type { AnalysisOptions, AnalysisProgress, AnalysisResult } from '../domain/runtime';
import { analyzeFlowVerified } from '../domain/runtimeVerified';

/** Capture messages synchronously, then keep verification and exploration off the UI thread. */
export function analyzeFlowInBrowser(project: ProjectData, options: AnalysisOptions = {}, worldSnapshots: Record<ID, ProjectContent> = {}): Promise<AnalysisResult> {
  if (typeof window === 'undefined' || options.now) return analyzeFlowVerified(project, options, worldSnapshots);
  const { signal, onProgress, now: _now, ...requested } = options;
  return new Promise((resolve, reject) => {
    const worker = new Worker(new URL('../domain/analysis.worker.ts', import.meta.url), { type: 'module' });
    let live = true;
    const finish = (error?: unknown, result?: AnalysisResult) => {
      if (!live) return;
      live = false;
      signal?.removeEventListener('abort', abort);
      worker.terminate();
      error ? reject(error) : resolve(result!);
    };
    const abort = () => { if (live) { try { worker.postMessage({ type: 'cancel' }); } catch (error) { finish(error); } } };
    worker.onmessage = event => {
      if (!live) return;
      const message = event.data as { type: string; progress?: AnalysisProgress; result?: AnalysisResult; error?: { name: string; message: string; issues?: unknown; code?: string } };
      if (message.type === 'progress') onProgress?.(message.progress!);
      else if (message.type === 'done') {
        const result = message.result!;
        // Cancellation can race a completed message already queued by the
        // worker. Preserve its observed evidence but never certify completion.
        finish(undefined, signal?.aborted ? { ...result, status: result.status === 'confirmed_issue' ? result.status : 'unknown', truncated: true, assumptions: [...result.assumptions, '結果を受け取る前に取消が要求されました。全体の確認完了として扱いません。'] } : result);
      }
      else if (message.type === 'error') finish(Object.assign(new Error(message.error!.message), { name: message.error!.name, issues: message.error!.issues, code: message.error!.code }));
    };
    worker.onerror = () => finish(Object.assign(new Error('分岐検査の作業領域を開けませんでした。保存済み内容と入力は変更していません。'), { code: 'ANALYSIS_WORKER_FAILED' }));
    signal?.addEventListener('abort', abort, { once: true });
    try {
      // postMessage captures the complete edition and registry before returning.
      // A pending cancel follows this start message, even if capture has not begun.
      worker.postMessage({ type: 'start', project, options: requested, worldSnapshots });
      if (signal?.aborted) abort();
    } catch (error) { finish(error); }
  });
}
