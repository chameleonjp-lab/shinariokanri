import React, { useState } from 'react';
import { createRoot } from 'react-dom/client';
import { ProjectInfo } from './src/ui/WorkPage';
import { Reader } from './src/ui/Reader';
import { createProject, createEntity } from './src/domain/model';
import { projectSettingsDraft, acknowledgeSettingsDraft, settingsDraftChanged } from './src/ui/projectSettingsDraft';
import { createWorldSnapshot, previewWorldVersion } from './src/domain/world';
import './src/styles.css';

const w=window as any;
function SettingsHarness() {
 const [project,setProject]=useState(()=>createProject('Original')), [draft,setDraft]=useState<any>(), [shown,setShown]=useState(true),[saving,setSaving]=useState(false);
 w.requests??=0;w.harnessProject=project;w.harnessDraft=draft;w.harnessSaving=saving;
 return <><button onClick={()=>setShown(v=>!v)}>Toggle settings</button>{shown&&<ProjectInfo project={project} initialDraft={draft} saving={saving} onDraftChange={setDraft} onSavingChange={setSaving} onDraftSaved={(submitted,saved)=>setDraft((retained:any)=>{if(!retained)return retained;const next=acknowledgeSettingsDraft(retained,submitted,saved);return settingsDraftChanged(next)?next:undefined;})} onSaveProject={async input=>{w.requests++;await new Promise<void>(resolve=>{w.resolveSave=resolve;});const saved={...input,revision:String(Number(input.revision)+1)};setProject(saved);return saved;}} onSaveEntities={async()=>{}} onOpen={()=>{}} theme="light" setTheme={()=>{}}/>}</>;
}
if(new URLSearchParams(location.search).get('mode')==='reader'){
 let world=createProject('World');const v=createEntity(world.projectId,'variable','Borrowed flag',{key:'borrowed_flag',valueType:'boolean',initial:{type:'boolean',value:true},allowed:{values:[false,true]}});world.entities.push(v);world=await createWorldSnapshot(world,'Pinned');
 const work=createProject('Work'),s=createEntity(work.projectId,'scene','Scene'),s2=createEntity(work.projectId,'scene','Last'),a=createEntity(work.projectId,'flow_node','Entry',{nodeType:'entry',sceneId:s.id,executionPolicy:'first_match',gate:{op:'compare',variableId:v.id,comparator:'eq',value:{type:'boolean',value:true}}}),b=createEntity(work.projectId,'flow_node','End',{nodeType:'terminal',sceneId:s2.id,terminalReason:'end'}),edge=createEntity(work.projectId,'flow_edge','Go',{fromId:a.id,toId:b.id,edgeType:'automatic',priority:0});work.entities.push(s,s2,a,b,edge);
 const candidate=(await previewWorldVersion(work,world,world.snapshots[0].id,[v.id])).candidate;
 createRoot(document.getElementById('root')!).render(<Reader project={candidate} worldSnapshots={{[world.snapshots[0].id]:world.snapshots[0].content}} onOpen={()=>{}} onOpenTarget={()=>{}} onSaveMany={async()=>{}}/>);
}else createRoot(document.getElementById('root')!).render(<SettingsHarness/>);
