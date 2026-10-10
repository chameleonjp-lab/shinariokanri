import type { Block, ContentAnchor, Entity } from '../domain/types';

export type EditorNavigation = { ok: true; fieldKey?: string; blockId?: string; start?: number; end?: number } | { ok: false; message: string };
export interface EditorReturnOrigin { anchor: ContentAnchor; fieldPath?: string; sourceText: string }

function richText(value: unknown): value is Block[] {
  return Array.isArray(value) && value.every(block => block && typeof block === 'object' && typeof block.id === 'string' && typeof block.text === 'string');
}

/** A valid old offset can still point at another word after an intervening edit. */
export function resolveEditorReturnNavigation(entity: Entity, origin: EditorReturnOrigin): EditorNavigation {
  const navigation = resolveEditorNavigation(entity, origin.anchor, origin.fieldPath);
  if (!navigation.ok) return navigation;
  const blocks = navigation.fieldKey && (entity.data as unknown as Record<string, unknown>)[navigation.fieldKey];
  if (!richText(blocks) || blocks.map(block => block.text).join('\n') !== origin.sourceText) return { ok: false, message: '固定版を開いている間に参照元の本文が変わりました。現在の本文で戻る位置を確認してください。' };
  return navigation;
}

/** Stable IDs choose the paragraph. Code-point offsets become DOM UTF-16 offsets. */
export function resolveEditorNavigation(entity: Entity, anchor: ContentAnchor, fieldPath?: string): EditorNavigation {
  if (anchor.positionStatus === 'unresolved') return { ok: false, message: `${anchor.positionReason || '参照位置を確認してください。'}${anchor.quotedText ? ` 引用: ${anchor.quotedText}` : ''}` };
  if (anchor.sourceVersionId && anchor.sourceVersionId !== entity.projectId) return { ok: false, message: '固定版への参照です。現在版の文章で位置を選び直しません。' };
  if (anchor.entityId !== entity.id && anchor.lineId !== entity.id) return { ok: false, message: '参照先の情報が現在の編集対象と一致しません。' };
  const data = entity.data as unknown as Record<string, unknown>;
  const requested = fieldPath?.replace(/^data\./, '').split(/[.\[]/)[0];
  const field = anchor.blockId ? Object.entries(data).find(([, value]) => richText(value) && value.some(block => block.id === anchor.blockId))
    : requested && Object.hasOwn(data, requested) ? [requested, data[requested]] as const
    : anchor.lineId === entity.id && entity.kind === 'dialogue_line' ? ['text', entity.data.text] as const : undefined;
  if (anchor.blockId && !field) return { ok: false, message: '参照先の段落がありません。引用を確認して参照位置を付け直してください。' };
  if (!field) return { ok: true };
  const [fieldKey, blocks] = field;
  if (!richText(blocks)) return { ok: true, fieldKey };
  const text = blocks.map(block => block.text).join('\n');
  const index = anchor.blockId ? blocks.findIndex(block => block.id === anchor.blockId) : -1;
  const blockText = index >= 0 ? blocks[index].text : text;
  const length = Array.from(blockText).length;
  const start = anchor.start ?? 0, end = anchor.end ?? (anchor.blockId ? length : start);
  if (!Number.isSafeInteger(start) || !Number.isSafeInteger(end) || start < 0 || end < start || end > length) return { ok: false, message: '参照先の文字範囲が現在の文章と一致しません。引用を確認して参照位置を付け直してください。' };
  const prefix = index >= 0 ? blocks.slice(0, index).reduce((count, block) => count + Array.from(block.text).length + 1, 0) : 0;
  const points = Array.from(text);
  return { ok: true, fieldKey, ...(anchor.blockId ? { blockId: anchor.blockId } : {}), start: points.slice(0, prefix + start).join('').length, end: points.slice(0, prefix + end).join('').length };
}
