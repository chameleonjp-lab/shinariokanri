import { describe, expect, it } from 'vitest';
import { createEntity, createProject, textToRichText, validateProject } from '../src/domain/model';
import { parseTwee, importTweeAlternative } from '../src/domain/flowStructure';
import { exportTweeAlternative, exportProject } from '../src/domain/exports';
import { headAlternativeContent, rollbackAlternativeHead } from '../src/domain/writingWorkspace';
import { sealAuthorAlternative, validateAuthorAlternatives } from '../src/domain/authorAlternativeIntegrity';
import { ARCHIVE_LIMITS } from '../src/storage/json';

export const source = ':: 開始\n門😀\n[[左へ->左]]\n[[右へ->右]]\n<<set $secret = 1>>\n\n:: 左\n左の本文\n\n:: 右\n右の本文';
describe('limited author Twee interchange', () => {
 it('preflights three passages, ordered choices and unsupported original with locations', () => {
  const parsed = parseTwee(source);
  expect(parsed.passages.map(p => p.name)).toEqual(['開始','左','右']);
  expect(parsed.passages[0]).toMatchObject({body:'門😀',links:[{label:'左へ',target:'左'},{label:'右へ',target:'右'}]});
  expect(parsed.issues).toEqual([expect.objectContaining({line:5,original:'<<set $secret = 1>>',blocking:false})]);
  expect(parsed.original).toBe(source);
 });
 it('never guesses duplicate or missing targets and preserves malformed syntax', () => {
  for (const raw of [':: A\n[[B]]\n:: B\nb\n:: B\nc',':: A\n[[missing]]']) {
   const parsed=parseTwee(raw); expect(parsed.issues.some(i=>i.blocking)).toBe(true);
   expect(()=>importTweeAlternative(createProject(),parsed,'import')).toThrow(); expect(parsed.original).toBe(raw);
  }
  const parsed=parseTwee(':: A\n<script>globalThis.bad=1</script>\n(set: $x to 2)\n[[bad][code]]');
  expect(parsed.issues).toHaveLength(3); expect(parsed.passages[0].body).toBe('');
  expect((globalThis as Record<string,unknown>).bad).toBeUndefined();
 });
 it.each([
  '[[go->B->C]]', '[[B<-go<-C]]', '[[go|B|C]]',
  '[[go->B<-C]]', '[[go->B|C]]', '[[B<-go->C]]',
  '[[B<-go|C]]', '[[go|B->C]]', '[[B|C<-go]]',
 ])('blocks multi-separator link %s without guessing a destination', link => {
  const raw=`:: A\n${link}\n:: B\nB text\n:: C\nC text`, parsed=parseTwee(raw);
  expect(parsed.issues).toEqual([expect.objectContaining({line:2,original:link,blocking:true})]);
  expect(parsed.passages.map(({name,body,links})=>({name,body,links}))).toEqual([
   {name:'A',body:'',links:[]}, {name:'B',body:'B text',links:[]}, {name:'C',body:'C text',links:[]},
  ]);
  expect(parsed.original).toBe(raw);
  const project=createProject(), before=JSON.stringify(project);
  expect(()=>importTweeAlternative(project,parsed,'import')).toThrow();
  expect(JSON.stringify(project)).toBe(before);
 });
 it.each([
  ['[[ B ]]','B'], ['[[ go -> B ]]','go'], ['[[ B <- go ]]','go'], ['[[ go | B ]]','go'],
 ])('roundtrips supported simple link %s and preserves its original', (link,label) => {
  const raw=`:: A\n${link}\n:: B\nB text`, parsed=parseTwee(raw);
  expect(parsed.issues).toEqual([]);
  expect(parsed.passages[0].links).toEqual([{label,target:'B',line:2}]);
  const result=exportTweeAlternative(headAlternativeContent(importTweeAlternative(createProject(),parsed,'import')));
  expect(result.originals.some(artifact=>artifact.content===raw)).toBe(true);
  const reparsed=parseTwee(result.artifact!.content);
  expect(reparsed.issues).toEqual([]);
  expect(reparsed.passages.map(({name,body,links})=>({name,body,links:links.map(({label,target})=>({label,target}))}))).toEqual([
   {name:'A',body:'',links:[{label,target:'B'}]}, {name:'B',body:'B text',links:[]},
  ]);
 });
 it('bounds raw input, rejects blank and refuses forged preview state',()=>{
  expect(()=>parseTwee(' ')).toThrow(); expect(()=>parseTwee('x'.repeat(ARCHIVE_LIMITS.fieldBytes+1))).toThrow();
  const parsed=parseTwee(source); parsed.passages[0].name='forged';
  expect(()=>importTweeAlternative(createProject(),parsed,'import')).toThrow();
 });
 it('forks without changing canonical, seals, validates and reverses import as a whole version', async () => {
  const project=createProject('canonical'), before=JSON.stringify(project);
  const alternative=await sealAuthorAlternative(importTweeAlternative(project,parseTwee(source),'Twee案'));
  expect(JSON.stringify(project)).toBe(before); expect(alternative.versions).toHaveLength(2);
  const content=headAlternativeContent(alternative);
  expect(validateProject({...content,history:[],snapshots:[]}).ok).toBe(true);
  expect(await validateAuthorAlternatives(project.projectId,[alternative],{validateContent:content=>validateProject({...content,history:[],snapshots:[]})})).toEqual([]);
  expect(content.entities.filter(e=>e.kind==='scene')).toHaveLength(3);
  expect(content.entities.filter(e=>e.kind==='flow_edge').map(e=>e.kind==='flow_edge'&&e.data.label)).toEqual(['左へ','右へ']);
  expect(headAlternativeContent(rollbackAlternativeHead(alternative,alternative.versions[0].id))).toEqual(alternative.baseContent);
 });
 it('exports stable supported prose/targets/order with omission preflight and separate original recovery',()=>{
  const alternative=importTweeAlternative(createProject(),parseTwee(source),'Twee案');
  const result=exportTweeAlternative(headAlternativeContent(alternative));
  expect(result.omissions.some(o=>o.includes('未対応'))).toBe(true);
  expect(result.originals[0].content).toBe(source); expect(result.artifact?.content).not.toContain('secret');
  expect(parseTwee(result.artifact!.content).passages.map(({name,body,links})=>({name,body,links:links.map(({label,target})=>({label,target}))}))).toEqual(parseTwee(source).passages.map(({name,body,links})=>({name,body,links:links.map(({label,target})=>({label,target}))})));
  const content=headAlternativeContent(alternative); content.entities.push(createEntity(content.projectId,'dialogue_line','字幕',{scriptKind:'subtitle',scriptNumber:9}));
  expect(exportTweeAlternative(content).omissions.some(o=>o.includes('scriptKind')&&o.includes('scriptNumber'))).toBe(true);
 });
 it('keeps source private even when a recovery note is explicitly included in reader projection',async()=>{
  const p=createProject(), alternative=importTweeAlternative(p,parseTwee(source),'Twee案');
  p.entities=headAlternativeContent(alternative).entities;
  const note=p.entities.find(e=>e.kind==='note')!; note.status='confirmed';
  const profile=createEntity(p.projectId,'projection_profile','reader',{audience:'reader',includedIds:[note.id],allowedKinds:['note'],namePolicy:{defaultPolicy:{mode:'replace',replacement:'note'}},publicTitle:'title',publicVersionLabel:'v1'});
  profile.status='confirmed';p.entities.push(profile); const result=await exportProject(p,{profile:'reader',projectionProfileId:profile.id,targetRevision:p.revision});
  expect(result.ok,result.ok?'':JSON.stringify(result.issues)).toBe(true); if(result.ok) {expect(result.artifact.content).not.toContain('secret');expect(result.artifact.content).not.toContain('tweeOriginal');}
 });
});

