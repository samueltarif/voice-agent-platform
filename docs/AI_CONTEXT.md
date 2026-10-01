# Contexto Operacional Central de IA (AI_CONTEXT.md)

<!--
AI_CONTEXT_HEADER_START
CONTEXT_SCHEMA_VERSION: 1.1.0
LAST_REFRESHED_AT: 2026-10-01
CONTEXT_BASE_MAIN_SHA: b0124ac3d0b060a03aace4a83b954054d70d85a5
CURRENT_PHASE: Phase 6 (Voice Model Routing & Jev Evaluation)
CURRENT_SLICE: Deterministic Runtime Wiring Design
CONTEXT_UPDATE_BRANCH: research/006x-deterministic-runtime-wiring-design
CONTEXT_UPDATE_PR: 51
LAST_MERGED_PR_AT_REFRESH: 50
LAST_MERGE_SHA_AT_REFRESH: b0124ac3d0b060a03aace4a83b954054d70d85a5
LAST_TESTED_CODE_SHA: 7cc576d3cc78e3d16878da9e34d6f6953fd75d9a
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
| **Voice** | `PARTIAL` | `apps/voice` (Orquestrador, streaming OpenAI; AuxiliaryTurnShadowObserver integrado non-blocking; primeiro handler determinístico `agent.operating_hours` implementado/testado localmente; fiação em runtime de produção: NÃO; chamadas shadow live: NÃO) |
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
- **SELECTED_ROUTING_TOPOLOGY**: `DESIGNED / NOT WIRED` (Application-Eligibility Filtered Serial Gate — confirma Opcao C do ADR-019).
- **RUNTIME_FROZEN_POLICY_INTERPRETER**: `NOT IMPLEMENTED`.
- **SECURITY_RUNTIME_ACTION**: `NOT IMPLEMENTED`.
- **SECURITY_RUNTIME_SEMANTICS**: `UNDECIDED`.
- **SECURITY_RUNTIME_ACTION_DECISION_REQUIRED**: `YES`.
- **DETERMINISTIC_POST_DISPATCH_BARGE_IN**: `NOT VERIFIED`.
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

- **Último `pnpm check` Global**: `PASS` (executado e observado no commit `7cc576d3cc78e3d16878da9e34d6f6953fd75d9a`).
- **Status das Asserções**: `659 passed`, `45 historical skips`, `0 new skips`, `0 failures` (105 arquivos de teste aprovados, 6 skipped de staging).
- **Regressão de Asserções**: `ASSERTION_WEAKER = 0` (73 novos testes adicionados: `ASSERTION_STRONGER: 73`).
- **QUALITY_EVIDENCE_STALE**: `NO` (commits subsequentes estritamente documentais em `docs/`).

---

## 7. Bloqueios Atuais (Current Blockers)

1. `CUSTOMER_TRANSCRIPT_PROVIDER_PROCESSING_GATE = NOT CLEARED`: Transmissão de transcrições de clientes para provedores externos proibida.
2. `KNOWN_DETERMINISTIC_HANDLERS = 1` (`ACTIVE_DETERMINISTIC_BYPASS_READINESS = BLOCKED` até implementação de fiação controlada e testes de integração de runtime).
3. `PRODUCTION_SHADOW_MAX_CONCURRENCY = NOT SELECTED`: Limite de concorrência operacional de produção não definido.
4. `PRODUCTION_JEV_TIMEOUT_MS = NOT SELECTED`: Timeout operacional de produção não definido.
5. `PRODUCTION_RUNTIME_WIRING = NO`: Fiação de runtime em produção desautorizada.

---

## 8. Próximo Passo Permitido & Ações Proibidas

### `NEXT_ALLOWED_STEP`:
- Implementar offline a funcao pura `frozen-policy-interpreter.ts` acompanhada exclusivamente de testes unitarios focados e isolados (sem wiring no orquestrador).

### `NOT_YET_ALLOWED`:
- Transmissão de dados reais de clientes para provedores externos.
- Ativação de `ACTIVE_GUARDED` no runtime.
- Implementação de bypass determinístico sem handlers validados.
- Modificação de políticas congeladas ou reutilização do holdout de pesquisa.
- Fiação em runtime de produção (`apps/voice`).

---

## 9. Referências Canônicas Autoritativas

- [AGENTS.md](../AGENTS.md): Regras operacionais obrigatórias para agentes de IA.
- [AI_EXECUTION_RULES.md](AI_EXECUTION_RULES.md): Execução detalhada, integridade e classificação de evidências.
- [AI_WORKLOG.md](AI_WORKLOG.md): Registro histórico cronológico append-only (com exceção de remoção emergencial de segredo conforme governança aplicável).
- [architecture/decisions/ADR-019-jev-guarded-runtime-integration.md](architecture/decisions/ADR-019-jev-guarded-runtime-integration.md): Design de integração do Jev.
- [research/PHASE_6_TYPESAFE_JEV_SHADOW_ADAPTER.md](research/PHASE_6_TYPESAFE_JEV_SHADOW_ADAPTER.md): Especificação e contrato do adapter offline.
- [research/PHASE_6_TYPESAFE_LIVE_SYNTHETIC_SMOKE.md](research/PHASE_6_TYPESAFE_LIVE_SYNTHETIC_SMOKE.md): Registro factual do teste smoke sintético ao vivo do provedor.
- [research/PHASE_6_TYPESAFE_STAGING_SHADOW_LIVE_SYNTHETIC.md](research/PHASE_6_TYPESAFE_STAGING_SHADOW_LIVE_SYNTHETIC.md): Registro factual da execução live de staging sintético em modo SHADOW.
- [research/PHASE_6_TYPESAFE_STAGING_LATENCY_PLAN.md](research/PHASE_6_TYPESAFE_STAGING_LATENCY_PLAN.md): Plano metodológico de medição controlada de latência em staging sintético.
- [research/PHASE_6_TYPESAFE_STAGING_LATENCY_RESULT.md](research/PHASE_6_TYPESAFE_STAGING_LATENCY_RESULT.md): Relatório de evidência da bateria controlada de latência em staging sintético.
- [research/results/phase-6-staging-shadow-latency-evidence.json](research/results/phase-6-staging-shadow-latency-evidence.json): Artefato estruturado de evidência de latência (N=12).
- [research/PHASE_6_DETERMINISTIC_HANDLER_DESIGN.md](research/PHASE_6_DETERMINISTIC_HANDLER_DESIGN.md): Documento de design do primeiro candidato a handler determinístico (`agent.operating_hours`).
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
