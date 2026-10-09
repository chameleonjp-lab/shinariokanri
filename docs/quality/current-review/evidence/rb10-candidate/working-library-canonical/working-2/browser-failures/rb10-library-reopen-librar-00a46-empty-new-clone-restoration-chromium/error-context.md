# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: rb10-library-reopen.spec.ts >> library selection keeps canonical projects clean and resumes a failed draft across another project, cold reload and empty new/clone restoration
- Location: tests/e2e/rb10-library-reopen.spec.ts:49:1

# Error details

```
Error: expect(received).toBe(expected) // Object.is equality

Expected: "1"
Received: "2"
```

# Page snapshot

```yaml
- generic [ref=f1e3]:
  - generic [ref=f1e4]:
    - generic [ref=f1e5]:
      - button "アカウント・専用同期" [ref=f1e6] [cursor=pointer]
      - generic [ref=f1e7]: この端末の作品
    - group "任意持出し診断" [ref=f1e8]:
      - generic "この作業の診断を確認・持出し" [ref=f1e9]
  - generic [ref=f1e11]:
    - link "本文へ移動" [ref=f1e12] [cursor=pointer]:
      - /url: "#main-content"
    - complementary "主要ナビゲーション" [ref=f1e13]:
      - generic [ref=f1e14]:
        - generic [ref=f1e15]: S
        - generic [ref=f1e16]: シナリオ管理
      - button "選び直す作品B 作品一覧へ ⌄" [ref=f1e17] [cursor=pointer]:
        - generic [ref=f1e19]:
          - strong [ref=f1e20]: 選び直す作品B
          - generic [ref=f1e21]: 作品一覧へ
        - generic [ref=f1e22]: ⌄
      - generic [ref=f1e23]: WORKSPACE
      - navigation [ref=f1e24]:
        - button "年表" [ref=f1e25] [cursor=pointer]
        - button "構成" [ref=f1e26] [cursor=pointer]
        - button "資料 1" [ref=f1e27] [cursor=pointer]:
          - text: 資料
          - generic [ref=f1e28]: "1"
        - button "検索" [ref=f1e29] [cursor=pointer]
      - generic [ref=f1e30]:
        - generic [ref=f1e31]: QUICK NOTE
        - button "アイデアを残す" [ref=f1e32] [cursor=pointer]
      - generic [ref=f1e34]:
        - button "作品・保存" [ref=f1e35] [cursor=pointer]
        - generic [ref=f1e38]:
          - strong [ref=f1e39]: この端末に保存
          - generic [ref=f1e40]: 同期接続先は未設定
        - button "暗い配色にする" [ref=f1e41] [cursor=pointer]
    - generic [ref=f1e42]:
      - banner [ref=f1e43]:
        - generic [ref=f1e44]:
          - generic "選び直す作品B" [ref=f1e45]
          - generic [ref=f1e46]: /
          - generic [ref=f1e47]: 作品
        - status [ref=f1e48]:
          - generic [ref=f1e50]: 端末内保存済み
          - generic [ref=f1e51]: LOCAL
      - main [ref=f1e52]:
        - generic [ref=f1e54]:
          - generic [ref=f1e55]: YOUR PROJECT
          - heading "作品" [level=1] [ref=f1e56]
          - paragraph [ref=f1e57]: 作品を保存し、いつでも続きを書けるように。
        - tablist "作品の管理" [ref=f1e58]:
          - tab "完全保存・復元" [selected] [ref=f1e59] [cursor=pointer]
          - tab "目的別出力" [ref=f1e60] [cursor=pointer]
          - tab "変更履歴" [ref=f1e61] [cursor=pointer]
          - tab "作品の設定" [ref=f1e62] [cursor=pointer]
          - tab "同期・限定共有" [ref=f1e63] [cursor=pointer]
        - group [ref=f1e64]:
          - generic "最近開いた情報・お気に入り" [ref=f1e65] [cursor=pointer]
        - generic [ref=f1e68]:
          - generic [ref=f1e72]:
            - heading "作品を完全保存" [level=3] [ref=f1e73]
            - paragraph [ref=f1e74]: 本文・状態・固定世界・履歴・送信待ち・添付を .scenario ファイルに保存します。
            - button "完全保存ファイルを作成" [ref=f1e75] [cursor=pointer]
            - button "素材bytesを除いて保存" [ref=f1e76] [cursor=pointer]
          - generic [ref=f1e80]:
            - heading "ファイルから復元" [level=3] [ref=f1e81]
            - paragraph [ref=f1e82]: 元ファイルと対応の入力を端末内に保持し、影響を確認してから復元します。
            - generic [ref=f1e83] [cursor=pointer]:
              - text: 保存ファイルを選ぶ
              - button "保存ファイルを選ぶ" [ref=f1e84]
          - status [ref=f1e85]: 完全保存ファイルを作成しました。端末のダウンロードを確認してください。
      - contentinfo [ref=f1e86]:
        - generic [ref=f1e87]: 端末内の作品 · 版 1
        - generic [ref=f1e88]: 2件の情報 · 0件の関係
```

