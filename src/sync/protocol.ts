/** Backend-independent sync contract. Author data never belongs in a reader projection. */
export type JsonValue = null | boolean | number | string | JsonValue[] | { [key: string]: JsonValue };
export type Revision = string;
export interface SyncScope { accountId: string; projectId: string }
export interface SyncTombstone { deletedAt: string; operationId: string }
export interface SyncDocument {
  id: string;
  projectId: string;
  revision: Revision;
  /** Each value is atomic: a RichText, ordered array, or parent reference is never recursively merged. */
  fields: Record<string, JsonValue>;
  tombstone: SyncTombstone | null;
}
export type FieldSlot = { present: false } | { present: true; value: JsonValue };
export interface SyncFieldChange { field: string; oldValueHash: string; value: FieldSlot }
export interface SyncTargetChange {
  targetId: string;
  base: SyncDocument | null;
  local: SyncDocument;
  changes: SyncFieldChange[];
}
export interface SyncOperation {
  schemaVersion: 1;
  operationId: string;
  scope: SyncScope;
  /** Last confirmed PROJECT revision; local save revisions are not server revisions. */
  baseRevision: Revision;
  targets: SyncTargetChange[];
  reason: string;
  /** Explicitly ties a resolution command to preserved alternatives; ordinary edits cannot clear them. */
  resolvesOperationId?: string;
}
export interface SyncFieldConflict {
  field: string;
  base: FieldSlot;
  local: FieldSlot;
  server: FieldSlot;
}
export type SyncConflictReason = 'same-field' | 'delete-versus-edit' | 'concurrent-create' | 'missing-server-record';
export interface SyncConflict {
  targetId: string;
  base: SyncDocument | null;
  local: SyncDocument;
  server: SyncDocument | null;
  reasons: SyncConflictReason[];
  fields: SyncFieldConflict[];
  /** Only uncontested slots; not a complete or committed document. */
  automaticFields: Record<string, FieldSlot>;
}
interface AckBase {
  schemaVersion: 1;
  operationId: string;
  scope: SyncScope;
  operationHash: string;
  serverRevision: Revision;
  /** Same order as operation.targets. Tombstones are retained, never physically removed. */
  documents: (SyncDocument | null)[];
}
export type SyncAck = (AckBase & { status: 'applied'; conflicts: [] }) |
  (AckBase & { status: 'conflict'; conflicts: SyncConflict[] });
export type SyncErrorCode = 'PROTOCOL_INVALID' | 'AUTH_REQUIRED' | 'FORBIDDEN' | 'ACCOUNT_CHANGED' |
  'OPERATION_REUSED' | 'BASE_UNAVAILABLE' | 'REVISION_CHANGED' | 'TRANSPORT_UNAVAILABLE' | 'LOCAL_COMMIT_FAILED';
/** Only codes are surfaced; transport error bodies can contain author text or credentials. */
export class SyncProtocolError extends Error {
  constructor(readonly code: SyncErrorCode) { super(code); this.name = 'SyncProtocolError'; }
}
export interface SyncSession {
  accountId: string | null;
  authenticated: boolean;
  /** Changes on sign-out/sign-in, including signing in to the same account again. */
  generation: string;
}
export interface SyncTransport {
  /** A real adapter must authenticate the JWT and validate membership/type/reference scope server-side. */
  send(operation: SyncOperation, session: SyncSession): Promise<SyncAck>;
}
export interface SyncOutboxStore {
  /** Must return only this account and project, in local operation order. */
  list(scope: SyncScope): Promise<SyncOperation[]>;
  listUnresolvedConflicts(scope: SyncScope): Promise<{ operationId: string; conflicts: SyncConflict[] }[]>;
  /** Atomically retain the full original operation (including nonconflicting rejected targets), ack,
   * conflicts and server revision BEFORE removing it from outbox. A resolution must cover the entire batch. */
  commitAck(scope: SyncScope, ack: SyncAck): Promise<void>;
}

