import { buildJevAtomicPayload, buildJevChoicePayload } from './jev-calibration-question-set.js';
import type { JevProbabilities, JevRoutingClass } from './jev-routing-types.js';
import {
  TYPESAFE_ENDPOINT,
  TYPESAFE_INPUT_COST_PER_MILLION,
  TYPESAFE_MODEL,
} from './jev-routing-types.js';

export interface RawTypeSafeUsage {
  readonly input_tokens?: number;
  readonly output_tokens?: number;
}

export interface RawChoiceAnswer {
  readonly choice?: JevRoutingClass;
  readonly probabilities?: JevProbabilities;
  readonly confidence?: number;
}

export interface RawNoulAnswer {
  readonly type?: 'noul';
  readonly noul?: number;
}

export interface RawTypeSafeResponse {
  readonly model?: string;
  readonly answers?: {
    readonly routing_decision?: RawChoiceAnswer;
    readonly is_deterministic_candidate?: RawNoulAnswer;
    readonly is_generative_required?: RawNoulAnswer;
    readonly is_security_escalation?: RawNoulAnswer;
  };
  readonly usage?: RawTypeSafeUsage;
}

export interface ChoiceExecutionResult {
  readonly success: boolean;
  readonly predictedClass: JevRoutingClass | null;
  readonly probabilities: JevProbabilities | null;
  readonly confidence: number | null;
  readonly latencyMs: number;
  readonly inputTokens: number | null;
  readonly outputTokens: number | null;
  readonly estimatedCostUsd: number | null;
  readonly providerModel: string | null;
  readonly error?: string;
}

export interface AtomicExecutionResult {
  readonly success: boolean;
  readonly deterministicNoul: number | null;
  readonly generativeNoul: number | null;
  readonly securityNoul: number | null;
  readonly latencyMs: number;
  readonly inputTokens: number | null;
  readonly outputTokens: number | null;
  readonly estimatedCostUsd: number | null;
  readonly providerModel: string | null;
  readonly error?: string;
}

const VALID_CHOICES: readonly JevRoutingClass[] = [
  'DETERMINISTIC_CANDIDATE',
  'GENERATIVE_REQUIRED',
  'SECURITY_ESCALATE',
];

export function calculateJevInputCostUsd(inputTokens: number | null): number | null {
  if (typeof inputTokens !== 'number') return null;
  return (inputTokens / 1_000_000) * TYPESAFE_INPUT_COST_PER_MILLION;
}

export async function executeChoiceRequest(
  callerInput: string,
  apiKey: string,
  model: string = TYPESAFE_MODEL,
): Promise<ChoiceExecutionResult> {
  const payload = { ...buildJevChoicePayload(callerInput), model };
  const startTime = Date.now();

  try {
    const res = await fetch(TYPESAFE_ENDPOINT, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify(payload),
    });

    const latencyMs = Date.now() - startTime;
    if (!res.ok) {
      return {
        success: false,
        predictedClass: null,
        probabilities: null,
        confidence: null,
        latencyMs,
        inputTokens: null,
        outputTokens: null,
        estimatedCostUsd: null,
        providerModel: null,
        error: `HTTP_${res.status}`,
      };
    }

    const data = (await res.json()) as RawTypeSafeResponse;
    const answer = data.answers?.routing_decision;
    const choice = answer?.choice;
    const inputTokens =
      typeof data.usage?.input_tokens === 'number' ? data.usage.input_tokens : null;
    const outputTokens =
      typeof data.usage?.output_tokens === 'number' ? data.usage.output_tokens : null;
    const providerModel = typeof data.model === 'string' ? data.model : null;

    if (!choice || !VALID_CHOICES.includes(choice) || !providerModel) {
      return {
        success: false,
        predictedClass: null,
        probabilities: null,
        confidence: null,
        latencyMs,
        inputTokens,
        outputTokens,
        estimatedCostUsd: calculateJevInputCostUsd(inputTokens),
        providerModel,
        error: 'INVALID_CHOICE_PAYLOAD',
      };
    }

    return {
      success: true,
      predictedClass: choice,
      probabilities: answer?.probabilities ?? null,
      confidence: typeof answer?.confidence === 'number' ? answer.confidence : null,
      latencyMs,
      inputTokens,
      outputTokens,
      estimatedCostUsd: calculateJevInputCostUsd(inputTokens),
      providerModel,
    };
  } catch (err) {
    return {
      success: false,
      predictedClass: null,
      probabilities: null,
      confidence: null,
      latencyMs: Date.now() - startTime,
      inputTokens: null,
      outputTokens: null,
      estimatedCostUsd: null,
      providerModel: null,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

export async function executeAtomicRequest(
  callerInput: string,
  apiKey: string,
  model: string = TYPESAFE_MODEL,
): Promise<AtomicExecutionResult> {
  const payload = { ...buildJevAtomicPayload(callerInput), model };
  const startTime = Date.now();

  try {
    const res = await fetch(TYPESAFE_ENDPOINT, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify(payload),
    });

    const latencyMs = Date.now() - startTime;
    if (!res.ok) {
      return {
        success: false,
        deterministicNoul: null,
        generativeNoul: null,
        securityNoul: null,
        latencyMs,
        inputTokens: null,
        outputTokens: null,
        estimatedCostUsd: null,
        providerModel: null,
        error: `HTTP_${res.status}`,
      };
    }

    const data = (await res.json()) as RawTypeSafeResponse;
    const detNoul = data.answers?.is_deterministic_candidate?.noul;
    const genNoul = data.answers?.is_generative_required?.noul;
    const secNoul = data.answers?.is_security_escalation?.noul;
    const inputTokens =
      typeof data.usage?.input_tokens === 'number' ? data.usage.input_tokens : null;
    const outputTokens =
      typeof data.usage?.output_tokens === 'number' ? data.usage.output_tokens : null;
    const providerModel = typeof data.model === 'string' ? data.model : null;

    if (
      typeof detNoul !== 'number' ||
      typeof genNoul !== 'number' ||
      typeof secNoul !== 'number' ||
      !providerModel
    ) {
      return {
        success: false,
        deterministicNoul: null,
        generativeNoul: null,
        securityNoul: null,
        latencyMs,
        inputTokens,
        outputTokens,
        estimatedCostUsd: calculateJevInputCostUsd(inputTokens),
        providerModel,
        error: 'INVALID_ATOMIC_PAYLOAD',
      };
    }

    return {
      success: true,
      deterministicNoul: detNoul,
      generativeNoul: genNoul,
      securityNoul: secNoul,
      latencyMs,
      inputTokens,
      outputTokens,
      estimatedCostUsd: calculateJevInputCostUsd(inputTokens),
      providerModel,
    };
  } catch (err) {
    return {
      success: false,
      deterministicNoul: null,
      generativeNoul: null,
      securityNoul: null,
      latencyMs: Date.now() - startTime,
      inputTokens: null,
      outputTokens: null,
      estimatedCostUsd: null,
      providerModel: null,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}
