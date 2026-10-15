import {expect,type Browser,type Page,type TestInfo} from '@playwright/test';
import type {ProjectData} from '../../src/domain/types';
import {nativeDocuments} from '../../src/sync/nativeBridge';
import {valueHash} from '../../src/sync/protocol';
import {createHttpContract} from './httpContract';
import {attachObservation,backup,navigate} from './ap04-original-helpers';

const account='a3500000-0000-4000-8000-000000000001';
async function authorAndSyncImage(page:Page){return page.evaluate(async account=>{
 const db=await new Promise<IDBDatabase>((resolve,reject)=>{const request=indexedDB.open('scenario-manager-account-'+account);request.onsuccess=()=>resolve(request.result);request.onerror=()=>reject(request.error);});
 const normalize=(value:unknown):unknown=>value instanceof ArrayBuffer?[...new Uint8Array(value)]:ArrayBuffer.isView(value)?[...new Uint8Array(value.buffer,value.byteOffset,value.byteLength)]:Array.isArray(value)?value.map(normalize):value&&typeof value==='object'?Object.fromEntries(Object.entries(value).map(([key,item])=>[key,normalize(item)])):value;
 try{
  const names=[...db.objectStoreNames].filter(name=>!['viewStates','workspaceInputs','authorToolDrafts','importDrafts','diagnostics','editorWorks'].includes(name)).sort();
  return await new Promise<Record<string,unknown[]>>((resolve,reject)=>{const tx=db.transaction(names,'readonly'),tables:Record<string,unknown[]>={};for(const name of names){const request=tx.objectStore(name).getAll();request.onsuccess=()=>{tables[name]=normalize(request.result) as unknown[];};}tx.oncomplete=()=>resolve(tables);tx.onabort=()=>reject(tx.error);});
 }finally{db.close();}
},account);}

/** Same actual F35 file and full history, ordinary authenticated-scope UI.
 * Real local HTTP confirmations establish the replacement state transition;
 * they do not establish actual hosted Auth/RLS or two-device synchronization. */
