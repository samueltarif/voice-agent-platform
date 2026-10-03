# Contexto Operacional Central de IA (AI_CONTEXT.md)

<!--
AI_CONTEXT_HEADER_START
CONTEXT_SCHEMA_VERSION: 1.1.0
LAST_REFRESHED_AT: 2026-10-03
CONTEXT_BASE_MAIN_SHA: 84dcf576bccdee66f52240f85dc91b65f44b17f8
CURRENT_PHASE: Phase 6 (Voice Model Routing & Jev Evaluation)
CURRENT_SLICE: L2 Runner Hardening — Offline Only
CONTEXT_UPDATE_BRANCH: research/006ar-l2-runner-hardening-offline
CONTEXT_UPDATE_PR: 71
LAST_MERGED_PR_AT_REFRESH: 70
LAST_MERGE_SHA_AT_REFRESH: 84dcf576bccdee66f52240f85dc91b65f44b17f8
LAST_TESTED_CODE_SHA: ed2c3d5f9e7207c6ea2309239727597ff7081127
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
| **Agent Studio** | `PARTIAL` | 005B (DB/contracts): `IMPLEMENTED / STAGING VALIDATED`; 005C (API): `IMPLEMENTED / NEON STAGING VALIDATED`; 005D (Web UI): `PARTIAL` (rascunhos existem em `apps/web/src/features/agents/`, fluxo completo não concluído) |
| **OpenAI** | `IMPLEMENTED` | `packages/integrations/src/openai` (Adapter de modelo de conversa, baselines sintéticos) |
| **Twilio** | `PARTIAL` | `packages/integrations/src/twilio` (ConversationRelay adapter; tráfego telefônico real `PROVIDER-UNVERIFIED`) |
| **TypeSafe / Jev** | `PARTIAL` | `packages/integrations/src/typesafe` (Adapter implementado; LIVE PROVIDER RESPONSE OBSERVED; staging synthetic composition: IMPLEMENTED / TESTED LOCALLY; staging latency execution: OBSERVED (N=12, 100% completion <=1500ms, median 275ms, 0 timeouts); fiação em produção: NÃO) |
| **Human Handoff** | `DESIGN ONLY` | Especificado em `docs/ROADMAP.md` e `docs/VOICE_ARCHITECTURE.md` |
| **Knowledge Base** | `DESIGN ONLY` | Arquitetura preliminar; implementação de retrieval postergada para fase posterior |
| **Billing** | `PARTIAL` | Schemas de quotas, planos e entitlements em banco; adapter Stripe não iniciado |
| **Observability** | `IMPLEMENTED` | `packages/logger` (Logs estruturados, sanitização de transcrições e segredos) |

---

## 2. Estado Específico da Integração TypeSafe / Jev (Phase 6)

