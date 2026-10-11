// Full historical/native correspondence checks retained from the C29 follow-up
// procedure. The new runner supplies current source, actual normal edits and file.
import { ScenarioStore } from '../src/storage/store.ts';
import { inspectScenario } from '../src/storage/archive.ts';
import { sha256, jsonBytes } from '../src/storage/json.ts';
import { unpackRecordData } from '../src/storage/recordPartsCore.ts';
import { collectImportIds } from '../src/storage/importMapping.ts';
import { projectWithRecoveryHistory } from '../src/storage/recovery.ts';
import { freezeCapturedPlainData } from '../src/domain/immutablePlainData.ts';
import { createSharedArrayJsonEncoder } from '../src/storage/sharedArrayJson.ts';

const require = (ok, message) => { if (!ok) throw Error(message); };
const hash = value => sha256(jsonBytes(value));
const digestImage = value => hash({ ...value, history: [] });
const keyedReferences = new Set(['variableValues', 'visitCounts', 'publicTexts', 'publicIds', 'byEntityId', 'bindings']);

globalThis.inspectExpected = async ({ firstName, checkpoints, initial, sourceHistory, soakChecks }) => {
  const bytes = new Uint8Array(await (await fetch('/actual-complete.scenario')).arrayBuffer());
  const p = await inspectScenario(bytes, { worker: false });
  const pending = p.recovery?.pending ?? [];
  require(p.project.history.length === 113 && pending.length === 113, 'Actual file must retain all 113 commands and pending intents');
  require(sourceHistory?.length === 113, 'All 113 source-native commands and pending hashes must have been observed before export');
  const byId = new Map(pending.map((row, index) => [row.operationId, { ...row, sequence: index }]));
  require(byId.size === 113, 'Pending operation IDs must be unique');
  const editId = p.project.entities[0].id, history = [], imageHashes = new Map();
  let previousAfterHash;
  for (const [index, command] of p.project.history.entries()) {
    const retained = byId.get(command.operationId);
    require(retained, 'Historical operation is missing from actual portable pending');
    const commandHash = await hash(command);
    const native = sourceHistory[index];
    require(native.sequence === index && native.operationId === command.operationId && native.revision === command.revision && native.baseRevision === command.baseRevision && native.commandHash === commandHash && native.pendingHash === commandHash, 'Complete file historical command or order differs from the actual source native command/pending');
    require(commandHash === retained.commandHash && await hash(retained.command) === commandHash, 'Every actual file command must match its portable pending digest');
    const beforeHash = await digestImage(command.before), afterHash = await digestImage(command.after);
    if (index > 0) {
      require(beforeHash === previousAfterHash, 'Consecutive full historical images must remain continuous');
      const before = command.before.entities.find(entity => entity.id === editId);
      const after = command.after.entities.find(entity => entity.id === editId);
      require(before?.name === (index === 1 ? firstName : '継続編集' + (index - 2)), 'Historical before name differs from the actual normal editing sequence');
      require(after?.name === '継続編集' + (index - 1), 'Historical after name differs from the actual normal editing sequence');
    }
    require(command.after.entities.length + command.after.relations.length === 88003, 'Every after image must retain the full Large record set');
    previousAfterHash = afterHash;
    imageHashes.set(command.revision, afterHash);
    history.push({ operationId: command.operationId, revision: command.revision, baseRevision: command.baseRevision, hash: commandHash, beforeHash, afterHash, sequence: retained.sequence, origin: retained.origin ?? null });
  }
  if (soakChecks !== undefined) require(soakChecks.length === 112, 'All 112 actual soak full-image/material checks are required');
  const observed = [...(initial ? [initial] : []), ...(soakChecks ?? checkpoints)];
  require(checkpoints.length === 14, 'All 14 actual source checkpoints are required');
  for (const point of observed) require(imageHashes.get(point.revision) === point.contentHash, 'A full image differs from an actual source checkpoint: ' + point.revision);
  const complete = projectWithRecoveryHistory(p.project, p.recovery), owned = collectImportIds(complete);
  const ownedIds = new Set(owned.map(row => row.id));
  require(ownedIds.size === owned.length && ownedIds.has(p.project.projectId), 'Complete typed ownership enumeration is inconsistent');
  // Independent declarations of this fixed Large fixture must all be in the typed map.
  for (const content of [p.project, ...p.project.history.flatMap(row => [row.before, row.after])]) {
    for (const entity of content.entities) require(ownedIds.has(entity.id), 'Declared entity missing from clone ownership');
    for (const relation of content.relations) require(ownedIds.has(relation.id), 'Declared relation missing from clone ownership');
    for (const view of content.views) require(ownedIds.has(view.id), 'Declared saved view missing from clone ownership');
    for (const snapshot of content.snapshots) require(ownedIds.has(snapshot.id), 'Declared snapshot missing from clone ownership');
  }
  for (const row of history) require(ownedIds.has(row.operationId), 'Historical operation missing from clone ownership');
  const assetHashes = [];
  for (const asset of p.assets) {
    const actualHash = await sha256(asset.bytes);
    require(actualHash === asset.contentHash, 'Actual file material byte SHA is invalid');
    assetHashes.push({ hash: asset.contentHash, bytes: asset.bytes.length, actualHash });
  }
  return { projectId: p.project.projectId, revision: p.project.revision, serverRevision: p.recovery.serverRevision, currentHash: await digestImage(p.project), history, owned, assetHashes, sourceCheckpointCount: observed.length, sourceCheckpointScope: 'Actual initial/checkpoint images only; other original native images were not independently observed before export. All file image continuity and native/file equality are separate checks.' };
};

