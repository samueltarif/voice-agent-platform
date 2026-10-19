import type {
  OutboundAttemptEventType,
  TelephonyOriginationResult,
  TelephonyReconciliationResult,
} from '@voice-agent/contracts';

/** Traduz resultados neutros de porta em eventos internos (sem payload de provedor). */
export function originationEventOf(result: TelephonyOriginationResult) {
  const map = {
    ACCEPTED: { type: 'ORIGINATION_ACCEPTED' as const, extra: {} },
    REJECTED: { type: 'ORIGINATION_REJECTED' as const, extra: {} },
    UNKNOWN: { type: 'ORIGINATION_RESULT_UNKNOWN' as const, extra: {} },
  };
  const base = map[result.kind];
  if (result.kind === 'ACCEPTED') {
    const providerReference = result.providerReference;
    return { type: base.type, extra: providerReference ? { providerReference } : {} };
  }
  return { type: base.type, extra: { reasonCode: result.reasonCode } };
}

export function reconciliationEventOf(result: TelephonyReconciliationResult): {
  type: OutboundAttemptEventType;
  extra: Record<string, unknown>;
} {
  if (result.kind === 'CONFIRMED_ORIGINATED') {
    const providerReference = result.providerReference;
    return {
      type: 'RECONCILIATION_CONFIRMED_ORIGINATED',
      extra: providerReference ? { providerReference } : {},
    };
  }
  if (result.kind === 'CONFIRMED_NOT_ORIGINATED') {
    return { type: 'RECONCILIATION_CONFIRMED_NOT_ORIGINATED', extra: {} };
  }
  return { type: 'RECONCILIATION_INCONCLUSIVE', extra: {} };
}
