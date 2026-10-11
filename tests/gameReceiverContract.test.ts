import { describe, expect, it } from 'vitest';
import { createEntity, createProject, newId, textToRichText } from '../src/domain/model';
import { exportProject, GENERIC_RUNTIME_PROFILE } from '../src/domain/exports';
import { appendGameAction, buildGameReceipt, receiveGamePackage, verifyGameReceipt } from '../src/domain/gameProtocol';
import { portableRuntimeProject } from '../src/domain/portableRuntimeProject';
import { buildProjectionSearchIndex } from '../src/domain/projection';
import { canonicalJson, jsonBytes, sha256 } from '../src/storage/json';

async function receiverFixture() {
  const project = createProject('PRIVATE_WORK');
  const scene = createEntity(project.projectId, 'scene', 'PRIVATE_SCENE', { body: textToRichText('PRIVATE_BODY'), authorNotes: textToRichText('PRIVATE_NOTE') });
  const line = createEntity(project.projectId, 'dialogue_line', 'PRIVATE_LINE', { text: textToRichText('PRIVATE_DIALOGUE') });
  scene.data.dialogueLineIds = [line.id];
  const contract = createEntity(project.projectId, 'external_contract', 'PRIVATE_CONTRACT', { key: 'PRIVATE_KEY', owner: 'game', inputType: 'boolean', outputType: 'boolean', missingPolicy: 'block', version: '1.0.0', stubValues: [{ type: 'boolean', value: true }] });
  const entry = createEntity(project.projectId, 'flow_node', 'PRIVATE_ENTRY', { nodeType: 'automatic', executionPolicy: 'first_match', sceneId: scene.id, gate: { op: 'external', contractId: contract.id } });
  const terminal = createEntity(project.projectId, 'flow_node', 'PRIVATE_END', { nodeType: 'terminal', terminalReason: 'PRIVATE_REASON' });
  const edge = createEntity(project.projectId, 'flow_edge', 'PRIVATE_EDGE', { fromId: entry.id, toId: terminal.id, edgeType: 'automatic', label: 'PRIVATE_LABEL' });
  const graph = createEntity(project.projectId, 'flow_graph', 'PRIVATE_GRAPH', { nodeIds: [entry.id, terminal.id], edgeIds: [edge.id], entryIds: [entry.id], exitIds: [terminal.id] });
  const records = [scene, line, contract, entry, terminal, edge, graph];
  records.forEach(record => record.status = 'confirmed');
  const publicBody = textToRichText('公開本文 😀');
  const publicLine = textToRichText('公開台詞');
  const profile = createEntity(project.projectId, 'projection_profile', 'PRIVATE_PROFILE', {
    audience: 'reader', publicTitle: '受取fixture', publicVersionLabel: '確認版', idPolicy: 'preserve',
    includedIds: records.map(record => record.id), allowedKinds: [...new Set(records.map(record => record.kind))],
    namePolicy: { defaultPolicy: { mode: 'replace', replacement: '公開項目' } },
    publicTexts: { [scene.id]: { body: publicBody }, [line.id]: { text: publicLine }, [contract.id]: { key: 'result' }, [terminal.id]: { terminalReason: '終端' }, [edge.id]: { label: '次へ' } },
    blockSources: { [publicBody[0].id]: scene.data.body[0].id, [publicLine[0].id]: line.data.text[0].id },
  });
  profile.status = 'confirmed';
  project.entities = [...records, profile];
  const before = canonicalJson(project);
  const output = await exportProject(project, { profile: 'runtime_json', projectionProfileId: profile.id, targetRevision: project.revision });
  if (!output.ok) throw Error(JSON.stringify(output.issues));
  expect(canonicalJson(project)).toBe(before);
  expect(output.artifact.content).not.toContain('PRIVATE_');
  return { project, output, package: JSON.parse(output.artifact.content), entry, line, contract };
}

