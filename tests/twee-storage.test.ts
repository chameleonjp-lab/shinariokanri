import 'fake-indexeddb/auto';
import {it,expect} from 'vitest';
import {createProject,newId} from '../src/domain/model';
import {ScenarioStore,cloneProject} from '../src/storage/store';
import {exportScenario,inspectScenario} from '../src/storage/archive';
import {parseTwee,importTweeAlternative,exportTweeAlternative} from '../src/domain/twee';
import {sealAuthorAlternative} from '../src/domain/authorAlternativeIntegrity';
import {headAlternativeContent,projectContent,rollbackAlternativeHead} from '../src/domain/writingWorkspace';
const raw=':: A\nHello😀\n[[left->B]]\n[[right->C]]\n<<do private_command>>\n:: B\nB text\n:: C\nC text';
it('seals one import command, roundtrips and clones its branch references, then rolls back the import without changing the canonical story',async()=>{
 const store=new ScenarioStore({databaseName:`twee-${newId()}`});try{
 const base=(await store.saveProject(createProject('canonical'),{reason:'base'})).project,baseline=projectContent(base),branch=await sealAuthorAlternative(importTweeAlternative(base,parseTwee(raw),'import'));
 const saved=(await store.saveProject({...base,authorAlternatives:[branch]},{reason:'Twee import'})).project;
 expect(saved.entities).toEqual(base.entities);expect(saved.relations).toEqual(base.relations);
 const restored=(await inspectScenario(await exportScenario(saved))).project,clone=await cloneProject(restored),cloned=clone.project.authorAlternatives![0];
 const content=headAlternativeContent(cloned);expect(content.entities.filter(e=>e.kind==='scene')).toHaveLength(3);expect(exportTweeAlternative(content).originals[0].content).toBe(raw);
 expect(parseTwee(exportTweeAlternative(content).artifact!.content).passages.map(p=>p.links.map(l=>l.target))).toEqual([['B','C'],[],[]]);
 const rolled=await sealAuthorAlternative(rollbackAlternativeHead(saved.authorAlternatives![0],branch.versions[0].id));const undone=(await store.saveProject({...saved,authorAlternatives:[rolled]},{reason:'Twee取込全体を最初の版へ戻す'})).project;expect(headAlternativeContent(undone.authorAlternatives![0])).toEqual(baseline);expect(undone.entities).toEqual(baseline.entities);expect(undone.relations).toEqual(baseline.relations);
 await expect(store.saveProject({...base,authorAlternatives:[branch]},{reason:'stale import'})).rejects.toThrow();
 }finally{await store.deleteDatabase();}
});
