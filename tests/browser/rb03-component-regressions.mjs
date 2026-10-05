import { chromium, firefox, webkit } from '@playwright/test';
import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

// Run against Vite dev so these isolated component fixtures use the production source modules.
// Native transaction and complete App coverage are in tests/e2e/world-workspace.spec.ts.
const engine = process.env.RB03_ENGINE ?? 'chromium';
const launcher = { chromium, firefox, webkit }[engine];
if (!launcher) throw new Error(`Unknown RB03_ENGINE: ${engine}`);
const baseURL = process.env.RB03_DEV_URL ?? 'http://127.0.0.1:5213/shinariokanri/';
const output = process.env.RB03_OUTPUT_DIR ?? 'test-results/rb03-components';
await mkdir(output, { recursive: true });
const browser = await launcher.launch(engine === 'chromium' && process.env.RB03_CHROMIUM_PATH ? { executablePath: process.env.RB03_CHROMIUM_PATH, args: ['--no-sandbox'] } : {});
const checks = [], errors = [];

async function mount(kind, width = 1440) {
  const page = await browser.newPage({ viewport: { width, height: 1000 } });
  page.on('pageerror', error => errors.push(`${kind}: ${error.message}`));
  await page.goto(baseURL);
  await page.evaluate(async ({ kind, base }) => {
    const source = await (await fetch(`${base}src/ui/TimelineEditors.tsx`)).text(), main = await (await fetch(`${base}src/main.tsx`)).text();
    const reactURL = source.match(/from ["']([^"']*\/react\.js\?v=[a-f0-9]+)["']/)?.[1], rootURL = main.match(/from ["']([^"']*\/react-dom_client\.js\?v=[a-f0-9]+)["']/)?.[1];
    if (!reactURL || !rootURL) throw new Error('The fixture requires a running Vite dev server.');
    const { default: React } = await import(reactURL);
    const { default: { createRoot } } = await import(rootURL);
    const { createProject, createEntity, emptyValidity, validateProject, newId } = await import(`${base}src/domain/model.ts`);
    const p = createProject(`RB03 ${kind}`), add = (project, type, name, data = {}) => { const entity = createEntity(project.projectId, type, name, data); project.entities.push(entity); return entity; };
    const event = add(p, 'event', '日時保存の出来事', { laneRole: 'common', time: { mode: 'instant', at: '0', calendarId: p.calendarId } });
    let Component, extra = {}, snapshots = {};
    if (kind === 'date') Component = (await import(`${base}src/ui/TimelineEditors.tsx`)).TimelineTimeEditor;
    else if (kind === 'calendar') Component = (await import(`${base}src/ui/WorldCalendars.tsx`)).WorldCalendars;
    else if (kind === 'relations') {
      Component = (await import(`${base}src/ui/Relationships.tsx`)).Relationships;
      const a = add(p, 'character', '人物A'), b = add(p, 'character', '人物B');
      p.relations = [{ id: newId(), projectId: p.projectId, revision: '0', fromId: a.id, toId: b.id, relationType: 'trust', direction: 'forward', validity: { ...emptyValidity(), worldRange: { start: '0', end: '2' } }, evidenceIds: [], status: 'provisional', visibility: 'private' }];
      p.views = [{ id: newId(), name: '保存した別時点', view: 'relation_graph', entityIds: [], settings: { layout: JSON.stringify({ positions: {}, filters: { at: '7', checkpoint: 'bad', focus: b.id, mode: 'table', hops: '2' }, zoom: 1 }) } }];
      const user = `rb03-view-${newId()}`; localStorage.setItem('scenario-local-view-user', user);
      const key = device => `scenario-relations:v1:${user}:${p.projectId}:${device}`;
      localStorage.setItem(key('desktop'), JSON.stringify({ positions: { [a.id]: { x: 120, y: 100 } }, filters: {}, zoom: 1 }));
      localStorage.setItem(key('phone'), JSON.stringify({ positions: { [a.id]: { x: 400, y: 300 } }, filters: { mode: 'graph', at: '9', checkpoint: 'bad', focus: a.id, query: 'old', category: 'family', hierarchy: false, unknown: false, hops: '2', scrollX: '0', scrollY: '0' }, zoom: 1 }));
      extra = { selectedId: a.id }; window.fixtureIds = { a: a.id, b: b.id };
    } else if (kind === 'world-context') {
      Component = (await import(`${base}src/ui/WorldPanel.tsx`)).WorldPanel;
      const { createWorldSnapshot } = await import(`${base}src/domain/world.ts`);
      let world = createProject('公開名の共通世界'); const alias = { id: newId(), text: '旅人', reading: 'たびびと', validity: emptyValidity(), audienceHolderIds: [], isPublicDefault: true };
      const borrowed = add(world, 'character', '共有世界の秘密本名', { aliases: [alias] }); world = await createWorldSnapshot(world, '名前の固定版'); const snapshot = world.snapshots[0]; snapshots = { [snapshot.id]: snapshot.content };
      p.worldReferences = [{ projectId: world.projectId, immutableSnapshotId: snapshot.id, contentHash: snapshot.contentHash }];
      const localAlias = { ...alias, id: newId(), text: '作品の公開名' }, local = add(p, 'character', '作品内人物', { aliases: [localAlias] });
      const profile = add(p, 'projection_profile', '作品の限定投影', { audience: 'reader', publicTitle: '読者版', allowedKinds: ['character'], includedIds: [local.id, borrowed.id], namePolicy: { mode: 'replace', replacement: '人物' } });
      localStorage.setItem(`scenario-world:v1:${p.projectId}`, JSON.stringify({ tab: 'maps', at: '0', checkpoint: '', holder: '' }));
      extra = { worlds: [world], selectedEntityId: borrowed.id, requestedSection: 'histories' }; window.fixtureIds = { borrowed: borrowed.id, local: local.id, localAlias: localAlias.id, alias: alias.id, profile: profile.id, world: world.projectId };
    } else if (kind === 'borrowed') {
      Component = (await import(`${base}src/ui/Timeline.tsx`)).Timeline;
      const { createWorldSnapshot } = await import(`${base}src/domain/world.ts`);
      let world = createProject('固定世界'); const character = add(world, 'character', '未採用の世界人物');
      const borrowed = add(world, 'event', '固定世界の出来事', { laneRole: 'both', participants: [{ characterId: character.id, role: 'actor' }], time: { mode: 'instant', at: '10', calendarId: p.calendarId } });
      world = await createWorldSnapshot(world, '世界の固定版'); const snapshot = world.snapshots[0]; snapshots = { [snapshot.id]: snapshot.content };
      p.worldReferences = [{ projectId: world.projectId, immutableSnapshotId: snapshot.id, contentHash: snapshot.contentHash }];
      const relation = { id: newId(), projectId: p.projectId, revision: '0', fromId: event.id, toId: borrowed.id, relationType: 'causes', direction: 'forward', validity: emptyValidity(), evidenceIds: [], status: 'provisional', visibility: 'private' }; p.relations = [relation];
      extra = { selectedId: borrowed.id, onAdd: () => {}, onSelect: id => { window.fixtureOpened = id; }, referenceEntities: snapshot.content.entities, referenceRelations: snapshot.content.relations, referenceCalendars: snapshot.content.calendars, adoptedReferenceIds: [] };
      window.fixtureIds = { event: event.id, borrowed: borrowed.id, character: character.id, relation: relation.id };
    }
    const initial = validateProject(p, { worldSnapshots: snapshots }); if (!initial.ok) throw new Error(initial.issues.map(issue => `${issue.path}: ${issue.message}`).join('\n'));
    const host = document.createElement('div'); document.body.replaceChildren(host); const root = createRoot(host);
    function Harness() {
      const [project, setProject] = React.useState(p), [open, setOpen] = React.useState(true), [at, setAt] = React.useState('0'), [checkpoint, setCheckpoint] = React.useState(''), [requestedSection, setRequestedSection] = React.useState(extra.requestedSection);
      window.fixtureProject = project; window.fixturePoint = { at, checkpoint };
      window.fixtureRequestSection = setRequestedSection;
      const save = async candidate => {
        const valid = validateProject(candidate, { worldSnapshots: snapshots }); if (!valid.ok) throw new Error(valid.issues.map(issue => issue.message).join('\n'));
        if (kind === 'date' || kind === 'calendar') await new Promise((resolve, reject) => { window.fixturePending = { candidate, resolve, reject }; });
        const saved = { ...candidate, revision: String(BigInt(project.revision) + 1n) }; setProject(saved); return saved;
      };
      if (kind === 'date') return open ? React.createElement(Component, { project, event: project.entities.find(item => item.id === event.id), onSave: save, onClose: () => setOpen(false), onApplied: changes => { window.fixtureChanges = changes; } }) : React.createElement('p', null, '保存完了');
      if (kind === 'calendar') return React.createElement(Component, { project, onSave: save });
      return React.createElement(Component, { ...extra, requestedSection, project, worldTick: at, checkpointId: checkpoint, onViewPointChange: (tick, id) => { setAt(tick); setCheckpoint(id); }, onOpen: (id, origin) => { window.fixtureOpened = id; window.fixtureOrigin = origin; }, onSave: async relation => { await save({ ...project, relations: project.relations.map(item => item.id === relation.id ? relation : item) }); }, onSaveProject: save });
    }
    root.render(React.createElement(Harness));
  }, { kind, base: new URL(baseURL).pathname });
  return page;
}

