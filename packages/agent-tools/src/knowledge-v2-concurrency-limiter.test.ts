import { describe, expect, it } from 'vitest';
import { KnowledgeV2ConcurrencyLimiter } from './knowledge-v2-concurrency-limiter.js';

const deferred = <T>() => {
  let resolve!: (v: T) => void;
  let reject!: (e: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
};

describe('KnowledgeV2ConcurrencyLimiter (B2a)', () => {
  it('devolve o valor dentro do tempo limite', async () => {
    const limiter = new KnowledgeV2ConcurrencyLimiter(2);
    await expect(limiter.run(async () => 7, 50)).resolves.toEqual({ status: 'OK', value: 7 });
    expect(limiter.inFlight).toBe(0);
  });

  it('erro (síncrono ou assíncrono) vira ERROR, sem rejeição solta', async () => {
    const limiter = new KnowledgeV2ConcurrencyLimiter(1);
    await expect(limiter.run(() => Promise.reject(new Error('x')), 50)).resolves.toEqual({
      status: 'ERROR',
    });
    await expect(
      limiter.run(() => {
        throw new Error('sync');
      }, 50),
    ).resolves.toEqual({ status: 'ERROR' });
    expect(limiter.inFlight).toBe(0);
  });

  it('tempo esgotado: responde TIMEOUT, mas a vaga só volta quando a consulta termina', async () => {
    const limiter = new KnowledgeV2ConcurrencyLimiter(1);
    const slow = deferred<number>();
    await expect(limiter.run(() => slow.promise, 10)).resolves.toEqual({ status: 'TIMEOUT' });
    expect(limiter.inFlight).toBe(1);
    // Sem acúmulo: com a vaga ocupada pela consulta antiga, a nova é recusada na hora.
    await expect(limiter.run(async () => 1, 10)).resolves.toEqual({ status: 'BUSY' });
    slow.resolve(1);
    await slow.promise;
    await new Promise((r) => setTimeout(r, 0));
    expect(limiter.inFlight).toBe(0);
    await expect(limiter.run(async () => 2, 10)).resolves.toEqual({ status: 'OK', value: 2 });
  });

  it('a consulta que falha depois do tempo limite não gera rejeição não tratada', async () => {
    const limiter = new KnowledgeV2ConcurrencyLimiter(1);
    const slow = deferred<number>();
    await expect(limiter.run(() => slow.promise, 5)).resolves.toEqual({ status: 'TIMEOUT' });
    slow.reject(new Error('late'));
    await new Promise((r) => setTimeout(r, 0));
    expect(limiter.inFlight).toBe(0);
  });

  it('limita a concorrência e recusa valores inválidos', async () => {
    const limiter = new KnowledgeV2ConcurrencyLimiter(2);
    const a = deferred<number>();
    const b = deferred<number>();
    const runs = [limiter.run(() => a.promise, 1000), limiter.run(() => b.promise, 1000)];
    await expect(limiter.run(async () => 3, 1000)).resolves.toEqual({ status: 'BUSY' });
    a.resolve(1);
    b.resolve(2);
    await Promise.all(runs);
    expect(() => new KnowledgeV2ConcurrencyLimiter(0)).toThrow(RangeError);
  });
});
