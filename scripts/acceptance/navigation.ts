import type {Page} from '@playwright/test';

/** Follow normal menu controls after selecting a work. */
export async function navigateMeasuredApp(page: Page, name: RegExp) {
  // The library publishes the editor only after asynchronous validation.
  // Reading menu visibility while still in the library would skip opening it.
  await page.locator('.app-shell').waitFor();
  const menu = page.getByRole('button', {name: 'メニューを開く', exact: true});
  if (await menu.isVisible()) await menu.click();
  await page.locator('.sidebar').getByRole('button', {name}).first().click();
}
