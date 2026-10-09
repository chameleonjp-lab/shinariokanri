import React from 'react';
import {createRoot} from 'react-dom/client';
import App from './src/App';
import {createProject,createEntity,textToRichText} from './src/domain/model';
import {prepareAsset} from './src/domain/attachments';
import {scenarioStore} from './src/storage/store';
import './src/styles.css';
const w=window as any;
const fixture=await (await fetch('./independent/fixtures/reuse-production.json')).json();
if(!(await scenarioStore.listProjects()).length){
 const wav=new Uint8Array(await(await fetch('./tests/fixtures/media/fixture-tone.wav')).arrayBuffer());await scenarioStore.saveProject(fixture.project,{reason:'独立原資料と台詞の基底保存',assets:[await prepareAsset(wav,'独立旧音声.wav')]});const other=createProject('独立制作別作品B');other.entities.push(createEntity(other.projectId,'note','別作品の保持入力',{body:textToRichText('Bの本文を保持')}));await scenarioStore.saveProject(other,{reason:'別作品B保存'});localStorage.setItem('scenario-last-project',fixture.project.projectId);
}
const gates=new Map<string,{resolve:()=>void;reject:(e:Error)=>void}>(),armed=new Set<string>();
async function wait(name:string){if(!armed.delete(name))return;await new Promise<void>((resolve,reject)=>gates.set(name,{resolve,reject}));}
const save=scenarioStore.saveProject.bind(scenarioStore),draft=scenarioStore.saveAuthorToolDraft.bind(scenarioStore),clear=scenarioStore.clearAuthorToolDraft.bind(scenarioStore);
w.controls={fixture,calls:{save:0,draft:0,clear:0},events:[],arm:(name:string)=>armed.add(name),pending:(name:string)=>gates.has(name),release:(name:string)=>{gates.get(name)?.resolve();gates.delete(name);},fail:(name:string)=>{gates.get(name)?.reject(new Error('INTENTIONAL_'+name+'_FAILURE'));gates.delete(name);},read:(id=fixture.project.projectId)=>scenarioStore.getProject(id),all:()=>scenarioStore.listProjects(),draft:(key:string)=>scenarioStore.getAuthorToolDraft(key),export:(id=fixture.project.projectId)=>scenarioStore.exportProject(id),saveCanonical:async(field:string)=>{const p=await scenarioStore.getProjectForEditing(fixture.project.projectId);if(!p)throw Error('missing fixture');const source=p.entities.find(e=>e.id===fixture.ids.source)!;source.name=field;return save(p,{reason:'独立の後発原子変更'});}};
scenarioStore.saveProject=async(...args:any[])=>{w.controls.calls.save++;await wait('save');const result=await save(...args as Parameters<typeof save>);await wait('ack');return result;};
scenarioStore.saveAuthorToolDraft=async value=>{w.controls.calls.draft++;w.controls.events.push({stage:'draft-start',key:value.key,hash:value.asset?.contentHash});await wait('draft');await draft(value);w.controls.events.push({stage:'draft-end',key:value.key,hash:value.asset?.contentHash});};
scenarioStore.clearAuthorToolDraft=async key=>{w.controls.calls.clear++;w.controls.events.push({stage:'clear-start',key});await wait('clear');await clear(key);w.controls.events.push({stage:'clear-end',key});};
createRoot(document.getElementById('root')!).render(<App/>);