export const TOMBSTONE_FIELD = '$tombstone';
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const blockedKeys = new Set(['__proto__', 'prototype', 'constructor']);
function invalid(): never { throw new SyncProtocolError('PROTOCOL_INVALID'); }
export function isRevision(value: unknown): value is Revision {
  return typeof value === 'string' && /^(0|[1-9][0-9]*)$/.test(value) && value.length <= 128;
}
export function assertScope(scope: SyncScope): void {
  if (!scope || typeof scope.accountId !== 'string' || !scope.accountId.trim() || scope.accountId.length > 256 ||
    !uuid.test(scope.projectId)) invalid();
}
export function sameScope(a: SyncScope, b: SyncScope): boolean {
  return a.accountId === b.accountId && a.projectId === b.projectId;
}
export function clone<T>(value: T): T { return structuredClone(value); }

/** Deterministic JSON, with objects sorted and array order preserved. Missing differs from null. */
export function canonicalJson(value: unknown): string {
  const ancestors = new Set<object>();
  function encode(current: unknown, depth: number): string {
    if (depth > 100) return invalid();
    if (current === null || typeof current === 'boolean' || typeof current === 'string') return JSON.stringify(current);
    if (typeof current === 'number' && Number.isFinite(current)) return JSON.stringify(current);
    if (!current || typeof current !== 'object' || ancestors.has(current)) return invalid();
    const prototype = Object.getPrototypeOf(current);
    if (!Array.isArray(current) && prototype !== Object.prototype && prototype !== null) return invalid();
    ancestors.add(current);
    let result: string;
    if (Array.isArray(current)) {
      if (Object.keys(current).length !== current.length) return invalid();
      result = '[' + current.map(item => encode(item, depth + 1)).join(',') + ']';
    } else {
      result = '{' + Object.keys(current).sort().map(key => {
        if (blockedKeys.has(key)) return invalid();
        return JSON.stringify(key) + ':' + encode((current as Record<string, unknown>)[key], depth + 1);
      }).join(',') + '}';
    }
    ancestors.delete(current);
    return result;
  }
  return encode(value, 0);
}
export function sameValue(a: unknown, b: unknown): boolean { return canonicalJson(a) === canonicalJson(b); }
export async function valueHash(value: unknown): Promise<string> {
  const bytes = new TextEncoder().encode(canonicalJson(value));
  const digest = await globalThis.crypto.subtle.digest('SHA-256', bytes);
  return 'sha256:' + Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, '0')).join('');
}
export function fieldSlot(document: SyncDocument | null, field: string): FieldSlot {
  if (field === TOMBSTONE_FIELD) return { present: true, value: document?.tombstone ?
    { deletedAt: document.tombstone.deletedAt, operationId: document.tombstone.operationId } : null };
  return document && Object.hasOwn(document.fields, field) ?
    { present: true, value: clone(document.fields[field]) } : { present: false };
}
export function assertDocument(document: SyncDocument): void {
  if (!document || !uuid.test(document.id) || !uuid.test(document.projectId) || !isRevision(document.revision) ||
    !document.fields || Array.isArray(document.fields) || typeof document.fields !== 'object' ||
    Object.keys(document.fields).some(field => field === TOMBSTONE_FIELD || blockedKeys.has(field) || !field)) invalid();
  canonicalJson(document.fields);
  if (document.tombstone !== null && (!document.tombstone || !uuid.test(document.tombstone.operationId) ||
    typeof document.tombstone.deletedAt !== 'string' || !/^\d{4}-\d{2}-\d{2}T/.test(document.tombstone.deletedAt) ||
    !Number.isFinite(Date.parse(document.tombstone.deletedAt)))) invalid();
}
export function assertDocumentTarget(document: SyncDocument, scope: SyncScope, targetId: string): void {
  assertDocument(document);
  if (document.projectId !== scope.projectId || document.id !== targetId) invalid();
}

