import {createEntity,createProject} from '../../src/domain/model';
import type {ContentState,ProjectData} from '../../src/domain/types';

export const HEAVY_HISTORY_SHA256='46364d941e3f72ef793d31525bbf58b9c7384037b67eb9f94e55efaaade7e0fe';
export const HEAVY_HISTORY_BYTES=9_012_384;
export const heavyHistoryId=(serial:number)=>`a2040000-0000-4000-8000-${serial.toString(16).padStart(12,'0')}`;
/** Exact additional input from the native HTTP test; never an original scale fixture. */
export function heavyHistoryFixture():ProjectData {
 const project=createProject('重い履歴と軽い現在');project.projectId=heavyHistoryId(1);
 const {history:_history,...before}=project;
 const entities=Array.from({length:10},(_,index)=>{
  const entity=createEntity(project.projectId,'note',index===9?'小さい照合対象':`過去の長文${index}`);
  entity.id=heavyHistoryId(10+index);entity.createdAt=entity.updatedAt='2026-10-17T00:00:00.000Z';
  entity.data.body=[{id:heavyHistoryId(30+index),kind:'paragraph',text:index===9?'本文一致の独立期待😀':String(index).repeat(500000)}];return entity;
 });
 const heavy:ContentState={...before,revision:'1',entities},current:ContentState={...before,revision:'2'};
 return {...current,history:[
  {operationId:heavyHistoryId(2),projectId:project.projectId,baseRevision:'0',revision:'1',createdAt:'2026-10-17T00:00:01.000Z',reason:'ＡＢＣ重い旧稿',targetIds:entities.map(row=>row.id),before,after:heavy},
  {operationId:heavyHistoryId(3),projectId:project.projectId,baseRevision:'1',revision:'2',createdAt:'2026-10-17T00:00:02.000Z',reason:'現在は空の稿',targetIds:entities.map(row=>row.id),before:heavy,after:current},
 ]};
}
