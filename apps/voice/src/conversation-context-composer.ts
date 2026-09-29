import type {
  AgentConfigurationSnapshotV1,
  AuthoritativeInstructions,
  CallerUtterance,
  ComposedConversationContext,
  ConversationTurnRecord,
} from '@voice-agent/contracts';

export interface ComposeContextInput {
  readonly organizationId: string;
  readonly callId: string;
  readonly turnId: string;
  readonly generationId: string;
  readonly snapshot: AgentConfigurationSnapshotV1;
  readonly history: readonly ConversationTurnRecord[];
  readonly callerTranscript: string;
}

export class ConversationContextComposer {
  composeContext(input: ComposeContextInput): ComposedConversationContext {
    const instructions: AuthoritativeInstructions = {
      persona: {
        role: input.snapshot.persona.role,
        ...(input.snapshot.persona.companyName !== undefined
          ? { companyName: input.snapshot.persona.companyName }
          : {}),
        objective: input.snapshot.persona.objective,
        tone: input.snapshot.persona.tone,
        ...(input.snapshot.persona.greetingPhrase !== undefined
          ? { greetingPhrase: input.snapshot.persona.greetingPhrase }
          : {}),
        ...(input.snapshot.persona.closingPhrase !== undefined
          ? { closingPhrase: input.snapshot.persona.closingPhrase }
          : {}),
        ...(input.snapshot.persona.fallbackPhrase !== undefined
          ? { fallbackPhrase: input.snapshot.persona.fallbackPhrase }
          : {}),
      },
      languageCode: input.snapshot.voice?.languageCode ?? 'pt-BR',
      rules: {
        conversational: [...input.snapshot.rules.conversational],
        ...(input.snapshot.rules.deterministic !== undefined
          ? { deterministic: input.snapshot.rules.deterministic }
          : {}),
      },
    };

    const currentInput: CallerUtterance = {
      turnId: input.turnId,
      text: input.callerTranscript,
      trustLevel: 'UNTRUSTED_CALLER_INPUT',
    };

    return {
      organizationId: input.organizationId,
      callId: input.callId,
      turnId: input.turnId,
      generationId: input.generationId,
      instructions,
      history: [...input.history],
      currentInput,
    };
  }
}
