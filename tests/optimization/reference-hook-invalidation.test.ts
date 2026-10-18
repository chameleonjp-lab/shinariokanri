import {it} from 'vitest';
import {createServer} from 'vite';
import {chromium,expect} from '@playwright/test';
import type {AddressInfo} from 'node:net';

it('rechecks component-held ready rows on nested schema edits and revoked ownership in a native browser',async()=>{
  const server=await createServer({configFile:false,root:process.cwd(),appType:'mpa',logLevel:'silent',server:{host:'127.0.0.1',port:0}});
  let browser:Awaited<ReturnType<typeof chromium.launch>>|undefined;
  try{
    await server.listen();const address=server.httpServer!.address() as AddressInfo;
    browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH||'/usr/bin/chromium',args:['--no-sandbox']});
    const page=await browser.newPage();
    await page.goto(`http://127.0.0.1:${address.port}/tests/optimization/reference-hook-harness.html`);
    await expect(page.locator('[data-phase]')).toHaveText('ready');await expect(page.locator('[data-count]')).toHaveText('0');
    await page.getByRole('button',{name:'意味を変更',exact:true}).click();
    await expect(page.locator('[data-count]')).toHaveText('1');await expect(page.locator('[data-names]')).toHaveText('schemaで参照になる行');
    await page.getByRole('button',{name:'権限を失効し意味を戻す',exact:true}).click();
    await expect(page.locator('[data-count]')).toHaveText('0');
  }finally{await browser?.close();await server.close();}
},60000); // Additional counterexample; original browser/unit conditions unchanged.
