export const MAX_V2_TYPESAFE_REQUESTS = 4;
export const MAX_V2_OPENAI_REQUESTS = 4;
export const V2_TOTAL_MAX_PROVIDER_REQUESTS = 8;
export const V2_CONCURRENCY = 1;
export const V2_RETRIES = 0;

export function checkV2Caps(state, targetProvider) {
  if (state.totalProviderRequestsAttempted >= V2_TOTAL_MAX_PROVIDER_REQUESTS) {
    return 'MAX_V2_TOTAL_REQUESTS_EXCEEDED';
  }
  if (
    targetProvider === 'TYPESAFE' &&
    state.typeSafeRequestsAttempted >= MAX_V2_TYPESAFE_REQUESTS
  ) {
    return 'MAX_V2_TYPESAFE_REQUESTS_EXCEEDED';
  }
  if (targetProvider === 'OPENAI' && state.openAiRequestsAttempted >= MAX_V2_OPENAI_REQUESTS) {
    return 'MAX_V2_OPENAI_REQUESTS_EXCEEDED';
  }
  return null;
}
