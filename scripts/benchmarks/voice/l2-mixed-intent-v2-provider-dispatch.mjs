import { checkV2Caps } from './l2-mixed-intent-v2-request-caps.mjs';
import {
  classifyOpenAiError,
  classifyTypeSafeError,
} from './l2-mixed-intent-v2-result-classification.mjs';

export async function evaluateV2Jev({ typeSafeAdapter, caseData, state, deps, timeoutMs }) {
  const capError = checkV2Caps(state, 'TYPESAFE');
  if (capError) {
    state.technicalFailures++;
    return { capError, output: null, errorResult: null };
  }
  state.typeSafeRequestsAttempted++;
  state.totalProviderRequestsAttempted++;
  const start = Date.now();
  try {
    const signal = AbortSignal.timeout(timeoutMs);
    const output = await typeSafeAdapter.evaluateTurn({
      organizationId: '00000000-0000-0000-0000-000000000000',
      callId: `l2-v2-call-${caseData.id}`,
      turnId: caseData.id,
      callerTranscript: caseData.callerTranscript,
      language: 'pt-BR',
      channel: 'phone',
      signal,
    });
    state.typeSafeRequestsSucceeded++;
    state.consecutiveFailures = 0;
    return {
      capError: null,
      output,
      errorResult: null,
      latencyMs: output.latencyMs ?? Math.max(0, Date.now() - start),
    };
  } catch (err) {
    return handleJevError(err, deps, state);
  }
}

function handleJevError(err, deps, state) {
  const isTimeout =
    err instanceof Error && (err.name === 'TimeoutError' || err.name === 'AbortError');
  const classification = classifyTypeSafeError(err, isTimeout);
  state.technicalFailures++;
  state.consecutiveFailures++;
  if (classification.status === 'TIMEOUT') state.timeouts++;
  const isMismatch = err instanceof deps.TypeSafeModelIdentityMismatchError;
  if (isMismatch) state.typeSafeMismatch = true;
  return {
    capError: null,
    output: null,
    errorResult: {
      technicalStatus: classification.status,
      errorCategory: classification.errorCategory,
      shouldStop: isMismatch || classification.status === 'HTTP_AUTH_ERROR',
      observedModel: isMismatch ? (err.observedModel ?? null) : null,
    },
  };
}

export async function dispatchV2OpenAi({ openAiAdapter, caseData, state, timeoutMs }) {
  const capError = checkV2Caps(state, 'OPENAI');
  if (capError) {
    state.technicalFailures++;
    return {
      invoked: false,
      completed: false,
      technicalStatus: 'PROVIDER_ERROR',
      errorCategory: capError,
      shouldStop: true,
    };
  }
  state.openAiRequestsAttempted++;
  state.totalProviderRequestsAttempted++;
  try {
    await invokeV2OpenAiStream(openAiAdapter, caseData, timeoutMs);
    state.openAiRequestsSucceeded++;
    state.consecutiveFailures = 0;
    return {
      invoked: true,
      completed: true,
      technicalStatus: 'SUCCESS',
      errorCategory: null,
      shouldStop: false,
    };
  } catch (err) {
    return handleOpenAiError(err, state);
  }
}

async function invokeV2OpenAiStream(openAiAdapter, caseData, timeoutMs) {
  const signal = AbortSignal.timeout(timeoutMs);
  const stream = await openAiAdapter.streamTurn({
    turnId: caseData.id,
    generationId: `gen-${caseData.id}`,
    messages: [
      { role: 'system', content: 'Você é um assistente virtual profissional.' },
      { role: 'user', content: caseData.callerTranscript },
    ],
    signal,
  });
  for await (const chunk of stream) {
    if (chunk.type === 'failure') throw new Error(chunk.error || 'OpenAI stream failure');
  }
}

function handleOpenAiError(err, state) {
  const isTimeout =
    err instanceof Error && (err.name === 'TimeoutError' || err.name === 'AbortError');
  const classification = classifyOpenAiError(err, isTimeout);
  state.technicalFailures++;
  state.consecutiveFailures++;
  if (classification.status === 'TIMEOUT') state.timeouts++;
  return {
    invoked: true,
    completed: false,
    technicalStatus: classification.status,
    errorCategory: classification.errorCategory,
    shouldStop: false,
  };
}

export function attemptV2DeterministicDispatch(deps, caseData) {
  const detResult = deps.handleOperatingHoursTurn({
    sessionOrganizationId: '00000000-0000-0000-0000-000000000000',
    configurationOrganizationId: '00000000-0000-0000-0000-000000000000',
    callerTranscript: caseData.callerTranscript,
    operatingHours: 'Segunda a Sexta, das 08h às 18h',
  });
  return detResult.handled === true;
}
