import { useEffect, useRef, useState } from 'react';
import type { Entity, ProjectData } from '../domain/types';
import { previewNoteConversion, type NoteConversionKind } from '../domain/notes';
import { createEntity, newId } from '../domain/model';
import { prepareAsset } from '../domain/attachments';
import type { AssetInput } from '../storage';

const MAX_ASSET_BYTES = 32 * 1024 * 1024;
const acceptedMedia = 'image/png,image/jpeg,image/gif,image/webp,audio/wav,audio/x-wav,audio/mpeg,audio/mp3';
const TARGET_LABELS: Record<NoteConversionKind, string> = { character: '人物', scene: '場面', foreshadow: '伏線' };

function encodeMonoWav(buffer: AudioBuffer): Uint8Array {
  const byteLength = buffer.length * 2;
  if (!byteLength || byteLength + 44 > MAX_ASSET_BYTES) throw new Error('録音が32 MiBを超えるため保存できません。短く録音するか、短いWAV/MP3を選んでください。');
  const output = new Uint8Array(44 + byteLength);
  const view = new DataView(output.buffer);
  const writeText = (offset: number, value: string) => { for (let i = 0; i < value.length; i++) output[offset + i] = value.charCodeAt(i); };
  writeText(0, 'RIFF'); view.setUint32(4, 36 + byteLength, true); writeText(8, 'WAVE');
  writeText(12, 'fmt '); view.setUint32(16, 16, true); view.setUint16(20, 1, true); view.setUint16(22, 1, true);
  view.setUint32(24, buffer.sampleRate, true); view.setUint32(28, buffer.sampleRate * 2, true); view.setUint16(32, 2, true); view.setUint16(34, 16, true);
  writeText(36, 'data'); view.setUint32(40, byteLength, true);
  const channels = Array.from({ length: buffer.numberOfChannels }, (_, channel) => buffer.getChannelData(channel));
  for (let i = 0; i < buffer.length; i++) {
    const mixed = channels.reduce((sum, channel) => sum + channel[i]!, 0) / channels.length;
    const clipped = Math.max(-1, Math.min(1, mixed));
    view.setInt16(44 + i * 2, clipped < 0 ? clipped * 0x8000 : clipped * 0x7fff, true);
  }
  return output;
}

async function prepareRecording(blob: Blob, displayName: string) {
  const bytes = new Uint8Array(await blob.arrayBuffer());
  try { return await prepareAsset(bytes, displayName); }
  catch (directError) {
    if (bytes.byteLength > MAX_ASSET_BYTES) throw directError;
    const AudioContextConstructor = window.AudioContext;
    if (!AudioContextConstructor) throw new Error('録音形式をWAVへ変換できません。録音は画面に保持されています。WAV/MP3ファイルを選ぶ方法を使えます。');
    const context = new AudioContextConstructor();
    try {
      const decoded = await context.decodeAudioData(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength));
      const wav = encodeMonoWav(decoded);
      return await prepareAsset(wav, displayName.replace(/\.[^.]+$/, '') + '.wav');
    } catch (conversionError) {
      const reason = conversionError instanceof Error ? conversionError.message : '';
      throw new Error(`録音を安全なWAVへ変換できません。録音は画面に保持されています。WAV/MP3ファイルを選んでください。${reason ? ` ${reason}` : ''}`);
    } finally { await context.close().catch(() => undefined); }
  }
}

export interface NotesToolsProps {
  project: ProjectData;
  note: Entity<'note'>;
  onSaveMany: (entities: Entity[], reason: string, assets?: AssetInput[]) => Promise<void>;
  /** Must save the complete candidate as one project command; assets are optional for caller reuse. */
  onSaveProject: (project: ProjectData, reason: string, assets?: AssetInput[]) => Promise<ProjectData>;
  onOpen?: (id: string) => void;
  /** Device-local note capture text retained by the editor host across panel unmounts. */
  captureDraft?: string;
  /** Receives untrimmed text as it is typed; `expectedRaw` guards an async save clear against newer input. */
  onCaptureDraft?: (raw: string | undefined, expectedRaw?: string) => void;
}

