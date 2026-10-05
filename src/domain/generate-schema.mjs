import { registerHooks } from 'node:module';
import { writeFile } from 'node:fs/promises';

// Node's type stripping loads the same registry used by the application.
registerHooks({ resolve(specifier, context, nextResolve) {
  try { return nextResolve(specifier, context); }
  catch (error) { if (specifier.startsWith('.') && !/\.[a-z]+$/.test(specifier)) return nextResolve(`${specifier}.ts`, context); throw error; }
} });
const { toJsonSchema } = await import('./model.ts');
await writeFile(new URL('./schema.json', import.meta.url), `${JSON.stringify(toJsonSchema(), null, 2)}\n`);