try {
  {
    const page = await mount('date'), dialog = page.getByRole('dialog'), input = dialog.getByLabel('出来事の世界内tick', { exact: true });
    const dateButton = dialog.getByRole('button', { name: '暦の年月日', exact: true }), tickButton = dialog.getByRole('button', { name: '世界内tick', exact: true }), previewButton = dialog.getByRole('button', { name: '変更前の影響を確認', exact: true });
    await dateButton.click(); const month = dialog.getByLabel('出来事の世界内tickの月', { exact: true }); await month.fill('13'); await dateButton.click(); assert.equal(await month.inputValue(), '13'); assert.equal(await previewButton.isDisabled(), true);
    await month.fill('-'); await dateButton.click(); assert.equal(await month.inputValue(), '-'); await tickButton.click(); await dateButton.click(); assert.equal(await month.inputValue(), '-'); assert.equal(await previewButton.isDisabled(), true); assert.equal(await dialog.getByRole('alert').count(), 1);
    await month.fill('1'); await tickButton.click();
    await input.fill('11'); await dialog.getByRole('button', { name: '変更前の影響を確認', exact: true }).click(); await dialog.getByRole('button', { name: '差分を一括確定', exact: true }).click();
    await page.waitForFunction(() => !!window.fixturePending); assert.equal(await input.isDisabled(), true); assert.equal(await dialog.getByLabel('日時の種類', { exact: true }).isDisabled(), true);
    await dialog.getByRole('button', { name: '閉じる', exact: true }).click(); assert.equal(await dialog.isVisible(), true);
    await page.evaluate(() => { window.fixturePending.reject(new Error('保存拒否の確認')); window.fixturePending = null; }); await dialog.getByRole('alert').filter({ hasText: '保存拒否の確認' }).waitFor();
    assert.equal(await input.inputValue(), '11'); assert.equal(await input.isDisabled(), false); assert.equal(await page.evaluate(() => window.fixtureProject.entities.find(item => item.kind === 'event').data.time.at), '0');
    await dialog.getByRole('button', { name: '差分を一括確定', exact: true }).click(); await page.waitForFunction(() => !!window.fixturePending); await page.evaluate(() => window.fixturePending.resolve()); await page.getByText('保存完了', { exact: true }).waitFor();
    assert.equal(await page.evaluate(() => window.fixtureProject.entities.find(item => item.kind === 'event').data.time.at), '11'); checks.push('Date format clicks/toggles retain invalid and partial calendar drafts; deferred save disables mutation/close; rejection retains draft; retry commits the reviewed tick.'); await page.close();
  }
  {
    const page = await mount('calendar'); await page.getByRole('button', { name: '独自暦を追加', exact: true }).click(); const dialog = page.getByRole('dialog'), input = dialog.getByLabel('暦の名称', { exact: true });
    await input.fill('遅い保存の暦'); await dialog.getByRole('button', { name: '規則変更の影響を確認', exact: true }).click(); await dialog.getByRole('button', { name: '確認した暦を保存', exact: true }).click(); await page.waitForFunction(() => !!window.fixturePending);
    assert.equal(await input.isDisabled(), true); assert.equal(await dialog.getByLabel('周期1年の1月の日数', { exact: true }).isDisabled(), true); await dialog.getByRole('button', { name: '閉じる', exact: true }).click(); assert.equal(await dialog.isVisible(), true);
    await page.evaluate(() => { window.fixturePending.reject(new Error('暦の保存拒否')); window.fixturePending = null; }); await dialog.getByRole('alert').filter({ hasText: '暦の保存拒否' }).waitFor(); assert.equal(await input.inputValue(), '遅い保存の暦'); assert.equal(await input.isDisabled(), false);
    await dialog.getByRole('button', { name: '確認した暦を保存', exact: true }).click(); await page.waitForFunction(() => !!window.fixturePending); await page.evaluate(() => window.fixturePending.resolve()); await dialog.waitFor({ state: 'hidden' });
    assert.ok(await page.evaluate(() => window.fixtureProject.calendars.some(item => item.name === '遅い保存の暦'))); checks.push('Deferred calendar save protects ordinary fields and preserves the draft after failure.'); await page.close();
  }
  {
    const page = await mount('relations'), ids = await page.evaluate(() => window.fixtureIds); const center = page.getByLabel('中心にする情報', { exact: true }); await center.selectOption(ids.b);
    await page.setViewportSize({ width: 600, height: 1000 }); await page.waitForFunction(() => document.querySelector('button.active')?.textContent === '関係表');
    assert.equal(await center.inputValue(), ids.b); assert.equal(await page.getByLabel('世界時点（tick）', { exact: true }).inputValue(), '0'); assert.equal(await page.getByLabel('関係を検索', { exact: true }).inputValue(), ''); assert.equal(await page.getByLabel('図の意味を選択', { exact: true }).inputValue(), 'all'); assert.equal(await page.getByLabel('関係の表示範囲', { exact: true }).inputValue(), '1');
    assert.equal(await page.getByLabel('階層を表示', { exact: true }).isChecked(), true); assert.equal(await page.getByLabel('未確認の時点・経路も表示', { exact: true }).isChecked(), true);
    await page.getByRole('button', { name: '関係図', exact: true }).click(); const a = page.locator('svg g[role="button"]').filter({ has: page.locator('text', { hasText: '人物A' }) }); await a.click(); assert.equal(await page.getByLabel('選択した項目の横位置').inputValue(), '400');
    await page.setViewportSize({ width: 1440, height: 1000 }); await page.waitForFunction(() => document.querySelector('input[aria-label="選択した項目の横位置"]')?.value === '120'); assert.equal(await center.inputValue(), ids.b); assert.equal(await page.getByRole('button', { name: '関係図', exact: true }).getAttribute('class'), 'active');
    await page.getByText('名前を付けた表示設定', { exact: true }).click(); await page.getByRole('button', { name: '保存した別時点', exact: true }).click(); await page.waitForFunction(() => window.fixturePoint.at === '7' && document.querySelector('input[aria-label="世界時点（tick）"]')?.value === '7'); assert.equal(await page.getByLabel('世界時点（tick）', { exact: true }).inputValue(), '7'); assert.equal(await page.evaluate(() => window.fixturePoint.checkpoint), '');
    checks.push('Rotation retains shared time, manual center and implicit defaults while restoring each device layout; named views update shared time.'); await page.screenshot({ path: path.join(output, `relations-${engine}.png`), fullPage: true }); await page.close();
  }
  {
    const page = await mount('borrowed', 390), ids = await page.evaluate(() => window.fixtureIds); await page.getByRole('button', { name: '固定版の出来事を開く', exact: true }).waitFor();
    assert.equal(await page.getByRole('button', { name: '選択した出来事の日時・制約', exact: true }).isDisabled(), true); assert.equal(await page.locator('.timeline-person-label').count(), 0);
    await page.getByRole('button', { name: '固定版の出来事を開く', exact: true }).click(); assert.equal(await page.evaluate(() => window.fixtureOpened), ids.borrowed);
    await page.getByRole('button', { name: '出来事一覧', exact: true }).click(); await page.locator(`[data-event-id="${ids.borrowed}"]`).waitFor();
    await page.getByRole('button', { name: '一覧から関係を追加', exact: true }).click(); const dialog = page.getByRole('dialog'); await dialog.getByLabel('年表の関係の種類').selectOption('causes'); await dialog.getByLabel('年表の関係の始点', { exact: true }).selectOption(ids.event); await dialog.getByLabel('年表の関係の終点', { exact: true }).selectOption(ids.borrowed); await dialog.getByRole('button', { name: '関係を保存', exact: true }).click(); await dialog.waitFor({ state: 'hidden' });
    assert.equal(await page.evaluate(() => window.fixtureProject.entities.length), 1); assert.ok(await page.evaluate(ids => window.fixtureProject.relations.some(item => item.fromId === ids.event && item.toId === ids.borrowed), ids)); assert.ok(await page.evaluate(ids => window.fixtureProject.relations.some(item => item.id === ids.relation), ids));
    checks.push('Fixed-world events are reachable and read-only, explicit empty adoption hides foreign person lanes, and local links retain immutable endpoints without copying entities.'); await page.screenshot({ path: path.join(output, `borrowed-${engine}.png`), fullPage: true }); await page.close();
  }
  {
    const page = await mount('world-context', 390), ids = await page.evaluate(() => window.fixtureIds), historyTab = page.getByRole('tab', { name: '状態・生涯・履歴', exact: true }), mapTab = page.getByRole('tab', { name: '地図・場所・移動', exact: true });
    await page.locator('#world-tab-histories').getByRole('heading', { name: '共有世界の秘密本名の生涯', exact: true }).waitFor(); assert.equal(await historyTab.getAttribute('aria-selected'), 'true');
    await mapTab.click(); assert.equal(await mapTab.getAttribute('aria-selected'), 'true'); await page.getByRole('tab', { name: '別名・正体・公開名', exact: true }).click(); const names = page.locator('#world-tab-names');
    await names.getByLabel('別名を管理する対象', { exact: true }).selectOption(ids.local); await names.getByLabel('公開名を指定する限定投影設定', { exact: true }).selectOption(ids.profile); await names.getByLabel('限定投影で公開する別名', { exact: true }).selectOption(ids.localAlias); assert.equal(await names.getByRole('button', { name: '限定投影へ公開名を指定', exact: true }).isDisabled(), false);
    await names.getByLabel('別名を管理する対象', { exact: true }).selectOption(ids.borrowed); assert.equal(await names.getByLabel('公開名を指定する限定投影設定', { exact: true }).isDisabled(), true); assert.equal(await names.getByLabel('限定投影で公開する別名', { exact: true }).isDisabled(), true); assert.equal(await names.getByRole('button', { name: '限定投影へ公開名を指定', exact: true }).isDisabled(), true); assert.equal(await names.locator('[aria-label="公開向けの表示名"] strong').innerText(), '旅人'); assert.ok((await names.innerText()).includes('限定投影への公開名指定は未対応'));
    await names.getByRole('button', { name: '共通世界の元情報を開く', exact: true }).click(); assert.equal(await page.evaluate(() => window.fixtureOpened), ids.borrowed); assert.equal(await page.evaluate(() => window.fixtureOrigin), ids.world); assert.equal(await page.evaluate(() => window.fixtureProject.revision), '0');
    await page.evaluate(() => window.fixtureRequestSection('maps')); await mapTab.waitFor(); await page.waitForFunction(() => document.querySelector('[aria-controls="world-tab-maps"]')?.getAttribute('aria-selected') === 'true');
    await page.evaluate(() => window.fixtureRequestSection('histories')); await page.waitForFunction(() => document.querySelector('[aria-controls="world-tab-histories"]')?.getAttribute('aria-selected') === 'true');
    checks.push('Requested history overrides a persisted map tab, manual tabs remain usable, prop changes navigate, and borrowed public-alias settings are disabled with source-world guidance.'); await page.close();
  }
  assert.deepEqual(errors, []); await writeFile(path.join(output, `regressions-${engine}.json`), JSON.stringify({ generatedAt: new Date().toISOString(), engine, fixtureScope: 'isolated production components; native App transactions tested separately', checks, errors }, null, 2));
  console.log(`RB03 ${engine}: ${checks.length} component regression groups passed.`);
} finally { await browser.close(); }
