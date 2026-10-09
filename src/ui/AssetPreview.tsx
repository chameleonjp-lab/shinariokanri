import { useEffect, useState } from 'react';
import type { Entity } from '../domain/types';
import { detectAsset, type PreparedAsset } from '../domain/attachments';
import { scenarioStore, sha256, validateAsset } from '../storage';
import { downloadBytes, Icon, safeFileName } from './components';

export function AssetPreview({ entity }: { entity: Entity<'attachment'> }) {
  const [asset, setAsset] = useState<{ bytes: Uint8Array; url: string; mediaType: string; preview: PreparedAsset['preview'] } | null>(null);
  const [message, setMessage] = useState('素材を確認しています…');
  useEffect(() => {
    let active = true, url = '';
    setAsset(null); setMessage('素材を確認しています…');
    void scenarioStore.getAsset(entity.data.contentHash).then(async bytes => {
      if (!active) return;
      if (!bytes) { setMessage('この端末には素材bytesがありません。完全保存を行う前に素材を取得してください。'); return; }
      if (bytes.byteLength !== entity.data.byteSize || await sha256(bytes) !== entity.data.contentHash) throw new Error('素材のhashまたはbytes数が一致しません。');
      validateAsset(entity.data.assetPath, entity.data.mediaType, bytes);
      let type: { mediaType: string; preview: PreparedAsset['preview'] };
      try { type = detectAsset(bytes, entity.data.mediaType); }
      catch { type = { mediaType: 'application/octet-stream', preview: 'download_only' }; }
      if (!active) return;
      url = URL.createObjectURL(new Blob([bytes as BlobPart], { type: type.mediaType }));
      setAsset({ bytes, url, ...type }); setMessage('');
    }).catch(() => { if (active) setMessage('素材を読み込めませんでした。入力や保存済みの情報は保持しています。'); });
    return () => { active = false; if (url) URL.revokeObjectURL(url); };
  }, [entity.id, entity.data.contentHash, entity.data.byteSize, entity.data.mediaType, entity.data.assetPath]);
  return <section className="asset-preview"><h3>素材の確認</h3>{message && <p className="field-hint" role="status">{message}</p>}{asset && <>{asset.preview === 'image' && <img src={asset.url} alt={entity.data.displayName || entity.name}/>} {asset.preview === 'audio' && <audio src={asset.url} controls preload="metadata" aria-label={entity.data.displayName || entity.name}/>} {asset.preview === 'video' && <video src={asset.url} controls preload="metadata" aria-label={entity.data.displayName || entity.name}/>} {asset.preview === 'download_only' && <p className="field-hint">この形式はファイルとして保存して確認できます。</p>}<button type="button" className="button secondary small" onClick={() => downloadBytes(asset.bytes as BlobPart, `${safeFileName(entity.data.displayName || entity.name)}${asset.mediaType === 'application/octet-stream' ? '.bin' : ''}`, asset.mediaType)}><Icon name="download" size={16}/>素材を保存</button></>}</section>;
}
