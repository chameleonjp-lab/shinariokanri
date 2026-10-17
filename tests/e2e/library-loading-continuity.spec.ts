import {expect,test,type Page} from '@playwright/test';
import {createProject} from '../../src/domain/model';
import {exportScenario,inspectScenario} from '../../src/storage/archive';
import {seed} from './ap04-original-helpers';
import {exerciseF35Replacement} from './ap04-original-f35-replace-helper';
import {createHttpContract} from './httpContract';

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


test('confirmed logout erases only the matching account pending selection',async({page})=>{
 const account='00000000-0000-4000-8000-000000000002',other='00000000-0000-4000-8000-000000000003';
 const contract=await createHttpContract(async route=>{
  const request=route.request(),url=new URL(request.url());
  if(request.method()==='OPTIONS')return route.fulfill({status:204});
  if(url.pathname.includes('/auth/v1/token'))return route.fulfill({json:{access_token:'logout-fixture-memory-token',user:{id:account},expires_in:3600}});
  if(url.pathname.includes('/auth/v1/logout'))return route.fulfill({status:204});
  if((request.postDataJSON() as {action?:string}|null)?.action==='projects')return route.fulfill({json:[]});
  return route.fulfill({status:500,json:{code:'UNEXPECTED_CONTRACT_ACTION'}});
 });
 try{
  await page.goto('');await page.getByRole('button',{name:'アカウント・専用同期',exact:true}).click();await page.getByLabel('専用Supabase URL',{exact:true}).fill(contract.url);await page.getByLabel('公開用APIキー',{exact:true}).fill('sb_publishable_logout_fixture');await page.getByRole('button',{name:'接続設定を保持',exact:true}).click();await page.getByLabel('メール',{exact:true}).fill('logout@example.invalid');await page.getByLabel('パスワード',{exact:true}).fill('fixture-only');await page.getByRole('button',{name:'認証してアカウント領域を開く',exact:true}).click();await expect(page.getByRole('status').filter({hasText:'認証したアカウントの領域を開きました。'})).toBeVisible();await expect(page.locator('.library-page')).toBeVisible();
  const keys=[`scenario-opening-project:${account}`,`scenario-last-project:${account}`,'scenario-opening-project:guest','scenario-last-project:guest',`scenario-opening-project:${other}`,`scenario-last-project:${other}`];
  await page.evaluate(keys=>keys.forEach((key,index)=>localStorage.setItem(key,`retained-selection-${index}`)),keys);
  await page.getByRole('button',{name:'ログアウト前の保存待ち・入力を確認',exact:true}).click();await page.getByLabel('キャッシュ消去対象のアカウントID',{exact:true}).fill(account);await page.getByRole('button',{name:'確認した残りを破棄してログアウト',exact:true}).click();await expect(page.getByRole('status').filter({hasText:'このアカウントの認証と端末内作者キャッシュを消去しました。'})).toBeVisible();
  expect(await page.evaluate(keys=>keys.map(key=>localStorage.getItem(key)),keys)).toEqual([null,null,'retained-selection-2','retained-selection-3','retained-selection-4','retained-selection-5']);
 }finally{await contract.close();}
});
