import {
  KNOWLEDGE_UPLOAD_ERROR_CODES as CODES,
  KNOWLEDGE_UPLOAD_LIMITS,
  type KnowledgeUploadErrorCode,
} from '@voice-agent/contracts';
import { KnowledgeExtractionError } from './extraction-error.js';
import { assemblePdfPageText, visibleChars } from './assemble-pdf-page-text.js';
import { assertPdfInflationWithinLimit } from './measure-pdf-inflation.js';
import { pdfDocumentOptions } from './pdf-document-options.js';
import type { ExtractionSuccess } from './extraction-job.js';

const LIMITS = KNOWLEDGE_UPLOAD_LIMITS.pdf;
const fail = (code: KnowledgeUploadErrorCode) => new KnowledgeExtractionError(code);

type PdfJs = typeof import('pdfjs-dist/legacy/build/pdf.mjs');
type PdfDocument = Awaited<ReturnType<PdfJs['getDocument']>['promise']>;

export interface PdfExtractionOptions {
  readonly pdfjsDir: string;
  readonly maxRssMb: number;
}

/** Senha exigida ⇒ criptografado; qualquer outra falha de abertura ⇒ corrompido. */
function openingFailure(error: unknown): KnowledgeExtractionError {
  if (error instanceof KnowledgeExtractionError) return error;
  const name = (error as { name?: string } | null)?.name;
  return fail(name === 'PasswordException' ? CODES.PDF_ENCRYPTED : CODES.MALFORMED_FILE);
}

/** Segunda verificação de criptografia (a 1ª é a varredura de bytes antes do filho). */
async function assertReadableDocument(doc: PdfDocument): Promise<{ xfa: boolean }> {
  const { info } = (await doc.getMetadata()) as { info: Record<string, unknown> };
  if (info['EncryptFilterName']) throw fail(CODES.PDF_ENCRYPTED);
  if (doc.numPages > LIMITS.maxPages) throw fail(CODES.PDF_TOO_MANY_PAGES);
  return { xfa: info['IsXFAPresent'] === true };
}

function assertRssWithinLimit(maxRssMb: number): void {
  if (process.memoryUsage().rss > maxRssMb * 1024 * 1024) throw fail(CODES.RESOURCE_LIMIT);
}

async function readPages(doc: PdfDocument, maxRssMb: number) {
  const pages: string[] = [];
  let chars = 0;
  let pagesWithoutText = 0;
  for (let n = 1; n <= doc.numPages; n += 1) {
    const page = await doc.getPage(n);
    const text = assemblePdfPageText((await page.getTextContent()).items);
    page.cleanup();
    if (visibleChars(text) < LIMITS.minPageTextChars) pagesWithoutText += 1;
    pages.push(text);
    chars += text.length;
    if (chars > KNOWLEDGE_UPLOAD_LIMITS.maxTextChars * 2) throw fail(CODES.TEXT_TOO_LONG);
    assertRssWithinLimit(maxRssMb);
  }
  return { text: pages.join('\n\n'), pagesWithoutText };
}

/**
 * PDF com texto pesquisável (sem OCR), executado SÓ no processo filho.
 * Lê apenas o conteúdo de texto das páginas: nada de scripts, anotações,
 * links, anexos ou formulários.
 */
export async function extractPdfText(
  bytes: Uint8Array,
  options: PdfExtractionOptions,
): Promise<ExtractionSuccess> {
  assertPdfInflationWithinLimit(bytes, LIMITS.maxInflatedBytes);
  const pdfjs: PdfJs = await import('pdfjs-dist/legacy/build/pdf.mjs');
  const task = pdfjs.getDocument(pdfDocumentOptions(bytes, options.pdfjsDir));
  try {
    const doc = await task.promise.catch((error: unknown) => {
      throw openingFailure(error);
    });
    const { xfa } = await assertReadableDocument(doc).catch((error: unknown) => {
      throw openingFailure(error);
    });
    const { text, pagesWithoutText } = await readPages(doc, options.maxRssMb);
    if (visibleChars(text) < LIMITS.minDocumentTextChars) {
      throw fail(xfa ? CODES.PDF_XFA_UNSUPPORTED : CODES.PDF_NO_TEXT);
    }
    return { text, pdf: { pages: doc.numPages, pagesWithoutText } };
  } finally {
    await task.destroy();
  }
}
