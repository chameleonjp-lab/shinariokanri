// @vitest-environment jsdom
// Review-only reproductions: assertions record the observed gaps, not product acceptance.
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { webcrypto } from 'node:crypto';
import { mkdirSync, writeFileSync } from 'node:fs';
import { createElement, act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { createEntity, createProject, emptyRuntimeState, emptyValidity, newId, validateProject } from '../src/domain/model';
import type { Entity, ProjectData } from '../src/domain/types';
import { startTrial, stepTrial, restartTrial } from '../src/domain/runtime';
import { applyEffectsAtomic, initializeRuntimeState } from '../src/domain/conditions';
import { createWorldSnapshot, previewWorldVersion, worldStateCandidates } from '../src/domain/world';
import { buildRelationGraph } from '../src/domain/relationGraph';
import { presentContent } from '../src/domain/presentation';
import { Reader } from '../src/ui/Reader';
import { ProjectInfo, HistoryPanel, ExportPanel } from '../src/ui/WorkPage';
import { WorldCalendars } from '../src/ui/WorldCalendars';
import { scenarioStore } from '../src/storage';

const observed: object[] = [];
const record = (id: string, actual: unknown, expected: string) => observed.push({ id, actual, expected });
function add<K extends Entity['kind']>(p: ProjectData, kind: K, name: string, data: Partial<Entity<K>['data']> = {}): Entity<K> {
  const e = createEntity(p.projectId, kind, name, data) as Entity<K>; p.entities.push(e); return e;
}
function fixture() {
  const p = createProject('追加レビュー');
  const s1=add(p,'scene','始まり'), s2=add(p,'scene','終わり');
  const a=add(p,'flow_node','入口',{nodeType:'entry',sceneId:s1.id,executionPolicy:'first_match'});
  const b=add(p,'flow_node','出口',{nodeType:'terminal',sceneId:s2.id,terminalReason:'終わる'});
  const e=add(p,'flow_edge','次へ',{fromId:a.id,toId:b.id,edgeType:'automatic',priority:0});
  return {p,a,b,e,s1,s2};
}
let roots: Root[]=[];
beforeAll(() => {
  Object.defineProperty(globalThis,'crypto',{value:webcrypto,configurable:true});
  (globalThis as any).IS_REACT_ACT_ENVIRONMENT=true;
  HTMLDialogElement.prototype.showModal=function(){this.setAttribute('open','');};
  HTMLDialogElement.prototype.close=function(){this.removeAttribute('open');};
});
afterEach(async () => { for(const root of roots) await act(async()=>root.unmount()); roots=[]; document.body.innerHTML=''; vi.restoreAllMocks(); });
afterAll(() => {
  const path='/workspace/scratch/1df20553ac89/review-evidence';mkdirSync(path,{recursive:true});
  writeFileSync(path+'/observations.json',JSON.stringify({commit:'0474856124129a6237f4f37bc4b79e0ca985b335',method:'Node + jsdom component/domain reproductions; no real browser',observed},null,2));
});
async function mount(type:any,props:object) {
  const div=document.createElement('div');document.body.append(div);const root=createRoot(div);roots.push(root);
  await act(async()=>root.render(createElement(type,props)));return {root,div};
}
function button(text:string){return Array.from(document.querySelectorAll('button')).find(b=>b.textContent?.trim()===text)!;}
async function click(el:Element){expect(el).toBeTruthy();await act(async()=>{el.dispatchEvent(new MouseEvent('click',{bubbles:true}));});}
async function input(el:HTMLInputElement|HTMLSelectElement,value:string){
  await act(async()=>{const proto=el instanceof HTMLSelectElement?HTMLSelectElement.prototype:HTMLInputElement.prototype;Object.getOwnPropertyDescriptor(proto,'value')!.set!.call(el,value);el.dispatchEvent(new Event(el instanceof HTMLSelectElement?'change':'input',{bubbles:true}));});
}

describe('latest implementation review observations',()=>{
  it('records scene_end reset rule not being applied',()=>{
    const {p,a}=fixture();const v=add(p,'variable','一場面の状態',{key:'scene_value',scope:'scene',valueType:'integer',initial:{type:'integer',value:0},allowed:{min:0,max:10},resetRules:[{on:'scene_end',value:{type:'integer',value:0}}]});
    expect(validateProject(p).ok).toBe(true);
    const state=initializeRuntimeState(p);state.variableValues[v.id]={type:'integer',value:5};
    const trial=startTrial(p,{entryId:a.id,state});const next=stepTrial(p,trial);
    expect(next.status).toBe('terminal');expect(next.state.variableValues[v.id]).toEqual({type:'integer',value:5});
    record('R01',next.state.variableValues[v.id],'scene_endで宣言した値0になる');
  });
  it('records new_loop rule not overriding carried across_runs value',()=>{
    const {p}=fixture();const v=add(p,'variable','持越し',{key:'carried',scope:'across_runs',valueType:'integer',initial:{type:'integer',value:0},allowed:{min:0,max:10},resetRules:[{on:'new_loop',value:{type:'integer',value:2}}]});
    const trial=startTrial(p);trial.state.variableValues[v.id]={type:'integer',value:7};
    const next=restartTrial(p,trial,'next_run');expect(next.state.variableValues[v.id]).toEqual({type:'integer',value:7});
    record('R01-loop',next.state.variableValues[v.id],'明示したnew_loop規則の値2になる');
  });
  it('records free-text reason bypassing a disallowed state transition',()=>{
    const {p}=fixture();const v=add(p,'variable','受注',{key:'quest_status',valueType:'integer',initial:{type:'integer',value:0},allowed:{min:0,max:3},transitionRules:[{from:{type:'integer',value:0},to:{type:'integer',value:1}}]});
    const effect=add(p,'effect','禁止遷移',{operation:'set',targetId:v.id,value:{type:'integer',value:3},reason:'備考だけ'});
    const state=initializeRuntimeState(p),result=applyEffectsAtomic(state,[effect],{state,variables:[v],entities:p.entities});
    expect(result.ok).toBe(true);record('R02',result.ok?'3へ更新した':'拒否した','経路・期限・理由を持つ明示例外がない禁止遷移は一括拒否する');
  });
  it('records rejected author truth treated as a current known fact',()=>{
    const p=createProject();const person=add(p,'character','人物'),place=add(p,'place','旧案の場所');
    const rejected=add(p,'assertion','没の現在地',{subjectId:person.id,predicate:'location',value:place.id,truthKind:'author_truth',validity:emptyValidity(),sourceIds:[]});rejected.status='rejected';
    const result=worldStateCandidates(p,person.id,'location',{at:'0'});expect(result.status).toBe('known');expect(result.definite[0].assertion.id).toBe(rejected.id);
    record('R03',{status:result.status,rejectedIncluded:true},'不採用情報を有効な真実へ混ぜず採用状態を表示する');
  });
  it('records rejected relation remaining active in graph',()=>{
    const p=createProject();const a=add(p,'character','A'),b=add(p,'character','B');
    const id=newId();p.relations.push({id,projectId:p.projectId,revision:'0',fromId:a.id,toId:b.id,relationType:'trust',direction:'forward',validity:emptyValidity(),evidenceIds:[],status:'rejected',visibility:'private'});
    const result=buildRelationGraph(p,{at:'0'});expect(result.lines.some(line=>line.id===id)).toBe(true);
    record('R03-graph',{rejectedIncluded:true,assessment:result.lines.find(line=>line.id===id)?.assessment.value},'不採用の線は現在の有効な関係と区別する');
  });
  it('records borrowed world variable missing from flow trial context',async()=>{
    let world=createProject('共有世界');const v=add(world,'variable','共有フラグ',{key:'world_flag',valueType:'boolean',initial:{type:'boolean',value:true},allowed:{values:[false,true]}});
    world=await createWorldSnapshot(world,'世界固定版');const {p,a}=fixture();const work=(await previewWorldVersion(p,world,world.snapshots[0].id,[v.id])).candidate;
    const node=work.entities.find(e=>e.id===a.id) as Entity<'flow_node'>;node.data.gate={op:'compare',variableId:v.id,comparator:'eq',value:{type:'boolean',value:true}};
    expect(validateProject(work,{worldSnapshots:{[world.snapshots[0].id]:world.snapshots[0].content}}).ok).toBe(true);
    const trial=startTrial(work);expect(trial.status).toBe('unknown');record('R04',{status:trial.status,issues:trial.issues},'固定世界を解決した同じ状態辞書で試読条件が成立する');
  });
  it('records fixed edition trial disabled when current nodes were archived',async()=>{
    const f=fixture();let p=await createWorldSnapshot(f.p,'旧版');const old=p.snapshots[0].id;
    p={...p,entities:p.entities.map(e=>e.kind==='flow_node'||e.kind==='flow_edge'?{...e,deletedAt:new Date().toISOString(),deletionOperationId:newId()}:e)};
    expect(startTrial(p,{contentVersionId:old}).status).toBe('ready');
    await mount(Reader,{project:p,onOpen:vi.fn(),onSaveMany:vi.fn()});
    await input(document.querySelector('select[aria-label="試読する作品版"]')!,old);
    expect(button('試読を始める').disabled).toBe(true);record('R05',{selectedVersion:'old',startDisabled:true},'旧版に入口があれば旧版の試読を開始できる');
  });
  it('records fixed text links dropping source edition and text location in flow reader',async()=>{
    const f=fixture();const target=add(f.p,'character','固定版の人物',{body:[{id:newId(),kind:'paragraph',text:'固定版の本文'}]});let p=await createWorldSnapshot(f.p,'参照版');const old=p.snapshots[0].id;
    const anchor={entityId:target.id,sourceVersionId:old,blockId:target.data.body![0].id,start:1,end:2};
    p={
      ...p,
      entities:p.entities.map(e=>e.id===f.s1.id
        ? {...f.s1,data:{...f.s1.data,body:[{id:newId(),kind:'paragraph',text:'人物リンク',links:[{start:0,end:5,target:anchor}]}]}}
        : e),
    };
    expect(validateProject(p).ok).toBe(true);
    const opened=vi.fn();await mount(Reader,{project:p,onOpen:opened,onSaveMany:vi.fn()});await click(button('試読を始める'));await click(button('人物リンク'));
    expect(opened).toHaveBeenCalledWith(target.id);expect(opened.mock.calls[0]).toHaveLength(1);
    record('R06',{passedArguments:opened.mock.calls[0],lostFields:['sourceVersionId','blockId','start','end']},'固定版と本文位置を含む参照を渡して開く');
  });
  it('records work settings draft disappearing on navigation remount',async()=>{
    const p=createProject('保存済み名');const props={project:p,onSaveProject:vi.fn(),onSaveEntities:vi.fn(),onOpen:vi.fn(),theme:'light',setTheme:vi.fn()};
    const first=await mount(ProjectInfo,props);await input(document.querySelector('#project-name')!,'入力中の新しい名');expect((document.querySelector('#project-name') as HTMLInputElement).value).toBe('入力中の新しい名');
    await act(async()=>first.root.unmount());roots=roots.filter(r=>r!==first.root);first.div.remove();await mount(ProjectInfo,props);
    expect((document.querySelector('#project-name') as HTMLInputElement).value).toBe('保存済み名');record('R07',{afterReturn:(document.querySelector('#project-name') as HTMLInputElement).value},'保存前の設定入力を画面移動後も保持して再開できる');
  });
  it('records calendar modal preview surviving a newer unreviewed project revision',async()=>{
    const p=createProject(),saved=vi.fn().mockResolvedValue(p);const host=await mount(WorldCalendars,{project:p,onSave:saved});
    await click(button('暦の規則を編集'));await input(document.querySelector('input[aria-label="暦の名称"]')!,'変更した暦');await click(button('規則変更の影響を確認'));
    const newer={...p,revision:'1',name:'別の更新済み作品'};await act(async()=>host.root.render(createElement(WorldCalendars,{project:newer,onSave:saved})));
    await click(button('確認した暦を保存'));expect(saved.mock.calls[0][0].revision).toBe('1');record('R08',{savedRevision:saved.mock.calls[0][0].revision},'差分確認時の版を保持し更新後は影響の再確認を要求する');
  });
  it('records source URI accessedAt absent from regular fields',async()=>{
    const {FIELD_SPECS}=await import('../src/ui/fieldSpecs');expect(FIELD_SPECS.source.some(f=>f.key==='accessedAt')).toBe(false);
    record('R09',{accessedAtField:false},'資料の参照日時を通常入力欄で記録できる');
  });
  it('records flow trial progressing during save and reverting to the saved earlier position',async()=>{
    const f=fixture();f.b.data.nodeType='automatic';f.b.data.executionPolicy='first_match';
    const finalScene=add(f.p,'scene','さらに先の終端');
    const finalNode=add(f.p,'flow_node','最後の出口',{nodeType:'terminal',sceneId:finalScene.id,terminalReason:'本当の終わり'});
    add(f.p,'flow_edge','もう一手',{fromId:f.b.id,toId:finalNode.id,edgeType:'automatic',priority:0});
    let finish!:()=>void;const saving=new Promise<void>(resolve=>{finish=resolve;});const save=vi.fn(()=>saving);
    const host=await mount(Reader,{project:f.p,onOpen:vi.fn(),onSaveMany:save});
    await click(button('試読を始める'));await click(button('進行規則に従って次へ'));
    await click(button('経路を記録'));await click(button('進行規則に従って次へ'));
    expect(document.querySelector('.trial-state')?.textContent).toBe('意図した終端');
    const savedEntities=save.mock.calls[0][0] as Entity[],snapshots=save.mock.calls[0][3] as ProjectData['snapshots'];
    await act(async()=>{finish();await saving;});
    const updated={...f.p,revision:'1',entities:[...f.p.entities,...savedEntities],snapshots};
    await act(async()=>host.root.render(createElement(Reader,{project:updated,onOpen:vi.fn(),onSaveMany:save})));
    expect(document.querySelector('.trial-state')?.textContent).toBe('試読中');
    record('R11',{whileSaving:'terminal',afterSave:'ready-at-earlier-position'},'経路保存中の操作を止めるか、新しい操作を保存完了後も保持する');
  });
  it('records another chapter scoped disclosure taking effect only in flow trial',()=>{
    const f=fixture();const current=add(f.p,'chapter','現在の章',{sceneIds:[f.s1.id]}),other=add(f.p,'chapter','別の章');
    f.s1.data.chapterId=current.id;
    const v=add(f.p,'variable','開示済み',{key:'scoped_disclosure',valueType:'boolean',initial:{type:'boolean',value:false},allowed:{values:[false,true]}});
    const shadow=add(f.p,'foreshadow','別の章だけの伏線',{resolutionPolicy:'this_work'});
    const effect=add(f.p,'effect','開示を記録',{operation:'set',targetId:v.id,value:{type:'boolean',value:true}});
    const disclosure=add(f.p,'disclosure','別章限定の提示',{foreshadowId:shadow.id,anchor:{entityId:f.s1.id},role:'clue',stage:'hint',knowledgeEffects:[effect.id],targetScope:{projectId:f.p.projectId,chapterId:other.id}});
    expect(validateProject(f.p).ok).toBe(true);
    const flow=startTrial(f.p);expect(flow.state.variableValues[v.id]).toEqual({type:'boolean',value:true});
    const chapter=presentContent(f.p,initializeRuntimeState(f.p),{nodeId:f.a.id,sceneId:f.s1.id});expect(chapter.ok).toBe(true);
    if(chapter.ok)expect(chapter.state.variableValues[v.id]).toEqual({type:'boolean',value:false});
    record('R12',{flowAppliedOtherChapter:true,chapterAppliedOtherChapter:false,disclosureId:disclosure.id},'章と分岐に同じ対象範囲・版・提示時効果の規則を使う');
  });
  it('records diagnostic creator absent from production action imports',async()=>{
    const {readFileSync}=await import('node:fs');const app=readFileSync('src/App.tsx','utf8'),work=readFileSync('src/ui/WorkPage.tsx','utf8');
    expect(app.includes('createDiagnostic')).toBe(false);expect(work.includes('createDiagnostic')).toBe(false);record('R10',{connectedToApp:false},'失敗時にメタ情報を残し本人操作で診断を持ち出せる');
  });
});
