/** Diagnostics are user-exported metadata; never accept a payload, text, or error stack. */
export type DiagnosticCode = 'VALIDATION_FAILED' | 'REFERENCE_INVALID' | 'LOCAL_SAVE_FAILED' | 'QUOTA_EXCEEDED' | 'SYNC_CONFLICT' | 'AUTH_REQUIRED' | 'FORBIDDEN' | 'FORMAT_UNSUPPORTED' | 'INTEGRITY_FAILED' | 'IMPORT_LIMIT' | 'ANALYSIS_LIMIT' | 'EXPORT_UNSUPPORTED';
const codes: readonly DiagnosticCode[] = ['VALIDATION_FAILED','REFERENCE_INVALID','LOCAL_SAVE_FAILED','QUOTA_EXCEEDED','SYNC_CONFLICT','AUTH_REQUIRED','FORBIDDEN','FORMAT_UNSUPPORTED','INTEGRITY_FAILED','IMPORT_LIMIT','ANALYSIS_LIMIT','EXPORT_UNSUPPORTED'];
export function createDiagnostic(code: DiagnosticCode, operationId?: string, revision?: string) {
  if (!codes.includes(code)) throw new Error('Unknown diagnostic code');
  if (operationId !== undefined && !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(operationId)) throw new Error('Invalid operation ID');
  if (revision !== undefined && !/^(0|[1-9]\d*)$/.test(revision)) throw new Error('Invalid revision');
  return {schemaVersion:'1.0.0',code,operationId:operationId ?? null,revision:revision ?? null,environment:'browser',recordedAt:new Date().toISOString()};
}
