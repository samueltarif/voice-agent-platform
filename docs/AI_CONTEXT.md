# Contexto Operacional Central de IA (AI_CONTEXT.md)

<!--
AI_CONTEXT_HEADER_START
CONTEXT_SCHEMA_VERSION: 1.1.0
LAST_REFRESHED_AT: 2026-10-07
CONTEXT_BASE_MAIN_SHA: 8d2422b80c4de4e739c3fefc07409fef04ef979a
CURRENT_PHASE: Phase 6 (Voice Model Routing & Jev Evaluation)
CURRENT_SLICE: Slice 006BP — Phase 6 Closure-Gap Audit
CONTEXT_UPDATE_BRANCH: docs/006bp-phase6-closure-gap-audit
CONTEXT_UPDATE_PR: PENDING_MANUAL_CREATE
LAST_MERGED_PR_AT_REFRESH: 96
LAST_MERGE_SHA_AT_REFRESH: 8d2422b80c4de4e739c3fefc07409fef04ef979a
LAST_TESTED_CODE_SHA: 8d2422b80c4de4e739c3fefc07409fef04ef979a
CONTEXT_STATUS_AT_REFRESH: CURRENT
CONTEXT_RECONSTRUCTED_FROM_EVIDENCE: YES
AI_CONTEXT_HEADER_END
-->

> **Documento Canônico de Estado Operacional Atual (Navigation Snapshot)**
> Este arquivo é um snapshot mutável de navegação e NÃO constitui evidência primária.
> Em caso de divergência com Git, código-fonte, ADRs aceitos, testes observados ou artefatos congelados: o AI_CONTEXT está defasado (stale).
> O repositório Git, o código e as saídas de ferramentas são as únicas fontes duráveis da verdade.

---

## 1. Estado Atual dos Subsistemas (Product Subsystems)

| Subsistema | Status | Evidência / Localização |
| :--- | :--- | :--- |
| **Web** | `PARTIAL` | `apps/web` (Next.js 15.5; Dashboard, Settings, Agent Studio Draft Editor; UI 005D incompleta) |
| **API** | `IMPLEMENTED` | `apps/api` (Fastify/Node, rotas de drafts, lifecycle, auth interna com service token) |
| **Voice** | `PARTIAL` | `apps/voice` (Orquestrador com roteamento supervisionado offline, coordenador dedicado `GuardedTurnRoutingCoordinator`, despacho determinístico, entrega estática de segurança offline, ownership OPTION_B, blindagem DISPATCH_ATTEMPTED -> NO_OPENAI_FALLBACK, single-owner Jev evaluation e tratamento qualificado de interrupção H4/H5 implementados/testados offline; streaming OpenAI; AuxiliaryTurnShadowObserver integrado non-blocking; handler determinístico `agent.operating_hours` integrado offline; fiação em runtime de produção: NÃO; tráfego real: NÃO) |
| **Worker** | `IMPLEMENTED` | `apps/worker` (Fundação de background tasks, processamento de filas assíncronas) |
| **Database** | `IMPLEMENTED` | `packages/database` (PostgreSQL 16, Drizzle ORM, multi-tenancy, schemas comerciais e de auditoria) |

---

## 2. Decisões Arquiteturais e de Roteamento de Voz (Voice Architecture Snapshot)

