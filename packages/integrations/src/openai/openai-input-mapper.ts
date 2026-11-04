import type { AuthoritativeInstructions, ConversationModelInput } from '@voice-agent/contracts';
import { composeConversationGuidance } from '@voice-agent/contracts';
import type { OpenAiChatMessage } from './openai-chat-completion-types.js';
import { renderGuidanceSections } from './openai-guidance-prompt.js';

export function buildSystemPrompt(instructions: AuthoritativeInstructions): string {
  const parts: string[] = [
    `Papel: ${instructions.persona.role}`,
    instructions.persona.companyName ? `Empresa: ${instructions.persona.companyName}` : '',
    `Objetivo: ${instructions.persona.objective}`,
    `Tom: ${instructions.persona.tone}`,
    `Idioma: ${instructions.languageCode}`,
    'Regras de Conversação:',
    ...instructions.rules.conversational.map((rule) => `- ${rule}`),
    ...renderGuidanceSections(instructions),
  ];

  return parts.filter(Boolean).join('\n');
}

/** Caminho sem contexto composto: mesma hierarquia e mesmos limites do principal. */
function buildFallbackSystemPrompt(input: ConversationModelInput): string {
  const snapshot = input.agentSnapshot;
  return buildSystemPrompt({
    persona: snapshot.persona,
    languageCode: snapshot.voice?.languageCode ?? 'pt-BR',
    rules: { conversational: snapshot.rules.conversational ?? [] },
    ...composeConversationGuidance(snapshot).guidance,
  });
}

export function mapConversationInputToOpenAiMessages(
  input: ConversationModelInput,
): readonly OpenAiChatMessage[] {
  if (input.context) {
    const systemPrompt = buildSystemPrompt(input.context.instructions);
    const messages: OpenAiChatMessage[] = [{ role: 'system', content: systemPrompt }];

    for (const record of input.context.history) {
      messages.push({ role: record.role, content: record.content });
    }

    if (input.context.currentInput?.text) {
      messages.push({ role: 'user', content: input.context.currentInput.text });
    }

    return messages;
  }

  const hasSystem = input.messages.some((m) => m.role === 'system');
  const messages: OpenAiChatMessage[] = [];

  if (!hasSystem && input.agentSnapshot) {
    messages.push({ role: 'system', content: buildFallbackSystemPrompt(input) });
  }

  for (const msg of input.messages) {
    messages.push({ role: msg.role, content: msg.content });
  }

  return messages;
}
