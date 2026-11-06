import {test,expect} from '@playwright/test';
import {createEntity,createProject,textToRichText} from '../../src/domain/model';
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
 const hit=positions.getByRole('button',{name:/第65段落/});await hit.click();
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
