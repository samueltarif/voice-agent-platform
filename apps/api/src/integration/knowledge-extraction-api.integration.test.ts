import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  KNOWLEDGE_UPLOAD_ERROR_CODES as CODES,
  KNOWLEDGE_UPLOAD_LIMITS,
  type KnowledgeExtractionResponse,
  type KnowledgeRetrievalPreview,
} from '@voice-agent/contracts';
import { knowledgeDocuments } from '@voice-agent/database';
import { createDisposableTestDatabase } from '@voice-agent/database/test-support';
import {
  buildDocx,
  documentXml,
  paragraph,
  toBase64,
} from '@voice-agent/knowledge-extraction/test-support';
import {
  createExtractionHarness,
  type ExtractionHarness,
} from './knowledge-extraction-api-harness.js';

const tdb = await createDisposableTestDatabase('knowledge-extraction-api');
const FILE_NAME = 'Catalogo-Sigiloso-Qualitec.docx';
const PATH = '/v1/knowledge/extractions';
const CATALOG = documentXml(
  paragraph('Transmissores de pressão Qualitec') +
    paragraph('Transmissor QT-310 para pressão manométrica.') +
    paragraph('Transmissor QT-520 para pressão diferencial.'),
);

/**
 * DEC-065 — envio de arquivo: HTTP real + worker real + PostgreSQL descartável.
 * A extração não grava nada; só a confirmação (ingestão existente) persiste.
 */
describe('POST /v1/knowledge/extractions (HTTP + worker + PostgreSQL)', () => {
  let h: ExtractionHarness;
  const fetchSpy = vi.fn(async () => {
    throw new Error('network is not allowed');
  });
  const originalFetch = globalThis.fetch;

  beforeAll(async () => {
    h = await createExtractionHarness(tdb.db);
    globalThis.fetch = fetchSpy as unknown as typeof fetch;
  }, 180_000);

  afterAll(async () => {
    globalThis.fetch = originalFetch;
    await tdb.drop();
  }, 60_000);

  beforeEach(() => {
    h.setRole('OWNER');
    h.extractSpy.mockClear();
  });

  const extract = (fileName: string, bytes: Uint8Array, orgId?: string) =>
    h.call(PATH, { fileName, contentBase64: toBase64(bytes) }, { orgId });
  const documentCount = async () =>
    (await tdb.db.select({ id: knowledgeDocuments.id }).from(knowledgeDocuments)).length;
  const errorCode = async (res: Response) =>
    ((await res.json()) as { error: { code: string } }).error.code;
  const search = async (queryText: string, orgId?: string) =>
    (
      (await (
        await h.call('/v1/knowledge/retrieval-preview', { queryText }, { orgId })
      ).json()) as KnowledgeRetrievalPreview
    ).hits;

  it('DOCX → read-only preview → confirmed ingestion → retrieval finds the transmitters', async () => {
    const res = await extract(FILE_NAME, buildDocx({ document: CATALOG }));
    expect(res.status).toBe(200);
    const preview = (await res.json()) as KnowledgeExtractionResponse;
    expect(preview.text).toContain('QT-310');
    expect(await documentCount()).toBe(0);
    const ingest = await h.call('/v1/knowledge/documents', {
      title: preview.suggestedTitle,
      source: { sourceType: 'PRODUCT_MANUAL', locator: preview.suggestedLocator },
      rawText: preview.text,
    });
    expect(ingest.status).toBe(201);
    const excerpts = (await search('transmissores de pressão')).map((hit) => hit.excerpt).join(' ');
    expect(excerpts).toContain('QT-310');
    expect(excerpts).toContain('QT-520');
    expect(await search('transmissores', h.orgB)).toEqual([]);
  }, 60_000);

  it('same name with different content is a 409 conflict on confirmation (D-A4)', async () => {
    const res = await h.call('/v1/knowledge/documents', {
      title: 'Catalogo',
      source: { sourceType: 'PRODUCT_MANUAL', locator: `arquivo:${FILE_NAME}` },
      rawText: 'Outro conteúdo totalmente diferente.',
    });
    expect(res.status).toBe(409);
  });

  it('authentication, organization and knowledge.ingest come before any processing', async () => {
    const bytes = buildDocx({ document: CATALOG });
    for (const role of ['OPERATOR', 'VIEWER'] as const) {
      h.setRole(role);
      expect((await extract(FILE_NAME, bytes)).status).toBe(403);
    }
    h.setRole('OWNER');
    const stranger = '99999999-9999-4999-8999-999999999999';
    expect((await extract(FILE_NAME, bytes, stranger)).status).toBe(403);
    expect((await h.anonymous(PATH)).status).toBe(401);
    expect(h.extractSpy).not.toHaveBeenCalled();
  });

  it('refuses malicious, mismatched and malformed uploads with 422 and a code', async () => {
    const macro = buildDocx({ extra: { 'word/vbaProject.bin': new Uint8Array(4) } });
    expect(await errorCode(await extract('a.docx', macro))).toBe(CODES.MACRO_ENABLED);
    const xxe = buildDocx({ document: '<!DOCTYPE x [<!ENTITY e SYSTEM "file:///etc/passwd">]>' });
    const xxeRes = await extract('a.docx', xxe);
    expect(xxeRes.status).toBe(422);
    expect(await errorCode(xxeRes)).toBe(CODES.UNSAFE_XML);
    const pdf = await extract('a.pdf', new TextEncoder().encode('%PDF-1.7'));
    expect(await errorCode(pdf)).toBe(CODES.PDF_NOT_YET_SUPPORTED);
    const bad = await h.call(PATH, { fileName: 'a.txt', contentBase64: 'a b' });
    expect(await errorCode(bad)).toBe(CODES.INVALID_ENCODING);
  }, 60_000);

  it('rejects unknown fields (400) and oversized bodies (413) without extracting', async () => {
    const extra = await h.call(PATH, { fileName: 'a.txt', contentBase64: 'YQ==', x: 1 });
    expect(extra.status).toBe(400);
    const raw = 'x'.repeat(KNOWLEDGE_UPLOAD_LIMITS.maxRequestBodyBytes + 1);
    const tooBig = await h.call(PATH, null, { raw });
    expect(tooBig.status).toBe(413);
    expect(await errorCode(tooBig)).toBe(CODES.TOO_LARGE);
    expect(h.extractSpy).not.toHaveBeenCalled();
    expect(await documentCount()).toBe(1);
  });

  it('never logs the file name or its content, and never touches the network', () => {
    const all = h.logged.join('\n');
    expect(all).not.toContain('Sigiloso');
    expect(all).not.toContain('QT-310');
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});
