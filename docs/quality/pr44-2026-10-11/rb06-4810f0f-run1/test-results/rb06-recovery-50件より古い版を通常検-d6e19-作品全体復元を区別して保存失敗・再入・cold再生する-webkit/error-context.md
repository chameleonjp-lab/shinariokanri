# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: rb06-recovery.spec.ts >> 50件より古い版を通常検索し、単体復元と作品全体復元を区別して保存失敗・再入・cold再生する
- Location: tests/e2e/rb06-recovery.spec.ts:20:1

# Error details

```
Test timeout of 30000ms exceeded.
```

```
Error: locator.click: Test timeout of 30000ms exceeded.
Call log:
  - waiting for locator('.history-page').getByRole('button', { name: '作品全体の復元差分を確認', exact: true })
    - locator resolved to <button class="button secondary">作品全体の復元差分を確認</button>
  - attempting click action
    - waiting for element to be visible, enabled and stable
    - element is visible, enabled and stable
    - scrolling into view if needed

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
    - link "本文へ移動" [ref=f1e12]:
      - /url: "#main-content"
    - complementary "主要ナビゲーション" [ref=f1e13]:
      - generic [ref=f1e14]:
        - generic [ref=f1e15]: S
        - generic [ref=f1e16]: シナリオ管理
      - button "確認後の変更 作品一覧へ ⌄" [ref=f1e17] [cursor=pointer]:
        - generic [ref=f1e19]:
          - strong [ref=f1e20]: 確認後の変更
          - generic [ref=f1e21]: 作品一覧へ
        - generic [ref=f1e22]: ⌄
      - generic [ref=f1e23]: WORKSPACE
      - navigation [ref=f1e24]:
        - button "年表" [ref=f1e25] [cursor=pointer]
        - button "構成" [ref=f1e26] [cursor=pointer]
        - button "資料 0" [ref=f1e27] [cursor=pointer]:
          - text: 資料
          - generic [ref=f1e28]: "0"
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
          - generic "確認後の変更" [ref=f1e45]
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
          - tab "完全保存・復元" [ref=f1e59] [cursor=pointer]
          - tab "目的別出力" [ref=f1e60] [cursor=pointer]
          - tab "変更履歴" [active] [selected] [ref=f1e61] [cursor=pointer]
          - tab "作品の設定" [ref=f1e62] [cursor=pointer]
          - tab "同期・限定共有" [ref=f1e63] [cursor=pointer]
        - group [ref=f1e64]:
          - generic "最近開いた情報・お気に入り" [ref=f1e65] [cursor=pointer]
        - generic [ref=f1e68]:
          - heading "保存した履歴を選ぶ" [level=3] [ref=f1e69]
          - paragraph [ref=f1e70]: 理由・版・操作ID・対象ID・日時で全履歴を検索できます。過去の版は残し、復元を新しい変更として原子保存します。
          - generic [ref=f1e71]:
            - text: 履歴を検索
            - searchbox "履歴を検索" [ref=f1e72]: 37e48483-310b-4c48-8b94-5c989789ef79
          - list [ref=f1e73]:
            - listitem [ref=f1e74]:
              - button "原作品を保存 · 版 1 2026-10-08T09:27:15.585Z · 37e48483-310b-4c48-8b94-5c989789ef79 · 2件" [ref=f1e78] [cursor=pointer]:
                - text: 原作品を保存 · 版 1
                - generic [ref=f1e79]: 2026-10-08T09:27:15.585Z · 37e48483-310b-4c48-8b94-5c989789ef79 · 2件
          - region "履歴の対象版" [ref=f1e80]:
            - heading "原作品を保存" [level=4] [ref=f1e81]
            - paragraph [ref=f1e82]: 操作 37e48483-310b-4c48-8b94-5c989789ef79 · 現在版 75
            - generic [ref=f1e83]:
              - text: 復元する時点
              - combobox "復元する時点" [ref=f1e84]:
                - option "変更前 · 版 0"
                - option "変更後 · 版 1" [selected]
            - generic [ref=f1e86]:
              - text: 単体復元する対象
              - combobox "単体復元する対象" [ref=f1e87]:
                - option "選択してください"
                - option "原場面" [selected]
            - button "この情報だけの復元を確認" [ref=f1e88] [cursor=pointer]
            - button "作品全体の復元差分を確認" [ref=f1e89] [cursor=pointer]
      - contentinfo [ref=f1e90]:
        - generic [ref=f1e91]: 端末内の作品 · 版 75
        - generic [ref=f1e92]: 2件の情報 · 0件の関係
```

# Test source