async function nativePendingRow(database, key) {
  const captured = await new Promise((resolve, reject) => {
    const tx = database.transaction(['recoveredPending', 'recordParts'], 'readonly');
    let envelope, parts = [];
    tx.oncomplete = () => resolve({ envelope, parts });
    tx.onerror = () => reject(tx.error ?? Error('Native pending read failed'));
    tx.onabort = () => reject(tx.error ?? Error('Native pending read aborted'));
    const request = tx.objectStore('recoveredPending').get(key);
    request.onerror = () => reject(request.error);
    request.onsuccess = () => {
      envelope = request.result;
      if (!envelope?.__scenarioRecordParts) return;
      const descriptors = envelope.__scenarioRecordParts.parts;
      require(Array.isArray(descriptors), 'Native parts descriptor is missing');
      parts = new Array(descriptors.length);
      for (const [index, descriptor] of descriptors.entries()) {
        const read = tx.objectStore('recordParts').get(descriptor.key);
        read.onerror = () => reject(read.error);
        read.onsuccess = () => { parts[index] = read.result; };
      }
    };
  });
  require(captured.envelope, 'A native recovered pending row is missing');
  const packed = captured.envelope.__scenarioRecordParts;
  if (!packed) return { row: captured.envelope, parts: [] };
  require(packed.scope.startsWith('recoveredPending:') && captured.parts.every(Boolean), 'Native pending parts scope or payload is invalid');
  const row = await unpackRecordData(packed, captured.parts);
  require(row && typeof row === 'object' && !Object.hasOwn(row, '__scenarioRecordParts'), 'Nested native marker cannot be a complete operation');
  require(row.key === captured.envelope.key && row.projectId === captured.envelope.projectId, 'Native index/header differs from decoded pending');
  require(Object.keys(captured.envelope).sort().join('|') === '__scenarioRecordParts|key|projectId', 'Native pending header has unknown fields');
  return { row, parts: captured.parts.map(part => ({ key: part.key, scope: part.scope, sequence: part.sequence, kind: part.kind, bytes: part.bytes.length, sha256: part.sha256 })) };
}

