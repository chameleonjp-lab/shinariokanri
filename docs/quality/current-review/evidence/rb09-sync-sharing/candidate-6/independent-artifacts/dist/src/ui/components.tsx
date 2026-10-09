import { useEffect, useRef, type ReactNode } from 'react';

export type IconName = 'timeline' | 'structure' | 'people' | 'search' | 'work' | 'plus' | 'arrow' | 'back' | 'check' | 'menu' | 'close' | 'download' | 'upload' | 'more' | 'note' | 'flag' | 'link' | 'play' | 'sun' | 'moon' | 'folder' | 'spark' | 'clock';

const paths: Record<IconName, ReactNode> = {
  timeline: <><path d="M4 5v14M10 5v14M16 5v14M3 8h8M9 14h10"/><circle cx="16" cy="8" r="2"/></>,
  structure: <><rect x="3" y="3" width="7" height="5" rx="1"/><rect x="14" y="14" width="7" height="5" rx="1"/><path d="M6.5 8v9H14M13 5.5h8M17 9v5"/></>,
  people: <><circle cx="9" cy="7" r="3"/><path d="M3 20v-3a6 6 0 0 1 12 0v3M16 4a3 3 0 0 1 0 6M17 13a5 5 0 0 1 4 5v2"/></>,
  search: <><circle cx="10.5" cy="10.5" r="6.5"/><path d="m16 16 5 5"/></>,
  work: <><rect x="3" y="6" width="18" height="15" rx="2"/><path d="M8 6V3h8v3M3 12h18M10 11v3h4v-3"/></>,
  plus: <path d="M12 5v14M5 12h14"/>,
  arrow: <path d="M5 12h14m-6-6 6 6-6 6"/>,
  back: <path d="M19 12H5m6-6-6 6 6 6"/>,
  check: <path d="m5 12 4 4L19 6"/>,
  menu: <path d="M4 6h16M4 12h16M4 18h16"/>,
  close: <path d="m6 6 12 12M18 6 6 18"/>,
  download: <><path d="M12 3v12m-5-5 5 5 5-5M4 16v5h16v-5"/></>,
  upload: <><path d="M12 16V4m-5 5 5-5 5 5M4 16v5h16v-5"/></>,
  more: <><circle cx="5" cy="12" r="1"/><circle cx="12" cy="12" r="1"/><circle cx="19" cy="12" r="1"/></>,
  note: <><path d="M6 3h9l4 4v14H6zM14 3v5h5M9 12h7M9 16h5"/></>,
  flag: <><path d="M5 21V3m0 1h13l-3 4 3 4H5"/></>,
  link: <><path d="m9 15 6-6M8 13l-2 2a3 3 0 0 0 4 4l3-3M16 11l2-2a3 3 0 0 0-4-4l-3 3"/></>,
  play: <><circle cx="12" cy="12" r="9"/><path d="m10 8 6 4-6 4z"/></>,
  sun: <><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M2 12h2M20 12h2M5 5l1 1M18 18l1 1M5 19l1-1M18 6l1-1"/></>,
  moon: <path d="M20 15A9 9 0 0 1 9 4a9 9 0 1 0 11 11Z"/>,
  folder: <path d="M3 6h6l2 2h10v12H3z"/>,
  spark: <><path d="m12 3 2.5 6.5L21 12l-6.5 2.5L12 21l-2.5-6.5L3 12l6.5-2.5z"/><path d="M20 3v4M18 5h4"/></>,
  clock: <><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></>,
};

export function Icon({ name, size = 20 }: { name: IconName; size?: number }) {
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{paths[name]}</svg>;
}

export function EmptyState({ icon = 'note', title, children, action }: { icon?: IconName; title: string; children?: ReactNode; action?: ReactNode }) {
  return <div className="empty-state"><span className="empty-illustration"><Icon name={icon} size={32}/></span><h3>{title}</h3>{children && <p>{children}</p>}{action}</div>;
}

export function Modal({ title, children, onClose, wide = false }: { title: string; children: ReactNode; onClose: () => void; wide?: boolean }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const closeRef = useRef(onClose);
  closeRef.current = onClose;
  useEffect(() => {
    const prior = document.activeElement as HTMLElement | null;
    const node = dialog.current;
    node?.showModal();
    return () => { node?.close(); prior?.focus(); };
  }, []);
  return <dialog ref={dialog} className={`modal ${wide ? 'modal-wide' : ''}`} aria-labelledby="modal-title" onCancel={(e) => { e.preventDefault(); closeRef.current(); }} onClick={(e) => { if (e.target === e.currentTarget) closeRef.current(); }}>
    <div className="modal-heading"><h2 id="modal-title">{title}</h2><button type="button" className="icon-button" aria-label="閉じる" onClick={onClose}><Icon name="close"/></button></div>
    <div className="modal-content">{children}</div>
  </dialog>;
}

export function downloadBytes(bytes: BlobPart, fileName: string, mime = 'application/json') {
  const url = URL.createObjectURL(new Blob([bytes], { type: mime }));
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = fileName;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function safeFileName(name: string) {
  return name.replace(/[<>:"/\\|?*\u0000-\u001f]/g, '_').slice(0, 100) || '作品';
}

export const STATUS_LABELS: Record<string, string> = { confirmed: '確定', provisional: '下書き', needs_review: '確認待ち', rejected: '不採用', alternate: '別案' };
export const PROGRESS_LABELS: Record<string, string> = { todo: '未着手', doing: '進行中', done: '完了', needs_review: '確認待ち' };

export function StatusBadge({ status }: { status: string }) {
  return <span className={`status-badge status-${status}`}>{STATUS_LABELS[status] || PROGRESS_LABELS[status] || status}</span>;
}

export function fieldText(value: unknown): string {
  if (Array.isArray(value)) return value.map(v => v && typeof v === 'object' && 'text' in v ? String(v.text) : '').join('\n');
  return typeof value === 'string' ? value : '';
}

export function normalizeSearch(value: string) {
  return value.normalize('NFKC').toLocaleLowerCase('ja').replace(/[ァ-ヶ]/g, c => String.fromCharCode(c.charCodeAt(0) - 0x60)).replace(/\s+/g, '');
}
