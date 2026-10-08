import {useAuthorScope} from './StoreContext';
import { useEffect, useMemo, useState } from 'react';
import type { ContentAnchor, Entity, ProjectData, RichText, UnresolvedTextAnnotation } from '../domain/types';
import {
  addRubyAnnotation,
  addTextLink,
  findTextLinkReferences,
  findTextOccurrences,
  mergeRichTextBlocks,
  moveRichTextBlock,
  removeTextAnnotation,
  removeUnresolvedAnnotation,
  resolveUnresolvedAnnotation,
  splitRichTextBlock,
  suggestLinkCandidates,
  targetAnchorForTerm,
  type LinkCandidate,
  type TextLinkReference,
} from '../domain/linkCandidates';
import { KIND_LABELS } from '../domain/model';
import { candidateIgnoreKey, loadIgnoredLinkCandidates, saveIgnoredLinkCandidate } from './linkCandidatePreferences';

export interface TextAnnotationsProps {
  value: RichText;
  project: ProjectData;
  sourceEntityId: string;
  onChange: (value: RichText) => void;
  ignoredCandidateKeys?: ReadonlySet<string>;
  onIgnoreCandidate?: (key: string) => void;
  /** Navigate to an entity or its exact rich-text paragraph/range. */
  onOpenTarget?: (anchor: ContentAnchor, sourceAnchor?: ContentAnchor) => void;
  /** Open the reverse-reference list for this linked target. */
  onOpenReferences?: (targetEntityId: string) => void;
  /** Open one incoming source reference returned by findTextLinkReferences. */
  onOpenReference?: (reference: TextLinkReference) => void;
  fieldLabel?: string;
}

function pointLength(value: string): number { return Array.from(value).length; }
function snippet(value: string, max = 48): string {
  const chars = Array.from(value);
  return chars.length <= max ? value : `${chars.slice(0, max).join('')}…`;
}
function targetLabel(entity: Entity | undefined): string {
  if (!entity) return '削除済み・見つからない対象';
  const suffix = entity.id.length > 7 ? entity.id.slice(-6) : entity.id;
  return `${entity.name || KIND_LABELS[entity.kind]} · ${KIND_LABELS[entity.kind]} · ${suffix}`;
}
function annotationText(block: RichText[number], start: number, end: number): string {
  return Array.from(block.text).slice(start, end).join('');
}
function anchorFromSelection(entity: Entity | undefined, term: string): ContentAnchor | undefined {
  return entity ? targetAnchorForTerm(entity, term) : undefined;
}
function unresolvedKey(blockId: string, index: number): string { return `${blockId}:${index}`; }
function storedIgnored(projectId: string, sourceEntityId: string): ReadonlySet<string> {
  try { return loadIgnoredLinkCandidates(window.localStorage, projectId, sourceEntityId); } catch { return new Set(); }
}

