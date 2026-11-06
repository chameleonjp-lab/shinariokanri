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
