import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile } from 'node:fs/promises';
import { release, tmpdir } from 'node:os';
import path from 'node:path';
import { createServer } from 'vite';
import { chromium, firefox, webkit, expect as playwrightExpect } from '@playwright/test';

// Run from the repository root: CHROMIUM_PATH=/usr/bin/chromium node tests/browser/rb04-author-regressions.mjs
// This checks real source components with an in-memory host. It does not verify native persistence or the complete App.
const root = process.cwd();
const engine = process.env.RB04_ENGINE ?? 'chromium';
const launcher = { chromium, firefox, webkit }[engine];
if (!launcher) throw new Error('RB04_ENGINE must be chromium, firefox or webkit.');
const outputParent = process.env.RB04_OUTPUT_DIR ? path.resolve(root, process.env.RB04_OUTPUT_DIR) : tmpdir();
await mkdir(outputParent, { recursive: true });
const output = await mkdtemp(path.join(outputParent, `rb04-author-regressions-${engine}-`));
const expect = playwrightExpect.configure({ timeout: 8000 });
const checks = [], pageErrors = [];
const startedAt = new Date().toISOString();
let server, browser, page, failure, browserVersion, userAgent;

const source = String.raw`
import React from 'react';
import { createRoot } from 'react-dom/client';
import { AuthorAlternativeStudio, acknowledgeAlternativeWorkspaceDraft, hasUnsavedAlternativeWorkspaceDraft } from '/src/ui/AuthorAlternativeStudio.tsx';
import { ChapterReadingView } from '/src/ui/WritingWorkspace.tsx';
import { createProject, createEntity, textToRichText, validateProject, newId, emptyValidity } from '/src/domain/model.ts';
import { forkAuthorAlternative, projectContent } from '/src/domain/writingWorkspace.ts';
import { createWorldSnapshot } from '/src/domain/world.ts';
import { sealAuthorAlternative } from '/src/domain/authorAlternativeIntegrity.ts';
import { jsonBytes, sha256 } from '/src/storage/json.ts';
const p = createProject('RB04 independent author regressions');
const scene = createEntity(p.projectId, 'scene', 'Scene', { body: textToRichText('😀門') });
const chapter = createEntity(p.projectId, 'chapter', 'Chapter', { sceneIds: [scene.id] });
scene.data.chapterId = chapter.id;
const foreshadow = createEntity(p.projectId, 'foreshadow', 'Question');
const disclosure = createEntity(p.projectId, 'disclosure', 'Clue', { foreshadowId: foreshadow.id, anchor: { entityId: scene.id, blockId: scene.data.body[0].id, start: 1, end: 2 } });
foreshadow.data.clueIds = [disclosure.id];
p.entities = [scene, chapter, foreshadow, disclosure];
const published = await createWorldSnapshot(p, 'Old');
window.fixtureValid = validateProject(published).ok;
window.fixtureIds = { scene: scene.id, disclosure: disclosure.id, snapshot: published.snapshots[0].id, originalBlock: scene.data.body[0].id };
const base = [forkAuthorAlternative(published, 'A'), forkAuthorAlternative(published, 'B')];
window.saved = base;
window.branchIds = base.map(branch => branch.id);
window.workspaceDraft = null;
window.acknowledgements = [];
let reactRoot = createRoot(document.getElementById('root'));
const reconcile = draft => window.acknowledgements.reduce((current, ack) => acknowledgeAlternativeWorkspaceDraft(current, ack.before, ack.after), draft);
function Host({ mode }) {
  const [alternatives, setAlternatives] = React.useState(window.saved);
  const [draft, setDraft] = React.useState(window.workspaceDraft);
  return React.createElement(AuthorAlternativeStudio, {
    project: published, alternatives: mode === 'failure' ? [] : alternatives, initialDraft: draft,
    onDraftChange: incoming => { window.workspaceDraft = reconcile(incoming); setDraft(window.workspaceDraft); },
    onPersistAlternatives: async next => {
      const before = alternatives.map(({ id, headVersionId }) => ({ id, headVersionId }));
      if (mode === 'failure') throw new Error('quota');
      if (mode === 'pending') await new Promise(resolve => window.completePending = resolve);
      window.saved = next;
      setAlternatives(next);
      if (mode === 'early-publication') await new Promise(resolve => window.completePending = resolve);
      window.acknowledgements.push({ before, after: next.map(({ id, headVersionId }) => ({ id, headVersionId })) });
      if (window.workspaceDraft) { window.workspaceDraft = reconcile(window.workspaceDraft); setDraft(window.workspaceDraft); }
      window.completed = true;
    },
  });
}
window.mount = (mode, reset = false) => {
  reactRoot.unmount(); reactRoot = createRoot(document.getElementById('root'));
  if (reset) { window.saved = base; window.workspaceDraft = null; window.acknowledgements = []; }
  window.completePending = null; window.completed = false;
  reactRoot.render(React.createElement(Host, { mode }));
};
window.hide = () => { reactRoot.unmount(); reactRoot = createRoot(document.getElementById('root')); reactRoot.render(React.createElement('p', null, 'Another page')); };
window.mountReading = () => {
  const current = structuredClone(published);
  current.entities = current.entities.filter(entity => !['scene', 'disclosure', 'foreshadow'].includes(entity.kind));
  current.entities.find(entity => entity.kind === 'chapter').data.sceneIds = [];
  current.revision = '1';
  window.readingFixtureValid = validateProject(current).ok;
  window.openedCurrent = null; window.openedTarget = null;
  reactRoot.unmount(); reactRoot = createRoot(document.getElementById('root'));
  reactRoot.render(React.createElement(ChapterReadingView, { project: current, onOpenEntity: id => window.openedCurrent = id, onOpenTarget: anchor => window.openedTarget = anchor }));
};
window.mountRepeatedEdit = async () => {
  const project = createProject('Repeated selected edit');
  const target = createEntity(project.projectId, 'scene', 'Scene', { body: textToRichText('😀同じ\n😀同じ') });
  const question = createEntity(project.projectId, 'foreshadow', 'Question');
  const current = createEntity(project.projectId, 'disclosure', 'Current', { foreshadowId: question.id, anchor: { entityId: target.id, blockId: target.data.body[0].id, start: 1, end: 3, sourceVersionId: project.projectId } });
  question.data.clueIds = [current.id];
  const a = createEntity(project.projectId, 'character', 'A'), b = createEntity(project.projectId, 'character', 'B');
  project.entities = [target, question, current, a, b];
  const fixed = await createWorldSnapshot(project, 'Old');
  const historical = createEntity(project.projectId, 'disclosure', 'Frozen', { foreshadowId: question.id, anchor: { entityId: target.id, blockId: target.data.body[0].id, start: 1, end: 3, sourceVersionId: fixed.snapshots[0].id } });
  fixed.entities.push(historical);
  fixed.relations = [{ id: newId(), projectId: project.projectId, revision: '0', fromId: a.id, toId: b.id, relationType: 'trust', direction: 'forward', validity: { ...emptyValidity(), presentationAnchor: { entityId: target.id, blockId: target.data.body[0].id, start: 1, end: 3 } }, evidenceIds: [], status: 'provisional', visibility: 'private' }];
  window.repeatedFixture = { valid: validateProject(fixed).ok, originalIds: target.data.body.map(block => block.id), currentId: current.id, historicalId: historical.id, historicalAnchor: structuredClone(historical.data.anchor) };
  window.repeatedSaved = null;
  function RepeatedHost() { const [alternatives, setAlternatives] = React.useState([forkAuthorAlternative(fixed, 'A')]); return React.createElement(AuthorAlternativeStudio, { project: fixed, alternatives, onPersistAlternatives: next => { window.repeatedSaved = next; setAlternatives(next); } }); }
  reactRoot.unmount(); reactRoot = createRoot(document.getElementById('root')); reactRoot.render(React.createElement(RepeatedHost));
};
window.mountGeneric = async () => {
  const project = createProject('Generic branch fields');
  const integer = createEntity(project.projectId, 'variable', 'Integer', { key: 'count', valueType: 'integer', initial: { type: 'integer', value: 0 }, allowed: { min: 0, max: 10 } });
  const boolean = createEntity(project.projectId, 'variable', 'Bool', { key: 'enabled', initial: { type: 'boolean', value: false } });
  const effect = createEntity(project.projectId, 'effect', 'Effect', { targetId: boolean.id, value: { type: 'boolean', value: true } });
  const node = createEntity(project.projectId, 'flow_node', 'Node', { nodeType: 'terminal', terminalReason: 'Done' });
  project.entities = [integer, boolean, effect, node];
  window.genericIds = { integer: integer.id, effect: effect.id, node: node.id };
  window.genericValid = validateProject(project).ok;
  window.genericCanonicalBefore = JSON.stringify(project);
  window.genericCanonical = () => JSON.stringify(project);
  window.genericSaved = await Promise.all([forkAuthorAlternative(project, 'A'), forkAuthorAlternative(project, 'B')].map(sealAuthorAlternative));
  window.genericOldVersion = structuredClone(window.genericSaved[0].versions[0]);
  window.genericSaveCount = 0;
  window.genericDirty = () => hasUnsavedAlternativeWorkspaceDraft(window.genericDraft, window.genericSaved);
  function GenericHost() {
    const [alternatives, setAlternatives] = React.useState(window.genericSaved);
    return React.createElement(AuthorAlternativeStudio, { project, alternatives, onDraftChange: draft => window.genericDraft = draft, onPersistAlternatives: next => { window.genericSaved = next; setAlternatives(next); window.genericSaveCount++; } });
  }
  reactRoot.unmount(); reactRoot = createRoot(document.getElementById('root')); reactRoot.render(React.createElement(GenericHost));
};
window.mountReadingLinks = async () => {
  const project = createProject('Reading link editions');
  const target = createEntity(project.projectId, 'note', 'Target', { body: textToRichText('Old target😀') });
  const scene = createEntity(project.projectId, 'scene', 'Linked scene', { body: textToRichText('pinned ordinary') });
  const chapter = createEntity(project.projectId, 'chapter', 'Linked chapter', { sceneIds: [scene.id] });
  scene.data.chapterId = chapter.id; project.entities = [chapter, scene, target];
  const snapshot = async label => {
    const content = projectContent(project);
    return { id: newId(), content, contentHash: await sha256(jsonBytes(content)), versionLabel: label, createdAt: new Date().toISOString() };
  };
  const old = await snapshot('Explicit older link target'); project.snapshots.push(old);
  target.data.body[0].text = 'Reading edition target';
  const pinned = { entityId: target.id, sourceVersionId: old.id, blockId: old.content.entities.find(entity => entity.id === target.id).data.body[0].id, start: 0, end: 3 };
  const ordinary = { entityId: target.id, blockId: target.data.body[0].id, start: 0, end: 3 };
  scene.data.body[0].links = [{ start: 0, end: 6, target: pinned }, { start: 7, end: 15, target: ordinary }];
  const reading = await snapshot('Fixed reading edition'); project.snapshots.push(reading);
  target.data.body[0].text = 'Changed current target';
  window.readingLinks = { valid: validateProject(project).ok, readingEditionId: reading.id, pinned, ordinary };
  window.openedReadingLink = null; window.openedReadingEntity = null;
  reactRoot.unmount(); reactRoot = createRoot(document.getElementById('root'));
  reactRoot.render(React.createElement(ChapterReadingView, { project, onOpenEntity: id => window.openedReadingEntity = id, onOpenTarget: anchor => window.openedReadingLink = anchor }));
};
window.mountPendingReading = async () => {
  const project = createProject('Pending reading operations');
  const first = createEntity(project.projectId, 'scene', 'First pending scene', { body: textToRichText('First') });
  const second = createEntity(project.projectId, 'scene', 'Second pending scene', { body: textToRichText('Second') });
  const chapter = createEntity(project.projectId, 'chapter', 'Pending chapter', { sceneIds: [first.id, second.id] });
  first.data.chapterId = second.data.chapterId = chapter.id;
  project.entities = [chapter, first, second];
  const fixed = await createWorldSnapshot(project, 'Pending capture edition');
  window.pendingReading = { valid: validateProject(fixed).ok, firstId: first.id, secondId: second.id, snapshotId: fixed.snapshots[0].id, digestCalls: 0, saveCalls: 0, savedRecord: null };
  const originalDigest = crypto.subtle.digest.bind(crypto.subtle);
  window.armReadingCapture = () => {
    crypto.subtle.digest = async (...args) => {
      window.pendingReading.digestCalls++;
      await new Promise(resolve => window.completeReadingCapture = resolve);
      crypto.subtle.digest = originalDigest;
      return originalDigest(...args);
    };
  };
  reactRoot.unmount(); reactRoot = createRoot(document.getElementById('root'));
  reactRoot.render(React.createElement(ChapterReadingView, { project: fixed, onSaveMany: async (entities, reason, assets, snapshots) => {
    window.pendingReading.saveCalls++;
    window.pendingReading.savedRecord = structuredClone({ entities, reason, snapshots });
    await new Promise(resolve => window.completeReadingSave = resolve);
  } }));
};
window.mount('failure', true);
`;

