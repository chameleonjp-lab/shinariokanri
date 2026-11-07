import {expect,test} from '@playwright/test';
import {createEntity,createProject,textToRichText} from '../../src/domain/model';
import {exportScenario} from '../../src/storage/archive';
import {exportTranslationCsv,translationCsvCells,encodeTranslationCsv} from '../../src/domain/translationCsv';
import {seed,navigate,openEntity} from './ap04-original-helpers';
import {prepareAsset} from '../../src/domain/attachments';

test('translation CSV preflight holds broken rows, cancels, retries quota failure and saves the selected translation once',async({page})=>{
 test.setTimeout(120000);await page.setViewportSize({width:402,height:700});
 const p=createProject('CSVの作品'),a=createEntity(p.projectId,'dialogue_line','日本語台詞',{text:textToRichText('鍵 {name} 😀')}),b=createEntity(p.projectId,'dialogue_line','別の台詞',{text:textToRichText('Bye {name}')});p.entities=[a,b];
 const cells=translationCsvCells(await exportTranslationCsv(p,'en'));cells[1][5]="'=SUM(1,2) key {name} 😀\nquoted \"text\"";cells[2][5]="'missing placeholder";
 await seed(page,await exportScenario(p));await navigate(page,/^構成/);await page.getByRole('tab',{name:'制作',exact:true}).click();
 const panel=page.getByRole('region',{name:'翻訳CSVの往復'});const exportSize=await panel.getByRole('button',{name:'翻訳CSVを書き出す',exact:true}).boundingBox();expect(exportSize?.height).toBeGreaterThanOrEqual(48);
 const file={name:'translations.csv',mimeType:'text/csv',buffer:Buffer.from(encodeTranslationCsv(cells))};await panel.getByLabel('編集した翻訳CSV').setInputFiles(file);
 await expect(panel).toContainText('保留 1行');await expect(panel).toContainText('埋込み語の欠落または重複');await panel.getByRole('button',{name:'CSV取込を中止',exact:true}).click();await expect(panel.getByRole('checkbox')).toHaveCount(0);
 await panel.getByLabel('編集した翻訳CSV').setInputFiles(file);await panel.getByRole('checkbox',{name:/行 1/}).check();await panel.getByRole('button',{name:'選んだ訳文の差分を確認',exact:true}).click();
 const confirmation=panel.getByRole('region',{name:'翻訳の保存前確認'});await expect(confirmation).toContainText('訳文 1行');
 await page.evaluate(()=>{const put=IDBObjectStore.prototype.put;let fail=true;IDBObjectStore.prototype.put=function(...args:Parameters<IDBObjectStore['put']>){if(fail&&this.name==='projects'){fail=false;throw new DOMException('試験用容量不足','QuotaExceededError');}return put.apply(this,args);};});
 await confirmation.getByRole('button',{name:'確認した訳文だけを保存',exact:true}).click();await expect(panel.getByRole('alert')).toBeVisible();await expect(confirmation).toContainText('=SUM(1,2)');await confirmation.getByRole('button',{name:'確認した訳文だけを保存',exact:true}).dblclick();await expect(panel).toContainText('選択した訳文を一度だけ保存');
 await page.reload();await navigate(page,/^構成/);await page.getByRole('tab',{name:'制作',exact:true}).click();
 const download=page.waitForEvent('download');await panel.getByRole('button',{name:'翻訳CSVを書き出す',exact:true}).click();const csv=await download,stream=await csv.createReadStream();const chunks:Buffer[]=[];for await(const part of stream!)chunks.push(Buffer.from(part));const rows=translationCsvCells(Buffer.concat(chunks).toString('utf8'));expect(rows).toHaveLength(3);expect(rows[1][5]).toContain("'=SUM(1,2)");expect(rows[2][5]).toBe("'");
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1)).toBe(true);
});

test('material review requires purpose, proof and credit and keeps author confirmation in the saved work',async({page})=>{
 test.setTimeout(120000);const p=createProject('素材確認'),asset=await prepareAsset(new TextEncoder().encode('original'),'同名.txt','text/plain');const {bytes,preview:_preview,...metadata}=asset;const source=createEntity(p.projectId,'source','作者の原画',{sourceType:'file',locator:'作者の記録',redistributionAllowed:true}),attachment=createEntity(p.projectId,'attachment','同名.txt',{...metadata,provenanceId:source.id,licenseNote:'原作者に要確認'});p.entities=[source,attachment];
 await seed(page,await exportScenario(p,{loadAsset:async hash=>hash===asset.contentHash?bytes:undefined}));await openEntity(page,'attachment','同名.txt');
 const panel=page.getByRole('region',{name:'素材の用途と権利確認'});await expect(panel).toContainText('原作者に要確認');await panel.getByRole('button',{name:'素材の確認内容を比較',exact:true}).click();await expect(panel.getByRole('alert')).toBeVisible();
 await panel.getByLabel('許諾を確認した根拠').fill('作者本人から配布許諾を確認');await panel.getByLabel('必要な表記文').fill('Art: 作者');await panel.getByRole('button',{name:'素材の確認内容を比較',exact:true}).click();await panel.getByRole('button',{name:'比較した素材の確認を保存',exact:true}).click();await expect(panel).toContainText('この用途の確認を保存');
 await page.reload();await openEntity(page,'attachment','同名.txt');await expect(panel.getByLabel('必要な表記文')).toHaveValue('Art: 作者');
});

test('legacy projection approvals keep output available while rights remain unknown and explicit exclusion stops download',async({page})=>{
 test.setTimeout(120000);const p=createProject('既存の再配布承認'),asset=await prepareAsset(new TextEncoder().encode('material'),'author-secret.txt','text/plain'),{bytes,preview:_preview,...metadata}=asset,image=createEntity(p.projectId,'attachment','作者用の素材名',metadata),policy=createEntity(p.projectId,'projection_profile','reader',{audience:'reader',publicTitle:'public',includedIds:[image.id],allowedKinds:['attachment'],approvedAttachmentIds:[image.id],namePolicy:{defaultPolicy:{mode:'replace',replacement:'public material'}},publicTexts:{[image.id]:{displayName:'public.txt'}}});image.status='confirmed';policy.status='confirmed';p.entities=[image,policy];
 await seed(page,await exportScenario(p,{loadAsset:async()=>bytes}));await navigate(page,/^作品・保存/);await page.getByRole('tab',{name:'目的別出力',exact:true}).click();await page.getByLabel('出力する公開範囲',{exact:true}).selectOption(policy.id);await page.getByRole('button',{name:'内容を検査・プレビュー',exact:true}).click();const review=page.getByRole('region',{name:'配布する素材の表記確認'});await expect(review).toContainText('作者の判断が必要な素材');await expect(review).toContainText('作者用の素材名');await expect(review).toContainText('表記案はありません');
 const download=page.getByRole('button',{name:'この内容を保存',exact:true});await expect(download).toBeEnabled();await review.getByRole('combobox').selectOption('exclude');await expect(download).toBeDisabled();await review.getByRole('combobox').selectOption('separate');await expect(download).toBeEnabled();const event=page.waitForEvent('download');await download.click();const saved=await event,stream=await saved.createReadStream(),chunks:Buffer[]=[];for await(const chunk of stream!)chunks.push(Buffer.from(chunk));expect(Buffer.concat(chunks).toString('utf8')).not.toContain('作者用の素材名');await expect(review).toContainText('表記案はありません');
});
