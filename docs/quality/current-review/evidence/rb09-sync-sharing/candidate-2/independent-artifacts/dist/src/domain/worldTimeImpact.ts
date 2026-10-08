import type { Entity, ID, ProjectData, Tick } from './types';
import { collectReferences } from './model';
import { parseTick, type TimeResolution } from './time';
import { characterTimeSummary, resolveEventTimes, type CharacterTimeSummary, type TimeEditImpact } from './timeEditing';
import { assertionValueLabel, createWorldAssessment, WORLD_PREDICATES, type WorldPoint } from './world';
import { inspectWorldCandidates, type WorldCheckCandidate } from './worldCheck';

export interface LifeTimeSample { at: Tick; life: CharacterTimeSummary; memberships: string[]; uncertainMembership: boolean }
export interface WorldTimeLifeImpact { eventId: ID; characterId: ID; before: LifeTimeSample[]; after: LifeTimeSample[] }
export interface WorldTimeConsequences { lives: WorldTimeLifeImpact[]; linkedIds: ID[]; fixedSnapshotIds: ID[]; newCandidates: WorldCheckCandidate[]; resolvedCandidates: WorldCheckCandidate[]; complete: boolean }
function sampleTicks(time: TimeResolution | undefined): Tick[] {
  if (time?.status !== 'resolved') return [];
  const last = time.mode === 'interval' ? (parseTick(time.endLatest) - 1n).toString() : time.endLatest;
  return [...new Set([time.earliest, last])];
}
/** Review changes to known ages/state and evidence; missing dates remain empty/unknown. */
export function worldTimeConsequences(before: ProjectData, after: ProjectData, impacts: TimeEditImpact[], point: WorldPoint = {}): WorldTimeConsequences {
  const oldIndex = new Map(before.entities.map(entity => [entity.id, entity])), nextIndex = new Map(after.entities.map(entity => [entity.id, entity]));
  const oldEvents = before.entities.filter((entity): entity is Entity<'event'> => entity.kind === 'event' && !entity.deletedAt), nextEvents = after.entities.filter((entity): entity is Entity<'event'> => entity.kind === 'event' && !entity.deletedAt);
  const oldTimes = resolveEventTimes(oldEvents), nextTimes = resolveEventTimes(nextEvents), oldAssessment = createWorldAssessment(before, point), nextAssessment = createWorldAssessment(after, point);
  const lives: WorldTimeLifeImpact[] = [];
  const samples = (character: Entity<'character'>, time: TimeResolution, project: ProjectData, events: Entity<'event'>[], times: Map<ID, TimeResolution>, assessment: ReturnType<typeof createWorldAssessment>, index: Map<ID, Entity>): LifeTimeSample[] => sampleTicks(time).map(at => {
    const calendar = time.status === 'resolved' ? project.calendars.find(item => item.id === time.calendarId) : undefined, membership = assessment.stateCandidates(character.id, WORLD_PREDICATES.membership, undefined, { ...point, at });
    return { at, life: calendar ? characterTimeSummary(character, at, calendar, events, times) : { age: '年齢不明', state: 'unknown', reason: '暦の対応が未登録です。' }, memberships: membership.candidates.map(candidate => assertionValueLabel(candidate.assertion.data.value, index)), uncertainMembership: membership.status !== 'known' };
  });
  for (const impact of impacts) {
    const old = oldIndex.get(impact.eventId), next = nextIndex.get(impact.eventId);
    if (old?.kind !== 'event' || next?.kind !== 'event') continue;
    for (const id of new Set([...(old.data.participants ?? []), ...(next.data.participants ?? [])].map(participant => participant.characterId))) {
      const a = oldIndex.get(id), b = nextIndex.get(id); if (a?.kind !== 'character' || b?.kind !== 'character') continue;
      const oldSamples = samples(a, impact.before, before, oldEvents, oldTimes, oldAssessment, oldIndex), nextSamples = samples(b, impact.after, after, nextEvents, nextTimes, nextAssessment, nextIndex);
      if (JSON.stringify(oldSamples) !== JSON.stringify(nextSamples)) lives.push({ eventId: impact.eventId, characterId: id, before: oldSamples, after: nextSamples });
    }
  }
  const changed = new Set(impacts.map(impact => impact.eventId)), linkedIds = before.entities.filter(entity => !entity.deletedAt && !changed.has(entity.id) && collectReferences(entity).some(reference => changed.has(reference.id))).map(entity => entity.id);
  const fixedSnapshotIds = before.snapshots.filter(snapshot => snapshot.content.entities.some(entity => changed.has(entity.id))).map(snapshot => snapshot.id);
  const oldReport = inspectWorldCandidates(before, point), nextReport = inspectWorldCandidates(after, point), oldCandidates = new Map(oldReport.candidates.map(candidate => [candidate.id, candidate])), nextCandidates = new Map(nextReport.candidates.map(candidate => [candidate.id, candidate]));
  const altered = (a: WorldCheckCandidate | undefined, b: WorldCheckCandidate) => !a || JSON.stringify(a) !== JSON.stringify(b);
  return { lives, linkedIds, fixedSnapshotIds, newCandidates: nextReport.candidates.filter(candidate => altered(oldCandidates.get(candidate.id), candidate)), resolvedCandidates: oldReport.candidates.filter(candidate => !nextCandidates.has(candidate.id)), complete: oldReport.complete && nextReport.complete };
}
