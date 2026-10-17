/** Synthetic edge cases shared by NEW P2-02 tests only; no acceptance fixture changes. */
import { createEntity, createProject, emptyValidity } from '../../src/domain/model';
import type { ProjectData } from '../../src/domain/types';
import type { ReferenceScope } from '../../src/domain/referenceChoices';

export const referenceScopes: ReferenceScope[] = ['entity', 'relation', 'record', 'projection_record', 'presentation', 'block', 'alias', 'snapshot', 'project', 'calendar', 'identity'];
export function referenceEdgeProject(): ProjectData {
  const project = createProject('Current project');
  project.projectId = 'project';
  project.calendars[0].id = 'calendar'; project.calendars[0].name = 'Calendar';
  project.worldReferences = [{ projectId: 'world', immutableSnapshotId: 'world-pin', contentHash: 'a'.repeat(64) }];
  const a = createEntity('project', 'character', 'Same', { aliases: [{ id: 'alias', text: 'AKA', reading: '', validity: emptyValidity(), audienceHolderIds: [], isPublicDefault: true }] }); a.id = 'a';
  const b = createEntity('project', 'character', 'Same'); b.id = 'b';
  const note = createEntity('project', 'note', '', { body: [{ id: 'block', kind: 'paragraph', text: 'x'.repeat(45) }, { id: 'heading', kind: 'heading', text: 'Heading' }, { id: 'list', kind: 'list_item', text: 'List' }, { id: 'quote', kind: 'quote', text: 'Quote' }] }); note.id = 'note';
  const flow = createEntity('project', 'flow_node', 'Flow', { trigger: { id: 'trigger', event: 'manual', eventKey: 'open', repeat: 'once' } }); flow.id = 'flow';
  const profile = createEntity('project', 'projection_profile', 'Policy', { publicTexts: { a: { body: [{ id: 'public', kind: 'paragraph', text: 'Public' }] } } }); profile.id = 'policy';
  const snapshot = createEntity('project', 'snapshot', 'Authored pin'); snapshot.id = 'authored-pin';
  const archived = createEntity('project', 'note', 'Archived', { body: [{ id: 'archived-block', kind: 'quote', text: 'Hidden' }] }); archived.id = 'archived'; archived.deletedAt = '2026-10-17T00:00:00Z';
  project.entities = [a, b, note, flow, profile, snapshot, archived];
  project.relations = [{ id: 'relation', projectId: 'project', revision: '0', fromId: 'a', toId: 'archived', relationType: 'trust', direction: 'forward', evidenceIds: [], validity: emptyValidity(), status: 'confirmed', visibility: 'private' }];
  project.relations.push({ ...project.relations[0], id: 'archived-relation', fromId: 'b', toId: 'absent', deletedAt: '2026-10-17T00:00:00Z' });
  const { snapshots: _snapshots, history: _history, ...content } = structuredClone(project);
  content.name = 'Pinned project'; content.entities[0].name = 'Before';
  project.snapshots = [{ id: 'pin', content, contentHash: 'b'.repeat(64), createdAt: '2026-10-17T00:00:00Z', versionLabel: 'Captured' }];
  profile.data.publicTexts = { a: { body: [{ id: 'current-public', kind: 'paragraph', text: 'Current public' }] } };
  return project;
}
