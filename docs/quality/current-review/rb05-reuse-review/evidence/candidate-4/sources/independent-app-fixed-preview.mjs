import {chromium,expect} from '@playwright/test';
import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
const browser=await chromium.launch({headless:true,executablePath:'/usr/bin/chromium',args:['--no-sandbox']});
const context=await browser.newContext({viewport:{width:1024,height:768}}),page=await context.newPage(),errors=[];
page.setDefaultTimeout(10000);page.on('pageerror',e=>errors.push(e.message));
const fixture=JSON.parse(readFileSync('/tmp/shinariokanri-independent-rb05-reuse-4-nested-fixtures/S5F11.json','utf8'));
const project=fixture.project,source=project.entities.find(e=>e.name==='内側の元本文'),outer=project.entities.find(e=>e.name==='外側共通元'),pin=project.snapshots.find(s=>s.versionLabel==='外側の固定共通元');
source.data.body=[{id:crypto.randomUUID(),kind:'paragraph',text:'外側へ',links:[{start:0,end:3,target:{entityId:outer.id,sourceVersionId:pin.id}}]}];
let result;
try{
 await page.goto('http://127.0.0.1:4192/shinariokanri/independent-app-harness.html');await page.waitForFunction(()=>!!window.controls);await page.evaluate(p=>window.controls.install(p),project);await page.reload();await page.locator('.app-shell').waitFor({state:'visible'});
 const menu=page.getByRole('button',{name:'メニューを開く'});if(await menu.isVisible())await menu.click();await page.locator('.sidebar').getByRole('button',{name:/^検索/}).first().click();
 await page.getByLabel('作品内を検索').fill('内側の元本文');await page.locator('.entity-card').filter({hasText:'内側の元本文'}).first().click();const editor=page.locator('.detail-panel');await editor.getByRole('tab',{name:'確認表示',exact:true}).click();await editor.getByRole('button',{name:'外側へ',exact:true}).click();
 const modal=page.getByRole('dialog',{name:'固定版の参照先',exact:true});await expect(modal).toBeVisible();const observed=await modal.innerText();result={id:'S5V07 explicit outer fixed reference renders inherited body',status:'pending',observed,pageErrors:errors};await expect(modal).toContainText('内側に固定した本文');result.status='passed';
}catch(e){result={...result,id:'S5V07 explicit outer fixed reference renders inherited body',status:'failed',error:e.message,pageErrors:errors,body:(await page.locator('body').innerText()).slice(-4000)};}
const persisted=await page.evaluate(()=>window.controls.read());mkdirSync('/tmp/shinariokanri-independent-rb05-reuse-4-preview-fixtures',{recursive:true});writeFileSync('/tmp/shinariokanri-independent-rb05-reuse-4-preview-fixtures/S5V07.json',JSON.stringify({inputProject:project,persistedProject:persisted},null,2)+'\n');writeFileSync('/tmp/shinariokanri-independent-rb05-reuse-4-fixed-preview-browser.json',JSON.stringify({environment:{browser:await browser.version(),executable:'/usr/bin/chromium',viewport:'1024x768',build:'Vite development; actual App and native IndexedDB'},result},null,2)+'\n');await context.close();await browser.close();console.log(JSON.stringify(result,null,2));process.exitCode=result.status==='failed'?1:0;
