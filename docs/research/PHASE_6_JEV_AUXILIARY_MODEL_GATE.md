# PHASE 6 - TypeSafe Jev Auxiliary Model Decision Gate

**Document Status:** Research Completed / Benchmark Pending
**Classification:** `BENCHMARK_CANDIDATE`
**Date:** 2026-09-29
**Primary Evidence:** Official TypeSafe AI documentation, accessed 2026-09-29

---

## 1. Identity

| Field | Value |
|:---|:---|
| Company | TypeSafe AI |
| Product | Jev |
| Class | System One Model |
| Documentation Root | https://docs.typesafe.ai/ |
| Documentation Index | https://docs.typesafe.ai/llms.txt |
| API Endpoint | `POST https://api.typesafe.ai/v1/systemone` |
| Model Alias (Flagship) | `jev-latest` resolves to `jev-1.13.0` |
| Model Alias (Preview) | `jev-preview` resolves to `jev-1.13.0` (no separate preview build currently) |

> **Research Scope:** Limited exclusively to `docs.typesafe.ai`, `typesafe.ai`, and
> official TypeSafe repositories linked from documentation. No other products named
> "JEV" were researched.

---

## 2. Product Identity: What Jev Is and Is Not

**Source: FACT FROM PROVIDER DOCUMENTATION**
(docs.typesafe.ai/introduction.md, docs.typesafe.ai/concepts/system-one.md)

### Jev IS

- A **System One model**: a class of AI model that makes fast, structured decisions
  software can use directly.
- A model that evaluates **state** + **typed questions** and returns **structured
  answers** (typed values + probability distributions).
- A model that returns **calibrated probabilities** optimized against outcomes to
  reflect uncertainty.
- A model that accepts natural-language text input (string, JSON object, or array of
  text values). Images, audio, and video are not supported.

### Jev IS NOT

- A chat LLM.
- A text generator. Jev **does not write replies, produce code, or generate
  explanations.**
- An autonomous agent that chooses its own next action.
- An orchestrator. It does not coordinate turns, handoffs, or business workflows.
- A replacement for the generative conversational model (`ConversationModelPort`).

**Critical quote from official documentation:**

> "System One is TypeSafe's model for building AI-powered software, not agents.
> It does not generate code or choose its own next action. It provides AI primitives
> that embed into software, so code remains in control while the model handles
> common-sense judgments over unstructured data."

---

## 3. API Shape

**Source: FACT FROM PROVIDER DOCUMENTATION (docs.typesafe.ai/api.md)**

### Request

```
POST https://api.typesafe.ai/v1/systemone
Authorization: Bearer <API_KEY>
Content-Type: application/json
```

**Request body fields:**

| Field | Type | Required | Description |
|:---|:---|:---|:---|
| `state` | `string / object / array` | Yes | Content to evaluate |
| `model` | `string` | Yes | Model alias or ID. Use `"jev-latest"` |
| `questions` | `map<string, Question>` | Yes | Named typed questions |

**Example minimal request:**

```json
{
  "state": "My payouts have been failing for 3 days.",
  "model": "jev-latest",
  "questions": {
    "is_urgent": {
      "type": "noul",
      "instructions": "Does this convey urgency?"
    }
  }
}
```

### Response

| Field | Type | Required | Description |
|:---|:---|:---|:---|
| `model` | `string` | Yes | Versioned model ID (e.g. `jev-1.13.0`) |
| `answers` | `map<string, Answer>` | Yes | One answer per question, same keys |
| `usage` | `object` | Yes | `input_tokens` + `output_tokens` (integers) |

**Example response:**

```json
{
  "model": "jev-1.13.0",
  "answers": {
    "is_urgent": { "type": "noul", "noul": 0.95 }
  },
  "usage": { "input_tokens": 296, "output_tokens": 20 }
}
```

---

## 4. SDK Status

**Source: FACT FROM PROVIDER DOCUMENTATION**
(docs.typesafe.ai/sdk/javascript.md, docs.typesafe.ai/sdk/python.md)

### Python SDK

| Field | Value |
|:---|:---|
| Status | `AVAILABLE` |
| Package | `typesafe-sdk` (PyPI) |
| Minimum Runtime | Python >= 3.10 |
| Client Classes | `TypeSafeClient` (sync), `AsyncTypeSafeClient` (async) |

### JavaScript / TypeScript SDK

