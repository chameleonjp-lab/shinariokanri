import { describe, expect, it } from 'vitest';
import { createEntity, createProject, textToRichText, validateProject } from '../src/domain/model';
import { exportProject, GENERIC_RUNTIME_PROFILE, RUNTIME_EXPORT_TARGETS, runtimeExportProfileForTarget, type ExportProfile } from '../src/domain/exports';
import { jsonBytes, sha256 } from '../src/storage/json';
import type { ExportResult } from '../src/domain/exports';

function fixture(inputType = 'boolean', outputType = 'boolean') {
  const project = createProject('PRIVATE_TARGET_PROJECT');
  const scene = createEntity(project.projectId, 'scene', 'PRIVATE_SCENE', { body: textToRichText('PRIVATE_MANUSCRIPT') });
  const contract = createEntity(project.projectId, 'external_contract', 'PRIVATE_CONTRACT', { key: 'private-command', owner: 'game', inputType, outputType, missingPolicy: 'block' });
  const entry = createEntity(project.projectId, 'flow_node', 'PRIVATE_ENTRY', { nodeType: 'entry', sceneId: scene.id, gate: { op: 'external', contractId: contract.id } });
  const end = createEntity(project.projectId, 'flow_node', 'PRIVATE_END', { nodeType: 'terminal', terminalReason: 'PRIVATE_REASON' });
  const edge = createEntity(project.projectId, 'flow_edge', 'PRIVATE_EDGE', { fromId: entry.id, toId: end.id, edgeType: 'automatic' });
  const graph = createEntity(project.projectId, 'flow_graph', 'PRIVATE_GRAPH', { nodeIds: [entry.id, end.id], edgeIds: [edge.id], entryIds: [entry.id], exitIds: [end.id] });
  const included = [scene, contract, entry, end, edge, graph];
  included.forEach(entity => { entity.status = 'confirmed'; });
  const profile = createEntity(project.projectId, 'projection_profile', 'PRIVATE_PROFILE', { audience: 'reader', publicTitle: '公開本文', publicVersionLabel: '対象の公開版', includedIds: included.map(entity => entity.id), allowedKinds: [...new Set(included.map(entity => entity.kind))], idPolicy: 'preserve', namePolicy: { defaultPolicy: { mode: 'replace', replacement: '公開項目' } }, publicTexts: { [scene.id]: { body: textToRichText('利用者が確認した本文。') }, [contract.id]: { key: 'public-command' }, [end.id]: { terminalReason: '意図した終端' } } });
  const safe = createEntity(project.projectId, 'projection_profile', 'PRIVATE_BODY_PROFILE', { audience: 'reader', publicTitle: '実行しない本文', includedIds: [scene.id], allowedKinds: ['scene'], idPolicy: 'preserve', namePolicy: { defaultPolicy: { mode: 'replace', replacement: '公開本文' } }, publicTexts: { [scene.id]: { body: textToRichText('利用者が確認した本文。') } } });
  profile.status = safe.status = 'confirmed';
  project.entities.push(...included, profile, safe);
  return { project, profile, safe, contract };
}
function failures(result: ExportResult) {
  expect(result.ok).toBe(false);
  expect('artifact' in result).toBe(false);
  expect('artifacts' in result).toBe(false);
  if (result.ok) throw Error('不一致のある実行用出力を生成しました');
  return result.issues;
}
const options = (profile: ExportProfile, projectionProfileId: string, target = 'scenario-runtime') => ({ profile, projectionProfileId, targetRevision: '0', runtimeProfile: runtimeExportProfileForTarget(target) });

