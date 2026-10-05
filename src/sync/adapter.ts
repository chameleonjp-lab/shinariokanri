import {
  assertDocument, assertScope, clone, sameScope, SyncProtocolError,
  type SyncAck, type SyncConflict, type SyncDocument, type SyncOperation, type SyncOutboxStore, type SyncScope,
} from './protocol';
import { flattenFields } from './merge';

export interface SyncSourceRecord {
  id: string; projectId: string; revision: string;
  deletedAt?: string | null; deletionOperationId?: string | null;
}
/** Caller selects a confirmed server record for a common base, or a local record for a candidate. */
export function toSyncDocument<T extends SyncSourceRecord>(record: T): SyncDocument {
  if (record.deletedAt && !record.deletionOperationId) throw new SyncProtocolError('PROTOCOL_INVALID');
  const document: SyncDocument = {
    id: record.id, projectId: record.projectId, revision: record.revision,
    fields: flattenFields(record as unknown as Record<string, unknown>),
    tombstone: record.deletedAt ? { deletedAt: record.deletedAt, operationId: record.deletionOperationId! } : null,
  };
  assertDocument(document);
  return document;
}

export interface PreparedSyncStorage {
  /** The storage implementation is permanently bound to one account namespace, never the guest DB. */
  readonly accountId: string;
  listPreparedOperations(projectId: string): Promise<SyncOperation[]>;
  listPreparedConflicts(projectId: string): Promise<{operationId: string; conflicts: SyncConflict[]}[]>;
  /** One transaction: full original operation + ack + rejected alternatives + revision + outbox removal.
   * Refuse a resolution which omits any target of the rejected atomic batch. */
  commitPreparedAck(projectId: string, ack: SyncAck): Promise<void>;
}
/** Bridges a native local repository to the protocol while refusing account or project substitution. */
export class AccountScopedSyncStore implements SyncOutboxStore {
  private readonly accountId: string;
  constructor(private storage: PreparedSyncStorage) {
    if (!storage.accountId || storage.accountId === 'guest') throw new SyncProtocolError('AUTH_REQUIRED');
    this.accountId = storage.accountId;
  }
  private authorize(scope: SyncScope): void {
    assertScope(scope);
    if (scope.accountId !== this.accountId || this.storage.accountId !== this.accountId) throw new SyncProtocolError('FORBIDDEN');
  }
  async list(scope: SyncScope): Promise<SyncOperation[]> {
    this.authorize(scope);
    const operations = await this.storage.listPreparedOperations(scope.projectId);
    if (operations.some(operation => !sameScope(operation.scope, scope))) throw new SyncProtocolError('PROTOCOL_INVALID');
    return clone(operations);
  }
  async commitAck(scope: SyncScope, ack: SyncAck): Promise<void> {
    this.authorize(scope);
    if (!sameScope(scope, ack.scope)) throw new SyncProtocolError('PROTOCOL_INVALID');
    await this.storage.commitPreparedAck(scope.projectId, clone(ack));
  }
  async listUnresolvedConflicts(scope: SyncScope): Promise<{operationId: string; conflicts: SyncConflict[]}[]> {
    this.authorize(scope);
    return clone(await this.storage.listPreparedConflicts(scope.projectId));
  }
}
