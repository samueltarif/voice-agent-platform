# Contexto Operacional Central de IA (AI_CONTEXT.md)

<!--
AI_CONTEXT_HEADER_START
CONTEXT_SCHEMA_VERSION: 1.0.0
LAST_REFRESHED_AT: 2026-10-01
CONTEXT_MAIN_SHA: 9133a72b95fbc2776a7bf181d219efb5b28392ee
CURRENT_PHASE: Phase 6 (Voice Model Routing & Jev Evaluation)
CURRENT_SLICE: AI Context Continuity Foundation (Post-PR #41)
ACTIVE_BRANCH: docs/ai-context-continuity-foundation
ACTIVE_PR: 42
LAST_MERGED_PR: 41
LAST_MERGE_SHA: 9133a72b95fbc2776a7bf181d219efb5b28392ee
LAST_TESTED_CODE_SHA: 253cf92db2421e02b8cdee7002acd9c78e2f5897
CONTEXT_STATUS: CURRENT
AI_CONTEXT_HEADER_END
-->

> **Documento Canônico de Estado Operacional Atual**
> O repositório Git e o código-fonte são as únicas fontes duráveis da verdade.
> Memória de conversação, histórico de chat e suposições NÃO constituem evidência.
> Este arquivo é mutável e reflete estritamente o snapshot do estado atual verificado.

---

## 1. Estado Atual dos Subsistemas (Product Subsystems)

| Subsistema | Status | Evidência / Localização |
| :--- | :--- | :--- |
| **Web** | `IMPLEMENTED` | `apps/web` (Next.js 15.5, Dashboard, Agent Studio UI, preferences) |
| **API** | `IMPLEMENTED` | `apps/api` (Fastify/Node, rotas de drafts, lifecycle, auth interna) |
| **Voice** | `PARTIAL` | `apps/voice` (Orquestrador, streaming OpenAI, Shadow Observer wired; live shadow disabled) |
| **Worker** | `IMPLEMENTED` | `apps/worker` (Fundação de background tasks, processamento de filas) |
| **Database** | `IMPLEMENTED` | `packages/database` (PostgreSQL 16, Drizzle ORM, multi-tenancy, schemas comerciais) |
| **Agent Studio** | `IMPLEMENTED` | Editor de rascunhos, ciclo de vida de versões, publicação com invariante de versão única |
| **OpenAI** | `IMPLEMENTED` | `packages/integrations/src/openai` (Adapter de modelo de conversa, baselines sintéticos) |
| **Twilio** | `PARTIAL` | `packages/integrations/src/twilio` (ConversationRelay adapter; tráfego real `PROVIDER-UNVERIFIED`) |
| **TypeSafe / Jev** | `PARTIAL` | `packages/integrations/src/typesafe` (Adapter offline implementado no PR #40; não fiação em runtime) |
| **Human Handoff** | `DESIGN ONLY` | Especificado em `docs/ROADMAP.md` e `docs/VOICE_ARCHITECTURE.md` |
| **Knowledge Base** | `DESIGN ONLY` | Arquitetura preliminar; implementação de retrieval postergada para fase posterior |
| **Billing** | `PARTIAL` | Schemas de quotas, planos e entitlements em banco; adapter Stripe não iniciado |
| **Observability** | `IMPLEMENTED` | `packages/logger` (Logs estruturados, sanitização de transcrições e segredos) |

---

## 2. Estado Específico da Integração TypeSafe / Jev (Phase 6)

- **AuxiliaryTurnDecisionPort**: `IMPLEMENTED` (`packages/contracts/src/voice/auxiliary-turn-decision-contracts.ts`).
- **AuxiliaryTurnShadowObserver**: `IMPLEMENTED` (`apps/voice/src/auxiliary-turn-shadow-observer.ts`).
- **TypeSafeJevTurnDecisionAdapter**: `IMPLEMENTED` (`packages/integrations/src/typesafe/typesafe-jev-turn-decision-adapter.ts`).
- **Runtime Wiring**: `NOT WIRED` (`ADAPTER_RUNTIME_WIRED = NO`, zero injeções em composition roots).
- **Shadow Mode no Runtime**: `DISABLED` (`DEFAULT_AUXILIARY_FEATURE_MODE = 'DISABLED'`).
- **ACTIVE_GUARDED**: `BLOCKED` (fail-closed, inalcançável no runtime por design).
- **Handlers Determinísticos**: `0` conhecidos (`ACTIVE_DETERMINISTIC_BYPASS_READINESS = BLOCKED`).
- **Invariante de Bypass**: `NO_KNOWN_DETERMINISTIC_HANDLER -> NO_DETERMINISTIC_BYPASS`.
- **Privacy Gate**: `CUSTOMER_TRANSCRIPT_PROVIDER_PROCESSING_GATE = NOT CLEARED`.
- **Customer Traffic**: `CUSTOMER_TRAFFIC = PROHIBITED`.
- **Limites Operacionais**: Concorrência operacional e timeout `NOT SELECTED`.

---

## 3. Artefatos Congelados de Pesquisa (Frozen Research Artifacts)

- **OpenAI Baseline**: `docs/research/results/phase-6-openai-conversation-baseline.json` (80 amostras).
- **Jev Calibration**: `docs/research/results/phase-6-jev-calibration-phase-a-run1.json` (60 amostras).
- **Atomic V1 SHA-256**: `3fecf9ce82ad600a74549d3459fe2b2b516fc3bd7b5fff33bf5b850cd48e8725`.
- **Frozen Policy SHA-256**: `3f3b92f75beff5e82aeb387431e67e37a2846430349f43058a9463b78cfc596e`.
- **Frozen Thresholds**: Determinístico `0.56`, Generativo `0.35`, Segurança `0.47`.
- **Locked Holdout**: `docs/research/results/phase-6-jev-locked-holdout-v2-run1.json`.
  - Invariante: `LOCKED_HOLDOUT = CONSUMED` | `DO_NOT_REUSE_FOR_TUNING = YES`.

---

## 4. Invariantes Arquiteturais e de Governança

1. **Autoridade de Dados**: Provedores de IA (OpenAI, TypeSafe) NUNCA decidem autorizações, precificação, multi-tenancy ou mutações duráveis. O Banco de Dados e as máquinas de estado determinísticas são a fonte durável.
2. **Autoridade do Jev**: Caráter estritamente consultivo (`AuxiliaryTurnDecisionPort` retorna apenas probabilidades em `[0, 1]` e telemetria de latência). O adapter não possui métodos de execução de ferramentas, handoff ou mutação.
3. **Isolamento de Tenant**: Toda entidade de organização exige `organizationId` explícito em consultas.
4. **Política de Isolamento de Custos em Testes**: Zero chamadas a APIs pagas reais na suíte de testes automatizados (`packages/test-utils` e mocks de injeção utilizados universalmente).
5. **Privacidade de Transcrições**: Proibido registrar `callerTranscript` em logs estruturados rotineiros.

---

## 5. Invariantes de Segurança Operacional

1. **Zero Segredos**: Proibido exibir, ecoar, logar ou comitar chaves de API, tokens JWT/GitHub, credenciais PostgreSQL ou chaves privadas. Auditoria via `git diff` estritamente booleana (`SECRET_AUDIT_PASS`).
2. **Proteção de Arquivos `.env`**: Proibido ler, abrir, inspecionar (`cat`, `type`, `Get-Content`) ou pesquisar arquivos `.env`. Carga em runtime permitida apenas quando formalmente autorizada no prompt.
3. **Isolamento de Armazenamento da IDE**: Proibido ler ou usar diretórios internos da IDE (`.system_generated/`, `.gemini/`, `brain/`, logs de tarefas).

---

## 6. Estado Atual da Evidência de Qualidade (Quality Gate Snapshot)

> *Nota: Este registro é um snapshot. Se houver alterações posteriores em código, testes ou configurações, a evidência torna-se obsoleta (stale) até reexecução e observação direta dos gates.*

- **Último `pnpm check` Global**: `PASS` (executado e observado em `253cf92db2421e02b8cdee7002acd9c78e2f5897`).
- **Status das Asserções**: `574 passed`, `45 historical skips`, `0 new skips`, `0 failures`.
- **Regressão de Asserções**: `ASSERTION_WEAKER = 0`.
- **Evidência Atual**: `VALID` (os commits subsequentes foram exclusivamente documentais em `docs/`).

---

## 7. Bloqueios Atuais (Current Blockers)

1. `CUSTOMER_TRANSCRIPT_PROVIDER_PROCESSING_GATE = NOT CLEARED`: Transmissão de transcrições de clientes para provedores externos proibida.
2. `ACTIVE_DETERMINISTIC_BYPASS_READINESS = BLOCKED`: Zero handlers determinísticos implementados (`KNOWN_DETERMINISTIC_HANDLERS = 0`).
3. `SHADOW_OPERATIONAL_LIMITS = NOT SELECTED`: Limites de concorrência e timeout de runtime não calibrados.
4. `LIVE_STAGING_SMOKE = NOT EXECUTED`: Teste sintético do adapter TypeSafe em staging controlado ainda não homologado com chamada real.

---

## 8. Próximo Passo Permitido & Ações Proibidas

### `NEXT_ALLOWED_STEP`:
- Preparação de 1 teste smoke sintético controlado da TypeSafe em Staging com orçamento monetário explícito (`BUDGET_CAP_USD`), payload não-sensível e sem tráfego de cliente.

### `NOT_YET_ALLOWED`:
- Transmissão de áudio ou transcrição real de clientes para a TypeSafe.
- Ativação do modo `ACTIVE_GUARDED` no runtime.
- Implementação de bypass determinístico sem handlers validados.
- Modificação de políticas congeladas ou reutilização do holdout de pesquisa.
- Fiação em runtime de produção (`apps/voice`) sem autorização humana formal prévia.

---

## 9. Referências Canônicas Autoritativas

- [AGENTS.md](file:///D:/voice-agent-platform/AGENTS.md): Regras operacionais obrigatórias para agentes de IA.
- [docs/AI_EXECUTION_RULES.md](file:///D:/voice-agent-platform/docs/AI_EXECUTION_RULES.md): Execução detalhada, integridade e classificação de evidências.
- [docs/AI_WORKLOG.md](file:///D:/voice-agent-platform/docs/AI_WORKLOG.md): Registro histórico cronológico append-only (imutável).
- [docs/architecture/decisions/ADR-019-jev-guarded-runtime-integration.md](file:///D:/voice-agent-platform/docs/architecture/decisions/ADR-019-jev-guarded-runtime-integration.md): Design de integração do Jev.
- [docs/research/PHASE_6_TYPESAFE_JEV_SHADOW_ADAPTER.md](file:///D:/voice-agent-platform/docs/research/PHASE_6_TYPESAFE_JEV_SHADOW_ADAPTER.md): Especificação e contrato do adapter offline.

---

## 10. Resolução de Conflitos e Protocolo de Desatualização (Staleness Gate)

1. **Regra de Conflito**: Se `AI_CONTEXT.md` divergir do código-fonte, do estado do Git, de ADRs aceitos ou de testes observados, o `AI_CONTEXT.md` deve ser considerado **OBSOLETO (STALE)**. O agente DEVE seguir a evidência factual verificável do repositório.
2. **Protocolo no Início de Cada Tarefa**:
   - Executar `git fetch origin`;
   - Comparar `CONTEXT_MAIN_SHA` do cabeçalho deste arquivo com `git rev-parse origin/main`;
   - Se idênticos: `CONTEXT_STATUS = CURRENT`;
   - Se divergentes: `CONTEXT_STATUS = STALE` — o agente deve revalidar o estado no código antes de iniciar alterações.
3. **Regra de Atualização**: `AI_CONTEXT.md` é atualizado apenas quando a tarefa altera estado arquitetural, integrações de provedor, prontidão de features, bloqueadores ativos ou última evidência de teste válida. Nunca usá-lo para reescrever histórico.
