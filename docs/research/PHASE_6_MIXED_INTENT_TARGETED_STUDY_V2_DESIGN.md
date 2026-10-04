# Desenho do Estudo Direcionado v2 Mixed-Intent (PHASE_6_MIXED_INTENT_TARGETED_STUDY_V2_DESIGN.md)

> **Desenho OFFLINE (slice 006BE). Sem implementação de runner. Sem dataset criado. Sem providers. Sem live.**

## 1. Purpose

Desenhar a versão 2 do estudo direcionado mixed-intent: provar, para UM mesmo caso sintético legítimo, a cadeia `capabilityRelevant → Jev → GENERATIVE_REQUIRED → OpenAI → completion`, sem redefinir a semântica histórica de `matcherMatched`.

## 2. Historical Evidence

- 006BA (artefato `f16c150c...`): Jev 7/7 + OpenAI 5/5, `PARTIAL_CHAIN_OBSERVED`, joint `NOT_OBSERVED`; `L2_RESULT = FAILED` preservado.
- 006BB: critério A inalcançável com matcher/handler atuais; dataset v1-targeted inválido p/ prova live (sondas honestas).
- 006BC/006BD: `HYBRID_MINIMAL` desenhado e implementado (`resolveOperatingHoursInvolvement → { relevant, exactlyAnswerable }`); matcher exato intacto; fallback `handled=false → GENERATIVE` reutilizado.
- `HISTORICAL_MATCHER_MATCHED_SEMANTICS = EXACT_WHOLE_UTTERANCE_MATCHER` (runner: `isMatched = matchesOperatingHoursCapability(...)` em `l2-runner-case-execution.mjs`; `FUTURE_MATCHER_MATCHED_REDEFINITION_ALLOWED = NO`).

## 3. Post-006BD Capability Semantics

- `CAPABILITY_RELEVANCE = resolveOperatingHoursInvolvement(...).relevant` (exato OU span delimitado).
- `FULL_DETERMINISTIC_RESOLVABILITY = resolveOperatingHoursInvolvement(...).exactlyAnswerable` (só fala inteira exata).
- `EXACT_WHOLE_UTTERANCE_MATCHER = matchesOperatingHoursCapability(...)` (inalterado, 23 frases).
- Mixed legítimo: `capabilityRelevant = true`, `exactlyAnswerable = false`, exact matcher `false` — sem contradição, por desenho.

## 4. Evidence Schema v2 (`V2_EVIDENCE_SCHEMA_SEMANTICS = UNAMBIGUOUS`)

Campos versionados (`schemaVersion: "2.0.0"`), cada um com UM significado:
- `matcherMatched`: APENAS matcher exato legado (compatível com v1; nunca redefinido).
- `capabilityRelevant`: detector 006BD (span delimitado).
- `exactlyAnswerable`: fala inteira exata (guarda de entrega determinística).
- `jevEvaluated`, `policyOutcome` (`SECURITY_ESCALATE`/`DETERMINISTIC_CANDIDATE`/`GENERATIVE_REQUIRED`), `openAiInvoked`, `completionObserved`, `securityEscalated`, `deterministicDispatchAttempted`, `deterministicHandled`, `caseId`, `schemaVersion`.

## 5. Aggregate Counters v2 (Uma Definição Cada)

- `matcherTrue/matcherFalse`: SÓ matcher exato (legado, nunca relevância).
- Novos: `capabilityRelevantTrue/False`, `exactlyAnswerableTrue/False`, `jevEvaluatedCount`, `openAiInvokedCount`, `jointChainObservedCount` (joint = cadeia §8).

## 6. Criterion A v1 vs v2

- v1 histórico INTACTO (`CRITERION_A_V1_HISTORICAL_SEMANTICS_CHANGED = NO`): mesmo caso com `matcherMatched = true` + joint.
- `CRITERION_A_V2_DEFINED = YES` (`CRITERION_A_V2_MIXED_INTENT_JOINT_CHAIN`): UM caso misto com `capabilityRelevant = true`, `exactlyAnswerable = false`, Jev avaliado `SUCCESS` (`jev-1.13.0`), policy `GENERATIVE_REQUIRED`, OpenAI invocado `SUCCESS`, completion observada em transporte fake, 0 erro técnico. NÃO exige `matcherMatched = true` (esperado `false`).
- `CRITERION_A_V2_EVIDENCE_GAMING_RISK = LOW`: casos com necessidade semântica genuína de geração; Jev cego ao desenho; thresholds intactos; PASS exige veredito generativo genuíno do Jev (se discordar → `NO_MATCHED_GENERATIVE_CASE_OBSERVED`, informativo).

## 7. SECURITY Semantics

- `SECURITY_ESCALATE_PRESERVED = YES`; `SECURITY_ESCALATE_COUNTS_AS_JOINT_CHAIN_PASS = NO` (recusa estática não é completion generativa; forçar rota generativa p/ passar é PROIBIDO).
- `FROZEN_POLICY_CHANGED = NO` (`T_SECURITY = 0.56`, `T_DETERMINISTIC = 0.35`, `T_GENERATIVE = 0.47`).

## 8. DETERMINISTIC_CANDIDATE Fallback Decision

- `OPTION_A` (só `GENERATIVE_REQUIRED` direto conta): significado científico limpo (Jev afirmou necessidade generativa); comparável ao predicado v1; risco de gaming mínimo.
- `OPTION_B` (decline→generativo também conta): representativo (caminho provável com Jev determinístico-leaning), mas PASS quase automático (Jev determinístico + decline é o default observado) — destrói poder discriminativo.
- **Recomendação: `OPTION_A`** (`DETERMINISTIC_CANDIDATE_FALLBACK_CRITERION_DECISION = OPTION_A_DIRECT_GENERATIVE_REQUIRED_ONLY`); caminho decline→OpenAI registrado como telemetria secundária, não PASS.

