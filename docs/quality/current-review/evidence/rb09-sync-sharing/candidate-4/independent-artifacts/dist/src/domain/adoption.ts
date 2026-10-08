import type { Status, TruthValue } from './types';

/** A draft may be shown to its author without contributing a current fact. */
export function adoptedRecord(record: { deletedAt?: string | null; status?: string }): boolean {
  return !record.deletedAt && record.status !== 'rejected' && record.status !== 'alternate';
}
export function adoptionAssessment(record: { deletedAt?: string | null; status?: Status }, assessment: { value: TruthValue; reasons: string[] }) {
  if (!adoptedRecord(record)) return { value: 'false' as const, reasons: ['不採用または別案の情報です。'] };
  if (assessment.value !== 'false' && (record.status === 'provisional' || record.status === 'needs_review')) return { value: 'unknown' as const, reasons: [...assessment.reasons, record.status === 'provisional' ? '仮の情報です。' : '採用の確認が必要です。'] };
  return assessment;
}