- **PRIMARY_CONVERSATION_PROVIDER**: `OpenAI` (DEC-037 / ADR-018; `OPENAI_CONVERSATION_MODEL = gpt-6-astra`).
- **AUXILIARY_DECISION_MODEL**: `TypeSafe Jev` (`jev-1.13.0`; role: auxiliary routing classifier only).
- **TYPESAFE_PRICE_STATUS**: `NOT_VERIFIED` (sem tarifa oficial pública/contratual observada).
- **TYPESAFE_PRICING_EVIDENCE**: `ACCOUNT_BILLING_EMPIRICALLY_VERIFIED` (~$41.92/Btok input; taxa conservadora de planejamento $42.00/Btok).
- **TYPESAFE_EMPIRICAL_PRICING_POLICY**: `EXPLICITLY_ACCEPTABLE_WHEN_OPERATOR_ACKNOWLEDGES` (via `--accept-typesafe-empirical-pricing`).
- **HARD_L2_COST_BOUND_FEASIBLE**: `BLOCKED` (sem teto contratual estrito do provedor).
- **SECURITY_CALL_TERMINATION**: `NO`.
- **SECURITY_CALL_REMAINS_ACTIVE**: `YES`.
- **SECURITY_OPENAI_FALLBACK**: `NOT AUTHORIZED / ZERO CALLS IN TESTED PATH`.
- **SECURITY_RUNTIME_ROUTING_INTEGRATION**: `IMPLEMENTED / TESTED LOCALLY` (`apps/voice/src/guarded-turn-routing-coordinator.ts`).
- **GUARDED_RUNTIME_ROUTING_OFFLINE**: `IMPLEMENTED / TESTED LOCALLY` (`apps/voice/src/guarded-turn-routing-coordinator.ts`, `apps/voice/src/conversation-orchestrator.ts`; 18 testes em `apps/voice/src/guarded-turn-routing.test.ts`).
- **AUXILIARY_DECISION_CALL_OWNERSHIP**: `SINGLE_OWNER` (enforced no orchestrator; shadowObserver suprimido quando guardedRoutingPort configurado).
- **FAIL_CLOSED_TO_DETERMINISTIC_BYPASS**: `YES` (falha no Jev aciona fallback generativo streamTurn, nunca bypass).
- **FAIL_OPEN_TO_GENERATIVE_MODEL**: `YES`.
- **MODEL_DRIFT_RUNTIME_GUARD**: `IMPLEMENTED / TESTED LOCALLY` (`packages/integrations/src/typesafe/typesafe-jev-turn-decision-adapter.ts`; 23 testes; exact match via `expectedProviderModel`).
- **EXPECTED_MODEL_AUTHORITY**: `OPTION_B` (TypeSafe adapter integration config: options.expectedProviderModel).
- **L1A_MODEL_IDENTITY_SMOKE**: `EXECUTED / PASS` (N=20/20 sucessos com exact match `jev-1.13.0`, 0 mismatches, 0 erros técnicos; SHA-256 `698c5e2a3b91...`; `docs/research/results/phase-6-typesafe-l1a-model-identity-smoke-run1.json`).
- **L1B_SYNTHETIC_LATENCY_STUDY**: L1B_PLAN = EXECUTED / PASS_COMPLETE | L1B_RUNNER = IMPLEMENTED / TESTED OFFLINE | L1B_EXECUTION = EXECUTED / PASS_COMPLETE (100/100 model matches jev-1.13.0, 0 mismatches, 0 erros técnicos; SHA-256 f087a6e3ad83fc81b272ffd775d5e66d00c6e7c918d310ca54f45237d59f1cdb; docs/research/results/phase-6-typesafe-l1b-synthetic-latency-run1.json).
- **L2_REAL_JEV_OPENAI_SYNTHETIC**: PRIMARY_CONVERSATION_PROVIDER = OpenAI (DEC-037 / ADR-018) | CURRENT_CONVERSATION_MODEL_CANDIDATE = gpt-6-astra | JEV_ROLE = AUXILIARY_DECISION_MODEL | L2_OPENAI_REQUESTED_MODEL = gpt-6-astra | L2_DATASET = CREATED (N=12, SHA-256 `bd812341a922...`; `scripts/benchmarks/voice/jev-openai-l2-synthetic-integration-v1-cases.json`) | L2_RUNNER = HARDENED / EMPIRICAL_PREAUTH_POLICY_IMPLEMENTED | CURRENT_L2_EXECUTABLE_MODULE_COUNT = 10 (10 módulos <= 180 linhas, cada função <= 50 linhas) | FREEZE_METHOD_VERSION = 1.0.0 | L2_FREEZE_TOOL = scripts/benchmarks/voice/compute-l2-executable-freeze.mjs | L2_FREEZE_MANIFEST = scripts/benchmarks/voice/l2-executable-freeze-manifest.json | L2_FREEZE_TESTS = 11/11 PASS in packages/integrations/src/typesafe/l2-executable-freeze.test.ts | CURRENT_EXECUTABLE_AGGREGATE_SHA256 = `f5ef6e6b88e09094765b0c3b273ba23cae01502bdd0ec4fe28dbcb3f2133794a` | EXECUTABLE_FREEZE_REPRODUCIBILITY = PASS | CURRENT_EXECUTABLE_FREEZE_STATUS = FROZEN_REPRODUCIBLY | TYPESAFE_EMPIRICAL_PRICING_POLICY = IMPLEMENTED | EMPIRICAL_EXPLICIT_COST_CEILING_REQUIRED = YES | EMPIRICAL_ENV_COST_CEILING_FALLBACK_ALLOWED = NO | HUMAN_L2_LIVE_AUTHORIZATION = AUTHORIZED_THEN_CONSUMED (ceiling $0.96 USD) | HISTORICAL_006AZ_LIVE_COMMAND_INVOKED = NO (in slice 006AZ) | HISTORICAL_PR78_LIVE_COMMAND_INVOCATION_COUNT = 1 | HISTORICAL_PR78_AUTHORIZATION_CONSUMED = YES | HISTORICAL_006BA_LIVE_COMMAND_INVOCATION_COUNT = 1 | HISTORICAL_006BA_AUTHORIZATION_CONSUMED = YES | SECOND_LIVE_RUN_AUTHORIZED = NO | HISTORICAL_006AZ_L2_RESULT = BLOCKED (historical live attempt) | HISTORICAL_L2_EXECUTION = BLOCKED_BY_RUNTIME_MODULE_RESOLUTION | RUNTIME_MODULE_RESOLUTION_STATUS = FIXED_OFFLINE | RUNTIME_MODULE_RESOLUTION_FIX = IMPLEMENTED | RUNTIME_MODULE_RESOLUTION_FIX_STRATEGY = CORRECT_PACKAGE_EXPORT_TO_DIST | RUNTIME_MODULE_GRAPH_LOAD = PASS | RUNTIME_INITIALIZATION = PASS | CANONICAL_L2_RUNNER_COMMAND = node scripts/benchmarks/voice/run-jev-openai-l2-synthetic-integration.mjs ... | RUNTIME_EXECUTABLE_SET_CHANGED = NO | HISTORICAL_006AZ_L2_PROVIDER_CALLS = 0 (OpenAI: 0, TypeSafe: 0) | HISTORICAL_006AZ_PROVIDER_SPEND_FROM_THIS_INVOCATION_USD = 0 | HISTORICAL_006AZ_RUNNER_REPORTED_COST_USD = NOT_AVAILABLE | 006BA_L2_RESULT = FAILED | 006BA_L2_EXECUTION = PARTIAL_CHAIN_OBSERVED | 006BA_TYPESAFE_REQUESTS = 7/7 | 006BA_OPENAI_REQUESTS = 5/5 | 006BA_COMPLETIONS = 5 | 006BA_PROVIDER_ERRORS = 0 | 006BA_MODEL_MISMATCHES = 0 | 006BA_TIMEOUTS = 0 | 006BA_RETRIES = 0 | 006BA_RUNNER_REPORTED_COST_USD = 0.000294 (TYPESAFE_ONLY_PLANNING_ESTIMATE) | 006BA_ACTUAL_PROVIDER_BILLED_COST_USD = NOT_OBSERVED | HUMAN_SECRET_ROTATION_STATUS = REPORTED_COMPLETE_BY_OPERATOR | SECRET_ROTATION_EVIDENCE_CLASSIFICATION = HUMAN_REPORTED_NOT_TOOL_VERIFIED | OPENAI_CREDENTIAL_AVAILABLE = YES | TYPESAFE_CREDENTIAL_AVAILABLE = YES | BOTH_REQUIRED_CREDENTIALS_AVAILABLE = YES | RUNTIME_CREDENTIAL_PRESENCE_VERIFICATION = PASS | RUNTIME_CREDENTIAL_AVAILABILITY = PRESENT_IN_CURRENT_PROCESS_ENVIRONMENT_BOOLEAN_ONLY | CREDENTIAL_VALIDITY = NOT_VERIFIED | SEPARATE_REAL_PROVIDER_PATHS_VERIFIED = PASS | SINGLE_CASE_JOINT_CHAIN_OBSERVED = NO | HYBRID_MINIMAL_IMPLEMENTATION_STATUS = IMPLEMENTED_TESTED_OFFLINE | MIXED_INTENT_CAPABILITY_RELEVANCE = IMPLEMENTED_TESTED_OFFLINE | FULL_DETERMINISTIC_RESOLVABILITY_SEPARATION = IMPLEMENTED_TESTED_OFFLINE | RESIDUAL_INTENT_DROP_PROTECTION = IMPLEMENTED_TESTED_OFFLINE | SECURITY_PRECEDENCE_REGRESSION = PASS | CRITERION_A_PRODUCT_SEMANTIC_FEASIBILITY = REACHABLE_AFTER_OFFLINE_IMPLEMENTATION | JEV_SCORE_BEHAVIOR = NOT_OBSERVED | MIXED_INTENT_TARGETED_STUDY_V2_DESIGN = COMPLETE | V2_IMPLEMENTATION_STATUS = IMPLEMENTED_TESTED_OFFLINE | V2_DATASET_STATUS = IMPLEMENTED_TESTED_OFFLINE | V2_RUNNER_STATUS = IMPLEMENTED_TESTED_OFFLINE | V2_EXECUTABLE_FREEZE_STATUS = FROZEN_REPRODUCIBLY | CRITERION_A_V2_OFFLINE_PATH_VALIDATION = PASS | REAL_PROVIDER_VALIDATION = NOT_EXECUTED | HISTORICAL_MATCHER_MATCHED_SEMANTICS = EXACT_WHOLE_UTTERANCE_MATCHER | FUTURE_MATCHER_MATCHED_REDEFINITION_ALLOWED = NO | CRITERION_A_V2_DEFINED = YES | TARGETED_LIVE_STUDY_READINESS = BLOCKED_PENDING_006BF_REVIEW_AND_SEPARATE_LIVE_AUTHORIZATION_DECISION | NEXT_REQUIRED_STEP = HUMAN_REVIEW_OF_006BF_OFFLINE_IMPLEMENTATION | FULL_COLD_STATE_GATE_CODE_HEAD = 205f49315d5119697479c30662fd558b0dc2227c | FRESH_CHECKOUT_EQUIVALENT_CANONICAL_GATE = PASS | LAST_TESTED_CODE_SHA_SEMANTICS = LAST_CODE_OR_CONFIG_BEARING_HEAD_WITH_OBSERVED_FULL_COLD_STATE_GATE | PRODUCTION_RUNTIME_RESOLUTION_STRATEGY = COMPILED_DIST | DEVELOPMENT_TEST_RESOLUTION_SUPPORT = SOURCE_TS_PREBUILD | DEVELOPMENT_TEST_RESOLUTION_SEMANTICS_CHANGED = YES | PRODUCTION_L2_BUSINESS_SEMANTICS_CHANGED = NO.
- **L2_MIXED_INTENT_V2_OFFLINE (006BF)**: `V2_IMPLEMENTATION_STATUS` = `IMPLEMENTED_TESTED_OFFLINE` | `V2_DATASET_STATUS` = `IMPLEMENTED_TESTED_OFFLINE` (v1.0.0, 4 casos, SHA `ade86008b360b90754e2ac95a560d381e7adc655ecb20d09f2a28077faf9c690`) | `V2_RUNNER_STATUS` = `IMPLEMENTED_TESTED_OFFLINE` (`OPTION_B`, entrypoint `run-jev-openai-l2-mixed-intent-v2.mjs`) | `V2_EXECUTABLE_FREEZE_STATUS` = `FROZEN_REPRODUCIBLY` (método 1.0.0, 9 módulos, agregado `6fdc0827dd4dff4dab49f2c8f5a4e82d3024614680ea23106531c8a954ef1f2e`) | `HISTORICAL_MATCHER_MATCHED_SEMANTICS` = `EXACT_WHOLE_UTTERANCE_MATCHER` | `FUTURE_MATCHER_MATCHED_REDEFINITION_ALLOWED` = `NO` | `CRITERION_A_V2_DEFINED` = `YES` | `CRITERION_A_V2_OFFLINE_PATH_VALIDATION` = `PASS` | `JEV_SCORE_BEHAVIOR` = `NOT_OBSERVED` | `REAL_PROVIDER_VALIDATION` = `NOT_EXECUTED` | `PROPOSED_LIVE_COST_CEILING` = `NOT_SELECTED`.
- **SECURITY_RUNTIME_SEMANTICS**: `DESIGNED` (`docs/research/PHASE_6_SECURITY_ESCALATE_RUNTIME_SEMANTICS.md`).
- **SECURITY_RESPONSE_DELIVERY_READY**: `IMPLEMENTED LOCALLY / ROUTING INTEGRATED`.
- **SECURITY_HISTORY_PERSISTENCE_READY**: `IMPLEMENTED LOCALLY (Turn-scoped qualified H4/H5 history resolution)`.
- **DETERMINISTIC_RESPONSE_DELIVERY**: `IMPLEMENTED / TESTED LOCALLY` (`apps/voice/src/deterministic-response-delivery.ts`, `apps/voice/src/deterministic-response-delivery-coordinator.ts`, `apps/voice/src/call-session-lifecycle-coordinator.ts`, `apps/voice/src/conversation-orchestrator.ts`; 13 testes unitários e de integração offline).
- **DETERMINISTIC_OWNERSHIP_COMMIT**: `OPTION_B (committed immediately before transport.speak())`.
- **DISPATCH_ATTEMPTED_BLINDING**: `ENFORCED (DISPATCH_ATTEMPTED -> NO_OPENAI_FALLBACK)`.
- **DETERMINISTIC_INTERRUPTION_RESOLUTION**: `IMPLEMENTED / TESTED LOCALLY (Option H4 with reported utterance/duration; fallback Option H5)`.
- **DETERMINISTIC_POST_DISPATCH_BARGE_IN**: `IMPLEMENTED / TESTED LOCALLY (offline fakes) | PROVIDER-UNVERIFIED (real telephony)`.
- **INTERRUPTED_CONTEXT_CONTINUITY_RUNTIME**: `IMPLEMENTED / TESTED LOCALLY (offline delivery & qualified history)`.
- **HISTORY_COMPLETION_RUNTIME**: `IMPLEMENTED / TESTED LOCALLY (offline orchestrator history resolution)`.
- **RUNTIME_DETERMINISTIC_BYPASS**: `NOT WIRED`.
- **ACTIVE_DETERMINISTIC_BYPASS_READINESS**: `BLOCKED`.
- **ACTIVE_GUARDED**: `BLOCKED`.
- **PRODUCTION_RUNTIME_WIRING**: `NO`.
- **CUSTOMER_TRANSCRIPT_PROVIDER_PROCESSING_GATE**: `NOT CLEARED`.
- **CUSTOMER_TRAFFIC**: `PROHIBITED`.
- **PRODUCTION_SHADOW_MAX_CONCURRENCY**: `NOT SELECTED`.
- **PRODUCTION_JEV_TIMEOUT_MS**: `NOT SELECTED`.

