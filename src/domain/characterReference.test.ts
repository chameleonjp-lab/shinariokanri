import {expect,it} from 'vitest';
import {createEntity,createProject,emptyValidity} from './model';
import {createWorldSnapshot} from './world';
import {resolveCharacterReference} from './characterReference';
import {worldStateCandidates} from './world';

it('reads the exact pinned character version at the writing scene time instead of current affiliation',async()=>{
 const project=createProject('回想'),person=createEntity(project.projectId,'character','アオ'),oldGroup=createEntity(project.projectId,'group','昔の組織'),newGroup=createEntity(project.projectId,'group','今の組織'),event=createEntity(project.projectId,'event','昔',{time:{mode:'instant',at:'10',calendarId:project.calendarId}}),scene=createEntity(project.projectId,'scene','回想',{eventIds:[event.id]});
 const old=createEntity(project.projectId,'assertion','昔の所属',{subjectId:person.id,predicate:'member_of',value:oldGroup.id,truthKind:'author_truth',validity:{...emptyValidity(),worldRange:{start:'0',end:'20'}}}),now=createEntity(project.projectId,'assertion','今の所属',{subjectId:person.id,predicate:'member_of',value:newGroup.id,truthKind:'author_truth',validity:{...emptyValidity(),worldRange:{start:'20',end:null}}});
 project.entities.push(person,oldGroup,newGroup,event,scene,old,now);
 const pinned=await createWorldSnapshot(project,'参照する稿');const pin=pinned.snapshots.at(-1)!;
 (pinned.entities.find(entity=>entity.id===person.id) as typeof person).name='現在の別名';
 const result=await resolveCharacterReference(pinned,{entityId:person.id,sourceVersionId:pin.id},scene.id);
 expect(result.person.name).toBe('アオ');expect(result.point.at).toBe('10');
 expect(worldStateCandidates(result.project,person.id,'member_of',result.point).candidates.map(candidate=>candidate.targetId)).toEqual([oldGroup.id]);
 expect(result.versionLabel).toContain('参照する稿');
});
it('refuses a missing pin and keeps ambiguous scene times unknown',async()=>{
 const project=createProject(),person=createEntity(project.projectId,'character','アオ'),scene=createEntity(project.projectId,'scene','時点不明');project.entities.push(person,scene);
 await expect(resolveCharacterReference(project,{entityId:person.id,sourceVersionId:'gone'},scene.id)).rejects.toThrow('固定版');
 expect((await resolveCharacterReference(project,{entityId:person.id},scene.id)).point.at).toBeNull();
});

it('does not invent a time for a dialogue reused in a scene with unknown time',async()=>{
 const project=createProject(),person=createEntity(project.projectId,'character','アオ'),line=createEntity(project.projectId,'dialogue_line','共通台詞'),event=createEntity(project.projectId,'event','日時',{time:{mode:'instant',at:'10',calendarId:project.calendarId}}),known=createEntity(project.projectId,'scene','日時あり',{dialogueLineIds:[line.id],eventIds:[event.id]}),unknown=createEntity(project.projectId,'scene','日時不明',{dialogueLineIds:[line.id]});project.entities=[person,line,event,known,unknown];
 expect((await resolveCharacterReference(project,{entityId:person.id},line.id)).point.at).toBeNull();
});
