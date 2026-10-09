import type { ProjectData } from '../domain/types';
import { prepareAsset } from '../domain/attachments';

export type MaterialData = Record<string, { mediaType: string; base64: string }>;
export type ShowMaterial = (id: string, version: string, parent: HTMLElement) => () => void;

/** Composite keys keep different bytes for the same logical material in old editions. */
export function materialView(project: ProjectData, assets: MaterialData, publicToRuntime: Record<string, string>, urls: Set<string>): ShowMaterial {
  const publicIds = new Map(Object.entries(publicToRuntime).map(([publicId, runtimeId]) => [runtimeId, publicId]));
  return (id, version, parent) => {
    const edition = version === project.projectId ? project : project.snapshots.find(pin => pin.id === version)?.content;
    const entity = edition?.entities.find(record => record.id === id && record.kind === 'attachment' && record.status === 'confirmed' && !record.deletedAt);
    const publicId = publicIds.get(id), value = publicId ? assets[version === project.projectId ? publicId : `${version}:${publicId}`] : undefined;
    const message = document.createElement('p'); parent.append(message); let active = true, url: string | undefined;
    if (!value || entity?.kind !== 'attachment') message.textContent = 'REFERENCE_INVALID: この対象版の素材bytesを確認できません。';
    else void (async () => {
      const bytes = Uint8Array.from(atob(value.base64), letter => letter.charCodeAt(0)), checked = await prepareAsset(bytes, '公開素材', value.mediaType);
      if (checked.contentHash !== entity.data.contentHash || checked.byteSize !== entity.data.byteSize || checked.mediaType !== entity.data.mediaType) throw Error('INTEGRITY_FAILED: この対象版の素材hash・形式・サイズが一致しません。');
      if (!active || !parent.isConnected) return;
      url = URL.createObjectURL(new Blob([bytes], { type: value.mediaType })); urls.add(url);
      const element = document.createElement(value.mediaType.startsWith('image/') ? 'img' : value.mediaType.startsWith('audio/') ? 'audio' : value.mediaType.startsWith('video/') ? 'video' : 'a');
      if (element instanceof HTMLImageElement) { element.src = url; element.alt = entity.name; }
      else if (element instanceof HTMLMediaElement) { element.src = url; element.controls = true; }
      else if (element instanceof HTMLAnchorElement) { element.href = url; element.download = entity.data.displayName || entity.name; element.textContent = '資料ファイルを保存'; }
      message.replaceWith(element);
    })().catch(cause => { if (active) message.textContent = (cause as Error).message; });
    return () => { active = false; if (url) { URL.revokeObjectURL(url); urls.delete(url); } };
  };
}
