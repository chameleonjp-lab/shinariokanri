import {expect, test, type Page} from '@playwright/test';
import {createHash} from 'node:crypto';
import {readFile} from 'node:fs/promises';
import {defaultData, KIND_LABELS, textToRichText} from '../../src/domain/model';
import {dialogueContentHash} from '../../src/domain/production';
import type {EntityDataMap, EntityKind, ProjectData} from '../../src/domain/types';
import {backup, editData, navigate, openEntity} from './ap04-original-helpers';

export async function rejectNextProjectWrite(page: Page) {
  await page.evaluate(() => {
    const put = IDBObjectStore.prototype.put;
    IDBObjectStore.prototype.put = function(...args: Parameters<IDBObjectStore['put']>) {
      if (this.name === 'projects') {
        IDBObjectStore.prototype.put = put;
        throw new DOMException('phase3 interrupted save fixture', 'QuotaExceededError');
      }
      return put.apply(this, args);
    };
  });
}

async function add<K extends EntityKind>(page: Page, kind: K, name: string, data: Partial<EntityDataMap[K]>) {
  await navigate(page, /^資料/);
  await page.locator('.materials-filter').getByLabel('情報の種類', {exact:true}).selectOption(kind);
  await page.getByRole('button', {name:`${KIND_LABELS[kind]}を追加`, exact:true}).first().click();
  const dialog = page.getByRole('dialog');
  await dialog.getByLabel('名前', {exact:true}).fill(name);
  await dialog.getByRole('button', {name:'編集を始める', exact:true}).click();
  await page.locator('.detail-panel').getByLabel('情報の状態', {exact:true}).selectOption('confirmed');
  await editData(page, {...defaultData(kind), ...data});
  const meta = page.locator('.detail-panel details').filter({has:page.locator('summary').filter({hasText:'IDと履歴情報'})});
  await meta.locator('summary').click();
  return (await meta.locator('dd').first().innerText()).trim();
}

