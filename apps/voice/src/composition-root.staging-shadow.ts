import {
  type AuxiliaryAbortSignal,
  type AuxiliaryTurnDecisionInput,
  type AuxiliaryTurnDecisionOutput,
  type AuxiliaryTurnDecisionPort,
  type AuxiliaryTurnFeatureMode,
} from '@voice-agent/contracts';
import { createNullLogger, type Logger } from '@voice-agent/logger';
import { TypeSafeJevTurnDecisionAdapter } from '@voice-agent/integrations';
import { AuxiliaryTurnShadowObserver } from './auxiliary-turn-shadow-observer.js';

export const STAGING_SHADOW_MAX_CONCURRENCY = 1 as const;
export const STAGING_SHADOW_TIMEOUT_MS = 1500 as const;
export const DEFAULT_AUXILIARY_FEATURE_MODE: AuxiliaryTurnFeatureMode = 'DISABLED' as const;

export type StagingExecutionEnvironment = 'staging' | 'test';

export interface StagingShadowCompositionOptions {
  readonly environment: StagingExecutionEnvironment;
  readonly apiKey: string;
  readonly mode?: AuxiliaryTurnFeatureMode | undefined;
  readonly maxConcurrency?: number | undefined;
  readonly timeoutMs?: number | undefined;
  readonly model?: string | undefined;
  readonly endpointUrl?: string | undefined;
  readonly fetchFn?: typeof fetch | undefined;
  readonly logger?: Logger | undefined;
}

export interface StagingShadowCompositionResult {
  readonly observer: AuxiliaryTurnShadowObserver;
  readonly port: AuxiliaryTurnDecisionPort;
  readonly effectiveMode: AuxiliaryTurnFeatureMode;
  readonly maxConcurrency: number;
  readonly timeoutMs: number;
}

function linkAbortSignal(
  signal: AuxiliaryAbortSignal | undefined,
  controller: AbortController,
): (() => void) | undefined {
  if (!signal) return undefined;
  if (signal.aborted) {
    controller.abort();
    return undefined;
  }
  const onAbort = (): void => controller.abort();
  signal.addEventListener?.('abort', onAbort);
  return onAbort;
}

function cleanupTimerAndSignal(
  timer: NodeJS.Timeout | undefined,
  signal: AuxiliaryAbortSignal | undefined,
  onAbort: (() => void) | undefined,
): void {
  if (timer !== undefined) clearTimeout(timer);
  if (onAbort !== undefined && signal?.removeEventListener) {
    signal.removeEventListener('abort', onAbort);
  }
}

export class TimedAuxiliaryTurnDecisionPort implements AuxiliaryTurnDecisionPort {
  readonly providerName: string;

  constructor(
    private readonly inner: AuxiliaryTurnDecisionPort,
    private readonly timeoutMs: number,
  ) {
    this.providerName = inner.providerName;
  }

  async evaluateTurn(
    input: AuxiliaryTurnDecisionInput,
    signal?: AuxiliaryAbortSignal,
  ): Promise<AuxiliaryTurnDecisionOutput> {
    const controller = new AbortController();
    const onAbort = linkAbortSignal(signal, controller);

    let timer: NodeJS.Timeout | undefined;
    let didTimeout = false;
    const timeoutPromise = new Promise<never>((_, reject) => {
      timer = setTimeout(() => {
        didTimeout = true;
        controller.abort();
        reject(new Error(`TypeSafe auxiliary evaluation timed out after ${this.timeoutMs}ms`));
      }, this.timeoutMs);
    });

    try {
      return await Promise.race([
        this.inner.evaluateTurn(input, controller.signal),
        timeoutPromise,
      ]);
    } catch (err: unknown) {
      if (didTimeout) {
        throw new Error(`TypeSafe auxiliary evaluation timed out after ${this.timeoutMs}ms`);
      }
      throw err;
    } finally {
      cleanupTimerAndSignal(timer, signal, onAbort);
    }
  }
}

function assertValidStagingEnvironment(env: string): asserts env is StagingExecutionEnvironment {
  if (env === 'production') {
    throw new Error('TypeSafe SHADOW composition is strictly unavailable in production');
  }
  if (env !== 'staging' && env !== 'test') {
    throw new Error(`Unsupported environment for staging synthetic composition: '${env}'`);
  }
}

function assertValidFeatureMode(mode: AuxiliaryTurnFeatureMode): void {
  if (mode === 'ACTIVE_GUARDED') {
    throw new Error('ACTIVE_GUARDED is blocked and unreachable in current runtime foundation');
  }
}

export function createStagingSyntheticShadowComposition(
  options: StagingShadowCompositionOptions,
): StagingShadowCompositionResult {
  assertValidStagingEnvironment(options.environment);

  const mode = options.mode ?? DEFAULT_AUXILIARY_FEATURE_MODE;
  assertValidFeatureMode(mode);

  const concurrency = options.maxConcurrency ?? STAGING_SHADOW_MAX_CONCURRENCY;
  const timeoutMs = options.timeoutMs ?? STAGING_SHADOW_TIMEOUT_MS;
  const logger = options.logger ?? createNullLogger();

  const { apiKey, model, endpointUrl, fetchFn } = options;
  const rawAdapter = new TypeSafeJevTurnDecisionAdapter({ apiKey, model, endpointUrl, fetchFn });
  const timedPort = new TimedAuxiliaryTurnDecisionPort(rawAdapter, timeoutMs);

  const observer = new AuxiliaryTurnShadowObserver({
    port: mode === 'SHADOW' ? timedPort : undefined,
    mode,
    globalAllowedMode: 'SHADOW',
    maxConcurrency: concurrency,
    logger,
  });

  return {
    observer,
    port: timedPort,
    effectiveMode: observer.mode,
    maxConcurrency: concurrency,
    timeoutMs,
  };
}
