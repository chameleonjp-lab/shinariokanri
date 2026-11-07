import {expect,it} from 'vitest';
import {createEntity,createProject,emptyValidity,validateProject,textToRichText} from './model';
import {createWorldSnapshot,effectiveWorldContent} from './world';
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

async function mixedOwnerCharacterFixture(){
 let world=createProject('参照世界');const person=createEntity(world.projectId,'character','世界の人物'),group=createEntity(world.projectId,'group','固定した所属'),membership=createEntity(world.projectId,'assertion','人物の所属',{subjectId:person.id,predicate:'member_of',value:group.id,truthKind:'author_truth',validity:emptyValidity()});
 world.entities.push(person,group,membership);world=await createWorldSnapshot(world,'世界の固定版');const worldPin=world.snapshots.at(-1)!;
 let work=createProject('本文の作品');const event=createEntity(work.projectId,'event','過去',{time:{mode:'instant',at:'10',calendarId:work.calendarId}}),scene=createEntity(work.projectId,'scene','参照する場面',{eventIds:[event.id],body:textToRichText('世界の人物')});scene.data.body[0].links=[{start:0,end:5,target:{entityId:person.id,sourceVersionId:worldPin.id}}];work.entities.push(event,scene);work.worldReferences=[{projectId:world.projectId,immutableSnapshotId:worldPin.id,contentHash:worldPin.contentHash}];work=await createWorldSnapshot(work,'作品の固定版');
 const worldRegistry={[worldPin.id]:worldPin.content};
 expect(validateProject(world).ok).toBe(true);expect(validateProject(work,{worldSnapshots:worldRegistry}).ok).toBe(true);
 const formProject={...work,...effectiveWorldContent(work,[world]),snapshots:[...work.snapshots,...world.snapshots]};
 return {world,work,formProject,worldPin,workPin:work.snapshots.at(-1)!,person,group,scene};
}
for(const version of ['worldPin','workPin'] as const)it(`opens a fixed character through ${version} in the real mixed-owner editor envelope`,async()=>{
 const fixture=await mixedOwnerCharacterFixture();
 const result=await resolveCharacterReference(fixture.formProject,{entityId:fixture.person.id,sourceVersionId:fixture[version].id},fixture.scene.id);
 expect(result.person.name).toBe(fixture.person.name);
 expect(worldStateCandidates(result.project,fixture.person.id,'member_of',result.point).candidates.map(candidate=>candidate.targetId)).toEqual([fixture.group.id]);
 expect(result.project.snapshots.every(snapshot=>snapshot.content.projectId===result.project.projectId)).toBe(true);
});
it('still rejects a tampered borrowed world when the local pin is selected',async()=>{
 const fixture=await mixedOwnerCharacterFixture();fixture.worldPin.content.entities.find(entity=>entity.id===fixture.person.id)!.name='改ざんした名前';
 await expect(resolveCharacterReference(fixture.formProject,{entityId:fixture.person.id,sourceVersionId:fixture.workPin.id},fixture.scene.id)).rejects.toThrow('ハッシュ');
});

it('resolves a selected world pin through its verified transitive world closure',async()=>{
 const fixture=await mixedOwnerCharacterFixture();let shared=createProject('中継の世界');shared.worldReferences=fixture.work.worldReferences;shared=await createWorldSnapshot(shared,'中継の固定版');const sharedPin=shared.snapshots.at(-1)!;
 const work=structuredClone(fixture.work);work.worldReferences=[{projectId:shared.projectId,immutableSnapshotId:sharedPin.id,contentHash:sharedPin.contentHash}];
 const registry=Object.fromEntries([fixture.worldPin,sharedPin].map(pin=>[pin.id,pin.content]));expect(validateProject(shared,{worldSnapshots:registry}).ok).toBe(true);expect(validateProject(work,{worldSnapshots:registry}).ok).toBe(true);
 const formProject={...work,...effectiveWorldContent(work,[shared,fixture.world]),snapshots:[...work.snapshots,...shared.snapshots,...fixture.world.snapshots]};
 const result=await resolveCharacterReference(formProject,{entityId:fixture.person.id,sourceVersionId:sharedPin.id},fixture.scene.id);
 expect(result.person.id).toBe(fixture.person.id);expect(worldStateCandidates(result.project,fixture.person.id,'member_of',result.point).candidates.map(candidate=>candidate.targetId)).toEqual([fixture.group.id]);
});

for(const version of ['worldPin','workPin'] as const)it(`keeps ${version} bytes, label and writing time captured before asynchronous verification`,async()=>{
 const fixture=await mixedOwnerCharacterFixture(),expectedLabel=fixture[version].versionLabel;
 const pending=resolveCharacterReference(fixture.formProject,{entityId:fixture.person.id,sourceVersionId:fixture[version].id},fixture.scene.id);
 fixture.worldPin.content.entities.find(entity=>entity.id===fixture.person.id)!.name='検証後の未検証の人物';
 fixture.worldPin.content.entities.find(entity=>entity.id===fixture.group.id)!.name='検証後の未検証の所属';
 fixture[version].versionLabel='待機中に変更した版名';
 const event=fixture.formProject.entities.find((entity):entity is ReturnType<typeof createEntity<'event'>>=>entity.kind==='event')!;event.data.time={mode:'instant',at:'20',calendarId:fixture.formProject.calendarId};
 const result=await pending;
 expect(result.person.name).toBe('世界の人物');expect(result.project.entities.find(entity=>entity.id===fixture.group.id)!.name).toBe('固定した所属');
 expect(result.versionLabel).toBe(`固定版 ${expectedLabel}`);expect(result.point.at).toBe('10');
});
it('keeps the selected character identity when the caller changes the anchor during capture',async()=>{
 const fixture=await mixedOwnerCharacterFixture(),anchor={entityId:fixture.person.id,sourceVersionId:fixture.workPin.id};
 const pending=resolveCharacterReference(fixture.formProject,anchor,fixture.scene.id);anchor.entityId=fixture.group.id;
 expect((await pending).person.id).toBe(fixture.person.id);
});
