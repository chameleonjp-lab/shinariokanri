import { describe, expect, it, vi } from 'vitest';
import {
  AccountScopedSyncStore, assertAck, canonicalJson, clone, createResolutionOperation, createSyncOperation,
  fieldSlot, SyncOutbox, SyncProtocolError, syncCapability, threeWayMerge, toSyncDocument, valueHash,
  type SyncAck, type SyncDocument, type SyncOperation, type SyncScope, type SyncSession, type SyncTransport,
} from '../src/sync';
import { ContractSyncServer, MemorySyncOutboxStore } from '../src/sync/testing';

const projectId = '00000000-0000-4000-8000-000000000001';
const targetId = '00000000-0000-4000-8000-000000000002';
const secondId = '00000000-0000-4000-8000-000000000003';
const otherProjectId = '00000000-0000-4000-8000-000000000004';
const scope: SyncScope = { accountId: 'account-a', projectId };
const session: SyncSession = { accountId: scope.accountId, authenticated: true, generation: 'login-1' };
const operationId = (n: number) => `10000000-0000-4000-8000-${n.toString().padStart(12, '0')}`;
const body = (text: string) => [{ id: '20000000-0000-4000-8000-000000000001', kind: 'paragraph', text }];
const base = (): SyncDocument => ({ id: targetId, projectId, revision: '0', tombstone: null,
  fields: { kind: 'note', visibility: 'team', name: '元の名称', 'data.body': body('共通の本文'), order: ['a', 'b', 'c'], parentId: null } });
const change = (document: SyncDocument, fields: SyncDocument['fields']): SyncDocument => ({ ...clone(document), fields: { ...clone(document.fields), ...fields } });
const deleted = (document: SyncDocument, n = 99): SyncDocument => ({ ...clone(document),
  tombstone: { deletedAt: '2026-10-05T10:00:00.000Z', operationId: operationId(n) } });
async function operation(n: number, local = change(base(), { name: '端末案' }), common: SyncDocument | null = base(), baseRevision = '0'): Promise<SyncOperation> {
  return createSyncOperation({ operationId: operationId(n), scope, baseRevision, targets: [{ base: common, local }] });
}
function server(documents: SyncDocument[] = [base()]): ContractSyncServer {
  const instance = new ContractSyncServer();
  instance.seed({ projectId, revision: '0', documents,
    members: { 'account-a': 'owner', 'account-b': 'owner', editor: 'editor', reviewer: 'reviewer', reader: 'reader' } });
  return instance;
}
async function queued(n = 1): Promise<{ store: MemorySyncOutboxStore; op: SyncOperation }> {
  const store = new MemorySyncOutboxStore();
  const op = await operation(n);
  await store.enqueue(op);
  return { store, op };
}

