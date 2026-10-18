import {expect,it} from 'vitest';
import {createProject} from '../../src/domain/model';
import * as sources from '../../src/domain/worldSources';

it('retains adopted worlds and replaces the previous preview for one editor generation',()=>{
 expect(sources).toHaveProperty('ownWorldRegistry');
 const owner={projectId:'editor',revision:'7',generation:3},a=createProject('adopted A'),b=createProject('preview B'),c=createProject('preview C');
 let state=sources.ownWorldRegistry(owner,{a});
 state=sources.replaceWorldPreview(state,owner,{b});expect(Object.keys(sources.worldRegistryContents(state))).toEqual(['a','b']);
 state=sources.replaceWorldPreview(state,owner,{c});expect(Object.keys(sources.worldRegistryContents(state))).toEqual(['a','c']);
 state=sources.replaceWorldPreview(state,owner,{});expect(sources.worldRegistryContents(state)).toEqual({a});
 expect(a.name).toBe('adopted A');expect(b.name).toBe('preview B');expect(c.name).toBe('preview C');
});

it('rejects late preview publications from previous selection, revision and return-to-same-project generations',()=>{
 expect(sources).toHaveProperty('ownWorldRegistry');
 const owner={projectId:'editor',revision:'7',generation:3},a=createProject('adopted A'),c=createProject('current C'),late=createProject('late B');
 const state=sources.replaceWorldPreview(sources.ownWorldRegistry(owner,{a}),owner,{c});
 for(const stale of [{...owner,projectId:'other'},{...owner,revision:'6'},{...owner,generation:1}])expect(sources.replaceWorldPreview(state,stale,{late})).toBe(state);
 expect(sources.worldRegistryContents(state)).toEqual({a,c});
 const failed=sources.replaceWorldPreview(state,owner,{});expect(sources.worldRegistryContents(failed)).toEqual({a});
});

it('refreshes adopted dependencies without dropping a newer preview of the same committed editor',()=>{
 const owner={projectId:'editor',revision:'8',generation:4},old=createProject('old adoption'),fresh=createProject('new adoption'),preview=createProject('newer unadopted preview');
 const state=sources.replaceWorldPreview(sources.ownWorldRegistry(owner,{old}),owner,{preview});
 const refreshed=sources.replaceAdoptedWorlds(state,owner,{fresh});expect(sources.worldRegistryContents(refreshed)).toEqual({fresh,preview});
 for(const stale of [{...owner,generation:3},{...owner,revision:'7'},{...owner,projectId:'other'}])expect(sources.replaceAdoptedWorlds(refreshed,stale,{old})).toBe(refreshed);
 expect(sources.worldRegistryContents(sources.replaceWorldPreview(refreshed,owner,{}))).toEqual({fresh});
});

it('preserves the committed owner and preview across same-revision refreshes and unsuccessful newer intents',()=>{
 const owner={projectId:'editor',revision:'8',generation:4},adopted=createProject('adopted'),preview=createProject('current preview');
 const state=sources.replaceWorldPreview(sources.ownWorldRegistry(owner,{adopted}),owner,{preview});
 // The request generation can advance without replacing the committed editor.
 expect(sources.updateWorldRegistryRevision(state,{...owner,generation:5})).toBe(state);
 // A delayed same-revision callback cannot replace an A -> B -> A owner.
 expect(sources.updateWorldRegistryRevision(state,{...owner,generation:1})).toBe(state);
 expect(sources.updateWorldRegistryRevision(state,{...owner,revision:'7'})).toBe(state);
 expect(sources.updateWorldRegistryRevision(state,{...owner,projectId:'other'})).toBe(state);
 const nextOwner={...owner,revision:'9',generation:5},next=sources.updateWorldRegistryRevision(state,nextOwner);
 expect(next.owner).toEqual(nextOwner);expect(sources.worldRegistryContents(next)).toEqual({adopted});
 expect(sources.replaceWorldPreview(next,owner,{preview})).toBe(next);
 expect(sources.replaceAdoptedWorlds(state,owner,{adopted})).toMatchObject({owner,preview:{preview}});
});