## 9. Dataset v2 Identity (NÃO CRIADO)

- `V2_DATASET_STATUS = DESIGN_ONLY_NOT_CREATED`; path futuro: `scripts/benchmarks/voice/jev-openai-l2-joint-chain-mixed-intent-v2-cases.json` (v1.0.0, suite `phase-6-l2-joint-chain-mixed-intent`).
- v1-targeted preservado como `EXPLORATORY_MATCHER_POSITIVE_PARAPHRASE_PROBES`; v1 L2 e artefato históricos imutáveis.
- 4 candidatos mistos (residual genuíno; spans verificados offline contra allowlist rastreada + normalização documentada; `matcherMatched = false`, `relevant = true` p/ todos):

| id | fala (resumo) | span canônico | residual |
|---|---|---|---|
| v2-01 | horário + melhor período p/ evitar espera | `qual o horario de funcionamento` | recomendação generativa |
| v2-02 | que horas fecha + agendamento por telefone | `que horas fecha` | pergunta de política fora dos dados |
| v2-03 | até que horas + remarcar consulta amanhã | `ate que horas voces atendem` | pedido contextual |
| v2-04 | que horas abre + documentos p/ levar | `que horas abre` | pergunta de política fora dos dados |

## 10. Dataset Case Contract (Futuro)

`id`, `description`, `callerTranscript`, `expectedMatcherMatched` (= false), `expectedCapabilityRelevant` (= true), `expectedExactlyAnswerable` (= false), `expectedResidualSemanticWork` (= true). Outcomes do Jev: `NOT_OBSERVED / STUDY_TARGET`, nunca ground truth. `JEV_SCORE_BEHAVIOR = NOT_OBSERVED`.

## 11. Request Caps — Design Only

Controle real por caso (≤1 Jev + ≤1 OpenAI, retries 0, concorrência 1): `PROPOSED_V2_TYPESAFE_REQUEST_CAP = 4`, `PROPOSED_V2_OPENAI_REQUEST_CAP = 4`, `PROPOSED_V2_TOTAL_PROVIDER_REQUEST_CAP = 8`, `PROPOSED_V2_CONCURRENCY = 1`, `PROPOSED_V2_RETRIES = 0`, `PROPOSED_V2_CAP_STATUS = DESIGN_ONLY_NOT_AUTHORIZED`.

## 12. Cost Planning (Hipotético)

- TypeSafe $42/Btok `NOT_VERIFIED`; OpenAI tabela verificada do projeto ($10/$5/$50 por M).
- Pior caso 4+4 (1500in/500out): TypeSafe ≈ $0,000168 + OpenAI ≈ $0,16 → total ≈ $0,160168 (`HYPOTHETICAL_NOT_OBSERVED_NOT_BILLED`).
- `PROPOSED_LIVE_COST_CEILING = NOT_SELECTED`; `HARD_PROVIDER_BILLING_BOUND = NOT_PROVEN`.

## 13. Runner Versioning (`RECOMENDADO = OPTION_B`)

- `OPTION_A` (compat no runner atual): risco de corromper reproducibilidade v1; freeze legado exigiria aposentadoria explicada — rejeitado.
- **`OPTION_B` (entrypoint/módulos v2 separados, v1 congelado)**: risco histórico zero; duplicação pequena e isolada; v1 bit-a-bit; testabilidade máxima.
- `OPTION_C` (primitivas compartilhadas + camadas versionadas): meio-termo, mas qualquer edição compartilhada toca superfície da v1 — adiado.
- Invariante: artefato/dataset v1 imutáveis; `NEW_EXECUTABLE_FREEZE_VERSION = NO` (método 1.0.0 inalterado); `NEW_V2_EXECUTABLE_AGGREGATE = REQUIRED` (novo conjunto terá agregado próprio quando implementado; SHA futuro NÃO calculado agora).

## 14. YAGNI (`YAGNI_STATUS = PASS`)

Só estudo v2 operating-hours; sem framework de benchmark, ontologia, registry, DSL ou plugins. Menores adições versionadas necessárias.

## 15. Risks

Jev pode nunca retornar `GENERATIVE_REQUIRED` (estudo retorna `NO_MATCHED_GENERATIVE_CASE_OBSERVED`, informativo); residual mal delimitado (mitigado por span delimitado + testes); SECURITY em residual sensível (correto por precedência, não conta PASS); deriva de thresholds (proibida).

## 16. Implementation Plan (Futuro; NOT This Task)

Slice futura: entrypoint v2 (OPTION_B) + dataset v1.0.0 (4 casos §9) + testes matrix + freeze v2 (mesmo método) + envelope de pré-autorização próprio. Pré-requisito: revisão humana deste desenho. Sem live sem nova autorização explícita.

## 17. Exit Criteria

Desenho revisado; `MIXED_INTENT_TARGETED_STUDY_V2_DESIGN = COMPLETE`; `V2_IMPLEMENTATION_STATUS = NOT_STARTED`; `V2_DATASET_STATUS = DESIGN_ONLY_NOT_CREATED`; `V2_RUNNER_STATUS = DESIGN_ONLY_NOT_IMPLEMENTED`; live segue `NOT_AUTHORIZED`.
