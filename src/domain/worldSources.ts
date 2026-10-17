import type { ID, ProjectData } from './types';
import {probeEnabled,probeGauge,probePayload} from '../observability/probe';

export interface WorldRegistryOwner { projectId:string;revision:string;generation:number }
export interface OwnedWorldRegistry {owner?:WorldRegistryOwner;adopted:Record<string,ProjectData>;preview:Record<string,ProjectData>}
export function ownWorldRegistry(owner?:WorldRegistryOwner,adopted:Record<string,ProjectData>={}):OwnedWorldRegistry {
  return {owner:owner?{...owner}:undefined,adopted,preview:{}};
}
/** An editor owns adopted pins separately from its one replaceable preview. */
export function replaceWorldPreview(state:OwnedWorldRegistry,owner:WorldRegistryOwner,preview:Record<string,ProjectData>):OwnedWorldRegistry {
  if(state.owner?.projectId!==owner.projectId||state.owner.revision!==owner.revision||state.owner.generation!==owner.generation)return state;
  return {...state,preview};
}
/** A delayed adopted-closure refresh must keep this owner's newer preview. */
export function replaceAdoptedWorlds(state:OwnedWorldRegistry,owner:WorldRegistryOwner,adopted:Record<string,ProjectData>):OwnedWorldRegistry {
  if(state.owner?.projectId!==owner.projectId||state.owner.revision!==owner.revision||state.owner.generation!==owner.generation)return state;
  return {...state,adopted};
}
export function worldRegistryContents(state:OwnedWorldRegistry):Record<string,ProjectData> {
  const result={...state.adopted,...state.preview};
  if(probeEnabled()){
    const projects=[...new Set(Object.values(result))];
    probeGauge('ui.worldRegistry.entries',Object.keys(result).length);probeGauge('ui.worldRegistry.projects',projects.length);
    probeGauge('ui.worldRegistry.records',projects.reduce((sum,project)=>sum+project.entities.length+project.relations.length,0));
    probeGauge('ui.worldRegistry.payloadBytes',0);for(const project of projects)probePayload('ui.worldRegistry.payloadBytes',project);
  }
  return result;
}
/** Explicit adoption controls visibility, while locally used participants remain reachable. */
export function adoptedWorldEntityIds(project: ProjectData): ID[] | undefined {
  const views = project.views.filter(view => view.view.startsWith('world-adoption:'));
  if (!views.length) return undefined;
  const used = project.entities.filter(entity => !entity.deletedAt).flatMap(entity => entity.kind === 'event' ? (entity.data.participants ?? []).map(participant => participant.characterId) : entity.kind === 'group' ? entity.data.members ?? [] : []);
  return [...new Set([...views.flatMap(view => view.entityIds), ...used])];
}
/** Join immutable snapshot registries without replacing a source's current editable content. */
export function mergeWorldSources(current: ProjectData[], pinned: Record<string, ProjectData>): ProjectData[] {
  const result = new Map<string, ProjectData>();
  for (const world of [...Object.values(pinned), ...current]) {
    const previous = result.get(world.projectId);
    const snapshots = new Map(previous?.snapshots.map(snapshot => [snapshot.id, snapshot]) ?? []);
    for (const snapshot of world.snapshots) if (!snapshots.has(snapshot.id)) snapshots.set(snapshot.id, snapshot);
    result.set(world.projectId, { ...world, snapshots: [...snapshots.values()] });
  }
  return [...result.values()];
}
