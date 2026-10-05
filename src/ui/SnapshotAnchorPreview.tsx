import { RELATION_LABELS } from '../domain/model';
import { resolvePinnedWorlds } from '../domain/pinnedWorlds';
import type { ContentAnchor, ProjectContent, ProjectData, RichText } from '../domain/types';
import { FIELD_SPECS } from './fieldSpecs';
import { labelOf, RichTextView } from './Fields';

export function SnapshotAnchorPreview({ project, anchor, worldSnapshots = {} }: { project: ProjectData; anchor: ContentAnchor; worldSnapshots?: Record<string, ProjectContent> }) {
  const snapshot = project.snapshots.find(candidate => candidate.id === anchor.sourceVersionId);
  const entity = snapshot?.content.entities.find(candidate => candidate.id === (anchor.lineId ?? anchor.entityId));
  const relation = snapshot?.content.relations.find(candidate => candidate.id === anchor.entityId);
  if (snapshot && relation && !entity) {
    const closure = resolvePinnedWorlds(snapshot.content, worldSnapshots);
    if (closure.errors.length) return <p role="alert">固定版の依存参照を解決できません：{closure.errors.join('、')}</p>;
    const index = new Map([snapshot.content, ...closure.worlds].flatMap(content => content.entities.map(value => [value.id, value] as const)));
    return <section aria-label="固定版の参照先"><h2>{RELATION_LABELS[relation.relationType] ?? relation.relationType}</h2><p>固定版: {snapshot.versionLabel} · 保存日時: {snapshot.createdAt}</p><p>{labelOf(index.get(relation.fromId))} {relation.direction === 'symmetric' ? '↔' : '→'} {labelOf(index.get(relation.toId))}</p><p>採用状態: {relation.status}</p><p>根拠: {relation.evidenceIds.map(id => labelOf(index.get(id))).join('、') || '未登録'}</p><details><summary>時期と条件を確認</summary><pre>{JSON.stringify(relation.validity, null, 2)}</pre></details></section>;
  }
  if (!snapshot || !entity) return <p role="alert">参照先の固定版または情報が見つかりません。現在版へ推測して移動せず、完全保存ファイルを確認してください。</p>;
  const fields = FIELD_SPECS[entity.kind].filter(field => field.type === 'rich');
  const data = entity.data as unknown as Record<string, unknown>;
  const targetBlocks = fields.flatMap(field => Array.isArray(data[field.key]) ? data[field.key] as RichText : []);
  const block = targetBlocks.find(candidate => candidate.id === anchor.blockId);
  const text = block?.text ?? (anchor.lineId ? (data.text as RichText | undefined)?.map(candidate => candidate.text).join('\n') : undefined);
  const chars = text === undefined ? undefined : Array.from(text);
  return <section aria-label="固定版の参照先"><h2>{labelOf(entity)}</h2><p>固定版: {snapshot.versionLabel} · 保存日時: {snapshot.createdAt}</p>
    {anchor.positionStatus === 'unresolved' ? <p role="status">位置不明・再リンク待ち：「{anchor.quotedText}」 {anchor.positionReason}</p> : chars && typeof anchor.start === 'number' && typeof anchor.end === 'number' ? <p className="referenced-quote">{chars.slice(0, anchor.start).join('')}<mark>{chars.slice(anchor.start, anchor.end).join('')}</mark>{chars.slice(anchor.end).join('')}</p> : block ? <blockquote>{block.text}</blockquote> : null}
    {fields.map(field => <section key={field.key}><h3>{field.label}</h3><RichTextView value={data[field.key]}/></section>)}
  </section>;
}
