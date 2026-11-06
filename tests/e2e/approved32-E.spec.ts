import {test,expect} from '@playwright/test';
import {createEntity,createProject,textToRichText,newId} from '../../src/domain/model';
import {addChangeReviews} from '../../src/domain/changeReviews';
import {exportScenario} from '../../src/storage/archive';
import {navigate,seed} from './ap04-original-helpers';

test('09 search retains chapter, match page and selected paragraph after navigating away, with removable empty conditions',async({page})=>{
 const project=createProject('09 検索の戻り先');
 const first=createEntity(project.projectId,'scene','第1章の場面',{body:textToRichText('アオは第1章にいる。')});
 const scene=createEntity(project.projectId,'scene','再会',{body:textToRichText(Array.from({length:65},(_,i)=>`アオの文章 ${i+1}`).join('\n'))});
 const chapter=createEntity(project.projectId,'chapter','第2章',{sceneIds:[scene.id]});
 scene.data.chapterId=chapter.id;project.entities.push(first,scene,chapter);
 await page.setViewportSize({width:1280,height:900});await seed(page,await exportScenario(project));await navigate(page,/^検索/);
 await expect(page.getByLabel('章で絞り込む',{exact:true})).not.toBeVisible();
 await page.getByLabel('作品内を検索',{exact:true}).fill('アオ');
 await page.getByText('詳しい検索条件',{exact:true}).click();
 await page.getByLabel('章で絞り込む',{exact:true}).selectOption({label:'第2章'});
 const positions=page.getByRole('region',{name:'本文の検索位置'});
 await expect(positions).toContainText('第2章');
 await positions.getByRole('button',{name:'次のページ',exact:true}).click();
 const hit=positions.getByRole('button',{name:/第65段落/});await expect(hit).toHaveCSS('min-height','48px');await hit.click();
 await expect(page.getByLabel('本文',{exact:true})).toHaveValue(scene.data.body.map(b=>b.text).join('\n'));
 await navigate(page,/^資料/);await navigate(page,/^検索/);
 await expect(page.getByLabel('作品内を検索',{exact:true})).toHaveValue('アオ');
 await expect(page.getByLabel('章で絞り込む',{exact:true})).toHaveValue(chapter.id);
 await expect(positions).toContainText('2 / 2');await expect(hit).toHaveAttribute('aria-pressed','true');
 await page.reload();await expect(hit).toHaveAttribute('aria-pressed','true');
 await page.getByLabel('作品内を検索',{exact:true}).fill('一致しない語');
 await expect(page.getByText(/一致する結果がありません/)).toBeVisible();
 await page.getByRole('button',{name:'語句「一致しない語」 を解除',exact:true}).click();
 await expect(page.getByLabel('作品内を検索',{exact:true})).toHaveValue('');
 await page.getByLabel('作品内を検索',{exact:true}).fill('この作品だけ');
 await page.getByRole('button',{name:/作品一覧へ/}).click();
 await page.getByLabel('作品名',{exact:true}).fill('別作品');await page.getByRole('button',{name:'作品を作成',exact:true}).click();await navigate(page,/^検索/);
 await expect(page.getByLabel('作品内を検索',{exact:true})).toHaveValue('');
});


test('18 character changes retain confirmation and show word-only candidates separately',async({page})=>{
 const before=createProject('18 変更確認'),person=createEntity(before.projectId,'character','アオ'),namesake=createEntity(before.projectId,'character','アオ');
 const scene=createEntity(before.projectId,'scene','本人の場面',{povId:person.id,body:textToRichText('前の文。本人の所属について語る。後の文。')}),other=createEntity(before.projectId,'scene','別人の場面',{povId:namesake.id}),mention=createEntity(before.projectId,'scene','語句だけの候補',{body:textToRichText('アオかもしれない。')});
 before.entities.push(person,namesake,scene,other,mention);
 const candidate=structuredClone(before);(candidate.entities.find(entity=>entity.id===person.id) as typeof person).data.death={mode:'unknown',reason:'消息の変更'};
 const reviewed=addChangeReviews(before,candidate);
 await page.setViewportSize({width:1280,height:900});await seed(page,await exportScenario(reviewed));await navigate(page,/^検索/);await page.getByRole('tab',{name:'見直しと統合',exact:true}).click();
 await page.getByLabel('変更の影響を確認する人物',{exact:true}).selectOption(person.id);
 const reviews=page.getByRole('region',{name:'人物設定の変更による見直し'});
 await expect(reviews).toContainText('本人の場面');await expect(reviews).not.toContainText('別人の場面');await expect(reviews).toContainText('前の文。');
 await reviews.getByLabel('変更確認: 本人の場面の対応状態',{exact:true}).selectOption('verified');
 await expect(reviews.getByRole('heading',{name:/本人の場面 · 再確認済み/})).toBeVisible();
 await page.reload();await page.getByRole('tab',{name:'見直しと統合',exact:true}).click();
 await page.getByLabel('変更の影響を確認する人物',{exact:true}).selectOption(person.id);
 await expect(reviews.getByRole('heading',{name:/本人の場面 · 再確認済み/})).toBeVisible();
 await reviews.getByRole('button',{name:'単語だけ一致した候補を確認',exact:true}).click();
 await expect(reviews.getByRole('region',{name:'単語だけ一致した候補'})).toContainText('語句だけの候補');
});