try {
  server = await createServer({
    root, base: '/', cacheDir: path.join(output, '.vite'),
    server: { host: '127.0.0.1', port: 0, hmr: false },
    plugins: [{
      name: 'rb04-author-regression-fixture',
      resolveId(id) { if (id === 'virtual:rb04-review') return '\0virtual:rb04-review'; },
      load(id) { if (id === '\0virtual:rb04-review') return source; },
      configureServer(vite) {
        vite.middlewares.use(async (request, response, next) => {
          if (request.url?.split('?')[0] !== '/__rb04_author_review') return next();
          try {
            response.setHeader('Content-Type', 'text/html');
            response.end(await vite.transformIndexHtml('/__rb04_author_review', '<div id="root"></div><script type="module" src="/@id/virtual:rb04-review"></script>'));
          } catch (error) { next(error); }
        });
      },
    }],
  });
  await server.listen();
  const executablePath = process.env.RB04_CHROMIUM_PATH ?? process.env.CHROMIUM_PATH;
  browser = await launcher.launch({ timeout: 30000, ...(engine === 'chromium' && executablePath ? { executablePath, args: ['--no-sandbox'] } : {}) });
  browserVersion = browser.version();
  page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  page.setDefaultTimeout(8000); page.setDefaultNavigationTimeout(20000);
  page.on('pageerror', error => pageErrors.push(error.message));
  await page.goto(`${server.resolvedUrls.local[0]}__rb04_author_review`);
  userAgent = await page.evaluate(() => navigator.userAgent);
  await page.getByLabel('新しい別案の名前', { exact: true }).waitFor();
  assert.equal(await page.evaluate(() => window.fixtureValid), true, 'The starting fixture must be schema-valid.');
  const ids = await page.evaluate(() => window.fixtureIds);
  const body = page.getByLabel('別案内の場面本文', { exact: true });
  const save = page.getByRole('button', { name: '別案を新しい版として保存', exact: true });
  const finish = async () => {
    await page.waitForFunction(() => typeof window.completePending === 'function');
    await page.evaluate(() => window.completePending());
    await page.waitForFunction(() => window.completed);
    await expect(body).toBeEnabled();
  };
  const reset = async mode => { await page.evaluate(mode => window.mount(mode, true), mode); await expect(body).toHaveValue('😀門'); };
  const submit = async () => {
    // Sealing is asynchronous. A previous save's resolver cannot acknowledge
    // this save before its host persistence callback has actually registered.
    await page.evaluate(() => { window.completed = false; window.completePending = null; });
    await save.click();
  };

  await page.getByLabel('新しい別案の名前', { exact: true }).fill('Retain failed creation');
  await page.getByLabel('別案の分岐元', { exact: true }).selectOption(ids.snapshot);
  await page.getByRole('button', { name: '分岐して別案を作る', exact: true }).click();
  await expect(page.getByRole('alert')).toHaveText('quota');
  await expect(page.getByLabel('新しい別案の名前', { exact: true })).toHaveValue('Retain failed creation');
  await expect(page.getByLabel('別案の分岐元', { exact: true })).toHaveValue(ids.snapshot);
  checks.push('failed-creation-retains-name-and-fixed-source');

  await reset('normal');
  const branchIds = await page.evaluate(() => window.branchIds);
  await body.fill('Draft A');
  await page.getByLabel('編集する作者別案', { exact: true }).selectOption(branchIds[1]);
  await expect(body).toHaveValue('😀門'); await body.fill('Draft B');
  await page.getByLabel('編集する作者別案', { exact: true }).selectOption(branchIds[0]);
  await expect(body).toHaveValue('Draft A');
  await page.evaluate(() => window.mount('normal'));
  await expect(body).toHaveValue('Draft A');
  checks.push('branch-switch-and-host-remount-retain-independent-drafts');

  await reset('early-publication'); await body.fill('Published before callback resolves'); await submit();
  await page.waitForFunction(() => !!window.completePending);
  await expect(page.locator('.alternative-panel').filter({ hasText: '別案の版履歴' })).toContainText('保存済み 2版');
  await finish();
  await page.evaluate(() => {
    const digest = crypto.subtle.digest.bind(crypto.subtle);
    window.completeNextSaveHash = null;
    crypto.subtle.digest = async (...args) => {
      crypto.subtle.digest = digest;
      await new Promise(resolve => window.completeNextSaveHash = resolve);
      return digest(...args);
    };
  });
  await body.fill('Next acknowledged edit'); await submit();
  await page.waitForFunction(() => typeof window.completeNextSaveHash === 'function');
  assert.equal(await page.evaluate(() => window.completePending), null, 'A delayed new seal must not retain the previous save resolver.');
  await expect(body).toBeDisabled(); await expect(page.getByRole('alert')).toHaveCount(0);
  await page.evaluate(() => window.completeNextSaveHash());
  await finish();
  assert.equal(await page.evaluate(() => window.saved[0].versions.length), 3);
  checks.push('host-publication-before-promise-resolution-allows-next-save');

  await reset('pending'); await body.fill('Submitted while unmounted'); await submit();
  await page.waitForFunction(() => !!window.completePending);
  await expect(body).toBeDisabled(); await expect(page.getByLabel('編集する作者別案', { exact: true })).toBeDisabled();
  await page.evaluate(() => window.hide()); await page.evaluate(() => window.completePending());
  await page.waitForFunction(() => window.completed); await page.evaluate(() => window.mount('normal'));
  await expect(body).toHaveValue('Submitted while unmounted'); await body.fill('Fresh edit after remount'); await submit();
  await page.waitForFunction(() => window.completed); await expect(page.getByRole('alert')).toHaveCount(0);
  assert.equal(await page.evaluate(() => window.saved[0].versions.at(-1).content.entities[0].data.body[0].text), 'Fresh edit after remount');
  checks.push('pending-save-controls-and-unmounted-acknowledgement');

  await reset('pending'); await body.fill('Submitted before later input'); await submit();
  await page.waitForFunction(() => !!window.completePending);
  await page.evaluate(() => window.originalPendingCompletion = window.completePending);
  await page.evaluate(() => window.hide()); await page.evaluate(() => window.mount('normal'));
  await expect(body).toHaveValue('Submitted before later input'); await body.fill('Newer retained input');
  await page.evaluate(() => window.hide()); await page.evaluate(() => window.originalPendingCompletion());
  await page.waitForFunction(() => window.completed); await page.evaluate(() => window.mount('normal'));
  await expect(body).toHaveValue('Newer retained input'); await submit(); await page.waitForFunction(() => window.completed);
  await expect(page.getByRole('alert')).toHaveCount(0);
  assert.equal(await page.evaluate(() => window.saved[0].versions.at(-1).content.entities[0].data.body[0].text), 'Newer retained input');
  checks.push('old-save-acknowledgement-preserves-and-rebases-later-input');

  await reset('normal'); await body.focus(); await body.press('Control+Home'); await page.keyboard.insertText('X'); await submit();
  await page.waitForFunction(() => window.completed);
  const unicode = await page.evaluate(() => {
    const head = window.saved[0].versions.at(-1).content;
    return { body: head.entities[0].data.body, anchor: head.entities.find(entity => entity.id === window.fixtureIds.disclosure).data.anchor };
  });
  assert.equal(unicode.body[0].id, ids.originalBlock); assert.equal(unicode.body[0].text, 'X😀門');
  assert.equal(unicode.anchor.start, 2); assert.equal(unicode.anchor.end, 3); assert.equal(unicode.anchor.positionStatus, undefined);
  checks.push('unicode-prefix-keeps-external-disclosure-on-the-original-word');

  await page.evaluate(() => window.mountReading());
  await page.getByLabel('読む作品の版', { exact: true }).selectOption(ids.snapshot);
  assert.equal(await page.evaluate(() => window.readingFixtureValid), true);
  await expect(page.locator('.chapter-reading-sequence > li')).toHaveCount(1);
  await expect(page.getByRole('button', { name: '記録付き読書を始める', exact: true })).toBeEnabled();
  await page.getByRole('button', { name: 'Sceneの固定版を開く', exact: true }).click();
  assert.deepEqual(await page.evaluate(() => window.openedTarget), { entityId: ids.scene, sourceVersionId: ids.snapshot });
  assert.equal(await page.evaluate(() => window.openedCurrent), null);
  await page.getByRole('button', { name: '記録付き読書を始める', exact: true }).click();
  await page.getByRole('button', { name: '次の場面を提示', exact: true }).click();
  await expect(page.locator('.chapter-reading-presented')).toHaveAttribute('data-presented-scene-id', ids.scene);
  await page.getByRole('button', { name: 'Sceneの固定版を開く', exact: true }).click();
  assert.deepEqual(await page.evaluate(() => window.openedTarget), { entityId: ids.scene, sourceVersionId: ids.snapshot });
  assert.equal(await page.evaluate(() => window.openedCurrent), null);
  checks.push('deleted-current-scene-reads-and-opens-the-exact-fixed-version');

  await page.evaluate(() => window.mountRepeatedEdit()); await expect(body).toHaveValue('😀同じ\n😀同じ');
  assert.equal(await page.evaluate(() => window.repeatedFixture.valid), true);
  await body.focus(); await body.press('Control+Home'); await page.keyboard.insertText('😀同じ\n'); await save.click();
  await page.waitForFunction(() => !!window.repeatedSaved);
  const repeated = await page.evaluate(() => {
    const fixture = window.repeatedFixture, head = window.repeatedSaved[0].versions.at(-1).content;
    return { fixture, blocks: head.entities[0].data.body, current: head.entities.find(entity => entity.id === fixture.currentId).data.anchor, historical: head.entities.find(entity => entity.id === fixture.historicalId).data.anchor, relation: head.relations[0].validity.presentationAnchor };
  });
  assert.equal(repeated.blocks.length, 3); assert.deepEqual(repeated.blocks.slice(1).map(block => block.id), repeated.fixture.originalIds);
  assert.notEqual(repeated.blocks[0].id, repeated.fixture.originalIds[0]);
  assert.equal(repeated.current.blockId, repeated.fixture.originalIds[0]); assert.equal(repeated.current.positionStatus, undefined);
  assert.equal(repeated.current.start, 1); assert.equal(repeated.current.end, 3);
  assert.equal(repeated.relation.blockId, repeated.fixture.originalIds[0]); assert.equal(repeated.relation.positionStatus, undefined);
  assert.deepEqual(repeated.historical, repeated.fixture.historicalAnchor);
  checks.push('selected-duplicate-prefix-keeps-entity-and-relation-origins-and-fixed-anchors');

  await page.evaluate(() => window.mountGeneric());
  const entityPicker = page.getByLabel('別案内の編集対象', { exact: true });
  await expect(page.getByLabel('別案内の情報名', { exact: true })).toHaveValue('Integer');
  assert.equal(await page.evaluate(() => window.genericValid), true);
  const genericIds = await page.evaluate(() => window.genericIds);
  await page.getByLabel('別案に追加する情報の種類', { exact: true }).selectOption('variable');
  await page.getByLabel('別案に追加する情報の名前', { exact: true }).fill('New Bool');
  await page.getByRole('button', { name: '別案に情報を追加', exact: true }).click();
  await page.getByLabel('一意の状態キー', { exact: true }).fill('branch_flag');
  await page.getByLabel('値の型', { exact: true }).selectOption('boolean');
  await page.getByLabel('真偽値', { exact: true }).selectOption('true');
  await save.click(); await page.waitForFunction(() => window.genericSaveCount === 1);
  const newBoolean = await page.evaluate(() => window.genericSaved[0].versions.at(-1).content.entities.find(entity => entity.name === 'New Bool'));
  assert.equal(newBoolean.kind, 'variable'); assert.deepEqual(newBoolean.data.initial, { type: 'boolean', value: true });
  await entityPicker.selectOption(genericIds.effect);
  await page.getByLabel('操作の対象', { exact: true }).selectOption(newBoolean.id);
  await page.getByLabel('操作', { exact: true }).selectOption('reset');
  await entityPicker.selectOption(genericIds.node);
  await page.getByLabel('条件の真偽', { exact: true }).selectOption('false');
  await save.click(); await page.waitForFunction(() => window.genericSaveCount === 2);
  const genericHead = await page.evaluate(() => window.genericSaved[0].versions.at(-1).content);
  assert.equal(genericHead.entities.find(entity => entity.id === genericIds.effect).data.targetId, newBoolean.id);
  assert.equal(genericHead.entities.find(entity => entity.id === genericIds.effect).data.operation, 'reset');
  assert.deepEqual(genericHead.entities.find(entity => entity.id === genericIds.node).data.gate, { op: 'constant', value: false });
  assert.equal(await page.evaluate(() => window.genericCanonical()), await page.evaluate(() => window.genericCanonicalBefore));
  assert.deepEqual(await page.evaluate(() => window.genericSaved[0].versions[0]), await page.evaluate(() => window.genericOldVersion));
  checks.push('branch-only-variable-effect-and-flow-fields-save-without-mutating-canonical-or-old-version');

  await entityPicker.selectOption(genericIds.integer);
  const minimum = page.getByRole('textbox', { name: '最小値', exact: true });
  await minimum.fill('-');
  await page.waitForFunction(() => window.genericDirty());
  const genericBranchIds = await page.evaluate(() => window.genericSaved.map(branch => branch.id));
  await page.getByLabel('編集する作者別案', { exact: true }).focus();
  await page.getByLabel('編集する作者別案', { exact: true }).selectOption(genericBranchIds[1]);
  await expect(minimum).toHaveValue('0');
  await page.getByLabel('編集する作者別案', { exact: true }).focus();
  await page.getByLabel('編集する作者別案', { exact: true }).selectOption(genericBranchIds[0]);
  await expect(minimum).toHaveValue('-');
  await entityPicker.selectOption(genericIds.node);
  await expect(page.getByLabel('別案内の情報名', { exact: true })).toHaveValue('Node');
  await entityPicker.selectOption(genericIds.integer); await expect(minimum).toHaveValue('-');
  await save.click();
  await expect(page.getByRole('alert').filter({ hasText: '入力中の未確定な値を確認してから版を保存してください。' })).toBeVisible();
  assert.equal(await page.evaluate(() => window.genericSaveCount), 2);
  await minimum.fill('0'); await save.click(); await page.waitForFunction(() => window.genericSaveCount === 3);
  await expect(page.getByRole('alert')).toHaveCount(0);
  assert.equal(await page.evaluate(() => window.genericCanonical()), await page.evaluate(() => window.genericCanonicalBefore));
  assert.deepEqual(await page.evaluate(() => window.genericSaved[0].versions[0]), await page.evaluate(() => window.genericOldVersion));
  checks.push('invalid-structured-raw-retains-across-branch-and-entity-switches-and-blocks-version-save');

  for (const fixed of [false, true]) for (const recorded of [false, true]) {
    await page.evaluate(() => window.mountReadingLinks());
    await expect(page.getByRole('button', { name: 'pinned', exact: true })).toBeVisible();
    const fixture = await page.evaluate(() => window.readingLinks);
    assert.equal(fixture.valid, true, 'Reading links must resolve against actual hashed editions.');
    if (fixed) await page.getByLabel('読む作品の版', { exact: true }).selectOption(fixture.readingEditionId);
    if (recorded) {
      await page.getByRole('button', { name: '記録付き読書を始める', exact: true }).click();
      await page.getByRole('button', { name: '次の場面を提示', exact: true }).click();
      await expect(page.locator('.chapter-reading-presented')).toBeVisible();
    }
    await page.getByRole('button', { name: 'pinned', exact: true }).click();
    assert.deepEqual(await page.evaluate(() => window.openedReadingLink), fixture.pinned, 'An explicit older edition, block and Unicode span must survive every reading mode.');
    assert.equal(await page.evaluate(() => window.openedReadingEntity), null, 'Exact targets must use the complete anchor callback.');
    await page.getByRole('button', { name: 'ordinary', exact: true }).click();
    assert.deepEqual(await page.evaluate(() => window.openedReadingLink), { ...fixture.ordinary, ...(fixed ? { sourceVersionId: fixture.readingEditionId } : {}) }, 'An unpinned target must retain its block/span and inherit the chosen reading edition.');
  }
  checks.push('reading-inline-targets-preserve-explicit-edition-and-inherit-fixed-edition-with-block-and-span');
  await page.evaluate(() => window.mountPendingReading());
  const pendingFixture = await page.evaluate(() => window.pendingReading);
  assert.equal(pendingFixture.valid, true, 'Pending operations must use valid content and a real hashed snapshot.');
  const readingNext = page.getByRole('button', { name: '次の場面を提示', exact: true });
  const readingBack = page.getByRole('button', { name: '一場面戻る', exact: true });
  const readingVersion = page.getByLabel('読む作品の版', { exact: true });
  const presented = page.locator('.chapter-reading-presented');
  await page.getByRole('button', { name: '記録付き読書を始める', exact: true }).click();
  await readingNext.click();
  await expect(presented).toHaveAttribute('data-presented-scene-id', pendingFixture.firstId);
  await readingVersion.selectOption(pendingFixture.snapshotId);
  await page.getByRole('button', { name: '自分で経路を作る', exact: true }).click();
  await page.getByLabel('経路に加える場面', { exact: true }).selectOption(pendingFixture.firstId);
  await page.getByRole('button', { name: '経路の末尾に加える', exact: true }).click();
  await page.getByLabel('経路に加える場面', { exact: true }).selectOption(pendingFixture.secondId);
  await page.getByRole('button', { name: '経路の末尾に加える', exact: true }).click();
  const assertPendingControls = async () => {
    await expect(readingNext).toBeDisabled(); await expect(readingBack).toBeDisabled(); await expect(readingVersion).toBeDisabled();
    await expect(page.getByRole('button', { name: '読み直す', exact: true })).toBeDisabled();
    await expect(page.getByRole('button', { name: '選んだ章の順', exact: true })).toBeDisabled();
    await expect(page.getByRole('button', { name: '自分で経路を作る', exact: true })).toBeDisabled();
    await expect(page.getByLabel('経路に加える場面', { exact: true })).toBeDisabled();
    await expect(page.getByRole('button', { name: '経路の末尾に加える', exact: true })).toBeDisabled();
    for (const control of await page.locator('.reading-route-draft button').all()) await expect(control).toBeDisabled();
  };
  await page.evaluate(() => {
    window.armReadingCapture();
    const restart = [...document.querySelectorAll('button')].find(button => button.textContent === '読み直す');
    restart.click(); restart.click();
    [...document.querySelectorAll('button')].find(button => button.textContent === '次の場面を提示').click();
    [...document.querySelectorAll('button')].find(button => button.textContent === '一場面戻る').click();
  });
  await page.waitForFunction(() => typeof window.completeReadingCapture === 'function');
  await assertPendingControls();
  assert.equal(await page.evaluate(() => window.pendingReading.digestCalls), 1, 'Same-turn duplicate starts must capture one edition.');
  await expect(presented).toHaveAttribute('data-presented-scene-id', pendingFixture.firstId);
  await page.evaluate(() => window.completeReadingCapture());
  await expect(readingNext).toBeEnabled(); await expect(presented).toHaveCount(0);
  await readingNext.click();
  await expect(presented).toHaveAttribute('data-presented-scene-id', pendingFixture.firstId);
  await page.evaluate(() => {
    const save = [...document.querySelectorAll('button')].find(button => button.textContent === '開始状態と経路を保存');
    save.click(); save.click();
    [...document.querySelectorAll('button')].find(button => button.textContent === '次の場面を提示').click();
    [...document.querySelectorAll('button')].find(button => button.textContent === '一場面戻る').click();
  });
  await page.waitForFunction(() => typeof window.completeReadingSave === 'function');
  await assertPendingControls();
  await expect(presented).toHaveAttribute('data-presented-scene-id', pendingFixture.firstId);
  const savedPending = await page.evaluate(() => window.pendingReading);
  assert.equal(savedPending.saveCalls, 1, 'Same-turn duplicate saves must issue one host command.');
  assert.equal(savedPending.savedRecord.entities.find(entity => entity.kind === 'trace').data.readingPath.occurrences.length, 1, 'The saved evidence must contain exactly the presented scene.');
  await page.evaluate(() => window.completeReadingSave());
  await expect(readingNext).toBeEnabled();
  await expect(presented).toHaveAttribute('data-presented-scene-id', pendingFixture.firstId);
  await readingNext.click(); await expect(presented).toHaveAttribute('data-presented-scene-id', pendingFixture.secondId);
  await readingBack.click(); await expect(presented).toHaveAttribute('data-presented-scene-id', pendingFixture.firstId);
  await page.getByRole('button', { name: '選んだ章の順', exact: true }).click();
  await expect(page.locator('.reading-chapter-picker input')).toBeEnabled();
  checks.push('chapter-capture-and-save-serialize-same-turn-operations-and-freeze-progression-route-and-edition');
  assert.deepEqual(pageErrors, [], 'Browser fixture must have no uncaught application errors.');
} catch (error) {
  failure = error instanceof Error ? error.stack : String(error);
  if (page) await page.screenshot({ path: path.join(output, 'failure.png'), timeout: 8000 }).catch(() => {});
  process.exitCode = 1;
} finally {
  await browser?.close(); await server?.close();
  await writeFile(path.join(output, 'results.json'), JSON.stringify({ engine, environment: { platform: process.platform, osVersion: release(), browserVersion, userAgent, physicalDevice: false }, scope: 'isolated author components with an in-memory host; native/App acceptance excluded', startedAt, finishedAt: new Date().toISOString(), checks, pageErrors, failure }, null, 2));
}
console.log(JSON.stringify({ engine, checksPassed: checks.length, output, ...(failure ? { failure } : {}) }));
