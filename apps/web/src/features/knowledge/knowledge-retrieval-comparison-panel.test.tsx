import * as React from 'react';
import { renderToString } from 'react-dom/server';
import { describe, it, expect } from 'vitest';
import type { KnowledgeRetrievalPreview } from '@voice-agent/contracts';
import {
  KnowledgeRetrievalComparisonPanel,
  KnowledgeRetrievalComparisonView,
} from './knowledge-retrieval-comparison-panel';
import type { KnowledgeRetrievalComparisonState } from './use-knowledge-retrieval-comparison';

const DOC = '22222222-2222-2222-2222-222222222222';
const base: KnowledgeRetrievalComparisonState = {
  pending: false,
  result: null,
  failure: null,
  run: async () => undefined,
};

function side(excerpt: string, extra: Partial<KnowledgeRetrievalPreview> = {}) {
  return {
    trust: 'UNTRUSTED_DATA' as const,
    mode: 'ORGANIZATION' as const,
    terms: ['qt310'],
    truncated: false,
    hits: [
      {
        citationId: `${DOC}:c:0`,
        documentId: DOC,
        documentTitle: 'Catálogo',
        chunkOrdinal: 0,
        sourceType: 'PRODUCT_MANUAL' as const,
        sourceLocator: 'catalogo.md',
        excerpt,
        score: 1,
        relevance: 'DIRECT' as const,
      },
    ],
    ...extra,
  };
}

const render = (state: Partial<KnowledgeRetrievalComparisonState>, queryText = 'QT-310') =>
  renderToString(
    <KnowledgeRetrievalComparisonView
      state={{ ...base, ...state }}
      queryText={queryText}
      agentId=""
    />,
  );

describe('KnowledgeRetrievalComparisonPanel (DEC-067)', () => {
  it('is rendered only for OWNER and ADMIN', () => {
    const preview = { queryText: 'QT-310', agentId: '' };
    for (const role of ['OWNER', 'ADMIN']) {
      const html = renderToString(
        <KnowledgeRetrievalComparisonPanel orgSlug="org-a" role={role} preview={preview} />,
      );
      expect(html).toContain('Comparar busca atual × nova busca');
    }
    for (const role of ['MANAGER', 'OPERATOR', 'VIEWER', undefined]) {
      const html = renderToString(
        <KnowledgeRetrievalComparisonPanel orgSlug="org-a" role={role} preview={preview} />,
      );
      expect(html).toBe('');
    }
  });

  it('says agents keep using the current search and disables without a question', () => {
    expect(render({})).toContain('Os agentes continuam usando a busca');
    expect(render({}, '  ')).toMatch(/<button[^>]*disabled/);
  });

  it('shows both columns, the v2 section and the missing commercial aspects', () => {
    const html = render({
      result: {
        trust: 'UNTRUSTED_DATA',
        v1: side('Trecho inteiro da v1 com QT-310.', { retrievalProfile: 'v1' }),
        v2: {
          ...side('Transmissor QT-310, 0 a 400 bar.', {
            retrievalProfile: 'v2',
            aspectsNotFound: ['PRICE', 'LEAD_TIME'],
          }),
          hits: [{ ...side('Transmissor QT-310.').hits[0]!, passageHeading: 'TRANSMISSORES' }],
        },
      },
    });
    expect(html).toContain('Busca atual (v1, em uso)');
    expect(html).toContain('Nova busca (v2, só avaliação)');
    expect(html).toContain('Seção: TRANSMISSORES');
    expect(html).toContain('Não informado nos documentos: preço, prazo');
  });

  it('renders document text as inert data and shows failures', () => {
    const html = render({
      result: { trust: 'UNTRUSTED_DATA', v1: side('<img src=x onerror=alert(1)>'), v2: side('ok') },
    });
    expect(html).not.toContain('<img');
    const failure = {
      status: 403,
      code: 'FORBIDDEN',
      message: 'Sem permissão.',
      reloadHint: false,
    };
    expect(render({ failure })).toContain('Sem permissão.');
  });
});
