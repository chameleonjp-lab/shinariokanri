import React from 'react';
import {createRoot} from 'react-dom/client';
import App from './src/App';
import {scenarioStore} from './src/storage/store';
import './src/styles.css';
const w=window as any,fixture=await(await fetch('./independent/fixtures/world-route-production.json')).json();
if(!(await scenarioStore.listProjects()).length){await scenarioStore.saveProject(fixture.world,{reason:'条件付き固定世界'});await scenarioStore.saveProject(fixture.project,{reason:'同じ固定世界の内部経路',worldPin:{world:fixture.world,snapshotId:fixture.ids.pin}});localStorage.setItem('scenario-last-project',fixture.project.projectId);}
w.controls={fixture,read:()=>scenarioStore.getProject(fixture.project.projectId),worlds:()=>scenarioStore.listWorldSnapshots()};createRoot(document.getElementById('root')!).render(<App/>);
