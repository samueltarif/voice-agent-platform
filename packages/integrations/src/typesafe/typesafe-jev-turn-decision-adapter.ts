import type {
  AuxiliaryAbortSignal,
  AuxiliaryTurnDecisionInput,
  AuxiliaryTurnDecisionOutput,
  AuxiliaryTurnDecisionPort,
} from '@voice-agent/contracts';
import { JEV_ROUTING_ATOMIC_DEFINITION } from './typesafe-jev-atomic-definition.js';

export const DEFAULT_TYPESAFE_ENDPOINT = 'https://api.typesafe.ai/v1/systemone' as const;
export const DEFAULT_TYPESAFE_MODEL = 'jev-latest' as const;

export class TypeSafeModelIdentityMismatchError extends Error {
  readonly expectedModel: string;
  readonly observedModel: string;

  constructor(expectedModel: string, observedModel: string) {
    super(
      `TypeSafe model identity mismatch: expected '${expectedModel}', received '${observedModel}'`,
    );
    this.name = 'TypeSafeModelIdentityMismatchError';
    this.expectedModel = expectedModel;
    this.observedModel = observedModel;
  }
}

export interface TypeSafeJevAdapterOptions {
  readonly apiKey: string;
  readonly model?: string | undefined;
  readonly expectedProviderModel?: string | undefined;
  readonly endpointUrl?: string | undefined;
  readonly fetchFn?: typeof fetch | undefined;
}

function bridgeAbortSignal(signal?: AuxiliaryAbortSignal): AbortSignal | undefined {
  if (!signal) return undefined;
  if (typeof AbortController === 'undefined') return undefined;
  if (signal instanceof AbortSignal) return signal;

  const controller = new AbortController();
  if (signal.aborted) {
    controller.abort();
    return controller.signal;
  }
  signal.addEventListener?.('abort', () => controller.abort());
  return controller.signal;
}

function extractNoulScore(answer: unknown, key: string): number {
  if (typeof answer !== 'object' || answer === null) {
    throw new TypeError(`Missing or invalid answer object for ${key}`);
  }
  const score = (answer as Record<string, unknown>).noul;
  if (typeof score !== 'number' || !Number.isFinite(score) || score < 0 || score > 1) {
    throw new TypeError(`Answer ${key}.noul must be a finite number between 0 and 1`);
  }
  return score;
}

function parseTypeSafeResponse(raw: unknown): {
  deterministicScore: number;
  generativeScore: number;
  securityScore: number;
  providerModel: string;
} {
  if (typeof raw !== 'object' || raw === null) {
    throw new TypeError('TypeSafe response body must be a non-null object');
  }
  const body = raw as Record<string, unknown>;
  if (typeof body.model !== 'string' || body.model.trim().length === 0) {
    throw new TypeError('TypeSafe response must contain a non-empty string "model" field');
  }
  if (typeof body.answers !== 'object' || body.answers === null) {
    throw new TypeError('TypeSafe response must contain an "answers" object');
  }
  const answers = body.answers as Record<string, unknown>;
  return {
    deterministicScore: extractNoulScore(
      answers.is_deterministic_candidate,
      'is_deterministic_candidate',
    ),
    generativeScore: extractNoulScore(answers.is_generative_required, 'is_generative_required'),
    securityScore: extractNoulScore(answers.is_security_escalation, 'is_security_escalation'),
    providerModel: body.model,
  };
}

function normalizeApiKey(apiKey: string): string {
  if (!apiKey || apiKey.trim().length === 0) {
    throw new TypeError('TypeSafe API key must be a non-empty string');
  }
  return apiKey.trim();
}

function normalizeExpectedProviderModel(model?: string): string | undefined {
  if (model === undefined) return undefined;
  if (typeof model !== 'string' || model.trim().length === 0) {
    throw new TypeError('expectedProviderModel must be a non-empty string when provided');
  }
  return model.trim();
}

export class TypeSafeJevTurnDecisionAdapter implements AuxiliaryTurnDecisionPort {
  readonly providerName = 'typesafe-jev';
  private readonly apiKey: string;
  private readonly model: string;
  private readonly expectedProviderModel?: string | undefined;
  private readonly endpointUrl: string;
  private readonly fetchFn: typeof fetch;

  constructor(options: TypeSafeJevAdapterOptions) {
    this.apiKey = normalizeApiKey(options.apiKey);
    this.model = options.model ?? DEFAULT_TYPESAFE_MODEL;
    this.expectedProviderModel = normalizeExpectedProviderModel(options.expectedProviderModel);
    this.endpointUrl = options.endpointUrl ?? DEFAULT_TYPESAFE_ENDPOINT;
    this.fetchFn = options.fetchFn ?? globalThis.fetch;
  }

  async evaluateTurn(
    input: AuxiliaryTurnDecisionInput,
    signal?: AuxiliaryAbortSignal,
  ): Promise<AuxiliaryTurnDecisionOutput> {
    const payload = JSON.stringify({
      model: this.model,
      state: {
        callerInput: input.callerTranscript,
        language: input.language ?? 'pt-BR',
        channel: input.channel ?? 'phone',
      },
      questions: JEV_ROUTING_ATOMIC_DEFINITION.questions,
    });

    const startMs = Date.now();
    const bridgedSignal = bridgeAbortSignal(signal);

    const response = await this.fetchFn(this.endpointUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${this.apiKey}`,
      },
      body: payload,
      ...(bridgedSignal ? { signal: bridgedSignal } : {}),
    });

    if (!response.ok) {
      const errText = await response.text().catch(() => '');
      throw new Error(`TypeSafe API request failed with HTTP ${response.status}: ${errText}`);
    }

    const rawJson = (await response.json()) as unknown;
    const latencyMs = Math.max(0, Date.now() - startMs);
    const parsed = parseTypeSafeResponse(rawJson);

    if (
      this.expectedProviderModel !== undefined &&
      parsed.providerModel !== this.expectedProviderModel
    ) {
      throw new TypeSafeModelIdentityMismatchError(
        this.expectedProviderModel,
        parsed.providerModel,
      );
    }

    return {
      deterministicScore: parsed.deterministicScore,
      generativeScore: parsed.generativeScore,
      securityScore: parsed.securityScore,
      providerModel: parsed.providerModel,
      latencyMs,
    };
  }
}
