import { describe, expect, it } from 'vitest';
import { createEntity, createProject, validateProject } from './model';
import type { ProjectContent, ProjectData } from './types';
import {
  appendAlternativeVersion,
  diffAuthorAlternative,
  forkAuthorAlternative,
  projectContent,
  recordAlternativeApplication,
  applyAlternativeChanges,
} from './writingWorkspace';
import { sealAuthorAlternative, validateAuthorAlternatives } from './authorAlternativeIntegrity';

function validateContent(content: ProjectContent) {
  const result = validateProject({ ...structuredClone(content), snapshots: [], history: [] } as ProjectData);
  return { ok: result.ok, issues: result.ok ? [] : result.issues };
}

describe('author alternative integrity', () => {
  it('seals independent branch content, parent order, structure assignments, and the complete branch digest', async () => {
    const project = createProject('別案保存');
    const scene = createEntity(project.projectId, 'scene', '正本の場面');
    const chapter = createEntity(project.projectId, 'chapter', '第一章', { sceneIds: [scene.id] });
    scene.data.chapterId = chapter.id;
    project.entities = [chapter, scene];
    const branch = forkAuthorAlternative(project, '別展開', { now: '2026-01-01T00:00:00.000Z' });
    const branchContent = projectContent(branch.versions[0]!.content);
    const branchScene = branchContent.entities.find(entity => entity.id === scene.id && entity.kind === 'scene');
    if (branchScene?.kind === 'scene') branchScene.name = '別案の場面';
    const plan = { chapterId: chapter.id, templateId: 'custom', beatLabels: ['発端'], assignments: { 発端: scene.id } };
    const nextBranch = appendAlternativeVersion(branch, branchContent, '場面変更', '2026-01-02T00:00:00.000Z', undefined, plan);
    const sealed = await sealAuthorAlternative(nextBranch);
    const checks: string[] = [];
    const issues = await validateAuthorAlternatives(project.projectId, [sealed], { validateContent: content => { checks.push(content.projectId); return validateContent(content); } });
    expect(issues).toEqual([]);
    expect(checks).toHaveLength(3); // base + both version images, each with its own entity/reference index
    expect(sealed.integrityHash).toMatch(/^[0-9a-f]{64}$/);
    expect(sealed.versions.every(version => version.contentHash?.match(/^[0-9a-f]{64}$/))).toBe(true);
  });

  it('rejects recursive branch data, missing parents, cycles, and stale branch hashes', async () => {
    const project = createProject('別案の破損検査');
    const branch = forkAuthorAlternative(project, '循環案', { now: '2026-02-01T00:00:00.000Z' });
    const child = appendAlternativeVersion(branch, projectContent(project), '子版', '2026-02-02T00:00:00.000Z');
    const cyclic = structuredClone(child);
    cyclic.versions[0]!.parentVersionId = cyclic.versions[1]!.id;
    const sealedCycle = await sealAuthorAlternative(cyclic);
    const cycleIssues = await validateAuthorAlternatives(project.projectId, [sealedCycle], { validateContent });
    expect(cycleIssues.some(issue => issue.message.includes('親のない開始版'))).toBe(true);
    expect(cycleIssues.some(issue => issue.message.includes('循環'))).toBe(true);

    const stale = structuredClone(await sealAuthorAlternative(branch));
    stale.name = '改ざん後';
    const staleIssues = await validateAuthorAlternatives(project.projectId, [stale], { validateContent });
    expect(staleIssues.some(issue => issue.path.endsWith('integrityHash'))).toBe(true);

    const recursive = structuredClone(stale);
    (recursive.baseContent as unknown as Record<string, unknown>).authorAlternatives = [{ id: 'nested-branch' }];
    const recursiveIssues = await validateAuthorAlternatives(project.projectId, [recursive], { validateContent });
    expect(recursiveIssues.some(issue => issue.path.includes('baseContent.authorAlternatives'))).toBe(true);
  });

  it('records adopted change keys and canonical revision in the immutable adoption receipt', async () => {
    const project = createProject('採用記録');
    const scene = createEntity(project.projectId, 'scene', '元の場面');
    project.entities = [scene];
    const branch = forkAuthorAlternative(project, '採用候補', { now: '2026-03-01T00:00:00.000Z' });
    const branchContent = projectContent(project);
    const branchScene = branchContent.entities.find(entity => entity.id === scene.id && entity.kind === 'scene');
    if (branchScene?.kind === 'scene') branchScene.name = '採用する場面';
    const edited = appendAlternativeVersion(branch, branchContent, '名称変更', '2026-03-02T00:00:00.000Z');
    const changes = diffAuthorAlternative(edited, project);
    const rename = changes.find(change => change.label.includes('name'))!;
    const adopted = applyAlternativeChanges(project, edited, changes, new Set([rename.key]), '2026-03-03T00:00:00.000Z');
    const recorded = recordAlternativeApplication(edited, adopted.receipt, '1');
    const sealed = await sealAuthorAlternative(recorded);
    const issues = await validateAuthorAlternatives(project.projectId, [sealed], { validateContent });
    expect(issues).toEqual([]);
    expect(sealed.applyReceipts[0]).toMatchObject({ alternativeVersionId: edited.headVersionId, selectedChangeKeys: [rename.key], fromCanonicalRevision: '0', appliedRevision: '1' });
  });
});