| Field | Value |
|:---|:---|
| Status | `AVAILABLE` |
| Package | `@typesafe-ai/sdk` (npm) |
| Minimum Runtime | Node.js 20 or newer |
| Formats | ESM, CommonJS, TypeScript declarations included |
| Entry Point | `import { choice, TypeSafeClient } from "@typesafe-ai/sdk"` |
| Source | https://github.com/typesafe-ai/typesafe-sdk-js |

**TypeScript quickstart (from official docs):**

```typescript
import { choice, TypeSafeClient } from "@typesafe-ai/sdk";

const client = new TypeSafeClient();
const response = await client.systemOne({
  state: { document: "I was charged twice. Please fix this ASAP." },
  questions: {
    category: choice("What is this ticket about?", {
      billing: null,
      technical: null,
      other: null,
    }),
  },
});

console.log(response.answers.category.choice);
```

> Answer types are inferred from supplied questions. No runtime parsing required.

### Direct HTTP Feasibility

`INFERENCE (not a provider claim)`: Since the HTTP API is fully documented with
standard JSON shapes and bearer-token authentication, direct HTTP via native `fetch`
is architecturally possible from any TypeScript/Node runtime.

Future implementation must evaluate: `@typesafe-ai/sdk` vs. native `fetch`.
**YAGNI - no decision required now.**

---

## 5. Primitives

**Source: FACT FROM PROVIDER DOCUMENTATION**
(docs.typesafe.ai/api.md, docs.typesafe.ai/primitives.md)

All three primitives are sent under the `questions` map of a single request.
Questions are **evaluated independently and in parallel** against the same state.

### 5.1 Choice

Selects one option from a **defined set** the caller supplies.

Request fields: `type: "choice"`, `instructions`, `criteria` (map of option to
description; max 255 options).

**Answer fields:**

| Field | Type | Description |
|:---|:---|:---|
| `type` | `"choice"` | Literal discriminator |
| `choice` | `string` | Highest-probability option |
| `probabilities` | `map<string, number>` | All options mapped to probabilities (sum to 1) |
| `confidence` | `number` | Certainty derived from distribution (0-1) |

**Semantic use:** Categorical routing to a closed set of known outcomes.

**Example answer:**

```json
{
  "type": "choice",
  "choice": "billing",
  "probabilities": { "billing": 0.88, "technical": 0.12, "sales": 0.0 },
  "confidence": 0.81
}
```

### 5.2 Score

Rates the state along an **ordered rubric** the caller defines.

Request fields: `type: "score"`, `instructions`, `criteria` (ordered array; 2-10
levels).

**Answer fields:**

| Field | Type | Description |
|:---|:---|:---|
| `type` | `"score"` | Literal discriminator |
| `score` | `number` | Probability-weighted value; can land between levels |
| `legend` | `map<string, string>` | Each level index mapped to its description |
| `probabilities` | `map<string, number>` | Each level mapped to its probability (sum to 1) |
| `confidence` | `number` | Certainty derived from distribution (0-1) |

**Semantic use:** Intensity or gradient measurement (e.g., frustration level).

**Example answer:**

```json
{
  "type": "score",
  "score": 1.05,
  "legend": { "0": "Calm", "1": "Frustrated", "2": "Very angry" },
  "probabilities": { "0": 0.0, "1": 0.95, "2": 0.05 },
  "confidence": 0.92
}
```

### 5.3 Noul

Returns the **probability (0-1) that a statement is true**. A yes/no evaluator,
not a boolean.

Request fields: `type: "noul"`, `instructions`, optional `criteria` with `true`
and `false` descriptions.

**Answer fields:**

| Field | Type | Description |
|:---|:---|:---|
| `type` | `"noul"` | Literal discriminator |
| `noul` | `number` | Probability from 0 (no) to 1 (yes) |

> **Important:** Noul does **not** return `confidence`. Code must decide how to
> interpret the probability value. Do NOT automatically translate Noul to boolean
> without an explicit threshold decision in code.

**Example answer:**

```json
{
  "type": "noul",
  "noul": 0.95
}
```

---

## 6. Many Questions / One Request

**Source: FACT FROM PROVIDER DOCUMENTATION (docs.typesafe.ai/introduction.md)**

> "All three question types can be mixed in a single API call. Every question is
> evaluated in parallel and in isolation against the same state in one go. Adding
> questions barely changes the response time."

