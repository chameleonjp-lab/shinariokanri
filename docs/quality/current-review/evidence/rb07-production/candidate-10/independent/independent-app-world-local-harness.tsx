import React from 'react';
import {createRoot} from 'react-dom/client';
import App from './src/App';
import {scenarioStore} from './src/storage/store';
import './src/styles.css';
const w=window as any;
const fixture=await(await fetch('./independent/fixtures/world-local-rule-production.json')).json(),source=await(await fetch('./independent/fixtures/world-production.json')).json();
if(!(await scenarioStore.listProjects()).length){
 await scenarioStore.saveProject(source.worldB,{reason:'世界原稿保存'});
 await scenarioStore.saveProject(source.worldA,{reason:'別作品の旧Bを固定登録',worldPin:{world:source.worldB,snapshotId:fixture.ids.old}});
 await scenarioStore.saveProject(fixture.project,{reason:'新世界を採用し旧台詞だけ引用',worldPin:{world:source.worldB,snapshotId:fixture.ids.newest}});
 localStorage.setItem('scenario-last-project',fixture.project.projectId);
}
w.controls={fixture,read:()=>scenarioStore.getProject(fixture.project.projectId),worlds:()=>scenarioStore.listWorldSnapshots()};
createRoot(document.getElementById('root')!).render(<App/>);
