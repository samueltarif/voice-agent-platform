export async function loadDependencies() {
  const [typeSafeMod, openAiMod, matcherMod, policyMod, turnHandlerMod] = await Promise.all([
    import(
      new URL(
        '../../../packages/integrations/dist/packages/integrations/src/typesafe/typesafe-jev-turn-decision-adapter.js',
        import.meta.url,
      ).href
    ),
    import(
      new URL(
        '../../../packages/integrations/dist/packages/integrations/src/openai/openai-conversation-model-adapter.js',
        import.meta.url,
      ).href
    ),
    import(
      new URL(
        '../../../apps/voice/dist/apps/voice/src/operating-hours-capability-matcher.js',
        import.meta.url,
      ).href
    ),
    import(
      new URL(
        '../../../apps/voice/dist/apps/voice/src/frozen-policy-interpreter.js',
        import.meta.url,
      ).href
    ),
    import(
      new URL(
        '../../../apps/voice/dist/apps/voice/src/operating-hours-turn-handler.js',
        import.meta.url,
      ).href
    ),
  ]);
  return {
    TypeSafeJevTurnDecisionAdapter: typeSafeMod.TypeSafeJevTurnDecisionAdapter,
    TypeSafeModelIdentityMismatchError: typeSafeMod.TypeSafeModelIdentityMismatchError,
    OpenAiConversationModelAdapter: openAiMod.OpenAiConversationModelAdapter,
    matchesOperatingHoursCapability: matcherMod.matchesOperatingHoursCapability,
    interpretFrozenTurnPolicy: policyMod.interpretFrozenTurnPolicy,
    handleOperatingHoursTurn: turnHandlerMod.handleOperatingHoursTurn,
  };
}

export function createInitialState() {
  return {
    typeSafeRequestsAttempted: 0,
    typeSafeRequestsSucceeded: 0,
    openAiRequestsAttempted: 0,
    openAiRequestsSucceeded: 0,
    totalProviderRequestsAttempted: 0,
    matcherMatchedCount: 0,
    matcherUnmatchedCount: 0,
    deterministicCount: 0,
    generativeCount: 0,
    securityBlockedCount: 0,
    technicalFailures: 0,
    timeouts: 0,
    consecutiveFailures: 0,
    coreJointChainObserved: false,
    typeSafeMismatch: false,
  };
}
