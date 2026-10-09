# Contexto Operacional Central de IA (AI_CONTEXT.md)

<!--
AI_CONTEXT_HEADER_START
CONTEXT_SCHEMA_VERSION: 1.1.0
LAST_REFRESHED_AT: 2026-10-08
CONTEXT_BASE_MAIN_SHA: dc181afb319b05642fe42859d08f38ae6110a1d8
CURRENT_PHASE: Phase 7 (OPEN)
CURRENT_SLICE: Slice 007H — Knowledge Base Persistence, Ingestion & Retrieval Runtime
CONTEXT_UPDATE_BRANCH: feat/007h-knowledge-base-persistence-retrieval
CONTEXT_UPDATE_PR: NONE
LAST_MERGED_PR_AT_REFRESH: 109
LAST_MERGE_SHA_AT_REFRESH: dc181afb319b05642fe42859d08f38ae6110a1d8
LAST_TESTED_CODE_SHA: dc181afb319b05642fe42859d08f38ae6110a1d8
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
| **Web** | `PARTIAL` | `apps/web` (Next.js 15.5; Dashboard, Settings, Agent Studio Draft Editor integrado com seção de configuração de ferramentas canônicas incluindo catálogo; UI 005D incompleta) |
| **API** | `IMPLEMENTED` | `apps/api` (Fastify/Node, rotas de drafts, lifecycle com validação de toolset canônico, auth interna com service token, gerenciamento de campanhas outbound /v1/campaigns e agendamento em lote de jobs) |
| **Voice** | `PARTIAL` | `apps/voice` (Motor universal de execução de tools `ToolExecutionEngine`, registro `InMemoryToolRegistry`, adapters `OperatingHoursTool`/`CatalogSearchTool`/`CatalogItemDetailTool` e resolução de toolset de versão publicada `resolvePublishedVersionToolset` implementados/testados offline; Orquestrador com roteamento supervisionado offline, coordenador dedicado `GuardedTurnRoutingCoordinator`, despacho determinístico, entrega estática de segurança offline, ownership OPTION_B, blindagem DISPATCH_ATTEMPTED -> NO_OPENAI_FALLBACK, single-owner Jev evaluation e tratamento qualificado de interrupção H4/H5 implementados/testados offline; streaming OpenAI; AuxiliaryTurnShadowObserver integrado non-blocking; handler determinístico `agent.operating_hours` integrado offline; fiação em runtime de produção: NÃO; tráfego real: NÃO) |
| **Worker** | `IMPLEMENTED` | `apps/worker` (Fundação de background tasks, processamento de filas assíncronas) |
| **Database** | `IMPLEMENTED` | `packages/database` (PostgreSQL 16, Drizzle ORM, multi-tenancy, schemas comerciais, de auditoria, `agent_versions.configuration` com preservação snapshot de toolset e `catalog_items` tenant-scoped com `CatalogRepository`) |

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
- **PRODUCTION_SHADOW_MAX_CONCURRENCY**: `DEFERRED_TO_PHASE10` (Slice 006BR / DEC-038).
- **PRODUCTION_JEV_TIMEOUT_MS**: `DEFERRED_TO_PHASE10` (Slice 006BR / DEC-038).
- **PRODUCTION_ACTIVE_GUARDED_MAX_CONCURRENCY**: `DEFERRED_TO_PHASE10` (Slice 006BR / DEC-038).

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

