import React from 'react';
import {createRoot} from 'react-dom/client';
import App from './src/App';
import {createProject,createEntity,newId} from './src/domain/model';
import {preparePartialCheckpoint} from './src/domain/checkpoints';
import {startTrial,stepTrial,pinTrialRecord} from './src/domain/runtime';
import {scenarioStore} from './src/storage/store';
import {exportScenario,inspectScenario} from './src/storage/archive';
import {jsonBytes,sha256} from './src/storage/json';
import './src/styles.css';
const w=window as any;
let project=localStorage.getItem('independent-project')?await scenarioStore.getProject(localStorage.getItem('independent-project')!):undefined;
if(!project){
 const p=createProject('独立 開始版移行と再確認'),scene=createEntity(p.projectId,'scene','開始本文',{body:[{id:newId(),kind:'paragraph',text:'旧世界の開始本文'}]}),other=createEntity(p.projectId,'scene','別の入口本文',{body:[{id:newId(),kind:'paragraph',text:'別入口の本文'}]}),v=createEntity(p.projectId,'variable','持ち越す金額',{key:'money',valueType:'integer',initial:{type:'integer',value:2},allowed:{min:0,max:100},scope:'across_runs'}),entry=createEntity(p.projectId,'flow_node','入口',{nodeType:'entry',sceneId:scene.id}),alternate=createEntity(p.projectId,'flow_node','別の入口',{nodeType:'entry',sceneId:other.id}),end=createEntity(p.projectId,'flow_node','終端',{nodeType:'terminal',terminalReason:'作者の終端'}),add=createEntity(p.projectId,'effect','金額+1',{operation:'add',targetId:v.id,value:{type:'integer',value:1}}),edge=createEntity(p.projectId,'flow_edge','終端へ',{fromId:entry.id,toId:end.id,label:'終端へ',effectIds:[add.id]}),edge2=createEntity(p.projectId,'flow_edge','別入口から終端へ',{fromId:alternate.id,toId:end.id,label:'別入口から終端へ',effectIds:[add.id]}),graph=createEntity(p.projectId,'flow_graph','本編',{nodeIds:[entry.id,alternate.id,end.id],edgeIds:[edge.id,edge2.id],entryIds:[entry.id,alternate.id],exitIds:[end.id]});p.entities.push(scene,other,v,entry,alternate,end,add,edge,edge2,graph);
 const partial=await preparePartialCheckpoint(p,{entryId:entry.id});partial.checkpoint.name='旧版の途中開始';partial.checkpoint.data.runtimeState.variableValues[v.id]={type:'integer',value:8};
 const ids={checkpointId:newId(),snapshotId:newId()},r=pinTrialRecord(stepTrial(p,startTrial(p,{entryId:entry.id}),{edgeId:edge.id}),ids),cp={...createEntity(p.projectId,'checkpoint','旧通し開始',r.checkpoint),id:ids.checkpointId},trace=createEntity(p.projectId,'trace','旧金額の経路',r.trace),collection=createEntity(p.projectId,'collection','回帰集合',{mode:'fixed',purpose:'regression',memberIds:[trace.id]});
 p.entities.push(partial.checkpoint,cp,trace,collection);p.snapshots.push(...partial.snapshots,{id:ids.snapshotId,content:r.content,contentHash:await sha256(jsonBytes(r.content)),createdAt:'2026-10-08T07:00:00Z',versionLabel:'旧通し版'});scene.data.body[0].text='改訂稿の開始本文';p.revision='2';
 project=(await scenarioStore.importScenario(await inspectScenario(await exportScenario(p)),{mode:'new'})).project;localStorage.setItem('independent-project',project.projectId);
}
localStorage.setItem('scenario-last-project',project.projectId);
const realSave=scenarioStore.saveProject.bind(scenarioStore);let arm=false,gate:{resolve:()=>void;reject:(e:Error)=>void}|undefined;
w.controls={requests:0,pending:()=>!!gate,arm:()=>{arm=true;},release:()=>{gate?.resolve();gate=undefined;},fail:()=>{gate?.reject(new Error('INTENTIONAL_STORAGE_FAILURE'));gate=undefined;},read:()=>scenarioStore.getProject(project!.projectId),install:async(p:any)=>{project=(await scenarioStore.importScenario(await inspectScenario(await exportScenario(p)),{mode:'new'})).project;localStorage.setItem('independent-project',project.projectId);localStorage.setItem('scenario-last-project',project.projectId);return project;}};
scenarioStore.saveProject=async(...args:Parameters<typeof realSave>)=>{w.controls.requests++;if(arm){arm=false;await new Promise<void>((resolve,reject)=>{gate={resolve,reject};});}return realSave(...args);};
createRoot(document.getElementById('root')!).render(<App/>);
