import {collectReferences} from '../domain/model';
import type {Entity} from '../domain/types';
// Saved UI content arrays are immutable views; edits/save/reload provide a new array.
// A draft is never indexed here. The index is weakly held with its source view.
const indexes=new WeakMap<readonly Entity[],Map<string,Entity[]>>();
export function referencesTo(entities:readonly Entity[],id:string):Entity[]{
 let index=indexes.get(entities);if(!index){index=new Map();for(const entity of entities){if(entity.deletedAt)continue;for(const target of new Set(collectReferences(entity).map(ref=>ref.id))){if(target===entity.id)continue;const rows=index.get(target)??[];rows.push(entity);index.set(target,rows);}}indexes.set(entities,index);}
 return index.get(id)??[];
}