describe('common-base three-way merge (REQ-N07 / AT-E06 contract)', () => {
  it('combines different fields without modifying either input', () => {
    const common = base();
    const local = change(common, { name: '端末名称' });
    const remote = change(common, { 'data.body': body('サーバー本文') });
    remote.revision = '1';
    const merged = threeWayMerge(common, local, remote);
    expect(merged.status).toBe('merged');
    if (merged.status !== 'merged') throw new Error('Expected merge');
    expect(merged.document.fields.name).toBe('端末名称');
    expect(merged.document.fields['data.body']).toEqual(body('サーバー本文'));
    merged.document.fields.name = 'changed returned copy';
    expect(local.fields.name).toBe('端末名称');
    expect(remote.fields.name).toBe('元の名称');
    expect(common).toEqual(base());
  });
  it('accepts the same field changed to the same value', () => {
    const local = change(base(), { name: '同じ名称' });
    const remote = change(base(), { name: '同じ名称' });
    remote.revision = '3';
    expect(threeWayMerge(base(), local, remote)).toEqual({ status: 'merged', document: remote });
  });
  it('keeps whole rich-text alternatives rather than combining separate blocks', () => {
    const common = base();
    common.fields['data.body'] = [...body('一段落'), { ...body('二段落')[0], id: secondId }];
    const local = change(common, { 'data.body': [...body('端末で一段落'), { ...body('二段落')[0], id: secondId }], name: '端末名称' });
    const remote = change(common, { 'data.body': [...body('一段落'), { ...body('サーバーで二段落')[0], id: secondId }] });
    const result = threeWayMerge(common, local, remote);
    expect(result.status).toBe('conflict');
    if (result.status !== 'conflict') throw new Error('Expected conflict');
    expect(result.conflict.fields.map(field => field.field)).toEqual(['data.body']);
    expect(result.conflict.base).toEqual(common);
    expect(result.conflict.local).toEqual(local);
    expect(result.conflict.server).toEqual(remote);
    expect(result.conflict.automaticFields.name).toEqual({ present: true, value: '端末名称' });
  });
  it.each(['order', 'parentId'])('treats simultaneous %s changes as an atomic field conflict', field => {
    const a = field === 'order' ? ['b', 'a', 'c'] : targetId;
    const b = field === 'order' ? ['a', 'c', 'b'] : secondId;
    const result = threeWayMerge(base(), change(base(), { [field]: a }), change(base(), { [field]: b }));
    expect(result.status).toBe('conflict');
    if (result.status === 'conflict') expect(result.conflict.fields[0].field).toBe(field);
  });
  it('distinguishes missing fields from null, preserving field removal', () => {
    const local = base();
    delete local.fields.parentId;
    const remote = change(base(), { name: '変更名称' });
    const result = threeWayMerge(base(), local, remote);
    if (result.status !== 'merged') throw new Error('Expected merge');
    expect(Object.hasOwn(result.document.fields, 'parentId')).toBe(false);
    expect(fieldSlot(result.document, 'parentId')).toEqual({ present: false });
    expect(fieldSlot(base(), 'parentId')).toEqual({ present: true, value: null });
  });
  it.each([true, false])('retains deletion versus editing in either arrival order (local deletes=%s)', localDeletes => {
    const removal = deleted(base());
    const edited = change(base(), { 'data.body': body('保持される編集案') });
    const result = threeWayMerge(base(), localDeletes ? removal : edited, localDeletes ? edited : removal);
    expect(result.status).toBe('conflict');
    if (result.status === 'conflict') {
      expect(result.conflict.reasons).toEqual(['delete-versus-edit']);
      expect(result.conflict.local).toEqual(localDeletes ? removal : edited);
      expect(result.conflict.server).toEqual(localDeletes ? edited : removal);
    }
  });
  it('never silently revives a deletion when the other device is unchanged', () => {
    expect(threeWayMerge(base(), base(), deleted(base()))).toEqual({ status: 'merged', document: deleted(base()) });
    expect(threeWayMerge(base(), deleted(base()), base())).toEqual({ status: 'merged', document: deleted(base()) });
  });
  it('agrees on independent deletes without replacing the confirmed tombstone', () => {
    const a = deleted(base(), 91);
    const b = deleted(base(), 92);
    expect(threeWayMerge(base(), a, b)).toEqual({ status: 'merged', document: b });
  });
  it('does not merge different concurrent creates sharing an ID', () => {
    const result = threeWayMerge(null, base(), change(base(), { name: '別の作成' }));
    expect(result.status).toBe('conflict');
    if (result.status === 'conflict') expect(result.conflict.reasons).toEqual(['concurrent-create']);
  });
  it('rejects project substitution', () => {
    expect(() => threeWayMerge(base(), { ...base(), projectId: otherProjectId }, base())).toThrow('PROTOCOL_INVALID');
  });
});

