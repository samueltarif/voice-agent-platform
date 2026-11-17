import { describe, expect, it } from 'vitest';
import {
  KNOWLEDGE_UPLOAD_ERROR_CODES as CODES,
  knowledgeExtractionResponseSchema,
} from '@voice-agent/contracts';
import { createKnowledgeUploadExtractor } from './extract-knowledge-upload.js';
import { ExtractionWorkerRunner } from './run-extraction-in-worker.js';
import { buildDocx, documentXml, paragraph, toBase64 } from './test-support/build-docx-fixture.js';

const extractor = createKnowledgeUploadExtractor(new ExtractionWorkerRunner());
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
    expect(
      await codeOf(extractor.extract({ fileName: 'a.pdf', contentBase64: b64('%PDF-1.7') })),
    ).toBe(CODES.PDF_NOT_YET_SUPPORTED);
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
});