async function changesBetween(base: SyncDocument | null, local: SyncDocument): Promise<SyncFieldChange[]> {
  const fields = [...new Set([...Object.keys(base?.fields ?? {}), ...Object.keys(local.fields), TOMBSTONE_FIELD])].sort();
  const changes: SyncFieldChange[] = [];
  for (const field of fields) {
    const before = fieldSlot(base, field);
    const after = fieldSlot(local, field);
    if (!sameValue(before, after)) changes.push({ field, oldValueHash: await valueHash(before), value: after });
  }
  return changes;
}
export async function createSyncOperation(input: {
  operationId: string; scope: SyncScope; baseRevision: Revision;
  targets: { base: SyncDocument | null; local: SyncDocument }[]; reason?: string;
  resolvesOperationId?: string;
}): Promise<SyncOperation> {
  assertScope(input.scope);
  if (!uuid.test(input.operationId) || !isRevision(input.baseRevision) || !input.targets.length ||
    input.targets.length > 10_000 || (input.reason !== undefined && typeof input.reason !== 'string') ||
    (input.resolvesOperationId !== undefined && (!uuid.test(input.resolvesOperationId) || input.resolvesOperationId === input.operationId))) invalid();
  const ids = new Set<string>();
  const targets: SyncTargetChange[] = [];
  for (const target of input.targets) {
    const local = clone(target.local);
    assertDocumentTarget(local, input.scope, local.id);
    if (ids.has(local.id)) invalid();
    ids.add(local.id);
    if (target.base) {
      assertDocumentTarget(target.base, input.scope, local.id);
      if (BigInt(target.base.revision) > BigInt(input.baseRevision)) invalid();
    }
    targets.push({ targetId: local.id, base: clone(target.base), local, changes: await changesBetween(target.base, local) });
  }
  return { schemaVersion: 1, operationId: input.operationId, scope: clone(input.scope),
    baseRevision: input.baseRevision, targets, reason: input.reason ?? '', ...(input.resolvesOperationId ? { resolvesOperationId: input.resolvesOperationId } : {}) };
}
export async function assertOperation(operation: SyncOperation): Promise<void> {
  if (!operation || operation.schemaVersion !== 1 || !Array.isArray(operation.targets)) invalid();
  const expected = await createSyncOperation({ ...operation, targets: operation.targets.map(target => ({ base: target.base, local: target.local })) });
  if (!sameValue(operation, expected)) invalid();
}
export async function assertAckEnvelope(operation: SyncOperation, ack: SyncAck): Promise<void> {
  if (!ack || ack.schemaVersion !== 1 || ack.operationId !== operation.operationId || !sameScope(ack.scope, operation.scope) ||
    ack.operationHash !== await valueHash(operation) || !isRevision(ack.serverRevision) ||
    BigInt(ack.serverRevision) < BigInt(operation.baseRevision) || !Array.isArray(ack.documents) ||
    ack.documents.length !== operation.targets.length || !Array.isArray(ack.conflicts)) invalid();
  for (const [index, document] of ack.documents.entries()) {
    if (document) {
      assertDocumentTarget(document, operation.scope, operation.targets[index].targetId);
      if (BigInt(document.revision) > BigInt(ack.serverRevision)) invalid();
    }
  }
  if (ack.status === 'applied') {
    if (ack.conflicts.length || ack.documents.some(document => !document)) invalid();
    if (operation.targets.some(target => target.changes.length) && BigInt(ack.serverRevision) <= BigInt(operation.baseRevision)) invalid();
    for (const [index, target] of operation.targets.entries()) {
      const document = ack.documents[index]!;
      const changed = !target.base || !sameValue({fields: target.base.fields, tombstone: target.base.tombstone}, {fields: document.fields, tombstone: document.tombstone});
      if (changed && BigInt(document.revision) <= BigInt(operation.baseRevision)) invalid();
    }
  } else if (ack.status === 'conflict') {
    if (!ack.conflicts.length) invalid();
    const conflictIds = new Set<string>();
    for (const conflict of ack.conflicts) {
      const index = operation.targets.findIndex(target => target.targetId === conflict.targetId);
      if (index < 0 || conflictIds.has(conflict.targetId) || !sameValue(conflict.base, operation.targets[index].base) ||
        !sameValue(conflict.local, operation.targets[index].local) || !sameValue(conflict.server, ack.documents[index])) invalid();
      conflictIds.add(conflict.targetId);
    }
  } else invalid();
}
