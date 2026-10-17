import {expect,it} from 'vitest';
import {createProject} from '../../src/domain/model';
import {forkAuthorAlternative} from '../../src/domain/writingWorkspace';
import {sealAuthorAlternative} from '../../src/domain/authorAlternativeIntegrity';
import {hasUnsavedAlternativeWorkspaceDraft,type AuthorAlternativeWorkspaceDraft} from '../../src/ui/AuthorAlternativeStudio';
import {alternativeDraftStatus} from '../../src/ui/alternativeDraftStatus';
it('matches the independent full-content dirty oracle for every retained draft field',async()=>{
 const branch=await sealAuthorAlternative(forkAuthorAlternative(createProject('Draft owner'),'Branch')),head=branch.versions.find(v=>v.id===branch.headVersionId)!;
 const draft:AuthorAlternativeWorkspaceDraft={selectedAlternativeId:branch.id,newBranchName:'',sourceSnapshotId:'',branches:{[branch.id]:{headVersionId:branch.headVersionId,content:structuredClone(head.content),structurePlan:head.structurePlan,branchName:branch.name,selectedEntityId:'',newSceneChapterId:'',versionLabel:'UI preference'}}};
 const heads=[{id:branch.id,name:branch.name,headVersionId:branch.headVersionId,contentHash:head.contentHash!}];
 const cases:Array<(d:AuthorAlternativeWorkspaceDraft)=>void>=[()=>{},d=>{d.newBranchName='new';},d=>{d.branches[branch.id].branchName='rename';},d=>{d.branches[branch.id].headVersionId=crypto.randomUUID();},d=>{d.branches[branch.id].content!.name='changed';},d=>{d.branches[branch.id].structurePlan={templateId:'changed',chapterId:'chapter',beatLabels:[],assignments:{}};},d=>{d.branches[branch.id].newEntityName='new entity';},d=>{d.branches[branch.id].invalidFieldKeys=['invalid'];},d=>{d.branches[branch.id].jsonBuffers={entity:{field:'{'}};},d=>{d.branches[branch.id].versionLabel='another preference';},d=>{d.branches[branch.id].selectedEntityId=crypto.randomUUID();},d=>{delete d.branches[branch.id].content;}];
 for(const mutate of cases){const value=structuredClone(draft);mutate(value);expect(await alternativeDraftStatus(value,heads)).toBe(hasUnsavedAlternativeWorkspaceDraft(value,[branch])?'dirty':'clean');}
 expect(await alternativeDraftStatus(draft,[])).toBe('dirty');expect(await alternativeDraftStatus(draft,undefined)).toBe('unknown');expect(await alternativeDraftStatus(draft,[{...heads[0],contentHash:''}])).toBe('unknown');
});