globalThis.inspectNative = async (expected, mode) => {
  const store = new ScenarioStore();
  try {
    const projects = await store.listProjectsForEditing();
    require(projects.length === 1, 'Restoration must start in an empty environment and retain only one project');
    const id = projects[0].projectId, full = await store.getProject(id);
    const logs = await store.db.importLogs.where('projectId').equals(id).toArray();
    require(logs.length === 1 && logs[0].mode === mode && logs[0].projectId === id, 'Native import audit is missing or inconsistent');
    const idMap = logs[0].idMap ?? {}, owned = new Set(expected.owned.map(row => row.id));
    if (mode === 'clone') {
      require(Object.keys(idMap).length === owned.size && Object.keys(idMap).every(key => owned.has(key)), 'Clone mapping must cover exactly every owned source ID');
      const values = Object.values(idMap);
      require(new Set(values).size === values.length && values.every(value => typeof value === 'string' && /^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/.test(value) && !owned.has(value)), 'Clone mapping must be bijective with fresh valid IDs');
      require(idMap[expected.projectId] === id && id !== expected.projectId, 'Clone project correspondence is invalid');
      const actualOwned = new Map(collectImportIds(full).map(row => [row.id, row]));
      for (const source of expected.owned) {
        const actual = actualOwned.get(idMap[source.id]);
        require(actual?.role === source.role && actual.ownerId === (source.ownerId ? idMap[source.ownerId] : undefined), 'Clone typed declaration or owner correspondence is missing');
      }
      require(actualOwned.size === expected.owned.length + 1 && actualOwned.get(logs[0].operationId)?.role === 'operation', 'Only the new clone import operation may add an owned ID');
    } else {
      require(id === expected.projectId && Object.keys(idMap).length === 0, 'New restore must preserve all source IDs');
      require(await hash(collectImportIds(full)) === await hash(expected.owned), 'New restore typed ownership differs');
    }
    const reverse = Object.fromEntries(Object.entries(idMap).map(([source, current]) => [current, source]));
    const normalize = (value, key = '') => {
      if (typeof value === 'string') return /(?:Id|Ids)$/.test(key) || key === 'id' || key === 'operationId' || key === 'bindings' || key === 'idMap' ? reverse[value] ?? value : value;
      if (Array.isArray(value)) return value.map(item => normalize(item, key));
      if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).filter(([, item]) => item !== undefined).map(([name, item]) => [keyedReferences.has(key) ? reverse[name] ?? name : name, normalize(item, key === 'bindings' || key === 'idMap' ? key : name)]));
      return value;
    };
    const expectedHistoryOrder = expected.history.map(row => mode === 'clone' ? idMap[row.operationId] : row.operationId);
    require(JSON.stringify(full.history.slice(0, expectedHistoryOrder.length).map(row => row.operationId)) === JSON.stringify(expectedHistoryOrder), 'Every original historical operation must retain its exact order after cold restoration');
    const actualHistory = [];
    for (const original of expected.history) {
      const operationId = mode === 'clone' ? idMap[original.operationId] : original.operationId;
      const command = full.history.find(row => row.operationId === operationId);
      require(command, 'A complete original historical operation is missing');
      const actualHash = await hash(mode === 'clone' ? normalize(command) : command);
      require(actualHash === original.hash, 'Complete historical command differs: ' + original.revision);
      actualHistory.push({ operationId, revision: command.revision, actualHash, sourceHash: original.hash });
    }
    require(full.history.length === (mode === 'new' ? 113 : 114), 'Native history count is inconsistent');
    if (mode === 'clone') {
      const last = full.history.at(-1);
      require(last.operationId === logs[0].operationId && last.reason === '専用ファイルをcloneで復元' && last.projectId === id && full.revision === String(BigInt(expected.revision) + 1n) && last.revision === full.revision, 'Clone import operation is inconsistent');
    }
    const normalized = mode === 'clone' ? normalize({ ...full, history: [] }) : { ...full, history: [] };
    if (mode === 'clone') normalized.revision = expected.revision;
    const currentHash = await hash(normalized);
    require(currentHash === expected.currentHash, 'Full native current content differs from the actual file');
    const database = store.db.backendDB();
    const keys = await new Promise((resolve, reject) => {
      const request = database.transaction('recoveredPending', 'readonly').objectStore('recoveredPending').getAllKeys();
      request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error);
    });
    require(keys.length === 113, 'Every retained pending intent is required');
    const originals = new Map(expected.history.map(row => [row.operationId, row])), matched = new Set(), pending = [];
    for (const key of keys) {
      const decoded = await nativePendingRow(database, key), row = decoded.row, operation = row.operation;
      const sourceId = mode === 'clone' ? reverse[operation.operationId] : operation.operationId, original = originals.get(sourceId);
      require(original && !matched.has(sourceId) && row.key === id + ':' + operation.operationId && row.projectId === id && row.importOperationId === logs[0].operationId && row.status === 'needs_reconnect' && row.sequence === original.sequence, 'Native pending ID, key, sequence, import audit or state differs');
      const actualHash = await hash(operation.command);
      require(actualHash === operation.commandHash, 'Native full pending command SHA differs');
      const sourceHash = mode === 'clone' ? await hash(normalize(operation.command)) : actualHash;
      require(sourceHash === original.hash, 'Native full pending command differs from its actual source file');
      if (mode === 'new') require(await hash(operation.origin ?? null) === await hash(original.origin), 'New pending origin changed');
      else require(await hash(operation.origin ?? null) === await hash(original.origin ?? { projectId: expected.projectId, operationId: sourceId, serverRevision: expected.serverRevision }), 'Clone pending provenance lost its original source or server revision');
      matched.add(sourceId);
      pending.push({ sequence: row.sequence, operationId: operation.operationId, commandHash: operation.commandHash, actualHash, sourceHash, origin: operation.origin ?? null, nativeParts: decoded.parts });
    }
    require(matched.size === 113, 'A pending operation was silently omitted');
    const assets = [];
    for (const item of expected.assetHashes) {
      const bytes = await store.getAsset(item.hash), actualHash = bytes ? await sha256(bytes) : null;
      require(actualHash === item.hash && bytes.length === item.bytes, 'Native material bytes are missing or differ');
      assets.push({ ...item, actualHash });
    }
    const saveState = await store.getSaveState(id);
    require(saveState.pendingCount === 1 && saveState.recoveredPendingCount === 113, 'Local import and recovered pending counts differ');
    return { projectId: id, revision: full.revision, records: full.entities.length + full.relations.length, currentHash, history: actualHistory, pending, assets, saveState, importLog: { operationId: logs[0].operationId, mode: logs[0].mode, idMap } };
  } finally { store.close(); }
};


