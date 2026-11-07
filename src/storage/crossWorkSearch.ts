import {searchWorkCatalog,type WorkCatalogHit} from '../domain/catalog';
import type {ProjectData} from '../domain/types';
import type {ScenarioStore} from './store';
import {StorageError,checkCancelled} from './errors';

/** No retained index: only explicitly selected, currently authorized local author works. */
export async function searchLocalCatalog(store:ScenarioStore, selected:readonly Pick<ProjectData,'projectId'|'revision'>[], text:string, signal?:AbortSignal):Promise<WorkCatalogHit[]> {
  const generation=store.catalogGeneration;
  const fence=()=>{checkCancelled(signal);if(generation!==store.catalogGeneration)throw new StorageError('CANCELLED','検索中に作品または権限が変わりました。対象を確認して再検索してください。');};
  const requested=selected.map(work=>({...work}));fence();
  if(!requested.length)return [];
  const allowed=await store.listProjectSummaries({signal});fence();
  const results:WorkCatalogHit[]=[];
  for(const target of requested){
    if(!allowed.some(work=>work.projectId===target.projectId))continue;
    const work=await store.loadEditor(target.projectId,{expectedRevision:target.revision,signal,immutableView:true});fence();
    if(!work)continue;
    const worlds=await store.listEditorWorldSnapshots(work,{signal});fence();
    results.push(...searchWorkCatalog(work,worlds,text));
  }
  // A different tab/store can advance an earlier work while a later work loads.
  const latest=await store.listProjectSummaries({signal});fence();
  if(requested.some(target=>allowed.some(work=>work.projectId===target.projectId)&&!latest.some(work=>work.projectId===target.projectId&&work.revision===target.revision)))throw new StorageError('REVISION_CONFLICT','検索中に作品または権限が変わりました。検索し直してください。');
  return results;
}
