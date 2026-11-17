import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  bytesToBase64,
  extractKnowledgeFile,
  precheckKnowledgeFile,
} from './knowledge-extraction-client';

const file = (name: string, size: number) => new File([new Uint8Array(size).fill(0x61)], name);
const RESPONSE = {
  format: 'TXT',
  fileName: 'a.txt',
  suggestedTitle: 'a',
  suggestedLocator: 'arquivo:a.txt',
  text: 'aaa',
  stats: { bytes: 3, chars: 3, lines: 1 },
  warnings: [],
};

describe('knowledge extraction client (DEC-065)', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('encodes standard padded base64, also for large inputs', () => {
    expect(bytesToBase64(new TextEncoder().encode('Olá'))).toBe('T2zDoQ==');
    const big = new Uint8Array(200_000).fill(0xff);
    expect(bytesToBase64(big)).toBe(Buffer.from(big).toString('base64'));
  });

  it('prechecks extension and size before sending anything', () => {
    // TEST_CHANGE_REASON: DEC-066 aceita PDF até 10 MiB; acima disso continua
    // recusado antes do envio. ASSERTION_EQUIVALENT (pré-checagem por formato).
    expect(precheckKnowledgeFile(file('a.pdf', 3))).toBeNull();
    expect(precheckKnowledgeFile(file('a.pdf', 10 * 1024 * 1024 + 1))?.code).toBe(
      'KNOWLEDGE_UPLOAD_TOO_LARGE',
    );
    expect(precheckKnowledgeFile(file('a.doc', 3))?.code).toBe('KNOWLEDGE_UPLOAD_LEGACY_DOC');
    expect(precheckKnowledgeFile(file('a.exe', 3))?.code).toBe(
      'KNOWLEDGE_UPLOAD_UNSUPPORTED_FORMAT',
    );
    expect(precheckKnowledgeFile(file('a.txt', 2 * 1024 * 1024 + 1))?.code).toBe(
      'KNOWLEDGE_UPLOAD_TOO_LARGE',
    );
    expect(precheckKnowledgeFile(file('a.docx', 2 * 1024 * 1024 + 1))).toBeNull();
  });

  it('posts name + base64 with the org header and validates the response', async () => {
    const fetchMock = vi.fn(async () => Response.json({ extraction: RESPONSE }));
    vi.stubGlobal('fetch', fetchMock);
    expect(await extractKnowledgeFile('org-a', file('a.txt', 3))).toEqual(RESPONSE);
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe('/api/knowledge/extractions');
    expect((init.headers as Record<string, string>)['x-knowledge-org-slug']).toBe('org-a');
    expect(JSON.parse(init.body as string)).toEqual({ fileName: 'a.txt', contentBase64: 'YWFh' });
  });

  it('rejects malformed responses and surfaces BFF errors', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => Response.json({ extraction: { text: 1 } })),
    );
    await expect(extractKnowledgeFile('org-a', file('a.txt', 3))).rejects.toMatchObject({
      status: 502,
    });
    const refusal = {
      error: 'Documentos com macros não são aceitos.',
      code: 'KNOWLEDGE_UPLOAD_MACRO_ENABLED',
    };
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => Response.json(refusal, { status: 422 })),
    );
    await expect(extractKnowledgeFile('org-a', file('a.docx', 3))).rejects.toMatchObject({
      status: 422,
      message: refusal.error,
    });
  });
});
