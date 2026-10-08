import React from 'react';
import {createRoot} from 'react-dom/client';
import App from './src/App';
import {createProject,createEntity} from './src/domain/model';
import {scenarioStore} from './src/storage/store';
import './src/styles.css';
const w=window as any;
let project=localStorage.getItem('independent-project')?await scenarioStore.getProject(localStorage.getItem('independent-project')!):undefined;
if(!project){
 const p=createProject('独立 RB05 通常操作');
 const s=createEntity(p.projectId,'scene','初回の場面',{body:[{id:crypto.randomUUID(),kind:'paragraph',text:'初回の反応です。'}]}),s2=createEntity(p.projectId,'scene','再訪の場面',{body:[{id:crypto.randomUUID(),kind:'paragraph',text:'再訪の反応です。'}]});
 const a=createEntity(p.projectId,'flow_node','独立入口',{nodeType:'entry',sceneId:s.id}),b=createEntity(p.projectId,'flow_node','独立終端',{nodeType:'terminal',sceneId:s2.id,terminalReason:'Declared end'}),edge=createEntity(p.projectId,'flow_edge','進む',{fromId:a.id,toId:b.id,edgeType:'choice'}),graph=createEntity(p.projectId,'flow_graph','既存の図',{nodeIds:[a.id,b.id],edgeIds:[edge.id],entryIds:[a.id],exitIds:[b.id]});p.entities.push(s,s2,a,b,edge,graph);
 project=(await scenarioStore.saveProject(p,{reason:'Independent browser fixture'})).project;localStorage.setItem('independent-project',project.projectId);
}
localStorage.setItem('scenario-last-project',project.projectId);
const realSave=scenarioStore.saveProject.bind(scenarioStore);let arm=false,gate:{resolve:()=>void;reject:(error:Error)=>void}|undefined;
w.controls={requests:0,pending:()=>!!gate,arm:()=>{arm=true;},release:()=>{gate?.resolve();gate=undefined;},fail:()=>{gate?.reject(new Error('INTENTIONAL_STORAGE_FAILURE'));gate=undefined;},read:()=>scenarioStore.getProject(project!.projectId),projectId:project.projectId};
scenarioStore.saveProject=async(...args:Parameters<typeof realSave>)=>{w.controls.requests++;if(arm){arm=false;await new Promise<void>((resolve,reject)=>{gate={resolve,reject};});}return realSave(...args);};
createRoot(document.getElementById('root')!).render(<App/>);
