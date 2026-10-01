# Contexto Operacional Central de IA (AI_CONTEXT.md)

<!--
AI_CONTEXT_HEADER_START
CONTEXT_SCHEMA_VERSION: 1.0.0
LAST_REFRESHED_AT: 2026-10-01
CONTEXT_MAIN_SHA: 40caab446ce2e8436e7efc9f73183d9373e2c75a
CURRENT_PHASE: Phase 6 (Voice Model Routing & Jev Evaluation)
CURRENT_SLICE: AI Context Factual Reconciliation
ACTIVE_BRANCH: docs/ai-context-factual-reconciliation
ACTIVE_PR: NONE
LAST_MERGED_PR: 42
LAST_MERGE_SHA: 40caab446ce2e8436e7efc9f73183d9373e2c75a
LAST_TESTED_CODE_SHA: 253cf92db2421e02b8cdee7002acd9c78e2f5897
CONTEXT_STATUS: CURRENT
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
| **Voice** | `PARTIAL` | `apps/voice` (Orquestrador, streaming OpenAI; AuxiliaryTurnShadowObserver integrado non-blocking; fiação em runtime: NÃO; chamadas shadow live: NÃO) |
| **Worker** | `IMPLEMENTED` | `apps/worker` (Fundação de background tasks, processamento de filas assíncronas) |
| **Database** | `IMPLEMENTED` | `packages/database` (PostgreSQL 16, Drizzle ORM, multi-tenancy, schemas comerciais e de auditoria) |
| **Agent Studio** | `PARTIAL` | 005B (DB/contracts): `IMPLEMENTED / STAGING VALIDATED`; 005C (API): `IMPLEMENTED / NEON STAGING VALIDATED`; 005D (Web UI): `PARTIAL` (rascunhos existem em `apps/web/src/features/agents/`, fluxo completo não concluído) |
| **OpenAI** | `IMPLEMENTED` | `packages/integrations/src/openai` (Adapter de modelo de conversa, baselines sintéticos) |
| **Twilio** | `PARTIAL` | `packages/integrations/src/twilio` (ConversationRelay adapter; tráfego telefônico real `PROVIDER-UNVERIFIED`) |
| **TypeSafe / Jev** | `PARTIAL` | `packages/integrations/src/typesafe` (Adapter offline implementado no PR #40; fiação em runtime: NÃO; live shadow: NÃO) |
| **Human Handoff** | `DESIGN ONLY` | Especificado em `docs/ROADMAP.md` e `docs/VOICE_ARCHITECTURE.md` |
| **Knowledge Base** | `DESIGN ONLY` | Arquitetura preliminar; implementação de retrieval postergada para fase posterior |
| **Billing** | `PARTIAL` | Schemas de quotas, planos e entitlements em banco; adapter Stripe não iniciado |
| **Observability** | `IMPLEMENTED` | `packages/logger` (Logs estruturados, sanitização de transcrições e segredos) |

---

## 2. Estado Específico da Integração TypeSafe / Jev (Phase 6)

- **AuxiliaryTurnDecisionPort**: `IMPLEMENTED` (`packages/contracts/src/voice/auxiliary-turn-decision-contracts.ts`).
- **AuxiliaryTurnShadowObserver**: `IMPLEMENTED` (`apps/voice/src/auxiliary-turn-shadow-observer.ts`).
- **TypeSafeJevTurnDecisionAdapter**: `IMPLEMENTED OFFLINE` (`packages/integrations/src/typesafe/typesafe-jev-turn-decision-adapter.ts`).
- **ADAPTER_RUNTIME_WIRED**: `NO` (zero injeções em composition roots de produção).
- **SHADOW_LIVE_ENABLED**: `NO` (zero chamadas a provedor externo em runtime).
- **DEFAULT_AUXILIARY_FEATURE_MODE**: `DISABLED`.
- **ACTIVE_GUARDED**: `BLOCKED` (fail-closed, inalcançável no runtime por design).
- **KNOWN_DETERMINISTIC_HANDLERS**: `0`.
- **ACTIVE_DETERMINISTIC_BYPASS_READINESS**: `BLOCKED` (invariante: `NO_KNOWN_DETERMINISTIC_HANDLER -> NO_DETERMINISTIC_BYPASS`).
- **CUSTOMER_TRANSCRIPT_PROVIDER_PROCESSING_GATE**: `NOT CLEARED`.
- **CUSTOMER_TRAFFIC**: `PROHIBITED`.
- **SHADOW_MAX_CONCURRENCY_OPERATIONAL**: `NOT SELECTED`.
- **JEV_TIMEOUT_MS**: `NOT SELECTED`.

---

## 3. Artefatos Congelados de Pesquisa (Frozen Research Artifacts)

- **OpenAI Baseline**:
  - Dataset: `scripts/benchmarks/voice/openai-baseline-v1-cases.json` (12 casos).
  - Dataset SHA-256: `9ab7cbd2fbfcf508673a700d4a484e0c674d0124766c7b7fa0eee05a573e0d50`.
  - Resultado: `docs/research/results/phase-6-openai-conversation-baseline.json`.
- **Jev Calibration V2**:
  - Dataset: `scripts/benchmarks/voice/jev-calibration-v2-cases.json` (120 casos totais: 80 calibração, 40 holdout).
  - Dataset SHA-256: `3e7e0a20ecd3341c99b84d40162b10eff17ba0600d191dd143bc99f00aec3047`.
  - Execução: `docs/research/results/phase-6-jev-calibration-phase-a-run1.json`.
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

- **Último `pnpm check` Global**: `PASS` (executado e observado em `253cf92db2421e02b8cdee7002acd9c78e2f5897`).
- **Status das Asserções**: `574 passed`, `45 historical skips`, `0 new skips`, `0 failures`.
- **Regressão de Asserções**: `ASSERTION_WEAKER = 0`.
- **QUALITY_EVIDENCE_STALE**: `NO` (commits subsequentes estritamente documentais em `docs/` e `AGENTS.md`).

---

## 7. Bloqueios Atuais (Current Blockers)

1. `CUSTOMER_TRANSCRIPT_PROVIDER_PROCESSING_GATE = NOT CLEARED`: Transmissão de transcrições de clientes para provedores externos proibida.
2. `KNOWN_DETERMINISTIC_HANDLERS = 0` (`ACTIVE_DETERMINISTIC_BYPASS_READINESS = BLOCKED`).
3. `SHADOW_MAX_CONCURRENCY_OPERATIONAL = NOT SELECTED`: Limite de concorrência operacional não definido.
4. `JEV_TIMEOUT_MS = NOT SELECTED`: Timeout de chamada operacional não definido.
5. `LIVE_TYPESAFE_SYNTHETIC_SMOKE = NOT EXECUTED`: Teste sintético do adapter TypeSafe em staging controlado ainda não homologado com chamada real.

---

## 8. Próximo Passo Permitido & Ações Proibidas

### `NEXT_ALLOWED_STEP`:
- 1 teste smoke sintético controlado da TypeSafe em Staging autorizado separadamente, com payload não-sensível sintético, orçamento monetário explícito (`BUDGET_CAP_USD`), sem OpenAI, sem Twilio, sem bypass ativo, sem tráfego de cliente e sem fiação em produção.

### `NOT_YET_ALLOWED`:
- Transmissão de dados reais de clientes para provedores externos.
- Ativação de `ACTIVE_GUARDED` no runtime.
- Implementação de bypass determinístico sem handlers validados.
- Modificação de políticas congeladas ou reutilização do holdout de pesquisa.
- Fiação em runtime de produção (`apps/voice`).

---

## 9. Referências Canônicas Autoritativas

- [AGENTS.md](AGENTS.md): Regras operacionais obrigatórias para agentes de IA.
- [docs/AI_EXECUTION_RULES.md](docs/AI_EXECUTION_RULES.md): Execução detalhada, integridade e classificação de evidências.
- [docs/AI_WORKLOG.md](docs/AI_WORKLOG.md): Registro histórico cronológico append-only (com exceção de remoção emergencial de segredo conforme governança aplicável).
- [docs/architecture/decisions/ADR-019-jev-guarded-runtime-integration.md](docs/architecture/decisions/ADR-019-jev-guarded-runtime-integration.md): Design de integração do Jev.
- [docs/research/PHASE_6_TYPESAFE_JEV_SHADOW_ADAPTER.md](docs/research/PHASE_6_TYPESAFE_JEV_SHADOW_ADAPTER.md): Especificação e contrato do adapter offline.
- [docs/AGENT_STUDIO.md](docs/AGENT_STUDIO.md): Especificação e matriz de entrega do Agent Studio (005B, 005C, 005D).

---

## 10. Resolução de Conflitos e Protocolo de Desatualização (Staleness Gate)

1. **Prevalência Factual**: Se `AI_CONTEXT.md` divergir do código-fonte, do Git, de ADRs aceitos ou de testes observados, este arquivo está **STALE**. A evidência factual do repositório prevalece obrigatoriamente.
2. **Checagem no Início de Tarefas**:
   - Comparar `CONTEXT_MAIN_SHA` do cabeçalho com `git rev-parse origin/main`.
   - Se idênticos: `CONTEXT_STATUS = CURRENT`.
   - Se divergentes: `CURRENT_FILE_WAS_STALE = YES` — o agente deve revalidar o estado factual no repositório antes de prosseguir.
3. **Separação de Papéis**:
   - `AI_CONTEXT.md`: Snapshot mutável de navegação do estado atual (alvo <= 250 linhas).
   - `AI_WORKLOG.md`: Registro histórico cronológico append-only.
   - `ADRs`: Registros formais de decisões arquiteturais.
   - Código / Git / Testes: Evidência factual primária.