- **Último `pnpm check` Global na Main**: `PASS` (observado no merge da PR #105 / 007D post-merge na branch `main` `4252dbb086ad3d8dbc36713860d8b862ff15d89f`: exit 0; contagens precisas de testes: `NOT_OBSERVED`).
- **Último Gate Técnico da Fatia 007B**:
  - `FINAL_007B_TECHNICAL_GATE_TASK = task-2706`
  - `FINAL_007B_TECHNICAL_GATE_EXIT = 0`
  - `FINAL_007B_TECHNICAL_GATE_PRECISE_TEST_COUNTS = NOT_OBSERVED` (devido a truncamento de log na recuperação de evidência de histórico; contagens do desenvolvimento da fatia: 129 arquivos / 890 testes)
- **Reconciliação Pós-Merge PR #102 (007B Governance Reconciliation)**:
  - `PR102_TECHNICAL_POST_MERGE_GATE = PASS`
  - `PR102_POST_MERGE_GATE_TASK = task-2808`
  - `PR102_POST_MERGE_GATE_EXIT = 0`
  - `PR102_POST_MERGE_GATE_PRECISE_TEST_COUNTS = NOT_OBSERVED`
  - `007B_POST_MERGE_INTERNAL_STORAGE_VIOLATION = DOCUMENTED`
  - `007B_GOVERNANCE_RECONCILIATION_STATUS = PENDING_MERGE`
- **Identificadores de HEAD & Semântica Não-Auto-Referencial**:
  - `LAST_RECORDED_FULL_GATE_HEAD = a6dbff3e783d84f84aa10a52e31797f0307c4473`
  - `LAST_RECORDED_FULL_GATE_STATUS = PASS`
  - `CURRENT_BRANCH_HEAD_SOURCE = QUERY_GIT_AT_RUNTIME`
  - `LAST_CODE_BEARING_MAIN_SHA = a6dbff3e783d84f84aa10a52e31797f0307c4473`
  - *Nota*: `AI_CONTEXT.md` é conteúdo versionado e não pode conter o SHA do próprio commit que o modifica. O HEAD exato da branch corrente deve ser obtido do Git em runtime (`QUERY_GIT_AT_RUNTIME`). `LAST_RECORDED_FULL_GATE_HEAD` registra a evidência mais recente observada e durável quando este snapshot foi redigido, evitando loops infinitos de auto-referência.
- **Contagens Canônicas de Testes (Local Slice 007B)**:
  - `TEST_FILES_PASSED = NOT_OBSERVED` (slice dev count: 129) | `TEST_FILES_FAILED = 0` | `TEST_FILES_SKIPPED = 6`
  - `TESTS_PASSED = NOT_OBSERVED` (slice dev count: 890) | `TESTS_FAILED = 0` | `TESTS_SKIPPED = 45`
- **Regressão de Asserções**: `ASSERTION_WEAKER = 0`, `NEW_SKIPS = 0`.
- **Verificação Arquitetural**: `SUCESSO: Todas as fronteiras e regras arquiteturais respeitadas.`
- **Verificação de Tamanho de Arquivos**: `SUCESSO: Todos os arquivos de logica estao em conformidade (check:file-size = PASS).`
- **Auditoria de Segredos**: `SECRET_AUDIT_PASS` (verificado sobre diff de tracking).

---

## 7. Bloqueios Atuais e Status de Prontidão (Current Blockers & Readiness)

1. `PHASE6_STATUS = CLOSED` | `PHASE6_COMPLETION_ESTIMATE = 100%` | `PHASE6_BLOCKER_COUNT = 0` | `PHASE6_BLOCKERS = NONE` (concluída formalmente via PR #100 / DEC-038).
2. `PHASE7_STATUS = OPEN` | `PHASE7_COMPLETION_ESTIMATE = 90%` | `PHASE7_BLOCKER_COUNT = 0` | `PHASE7_BLOCKERS = NONE`.
3. `AGENT_DOMAIN_STATUS = IMPLEMENTED` (`packages/database`: schema e repositórios de agentes e lifecycle).
4. `AGENT_VERSIONING_STATUS = IMPLEMENTED` (`packages/database`, `packages/contracts`: ciclo draft/publish/archive com imutabilidade de versões publicadas).
5. `TOOL_CALLING_CONTRACT = IMPLEMENTED` (`packages/contracts/src/tools/`: `ToolInvocation`, `ToolExecutionContext`, `ToolExecutionResult`, `ToolDefinition`, `ToolPort`, `ToolRegistryPort`).
6. `TOOL_REGISTRY = IMPLEMENTED` (`apps/voice/src/tool-registry.ts`: `InMemoryToolRegistry` com fail-closed, duplicate rejection determinística, immutabilidade pós-registro).
7. `TOOL_EXECUTION_RUNTIME = IMPLEMENTED` (`apps/voice/src/tool-execution-engine.ts`: `ToolExecutionEngine` com isolamento de contexto confiável, validação estrita via zod, contenção segura de exceções sem vazamento de secrets/traces).
8. `AGENT_VERSION_TOOLSET_CONFIGURATION = IMPLEMENTED` (`packages/contracts/src/agents/agent-configuration-v1.ts`: toolset canônico validado com rejeição de desconhecidos e duplicados, persistência JSONB snapshot sem migração DDL).
9. `AGENT_STUDIO_TOOLSET_CONFIGURATION = IMPLEMENTED` (`apps/web/src/features/agents/agent-tools-section.tsx`: edição e round-trip de ferramentas canônicas na UI do Agent Studio).
10. `PUBLISHED_VERSION_TOOLSET_CONTEXT = IMPLEMENTED` (`apps/voice/src/published-version-toolset.ts`: resolução, autorização e contexto de execução de ferramentas canônicas a partir de snapshot de versão publicada).
11. `TOOL_AUTHORIZATION_MODEL = PARTIAL` (boundary de segurança por tenant/allowlist implementada; modelo completo de entitlements e papéis é escopo futuro).
12. `CATALOG_BUSINESS_DATA_DOMAIN = IMPLEMENTED` (`packages/contracts/src/catalog/`: `catalog-item-contracts`, `catalog-tool-contracts` com `catalog.search` e `catalog.item_detail`).
13. `CATALOG_PERSISTENCE = IMPLEMENTED` (`packages/database/src/schema/catalog.ts`: `catalog_items` tenant-scoped com kind PRODUCT|SERVICE, preço em minor units + currency; migration `0002_silent_squadron_sinister.sql`).
14. `CATALOG_QUERY_REPOSITORY = IMPLEMENTED` (`packages/database/src/repositories/catalog-repository.ts`: `searchCatalog`/`getCatalogItem` com tenant isolation, limite limitado e ordenação determinística).
15. `CATALOG_TOOL_INTEGRATION = IMPLEMENTED` (`apps/voice/src/catalog-search-tool.ts`, `apps/voice/src/catalog-item-detail-tool.ts`: adapters provider-neutral sobre `ToolExecutionEngine` com `CatalogQueryPort` injetada).
16. `AGENT_STUDIO_CATALOG_TOOL_SELECTION = IMPLEMENTED` (`apps/web/src/features/agents/agent-tools-section.tsx`: entradas explícitas para `catalog.search` e `catalog.item_detail`).
12. `OPERATING_HOURS_UNIVERSAL_ENGINE_INTEGRATION = YES` (`apps/voice/src/operating-hours-tool.ts`: wrapping determinístico de `handleOperatingHoursTurn` preservando 100% das regras sem duplicação).
13. `BUSINESS_TOOL_INTEGRATIONS = PARTIAL` (catálogo determinístico implementado; booking/CRM/calendário seguem ausentes).
14. `MODEL_TO_CANONICAL_TOOL_MAPPING = PARTIAL` (contratos prontos no core de voz; fakes validados offline; emissores de provedor streaming não implementados).
15. `PROVIDER_SPECIFIC_TOOL_MAPPING = NOT_IMPLEMENTED` (fase de integração de provedores).
16. `KNOWLEDGE_BASE_ARCHITECTURE = DECIDED` (ADR-020 Proposed: autoridade estruturada vs. retrieval, lifecycle, chunking, portas neutras, acesso server-side, conteúdo recuperado como `UNTRUSTED_DATA`).
17. `RAG_ARCHITECTURE_DECISION = DECIDED` (ADR-020 Proposed; provedores `NOT_BOUND`, runtimes `DEFERRED`).
18. `KNOWLEDGE_BASE_DOMAIN_CONTRACTS = IMPLEMENTED` (`packages/contracts/src/knowledge/`: contratos de documento/chunk/escopo/retrieval + 9 testes offline).
19. `KNOWLEDGE_BASE_DOMAIN = PARTIAL` (contratos, persistência, ingestão de texto confiável local e retrieval léxico offline na branch; vetores semânticos e geração RAG ausentes).
20. `KNOWLEDGE_BASE_PERSISTENCE = IMPLEMENTED` (`packages/database/src/schema/knowledge.ts`: `knowledge_documents` e `knowledge_chunks` tenant-scoped, forward-only migration `0004_ordinary_charles_xavier.sql`; migração de produção Supabase NÃO executada).
21. `KNOWLEDGE_BASE_INGESTION_RUNTIME = IMPLEMENTED_LOCAL_TRUSTED_TEXT` (`packages/database/src/repositories/knowledge-ingestion-service.ts`: ingestão transacional atômica de texto confiável local, normalização determinística NFC, identidade estável SHA-256, lifecycle).
22. `KNOWLEDGE_BASE_RETRIEVAL_RUNTIME = IMPLEMENTED_LEXICAL_OFFLINE` (`packages/database/src/repositories/knowledge-retrieval-service.ts`: retrieval léxico offline limitado, filtragem de tenant e escopo de acesso no DB, ranking determinístico, proveniência e citações sem segredos).
23. `SEMANTIC_VECTOR_RETRIEVAL = NOT_IMPLEMENTED` | `REAL_EMBEDDING_PROVIDER = NOT_IMPLEMENTED` | `VECTOR_STORAGE_PROVIDER = NOT_BOUND` | `PRODUCTION_RAG_GENERATION = NOT_IMPLEMENTED`.
18. `OUTBOUND_DOMAIN_MODEL = IMPLEMENTED` (`packages/database/src/schema/outbound.ts`: `outbound_campaigns` e `outbound_call_jobs`, DrizzleOutboundRepository, migration `0003_tiresome_nemesis.sql`).
19. `OUTBOUND_JOB_ORCHESTRATION = IMPLEMENTED` (`packages/contracts/src/outbound/`: contratos, máquina de estados determinística, validação de transições).
20. `OUTBOUND_WORKER_DISPATCH = IMPLEMENTED` (`apps/worker/src/outbound-call-dispatcher.ts`: claim atômico via `SKIP LOCKED`, política de retry exponencial delimitada, idempotência).
21. `OUTBOUND_CALL_BOOTSTRAP = IMPLEMENTED` (`apps/voice/src/outbound-call-lifecycle-bootstrap-adapter.ts`: adapter desacoplado entre worker e CallLifecycleGateway com validação estrita de versão publicada).
22. `OUTBOUND_API = PARTIAL` (rotas de campanhas /v1/campaigns e agendamento em lote determinístico /v1/campaigns/{id}/batch-schedule implementadas/testadas offline; lifecycles avançados deferred).
23. `OUTBOUND_CAMPAIGN_API = IMPLEMENTED` (rotas tenant-scoped /v1/campaigns POST/GET/LIST).
24. `OUTBOUND_BATCH_SCHEDULING = IMPLEMENTED` (rota de lote com bounds estáticos, autoridade de versão e atomicidade).
25. `CUSTOMER_TRANSCRIPT_PROVIDER_PROCESSING_GATE = NOT CLEARED`: Transmissão de transcrições de clientes para provedores externos proibida (invariante de segurança; tráfego real em produção é Fase 10).
26. `ACTIVE_GUARDED = BLOCKED` (fail-closed no runtime; pendente DPA e parâmetros de produção).
27. `PRODUCTION_SHADOW_MAX_CONCURRENCY = DEFERRED_TO_PHASE10` (Slice 006BR / DEC-038).
28. `PRODUCTION_JEV_TIMEOUT_MS = DEFERRED_TO_PHASE10` (Slice 006BR / DEC-038).
29. `PRODUCTION_ACTIVE_GUARDED_MAX_CONCURRENCY = DEFERRED_TO_PHASE10` (Slice 006BR / DEC-038).
30. `MODEL_DRIFT_RUNTIME_GUARD = IMPLEMENTED / TESTED LOCALLY` (`expectedProviderModel = jev-1.13.0`).
31. `PRODUCTION_RUNTIME_WIRING = NO`: Fiação de runtime em produção desautorizada.
32. `REAL_CARRIER_DIALING = DEFERRED_PHASE8`: Telefonia real pertence à Fase 8.
33. `PRODUCTION_OUTBOUND_DIALER = NOT_IMPLEMENTED`.
34. `CUSTOMER_TRAFFIC = PROHIBITED` (invariante de segurança; escopo da Fase 10).
35. `PRODUCTION_OPERATIONAL_PARAMETERS = FORMALLY_DEFERRED_TO_PHASE10_BY_HUMAN_DECISION` (Slice 006BR / DEC-038).
36. `AGENT_EVALS = DEFERRED_PHASE9` (avaliações de agentes pertencem estritamente à Fase 9; nenhuma infraestrutura de evals implementada).
37. `PRODUCTION_HARDENING_CUSTOMER_TRAFFIC = DEFERRED_PHASE10` (hardening de produção e tráfego de clientes pertencem estritamente à Fase 10).

---

## 8. Próximo Passo Permitido & Ações Proibidas

### `NEXT_ALLOWED_STEP`:
- **Phase 7 Status**: `OPEN` (`PHASE7_STATUS = OPEN`, `PHASE7_COMPLETION_ESTIMATE = 90% (feature-branch projection only)`, `PHASE7_BLOCKER_COUNT = 0`, `PHASE7_BLOCKERS = NONE`).
- **Slice 007H — Knowledge Base Persistence, Ingestion & Retrieval Runtime**: `IMPLEMENTED / TESTED LOCALLY` (pending canonical gate on final HEAD).
- `NEXT_ALLOWED_STEP = AUTOMATED_PR_REVIEW_AND_MERGE_007H`
- `NEXT_ALLOWED_SLICE = NOT_YET_ALLOWED`
- **Recommended Next Slice**: `007I — Knowledge Base Voice Runtime Integration / RAG Handoff` (ou conforme backlog de governança).
- `AUTHORIZATION_CONSUMED = YES` | `SECOND_LIVE_RUN_AUTHORIZED = NO` | `NEW_LIVE_AUTHORIZATION_CREATED = NO`.
- Do NOT execute live commands. Do NOT access real `.env`. Do NOT call external providers. Do NOT enable customer traffic.

### `NOT_YET_ALLOWED`:
- Transmissão de dados reais de clientes para provedores externos.
- Ativação de `ACTIVE_GUARDED` no runtime de produção.
- Modificação de políticas congeladas ou reutilização do holdout de pesquisa.
- Fiação em runtime de produção (`apps/voice`).
- Real telephony / carrier dialing (Fase 8).


---

## 9. Referências Canônicas Autoritativas

- [AGENTS.md](../AGENTS.md): Regras operacionais obrigatórias para agentes de IA.
- [AI_EXECUTION_RULES.md](AI_EXECUTION_RULES.md): Execução detalhada, integridade e classificação de evidências.
- [AI_WORKLOG.md](AI_WORKLOG.md): Registro histórico cronológico append-only.
- [architecture/decisions/ADR-019-jev-guarded-runtime-integration.md](architecture/decisions/ADR-019-jev-guarded-runtime-integration.md): Design de integração do Jev.
- [architecture/decisions/ADR-020-knowledge-base-rag-architecture-contracts.md](architecture/decisions/ADR-020-knowledge-base-rag-architecture-contracts.md): Knowledge Base / RAG: autoridade estruturada vs. retrieval, lifecycle, chunking, portas neutras e acesso server-side.
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
