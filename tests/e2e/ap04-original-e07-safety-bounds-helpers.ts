import { expect, type Page } from '@playwright/test';
import { createHash } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import { strFromU8, strToU8, unzipSync, zipSync } from 'fflate';
import type { Block, Condition, Entity, ProjectData } from '../../src/domain/types';
import type { ScenarioManifest } from '../../src/storage/archiveData';
import { ARCHIVE_LIMITS } from '../../src/storage/json';

// All expensive work is inside buildBoundaryFile, invoked only by a browser test.
// No limits override, forged signature, dishonest size, or detached ZIP padding.
export const E07_BOUNDS = ['compressedBytes', 'expandedBytes', 'jsonBytes', 'assetBytes', 'files', 'records', 'depth', 'objects', 'conditionDepth', 'conditionNodes'] as const;
export type E07Bound = typeof E07_BOUNDS[number];
const originalPath = 'tests/fixtures/rb10-import-errors/complete.scenario';
const originalHash = '09a837f1572c72e763d06e82102f52347cf777dd698c68fc1c7b554445caf593';
export const sha256 = (bytes: Uint8Array) => createHash('sha256').update(bytes).digest('hex');
const uuid = (namespace: string, index: number) => `${namespace}-0000-4000-8000-${index.toString(16).padStart(12, '0')}`;

interface AddedAsset { entity: Entity<'attachment'>; index: number; bytes: Uint8Array }
interface FixtureState {
  files: Record<string, Uint8Array>; manifest: ScenarioManifest; project: ProjectData;
  worlds: ProjectData[]; addedAssets: AddedAsset[]; nextEntity: number; projectPadding: number;
}
interface JsonShape { objects: number; depth: number; conditionDepth: number; conditionNodes: number }
export interface BoundaryFile {
  path: string; bound: E07Bound; side: -1 | 1; limit: number; actual: number;
  bytes: number; sha256: string; dimensions: Record<E07Bound, number>;
  expectedReason: string; expectedPath?: string;
  project: { id: string; name: string; entities: number; relations: number; snapshots: number; views: number };
  worldIds: string[]; assets: { contentHash: string; bytes: number; mediaType: string }[];
  addedNoteBlocks: { entityId: string; count: number }[];
  addedGroups: { count: number; lastId?: string; lastName?: string };
}

export async function originalE07() {
  const bytes = new Uint8Array(await readFile(originalPath));
  expect(sha256(bytes)).toBe(originalHash);
  return { bytes, sha256: originalHash, path: originalPath };
}

function common(state: FixtureState, label: string) {
  const index = ++state.nextEntity;
  return { id: uuid('ee070000', index), projectId: state.project.projectId, revision: '0',
    name: `${label} ${index}`, status: 'confirmed' as const, visibility: 'private' as const,
    createdAt: '2026-10-11T00:00:00.000Z', updatedAt: '2026-10-11T00:00:00.000Z', customValues: {} };
}

function addAsset(state: FixtureState, length: number): AddedAsset {
  const index = state.addedAssets.length;
  const entity: Entity<'attachment'> = { ...common(state, 'E07 UTF-8 text asset'), kind: 'attachment',
    data: { mediaType: 'text/plain', contentHash: '', byteSize: 0, assetPath: '', displayName: `e07-${index}.txt` } };
  const asset = { entity, index, bytes: new Uint8Array() };
  state.project.entities.push(entity); state.addedAssets.push(asset);
  resizeAsset(state, asset, length);
  return asset;
}

function resizeAsset(state: FixtureState, asset: AddedAsset, length: number) {
  const prefix = strToU8(`E07 authentic UTF-8 asset ${asset.index}\n`);
  if (!Number.isSafeInteger(length) || length < prefix.length) throw Error('Asset must contain its real UTF-8 identifying text');
  const oldPath = asset.entity.data.assetPath;
  asset.bytes = new Uint8Array(length).fill(65 + asset.index % 26); asset.bytes.set(prefix);
  const contentHash = sha256(asset.bytes), path = `assets/${contentHash}.txt`;
  if (oldPath) delete state.files[oldPath];
  state.files[path] = asset.bytes;
  asset.entity.data = { ...asset.entity.data, contentHash, byteSize: length, assetPath: path };
  const row = state.manifest.files.find(file => file.path === oldPath);
  if (row) row.path = path;
  else state.manifest.files.push({ path, role: 'asset', sha256: contentHash, byteSize: length });
}

