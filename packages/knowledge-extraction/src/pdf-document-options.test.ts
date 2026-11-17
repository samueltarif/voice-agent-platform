import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { localCMapBaseUrl, pdfDocumentOptions } from './pdf-document-options.js';
import { buildPdf } from './test-support/build-pdf-fixture.js';

const WINDOWS_DIR =
  'D:\\vap-pr166\\node_modules\\.pnpm\\pdfjs-dist@6.5.438\\node_modules\\pdfjs-dist';

/** Só a validação síncrona do `getDocument`: o pdf.js recusa a base de cMaps aqui. */
async function pdfjsAcceptsCMapUrl(cMapUrl: string): Promise<true | string> {
  const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');
  try {
    const task = pdfjs.getDocument({ data: buildPdf({ pages: [['x']] }), cMapUrl, verbosity: 0 });
    await task.destroy();
    return true;
  } catch (error) {
    return (error as Error).message;
  }
}

describe('localCMapBaseUrl — regression: Windows paths (gate da #166)', () => {
  it('Windows drive path ⇒ forward slashes and a trailing "/"', () => {
    expect(localCMapBaseUrl(WINDOWS_DIR, path.win32)).toBe(
      'D:/vap-pr166/node_modules/.pnpm/pdfjs-dist@6.5.438/node_modules/pdfjs-dist/cmaps/',
    );
  });

  it('Windows UNC path and a directory with a trailing separator', () => {
    expect(localCMapBaseUrl('\\\\srv\\share\\pdfjs-dist', path.win32)).toBe(
      '//srv/share/pdfjs-dist/cmaps/',
    );
    expect(localCMapBaseUrl(`${WINDOWS_DIR}\\`, path.win32)).toBe(
      localCMapBaseUrl(WINDOWS_DIR, path.win32),
    );
  });

  it('POSIX path stays the same path, with a trailing "/"', () => {
    expect(localCMapBaseUrl('/repo/node_modules/pdfjs-dist', path.posix)).toBe(
      '/repo/node_modules/pdfjs-dist/cmaps/',
    );
  });

  it('pdf.js refuses the old Windows form and accepts the new one (root cause)', async () => {
    const oldForm = `${path.win32.join(WINDOWS_DIR, 'cmaps')}\\`;
    expect(await pdfjsAcceptsCMapUrl(oldForm)).toContain('must include trailing slash');
    expect(await pdfjsAcceptsCMapUrl(localCMapBaseUrl(WINDOWS_DIR, path.win32))).toBe(true);
  });

  it('the document options use the converted local base on this platform', () => {
    // Caminho no formato nativo DESTA plataforma (\\ no Windows, / no Linux).
    const nativeDir = path.join(path.sep, 'repo', 'pdfjs-dist');
    expect(pdfDocumentOptions(new Uint8Array([1]), nativeDir).cMapUrl).toBe(
      '/repo/pdfjs-dist/cmaps/',
    );
  });
});
