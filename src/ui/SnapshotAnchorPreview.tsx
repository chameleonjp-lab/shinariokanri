import type { ContentAnchor, ProjectData, RichText } from '../domain/types';
import { FIELD_SPECS } from './fieldSpecs';
import { labelOf, RichTextView } from './Fields';

export function SnapshotAnchorPreview({ project, anchor }: { project: ProjectData; anchor: ContentAnchor }) {
  const snapshot = project.snapshots.find(candidate => candidate.id === anchor.sourceVersionId);
  const entity = snapshot?.content.entities.find(candidate => candidate.id === (anchor.lineId ?? anchor.entityId));
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