function refresh(state: FixtureState) {
  const data = strToU8(JSON.stringify(state.project));
  if (state.projectPadding) {
    const padded = new Uint8Array(data.length + state.projectPadding).fill(32); padded.set(data);
    state.files['data/project.json'] = padded;
  } else state.files['data/project.json'] = data;
  for (const row of state.manifest.files) {
    const bytes = state.files[row.path];
    if (!bytes) throw Error(`Missing real payload: ${row.path}`);
    row.byteSize = bytes.length; row.sha256 = sha256(bytes);
  }
  state.files['manifest.json'] = strToU8(JSON.stringify(state.manifest));
}

function astShape(value: unknown): { depth: number; nodes: number } {
  if (!value || typeof value !== 'object' || Array.isArray(value) || !('op' in value)) return { depth: 0, nodes: 0 };
  const children: unknown[] = [];
  for (const item of Object.values(value)) {
    if (Array.isArray(item)) children.push(...item);
    else if (item && typeof item === 'object') children.push(item);
  }
  const measured = children.map(astShape).filter(item => item.nodes > 0);
  return { nodes: 1 + measured.reduce((sum, item) => sum + item.nodes, 0), depth: 1 + Math.max(0, ...measured.map(item => item.depth)) };
}

function jsonShape(value: unknown): JsonShape {
  const shape: JsonShape = { objects: 0, depth: 0, conditionDepth: 0, conditionNodes: 0 };
  const visit = (item: unknown, depth: number) => {
    if (!item || typeof item !== 'object') return;
    shape.objects++; shape.depth = Math.max(shape.depth, depth);
    if (!Array.isArray(item) && 'op' in item) {
      const ast = astShape(item);
      shape.conditionDepth = Math.max(shape.conditionDepth, ast.depth);
      shape.conditionNodes = Math.max(shape.conditionNodes, ast.nodes);
    }
    if (Array.isArray(item)) for (const child of item) visit(child, depth + 1);
    else for (const child of Object.values(item)) visit(child, depth + 1);
  };
  visit(value, 1); return shape;
}

function dimensions(state: FixtureState, compressedBytes: number): Record<E07Bound, number> {
  const shapes = [state.manifest, state.project, ...state.worlds].map(jsonShape);
  return {
    compressedBytes, expandedBytes: Object.values(state.files).reduce((sum, bytes) => sum + bytes.length, 0),
    jsonBytes: Math.max(...Object.entries(state.files).filter(([path]) => !path.startsWith('assets/')).map(([, bytes]) => bytes.length)),
    assetBytes: Math.max(...Object.entries(state.files).filter(([path]) => path.startsWith('assets/')).map(([, bytes]) => bytes.length)),
    files: Object.keys(state.files).length,
    records: [state.project, ...state.worlds].reduce((sum, project) => sum + project.entities.length + project.relations.length, 0),
    depth: Math.max(...shapes.map(shape => shape.depth)), objects: shapes.reduce((sum, shape) => sum + shape.objects, 0),
    conditionDepth: Math.max(...shapes.map(shape => shape.conditionDepth)), conditionNodes: Math.max(...shapes.map(shape => shape.conditionNodes)),
  };
}

// ASCII paths, no extra/comment fields: genuine stored ZIP overhead is exact.
function storedZipSize(state: FixtureState) {
  return 22 + Object.entries(state.files).reduce((sum, [path, bytes]) => sum + 30 + path.length + bytes.length + 46 + path.length, 0);
}
function expandedSize(state: FixtureState) { return Object.values(state.files).reduce((sum, bytes) => sum + bytes.length, 0); }

