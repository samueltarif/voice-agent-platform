import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

export async function resolve(specifier, context, nextResolve) {
  try {
    return await nextResolve(specifier, context);
  } catch (error) {
    if (!specifier.endsWith('.js') || !context.parentURL) throw error;
    const candidate = new URL(specifier.replace(/\.js$/, '.ts'), context.parentURL);
    if (candidate.protocol !== 'file:' || !existsSync(fileURLToPath(candidate))) throw error;
    return nextResolve(candidate.href, context);
  }
}
