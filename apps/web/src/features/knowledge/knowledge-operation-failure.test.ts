import { describe, it, expect } from 'vitest';
import { describeKnowledgeFailure } from './knowledge-operation-failure';

describe('describeKnowledgeFailure', () => {
  it('uses the safe server message and flags stale versions for reload', () => {
    const failure = describeKnowledgeFailure({
      status: 409,
      code: 'KNOWLEDGE_STALE_UPDATE',
      message: 'O documento foi alterado depois que a lista foi carregada.',
    });
    expect(failure).toMatchObject({ status: 409, reloadHint: true });
    expect(failure.message).toContain('foi alterado');
  });

  it('explains network, session, permission and not-found failures', () => {
    expect(describeKnowledgeFailure(new TypeError('Failed to fetch')).message).toContain(
      'Sem conexão',
    );
    expect(describeKnowledgeFailure({ status: 401 }).message).toContain('sessão expirou');
    expect(describeKnowledgeFailure({ status: 403, message: 'x' }).message).toContain(
      'não permite',
    );
    expect(describeKnowledgeFailure({ status: 404 }).message).toContain('não encontrado');
  });

  it('flags organization changes for reload and has a generic fallback', () => {
    expect(describeKnowledgeFailure({ status: 409, code: 'ORG_CONTEXT_MISMATCH' }).reloadHint).toBe(
      true,
    );
    expect(describeKnowledgeFailure({ status: 500 }).message).toBe(
      'Não foi possível concluir a operação.',
    );
  });
});