---

## 3. Artefatos Congelados de Pesquisa (Frozen Research Artifacts)

- **OpenAI Baseline**:
  - Dataset: `scripts/benchmarks/voice/openai-baseline-v1-cases.json` (12 casos).
  - Dataset SHA-256: `9ab7cbd2fbfcf508673a700d4a484e0c674d0124766c7b7fa0eee05a573e0d50`.
  - Resultado: `docs/research/results/phase-6-openai-conversation-baseline.json`.
- **Jev Calibration V2**:
  - Dataset: `scripts/benchmarks/voice/jev-calibration-v2-cases.json` (120 casos totais: 80 calibração, 40 holdout).
  - Dataset SHA-256: `3e7e0a20ecd3341c99b84d40162b10eff17ba0600d191dd143bc99f00aec3047`.
  - Execução: `docs/research/results/phase-6-jev-calibration-v2-phase-a-run1.json`.
- **Atomic V1 Question-Set**:
  - SHA-256: `3fecf9ce82ad600a74549d3459fe2b2b516fc3bd7b5fff33bf5b850cd48e8725`.
- **Frozen Policy**:
  - Arquivo: `docs/research/results/phase-6-jev-candidate-policy-frozen-v1.json`.
  - Policy SHA-256: `1ac0f2919ca73d22a39fb1d964b558ba2f7e395f336b2c3f687ced9ed4d53c93`.
  - **Thresholds Canônicos (FROZEN_POLICY)**:
    - `T_SECURITY = 0.56` (Regra 1: IF securityNoul >= 0.56 THEN SECURITY_ESCALATE)
    - `T_DETERMINISTIC = 0.35` (Regra 2: ELSE IF deterministicNoul >= 0.35 AND generativeNoul <= 0.47 THEN DETERMINISTIC_CANDIDATE)
    - `T_GENERATIVE = 0.47` (Regra 3: ELSE GENERATIVE_REQUIRED)