**Classification:** `PROVIDER CLAIM` - performance claim ("barely changes response
time", "in parallel") is asserted by the provider. Actual latency for our workload
from Brazil has **NOT BEEN MEASURED**.

**Architectural implication (INFERENCE, not provider claim):** If Jev is used,
batch all relevant questions for the same turn-state into a single request to
minimize round trips.

---

## 7. Control Flow Authority

**Source: FACT FROM PROVIDER DOCUMENTATION**
(docs.typesafe.ai/concepts/how-to-build-with-system-one.md)

> "System One is TypeSafe's model for building AI-powered software, not agents.
> Code handles deterministic work and owns the control flow."

**Alignment with our architecture:**

| Component | Authority |
|:---|:---|
| `ConversationOrchestrator` | Turn coordination, tool dispatch - CODE |
| `CallSession` / State Machine | Call lifecycle, state transitions - CODE |
| Authorization / Tenant isolation | Deterministic check - CODE |
| Handoff decisions | State machine + human authorization - CODE |
| Business rules, pricing | Deterministic - CODE |
| Semantic judgment on caller utterance | Potential Jev advisory signal |

**Terminology rule:** Jev is an **ADVISORY STRUCTURED DECISION MODEL**.
Do not call Jev an orchestrator.

---

## 8. Provider-Documented Use Cases

**Source: FACT FROM PROVIDER DOCUMENTATION**
(docs.typesafe.ai/cookbooks/llm_guardrails.md,
docs.typesafe.ai/patterns/intent-routing.md)

| Use Case | Status |
|:---|:---|
| Intent classification / routing | `PROVIDER-DOCUMENTED USE CASE` |
| Guardrails for LLMs (input/output screening) | `PROVIDER-DOCUMENTED USE CASE` |
| Jailbreak / prompt injection detection | `PROVIDER-DOCUMENTED USE CASE` |
| Tool-call verification | `PROVIDER-DOCUMENTED USE CASE` |
| Semantic context relevance / re-ranking | `PROVIDER-DOCUMENTED USE CASE` |
| Sentiment / frustration scoring | `PROVIDER-DOCUMENTED USE CASE` |
| Confidence-gated escalation | `PROVIDER-DOCUMENTED PATTERN` |
| Model routing (classify difficulty/risk) | `PROVIDER-DOCUMENTED PATTERN` |

> **Security note:** Jev is NEVER the **sole** security protection. Primary
> protections remain: authority boundary, deterministic authorization, tool
> validation, and `organizationId` isolation. Jev signals are advisory.

---

## 9. Model and Pricing

**Source: FACT FROM PROVIDER DOCUMENTATION (docs.typesafe.ai/models.md, 2026-09-29)**

| Model ID | Aliases | Price | Rate Limits | Context |
|:---|:---|:---|:---|:---|
| `jev-1.13.0` | `jev-latest`, `jev-preview` | $42/Btok = $0.042/Mtok | 250k tok/sec; 1,200 req/min | 64k total; 32k state + longest question |

**Pricing notes:**
- Charged **per input token only**. Output tokens are free.
- Btok = billion tokens. Mtok = million tokens.

**Provider warning from docs:**
> "Rate limits are adjusting dynamically. We are serving a very large volume of
> demand, and the limits above can change without notice."

**Language support (from docs):**
> "English is the primary training language and where accuracy is currently best.
> Other languages, including CJK scripts, are handled but not equally well."

**CLASSIFICATION:**
- pt-BR support: `PROVIDER CLAIM INFERRED FROM GENERAL STATEMENT`
- pt-BR telephone-sales voice domain accuracy: `NOT VERIFIED`

---

## 10. Jev vs. Generative Model - Architectural Role Separation

### 10.1 What Jev Does Not Replace

| Dimension | Generative Model (ConversationModelPort) | Jev (Auxiliary) |
|:---|:---|:---|
| Output type | Streaming text for TTS | Typed structured answers |
| Role | Generate spoken response | Advisory judgment on state |
| Returns | `text.delta` stream | `answers` map |
| Streaming | Yes | No (batch response) |
| Generates speech content | Yes | No |

### 10.2 Main Model Call Avoidance Semantics

**CRITICAL DEFINITION:**

```
JEV_CALL != MAIN_CALL_AVOIDED
```

A Jev call only avoids a generative model call if the Jev result allows code to
**complete the turn without invoking the LLM**. If Jev runs on every turn AND
the main model runs on every turn:
- Main request count: **unchanged**
- Jev adds: cost + latency + failure surface

This scenario **must not be assumed as the default architecture**.

### 10.3 Conceptual Classes When Main Model Can Be Avoided

These are concept classes only - NOT feature requirements:

| Class | Description |
|:---|:---|
| A | Deterministic path: turn completed by code logic alone |
| B | No spoken response required: silence or system action |
| C | Pre-authored/template response: no generative text needed |
| D | Routing without generation: dispatch without conversational LLM |

**Status:** `CONCEPTUAL ONLY / NOT IMPLEMENTED`

### 10.4 Required Future Metric

```
MAIN_MODEL_CALL_AVOIDANCE_RATE =
  turns where main LLM was NOT invoked due to Jev signal
  / total turns
```

Must be measured empirically. No estimate is valid before a baseline.

---

## 11. Context Token Reduction

**Source: PROVIDER-DOCUMENTED USE CASE**
(docs.typesafe.ai/cookbooks/classifying_rag_passages.md,
docs.typesafe.ai/cookbooks/rerank_typesafe.md)

TypeSafe documents semantic relevance / re-ranking use cases. This can reduce
**input tokens** sent to the main model even when the main model call is not
eliminated.

**Separate metric (distinct from call avoidance):**

```
MAIN_INPUT_TOKEN_REDUCTION =
  baselineMainInputTokens - withJevMainInputTokens
```

Our runtime already implements **bounded conversation history**. Jev relevance
selection must demonstrate **measurable additional benefit** over the existing
bounded-history baseline to justify adoption.

---

## 12. Early Access / Maturity Status

**Source: FACT FROM PROVIDER DOCUMENTATION + PROVIDER WARNING IN DOCS**
(docs.typesafe.ai/models.md, accessed 2026-09-29)

Evidence observed:
- Public API with documented pricing. Two SDKs published. No "private beta" or
  "waitlist" language found in current live docs.
- Provider explicitly warns rate limits are **dynamically adjusting**.
- No explicit "Early Access" designation found in current documentation.

**Assessment:**
- `EARLY_ACCESS_ANNOUNCED: YES` — 2026-09-15 provider announcement by TypeSafe.
- `CURRENT_PUBLIC_API: AVAILABLE` — documented API, SDK, and pricing page exist as of 2026-09-29.
- `CURRENT_GA_STATUS: NOT VERIFIED` — existence of public API, SDKs, and pricing does not prove General Availability. No GA announcement confirmed from documentation accessed.

**Risks regardless of GA status:**

| Risk | Status |
|:---|:---|
| API breaking changes | `POSSIBLE - versioned model IDs help mitigate` |
| Rate limit volatility | `DOCUMENTED RISK (explicitly stated in docs)` |
| SLA commitment | `NOT VERIFIED - no SLA page found in docs` |
| Enterprise support terms | `NOT VERIFIED - contact sales@typesafe.ai required` |
| Physical data region | `NOT VERIFIED - no region documentation found` |

---

## 13. Confidence: Calibration and Thresholds

**Source: FACT FROM PROVIDER DOCUMENTATION (docs.typesafe.ai/confidence.md)**

### Confidence Semantics

- `confidence` returned on **Choice** and **Score** only.
- **Noul does NOT return `confidence`.**
- Derived from probability distribution shape.
- From docs: *"Calibration is measured across groups of predictions; it does not
  guarantee that an individual answer is correct."*

### Schema Safety vs. Semantic Correctness

**EXPLICIT DISTINCTION:**

```
STRUCTURAL CONFORMANCE != SEMANTIC CORRECTNESS
```

Even when output is type-safe (correct schema), the **decision may be semantically
wrong**. `typed != correct`.

### Threshold Policy

- Documentation examples use values like `0.5`, `0.9`.
- **These are provider EXAMPLES, not platform defaults.**
- No fixed thresholds are adopted from this gate.

```
THRESHOLD_SOURCE = empirical evaluation against our data
THRESHOLDS_NOW = NOT SET
CALIBRATION_ON_PTBR_VOICE_SALES_DOMAIN = NOT VERIFIED
```

---

## 14. Candidate Voice Signals for Benchmark

**Status: BENCHMARK HYPOTHESES - NOT product requirements.**

| Signal | Primitive | Hypothesis |
|:---|:---|:---|
| Acknowledgement ("ok/sim/entendi") | Noul | Could enable deterministic template response |
| Repeat request (same question twice) | Noul | Could route to clarification path |
| Explicit human transfer request | Noul | Advisory signal for handoff state machine |
| Objection signal | Noul/Choice | Detect sales resistance |
| Urgency level | Score | Adjust response priority |
| Frustration level | Score | Adapt conversation tone |
| Conversation intent / stage | Choice | Classify goal or funnel stage |
| Context relevance of last response | Noul | Input token reduction signal |
| Possible prompt injection / jailbreak | Noul | Guardrail advisory signal |

> **Governance rule:** A `human_request` signal from Jev is advisory only.
> Handoff remains dependent on the state machine and explicit human authorization.

---

## 15. Async Turn Architecture Hypothesis

**Status: BENCHMARK HYPOTHESIS - NOT IMPLEMENTED.**

Preferred architectural hypothesis for Jev if benchmark demonstrates value:

```
Turn N:  caller speaks
      -> ConversationRelay -> transcript
      -> ConversationOrchestrator invokes main model (TTFT critical path)
      -> Jev evaluation launched ASYNCHRONOUSLY (outside critical path)
      -> Turn N response generated and spoken

Turn N+1: Jev signals from Turn N are available
       -> ConversationOrchestrator uses Turn-N signals to inform routing
```

**Benefit:** Does not block TTFT of the current turn.

**Constraint:** Signals are turn-delayed. Limits value for same-turn decisions.

```
ASYNC_ARCHITECTURE_HYPOTHESIS = BENCHMARK_HYPOTHESIS
BRAZIL_LATENCY = NOT MEASURED
OUR_VOICE_PATH_LATENCY = NOT MEASURED
```

---

## 16. Serial Critical-Path Risk

**Status: RISK DOCUMENTED - NOT RESOLVED.**

Inserting Jev serially before the main model on every turn:

```
[caller utterance]
-> Jev request (serial wait) <- latency risk here
-> main LLM request
-> first text.delta -> TTS -> speech
```

Risks:
- Increases Time-to-First-Token (TTFT).
- Degrades conversational naturalness.
- Adds failure surface (429, timeout, 5xx) to critical path.

Provider positioning: "Most queries complete in about 100 ms."
**Classification:** `PROVIDER CLAIM`. Not measured for Brazil or production load.

**Rule:** Do not mandate serial Jev insertion on every turn without measuring impact.

---

## 17. Double-Provider Data Processing

If both Jev and a generative provider are used, conversation-derived data is
processed by **two vendors**. A future privacy review must address:

| Topic | Status |
|:---|:---|
| Jev data retention | `NOT VERIFIED` — DPA referenced at typesafe.ai/legal/data-processing |
| Training on customer data | `PROVIDER POLICY CLAIM`: "not trained on customer requests or responses" (typesafe.ai/legal.md) |
| Zero Data Retention (ZDR) | `PROVIDER POLICY CLAIM`: AVAILABLE FOR ENTERPRISE — contact sales@typesafe.ai (typesafe.ai/legal.md) |
| Cross-border processing / data region | `NOT VERIFIED` |
| DPA / subprocessors | `PROVIDER POLICY CLAIM`: DPA document exists at typesafe.ai/legal/data-processing — not reviewed in this gate |
| Interaction with generative provider data terms | `NOT VERIFIED` |

> **No legal conclusion drawn.** Formal DPA review required before production use
> with real caller data.

---

## 18. Fallback Architecture Hypothesis

**Status: PROPOSED / NOT IMPLEMENTED.**

```
Jev unavailable
-> bypass auxiliary decision layer
-> continue with main generative model
-> deterministic rules handle routing
```

Jev MUST NOT become a single point of failure for call completion. Fallback must
be handled at the architecture layer (circuit breaker or skip).

---

## 19. New Port Decision

```
NEW_PORT_NEEDED_NOW = NO
```

An `AuxiliaryDecisionPort` should only be considered after a benchmark demonstrates
measurable value. YAGNI applies.

---

## 20. Cost Model (Future Benchmark Formulas Only)

No cost estimates in this gate. Formulas only:

```
BASELINE_COST =
  total generative model cost (all turns, no Jev)

JEV_LAYER_COST =
  Jev input token cost
  + remaining generative model cost (turns not avoided)

SAVINGS =
  BASELINE_COST - JEV_LAYER_COST
```

Jev pricing from docs: `$0.042 per million input tokens` (output tokens free).
Generative provider pricing: `PENDING HUMAN DECISION`.

No savings estimate is valid until BASELINE is measured.

---

## 21. Metrics for Future Benchmark

No thresholds. Metric definitions only:

| Metric | Description |
|:---|:---|
| `mainModelRequests` | Count of generative model calls |
| `jevRequests` | Count of Jev calls |
| `mainModelCallAvoidanceRate` | Turns skipped by main LLM / total turns |
| `baselineMainInputTokens` | Avg input tokens per turn without Jev |
| `withJevMainInputTokens` | Avg input tokens per turn with Jev selection |
| `mainInputTokenReduction` | Difference in input tokens |
| `baselineCost` | Total cost of baseline scenario |
| `combinedCost` | Total cost of Jev-assisted scenario |
| `costReduction` | Difference |
| `jevLatencyP50` / `jevLatencyP95` | Jev response time percentiles |
| `mainModelTTFT` | Time to first text delta from generative model |
| `totalResponseTTFT` | End-to-end TTFT experienced by TTS |
| `falseBypassRate` | Turns wrongly skipped by main model |
| `unnecessaryEscalationRate` | False positives for human transfer |
| `routingAccuracy` | Correct routing decisions vs. ground truth |
| `fallbackRate` | Rate of Jev unavailability requiring bypass |

---

## 22. Benchmark Execution Plan

**STEP 1 - Baseline First:**
Implement and measure the generative model baseline. Capture `mainModelRequests`,
`baselineCost`, `baselineMainInputTokens`, `mainModelTTFT`.

**STEP 2 - Dataset:**
Capture synthetic or anonymized call transcripts adequate for Jev evaluation.

**STEP 3 - Jev Benchmark:**
Run Jev on dataset with candidate signal questions. Measure all metrics (Section 21).

**STEP 4 - Comparison:**
Compare baseline vs. Jev-assisted. Compute `SAVINGS`, `mainModelCallAvoidanceRate`,
`mainInputTokenReduction`.

**STEP 5 - Human Decision:**
Present evidence to operator. Decision belongs to the operator.

> Principle: "Baseline first" prevents asserting savings without evidence.

---

## 23. Classification Rationale

**Classification: `BENCHMARK_CANDIDATE`**

| Criterion | Evidence |
|:---|:---|
| Supported HTTP API | `POST /v1/systemone` - FACT FROM DOCS |
| Commercial/production use terms | `COMMERCIAL_USE_FOR_OUR_PRODUCTION_CASE: NOT VERIFIED` — API, pricing, and SDK exist but full production/commercial terms require review of Master Customer Agreement at typesafe.ai/legal/mca (not audited in this gate) |
| Structured decisions useful to architecture | Intent, guardrails, routing - PROVIDER-DOCUMENTED USE CASES |
| Provider-neutral core preserved | Core never imports `@typesafe-ai/sdk` - ARCHITECTURAL RULE |

**Classification explicitly NOT `ADOPTED`.** Adoption requires benchmark demonstrating
measurable value over the baseline.

---

## 24. Provider Decisions Status

| Decision | Status |
|:---|:---|
| Primary Conversation Model Provider | `PENDING HUMAN DECISION` |
| Jev Auxiliary Model | `BENCHMARK_CANDIDATE` |
| Generative spike candidate (from PR #28) | OpenAI Chat Completions (spike only; not final) |

---

## 25. Official Sources Consulted

All URLs accessed on 2026-09-29:

| Source | URL |
|:---|:---|
| Docs index | https://docs.typesafe.ai/llms.txt |
| Introduction | https://docs.typesafe.ai/introduction.md |
| System One concept | https://docs.typesafe.ai/concepts/system-one.md |
| How to build | https://docs.typesafe.ai/concepts/how-to-build-with-system-one.md |
| API reference | https://docs.typesafe.ai/api.md |
| Models and pricing | https://docs.typesafe.ai/models.md |
| Confidence | https://docs.typesafe.ai/confidence.md |
| JavaScript SDK | https://docs.typesafe.ai/sdk/javascript.md |
| Python SDK | https://docs.typesafe.ai/sdk/python.md |
| Legal | https://docs.typesafe.ai/legal.md |

---

## 26. Operational Integrity Checklist

- Code changed: **ZERO**
- Dependencies installed: **ZERO**
- API calls made to any provider: **ZERO**
- Secrets requested or stored: **ZERO**
- Implementation started: **NOT STARTED**
- `AuxiliaryDecisionPort` created: **NO**
- Primary provider selected: **NO - PENDING HUMAN DECISION**
