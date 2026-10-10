import {validateSyncRecovery,syncRecoveryImages,type NativeSyncRecovery} from './syncRecovery';
import {RECORD_DICTIONARY_FEATURE,RecordDictionaryWriter,RecordDictionaryReader} from './recordDictionary';
import { Inflate, zipSync } from 'fflate';
import { validateRecovery, recoveryImages, type PortableRecovery } from './recovery';
import type { Entity,Relation,ProjectContent, ProjectData, WorldReference } from '../domain/types';
import { newId, validateProject,collectReferences,collectRelationReferences,ENTITY_KINDS } from '../domain/model';
import { validateProjectIntegrity } from '../domain/projectRecordValidation';
import { checkCancelled, StorageError } from './errors';
import { ARCHIVE_LIMITS, FORMAT_VERSION, equalJson, exceedsJsonBytes, jsonBytes, parseStrictJson, resolveLimits, safeArchivePath, sha256,
  type ArchiveLimits, type LimitOverrides } from './json';

export type AssetMode = 'embedded' | 'metadata_only';
export interface ManifestFile { path: string; byteSize: number; sha256: string; role: 'project' | 'world' | 'asset' | 'recovery' | 'sync_recovery' | 'record_dictionary' }
export interface ScenarioManifest {
  format: 'scenario-package'; formatVersion: string; projectId: string; snapshotId: string;
  exportedAt: string; assetMode: AssetMode; files: ManifestFile[]; minimumReaderVersion: string;
  requiredFeatures?: string[];
}
export interface ArchiveAsset { path: string; contentHash: string; mediaType: string; bytes: Uint8Array }
export interface PreparedScenario {
  manifest: ScenarioManifest; project: ProjectData; worlds: Record<string, ProjectData>;
  assets: ArchiveAsset[]; warnings: string[]; recovery?: PortableRecovery; syncRecovery?:NativeSyncRecovery[];
  summary: { name: string; entities: number; relations: number; assetBytes: number; missingAssets: number; history: number };
}
export interface ArchiveProgress { stage: 'container' | 'expanding' | 'hashes' | 'validating' | 'serializing' | 'compressing'; completed: number; total: number; path?: string }
export interface InspectOptions { signal?: AbortSignal; onProgress?: (progress: ArchiveProgress) => void; limits?: LimitOverrides; worker?: boolean }
export interface ExportOptions {
  assetMode?: AssetMode; snapshotId?: string; exportedAt?: string;
  loadAsset?: (hash: string) => Promise<Uint8Array | undefined> | Uint8Array | undefined;
  worlds?: Record<string, ProjectData>; signal?: AbortSignal; recovery?: PortableRecovery;syncRecovery?:NativeSyncRecovery[];
  worker?:boolean;onProgress?:(progress:ArchiveProgress)=>void;
}

interface ZipEntry { path: string; compressedSize: number; expandedSize: number; dataStart: number; method: number; crc: number; localStart: number; localEnd: number }
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const hashPattern = /^[0-9a-f]{64}$/;
const pathPattern = /^(?:manifest\.json|data\/(?:project|recovery|sync-recovery|records)\.json|worlds\/[0-9a-f-]{36}\.json|assets\/[0-9a-f]{64}\.[a-z0-9]{1,8})$/;
const mimeExtensions: Record<string, string[]> = {
  'image/png': ['png'], 'image/jpeg': ['jpg', 'jpeg'], 'image/gif': ['gif'], 'image/webp': ['webp'],
  'audio/mpeg': ['mp3'], 'audio/wav': ['wav'], 'audio/x-wav': ['wav'], 'audio/ogg': ['ogg'],
  'video/mp4': ['mp4'], 'video/webm': ['webm'], 'application/pdf': ['pdf'],
  'text/plain': ['txt'], 'application/json': ['json'], 'application/octet-stream': ['bin'],
};

export function assetPath(contentHash: string, mediaType = 'application/octet-stream'): string {
  const extensions = mimeExtensions[mediaType];
  if (!hashPattern.test(contentHash) || !extensions) throw new StorageError('ASSET_INVALID', '素材のhashまたは種類が未対応です。');
  return `assets/${contentHash}.${extensions[0]}`;
}

export function validateAsset(path: string, mediaType: string, bytes?: Uint8Array): string {
  safeArchivePath(path);
  const match = /^assets\/([0-9a-f]{64})\.([a-z0-9]{1,8})$/.exec(path);
  if (!match || !mimeExtensions[mediaType]?.includes(match[2])) throw new StorageError('ASSET_INVALID', '素材パス・種類・拡張子が一致しません。', path);
  if (bytes) {
    const starts = (values: number[]) => values.every((value, index) => bytes[index] === value);
    const ascii = (offset: number, text: string) => [...text].every((char, index) => bytes[offset + index] === char.charCodeAt(0));
    let valid = true;
    switch (mediaType) {
      case 'image/png': valid = starts([137, 80, 78, 71, 13, 10, 26, 10]); break;
      case 'image/jpeg': valid = starts([255, 216, 255]); break;
      case 'image/gif': valid = ascii(0, 'GIF87a') || ascii(0, 'GIF89a'); break;
      case 'image/webp': valid = ascii(0, 'RIFF') && ascii(8, 'WEBP'); break;
      case 'audio/mpeg': valid = ascii(0, 'ID3') || (bytes[0] === 255 && (bytes[1] & 224) === 224); break;
      case 'audio/wav': case 'audio/x-wav': valid = ascii(0, 'RIFF') && ascii(8, 'WAVE'); break;
      case 'audio/ogg': valid = ascii(0, 'OggS'); break;
      case 'video/mp4': valid = ascii(4, 'ftyp'); break;
      case 'video/webm': valid = starts([26, 69, 223, 163]); break;
      case 'application/pdf': valid = ascii(0, '%PDF-'); break;
      case 'application/json': parseStrictJson(bytes, path); break;
      case 'text/plain':
        try { new TextDecoder('utf-8', { fatal: true }).decode(bytes); }
        catch { valid = false; }
        break;
    }
    if (!valid) throw new StorageError('ASSET_INVALID', '素材bytesが宣言した種類と一致しません。', path);
  }
  return match[1];
}

