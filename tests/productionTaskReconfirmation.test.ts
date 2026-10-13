import { describe, expect, it } from 'vitest';
import { createEntity, createProject, textToRichText } from '../src/domain/model';
import { dialogueContentHash, reconcileDeliverables } from '../src/domain/production';
import type { ProjectData } from '../src/domain/types';

function fixture() {
  const p = createProject('制作タスクの明示再確認');
  const line = createEntity(p.projectId, 'dialogue_line', '確認する原文', { text: textToRichText('変更前の本文。') });
  const scene = createEntity(p.projectId, 'scene', '確認する場面', { body: textToRichText('変更前の場面。'), dialogueLineIds: [line.id] });
  const writing = createEntity(p.projectId, 'production_task', '執筆の再確認', { targetIds: [scene.id], stage: 'writing', progress: 'needs_review' });
  const implementation = createEntity(p.projectId, 'production_task', '後続の実装', { targetIds: [scene.id], stage: 'implementation', progress: 'done', dependsOn: [writing.id] });
  p.entities.push(line, scene, writing, implementation); p.entities.forEach(row => { row.status = 'confirmed'; });
  return { p, line, scene, writing, implementation };
}
function taskProgress(project: ProjectData, id: string) {
  const row = project.entities.find(entity => entity.id === id);
  if (!row || row.kind !== 'production_task') throw Error('制作タスクがありません');
  return row.data.progress;
}

describe('production task reconfirmation boundaries', () => {
  it('retains an explicit reviewed task completion and invalidates its downstream task', async () => {
    const { p, writing, implementation } = fixture(), candidate = structuredClone(p);
    const row = candidate.entities.find(entity => entity.id === writing.id)!; if (row.kind !== 'production_task') throw Error('型違い'); row.data.progress = 'done';
    const next = await reconcileDeliverables(p, candidate);
    expect(taskProgress(next, writing.id)).toBe('done'); expect(taskProgress(next, implementation.id)).toBe('needs_review');
    expect(p.entities.find(entity => entity.id === writing.id)).toEqual(writing);
  });
  it.each([false, true])('rejects completion made in the same atomic save as an actual source change, reverse source order=%s', async reverse => {
    const { p, scene, writing, implementation } = fixture(), candidate = structuredClone(p);
    const row = candidate.entities.find(entity => entity.id === writing.id)!; if (row.kind !== 'production_task') throw Error('型違い'); row.data.progress = 'done';
    const source = candidate.entities.find(entity => entity.id === scene.id)!; if (source.kind !== 'scene') throw Error('型違い'); source.data.body = textToRichText('同じ保存で変更された場面。');
    if (reverse) candidate.entities.reverse();
    const next = await reconcileDeliverables(p, candidate);
    expect(taskProgress(next, writing.id)).toBe('needs_review'); expect(taskProgress(next, implementation.id)).toBe('needs_review');
  });
  it('propagates a changed source through writing and implementation dependencies', async () => {
    const { p, line, writing, implementation } = fixture(), candidate = structuredClone(p);
    const old = p.entities.find(entity => entity.id === writing.id)!; if (old.kind !== 'production_task') throw Error('型違い'); old.data.progress = 'done';
    const row = candidate.entities.find(entity => entity.id === writing.id)!; if (row.kind !== 'production_task') throw Error('型違い'); row.data.progress = 'done';
    const source = candidate.entities.find(entity => entity.id === line.id)!; if (source.kind !== 'dialogue_line') throw Error('型違い'); source.data.text = textToRichText('変更された原文。');
    const next = await reconcileDeliverables(p, candidate);
    expect(taskProgress(next, writing.id)).toBe('needs_review'); expect(taskProgress(next, implementation.id)).toBe('needs_review');
  });
  it('keeps stale translation and recording approvals subject to original source hash checks', async () => {
    const { p, line, writing } = fixture(), sourceHash = await dialogueContentHash(p, line);
    const translation = createEntity(p.projectId, 'localization', '以前の原文の翻訳', { sourceLineId: line.id, language: 'en', sourceHash, text: textToRichText('Old translation'), stage: 'needs_review' });
    const recording = createEntity(p.projectId, 'recording', '以前の原文の収録', { sourceLineId: line.id, language: 'ja', sourceHash, stage: 'needs_review' });
    p.entities.push(translation, recording);
    const candidate = structuredClone(p), source = candidate.entities.find(entity => entity.id === line.id)!; if (source.kind !== 'dialogue_line') throw Error('型違い'); source.data.text = textToRichText('原文を改訂した。');
    for (const row of candidate.entities) {
      if (row.id === writing.id && row.kind === 'production_task') row.data.progress = 'done';
      if (row.id === translation.id && row.kind === 'localization') row.data.stage = 'reviewed';
      if (row.id === recording.id && row.kind === 'recording') row.data.stage = 'reviewed';
    }
    const next = await reconcileDeliverables(p, candidate);
    expect(taskProgress(next, writing.id)).toBe('needs_review');
    for (const id of [translation.id, recording.id]) expect(next.entities.find(row => row.id === id)).toMatchObject({ data: { stage: 'needs_review', sourceHash } });
    // Even a later stage-only approval cannot approve the stale content hash.
    const approval = structuredClone(next); for (const row of approval.entities) if ((row.kind === 'localization' || row.kind === 'recording') && [translation.id, recording.id].includes(row.id)) row.data.stage = 'reviewed';
    const checked = await reconcileDeliverables(next, approval); for (const id of [translation.id, recording.id]) expect(checked.entities.find(row => row.id === id)).toMatchObject({ data: { stage: 'needs_review', sourceHash } });
  });
});