function fitAsset(state: FixtureState, last: AddedAsset, target: number, size: (state: FixtureState) => number) {
  for (let attempt = 0; attempt < 8; attempt++) {
    refresh(state);
    const delta = target - size(state);
    if (!delta) return;
    resizeAsset(state, last, last.bytes.length + delta);
  }
  throw Error('Truthful manifest/size fixed point did not converge');
}

function nestedCondition(levels: number, operation: 'not' | 'all'): Condition {
  let condition: Condition = { op: 'constant', value: true };
  for (let i = 1; i < levels; i++) condition = operation === 'not' ? { op: 'not', child: condition } : { op: 'all', children: [condition] };
  return condition;
}

function addGate(state: FixtureState, gate: Condition) {
  const entity: Entity<'flow_node'> = { ...common(state, 'E07 terminal gate'), kind: 'flow_node', data: { nodeType: 'terminal', terminalReason: 'E07 boundary terminal', gate } };
  state.project.entities.push(entity);
}

/** Derive one L±1 archive from the immutable complete original. Call lazily. */
export async function buildBoundaryFile(bound: E07Bound, side: -1 | 1, outputPath: string): Promise<BoundaryFile> {
  const original = await originalE07(), files = unzipSync(original.bytes);
  const project = JSON.parse(strFromU8(files['data/project.json'])) as ProjectData;
  const manifest = JSON.parse(strFromU8(files['manifest.json'])) as ScenarioManifest;
  const worlds = manifest.files.filter(row => row.role === 'world').map(row => JSON.parse(strFromU8(files[row.path])) as ProjectData);
  const state: FixtureState = { files, project, manifest, worlds, addedAssets: [], nextEntity: 0, projectPadding: 0 };
  const limit = ARCHIVE_LIMITS[bound], target = limit + side;
  const addedNoteBlocks: BoundaryFile['addedNoteBlocks'] = [], addedGroups: BoundaryFile['addedGroups'] = { count: 0 };
  let expectedPath: string | undefined, level: 0 | 6 = 6;
  let expectedReason = '展開サイズが安全上限を超えています。';
  if (bound === 'compressedBytes') {
    // Four genuinely referenced text assets stay strictly below each 32 MiB cap.
    const assets = Array.from({ length: 4 }, () => addAsset(state, 16 * 1024 * 1024));
    fitAsset(state, assets[3], target, storedZipSize); level = 0;
    // The normal file chooser applies this same original cap before arrayBuffer.
    expectedReason = '保存ファイルの上限は64 MiBです。';
  } else if (bound === 'expandedBytes') {
    const assets = Array.from({ length: 8 }, () => addAsset(state, ARCHIVE_LIMITS.assetBytes - 1));
    fitAsset(state, assets[7], target, expandedSize);
    // manifest is emitted last, so only the global total crosses the limit here.
    expectedPath = 'manifest.json';
  } else if (bound === 'jsonBytes') {
    refresh(state); state.projectPadding = target - files['data/project.json'].length;
    if (state.projectPadding < 0) throw Error('Original project is larger than JSON boundary');
    expectedPath = 'data/project.json';
  } else if (bound === 'assetBytes') {
    expectedPath = addAsset(state, target).entity.data.assetPath;
  } else if (bound === 'files') {
    const count = target - Object.keys(files).length;
    for (let i = 0; i < count; i++) addAsset(state, 80);
    expectedReason = 'ZIPのファイル数が上限を超えています。';
  } else if (bound === 'records') {
    const current = [project, ...worlds].reduce((sum, value) => sum + value.entities.length + value.relations.length, 0);
    for (let i = current; i < target; i++) {
      const entity: Entity<'group'> = { ...common(state, 'E07 category'), kind: 'group', data: { groupType: 'category' } };
      project.entities.push(entity); addedGroups.count++; addedGroups.lastId = entity.id; addedGroups.lastName = entity.name;
    }
    // Keeping the original reference worlds makes the primary project legal;
    // the aggregate original quota is crossed while reading the final world.
    expectedReason = '参照世界を含むentityとrelationの件数が上限を超えています。';
    expectedPath = manifest.files.filter(row => row.role === 'world').at(-1)!.path;
  } else if (bound === 'depth') {
    // gate starts at JSON depth 5; all + its children array add two levels.
    addGate(state, nestedCondition((target - 5) / 2 + 1, 'all'));
    expectedReason = 'JSONの構造が安全上限を超えています。'; expectedPath = 'data/project.json';
  } else if (bound === 'objects') {
    // Six independent body arrays avoid the native 100000-elements array cap.
    const notes = Array.from({ length: 6 }, () => {
      const entity: Entity<'note'> = { ...common(state, 'E07 empty paragraph note'), kind: 'note', data: { body: [] } };
      project.entities.push(entity); return entity;
    });
    refresh(state);
    const needed = target - dimensions(state, 0).objects;
    if (needed < 0) throw Error('Original fixture already exceeds object boundary');
    for (let i = 0; i < needed; i++) {
      const block: Block = { id: uuid('ee071000', i + 1), kind: 'paragraph', text: '' };
      notes[i % notes.length].data.body.push(block);
    }
    for (const note of notes) addedNoteBlocks.push({ entityId: note.id, count: note.data.body.length });
    expectedReason = 'JSONの構造が安全上限を超えています。'; expectedPath = 'data/project.json';
  } else if (bound === 'conditionDepth') {
    addGate(state, nestedCondition(target, 'not'));
    expectedReason = '条件・式は深さ16、ノード256までです。'; expectedPath = 'data/project.json';
  } else {
    addGate(state, { op: 'all', children: Array.from({ length: target - 1 }, () => ({ op: 'constant' as const, value: true })) });
    expectedReason = '条件・式は深さ16、ノード256までです。'; expectedPath = 'data/project.json';
  }
  refresh(state);
  // Only legitimate listed files; manifest goes last for the expanded-byte pair.
  const ordered: Record<string, Uint8Array> = {};
  for (const row of manifest.files) ordered[row.path] = files[row.path];
  ordered['manifest.json'] = files['manifest.json'];
  const archive = zipSync(ordered, { level }), measured = dimensions(state, archive.length);
  expect(measured[bound], `${bound}: actual nearest boundary`).toBe(target);
  for (const key of E07_BOUNDS) if (key !== bound) expect(measured[key], `${bound} must isolate ${key}`).toBeLessThanOrEqual(ARCHIVE_LIMITS[key]);
  if (level === 0) expect(archive.length).toBe(storedZipSize(state));
  const assets = manifest.files.filter(row => row.role === 'asset').map(row => {
    const entity = project.entities.find(item => item.kind === 'attachment' && item.data.contentHash === row.sha256);
    if (!entity || entity.kind !== 'attachment') throw Error(`Asset lacks real current attachment: ${row.path}`);
    return { contentHash: row.sha256, bytes: row.byteSize, mediaType: entity.data.mediaType };
  });
  await writeFile(outputPath, archive);
  return { path: outputPath, bound, side, limit, actual: measured[bound], bytes: archive.length, sha256: sha256(archive), dimensions: measured,
    expectedReason, expectedPath, project: { id: project.projectId, name: project.name, entities: project.entities.length, relations: project.relations.length, snapshots: project.snapshots.length, views: project.views.length },
    worldIds: manifest.files.filter(row => row.role === 'world').map(row => row.path.slice(7, -5)), assets, addedNoteBlocks, addedGroups };
}

