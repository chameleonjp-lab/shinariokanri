import {
  assertOperation, assertScope, clone, sameScope, SyncProtocolError,
  type Revision, type SyncErrorCode, type SyncOutboxStore, type SyncScope, type SyncSession, type SyncTransport,
} from './protocol';
import { assertAck } from './validation';

export interface SyncReport {
  status: 'idle' | 'not-configured' | 'auth-required' | 'account-changed' | 'forbidden' | 'pending' | 'conflict' | 'synced' | 'failed';
  acknowledged: number;
  remaining: number;
  conflicts: number;
  confirmedRevision: Revision | null;
  errorCode?: SyncErrorCode;
}
function sessionMatches(session: SyncSession, scope: SyncScope): boolean {
  return session.authenticated && session.accountId === scope.accountId;
}
function assertSession(session: SyncSession, scope: SyncScope, generation: string): void {
  if (!session.authenticated) throw new SyncProtocolError('AUTH_REQUIRED');
  if (!sessionMatches(session, scope) || session.generation !== generation) throw new SyncProtocolError('ACCOUNT_CHANGED');
}
/** Transport failures, malformed responses and auth expiry always leave the durable operation pending. */
export class SyncOutbox {
  private running = new Map<string, Promise<SyncReport>>();
  constructor(private store: SyncOutboxStore, private getSession: () => SyncSession,
    private transport: SyncTransport | null = null) {}

  flush(scope: SyncScope,options:{signal?:AbortSignal;onProgress?:(acknowledged:number,remaining:number)=>void}={}): Promise<SyncReport> {
    assertScope(scope);
    const captured = clone(scope);
    const key = JSON.stringify([scope.accountId, scope.projectId]);
    const existing = this.running.get(key);
    if (existing) return existing;
    const pending = this.perform(captured,{signal:options.signal,onProgress:options.onProgress}).finally(() => this.running.delete(key));
    this.running.set(key, pending);
    return pending;
  }

  private async perform(scope: SyncScope,options:{signal?:AbortSignal;onProgress?:(acknowledged:number,remaining:number)=>void}): Promise<SyncReport> {
    const report: SyncReport = { status: 'idle', acknowledged: 0, remaining: 0, conflicts: 0, confirmedRevision: null };
    try {
      const cancelled=()=>{if(options.signal?.aborted)throw new SyncProtocolError('CANCELLED');};
      cancelled();
      const initialSession = clone(this.getSession());
      if (!sessionMatches(initialSession, scope)) return { ...report,
        status: initialSession.authenticated ? 'account-changed' : 'auth-required',
        errorCode: initialSession.authenticated ? 'ACCOUNT_CHANGED' : 'AUTH_REQUIRED' };
      const queued = await this.store.list(scope);
      assertSession(this.getSession(), scope, initialSession.generation);
      report.remaining = queued.length;
      if (!this.transport) return { ...report, status: 'not-configured', errorCode: 'TRANSPORT_UNAVAILABLE' };
      // The barrier is durable: a new flush or a restarted client must still see unresolved alternatives.
      const unresolved = await this.store.listUnresolvedConflicts(scope);
      assertSession(this.getSession(), scope, initialSession.generation);
      let candidates = unresolved.length ? queued.filter(operation =>
        unresolved.some(conflict => conflict.operationId === operation.resolvesOperationId)) : queued;
      if (unresolved.length && !candidates.length) return { ...report, status: 'conflict', conflicts: unresolved.reduce((count, row) => count + row.conflicts.length, 0) };
      const sent = new Set<string>();
      while (candidates.length) {
        cancelled();
        const stored = candidates[0];
        if (sent.has(stored.operationId) || sent.size >= 10000) return { ...report, status: 'pending' };
        sent.add(stored.operationId);
        const operation = clone(stored);
        await assertOperation(operation);
        if (!sameScope(operation.scope, scope)) throw new SyncProtocolError('PROTOCOL_INVALID');
        const before = this.getSession();
        assertSession(before, scope, initialSession.generation);
        const ack = await this.transport.send(operation, clone(before),options.signal);
        const after = this.getSession();
        assertSession(after, scope, initialSession.generation);
        await assertAck(operation, ack);
        assertSession(this.getSession(), scope, initialSession.generation);
        try { await this.store.commitAck(scope, clone(ack)); }
        catch { throw new SyncProtocolError('LOCAL_COMMIT_FAILED'); }
        report.acknowledged++;
        report.remaining--;
        report.confirmedRevision = ack.serverRevision;
        try{options.onProgress?.(report.acknowledged,report.remaining);}catch{/* Observation never changes a durable acknowledgement. */}
        assertSession(this.getSession(), scope, initialSession.generation);
        if (ack.status === 'conflict') {
          report.conflicts += ack.conflicts.length;
          // All targets were rejected atomically. Later dependent edits must wait for explicit resolution.
          report.status = 'conflict';
          return report;
        }
        // An ack changes the common base. Refetch and prepare dependent edits against that base.
        const barriers = await this.store.listUnresolvedConflicts(scope);
        const next = await this.store.list(scope);
        assertSession(this.getSession(), scope, initialSession.generation);
        report.remaining = next.length;
        candidates = barriers.length ? next.filter(row => barriers.some(c => c.operationId === row.resolvesOperationId)) : next;
        if (barriers.length && !candidates.length) return { ...report, status: 'conflict', conflicts: barriers.reduce((n,c)=>n+c.conflicts.length,0) };
      }
      const remaining = await this.store.list(scope);
      report.remaining = remaining.length;
      const conflicts = await this.store.listUnresolvedConflicts(scope);
      assertSession(this.getSession(), scope, initialSession.generation);
      if (conflicts.length) return { ...report, status: 'conflict', conflicts: conflicts.reduce((count, row) => count + row.conflicts.length, 0) };
      report.status = remaining.length ? 'pending' : report.acknowledged ? 'synced' : 'idle';
      return report;
    } catch (error) {
      const code = options.signal?.aborted?'CANCELLED':error instanceof SyncProtocolError ? error.code : 'TRANSPORT_UNAVAILABLE';
      report.errorCode = code;
      report.status = code === 'AUTH_REQUIRED' ? 'auth-required' : code === 'ACCOUNT_CHANGED' ? 'account-changed' :
        code === 'FORBIDDEN' ? 'forbidden' : code==='CANCELLED'?'pending':'failed';
      return report;
    }
  }
}

export const syncCapability = Object.freeze({
  protocolVersion: 1,
  backendConfigured: false,
  liveAuthenticationVerified: false,
  rlsVerified: false,
  privateStorageVerified: false,
});
