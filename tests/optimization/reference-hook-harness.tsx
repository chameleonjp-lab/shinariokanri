import React,{useState} from 'react';
import {createRoot} from 'react-dom/client';
import {ScenarioStore} from '../../src/storage/store';
import {createProject,createEntity,ENTITY_SCHEMAS} from '../../src/domain/model';
import {useReferenceRows} from '../../src/ui/useReferenceRows';

const schema=ENTITY_SCHEMAS.character;if(schema.type!=='object')throw Error('character schema');
const field=schema.fields.reading!,original=field.schema;
const input=createProject('additional component proof'),target=createEntity(input.projectId,'character','対象'),referrer=createEntity(input.projectId,'character','schemaで参照になる行',{reading:target.id});
input.entities.push(target,referrer,...Array.from({length:2500},(_,n)=>createEntity(input.projectId,'note',`追加行${n}`)));
const store=new ScenarioStore({databaseName:`reference-hook-${crypto.randomUUID()}`});
const project=(await store.saveProject(input,{reason:'synthetic component proof',includeHistory:false,immutableView:true})).project;
function Example(){
  const [tick,setTick]=useState(0),references=useReferenceRows(project.entities,target.id,project.revision,project);
  return <main data-render={tick}><p data-phase>{references.phase}</p><p data-count>{references.rows.length}</p><p data-names>{references.rows.map(row=>row.name).join(',')}</p>
    <button onClick={()=>{field.schema={type:'ref',scope:'entity',kinds:['character']};setTick(n=>n+1);}}>意味を変更</button>
    <button onClick={()=>{store.setAuthorAccess({});field.schema=original;setTick(n=>n+1);}}>権限を失効し意味を戻す</button>
  </main>;
}
createRoot(document.getElementById('root')!).render(<Example/>);
