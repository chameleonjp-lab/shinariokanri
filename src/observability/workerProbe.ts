import {probeEnabled,probeWorkerStart,probeWorkerMessages} from './probe';

/** Observe only this worker's transport boundary. Worker-internal computation
 * is deliberately not inferred from traffic bytes or the parent's clock. */
export function observeWorker(worker: Worker, phase: 'worker.read' | 'worker.parts' | 'worker.archive'): void {
  if (!probeEnabled()) return;
  const finish = probeWorkerStart(phase), messageProbe = probeWorkerMessages(), post = worker.postMessage.bind(worker), terminate = worker.terminate.bind(worker);
  const receive = (event: MessageEvent) => messageProbe('received',event.data);
  worker.addEventListener('message',receive);
  worker.postMessage = ((message: unknown, options?: Transferable[] | StructuredSerializeOptions) => {
    messageProbe('sent',message);
    if (Array.isArray(options)) post(message,options); else post(message,options);
  }) as Worker['postMessage'];
  worker.terminate = () => { worker.removeEventListener('message',receive); finish(); return terminate(); };
}
