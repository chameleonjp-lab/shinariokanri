import { expect, test } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import { KIND_LABELS } from '../../src/domain/model';
import { inspectScenario } from '../../src/storage/archive';
import { attachGiven, attachObservation, navigate, seed } from './ap04-original-helpers';
import { E07_BOUNDS, buildBoundaryFile, committedBoundary, durableE07, originalE07, restoreBoundaryFile } from './ap04-original-e07-safety-bounds-helpers';

// These ten entrances supplement the SAME original AT-E07. Its whole-archive
// roundtrip, original seven corrupt files, duplicate/ID collision and 1 MiB
// field pair remain in ap04-original-root-restoration-output.spec.ts.
// Neither authored entries nor a subset's success grants original-case credit.
const audit = JSON.parse(await readFile('docs/review-2026-10-11/original_acceptance_audit.json', 'utf8')) as {
  id: string; original_case: { given: string; when: string; then: string; negative_or_edge: string };
}[];
const original = audit.find(row => row.id === 'AT-E07')!.original_case;

for (const bound of E07_BOUNDS) test(`AT-E07 original safety ${bound}: genuine L-1 committed; L+1 refused without author/sync mutation`, async ({ page, browser, baseURL }, info) => {
  test.setTimeout(900_000);
  const source = await originalE07();
  const prepared = await inspectScenario(source.bytes, { worker: false });
  await test.step(`AT-E07 given: ${original.given}`, async () => {
    expect(new Set(prepared.project.entities.map(entity => entity.kind))).toEqual(new Set(Object.keys(KIND_LABELS)));
    expect(prepared.project.entities).toEqual(expect.arrayContaining([
      expect.objectContaining({ kind: 'event', data: expect.objectContaining({ time: expect.objectContaining({ mode: 'unknown' }) }) }),
      expect.objectContaining({ kind: 'event', data: expect.objectContaining({ time: expect.objectContaining({ at: '900719925474099312345' }) }) }),
    ]));
    expect(prepared.assets).toHaveLength(2);
    await attachGiven(info, `AT-E07-${bound}`, source.bytes, { immutableOriginal: source.path, bound, originalClauses: original });
    await seed(page, source.bytes);
    await navigate(page, /^作品・保存/);
    await page.getByRole('tab', { name: '完全保存・復元', exact: true }).click();
  });

  const below = await buildBoundaryFile(bound, -1, info.outputPath(`e07-${bound}-minus-one.scenario`));
  const empty = await browser.newContext({ baseURL });
  let lowerObservation: Awaited<ReturnType<typeof committedBoundary>> | undefined;
  try {
    await test.step(`AT-E07 negative_or_edge: ${original.negative_or_edge} [${bound} L-1: actual complete normal restoration]`, async () => {
      const restored = await empty.newPage();
      await restoreBoundaryFile(restored, below);
      lowerObservation = await committedBoundary(restored, below);
      expect(lowerObservation.header).toEqual({ id: below.project.id, name: below.project.name, entities: below.project.entities, relations: below.project.relations });
      expect(lowerObservation.entities).toBe(below.project.entities);
      expect(lowerObservation.relations).toBe(below.project.relations);
      expect(lowerObservation.snapshots).toBe(below.project.snapshots);
      expect(lowerObservation.views).toBe(below.project.views);
      expect(lowerObservation.worldIds).toEqual([...below.worldIds].sort());
      expect(lowerObservation.noteBlocks).toEqual(below.addedNoteBlocks.map(note => note.count));
      expect(lowerObservation.assets).toEqual(below.assets.map(asset => ({ ...asset, actualHash: asset.contentHash })));
      if (below.addedGroups.lastId) expect(lowerObservation.lastGroup).toEqual({ id: below.addedGroups.lastId, name: below.addedGroups.lastName, kind: 'group', groupType: 'category' });
      // The first normal restore must commit; a mere inspected heading is insufficient.
      await attachObservation(info, `AT-E07-${bound}-below-committed`, { fixture: below, committed: lowerObservation });
    });
  } finally { await empty.close(); }

  const above = await buildBoundaryFile(bound, 1, info.outputPath(`e07-${bound}-plus-one.scenario`));
  await test.step(`AT-E07 then: ${original.then} [${bound} L+1: exact quota reason; all author/sync tables unchanged]`, async () => {
    const before = await durableE07(page);
    await page.getByLabel('保存ファイルを選ぶ', { exact: true }).setInputFiles(above.path);
    const error = page.locator('.backup-page').getByRole('alert');
    await expect(error).toContainText(above.expectedReason, { timeout: 300_000 });
    if (above.expectedPath) await expect(error).toContainText(above.expectedPath);
    await expect(page.locator('.backup-page .import-preview')).toHaveCount(0);
    const after = await durableE07(page);
    expect(after).toEqual(before);
    await attachObservation(info, `AT-E07-${bound}-above-rejected`, { fixture: above, uiError: await error.innerText(), before, after });
  });
  await attachObservation(info, `AT-E07-${bound}-scope`, {
    originalCase: 'AT-E07', originalClauses: original,
    actualPairs: { below: { actual: below.actual, sha256: below.sha256 }, above: { actual: above.actual, sha256: above.sha256 } },
    testedScope: 'original negative_or_edge safety-bound pair; real empty-context lower restoration; existing-work upper immutability',
    requiredCompanion: 'ap04-original-root-restoration-output.spec.ts full given/when/then, original seven negatives and fieldBytes L±1',
    caseResult: 'not_inferred_from_this_boundary_entrance',
    remainingEnvironment: ['actual operating-system Files/device handoff'],
  });
});