/** Only the missing cross-persona boundaries; original specialist fixtures stay independent. */
export async function connectPersonaHandoffs(page: Page, source: ProjectData, input: {sceneId:string; personId:string; secret:string}) {
  const pin = source.snapshots[0]!;
  expect(pin.content.entities.some(entity => entity.id === input.sceneId)).toBe(true);
  const lineText = '門から必ず戻る。';
  const lineId = await add(page, 'dialogue_line', '同じ場面から渡す台詞', {speakerId:input.personId, text:textToRichText(lineText)});
  const withLine = await backup(page);
  const scene = withLine.project.entities.find(entity => entity.id === input.sceneId)!;
  expect(scene.kind).toBe('scene');
  await openEntity(page, 'scene', scene.name);
  await editData(page, {...scene.data, dialogueLineIds:[lineId]});
  const line = withLine.project.entities.find(entity => entity.id === lineId)!;
  if (line.kind !== 'dialogue_line') throw Error('handoff source line missing');
  const sourceHash = await dialogueContentHash(withLine.project, line);
  const translationId = await add(page, 'localization', '同じ台詞の英訳', {sourceLineId:lineId, sourceHash, language:'en', text:textToRichText('I will return from the gate.'), stage:'draft'});
  await navigate(page, /^作品・保存/);
  await page.getByRole('tab', {name:'作品の設定', exact:true}).click();
  const audioBytes = await readFile('tests/fixtures/media/fixture-tone.wav');
  await page.locator('.project-info').getByLabel('素材ファイルを選ぶ', {exact:true}).setInputFiles({name:'phase3-shared-line.wav', mimeType:'audio/wav', buffer:audioBytes});
  await expect(page.locator('.detail-panel h2')).toHaveText('phase3-shared-line.wav');
  const audioSaved = await backup(page);
  const audio = audioSaved.project.entities.find(entity => entity.kind === 'attachment' && entity.name === 'phase3-shared-line.wav')!;
  if (audio.kind !== 'attachment') throw Error('handoff audio missing');
  expect(audioSaved.assets.find(asset => asset.contentHash === audio.data.contentHash)?.bytes).toEqual(new Uint8Array(audioBytes));
  const recordingId = await add(page, 'recording', '同じ台詞の収録対応', {sourceLineId:lineId, sourceHash, language:'en', translationId, attachmentId:audio.id, stage:'recorded'});
  await openEntity(page, 'localization', '同じ台詞の英訳');
  const approval = page.locator('.production-tools');
  await approval.locator('summary').click();
  await approval.getByRole('button', {name:'現在原文とhashを確認', exact:true}).click();
  await expect(approval).toContainText(sourceHash);
  await approval.getByRole('button', {name:'確認した変更を保存', exact:true}).click();
  await expect(approval.getByRole('status')).toContainText('表示版を確認');

  // World supervision: a derivative keeps the same immutable base and source ID.
  const mediaId = await add(page, 'media_variant', '固定版から渡した小説媒体', {medium:'novel', baseSnapshotId:pin.id, sourceIds:[input.sceneId], body:textToRichText('公開済みの門の本文')});
  const media = page.locator('details').filter({has:page.locator('summary').filter({hasText:'媒体の旧公開版と改訂候補を比較'})});
  await media.locator('summary').click();
  const candidateText = '固定版を残した改訂候補';
  await media.getByLabel('媒体の改訂候補本文', {exact:true}).fill(candidateText);
  await navigate(page, /^構成/);
  await openEntity(page, 'media_variant', '固定版から渡した小説媒体');
  await media.locator('summary').click();
  await expect(media.getByLabel('媒体の改訂候補本文', {exact:true})).toHaveValue(candidateText);
  await media.getByRole('button', {name:'媒体の改訂差分を確認', exact:true}).click();
  await media.getByRole('button', {name:'旧媒体を保持して改訂候補を保存', exact:true}).click();
  await expect(media.getByRole('button', {name:'保存した媒体改訂候補を開く', exact:true})).toBeVisible();

  // Game authoring: record an actual UI trial of the very same scene, no receiver claim.
  const entryId = await add(page, 'flow_node', '共通場面の入口', {nodeType:'entry', sceneId:input.sceneId});
  const terminalId = await add(page, 'flow_node', '共通場面の終端', {nodeType:'terminal', terminalReason:'門の試読完了'});
  const edgeId = await add(page, 'flow_edge', '同じ門を進む', {fromId:entryId, toId:terminalId, label:'同じ門を進む'});
  const graphId = await add(page, 'flow_graph', '共通場面の分岐', {nodeIds:[entryId,terminalId], edgeIds:[edgeId], entryIds:[entryId], exitIds:[terminalId]});
  await navigate(page, /^構成/);
  await page.getByRole('tab', {name:'試読・検査', exact:true}).click();
  await page.getByLabel('試読する作品版', {exact:true}).selectOption('');
  await page.getByLabel('試読の開始点', {exact:true}).selectOption(entryId);
  await page.getByRole('button', {name:/^(試読を始める|この状態から開始し直す)$/}).click();
  await expect(page.locator('.reader-sheet')).toContainText(lineText);
  await page.getByRole('button', {name:'同じ門を進む', exact:true}).click();
  await expect(page.locator('.reader-sheet h2')).toHaveText('共通場面の終端');
  await page.getByRole('button', {name:'一手戻る', exact:true}).click();
  await expect(page.locator('.reader-sheet')).toContainText(lineText);
  await page.getByRole('button', {name:'同じ門を進む', exact:true}).click();
  await page.getByRole('button', {name:'経路を記録', exact:true}).click();
  await expect(page.getByRole('status').filter({hasText:'開始状態と経路を端末内に保存しました'})).toBeVisible();

  // Review handoff: retain real Markdown, version and target selection across interruption.
  await navigate(page, /^作品・保存/);
  await page.getByRole('tab', {name:'目的別出力', exact:true}).click();
  const proposal = Buffer.from('門で約束を確認する別案');
  await test.info().attach('phase3-consultation-input.md', {body:proposal, contentType:'text/markdown'});
  const consultation = page.locator('.consultation-import');
  await consultation.locator('summary').click();
  await consultation.getByLabel('提案の出所', {exact:true}).fill('phase3-proposal.md');
  await consultation.getByLabel('提案の相談対象版', {exact:true}).selectOption(pin.id);
  await consultation.getByLabel('提案を比較する本文対象', {exact:true}).selectOption(input.sceneId);
  await consultation.getByLabel('提案MDを選ぶ', {exact:true}).setInputFiles({name:'phase3-proposal.md', mimeType:'text/markdown', buffer:proposal});
  await expect(consultation.getByLabel('提案Markdown', {exact:true})).toHaveValue(proposal.toString());
  await navigate(page, /^資料/);
  await page.reload();
  await navigate(page, /^作品・保存/);
  await page.getByRole('tab', {name:'目的別出力', exact:true}).click();
  await consultation.locator('summary').click();
  await expect(consultation.getByLabel('提案の出所', {exact:true})).toHaveValue('phase3-proposal.md');
  await expect(consultation.getByLabel('提案の相談対象版', {exact:true})).toHaveValue(pin.id);
  await expect(consultation.getByLabel('提案を比較する本文対象', {exact:true})).toHaveValue(input.sceneId);
  await expect(consultation.getByLabel('提案Markdown', {exact:true})).toHaveValue(proposal.toString());
  await consultation.getByRole('button', {name:'提案の別案差分を確認', exact:true}).click();
  await rejectNextProjectWrite(page);
  await consultation.getByRole('button', {name:'提案を作者別案として保存', exact:true}).click();
  await expect(consultation.getByRole('alert')).toContainText('容量');
  await expect(consultation.getByLabel('提案Markdown', {exact:true})).toHaveValue(proposal.toString());
  await consultation.getByRole('button', {name:'提案を作者別案として保存', exact:true}).click();
  await expect(consultation.getByRole('status')).toContainText('作者別案へ保存');
  return {projectId:source.projectId, sceneId:input.sceneId, pin, lineId, lineText, sourceHash, translationId, recordingId, audioId:audio.id,
    audioHash:audio.data.contentHash, audioSHA256:createHash('sha256').update(audioBytes).digest('hex'), mediaId, candidateText,
    entryId, terminalId, edgeId, graphId, proposal:proposal.toString(), secret:input.secret};
}

