import {createElement} from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {expect,it} from 'vitest';
import {createEntity,createProject,emptyValidity} from '../domain/model';
import {WorldCharacterSummary} from './WorldHistories';
it('shares historical aliases and voice rules with the character sheet and omits later values',()=>{
 const project=createProject(),past={...emptyValidity(),worldRange:{start:'0',end:'20'}},future={...emptyValidity(),worldRange:{start:'20',end:null}},person=createEntity(project.projectId,'character','アオ',{aliases:[{id:'past',text:'昔の呼称',reading:'',validity:past,audienceHolderIds:[],isPublicDefault:false},{id:'future',text:'今の呼称',reading:'',validity:future,audienceHolderIds:[],isPublicDefault:false}]}),voice=createEntity(project.projectId,'voice_rule','昔の話し方',{characterId:person.id,validity:past,firstPerson:'わたし'}),later=createEntity(project.projectId,'voice_rule','今の話し方',{characterId:person.id,validity:future,firstPerson:'おれ'});project.entities=[person,voice,later];
 const html=renderToStaticMarkup(createElement(WorldCharacterSummary,{project,person,point:{at:'10'}}));
 expect(html).toContain('昔の呼称');expect(html).toContain('わたし');expect(html).not.toContain('今の呼称');expect(html).not.toContain('おれ');
 const unknown=renderToStaticMarkup(createElement(WorldCharacterSummary,{project,person,point:{at:null}}));expect(unknown).toContain('場面の時点が未確定');expect(unknown).not.toContain('おれ');expect(unknown).not.toContain('今の呼称');
});
