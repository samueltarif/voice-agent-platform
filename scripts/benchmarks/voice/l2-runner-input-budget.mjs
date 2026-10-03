export const MAX_TYPESAFE_INPUT_CHARS_PER_REQ = 1000;
export const MAX_OPENAI_INPUT_CHARS_PER_REQ = 4000;
export const RUNTIME_ENFORCED_INPUT_TOKEN_CAP = 'NONE';
export const TOKEN_CAP_ENFORCEMENT = 'NOT_ENFORCEABLE_AT_RUNTIME';

export class InputBudgetExceededError extends Error {
  constructor(message) {
    super(message);
    this.name = 'InputBudgetExceededError';
  }
}

export function validateTypeSafeInputBudget(callerTranscript) {
  if (typeof callerTranscript !== 'string') {
    throw new InputBudgetExceededError('TypeSafe input transcript must be a string');
  }
  if (callerTranscript.length > MAX_TYPESAFE_INPUT_CHARS_PER_REQ) {
    throw new InputBudgetExceededError(
      `TypeSafe input transcript length (${callerTranscript.length}) exceeds maximum allowed (${MAX_TYPESAFE_INPUT_CHARS_PER_REQ} chars)`,
    );
  }
}

export function validateOpenAiInputBudget(messages) {
  if (!Array.isArray(messages)) {
    throw new InputBudgetExceededError('OpenAI messages must be an array');
  }
  let totalChars = 0;
  for (const msg of messages) {
    if (typeof msg.content === 'string') {
      totalChars += msg.content.length;
    }
  }
  if (totalChars > MAX_OPENAI_INPUT_CHARS_PER_REQ) {
    throw new InputBudgetExceededError(
      `OpenAI total input messages length (${totalChars}) exceeds maximum allowed (${MAX_OPENAI_INPUT_CHARS_PER_REQ} chars)`,
    );
  }
}
