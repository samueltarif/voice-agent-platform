import type {
  AppendTurnInput,
  ConversationHistoryPort,
  ConversationHistoryQuery,
  ConversationTurnRecord,
} from '@voice-agent/contracts';

export interface InMemoryConversationHistoryStoreOptions {
  readonly defaultMaxTurns?: number | undefined;
}

export const PROPOSED_DEFAULT_MAX_TURNS = 20;

export class InMemoryConversationHistoryStore implements ConversationHistoryPort {
  private readonly store = new Map<string, ConversationTurnRecord[]>();
  private readonly defaultMaxTurns: number;

  constructor(options?: InMemoryConversationHistoryStoreOptions) {
    this.defaultMaxTurns = options?.defaultMaxTurns ?? PROPOSED_DEFAULT_MAX_TURNS;
  }

  private buildKey(organizationId: string, callId: string): string {
    return `${organizationId}:${callId}`;
  }

  async appendTurn(input: AppendTurnInput): Promise<void> {
    const key = this.buildKey(input.organizationId, input.callId);
    let turns = this.store.get(key);
    if (!turns) {
      turns = [];
      this.store.set(key, turns);
    }

    const record: ConversationTurnRecord = {
      turnId: input.turnId,
      role: input.role,
      content: input.content,
      timestamp: input.timestamp ?? new Date(),
      ...(input.isInterrupted !== undefined ? { isInterrupted: input.isInterrupted } : {}),
    };

    turns.push(record);

    if (turns.length > this.defaultMaxTurns) {
      const overflow = turns.length - this.defaultMaxTurns;
      turns.splice(0, overflow);
    }
  }

  async listForCall(query: ConversationHistoryQuery): Promise<readonly ConversationTurnRecord[]> {
    const key = this.buildKey(query.organizationId, query.callId);
    const turns = this.store.get(key) ?? [];
    const limit = query.limit ?? this.defaultMaxTurns;

    if (turns.length <= limit) {
      return [...turns];
    }
    return turns.slice(turns.length - limit);
  }

  async clearForCall(organizationId: string, callId: string): Promise<void> {
    const key = this.buildKey(organizationId, callId);
    this.store.delete(key);
  }
}