it('exports presentation order and never converts literal body markup into executable Twee syntax',()=>{
 const p=createProject(),chapter=createEntity(p.projectId,'chapter','C');
 const a=createEntity(p.projectId,'scene','A',{chapterId:chapter.id,body:textToRichText('plain\n<<run dangerous>>\n[[accidental]]\n:: header')}),b=createEntity(p.projectId,'scene','B',{chapterId:chapter.id,body:textToRichText('B body')});
 chapter.data.sceneIds=[b.id,a.id];p.entities=[chapter,a,b];
 const result=exportTweeAlternative(p);
 expect(parseTwee(result.artifact!.content).passages.map(p=>p.name)).toEqual(['B','A']);
 expect(result.artifact!.content).not.toContain('<<run');expect(result.artifact!.content).not.toContain('[[accidental]]');expect(result.artifact!.content).not.toContain(':: header');
 expect(result.omissions.length).toBeGreaterThan(0);expect(result.originals.some(a=>a.content.includes('dangerous'))).toBe(true);
});

it('keeps uppercase HTML and variable interpolation in recovery rather than supported plain passages',()=>{
 const raw=':: A\n<SCRIPT>globalThis.bad=1</SCRIPT>\n$secret\nplain';const parsed=parseTwee(raw);expect(parsed.issues).toHaveLength(2);expect(parsed.passages[0].body).toBe('plain');
 const p=createProject(),scene=createEntity(p.projectId,'scene','A',{body:textToRichText('<IMG SRC=x onerror=alert(1)>\n$secret\nplain')});p.entities=[scene];const result=exportTweeAlternative(p);expect(result.artifact?.content).not.toContain('<IMG');expect(result.artifact?.content).not.toContain('$secret');expect(result.originals.some(artifact=>artifact.content.includes('onerror'))).toBe(true);
});
