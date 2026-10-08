/** Contract fixtures ONLY: this does not implement JWT auth, a production DB, RLS or private Storage. */
import {
  assertDocumentTarget, assertOperation, assertScope, clone, sameScope, sameValue, SyncProtocolError, valueHash,
  type Revision, type SyncAck, type SyncConflict, type SyncDocument, type SyncOperation, type SyncOutboxStore,
  type SyncScope, type SyncSession, type SyncTransport,
} from './protocol';
import { threeWayMerge } from './merge';
import { assertAck } from './validation';

type Role = 'owner' | 'editor' | 'reviewer' | 'reader';
interface ContractProject {
  revision: Revision;
  documents: Map<string, SyncDocument>;
  history: Map<Revision, Map<string, SyncDocument>>;
  members: Map<string, Role>;
}
const scopeKey = (scope: SyncScope) => JSON.stringify([scope.accountId, scope.projectId]);
const requestKey = (operation: SyncOperation) => JSON.stringify([operation.scope.accountId, operation.scope.projectId, operation.operationId]);
const copyDocuments = (documents: Map<string, SyncDocument>) => new Map([...documents].map(([id, doc]) => [id, clone(doc)]));
const sameContent = (a: SyncDocument | null, b: SyncDocument | null) => sameValue(
  a ? { fields: a.fields, tombstone: a.tombstone } : null,
  b ? { fields: b.fields, tombstone: b.tombstone } : null,
);

/** A serialized reference server used to exercise lost replies, duplicate requests and membership withdrawal. */
export class ContractSyncServer implements SyncTransport {
  private projects = new Map<string, ContractProject>();
  private ledger = new Map<string, SyncAck>();
  private queue: Promise<unknown> = Promise.resolve();
  constructor(private validate?: (documents: readonly SyncDocument[], scope: SyncScope) => void) {}