export async function restoreBoundaryFile(page: Page, file: BoundaryFile) {
  await page.goto('./');
  await page.getByRole('button', { name: '保存ファイルを読み込む', exact: true }).click();
  await page.locator('input[type=file][accept*=".scenario"]').setInputFiles(file.path);
  await expect(page.getByRole('heading', { name: `検査済みの作品 · ${file.project.name}`, exact: true })).toBeVisible({ timeout: 300_000 });
  await page.getByLabel('復元方法', { exact: true }).selectOption('new');
  await page.getByLabel('復元方法と対象への影響を確認しました').check({ timeout: 300_000 });
  await page.getByRole('button', { name: 'この内容で復元する', exact: true }).click();
  await expect(page.locator('.app-shell')).toBeVisible({ timeout: 300_000 });
  await expect(page.getByRole('dialog', { name: '作品ファイルを読み込む', exact: true })).toHaveCount(0, { timeout: 300_000 });
}

/** Read only native committed counts and each real asset. No import hook. */
export async function committedBoundary(page: Page, file: BoundaryFile) {
  return page.evaluate(async input => {
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open('scenario-manager-local-v1'); request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error);
    });
    const read = <T>(request: IDBRequest<T>) => new Promise<T>((resolve, reject) => { request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error); });
    try {
      const tx = db.transaction(['projects', 'entities', 'relations', 'snapshots', 'views', 'worlds', 'blocks'], 'readonly');
      const result = await Promise.all([
        read(tx.objectStore('projects').get(input.project.id)),
        ...['entities', 'relations', 'snapshots', 'views'].map(name => read(tx.objectStore(name).index('projectId').count(input.project.id))),
        read(tx.objectStore('worlds').getAllKeys()),
        ...input.addedNoteBlocks.map(note => read(tx.objectStore('blocks').index('[projectId+entityId]').count([input.project.id, note.entityId]))),
        ...(input.addedGroups.lastId ? [read(tx.objectStore('entities').get([input.project.id, input.addedGroups.lastId]))] : []),
      ]);
      const header = result[0] as { projectId: string; name: string; entityIds: string[]; relationIds: string[] } | undefined;
      const assets: { contentHash: string; bytes: number; mediaType: string; actualHash: string }[] = [];
      for (const asset of input.assets) {
        const stored = await read(db.transaction('assets', 'readonly').objectStore('assets').get(asset.contentHash)) as { contentHash: string; bytes: Uint8Array; mediaType: string } | undefined;
        if (!stored) throw Error(`Committed asset missing: ${asset.contentHash}`);
        const digest = await crypto.subtle.digest('SHA-256', new Uint8Array(stored.bytes));
        assets.push({ contentHash: stored.contentHash, bytes: stored.bytes.byteLength, mediaType: stored.mediaType, actualHash: [...new Uint8Array(digest)].map(byte => byte.toString(16).padStart(2, '0')).join('') });
      }
      const group = input.addedGroups.lastId ? result.at(-1) as { id: string; kind: string; record: { name: string; data: { groupType: string } } } | undefined : undefined;
      return { header: header && { id: header.projectId, name: header.name, entities: header.entityIds.length, relations: header.relationIds.length },
        entities: result[1], relations: result[2], snapshots: result[3], views: result[4], worldIds: result[5],
        noteBlocks: result.slice(6, 6 + input.addedNoteBlocks.length), assets,
        lastGroup: group && { id: group.id, kind: group.kind, name: group.record.name, groupType: group.record.data.groupType } };
    } finally { db.close(); }
  }, file);
}