- **Locked Holdout**:
  - Resultado: `docs/research/results/phase-6-jev-locked-holdout-v2-run1.json`.
  - Result SHA-256: `21bd34ad26e0aa745a69d082a2c16d6d38dd3e685685f77cf027b9e1a3353850`.
  - Status: `LOCKED_HOLDOUT = CONSUMED` | `DO_NOT_REUSE_FOR_TUNING = YES`.

---

## 4. Invariantes Arquiteturais e de Governança

1. **Autoridade de Dados**: Provedores de IA (OpenAI, TypeSafe) NUNCA decidem autorizações, precificação, multi-tenancy ou mutações duráveis. O Banco de Dados e as máquinas de estado determinísticas são a autoridade durável.
2. **Autoridade do Jev**: Caráter estritamente consultivo (`AuxiliaryTurnDecisionPort` retorna apenas probabilidades em `[0, 1]` e telemetria de latência). O adapter não executa ferramentas nem transições de chamada.
3. **Isolamento de Tenant**: Toda entidade de organização exige `organizationId` explícito em consultas.
4. **Isolamento de Custos em Testes**: Zero chamadas a APIs pagas reais na suíte automatizada (`packages/test-utils` e mocks universais).
5. **Privacidade de Transcrições**: Proibido registrar `callerTranscript` em logs estruturados de rotina.