describe('operation and acknowledgement contract', () => {
  it('uses stable SHA-256 preconditions and preserves array ordering', async () => {
    expect(await valueHash({ b: 2, a: 1 })).toBe(await valueHash({ a: 1, b: 2 }));
    expect(await valueHash({ present: false })).not.toBe(await valueHash({ present: true, value: null }));
    expect(await valueHash(['a', 'b'])).not.toBe(await valueHash(['b', 'a']));
    const op = await operation(1);
    expect(op.targets[0].changes).toEqual([{ field: 'name', value: { present: true, value: '端末案' },
      oldValueHash: await valueHash({ present: true, value: '元の名称' }) }]);
  });
  it('refuses cyclic, undefined and prototype-carrying JSON', () => {
    const circular: Record<string, unknown> = {};
    circular.self = circular;
    expect(() => canonicalJson(circular)).toThrow('PROTOCOL_INVALID');
    expect(() => canonicalJson({ bad: undefined })).toThrow('PROTOCOL_INVALID');
    expect(() => canonicalJson(JSON.parse('{"__proto__":{"hidden":1}}'))).toThrow('PROTOCOL_INVALID');
  });
  it('converts entities with one data level while ignoring real-time metadata as conflict evidence', () => {
    const record = { id: targetId, projectId, revision: '7', name: '人物', kind: 'character',
      createdAt: '2026-01-01T00:00:00Z', updatedAt: '2026-10-05T12:00:00Z',
      data: { body: body('本文'), authorNotes: body('作者メモ'), parentId: null } };
    const document = toSyncDocument(record);
    expect(document.fields['data.body']).toEqual(body('本文'));
    expect(document.fields['data.authorNotes']).toEqual(body('作者メモ'));
    expect(document.fields).not.toHaveProperty('updatedAt');
    expect(document.fields).not.toHaveProperty('createdAt');
    expect(document.revision).toBe('7');
    expect(() => toSyncDocument({ ...record, deletedAt: '2026-10-05T00:00:00Z' })).toThrow('PROTOCOL_INVALID');
  });
  it('returns an identical ack for duplicate and concurrent submissions with one effect', async () => {
    const backend = server();
    const op = await operation(1);
    const [a, b] = await Promise.all([backend.send(op, session), backend.send(op, session)]);
    expect(a).toEqual(b);
    expect(await backend.send(op, session)).toEqual(a);
    expect(backend.readForTest(projectId).revision).toBe('1');
    expect(backend.readForTest(projectId).documents[0].fields.name).toBe('端末案');
    await expect(assertAck(op, a)).resolves.toBeUndefined();
    await expect(backend.send({ ...op, reason: 'same ID with changed body' }, session)).rejects.toThrow('OPERATION_REUSED');
  });
  it('rejects forged old-value hashes and a forged common base without modifying the project', async () => {
    const backend = server();
    const op = await operation(1);
    op.targets[0].changes[0].oldValueHash = 'sha256:forged';
    await expect(backend.send(op, session)).rejects.toThrow('PROTOCOL_INVALID');
    const forged = await operation(2, change(base(), { name: '変更' }), change(base(), { name: '偽の元' }));
    await expect(backend.send(forged, session)).rejects.toThrow('PROTOCOL_INVALID');
    expect(backend.readForTest(projectId).revision).toBe('0');
  });
  it.each([false, true])('preserves two device alternatives then applies a new resolution (reverse=%s)', async reverse => {
    const backend = server();
    const a = await operation(1, change(base(), { 'data.body': body('端末A') }));
    const b = await operation(2, change(base(), { 'data.body': body('端末B') }));
    const [first, second] = reverse ? [b, a] : [a, b];
    await backend.send(first, session);
    const ack = await backend.send(second, session);
    expect(ack.status).toBe('conflict');
    expect(ack.conflicts[0].base).toEqual(base());
    expect(ack.conflicts[0].local).toEqual(second.targets[0].local);
    await expect(assertAck(second, ack)).resolves.toBeUndefined();
    const resolution = await createResolutionOperation({ conflict: ack.conflicts[0], resolution: { strategy: 'local' },
      latestServer: ack.documents[0], latestServerRevision: ack.serverRevision, scope, operationId: operationId(3) });
    const resolved = await backend.send(resolution, session);
    expect(resolved.status).toBe('applied');
    expect(resolved.serverRevision).toBe('2');
    expect(resolved.documents[0]?.fields['data.body']).toEqual(second.targets[0].local.fields['data.body']);
    expect(await backend.send(second, session)).toEqual(ack);
    expect(backend.readForTest(projectId).revision).toBe('2');
    await expect(createResolutionOperation({ conflict: ack.conflicts[0], resolution: { strategy: 'server' },
      latestServer: resolved.documents[0], latestServerRevision: '2', scope, operationId: operationId(4) })).rejects.toThrow('REVISION_CHANGED');
  });
  it('supports explicit combined field choices and retains uncontested fields', async () => {
    const result = threeWayMerge(base(), change(base(), { name: '端末名称', 'data.body': body('端末本文') }),
      change(base(), { 'data.body': body('サーバー本文') }));
    if (result.status !== 'conflict') throw new Error('Expected conflict');
    const op = await createResolutionOperation({ conflict: result.conflict,
      resolution: { strategy: 'fields', choices: { 'data.body': { value: { present: true, value: body('組合せ案') } } } },
      latestServer: result.conflict.server, latestServerRevision: '1', scope, operationId: operationId(3) });
    expect(op.targets[0].local.fields.name).toBe('端末名称');
    expect(op.targets[0].local.fields['data.body']).toEqual(body('組合せ案'));
    expect(result.conflict.local.fields['data.body']).toEqual(body('端末本文'));
  });
  it('rejects a batch atomically if any target conflicts', async () => {
    const second = { ...base(), id: secondId };
    const backend = server([base(), second]);
    await backend.send(await operation(1, change(base(), { 'data.body': body('先着の本文') })), session);
    const batch = await createSyncOperation({ operationId: operationId(2), scope, baseRevision: '0', targets: [
      { base: base(), local: change(base(), { 'data.body': body('競合する本文') }) },
      { base: second, local: change(second, { name: '一緒に変更されてはいけない' }) },
    ] });
    const ack = await backend.send(batch, session);
    expect(ack.status).toBe('conflict');
    expect(backend.readForTest(projectId).revision).toBe('1');
    expect(backend.readForTest(projectId).documents.find(doc => doc.id === secondId)?.fields.name).toBe('元の名称');
    await expect(assertAck(batch, ack)).resolves.toBeUndefined();
  });
  it('refuses expired auth, account/project substitution, readers, private editor access and revoked replays', async () => {
    const backend = server();
    const op = await operation(1);
    await expect(backend.send(op, { ...session, authenticated: false })).rejects.toThrow('AUTH_REQUIRED');
    await expect(backend.send(op, { ...session, accountId: 'account-b' })).rejects.toThrow('FORBIDDEN');
    for (const role of ['reader', 'reviewer']) {
      const restricted = await createSyncOperation({ ...op, scope: { ...scope, accountId: role }, targets: op.targets });
      await expect(backend.send(restricted, { ...session, accountId: role })).rejects.toThrow('FORBIDDEN');
    }
    const privateDoc = change(base(), { visibility: 'private' });
    const privateBackend = server([privateDoc]);
    const privateOp = await createSyncOperation({ operationId: operationId(2), scope: { ...scope, accountId: 'editor' }, baseRevision: '0',
      targets: [{ base: privateDoc, local: change(privateDoc, { name: '漏れてはいけない' }) }] });
    await expect(privateBackend.send(privateOp, { ...session, accountId: 'editor' })).rejects.toThrow('FORBIDDEN');
    await backend.send(op, session);
    backend.setMember(projectId, 'account-a', null);
    await expect(backend.send(op, session)).rejects.toThrow('FORBIDDEN');
  });
});

