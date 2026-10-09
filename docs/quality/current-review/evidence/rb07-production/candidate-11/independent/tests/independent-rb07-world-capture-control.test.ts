import 'fake-indexeddb/auto';
import {it,expect} from 'vitest';
import {readFileSync,writeFileSync} from 'node:fs';
import {createWorldSnapshot} from '../src/domain/world';
import {productionCheckView} from '../src/domain/productionChecks';
import {captureRuntimeContent} from '../src/domain/runtimeVersions';
import type {ProjectData,ProjectContent,Entity} from '../src/domain/types';
it('CAP-control unchanged frozen work input succeeds, later caller mutation must not change that captured input',async()=>{
 const root='/tmp/shinariokanri-independent-rb07-11cffa7/independent/fixtures';
 const {project:p,world,ids,registry}=JSON.parse(readFileSync(root+'/world-route-production.json','utf8')) as {project:ProjectData;world:ProjectData;ids:Record<string,string>;registry:Record<string,ProjectContent>};
 const fixed=await createWorldSnapshot(p,'制作検査作品版の独立対照'),pin=fixed.snapshots.at(-1)!,source=await captureRuntimeContent(fixed,pin.id,{worldSnapshots:registry}),before=structuredClone(source);
 const unchanged=await productionCheckView(source,registry,world.snapshots,pin.id);
 expect(unchanged.project.entities.find(e=>e.id===ids.frame)).toEqual(before.entities.find(e=>e.id===ids.frame));
 writeFileSync(root+'/CAP-control.json',JSON.stringify({normalInputAccepted:true,fixedPin:pin.id,expectedHash:pin.contentHash,frame:before.entities.find(e=>e.id===ids.frame)},null,2)+'\n');
 const pending=productionCheckView(source,registry,world.snapshots,pin.id);
 (source.entities.find(e=>e.id===ids.frame)as Entity<'storyboard_frame'>).data.caption![0].text='呼出し後に別入力へ変更';
 const changed=await pending;
 expect(changed.project.entities.find(e=>e.id===ids.frame)).toEqual(before.entities.find(e=>e.id===ids.frame));
});
