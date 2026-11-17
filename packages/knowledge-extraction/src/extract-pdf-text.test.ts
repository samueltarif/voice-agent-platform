import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { KNOWLEDGE_UPLOAD_ERROR_CODES as CODES } from '@voice-agent/contracts';
import { extractPdfText } from './extract-pdf-text.js';
import { pdfjsDirectory } from './child-launch.js';
import { pdfDocumentOptions } from './pdf-document-options.js';
import {
  buildPdf,
  flateBomb,
  latin1Bytes,
  serializePdf,
} from './test-support/build-pdf-fixture.js';
import { buildEncryptedPdf } from './test-support/build-encrypted-pdf.js';

const pdfjsDir = pdfjsDirectory(
  path.resolve(fileURLToPath(new URL('.', import.meta.url)), '../..'),
);
const extract = (bytes: Uint8Array) => extractPdfText(bytes, { pdfjsDir, maxRssMb: 4096 });
const LINE = 'Transmissor de pressão QT-310';

async function codeOf(promise: Promise<unknown>) {
  try {
    await promise;
  } catch (error) {
    return (error as { code?: string }).code;
  }
  return 'NO_ERROR';
}

/** Abre com o pdf.js e a senha dada: prova que o arquivo de teste é cifrado de verdade. */
async function openWithPassword(bytes: Uint8Array, password: string) {
  const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');
  // O pdf.js transfere o buffer recebido: usa uma cópia para não esvaziar o original.
  const task = pdfjs.getDocument({ ...pdfDocumentOptions(bytes.slice(), pdfjsDir), password });
  const doc = await task.promise;
  const page = await (await doc.getPage(1)).getTextContent();
  await task.destroy();
  return page.items.map((i) => ('str' in i ? i.str : '')).join('');
}

describe('extractPdfText — searchable text', () => {
  it('keeps text, accents, line breaks and page separation (compressed streams)', async () => {
    const bytes = buildPdf({
      pages: [[LINE, 'Faixa 0 a 10 bar'], ['Página três: válvulas']],
      compress: true,
    });
    expect(await extract(bytes)).toEqual({
      text: `${LINE}\nFaixa 0 a 10 bar\n\nPágina três: válvulas`,
      pdf: { pages: 2, pagesWithoutText: 0 },
    });
  });

  it('decodes CID (CJK) text with LOCAL cMaps only', async () => {
    const content = latin1Bytes(
      `BT /F1 12 Tf 72 720 Td (${LINE}) Tj ET BT /F2 12 Tf 72 690 Td <65E5672C> Tj ET`,
    );
    const bytes = serializePdf([
      { dict: '<< /Type /Catalog /Pages 2 0 R >>' },
      { dict: '<< /Type /Pages /Kids [3 0 R] /Count 1 >>' },
      {
        dict: '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R /Resources << /Font << /F1 5 0 R /F2 6 0 R >> >> >>',
      },
      { dict: '<< >>', stream: content },
      { dict: '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>' },
      {
        dict: '<< /Type /Font /Subtype /Type0 /BaseFont /KozMinPr6N-Regular /Encoding /UniJIS-UCS2-H /DescendantFonts [7 0 R] >>',
      },
      {
        dict: '<< /Type /Font /Subtype /CIDFontType0 /BaseFont /KozMinPr6N-Regular /CIDSystemInfo << /Registry (Adobe) /Ordering (Japan1) /Supplement 6 >> >>',
      },
    ]);
    expect((await extract(bytes)).text).toMatch(new RegExp(`^${LINE}\\s+日本$`));
  });

  it('partially scanned: accepted, counting pages without text', async () => {
    expect((await extract(buildPdf({ pages: [[LINE], null, null] }))).pdf).toEqual({
      pages: 3,
      pagesWithoutText: 2,
    });
  });
});