- **AuxiliaryTurnDecisionPort**: `IMPLEMENTED` (`packages/contracts/src/voice/auxiliary-turn-decision-contracts.ts`).
- **AuxiliaryTurnShadowObserver**: `IMPLEMENTED` (`apps/voice/src/auxiliary-turn-shadow-observer.ts`).
- **TypeSafeJevTurnDecisionAdapter**: `IMPLEMENTED (LIVE PROVIDER RESPONSE OBSERVED)` (`packages/integrations/src/typesafe/typesafe-jev-turn-decision-adapter.ts`).
- **STAGING_SYNTHETIC_SHADOW_COMPOSITION**: `IMPLEMENTED / TESTED LOCALLY` (`apps/voice/src/composition-root.staging-shadow.ts`).
- **STAGING_LIVE_SHADOW_EXECUTION**: `EXECUTED (OBSERVED / TIMEOUT)` (disparo de timeout temporário de 1500ms em execução inicial).
- **STAGING_LATENCY_PLAN**: `DESIGNED` (`docs/research/PHASE_6_TYPESAFE_STAGING_LATENCY_PLAN.md`).
- **STAGING_LATENCY_EXECUTION**: `OBSERVED / 12 OF 12 COMPLETED UNDER 1500MS` (N=12 casos sintéticos; completion rate 4000ms = 100.0%; completion rate 1500ms = 100.0%; median = 275ms; p90 = 311ms; p95 = 450ms; timeouts = 0; wouldHaveTimedOutUnder1500Ms = 0; measurement deadline = 4000ms; nominal staging timeout = 1500ms unchanged; heurística disparada: `KEEP_1500MS`).
- **STAGING_TIMEOUT_RECALIBRATION**: `DECIDED_KEEP_1500MS_FOR_STAGING_SYNTHETIC` (decisão humana formalizada após 100% de conclusão sob 1500ms em amostra N=12).
- **STAGING_SHADOW_MAX_CONCURRENCY**: `1` (teto seguro temporário de concorrência para staging sintético).
- **STAGING_SHADOW_TIMEOUT_MS**: `1500` (timeout operacional nominal para staging sintético mantido inalterado).
- **PRODUCTION_RUNTIME_WIRING**: `NO` (zero injeções em composition roots de produção).
- **SHADOW_LIVE_ENABLED**: `NO` (desativado no fluxo nominal; zero chamadas a provedor externo em runtime nominal).
- **DEFAULT_AUXILIARY_FEATURE_MODE**: `DISABLED`.
- **ACTIVE_GUARDED**: `BLOCKED` (fail-closed, inalcançável no runtime por design).
- **FIRST_DETERMINISTIC_HANDLER**: `agent.operating_hours` (`apps/voice/src/operating-hours-turn-handler.ts`).
- **HANDLER_IMPLEMENTATION**: `IMPLEMENTED / TESTED LOCALLY`.
- **CAPABILITY_RESOLUTION**: `IMPLEMENTED / TESTED LOCALLY` (`apps/voice/src/operating-hours-capability-matcher.ts`).
- **KNOWN_DETERMINISTIC_HANDLERS**: `1` (handler e matcher implementados e aprovados em 73 testes unitarios e no pnpm check global).
- **DETERMINISTIC_RUNTIME_WIRING_DESIGN**: `DESIGNED_WITH_BLOCKERS` (`docs/research/PHASE_6_DETERMINISTIC_RUNTIME_WIRING_DESIGN.md`).
- **DETERMINISTIC_INTERCEPTION_SEAM**: `ConversationOrchestrator.handleUserSpeechFinal() — apos save(generationId), antes de streamTurn()`.
- **SELECTED_ROUTING_TOPOLOGY**: `IMPLEMENTED / TESTED LOCALLY OFFLINE` (Application-Eligibility Filtered Serial Gate; PRODUCTION_RUNTIME_WIRING = NO).
- **RUNTIME_FROZEN_POLICY_INTERPRETER**: `IMPLEMENTED / TESTED LOCALLY` (`apps/voice/src/frozen-policy-interpreter.ts`; 20 testes unitários).
- **FROZEN_POLICY_CHANGED**: `NO`.
- **SECURITY_OFFLINE_ACTION**: `IMPLEMENTED / TESTED LOCALLY` (`apps/voice/src/security-blocked-action.ts`; 5 testes unitários).
- **SECURITY_STATIC_RESPONSE_CONTENT**: `IMPLEMENTED / TESTED LOCALLY` (`apps/voice/src/security-blocked-response.ts`).
- **SECURITY_RESPONSE_DELIVERY_OFFLINE**: `IMPLEMENTED / TESTED LOCALLY` (`apps/voice/src/conversation-orchestrator.ts`; 11 testes em `apps/voice/src/security-response-delivery.test.ts`).
- **SECURITY_RESPONSE_OWNERSHIP**: `OPTION_B / TESTED LOCALLY`.
- **SECURITY_INTERRUPTION_H4**: `IMPLEMENTED / TESTED LOCALLY`.
- **SECURITY_INTERRUPTION_H5**: `IMPLEMENTED / TESTED LOCALLY`.
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
- **L1A_MODEL_IDENTITY_SMOKE**: `EXECUTED / PASS` (N=20/20 sucessos com exact match `jev-1.13.0`, 0 mismatches, 0 erros técnicos, mediana descritiva 275ms, p90 316ms, max 685ms; SHA-256 `698c5e2a3b91...`; `docs/research/results/phase-6-typesafe-l1a-model-identity-smoke-run1.json`).
- **L1B_SYNTHETIC_LATENCY_STUDY**: L1B_PLAN = EXECUTED / PASS_COMPLETE | L1B_RUNNER = IMPLEMENTED / TESTED OFFLINE | L1B_EXECUTION = EXECUTED / PASS_COMPLETE (100 attempted / 100 succeeded, 100/100 model matches jev-1.13.0, 0 mismatches, 0 erros técnicos, 0 timeouts; latência DESCRIPTIVE_ONLY: min 229ms, mediana 257ms, p75 273ms, p90 302ms, p95 325ms, p99 empirical 380ms, max 385ms; SHA-256 f087a6e3ad83fc81b272ffd775d5e66d00c6e7c918d310ca54f45237d59f1cdb; docs/research/results/phase-6-typesafe-l1b-synthetic-latency-run1.json) | L1B_PROVIDER_EXECUTION = EXECUTED.
- **L2_REAL_JEV_OPENAI_SYNTHETIC**: PRIMARY_CONVERSATION_PROVIDER = OpenAI (DEC-037 / ADR-018) | CURRENT_CONVERSATION_MODEL_CANDIDATE = gpt-6-astra | JEV_ROLE = AUXILIARY_DECISION_MODEL | L2_OPENAI_REQUESTED_MODEL = gpt-6-astra (BLOCKED_UNTIL_OPERATOR_AUTHORIZATION) | L2_DATASET = CREATED (N=12, SHA-256 `bd812341a922...`; `scripts/benchmarks/voice/jev-openai-l2-synthetic-integration-v1-cases.json`) | L2_RUNNER = HARDENED / MODULARIZED / FUNCTION_DOD_PASS (9 módulos <= 180 linhas, cada função <= 50 linhas, max 49, aggregate SHA `8f53f8169771caa26dd9623702a7c65e3e9c730dfcb2bbfcb26188dcd57c77f3`, L2_RUNNER_FOCUSED_TESTS = 19/19 PASS in `packages/integrations/src/typesafe/jev-openai-l2-synthetic-runner.test.ts`) | L2_EXECUTION = NOT EXECUTED | L2_PROVIDER_CALLS = 0 | L2_PROVIDER_EXECUTION = BLOCKED_UNTIL_OPERATOR_AUTHORIZATION_AND_TYPESAFE_PRICE_VERIFICATION.
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

