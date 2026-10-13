import { expect, test, type Page, type TestInfo } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import { createEntity, createProject, emptyValidity, newId, textToRichText, validateProject } from '../../src/domain/model';
import type { Entity, EntityDataMap, EntityKind, ProjectData, Relation } from '../../src/domain/types';
import { exportScenario } from '../../src/storage/archive';
import { attachGiven, attachObservation, authorFingerprint, backup, editData, navigate, openEntity, seed } from './ap04-original-helpers';
export { attachGiven, attachObservation, authorFingerprint, backup, editData, navigate, openEntity, seed };

type Original = { id: string; given: string; when: string; then: string; negative_or_edge: string };
const originals = JSON.parse(await readFile('docs/review-2026-10-11/original_acceptance_audit.json', 'utf8')) as { id: string; original_case: Original }[];
export async function clause(id: string, name: 'given' | 'when' | 'then' | 'negative_or_edge', action: () => Promise<void>) {
  const original = originals.find(row => row.id === id)?.original_case;
  if (!original) throw new Error(`原ケースがありません: ${id}`);
  await test.step(`${id} ${name}: ${original[name]}`, action);
}
export async function given(page: Page, info: TestInfo, id: string, project: ProjectData) {
  const validation = validateProject(project);
  if (!validation.ok) throw new Error(JSON.stringify(validation.issues));
  const bytes = await exportScenario(project);
  await attachGiven(info, id, bytes, { projectId: project.projectId, entityIds: project.entities.map(e => ({ id: e.id, kind: e.kind, name: e.name })), relations: project.relations });
  await seed(page, bytes);
}
export async function timeline(page: Page) {
  await navigate(page, /^年表/);
  await page.getByRole('tab', { name: '世界内年表', exact: true }).click();
}
export async function graph(page: Page) {
  await navigate(page, /^年表/);
  await page.getByRole('tab', { name: '関係表・図', exact: true }).click();
  await page.getByRole('button', { name: '関係図', exact: true }).click();
}
export async function sceneStructure(page: Page) {
  await navigate(page, /^構成/);
  await page.getByRole('tab', { name: '章・本文', exact: true }).click();
}
export async function reader(page: Page) {
  await navigate(page, /^構成/);
  await page.getByRole('tab', { name: '試読・検査', exact: true }).click();
}
export async function worldHistory(page: Page) {
  await navigate(page, /^年表/);
  await page.getByRole('tab', { name: '世界・地図・履歴', exact: true }).click();
  await page.getByRole('tab', { name: '状態・生涯・履歴', exact: true }).click();
}
export function entity<K extends EntityKind>(p: ProjectData, kind: K, name: string, data: Partial<EntityDataMap[K]> = {}): Entity<K> {
  const record = createEntity(p.projectId, kind, name, data);
  record.status = 'confirmed'; p.entities.push(record); return record;
}
export function relation(p: ProjectData, fromId: string, toId: string, relationType = 'related'): Relation {
  const row: Relation = { id: newId(), projectId: p.projectId, revision: '0', fromId, toId, relationType, direction: 'forward', validity: emptyValidity(), evidenceIds: [], status: 'confirmed', visibility: 'private' };
  p.relations.push(row); return row;
}
export function timelineFixture(title: string) {
  const p = createProject(title), a = entity(p, 'character', '年表の人物A'), b = entity(p, 'character', '年表の人物B');
  const common = entity(p, 'event', '共通だけの出来事', { time: { mode: 'instant', at: '-20', calendarId: p.calendarId }, laneRole: 'common', participants: [] });
  const shared = entity(p, 'event', '二人が関わる出来事', { time: { mode: 'instant', at: '20', calendarId: p.calendarId }, laneRole: 'both', participants: [{ characterId: a.id, role: 'actor' }, { characterId: b.id, role: 'witness' }], summary: textToRichText('参加と知識は別。') });
  return { p, a, b, common, shared };
}
export function findEntity<K extends EntityKind>(p: ProjectData, id: string, kind: K): Entity<K> {
  const row = p.entities.find((e): e is Entity<K> => e.id === id && e.kind === kind);
  if (!row) throw new Error(`情報がありません: ${kind} ${id}`); return row;
}
