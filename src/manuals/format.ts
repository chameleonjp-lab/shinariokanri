import { aiManualSections, humanManualSections, manualVersion } from './content.ts';

export type ManualAudience = 'human' | 'ai';

export const manualTitles: Record<ManualAudience, string> = {
  human: '人間向けマニュアル',
  ai: 'AI向けマニュアル',
};

export function manualSections(audience: ManualAudience) {
  return audience === 'human' ? humanManualSections : aiManualSections;
}

/** The downloadable and public manuals share the exact text used in the app. */
export function manualMarkdown(audience: ManualAudience): string {
  const sections = manualSections(audience);
  return [
    `# shinariokanri ${manualTitles[audience]}`,
    `版: ${manualVersion}`,
    'トップ画面と作品内メニューのマニュアルから、同じ内容を検索・参照できます。',
    '## 目次\n\n' + sections.map((section, i) => `${i + 1}. ${section.title}`).join('\n'),
    ...sections.map(section => [
      `## ${section.title}`,
      section.purpose,
      section.steps.map((step, i) => `${i + 1}. ${step}`).join('\n'),
      ...(section.notes?.length ? ['補足:\n\n' + section.notes.map(note => `- ${note}`).join('\n')] : []),
    ].join('\n\n')),
    '',
  ].join('\n\n');
}
