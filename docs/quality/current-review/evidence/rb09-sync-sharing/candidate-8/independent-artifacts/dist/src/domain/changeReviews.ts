import { KIND_LABELS, RELATION_LABELS, collectReferences, createEntity, textToRichText } from './model';
import type { Entity, ID, ProjectData } from './types';

const GENERATED_BY_KEY = 'changeReview.generatedBy';
const GENERATED_KEY = 'changeReview.key';
const GENERATED_SOURCE_IDS_KEY = 'changeReview.sourceIds';
const GENERATED_SOURCE_REVISIONS_KEY = 'changeReview.sourceRevisions';
const GENERATED_PROJECT_REVISION_KEY = 'changeReview.projectRevision';
const GENERATED_PATHS_KEY = 'changeReview.paths';
const GENERATED_BY = 'semantic-change-review/v1';

const NON_CONTENT_KINDS = new Set<Entity['kind']>([
  'collection', 'review', 'snapshot', 'checkpoint', 'trace', 'projection_profile', 'production_task', 'template',
]);
const NON_REVIEW_TARGET_KINDS = new Set<Entity['kind']>([
  'collection', 'review', 'snapshot', 'checkpoint', 'trace', 'projection_profile', 'production_task', 'template',
]);
const NON_MEANINGFUL_RELATION_TYPES = new Set(['reference']);

interface SourceChange {
  source: Entity;
  sourceRevision: string;
}

interface SourceImpact extends SourceChange {
  directPaths: string[];
  relationLabels: string[];
}

function nextRevision(revision: string): string {
  try { return (BigInt(revision) + 1n).toString(); }
  catch { return revision; }
}

