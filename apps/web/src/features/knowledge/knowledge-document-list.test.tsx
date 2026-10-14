import { describe, it, expect } from 'vitest';
import { KNOWLEDGE_TEST_DOC, renderKnowledgeList } from './knowledge-test-fixtures';

describe('KnowledgeDocumentList', () => {
  it('renders desktop table and mobile cards with accessible status text', () => {
    const html = renderKnowledgeList();
    expect(html).toContain('Política de trocas e devoluções');
    expect(html).toContain('Pronto');
    expect(html).toContain('Política');
    expect(html).toContain('suporte');
    expect(html).toContain('Toda a organização');
    expect(html).toContain('13/10/2026');
    expect(html).toContain('kb-row-22222222-2222-2222-2222-222222222222');
    expect(html).toContain('kb-card-22222222-2222-2222-2222-222222222222');
    expect(html).toContain('kb-status-ready');
  });

  it('shows abbreviated agent id when the document is agent-scoped', () => {
    const html = renderKnowledgeList({
      documents: [{ ...KNOWLEDGE_TEST_DOC, agentId: 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee' }],
      canArchive: false,
    });
    expect(html).toContain('aaaaaaaa');
    expect(html).not.toContain('Toda a organização');
  });

  it('hides archive actions when canArchive is false (MANAGER view)', () => {
    const html = renderKnowledgeList({ canArchive: false });
    expect(html).not.toContain('Arquivar');
    expect(html).not.toContain('Ações para');
  });

  it('shows archive action for archivable documents when permitted', () => {
    const html = renderKnowledgeList();
    expect(html).toContain('Arquivar');
  });

  it('renders empty state with ingest CTA when unfiltered and permitted', () => {
    const html = renderKnowledgeList({ documents: [], canArchive: false });
    expect(html).toContain('Nenhum documento cadastrado ainda');
    expect(html).toContain('Adicionar conhecimento');
  });

  it('renders filtered empty state with clear-filters action', () => {
    const html = renderKnowledgeList({
      documents: [],
      canArchive: false,
      filters: { status: 'READY', collection: '' },
    });
    expect(html).toContain('Nenhum documento encontrado');
    expect(html).toContain('Limpar filtros');
  });

  it('renders loading skeleton with accessible announcement', () => {
    const html = renderKnowledgeList({ documents: [], isLoading: true, canArchive: false });
    expect(html).toContain('kb-loading');
    expect(html).toContain('Carregando documentos');
  });

  it('enables next page only when the page arrived full (no invented total)', () => {
    const full = Array.from({ length: 20 }, (_, i) => ({ ...KNOWLEDGE_TEST_DOC, id: `doc-${i}` }));
    const fullHtml = renderKnowledgeList({ documents: full, canArchive: false });
    expect(fullHtml).toContain('Página');
    expect(fullHtml).toContain('Próxima');
    const partialHtml = renderKnowledgeList({ documents: [KNOWLEDGE_TEST_DOC], canArchive: false });
    expect(partialHtml).toContain('Página');
    expect(partialHtml).toContain('disabled');
  });
});
