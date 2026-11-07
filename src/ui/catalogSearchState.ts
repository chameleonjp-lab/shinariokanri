/** Device navigation preferences, separate from authored collections and revisions. */
export const emptyCatalogSearchState = {
 text:'',kind:'all',status:'all',chapter:'',participant:'',production:'all',foreshadow:'',resolution:'',disclosureRole:'',disclosureStage:'',collectionId:'',selectedPositionId:'',detailsOpen:false,resultView:'cards' as 'cards'|'table'|'diagram'|'timeline',
};
export type CatalogSearchState = typeof emptyCatalogSearchState;
export function catalogSearchStorageKey(authorScope:string){return `scenario-catalog-return:v1:${authorScope}`;}
export function parseCatalogSearchState(raw:string|null,initial?:{text:string;kind:string;status:string}):CatalogSearchState {
 const next={...emptyCatalogSearchState,...initial};
 try {
  const parsed:unknown=JSON.parse(raw??'null');
  if(!parsed||typeof parsed!=='object'||Array.isArray(parsed))return next;
  const values=parsed as Record<string,unknown>;
  for(const key of Object.keys(next) as (keyof CatalogSearchState)[]){
   if(key==='detailsOpen'){next.detailsOpen=values.detailsOpen===true;continue;}
   if(key==='resultView'){if(['cards','table','diagram','timeline'].includes(String(values[key])))next.resultView=values[key] as CatalogSearchState['resultView'];continue;}
   if(typeof values[key]==='string')next[key]=values[key];
  }
 }catch{/* A malformed preference must not prevent opening the work. */}
 return next;
}
