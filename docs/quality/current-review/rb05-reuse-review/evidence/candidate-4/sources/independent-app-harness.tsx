import React from 'react';
import {createRoot} from 'react-dom/client';
import App from './src/App';
import {createProject,createEntity} from './src/domain/model';
import {scenarioStore} from './src/storage/store';
import './src/styles.css';
const w=window as any;
let project=localStorage.getItem('independent-project')?await scenarioStore.getProject(localStorage.getItem('independent-project')!):undefined;
if(!project){
 const p=createProject('独立固定再利用 通常操作');
 const source=createEntity(p.projectId,'scene','独立共通元C',{body:[{id:crypto.randomUUID(),kind:'paragraph',text:'旧版😀の共通本文'}]}),s=createEntity(p.projectId,'scene','独立固定参照S'),t=createEntity(p.projectId,'scene','独立複製T'),u=createEntity(p.projectId,'scene','独立上書きU',{body:[{id:crypto.randomUUID(),kind:'paragraph',text:'使用先Uの本文'}]});p.entities.push(source,s,t,u);
 project=(await scenarioStore.saveProject(p,{reason:'Independent browser fixture'})).project;localStorage.setItem('independent-project',project.projectId);
}
localStorage.setItem('scenario-last-project',project.projectId);
const realSave=scenarioStore.saveProject.bind(scenarioStore);let arm=false,gate:{resolve:()=>void;reject:(error:Error)=>void}|undefined;
w.controls={requests:0,pending:()=>!!gate,arm:()=>{arm=true;},release:()=>{gate?.resolve();gate=undefined;},fail:()=>{gate?.reject(new Error('INTENTIONAL_STORAGE_FAILURE'));gate=undefined;},read:()=>scenarioStore.getProject(project!.projectId),projectId:project.projectId,install:async(candidate:any)=>{const result=await realSave(candidate,{reason:'Independent pinned hierarchy fixture'});localStorage.setItem('independent-project',result.project.projectId);localStorage.setItem('scenario-last-project',result.project.projectId);return result.project;}};
scenarioStore.saveProject=async(...args:Parameters<typeof realSave>)=>{w.controls.requests++;if(arm){arm=false;await new Promise<void>((resolve,reject)=>{gate={resolve,reject};});}return realSave(...args);};
createRoot(document.getElementById('root')!).render(<App/>);
