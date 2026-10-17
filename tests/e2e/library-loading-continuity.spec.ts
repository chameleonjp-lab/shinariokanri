import {expect,test,type Page} from '@playwright/test';
import {createProject} from '../../src/domain/model';
import {exportScenario,inspectScenario} from '../../src/storage/archive';
import {seed} from './ap04-original-helpers';
import {exerciseF35Replacement} from './ap04-original-f35-replace-helper';

async function holdEditorHash(page:Page,afterImport=false,projectId?:string){
 await page.evaluate(({afterImport,projectId})=>{
  const state={armed:!afterImport,entered:false,release:()=>{}};
  (window as unknown as {editorGate:typeof state}).editorGate=state;
  const held=new Promise<void>(resolve=>state.release=resolve),digest=crypto.subtle.digest.bind(crypto.subtle);
  if(afterImport){const add=IDBObjectStore.prototype.add;IDBObjectStore.prototype.add=function(...args:Parameters<IDBObjectStore['add']>){const request=add.apply(this,args);if(this.name==='importLogs')request.addEventListener('success',()=>{state.armed=true;});return request;};}
  crypto.subtle.digest=async(...args)=>{let matches=!projectId;try{const value=JSON.parse(new TextDecoder().decode(args[1]));if(projectId)matches=value.projectId===projectId&&Array.isArray(value.entityIds);}catch{}if(state.armed&&matches&&(projectId||!state.entered)){state.entered=true;await held;}return digest(...args);};
 },{afterImport,projectId});
}
const entered=(page:Page)=>page.evaluate(()=>(window as unknown as {editorGate:{entered:boolean}}).editorGate.entered);
const release=(page:Page)=>page.evaluate(()=>(window as unknown as {editorGate:{release:()=>void}}).editorGate.release());

test('reload during selected validation resumes the requested work without publishing an unvalidated editor',async({page})=>{
 const project=createProject('読み込み中の選択を再開');await seed(page,await exportScenario(project));await page.locator('.project-switch').click();
 await page.evaluate(()=>{localStorage.removeItem('scenario-last-project:guest');localStorage.removeItem('scenario-last-project');});
 await holdEditorHash(page);await page.locator('.project-card').filter({hasText:project.name}).click();await expect.poll(()=>entered(page)).toBe(true);
 await expect(page.locator('.app-shell')).toHaveCount(0);await page.reload();await expect(page.locator('.project-switch')).toContainText(project.name);
});

test('clone completion remains visible after its delayed selected editor is published',async({page})=>{
 const project=createProject('複製の完了を保持');const bytes=await exportScenario(project);await seed(page,bytes);
 await page.locator('.sidebar').getByRole('button',{name:/^作品・保存/}).click();await page.getByRole('tab',{name:'完全保存・復元',exact:true}).click();
 await page.getByLabel('保存ファイルを選ぶ',{exact:true}).setInputFiles({name:'clone.scenario',mimeType:'application/zip',buffer:Buffer.from(bytes)});await page.getByLabel('復元方法',{exact:true}).selectOption('clone');await page.getByLabel('復元方法と対象への影響を確認しました').check();
 await holdEditorHash(page,true);await page.getByRole('button',{name:'この内容で復元する',exact:true}).click();await expect.poll(()=>entered(page)).toBe(true);await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));await release(page);
 await expect.poll(()=>page.evaluate(()=>localStorage.getItem('scenario-last-project:guest'))).not.toBe(project.projectId);
 await expect(page.getByText('検査した作品を端末内に復元しました。保存した版を確認しました。',{exact:true})).toBeVisible();
});

test('confirmed authenticated bootstrap permits the original replacement and rollback workflow',async({browser},info)=>{
 const bytes=new Uint8Array(await exportScenario(createProject('登録直後の復元対象')));
 await exerciseF35Replacement(browser,info,{bytes,...await inspectScenario(bytes,{worker:false})});
});

test('remembered startup exposes readiness only after selected validation settles',async({page})=>{
 const project=createProject('起動時の選択を検査');await seed(page,await exportScenario(project));
 await page.addInitScript(projectId=>{
  const state={entered:false,release:()=>{},headers:0};(window as unknown as {editorGate:typeof state}).editorGate=state;
  const held=new Promise<void>(resolve=>state.release=resolve),digest=crypto.subtle.digest.bind(crypto.subtle);
  crypto.subtle.digest=async(...args)=>{let header=false;try{const value=JSON.parse(new TextDecoder().decode(args[1]));header=value.projectId===projectId&&Array.isArray(value.entityIds);}catch{}if(header&&++state.headers===2){state.entered=true;await held;}return digest(...args);};
 },project.projectId);
 await page.reload();await expect.poll(()=>entered(page)).toBe(true);await expect(page.locator('.library-page,.app-shell')).toHaveCount(0);await release(page);await expect(page.locator('.project-switch')).toContainText(project.name);
});

for(const boundary of ['cancel','newer selection','error'] as const)test(`pending selection ${boundary} preserves the last validated work and cannot restore older intent`,async({page})=>{
 const a=createProject('遅延または失敗する作品A');await seed(page,await exportScenario(a));await page.locator('.project-switch').click();await page.getByLabel('作品名',{exact:true}).fill('最後に検査した作品B');await page.getByRole('button',{name:'作品を作成',exact:true}).click();await expect(page.locator('.project-switch')).toContainText('最後に検査した作品B');
 const b=await page.evaluate(()=>localStorage.getItem('scenario-last-project:guest'));await page.locator('.project-switch').click();
 if(boundary==='error')await page.evaluate(async id=>{const db=await new Promise<IDBDatabase>(resolve=>{const request=indexedDB.open('scenario-manager-local-v1');request.onsuccess=()=>resolve(request.result);});await new Promise<void>((resolve,reject)=>{const tx=db.transaction('projects','readwrite'),table=tx.objectStore('projects'),request=table.get(id);request.onsuccess=()=>table.put({...request.result,schemaVersion:'999.0'});tx.oncomplete=()=>resolve();tx.onabort=()=>reject(tx.error);});db.close();},a.projectId);
 else await holdEditorHash(page,false,a.projectId);
 await page.locator('.project-card').filter({hasText:a.name}).click();
 if(boundary==='error')await expect(page.getByRole('alert')).toBeVisible();
 else{await expect.poll(()=>entered(page)).toBe(true);if(boundary==='cancel')await page.getByRole('button',{name:'作品の読み込みを中止',exact:true}).click();else{await page.locator('.project-card').filter({hasText:'最後に検査した作品B'}).click();await expect(page.locator('.project-switch')).toContainText('最後に検査した作品B');}await release(page);}
 await expect.poll(()=>page.evaluate(()=>localStorage.getItem('scenario-opening-project:guest'))).toBe('');expect(await page.evaluate(()=>localStorage.getItem('scenario-last-project:guest'))).toBe(b);await page.reload();await expect(page.locator('.project-switch')).toContainText('最後に検査した作品B');
});
