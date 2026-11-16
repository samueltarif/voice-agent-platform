import * as React from 'react';
import type { KnowledgeSimulatedTurnResponse } from '@voice-agent/contracts';
import { sendSimulatedKnowledgeTurn } from '../../../lib/knowledge/knowledge-simulated-turn-client';
import {
  describeKnowledgeFailure,
  type KnowledgeOperationFailure,
} from '../../knowledge/knowledge-operation-failure';

/** Limite da pergunta (mesmo do contrato da ferramenta). */
export const SIMULATED_QUESTION_MAX_CHARS = 300;
/** Histórico mantido só na tela (nada é salvo); turnos mais antigos saem primeiro. */
export const SIMULATED_HISTORY_MAX_TURNS = 20;

export interface SimulatedConversationEntry {
  readonly id: number;
  readonly question: string;
  readonly response: KnowledgeSimulatedTurnResponse;
}

/** Acrescenta um turno mantendo só os {@link SIMULATED_HISTORY_MAX_TURNS} mais recentes. */
export function appendSimulatedTurn(
  entries: readonly SimulatedConversationEntry[],
  entry: SimulatedConversationEntry,
): SimulatedConversationEntry[] {
  return [...entries, entry].slice(-SIMULATED_HISTORY_MAX_TURNS);
}

/** Pergunta que pode ser enviada: não vazia e dentro do limite do contrato. */
export function sendableQuestion(draft: string): string | null {
  const question = draft.trim();
  return question && question.length <= SIMULATED_QUESTION_MAX_CHARS ? question : null;
}

export interface SimulatedConversationState {
  readonly draft: string;
  readonly pending: boolean;
  readonly entries: readonly SimulatedConversationEntry[];
  readonly failure: KnowledgeOperationFailure | null;
  readonly setDraft: (value: string) => void;
  readonly send: () => Promise<void>;
}

/** Estado da conversa simulada: só em memória, uma pergunta por vez. */
export function useSimulatedConversation(input: {
  readonly orgSlug: string;
  readonly agentId: string;
}): SimulatedConversationState {
  const [draft, setDraft] = React.useState('');
  const [pending, setPending] = React.useState(false);
  const [entries, setEntries] = React.useState<SimulatedConversationEntry[]>([]);
  const [failure, setFailure] = React.useState<KnowledgeOperationFailure | null>(null);
  const nextId = React.useRef(1);

  const send = React.useCallback(async () => {
    const question = sendableQuestion(draft);
    if (!question || pending) return;
    setPending(true);
    setFailure(null);
    try {
      const response = await sendSimulatedKnowledgeTurn(input.orgSlug, {
        agentId: input.agentId,
        utterance: question,
      });
      const entry = { id: nextId.current++, question, response };
      setEntries((prev) => appendSimulatedTurn(prev, entry));
      setDraft('');
    } catch (error) {
      setFailure(describeKnowledgeFailure(error));
    } finally {
      setPending(false);
    }
  }, [draft, pending, input.orgSlug, input.agentId]);

  return { draft, pending, entries, failure, setDraft, send };
}
