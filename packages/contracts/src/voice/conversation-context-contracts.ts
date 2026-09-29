export interface AuthoritativeInstructions {
  readonly persona: {
    readonly role: string;
    readonly companyName?: string | undefined;
    readonly objective: string;
    readonly tone: string;
    readonly greetingPhrase?: string | undefined;
    readonly closingPhrase?: string | undefined;
    readonly fallbackPhrase?: string | undefined;
  };
  readonly languageCode: string;
  readonly rules: {
    readonly conversational: readonly string[];
    readonly deterministic?: Readonly<Record<string, unknown>> | undefined;
  };
}

export interface ConversationTurnRecord {
  readonly turnId: string;
  readonly role: 'user' | 'assistant';
  readonly content: string;
  readonly timestamp: Date;
  readonly isInterrupted?: boolean | undefined;
}

export interface CallerUtterance {
  readonly turnId: string;
  readonly text: string;
  readonly trustLevel: 'UNTRUSTED_CALLER_INPUT';
}

export interface ComposedConversationContext {
  readonly organizationId: string;
  readonly callId: string;
  readonly turnId: string;
  readonly generationId: string;
  readonly instructions: AuthoritativeInstructions;
  readonly history: readonly ConversationTurnRecord[];
  readonly currentInput: CallerUtterance;
}
