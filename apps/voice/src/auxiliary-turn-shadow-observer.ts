import {
  type AuxiliaryTurnDecisionInput,
  type AuxiliaryTurnDecisionOutput,
  type AuxiliaryTurnDecisionPort,
  type AuxiliaryTurnFeatureMode,
  validateAuxiliaryTurnDecisionOutput,
} from '@voice-agent/contracts';
import { createNullLogger, type Logger } from '@voice-agent/logger';

export type ShadowObservationStatus =
  'ACCEPTED' | 'DROPPED_DISABLED' | 'DROPPED_CAPACITY' | 'DROPPED_NO_PORT';

export interface ShadowObservationResult {
  readonly status: ShadowObservationStatus;
}

export interface ShadowObservationInput extends AuxiliaryTurnDecisionInput {
  readonly signal?: AbortSignal | undefined;
}

export interface AuxiliaryTurnShadowObserverOptions {
  readonly port?: AuxiliaryTurnDecisionPort | undefined;
  readonly mode?: AuxiliaryTurnFeatureMode | undefined;
  readonly globalAllowedMode?: AuxiliaryTurnFeatureMode | undefined;
  readonly maxConcurrency?: number | undefined;
  readonly logger?: Logger | undefined;
}

function resolveEffectiveMode(
  mode?: AuxiliaryTurnFeatureMode,
  globalAllowed?: AuxiliaryTurnFeatureMode,
): AuxiliaryTurnFeatureMode {
  if (mode === 'ACTIVE_GUARDED' || globalAllowed === 'ACTIVE_GUARDED') {
    throw new Error('ACTIVE_GUARDED is blocked and unreachable in current runtime foundation');
  }
  return (globalAllowed ?? 'DISABLED') === 'DISABLED'
    ? 'DISABLED'
    : mode === 'SHADOW'
      ? 'SHADOW'
      : 'DISABLED';
}

export class AuxiliaryTurnShadowObserver {
  private readonly port?: AuxiliaryTurnDecisionPort | undefined;
  private readonly logger: Logger;
  private readonly effectiveMode: AuxiliaryTurnFeatureMode;
  private readonly maxConcurrency?: number | undefined;
  private readonly inFlightPromises = new Set<Promise<void>>();
  private readonly callControllers = new Map<string, AbortController>();
  private inFlight = 0;

  constructor(options?: AuxiliaryTurnShadowObserverOptions) {
    this.effectiveMode = resolveEffectiveMode(options?.mode, options?.globalAllowedMode);
    this.port = options?.port;
    this.maxConcurrency = options?.maxConcurrency;
    this.logger = options?.logger ?? createNullLogger();
  }

  get mode(): AuxiliaryTurnFeatureMode {
    return this.effectiveMode;
  }

  get activeCount(): number {
    return this.inFlight;
  }

  observeTurn(input: ShadowObservationInput): ShadowObservationResult {
    if (this.effectiveMode === 'DISABLED') return { status: 'DROPPED_DISABLED' };
    if (!this.port) return { status: 'DROPPED_NO_PORT' };
    if (this.maxConcurrency !== undefined && this.inFlight >= this.maxConcurrency) {
      this.logger.warn('auxiliary.shadow.dropped_capacity', {
        callId: input.callId,
        turnId: input.turnId,
        organizationId: input.organizationId,
        status: 'DROPPED_CAPACITY',
        inFlight: this.inFlight,
      });
      return { status: 'DROPPED_CAPACITY' };
    }

    this.startEvaluation(input);
    return { status: 'ACCEPTED' };
  }

  abortCall(callId: string): void {
    const controller = this.callControllers.get(callId);
    if (controller) {
      controller.abort();
      this.callControllers.delete(callId);
    }
  }

  async waitForAll(): Promise<void> {
    await Promise.allSettled(Array.from(this.inFlightPromises));
  }

  private startEvaluation(input: ShadowObservationInput): void {
    this.inFlight++;
    const controller = new AbortController();
    this.callControllers.set(input.callId, controller);
    if (input.signal) {
      input.signal.addEventListener('abort', () => controller.abort(), { once: true });
    }

    this.logger.info('auxiliary.shadow.accepted', {
      callId: input.callId,
      turnId: input.turnId,
      organizationId: input.organizationId,
      mode: 'SHADOW',
    });

    const promise = this.runTracked(input, controller.signal).finally(() => {
      this.inFlight--;
      this.inFlightPromises.delete(promise);
      if (this.callControllers.get(input.callId) === controller) {
        this.callControllers.delete(input.callId);
      }
    });
    this.inFlightPromises.add(promise);
  }

  private async runTracked(input: ShadowObservationInput, signal: AbortSignal): Promise<void> {
    try {
      const raw = await this.port!.evaluateTurn(input, signal);
      const v: AuxiliaryTurnDecisionOutput = validateAuxiliaryTurnDecisionOutput(raw);
      this.logger.info('auxiliary.shadow.completed', {
        callId: input.callId,
        turnId: input.turnId,
        organizationId: input.organizationId,
        mode: 'SHADOW',
        latencyMs: v.latencyMs,
        providerModel: v.providerModel,
        scores: {
          deterministic: v.deterministicScore,
          generative: v.generativeScore,
          security: v.securityScore,
        },
      });
    } catch (err: unknown) {
      const isAbort = signal.aborted;
      const error = isAbort
        ? undefined
        : err instanceof Error
          ? err.message
          : 'Unknown evaluation failure';
      this.logger[isAbort ? 'info' : 'warn'](
        isAbort ? 'auxiliary.shadow.aborted' : 'auxiliary.shadow.failed',
        {
          callId: input.callId,
          turnId: input.turnId,
          organizationId: input.organizationId,
          ...(error ? { error } : {}),
        },
      );
    }
  }
}
