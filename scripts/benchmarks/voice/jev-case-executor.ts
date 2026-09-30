import { calculateJevCostUsd } from './jev-routing-calculator.js';
import { buildJevRoutingPayload } from './jev-payload-builder.js';
import type { JevCaseResult, JevProbabilities, JevRoutingClass } from './jev-routing-types.js';
import { TYPESAFE_ENDPOINT } from './jev-routing-types.js';

interface RawCase {
  readonly caseId: string;
  readonly expectedRoutingClass: JevRoutingClass;
  readonly syntheticCallerInput: string;
}

interface TypeSafeChoiceAnswer {
  readonly choice?: JevRoutingClass;
  readonly probabilities?: JevProbabilities;
  readonly confidence?: number;
}

interface TypeSafeUsage {
  readonly input_tokens?: number;
  readonly output_tokens?: number;
}

interface TypeSafeResponsePayload {
  readonly answers?: {
    readonly routing_decision?: TypeSafeChoiceAnswer;
  };
  readonly usage?: TypeSafeUsage;
}

const VALID_CHOICES: readonly JevRoutingClass[] = [
  'DETERMINISTIC_CANDIDATE',
  'GENERATIVE_REQUIRED',
  'SECURITY_ESCALATE',
];

export async function executeSingleJevCase(c: RawCase, apiKey: string): Promise<JevCaseResult> {
  const payload = buildJevRoutingPayload(c.syntheticCallerInput);
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

    const jevLatencyMs = Date.now() - startTime;

    if (!res.ok) {
      return {
        caseId: c.caseId,
        expectedRoutingClass: c.expectedRoutingClass,
        jevChoice: null,
        probabilities: null,
        confidence: null,
        jevLatencyMs,
        inputTokens: null,
        outputTokens: null,
        estimatedCostUsd: null,
        status: 'FAIL',
        safeFailureCategory: `HTTP_${res.status}`,
      };
    }

    const data = (await res.json()) as TypeSafeResponsePayload;
    const answer = data.answers?.routing_decision;
    const choice = answer?.choice;
    const inputTokens =
      typeof data.usage?.input_tokens === 'number' ? data.usage.input_tokens : null;
    const outputTokens =
      typeof data.usage?.output_tokens === 'number' ? data.usage.output_tokens : null;

    if (!choice || !VALID_CHOICES.includes(choice)) {
      return {
        caseId: c.caseId,
        expectedRoutingClass: c.expectedRoutingClass,
        jevChoice: null,
        probabilities: null,
        confidence: null,
        jevLatencyMs,
        inputTokens,
        outputTokens,
        estimatedCostUsd: calculateJevCostUsd(inputTokens),
        status: 'FAIL',
        safeFailureCategory: 'INVALID_CHOICE_PAYLOAD',
      };
    }

    return {
      caseId: c.caseId,
      expectedRoutingClass: c.expectedRoutingClass,
      jevChoice: choice,
      probabilities: answer?.probabilities ?? null,
      confidence: typeof answer?.confidence === 'number' ? answer.confidence : null,
      jevLatencyMs,
      inputTokens,
      outputTokens,
      estimatedCostUsd: calculateJevCostUsd(inputTokens),
      status: 'PASS',
    };
  } catch (err: unknown) {
    const jevLatencyMs = Date.now() - startTime;
    const errorCode =
      err &&
      typeof err === 'object' &&
      'code' in err &&
      typeof (err as { code: unknown }).code === 'string'
        ? (err as { code: string }).code
        : 'NETWORK_ERROR';
    return {
      caseId: c.caseId,
      expectedRoutingClass: c.expectedRoutingClass,
      jevChoice: null,
      probabilities: null,
      confidence: null,
      jevLatencyMs,
      inputTokens: null,
      outputTokens: null,
      estimatedCostUsd: null,
      status: 'FAIL',
      safeFailureCategory: errorCode,
    };
  }
}
