/**
 * Module resolution hooks so plain `node` can run scripts that import app code.
 *
 * The app is written for a bundler: it imports `@/lib/...` and leaves off the
 * `.ts` extension. Node's own TypeScript support runs the files but resolves
 * neither, so this maps `@/` to `src/` and tries `.ts` and `/index.ts` for any
 * extensionless path. JSON imports get the attribute Node requires.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const SRC = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', 'src');

function candidates(base) {
  return [base, `${base}.ts`, `${base}.tsx`, path.join(base, 'index.ts')];
}

function existing(base) {
  return candidates(base).find((file) => fs.existsSync(file) && fs.statSync(file).isFile());
}

export async function resolve(specifier, context, nextResolve) {
  let filePath = null;

  if (specifier.startsWith('@/')) {
    filePath = existing(path.join(SRC, specifier.slice(2)));
  } else if (
    (specifier.startsWith('./') || specifier.startsWith('../')) &&
    context.parentURL?.startsWith('file:')
  ) {
    const parent = path.dirname(fileURLToPath(context.parentURL));
    const base = path.resolve(parent, specifier);
    if (!path.extname(base) || !fs.existsSync(base)) filePath = existing(base);
  }

  if (filePath) {
    const url = pathToFileURL(filePath).href;
    const attributes = filePath.endsWith('.json') ? { type: 'json' } : context.importAttributes;
    return { url, shortCircuit: true, importAttributes: attributes };
  }
  return nextResolve(specifier, context);
}
