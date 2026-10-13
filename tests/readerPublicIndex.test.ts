import { describe, expect, it } from 'vitest';
import { renderReaderHtml, renderReaderMarkdown } from '../src/domain/exports';
import type { PublicProjection } from '../src/domain/projection';

describe('reader public index artifacts', () => {
  const projection: PublicProjection = {
    format: 'scenario-projection', formatVersion: '1.0.0', title: '公開索引', calendars: [], relations: [], searchIndex: [],
    entities: [
      { id: 'public-person', kind: 'character', name: '公開名<&>', status: 'confirmed', data: { reading: 'あおい', body: [{ id: 'public-paragraph', kind: 'paragraph', text: '公開された説明。' }], aliases: ['SECRET_ALIAS'], authorNotes: [{ id: 'secret-notes', kind: 'paragraph', text: 'SECRET_NOTES' }], referenceCount: 17 } },
      { id: 'public-category', kind: 'group', name: '公開分類', status: 'confirmed', data: { groupType: 'category', members: ['public-person'] } },
    ],
  };

  it('links HTML index terms to the emitted paragraph and emits only public term fields', () => {
    const html = renderReaderHtml(projection);
    expect(html).toContain('<nav aria-label="五十音・分類索引">');
    expect(html).toContain('<a href="#public-paragraph">公開名&lt;&amp;&gt;</a> · あおい · 公開分類');
    expect(html).toContain('<p id="public-paragraph">公開された説明。</p>');
    for (const secret of ['SECRET_ALIAS', 'SECRET_NOTES', 'secret-notes', 'referenceCount', '17']) expect(html).not.toContain(secret);
    const targets = [...html.matchAll(/href="#([^"]+)"/g)].map(match => match[1]);
    for (const target of targets) expect(html).toContain(`id="${target}"`);
    expect(html).not.toContain('href="#public-category"');
  });

  it('uses public paragraph IDs in Markdown and scopes citation IDs to the emitted edition', () => {
    const md = renderReaderMarkdown(projection);
    expect(md).toContain('## 五十音・分類索引'); expect(md).toContain('](#public-paragraph) · あおい · 公開分類');
    expect(md).toContain('<a id="public-paragraph"></a>');
    for (const secret of ['SECRET_ALIAS', 'SECRET_NOTES', 'secret-notes', 'referenceCount', '17']) expect(md).not.toContain(secret);
    const cited = { ...projection, versions: [{ id: 'published-1', projection }] };
    const html = renderReaderHtml(cited);
    expect(html).toContain('href="#published-1--public-paragraph"'); expect(html).toContain('id="published-1--public-paragraph"');
    expect(renderReaderMarkdown(cited)).toContain('](#published-1--public-paragraph)');
  });
});
