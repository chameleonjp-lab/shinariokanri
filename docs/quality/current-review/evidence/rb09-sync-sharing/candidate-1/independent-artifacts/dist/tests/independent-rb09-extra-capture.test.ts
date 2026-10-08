import {it,expect} from 'vitest';
import {readFileSync,writeFileSync} from 'node:fs';
import {newId} from '../src/domain/model';
import {nativeDocuments,prepareNativeOperation} from '../src/sync/nativeBridge';
import {valueHash} from '../src/sync/protocol';
const root='/tmp/shinariokanri-independent-rb09-35d34a8/independent';
it('R9D07 native preparation captures project/account metadata together with its operation before asynchronous hashing',async()=>{
 const f=JSON.parse(readFileSync(root+'/fixtures/native-two-targets.json','utf8')),scope={projectId:f.p.projectId,accountId:f.account},docs=nativeDocuments(f.p,'1'),base={projectId:f.p.projectId,serverRevision:'1',documents:docs,contentHash:await valueHash(docs)},next=structuredClone(f.p),submitted=structuredClone(scope);
 next.entities.find((e:any)=>e.id===f.idA).name='今回の準備';
 const pending=prepareNativeOperation(scope,base,next,[],'入力捕捉を確認');
 scope.projectId=newId();scope.accountId=newId();next.name='後発作品入力';
 const prepared=await pending;
 writeFileSync(root+'/fixtures/R9D07.json',JSON.stringify({submitted,callerLater:scope,prepared},null,2)+'\n');
 expect(prepared?.operation.scope).toEqual(submitted);
 expect(prepared?.projectId).toBe(submitted.projectId);
 expect(prepared?.localDocuments.find(d=>d.id===submitted.projectId)?.fields.name).toBe(f.p.name);
});
