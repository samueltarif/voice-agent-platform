import { describe, expect, it } from 'vitest';
import type { KnowledgeSimulatedTurnResponse } from '@voice-agent/contracts';
import {
  appendSimulatedTurn,
  sendableQuestion,
  SIMULATED_HISTORY_MAX_TURNS,
  SIMULATED_QUESTION_MAX_CHARS,
  type SimulatedConversationEntry,
} from './use-simulated-conversation';

const response = {} as KnowledgeSimulatedTurnResponse;
const entry = (id: number): SimulatedConversationEntry => ({ id, question: `q${id}`, response });

describe('simulated conversation limits (DEC-061)', () => {
  it('keeps only the most recent turns in the on-screen history', () => {
    let history: SimulatedConversationEntry[] = [];
    for (let id = 1; id <= SIMULATED_HISTORY_MAX_TURNS + 5; id += 1) {
      history = appendSimulatedTurn(history, entry(id));
    }
    expect(SIMULATED_HISTORY_MAX_TURNS).toBe(20);
    expect(history).toHaveLength(20);
    expect(history[0]!.id).toBe(6);
    expect(history.at(-1)!.id).toBe(25);
  });

  it('only sends non-empty questions within the contract limit, trimmed', () => {
    expect(SIMULATED_QUESTION_MAX_CHARS).toBe(300);
    expect(sendableQuestion('  transmissor  ')).toBe('transmissor');
    expect(sendableQuestion('   ')).toBeNull();
    expect(sendableQuestion('x'.repeat(300))).toHaveLength(300);
    expect(sendableQuestion('x'.repeat(301))).toBeNull();
  });
});
