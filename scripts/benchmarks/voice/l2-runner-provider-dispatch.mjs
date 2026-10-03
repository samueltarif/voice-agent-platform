import { checkCaps } from './l2-runner-request-caps.mjs';
import {
  validateTypeSafeInputBudget,
  validateOpenAiInputBudget,
} from './l2-runner-input-budget.mjs';
import { classifyTypeSafeError, classifyOpenAiError } from './l2-runner-result-classification.mjs';

export async function invokeOpenAi(openAiAdapter, caseData, timeoutMs) {
  const messages = [
    { role: 'system', content: 'Você é um assistente virtual profissional.' },
    { role: 'user', content: caseData.syntheticCallerUtterance },
  ];
  validateOpenAiInputBudget(messages);
  const signal = AbortSignal.timeout(timeoutMs);
  const stream = await openAiAdapter.streamTurn({
    turnId: caseData.caseId,
    generationId: `gen-${caseData.caseId}`,
    messages,
    signal,
  });
  for await (const chunk of stream) {
    if (chunk.type === 'failure') throw new Error(chunk.error || 'OpenAI stream failure');
  }
}

export async function executeOpenAiTurn(params) {
  const { openAiAdapter, caseData, state, logger, timeoutMs } = params;
  const capError = checkCaps(state, 'OPENAI');
  if (capError) {
    state.technicalFailures++;
    return {
      technicalStatus: 'PROVIDER_ERROR',
      errorCategory: capError,
      shouldStop: true,
      latencyMs: null,
    };
  }
  state.openAiRequestsAttempted++;
  state.totalProviderRequestsAttempted++;
  const start = Date.now();
  try {
    await invokeOpenAi(openAiAdapter, caseData, timeoutMs);
    state.openAiRequestsSucceeded++;
    state.generativeCount++;
    state.consecutiveFailures = 0;
    return {
      technicalStatus: 'SUCCESS',
      errorCategory: null,
      shouldStop: false,
      latencyMs: Math.max(0, Date.now() - start),
    };
  } catch (err) {
    const isTimeout =
      err instanceof Error && (err.name === 'TimeoutError' || err.name === 'AbortError');
    const classification = classifyOpenAiError(err, isTimeout);
    state.technicalFailures++;
    state.consecutiveFailures++;
    if (classification.status === 'TIMEOUT') state.timeouts++;
    if (classification.status === 'HTTP_AUTH_ERROR')
      logger.error(`[L2 Runner] STOP: OpenAI Auth error on ${caseData.caseId}`);
    return {
      technicalStatus: classification.status,
      errorCategory: classification.errorCategory,
      shouldStop:
        classification.status === 'HTTP_AUTH_ERROR' ||
        classification.status === 'INPUT_BUDGET_EXCEEDED',
      latencyMs: Math.max(0, Date.now() - start),
    };
  }
}

export async function evaluateTypeSafeJev(params) {
  const { typeSafeAdapter, caseData, state, deps, logger, timeoutMs } = params;
  const capError = checkCaps(state, 'TYPESAFE');
  if (capError) {
    state.technicalFailures++;
    return {
      output: null,
      errorResult: {
        technicalStatus: 'PROVIDER_ERROR',
        errorCategory: capError,
        shouldStop: true,
        latencyMs: null,
        observedModel: null,
      },
    };
  }
  state.typeSafeRequestsAttempted++;
  state.totalProviderRequestsAttempted++;
  const start = Date.now();
  try {
    validateTypeSafeInputBudget(caseData.syntheticCallerUtterance);
    const signal = AbortSignal.timeout(timeoutMs);
    const output = await typeSafeAdapter.evaluateTurn({
      organizationId: '00000000-0000-0000-0000-000000000000',
      callId: `l2-call-${caseData.caseId}`,
      turnId: caseData.caseId,
      callerTranscript: caseData.syntheticCallerUtterance,
      language: 'pt-BR',
      channel: 'phone',
      signal,
    });
    state.typeSafeRequestsSucceeded++;
    state.consecutiveFailures = 0;
    return {
      output,
      errorResult: null,
      latencyMs: output.latencyMs ?? Math.max(0, Date.now() - start),
      observedModel: output.providerModel,
    };
  } catch (err) {
    const isTimeout =
      err instanceof Error && (err.name === 'TimeoutError' || err.name === 'AbortError');
    const classification = classifyTypeSafeError(err, isTimeout);
    state.technicalFailures++;
    state.consecutiveFailures++;
    if (classification.status === 'TIMEOUT') state.timeouts++;
    const isMismatch = err instanceof deps.TypeSafeModelIdentityMismatchError;
    const isAuth = classification.status === 'HTTP_AUTH_ERROR';
    const isBudget = classification.status === 'INPUT_BUDGET_EXCEEDED';
    if (isMismatch) state.typeSafeMismatch = true;
    if (isAuth) logger.error(`[L2 Runner] STOP: TypeSafe Auth error on ${caseData.caseId}`);
    return {
      output: null,
      latencyMs: Math.max(0, Date.now() - start),
      observedModel: isMismatch ? err.observedModel : null,
      errorResult: {
        technicalStatus: classification.status,
        errorCategory: classification.errorCategory,
        shouldStop: isMismatch || isAuth || isBudget,
        latencyMs: Math.max(0, Date.now() - start),
        observedModel: isMismatch ? err.observedModel : null,
      },
    };
  }
}
