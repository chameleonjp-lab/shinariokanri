import {test,expect,type Page} from '@playwright/test';
import {createEntity,createProject,textToRichText} from '../../src/domain/model';
import {exportScenario} from '../../src/storage/archive';
import {strFromU8,unzipSync} from 'fflate';
import {readFile} from './downloadEvidence';

async function playable(page:Page){
 const p=createProject('SECRET_AUTHOR_WORK'),scenes=[0,1,2].map(n=>createEntity(p.projectId,'scene',`場面${n}`,{body:textToRichText(`作者の原文${n}`),authorNotes:textToRichText('SECRET_AUTHOR_NOTE')}));
 const nodes=scenes.map((s,n)=>createEntity(p.projectId,'flow_node',`地点${n}`,{sceneId:s.id,nodeType:n===0?'entry':n===2?'terminal':'choice',executionPolicy:'manual_choice',terminalReason:n===2?'完了':undefined}));
 const edges=[createEntity(p.projectId,'flow_edge','第一の表示選択',{fromId:nodes[0].id,toId:nodes[1].id,edgeType:'choice',label:'一つ目へ'}),createEntity(p.projectId,'flow_edge','第二の表示選択',{fromId:nodes[1].id,toId:nodes[2].id,edgeType:'choice',label:'二つ目へ'}),createEntity(p.projectId,'flow_edge','読者がまだ見ない分岐',{fromId:nodes[2].id,toId:nodes[0].id,edgeType:'choice',label:'UNSEEN_ROUTE'})];
 const graph=createEntity(p.projectId,'flow_graph','公開分岐',{nodeIds:nodes.map(n=>n.id),edgeIds:edges.map(e=>e.id),entryIds:[nodes[0].id],exitIds:[nodes[2].id]});
 const included=[...scenes,...nodes,...edges,graph];included.forEach(e=>e.status='confirmed');
 const policy=createEntity(p.projectId,'projection_profile','作者の公開指定',{audience:'reader',publicTitle:'公開試読',publicVersionLabel:'配布第7版',includedIds:included.map(e=>e.id),allowedKinds:['scene','flow_node','flow_edge','flow_graph'],idPolicy:'remap',publicIds:Object.fromEntries(included.map(e=>[e.id,crypto.randomUUID()])),namePolicy:{byEntityId:Object.fromEntries(included.map(e=>[e.id,{mode:'replace' as const,replacement:e.name}]))},publicTexts:Object.fromEntries([...scenes.map((s,n)=>[s.id,{body:textToRichText(`公開本文${n}`)}]),...edges.map(e=>[e.id,{label:e.data.label}]),[nodes[2].id,{terminalReason:'完了'}]])});
 for(const fields of Object.values(policy.data.publicTexts!))for(const value of Object.values(fields))if(Array.isArray(value))for(const block of value)if(block&&typeof block==='object'&&'id' in block)policy.data.publicIds![String(block.id)]=crypto.randomUUID();
 policy.status='confirmed';p.entities.push(...included,policy);await page.goto('./');await page.getByRole('button',{name:'保存ファイルを読み込む',exact:true}).click();await page.locator('input[type=file][accept*=".scenario"]').setInputFiles({name:'reader.scenario',mimeType:'application/zip',buffer:Buffer.from(await exportScenario(p))});await page.getByLabel('復元方法と対象への影響を確認しました').check();await page.getByRole('button',{name:'この内容で復元する',exact:true}).click();await expect(page.locator('.app-shell')).toBeVisible();const menu=page.getByRole('button',{name:'メニューを開く',exact:true});if(await menu.isVisible())await menu.click();await page.locator('.sidebar').getByRole('button',{name:/^作品・保存/}).first().click();await page.getByRole('tab',{name:'目的別出力',exact:true}).click();await page.getByLabel('出力目的',{exact:true}).selectOption('playable_preview');await page.getByRole('button',{name:'内容を検査・プレビュー',exact:true}).click();await expect(page.locator('.export-artifact')).toBeVisible();const download=page.waitForEvent('download');await page.locator('.export-artifact').getByRole('button',{name:'この内容を保存',exact:true}).click();const files=unzipSync(new Uint8Array(await readFile((await (await download).path())!)));return {html:strFromU8(files['index.html']),runtime:JSON.parse(strFromU8(files['runtime.json']))};
}
test('two opt-in branch notes return only one reviewed row and never send observation traffic',async({page},info)=>{
 const {html,runtime}=await playable(page),requests:string[]=[];await page.route('**/stage-i-playable',route=>route.fulfill({contentType:'text/html',body:html}));await page.goto('/stage-i-playable');page.on('request',r=>{if(/^https?:/.test(r.url()))requests.push(r.url());});
 await expect(page.getByRole('button',{name:'一つ目へ',exact:true})).toBeVisible();
 await expect(page.getByLabel('返す控え1',{exact:true})).toHaveCount(0);
 await page.getByLabel('迷った理由（任意）',{exact:true}).fill('選んだ理由😀');await page.getByRole('button',{name:'ここで迷った',exact:true}).click();
 await page.getByRole('button',{name:'一つ目へ',exact:true}).click();await page.getByLabel('迷った理由（任意）',{exact:true}).fill('UNSELECTED_PRIVATE_REASON');await page.getByRole('button',{name:'ここで迷った',exact:true}).click();
 await page.getByRole('button',{name:'二つ目へ',exact:true}).click();
 await page.getByLabel('返す控え1',{exact:true}).check();await page.getByRole('button',{name:'選んだ控えの返却内容を確認',exact:true}).click();
 const preview=page.getByLabel('返却ファイルの内容',{exact:true});await expect(preview).toContainText('選んだ理由😀');await expect(preview).not.toContainText('UNSELECTED_PRIVATE_REASON');
 const download=page.waitForEvent('download');await page.getByRole('button',{name:'確認した控えをファイルに保存',exact:true}).click();const text=await readFile((await (await download).path())!,'utf8'),file=JSON.parse(text);
 expect(file.rows).toHaveLength(1);expect(file.rows[0].publicEdition).toBe(runtime.contentVersionId);expect(file.rows[0].shownChoices).toEqual([{id:runtime.entities.find((e:any)=>e.kind==='flow_edge'&&e.data.label==='一つ目へ').id,label:'一つ目へ'}]);expect(text).not.toMatch(/UNSELECTED|UNSEEN_ROUTE|SECRET|authorNotes|trace|variableValues/);expect(requests).toEqual([]);
 await info.attach('selected-reader-return.json',{body:text,contentType:'application/json'});await info.attach('reader-observation-network.json',{body:JSON.stringify(requests),contentType:'application/json'});
});
test('zero selected finishes locally without creating any return artifact',async({page})=>{
 const {html}=await playable(page);await page.route('**/stage-i-playable',route=>route.fulfill({contentType:'text/html',body:html}));await page.goto('/stage-i-playable');const downloads:string[]=[];page.on('download',d=>downloads.push(d.suggestedFilename()));await page.getByRole('button',{name:'ここで迷った',exact:true}).click();await page.getByRole('button',{name:'選んだ控えの返却内容を確認',exact:true}).click();await expect(page.getByLabel('返却ファイルの内容',{exact:true})).toHaveCount(0);await expect(page.getByRole('button',{name:'確認した控えをファイルに保存',exact:true})).toHaveCount(0);await page.getByRole('button',{name:'返さずに終了',exact:true}).click();await expect(page.getByText('控えを返さず終了しました。')).toBeVisible();expect(downloads).toEqual([]);
});