describe('declared runtime target compatibility', () => {
  it('declares one implemented runtime and refuses every unimplemented or unknown target in both executable profiles', async () => {
    expect(RUNTIME_EXPORT_TARGETS.filter(target => target.implemented).map(target => target.id)).toEqual(['scenario-runtime']);
    const { project, profile } = fixture();
    const before = JSON.stringify(project);
    for (const target of [...RUNTIME_EXPORT_TARGETS.filter(target => !target.implemented).map(target => target.id), 'unknown-engine']) {
      for (const purpose of ['runtime_json', 'playable_preview'] as const) {
        const result = await exportProject(project, options(purpose, profile.id, target));
        expect(failures(result)).toContainEqual(expect.objectContaining({ code: 'EXPORT_UNSUPPORTED', field: 'runtimeProfile.profileId' }));
        expect(result.preview?.runtimeTarget).toMatchObject({ profileId: target, implemented: false });
      }
    }
    expect(JSON.stringify(project)).toBe(before);
  });

  it('retains source UUID and separate input/output mismatch fields when the public schema also rejects the type', async () => {
    const { project, profile, contract } = fixture('unimplemented-command-v99', 'unimplemented-result-v99');
    expect(validateProject(project).ok).toBe(true);
    const result = await exportProject(project, options('runtime_json', profile.id));
    const issues = failures(result);
    for (const field of ['inputType', 'outputType']) expect(issues).toContainEqual(expect.objectContaining({ code: 'EXPORT_UNSUPPORTED', entityId: contract.id, field }));
    // The projection's independent oneOf guard remains in force, too.
    expect(issues.some(issue => issue.message.includes('この項目は対応先で安全に表せません'))).toBe(true);
  });

  it('preserves generic runtime versions, capabilities, public-only prose and the external-evidence boundary', async () => {
    const { project, profile } = fixture('integer', 'boolean');
    const result = await exportProject(project, options('runtime_json', profile.id));
    expect(result.ok).toBe(true);
    if (!result.ok) throw Error(JSON.stringify(result.issues));
    const payload = JSON.parse(result.artifact.content);
    expect(payload).toMatchObject({ format: 'scenario-runtime', formatVersion: '1.0.0', versionLabel: '対象の公開版', externalEvidence: 'not_included', hashScope: 'public_projection', profile: { profileId: 'scenario-runtime', profileVersion: '1.1.0', schemaVersion: '1.0.0' } });
    expect(payload.profile.supportedEffects).toEqual(GENERIC_RUNTIME_PROFILE.supportedEffects);
    expect(payload.profile.externalContracts).toEqual(GENERIC_RUNTIME_PROFILE.externalContracts);
    expect(payload.contentVersionId).toMatch(/^sha256:[a-f0-9]{64}$/);
    expect(payload.runtimeProjectHash).toMatch(/^[a-f0-9]{64}$/);
    expect(result.artifact.content).not.toContain('PRIVATE');
    expect(result.artifact.content).not.toContain('runtimeTarget');
    expect(result.preview.runtimeTarget).toMatchObject({ profileId: 'scenario-runtime', implemented: true });
  });

  it('only generates the explicitly chosen body-only reader scope and never silently falls back from a failed runtime', async () => {
    const { project, profile, safe, contract } = fixture('unimplemented-command-v99');
    const before = JSON.stringify(project);
    failures(await exportProject(project, options('runtime_json', profile.id)));
    const runtimeWithoutGraph = await exportProject(project, options('runtime_json', safe.id));
    expect(failures(runtimeWithoutGraph).some(issue => issue.entityId === contract.id)).toBe(false);
    const reader = await exportProject(project, options('reader', safe.id, 'unity'));
    expect(reader.ok).toBe(true);
    if (!reader.ok) throw Error(JSON.stringify(reader.issues));
    expect(reader.artifact.filename).toBe('reader.md');
    expect(reader.artifact.content).toContain('利用者が確認した本文。');
    expect(reader.artifact.content).not.toContain(contract.id);
    expect(reader.artifact.content).not.toContain('PRIVATE');
    expect(reader.preview.runtimeTarget).toBeUndefined();
    expect(JSON.stringify(project)).toBe(before);
  });

  it('retains the existing specification/version and unknown-capability guards', async () => {
    const { project, profile } = fixture();
    for (const runtimeProfile of [
      { ...GENERIC_RUNTIME_PROFILE, profileVersion: '99.0.0' },
      { ...GENERIC_RUNTIME_PROFILE, schemaVersion: '99.0.0' as '1.0.0' },
      { ...GENERIC_RUNTIME_PROFILE, supportedEffects: [...GENERIC_RUNTIME_PROFILE.supportedEffects, 'run_external_code'] },
    ]) failures(await exportProject(project, { ...options('runtime_json', profile.id), runtimeProfile }));
    const wrongVersion = await exportProject(project, { ...options('runtime_json', profile.id, 'unity'), targetRevision: '999' });
    expect(failures(wrongVersion).some(issue => issue.message.includes('選択した版と出力元の版'))).toBe(true);
    profile.data.includeAuthorNotes = true;
    expect(failures(await exportProject(project, options('runtime_json', profile.id))).some(issue => issue.code === 'FORBIDDEN')).toBe(true);
  });

  it('checks the selected immutable edition rather than later live external contracts, and still rejects a corrupt pin', async () => {
    const { project, profile, contract } = fixture();
    const { snapshots: _snapshots, history: _history, ...content } = structuredClone(project);
    const snapshotId = '00000000-0000-4000-8000-000000002020';
    project.snapshots.push({ id: snapshotId, content, contentHash: await sha256(jsonBytes(content)), createdAt: '2026-10-11T00:00:00.000Z', versionLabel: '互換な元の固定版' });
    contract.data.inputType = 'unimplemented-command-v99';
    project.revision = '1';
    const request = { profile: 'runtime_json' as const, projectionProfileId: profile.id, targetVersionId: snapshotId, runtimeProfile: runtimeExportProfileForTarget('scenario-runtime') };
    const old = await exportProject(project, request);
    expect(old.ok).toBe(true);
    if (!old.ok) throw Error(JSON.stringify(old.issues));
    expect(JSON.parse(old.artifact.content).externalContracts[0].data.inputType).toBe('boolean');
    expect(old.preview.sourceVersionId).toBe(snapshotId);
    project.snapshots[0].contentHash = '0'.repeat(64);
    expect(failures(await exportProject(project, request)).some(issue => issue.message.includes('hash'))).toBe(true);
  });
});
