import React from 'react';
import {createRoot,type Root} from 'react-dom/client';
import App from '../../src/App';
import {ScenarioStoreProvider} from '../../src/ui/StoreContext';
import {ScenarioStore} from '../../src/storage/store';
import {runWorldOwnershipMeasurement,storeRetention} from './world-ownership-measurement-core';
import {worldOwnershipFixtures} from './world-ownership-measurement-fixtures';
import {startProbe} from '../../src/observability/probe';
import '../../src/styles.css';

let root:Root|undefined,store:ScenarioStore|undefined,probe:ReturnType<typeof startProbe>|undefined,instrumentationStarts=0;
let gate:{entered:boolean;release:()=>void}|undefined;
const ui={
 async setup(runId:string){
  const fixture=await worldOwnershipFixtures();store=new ScenarioStore({databaseName:`p205-ui-${runId}`});
  for(const world of fixture.worlds)await store.saveProject(world,{reason:'UI editable source',includeHistory:false});
  const world=fixture.worlds[0],selected=(await store.saveProject(fixture.works[0],{reason:'UI adopted world',includeHistory:false,worldPin:{world,snapshotId:world.snapshots[0].id}})).project;
  localStorage.setItem('scenario-last-project:guest',selected.projectId);localStorage.removeItem('scenario-opening-project:guest');
  root=createRoot(document.getElementById('root')!);root.render(<ScenarioStoreProvider store={store}><App/></ScenarioStoreProvider>);
  return{selected:selected.projectId,worlds:fixture.worlds.map(value=>({projectId:value.projectId,name:value.name,snapshotId:value.snapshots[0].id})),adoptedLabel:'P205 newer retains old'};
 },
 holdSource(projectId:string){
  if(!store)throw Error('UI not mounted');const original=store.loadEditor.bind(store);let held=false,release!:()=>void;const pending=new Promise<void>(resolve=>release=resolve);gate={entered:false,release};
  store.loadEditor=async(...args)=>{const value=await original(...args);if(args[0]===projectId&&!held){held=true;gate!.entered=true;await pending;}return value;};
 },
 gateEntered:()=>gate?.entered??false,
 releaseGate(){gate?.release();},
 failNextPreviewHash(projectId:string){
  const original=crypto.subtle.digest.bind(crypto.subtle);
  crypto.subtle.digest=async(...args)=>{
   let matches=false;try{const decoded=JSON.parse(new TextDecoder().decode(args[1] as ArrayBuffer));matches=decoded.projectId===projectId&&Array.isArray(decoded.entities);}catch{/* Other native digest inputs stay unchanged. */}
   if(matches){crypto.subtle.digest=original;throw Error('P205 literal rejected preview hash');}return original(...args);
  };
 },
 startObservation(){if(probe)throw Error('UI probe already active');instrumentationStarts++;probe=startProbe();},
 async snapshot(){await probe?.settle();return{store:store?storeRetention(store):null,instrumentationStarts,...(probe?{probe:probe.snapshot()}:{}),uiRegistry:probe?'actual numeric gauges when supported by this exact product':'UNKNOWN: check mode has no probes; functional UI proof only'};},
 release(){root?.unmount();root=undefined;if(store){const cached=store as unknown as {cachedProjects:Map<string,unknown>};for(const id of cached.cachedProjects.keys())store.releaseEditor(id);}},
 close(){store?.close();},
 async cleanup(){root?.unmount();root=undefined;probe?.stop();probe=undefined;await store?.deleteDatabase();store=undefined;gate=undefined;},
};
declare global{interface Window{worldOwnershipMeasurement:{run:typeof runWorldOwnershipMeasurement};worldOwnershipUI:typeof ui;worldOwnershipCheckpoint?:(value:unknown)=>Promise<void>}}
window.worldOwnershipMeasurement={run:options=>runWorldOwnershipMeasurement(options,value=>window.worldOwnershipCheckpoint?.(value)??Promise.resolve())};
window.worldOwnershipUI=ui;