function zipEntries(bytes: Uint8Array, limits: ArchiveLimits): ZipEntry[] {
  if (bytes.byteLength > limits.compressedBytes) throw new StorageError('LIMIT_EXCEEDED', '圧縮ファイルが64 MiBの上限を超えています。');
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const invalid = (message: string, path?: string): never => { throw new StorageError('ARCHIVE_INVALID', message, path); };
  const u16 = (offset: number) => offset >= 0 && offset + 2 <= bytes.length ? view.getUint16(offset, true) : invalid('ZIPヘッダーが途中で切れています。');
  const u32 = (offset: number) => offset >= 0 && offset + 4 <= bytes.length ? view.getUint32(offset, true) : invalid('ZIPヘッダーが途中で切れています。');
  if (bytes.length < 22 || u32(0) !== 0x04034b50) return invalid('専用ZIPコンテナーのヘッダーがありません。');
  let end = -1;
  for (let offset = bytes.length - 22; offset >= Math.max(0, bytes.length - 65_557); offset--) {
    if (u32(offset) === 0x06054b50 && offset + 22 + u16(offset + 20) === bytes.length) { end = offset; break; }
  }
  if (end < 0) return invalid('ZIPの終端が不正です。');
  const count = u16(end + 10), directorySize = u32(end + 12), directoryStart = u32(end + 16);
  if (u16(end + 4) || u16(end + 6) || u16(end + 8) !== count || count === 0xffff
    || directorySize === 0xffffffff || directoryStart === 0xffffffff) return invalid('分割ZIPとZIP64は未対応です。');
  if (count > limits.files) throw new StorageError('LIMIT_EXCEEDED', 'ZIPのファイル数が上限を超えています。');
  if (!count || directoryStart + directorySize !== end) return invalid('ZIPの中央ディレクトリが不正です。');
  let position = directoryStart, total = 0;
  const entries: ZipEntry[] = [], paths = new Set<string>();
  function decodeName(start: number, size: number): string {
    if (start + size > bytes.length) return invalid('ZIPのファイル名が途中で切れています。');
    try { return new TextDecoder('utf-8', { fatal: true }).decode(bytes.subarray(start, start + size)); }
    catch { return invalid('ZIPのファイル名がUTF-8ではありません。'); }
  }
  function checkExtra(start: number, size: number, path: string): void {
    const finish = start + size;
    if (finish > bytes.length) return invalid('ZIP追加情報が途中で切れています。', path);
    for (let offset = start; offset < finish;) {
      if (offset + 4 > finish) return invalid('ZIP追加情報が不正です。', path);
      const type = u16(offset), length = u16(offset + 2);
      if (type === 1) return invalid('ZIP64は未対応です。', path);
      offset += 4 + length;
      if (offset > finish) return invalid('ZIP追加情報の長さが不正です。', path);
    }
  }
  for (let index = 0; index < count; index++) {
    if (position + 46 > end || u32(position) !== 0x02014b50) return invalid('ZIPの中央ヘッダーが不正です。');
    const flags = u16(position + 8), method = u16(position + 10), crc = u32(position + 16);
    const compressedSize = u32(position + 20), expandedSize = u32(position + 24);
    const nameLength = u16(position + 28), extraLength = u16(position + 30), commentLength = u16(position + 32);
    const localStart = u32(position + 42), attrs = u32(position + 38), path = decodeName(position + 46, nameLength);
    safeArchivePath(path);
    if (!pathPattern.test(path)) return invalid('専用形式に未定義のファイルがあります。', path);
    if (paths.has(path)) return invalid('ZIP内のファイル名が重複しています。', path);
    paths.add(path);
    if (flags & (1 | 64 | 8192) || (method !== 0 && method !== 8)) return invalid('暗号化ZIPまたは未対応の圧縮方式です。', path);
    if (((attrs >>> 16) & 0xf000) === 0xa000 || (attrs & 16)) return invalid('symlinkとディレクトリは読み込めません。', path);
    if (u16(position + 34) || compressedSize === 0xffffffff || expandedSize === 0xffffffff || localStart === 0xffffffff) return invalid('分割ZIPとZIP64は未対応です。', path);
    const fileLimit = path.startsWith('assets/') ? limits.assetBytes : limits.jsonBytes;
    if (expandedSize > fileLimit || (total += expandedSize) > limits.expandedBytes) throw new StorageError('LIMIT_EXCEEDED', '展開サイズが安全上限を超えています。', path);
    checkExtra(position + 46 + nameLength, extraLength, path);
    if (localStart + 30 > directoryStart || u32(localStart) !== 0x04034b50) return invalid('ZIPのローカルヘッダーが不正です。', path);
    const localNameLength = u16(localStart + 26), localExtraLength = u16(localStart + 28);
    if (u16(localStart + 6) !== flags || u16(localStart + 8) !== method
      || decodeName(localStart + 30, localNameLength) !== path) return invalid('ZIPのローカル/中央ヘッダーが一致しません。', path);
    checkExtra(localStart + 30 + localNameLength, localExtraLength, path);
    const dataStart = localStart + 30 + localNameLength + localExtraLength;
    let localEnd = dataStart + compressedSize;
    if (localEnd > directoryStart) return invalid('ZIPの圧縮データが範囲外です。', path);
    if (flags & 8) {
      let descriptor = localEnd;
      if (u32(descriptor) === 0x08074b50) descriptor += 4;
      if (u32(descriptor) !== crc || u32(descriptor + 4) !== compressedSize || u32(descriptor + 8) !== expandedSize) return invalid('ZIPのdata descriptorが一致しません。', path);
      localEnd = descriptor + 12;
    } else if (u32(localStart + 14) !== crc || u32(localStart + 18) !== compressedSize || u32(localStart + 22) !== expandedSize) return invalid('ZIPのサイズ/CRC宣言が一致しません。', path);
    entries.push({ path, compressedSize, expandedSize, dataStart, method, crc, localStart, localEnd });
    position += 46 + nameLength + extraLength + commentLength;
  }
  if (position !== directoryStart + directorySize) return invalid('ZIPの中央ディレクトリ長が不正です。');
  let expected = 0;
  for (const entry of [...entries].sort((left, right) => left.localStart - right.localStart)) {
    if (entry.localStart !== expected) return invalid('ZIPに未列挙データまたは重複した領域があります。', entry.path);
    expected = entry.localEnd;
  }
  if (expected !== directoryStart) return invalid('ZIPに未列挙データがあります。');
  if (!paths.has('manifest.json') || !paths.has('data/project.json')) return invalid('manifestまたは作品データがありません。');
  return entries;
}