// Setup is outside the acceptance timer. All edits after this seed use the App.
globalThis.seedLargeHistory = async (trialEnabled = false) => {
  const { createMaterialPerformanceFixture } = await import('../src/testing/performanceFixture.ts');
  const fixture = await createMaterialPerformanceFixture('large-material-rb10-v1');
  require(fixture.counts.totalRecords === 88003 && fixture.assetBytes === 72 * 1024 * 1024, 'Original Large fixture changed');
  const store = new ScenarioStore();
  try {
    require((await store.listProjectsForEditing()).length === 0, 'Source environment must be empty');
    const project = (await store.saveProject(fixture.project, { reason: '測定fixture初期化', includeHistory: false, assets: fixture.assets })).project;
    let trial;
    if (trialEnabled) {
      const { createProject, createEntity } = await import('../src/domain/model.ts');
      const auxiliary = createProject('継続試読の補助作品');
      const entry = createEntity(auxiliary.projectId, 'flow_node', '補助試読入口', { nodeType: 'entry' });
      const end = createEntity(auxiliary.projectId, 'flow_node', '補助試読終端', { nodeType: 'terminal', terminalReason: '補助試読終了' });
      const edge = createEntity(auxiliary.projectId, 'flow_edge', '補助進行', { fromId: entry.id, toId: end.id, label: '終端へ進む' });
      const graph = createEntity(auxiliary.projectId, 'flow_graph', '補助試読図', { nodeIds: [entry.id, end.id], entryIds: [entry.id], exitIds: [end.id], edgeIds: [edge.id] });
      auxiliary.entities.push(entry, end, edge, graph); auxiliary.entities.forEach(entity => entity.status = 'confirmed');
      const stored = (await store.saveProject(auxiliary, { reason: '別作品の補助試読fixture', includeHistory: false })).project;
      trial = { projectId: stored.projectId, title: stored.name, records: 4, sha256: await hash(auxiliary), purpose: 'Separate explicit auxiliary trial workload; original Large record/asset counts unchanged' };
    }
    localStorage.setItem('scenario-last-project:guest', project.projectId);
    localStorage.setItem('scenario-local-view-user', 'measurement');
    localStorage.setItem('scenario-workspace-view:v1:measurement:' + project.projectId + ':desktop', JSON.stringify({ filters: { 'workspace.page': 'materials', 'workspace.kind': 'character' }, lastOpenedId: null }));
    sessionStorage.setItem('scenario-performance', 'measure');
    return { projectId: project.projectId, name: project.name, firstName: project.entities[0].name, records: 88003, assetBytes: fixture.assetBytes, assetHashes: fixture.assets.map(asset => ({ hash: asset.contentHash, bytes: asset.bytes.length })), ...(trial ? { trial } : {}) };
  } finally { store.close(); }
};

