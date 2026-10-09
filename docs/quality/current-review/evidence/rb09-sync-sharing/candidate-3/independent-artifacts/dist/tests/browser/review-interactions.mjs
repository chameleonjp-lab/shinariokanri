import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { createServer } from 'vite';
import { chromium, firefox, webkit, expect } from '@playwright/test';

// Real browser source-component host with delayed persistence; native App checks are separate.
const engine = process.env.REVIEW_ENGINE ?? 'chromium';
const output = await mkdtemp(path.join(process.env.REVIEW_OUTPUT_DIR ?? tmpdir(), `review-interactions-${engine}-`));
const checks = [], errors = [];
let server, browser, page, failure;
const source = String.raw`
import React from 'react';
import {createRoot} from 'react-dom/client';
import {Reader} from '/src/ui/Reader.tsx';
import {ProjectInfo} from '/src/ui/WorkPage.tsx';
import {WorldCalendars} from '/src/ui/WorldCalendars.tsx';
import {projectSettingsDraft, acknowledgeSettingsDraft} from '/src/ui/projectSettingsDraft.ts';
import {createProject,createEntity,newId,textToRichText,validateProject} from '/src/domain/model.ts';
import {createWorldSnapshot} from '/src/domain/world.ts';
let p=createProject('対話回帰');
const note=createEntity(p.projectId,'note','参照先',{body:textToRichText('😀門の固定引用')}); p.entities=[note];
p=await createWorldSnapshot(p,'引用版'); const citation=p.snapshots[0];
const scene=createEntity(p.projectId,'scene','開始本文',{body:[{id:newId(),kind:'paragraph',text:'😀門へ',links:[{start:1,end:2,target:{entityId:note.id,sourceVersionId:citation.id,blockId:note.data.body[0].id,start:1,end:2}}]}]});
const a=createEntity(p.projectId,'flow_node','旧入口',{nodeType:'entry',sceneId:scene.id,executionPolicy:'first_match'});
const b=createEntity(p.projectId,'flow_node','途中',{nodeType:'automatic',executionPolicy:'first_match'});
const c=createEntity(p.projectId,'flow_node','完了',{nodeType:'terminal',terminalReason:'完了'});
const ab=createEntity(p.projectId,'flow_edge','入口から途中',{fromId:a.id,toId:b.id,edgeType:'automatic',priority:0});
const bc=createEntity(p.projectId,'flow_edge','途中から完了',{fromId:b.id,toId:c.id,edgeType:'automatic',priority:0});
p.entities.push(scene,a,b,c,ab,bc); p=await createWorldSnapshot(p,'旧試読版'); const edition=p.snapshots.at(-1);
const archived=structuredClone(p); for(const e of archived.entities.filter(e=>['flow_node','flow_edge'].includes(e.kind))){e.deletedAt='2026-10-08T00:00:00.000Z';e.deletionOperationId=newId();}
window.ids={a:a.id,b:b.id,c:c.id,edition:edition.id,citation:citation.id,anchor:{entityId:note.id,sourceVersionId:citation.id,blockId:note.data.body[0].id,start:1,end:2}};
window.fixtureValid=validateProject(p).ok;
const root=createRoot(document.getElementById('root'));
function ReaderHost({old=false,fail=false}){
 const [project,setProject]=React.useState(old?archived:p);
 window.publish=()=>setProject(window.savedProject);
 return React.createElement(Reader,{project,onOpen:id=>window.opened={entityId:id},onOpenTarget:anchor=>window.opened=anchor,onSaveMany:async(entities,reason,assets,snapshots)=>{
   window.saveCount++; await new Promise(resolve=>window.completePending=resolve);
   if(fail) throw new Error('容量不足');
   window.savedProject={...project,revision:String(Number(project.revision)+1),entities:[...project.entities,...entities],snapshots:[...project.snapshots,...snapshots]};
 }});
}
function SettingsHost({fail=false}){
 const [project,setProject]=React.useState(window.settingsProject),[draft,setDraft]=React.useState(window.settingsDraft),[pending,setPending]=React.useState(false),[visible,setVisible]=React.useState(true);
 window.hide=()=>setVisible(false);window.show=()=>setVisible(true);
 window.changedRevision=()=>setProject(old=>({...old,revision:String(Number(old.revision)+1),name:'外から変更'}));
 return visible?React.createElement(ProjectInfo,{project,initialDraft:draft,saving:pending,theme:'light',setTheme:()=>{},onOpen:()=>{},onSaveEntities:async()=>{},onSavingChange:setPending,onDraftChange:next=>{window.settingsDraft=next;setDraft(next);},onDraftSaved:(submitted,saved,consumed)=>{const next=acknowledgeSettingsDraft(window.settingsDraft,submitted,saved,consumed);window.settingsDraft=next;setDraft(next);},onSaveProject:async candidate=>{
  window.saveCount++; await new Promise(resolve=>window.completePending=resolve); if(fail)throw new Error('容量不足');
  const saved={...candidate,revision:String(Number(candidate.revision)+1)};window.settingsProject=saved;setProject(saved);return saved;
 }}):React.createElement('p',null,'別画面');
}
function CalendarHost({fail=false}){
 const [project,setProject]=React.useState(createProject('暦の回帰'));
 window.changedRevision=()=>setProject(old=>({...old,revision:String(Number(old.revision)+1)}));
 return React.createElement(WorldCalendars,{project,onSave:async candidate=>{window.saveCount++;window.calendarSaved=candidate;await new Promise(resolve=>window.completePending=resolve);if(fail)throw new Error('保存失敗');setProject({...candidate,revision:String(Number(candidate.revision)+1)});}});
}
window.mount=(kind,fail=false)=>{
window.saveCount=0;window.completePending=null;window.opened=null;window.savedProject=null;
root.render(React.createElement(React.Fragment,{key:newId()},kind==='settings'?(window.settingsProject=createProject('保存前'),window.settingsDraft=projectSettingsDraft(window.settingsProject),React.createElement(SettingsHost,{fail})):kind==='calendar'?React.createElement(CalendarHost,{fail}):React.createElement(ReaderHost,{old:kind==='old',fail})));
};
window.mount('old');
`;
try {
  server = await createServer({root:process.cwd(),base:'/',cacheDir:path.join(output,'vite'),server:{host:'127.0.0.1',port:0},plugins:[{
    name:'review-interactions',resolveId(id){if(id==='virtual:review-interactions')return '\0virtual:review-interactions';},load(id){if(id==='\0virtual:review-interactions')return source;},configureServer(vite){vite.middlewares.use(async(req,res,next)=>{if(req.url?.split('?')[0]!=='/__review_interactions')return next();try{res.setHeader('Content-Type','text/html');res.end(await vite.transformIndexHtml('/__review_interactions','<div id="root"></div><script type="module" src="/@id/virtual:review-interactions"></script>'));}catch(e){next(e);}});}
  }]});
  await server.listen();
  browser = await {chromium,firefox,webkit}[engine].launch(engine==='chromium'&&process.env.CHROMIUM_PATH?{executablePath:process.env.CHROMIUM_PATH,args:['--no-sandbox']}:{});
  page = await browser.newPage({viewport:{width:1440,height:1000}});page.on('pageerror',e=>errors.push(e.message));
  await page.goto(`${server.resolvedUrls.local[0]}__review_interactions`);
  await expect(page.getByRole('button',{name:'試読を始める',exact:true})).toBeVisible();
  assert.equal(await page.evaluate(()=>window.fixtureValid),true);
  const ids=await page.evaluate(()=>window.ids);
  await page.getByLabel('試読する作品版',{exact:true}).selectOption(ids.edition);
  await expect(page.getByRole('button',{name:'試読を始める',exact:true})).toBeEnabled();
  await page.getByRole('button',{name:'試読を始める',exact:true}).click();
  await expect(page.locator('.reader-sheet')).toContainText('開始本文');
  await page.getByRole('button',{name:'門',exact:true}).click();
  assert.deepEqual(await page.evaluate(()=>window.opened),ids.anchor);
  checks.push('RV05 old-edition-entry-after-current-archive','RV06 fixed-version-codepoint-anchor');
  await page.evaluate(()=>window.mount('reader'));
  await page.getByRole('button',{name:'試読を始める',exact:true}).click();
  const next=page.getByRole('button',{name:'進行規則に従って次へ',exact:true});
  await next.click();await expect(page.locator('.reader-sheet')).toContainText('途中');
  await page.getByRole('button',{name:'経路を記録',exact:true}).click();
  await page.waitForFunction(()=>!!window.completePending);
  await expect(next).toBeDisabled();await expect(page.getByRole('button',{name:'一手戻る',exact:true})).toBeDisabled();
  await page.evaluate(()=>window.completePending());
  await expect(next).toBeDisabled(); // Promise resolution alone cannot release an unacknowledged save.
  await page.evaluate(()=>window.publish());await expect(next).toBeEnabled();
  await next.click();await expect(page.locator('.reader-sheet')).toContainText('完了');
  assert.equal(await page.evaluate(()=>window.saveCount),1);
  checks.push('RV07 delayed-save-waits-for-props-before-continuing-without-position-rewind');
  await page.evaluate(()=>window.mount('reader',true));await page.getByRole('button',{name:'試読を始める',exact:true}).click();await next.click();
  await page.getByRole('button',{name:'経路を記録',exact:true}).click();await page.waitForFunction(()=>!!window.completePending);await page.evaluate(()=>window.completePending());
  await expect(page.getByRole('alert')).toHaveText('容量不足');await expect(next).toBeEnabled();await expect(page.locator('.reader-sheet')).toContainText('途中');
  checks.push('RV07 failed-save-retains-current-position-and-unlocks');
  await page.evaluate(()=>window.mount('settings'));
  const name=page.getByLabel('作品名',{exact:true}), save=page.getByRole('button',{name:'作品の設定を保存',exact:true});
  await name.fill('移動して保持');await page.evaluate(()=>window.hide());await page.evaluate(()=>window.show());await expect(name).toHaveValue('移動して保持');
  await save.click();await page.waitForFunction(()=>!!window.completePending);await page.evaluate(()=>window.hide());await page.evaluate(()=>window.show());await expect(save).toBeDisabled();
  await page.evaluate(()=>window.completePending());await expect(save).toBeEnabled();await expect(page.locator('.info-notice')).toHaveCount(0);await expect(name).toHaveValue('移動して保持');
  checks.push('RV08 draft-and-pending-save-survive-screen-remount-and-ack');
  await page.locator('summary').filter({hasText:'暦の定義を編集'}).click();const raw=page.getByLabel('暦の定義',{exact:true});await raw.fill('{broken😀');
  await page.evaluate(()=>window.hide());await page.evaluate(()=>window.show());await page.locator('summary').filter({hasText:'暦の定義を編集'}).click();await expect(raw).toHaveValue('{broken😀');await expect(save).toBeDisabled();
  checks.push('RV08 invalid-calendar-raw-retained-on-navigation');
  await page.evaluate(()=>window.mount('settings',true));await expect(name).toHaveValue('保存前');await name.fill('失敗を保持');await save.click();await page.waitForFunction(()=>!!window.completePending);await page.evaluate(()=>window.completePending());await expect(page.getByRole('alert')).toHaveText('容量不足');
  await page.evaluate(()=>window.hide());await page.evaluate(()=>window.show());await expect(name).toHaveValue('失敗を保持');
  await page.evaluate(()=>window.changedRevision());await expect(save).toBeDisabled();await expect(page.locator('.error-notice')).toContainText('基底');
  checks.push('RV08 failure-and-conflicting-revision-retain-input');
  await page.evaluate(()=>window.mount('calendar',true));await page.getByRole('button',{name:'暦の規則を編集',exact:true}).click();await page.getByLabel('暦の名称',{exact:true}).fill('変更した暦');
  await page.getByRole('button',{name:'規則変更の影響を確認',exact:true}).click();const calendarSave=page.getByRole('button',{name:'確認した暦を保存',exact:true});await expect(calendarSave).toBeEnabled();
  await page.evaluate(()=>window.changedRevision());await expect(calendarSave).toBeDisabled();await expect(page.getByLabel('暦の名称',{exact:true})).toHaveValue('変更した暦');
  await page.getByRole('button',{name:'規則変更の影響を確認',exact:true}).click();await calendarSave.click();await page.waitForFunction(()=>!!window.completePending);await expect(calendarSave).toBeDisabled();await page.evaluate(()=>window.completePending());
  await expect(page.getByRole('alert')).toHaveText('保存失敗');await expect(page.getByLabel('暦の名称',{exact:true})).toHaveValue('変更した暦');
  assert.equal(await page.evaluate(()=>window.calendarSaved.revision),'1');assert.equal(await page.evaluate(()=>window.saveCount),1);
  checks.push('RV09 stale-preview-requires-reconfirmation-with-input-retained','RV09 double-save-and-failure');
  assert.deepEqual(errors,[]);await page.screenshot({path:path.join(output,'final.png'),fullPage:true});
} catch(e) {failure=e;}
finally {
  await writeFile(path.join(output,'result.json'),JSON.stringify({engine,browserVersion:browser?.version(),environment:'Linux automated source-component browser with controlled delayed host; not physical Safari/iOS, native persistence, or AT completion',checks,pageErrors:errors,result:failure?'failed':'passed',failure:failure?.stack},null,2));
  await browser?.close();await server?.close();
}
console.log(output);
if(failure)throw failure;