  seed(input: { projectId: string; revision: Revision; documents: SyncDocument[]; members: Record<string, Role> }): void {
    const accountId = Object.keys(input.members)[0] ?? 'contract-fixture';
    assertScope({ projectId: input.projectId, accountId });
    if (!/^(0|[1-9][0-9]*)$/.test(input.revision)) throw new SyncProtocolError('PROTOCOL_INVALID');
    const documents = new Map<string, SyncDocument>();
    for (const doc of input.documents) {
      assertDocumentTarget(doc, { projectId: input.projectId, accountId }, doc.id);
      if (documents.has(doc.id) || BigInt(doc.revision) > BigInt(input.revision)) throw new SyncProtocolError('PROTOCOL_INVALID');
      documents.set(doc.id, clone(doc));
    }
    this.projects.set(input.projectId, { revision: input.revision, documents,
      history: new Map([[input.revision, copyDocuments(documents)]]), members: new Map(Object.entries(input.members)) });
  }
  setMember(projectId: string, accountId: string, role: Role | null): void {
    const project = this.projects.get(projectId);
    if (!project) throw new SyncProtocolError('FORBIDDEN');
    if (role === null) project.members.delete(accountId); else project.members.set(accountId, role);
  }
  readForTest(projectId: string): { revision: Revision; documents: SyncDocument[] } {
    const project = this.projects.get(projectId);
    if (!project) throw new SyncProtocolError('FORBIDDEN');
    return { revision: project.revision, documents: [...project.documents.values()].map(doc => clone(doc)) };
  }
  send(operation: SyncOperation, session: SyncSession): Promise<SyncAck> {
    const captured = clone(operation);
    const authentication = clone(session);
    const request = this.queue.then(() => this.apply(captured, authentication));
    this.queue = request.catch(() => undefined);
    return request;
  }
  private async apply(operation: SyncOperation, session: SyncSession): Promise<SyncAck> {
    if (!session.authenticated || !session.accountId) throw new SyncProtocolError('AUTH_REQUIRED');
    if (session.accountId !== operation.scope.accountId) throw new SyncProtocolError('FORBIDDEN');
    const project = this.projects.get(operation.scope.projectId);
    const role = project?.members.get(session.accountId);
    if (!project || !role || (role !== 'owner' && role !== 'editor')) throw new SyncProtocolError('FORBIDDEN');
    await assertOperation(operation);
    // Authorization is rechecked before replay, so a revoked member cannot retrieve a cached author ack.
    if (role === 'editor') {
      for (const target of operation.targets) {
        const current = project.documents.get(target.targetId);
        if ((current && current.fields.visibility !== 'team') || target.local.fields.visibility !== 'team' ||
          (target.base && target.base.fields.visibility !== 'team')) throw new SyncProtocolError('FORBIDDEN');
      }
    }
    const hash = await valueHash(operation);
    const key = requestKey(operation);
    const previous = this.ledger.get(key);
    if (previous) {
      if (previous.operationHash !== hash) throw new SyncProtocolError('OPERATION_REUSED');
      return clone(previous);
    }
    const baseDocuments = project.history.get(operation.baseRevision);
    if (!baseDocuments) throw new SyncProtocolError('BASE_UNAVAILABLE');
    const conflicts: SyncConflict[] = [];
    const candidates: SyncDocument[] = [];
    for (const target of operation.targets) {
      const actualBase = baseDocuments.get(target.targetId) ?? null;
      if (!sameValue(actualBase, target.base)) throw new SyncProtocolError('PROTOCOL_INVALID');
      if (target.base?.fields.kind !== undefined && !sameValue(target.base.fields.kind, target.local.fields.kind)) {
        throw new SyncProtocolError('PROTOCOL_INVALID');
      }
      const current = project.documents.get(target.targetId) ?? null;
      const merged = threeWayMerge(actualBase, target.local, current);
      if (merged.status === 'conflict') conflicts.push(merged.conflict); else candidates.push(merged.document);
    }
    const common = { schemaVersion: 1 as const, operationId: operation.operationId, scope: clone(operation.scope), operationHash: hash };
    let ack: SyncAck;
    if (conflicts.length) {
      ack = { ...common, status: 'conflict', serverRevision: project.revision,
        documents: operation.targets.map(target => clone(project.documents.get(target.targetId) ?? null)), confirmedDocuments:[...project.documents.values()].map(doc=>clone(doc)), conflicts };
    } else {
      const hasChange = candidates.some(candidate => !sameContent(project.documents.get(candidate.id) ?? null, candidate));
      const revision = hasChange ? (BigInt(project.revision) + 1n).toString() : project.revision;
      const next = copyDocuments(project.documents);
      for (const candidate of candidates) {
        if (!sameContent(next.get(candidate.id) ?? null, candidate)) {
          candidate.revision = revision;
          next.set(candidate.id, clone(candidate));
        }
      }
      this.validate?.([...next.values()].map(doc => clone(doc)), clone(operation.scope));
      // Commit records, server revision, revision snapshot and idempotency ledger together.
      ack = { ...common, status: 'applied', serverRevision: revision, conflicts: [],
        documents: operation.targets.map(target => clone(next.get(target.targetId)!)), confirmedDocuments:[...next.values()].map(doc=>clone(doc)) };
      project.documents = next;
      project.revision = revision;
      if (hasChange) project.history.set(revision, copyDocuments(next));
    }
    this.ledger.set(key, clone(ack));
    return clone(ack);
  }
}