async function detailedPublicPackage() {
  const fixture = await receiverFixture();
  const input = fixture.package;
  const projection = input.publicProjection;
  const scene = projection.entities.find((entity: { kind: string }) => entity.kind === 'scene');
  scene.data.body[0].ruby = [{ start: 0, end: 2, text: 'こうかい' }];
  projection.relations = [{ id: newId(), fromId: fixture.entry.id, toId: fixture.line.id, relationType: 'reference', direction: 'forward', evidenceIds: [fixture.line.id], validity: { worldRange: null, routeCondition: null, presentationAnchor: null } }];
  projection.calendars = [{ id: 'public-repeat', name: '公開暦', kind: 'repeating', originLabel: '原点', ticksPerDay: '100', years: [{ months: [{ name: '月', days: 30 }] }] }];
  await resealPublicPackage(input);
  return input;
}

async function resealPublicPackage(input: Awaited<ReturnType<typeof receiverFixture>>['package']) {
  const projection = input.publicProjection;
  input.entities = projection.entities;
  input.scenes = projection.entities.filter((entity: { kind: string }) => entity.kind === 'scene');
  input.relations = projection.relations;
  input.calendars = projection.calendars;
  projection.searchIndex = buildProjectionSearchIndex(projection);
  const portable = await portableRuntimeProject(projection);
  input.contentVersionId = `sha256:${await sha256(jsonBytes(projection))}`;
  input.runtimeProject = portable.project;
  input.runtimeProjectHash = await sha256(jsonBytes(portable.project));
  input.publicToRuntime = portable.publicToRuntime;
}

