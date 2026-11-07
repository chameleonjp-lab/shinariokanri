import { useState } from 'react';
import { RoleRehearsal } from './RoleRehearsal';
import { VIDEO_KIND_LABELS } from '../domain/videoScript';
import type { ContentAnchor, ProjectData } from '../domain/types';
import { adoptedRecord } from '../domain/adoption';
import { labelOf, RichTextView } from './Fields';

export function DialoguePresentation({ project, lineIds, vertical, onOpenTarget }: { project: ProjectData; lineIds: string[]; vertical: boolean; onOpenTarget: (anchor: ContentAnchor) => void }) {
  const [page, setPage] = useState(0), [practicing,setPracticing]=useState(false), count = 60, maximum = Math.max(0, Math.ceil(lineIds.length / count) - 1), current = Math.min(page, maximum);
  if (!lineIds.length) return null;
  return <section aria-label="場面の台詞"><label className="check-label"><input type="checkbox" checked={practicing} onChange={e=>setPracticing(e.target.checked)}/>収録前に役を練習</label>{practicing?<RoleRehearsal key={`${project.projectId}:${project.revision}`} project={project} lineIds={lineIds} vertical={vertical} onOpenTarget={onOpenTarget}/>:<><p>台詞 {lineIds.length}件 · {current + 1} / {maximum + 1}ページ</p>{lineIds.slice(current * count, (current + 1) * count).map(id => { const line = project.entities.find(entity => entity.id === id && entity.kind === 'dialogue_line' && adoptedRecord(entity)); if (!line || line.kind !== 'dialogue_line') return <p key={id}>台詞の対象版を確認してください。</p>; return <article key={id}><button className="text-button" onClick={() => onOpenTarget({ entityId: id })}>{VIDEO_KIND_LABELS[line.data.scriptKind??'dialogue']} {line.data.scriptNumber??''} · {labelOf(project.entities.find(entity => entity.id === line.data.speakerId))} · {labelOf(line)}</button><RichTextView value={line.data.text} vertical={vertical} onOpenTarget={onOpenTarget}/></article>; })}{maximum > 0 && <div className="pagination"><button className="button secondary small" disabled={current === 0} onClick={() => setPage(current - 1)}>前の台詞</button><button className="button secondary small" disabled={current === maximum} onClick={() => setPage(current + 1)}>次の台詞</button></div>}</>}</section>;
}
