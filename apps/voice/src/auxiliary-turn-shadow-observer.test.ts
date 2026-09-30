import { describe, expect, it, vi } from 'vitest';
import type {
  AuxiliaryTurnDecisionInput,
  AuxiliaryTurnDecisionOutput,
  AuxiliaryTurnDecisionPort,
} from '@voice-agent/contracts';
import type { Logger } from '@voice-agent/logger';
import { AuxiliaryTurnShadowObserver } from './auxiliary-turn-shadow-observer.js';

class FakeAuxiliaryDecisionPort implements AuxiliaryTurnDecisionPort {
  readonly providerName = 'fake-auxiliary-provider';
  public delayMs = 0;
  public shouldFail = false;
  public calls: AuxiliaryTurnDecisionInput[] = [];

  async evaluateTurn(
    input: AuxiliaryTurnDecisionInput,
    signal?: AbortSignal,
  ): Promise<AuxiliaryTurnDecisionOutput> {
    this.calls.push(input);
    if (this.delayMs > 0) {
      await new Promise<void>((resolve, reject) => {
        const timer = setTimeout(resolve, this.delayMs);
        if (signal) {
          signal.addEventListener(
            'abort',
            () => {
              clearTimeout(timer);
              reject(new Error('Evaluation aborted'));
            },
            { once: true },
          );
        }
      });
    }
    if (signal?.aborted) {
      throw new Error('Evaluation aborted');
    }
    if (this.shouldFail) {
      throw new Error('Simulated auxiliary provider network error');
    }
    return {
      deterministicScore: 0.9,
      generativeScore: 0.1,
      securityScore: 0.01,
      providerModel: 'fake-model-v1',
      latencyMs: 15,
    };
  }
}

function createCapturingLogger(): {
  logger: Logger;
  entries: Array<{ level: string; msg: string; ctx?: Record<string, unknown> }>;
} {
  const entries: Array<{ level: string; msg: string; ctx?: Record<string, unknown> }> = [];
  const log = (level: string) => (msg: string, ctx?: Record<string, unknown>) => {
    if (ctx !== undefined) {
      entries.push({ level, msg, ctx });
    } else {
      entries.push({ level, msg });
    }
  };
  const logger: Logger = {
    info: vi.fn(log('info')),
    warn: vi.fn(log('warn')),
    error: vi.fn(log('error')),
    debug: vi.fn(log('debug')),
  };
  return { logger, entries };
}

