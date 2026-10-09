import 'fake-indexeddb/auto';
import {it,expect} from 'vitest';
import {readFileSync,writeFileSync} from 'node:fs';
import {inspectScenario,worldSnapshotContents} from '../src/storage/archive';
const root='/tmp/shinariokanri-independent-rb07-28eccca/independent/fixtures';
it('R7U14 normal App complete download contains the explicitly fixed historical relation world',async()=>{
 const input=JSON.parse(readFileSync(root+'/world-relation-production.json','utf8')),prepared=await inspectScenario(new Uint8Array(readFileSync(root+'/R7U14-relation-world-complete.scenario')),{worker:false}),pins=worldSnapshotContents(prepared.worlds);writeFileSync(root+'/R7U14-archive-observation.json',JSON.stringify({archivedWorldPinIds:Object.keys(pins),expectedOldPin:input.ids.old,relation:prepared.project.relations[0],archiveAccepted:true},null,2)+'\n');expect(prepared.project.relations[0].validity?.presentationAnchor?.sourceVersionId).toBe(input.ids.old);expect(pins[input.ids.old]).toBeDefined();
});
