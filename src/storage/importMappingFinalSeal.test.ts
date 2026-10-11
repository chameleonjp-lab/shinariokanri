import { expect, it } from 'vitest';
import { createEntity, createProject, newId, textToRichText } from '../domain/model';
import { createWorldSnapshot } from '../domain/world';
import { appendAlternativeVersion, forkAuthorAlternative, projectContent } from '../domain/writingWorkspace';
import { sealAuthorAlternative } from '../domain/authorAlternativeIntegrity';
import { validateProjectIntegrity } from '../domain/projectRecordValidation';
import type { CommandRecord, ContentState, Entity, ProjectContent, ProjectData, ProjectSnapshot } from '../domain/types';
import type { PreparedScenario } from './archiveData';
import { collectImportIds, planCrossProjectImport } from './importMapping';
import { jsonBytes, sha256 } from './json';

it('seals every mapped current and historical branch after rewriting its real immutable snapshot reference without changing either input', async () => {
  let source = createProject('公開版を参照する別案');
  const note = createEntity(source.projectId, 'note', '元の原稿', { body: textToRichText('原本文😀') });
  note.data.body[0].text = `原本文😀 識別文字列 ${note.id} は文章です。`;
  source.entities = [note];
  // The pin captures the note before its snapshot metadata is added. Neither
  // the immutable pin nor a branch ProjectContent can contain its own pin.
  source = await createWorldSnapshot(source, '先に確定した公開版');
  const originalPin = source.snapshots[0];
  const snapshotRecord = source.entities.find((entity): entity is Entity<'snapshot'> => entity.kind === 'snapshot' && entity.id === originalPin.id)!;
  const firstBranch = await sealAuthorAlternative(forkAuthorAlternative(source, '公開版からの別案', {
    snapshotId: originalPin.id, now: originalPin.createdAt,
  }));
  const changedAt = new Date(Date.parse(originalPin.createdAt) + 1).toISOString();
  // The second branch version references the already existing immutable pin
  // through its normal snapshot entity and genuine contentHash.
  const nextBranch = await sealAuthorAlternative(appendAlternativeVersion(firstBranch, projectContent(source), '既存の公開版を参照', changedAt));
  const beforeProject: ProjectData = { ...source, authorAlternatives: [firstBranch] };
  const afterProject: ProjectData = { ...source, revision: '1', authorAlternatives: [nextBranch] };
  const { history: _beforeHistory, ...before } = beforeProject;
  const { history: _afterHistory, ...after } = afterProject;
  const command: CommandRecord = {
    operationId: newId(), projectId: source.projectId, baseRevision: '0', revision: '1',
    targetIds: [source.projectId], reason: '作者別案へ既存の公開版参照を追加', createdAt: changedAt,
    before, after,
  };
  source = { ...afterProject, history: [command] };
  expect(await validateProjectIntegrity(source)).toEqual([]);

  // Exercise the pure prepared-data planner, with actual JSON metadata. This
  // test does not repeat archive or native-clone acceptance operations.
  const sourceBytes = jsonBytes(source), sourceHash = await sha256(sourceBytes);
  const prepared: PreparedScenario = {
    project: source, worlds: {}, assets: [], warnings: [],
    manifest: {
      format: 'scenario-package', formatVersion: source.formatVersion, minimumReaderVersion: source.formatVersion,
      projectId: source.projectId, snapshotId: newId(), exportedAt: changedAt, assetMode: 'embedded',
      files: [{ path: 'data/project.json', byteSize: sourceBytes.byteLength, sha256: sourceHash, role: 'project' }],
    },
    summary: { name: source.name, entities: source.entities.length, relations: source.relations.length, assetBytes: 0, missingAssets: 0, history: source.history.length },
  };
  const target = createProject('統合先');
  const idMap = Object.fromEntries(collectImportIds(source).map(({ id }) => [id, id === source.projectId ? target.projectId : newId()]));
  const originalInputs = structuredClone({ prepared, target, idMap });
  const plan = await planCrossProjectImport(prepared, target, { idMap, resolutions: { 'project.name': 'existing' } });
  const mapped = plan.mappedProject;

  // Expected contents are built from this small declared fixture, separately
  // from the mapper. Ordinary text containing an old UUID stays ordinary text.
  const mappedNote: Entity<'note'> = {
    ...structuredClone(note), id: idMap[note.id], projectId: target.projectId,
    data: { ...structuredClone(note.data), body: note.data.body.map(block => ({ ...structuredClone(block), id: idMap[block.id] })) },
  };
  const expectedFixedContent: ProjectContent = {
    ...structuredClone(originalPin.content), projectId: target.projectId, entities: [mappedNote],
  };
  const expectedPinHash = await sha256(jsonBytes(expectedFixedContent));
  expect(expectedPinHash).not.toBe(originalPin.contentHash);
  const expectedPin: ProjectSnapshot = {
    ...structuredClone(originalPin), id: idMap[originalPin.id], content: expectedFixedContent, contentHash: expectedPinHash,
  };
  const mappedSnapshotRecord: Entity<'snapshot'> = {
    ...structuredClone(snapshotRecord), id: idMap[originalPin.id], projectId: target.projectId,
    data: { ...structuredClone(snapshotRecord.data), contentHash: expectedPinHash },
  };
  const expectedReferencingContent: ProjectContent = {
    ...expectedFixedContent, entities: [mappedNote, mappedSnapshotRecord],
  };
  const expectedFirstBranch = await sealAuthorAlternative({
    ...structuredClone(firstBranch), id: idMap[firstBranch.id], projectId: target.projectId,
    sourceSnapshotId: idMap[originalPin.id], baseContent: expectedFixedContent,
    headVersionId: idMap[firstBranch.headVersionId],
    versions: firstBranch.versions.map(version => ({ ...structuredClone(version), id: idMap[version.id], parentVersionId: null, content: expectedFixedContent })),
  });
  const expectedNextBranch = await sealAuthorAlternative({
    ...structuredClone(nextBranch), id: idMap[nextBranch.id], projectId: target.projectId,
    sourceSnapshotId: idMap[originalPin.id], baseContent: expectedFixedContent,
    headVersionId: idMap[nextBranch.headVersionId],
    versions: nextBranch.versions.map(version => ({
      ...structuredClone(version), id: idMap[version.id], parentVersionId: version.parentVersionId ? idMap[version.parentVersionId] : null,
      content: version.id === nextBranch.versions[0].id ? expectedFixedContent : expectedReferencingContent,
    })),
  });
  const expectedBefore: ContentState = {
    ...structuredClone(before), projectId: target.projectId,
    entities: [mappedNote, mappedSnapshotRecord], snapshots: [expectedPin], authorAlternatives: [expectedFirstBranch],
  };
  const expectedAfter: ContentState = {
    ...structuredClone(after), projectId: target.projectId,
    entities: [mappedNote, mappedSnapshotRecord], snapshots: [expectedPin], authorAlternatives: [expectedNextBranch],
  };
  const expectedCommand: CommandRecord = {
    ...structuredClone(command), operationId: idMap[command.operationId], projectId: target.projectId,
    targetIds: command.targetIds.map(id => idMap[id]), before: expectedBefore, after: expectedAfter,
  };
  const expected: ProjectData = {
    ...structuredClone(source), projectId: target.projectId,
    entities: [mappedNote, mappedSnapshotRecord], snapshots: [expectedPin],
    authorAlternatives: [expectedNextBranch], history: [expectedCommand],
  };
  // Full equality includes every current/history field, all branch version and
  // integrity hashes, labels, timestamps, source pin, IDs and command metadata.
  expect(mapped).toEqual(expected);
  expect(mapped.authorAlternatives![0].versions[1].content.entities.find(entity => entity.kind === 'snapshot')?.data).toEqual(mappedSnapshotRecord.data);
  expect(await validateProjectIntegrity(mapped)).toEqual([]);
  expect(plan.sourceContentHash).toBe(sourceHash);
  expect(plan.unresolved).toEqual([]);
  expect(plan.candidate?.history).toBe(target.history);
  expect({ prepared, target, idMap }).toEqual(originalInputs);
  expect(await sha256(jsonBytes(source))).toBe(sourceHash);

  // A local editing probe is discarded. It must not rewrite an input, fixed
  // content or the independently mapped historical before/after images.
  const draftNote = mapped.entities.find((entity): entity is Entity<'note'> => entity.kind === 'note')!;
  draftNote.data.body[0].text = 'この返却草稿だけを編集';
  expect(mapped.history[0].before.entities.find((entity): entity is Entity<'note'> => entity.kind === 'note')!.data.body[0].text).toBe(note.data.body[0].text);
  expect(mapped.history[0].after.entities.find((entity): entity is Entity<'note'> => entity.kind === 'note')!.data.body[0].text).toBe(note.data.body[0].text);
  expect(mapped.snapshots[0].content.entities.find((entity): entity is Entity<'note'> => entity.kind === 'note')!.data.body[0].text).toBe(note.data.body[0].text);
  expect({ prepared, target, idMap }).toEqual(originalInputs);
});
