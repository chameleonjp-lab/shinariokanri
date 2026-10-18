import {expect, test} from '@playwright/test';
import {navigateMeasuredApp} from '../../scripts/acceptance/navigation';
import {createProject} from '../../src/domain/model';
import {exportScenario} from '../../src/storage/archive';
import {backup, seed} from './ap04-original-helpers';

test('measurement navigation waits for validated asynchronous selection before opening the 390px menu', async ({page}, info) => {
  const project = createProject('計測中も読込完了後の通常メニューで移動');
  await seed(page, await exportScenario(project));
  const before = (await backup(page)).project;
  await page.setViewportSize({width: 390, height: 844});
  await page.getByRole('button', {name: 'メニューを開く', exact: true}).click();
  await page.locator('.project-switch').click();
  await page.evaluate(projectId => {
    const gate = {entered: false, release: () => {}};
    (window as unknown as {navigationGate: typeof gate}).navigationGate = gate;
    const held = new Promise<void>(resolve => {gate.release = resolve;}), digest = crypto.subtle.digest.bind(crypto.subtle);
    crypto.subtle.digest = async (...args) => {
      let header = false;
      try {const value = JSON.parse(new TextDecoder().decode(args[1])); header = value.projectId === projectId && Array.isArray(value.entityIds);} catch {}
      if (header) {gate.entered = true; await held;}
      return digest(...args);
    };
  }, project.projectId);
  await page.locator('.project-card').filter({hasText: project.name}).click();
  await expect.poll(() => page.evaluate(() => (window as unknown as {navigationGate: {entered: boolean}}).navigationGate.entered)).toBe(true);
  await expect(page.locator('.app-shell')).toHaveCount(0);
  const waitingMenuVisible = await page.getByRole('button', {name: 'メニューを開く', exact: true}).isVisible();
  expect(waitingMenuVisible).toBe(false);
  // This new diagnostic deadline does not change any original runner deadline.
  page.setDefaultTimeout(5000);
  const navigation = navigateMeasuredApp(page, /^構成/).then(() => ({completed: true, error: ''}), error => ({completed: false, error: String(error)}));
  await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
  await page.evaluate(() => (window as unknown as {navigationGate: {release: () => void}}).navigationGate.release());
  await expect(page.locator('.app-shell')).toBeVisible();
  const actual = await navigation;
  await info.attach('actual-asynchronous-selection-menu.png', {body: await page.screenshot(), contentType: 'image/png'});
  await info.attach('actual-asynchronous-selection-menu.json', {body: Buffer.from(JSON.stringify({waitingMenuVisible, actual, physicalDevice: false, scope: 'Additional controlled-selection timing diagnostic; original 120000ms failure is retained separately.'})), contentType: 'application/json'});
  expect(actual.completed, actual.error).toBe(true);
  await expect(page.locator('.workspace-heading h1')).toHaveText('構成');
  const after = (await backup(page)).project;
  expect(after).toEqual(before);
});
