import { mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { describe, expect, it } from 'vitest';
import { createConsultationProposal, exportProject, GENERIC_RUNTIME_PROFILE } from '../src/domain/exports';
import { createEntity, createProject, emptyRuntimeState, validateProject } from '../src/domain/model';
import { createProjection } from '../src/domain/projection';
import { dialogueContentHash } from '../src/domain/production';
import { getTrialChoices, startTrial } from '../src/domain/runtime';
import { canonicalJson, sha256 } from '../src/storage/json';
import { strFromU8, unzipSync } from 'fflate';
import { chromium } from '@playwright/test';
import type { Entity, EntityKind, NamePolicyMap, ProjectData, RichText } from '../src/domain/types';

const id = (value: number) => `00000000-0000-4000-8000-${value.toString(16).padStart(12, '0')}`;
const rich = (value: number, text: string): RichText => [{ id: id(value), kind: 'paragraph', text }];
function fixture() {
  const project = createProject('SECRET_PROJECT_NAME'); project.projectId = id(1);
  const character = createEntity(project.projectId, 'character', 'SECRET_REAL_NAME'); character.id = id(2);
  const variable = createEntity(project.projectId, 'variable', 'SECRET_STATE_NAME', { key: 'SECRET_KEY', valueType: 'boolean', initial: { type: 'boolean', value: false } }); variable.id = id(3);
  const entry = createEntity(project.projectId, 'flow_node', 'SECRET_ENTRY', { nodeType: 'choice', executionPolicy: 'manual_choice' }); entry.id = id(4);
  const terminal = createEntity(project.projectId, 'flow_node', 'SECRET_TERMINAL', { nodeType: 'terminal', terminalReason: 'SECRET_END_REASON' }); terminal.id = id(5);
  const effect = createEntity(project.projectId, 'effect', 'SECRET_EFFECT', { operation: 'set', targetId: variable.id, value: { type: 'boolean', value: true } }); effect.id = id(6);
  const edge = createEntity(project.projectId, 'flow_edge', 'SECRET_EDGE', { fromId: entry.id, toId: terminal.id, label: 'SECRET_LABEL', condition: { op: 'compare', variableId: variable.id, comparator: 'eq', value: { type: 'boolean', value: false } }, effectIds: [effect.id] }); edge.id = id(7);
  const graph = createEntity(project.projectId, 'flow_graph', 'SECRET_GRAPH', { nodeIds: [entry.id, terminal.id], edgeIds: [edge.id], entryIds: [entry.id], exitIds: [terminal.id] }); graph.id = id(8);
  const line = createEntity(project.projectId, 'dialogue_line', '', { text: rich(101, 'SECRET_SOURCE_TEXT'), speakerId: character.id }); line.id = id(9);
  const alternate = createEntity(project.projectId, 'note', 'SECRET_ALTERNATE', { body: rich(102, 'SECRET_REJECTED_TEXT') }); alternate.id = id(10); alternate.status = 'alternate';
  const included = [character, variable, entry, terminal, effect, edge, graph, line];
  const publicLine = rich(201, '扉が開いた。');
  const names: NamePolicyMap = { defaultPolicy: { mode: 'exclude' }, byEntityId: Object.fromEntries(included.map((entity, index) => [entity.id, { mode: 'replace' as const, replacement: `公開情報${index + 1}` }])) };
  const profile = createEntity(project.projectId, 'projection_profile', 'SECRET_PROFILE', {
    audience: 'reader', includedIds: included.map(entity => entity.id), allowedKinds: [...new Set(included.map(entity => entity.kind))], namePolicy: names,
    publicTitle: '霧の門', publicVersionLabel: '第一公開版', idPolicy: 'preserve', publicTexts: {
      [variable.id]: { key: 'has_key' }, [terminal.id]: { terminalReason: '意図した終端' }, [edge.id]: { label: '門を開く' }, [line.id]: { text: publicLine },
    },
  }); profile.id = id(20);
  included.forEach(entity => { entity.status = 'confirmed'; }); profile.status = 'confirmed';
  project.entities = [...included, alternate, profile];
  return { project, profile, character, variable, entry, terminal, effect, edge, graph, line, alternate, publicLine };
}
const options = (profileId: string, profile: Parameters<typeof exportProject>[1]['profile'] = 'reader') => ({ profile, projectionProfileId: profileId, targetRevision: '0' });

describe('purpose-specific export', () => {
  it('requires an exact source version instead of guessing the canonical text', async () => {
    const { project, profile } = fixture();
    for (const variant of [
      { profile: 'reader' as const, projectionProfileId: profile.id },
      { ...options(profile.id), targetRevision: '1' },
      { ...options(profile.id), targetVersionId: id(999) },
    ]) expect((await exportProject(project, variant)).ok).toBe(false);
  });

  it('writes public prose only and keeps author preview details out of the file', async () => {
    const { project, profile, alternate } = fixture();
    const before = JSON.stringify(project);
    const result = await exportProject(project, options(profile.id));
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error(JSON.stringify(result.issues));
    expect(result.artifact.filename).toBe('reader.md');
    expect(result.artifact.content).toContain('扉が開いた。');
    expect(result.artifact.content).not.toContain('SECRET');
    expect(result.artifact.content).not.toContain(alternate.id);
    expect(result.artifact.content).not.toContain('omissions');
    expect(result.artifact.content).not.toContain('idMap');
    expect(result.preview.assetBytesIncluded).toBe(false);
    expect(result.preview.warnings.some(warning => warning.includes('自動'))).toBe(true);
    expect(JSON.stringify(project)).toBe(before);
  });

  it('escapes active text and retains ruby, paragraph IDs and vertical reading in HTML', async () => {
    const { project, profile, publicLine } = fixture();
    publicLine[0].text = '扉<script>alert(1)</script><img src=x onerror=alert(1)>';
    publicLine[0].ruby = [{ start: 0, end: 1, text: '<img onerror=x>' }];
    const result = await exportProject(project, { ...options(profile.id), readerFormat: 'html', writingMode: 'vertical' });
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error('Expected safe HTML');
    expect(result.artifact.content).toContain(`id="${publicLine[0].id}"`);
    expect(result.artifact.content).toContain('writing-mode:vertical-rl');
    expect(result.artifact.content).toContain('<ruby>');
    expect(result.artifact.content).toContain('&lt;script&gt;');
    expect(result.artifact.content).not.toContain('<script>');
    expect(result.artifact.content).not.toContain('<img ');
    expect(result.artifact.content).toContain("default-src 'none'");
  });

  it('reads immutable snapshot content after a later live edit, and verifies its hash', async () => {
    const { project, profile, line } = fixture();
    const { history: _history, snapshots: _snapshots, ...content } = structuredClone(project);
    const snapshotId = id(800);
    project.snapshots.push({ id: snapshotId, versionLabel: '元の版', contentHash: await sha256(new TextEncoder().encode(canonicalJson(content))), createdAt: '2026-10-05T00:00:00Z', content });
    project.revision = '1';
    line.data.text = rich(101, '改訂した作者本文'); profile.data.publicTexts![line.id].text = rich(201, '新しい公開文');
    const old = await exportProject(project, { profile: 'reader', projectionProfileId: profile.id, targetVersionId: snapshotId });
    expect(old.ok && old.artifact.content.includes('扉が開いた。')).toBe(true);
    expect(old.ok && !old.artifact.content.includes('新しい公開文')).toBe(true);
    project.snapshots[0].content.entities[0].name = '改ざん';
    expect((await exportProject(project, { profile: 'reader', projectionProfileId: profile.id, targetVersionId: snapshotId })).ok).toBe(false);
  });

  it('validates pinned private snapshot dependencies without publishing or replacing their content', async () => {
    const { project, profile, line } = fixture();
    const save = async (snapshotId: string) => {
      const { history: _history, snapshots: _snapshots, ...content } = structuredClone(project);
      return { id: snapshotId, versionLabel: 'SECRET_SNAPSHOT_LABEL', contentHash: await sha256(new TextEncoder().encode(canonicalJson(content))), createdAt: '2026-10-05T00:00:00Z', content } satisfies ProjectData['snapshots'][number];
    };
    const first = await save(id(810)); project.snapshots.push(first);
    const checkpoint = createEntity(project.projectId, 'checkpoint', 'SECRET_PRIVATE_CHECKPOINT', { contentVersionId: first.id, runtimeState: emptyRuntimeState(first.id) }); checkpoint.id = id(811);
    project.entities.push(checkpoint);
    const second = await save(id(812)); project.snapshots.push(second);
    expect(validateProject(project).ok).toBe(true);
    expect((await exportProject(project, options(profile.id))).ok).toBe(true);
    profile.data.publicTexts![line.id].text = rich(201, '後日の公開文');
    const unrelated = await save(id(813)); unrelated.content.entities[0].name = '後日の別版変更'; project.snapshots.push(unrelated);
    const exported = await exportProject(project, { profile: 'reader', projectionProfileId: profile.id, targetVersionId: second.id });
    if (!exported.ok) throw new Error(JSON.stringify(exported.issues));
    expect(exported.artifact.content).toContain('扉が開いた。');
    for (const forbidden of ['SECRET', '後日の公開文', first.id, second.id, checkpoint.id, 'snapshots', 'runtimeState']) expect(exported.artifact.content).not.toContain(forbidden);
    first.content.entities[0].name = '依存版の改ざん';
    const rejected = await exportProject(project, { profile: 'reader', projectionProfileId: profile.id, targetVersionId: second.id });
    expect(rejected.ok).toBe(false);
    if (!rejected.ok) expect(rejected.issues.some(issue => issue.entityId === first.id && issue.code === 'VALIDATION_FAILED')).toBe(true);
  });

  it('exports stable generic flow IDs, typed conditions/effects and no author variants', async () => {
    const { project, profile, edge, variable, alternate } = fixture();
    const result = await exportProject(project, options(profile.id, 'runtime_json'));
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error(JSON.stringify(result.issues));
    const payload = JSON.parse(result.artifact.content);
    expect(payload.profile.profileId).toBe('scenario-runtime');
    expect(payload.flow.edges[0].id).toBe(edge.id);
    expect(payload.flow.edges[0].data.condition.variableId).toBe(variable.id);
    expect(payload.effects[0].data.value).toEqual({ type: 'boolean', value: true });
    expect(payload.externalEvidence).toBe('not_included');
    expect(payload.assetBytesIncluded).toBe(false);
    expect(result.artifact.content).not.toContain('SECRET');
    expect(result.artifact.content).not.toContain(alternate.id);
  });

  it('refuses anonymous sequence IDs for production unless stable public IDs are declared', async () => {
    const { project, profile } = fixture(); profile.data.idPolicy = 'remap';
    expect((await exportProject(project, options(profile.id, 'runtime_json'))).ok).toBe(false);
    const projection = createProjection(project, profile.id);
    if (!projection.ok) throw new Error('Expected an author projection');
    profile.data.publicIds = Object.fromEntries(Object.keys(projection.idMap).map((sourceId, index) => [sourceId, id(1000 + index)]));
    const result = await exportProject(project, options(profile.id, 'runtime_json'));
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error(JSON.stringify(result.issues));
    for (const sourceId of Object.keys(projection.idMap)) expect(result.artifact.content).not.toContain(sourceId);
  });

  it('refuses unresolved destinations, unknown conditions, missing effects and unsupported fields', async () => {
    const variants = [fixture(), fixture(), fixture(), fixture(), fixture()];
    variants[0].edge.data.toId = { unresolved: { label: 'SECRET_EXIT', reason: '未完成' } };
    variants[1].edge.data.condition = { op: 'eval', value: 'secret code' } as never;
    variants[2].profile.data.includedIds = variants[2].profile.data.includedIds.filter(value => value !== variants[2].effect.id);
    variants[3].graph.data.parameters = [{ key: 'SECRET_PARAMETER', type: 'integer', default: { type: 'integer', value: 1 } }];
    variants[4].profile.data.allowedFields = { variable: [] };
    for (const { project, profile } of variants) {
      const result = await exportProject(project, options(profile.id, 'runtime_json'));
      expect(result.ok).toBe(false);
      expect('artifact' in result).toBe(false);
    }
  });

  it('refuses unknown initial values, arbitrary external operations and engine adapters', async () => {
    const first = fixture(); first.variable.data.initial = { type: 'unknown', value: null, reason: 'SECRET_MISSING_VALUE' };
    const second = fixture(); second.effect.data.operation = 'run_external_code' as never;
    const third = fixture();
    expect((await exportProject(first.project, options(first.profile.id, 'runtime_json'))).ok).toBe(false);
    expect((await exportProject(second.project, options(second.profile.id, 'runtime_json'))).ok).toBe(false);
    expect((await exportProject(third.project, { ...options(third.profile.id, 'runtime_json'), runtimeProfile: { ...GENERIC_RUNTIME_PROFILE, profileId: 'unity' } })).ok).toBe(false);
  });

  it('remaps enum initial values and comparisons consistently to approved public labels', async () => {
    const { project, profile, variable, edge } = fixture();
    variable.data.valueType = 'enum'; variable.data.initial = { type: 'enum', value: 'SECRET_ENUM_VALUE' }; variable.data.allowed = { values: ['SECRET_ENUM_VALUE', 'SECRET_OTHER_VALUE'] };
    edge.data.condition = { op: 'compare', variableId: variable.id, comparator: 'eq', value: { type: 'enum', value: 'SECRET_ENUM_VALUE' } };
    const effect = project.entities.find((entity): entity is Entity<'effect'> => entity.kind === 'effect')!; effect.data.value = { type: 'enum', value: 'SECRET_OTHER_VALUE' };
    expect((await exportProject(project, options(profile.id, 'runtime_json'))).ok).toBe(false);
    profile.data.publicValues = { [variable.id]: { SECRET_ENUM_VALUE: '未入手', SECRET_OTHER_VALUE: '入手済み' } };
    const result = await exportProject(project, options(profile.id, 'runtime_json'));
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error(JSON.stringify(result.issues));
    const payload = JSON.parse(result.artifact.content);
    expect(payload.variables[0].data.initial).toEqual({ type: 'enum', value: '未入手' });
    expect(payload.flow.edges[0].data.condition.value).toEqual({ type: 'enum', value: '未入手' });
    expect(payload.effects[0].data.value).toEqual({ type: 'enum', value: '入手済み' });
    expect(result.artifact.content).not.toContain('SECRET');
  });

  it('carries external contracts without pretending that a stub is game evidence', async () => {
    const { project, profile, variable, edge } = fixture();
    const contract = createEntity(project.projectId, 'external_contract', 'SECRET_CONTRACT', { key: 'SECRET_BATTLE_KEY', owner: 'game', inputType: 'boolean', outputType: 'boolean', missingPolicy: 'block', stubValues: [] });
    contract.id = id(500); contract.status = 'confirmed'; project.entities.push(contract);
    profile.data.includedIds.push(contract.id); profile.data.allowedKinds!.push('external_contract');
    (profile.data.namePolicy as NamePolicyMap).byEntityId![contract.id] = { mode: 'replace', replacement: '戦闘結果' }; profile.data.publicTexts![contract.id] = { key: 'battle_result' };
    variable.data.externalContractId = contract.id; edge.data.condition = { op: 'external', contractId: contract.id };
    const result = await exportProject(project, options(profile.id, 'runtime_json'));
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error(JSON.stringify(result.issues));
    const payload = JSON.parse(result.artifact.content);
    expect(payload.externalContracts[0].data.owner).toBe('game');
    expect(payload.externalContracts[0].data.missingPolicy).toBe('block');
    expect(payload.externalEvidence).toBe('not_included');
  });

  it('writes translation JSON and Markdown with public content hashes and stale state', async () => {
    const { project, profile, line } = fixture();
    const originalHash = await dialogueContentHash(project, line);
    const translation = createEntity(project.projectId, 'localization', '', { sourceLineId: line.id, language: 'en', sourceHash: originalHash, text: rich(301, 'SECRET_TRANSLATED_TEXT'), stage: 'reviewed' }); translation.id = id(501); translation.status = 'confirmed';
    project.entities.push(translation); profile.data.includedIds.push(translation.id); profile.data.allowedKinds!.push('localization');
    (profile.data.namePolicy as NamePolicyMap).byEntityId![translation.id] = { mode: 'replace', replacement: '英訳' };
    profile.data.publicTexts![translation.id] = { language: 'en', text: rich(302, 'The door opened.') };
    const result = await exportProject(project, options(profile.id, 'localization'));
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error(JSON.stringify(result.issues));
    const payload = JSON.parse(result.artifact.content);
    expect(result.artifacts.map(artifact => artifact.filename)).toEqual(['localization.json', 'localization.md']);
    expect(payload.hashScope).toBe('projected_line');
    expect(payload.lines[0].lineId).toBe(line.id);
    expect(payload.lines[0].sourceHash).toMatch(/^[a-f0-9]{64}$/);
    expect(payload.lines[0].sourceHash).not.toBe(originalHash);
    expect(payload.lines[0].translations[0].stage).toBe('reviewed');
    for (const artifact of result.artifacts) { expect(artifact.content).not.toContain('SECRET'); expect(artifact.content).not.toContain(originalHash); }
    line.data.text = rich(101, 'Changed author source');
    const stale = await exportProject(project, options(profile.id, 'localization'));
    expect(stale.ok && JSON.parse(stale.artifact.content).lines[0].translations[0].stage).toBe('needs_review');
  });

  it('keeps the line ID/hash after reordering records or changing their author display names', async () => {
    const { project, profile, line } = fixture();
    const first = await exportProject(project, options(profile.id, 'localization'));
    project.entities.reverse(); line.name = '作者の新しい識別名';
    const second = await exportProject(project, options(profile.id, 'localization'));
    expect(first.ok && second.ok).toBe(true);
    if (!first.ok || !second.ok) throw new Error('Expected stable localization output');
    const a = JSON.parse(first.artifact.content).lines[0], b = JSON.parse(second.artifact.content).lines[0];
    expect(a.lineId).toBe(b.lineId); expect(a.sourceHash).toBe(b.sourceHash);
  });

  it('keeps secret state values and out-of-scope focus IDs out of manual consultation', async () => {
    const { project, profile, variable, alternate } = fixture();
    const success = await exportProject(project, { ...options(profile.id, 'consultation'), consultationContext: { focusIds: [variable.id], beforeValues: { [variable.id]: { type: 'boolean', value: false } }, afterValues: { [variable.id]: { type: 'unknown', value: null, reason: 'SECRET_UNKNOWN_REASON' } } } });
    expect(success.ok).toBe(true);
    if (!success.ok) throw new Error(JSON.stringify(success.issues));
    expect(success.artifact.content).toContain('未確定');
    expect(success.artifact.content).not.toContain('SECRET');
    const failure = await exportProject(project, { ...options(profile.id, 'consultation'), consultationContext: { focusIds: [alternate.id] } });
    expect(failure.ok).toBe(false);
  });

  it('creates a manual alternate proposal with provenance without updating the canonical project', () => {
    const { project } = fixture(); const before = JSON.stringify(project);
    const proposal = createConsultationProposal(project, { id: id(901), blockId: id(902), text: 'この場面を改訂する別案。', source: '手動で貼り付けた編集相談', targetRevision: '0', createdAt: '2026-10-05T00:00:00Z' });
    expect(proposal.candidate.status).toBe('alternate'); expect(proposal.candidate.visibility).toBe('private');
    expect(proposal.candidate.customValues.consultationTargetRevision).toBe('0');
    expect(proposal.source).toBe('手動で貼り付けた編集相談'); expect(JSON.stringify(project)).toBe(before);
  });

  it('builds a portable playable ZIP with verified files and declared capabilities', async () => {
    const { project, profile } = fixture();
    const result = await exportProject(project, options(profile.id, 'playable_preview'));
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error(JSON.stringify(result.issues));
    expect(result.artifact.filename).toBe('playable-preview.zip');
    const files = unzipSync(result.artifact.bytes!);
    expect(Object.keys(files).sort()).toEqual(['README.txt', 'index.html', 'manifest.json', 'runtime.json']);
    const manifest = JSON.parse(strFromU8(files['manifest.json']));
    for (const entry of manifest.files) {
      expect(files[entry.path].byteLength).toBe(entry.byteSize);
      expect(await sha256(files[entry.path])).toBe(entry.sha256);
    }
    for (const bytes of Object.values(files)) expect(strFromU8(bytes)).not.toContain('SECRET');
    expect(strFromU8(files['index.html'])).toContain("script-src 'sha256-");
    const runtime = JSON.parse(strFromU8(files['runtime.json']));
    expect(runtime.profile.supportedConditions).toContain('external');
    expect(runtime.profile.supportedEffects).toContain('grant');
    expect(runtime.profile.supportedNodeTypes).toContain('call');
    expect(await sha256(new TextEncoder().encode(canonicalJson(runtime.project)))).toBe(runtime.projectHash);
    expect(runtime.externalEvidence).toBe('not_included');
  });

  it('runs the exported HTML in Chromium, renders active text safely, and restores the complete state', async () => {
    const { project, profile, entry, terminal, variable } = fixture();
    const content = '<script>window.__injected = true</script>本文';
    const scene = createEntity(project.projectId, 'scene', 'SECRET_SCENE', { body: rich(701, 'SECRET_SCENE_BODY') }); scene.id = id(700); scene.status = 'confirmed';
    project.entities.push(scene); entry.data.sceneId = scene.id; profile.data.includedIds.push(scene.id); profile.data.allowedKinds!.push('scene');
    (profile.data.namePolicy as NamePolicyMap).byEntityId![scene.id] = { mode: 'replace', replacement: '公開場面' };
    profile.data.publicTexts![scene.id] = { body: rich(702, content) };
    const result = await exportProject(project, options(profile.id, 'playable_preview'));
    if (!result.ok) throw new Error(JSON.stringify(result.issues));
    const files = unzipSync(result.artifact.bytes!);
    const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || '/usr/bin/chromium', headless: true, args: ['--no-sandbox'] });
    try {
      const page = await browser.newPage();
      const htmlPath=join(await mkdtemp(join(tmpdir(),'scenario-playable-test-')),'index.html');await writeFile(htmlPath,files['index.html']);await page.goto(pathToFileURL(htmlPath).href);
      await page.waitForFunction(()=>!!document.getElementById('state')?.textContent);
      expect(await page.locator('#scene').textContent()).toBe(content);
      expect(await page.evaluate(() => (window as unknown as Record<string, unknown>).__injected)).toBeUndefined();
      const initial = JSON.parse((await page.locator('#state').textContent())!);
      expect(initial.variableValues[variable.id].value).toBe(false);
      await page.locator('#choices button').click();
      const after = JSON.parse((await page.locator('#state').textContent())!);
      expect(after.presentationPosition).toBe(terminal.id); expect(after.variableValues[variable.id].value).toBe(true);
      expect(after.visitCounts[terminal.id]).toBe(1); expect(await page.evaluate(() => (window as any).ScenarioSession().trace.length)).toBe(1);
      await page.locator('#undo').click();
      expect(JSON.parse((await page.locator('#state').textContent())!)).toEqual(initial);
      await page.locator('#choices button').click(); await page.locator('#restart').click();
      const restarted=JSON.parse((await page.locator('#state').textContent())!);expect({...restarted,resetCauses:undefined}).toEqual({...initial,resetCauses:undefined});expect(restarted.resetCauses).toContainEqual(expect.objectContaining({variableId:variable.id,on:'full_reset',before:{type:'boolean',value:true},after:{type:'boolean',value:false}}));
      expect(await page.locator('#undo').isDisabled()).toBe(true);
    } finally { await browser.close(); }
  }, 15000);

  it('rolls back every exported effect when a later effect violates an integer bound', async () => {
    const { project, profile, variable, effect, edge } = fixture();
    variable.data.valueType = 'integer'; variable.data.initial = { type: 'integer', value: 0 }; variable.data.allowed = { min: 0, max: 1 };
    effect.data.operation = 'add'; effect.data.value = { type: 'integer', value: 1 };
    edge.data.condition = { op: 'compare', variableId: variable.id, comparator: 'eq', value: { type: 'integer', value: 0 } };
    const overflow = createEntity(project.projectId, 'effect', 'SECRET_OVERFLOW', { operation: 'add', targetId: variable.id, value: { type: 'integer', value: 1 } }); overflow.id = id(600); overflow.status = 'confirmed';
    project.entities.push(overflow); edge.data.effectIds!.push(overflow.id); profile.data.includedIds.push(overflow.id);
    (profile.data.namePolicy as NamePolicyMap).byEntityId![overflow.id] = { mode: 'replace', replacement: '二つ目の加算' };
    const result = await exportProject(project, options(profile.id, 'playable_preview'));
    if (!result.ok) throw new Error(JSON.stringify(result.issues));
    const files = unzipSync(result.artifact.bytes!);
    const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || '/usr/bin/chromium', headless: true, args: ['--no-sandbox'] });
    try {
      const page = await browser.newPage(); const htmlPath=join(await mkdtemp(join(tmpdir(),'scenario-playable-test-')),'index.html');await writeFile(htmlPath,files['index.html']);await page.goto(pathToFileURL(htmlPath).href);
      await page.waitForFunction(()=>!!document.getElementById('state')?.textContent);
      const initial = JSON.parse((await page.locator('#state').textContent())!);
      await page.locator('#choices button').click();
      expect(await page.locator('#message').textContent()).toContain('TRANSITION_BLOCKED');expect(await page.evaluate(()=>(window as any).ScenarioSession().trace.length)).toBe(0);
      expect(JSON.parse((await page.locator('#state').textContent())!)).toEqual(initial);
      expect(await page.locator('#undo').isDisabled()).toBe(true);
    } finally { await browser.close(); }
  }, 15000);

  it('retains declared triggers, all_match and every declared entry in the executable ZIP', async () => {
    const first = fixture(); first.entry.data.trigger = { event: 'manual', eventKey: 'manual', repeat: 'once' }; first.profile.data.publicTexts![first.entry.id] = { eventKey: 'manual' };
    const second = fixture(); second.entry.data.executionPolicy = 'all_match';
    const third = fixture(); third.graph.data.entryIds.push(third.terminal.id);
    for (const { project, profile } of [first, second, third]) {
      const result = await exportProject(project, options(profile.id, 'playable_preview'));
      if(!result.ok)throw Error(JSON.stringify(result.issues));const payload=JSON.parse(strFromU8(unzipSync(result.artifact.bytes!)['runtime.json']));expect(payload.project.entities.find((e:Entity)=>e.id===first.entry.id)?.data).toBeDefined();expect(payload.project.entities.filter((e:Entity)=>e.kind==='flow_graph')[0].data.entryIds).toEqual(project.entities.find(e=>e.kind==='flow_graph')!.data.entryIds);
    }
  });

  it('retains disclosure arrival effects even when the public profile hides that dependency', async () => {
    const { project, profile, entry, edge, variable, effect } = fixture();
    const scene = createEntity(project.projectId, 'scene', 'SECRET_DISCLOSURE_SCENE', { body: rich(741, 'SECRET_BODY') }); scene.id = id(740);
    const foreshadow = createEntity(project.projectId, 'foreshadow', 'SECRET_FORESHADOW'); foreshadow.id = id(743);
    const disclosure = createEntity(project.projectId, 'disclosure', 'SECRET_DISCLOSURE', { foreshadowId: foreshadow.id, anchor: { entityId: scene.id }, stage: 'reveal', role: 'clue', knowledgeEffects: [effect.id] }); disclosure.id = id(744);
    for (const entity of [scene, foreshadow, disclosure]) {
      entity.status = 'confirmed'; project.entities.push(entity); profile.data.includedIds.push(entity.id); profile.data.allowedKinds!.push(entity.kind);
      (profile.data.namePolicy as NamePolicyMap).byEntityId![entity.id] = { mode: 'replace', replacement: '公開情報' };
    }
    profile.data.publicTexts![scene.id] = { body: rich(742, '公開本文') }; entry.data.sceneId = scene.id;
    edge.data.effectIds = []; edge.data.condition = { op: 'compare', variableId: variable.id, comparator: 'eq', value: { type: 'boolean', value: true } };
    const trial = startTrial(project);
    expect(trial.issues).toEqual([]);
    expect(trial.state.variableValues[variable.id]).toEqual({ type: 'boolean', value: true });
    expect(getTrialChoices(project, trial)[0].result).toBe('true');
    expect((await exportProject(project, options(profile.id, 'runtime_json'))).ok).toBe(true);
    const assertUnsupported = async () => {
      const result = await exportProject(project, options(profile.id, 'playable_preview'));
      expect(result.ok).toBe(false); expect('artifact' in result).toBe(false);
      if (!result.ok) expect(result.issues).toContainEqual(expect.objectContaining({ code: 'EXPORT_UNSUPPORTED', entityId: disclosure.id, field: 'knowledgeEffects' }));
    };
    const supported=await exportProject(project,options(profile.id,'playable_preview'));if(!supported.ok)throw Error(JSON.stringify(supported.issues));const portable=JSON.parse(strFromU8(unzipSync(supported.artifact.bytes!)['runtime.json']));expect(startTrial(portable.project).state.variableValues[variable.id]).toEqual({type:'boolean',value:true});
    profile.data.allowedFields = { disclosure: ['foreshadowId', 'anchor', 'stage', 'role'] };
    await assertUnsupported();
    expect((await exportProject(project, options(profile.id, 'runtime_json'))).ok).toBe(false);
    profile.data.allowedFields = undefined;
    profile.data.includedIds = profile.data.includedIds.filter(entityId => entityId !== disclosure.id);
    await assertUnsupported();
    const omittedDependency = await exportProject(project, options(profile.id, 'runtime_json'));
    expect(omittedDependency.ok).toBe(false);
    if (!omittedDependency.ok) expect(omittedDependency.issues).toContainEqual(expect.objectContaining({ code: 'EXPORT_UNSUPPORTED', entityId: disclosure.id, field: 'knowledgeEffects' }));
    const unrelatedScene = createEntity(project.projectId, 'scene', 'SECRET_UNRELATED_SCENE'); unrelatedScene.id = id(745); project.entities.push(unrelatedScene);
    disclosure.data.anchor.entityId = unrelatedScene.id;
    expect((await exportProject(project, options(profile.id, 'playable_preview'))).ok).toBe(true);
    expect((await exportProject(project, options(profile.id, 'runtime_json'))).ok).toBe(true);
  });

  it('refuses omitting block and choice-line references that contribute to presentation state', async () => {
    const { project, profile, entry, edge, line } = fixture();
    const scene = createEntity(project.projectId, 'scene', 'SECRET_PRESENTATION_SCENE', { body: rich(752, 'SECRET_BLOCK'), blockIds: [id(752)] }); scene.id = id(751); scene.status = 'confirmed';
    project.entities.push(scene); entry.data.sceneId = scene.id; profile.data.includedIds.push(scene.id); profile.data.allowedKinds!.push('scene');
    (profile.data.namePolicy as NamePolicyMap).byEntityId![scene.id] = { mode: 'replace', replacement: '公開場面' };
    profile.data.publicTexts![scene.id] = { body: rich(752, '公開段落') };
    expect((await exportProject(project, options(profile.id, 'runtime_json'))).ok).toBe(true);
    profile.data.allowedFields = { scene: ['summary', 'body', 'eventIds', 'chapterId', 'threadIds', 'povId', 'tension', 'importance'] };
    for (const purpose of ['runtime_json', 'playable_preview'] as const) {
      const result = await exportProject(project, options(profile.id, purpose));
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.issues).toContainEqual(expect.objectContaining({ code: 'EXPORT_UNSUPPORTED', entityId: scene.id, field: 'blockIds' }));
    }
    profile.data.allowedFields = undefined; edge.data.choiceLineId = line.id;
    expect((await exportProject(project, options(profile.id, 'runtime_json'))).ok).toBe(true);
    profile.data.allowedFields = { flow_edge: ['fromId', 'toId', 'edgeType', 'label', 'condition', 'effectIds', 'priority'] };
    for (const purpose of ['runtime_json', 'playable_preview'] as const) {
      const result = await exportProject(project, options(profile.id, purpose));
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.issues).toContainEqual(expect.objectContaining({ code: 'EXPORT_UNSUPPORTED', entityId: edge.id, field: 'choiceLineId' }));
    }
  });
});