export async function exerciseF35Replacement(browser:Browser,info:TestInfo,given:Awaited<ReturnType<typeof backup>>){
 const requests:ProjectData[]=[];
 const contract=await createHttpContract(async route=>{
  const request=route.request();if(request.method()==='OPTIONS')return route.fulfill({status:204});
  if(new URL(request.url()).pathname.includes('/auth/v1/token'))return route.fulfill({json:{access_token:'fixture-only-f35-memory-token',user:{id:account},expires_in:3600}});
  const body=request.postDataJSON() as {specification?:string;action?:string;input?:{project?:ProjectData}}|null;expect(body?.specification).toBe('scenario-sync-native/1.0.0');
  if(body?.action==='projects')return route.fulfill({json:requests.length?[{projectId:given.project.projectId,serverRevision:given.project.revision,role:'owner',name:given.project.name}]:[]});
  if(body?.action==='shares')return route.fulfill({json:[]});
  if(body?.action==='members')return route.fulfill({json:{membershipRevision:'0',members:[]}});
  if(body?.action==='bootstrap'){
   const project=body.input?.project;if(!project)throw Error('F35の通常登録に作品がありません');expect({...project,history:[]}).toEqual({...given.project,history:[]});requests.push(structuredClone(project));
   const documents=nativeDocuments(project,project.revision);return route.fulfill({json:{serverRevision:project.revision,documents,contentHash:await valueHash(documents)}});
  }
  throw Error('F35の手順にないローカルHTTP操作: '+body?.action);
 });
 const context=await browser.newContext({baseURL:info.project.use.baseURL as string});
 try{
  const page=await context.newPage();
  const login=async(cold=false)=>{
   await page.getByRole('button',{name:'アカウント・専用同期',exact:true}).click();
   if(!cold){await page.getByLabel('専用Supabase URL',{exact:true}).fill(contract.url);await page.getByLabel('公開用APIキー',{exact:true}).fill('sb_publishable_f35_fixture');await page.getByRole('button',{name:'接続設定を保持',exact:true}).click();}
   await page.getByLabel('メール',{exact:true}).fill('f35@example.invalid');await page.getByLabel('パスワード',{exact:true}).fill('fixture-only');await page.getByRole('button',{name:'認証してアカウント領域を開く',exact:true}).click();
   await expect(page.getByRole('button',{name:'限定版の閲覧・指摘',exact:true})).toBeVisible();
  };
  await page.goto('./');await login();await page.getByRole('button',{name:'保存ファイルを読み込む',exact:true}).click();
  await page.locator('input[type=file][accept*=".scenario"]').setInputFiles({name:'F35-same-given.scenario',mimeType:'application/zip',buffer:Buffer.from(given.bytes)});
  await page.getByLabel('復元方法と対象への影響を確認しました').check();await page.getByRole('button',{name:'この内容で復元する',exact:true}).click();await expect(page.locator('.app-shell')).toBeVisible();
  await navigate(page,/^作品・保存/);await page.getByRole('tab',{name:'同期・限定共有',exact:true}).click();
  const sync=page.getByRole('region',{name:'端末間同期と競合',exact:true});await sync.getByRole('button',{name:'この作品を専用接続先へ新規登録',exact:true}).click();await expect(sync).toContainText('新しいサーバー正本と確定共通元を保存しました');expect(requests).toHaveLength(1);
  const confirmed=await authorAndSyncImage(page);expect(confirmed.outbox).toHaveLength(0);expect(confirmed.syncBases).toHaveLength(1);
  const afterConfirmation=await backup(page);expect(afterConfirmation.project).toEqual(given.project);expect(afterConfirmation.assets).toEqual(given.assets);
  await page.getByRole('tab',{name:'完全保存・復元',exact:true}).click();await page.getByLabel('保存ファイルを選ぶ',{exact:true}).setInputFiles({name:'F35-same-given.scenario',mimeType:'application/zip',buffer:Buffer.from(given.bytes)});
  await page.getByLabel('復元方法',{exact:true}).selectOption('replace');await page.getByLabel('復元する対象作品',{exact:true}).selectOption(given.project.projectId);await page.getByRole('button',{name:'復元の影響を確認',exact:true}).click();
  await page.getByLabel('復元方法と対象への影響を確認しました').check();
  const before=await authorAndSyncImage(page);
  await page.evaluate(()=>{const put=IDBObjectStore.prototype.put;let armed=true;IDBObjectStore.prototype.put=function(...args:Parameters<IDBObjectStore['put']>){if(armed&&this.name==='projects'){armed=false;throw new DOMException('F35 replacement quota fixture','QuotaExceededError');}return put.apply(this,args);};});
  await page.getByRole('button',{name:'この内容で復元する',exact:true}).click();await expect(page.locator('.backup-page').getByRole('alert')).toContainText('容量');expect(await authorAndSyncImage(page)).toEqual(before);
  await expect(page.getByLabel('復元方法',{exact:true})).toHaveValue('replace');await expect(page.getByLabel('復元方法と対象への影響を確認しました')).toBeChecked();
  await page.getByRole('button',{name:'この内容で復元する',exact:true}).click();await expect(page.getByText('検査した作品を端末内に復元しました。保存した版を確認しました。')).toBeVisible();
  const replaced=await backup(page);expect(replaced.project.projectId).toBe(given.project.projectId);expect(replaced.project.entities).toEqual(given.project.entities);expect(replaced.project.relations).toEqual(given.project.relations);expect(replaced.project.snapshots).toEqual(given.project.snapshots);expect(replaced.project.calendars).toEqual(given.project.calendars);expect(replaced.project.history.slice(0,given.project.history.length)).toEqual(given.project.history);
  expect(replaced.project.history.at(-1)?.reason).toBe('専用ファイルをreplaceで復元');expect(BigInt(replaced.project.revision)).toBe(BigInt(given.project.revision)+1n);expect(replaced.assets).toEqual(given.assets);
  await page.reload();await login(true);
  const app=page.locator('.app-shell'),card=page.locator('.project-card').filter({hasText:given.project.name});
  await expect(app.or(card).first()).toBeVisible();
  if(!await app.isVisible())await card.click();
  const cold=await backup(page);expect(cold.project).toEqual(replaced.project);expect(cold.assets).toEqual(replaced.assets);
  await attachObservation(info,'AT-F35-local-confirmed-replacement',{projectId:given.project.projectId,sourceFileBytes:given.bytes.length,bootstrapImageConfirmed:true,oldOutboxRemovedOnlyByNormalConfirmedBootstrap:true,allAuthorAndSyncTablesRolledBack:true,retryAndCold:true,originalHistoryIds:given.project.history.map(command=>command.operationId),replacementOperationId:replaced.project.history.at(-1)!.operationId,scope:'local HTTP protocol/normal UI only',actualHostedAuth:false,actualRLS:false,physicalTwoDeviceSync:false});
 }finally{await context.close();await contract.close();}
}
