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
  /**
   * AS1a: etapas do roteiro da versão publicada, já normalizadas e limitadas.
   * Dados de configuração do tenant, subordinados às regras; ausente quando vazio.
   */
  readonly playbook?: ConversationGuidancePlaybook | undefined;
  /** AS1a: exemplos ilustrativos da versão publicada; ausente quando vazio. */
  readonly examples?: readonly ConversationGuidanceExample[] | undefined;
}

export interface ConversationGuidanceStage {
  readonly name: string;
  readonly goal: string;
}

export interface ConversationGuidancePlaybook {
  readonly stages: readonly ConversationGuidanceStage[];
}

export interface ConversationGuidanceExample {
  readonly customerInput: string;
  readonly idealAgentResponse: string;
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