const crcTable = Uint32Array.from({ length: 256 }, (_, index) => {
  let value = index;
  for (let bit = 0; bit < 8; bit++) value = value & 1 ? (value >>> 1) ^ 0xedb88320 : value >>> 1;
  return value >>> 0;
});
const yieldTask = () => new Promise<void>(resolve => setTimeout(resolve, 0));

async function expand(bytes: Uint8Array, entries: ZipEntry[], options: InspectOptions, limits: ArchiveLimits): Promise<Map<string, Uint8Array>> {
  const files = new Map<string, Uint8Array>();
  let total = 0, completed = 0, pushes = 0;
  for (const entry of entries) {
    checkCancelled(options.signal);
    let size = 0, crc = 0xffffffff;
    const chunks: Uint8Array[] = [];
    const consume = (chunk: Uint8Array) => {
      size += chunk.byteLength; total += chunk.byteLength;
      if (size > entry.expandedSize || size > (entry.path.startsWith('assets/') ? limits.assetBytes : limits.jsonBytes)
        || total > limits.expandedBytes) throw new StorageError('LIMIT_EXCEEDED', '実際の展開bytesが安全上限または宣言サイズを超えました。', entry.path);
      for (const byte of chunk) crc = crcTable[(crc ^ byte) & 255] ^ (crc >>> 8);
      chunks.push(chunk.slice());
    };
    try {
      if (entry.method === 0) consume(bytes.subarray(entry.dataStart, entry.dataStart + entry.compressedSize));
      else {
        const inflater = new Inflate(consume);
        // Small compressed chunks bound temporary allocations even when central size declarations lie.
        for (let offset = 0; offset < entry.compressedSize; offset += 4096) {
          checkCancelled(options.signal);
          const end = Math.min(entry.compressedSize, offset + 4096);
          inflater.push(bytes.subarray(entry.dataStart + offset, entry.dataStart + end), end === entry.compressedSize);
          if (++pushes % 32 === 0) await yieldTask();
        }
        if (!entry.compressedSize) inflater.push(new Uint8Array(), true);
      }
    } catch (error) {
      if (error instanceof StorageError) throw error;
      throw new StorageError('ARCHIVE_INVALID', '素材またはJSONの展開に失敗しました。', entry.path, { cause: error });
    }
    if (size !== entry.expandedSize || ((crc ^ 0xffffffff) >>> 0) !== entry.crc) throw new StorageError('ARCHIVE_INVALID', 'ZIPの実サイズまたはCRCが一致しません。', entry.path);
    const file = new Uint8Array(size);
    let offset = 0;
    for (const chunk of chunks) { file.set(chunk, offset); offset += chunk.byteLength; }
    files.set(entry.path, file);
    options.onProgress?.({ stage: 'expanding', completed: ++completed, total: entries.length, path: entry.path });
    if (completed % 32 === 0) await yieldTask();
  }
  return files;
}

function object(value: unknown, path: string): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new StorageError('ARCHIVE_INVALID', 'オブジェクトが必要です。', path);
  return value as Record<string, unknown>;
}

