/** Opt-in dedicated-tenant verification. Never run from CI; Auth secrets stay in process memory. */
import {readFile,mkdir,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
const args=process.argv.slice(2),option=name=>args[args.indexOf(name)+1];
if(!args.includes('--run-authorized-fixture-writes'))throw Error('Explicit authorization for this dedicated fixture tenant is required. No requests made.');
const plan=JSON.parse(await readFile(option('--plan'),'utf8')),endpoint=new URL(process.env.SCENARIO_SYNC_URL??''),out=option('--out');
if(endpoint.protocol!=='https:'||endpoint.origin!==plan.dedicatedOrigin||!plan.fixtureOnly||!out||!process.env.SCENARIO_SYNC_PUBLISHABLE_KEY?.startsWith('sb_publishable_'))throw Error('Dedicated origin, fixtureOnly plan and publishable key required. No requests made.');
const key=process.env.SCENARIO_SYNC_PUBLISHABLE_KEY,rows=[],startedAt=new Date().toISOString(),tokens=new Map(),hash=v=>createHash('sha256').update(v).digest('hex');
const headers=token=>({apikey:key,Authorization:`Bearer ${token}`,'Content-Type':'application/json'});
async function call(role,path,init={}){const response=await fetch(endpoint.origin+path,{...init,headers:{...headers(tokens.get(role)),...init.headers},signal:AbortSignal.timeout(30000)}),bytes=new Uint8Array(await response.arrayBuffer());return {status:response.status,bytes,hash:hash(bytes),text:new TextDecoder().decode(bytes)};}
function record(id,role,response,expected,extra={}){const passed=expected.includes(response.status);rows.push({id,role,status:response.status,expected_status:expected,response_sha256:response.hash,result:passed?'passed':'failed',...extra});if(!passed)throw Error(`Contract failed: ${id} / ${role} status ${response.status}. Author response omitted.`);}
async function edge(role,action,input){return call(role,'/functions/v1/scenario-sync',{method:'POST',body:JSON.stringify({specification:'scenario-sync-native/1.0.0',action,input})});}
try{
 for(const role of ['owner','editor','reviewer','reader','nonmember']){const credentials=JSON.parse(process.env[`SCENARIO_${role.toUpperCase()}_AUTH`]??'null');if(!credentials)throw Error(`Missing ${role} fixture Auth credentials`);const result=await fetch(endpoint.origin+'/auth/v1/token?grant_type=password',{method:'POST',headers:{apikey:key,'Content-Type':'application/json'},body:JSON.stringify(credentials),signal:AbortSignal.timeout(30000)});if(!result.ok)throw Error(`Auth fixture unavailable: ${role}`);const session=await result.json();if(session.user.id!==plan.accounts[role])throw Error(`Auth account mismatch: ${role}`);tokens.set(role,session.access_token);}
 for(const role of tokens.keys()){
  const native=await edge(role,'pull',{projectId:plan.projectId});record('native-owner-only',role,native,role==='owner'?[200]:[403]);
  const team=await edge(role,'team_read',{projectId:plan.projectId});record('granted-editor-only',role,team,role==='editor'?[200]:[403]);
  if(role==='editor'&&team.text.includes(plan.secretCanary)){rows.push({id:'private-field-leak',role,result:'failed'});throw Error('Private field leak; response omitted');}
  const raw=await call(role,'/rest/v1/documents?select=document',{headers:{'Accept-Profile':'scenario_private'}});record('private-schema-direct-api',role,raw,[400,401,403,404,406]);
  const snapshot=await edge(role,'shared_snapshot',{snapshotId:plan.snapshotId});record('selected-approved-snapshot',role,snapshot,role==='nonmember'?[403]:[200]);
  if(role!=='owner'&&snapshot.text.includes(plan.secretCanary)){rows.push({id:'projection-leak',role,result:'failed'});throw Error('Projection leak; response omitted');}
  const privateBytes=await call(role,`/storage/v1/object/authenticated/scenario-private/${plan.projectId}/${plan.contentHash}`);record('canonical-private-storage',role,privateBytes,role==='owner'?[200]:[400,401,403,404]);
  const publicBytes=await edge(role,'download_asset',{snapshotId:plan.snapshotId,publicAssetId:plan.publicAssetId});record('approved-protected-bytes',role,publicBytes,role==='nonmember'?[403]:[200]);if(role!=='nonmember'&&publicBytes.hash!==plan.assetSha256)throw Error('Approved bytes hash differs');
  const comment=await call(role,'/rest/v1/scenario_comments',{method:'POST',headers:{Prefer:'return=representation'},body:JSON.stringify({snapshot_id:plan.snapshotId,public_version_id:plan.publicVersionId??'public-project',public_entity_id:plan.publicEntityId,public_block_id:plan.publicBlockId,start_cp:0,end_cp:1,body:'専用受入fixture: Unicode位置'})});record('paragraph-comment-role',role,comment,['owner','editor','reviewer'].includes(role)?[201]:[403]);
 }
 const membership=JSON.parse((await edge('owner','members',{projectId:plan.projectId})).text);
 record('revoke-fixture-reviewer','owner',await edge('owner','membership',{projectId:plan.projectId,accountId:plan.accounts.reviewer,role:'reviewer',revoked:true,snapshotIds:[],expiresAt:null,membershipRevision:membership.membershipRevision}),[200]);
 record('revoked-snapshot','reviewer',await edge('reviewer','shared_snapshot',{snapshotId:plan.snapshotId}),[403]);
 record('revoked-private-proxy','reviewer',await edge('reviewer','download_asset',{snapshotId:plan.snapshotId,publicAssetId:plan.publicAssetId}),[403]);
 const logout=await call('reader','/auth/v1/logout',{method:'POST'});record('real-auth-logout','reader',logout,[204]);
 record('real-session-revocation','reader',await edge('reader','shared_snapshot',{snapshotId:plan.snapshotId}),[401,403]);
 record('withdraw-fixture-snapshot','owner',await edge('owner','withdraw',{projectId:plan.projectId,snapshotId:plan.snapshotId}),[200]);
 record('withdrawn-snapshot-owner','owner',await edge('owner','shared_snapshot',{snapshotId:plan.snapshotId}),[403]);
}catch(cause){rows.push({id:'driver-stop',result:'failed',reason:String(cause.message).replace(/https?:\/\/\S+/g,'[endpoint]')});process.exitCode=1;}
finally{tokens.clear();await mkdir(out,{recursive:true});await writeFile(out+'/live-contract.json',JSON.stringify({startedAt,finishedAt:new Date().toISOString(),candidateCommit:plan.candidateCommit,candidateTree:plan.candidateTree,authority:'real dedicated Auth/Data API/Storage only if this driver ran successfully',endpoint_sha256:hash(endpoint.origin),fixturePlan_sha256:hash(JSON.stringify(plan)),cases:rows,not_covered:['two physical devices/offline concurrent edit','quota/cost approval','all116/physical accessibility/2h']},null,2)+'\n');}
