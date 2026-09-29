import type { AuthoritativeInstructions, ConversationModelInput } from '@voice-agent/contracts';
import type { OpenAiChatMessage } from './openai-chat-completion-types.js';

export function buildSystemPrompt(instructions: AuthoritativeInstructions): string {
  const parts: string[] = [
    `Papel: ${instructions.persona.role}`,
    instructions.persona.companyName ? `Empresa: ${instructions.persona.companyName}` : '',
    `Objetivo: ${instructions.persona.objective}`,
    `Tom: ${instructions.persona.tone}`,
    `Idioma: ${instructions.languageCode}`,
    'Regras de Conversação:',
    ...instructions.rules.conversational.map((rule) => `- ${rule}`),
  ];

  return parts.filter(Boolean).join('\n');
}

function buildFallbackSystemPrompt(input: ConversationModelInput): string {
  const persona = input.agentSnapshot.persona;
  const language = input.agentSnapshot.voice?.languageCode ?? 'pt-BR';
  const rules = input.agentSnapshot.rules.conversational ?? [];

  const parts: string[] = [
    `Papel: ${persona.role}`,
    persona.companyName ? `Empresa: ${persona.companyName}` : '',
    `Objetivo: ${persona.objective}`,
    `Tom: ${persona.tone}`,
    `Idioma: ${language}`,
    'Regras de Conversação:',
    ...rules.map((rule) => `- ${rule}`),
  ];

  return parts.filter(Boolean).join('\n');
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