/** Local-only image/audio capture, text capture, and linked note conversion controls. */
export function NotesTools({ project, note, onSaveMany, onSaveProject, onOpen, captureDraft, onCaptureDraft }: NotesToolsProps) {
  const [textDraft, setTextDraft] = useState(captureDraft ?? '');
  const [conversionKind, setConversionKind] = useState<NoteConversionKind>('character');
  const [conversionName, setConversionName] = useState(note.name);
  const [pendingFile, setPendingFile] = useState<File | null>(null);
  const [pendingRecording, setPendingRecording] = useState<{ blob: Blob; noteId: string } | null>(null);
  const [recording, setRecording] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const fileInput = useRef<HTMLInputElement>(null);
  const recorder = useRef<MediaRecorder | null>(null);
  const stream = useRef<MediaStream | null>(null);
  const chunks = useRef<Blob[]>([]);
  const capturedBytes = useRef(0);
  const recordedForNote = useRef<string | null>(null);
  const mounted = useRef(true);
  const textDraftRef = useRef(captureDraft ?? '');
  const previousCaptureDraft = useRef(captureDraft);

  useEffect(() => {
    const retainedText = captureDraft ?? '';
    textDraftRef.current = retainedText;
    setTextDraft(retainedText); setConversionName(note.name); setPendingFile(null); setPendingRecording(null); setError(''); setNotice('');
  }, [note.id]);
  useEffect(() => {
    if (previousCaptureDraft.current === captureDraft) return;
    previousCaptureDraft.current = captureDraft;
    const retainedText = captureDraft ?? '';
    textDraftRef.current = retainedText;
    setTextDraft(retainedText);
  }, [captureDraft]);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      try { if (recorder.current && recorder.current.state !== 'inactive') recorder.current.stop(); } catch { /* device is already stopping */ }
      stream.current?.getTracks().forEach(track => track.stop());
    };
  }, []);

  const getCurrentNote = (noteId = note.id): Entity<'note'> => {
    const current = project.entities.find((entity): entity is Entity<'note'> => entity.id === noteId && entity.kind === 'note' && !entity.deletedAt);
    if (!current && note.id !== noteId) throw new Error('録音先のメモが見つかりません。選択内容を確認して再試行してください。');
    if (note.id === noteId && current && current.revision !== note.revision) throw new Error('メモが別の操作で更新されています。現在の版を開き直してから再試行してください。');
    if (note.id === noteId && current && JSON.stringify(current) !== JSON.stringify(note)) throw new Error('メモに未保存の入力があります。文章を保存してから、この操作を再試行してください。入力は保持されています。');
    return current ?? note;
  };

  const updateTextDraft = (raw: string, expectedRaw?: string) => {
    textDraftRef.current = raw;
    if (mounted.current) setTextDraft(raw);
    onCaptureDraft?.(raw || undefined, expectedRaw);
  };

  const attachPrepared = async (prepared: Awaited<ReturnType<typeof prepareAsset>>, targetNoteId = note.id) => {
    const source = getCurrentNote(targetNoteId);
    const attachment = createEntity(project.projectId, 'attachment', prepared.displayName, { contentHash: prepared.contentHash, byteSize: prepared.byteSize, mediaType: prepared.mediaType, assetPath: prepared.assetPath, displayName: prepared.displayName, stage: 'temporary' });
    const updatedNote: Entity<'note'> = { ...source, data: { ...source.data, attachmentIds: [...new Set([...(source.data.attachmentIds ?? []), attachment.id])] } };
    const asset: AssetInput = { contentHash: prepared.contentHash, bytes: prepared.bytes, mediaType: prepared.mediaType, assetPath: prepared.assetPath };
    await onSaveMany([attachment, updatedNote], 'メモへ画像・音声素材を追加', [asset]);
    return attachment;
  };

  const saveFile = async () => {
    if (!pendingFile) return;
    setBusy(true); setError(''); setNotice('');
    try {
      if (pendingFile.size < 1 || pendingFile.size > MAX_ASSET_BYTES) throw new Error('添付は1 byte〜32 MiBです。選択中のファイルは保持しています。');
      const prepared = await prepareAsset(new Uint8Array(await pendingFile.arrayBuffer()), pendingFile.name);
      const attachment = await attachPrepared(prepared);
      setNotice(`${prepared.displayName}をメモへ保存しました。`); setPendingFile(null);
      if (fileInput.current) fileInput.current.value = '';
      onOpen?.(attachment.id);
    } catch (failure) { setError((failure as Error).message); }
    finally { setBusy(false); }
  };

  const saveRecording = async (blob: Blob, targetNoteId: string) => {
    if (!mounted.current) return;
    setBusy(true); setError(''); setNotice('');
    try {
      if (!blob.size || blob.size > MAX_ASSET_BYTES) throw new Error('録音は1 byte〜32 MiBで保存できます。短く録音するか、WAV/MP3を選んでください。録音は画面に保持しています。');
      const prepared = await prepareRecording(blob, '音声メモ.wav');
      const attachment = await attachPrepared(prepared, targetNoteId);
      if (!mounted.current) return;
      setPendingRecording(null); setNotice('録音を音声メモとして保存しました。'); onOpen?.(attachment.id);
    } catch (failure) { if (mounted.current) { setPendingRecording({ blob, noteId: targetNoteId }); setError((failure as Error).message); } }
    finally { if (mounted.current) setBusy(false); }
  };

  const addText = async () => {
    const submittedRaw = textDraftRef.current;
    const text = submittedRaw.trim();
    if (!text) return;
    setBusy(true); setError(''); setNotice('');
    try {
      const source = getCurrentNote();
      const updated: Entity<'note'> = { ...source, data: { ...source.data, body: [...source.data.body, { id: newId(), kind: 'paragraph', text }] } };
      await onSaveMany([updated], '短い文章メモを追加');
      if (textDraftRef.current === submittedRaw) updateTextDraft('', submittedRaw);
      setNotice('メモを保存しました。');
    } catch (failure) { setError((failure as Error).message); }
    finally { setBusy(false); }
  };

  const startRecording = async () => {
    setError(''); setNotice('');
    if (!navigator.mediaDevices?.getUserMedia || typeof window.MediaRecorder === 'undefined') {
      setError('このブラウザーはマイク録音に対応していません。PNG/JPEG/GIF/WebP画像またはWAV/MP3音声ファイルを選ぶ方法を使えます。');
      return;
    }
    let microphone: MediaStream | null = null;
    try {
      microphone = await navigator.mediaDevices.getUserMedia({ audio: true });
      const candidates = ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4'];
      const mimeType = candidates.find(type => MediaRecorder.isTypeSupported(type));
      const nextRecorder = mimeType ? new MediaRecorder(microphone, { mimeType }) : new MediaRecorder(microphone);
      stream.current = microphone; recorder.current = nextRecorder; recordedForNote.current = note.id;
      chunks.current = []; capturedBytes.current = 0;
      nextRecorder.ondataavailable = event => {
        if (!event.data.size) return;
        capturedBytes.current += event.data.size;
        if (capturedBytes.current <= MAX_ASSET_BYTES) chunks.current.push(event.data);
        else {
          setError('録音が32 MiBの上限に達したため停止しました。短く録音するか、WAV/MP3ファイルを選んでください。');
          if (nextRecorder.state !== 'inactive') nextRecorder.stop();
        }
      };
      nextRecorder.onstop = () => {
        const targetNoteId = recordedForNote.current || note.id;
        const blob = capturedBytes.current <= MAX_ASSET_BYTES ? new Blob(chunks.current, { type: nextRecorder.mimeType || 'audio/webm' }) : new Blob();
        microphone?.getTracks().forEach(track => track.stop());
        if (stream.current === microphone) stream.current = null;
        if (recorder.current === nextRecorder) recorder.current = null;
        if (mounted.current) { setRecording(false); if (blob.size) { setPendingRecording({ blob, noteId: targetNoteId }); void saveRecording(blob, targetNoteId); } }
      };
      nextRecorder.onerror = () => {
        microphone?.getTracks().forEach(track => track.stop());
        if (mounted.current) { setRecording(false); setError('録音中にエラーが発生しました。入力内容は保持しています。WAV/MP3ファイルを選ぶ方法を使えます。'); }
      };
      nextRecorder.start(1000);
      setRecording(true);
    } catch (failure) {
      microphone?.getTracks().forEach(track => track.stop());
      const message = (failure as Error).name === 'NotAllowedError' || (failure as Error).name === 'PermissionDeniedError'
        ? 'マイクの使用が許可されませんでした。文章は保存でき、WAV/MP3音声ファイルを選ぶ方法も使えます。'
        : `マイクを開始できませんでした。${(failure as Error).message || '権限と端末の状態を確認してください。'} WAV/MP3音声ファイルを選ぶ方法も使えます。`;
      setError(message);
    }
  };

  const stopRecording = () => {
    const active = recorder.current;
    if (!active || active.state === 'inactive') return;
    try { active.stop(); } catch (failure) { setError(`録音を停止できませんでした。${(failure as Error).message}`); }
  };

  const convertNote = async () => {
    setBusy(true); setError(''); setNotice('');
    try {
      const source = getCurrentNote();
      const preview = previewNoteConversion(source, { kind: conversionKind, name: conversionName, entityId: newId(), relationId: newId(), createdAt: new Date().toISOString(), blockIds: source.data.body.map(() => newId()) });
      const existing = project.entities.some(entity => entity.id === source.id);
      const entities = existing ? project.entities.map(entity => entity.id === source.id ? preview.note : entity).concat(preview.entity) : [...project.entities, preview.note, preview.entity];
      await onSaveProject({ ...project, entities, relations: [...project.relations, preview.relation] }, `メモを${TARGET_LABELS[conversionKind]}へ変換（元メモと参照を保持）`);
      setNotice(`元のメモを残したまま${TARGET_LABELS[conversionKind]}を作成しました。`); onOpen?.(preview.entity.id);
    } catch (failure) { setError((failure as Error).message); }
    finally { setBusy(false); }
  };

  const attached = (note.data.attachmentIds ?? []).map(id => project.entities.find((entity): entity is Entity<'attachment'> => entity.id === id && entity.kind === 'attachment' && !entity.deletedAt)).filter((entity): entity is Entity<'attachment'> => Boolean(entity));

  return <section className="settings-card notes-tools" aria-labelledby="note-capture-title">
    <h3 id="note-capture-title">メモを残す・変換する</h3>
    <p className="field-hint">文章・画像・音声をこのメモに保存します。変換後も元のメモと添付は残ります。</p>
    <div className="form-field"><label htmlFor="note-text-capture">短い文章を追加</label><textarea id="note-text-capture" rows={3} value={textDraft} onChange={event => updateTextDraft(event.target.value)} placeholder="思いついたことを残す"/></div>
    <button type="button" className="button secondary" disabled={busy || !textDraft.trim()} onClick={() => void addText()}>文章メモを保存</button>

    <div className="form-field"><label htmlFor="note-asset-upload">画像・音声ファイル</label><input ref={fileInput} id="note-asset-upload" type="file" accept={acceptedMedia} disabled={busy} onChange={event => { const file = event.target.files?.[0]; if (file) { setPendingFile(file); setError(''); setNotice(''); } }}/><span className="field-hint">PNG、JPEG、GIF、WebP、WAV、MP3 · 32 MiBまで。形式は内容を検査してから保存します。</span></div>
    {pendingFile && <div className="backup-actions"><span>{pendingFile.name} · {(pendingFile.size / 1024 / 1024).toFixed(2)} MiB</span><button type="button" className="button secondary small" disabled={busy} onClick={() => void saveFile()}>{busy ? '保存中…' : 'メモへ添付'}</button></div>}

    <div className="backup-actions"><strong>マイク録音</strong>{recording ? <button type="button" className="button primary small" onClick={stopRecording}>録音を停止して保存</button> : <button type="button" className="button secondary small" disabled={busy} onClick={() => void startRecording()}>録音を開始</button>}</div>
    {pendingRecording && error && <div className="backup-actions"><span className="field-hint" role="status">未保存の録音をこの画面に保持しています。</span><button type="button" className="button secondary small" disabled={busy} onClick={() => void saveRecording(pendingRecording.blob, pendingRecording.noteId)}>録音の保存を再試行</button></div>}
    {attached.length > 0 && <div className="attached-files"><span>このメモの添付</span>{attached.map(asset => <button type="button" className="text-button" key={asset.id} onClick={() => onOpen?.(asset.id)}>{asset.data.displayName || asset.name}</button>)}</div>}

    <h4>このメモから作成</h4>
    <div className="form-row"><div className="form-field"><label htmlFor="note-conversion-kind">変換先</label><select id="note-conversion-kind" disabled={busy} value={conversionKind} onChange={event => setConversionKind(event.target.value as NoteConversionKind)}>{Object.entries(TARGET_LABELS).map(([kind, label]) => <option key={kind} value={kind}>{label}</option>)}</select></div><div className="form-field"><label htmlFor="note-conversion-name">変換先の名前</label><input id="note-conversion-name" disabled={busy} value={conversionName} onChange={event => setConversionName(event.target.value)}/></div></div>
    <p className="field-hint">本文を人物の要約、場面の本文、または伏線の問いへコピーします。段落IDを新しく作り、元メモへの参照関係を残します。</p>
    <button type="button" className="button primary" disabled={busy || recording || !conversionName.trim()} onClick={() => void convertNote()}>{busy ? '保存中…' : `${TARGET_LABELS[conversionKind]}を作成して元メモを残す`}</button>
    {error && <div className="error-notice" role="alert"><strong>操作を完了できませんでした</strong><p>{error}</p><span className="field-hint">入力内容は保持されています。説明にある方法で修正し、再試行できます。</span></div>}{notice && <p role="status" className="success-notice">{notice}</p>}
  </section>;
}