for(const viewport of [{width:1280,height:900},{width:402,height:700}])test(`08 a character sheet preserves the mounted draft, paragraph selection and historical affiliation at ${viewport.width}px`,async({page})=>{
 const project=createProject('08 人物を開いて本文へ戻る'),person=createEntity(project.projectId,'character','アオ'),namesake=createEntity(project.projectId,'character','アオ'),oldGroup=createEntity(project.projectId,'group','昔の所属'),newGroup=createEntity(project.projectId,'group','今の所属');
 const event=createEntity(project.projectId,'event','過去の出来事',{time:{mode:'instant',at:'10',calendarId:project.calendarId}}),scene=createEntity(project.projectId,'scene','回想',{eventIds:[event.id],body:[{id:newId(),kind:'paragraph',text:'😀アオは過去を語る。',links:[{start:1,end:3,target:{entityId:person.id}}]}]});
 const membership=(name:string,groupId:string,start:string,end:string|null)=>createEntity(project.projectId,'assertion',name,{subjectId:person.id,predicate:'member_of',value:groupId,truthKind:'author_truth',validity:{worldRange:{start,end},routeCondition:null,presentationAnchor:null}});
 project.entities.push(person,namesake,oldGroup,newGroup,event,scene,membership('過去の所属',oldGroup.id,'0','20'),membership('現在の所属',newGroup.id,'20',null));
 await page.setViewportSize(viewport);await seed(page,await exportScenario(project));await navigate(page,/^資料/);await page.getByLabel('情報の種類',{exact:true}).selectOption('scene');await page.locator('.entity-card').filter({hasText:'回想'}).click();await page.getByRole('tab',{name:'本文',exact:true}).click();
 const input=page.getByLabel('本文',{exact:true}),raw='😀アオは過去を語る。\n未保存の次の段落も保持する。';await input.fill(raw);
 await input.evaluate((element:HTMLTextAreaElement)=>{element.dataset.retainedEditor='same';element.focus();element.setSelectionRange(5,9);element.scrollTop=4;});
 await page.getByRole('button',{name:'人物設定を開く',exact:true}).click();
 const sheet=page.getByRole('dialog',{name:'人物設定',exact:true});await expect(sheet).toContainText(person.id.slice(-6));await expect(sheet).toContainText('昔の所属');await expect(sheet).not.toContainText('今の所属');
 await sheet.getByRole('button',{name:'本文の選択範囲へ戻る',exact:true}).click();
 await expect(input).toHaveValue(raw);await expect(input).toBeFocused();expect(await input.evaluate((element:HTMLTextAreaElement)=>[element.selectionStart,element.selectionEnd,element.dataset.retainedEditor])).toEqual([5,9,'same']);
 const candidates=page.getByLabel('本文に見つかった候補',{exact:true});
 const options=await candidates.locator('option').allTextContents();expect(options.some(label=>label.includes(person.id.slice(-6)))).toBe(true);expect(options.some(label=>label.includes(namesake.id.slice(-6)))).toBe(true);
 await candidates.selectOption({label:options.find(label=>label.includes(namesake.id.slice(-6)))!});
 await page.getByRole('button',{name:'候補の人物設定を開く',exact:true}).click();await expect(sheet).toContainText(namesake.id.slice(-6));await sheet.getByRole('button',{name:'閉じる',exact:true}).click();await expect(input).toHaveValue(raw);
});
