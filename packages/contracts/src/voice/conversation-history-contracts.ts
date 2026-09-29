import type { ConversationTurnRecord } from './conversation-context-contracts.js';

export interface AppendTurnInput {
  readonly organizationId: string;
  readonly callId: string;
  readonly turnId: string;
  readonly role: 'user' | 'assistant';
  readonly content: string;
  readonly isInterrupted?: boolean | undefined;
  readonly timestamp?: Date | undefined;
}

export interface ConversationHistoryQuery {
  readonly organizationId: string;
  readonly callId: string;
  readonly limit?: number | undefined;
}

export interface ConversationHistoryPort {
  appendTurn(input: AppendTurnInput): Promise<void>;
  listForCall(query: ConversationHistoryQuery): Promise<readonly ConversationTurnRecord[]>;
  clearForCall(organizationId: string, callId: string): Promise<void>;
}
