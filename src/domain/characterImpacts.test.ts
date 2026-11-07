import {expect,it} from 'vitest';
import {createEntity,createProject,textToRichText} from './model';
import {findCharacterMentionCandidates} from './linkCandidates';
import {characterImpactReviews} from './changeReviews';
it('keeps word-only matches separate and does not suggest a name already linked to another person',()=>{
 const project=createProject(),person=createEntity(project.projectId,'character','アオ'),other=createEntity(project.projectId,'character','アオ'),candidate=createEntity(project.projectId,'scene','語句だけ',{body:textToRichText('前文。アオ。後文。')}),confirmed=createEntity(project.projectId,'scene','別人の確定リンク',{body:[{id:'block',kind:'paragraph',text:'アオ',links:[{start:0,end:2,target:{entityId:other.id}}]}]});project.entities=[person,other,candidate,confirmed];
 expect(findCharacterMentionCandidates(project,person.id).map(hit=>hit.sourceEntityId)).toEqual([candidate.id]);
 expect(findCharacterMentionCandidates(project,person.id)[0].context).toBe('前文。アオ。後文。');
});
it('puts directly linked scenes first and keeps confirmed review status visible',()=>{
 const project=createProject(),person=createEntity(project.projectId,'character','アオ'),scene=createEntity(project.projectId,'scene','登場'),note=createEntity(project.projectId,'note','関連');
 const reviews=[note,scene].map(target=>{const review=createEntity(project.projectId,'review',target.name,{target:target.id,stage:'verified'});review.customValues={'changeReview.generatedBy':'semantic-change-review/v1','changeReview.subjectIds':JSON.stringify([person.id]),'changeReview.paths':JSON.stringify({[person.id]:{directPaths:target.kind==='scene'?['data.povId']:[],relationLabels:['信頼']}})};return review;});project.entities=[person,scene,note,...reviews];
 expect(characterImpactReviews(project,person.id).map(review=>review.data.target)).toEqual([scene.id,note.id]);
 expect(characterImpactReviews(project,person.id)[0].data.stage).toBe('verified');
});
