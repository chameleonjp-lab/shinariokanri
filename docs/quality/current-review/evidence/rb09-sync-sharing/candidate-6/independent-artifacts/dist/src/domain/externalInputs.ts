import type { Entity, ID, ProjectData, TypedValue, ValidationIssue } from './types';
import { validateTypedValue, validateVariableValue } from './model';
import { adoptedRecord } from './adoption';

export interface ExternalInputOptions { mode: 'actual'; receiptHash: string }
/** Values retain their declared types. Missing or invalid external input is never coerced to false. */
export function validateExternalInput(project: ProjectData, values: Record<ID, TypedValue>, options?: ExternalInputOptions, referenceEntities: Entity[] = []): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  const entities = [...project.entities, ...referenceEntities].filter(adoptedRecord);
  if (options && (options.mode !== 'actual' || !/^[0-9a-f]{64}$/.test(options.receiptHash))) issues.push({ code: 'INTEGRITY_FAILED', path: 'receiptHash', message: '実際の外部入力には検証済み受信記録のSHA-256が必要です。' });
  for (const [id, value] of Object.entries(values)) {
    const path = `externalValues.${id}`, contract = entities.find((entity): entity is Entity<'external_contract'> => entity.id === id && entity.kind === 'external_contract');
    if (!contract) { issues.push({ code: 'REFERENCE_INVALID', path, message: '入力先の外部契約が存在しないか、削除・不採用です。' }); continue; }
    const valid = validateTypedValue(value); if (!valid.ok) { issues.push(...valid.issues.map(issue => ({ ...issue, path }))); continue; }
    if (value.type !== 'unknown' && value.type !== contract.data.outputType) { issues.push({ code: 'VALIDATION_FAILED', path, message: '実際の外部値と契約の出力型が違います。' }); continue; }
    if (value.type === 'unknown' && contract.data.missingPolicy === 'block') issues.push({ code: 'CONDITION_UNKNOWN', path, message: value.reason || 'この外部契約は未確認値で進められません。' });
    for (const variable of entities) if (variable.kind === 'variable' && variable.data.externalContractId === id) issues.push(...validateVariableValue(variable, value, path, true));
  }
  return issues;
}