function parseManifest(value: unknown): ScenarioManifest {
  const data = object(value, 'manifest.json');
  if (data.format !== 'scenario-package' || data.formatVersion !== FORMAT_VERSION) throw new StorageError('FORMAT_UNSUPPORTED', 'この専用形式の版には対応していません。元のファイルを保持してください。', 'manifest.json');
  const minimum = typeof data.minimumReaderVersion === 'string' && /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/.test(data.minimumReaderVersion) ? data.minimumReaderVersion.split('.').map(Number) : undefined;
  if (!minimum || minimum[0] > 1 || minimum[0] === 1 && (minimum[1] > 0 || minimum[2] > 0)) throw new StorageError('FORMAT_UNSUPPORTED', '読み込みに新しいアプリが必要です。', 'manifest.json/minimumReaderVersion');
  if (data.requiredFeatures !== undefined && (!Array.isArray(data.requiredFeatures) || data.requiredFeatures.some(feature => !['portable-recovery-v1','native-sync-recovery-v1','shared-review-source-v1',RECORD_DICTIONARY_FEATURE].includes(feature)))) throw new StorageError('FORMAT_UNSUPPORTED', '未知の必須機能が宣言されています。', 'manifest.json/requiredFeatures');
  if (typeof data.projectId !== 'string' || !uuid.test(data.projectId) || typeof data.snapshotId !== 'string' || !uuid.test(data.snapshotId)
    || typeof data.exportedAt !== 'string' || !Number.isFinite(Date.parse(data.exportedAt)) || !data.exportedAt.endsWith('Z')
    || !['embedded', 'metadata_only'].includes(data.assetMode as string) || !Array.isArray(data.files)) throw new StorageError('ARCHIVE_INVALID', 'manifestの必須項目が不正です。', 'manifest.json');
  const paths = new Set<string>();
  for (const [index, file] of data.files.entries()) {
    const item = object(file, `manifest.json/files/${index}`);
    if (typeof item.path !== 'string') throw new StorageError('ARCHIVE_INVALID', 'manifestのpathが不正です。', `manifest.json/files/${index}`);
    safeArchivePath(item.path);
    if (item.path === 'manifest.json' || !pathPattern.test(item.path) || paths.has(item.path)
      || !Number.isSafeInteger(item.byteSize) || (item.byteSize as number) < 0 || typeof item.sha256 !== 'string' || !hashPattern.test(item.sha256)
      || item.role !== (item.path === 'data/project.json' ? 'project' : item.path === 'data/recovery.json' ? 'recovery' : item.path === 'data/sync-recovery.json'?'sync_recovery':item.path==='data/records.json'?'record_dictionary': item.path.startsWith('worlds/') ? 'world' : 'asset')) throw new StorageError('ARCHIVE_INVALID', 'manifestのファイル宣言が不正または重複しています。', item.path);
    paths.add(item.path);
  }
  return data as unknown as ScenarioManifest;
}

function checkedProject(value: unknown, path: string, limits: ArchiveLimits, worldSnapshots: Record<string, ProjectContent> = {}): ProjectData {
  let validation: ReturnType<typeof validateProject>;
  try { validation = validateProject(value, { worldSnapshots }); }
  catch (error) { throw new StorageError('VALIDATION_FAILED', '共通世界または作品の構造が不正です。', path, { cause: error }); }
  if (!validation.ok) throw new StorageError('VALIDATION_FAILED', validation.issues.map(issue => `${issue.path}: ${issue.message}`).join('\n'), path);
  const project = validation.value;
  if (project.entities.length + project.relations.length > limits.records) throw new StorageError('LIMIT_EXCEEDED', 'entityとrelationの件数が上限を超えています。', path);
  enforceFieldLimits(project, path, limits);
  return project;
}
async function checkedProjectIntegrity(project: ProjectData, path: string, worldSnapshots: Record<string, ProjectContent> = {}): Promise<void> {
  const issues = await validateProjectIntegrity(project, { worldSnapshots }, true);
  if (issues.length) throw new StorageError('VALIDATION_FAILED', issues.map(issue => `${issue.path}: ${issue.message}`).join('\n'), path);
}

function enforceFieldLimits(value: unknown, path: string, limits: ArchiveLimits): void {
  if (typeof value === 'string') {
    if (new TextEncoder().encode(value).byteLength > limits.fieldBytes) throw new StorageError('LIMIT_EXCEEDED', '本文フィールドが1 MiBの上限を超えています。', path);
  } else if (Array.isArray(value)) value.forEach((item, index) => enforceFieldLimits(item, `${path}/${index}`, limits));
  else if (value && typeof value === 'object') for (const [key, item] of Object.entries(value)) enforceFieldLimits(item, `${path}/${key}`, limits);
}

interface AttachmentMetadata { contentHash: string; mediaType: string; byteSize: number; assetPath: string }
export function attachmentMetadata(project: ProjectData): AttachmentMetadata[] {
  const result = new Map<string, AttachmentMetadata>();
  const visited=new WeakSet<object>();
  function walk(value: unknown): void {
    if(value&&typeof value==='object'){if(visited.has(value))return;visited.add(value);}
    if (Array.isArray(value)) { value.forEach(walk); return; }
    if (!value || typeof value !== 'object') return;
    const data = value as Record<string, unknown>;
    if (data.kind === 'attachment') {
      const payload = object(data.data, 'attachment/data');
      const attachment = payload as unknown as AttachmentMetadata;
      const hash = validateAsset(attachment.assetPath, attachment.mediaType);
      if (hash !== attachment.contentHash || !Number.isSafeInteger(attachment.byteSize) || attachment.byteSize < 0) throw new StorageError('ASSET_INVALID', '素材のhashまたはサイズが不正です。', attachment.assetPath);
      const existing = result.get(hash);
      if (existing && (existing.assetPath !== attachment.assetPath || existing.byteSize !== attachment.byteSize || existing.mediaType !== attachment.mediaType)) throw new StorageError('ASSET_INVALID', '同じhashの素材に異なるメタデータがあります。', attachment.assetPath);
      result.set(hash, attachment);
    }
    for (const key of Object.keys(data)) {
      const item = data[key];
      if (item && typeof item === 'object') walk(item);
    }
  }
  // Historical attachments remain available for single-record restoration.
  walk(project);
  return [...result.values()];
}

