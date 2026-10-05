import type { CheckpointData, ProjectData, TraceData, ValidationIssue } from './types';
import type { RuntimeTraceExtensions } from './runtimeContracts';
import { presentContent } from './presentation';
import { canonicalJson } from '../storage/json';
import { validateExternalInput } from './externalInputs';
import { resolvePinnedWorlds } from './pinnedWorlds';
import type { ProjectValidationOptions } from './model';

/** Model/import hook: chapter evidence is verified by the same shared presentation engine. */
export function validateReadingTraceRecord(content: ProjectData, trace: TraceData & RuntimeTraceExtensions, checkpoint: CheckpointData, path = 'trace', options: Pick<ProjectValidationOptions, 'worldSnapshots'> = {}): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  const fail = (field: string, message: string, code: ValidationIssue['code'] = 'VALIDATION_FAILED') => issues.push({ code, path: `${path}.${field}`, message });
  if (trace.mode !== 'chapters') { if (trace.readingPath) fail('readingPath', '章の提示経路はmode:chaptersの記録に指定してください。'); return issues; }
  const reading = trace.readingPath;
  if (!reading) { fail('readingPath', '章読み通し記録に提示経路がありません。'); return issues; }
  const closure = resolvePinnedWorlds(content, options.worldSnapshots ?? {});
  if (closure.errors.length) fail('worldReferences', closure.errors[0]!, 'REFERENCE_INVALID');
  const referenceEntities = closure.worlds.flatMap(world => world.entities);
  issues.push(...validateExternalInput(content, trace.initialExternalValues ?? {}).map(issue => ({ ...issue, path: `${path}.initialExternalValues.${issue.path}` })));
  if (trace.steps.length) fail('steps', '章読み通しにフロー遷移を混在させられません。');
  if (trace.contentVersionId !== checkpoint.contentVersionId || checkpoint.runtimeState.contentVersionId !== trace.contentVersionId) fail('contentVersionId', '開始状態と読み通しの固定版が一致しません。');
  if (trace.contentRevision !== content.revision || checkpoint.contentRevision !== content.revision) fail('contentRevision', '章読み通しには開始状態と内容版に一致する更新番号が必要です。');
  if (checkpoint.origin !== 'partial' || checkpoint.runtimeState.presentationPosition !== null) fail('startCheckpointId', '章読み通しの開始状態はフロー位置を持たない途中開始です。');
  if (reading.occurrences.length > reading.sceneIds.length) fail('readingPath.occurrences', '実際の提示数が計画した場面数を超えています。');
  const occurrenceIds = new Set<string>(); let expected = checkpoint.runtimeState;
  for (const [index, occurrence] of reading.occurrences.entries()) {
    const current = `readingPath.occurrences[${index}]`;
    if (!occurrence.occurrenceId.trim() || occurrenceIds.has(occurrence.occurrenceId)) fail(`${current}.occurrenceId`, '提示の識別子が空か重複しています。'); occurrenceIds.add(occurrence.occurrenceId);
    if (occurrence.entityId !== reading.sceneIds[index]) fail(`${current}.entityId`, '提示した場面が計画した場面の順序と一致しません。');
    if (occurrence.before.contentVersionId !== trace.contentVersionId || occurrence.after.contentVersionId !== trace.contentVersionId || occurrence.before.presentationPosition !== null || occurrence.after.presentationPosition !== null) fail(current, '提示状態の内容版またはフロー位置が不正です。');
    if (canonicalJson(occurrence.before) !== canonicalJson(expected)) fail(`${current}.before`, '提示状態が開始状態または直前の提示とつながりません。', 'INTEGRITY_FAILED');
    if (canonicalJson(occurrence.externalValues ?? {}) !== canonicalJson(trace.initialExternalValues ?? {})) fail(`${current}.externalValues`, '章読み通し中に、記録した外部入力を未記録の操作で変更できません。', 'INTEGRITY_FAILED');
    const replay = presentContent(content, occurrence.before, { sceneId: occurrence.entityId, externalValues: occurrence.externalValues ?? trace.initialExternalValues ?? {}, referenceEntities });
    if (!replay.ok) for (const issue of replay.issues) issues.push({ ...issue, path: `${path}.${current}.${issue.path}` });
    else {
      if (canonicalJson(replay.state) !== canonicalJson(occurrence.after)) fail(`${current}.after`, '記録した提示後の状態と共通エンジンの結果が一致しません。', 'INTEGRITY_FAILED');
      if (canonicalJson(replay.conditions) !== canonicalJson(occurrence.conditionResults)) fail(`${current}.conditionResults`, '提示時の条件根拠が不足・重複・矛盾しています。', 'INTEGRITY_FAILED');
    }
    expected = occurrence.after;
  }
  return issues;
}
