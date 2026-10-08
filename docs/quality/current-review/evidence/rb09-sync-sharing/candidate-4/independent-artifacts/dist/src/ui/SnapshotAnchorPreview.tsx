import { RELATION_LABELS } from '../domain/model';
import { resolvePinnedWorlds } from '../domain/pinnedWorlds';
import { captureRuntimeContent } from '../domain/runtimeVersions';
import { resolveReuseContent, reuseTargetAnchor } from '../domain/reuse';
import type { ContentAnchor, ProjectContent, ProjectData, ProjectSnapshot, RichText } from '../domain/types';
import { useEffect, useState } from 'react';
import { FIELD_SPECS } from './fieldSpecs';
import { labelOf, RichTextView } from './Fields';

export async function resolveSnapshotAnchorPreview(project: ProjectData, anchor: ContentAnchor, worldSnapshots: Record<string, ProjectContent> = {}) {
  const selected = structuredClone(anchor), snapshot = project.snapshots.find(candidate => candidate.id === selected.sourceVersionId);
  if (!snapshot) throw new Error('参照先の固定版が見つかりません。完全保存ファイルを確認してください。');
  const edition = structuredClone(snapshot);
  const captured = await captureRuntimeContent(project, edition.id, { worldSnapshots });
  return { snapshot: edition, content: resolveReuseContent(captured, captured.snapshots), anchor: selected };
}

export function SnapshotAnchorPreview({ project, anchor, worldSnapshots }: { project: ProjectData; anchor: ContentAnchor; worldSnapshots?: Record<string, ProjectContent> }) {
  const root = JSON.stringify(anchor), [navigation, setNavigation] = useState<{ root: string; anchors: ContentAnchor[] }>({ root, anchors: [anchor] });
  const anchors = navigation.root === root ? navigation.anchors : [anchor], selected = anchors.at(-1)!;
  const [result, setResult] = useState<{ key: string; value?: Awaited<ReturnType<typeof resolveSnapshotAnchorPreview>>; error?: string }>();
  const key = JSON.stringify(selected);
  useEffect(() => {
    let active = true; setResult({ key });
    void resolveSnapshotAnchorPreview(project, selected, worldSnapshots).then(value => { if (active) setResult({ key, value }); }, error => { if (active) setResult({ key, error: error instanceof Error ? error.message : '固定版を確認できませんでした。' }); });
    return () => { active = false; };
  }, [project, key, worldSnapshots]);
  const open = (target: ContentAnchor) => {
    if (!result?.value) return;
    const resolved = reuseTargetAnchor(result.value.content, target);
    setNavigation({ root, anchors: [...anchors, { ...resolved, sourceVersionId: resolved.sourceVersionId ?? selected.sourceVersionId }] });
  };
  return <>{anchors.length > 1 && <button className="button secondary" onClick={() => setNavigation({ root, anchors: anchors.slice(0, -1) })}>前の固定参照位置へ戻る</button>}{result?.key !== key || !result.value && !result.error ? <p role="status">固定版と依存参照を確認しています。</p> : result.error ? <p role="alert">固定版の依存参照を解決できません：{result.error}</p> : <SnapshotAnchorContent {...result.value!} worldSnapshots={worldSnapshots} onOpenTarget={open}/>}</>;
}

export function SnapshotAnchorContent({ snapshot, content, anchor, worldSnapshots = {}, onOpenTarget }: { snapshot: ProjectSnapshot; content: ProjectData; anchor: ContentAnchor; worldSnapshots?: Record<string, ProjectContent>; onOpenTarget?: (anchor: ContentAnchor) => void }) {
  const entity = content.entities.find(candidate => candidate.id === (anchor.lineId ?? anchor.entityId));
  const relation = content.relations.find(candidate => candidate.id === anchor.entityId);
  if (snapshot && relation && !entity) {
    const closure = resolvePinnedWorlds(content, worldSnapshots);
    if (closure.errors.length) return <p role="alert">固定版の依存参照を解決できません：{closure.errors.join('、')}</p>;
    const index = new Map([content, ...closure.worlds].flatMap(content => content.entities.map(value => [value.id, value] as const)));
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
    {fields.map(field => <section key={field.key}><h3>{field.label}</h3><RichTextView value={data[field.key]} onOpenTarget={onOpenTarget}/></section>)}
  </section>;
}
