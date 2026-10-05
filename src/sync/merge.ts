import {
  assertDocument, clone, createSyncOperation, fieldSlot, sameValue, SyncProtocolError, TOMBSTONE_FIELD,
  type FieldSlot, type SyncConflict, type SyncDocument, type SyncOperation, type SyncScope,
} from './protocol';

export type MergeResult = { status: 'merged'; document: SyncDocument } | { status: 'conflict'; conflict: SyncConflict };
function content(document: SyncDocument | null): unknown {
  return document ? { fields: document.fields, tombstone: document.tombstone } : null;
}
function put(fields: Record<string, SyncDocument['fields'][string]>, field: string, slot: FieldSlot): void {
  if (slot.present) fields[field] = clone(slot.value);
}
function conflict(base: SyncDocument | null, local: SyncDocument, server: SyncDocument | null,
  reasons: SyncConflict['reasons']): SyncConflict {
  return { targetId: local.id, base: clone(base), local: clone(local), server: clone(server), reasons, fields: [], automaticFields: {} };
}
/** Never chooses a winner by timestamps. Inputs and returned alternatives do not alias. */
export function threeWayMerge(base: SyncDocument | null, local: SyncDocument, server: SyncDocument | null): MergeResult {
  assertDocument(local);
  for (const document of [base, server]) {
    if (document) {
      assertDocument(document);
      if (document.id !== local.id || document.projectId !== local.projectId) throw new SyncProtocolError('PROTOCOL_INVALID');
    }
  }
  if (!base) {
    if (!server || sameValue(content(local), content(server))) return { status: 'merged', document: clone(server ?? local) };
    return { status: 'conflict', conflict: conflict(base, local, server, ['concurrent-create']) };
  }
  if (!server) return { status: 'conflict', conflict: conflict(base, local, server, ['missing-server-record']) };

  const localChanged = !sameValue(content(base), content(local));
  const serverChanged = !sameValue(content(base), content(server));
  if (!localChanged) return { status: 'merged', document: clone(server) };
  if (!serverChanged) return { status: 'merged', document: clone(local) };
  if (sameValue(content(local), content(server))) return { status: 'merged', document: clone(server) };

  const localDeleted = local.tombstone !== null;
  const serverDeleted = server.tombstone !== null;
  const localLifecycleChange = !sameValue(base.tombstone, local.tombstone);
  const serverLifecycleChange = !sameValue(base.tombstone, server.tombstone);
  if (localDeleted !== serverDeleted && (localLifecycleChange || serverLifecycleChange)) {
    return { status: 'conflict', conflict: conflict(base, local, server, ['delete-versus-edit']) };
  }
  // Deleted records cannot be edited in place or silently restored through an unrelated field merge.
  if (localDeleted || serverDeleted) {
    if (localDeleted && serverDeleted && sameValue(local.fields, server.fields)) {
      // Independent deletions agree; retain the already confirmed server tombstone and operation ID.
      return { status: 'merged', document: clone(server) };
    }
    return { status: 'conflict', conflict: conflict(base, local, server, ['delete-versus-edit']) };
  }

  const result = clone(server);
  result.fields = {};
  const unresolved = conflict(base, local, server, ['same-field']);
  const fields = [...new Set([...Object.keys(base.fields), ...Object.keys(local.fields), ...Object.keys(server.fields)])].sort();
  for (const field of fields) {
    const before = fieldSlot(base, field);
    const a = fieldSlot(local, field);
    const b = fieldSlot(server, field);
    let chosen: FieldSlot;
    if (sameValue(a, b)) chosen = a;
    else if (sameValue(a, before)) chosen = b;
    else if (sameValue(b, before)) chosen = a;
    else {
      unresolved.fields.push({ field, base: before, local: a, server: b });
      continue;
    }
    unresolved.automaticFields[field] = clone(chosen);
    put(result.fields, field, chosen);
  }
  return unresolved.fields.length ? { status: 'conflict', conflict: unresolved } : { status: 'merged', document: result };
}

export type ConflictResolution = { strategy: 'local' | 'server' } | {
  strategy: 'fields'; choices: Record<string, 'local' | 'server' | { value: FieldSlot }>;
};
/** Resolution is a new command against the current server revision, never a mutation of original alternatives. */
export async function createResolutionOperation(input: {
  conflict: SyncConflict; resolution: ConflictResolution; latestServer: SyncDocument | null;
  latestServerRevision: string; scope: SyncScope; operationId: string; reason?: string;
  conflictOperationId?: string;
  /** All other targets rejected with the same atomic operation, rebased against their confirmed server values. */
  additionalTargets?: { base: SyncDocument | null; local: SyncDocument }[];
}): Promise<SyncOperation> {
  const { conflict: saved, resolution } = input;
  if (!sameValue(saved.server, input.latestServer)) throw new SyncProtocolError('REVISION_CHANGED');
  const verified = threeWayMerge(saved.base, saved.local, saved.server);
  if (verified.status !== 'conflict' || !sameValue(verified.conflict, saved)) throw new SyncProtocolError('PROTOCOL_INVALID');
  if (!saved.server) throw new SyncProtocolError('BASE_UNAVAILABLE');
  let local: SyncDocument;
  if ('choices' in resolution) {
    if (saved.reasons.some(reason => reason !== 'same-field')) throw new SyncProtocolError('PROTOCOL_INVALID');
    const required = saved.fields.map(field => field.field).sort();
    if (!sameValue(Object.keys(resolution.choices).sort(), required)) throw new SyncProtocolError('PROTOCOL_INVALID');
    local = clone(saved.server);
    local.fields = {};
    for (const [field, slot] of Object.entries(saved.automaticFields)) put(local.fields, field, slot);
    for (const field of saved.fields) {
      const choice = resolution.choices[field.field];
      const slot = choice === 'local' ? field.local : choice === 'server' ? field.server : choice.value;
      put(local.fields, field.field, slot);
    }
  } else {
    local = clone(resolution.strategy === 'local' ? saved.local : saved.server);
  }
  local.revision = saved.server.revision;
  // Tombstone clearing must be an explicit local/combined resolution; the merge never clears it automatically.
  return createSyncOperation({ operationId: input.operationId, scope: input.scope,
    baseRevision: input.latestServerRevision, targets: [{ base: saved.server, local }, ...(input.additionalTargets ?? [])],
    reason: input.reason ?? 'Resolve preserved sync alternatives', resolvesOperationId: input.conflictOperationId });
}

/** Flatten one data level: separate rich-text fields merge independently, each document remains atomic. */
export function flattenFields(record: Record<string, unknown>): Record<string, SyncDocument['fields'][string]> {
  const fields: Record<string, SyncDocument['fields'][string]> = {};
  for (const [field, value] of Object.entries(record)) {
    if (['id', 'projectId', 'revision', 'createdAt', 'updatedAt', 'deletedAt', 'deleteOperationId', 'deletionOperationId'].includes(field)) continue;
    if (field === TOMBSTONE_FIELD || field.startsWith('data.')) throw new SyncProtocolError('PROTOCOL_INVALID');
    if (field === 'data' && value && typeof value === 'object' && !Array.isArray(value)) {
      for (const [key, nested] of Object.entries(value)) {
        if (key.includes('.')) throw new SyncProtocolError('PROTOCOL_INVALID');
        if (nested !== undefined) fields['data.' + key] = clone(nested) as SyncDocument['fields'][string];
      }
    } else if (value !== undefined) fields[field] = clone(value) as SyncDocument['fields'][string];
  }
  return fields;
}
