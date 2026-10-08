import { chromium } from '@playwright/test';
import { spawn } from 'node:child_process';
import { writeFile } from 'node:fs/promises';
const root=new URL('.',import.meta.url).pathname,port=5229,base=`http://127.0.0.1:${port}/shinariokanri/independent-harness.html`;
const server=spawn(process.execPath,[`${root}node_modules/vite/bin/vite.js`,'--host','127.0.0.1','--port',String(port),'--strictPort'],{cwd:root,stdio:'pipe'});
let serverLog='';server.stdout.on('data',s=>{serverLog+=s;});server.stderr.on('data',s=>{serverLog+=s;});
const result={scope:'component integration in actual headless Chromium; not full App, real device, or original acceptance',startedAt:new Date().toISOString(),environment:{node:process.version,platform:process.platform},checks:[]};
let browser;
try{
 const deadline=Date.now()+15000;let ready=false;while(Date.now()<deadline){try{if((await fetch(base)).ok){ready=true;break;}}catch{}await new Promise(r=>setTimeout(r,100));}if(!ready)throw new Error(serverLog);
 browser=await chromium.launch({executablePath:'/usr/bin/chromium',args:['--no-sandbox']});result.environment.browser=browser.version();
 const page=await browser.newPage({viewport:{width:1024,height:768}}),errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto(base);await page.getByLabel('作品名',{exact:true}).fill('Saved input');await page.getByRole('button',{name:'作品の設定を保存',exact:true}).click();await page.waitForFunction(()=>window.requests===1);
 await page.getByRole('button',{name:'Toggle settings'}).click();await page.getByRole('button',{name:'Toggle settings'}).click();
 result.checks.push({id:'IC08a',expected:'save remains disabled after remount during pending save',actual:{saveDisabled:await page.getByRole('button',{name:'作品の設定を保存',exact:true}).isDisabled()},status:await page.getByRole('button',{name:'作品の設定を保存',exact:true}).isDisabled()?'passed':'failed'});
 await page.evaluate(()=>window.resolveSave());await page.waitForFunction(()=>window.harnessProject.revision==='1'&&window.harnessSaving===false);
 const staleCount=await page.getByText('別の変更が保存されました。入力と現在版の差分を確認してください。',{exact:true}).count();
 result.checks.push({id:'IC08b',expected:'acknowledged input ceases to be unsaved after remount',actual:{staleNoticeCount:staleCount,name:await page.getByLabel('作品名',{exact:true}).inputValue(),parentDraft:await page.evaluate(()=>window.harnessDraft??null),statuses:await page.locator('[role=status]').allTextContents()},status:staleCount===0?'passed':'failed'});
 await page.goto(base);await page.getByText('暦の定義を編集',{exact:true}).click();await page.getByRole('textbox',{name:'暦の定義',exact:true}).fill('{ incomplete calendar');await page.getByRole('button',{name:'Toggle settings'}).click();await page.getByRole('button',{name:'Toggle settings'}).click();await page.getByText('暦の定義を編集',{exact:true}).click();
 const raw=await page.getByRole('textbox',{name:'暦の定義',exact:true}).inputValue();result.checks.push({id:'IC09',expected:'invalid calendar JSON input is preserved across remount',actual:raw,status:raw==='{ incomplete calendar'?'passed':'failed'});
 errors.length=0;await page.goto(`${base}?mode=reader`);const startTick=page.getByLabel('試読開始時点の世界内tick');await startTick.fill('5');await page.getByRole('button',{name:'試読を始める',exact:true}).click();const progressTick=page.getByLabel('試読時点の世界内tick');await progressTick.waitFor();result.checks.push({id:'IC14u',expected:'tick inputs are available before start and while reading a node with no trigger',actual:{startCount:await startTick.count(),progressCount:await progressTick.count(),progressValue:await progressTick.inputValue()},status:await startTick.count()===1&&await progressTick.count()===1&&await progressTick.inputValue()==='5'?'passed':'failed'});await page.getByRole('button',{name:'仮値',exact:true}).click();
 await page.waitForFunction(()=>document.body.textContent.includes('作者の仮値を設定')||document.querySelector('#root')?.children.length===0);
 const modalCount=await page.getByText('作者の仮値を設定',{exact:true}).count();result.checks.push({id:'IC10',expected:'borrowed variable stub modal opens safely with its fixed definition',actual:{modalCount,pageErrors:errors,rootChildren:await page.locator('#root').evaluate(e=>e.children.length)},status:modalCount===1&&errors.length===0?'passed':'failed'});
}catch(e){result.harnessError=e.message;process.exitCode=1;}finally{if(browser)await browser.close();server.kill('SIGTERM');result.finishedAt=new Date().toISOString();if(result.checks.some(check=>check.status==='failed'))process.exitCode=1;await writeFile('/tmp/shinariokanri-independent-candidate-5-ui-review.json',JSON.stringify(result,null,2)+'\n');await writeFile('/tmp/shinariokanri-independent-candidate-5-ui-review-vite.log',serverLog);console.log(JSON.stringify(result,null,2));}
