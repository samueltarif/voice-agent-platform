import { beforeEach, describe, expect, it } from 'vitest';
import {
  InMemoryConversationHistoryStore,
  PROPOSED_DEFAULT_MAX_TURNS,
} from './in-memory-conversation-history-store.js';

describe('InMemoryConversationHistoryStore', () => {
  let store: InMemoryConversationHistoryStore;

  const orgA = '00000000-0000-0000-0000-000000000001';
  const orgB = '00000000-0000-0000-0000-000000000002';
  const sharedCallId = '11111111-1111-1111-1111-111111111111';

  beforeEach(() => {
    store = new InMemoryConversationHistoryStore({ defaultMaxTurns: 4 });
  });

  it('appends and lists conversation turns in chronological order', async () => {
    await store.appendTurn({
      organizationId: orgA,
      callId: sharedCallId,
      turnId: 'turn-1',
      role: 'user',
      content: 'Olá!',
    });
    await store.appendTurn({
      organizationId: orgA,
      callId: sharedCallId,
      turnId: 'turn-1',
      role: 'assistant',
      content: 'Olá! Como posso ajudar?',
    });

    const turns = await store.listForCall({ organizationId: orgA, callId: sharedCallId });
    expect(turns).toHaveLength(2);
    expect(turns[0]?.role).toBe('user');
    expect(turns[0]?.content).toBe('Olá!');
    expect(turns[1]?.role).toBe('assistant');
    expect(turns[1]?.content).toBe('Olá! Como posso ajudar?');
  });

  it('strictly isolates memory by organizationId even when callId is identical', async () => {
    await store.appendTurn({
      organizationId: orgA,
      callId: sharedCallId,
      turnId: 'turn-org-a',
      role: 'user',
      content: 'Dados confidenciais da Organização A',
    });
    await store.appendTurn({
      organizationId: orgB,
      callId: sharedCallId,
      turnId: 'turn-org-b',
      role: 'user',
      content: 'Dados confidenciais da Organização B',
    });

    const turnsA = await store.listForCall({ organizationId: orgA, callId: sharedCallId });
    const turnsB = await store.listForCall({ organizationId: orgB, callId: sharedCallId });

    expect(turnsA).toHaveLength(1);
    expect(turnsA[0]?.content).toBe('Dados confidenciais da Organização A');

    expect(turnsB).toHaveLength(1);
    expect(turnsB[0]?.content).toBe('Dados confidenciais da Organização B');
  });

  it('evicts oldest turns when exceeding max turns limit', async () => {
    for (let i = 1; i <= 6; i++) {
      await store.appendTurn({
        organizationId: orgA,
        callId: sharedCallId,
        turnId: `turn-${i}`,
        role: i % 2 === 1 ? 'user' : 'assistant',
        content: `Mensagem ${i}`,
      });
    }

    const turns = await store.listForCall({ organizationId: orgA, callId: sharedCallId });
    expect(turns).toHaveLength(4);
    expect(turns[0]?.content).toBe('Mensagem 3');
    expect(turns[3]?.content).toBe('Mensagem 6');
  });

  it('clears history scoped to organization and call', async () => {
    await store.appendTurn({
      organizationId: orgA,
      callId: sharedCallId,
      turnId: 'turn-1',
      role: 'user',
      content: 'Mensagem para apagar',
    });
    await store.appendTurn({
      organizationId: orgB,
      callId: sharedCallId,
      turnId: 'turn-1',
      role: 'user',
      content: 'Mensagem para preservar',
    });

    await store.clearForCall(orgA, sharedCallId);

    const turnsA = await store.listForCall({ organizationId: orgA, callId: sharedCallId });
    const turnsB = await store.listForCall({ organizationId: orgB, callId: sharedCallId });

    expect(turnsA).toHaveLength(0);
    expect(turnsB).toHaveLength(1);
  });

  it('uses default proposed limit when no options provided', () => {
    const defaultStore = new InMemoryConversationHistoryStore();
    expect(defaultStore['defaultMaxTurns']).toBe(PROPOSED_DEFAULT_MAX_TURNS);
  });
});