describe('outbox durability and account isolation', () => {
  it('marks an unconfigured adapter honestly and retains pending work', async () => {
    const { store } = await queued();
    const report = await new SyncOutbox(store, () => session).flush(scope);
    expect(report.status).toBe('not-configured');
    expect(report.confirmedRevision).toBeNull();
    expect((await store.list(scope)).length).toBe(1);
    expect(syncCapability.rlsVerified).toBe(false);
    expect(syncCapability.backendConfigured).toBe(false);
  });
  it('retries a lost reply with the same idempotency key without a second effect', async () => {
    const { store } = await queued();
    const backend = server();
    let loseReply = true;
    const transport: SyncTransport = { async send(op, auth) {
      const ack = await backend.send(op, auth);
      if (loseReply) { loseReply = false; throw new Error('secret author text must never enter a report'); }
      return ack;
    } };
    const outbox = new SyncOutbox(store, () => session, transport);
    const failed = await outbox.flush(scope);
    expect(failed.status).toBe('failed');
    expect(JSON.stringify(failed)).not.toContain('secret author text');
    expect((await store.list(scope)).length).toBe(1);
    expect((await outbox.flush(scope)).status).toBe('synced');
    expect(backend.readForTest(projectId).revision).toBe('1');
    expect(store.inspectForTest(scope).acks.length).toBe(1);
    expect((await store.list(scope)).length).toBe(0);
  });
  it('retains the operation when atomic local ack commit fails and succeeds on retry', async () => {
    const { store, op } = await queued();
    const backend = server();
    store.failNextCommit = true;
    const outbox = new SyncOutbox(store, () => session, backend);
    expect(await outbox.flush(scope)).toMatchObject({ status: 'failed', errorCode: 'LOCAL_COMMIT_FAILED', acknowledged: 0 });
    expect((await store.list(scope)).length).toBe(1);
    expect(store.inspectForTest(scope)).toEqual({ acks: [], operations: [op], confirmed: [], serverRevision: null });
    expect((await outbox.flush(scope)).status).toBe('synced');
    expect(backend.readForTest(projectId).revision).toBe('1');
  });
  it('retains work on auth expiry and permission withdrawal', async () => {
    const { store } = await queued();
    const backend = server();
    expect((await new SyncOutbox(store, () => ({ ...session, authenticated: false }), backend).flush(scope)).status).toBe('auth-required');
    backend.setMember(projectId, 'account-a', null);
    expect((await new SyncOutbox(store, () => session, backend).flush(scope)).status).toBe('forbidden');
    expect((await store.list(scope)).length).toBe(1);
  });
  it.each([true, false])('refuses to commit a response after account/session generation changes (account=%s)', async differentAccount => {
    const { store } = await queued();
    const backend = server();
    let active = clone(session);
    const transport: SyncTransport = { async send(op, auth) {
      const ack = await backend.send(op, auth);
      active = { ...session, accountId: differentAccount ? 'account-b' : session.accountId, generation: 'login-2' };
      return ack;
    } };
    const report = await new SyncOutbox(store, () => active, transport).flush(scope);
    expect(report.status).toBe('account-changed');
    expect((await store.list(scope)).length).toBe(1);
    expect(store.inspectForTest(scope).acks).toEqual([]);
  });
  it('coalesces concurrent flush calls and commits one ack', async () => {
    const { store } = await queued();
    const backend = server();
    const send = vi.spyOn(backend, 'send');
    const outbox = new SyncOutbox(store, () => session, backend);
    const a = outbox.flush(scope);
    const b = outbox.flush(scope);
    expect(a).toBe(b);
    expect((await a).status).toBe('synced');
    expect(send).toHaveBeenCalledTimes(1);
  });
  it('preserves conflicts before removing the acknowledged command and stops later sends', async () => {
    const backend = server();
    await backend.send(await operation(1, change(base(), { 'data.body': body('サーバー側') })), session);
    const { store } = await queued(2);
    const conflicting = await operation(3, change(base(), { 'data.body': body('端末側') }));
    // Name change can merge; body operation conflicts; a subsequent operation must remain pending.
    await store.enqueue(conflicting);
    await store.enqueue(await operation(4, change(base(), { name: '後続' })));
    const report = await new SyncOutbox(store, () => session, backend).flush(scope);
    expect(report.status).toBe('conflict');
    expect(report.acknowledged).toBe(2);
    expect(report.remaining).toBe(1);
    expect(store.inspectForTest(scope).acks.find(ack => ack.status === 'conflict')?.conflicts[0].local).toEqual(conflicting.targets[0].local);
    expect((await store.list(scope))[0].operationId).toBe(operationId(4));
  });
  it('rejects a success ack whose applied snapshot omits the requested edit', async () => {
    const { store, op } = await queued();
    const ack: SyncAck = { schemaVersion: 1, operationId: op.operationId, scope,
      operationHash: await valueHash(op), serverRevision: '1', status: 'applied', documents: [base()], conflicts: [] };
    const report = await new SyncOutbox(store, () => session, { send: async () => ack }).flush(scope);
    expect(report).toMatchObject({ status: 'failed', errorCode: 'PROTOCOL_INVALID', acknowledged: 0 });
    expect((await store.list(scope)).length).toBe(1);
  });
  it('does not deliver swapped project/account acknowledgements to storage', async () => {
    const { store, op } = await queued();
    const ack = await server().send(op, session);
    const swapped = { ...ack, scope: { ...scope, accountId: 'account-b' } };
    const report = await new SyncOutbox(store, () => session, { send: async () => swapped }).flush(scope);
    expect(report).toMatchObject({ status: 'failed', errorCode: 'PROTOCOL_INVALID' });
    expect(store.inspectForTest(scope).acks).toEqual([]);
  });
  it('enforces immutable account namespaces before invoking storage callbacks', async () => {
    const listPreparedOperations = vi.fn(async () => [] as SyncOperation[]);
    const commitPreparedAck = vi.fn(async () => undefined);
    const adapter = new AccountScopedSyncStore({ accountId: 'account-a', listPreparedOperations, listPreparedConflicts: async () => [], commitPreparedAck });
    await expect(adapter.list({ ...scope, accountId: 'account-b' })).rejects.toThrow('FORBIDDEN');
    expect(listPreparedOperations).not.toHaveBeenCalled();
    expect(() => new AccountScopedSyncStore({ accountId: 'guest', listPreparedOperations, listPreparedConflicts: async () => [], commitPreparedAck })).toThrow('AUTH_REQUIRED');
    const op = await operation(1);
    listPreparedOperations.mockImplementation(async () => [{ ...op, scope: { ...scope, projectId: otherProjectId } }]);
    await expect(adapter.list(scope)).rejects.toThrow('PROTOCOL_INVALID');
    const ack = await server().send(op, session);
    await expect(adapter.commitAck(scope, { ...ack, scope: { ...scope, projectId: otherProjectId } })).rejects.toThrow('PROTOCOL_INVALID');
    expect(commitPreparedAck).not.toHaveBeenCalled();
  });
  it('keeps queues and confirmed metadata separate between accounts', async () => {
    const { store, op } = await queued();
    const other = await createSyncOperation({ ...op, operationId: operationId(2),
      scope: { ...scope, accountId: 'account-b' }, targets: op.targets });
    await store.enqueue(other);
    const ack = await server().send(op, session);
    await store.commitAck(scope, ack);
    await store.commitAck(scope, ack);
    expect(await store.list(scope)).toEqual([]);
    expect(await store.list(other.scope)).toEqual([other]);
    expect(store.inspectForTest(other.scope).serverRevision).toBeNull();
    expect(store.inspectForTest(other.scope).confirmed).toEqual([]);
  });
  it('pins a storage adapter to its original namespace even if its provider mutates', async () => {
    const storage = { accountId: 'account-a', listPreparedOperations: vi.fn(async () => [] as SyncOperation[]), listPreparedConflicts: async () => [],
      commitPreparedAck: vi.fn(async () => undefined) };
    const adapter = new AccountScopedSyncStore(storage);
    storage.accountId = 'account-b';
    await expect(adapter.list({ ...scope, accountId: 'account-b' })).rejects.toThrow('FORBIDDEN');
    await expect(adapter.list(scope)).rejects.toThrow('FORBIDDEN');
    expect(storage.listPreparedOperations).not.toHaveBeenCalled();
  });
});

