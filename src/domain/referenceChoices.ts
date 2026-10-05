import { KIND_LABELS, type DomainReference } from './model';
import type { EntityKind, ProjectData } from './types';
export type ReferenceScope = DomainReference['scope'];
export interface ReferenceChoice { id: string; label: string }
export interface ReferenceOptions { versionId?: string; includeArchived?: boolean }

/** A pin resolves against captured content; an unavailable pin never falls back to current records. */
export function referenceProject(project: ProjectData, versionId?: string): ProjectData | undefined {
  if (!versionId || versionId === project.projectId) return project;
  const snapshot = project.snapshots.find(snapshot => snapshot.id === versionId);
  return snapshot ? { ...project, ...snapshot.content, snapshots: project.snapshots, history: project.history } : undefined;
}

export function referenceChoices(project: ProjectData, scope: ReferenceScope = 'entity', kinds?: readonly EntityKind[], options: ReferenceOptions = {}): ReferenceChoice[] {
  const source = scope === 'snapshot' ? project : referenceProject(project, options.versionId);
  if (!source) return [];
  const active = source.entities.filter(entity => options.includeArchived || !entity.deletedAt);
  const entities = active.filter(entity => !kinds?.length || kinds.includes(entity.kind)).map(entity => ({ id: entity.id, label: `${entity.name || '無題'} · ${KIND_LABELS[entity.kind]}` }));
  const names = new Map(active.map(entity => [entity.id, entity.name]));
  const relations = ['relation', 'record', 'projection_record'].includes(scope) ? source.relations.filter(relation => options.includeArchived || !relation.deletedAt).map(relation => ({ id: relation.id, label: `${relation.relationType} · ${names.get(relation.fromId) ?? '不明'} → ${names.get(relation.toId) ?? '不明'}` })) : [];
  const blocks: ReferenceChoice[] = [], aliases: ReferenceChoice[] = [], triggers: ReferenceChoice[] = [];
  const walk = (value: unknown, name: string) => {
    if (Array.isArray(value)) { value.forEach(child => walk(child, name)); return; }
    if (!value || typeof value !== 'object') return;
    const object = value as Record<string, unknown>;
    if (typeof object.id === 'string' && typeof object.text === 'string') {
      if (['paragraph', 'heading', 'list_item', 'quote'].includes(String(object.kind))) blocks.push({ id: object.id, label: `${name} · ${object.text.slice(0, 40)}` });
      else if (typeof object.isPublicDefault === 'boolean') aliases.push({ id: object.id, label: `${name} · 別名 ${object.text}` });
    }
    Object.values(object).forEach(child => walk(child, name));
  };
  if (['block', 'alias', 'presentation', 'projection_record'].includes(scope)) active.forEach(entity => walk(entity.data, entity.name));
  if (scope === 'projection_record') for (const entity of active) if (entity.kind === 'flow_node' && entity.data.trigger?.id) triggers.push({ id: entity.data.trigger.id, label: `${entity.name} · 起動条件` });
  let choices: ReferenceChoice[];
  switch (scope) {
    case 'calendar': choices = source.calendars.map(calendar => ({ id: calendar.id, label: calendar.name })); break;
    case 'project': choices = [{ id: source.projectId, label: source.name }, ...source.worldReferences.map(world => ({ id: world.projectId, label: '参照する共通世界' }))]; break;
    case 'snapshot': choices = [{ id: project.projectId, label: '現在の作品版' }, ...project.snapshots.map(snapshot => ({ id: snapshot.id, label: `固定版 · ${snapshot.versionLabel}` })), ...active.filter(entity => entity.kind === 'snapshot').map(entity => ({ id: entity.id, label: `固定版 · ${entity.name}` })), ...project.worldReferences.map(world => ({ id: world.immutableSnapshotId, label: '固定した共通世界版' }))]; break;
    case 'relation': choices = relations; break;
    case 'record': choices = [...entities, ...relations]; break;
    case 'projection_record': choices = [...entities, ...relations, ...blocks, ...triggers]; break;
    case 'presentation': choices = [...entities, ...blocks]; break;
    case 'block': choices = blocks; break;
    case 'alias': choices = aliases; break;
    case 'identity': choices = []; break;
    default: choices = entities;
  }
  return [...new Map(choices.map(choice => [choice.id, choice])).values()];
}
