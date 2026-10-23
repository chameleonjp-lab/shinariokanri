import { mkdir, writeFile } from 'node:fs/promises';
import { manualMarkdown } from '../../src/manuals/format.ts';

await mkdir('public/manuals', { recursive: true });
for (const audience of ['human', 'ai']) {
  await writeFile(`public/manuals/${audience}.md`, manualMarkdown(audience));
}
console.log('Human and AI manuals generated from the in-app content.');
