import {createElement} from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {expect,it} from 'vitest';
import {createProject} from '../domain/model';
import {CatalogPanel} from './CatalogPanel';
it('starts search with one input and keeps detailed filters and collection creation collapsed',()=>{
 const project=createProject('検索');
 const html=renderToStaticMarkup(createElement(CatalogPanel,{project,selectedId:null,onOpen:()=>{},onOpenTarget:()=>{},onOpenField:()=>{},onSave:async e=>e,onSaveMany:async()=>{},onSaveProject:async p=>p,onSaveRelation:async()=>{}}));
 expect(html).toMatch(/<details[^>]*><summary>詳しい検索条件<\/summary>/);
 expect(html).toMatch(/<details[^>]*><summary>今の検索結果を一覧に保存<\/summary>/);
 expect(html).toContain('直近の検索条件');
});

it('explains when a saved matched paragraph is gone and keeps search available',()=>{
 const project=createProject('削除後の検索');
 const previous=globalThis.localStorage;
 Object.defineProperty(globalThis,'localStorage',{configurable:true,value:{getItem:()=>JSON.stringify({text:'アオ',selectedPositionId:'deleted-paragraph'})}});
 try{
  const html=renderToStaticMarkup(createElement(CatalogPanel,{project,selectedId:null,onOpen:()=>{},onOpenTarget:()=>{},onOpenField:()=>{},onSave:async e=>e,onSaveMany:async()=>{},onSaveProject:async p=>p,onSaveRelation:async()=>{}}));
  expect(html).toContain('選んだ文章の位置が削除・変更されました');
 }finally{Object.defineProperty(globalThis,'localStorage',{configurable:true,value:previous});}
});
