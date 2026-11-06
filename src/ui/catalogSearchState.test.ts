import {expect,it} from 'vitest';
import {catalogSearchStorageKey,parseCatalogSearchState} from './catalogSearchState';
it('scopes search return state by author and work and restores every filter and selected row',()=>{
 expect(catalogSearchStorageKey('guest:catalog:one')).not.toBe(catalogSearchStorageKey('guest:catalog:two'));
 expect(catalogSearchStorageKey('guest:catalog:one')).not.toBe(catalogSearchStorageKey('other:catalog:one'));
 const state={...parseCatalogSearchState(null),text:'アオ',chapter:'second',participant:'person',resultView:'table',selectedPositionId:'line:body:block:0:2',collectionId:'saved',detailsOpen:true};
 expect(parseCatalogSearchState(JSON.stringify(state))).toEqual(state);
 expect(parseCatalogSearchState('{bad').text).toBe('');
 expect(parseCatalogSearchState('{"text":false,"resultView":"code","detailsOpen":"true"}')).toMatchObject({text:'',resultView:'cards',detailsOpen:false});
});
