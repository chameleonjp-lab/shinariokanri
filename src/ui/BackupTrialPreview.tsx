import {useEffect, useState} from 'react';
import type {BackupInspection, BackupTrial} from '../storage';
import type {ProjectData} from '../domain/types';
import {useScenarioStore} from './StoreContext';
import {ListPager, useListWindow} from './ListWindow';

function Material({asset}: {asset: BackupInspection['assets'][number]}) {
  const store = useScenarioStore(), [url, setUrl] = useState(''), [error, setError] = useState('');
  useEffect(() => {
    let live = true, objectUrl = '';
    setUrl(''); setError('');
    void store.getAsset(asset.contentHash).then(bytes => {
      if (!live) return;
      if (!bytes) {setError('このコピーの素材を開けません。'); return;}
      objectUrl = URL.createObjectURL(new Blob([bytes as BlobPart], {type: asset.mediaType})); setUrl(objectUrl);
    }).catch(() => {if (live) setError('このコピーの素材を開けません。');});
    return () => {live = false; if (objectUrl) URL.revokeObjectURL(objectUrl);};
  }, [store, asset.contentHash, asset.mediaType]);
  return <div className="backup-material"><p>{asset.mediaType} · {asset.byteSize.toLocaleString()} bytes</p>{error && <p role="alert">{error}</p>}{url && (asset.mediaType.startsWith('image/') ? <img src={url} alt="試し復元コピーの画像" style={{maxWidth: '100%', maxHeight: 240}}/> : asset.mediaType.startsWith('audio/') ? <audio src={url} controls preload="metadata" style={{maxWidth: '100%'}}/> : <a href={url} download>試し復元コピーの素材を開く</a>)}</div>;
}

/** Only the saved clone is loaded here; the current editor stays selected. */
export function BackupTrialPreview({trial, inspection}: {trial: BackupTrial; inspection: BackupInspection}) {
  const store = useScenarioStore(), [loaded, setLoaded] = useState<{project?: ProjectData; error?: string}>({});
  useEffect(() => {
    let live = true; setLoaded({});
    void store.getProject(trial.projectId).then(project => {
      if (!live) return;
      setLoaded(project && project.revision === trial.revision ? {project} : {error: '試し復元コピーの版が変わったか、見つかりません。もう一度試し復元してください。'});
    }).catch(() => {if (live) setLoaded({error: '試し復元コピーを開けません。'});});
    return () => {live = false;};
  }, [store, trial.projectId, trial.revision]);
  const scenes = loaded.project?.entities.filter(entity => entity.kind === 'scene') ?? [];
  const scenePage = useListWindow({items: scenes, scope: `${trial.projectId}:backup-scenes`, size: 5});
  const materials = useListWindow({items: inspection.assets.map(asset => ({...asset, id: asset.contentHash})), scope: `${trial.projectId}:backup-materials`, size: 5});
  if (loaded.error) return <p role="alert">{loaded.error}</p>;
  if (!loaded.project) return <p role="status">試し復元コピーを開いています…</p>;
  return <div aria-label="試し復元コピーの本文と素材"><p>このコピーの本文と、画像の表示・音声の再生を確認してください。別端末で開けるかは、その端末でも同じファイルを選んで確認してください。</p><ListPager {...scenePage} label="試し復元の場面"/>{scenePage.items.map(scene => <details key={scene.id} open><summary>{scene.name}</summary>{scene.data.body.map(block => <p key={block.id}>{block.text}</p>)}</details>)}<ListPager {...materials} label="試し復元の素材"/>{materials.items.map(asset => <Material key={asset.id} asset={asset}/>)}</div>;
}