export function allAttachmentMetadata(projects: ProjectData[]): AttachmentMetadata[] {
  const byHash = new Map<string, AttachmentMetadata>();
  for (const project of projects) for (const metadata of attachmentMetadata(project)) {
    const old = byHash.get(metadata.contentHash);
    if (old && (old.assetPath !== metadata.assetPath || old.mediaType !== metadata.mediaType || old.byteSize !== metadata.byteSize)) throw new StorageError('ASSET_INVALID', '作品間の素材メタデータが一致しません。', metadata.assetPath);
    byHash.set(metadata.contentHash, metadata);
  }
  return [...byHash.values()];
}

/** Includes only pinned, transitive world dependencies; current world drafts cannot substitute. */
export function closureAttachmentMetadata(project:ProjectData,available:Record<string,ProjectData>={}) {
  const selected:Record<string,ProjectData>={},queue=[project];
  while(queue.length)for(const reference of referencedWorlds(queue.splice(0),available)){
    const id=reference.immutableSnapshotId;if(selected[id])continue;
    const world=available[id],pin=world?.snapshots.find(s=>s.id===id);
    if(!world||world.projectId!==reference.projectId||pin?.contentHash!==reference.contentHash)throw new StorageError('ASSET_MISSING','素材の固定世界依存が不足または不一致です。',id);
    selected[id]=world;if(Object.keys(selected).length>ARCHIVE_LIMITS.records)throw new StorageError('LIMIT_EXCEEDED','固定世界の依存上限を超えています。');queue.push(world);
  }
  return allAttachmentMetadata([project,...Object.values(selected)]);
}

/** Complete backups need pinned worlds referenced by old history and immutable versions too. */
export function referencedWorlds(projects: ProjectData[],availableWorlds:Record<string,ProjectData>={}): WorldReference[] {
  const fixed=new Map<string,{world:ProjectData;reference:WorldReference}>();
  for(const world of Object.values(availableWorlds))for(const pin of world.snapshots){const existing=fixed.get(pin.id);if(existing&&existing.reference.contentHash!==pin.contentHash)throw new StorageError('IMMUTABLE_SNAPSHOT','固定世界の期待hashが同じIDで異なります。',pin.id);fixed.set(pin.id,{world,reference:{projectId:world.projectId,immutableSnapshotId:pin.id,contentHash:pin.contentHash}});}
  const references = new Map<string, WorldReference>();
  const visited=new WeakSet<object>();
  function walk(value: unknown): void {
    if(value&&typeof value==='object'){if(visited.has(value))return;visited.add(value);}
    if (Array.isArray(value)) { value.forEach(walk); return; }
    if (!value || typeof value !== 'object') return;
    const data = value as Record<string, unknown>;
    if (Array.isArray(data.worldReferences)) for (const reference of data.worldReferences as WorldReference[]) {
      const old = references.get(reference.immutableSnapshotId);
      if (old && (old.projectId !== reference.projectId || old.contentHash !== reference.contentHash)) throw new StorageError('VALIDATION_FAILED', '同じ共通世界snapshot IDの参照内容が一致しません。', reference.immutableSnapshotId);
      references.set(reference.immutableSnapshotId, reference);
    }
    // Typed references can only add a dependency found in this fixed registry.
    // Explicit worldReferences above must still be checked when it is empty.
    const typedReferences=!fixed.size?[]:typeof data.kind==='string'&&ENTITY_KINDS.includes(data.kind as Entity['kind'])&&typeof data.projectId==='string'&&data.data&&typeof data.data==='object'?collectReferences(data as unknown as Entity):typeof data.relationType==='string'&&typeof data.projectId==='string'&&typeof data.fromId==='string'&&typeof data.toId==='string'?collectRelationReferences(data as unknown as Relation):[];
    for(const reference of typedReferences)if(reference.scope==='snapshot'){const pin=fixed.get(reference.id);if(pin&&pin.world.projectId!==data.projectId){const existing=references.get(reference.id);if(existing&&existing.contentHash!==pin.reference.contentHash)throw new StorageError('IMMUTABLE_SNAPSHOT','引用世界の期待hashが採用版と異なります。',reference.id);references.set(reference.id,pin.reference);}}
    for (const key of Object.keys(data)) {
      const item = data[key];
      if (item && typeof item === 'object') walk(item);
    }
  }
  projects.forEach(walk); return [...references.values()];
}

export function worldSnapshotContents(worlds: Record<string, unknown>): Record<string, ProjectContent> {
  const contents: Record<string, ProjectContent> = Object.create(null) as Record<string, ProjectContent>;
  for (const [id, raw] of Object.entries(worlds)) {
    if (!raw || typeof raw !== 'object' || !Array.isArray((raw as ProjectData).snapshots)) continue;
    const snapshot = (raw as ProjectData).snapshots.find(item => item && item.id === id);
    if (!snapshot?.content || typeof snapshot.content !== 'object' || !Array.isArray(snapshot.content.entities)
      || !Array.isArray(snapshot.content.relations) || !Array.isArray(snapshot.content.calendars)) continue;
    if (contents[id] && !equalJson(contents[id], snapshot.content)) throw new StorageError('IMMUTABLE_SNAPSHOT', '同じ固定版IDに異なる内容があります。', id);
    contents[id] = snapshot.content;
    for (const dependency of (raw as ProjectData).snapshots) if (dependency?.content?.projectId === (raw as ProjectData).projectId) {
      if (contents[dependency.id] && !equalJson(contents[dependency.id], dependency.content)) throw new StorageError('IMMUTABLE_SNAPSHOT', '同じ固定版IDに異なる内容があります。', dependency.id);
      contents[dependency.id] = dependency.content;
    }
  }
  return contents;
}

