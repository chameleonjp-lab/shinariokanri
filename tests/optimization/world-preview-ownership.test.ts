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
