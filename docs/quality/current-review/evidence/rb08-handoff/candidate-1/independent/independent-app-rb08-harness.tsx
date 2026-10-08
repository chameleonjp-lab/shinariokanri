import React from 'react';
import {createRoot} from 'react-dom/client';
import App from './src/App';
import {scenarioStore} from './src/storage/store';
import {createProject,createEntity,textToRichText} from './src/domain/model';
import {exportProject} from './src/domain/exports';
import './src/styles.css';
const w=window as any,fixture=await(await fetch('./independent/fixtures/ui-production-handoff.json')).json();
if(!(await scenarioStore.listProjects()).length){await scenarioStore.saveProject(fixture.project,{reason:'独立の制作・媒体・相談基底'});const other=createProject('独立RB08別作品B');other.entities.push(createEntity(other.projectId,'note','Bの保持本文',{body:textToRichText('Bの本文')}));await scenarioStore.saveProject(other,{reason:'別作品B'});localStorage.setItem('scenario-last-project',fixture.project.projectId);}
const gates=new Map<string,{resolve:()=>void;reject:(error:Error)=>void}>(),armed=new Set<string>();async function wait(name:string){if(!armed.delete(name))return;await new Promise<void>((resolve,reject)=>gates.set(name,{resolve,reject}));}
const save=scenarioStore.saveProject.bind(scenarioStore),draft=scenarioStore.saveAuthorToolDraft.bind(scenarioStore),readFile=File.prototype.arrayBuffer;
w.controls={fixture,calls:{save:0,draft:0,file:0},arm:(name:string)=>armed.add(name),pending:(name:string)=>gates.has(name),release:(name:string)=>{gates.get(name)?.resolve();gates.delete(name);},fail:(name:string)=>{gates.get(name)?.reject(new Error('INTENTIONAL_'+name+'_FAILURE'));gates.delete(name);},read:(id=fixture.project.projectId)=>scenarioStore.getProject(id),export:(id=fixture.project.projectId)=>scenarioStore.exportProject(id),draft:(key:string)=>scenarioStore.getAuthorToolDraft(key),package:async()=>{const project=await scenarioStore.getProject(fixture.project.projectId);if(!project)throw Error('fixture');return exportProject(project,{profile:'runtime_json',projectionProfileId:fixture.ids.policy,targetRevision:project.revision});},saveCanonical:async()=>{const p=await scenarioStore.getProjectForEditing(fixture.project.projectId);if(!p)throw Error('fixture');const actor=p.entities.find(e=>e.id===fixture.ids.actor);if(actor)actor.name+=' · 後発変更';return save(p,{reason:'独立の後発変更'});}};
scenarioStore.saveProject=async(...args:any[])=>{w.controls.calls.save++;await wait('save');const result=await save(...args as Parameters<typeof save>);await wait('ack');return result;};
scenarioStore.saveAuthorToolDraft=async value=>{w.controls.calls.draft++;await wait('draft');return draft(value);};
File.prototype.arrayBuffer=async function(){w.controls.calls.file++;await wait('file-read');return readFile.call(this);};
createRoot(document.getElementById('root')!).render(<App/>);
