import {expect,type Browser,type Locator,type Page,type TestInfo} from '@playwright/test';
import {attachGiven,attachObservation,authorFingerprint,backup,editData,navigate,openEntity,seed} from './ap04-original-helpers';

async function reachable(page:Page,control:Locator){
 await control.scrollIntoViewIfNeeded();await expect(control).toBeVisible();
 const box=await control.boundingBox(),viewport=page.viewportSize();
 if(!box||!viewport)throw Error('F31の操作位置を観測できません');
 expect(box.x).toBeGreaterThanOrEqual(0);expect(box.x+box.width).toBeLessThanOrEqual(viewport.width);
 expect(box.y+box.height/2).toBeGreaterThanOrEqual(0);expect(box.y+box.height/2).toBeLessThanOrEqual(viewport.height);
}

/** The exact N01 work also supplies F31's people, condition, relation and
 * actual dedicated file. Physical rotation/Split View/OS keyboard remain
 * manual conditions; CSS viewport observations never certify those devices. */
export async function exerciseF31SameWork(page:Page,browser:Browser,info:TestInfo,input:{given:Awaited<ReturnType<typeof backup>>;width:number;personId:string;personName:string;otherId:string;edgeId:string;edgeName:string;relationId:string}){
 const {given,width,personId,personName,otherId,edgeId,edgeName,relationId}=input;
 await attachGiven(info,'AT-F31',given.bytes,{projectId:given.project.projectId,personId,edgeId,relationId,initialViewport:{width,height:820},scope:'same work and actual complete file; browser layout support only'});
 await openEntity(page,'character',personName);
 const details=page.locator('.detail-panel details.advanced-details').filter({has:page.locator('summary').filter({hasText:'詳細データ・ルビ・本文リンクを編集'})});
 if(await details.getAttribute('open')===null)await details.locator('summary').tap();
 const raw=details.getByRole('textbox',{name:'詳細データ',exact:true}),original=await raw.inputValue(),unfinished=original.slice(0,-1);
 const before=await authorFingerprint(page);await raw.fill(unfinished);
 const save=page.locator('.editor-footer').getByRole('button',{name:/保存する|保存を再試行/});
 await expect(save).toBeDisabled();
 const layouts=[];
 for(const viewport of [{width:320,height:820},{width:390,height:820},{width:768,height:820},{width:1024,height:820},{width:1440,height:820},{width:820,height:390},{width:390,height:480},{width,height:820}]){
  await page.setViewportSize(viewport);await expect(raw).toHaveValue(unfinished);await expect(save).toBeDisabled();await reachable(page,save);
  const dimensions=await page.evaluate(()=>({width:document.documentElement.clientWidth,scrollWidth:document.documentElement.scrollWidth}));
  expect(dimensions.scrollWidth).toBeLessThanOrEqual(dimensions.width);layouts.push({viewport,dimensions,unfinishedRetained:true});
 }
 expect(await authorFingerprint(page)).toBe(before);
 await raw.fill(JSON.stringify({...JSON.parse(original),reading:'すまーとふぉんでへんしゅう'},null,2));
 await reachable(page,save);await save.tap();await expect(page.locator('.editor-save-state')).toContainText('端末内保存済み');
 const personSaved=await backup(page);expect(personSaved.project.entities.find(entity=>entity.id===personId)?.data).toMatchObject({reading:'すまーとふぉんでへんしゅう'});
 await openEntity(page,'flow_edge',edgeName);
 const edge=personSaved.project.entities.find(entity=>entity.id===edgeId);
 if(!edge||edge.kind!=='flow_edge'||edge.data.condition?.op!=='compare')throw Error('元F31入力の型付き条件がありません');
 await editData(page,{...edge.data,condition:{...edge.data.condition,value:{type:'boolean',value:false}}});
 await navigate(page,/^年表/);await page.getByRole('tab',{name:'関係表・図',exact:true}).tap();await page.getByRole('button',{name:'関係表',exact:true}).tap();
 await page.locator(`[data-relation-id="${relationId}"]`).locator('.world-relation-meaning').tap();
 const dialog=page.getByRole('dialog',{name:'意味付きの関係を編集',exact:true});
 await dialog.getByLabel('関係の種類',{exact:true}).selectOption('related');
 await dialog.getByRole('combobox',{name:'関係の始点',exact:true}).selectOption(personId);await dialog.getByRole('combobox',{name:'関係の終点',exact:true}).selectOption(otherId);
 const confirm=dialog.getByRole('button',{name:'関係を保存',exact:true});await reachable(page,confirm);await confirm.tap();await expect(dialog).toBeHidden();
 const complete=await backup(page);
 expect(complete.project.relations.find(relation=>relation.id===relationId)).toMatchObject({fromId:personId,toId:otherId,relationType:'related'});
 expect(complete.project.entities.find(entity=>entity.id===edgeId)?.data).toMatchObject({condition:{op:'compare',value:{type:'boolean',value:false}}});
 const fresh=await browser.newContext({baseURL:info.project.use.baseURL as string,viewport:{width,height:820},hasTouch:true,isMobile:true});
 try{
  const restored=await fresh.newPage();await seed(restored,complete.bytes);await restored.reload();await expect(restored.locator('.app-shell')).toBeVisible();
  const cold=await backup(restored);expect(cold.project).toEqual(complete.project);
  expect(complete.recovery?.pending.length).toBeGreaterThan(0);
  expect(cold.recovery?.pending.slice(0,complete.recovery!.pending.length)).toEqual(complete.recovery!.pending);
  await attachObservation(info,'AT-F31-same-work-observed',{projectId:complete.project.projectId,personId,edgeId,relationId,layouts,personConditionAndRelationEditedAtNarrowWidth:width,actualFileColdRestoration:true,actualPhysicalDevice:false,actualOSKeyboard:false,actualSplitView:false,wholePhysicalAcceptancePromotion:false});
 }finally{await fresh.close();}
}