export function verifyWorlds(projects: ProjectData[], worlds: Record<string, ProjectData>): void {
  for (const [id, world] of Object.entries(worlds)) if (!world.snapshots.some(item => item.id === id)) throw new StorageError('VALIDATION_FAILED', '共通世界ファイルに指定した不変snapshotがありません。', `worlds/${id}.json`);
  for (const reference of referencedWorlds(projects)) {
    const world = worlds[reference.immutableSnapshotId];
    const snapshot = world?.snapshots.find(item => item.id === reference.immutableSnapshotId);
    if (!world || world.projectId !== reference.projectId || !snapshot || snapshot.contentHash !== reference.contentHash) throw new StorageError('VALIDATION_FAILED', '参照した共通世界の不変snapshotが不足または不一致です。', `worlds/${reference.immutableSnapshotId}.json`);
  }
}

export async function verifySnapshotHashes(projects: ProjectData[]): Promise<void> {
  const snapshots = new Map<string, ProjectData['snapshots'][number]>();
  function walk(value: unknown): void {
    if (Array.isArray(value)) { value.forEach(walk); return; }
    if (!value || typeof value !== 'object') return;
    const data = value as Record<string, unknown>;
    if (Array.isArray(data.snapshots)) for (const snapshot of data.snapshots as ProjectData['snapshots']) {
      const previous = snapshots.get(snapshot.id);
      if (previous && !equalJson(previous, snapshot)) throw new StorageError('IMMUTABLE_SNAPSHOT', '同じ不変snapshot IDに異なる内容があります。', snapshot.id);
      snapshots.set(snapshot.id, snapshot);
    }
    for (const key of Object.keys(data)) {
      const item = data[key];
      if (item && typeof item === 'object') walk(item);
    }
  }
  projects.forEach(walk);
  for (const snapshot of snapshots.values()) if (await sha256(jsonBytes(snapshot.content)) !== snapshot.contentHash) throw new StorageError('HASH_MISMATCH', '不変snapshotの内容hashが一致しません。', `snapshots/${snapshot.id}`);
}

/** Internal entry point also used by the dedicated worker; it never changes IndexedDB. */
export async function inspectScenarioData(bytes: Uint8Array, options: InspectOptions = {}): Promise<PreparedScenario> {
  checkCancelled(options.signal);
  const limits = resolveLimits(options.limits);
  const entries = zipEntries(bytes, limits);
  options.onProgress?.({ stage: 'container', completed: entries.length, total: entries.length });
  const files = await expand(bytes, entries, options, limits);
  const budget = { objects: 0 };
  const manifest = parseManifest(parseStrictJson(files.get('manifest.json')!, 'manifest.json', limits, budget));
  if (manifest.files.length !== files.size - 1) throw new StorageError('ARCHIVE_INVALID', 'ZIPとmanifestのファイル数が一致しません。', 'manifest.json');
  const declared = new Set(manifest.files.map(file => file.path));
  for (const path of files.keys()) if (path !== 'manifest.json' && !declared.has(path)) throw new StorageError('ARCHIVE_INVALID', 'manifestに列挙されていないファイルがあります。', path);
  for (const [index, file] of manifest.files.entries()) {
    checkCancelled(options.signal);
    const data = files.get(file.path);
    if (!data) throw new StorageError('ARCHIVE_INVALID', 'manifestで列挙したファイルがありません。', file.path);
    if (data.byteLength !== file.byteSize || await sha256(data) !== file.sha256) throw new StorageError('HASH_MISMATCH', 'ファイルサイズまたはSHA-256が一致しません。', file.path);
    options.onProgress?.({ stage: 'hashes', completed: index + 1, total: manifest.files.length, path: file.path });
  }
  const hasDictionary=manifest.requiredFeatures?.includes(RECORD_DICTIONARY_FEATURE)??false;
  if(hasDictionary!==files.has('data/records.json'))throw new StorageError('FORMAT_UNSUPPORTED','共有レコード辞書には対応する必須機能の宣言が必要です。');
  const dictionary=hasDictionary?new RecordDictionaryReader(parseStrictJson(files.get('data/records.json')!,'data/records.json',limits,budget),limits):undefined;
  const read=(path:string)=>{const value=parseStrictJson(files.get(path)!,path,limits,budget);return dictionary?dictionary.decode(value,path):value;};
  const rawWorlds: Record<string, unknown> = Object.create(null) as Record<string, unknown>;
  for (const file of manifest.files.filter(item => item.role === 'world')) rawWorlds[file.path.slice(7, -5)] = read(file.path);
  const worldContents = worldSnapshotContents(rawWorlds);
  const project = checkedProject(read('data/project.json'), 'data/project.json', limits, worldContents);
  if (project.projectId !== manifest.projectId) throw new StorageError('VALIDATION_FAILED', 'manifestと作品のprojectIdが一致しません。', 'data/project.json/projectId');
  const worlds: Record<string, ProjectData> = Object.create(null) as Record<string, ProjectData>;
  let records = project.entities.length + project.relations.length;
  for (const file of manifest.files.filter(item => item.role === 'world')) {
    const world = checkedProject(rawWorlds[file.path.slice(7, -5)], file.path, limits, worldContents);
    worlds[file.path.slice(7, -5)] = world;
    records += world.entities.length + world.relations.length;
    if (records > limits.records) throw new StorageError('LIMIT_EXCEEDED', '参照世界を含むentityとrelationの件数が上限を超えています。', file.path);
  }
  const declaredRecovery = manifest.requiredFeatures?.includes('portable-recovery-v1') ?? false;
  if (declaredRecovery !== files.has('data/recovery.json')) throw new StorageError('FORMAT_UNSUPPORTED', '送信待ち復元情報には対応する必須機能の宣言が必要です。');
  const recovery = declaredRecovery ? await validateRecovery(read('data/recovery.json'), project, worldContents, options.signal) : undefined;
  const declaredSync=manifest.requiredFeatures?.includes('native-sync-recovery-v1')??false;
  if(declaredSync!==files.has('data/sync-recovery.json'))throw new StorageError('FORMAT_UNSUPPORTED','同期復元証跡には必須機能宣言が必要です。');
  const syncRecovery=declaredSync?await validateSyncRecovery(read('data/sync-recovery.json'),worldContents,options.signal):undefined;
  dictionary?.assertComplete();
  const operationalImages = [...recoveryImages(recovery),...syncRecoveryImages(syncRecovery)];
  const sharedReviews=hasSharedReviewSource([project,...operationalImages,...Object.values(worlds)]);
  if(sharedReviews!==(manifest.requiredFeatures?.includes('shared-review-source-v1')??false))throw new StorageError('FORMAT_UNSUPPORTED','共有指摘の出所には対応する必須機能宣言が必要です。');
  verifyWorlds([project, ...operationalImages, ...Object.values(worlds)], worlds);
  await verifySnapshotHashes([project, ...operationalImages, ...Object.values(worlds)]);
  await checkedProjectIntegrity(project, 'data/project.json', worldContents);
  for (const [id, world] of Object.entries(worlds)) await checkedProjectIntegrity(world, `worlds/${id}.json`, worldContents);
  const attachments = new Map(allAttachmentMetadata([project, ...operationalImages, ...Object.values(worlds)]).map(item => [item.assetPath, item]));
  const assets: ArchiveAsset[] = [];
  for (const file of manifest.files.filter(item => item.role === 'asset')) {
    const metadata = attachments.get(file.path), data = files.get(file.path)!;
    if (!metadata || manifest.assetMode === 'metadata_only') throw new StorageError('ASSET_INVALID', '未参照または軽量保存に不適切な素材ファイルです。', file.path);
    validateAsset(file.path, metadata.mediaType, data);
    if (data.byteLength !== metadata.byteSize || await sha256(data) !== metadata.contentHash) throw new StorageError('HASH_MISMATCH', '添付素材の原hashまたはサイズが一致しません。', file.path);
    assets.push({ path: file.path, contentHash: metadata.contentHash, mediaType: metadata.mediaType, bytes: data });
  }
  const missing = [...attachments.keys()].filter(path => !files.has(path));
  if (manifest.assetMode === 'embedded' && missing.length) throw new StorageError('ASSET_MISSING', '完全保存に必要な添付bytesが不足しています。', missing[0]);
  checkCancelled(options.signal);
  options.onProgress?.({ stage: 'validating', completed: 1, total: 1 });
  return { manifest, project, worlds, assets, ...(recovery ? { recovery } : {}),...(syncRecovery?{syncRecovery}:{}),
    warnings: [...(manifest.assetMode === 'metadata_only' ? [`軽量保存です。${missing.length}件の添付bytesを含まず、完全バックアップとして復元できません。`] : []), ...(recovery?.pending.length ? [`${recovery.pending.length}件の送信待ち意図を保持します。接続先・権限・サーバー共通元を確認するまで自動送信しません。`] : [])],
    summary: { name: project.name, entities: project.entities.length, relations: project.relations.length, assetBytes: assets.reduce((sum, item) => sum + item.bytes.byteLength, 0), missingAssets: missing.length, history: project.history.length } };
}

