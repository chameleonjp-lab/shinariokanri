import 'fake-indexeddb/auto';
import {it,expect} from 'vitest';
import {readFileSync,writeFileSync} from 'node:fs';
import {inspectScenario,worldSnapshotContents} from '../src/storage/archive';
import {ScenarioStore} from '../src/storage/store';
import {newId,validateProject} from '../src/domain/model';
const root='/tmp/shinariokanri-independent-rb07-11cffa7/independent/fixtures';
it('R7U14 normal App complete download contains the explicitly fixed historical relation world',async()=>{
 const input=JSON.parse(readFileSync(root+'/world-relation-production.json','utf8')),prepared=await inspectScenario(new Uint8Array(readFileSync(root+'/R7U14-relation-world-complete.scenario')),{worker:false}),pins=worldSnapshotContents(prepared.worlds);writeFileSync(root+'/R7U14-archive-observation.json',JSON.stringify({archivedWorldPinIds:Object.keys(pins),expectedOldPin:input.ids.old,relation:prepared.project.relations[0],archiveAccepted:true},null,2)+'\n');expect(prepared.project.relations[0].validity?.presentationAnchor?.sourceVersionId).toBe(input.ids.old);expect(pins[input.ids.old]).toBeDefined();for(const mode of ['new','clone']as const){const target=new ScenarioStore({databaseName:'actual-complete-world-file-'+newId()});try{const restored=(await target.importScenario(prepared,{mode})).project,worlds=worldSnapshotContents(await target.listWorldSnapshots());expect(validateProject(restored,{worldSnapshots:worlds}).ok).toBe(true);expect(worlds[input.ids.old]).toBeDefined();expect(restored.relations[0].validity?.presentationAnchor?.sourceVersionId).toBe(input.ids.old);writeFileSync(root+'/R7U14-archive-'+mode+'.json',JSON.stringify({actualAppDownloadedFile:true,restoreDatabase:'fake-indexeddb component',mode,valid:true,worldPinIds:Object.keys(worlds),relation:restored.relations[0]},null,2)+'\n');}finally{await target.deleteDatabase();}}
});
