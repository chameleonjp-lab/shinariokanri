import { useId, useRef, useState } from 'react';
import { manualVersion } from '../manuals/content';
import { manualMarkdown, manualSections, manualTitles, type ManualAudience } from '../manuals/format';
import { downloadBytes, Icon, Modal, normalizeSearch } from './components';
import './Manual.css';

export function ManualDialog({ initialAudience, onClose }: { initialAudience: ManualAudience; onClose: () => void }) {
  const [audience, setAudience] = useState(initialAudience);
  const [query, setQuery] = useState('');
  const [notice, setNotice] = useState('');
  const [copyFallback, setCopyFallback] = useState(false);
  const instanceId = useId();
  const copyRef = useRef<HTMLTextAreaElement>(null);
  const sections = manualSections(audience);
  const terms = query.normalize('NFKC').trim().split(/\s+/).filter(Boolean).map(normalizeSearch);
  const matches = sections.filter(section => {
    const text = normalizeSearch([section.title, section.purpose, ...section.steps, ...(section.notes ?? [])].join(' '));
    return terms.every(term => text.includes(term));
  });
  const changeAudience = (next: ManualAudience) => { setAudience(next); setNotice(''); setCopyFallback(false); };
  const jump = (id: string) => document.getElementById(`${instanceId}-${audience}-${id}`)?.focus();
  async function copy() {
    try {
      await navigator.clipboard.writeText(manualMarkdown(audience));
      setCopyFallback(false); setNotice('マニュアル全文をコピーしました。');
    } catch {
      setCopyFallback(true); setNotice('下の全文を選択してコピーできます。');
      requestAnimationFrame(() => { copyRef.current?.focus(); copyRef.current?.select(); });
    }
  }
  return <Modal title="使い方マニュアル" wide onClose={onClose}>
    <div className="manual-guide">
      <p className="manual-intro">目的から使い方を探せます。編集中の作品を開いたまま確認できます。</p>
      <div className="manual-audiences" role="tablist" aria-label="マニュアルの対象">
        {(['human', 'ai'] as const).map(value => <button key={value} type="button" role="tab" id={`${instanceId}-tab-${value}`} aria-controls={`${instanceId}-panel`} aria-selected={audience === value} tabIndex={audience === value ? 0 : -1} className={`button ${audience === value ? 'primary' : 'secondary'}`} onClick={() => changeAudience(value)} onKeyDown={event => {
          if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
          event.preventDefault();
          const next = event.key === 'Home' ? 'human' : event.key === 'End' ? 'ai' : audience === 'human' ? 'ai' : 'human';
          changeAudience(next); document.getElementById(`${instanceId}-tab-${next}`)?.focus();
        }}>{manualTitles[value]}</button>)}
      </div>
      <div role="tabpanel" id={`${instanceId}-panel`} aria-labelledby={`${instanceId}-tab-${audience}`}>
        <div className="manual-tools">
          <label htmlFor={`${instanceId}-search`}>マニュアルを検索<input id={`${instanceId}-search`} type="search" placeholder="例：伏線、バックアップ、AI、翻訳" value={query} onChange={event => setQuery(event.target.value)}/></label>
          <div className="manual-actions">
            <button type="button" className="button secondary small" onClick={() => void copy()}>全文をコピー</button>
            <button type="button" className="button secondary small" onClick={() => downloadBytes(manualMarkdown(audience), `shinariokanri-${audience}-manual.md`, 'text/markdown;charset=utf-8')}><Icon name="download" size={16}/>全文を保存</button>
            <a className="text-button" href={`${import.meta.env.BASE_URL}manuals/${audience}.md`} target="_blank" rel="noopener noreferrer">テキスト版を開く<Icon name="link" size={16}/></a>
          </div>
          <p className="manual-result-count" role="status">{notice || `${sections.length}節中 ${matches.length}節を表示 · 版 ${manualVersion}`}</p>
          {copyFallback && <label>コピー用の全文<textarea ref={copyRef} readOnly rows={6} value={manualMarkdown(audience)} onFocus={event => event.target.select()}/></label>}
        </div>
        {matches.length ? <div className="manual-layout">
          <nav className="manual-toc" aria-label="マニュアルの目次"><h3>目次</h3>{matches.map(section => <button type="button" key={section.id} onClick={() => jump(section.id)}>{section.title}</button>)}</nav>
          <div className="manual-sections">{matches.map(section => <section key={section.id} aria-labelledby={`${instanceId}-${audience}-${section.id}`}>
            <h3 id={`${instanceId}-${audience}-${section.id}`} tabIndex={-1}>{section.title}</h3>
            <p>{section.purpose}</p>
            <ol>{section.steps.map((step, index) => <li key={index}>{step}</li>)}</ol>
            {!!section.notes?.length && <aside className="manual-notes" aria-label="補足"><ul>{section.notes.map((note, index) => <li key={index}>{note}</li>)}</ul></aside>}
          </section>)}</div>
        </div> : <div className="empty-state"><h3>該当する項目がありません</h3><p>別の言葉で検索するか、検索を解除して目次を確認してください。</p><button type="button" className="button secondary" onClick={() => setQuery('')}>検索を解除</button></div>}
      </div>
    </div>
  </Modal>;
}