```ts
  1  | import { expect, test, type Page } from '@playwright/test';
  2  | import { readFile } from 'node:fs/promises';
  3  | import { createEntity, createProject, textToRichText } from '../../src/domain/model';
  4  | import { exportScenario, inspectScenario } from '../../src/storage/archive';
  5  | async function navigate(page: Page, name: RegExp) { const menu = page.getByRole('button', { name: 'メニューを開く' }); if (await menu.isVisible()) await menu.click(); await page.locator('.sidebar').getByRole('button', { name }).first().click(); }
  6  | async function work(page: Page, tab: string) { await navigate(page, /^作品・保存/); await page.getByRole('tab', { name: tab, exact: true }).click(); }
  7  | async function seed(page: Page, bytes: Uint8Array) {
  8  |   await page.goto('./');
  9  |   await page.getByRole('button', { name: '保存ファイルを読み込む', exact: true }).click();
  10 |   await page.locator('input[type=file]').setInputFiles({ name: 'recovery.scenario', mimeType: 'application/zip', buffer: Buffer.from(bytes) });
  11 |   await page.getByLabel('復元方法と対象への影響を確認しました').check();
  12 |   await page.getByRole('button', { name: 'この内容で復元する', exact: true }).click();
  13 |   // The dialog closes after atomic restoration commits; this wait shares the existing test budget.
  14 |   await page.getByRole('dialog', { name: '作品ファイルを読み込む', exact: true }).waitFor({ state: 'hidden' });
  15 |   await expect(page.locator('.sidebar')).toBeVisible();
  16 | }
  17 | async function backup(page: Page) { await work(page, '完全保存・復元'); const pending = page.waitForEvent('download'); await page.getByRole('button', { name: '完全保存ファイルを作成', exact: true }).click(); const download = await pending; return inspectScenario(new Uint8Array(await readFile((await download.path())!)), { worker: false }); }
  18 | async function oldHistory() { const bytes = new Uint8Array(await readFile('tests/fixtures/rb06-history.scenario')), prepared = await inspectScenario(bytes, { worker: false }), p = prepared.project, first = p.history[0], scene = first.after.entities[0]; return { bytes, p, operation: first.operationId, scene }; }
  19 | 
  20 | test('50件より古い版を通常検索し、単体復元と作品全体復元を区別して保存失敗・再入・cold再生する', async ({ page }) => {
  21 |   const f = await oldHistory(); await seed(page, f.bytes); await work(page, '変更履歴'); const panel = page.locator('.history-page'); expect(await panel.locator('.history-list > li').count()).toBeLessThanOrEqual(30); await panel.getByLabel('履歴を検索', { exact: true }).fill(f.operation); await panel.getByRole('button', { name: /原作品を保存 · 版 1/ }).click(); await panel.getByLabel('単体復元する対象', { exact: true }).selectOption(f.scene.id); await panel.getByRole('button', { name: 'この情報だけの復元を確認', exact: true }).click();
  22 |   await page.evaluate(() => { const original = IDBObjectStore.prototype.put; (window as any).__rb06Fail = true; IDBObjectStore.prototype.put = function (...args: Parameters<IDBObjectStore['put']>) { if ((window as any).__rb06Fail && this.name === 'projects') { (window as any).__rb06Fail = false; throw new DOMException('fixture full', 'QuotaExceededError'); } return original.apply(this, args); }; });
  23 |   await panel.getByRole('button', { name: 'この内容へ復元する', exact: true }).click(); await expect(panel.getByRole('alert')).toContainText('容量'); await expect(panel.getByRole('region', { name: '確認した復元差分' })).toContainText('原場面'); await navigate(page, /^資料/); await work(page, '変更履歴'); await expect(panel.getByRole('region', { name: '確認した復元差分' })).toBeVisible(); await panel.getByRole('button', { name: 'この内容へ復元する', exact: true }).click(); await expect(panel.getByRole('status').filter({ hasText: '保存した版を確認' })).toBeVisible();
  24 |   await page.reload(); await work(page, '変更履歴'); await expect(panel.getByLabel('履歴を検索', { exact: true })).toHaveValue(f.operation); await expect(panel.getByLabel('単体復元する対象', { exact: true })).toHaveValue(f.scene.id); let inspected = await backup(page); expect(inspected.project.name).toBe(f.p.name); expect(inspected.project.entities.find(e => e.id === f.scene.id)!.name).toBe('原場面'); expect(inspected.project.snapshots).toEqual(f.p.snapshots);
> 25 |   await work(page, '変更履歴'); await panel.getByRole('button', { name: '作品全体の復元差分を確認', exact: true }).click(); await panel.getByRole('button', { name: '確認した作品全体へ復元', exact: true }).click(); await expect(panel.getByRole('status').filter({ hasText: '保存した版を確認' })).toBeVisible(); inspected = await backup(page); expect(inspected.project.name).toBe('復元元'); expect(inspected.project.history.length).toBe(f.p.history.length + 2); expect(inspected.project.snapshots).toEqual(f.p.snapshots); expect(inspected.recovery!.pending.length).toBeGreaterThanOrEqual(f.p.history.length);
     |                                                                                                    ^ Error: locator.click: Test timeout of 30000ms exceeded.
  26 | });
  27 | 
  28 | test('別作品の全ID対応を画面移動・cold再起動から再開し、失敗後に原子統合して元履歴・段落を完全保存する', async ({ page }) => {
  29 |   const destination = createProject('統合先'), own = createEntity(destination.projectId, 'note', '残す元メモ', { body: textToRichText('保持する') }); destination.entities.push(own); await seed(page, await exportScenario(destination)); await work(page, '完全保存・復元'); const source = createProject('別の復元元'), scene = createEntity(source.projectId, 'scene', '取り込む場面', { body: textToRichText('別作品😀の段落') }); source.entities.push(scene);
  30 |   await page.locator('input[type=file]').setInputFiles({ name: 'other.scenario', mimeType: 'application/zip', buffer: Buffer.from(await exportScenario(source)) }); await page.getByLabel('復元方法', { exact: true }).selectOption('mapped_merge'); await page.getByLabel('復元する対象作品', { exact: true }).selectOption(destination.projectId); await page.getByRole('button', { name: '全IDへ新しい対応先を用意', exact: true }).click(); await page.getByRole('button', { name: '復元の影響を確認', exact: true }).click(); await page.locator('.import-preview details summary').first().click(); const selector = page.locator('select[aria-label$="の統合方法"]').first(); await selector.selectOption('existing'); await page.getByRole('button', { name: '復元の影響を確認', exact: true }).click(); await expect(page.getByLabel('復元方法と対象への影響を確認しました')).toBeEnabled();
  31 |   await navigate(page, /^資料/); await work(page, '完全保存・復元'); await expect(page.getByLabel('復元方法', { exact: true })).toHaveValue('mapped_merge'); await page.reload(); await work(page, '完全保存・復元'); await expect(page.getByText('元ファイルとID対応の入力を再開しました。対象版の影響を再確認してください。')).toBeVisible(); await expect(page.getByLabel('復元方法と対象への影響を確認しました')).not.toBeChecked(); await page.getByRole('button', { name: '復元の影響を確認', exact: true }).click(); await page.getByLabel('復元方法と対象への影響を確認しました').check();
  32 |   await page.evaluate(() => { const original = IDBObjectStore.prototype.put; (window as any).__rb06Fail = true; IDBObjectStore.prototype.put = function (...args: Parameters<IDBObjectStore['put']>) { if ((window as any).__rb06Fail && this.name === 'projects') { (window as any).__rb06Fail = false; throw new DOMException('fixture quota', 'QuotaExceededError'); } return original.apply(this, args); }; }); await page.getByRole('button', { name: 'この内容で復元する', exact: true }).click(); await expect(page.locator('.backup-page').getByRole('alert')).toContainText('容量'); await expect(page.getByLabel('復元方法', { exact: true })).toHaveValue('mapped_merge'); await page.getByRole('button', { name: 'この内容で復元する', exact: true }).click(); await expect(page.getByText('検査した作品を端末内に復元しました。保存した版を確認しました。')).toBeVisible();
  33 |   const restored = await backup(page); expect(restored.project.projectId).toBe(destination.projectId); expect(restored.project.name).toBe(destination.name); expect(restored.project.entities.find(e => e.id === own.id)).toBeTruthy(); const mapped = restored.project.entities.find(e => e.kind === 'scene')!; expect(mapped.id).not.toBe(scene.id); expect(mapped.kind === 'scene' && mapped.data.body[0].id).not.toBe(scene.data.body[0].id); expect(mapped.kind === 'scene' && mapped.data.body[0].text).toBe('別作品😀の段落'); await page.reload(); await work(page, '変更履歴'); await page.getByRole('button', { name: /専用ファイルをmapped_mergeで復元/ }).first().click(); await expect(page.getByRole('region', { name: '移行・読み込み前の復元点' })).toContainText('前の復元点');
  34 | });
  35 | 
  36 | test('復元保存待ちの後に選んだ資料と作品を保持し、新規復元だけを一覧へ追加する', async ({ page }) => {
  37 |   const original=createProject('復元後も続ける作品A');original.entities.push(createEntity(original.projectId,'note','続ける資料'));await seed(page,await exportScenario(original));await work(page,'完全保存・復元');
  38 |   const incoming=createProject('待機中に復元する作品C');await page.locator('input[type=file]').setInputFiles({name:'later.scenario',mimeType:'application/zip',buffer:Buffer.from(await exportScenario(incoming))});await page.getByLabel('復元方法と対象への影響を確認しました').check();
  39 |   await page.evaluate(()=>{const digest=crypto.subtle.digest.bind(crypto.subtle);let hold=true;crypto.subtle.digest=async(...args:Parameters<SubtleCrypto['digest']>)=>{if(hold){hold=false;(window as any).__rb06ImportHeld=true;await new Promise<void>(resolve=>{(window as any).__releaseRb06Import=resolve;});}return digest(...args);};});
  40 |   await page.getByRole('button',{name:'この内容で復元する',exact:true}).click();await expect.poll(()=>page.evaluate(()=>(window as any).__rb06ImportHeld)).toBe(true);await navigate(page,/^資料/);await expect(page.locator('.workspace-heading h1')).toHaveText('資料');await page.evaluate(()=>(window as any).__releaseRb06Import());
  41 |   await expect.poll(()=>page.evaluate(async id=>{const databases=await indexedDB.databases();for(const item of databases){if(!item.name)continue;const db=await new Promise<IDBDatabase>((resolve,reject)=>{const request=indexedDB.open(item.name!);request.onsuccess=()=>resolve(request.result);request.onerror=()=>reject(request.error);});try{if(db.objectStoreNames.contains('projects')){const found=await new Promise<boolean>((resolve,reject)=>{const request=db.transaction('projects').objectStore('projects').get(id);request.onsuccess=()=>resolve(!!request.result);request.onerror=()=>reject(request.error);});if(found)return true;}}finally{db.close();}}return false;},incoming.projectId)).toBe(true);await expect(page.locator('.workspace-heading h1')).toHaveText('資料');await expect(page.locator('.project-switch strong')).toHaveText(original.name);await page.reload();await expect(page.locator('.project-switch strong')).toHaveText(original.name);await expect(page.locator('.workspace-heading h1')).toHaveText('資料');
  42 | });
  43 | 
  44 | test('native保存ack待ちに届いた後続ファイルを保持し、先の新規復元が確認画面を開き直さない',async({page})=>{
  45 |  const original=createProject('後続選択を続ける作品A');await seed(page,await exportScenario(original));await work(page,'完全保存・復元');const first=createProject('先に保存する作品C'),later=createProject('後から確認する作品D');
  46 |  await page.locator('input[type=file]').setInputFiles({name:'first.scenario',mimeType:'application/zip',buffer:Buffer.from(await exportScenario(first))});await page.getByLabel('復元方法と対象への影響を確認しました').check();
  47 |  await page.evaluate(id=>{const descriptor=Object.getOwnPropertyDescriptor(IDBTransaction.prototype,'oncomplete')!,put=IDBObjectStore.prototype.put;let held:IDBTransaction|undefined;IDBObjectStore.prototype.put=function(...args:Parameters<IDBObjectStore['put']>){if(this.name==='projects'&&(args[0] as any).projectId===id)held=this.transaction;return put.apply(this,args);};Object.defineProperty(IDBTransaction.prototype,'oncomplete',{...descriptor,set(handler){descriptor.set!.call(this,function(this:IDBTransaction,event:Event){if(this===held){(window as any).__rb06AckWaiting=true;(window as any).__rb06ReleaseAck=()=>handler.call(this,event);}else handler.call(this,event);});}});},first.projectId);
  48 |  await page.getByRole('button',{name:'この内容で復元する',exact:true}).click();await expect.poll(()=>page.evaluate(()=>(window as any).__rb06AckWaiting)).toBe(true);
  49 |  const bytes=Array.from(await exportScenario(later));await page.locator('input[type=file]').evaluate((input,values)=>{const transfer=new DataTransfer();transfer.items.add(new File([new Uint8Array(values)],'later.scenario',{type:'application/zip'}));(input as HTMLInputElement).files=transfer.files;input.dispatchEvent(new Event('change',{bubbles:true}));},bytes);await page.evaluate(()=>(window as any).__rb06ReleaseAck());
  50 |  await expect(page.locator('.project-switch strong')).toHaveText(original.name);await expect(page.locator('.import-preview h3')).toContainText(later.name);await page.reload();await work(page,'完全保存・復元');await expect(page.locator('.import-preview h3')).toContainText(later.name);await expect(page.getByLabel('復元方法と対象への影響を確認しました')).not.toBeChecked();
  51 | });
  52 | 
```