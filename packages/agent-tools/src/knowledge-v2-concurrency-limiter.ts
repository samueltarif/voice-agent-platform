/**
 * B2a (DEC-071): limite de concorrência + tempo limite para o ramo `v2`.
 *
 * A porta de busca não tem cancelamento: depois do tempo limite a consulta
 * pode continuar no banco. Por isso a vaga só é liberada quando a consulta
 * REALMENTE termina (não quando o tempo esgota). Com todas as vagas ocupadas,
 * a nova consulta é recusada na hora (`BUSY`), sem fila: não há acúmulo.
 */
export type LimitedOutcome<T> =
  { readonly status: 'OK'; readonly value: T } | { readonly status: 'BUSY' | 'TIMEOUT' | 'ERROR' };

export class KnowledgeV2ConcurrencyLimiter {
  private active = 0;

  constructor(private readonly maxConcurrent: number) {
    if (!Number.isInteger(maxConcurrent) || maxConcurrent < 1) {
      throw new RangeError('maxConcurrent must be a positive integer');
    }
  }

  /** Consultas em andamento (inclui as que já passaram do tempo limite). */
  get inFlight(): number {
    return this.active;
  }

  async run<T>(task: () => Promise<T>, timeoutMs: number): Promise<LimitedOutcome<T>> {
    if (this.active >= this.maxConcurrent) return { status: 'BUSY' };
    this.active += 1;
    const work: Promise<LimitedOutcome<T>> = Promise.resolve()
      .then(task)
      .then(
        (value) => ({ status: 'OK' as const, value }),
        () => ({ status: 'ERROR' as const }),
      )
      .finally(() => {
        this.active -= 1;
      });
    let timer: ReturnType<typeof setTimeout> | undefined;
    const timeout = new Promise<LimitedOutcome<T>>((resolve) => {
      timer = setTimeout(() => resolve({ status: 'TIMEOUT' }), timeoutMs);
    });
    try {
      return await Promise.race([work, timeout]);
    } finally {
      clearTimeout(timer);
    }
  }
}
