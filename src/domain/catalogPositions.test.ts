import { describe, expect, it } from 'vitest';
import { createEntity, createProject, newId } from './model';
import { findCatalogTextPositions } from './catalogPositions';
import {startProbe,probeEnabled} from '../observability/probe';
describe('normalized search position navigation', () => {
  it('separates full position scans, trace reuse and regenerated mutable text without recording authored content',()=>{
    const project=createProject('position work'),note=createEntity(project.projectId,'note','name',{body:[{id:newId(),kind:'paragraph',text:'😀ガラス'}]});project.entities=[note];
    const probe=startProbe();
    try{
      expect(findCatalogTextPositions(project,[note],'がらす')[0].anchor).toMatchObject({start:1,end:4});
      expect(findCatalogTextPositions(project,[note],'がらす')).toHaveLength(1);
      note.data.body[0].text='前ガラス';expect(findCatalogTextPositions(project,[note],'がらす')[0].anchor).toMatchObject({start:1,end:4});
      const snapshot=probe.snapshot();
      expect(snapshot.counters).toMatchObject({'query.positions.rows':3,'query.positions.blocks':3,'query.positions.matches':3,'query.positions.traceBuilds':2,'query.positions.traceHits':1});
      expect(snapshot.events.filter(event=>event.phase==='query.positions')).toHaveLength(3);
      expect(Object.values(snapshot.counters).every(value=>typeof value==='number')).toBe(true);
    }finally{probe.stop();}
    expect(probeEnabled()).toBe(false);expect(findCatalogTextPositions(project,[note],'がらす')).toHaveLength(1);
  });
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
  it('keeps current labels, IDs and Unicode positions after status changes and in-place text edits', () => {
    const project = createProject('再検索');
    const block = { id: newId(), kind: 'paragraph' as const, text: '😀ガラスと㍿' };
    const scene = createEntity(project.projectId, 'scene', '以前の名称', { body: [block] });
    project.entities = [scene];
    expect(findCatalogTextPositions(project, [scene], 'がらす')[0].anchor).toMatchObject({ start: 1, end: 4, blockId: block.id });
    const renamed = { ...scene, name: '改名後', status: 'confirmed' as const };
    expect(findCatalogTextPositions(project, [renamed], '株式会社')[0]).toMatchObject({ name: '改名後', anchor: { entityId: scene.id, blockId: block.id, start: 5, end: 6 } });
    const mutableBlock = renamed.data.body[0];
    mutableBlock.text = '前😀ガ ラ スと㍿';
    expect(findCatalogTextPositions(project, [renamed], 'がらす')[0].anchor).toMatchObject({ start: 2, end: 7, blockId: mutableBlock.id });
    expect(findCatalogTextPositions(project, [renamed], '株式会社')[0].anchor).toMatchObject({ start: 8, end: 9 });
    mutableBlock.id = newId();
    expect(findCatalogTextPositions(project, [renamed], 'がらす')[0].anchor.blockId).toBe(mutableBlock.id);
    mutableBlock.text = '別の内容';
    expect(findCatalogTextPositions(project, [renamed], 'がらす')).toEqual([]);
  });
});
