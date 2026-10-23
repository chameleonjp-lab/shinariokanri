import { describe, expect, it } from 'vitest';
import { createAdventureSampleProject } from './adventureSample';
import { addAdventureRuntimeProfile, ADVENTURE_RUNTIME_PROFILE, ADVENTURE_PRODUCTION_PROFILE } from './adventureSampleProjection';
import { exportProject } from './exports';
import { getEntitiesByKind } from './model';
import { getTrialChoices, startTrial, stepTrial } from './runtime';
import type { ProjectData } from './types';

describe('adventure sample production projection', () => {
  it('exports executable stories, original assets, translations and production plans without author records', async () => {
    const sample = await createAdventureSampleProject();
    const project = addAdventureRuntimeProfile(sample.project);
    const assetBytes = Object.fromEntries(sample.assets.map(asset => [asset.contentHash, asset.bytes]));
    for (const profile of ['runtime_json', 'playable_preview', 'localization', 'production'] as const) {
      const policyName = ['localization', 'production'].includes(profile) ? ADVENTURE_PRODUCTION_PROFILE : ADVENTURE_RUNTIME_PROFILE;
      const policy = getEntitiesByKind(project, 'projection_profile').find(entity => entity.name === policyName)!;
      const output = await exportProject(project, { profile, projectionProfileId: policy.id, targetRevision: project.revision, assetBytes });
      expect(output.ok, `${profile}: ${JSON.stringify(output.ok ? {} : output.issues)}`).toBe(true);
      if (!output.ok) continue;
      expect(output.preview.assetBytesIncluded).toBe(true);
      if (profile === 'runtime_json') {
        const runtime = JSON.parse(output.artifacts[0].content);
        expect(runtime.flow.graphs).toHaveLength(2);
        expect(runtime.scenes).toHaveLength(12);
        expect(runtime.externalEvidence).toBe('not_included');
        expect(runtime.entities.some((entity: { kind: string }) => ['checkpoint', 'trace', 'review', 'snapshot', 'note'].includes(entity.kind))).toBe(false);
        expect(JSON.stringify(runtime)).not.toContain('この場面の役割');
        const executable = runtime.runtimeProject as ProjectData;
        const mainGraph = getEntitiesByKind(executable, 'flow_graph').find(entity => entity.name === '全3章・星還りの旅')!;
        let session = startTrial(executable, { entryId: mainGraph.data.entryIds[0] });
        for (let step = 0; session.status === 'ready' && step < 30; step++) {
          const next = getTrialChoices(executable, session).find(choice => choice.result === 'true');
          session = stepTrial(executable, session, next ? { edgeId: next.edgeId } : {});
        }
        expect(session.status, JSON.stringify(session.issues)).toBe('terminal');
      }
      if (profile === 'localization' || profile === 'production') {
        const payload = JSON.parse(output.artifacts[0].content);
        expect(payload.lines.flatMap((line: { translations: unknown[] }) => line.translations)).toHaveLength(4);
        if (profile === 'production') expect(payload.tasks.length).toBeGreaterThan(0);
      }
      if (profile === 'playable_preview') expect(output.artifacts[0].bytes!.length).toBeGreaterThan(0);
    }
  }, 30000);
});