globalThis.sourceCheckpoint = async (fixture) => {
  const store = new ScenarioStore();
  try {
    const project = await store.getProjectForEditing(fixture.projectId), history = await store.historyPage(fixture.projectId, { size: 1 }), state = await store.getSaveState(fixture.projectId);
    const assets = [];
    for (const asset of fixture.assetHashes) {
      const bytes = await store.getAsset(asset.hash);
      require(bytes && bytes.length === asset.bytes && await sha256(bytes) === asset.hash, 'Source actual asset bytes differ');
      assets.push(asset);
    }
    const records = project.entities.length + project.relations.length;
    require(records === 88003 && assets.reduce((sum, item) => sum + item.bytes, 0) === 72 * 1024 * 1024, 'Source original records or assets changed');
    return { revision: project.revision, contentHash: await digestImage(project), records, historyCount: history.total, pendingCount: state.pendingCount, recoveredPendingCount: state.recoveredPendingCount, assets };
  } finally { store.close(); }
};

// SHA-256 still consumes every command byte. The encoder only reuses byte
// serialization of exact immutable ordered values, with the legacy canonical
// bytes checked independently by sharedArrayJson's byte/hash regressions.
globalThis.inspectSourceHistory = async fixture => {
  const store = new ScenarioStore();
  try {
    const project = await store.getProject(fixture.projectId), pending = await store.listOutbox(fixture.projectId);
    require(project.history.length === 113 && pending.length === 113, 'All original source-native history and pending intents are required');
    require(freezeCapturedPlainData({ project, pending }), 'Source verification needs its own private plain-data capture');
    const commandBytes = createSharedArrayJsonEncoder(), pendingBytes = createSharedArrayJsonEncoder();
    const result = [], seen = new Set();
    for (const [sequence, command] of project.history.entries()) {
      const row = pending[sequence];
      require(row && row.operationId === command.operationId && !seen.has(row.operationId), 'Source-native pending order or operation differs'); seen.add(row.operationId);
      const encoded = commandBytes(command), commandHash = await sha256(encoded), pendingHash = await sha256(pendingBytes(row.command));
      require(commandHash === pendingHash, 'Source-native full historical and pending commands differ');
      result.push({ sequence, operationId: command.operationId, revision: command.revision, baseRevision: command.baseRevision, commandBytes: encoded.length, commandHash, pendingHash });
    }
    return result;
  } finally { store.close(); }
};