- **Último `pnpm check` Global**: `PASS` (executado e observado no slice L2 Runner Hardening — Offline Only na branch `research/006ar-l2-runner-hardening-offline`).
- **LAST_GLOBAL_PNPM_CHECK_CODE_SHA**: `630ee48d8fdd10077e7374053da176d9072c5b9a`
- **Status das Asserções**: `750 passed`, `45 historical skips`, `0 new skips`, `0 failures` (111 arquivos de teste aprovados, 6 skipped de staging; 795 testes totais).
- **Regressão de Asserções**: `ASSERTION_WEAKER = 0`, `NEW_SKIPS = 0`.
- **Verificação Arquitetural**: `SUCESSO: Todas as fronteiras e regras arquiteturais respeitadas.`
- **Verificação de Tamanho de Arquivos**: `SUCESSO: Todos os arquivos de logica estao em conformidade (check:file-size = PASS).`
- **Auditoria de Segredos**: `SECRET_AUDIT_PASS` (verificado sobre diff de tracking).
- **QUALITY_EVIDENCE_STALE**: `NO` (commits posteriores em PR #69 e PR #70 foram estritamente documentais em `docs/`).

---

## 7. Bloqueios Atuais e Status de Prontidão (Current Blockers & Readiness)

1. `CUSTOMER_TRANSCRIPT_PROVIDER_PROCESSING_GATE = NOT CLEARED`: Transmissão de transcrições de clientes para provedores externos proibida.
2. `KNOWN_DETERMINISTIC_HANDLERS = 1` (`ACTIVE_DETERMINISTIC_BYPASS_READINESS = BLOCKED` até implementação de fiação controlada e testes de integração de runtime).
3. `POST_DISPATCH_BARGE_IN_DESIGN = DESIGNED` | `POST_DISPATCH_BARGE_IN_RUNTIME = IMPLEMENTED / TESTED LOCALLY (offline)` | `LIVE_PROVIDER_BARGE_IN_VERIFICATION = PROVIDER-UNVERIFIED`
4. `INTERRUPTED_CONTEXT_CONTINUITY_DESIGN = DESIGNED` | `INTERRUPTED_CONTEXT_METADATA_PROPAGATION = IMPLEMENTED / TESTED LOCALLY` | `INTERRUPTED_CONTEXT_CONTINUITY_RUNTIME = IMPLEMENTED / TESTED LOCALLY (offline delivery & qualified history)`
5. `HISTORY_COMPLETION_DESIGN = DESIGNED` | `HISTORY_COMPLETION_RUNTIME = IMPLEMENTED / TESTED LOCALLY (offline orchestrator history resolution)`
6. `SECURITY_RESPONSE_DELIVERY_DESIGN = DESIGNED` | `SECURITY_RESPONSE_DELIVERY_OFFLINE = IMPLEMENTED / TESTED LOCALLY` (`apps/voice/src/security-blocked-response.ts`, `apps/voice/src/conversation-orchestrator.ts`; turn-scoped refusal/delivery; call remains active; call termination = NO)
7. `SECURITY_RUNTIME_ROUTING_INTEGRATION = IMPLEMENTED / TESTED LOCALLY (offline)`
8. `GUARDED_RUNTIME_ROUTING_OFFLINE = IMPLEMENTED / TESTED LOCALLY`
9. `ACTIVE_GUARDED = BLOCKED`
10. `PRODUCTION_SHADOW_MAX_CONCURRENCY = NOT SELECTED`: Limite de concorrência operacional de produção não definido.
11. `PRODUCTION_JEV_TIMEOUT_MS = NOT SELECTED`: Evidência empírica descritiva L1B observada (N=100); timeout de produção requer revisão arquitetural separada e canary subsequente apropriado.
12. `PRODUCTION_ACTIVE_GUARDED_MAX_CONCURRENCY = NOT SELECTED`: Candidato canary 2 a 5 chamadas é proposta exploratória sem dados operacionais.
13. `MODEL_DRIFT_RUNTIME_GUARD = IMPLEMENTED / TESTED LOCALLY` (`EXPECTED_MODEL_AUTHORITY = OPTION_B`; exact match via `expectedProviderModel`).
14. `PRODUCTION_RUNTIME_WIRING = NO`: Fiação de runtime em produção desautorizada.
15. `LIVE_PROVIDER_GUARDED_ROUTING_VALIDATION = PARTIAL`: L1A executado com sucesso (`L1A_EXECUTION = PASS`); L1B executado com sucesso (`L1B_EXECUTION = PASS_COMPLETE`); L2 = PLANNED / NOT EXECUTED; L3 = NOT EXECUTED / BLOCKED UNTIL APPROPRIATE SLICE; L4 = BLOCKED.
16. `LIVE_TWILIO_GUARDED_ROUTING = NOT EXECUTED`: Validação em telefonia real pendente L3.
17. `CUSTOMER_TRAFFIC = PROHIBITED`

---

## 8. Próximo Passo Permitido & Ações Proibidas

### `NEXT_ALLOWED_STEP`:
- **Revisão Humana e Merge do PR de Hardening Offline** (L2 live continua NÃO autorizado).
  - Objetivos do próximo slice de código:
    1. Adicionar suporte a CLI flag `--allow-live` e propagação controlada de execução live;
    2. Implementar guarda em tempo de execução para limites de tokens de entrada (`RUNTIME_ENFORCED_INPUT_TOKEN_CAP`);
    3. Adicionar testes unitários isolados de borda para exaustão de caps de requisições (`checkCaps`);
    4. Garantir que precificação e pré-condições operem em modo fail-closed;
    5. Zero chamadas a provedores reais (`TypeSafe = 0`, `OpenAI = 0`, `Twilio = 0`).
- `L2_EXECUTION` = `NOT EXECUTED`.
- `OPENAI_PRICE_STATUS` = `VERIFIED` (oficial: $0.15/1M in, $0.60/1M out); `TYPESAFE_PRICE_STATUS` = `NOT_VERIFIED` (sem URL pública oficial de faturamento).
- `L2_OPERATOR_COST_CEILING` = `NOT_AUTHORIZABLE` (proposta de $0.25 USD aguarda hardening e caps executáveis).
- `ACTIVE_GUARDED` permanece `BLOCKED` até conclusão de toda a escada de validação (L1-L4).
- Do NOT execute L2 live.
- Do NOT enable live customer traffic.
- Do NOT use real telephony / live Twilio (`TWILIO_ACCOUNT_REQUIRED_NOW = NO`).

### `NOT_YET_ALLOWED`:
- Transmissão de dados reais de clientes para provedores externos.
- Ativação de `ACTIVE_GUARDED` no runtime.
- Modificação de políticas congeladas ou reutilização do holdout de pesquisa.
- Fiação em runtime de produção (`apps/voice`).

---

## 9. Referências Canônicas Autoritativas

- [AGENTS.md](../AGENTS.md): Regras operacionais obrigatórias para agentes de IA.
- [AI_EXECUTION_RULES.md](AI_EXECUTION_RULES.md): Execução detalhada, integridade e classificação de evidências.
- [AI_WORKLOG.md](AI_WORKLOG.md): Registro histórico cronológico append-only (com exceção de remoção emergencial de segredo conforme governança aplicável).
- [architecture/decisions/ADR-019-jev-guarded-runtime-integration.md](architecture/decisions/ADR-019-jev-guarded-runtime-integration.md): Design de integração do Jev.
- [research/PHASE_6_TYPESAFE_JEV_SHADOW_ADAPTER.md](research/PHASE_6_TYPESAFE_JEV_SHADOW_ADAPTER.md): Especificação e contrato do adapter offline.
- [research/PHASE_6_ACTIVE_GUARDED_PRODUCTION_READINESS_GATE.md](research/PHASE_6_ACTIVE_GUARDED_PRODUCTION_READINESS_GATE.md): Gate de prontidão e dimensionamento para ativação de ACTIVE_GUARDED.
- [research/PHASE_6_TYPESAFE_L1A_MODEL_IDENTITY_SMOKE_PLAN.md](research/PHASE_6_TYPESAFE_L1A_MODEL_IDENTITY_SMOKE_PLAN.md): Plano metodológico de validação funcional sintética de identidade de modelo L1A.
- [research/PHASE_6_TYPESAFE_LIVE_SYNTHETIC_SMOKE.md](research/PHASE_6_TYPESAFE_LIVE_SYNTHETIC_SMOKE.md): Registro factual do teste smoke sintético ao vivo do provedor.
- [research/PHASE_6_TYPESAFE_STAGING_SHADOW_LIVE_SYNTHETIC.md](research/PHASE_6_TYPESAFE_STAGING_SHADOW_LIVE_SYNTHETIC.md): Registro factual da execução live de staging sintético em modo SHADOW.
- [research/PHASE_6_TYPESAFE_STAGING_LATENCY_PLAN.md](research/PHASE_6_TYPESAFE_STAGING_LATENCY_PLAN.md): Plano metodológico de medição controlada de latência em staging sintético.
- [research/PHASE_6_TYPESAFE_STAGING_LATENCY_RESULT.md](research/PHASE_6_TYPESAFE_STAGING_LATENCY_RESULT.md): Relatório de evidência da bateria controlada de latência em staging sintético.
- [research/results/phase-6-staging-shadow-latency-evidence.json](research/results/phase-6-staging-shadow-latency-evidence.json): Artefato estruturado de evidência de latência (N=12).
- [research/PHASE_6_DETERMINISTIC_HANDLER_DESIGN.md](research/PHASE_6_DETERMINISTIC_HANDLER_DESIGN.md): Documento de design do primeiro candidato a handler determinístico (`agent.operating_hours`).
- [research/PHASE_6_DETERMINISTIC_RUNTIME_WIRING_DESIGN.md](research/PHASE_6_DETERMINISTIC_RUNTIME_WIRING_DESIGN.md): Documento de design da fiação de runtime determinístico e pré-requisitos de ACTIVE_GUARDED.
- [research/PHASE_6_RESPONSE_DELIVERY_LIFECYCLE_DESIGN.md](research/PHASE_6_RESPONSE_DELIVERY_LIFECYCLE_DESIGN.md): Design do ciclo de vida de entrega de respostas determinísticas e de segurança sob barge-in.
- [AGENT_STUDIO.md](AGENT_STUDIO.md): Especificação e matriz de entrega do Agent Studio (005B, 005C, 005D).

---

## 10. Resolução de Conflitos e Protocolo de Bootstrap (Bootstrap & Staleness Protocol)

1. **Prevalência Factual**: Se `AI_CONTEXT.md` divergir do código-fonte, do Git, de ADRs aceitos ou de testes observados, este arquivo está **STALE**. A evidência factual do repositório prevalece obrigatoriamente.
2. **Separação de Papéis**:
   - `AI_CONTEXT.md`: Snapshot mutável de navegação do estado verificado (alvo <= 250 linhas).
   - `AI_WORKLOG.md`: Registro histórico cronológico append-only.
   - `ADRs`: Registros formais de decisões arquiteturais.
   - Código / Git / Testes: Evidência factual primária.
3. **Algoritmo de Bootstrap de Contexto (Bootstrap Context Status)**:
   Ao iniciar qualquer tarefa substancial:
   - A. Executar `git fetch origin`.
   - B. Ler `CONTEXT_BASE_MAIN_SHA` e `CONTEXT_UPDATE_PR` do cabeçalho deste arquivo.
   - C. Observar o SHA atual de `origin/main`.
   - **Caso 1 (`CURRENT_EXACT`)**: Se `origin/main == CONTEXT_BASE_MAIN_SHA`, `CONTEXT_BOOTSTRAP_STATUS = CURRENT_EXACT`. O PR de contexto ainda não foi mergeado e nenhuma alteração posterior ocorreu na main.
   - **Caso 2 (`CURRENT_AFTER_SELF_MERGE`)**: Se `origin/main != CONTEXT_BASE_MAIN_SHA`, inspecionar `CONTEXT_UPDATE_PR`. Se o PR estiver mergeado E seu commit de merge for idêntico ao `origin/main` atual, `CONTEXT_BOOTSTRAP_STATUS = CURRENT_AFTER_SELF_MERGE`. Nenhuma reconciliação é necessária meramente pelo fato de o PR de contexto ter atualizado o SHA da main.
   - **Caso 3 (`REVALIDATION_REQUIRED`)**: Se o PR de contexto foi mergeado, mas `origin/main` contém commits posteriores ao seu merge: `CONTEXT_BOOTSTRAP_STATUS = REVALIDATION_REQUIRED`. O agente deve classificar as alterações posteriores (se afetarem arquitetura, runtime, provedores, prontidão de features, bloqueadores ou quality gate: `AI_CONTEXT_REFRESH_REQUIRED = YES`; se forem estritamente cosméticas/docs não relacionados: `AI_CONTEXT_REFRESH_REQUIRED = NO`, registrando a revalidação no worklog).
   - **Caso 4 (`NOT VERIFIED`)**: Se o estado do PR ou a linhagem não puder ser confirmada: `CONTEXT_BOOTSTRAP_STATUS = NOT VERIFIED`. **STOP** implementação substancial até reconciliação.
4. **Semântica de Status**:
   - `CONTEXT_STATUS_AT_REFRESH` descreve exclusivamente o estado no momento em que o snapshot foi gerado.
   - O status em tempo de execução (`CONTEXT_BOOTSTRAP_STATUS`) é dinamicamente derivado pelo algoritmo acima, eliminando o defeito de auto-obsolescência imediata pós-merge.