/** Snapshot every author/sync table, including binary bytes and split records. */
export async function durableE07(page: Page) {
  return page.evaluate(async () => {
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open('scenario-manager-local-v1'); request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error);
    });
    const normalize = (value: unknown): unknown => {
      if (value instanceof ArrayBuffer) return [...new Uint8Array(value)];
      if (ArrayBuffer.isView(value)) return [...new Uint8Array(value.buffer, value.byteOffset, value.byteLength)];
      if (Array.isArray(value)) return value.map(normalize);
      if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, normalize(item)]));
      return value;
    };
    try {
      const excluded = new Set(['viewStates', 'importDrafts', 'authorToolDrafts', 'workspaceInputs']);
      const tables = [...db.objectStoreNames].filter(name => !excluded.has(name)).sort();
      const tx = db.transaction(tables, 'readonly');
      const rows = await Promise.all(tables.map(name => new Promise<unknown>((resolve, reject) => {
        const request = tx.objectStore(name).getAll(); request.onsuccess = () => resolve([name, normalize(request.result)]); request.onerror = () => reject(request.error);
      })));
      const encoded = new TextEncoder().encode(JSON.stringify(rows)), digest = await crypto.subtle.digest('SHA-256', encoded);
      return { tables, bytes: encoded.length, sha256: [...new Uint8Array(digest)].map(byte => byte.toString(16).padStart(2, '0')).join('') };
    } finally { db.close(); }
  });
}
