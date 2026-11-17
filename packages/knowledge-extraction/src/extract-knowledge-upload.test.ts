import { describe, expect, it } from 'vitest';
import {
  KNOWLEDGE_UPLOAD_ERROR_CODES as CODES,
  knowledgeExtractionResponseSchema,
} from '@voice-agent/contracts';
import { createKnowledgeUploadExtractor } from './extract-knowledge-upload.js';
import { ExtractionProcessRunner } from './run-extraction-in-child-process.js';
import { buildDocx, documentXml, paragraph, toBase64 } from './test-support/build-docx-fixture.js';
import { buildPdf } from './test-support/build-pdf-fixture.js';

// TEST_CHANGE_REASON: DEC-066 — o runner passou de worker_threads para processo
// filho; mesmas asserções (ASSERTION_EQUIVALENT).
const extractor = createKnowledgeUploadExtractor(new ExtractionProcessRunner());
const b64 = (text: string) => Buffer.from(text, 'utf8').toString('base64');

async function codeOf(promise: Promise<unknown>) {
  try {
    await promise;
  } catch (error) {
    return (error as { code?: string }).code;
  }
  return 'NO_ERROR';
}

describe('createKnowledgeUploadExtractor', () => {
  it('returns a read-only preview for DOCX with suggestions, stats and warning', async () => {
    const body = paragraph('Transmissores de pressão') + paragraph('QT-310 e QT-520');
    const result = await extractor.extract({
      fileName: 'Catálogo Qualitec.docx',
      contentBase64: toBase64(buildDocx({ document: documentXml(body) })),
    });
    expect(knowledgeExtractionResponseSchema.parse(result)).toEqual(result);
    expect(result).toMatchObject({
      format: 'DOCX',
      fileName: 'Catálogo Qualitec.docx',
      suggestedTitle: 'Catálogo Qualitec',
      suggestedLocator: 'arquivo:Catálogo Qualitec.docx',
      text: 'Transmissores de pressão\nQT-310 e QT-520',
      stats: { chars: 40, lines: 2 },
      warnings: ['DOCX_MAIN_BODY_ONLY'],
    });
  }, 30_000);

  it('normalizes line endings and blank lines for TXT', async () => {
    const result = await extractor.extract({
      fileName: 'notas.txt',
      contentBase64: b64('\r\n  a  \r\n\r\n\r\n\r\nb\r\n'),
    });
    expect(result.text).toBe('a\n\nb');
    expect(result.warnings).toEqual([]);
  }, 30_000);

  it('refuses invalid input before starting a worker, and empty text after', async () => {
    expect(
      await codeOf(extractor.extract({ fileName: 'a.txt', contentBase64: 'not base64!' })),
    ).toBe(CODES.INVALID_ENCODING);
    // TEST_CHANGE_REASON: DEC-066 — PDF aceito; um PDF truncado (sem `%%EOF`)
    // é recusado antes do processo filho. ASSERTION_EQUIVALENT (recusa precoce).
    expect(
      await codeOf(extractor.extract({ fileName: 'a.pdf', contentBase64: b64('%PDF-1.7') })),
    ).toBe(CODES.MALFORMED_FILE);
    expect(
      await codeOf(extractor.extract({ fileName: 'a.txt', contentBase64: b64(' \n\t ') })),
    ).toBe(CODES.NO_TEXT);
  }, 30_000);

  it('refuses text longer than the ingestion limit', async () => {
    const long = 'a'.repeat(200_001);
    expect(await codeOf(extractor.extract({ fileName: 'a.md', contentBase64: b64(long) }))).toBe(
      CODES.TEXT_TOO_LONG,
    );
  }, 30_000);

  it('PDF: preview with pages, partial-scan warning and approximate order warning', async () => {
    const pdf = buildPdf({
      pages: [['Transmissores de pressao', 'QT-310 e QT-520'], null],
      compress: true,
    });
    const result = await extractor.extract({
      fileName: 'Catálogo.pdf',
      contentBase64: toBase64(pdf),
    });
    expect(knowledgeExtractionResponseSchema.parse(result)).toEqual(result);
    expect(result).toMatchObject({
      format: 'PDF',
      suggestedTitle: 'Catálogo',
      text: 'Transmissores de pressao\nQT-310 e QT-520',
      stats: { pages: 2, pagesWithoutText: 1 },
      warnings: ['PDF_PAGES_WITHOUT_TEXT', 'PDF_TEXT_ORDER_APPROXIMATE'],
    });
  }, 30_000);
});