describe('independent game receiver contract', () => {
  it('roundtrips public IDs and measured game results without publishing author text', async () => {
    const fixture = await receiverFixture();
    const pkg = await receiveGamePackage(fixture.package);
    const action = await appendGameAction(pkg, [], fixture.contract.id, 'win');
    const receipt = await buildGameReceipt(pkg, { entryId: pkg.publicToRuntime[fixture.entry.id], actions: [action], requests: [{}] });
    expect(receipt).toMatchObject({ status: 'terminal', mode: 'actual', dialogueIds: [fixture.line.id] });
    expect((await verifyGameReceipt(pkg, receipt)).receiptHash).toBe(receipt.receiptHash);
    expect(canonicalJson(receipt)).not.toContain('PRIVATE_');
  });

  it('refuses unsupported package commands instead of ignoring them', async () => {
    const fixture = await receiverFixture();
    const input = { ...fixture.package, commands: [{ operation: 'run_external_code', code: 'untrusted()' }] };
    const before = canonicalJson(input);
    await expect(receiveGamePackage(input)).rejects.toThrow(/未対応|仕様|構造/);
    expect(canonicalJson(input)).toBe(before);
  });

  it('refuses an internally consistent unknown public-projection version', async () => {
    const fixture = await receiverFixture();
    const input = structuredClone(fixture.package);
    input.publicProjection.formatVersion = '99.0.0';
    const portable = await portableRuntimeProject(input.publicProjection);
    input.contentVersionId = `sha256:${await sha256(jsonBytes(input.publicProjection))}`;
    input.runtimeProject = portable.project;
    input.runtimeProjectHash = await sha256(jsonBytes(portable.project));
    input.publicToRuntime = portable.publicToRuntime;
    await expect(receiveGamePackage(input)).rejects.toThrow(/未対応|仕様|構造/);
  });

  it('refuses inconsistent duplicate flow metadata and unknown profile capabilities', async () => {
    const fixture = await receiverFixture();
    const changedFlow = structuredClone(fixture.package);
    changedFlow.flow.edges[0].data.toId = changedFlow.flow.nodes[0].id;
    await expect(receiveGamePackage(changedFlow)).rejects.toThrow(/一致|未対応|仕様|構造/);
    const unknownCapability = structuredClone(fixture.package);
    unknownCapability.profile.supportedEffects.push('run_external_code');
    await expect(receiveGamePackage(unknownCapability)).rejects.toThrow(/未対応|仕様|構造/);
  });

  it('keeps known capability subsets and rejects unsupported schema and runtime hashes', async () => {
    const fixture = await receiverFixture();
    const subset = structuredClone(fixture.package);
    subset.profile = { ...subset.profile, supportedNodeTypes: ['terminal', 'automatic'], supportedConditions: ['external', 'constant'], supportedEffects: [], externalContracts: ['boolean'], assetTypes: [] };
    await expect(receiveGamePackage(subset)).resolves.toBeDefined();
    const changedVersion = structuredClone(fixture.package);
    changedVersion.profile.schemaVersion = '99.0.0';
    await expect(receiveGamePackage(changedVersion)).rejects.toThrow(/仕様版/);
    const changedHash = { ...fixture.package, runtimeProjectHash: '0'.repeat(64) };
    await expect(receiveGamePackage(changedHash)).rejects.toThrow(/hash/);
    expect(fixture.package.profile.supportedEffects).toEqual(GENERIC_RUNTIME_PROFILE.supportedEffects);
  });

  it('rejects a rehashed search index containing text outside the public projection', async () => {
    const fixture = await receiverFixture();
    const input = structuredClone(fixture.package);
    input.publicProjection.searchIndex[0].text = 'PRIVATE_INDEX_LEAK';
    input.publicProjection.searchIndex[0].normalized = 'private_index_leak';
    const portable = await portableRuntimeProject(input.publicProjection);
    input.contentVersionId = `sha256:${await sha256(jsonBytes(input.publicProjection))}`;
    input.runtimeProject = portable.project;
    input.runtimeProjectHash = await sha256(jsonBytes(portable.project));
    input.publicToRuntime = portable.publicToRuntime;
    await expect(receiveGamePackage(input)).rejects.toThrow(/検索索引/);
  });

  it('accepts projected relations, ruby and repeating calendars, then refuses unknown nested metadata without changing input', async () => {
    const input = await detailedPublicPackage();
    await expect(receiveGamePackage(input)).resolves.toBeDefined();
    const variants = [
      (pkg: typeof input) => { pkg.publicProjection.entities[0].data.body[0].ruby[0].commands = []; },
      (pkg: typeof input) => { pkg.publicProjection.entities[0].data.body[0].ruby[0].text = 12; },
      (pkg: typeof input) => { pkg.publicProjection.relations[0].commands = []; },
      (pkg: typeof input) => { pkg.publicProjection.relations[0].direction = 'executable'; },
      (pkg: typeof input) => { pkg.publicProjection.relations[0].validity.commands = []; },
      (pkg: typeof input) => { pkg.publicProjection.calendars[0].years[0].commands = []; },
      (pkg: typeof input) => { pkg.publicProjection.calendars[0].years[0].months[0].commands = []; },
      (pkg: typeof input) => { pkg.publicProjection.calendars[0].years[0].months[0].days = '30'; },
    ];
    for (const mutate of variants) {
      const invalid = structuredClone(input);
      mutate(invalid);
      invalid.contentVersionId = `sha256:${await sha256(jsonBytes(invalid.publicProjection))}`;
      const before = canonicalJson(invalid);
      await expect(receiveGamePackage(invalid)).rejects.toThrow(/未対応|不正/);
      expect(canonicalJson(invalid)).toBe(before);
    }
  });

  it('refuses rehashed calendar metadata that native Gregorian conversion would discard', async () => {
    const input = await detailedPublicPackage();
    for (const kind of ['gregorian', 'unknown_calendar']) {
      const invalid = structuredClone(input);
      invalid.publicProjection.calendars[0].kind = kind;
      invalid.publicProjection.calendars[0].ticksPerDay = '86400';
      invalid.publicProjection.calendars[0].years[0].commands = [{ operation: 'run_external_code' }];
      await resealPublicPackage(invalid);
      const before = canonicalJson(invalid);
      await expect(receiveGamePackage(invalid)).rejects.toThrow(/公開暦/);
      expect(canonicalJson(invalid)).toBe(before);
    }
  });

  it('validates retained entity field semantics through the strict native runtime schema', async () => {
    const fixture = await receiverFixture();
    const invalid = fixture.package;
    const contract = invalid.publicProjection.entities.find((entity: { kind: string }) => entity.kind === 'external_contract');
    contract.data.outputType = 'javascript';
    invalid.entities = invalid.publicProjection.entities;
    invalid.externalContracts = [contract];
    invalid.contentVersionId = `sha256:${await sha256(jsonBytes(invalid.publicProjection))}`;
    const before = canonicalJson(invalid);
    await expect(receiveGamePackage(invalid)).rejects.toThrow(/strict契約/);
    expect(canonicalJson(invalid)).toBe(before);
  });
});