---

## 5. Invariantes de Segurança Operacional

1. **Zero Segredos**: Proibido exibir, ecoar, logar ou comitar chaves de API, tokens JWT/GitHub, credenciais PostgreSQL ou chaves privadas. Auditoria via `git diff` estritamente booleana (`SECRET_AUDIT_PASS`).
2. **Proteção de Arquivos `.env`**: Proibido inspecionar (`cat`, `type`, `Get-Content`) ou pesquisar arquivos `.env`.
3. **Isolamento de Storage da IDE**: Proibido acessar ou utilizar como scratch diretórios internos (`.system_generated/`, `.gemini/`, `brain/`, task logs).

---

## 6. Estado Atual da Evidência de Qualidade (Quality Gate Snapshot)

- **Último `pnpm check` Global**: `PASS` (observado na branch `docs/006bp-phase6-closure-gap-audit`: `FORMAT PASS`, `LINT PASS`, `TYPECHECK PASS 12/12`, `TEST PASS 858 passed / 45 skipped (124 arquivos passed / 6 skipped)`, `BUILD PASS 12/12`, `ARCHITECTURE PASS`, `FILE_SIZE PASS`).
- **Identificadores de HEAD & Semântica Não-Auto-Referencial**:
  - `LAST_RECORDED_FULL_GATE_HEAD = 826fd34d9a85e513a8e4e9f4e1b9c291984d5f48`
  - `LAST_RECORDED_FULL_GATE_STATUS = PASS`
  - `CURRENT_BRANCH_HEAD_SOURCE = QUERY_GIT_AT_RUNTIME`
  - `LAST_CODE_BEARING_MAIN_SHA = 8d2422b80c4de4e739c3fefc07409fef04ef979a`
  - *Nota*: `AI_CONTEXT.md` é conteúdo versionado e não pode conter o SHA do próprio commit que o modifica. O HEAD exato da branch corrente deve ser obtido do Git em runtime (`QUERY_GIT_AT_RUNTIME`). `LAST_RECORDED_FULL_GATE_HEAD` registra a evidência mais recente observada e durável quando este snapshot foi redigido, evitando loops infinitos de auto-referência.
