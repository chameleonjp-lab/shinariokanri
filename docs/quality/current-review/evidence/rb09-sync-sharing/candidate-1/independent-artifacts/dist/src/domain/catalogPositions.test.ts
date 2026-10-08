import { describe, expect, it } from 'vitest';
import { createEntity, createProject, newId } from './model';
import { findCatalogTextPositions } from './catalogPositions';
describe('normalized search position navigation', () => {
  it('maps kana, emoji and width expansion to the unchanged original range', () => {
    const project = createProject('検索'); const block = { id: newId(), kind: 'paragraph' as const, text: '😀ガラスと㍿、ガラス' };
    const scene = createEntity(project.projectId, 'scene', '場面', { body: [block] }); project.entities = [scene];
    expect(findCatalogTextPositions(project, [scene], 'がらす').map(hit => [hit.anchor.start, hit.anchor.end])).toEqual([[1,4],[7,10]]);
    expect(findCatalogTextPositions(project, [scene], '株式会社')[0].anchor).toMatchObject({ start:5, end:6, blockId:block.id });
    expect(block.text).toBe('😀ガラスと㍿、ガラス');
  });
  it('reports a dialogue-line location and excludes author IDs from text matching', () => {
    const project = createProject('台詞'); const line = createEntity(project.projectId, 'dialogue_line', '', { text: [{ id:newId(), kind:'paragraph', text:'雨の駅' }] }); project.entities = [line];
    expect(findCatalogTextPositions(project, [line], '駅')[0].anchor).toMatchObject({ entityId:line.id,lineId:line.id,start:2,end:3 });
    expect(findCatalogTextPositions(project, [line], line.id)).toEqual([]);
  });
  it('opens the original range when normalized search removes whitespace', () => {
    const project = createProject('空白'); const note = createEntity(project.projectId, 'note', 'メモ', { body: [{ id:newId(), kind:'paragraph', text:'ア オ' }] }); project.entities = [note];
    expect(findCatalogTextPositions(project, [note], 'アオ')[0].anchor).toMatchObject({ start:0,end:3 });
  });
});
