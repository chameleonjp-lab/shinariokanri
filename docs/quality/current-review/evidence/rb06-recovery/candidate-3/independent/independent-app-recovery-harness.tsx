import React from 'react';
import {createRoot} from 'react-dom/client';
import App from './src/App';
import {createProject,createEntity,textToRichText} from './src/domain/model';
import {scenarioStore} from './src/storage/store';
import {inspectScenario} from './src/storage/archive';
import './src/styles.css';
const w=window as any;
if(!(await scenarioStore.listProjects()).length){
 const a=createProject('独立 復元先A'),b=createProject('独立 復元先B');
 a.entities.push(createEntity(a.projectId,'note','残すA本文',{body:textToRichText('A保持😀')}));b.entities.push(createEntity(b.projectId,'note','残すB本文',{body:textToRichText('B保持😀')}));
 await scenarioStore.saveProject(a,{reason:'通常の原子保存A'});await scenarioStore.saveProject(b,{reason:'通常の原子保存B'});localStorage.setItem('scenario-last-project',a.projectId);
}
const gates=new Map<string,{resolve:()=>void;reject:(e:Error)=>void}>(),armed=new Set<string>();
async function wait(name:string){if(!armed.delete(name))return;await new Promise<void>((resolve,reject)=>gates.set(name,{resolve,reject}));}
const realImport=scenarioStore.importScenario.bind(scenarioStore),realPreview=scenarioStore.previewImport.bind(scenarioStore),realWhole=scenarioStore.restoreHistoryVersion.bind(scenarioStore),realUnit=scenarioStore.restoreEntity.bind(scenarioStore);
w.controls={calls:{import:0,preview:0,whole:0,unit:0},arm:(name:string)=>armed.add(name),pending:(name:string)=>gates.has(name),release:(name:string)=>{gates.get(name)?.resolve();gates.delete(name);},fail:(name:string)=>{gates.get(name)?.reject(new Error('INTENTIONAL_'+name+'_FAILURE'));gates.delete(name);},read:(id:string)=>scenarioStore.getProject(id),all:()=>scenarioStore.listProjects(),draft:(key:string)=>scenarioStore.getImportDraft(key),readHistory:()=>scenarioStore.listHistory(localStorage.getItem('scenario-last-project')!),installHistory:async()=>{const bytes=new Uint8Array(await (await fetch('./tests/fixtures/rb06-history.scenario')).arrayBuffer());const p=(await scenarioStore.importScenario(await inspectScenario(bytes),{mode:'new'})).project;localStorage.setItem('scenario-last-project',p.projectId);return p;}};
scenarioStore.previewImport=async(...args:any[])=>{w.controls.calls.preview++;await wait('preview');return realPreview(...args as Parameters<typeof realPreview>);};
scenarioStore.importScenario=async(...args:any[])=>{w.controls.calls.import++;await wait('import');const result=await realImport(...args as Parameters<typeof realImport>);await wait('ack');return result;};
scenarioStore.restoreHistoryVersion=async(...args:any[])=>{w.controls.calls.whole++;await wait('whole');return realWhole(...args as Parameters<typeof realWhole>);};
scenarioStore.restoreEntity=async(...args:any[])=>{w.controls.calls.unit++;await wait('unit');return realUnit(...args as Parameters<typeof realUnit>);};
createRoot(document.getElementById('root')!).render(<App/>);