interface OutboxPartition {
  pending: Map<string, SyncOperation>;
  acks: Map<string, SyncAck>;
  confirmed: Map<string, SyncDocument>;
  serverRevision: Revision | null;
  unresolved: Map<string, SyncConflict[]>;
  operations: Map<string, SyncOperation>;
}
/** Atomic in-memory store fixture. Production stores must provide the same transaction guarantees. */
export class MemorySyncOutboxStore implements SyncOutboxStore {
  private partitions = new Map<string, OutboxPartition>();
  failNextCommit = false;
  private partition(scope: SyncScope): OutboxPartition {
    assertScope(scope);
    const key = scopeKey(scope);
    let partition = this.partitions.get(key);
    if (!partition) {
      partition = { pending: new Map(), acks: new Map(), confirmed: new Map(), serverRevision: null, unresolved: new Map(), operations: new Map() };
      this.partitions.set(key, partition);
    }
    return partition;
  }
  async enqueue(operation: SyncOperation): Promise<void> {
    await assertOperation(operation);
    const partition = this.partition(operation.scope);
    const existing = partition.pending.get(operation.operationId);
    if (operation.resolvesOperationId) {
      const conflicts = partition.unresolved.get(operation.resolvesOperationId);
      const original = partition.operations.get(operation.resolvesOperationId);
      if (!conflicts || !original || !sameValue(original.targets.map(target => target.targetId).sort(), operation.targets.map(target => target.targetId).sort())) {
        throw new SyncProtocolError('PROTOCOL_INVALID');
      }
    }
    if (partition.acks.has(operation.operationId) || (existing && !sameValue(existing, operation))) {
      throw new SyncProtocolError('OPERATION_REUSED');
    }
    if (!existing) {
      partition.pending.set(operation.operationId, clone(operation));
      partition.operations.set(operation.operationId, clone(operation));
    }
  }
  async list(scope: SyncScope): Promise<SyncOperation[]> {
    return [...this.partition(scope).pending.values()].map(operation => clone(operation));
  }
  async listUnresolvedConflicts(scope: SyncScope): Promise<{operationId: string; conflicts: SyncConflict[]}[]> {
    return [...this.partition(scope).unresolved.entries()].map(([operationId, conflicts]) => ({operationId, conflicts: clone(conflicts)}));
  }
  async commitAck(scope: SyncScope, ack: SyncAck): Promise<void> {
    if (!sameScope(scope, ack.scope)) throw new SyncProtocolError('PROTOCOL_INVALID');
    const current = this.partition(scope);
    const previous = current.acks.get(ack.operationId);
    if (previous) {
      if (!sameValue(previous, ack)) throw new SyncProtocolError('OPERATION_REUSED');
      return;
    }
    const operation = current.pending.get(ack.operationId);
    if (!operation) throw new SyncProtocolError('PROTOCOL_INVALID');
    await assertAck(operation, ack);
    const next: OutboxPartition = { pending: new Map(current.pending), acks: new Map(current.acks),
      confirmed: copyDocuments(current.confirmed), serverRevision: current.serverRevision, unresolved: new Map(current.unresolved), operations: new Map(current.operations) };
    next.acks.set(ack.operationId, clone(ack));
    if (ack.status === 'conflict') next.unresolved.set(ack.operationId, clone(ack.conflicts));
    if (ack.status === 'applied' && operation.resolvesOperationId) {
      const prior = next.unresolved.get(operation.resolvesOperationId);
      if (!prior) throw new SyncProtocolError('PROTOCOL_INVALID');
      const unresolved = prior.filter(conflict => !operation.targets.some(target => target.targetId === conflict.targetId));
      if (unresolved.length) next.unresolved.set(operation.resolvesOperationId, unresolved);
      else next.unresolved.delete(operation.resolvesOperationId);
    }
    if (!next.serverRevision || BigInt(ack.serverRevision) > BigInt(next.serverRevision)) next.serverRevision = ack.serverRevision;
    if (ack.status === 'applied') for (const doc of ack.documents) if (doc) {
      const old = next.confirmed.get(doc.id);
      if (!old || BigInt(old.revision) <= BigInt(doc.revision)) next.confirmed.set(doc.id, clone(doc));
    }
    next.pending.delete(ack.operationId);
    if (this.failNextCommit) { this.failNextCommit = false; throw new Error('Injected local transaction failure'); }
    this.partitions.set(scopeKey(scope), next);
  }
  inspectForTest(scope: SyncScope): { acks: SyncAck[]; operations: SyncOperation[]; confirmed: SyncDocument[]; serverRevision: Revision | null } {
    const partition = this.partition(scope);
    return { acks: [...partition.acks.values()].map(ack => clone(ack)), operations: [...partition.operations.values()].map(operation => clone(operation)),
      confirmed: [...partition.confirmed.values()].map(doc => clone(doc)), serverRevision: partition.serverRevision };
  }
}