export async function assertPersonaHandoffs(saved: Awaited<ReturnType<typeof backup>>, h: Awaited<ReturnType<typeof connectPersonaHandoffs>>) {
  const p = saved.project;
  expect(p.projectId).toBe(h.projectId);
  expect(p.snapshots.find(pin => pin.id === h.pin.id)).toEqual(h.pin);
  expect(p.entities.find(entity => entity.id === h.sceneId)).toMatchObject({data:{dialogueLineIds:[h.lineId]}});
  expect(p.entities.find(entity => entity.id === h.lineId)).toMatchObject({kind:'dialogue_line', data:{text:[{text:h.lineText}]}});
  expect(p.entities.find(entity => entity.id === h.translationId)).toMatchObject({data:{sourceLineId:h.lineId, sourceHash:h.sourceHash, stage:'reviewed'}});
  expect(p.entities.find(entity => entity.id === h.recordingId)).toMatchObject({data:{sourceLineId:h.lineId, sourceHash:h.sourceHash, translationId:h.translationId, attachmentId:h.audioId}});
  const asset = saved.assets.find(asset => asset.contentHash === h.audioHash);
  expect(asset).toBeDefined();
  expect(createHash('sha256').update(asset!.bytes).digest('hex')).toBe(h.audioSHA256);
  expect(p.entities.find(entity => entity.id === h.mediaId)).toMatchObject({data:{baseSnapshotId:h.pin.id, sourceIds:[h.sceneId], body:[{text:'公開済みの門の本文'}]}});
  expect(p.entities.find(entity => entity.kind === 'media_variant' && entity.data.previousVariantId === h.mediaId)).toMatchObject({status:'provisional', data:{body:[{text:h.candidateText}], needsReview:true}});
  expect(p.entities.find(entity => entity.id === h.entryId)).toMatchObject({data:{sceneId:h.sceneId}});
  expect(p.entities.find(entity => entity.id === h.graphId)).toMatchObject({data:{nodeIds:[h.entryId,h.terminalId], edgeIds:[h.edgeId]}});
  const traces = p.entities.filter(entity => entity.kind === 'trace' && entity.data.mode !== 'chapters');
  expect(traces).toHaveLength(1);
  expect(JSON.stringify(traces[0])).toContain(h.edgeId);
  const alternative = p.authorAlternatives?.find(alternative => alternative.versions.some(version => version.content.entities.some(entity => entity.kind === 'note' && entity.customValues?.consultationSource === 'phase3-proposal.md')));
  expect(alternative).toBeDefined();
  const latest = alternative!.versions.at(-1)!;
  expect(latest.content.entities.find(entity => entity.id === h.sceneId)).toMatchObject({data:{body:[{text:h.proposal}]}});
  expect(latest.content.entities.find(entity => entity.kind === 'note')?.customValues).toMatchObject({consultationSource:'phase3-proposal.md', consultationTargetVersionId:h.pin.id});
  expect(JSON.stringify(p.entities.find(entity => entity.id === h.sceneId))).toContain(h.secret);
}