describe('extractPdfText — encryption is detected with REAL encrypted files', () => {
  it('user password: the file really is encrypted, and extraction refuses it', async () => {
    const bytes = buildEncryptedPdf({ lines: [LINE], userPassword: 'abc', ownerPassword: 'own' });
    expect(await openWithPassword(bytes, 'abc')).toBe(LINE);
    await expect(openWithPassword(bytes, 'wrong')).rejects.toMatchObject({
      name: 'PasswordException',
    });
    expect(await codeOf(extract(bytes))).toBe(CODES.PDF_ENCRYPTED);
  });

  it('owner password only (copy restriction): opens without password, still refused', async () => {
    const bytes = buildEncryptedPdf({ lines: [LINE], userPassword: '', ownerPassword: 'own' });
    expect(await openWithPassword(bytes, '')).toBe(LINE);
    expect(await codeOf(extract(bytes))).toBe(CODES.PDF_ENCRYPTED);
  });

  it('hex-escaped /Encr#79pt key (missed by the byte scan) is still refused in the child', async () => {
    const bytes = buildEncryptedPdf({
      lines: [LINE],
      userPassword: '',
      ownerPassword: 'own',
      encryptKeyName: '/Encr#79pt',
    });
    expect(await openWithPassword(bytes, '')).toBe(LINE);
    expect(await codeOf(extract(bytes))).toBe(CODES.PDF_ENCRYPTED);
  });
});

describe('extractPdfText — safe refusals', () => {
  it('scanned (image only) ⇒ PDF_NO_TEXT; XFA form without page text ⇒ PDF_XFA_UNSUPPORTED', async () => {
    expect(await codeOf(extract(buildPdf({ pages: [null, null] })))).toBe(CODES.PDF_NO_TEXT);
    const xfa = buildPdf({
      pages: [null],
      catalogExtra: '/AcroForm << /Fields [] /XFA 5 0 R >>',
      extraObjects: [
        { dict: '<< >>', stream: latin1Bytes('<xdp:xdp xmlns:xdp="http://ns.adobe.com/xdp/"/>') },
      ],
    });
    expect(await codeOf(extract(xfa))).toBe(CODES.PDF_XFA_UNSUPPORTED);
  });

  it('too many pages ⇒ PDF_TOO_MANY_PAGES; a lying /Count never makes it read more', async () => {
    const many = buildPdf({ pages: Array.from({ length: 301 }, () => [LINE]) });
    expect(await codeOf(extract(many))).toBe(CODES.PDF_TOO_MANY_PAGES);
    const lying = buildPdf({ pages: [[LINE]], declaredCount: 100_000 });
    // O pdf.js conta as páginas reais da árvore, não o /Count declarado.
    expect((await extract(lying)).pdf).toEqual({ pages: 1, pagesWithoutText: 0 });
  }, 30_000);

  it('Flate bomb is refused before the parser (ARCHIVE_LIMIT_EXCEEDED)', async () => {
    const bomb = buildPdf({
      pages: [[LINE]],
      extraObjects: [{ dict: '<< /Filter /FlateDecode >>', stream: flateBomb(210 * 1024 * 1024) }],
    });
    expect(await codeOf(extract(bomb))).toBe(CODES.ARCHIVE_LIMIT_EXCEEDED);
  }, 30_000);

  it('corrupted structure ⇒ MALFORMED_FILE; huge text ⇒ TEXT_TOO_LONG', async () => {
    const garbage = latin1Bytes(`%PDF-1.7\n${'@#$%^&*'.repeat(300)}\n%%EOF\n`);
    expect(await codeOf(extract(garbage))).toBe(CODES.MALFORMED_FILE);
    // ~45 linhas visíveis por página (o pdf.js ignora texto fora da página).
    const long = buildPdf({
      pages: Array.from({ length: 100 }, () => Array(45).fill('x'.repeat(100))),
    });
    expect(await codeOf(extract(long))).toBe(CODES.TEXT_TOO_LONG);
  }, 30_000);
});
