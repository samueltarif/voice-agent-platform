/**
 * E2-V — registro temporal dos eventos, distinguindo a ORIGEM:
 * - PROVIDER: quadro recebido da Millis (texto JSON ou áudio);
 * - CLIENT:   quadro enviado à Millis (inicialização sem chave, ping, áudio);
 * - DERIVED:  estado calculado localmente pelo SDK ou por este protótipo
 *             (ex.: `onagentstate`, latência) — NÃO é evento do fornecedor;
 * - LOCAL:    ação do operador na página (iniciar, parar, silenciar).
 * Áudio é agregado em rajadas (início, quadros, bytes, duração) para não
 * inundar o registro. Nenhum segredo é gravado.
 */

export const ORIGINS = Object.freeze(['PROVIDER', 'CLIENT', 'DERIVED', 'LOCAL']);

/** Métodos de texto observados no SDK 1.0.12 e no jambonz (outros são registrados como vieram). */
export const KNOWN_PROVIDER_METHODS = Object.freeze([
  'onready',
  'ontranscript',
  'onresponsetext',
  'start_answering',
  'clear',
  'pause',
  'unpause',
  'ai_action',
  'onsessionended',
  'pong',
]);

const SECRET_KEYS = new Set(['public_key', 'publicKey', 'api_key', 'authorization', 'token']);

export function redact(value) {
  if (Array.isArray(value)) return value.map(redact);
  if (!value || typeof value !== 'object') return value;
  return Object.fromEntries(
    Object.entries(value).map(([key, v]) => [key, SECRET_KEYS.has(key) ? '[REDACTED]' : redact(v)]),
  );
}

function byteLength(data) {
  if (typeof data === 'string') return null;
  return data?.byteLength ?? data?.length ?? 0;
}

export class EventLog {
  #entries = [];
  #bursts = new Map();
  #clock;
  #wall;
  #listeners = new Set();

  constructor({ clock = () => performance.now(), wall = () => new Date() } = {}) {
    this.#clock = clock;
    this.#wall = wall;
    this.t0 = clock();
  }

  get entries() {
    return [...this.#entries];
  }

  subscribe(listener) {
    this.#listeners.add(listener);
    return () => this.#listeners.delete(listener);
  }

  record(origin, type, data = null) {
    if (!ORIGINS.includes(origin)) throw new Error(`origem inválida: ${origin}`);
    if (type !== 'audio_burst') this.#closeBursts();
    const entry = {
      seq: this.#entries.length + 1,
      t_ms: Math.round((this.#clock() - this.t0) * 10) / 10,
      wall: this.#wall().toISOString(),
      origin,
      type,
      known:
        origin !== 'PROVIDER' || KNOWN_PROVIDER_METHODS.includes(type) || type === 'audio_burst',
      data: redact(data),
    };
    this.#entries.push(entry);
    for (const listener of this.#listeners) listener(entry);
    return entry;
  }

  /** Quadro de texto ou binário de/para o fornecedor. */
  frame(direction, raw) {
    const origin = direction === 'in' ? 'PROVIDER' : 'CLIENT';
    const bytes = byteLength(raw);
    if (bytes !== null) return this.#audio(origin, bytes);
    let message;
    try {
      message = JSON.parse(raw);
    } catch {
      return this.record(origin, 'unparsed_text', { length: raw.length });
    }
    const { method, ...rest } = message ?? {};
    return this.record(origin, typeof method === 'string' ? method : 'no_method', rest);
  }

  #audio(origin, bytes) {
    const now = this.#clock();
    const burst = this.#bursts.get(origin);
    if (burst) {
      burst.frames += 1;
      burst.bytes += bytes;
      burst.last = now;
      return null;
    }
    const entry = this.record(origin, 'audio_burst', { frames: 1, bytes });
    this.#bursts.set(origin, { entry, frames: 1, bytes, first: now, last: now });
    return entry;
  }

  #closeBursts() {
    for (const burst of this.#bursts.values()) {
      burst.entry.data = {
        frames: burst.frames,
        bytes: burst.bytes,
        span_ms: Math.round(burst.last - burst.first),
      };
    }
    this.#bursts.clear();
  }

  /** Exportação para análise posterior (JSON sem segredos). */
  export(meta = {}) {
    this.#closeBursts();
    return { meta: redact(meta), entries: this.entries };
  }
}
