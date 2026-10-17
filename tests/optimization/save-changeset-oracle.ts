// Frozen P2-01 oracle: d3bf88c31172386fd84926a615ed060c2ee2190c.
// Algorithms copied before P2-03 product edits. Never import optimized helpers.
import type {ContentState,Entity,Relation} from '../../src/domain/types';
import type {ProjectTarget,TargetChange,FieldChange,Presence} from '../../src/storage/store';
import {equalJson,jsonBytes,sha256} from '../../src/storage/json';
type TargetRecord=Entity|Relation|ProjectTarget;
type ContentHeader=Omit<ContentState,'entities'|'relations'>;
interface ContentDelta {header:Partial<ContentHeader>;entities:{id:string;record:Entity|null}[];relations:{id:string;record:Relation|null}[];entityIds?:string[];relationIds?:string[]}
const absentPresence:Presence=Object.freeze({present:false});
const sameJson=(left:unknown,right:unknown)=>left===right||equalJson(left??null,right??null);
function withoutRevision(record: TargetRecord): unknown {
  return Object.fromEntries(Object.entries(record).filter(([field]) => !['revision', 'updatedAt'].includes(field)));
}

function headerTarget(content: ContentState): ProjectTarget {
  const { entities: _entities, relations: _relations, ...header } = content;
  return { ...header, id: content.projectId, kind: 'project' };
}
export async function targetChanges(before: ContentState, after: ContentState, isNew = false): Promise<TargetChange[]> {
  const old = new Map<string, TargetRecord>([...before.entities, ...before.relations, ...(isNew ? [] : [headerTarget(before)])].map(record => [record.id, record]));
  const current = new Map<string, TargetRecord>([...after.entities, ...after.relations, headerTarget(after)].map(record => [record.id, record]));
  const result: TargetChange[] = [];
  let absentHash:string|undefined;
  for (const id of new Set([...old.keys(), ...current.keys()])) {
    const previous = old.get(id) ?? null, next = current.get(id) ?? null;
    if (id !== after.projectId && (previous === next || sameJson(previous ? withoutRevision(previous) : null, next ? withoutRevision(next) : null))) continue;
    const fields: FieldChange[] = [];
    for (const field of new Set([...Object.keys(previous ?? {}), ...Object.keys(next ?? {})])) {
      if (['revision', 'updatedAt'].includes(field)) continue;
      const previousValue: Presence = previous && field in previous ? { present: true, value: (previous as unknown as Record<string, unknown>)[field] } : absentPresence;
      const nextValue: Presence = next && field in next ? { present: true, value: (next as unknown as Record<string, unknown>)[field] } : absentPresence;
      if (previousValue.present && nextValue.present && previousValue.value === nextValue.value) continue;
      if (!sameJson(previousValue, nextValue)) fields.push({ field, oldValueHash: previousValue.present?await sha256(jsonBytes(previousValue)):(absentHash??=await sha256(jsonBytes(previousValue))), before: previousValue, after: nextValue });
    }
    result.push({ targetId: id, before: previous, after: next, fields });
  }
  return result;
}

export function contentDelta(before: ContentState, after: ContentState): ContentDelta {
  const changes = <T extends Entity | Relation>(previous: T[], next: T[]) => {
    const old = new Map(previous.map(record => [record.id, record]));
    const current = new Map(next.map(record => [record.id, record]));
    return [...new Set([...old.keys(), ...current.keys()])].flatMap(id => sameJson(old.get(id) ?? null, current.get(id) ?? null) ? [] : [{ id, record: current.get(id) ?? null }]);
  };
  const beforeHeader = headerTarget(before), afterHeader = headerTarget(after), header: Partial<ContentHeader> = {};
  for (const field of Object.keys(afterHeader) as (keyof ContentHeader)[]) if (field !== ('id' as string) && field !== ('kind' as string) && !sameJson(beforeHeader[field], afterHeader[field])) {
    (header as Record<string, unknown>)[field] = afterHeader[field];
  }
  const orderedIds = (previous: { id: string }[], next: { id: string }[]) => previous.length === next.length && previous.every((record, index) => record.id === next[index].id) ? undefined : next.map(record => record.id);
  return { header, entities: changes(before.entities, after.entities), relations: changes(before.relations, after.relations), entityIds: orderedIds(before.entities, after.entities), relationIds: orderedIds(before.relations, after.relations) };
}
export function writeRows<T extends {id:string}>(old:T[],current:T[]){
 const oldById=new Map(old.map(record=>[record.id,record])),ids=new Set(current.map(record=>record.id));
 return {put:current.filter(record=>!sameJson(oldById.get(record.id),record)),remove:old.filter(record=>!ids.has(record.id)).map(record=>record.id)};
}