describe('independent review regressions', () => {
  it('keeps an unresolved conflict as a durable barrier across repeated flushes and a new sender', async () => {
    const backend=server();
    await backend.send(await operation(20,change(base(),{'data.body':body('remote')})),session);
    const store=new MemorySyncOutboxStore();
    await store.enqueue(await operation(21,change(base(),{'data.body':body('local')})));
    await store.enqueue(await operation(22,change(base(),{name:'later'})));
    expect((await new SyncOutbox(store,()=>session,backend).flush(scope)).status).toBe('conflict');
    expect((await new SyncOutbox(store,()=>session,backend).flush(scope)).status).toBe('conflict');
    expect((await store.list(scope)).map(op=>op.operationId)).toEqual([operationId(22)]);
    expect((await store.listUnresolvedConflicts(scope))).toHaveLength(1);
  });
  it('clears only explicitly resolved alternatives after the resolution ack is saved', async () => {
    const backend=server();
    await backend.send(await operation(30,change(base(),{'data.body':body('remote')})),session);
    const store=new MemorySyncOutboxStore();
    const conflicting=await operation(31,change(base(),{'data.body':body('local')}));await store.enqueue(conflicting);
    await new SyncOutbox(store,()=>session,backend).flush(scope);
    const ack=store.inspectForTest(scope).acks[0];if(ack.status!=='conflict')throw new Error('Expected conflict');
    const resolution=await createResolutionOperation({conflict:ack.conflicts[0],resolution:{strategy:'server'},latestServer:ack.conflicts[0].server,latestServerRevision:ack.serverRevision,scope,operationId:operationId(32),conflictOperationId:conflicting.operationId});
    await store.enqueue(resolution);
    const result=await new SyncOutbox(store,()=>session,backend).flush(scope);
    expect(result.status).toBe('synced');expect(await store.listUnresolvedConflicts(scope)).toEqual([]);
    expect(store.inspectForTest(scope).acks.some(value=>value.status==='conflict')).toBe(true);
  });
  it('rejects an applied ack with changed content and no project or record revision advance', async () => {
    const op=await operation(40);
    const ack:SyncAck={schemaVersion:1,operationId:op.operationId,scope,operationHash:await valueHash(op),serverRevision:'0',status:'applied',documents:[clone(op.targets[0].local)],conflicts:[]};
    await expect(assertAck(op,ack)).rejects.toThrow('PROTOCOL_INVALID');
    ack.serverRevision='1';
    await expect(assertAck(op,ack)).rejects.toThrow('PROTOCOL_INVALID');
  });
});

