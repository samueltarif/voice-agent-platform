export interface OutboundRetryPolicyConfig {
  readonly maxAttempts: number;
  readonly initialBackoffMs: number;
  readonly backoffMultiplier: number;
  readonly maxBackoffMs: number;
}

export const DEFAULT_OUTBOUND_RETRY_POLICY: OutboundRetryPolicyConfig = {
  maxAttempts: 3,
  initialBackoffMs: 30_000, // 30 seconds
  backoffMultiplier: 2,
  maxBackoffMs: 300_000, // 5 minutes
};

export function isRetryEligible(attempts: number, maxAttempts: number): boolean {
  return attempts < maxAttempts;
}

export function calculateNextRetryAt(
  attempts: number,
  baseDate: Date = new Date(),
  config: Partial<OutboundRetryPolicyConfig> = {},
): Date {
  const merged = { ...DEFAULT_OUTBOUND_RETRY_POLICY, ...config };
  const exponent = Math.max(0, attempts - 1);
  const calculatedBackoff = merged.initialBackoffMs * Math.pow(merged.backoffMultiplier, exponent);
  const backoffMs = Math.min(calculatedBackoff, merged.maxBackoffMs);

  return new Date(baseDate.getTime() + backoffMs);
}