- **Contagens Canônicas de Testes**:
  - `TEST_FILES_PASSED = 124` | `TEST_FILES_FAILED = 0` | `TEST_FILES_SKIPPED = 6`
  - `TESTS_PASSED = 858` | `TESTS_FAILED = 0` | `TESTS_SKIPPED = 45`
- **Regressão de Asserções**: `ASSERTION_WEAKER = 0`, `NEW_SKIPS = 0`.
- **Verificação Arquitetural**: `SUCESSO: Todas as fronteiras e regras arquiteturais respeitadas.`
- **Verificação de Tamanho de Arquivos**: `SUCESSO: Todos os arquivos de logica estao em conformidade (check:file-size = PASS).`
- **Auditoria de Segredos**: `SECRET_AUDIT_PASS` (verificado sobre diff de tracking).

---

## 7. Bloqueios Atuais e Status de Prontidão (Current Blockers & Readiness)

1. `CUSTOMER_TRANSCRIPT_PROVIDER_PROCESSING_GATE = NOT CLEARED`: Transmissão de transcrições de clientes para provedores externos proibida. Bloqueia tráfego real de clientes em produção, mas está fora da fronteira de saída do motor offline da Fase 6 (`TRANSCRIPT_PRIVACY = NOT_CLEARED_FOR_CUSTOMER_TRAFFIC_BUT_NOT_PHASE6_EXIT_BLOCKER`).
2. `KNOWN_DETERMINISTIC_HANDLERS = 1` (`agent.operating_hours` implementado e testado; ferramentas de negócio externas pertencem à Fase 7).
3. `POST_DISPATCH_BARGE_IN_RUNTIME = IMPLEMENTED / TESTED LOCALLY (offline)` | `LIVE_PROVIDER_BARGE_IN_VERIFICATION = PROVIDER-UNVERIFIED` (Fase 8).
4. `INTERRUPTED_CONTEXT_CONTINUITY_RUNTIME = IMPLEMENTED / TESTED LOCALLY (offline delivery & qualified history)`.
5. `HISTORY_COMPLETION_RUNTIME = IMPLEMENTED / TESTED LOCALLY (offline orchestrator history resolution)`.
6. `SECURITY_RESPONSE_DELIVERY_OFFLINE = IMPLEMENTED / TESTED LOCALLY` (`apps/voice/src/security-blocked-response.ts`; resposta estática; chamada ativa; sem fallback OpenAI).
7. `GUARDED_RUNTIME_ROUTING_OFFLINE = IMPLEMENTED / TESTED LOCALLY` (`apps/voice/src/guarded-turn-routing-coordinator.ts`).
8. `ACTIVE_GUARDED = BLOCKED` (fail-closed no runtime; pendente DPA e parâmetros de produção).
9. `PRODUCTION_SHADOW_MAX_CONCURRENCY = NOT SELECTED`.
10. `PRODUCTION_JEV_TIMEOUT_MS = NOT SELECTED`: Latência empírica L1B observada; parâmetro final de produção não selecionado.
11. `PRODUCTION_ACTIVE_GUARDED_MAX_CONCURRENCY = NOT SELECTED`.
12. `MODEL_DRIFT_RUNTIME_GUARD = IMPLEMENTED / TESTED LOCALLY` (`expectedProviderModel = jev-1.13.0`).
13. `PRODUCTION_RUNTIME_WIRING = NO`: Fiação de runtime em produção desautorizada.
14. `LIVE_PROVIDER_GUARDED_ROUTING_VALIDATION = PARTIAL`: L1A e L1B executados; L2 com falha técnica de auth; retry não autorizado; L3/L4 bloqueados.
15. `LIVE_TWILIO_GUARDED_ROUTING = NOT EXECUTED`: Telefonia real pertence à Fase 8.
16. `CUSTOMER_TRAFFIC = PROHIBITED` (invariante de segurança; escopo da Fase 10).
17. `HUMAN_HANDOFF_IN_MEMORY_STATE_MACHINE = DOCUMENTED_ONLY`: Falta implementar a máquina de estados em memória e eventos canônicos em `apps/voice` (Bloqueador 1 da Saída da Fase 6).
18. `PRODUCTION_OPERATIONAL_PARAMETERS = BLOCKED_BY_HUMAN_DECISION`: Parâmetros de produção de `ACTIVE_GUARDED` não selecionados (Bloqueador 2 da Saída da Fase 6; passível de decisão/deferimento para Fase 10).
19. `PHASE6_COMPLETION_ESTIMATE = 92%` | `PHASE6_CAN_CLOSE_NOW = NO` | `PHASE6_BLOCKER_COUNT = 2`.
20. `PHASE6_BLOCKERS = HUMAN_HANDOFF_IN_MEMORY_STATE_MACHINE, PRODUCTION_OPERATIONAL_PARAMETERS`.