# Test source

```ts
  1  | import {expect,test,type Page} from '@playwright/test';
  2  | import {readFile} from 'node:fs/promises';
  3  | import {createEntity,createProject,newId,textToRichText,validateProject} from '../../src/domain/model';
  4  | import type {ProjectData} from '../../src/domain/types';
  5  | import {exportScenario,inspectScenario} from '../../src/storage/archive';
  6  | import {jsonBytes,sha256} from '../../src/storage/json';
  7  | 
  8  | async function nav(page:Page,name:RegExp){
  9  |  const menu=page.getByRole('button',{name:'メニューを開く',exact:true});if(await menu.isVisible())await menu.click();
  10 |  await page.locator('.sidebar').getByRole('button',{name}).first().click();
  11 | }
  12 | async function fixture(title:string){
  13 |  const p=createProject(title),character=createEntity(p.projectId,'character','人物同名'),note=createEntity(p.projectId,'note','参照を保持',{body:textToRichText('😀人物と𠮷野の固定本文')});
  14 |  note.data.body[0]!.links=[{start:1,end:3,target:{entityId:character.id}}];p.entities.push(character,note);p.entities.forEach(e=>e.status='confirmed');
  15 |  const {history:_history,snapshots:_snapshots,...content}=structuredClone(p);
  16 |  p.snapshots.push({id:newId(),createdAt:new Date().toISOString(),versionLabel:'改名前の固定版',contentHash:await sha256(jsonBytes(content)),content});
  17 |  expect(validateProject(p)).toMatchObject({ok:true});return {p,character,note};
  18 | }
  19 | async function importFile(page:Page,bytes:Uint8Array,mode='new'){
  20 |  if(await page.locator('.app-shell').isVisible()){await nav(page,/^作品/);await page.getByRole('tab',{name:'完全保存・復元',exact:true}).click();}
  21 |  else await page.getByRole('button',{name:'保存ファイルを読み込む',exact:true}).click();
  22 |  await page.locator('input[type=file][accept*=".scenario"]').setInputFiles({name:'library-reopen.scenario',mimeType:'application/zip',buffer:Buffer.from(bytes)});
  23 |  await page.getByLabel('復元方法',{exact:true}).selectOption(mode);await page.getByLabel('復元方法と対象への影響を確認しました').check();
  24 |  await page.getByRole('button',{name:'この内容で復元する',exact:true}).click();await expect(page.locator('.app-shell')).toBeVisible();
  25 | }
  26 | async function selectProject(page:Page,title:string){
  27 |  const menu=page.getByRole('button',{name:'メニューを開く',exact:true});if(await menu.isVisible())await menu.click();
  28 |  await page.locator('.project-switch').click();await page.locator('.project-card').filter({has:page.getByText(title,{exact:true})}).click();
  29 |  await expect(page.locator('.project-switch')).toContainText(title);await nav(page,/^資料/);await page.getByRole('button',{name:'人物 1',exact:true}).click();await page.locator('.entity-card').click();
  30 | }
  31 | async function canonicalRows(page:Page){
  32 |  return page.evaluate(async()=>{
  33 |   const db=await new Promise<IDBDatabase>((resolve,reject)=>{const r=indexedDB.open('scenario-manager-local-v1');r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error);});
  34 |   try{return await new Promise<Record<string,unknown[]>>((resolve,reject)=>{const tables=['projects','entities','relations','blocks','snapshots','commands','outbox','recordParts'],tx=db.transaction(tables,'readonly'),rows:Record<string,unknown[]>={};for(const table of tables){const r=tx.objectStore(table).getAll();r.onsuccess=()=>{rows[table]=r.result;};}tx.oncomplete=()=>resolve(rows);tx.onerror=()=>reject(tx.error);});}finally{db.close();}
  35 |  });
  36 | }
  37 | async function completeFile(page:Page){
  38 |  await nav(page,/^作品/);await page.getByRole('tab',{name:'完全保存・復元',exact:true}).click();const pending=page.waitForEvent('download');
  39 |  await page.getByRole('button',{name:'完全保存ファイルを作成',exact:true}).click();return new Uint8Array(await readFile((await (await pending).path())!));
  40 | }
  41 | function checkEdition(p:ProjectData,expectedName:string){
  42 |  expect(validateProject(p)).toMatchObject({ok:true});expect(p).not.toHaveProperty('id');
  43 |  const character=p.entities.find(e=>e.kind==='character')!,note=p.entities.find(e=>e.kind==='note')!;
  44 |  expect(character.name).toBe(expectedName);expect(note.kind).toBe('note');if(note.kind==='note'){expect(note.data.body[0]!.text).toBe('😀人物と𠮷野の固定本文');expect(note.data.body[0]!.links![0]!.target.entityId).toBe(character.id);}
> 45 |  expect(p.revision).toBe('1');expect(p.history).toHaveLength(1);expect(p.history[0]!.before.revision).toBe('0');expect(p.history[0]!.after.revision).toBe('1');expect(p.history[0]!.before.entities.find(e=>e.kind==='character')!.name).toBe('人物同名');expect(p.history[0]!.after.entities.find(e=>e.kind==='character')!.name).toBe(expectedName);
     |                     ^ Error: expect(received).toBe(expected) // Object.is equality
  46 |  expect(p.snapshots).toHaveLength(1);expect(p.snapshots[0]!.content.entities.find(e=>e.kind==='character')!.name).toBe('人物同名');expect(p.snapshots[0]!.content).not.toHaveProperty('id');
  47 | }
  48 | 
  49 | test('library selection keeps canonical projects clean and resumes a failed draft across another project, cold reload and empty new/clone restoration',async({page,browser})=>{
  50 |  test.setTimeout(120000);const a=await fixture('選び直す作品A'),b=await fixture('選び直す作品B');await page.setViewportSize({width:1440,height:1000});await page.goto('');
  51 |  await importFile(page,await exportScenario(a.p));await importFile(page,await exportScenario(b.p));await selectProject(page,a.p.name);const name=page.getByLabel('名前',{exact:true});await expect(name).toHaveValue('人物同名');
  52 |  const before=await canonicalRows(page);await page.evaluate(()=>{const put=IDBObjectStore.prototype.put;let armed=true;IDBObjectStore.prototype.put=function(...args:Parameters<IDBObjectStore['put']>){if(armed&&this.name==='projects'){armed=false;throw new DOMException('synthetic quota','QuotaExceededError');}return put.apply(this,args);};});
  53 |  await name.fill('Aの未保存入力😀');await expect(page.getByRole('alert').filter({hasText:/保存できませんでした/})).toBeVisible();await expect(name).toHaveValue('Aの未保存入力😀');expect(await canonicalRows(page)).toEqual(before);
  54 |  await selectProject(page,b.p.name);await expect(name).toHaveValue('人物同名');await name.fill('Bの保存後𠮷');await expect(page.locator('.editor-save-state')).toContainText('端末内保存済み');
  55 |  await selectProject(page,a.p.name);await expect(name).toHaveValue('Aの未保存入力😀');await expect(page.locator('.editor-save-state')).toContainText('端末内保存済み');await page.reload();await nav(page,/^資料/);await page.locator('.entity-card').click();await expect(name).toHaveValue('Aの未保存入力😀');
  56 |  const archive=await completeFile(page),saved=(await inspectScenario(archive,{worker:false})).project;checkEdition(saved,'Aの未保存入力😀');expect(saved.projectId).toBe(a.p.projectId);expect(saved.entities.find(e=>e.kind==='character')!.id).toBe(a.character.id);expect(saved.history).toHaveLength(1);
  57 |  await selectProject(page,b.p.name);await expect(name).toHaveValue('Bの保存後𠮷');const savedB=(await inspectScenario(await completeFile(page),{worker:false})).project;checkEdition(savedB,'Bの保存後𠮷');expect(savedB.projectId).toBe(b.p.projectId);expect(savedB.entities.find(e=>e.kind==='character')!.id).toBe(b.character.id);expect(savedB.history).toHaveLength(1);
  58 |  for(const mode of ['new','clone']){
  59 |   const context=await browser.newContext({viewport:{width:390,height:844}}),fresh=await context.newPage();try{await fresh.goto(page.url());await importFile(fresh,archive,mode);await fresh.reload();const restored=(await inspectScenario(await completeFile(fresh),{worker:false})).project;checkEdition(restored,'Aの未保存入力😀');expect(restored.history).toHaveLength(1);if(mode==='new'){expect(restored.projectId).toBe(a.p.projectId);expect(restored.entities.find(e=>e.kind==='character')!.id).toBe(a.character.id);}else{expect(restored.projectId).not.toBe(a.p.projectId);expect(restored.entities.find(e=>e.kind==='character')!.id).not.toBe(a.character.id);}}finally{await context.close();}
  60 |  }
  61 | });
  62 | 
```