export function TextAnnotations({
  value,
  project,
  sourceEntityId,
  onChange,
  ignoredCandidateKeys = new Set<string>(),
  onIgnoreCandidate,
  onOpenTarget,
  onOpenReferences,
  onOpenReference,
  fieldLabel = '本文',
}: TextAnnotationsProps) {
  const authorScope=useAuthorScope(project.projectId);
  const blocks = Array.isArray(value) ? value : [];
  const [selectedBlockId, setSelectedBlockId] = useState(blocks[0]?.id ?? '');
  const [candidateId, setCandidateId] = useState('');
  const [phrase, setPhrase] = useState('');
  const [occurrenceIndex, setOccurrenceIndex] = useState(0);
  const [markKind, setMarkKind] = useState<'link' | 'ruby'>('link');
  const [targetEntityId, setTargetEntityId] = useState('');
  const [reading, setReading] = useState('');
  const [splitOffset, setSplitOffset] = useState(1);
  const [error, setError] = useState('');
  const [locallyIgnored, setLocallyIgnored] = useState<ReadonlySet<string>>(() => new Set());
  const [persistedIgnored, setPersistedIgnored] = useState<ReadonlySet<string>>(() => storedIgnored(authorScope, sourceEntityId));
  const [unresolvedTargetIds, setUnresolvedTargetIds] = useState<Record<string, string>>({});

  useEffect(() => {
    setPersistedIgnored(storedIgnored(authorScope, sourceEntityId));
  }, [project.projectId, sourceEntityId]);

  const activeBlock = blocks.find(block => block.id === selectedBlockId) ?? blocks[0];
  const allIgnored = useMemo(() => new Set([...ignoredCandidateKeys, ...persistedIgnored, ...locallyIgnored]), [ignoredCandidateKeys, persistedIgnored, locallyIgnored]);
  const candidates = useMemo(
    () => activeBlock ? suggestLinkCandidates(activeBlock.text, project.entities, { sourceEntityId, projectId: project.projectId, ignoredKeys: allIgnored }) : [],
    [activeBlock?.id, activeBlock?.text, project.entities, project.projectId, sourceEntityId, allIgnored],
  );
  const selectedCandidate = candidates.find(candidate => candidate.id === candidateId);
  const occurrences = activeBlock ? findTextOccurrences(activeBlock.text, phrase) : [];
  const occurrence = occurrences[occurrenceIndex];
  const selectableTargets = project.entities.filter(entity => !entity.deletedAt && entity.id !== sourceEntityId);
  const selectedTarget = selectableTargets.find(entity => entity.id === targetEntityId);

  const chooseCandidate = (candidate: LinkCandidate | undefined) => {
    if (!candidate) {
      setCandidateId('');
      return;
    }
    setCandidateId(candidate.id);
    setPhrase(candidate.term);
    setTargetEntityId(candidate.entityId);
    setReading(candidate.suggestedReading ?? '');
    const candidateOccurrence = findTextOccurrences(activeBlock?.text ?? '', candidate.term).findIndex(item => item.start === candidate.start && item.end === candidate.end);
    setOccurrenceIndex(Math.max(0, candidateOccurrence));
    setError('');
  };

  const submit = () => {
    if (!activeBlock || !occurrence) { setError('段落内にある語句と出現位置を選んでください。'); return; }
    let result;
    if (markKind === 'ruby') result = addRubyAnnotation(blocks, activeBlock.id, occurrence.start, occurrence.end, reading);
    else {
      const target = anchorFromSelection(selectedTarget, phrase);
      if (!target) { setError('リンク先を選んでください。'); return; }
      result = addTextLink(blocks, activeBlock.id, occurrence.start, occurrence.end, target);
    }
    if (!result.ok) { setError(result.reason); return; }
    onChange(result.value);
    setError('');
  };

  const ignoreSelectedCandidate = () => {
    if (!selectedCandidate) return;
    const key = candidateIgnoreKey(project.projectId, sourceEntityId, selectedCandidate.entityId, selectedCandidate.term);
    setLocallyIgnored(current => new Set([...current, key]));
    setPersistedIgnored(current => {
      const next = new Set([...current, key]);
      try { saveIgnoredLinkCandidate(window.localStorage, authorScope, sourceEntityId, key); } catch { /* Blocked storage keeps the in-memory choice for this editor. */ }
      return next;
    });
    onIgnoreCandidate?.(key);
    setCandidateId('');
    setError('');
  };

  const split = () => {
    if (!activeBlock) return;
    const result = splitRichTextBlock(blocks, activeBlock.id, splitOffset);
    if (result.ok) { onChange(result.value); setError(''); }
    else setError(result.reason);
  };
  const merge = () => {
    if (!activeBlock) return;
    const result = mergeRichTextBlocks(blocks, activeBlock.id);
    if (result.ok) { onChange(result.value); setError(''); }
    else setError(result.reason);
  };

  const resolve = (ownerBlockId: string, index: number, annotation: UnresolvedTextAnnotation) => {
    if (!activeBlock || !occurrence) { setError('再リンク先の段落と語句を選んでください。'); return; }
    const key = unresolvedKey(ownerBlockId, index);
    const overrideId = unresolvedTargetIds[key] || (annotation.kind === 'link' ? annotation.target.entityId : '');
    const target = annotation.kind === 'link'
      ? selectableTargets.find(entity => entity.id === overrideId)
      : undefined;
    if (annotation.kind === 'link' && !target) { setError('有効なリンク先を選んでください。'); return; }
    const result = resolveUnresolvedAnnotation(
      blocks,
      ownerBlockId,
      index,
      activeBlock.id,
      occurrence.start,
      occurrence.end,
      annotation.kind === 'link' ? anchorFromSelection(target, phrase) : undefined,
    );
    if (!result.ok) { setError(result.reason); return; }
    onChange(result.value);
    setError('');
  };

  const blockForText = (blockId: string) => blocks.find(block => block.id === blockId);

  return <section className="text-annotations" aria-label={`${fieldLabel}のルビとリンク`}>
    <div className="section-heading"><h3>本文のルビ・リンク</h3><span>段落と語句を選んで追加</span></div>
    {!blocks.length ? <p className="field-hint">先に本文を入力すると、段落内の語句にルビやリンクを付けられます。</p> : <>
      <div className="form-field">
        <label htmlFor={`annotation-block-${sourceEntityId}`}>注記する段落</label>
        <select id={`annotation-block-${sourceEntityId}`} value={activeBlock?.id ?? ''} onChange={event => {
          setSelectedBlockId(event.target.value); setCandidateId(''); setPhrase(''); setOccurrenceIndex(0); setError('');
        }}>
          {blocks.map((block, index) => <option key={block.id} value={block.id}>{index + 1}. {snippet(block.text || '（空の段落）')}</option>)}
        </select>
      </div>
      {activeBlock && <>
        <p className="field-hint" aria-label="選択中の段落">{activeBlock.text || '（空の段落）'}</p>
        <div className="form-field">
          <label htmlFor={`annotation-candidate-${sourceEntityId}`}>本文に見つかった候補</label>
          <select id={`annotation-candidate-${sourceEntityId}`} value={selectedCandidate?.id ?? ''} onChange={event => chooseCandidate(candidates.find(candidate => candidate.id === event.target.value))}>
            <option value="">候補を選ぶ（手入力もできます）</option>
            {candidates.map(candidate => <option key={candidate.id} value={candidate.id}>{candidate.label} · 「{candidate.term}」 · {candidate.start + 1}〜{candidate.end}文字目</option>)}
          </select>
          {!candidates.length && <span className="field-hint">一致する候補はありません。本文の語句を直接入力できます。</span>}
        </div>
        <div className="form-field">
          <label htmlFor={`annotation-phrase-${sourceEntityId}`}>リンクまたはルビを付ける語句</label>
          <input id={`annotation-phrase-${sourceEntityId}`} value={phrase} onChange={event => { setPhrase(event.target.value); setCandidateId(''); setOccurrenceIndex(0); setError(''); }} placeholder="本文にある語句を入力" />
        </div>
        <div className="form-field">
          <label htmlFor={`annotation-occurrence-${sourceEntityId}`}>本文での出現位置</label>
          <select id={`annotation-occurrence-${sourceEntityId}`} value={occurrence ? String(occurrenceIndex) : ''} onChange={event => setOccurrenceIndex(Number(event.target.value))} disabled={!occurrences.length}>
            {occurrences.length ? occurrences.map((item, index) => <option key={`${item.start}:${item.end}`} value={index}>{index + 1}回目 · {item.start + 1}〜{item.end}文字目</option>) : <option value="">語句と一致する位置がありません</option>}
          </select>
        </div>
        <div className="form-field">
          <label htmlFor={`annotation-kind-${sourceEntityId}`}>注記の種類</label>
          <select id={`annotation-kind-${sourceEntityId}`} value={markKind} onChange={event => setMarkKind(event.target.value as 'link' | 'ruby')}>
            <option value="link">用語・人物へのリンク</option><option value="ruby">ルビ</option>
          </select>
        </div>
        {markKind === 'link' ? <div className="form-field">
          <label htmlFor={`annotation-target-${sourceEntityId}`}>リンク先</label>
          <select id={`annotation-target-${sourceEntityId}`} value={targetEntityId} onChange={event => setTargetEntityId(event.target.value)}>
            <option value="">対象を選択</option>
            {selectableTargets.map(entity => <option key={entity.id} value={entity.id}>{targetLabel(entity)}</option>)}
          </select>
          {selectedCandidate && onIgnoreCandidate && <button type="button" className="text-button" onClick={ignoreSelectedCandidate}>この語句とリンク先の候補を表示しない</button>}
        </div> : <div className="form-field">
          <label htmlFor={`annotation-reading-${sourceEntityId}`}>読み</label>
          <input id={`annotation-reading-${sourceEntityId}`} value={reading} onChange={event => setReading(event.target.value)} placeholder="ふりがな" />
        </div>}
        <button type="button" className="button secondary small" onClick={submit} disabled={!occurrence}>{markKind === 'ruby' ? 'ルビを付ける' : 'リンクを付ける'}</button>
      </>}
    </>}

    {error && <p className="field-error" role="alert">{error}</p>}

    {activeBlock && <div className="advanced-details">
      <strong>段落の操作</strong>
      <p className="field-hint">本文の編集後も注記範囲を追跡し、位置が曖昧な注記は再リンク待ちとして残します。</p>
      <div className="form-field">
        <label htmlFor={`annotation-split-${sourceEntityId}`}>分割位置</label>
        <select id={`annotation-split-${sourceEntityId}`} value={splitOffset} onChange={event => setSplitOffset(Number(event.target.value))} disabled={pointLength(activeBlock.text) < 2}>
          {Array.from({ length: Math.max(0, pointLength(activeBlock.text) - 1) }, (_, index) => index + 1).map(offset => <option key={offset} value={offset}>{offset}文字目の後 · 「{snippet(Array.from(activeBlock.text).slice(0, offset).join(''), 24)}｜</option>)}
        </select>
      </div>
      <div className="reference-controls">
        <button type="button" className="button secondary small" onClick={split} disabled={pointLength(activeBlock.text) < 2}>この位置で段落を分割</button>
        <button type="button" className="button secondary small" onClick={merge} disabled={blocks.indexOf(activeBlock) >= blocks.length - 1}>次の段落と結合</button>
        <button type="button" className="button secondary small" onClick={() => onChange(moveRichTextBlock(blocks, activeBlock.id, -1))} disabled={blocks.indexOf(activeBlock) <= 0}>前へ移動</button>
        <button type="button" className="button secondary small" onClick={() => onChange(moveRichTextBlock(blocks, activeBlock.id, 1))} disabled={blocks.indexOf(activeBlock) >= blocks.length - 1}>後へ移動</button>
      </div>
    </div>}

    <div className="advanced-details">
      <strong>設定済みの注記</strong>
      {!blocks.some(block => block.ruby?.length || block.links?.length) && <p className="field-hint">まだありません。</p>}
      {blocks.map(block => <div key={`marks-${block.id}`} className="reference-editor">
        {block.ruby?.map((ruby, index) => <div className="condition-row" key={`ruby-${index}`}>
          <span>ルビ：「{annotationText(block, ruby.start, ruby.end)}」→「{ruby.text}」</span>
          <button type="button" className="text-button danger" aria-label={`ルビ ${annotationText(block, ruby.start, ruby.end)} を削除`} onClick={() => onChange(removeTextAnnotation(blocks, block.id, 'ruby', index))}>削除</button>
        </div>)}
        {block.links?.map((link, index) => {
          const target = project.entities.find(entity => entity.id === link.target.entityId);
          const references = findTextLinkReferences(project, link.target.entityId);
          return <div className="condition-row" key={`link-${index}`}>
            <span>リンク：「{annotationText(block, link.start, link.end)}」→ {targetLabel(target)}</span>
            {onOpenTarget && <button type="button" className="text-button" onClick={() => onOpenTarget(link.target, { entityId: sourceEntityId, blockId: block.id, start: link.start, end: link.end })}>対象を開く</button>}
            {onOpenReferences && <button type="button" className="text-button" onClick={() => onOpenReferences(link.target.entityId)}>参照元 {references.length}件</button>}
            <button type="button" className="text-button danger" aria-label={`リンク ${annotationText(block, link.start, link.end)} を削除`} onClick={() => onChange(removeTextAnnotation(blocks, block.id, 'link', index))}>削除</button>
          </div>;
        })}
      </div>)}
      {onOpenReference && blocks.flatMap(block => block.links ?? []).flatMap(link => findTextLinkReferences(project, link.target.entityId)).map((reference, index) => <button type="button" className="text-button" key={`${reference.sourceEntityId}:${reference.sourceBlockId}:${reference.start}:${index}`} onClick={() => onOpenReference(reference)}>
        参照元を開く：{reference.sourceEntityName} · {reference.sourceField} · 「{reference.text}」
      </button>)}
    </div>

    {blocks.some(block => block.unresolvedAnnotations?.length) && <div className="advanced-details">
      <strong>再リンク待ち</strong>
      <p className="field-hint">本文の範囲を選んでから適用してください。新しい注記を追加できた場合だけ、元の再リンク待ちを取り除きます。</p>
      {blocks.flatMap(block => (block.unresolvedAnnotations ?? []).map((annotation, index) => ({ block, annotation, index }))).map(({ block, annotation, index }) => {
        const key = unresolvedKey(block.id, index);
        const originalTarget = annotation.kind === 'link' ? project.entities.find(entity => entity.id === annotation.target.entityId) : undefined;
        const unresolvedTargetId = unresolvedTargetIds[key] ?? (originalTarget && !originalTarget.deletedAt ? originalTarget.id : '');
        return <div className="reference-editor" key={key}>
          <p><strong>{annotation.kind === 'ruby' ? 'ルビ' : 'リンク'}：「{annotation.originalText}」</strong> · {annotation.reason}</p>
          {annotation.kind === 'link' && <div className="form-field">
            <label htmlFor={`unresolved-target-${sourceEntityId}-${index}`}>再リンク先</label>
            <select id={`unresolved-target-${sourceEntityId}-${index}`} value={unresolvedTargetId} onChange={event => setUnresolvedTargetIds(current => ({ ...current, [key]: event.target.value }))}>
              <option value="">対象を選択</option>
              {selectableTargets.map(entity => <option key={entity.id} value={entity.id}>{targetLabel(entity)}</option>)}
            </select>
          </div>}
          <div className="reference-controls">
            <button type="button" className="button secondary small" onClick={() => resolve(block.id, index, annotation)} disabled={!activeBlock || !occurrence || (annotation.kind === 'link' && !unresolvedTargetId)}>選択した語句に再リンク</button>
            <button type="button" className="text-button danger" onClick={() => onChange(removeUnresolvedAnnotation(blocks, block.id, index))}>再リンク待ちを削除</button>
          </div>
        </div>;
      })}
    </div>}
  </section>;
}

export default TextAnnotations;
