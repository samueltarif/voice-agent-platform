export const MAX_TYPESAFE_REQUESTS = 7;
export const MAX_OPENAI_REQUESTS = 12;
export const TOTAL_MAX_PROVIDER_REQUESTS = 19;
export const CONCURRENCY = 1;
export const RETRIES = 0;

export function checkCaps(state, targetProvider) {
  if (state.totalProviderRequestsAttempted >= TOTAL_MAX_PROVIDER_REQUESTS) {
    return 'MAX_TOTAL_REQUESTS_EXCEEDED';
  }
  if (targetProvider === 'TYPESAFE' && state.typeSafeRequestsAttempted >= MAX_TYPESAFE_REQUESTS) {
    return 'MAX_TYPESAFE_REQUESTS_EXCEEDED';
  }
  if (targetProvider === 'OPENAI' && state.openAiRequestsAttempted >= MAX_OPENAI_REQUESTS) {
    return 'MAX_OPENAI_REQUESTS_EXCEEDED';
  }
  return null;
}