function stable(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stable).join(',')}]`;
  return `{${Object.entries(value as Record<string, unknown>).filter(([, item]) => item !== undefined).sort(([a], [b]) => a.localeCompare(b)).map(([key, item]) => `${JSON.stringify(key)}:${stable(item)}`).join(',')}}`;
}

function semanticState(entity: Entity, deleted: boolean): string | undefined {
  if (NON_CONTENT_KINDS.has(entity.kind)) return undefined;
  if (entity.kind === 'group' && entity.data.groupType === 'category') return undefined;
  const data = { ...(entity.data as unknown as Record<string, unknown>) };
  if (entity.kind === 'character' || entity.kind === 'place' || entity.kind === 'lore') {
    // Search metadata and author-chosen spellings update names automatically through IDs.
    delete data.reading;
    delete data.aliases;
  }
  if (entity.kind === 'localization' || entity.kind === 'recording') {
    delete data.stage;
    delete data.reviewedBy;
  }
  if (entity.kind === 'media_variant') delete data.needsReview;
  if (entity.kind === 'attachment') {
    delete data.displayName;
    delete data.licenseNote;
    delete data.byteSize;
  }
  if (entity.kind === 'source') delete data.accessedAt;
  return stable({ deleted, data, customValues: entity.customValues });
}

function active(entity: Entity | undefined): entity is Entity {
  return !!entity && !entity.deletedAt;
}

function detectSourceChanges(before: ProjectData, candidate: ProjectData): SourceChange[] {
  const nextById = new Map(candidate.entities.map(entity => [entity.id, entity]));
  const result: SourceChange[] = [];
  for (const previous of before.entities) {
    const next = nextById.get(previous.id);
    if (previous.deletedAt && (!next || next.deletedAt)) continue;
    if (next === previous) continue;
    if (next && next.kind !== previous.kind) continue;
    const oldState = semanticState(previous, !!previous.deletedAt);
    const newState = next
      ? semanticState(next, !!next.deletedAt)
      : semanticState(previous, true);
    if (!oldState || !newState || oldState === newState) continue;
    result.push({ source: next ?? previous, sourceRevision: nextRevision(previous.revision) });
  }
  return result;
}

function reviewableTarget(entity: Entity): boolean {
  if (entity.deletedAt || NON_REVIEW_TARGET_KINDS.has(entity.kind)) return false;
  return !(entity.kind === 'group' && entity.data.groupType === 'category');
}

function pinnedReferencePaths(value: unknown, projectId: ID, path = 'data'): string[] {
  if (!value || typeof value !== 'object') return [];
  if (Array.isArray(value)) return value.flatMap((item, index) => pinnedReferencePaths(item, projectId, `${path}[${index}]`));
  const record = value as Record<string, unknown>;
  if (typeof record.entityId === 'string' && typeof record.sourceVersionId === 'string' && record.sourceVersionId !== projectId) return [path];
  return Object.entries(record).flatMap(([key, item]) => pinnedReferencePaths(item, projectId, `${path}.${key}`));
}

function generatedKey(targetId: ID, impacts: SourceImpact[]): string {
  return stable({
    targetId,
    sources: impacts.map(impact => ({
      id: impact.source.id,
      revision: impact.sourceRevision,
      directPaths: [...new Set(impact.directPaths)].sort(),
      relationLabels: [...new Set(impact.relationLabels)].sort(),
    })).sort((a, b) => a.id.localeCompare(b.id)),
  });
}

function sourceText(impact: SourceImpact): string {
  const { source, sourceRevision, directPaths, relationLabels } = impact;
  const causes: string[] = [];
  if (directPaths.length) causes.push(`IDで直接参照しています（${[...new Set(directPaths)].sort().join('、')}）`);
  if (relationLabels.length) causes.push(`作者が設定した関係「${[...new Set(relationLabels)].sort().join('・')}」でつながっています`);
  return `変更元: ${KIND_LABELS[source.kind]}「${source.name || '無題'}」 (${source.id})。改訂 ${source.revision} → ${sourceRevision}。${causes.join('。')}`;
}

function existingGeneratedKeys(project: ProjectData): Set<string> {
  return new Set(project.entities.flatMap(entity => entity.kind === 'review' && !entity.deletedAt
    && entity.customValues[GENERATED_BY_KEY] === GENERATED_BY
    && typeof entity.customValues[GENERATED_KEY] === 'string'
    ? [entity.customValues[GENERATED_KEY] as string]
    : []));
}

/**
 * Adds private, open review records for semantic changes that touch existing content.
 * The records cite direct ID references separately from author-declared relation edges;
 * they suggest a human check and never rewrite the affected content.
 */
export function addChangeReviews(before: ProjectData, candidate: ProjectData): ProjectData {
  if (before.projectId !== candidate.projectId) return candidate;
  const changes = detectSourceChanges(before, candidate);
  if (!changes.length) return candidate;

  const targets = candidate.entities.filter(reviewableTarget);
  const targetById = new Map(targets.map(entity => [entity.id, entity]));
  const impactsByTarget = new Map<ID, Map<ID, SourceImpact>>();
  const changesById = new Map(changes.map(change => [change.source.id, change]));
  // Build the changed-ID reverse index in one pass. A full project edit should
  // cost O(all references), not O(changed entities × all entities).
  for (const target of targets) {
    const directPathsBySource = new Map<ID, Set<string>>();
    const pinnedPaths = pinnedReferencePaths(target.data, candidate.projectId);
    for (const reference of collectReferences(target)) {
      if (pinnedPaths.some(path => reference.path === path || reference.path.startsWith(path + "."))) continue;
      const change = changesById.get(reference.id);
      if (!change || target.id === change.source.id) continue;
      const paths = directPathsBySource.get(reference.id) ?? new Set<string>();
      paths.add(reference.path);
      directPathsBySource.set(reference.id, paths);
    }
    if (!directPathsBySource.size) continue;
    const bySource = impactsByTarget.get(target.id) ?? new Map<ID, SourceImpact>();
    for (const [sourceId, directPaths] of directPathsBySource) {
      const change = changesById.get(sourceId)!;
      bySource.set(sourceId, { ...change, directPaths: [...directPaths], relationLabels: [] });
    }
    impactsByTarget.set(target.id, bySource);
  }

  for (const relation of candidate.relations) {
    if (relation.deletedAt || relation.status === 'rejected' || NON_MEANINGFUL_RELATION_TYPES.has(relation.relationType)) continue;
    for (const sourceId of new Set([relation.fromId, relation.toId].filter(id => changesById.has(id)))) {
      const targetId = relation.fromId === sourceId ? relation.toId : relation.fromId;
      const target = targetById.get(targetId), change = changesById.get(sourceId);
      if (!target || !change || target.id === sourceId) continue;
      const bySource = impactsByTarget.get(target.id) ?? new Map<ID, SourceImpact>();
      const impact = bySource.get(sourceId) ?? { ...change, directPaths: [], relationLabels: [] };
      impact.relationLabels.push(RELATION_LABELS[relation.relationType] ?? relation.relationType);
      bySource.set(sourceId, impact);
      impactsByTarget.set(target.id, bySource);
    }
  }

  const knownKeys = existingGeneratedKeys(candidate);
  const nextProjectRevision = nextRevision(candidate.revision);
  const reviews: Entity<'review'>[] = [];
  for (const [targetId, sources] of impactsByTarget) {
    const target = targetById.get(targetId);
    if (!target) continue;
    const impacts = [...sources.values()].sort((a, b) => a.source.id.localeCompare(b.source.id));
    const key = generatedKey(target.id, impacts);
    if (knownKeys.has(key)) continue;
    knownKeys.add(key);
    const details = impacts.map(sourceText);
    const body = [
      `「${target.name || KIND_LABELS[target.kind]}」に関係する情報が変更されました。内容への影響を確認してください。`,
      ...details,
      `確認対象の作品改訂: ${candidate.revision} → ${nextProjectRevision}。候補は人による確認用です。本文や設定は自動変更していません。`,
    ].join('\n');
    const review = createEntity(candidate.projectId, 'review', `変更確認: ${target.name || KIND_LABELS[target.kind]}`, {
      target: target.id,
      targetVersionId: candidate.projectId,
      body: textToRichText(body),
      stage: 'open',
      quotedText: null,
      resolution: [],
    });
    review.status = 'needs_review';
    review.visibility = 'private';
    review.customValues = {
      ...review.customValues,
      [GENERATED_BY_KEY]: GENERATED_BY,
      [GENERATED_KEY]: key,
      [GENERATED_SOURCE_IDS_KEY]: JSON.stringify(impacts.map(impact => impact.source.id)),
      [GENERATED_SOURCE_REVISIONS_KEY]: JSON.stringify(Object.fromEntries(impacts.map(impact => [impact.source.id, impact.sourceRevision]))),
      [GENERATED_PROJECT_REVISION_KEY]: nextProjectRevision,
      [GENERATED_PATHS_KEY]: JSON.stringify(Object.fromEntries(impacts.map(impact => [impact.source.id, {
        directPaths: [...new Set(impact.directPaths)].sort(),
        relationLabels: [...new Set(impact.relationLabels)].sort(),
      }]))),
    };
    reviews.push(review);
  }

  return reviews.length ? { ...candidate, entities: [...candidate.entities, ...reviews] } : candidate;
}