---

## 8. Próximo Passo Permitido & Ações Proibidas

### `NEXT_ALLOWED_STEP`:
- **Slice 006BP (Auditoria de Gaps da Fase 6)**: `AUDIT_COMPLETE`. Identificados 2 bloqueadores reais:
  1. `HUMAN_HANDOFF_IN_MEMORY_STATE_MACHINE` (código/testes em `apps/voice` pendentes);
  2. `PRODUCTION_OPERATIONAL_PARAMETERS` (parâmetros de produção de `ACTIVE_GUARDED` não selecionados; passível de decisão/deferimento para Fase 10).
- **Próximo Slice Mínimo**: `006BQ — IN-MEMORY HUMAN HANDOFF STATE MACHINE AND FALLBACK PROTOCOL` (implementação offline determinística em memória de `NONE -> REQUESTED -> SELLER_NOTIFIED -> SELLER_READY -> AI_PREPARING -> READY_TO_JOIN -> HUMAN_CONNECTED -> AI_DETACHED` e fallback conversacional com zero chamadas externas).
- `AUTHORIZATION_CONSUMED = YES` | `SECOND_LIVE_RUN_AUTHORIZED = NO` | `NEW_LIVE_AUTHORIZATION_CREATED = NO`.
- Do NOT execute live commands. Do NOT access real `.env`. Do NOT call external providers. Do NOT enable customer traffic.

