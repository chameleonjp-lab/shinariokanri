import type { DomainErrorCode } from '../domain/types';

export type StorageErrorCode =
  | 'VALIDATION_FAILED' | 'REVISION_CONFLICT' | 'OPERATION_CONFLICT'
  | 'NOT_FOUND' | 'SAVE_FAILED' | 'QUOTA_EXCEEDED' | 'IMMUTABLE_SNAPSHOT' | 'RESTORE_CONFLICT'
  | 'PENDING_CHANGES' | 'IMPORT_CONFLICT' | 'FORMAT_UNSUPPORTED'
  | 'ARCHIVE_INVALID' | 'UNSAFE_PATH' | 'LIMIT_EXCEEDED' | 'HASH_MISMATCH'
  | 'ASSET_MISSING' | 'ASSET_INVALID' | 'CANCELLED';

/** Errors retain a code and an affected path so the UI can keep the draft and explain recovery. */
export class StorageError extends Error {
  constructor(
    public readonly code: StorageErrorCode,
    message: string,
    public readonly path?: string,
    options?: ErrorOptions,
  ) {
    super(message, options);
    this.name = 'StorageError';
  }
}

export function checkCancelled(signal?: AbortSignal): void {
  if (signal?.aborted) throw new StorageError('CANCELLED', '処理を取り消しました。既存の作品は変更していません。');
}

export function saveError(error: unknown): StorageError {
  if (error instanceof StorageError) return error;
  const quota = error instanceof Error && /quota/i.test(error.name + error.message);
  return new StorageError(quota ? 'QUOTA_EXCEEDED' : 'SAVE_FAILED', quota
    ? '保存容量が不足しています。入力を保持して完全ファイルへ書き出すか、容量を確保して再試行してください。'
    : '端末内への保存に失敗しました。入力を保持して再試行してください。', undefined, { cause: error });
}

/** Stable domain codes are available alongside the more specific storage diagnostics. */
export function canonicalCode(error: unknown): DomainErrorCode {
  if (!(error instanceof StorageError)) return 'LOCAL_SAVE_FAILED';
  switch (error.code) {
    case 'SAVE_FAILED': return 'LOCAL_SAVE_FAILED';
    case 'QUOTA_EXCEEDED': return 'QUOTA_EXCEEDED';
    case 'FORMAT_UNSUPPORTED': return 'FORMAT_UNSUPPORTED';
    case 'LIMIT_EXCEEDED': return 'IMPORT_LIMIT';
    case 'ARCHIVE_INVALID': case 'UNSAFE_PATH': case 'HASH_MISMATCH': case 'ASSET_INVALID': case 'ASSET_MISSING': return 'INTEGRITY_FAILED';
    case 'REVISION_CONFLICT': case 'OPERATION_CONFLICT': case 'RESTORE_CONFLICT': case 'PENDING_CHANGES': case 'IMPORT_CONFLICT': return 'SYNC_CONFLICT';
    default: return 'VALIDATION_FAILED';
  }
}
