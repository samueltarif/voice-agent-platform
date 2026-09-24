const packagesDistDir = new URL('./dist/packages/', import.meta.url);
const rootPackagesDir = new URL('../../packages/', import.meta.url);

export async function resolve(specifier, context, nextResolve) {
  // If importing a workspace package @voice-agent/<pkg>, point to compiled dist
  if (specifier.startsWith('@voice-agent/')) {
    const pkgName = specifier.slice('@voice-agent/'.length);
    const targetUrl = new URL(`./${pkgName}/src/index.js`, packagesDistDir).href;
    return {
      url: targetUrl,
      shortCircuit: true,
      format: 'module',
    };
  }

  // If a file inside dist/packages/<pkg>/ imports a bare package, resolve from packages/<pkg>/
  if (
    context.parentURL &&
    !specifier.startsWith('.') &&
    !specifier.startsWith('/') &&
    !specifier.startsWith('file:')
  ) {
    const match = context.parentURL.match(
      /[/\\]apps[/\\]api[/\\]dist[/\\]packages[/\\]([^/\\]+)[/\\]/,
    );
    if (match && match[1]) {
      const pkgName = match[1];
      const redirectedParent = new URL(`./${pkgName}/src/index.js`, rootPackagesDir).href;
      return nextResolve(specifier, {
        ...context,
        parentURL: redirectedParent,
      });
    }
  }

  return nextResolve(specifier, context);
}