describe('AuxiliaryTurnShadowObserver', () => {
  const sampleInput = {
    organizationId: '11111111-1111-1111-1111-111111111111',
    callId: '00000000-0000-0000-0000-000000000001',
    turnId: 'turn-001',
    callerTranscript: 'Quero cancelar minha assinatura agora mesmo',
  };

  it('defaults to DISABLED mode and drops observations without invoking port', () => {
    const port = new FakeAuxiliaryDecisionPort();
    const observer = new AuxiliaryTurnShadowObserver({ port });

    expect(observer.mode).toBe('DISABLED');
    const result = observer.observeTurn(sampleInput);
    expect(result.status).toBe('DROPPED_DISABLED');
    expect(port.calls).toHaveLength(0);
  });

  it('enforces global allowed mode as a hard ceiling', () => {
    const port = new FakeAuxiliaryDecisionPort();
    const observer = new AuxiliaryTurnShadowObserver({
      port,
      mode: 'SHADOW',
      globalAllowedMode: 'DISABLED',
    });
    expect(observer.mode).toBe('DISABLED');
    const result = observer.observeTurn(sampleInput);
    expect(result.status).toBe('DROPPED_DISABLED');
    expect(port.calls).toHaveLength(0);
  });

  it('rejects ACTIVE_GUARDED fail-closed as unreachable in current runtime', () => {
    const port = new FakeAuxiliaryDecisionPort();
    expect(
      () =>
        new AuxiliaryTurnShadowObserver({
          port,
          mode: 'ACTIVE_GUARDED',
          globalAllowedMode: 'SHADOW',
        }),
    ).toThrow('ACTIVE_GUARDED is blocked and unreachable in current runtime foundation');
  });

  it('returns DROPPED_NO_PORT when port is absent in SHADOW mode', () => {
    const observer = new AuxiliaryTurnShadowObserver({
      mode: 'SHADOW',
      globalAllowedMode: 'SHADOW',
    });
    expect(observer.mode).toBe('SHADOW');
    const result = observer.observeTurn(sampleInput);
    expect(result.status).toBe('DROPPED_NO_PORT');
  });

  it('accepts turn in SHADOW mode when configured with global approval', async () => {
    const port = new FakeAuxiliaryDecisionPort();
    const { logger, entries } = createCapturingLogger();
    const observer = new AuxiliaryTurnShadowObserver({
      port,
      mode: 'SHADOW',
      globalAllowedMode: 'SHADOW',
      logger,
    });

    const result = observer.observeTurn(sampleInput);
    expect(result.status).toBe('ACCEPTED');
    await observer.waitForAll();

    expect(port.calls).toHaveLength(1);
    expect(port.calls[0]?.turnId).toBe('turn-001');

    const completed = entries.find((e) => e.msg === 'auxiliary.shadow.completed');
    expect(completed).toBeDefined();
    expect(completed?.ctx?.scores).toEqual({
      deterministic: 0.9,
      generative: 0.1,
      security: 0.01,
    });
  });

  it('enforces bounded concurrency and drops work when saturated', async () => {
    const port = new FakeAuxiliaryDecisionPort();
    port.delayMs = 50;
    const { logger, entries } = createCapturingLogger();
    const observer = new AuxiliaryTurnShadowObserver({
      port,
      mode: 'SHADOW',
      globalAllowedMode: 'SHADOW',
      maxConcurrency: 1,
      logger,
    });

    const first = observer.observeTurn({ ...sampleInput, turnId: 'turn-1' });
    const second = observer.observeTurn({ ...sampleInput, turnId: 'turn-2' });

    expect(first.status).toBe('ACCEPTED');
    expect(second.status).toBe('DROPPED_CAPACITY');
    expect(observer.activeCount).toBe(1);

    await observer.waitForAll();
    expect(observer.activeCount).toBe(0);

    const dropped = entries.find((e) => e.msg === 'auxiliary.shadow.dropped_capacity');
    expect(dropped).toBeDefined();
    expect(dropped?.ctx?.inFlight).toBe(1);
  });

  it('swallows port rejections and logs failure without unhandled rejection', async () => {
    const port = new FakeAuxiliaryDecisionPort();
    port.shouldFail = true;
    const { logger, entries } = createCapturingLogger();
    const observer = new AuxiliaryTurnShadowObserver({
      port,
      mode: 'SHADOW',
      globalAllowedMode: 'SHADOW',
      logger,
    });

    const result = observer.observeTurn(sampleInput);
    expect(result.status).toBe('ACCEPTED');

    await expect(observer.waitForAll()).resolves.toBeUndefined();
    expect(observer.activeCount).toBe(0);

    const failed = entries.find((e) => e.msg === 'auxiliary.shadow.failed');
    expect(failed).toBeDefined();
    expect(failed?.ctx?.error).toContain('Simulated auxiliary provider network error');
  });

  it('aborts call-scoped in-flight evaluations gracefully', async () => {
    const port = new FakeAuxiliaryDecisionPort();
    port.delayMs = 100;
    const { logger, entries } = createCapturingLogger();
    const observer = new AuxiliaryTurnShadowObserver({
      port,
      mode: 'SHADOW',
      globalAllowedMode: 'SHADOW',
      logger,
    });

    observer.observeTurn(sampleInput);
    expect(observer.activeCount).toBe(1);

    observer.abortCall(sampleInput.callId);
    await observer.waitForAll();

    expect(observer.activeCount).toBe(0);
    const aborted = entries.find((e) => e.msg === 'auxiliary.shadow.aborted');
    expect(aborted).toBeDefined();
  });

  it('guarantees privacy by never logging callerTranscript in structured logs', async () => {
    const port = new FakeAuxiliaryDecisionPort();
    const { logger, entries } = createCapturingLogger();
    const sensitiveTranscript = 'SENHA_SECRETA_12345_CONTA_BANCARIA';
    const observer = new AuxiliaryTurnShadowObserver({
      port,
      mode: 'SHADOW',
      globalAllowedMode: 'SHADOW',
      maxConcurrency: 1,
      logger,
    });

    observer.observeTurn({
      ...sampleInput,
      callerTranscript: sensitiveTranscript,
    });
    observer.observeTurn({
      ...sampleInput,
      turnId: 'turn-overflow',
      callerTranscript: sensitiveTranscript,
    });
    await observer.waitForAll();

    for (const entry of entries) {
      const serialized = JSON.stringify(entry);
      expect(serialized).not.toContain(sensitiveTranscript);
    }
  });
});