describe('project revision ordering',()=>{
 it('rejects a changed record older than the operation confirmed project base',async()=>{
  const op=await operation(50,change(base(),{name:'new'}),base(),'10');
  const ack:SyncAck={schemaVersion:1,operationId:op.operationId,scope,operationHash:await valueHash(op),serverRevision:'11',status:'applied',documents:[{...clone(op.targets[0].local),revision:'1'}],conflicts:[]};
  await expect(assertAck(op,ack)).rejects.toThrow('PROTOCOL_INVALID');
 });
});

describe('atomic rejected batch retention',()=>{
 it('preserves every rejected target and refuses a partial resolution before applying the entire rebased batch',async()=>{
  const b={...base(),id:secondId};const backend=server([base(),b]);
  await backend.send(await operation(60,change(base(),{'data.body':body('remote A')})),session);
  const localB=change(b,{name:'local B survives'});
  const original=await createSyncOperation({operationId:operationId(61),scope,baseRevision:'0',targets:[{base:base(),local:change(base(),{'data.body':body('local A')})},{base:b,local:localB}]});
  const store=new MemorySyncOutboxStore();await store.enqueue(original);
  expect((await new SyncOutbox(store,()=>session,backend).flush(scope)).status).toBe('conflict');
  expect(store.inspectForTest(scope).operations.find(op=>op.operationId===original.operationId)?.targets[1].local).toEqual(localB);
  const ack=store.inspectForTest(scope).acks[0];if(ack.status!=='conflict')throw new Error('Expected conflict');
  const options={conflict:ack.conflicts[0],resolution:{strategy:'server' as const},latestServer:ack.conflicts[0].server,latestServerRevision:ack.serverRevision,scope,operationId:operationId(62),conflictOperationId:original.operationId};
  await expect(store.enqueue(await createResolutionOperation(options))).rejects.toThrow('PROTOCOL_INVALID');
  const currentB=backend.readForTest(projectId).documents.find(doc=>doc.id===secondId)!;
  const resolution=await createResolutionOperation({...options,operationId:operationId(63),additionalTargets:[{base:currentB,local:localB}]});
  await store.enqueue(resolution);
  expect((await new SyncOutbox(store,()=>session,backend).flush(scope)).status).toBe('synced');
  expect(backend.readForTest(projectId).documents.find(doc=>doc.id===secondId)!.fields.name).toBe('local B survives');
  expect(await store.listUnresolvedConflicts(scope)).toEqual([]);
 });
});