export async function exportScenarioData(input: ProjectData, options: ExportOptions = {}): Promise<Uint8Array> {
  checkCancelled(options.signal);
  options.onProgress?.({stage:'validating',completed:0,total:1});
  const worlds = options.worlds ?? {};
  const worldContents = worldSnapshotContents(worlds);
  const project = checkedProject(input, 'data/project.json', ARCHIVE_LIMITS, worldContents);
  const selected = options.snapshotId ? project.snapshots.find(item => item.id === options.snapshotId) : undefined;
  if (selected) {
    const { history: _history, snapshots: _snapshots, authorAlternatives: _authorAlternatives, ...content } = project;
    if (!equalJson(content, selected.content)) throw new StorageError('OPERATION_CONFLICT', '指定した版と書き出す内容が一致しません。対象snapshotの内容を選び直してください。', options.snapshotId);
  }
  verifyWorlds([project, ...Object.values(worlds)], worlds);
  await verifySnapshotHashes([project, ...Object.values(worlds)]);
  await checkedProjectIntegrity(project, 'data/project.json', worldContents);
  for (const [id, world] of Object.entries(worlds)) await checkedProjectIntegrity(world, `worlds/${id}.json`, worldContents);
  const recordCount = [project, ...Object.values(worlds)].reduce((sum, source) => sum + source.entities.length + source.relations.length, 0);
  if (recordCount > ARCHIVE_LIMITS.records) throw new StorageError('LIMIT_EXCEEDED', '参照世界を含むentityとrelationの件数が上限を超えています。');
  const recovery = options.recovery ? await validateRecovery(options.recovery, project, worldContents, options.signal) : undefined;
  const syncRecovery=options.syncRecovery?.length?await validateSyncRecovery(options.syncRecovery,worldContents,options.signal):undefined;
  const operationalImages = [...recoveryImages(recovery),...syncRecoveryImages(syncRecovery)];
  verifyWorlds(operationalImages, worlds); await verifySnapshotHashes(operationalImages);
  const mode = options.assetMode ?? 'embedded';
  const attachments = allAttachmentMetadata([project, ...operationalImages, ...Object.values(worlds)]);
  options.onProgress?.({stage:'serializing',completed:0,total:1});
  // Larger retained images share exact record variants and ordered array deltas.
  // Older readers reject the required feature before interpreting any image.
  const retained = project.history.length + project.snapshots.length + (project.authorAlternatives?.length ?? 0) + (recovery?.pending.length ?? 0) + (syncRecovery?.length ?? 0);
  const needsDictionary = recordCount >= 5000 && retained > 0 || [project, ...Object.values(worlds), recovery, syncRecovery].some(value => value !== undefined && exceedsJsonBytes(value, ARCHIVE_LIMITS.jsonBytes));
  const dictionary = needsDictionary ? new RecordDictionaryWriter() : undefined;
  const encode=(value:unknown)=>jsonBytes(dictionary?dictionary.encode(value):value);
  const files: Record<string, Uint8Array> = { 'data/project.json': encode(project), ...(recovery ? { 'data/recovery.json': encode(recovery) } : {}),...(syncRecovery?{'data/sync-recovery.json':encode(syncRecovery)}:{}) };
  for (const [id, world] of Object.entries(worlds)) {
    if (!uuid.test(id)) throw new StorageError('VALIDATION_FAILED', '共通世界snapshot IDが不正です。', id);
    files[`worlds/${id}.json`] = encode(checkedProject(world, `worlds/${id}.json`, ARCHIVE_LIMITS, worldContents));
  }
  if(dictionary)files['data/records.json']=jsonBytes({records:dictionary.records,arrays:dictionary.arrays});
  if (mode === 'embedded') {
    for (const metadata of attachments) {
      checkCancelled(options.signal);
      if (files[metadata.assetPath]) continue;
      const bytes = await options.loadAsset?.(metadata.contentHash);
      if (!bytes) throw new StorageError('ASSET_MISSING', '完全保存に必要な添付bytesが取得されていません。', metadata.assetPath);
      validateAsset(metadata.assetPath, metadata.mediaType, bytes);
      if (bytes.byteLength !== metadata.byteSize || await sha256(bytes) !== metadata.contentHash) throw new StorageError('HASH_MISMATCH', '素材bytesと保存メタデータが一致しません。', metadata.assetPath);
      files[metadata.assetPath] = bytes;
      options.onProgress?.({stage:'serializing',completed:Object.keys(files).filter(path=>path.startsWith('assets/')).length,total:attachments.length});
    }
  } else if (mode !== 'metadata_only') throw new StorageError('FORMAT_UNSUPPORTED', '出力プロファイルが未対応です。');
  let total = 0;
  const budget = { objects: 0 };
  const manifestFiles: ManifestFile[] = [];
  for (const [path, data] of Object.entries(files)) {
    const role = path === 'data/project.json' ? 'project' : path === 'data/recovery.json' ? 'recovery' : path === 'data/sync-recovery.json'?'sync_recovery':path==='data/records.json'?'record_dictionary': path.startsWith('worlds/') ? 'world' : 'asset';
    if (data.byteLength > (role === 'asset' ? ARCHIVE_LIMITS.assetBytes : ARCHIVE_LIMITS.jsonBytes)
      || (total += data.byteLength) > ARCHIVE_LIMITS.expandedBytes) throw new StorageError('LIMIT_EXCEEDED', '出力サイズが安全上限を超えています。分割や軽量出力を選んでください。', path);
    manifestFiles.push({ path, byteSize: data.byteLength, sha256: await sha256(data), role });
    if (role !== 'asset') parseStrictJson(data, path, ARCHIVE_LIMITS, budget);
  }
  const sharedReviews=hasSharedReviewSource([project,...operationalImages,...Object.values(worlds)]);
  const manifest: ScenarioManifest = { format: 'scenario-package', formatVersion: FORMAT_VERSION, projectId: project.projectId,
    snapshotId: options.snapshotId ?? newId(), exportedAt: options.exportedAt ?? new Date().toISOString(), assetMode: mode,
    files: manifestFiles, minimumReaderVersion: FORMAT_VERSION, ...((recovery||syncRecovery||dictionary||sharedReviews)?{requiredFeatures:[...(recovery?['portable-recovery-v1']:[]),...(syncRecovery?['native-sync-recovery-v1']:[]),...(dictionary?[RECORD_DICTIONARY_FEATURE]:[]),...(sharedReviews?['shared-review-source-v1']:[])]}:{}) };
  // Validate metadata created from optional caller parameters, and count the manifest in all quotas.
  parseManifest(manifest);
  files['manifest.json'] = jsonBytes(manifest);
  parseStrictJson(files['manifest.json'], 'manifest.json', ARCHIVE_LIMITS, budget);
  if (Object.keys(files).length > ARCHIVE_LIMITS.files || total + files['manifest.json'].length > ARCHIVE_LIMITS.expandedBytes) throw new StorageError('LIMIT_EXCEEDED', '出力のファイル数または全bytesが上限を超えています。');
  checkCancelled(options.signal);
  options.onProgress?.({stage:'compressing',completed:0,total:1});
  const bytes = zipSync(files, { level: 6 });
  if (bytes.byteLength > ARCHIVE_LIMITS.compressedBytes) throw new StorageError('LIMIT_EXCEEDED', '圧縮後の出力が64 MiBを超えています。分割や軽量出力を選んでください。');
  return bytes;
}

function hasSharedReviewSource(projects:ProjectData[]):boolean{
 const seen=new WeakSet<object>();const walk=(value:unknown):boolean=>{if(!value||typeof value!=='object'||seen.has(value))return false;seen.add(value);const item=value as Record<string,unknown>;if(item.kind==='review'&&item.data&&typeof item.data==='object'&&(item.data as Record<string,unknown>).sharedSource)return true;return Object.values(value).some(walk);};return projects.some(walk);
}