### `NOT_YET_ALLOWED`:
- Transmissão de dados reais de clientes para provedores externos.
- Ativação de `ACTIVE_GUARDED` no runtime de produção.
- Modificação de políticas congeladas ou reutilização do holdout de pesquisa.
- Fiação em runtime de produção (`apps/voice`).

---

## 9. Referências Canônicas Autoritativas

- [AGENTS.md](../AGENTS.md): Regras operacionais obrigatórias para agentes de IA.
- [AI_EXECUTION_RULES.md](AI_EXECUTION_RULES.md): Execução detalhada, integridade e classificação de evidências.
- [AI_WORKLOG.md](AI_WORKLOG.md): Registro histórico cronológico append-only.
- [architecture/decisions/ADR-019-jev-guarded-runtime-integration.md](architecture/decisions/ADR-019-jev-guarded-runtime-integration.md): Design de integração do Jev.
- [research/PHASE_6_TYPESAFE_JEV_SHADOW_ADAPTER.md](research/PHASE_6_TYPESAFE_JEV_SHADOW_ADAPTER.md): Especificação e contrato do adapter offline.
- [research/PHASE_6_ACTIVE_GUARDED_PRODUCTION_READINESS_GATE.md](research/PHASE_6_ACTIVE_GUARDED_PRODUCTION_READINESS_GATE.md): Gate de prontidão e dimensionamento para ativação de ACTIVE_GUARDED.
- [research/PHASE_6_L2_PREAUTHORIZATION_ENVELOPE.md](research/PHASE_6_L2_PREAUTHORIZATION_ENVELOPE.md): Envelope de pré-autorização e garantias de isolamento L2.

---

## 10. Resolução de Conflitos e Protocolo de Bootstrap (Bootstrap & Staleness Protocol)

1. **Prevalência Factual**: Se `AI_CONTEXT.md` divergir do código-fonte, do Git, de ADRs aceitos ou de testes observados, este arquivo está **STALE**. A evidência factual do repositório prevalece obrigatoriamente.
2. **Separação de Papéis**:
   - `AI_CONTEXT.md`: Snapshot mutável de navegação do estado verificado (alvo <= 250 linhas).
   - `AI_WORKLOG.md`: Registro histórico cronológico append-only.
   - `ADRs`: Registros formais de decisões arquiteturais.
   - Código / Git / Testes: Evidência factual primária.
