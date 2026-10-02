# Phase 6: ACTIVE_GUARDED Production Readiness Gate Design

> **Documento**: `docs/research/PHASE_6_ACTIVE_GUARDED_PRODUCTION_READINESS_GATE.md`  
> **Status**: `DESIGNED / AUDIT ONLY`  
> **Data**: 2026-10-02  
> **Prompt de Origem**: `PROMPT-006AH-ACTIVE-GUARDED-PRODUCTION-READINESS-GATE-DESIGN-001`  
> **Branch**: `research/006ah-active-guarded-production-readiness-gate`  
> **Base Main Commit**: `8f6382c473ae10f9a38b3bb018e89dc51ef40b61` (Merge PR #61)  
> **Fronteira Estrita**: AUDIT / DESIGN ONLY. Zero código funcional alterado. Zero testes alterados. Zero contratos alterados. Zero chamadas a provedores externos (TypeSafe = 0, OpenAI = 0, Twilio = 0). Zero carregamento de `.env`. Zero conexões a DB. Zero acesso a holdout. `ACTIVE_GUARDED` permanece categoricamente `BLOCKED`.

---

## 1. Executive Summary

Este documento define formalmente os critérios técnicos, operacionais, de privacidade, de governança de modelo e de evidência empírica necessários **ANTES** de qualquer ativação de `ACTIVE_GUARDED` (roteamento supervisionado pelo modelo auxiliar TypeSafe Jev e pela Frozen Policy) no runtime de produção da plataforma.

A implementação offline do Slice D (PR #61) comprovou com sucesso a coordenação determinística em memória, blindagem de interrupção, supressão de stale generation e fail-open com fakes locais. No entanto, conectar provedores reais e tráfego telefônico em produção introduz riscos críticos de privacidade (transmissão de transcrições de clientes), deriva silenciosa de modelo (*model drift*), orçamento de latência acústica, contenção de concorrência e custos.

Este gate estabelece que:
1. `CUSTOMER_TRANSCRIPT_PROVIDER_PROCESSING_GATE` permanece **`NOT CLEARED`** até celebração de DPA formal, auditoria de subprocessores e autorização jurídica humana.
2. `MODEL_DRIFT_RUNTIME_GUARD` é **`REQUIRED_BEFORE_ACTIVE_GUARDED`** (estratégia de version pinning obrigatória).
3. A latência de staging (N=12, mediana 275ms) **não é** autoritativa para timeout de produção (`PRODUCTION_JEV_TIMEOUT_MS = CANDIDATE_PENDING_VALIDATION`).
4. A validação deve seguir estritamente uma escada controlada de 5 níveis (L0 a L4), garantindo isolamento total de dados reais de clientes até aprovação explícita.

---

## 2. Current Offline Readiness Baseline

Com a conclusão e merge do Slice D (PR #61, commit `8f6382c473ae10f9a38b3bb018e89dc51ef40b61`), o estado verificado do subsistema de voz é:

| Dimensão Operacional | Status Factual | Evidência / Localização |
|---|---|---|
| `GUARDED_RUNTIME_ROUTING_OFFLINE` | `IMPLEMENTED / TESTED LOCALLY` | `apps/voice/src/guarded-turn-routing-coordinator.ts`, 16 testes em `guarded-turn-routing.test.ts` |
| `MATCHER_FIRST` | `IMPLEMENTED / TESTED LOCALLY` | `matchesOperatingHoursCapability()`; matcher false -> Jev = 0 |
| `AUXILIARY_DECISION_SINGLE_OWNER` | `IMPLEMENTED / TESTED LOCALLY` | `ConversationOrchestrator`: shadowObserver suprimido quando guarded routing ativo |
| `DETERMINISTIC_ROUTE` | `IMPLEMENTED / TESTED LOCALLY` | `deliverDeterministicResponse()` via `operating-hours-turn-handler` |
| `SECURITY_ROUTE` | `IMPLEMENTED / TESTED LOCALLY` | `deliverSecurityBlockedResponse()`; zero OpenAI fallback, zero tools, chamada permanece `ACTIVE` |
| `GENERATIVE_ROUTE` | `IMPLEMENTED / TESTED LOCALLY` | Fallback transparente para `streamTurn()` do modelo principal |
| `STALE_GENERATION_AFTER_JEV` | `SUPPRESSED / TESTED LOCALLY` | Testes 9, 9b, 9c: stale -> zero speak determinístico, zero security speak, zero streamTurn |
| `POST_DISPATCH_BARGE_IN_OFFLINE` | `IMPLEMENTED / TESTED LOCALLY` | Interrupção H4/H5 via `UserInterruptionEvent` com fakes de transporte |
| `LIVE_PROVIDER_BARGE_IN` | `PROVIDER-UNVERIFIED` | Nenhuma validação acústica em tráfego telefônico real Twilio |
| `PRODUCTION_RUNTIME_WIRING` | `NO` | Nenhum composition root de produção conecta o coordenador supervisionado |
| `CUSTOMER_TRAFFIC` | `PROHIBITED` | Tráfego de clientes não autorizado |
| `ACTIVE_GUARDED` | `BLOCKED` | Fail-closed absoluto no runtime nominal |

---

## 3. Readiness Gate Dimensions

Para avaliar a prontidão antes de ligar o roteamento supervisionado em produção, a arquitetura decompõe a prontidão em 11 dimensões formais:

| Dimensão | Classificação | Justificativa Factual |
|---|---|---|
| **A. Privacy / Data Processing** | `NEEDS_HUMAN_APPROVAL` | DPA contratual e autorização de envio de dados de clientes pendentes |
| **B. Model Identity / Model Drift** | `DESIGNED / NEEDS_IMPLEMENTATION` | Estratégia de version pinning desenhada; autoridade runtime não implementada |
| **C. Timeout** | `DESIGNED / NEEDS_PROVIDER_EVIDENCE` | Amostra staging N=12 insuficiente; timeout de produção requer validação controlada |
| **D. Concurrency / Backpressure** | `DESIGNED` | Política de non-queuing fail-open desenhada; teto de produção não selecionado |
| **E. Provider Failure** | `READY` | Fail-closed para bypass determinístico e fail-open para modelo generativo testados |
| **F. Production Composition** | `DESIGNED` | Ponto de injeção desacoplado no composition root especificado sem dependência direta de SDK |
| **G. Observability** | `DESIGNED` | Mapeamento de métricas provider-neutral sanitizadas de transcrições e segredos |
| **H. Cost Control** | `DESIGNED / NEEDS_HUMAN_APPROVAL` | Preço por avaliação depende de contrato comercial; teto orçamentário diário exigido |
| **I. Controlled Live Validation** | `DESIGNED` | Escada L0-L4 desenhada; L0 concluído, L1 a L4 não executados |
| **J. Rollback / Kill Switch** | `DESIGNED` | Flag de configuração de feature-mode permite corte imediato para DISABLED sem migration |
| **K. Real Telephony Validation** | `BLOCKED` | Requer conta Twilio e testes L3; postergado para fase apropriada |

---

## 4. Customer Transcript Provider Processing Gate

O gate atual é categoricamente mantido:
```
CUSTOMER_TRANSCRIPT_PROVIDER_PROCESSING_GATE = NOT CLEARED
```

### 4.1 Auditoria do Payload Outbound (Data Minimization)
A interface `AuxiliaryTurnDecisionInput` do pacote `@voice-agent/contracts` define os seguintes campos:
- `organizationId: string`
- `callId: string`
- `turnId: string`
- `callerTranscript: string`
- `language?: string`
- `channel?: string`

Auditoria do adapter concreto (`TypeSafeJevTurnDecisionAdapter` em `packages/integrations/src/typesafe/typesafe-jev-turn-decision-adapter.ts`):
```typescript
const payload = JSON.stringify({
  model: this.model,
  state: {
    callerInput: input.callerTranscript,
    language: input.language ?? 'pt-BR',
    channel: input.channel ?? 'phone',
  },
  questions: JEV_ROUTING_ATOMIC_DEFINITION.questions,
});
```

**Separação Factual de Campos**:
1. `FIELDS_REQUIRED_BY_APPLICATION`: `organizationId`, `callId`, `turnId` (utilizados exclusivamente na aplicação para correlação, rastreabilidade de tenant, logs sanitizados e auditoria interna).
2. `FIELDS_REQUIRED_BY_PROVIDER`: `callerInput` (`callerTranscript`), `language`, `channel`, `model`, `questions`.
3. `FIELDS_NOT_NEEDED_EXTERNALLY`: `organizationId`, `callId`, `turnId`.
4. **Isolamento de Tenant no Fio**: O adapter existente **já implementa minimização estrita**, não transmitindo identificadores internos (`organizationId`, `callId`, `turnId`) para a API externa da TypeSafe.
5. **Mitigação por Matcher-First**: A propriedade de runtime offline garante que apenas turnos correspondentes a capabilities conhecidas (`matchesOperatingHoursCapability`) são avaliados:
```
AUXILIARY_PROVIDER_TRANSCRIPT_EXPOSURE = ONLY MATCHED KNOWN-CAPABILITY TURNS
```
Turnos conversacionais gerais, saudações ou dados sensíveis fora de escopo são encaminhados diretamente ao modelo principal sem exposição ao Jev.

---

## 5. Official TypeSafe Data-Processing Research

Pesquisa realizada exclusivamente em fontes e documentações oficiais da TypeSafe AI (acesso em 2026-10-02):

### 5.1 Evidências Documentadas
1. **Termos de Uso e DPA**:
   - **Fonte**: `https://typesafe.ai/data-processing` (incorporado por referência no Master Customer Agreement em `https://typesafe.ai/terms`).
   - **Fato**: O DPA estabelece termos de tratamento de dados pessoais conforme regulamentações globais (GDPR / LGPD equivalentes), estipulando obrigações contratuais de proteção.
2. **Subprocessadores**:
   - **Fonte**: `https://trust.typesafe.ai/subprocessors`.
   - **Fato**: A TypeSafe mantém lista pública de subprocessadores de infraestrutura e compromete-se a notificar clientes com 15 dias de antecedência para objeção fundamentada.
3. **Treinamento em Dados de Clientes (*No Training*)**:
   - **Fonte**: Documentação oficial e DPA da TypeSafe AI (`https://typesafe.ai/terms`).
   - **Fato**: A TypeSafe AI estipula que **não treina seus modelos fundamentais nos dados ou inputs fornecidos por clientes** via API.
4. **Retenção de Dados**:
   - **Fonte**: Seção de Retenção do DPA e Master Agreement (`https://typesafe.ai/data-processing`).
   - **Fato**: Dados de clientes são mantidos pelo período necessário para execução do serviço e cumprimento legal. Opção de *Zero Data Retention* (ZDR) é documentada para planos empresariais sob termos aditivos específicos.
5. **Transferência Internacional e Hospedagem**:
   - **Fonte**: TypeSafe Privacy Policy (`https://typesafe.ai/privacy`).
   - **Fato**: Os servidores da TypeSafe estão sediados nos Estados Unidos. A transferência de dados originados no Brasil ou UE requer Cláusulas Contratuais Padrão (SCCs) ou salvaguarda legal válida no DPA.

### 5.2 Matriz de Requisitos de Privacidade

| Requisito | Status Atual | Evidência Factual | Responsável (Owner) | Liberação Obrigatória |
|---|---|---|---|---|
| **Data Minimization (Wire)** | `READY` | Adapter omite `organizationId`, `callId`, `turnId` do payload | Engenharia | Automática (verificada em código) |
| **Matcher-First Gate** | `READY` | Jev avaliado apenas em turnos de horário de atendimento | Engenharia | Automática (verificada em código) |
| **No-Training Guarantee** | `VERIFIED IN DOCS` | Termos oficiais da TypeSafe proíbem treinamento em customer input | Segurança / Jurídico | Confirmação formal no contrato |
| **Zero Data Retention (ZDR)** | `NEEDS_COMMERCIAL_TERMS` | Documentado como opção enterprise; não contratado | Jurídico / Comercial | Execução de aditivo ZDR |
| **DPA Assinado** | `NEEDS_HUMAN_APPROVAL` | Termo padrão online não substitui assinatura bilateral para produção | Jurídico / Humano | Assinatura formal do DPA |
| **Transferência Internacional (LGPD)** | `NEEDS_HUMAN_APPROVAL` | Base legal e cláusulas padrão para transferência aos EUA pendentes | Jurídico / DPO | Parecer de conformidade DPO |
| **Transparência / Disclosure** | `NEEDS_HUMAN_APPROVAL` | Aviso de privacidade e termos para o usuário final da chamada de voz | Jurídico / Produto | Aprovação de script de atendimento |

**Veredito de Privacidade**:
```
CUSTOMER_TRANSCRIPT_PROVIDER_PROCESSING_GATE = NOT CLEARED
PRIVACY_HUMAN_LEGAL_APPROVAL_REQUIRED = YES
```

---

## 6. Model Identity & Model Drift Authority

### 6.1 Fatos Atuais do Código
- `REQUESTED_MODEL_AUTHORITY`: Constate default `DEFAULT_TYPESAFE_MODEL = 'jev-latest'` definida em `typesafe-jev-turn-decision-adapter.ts`.
- `OBSERVED_PROVIDER_MODEL`: Campo `model` retornado no corpo da resposta da TypeSafe e mapeado em `AuxiliaryTurnDecisionOutput.providerModel`.
- `EXPECTED_MODEL_AUTHORITY`: **Ausente**. Nem a snapshot da versão do agente (`AgentConfigurationSnapshotV1`) nem a configuração de runtime definem um modelo esperado para comparação.
- `CURRENT_MODEL_DRIFT_GUARD`: **`NOT IMPLEMENTED`**.

### 6.2 Semântica Oficial de Versionamento da TypeSafe
- A documentação oficial da TypeSafe esclarece que `jev-latest` é um **alias mutável** (*moving alias*), atualizado automaticamente quando novos checkpoints são promovidos.
- **Recomendação Oficial**: Para ambientes de produção com calibragem rígida de thresholds, a TypeSafe recomenda formalmente o **pinning de versão** (ex.: `jev-1.13.0` ou identificador estático com semver).
- Usar `jev-latest` em produção acarreta risco de alteração silenciosa da distribuição de scores (`deterministicScore`, `securityScore`), invalidando as garantias da Frozen Policy V1 (`T_SECURITY = 0.56`, `T_DETERMINISTIC = 0.35`).

### 6.3 Avaliação das Opções Arquiteturais de Model Drift

| Opção | Descrição | Segurança | Fragilidade Operacional | Suporte do Provedor | Veredito |
|---|---|---|---|---|---|
| **OPTION_M1** | Strict Equality com versão fixada (ex.: `expectedModel === 'jev-1.13.0'`) | **Máxima**: zero drift silencioso | Exige atualização de config para novos modelos | Totalmente suportado via payload `model` | **RECOMENDADA para Produção** |
| **OPTION_M2** | Approved-Set (ex.: `['jev-1.13.0', 'jev-1.13.1'].includes(model)`) | **Alta**: permite canary / blue-green | Moderada: exige gerenciar allowlist | Suportado | Alternativa para transições graduais |
| **OPTION_M3** | Comparação com o alias solicitado (`providerModel === 'jev-latest'`) | **Nula**: o alias muda de checkpoint sob o capô | Nenhuma | N/A | **REJEITADA** (falsa proteção) |
| **OPTION_M4** | Apenas monitoramento e telemetria | **Baixa**: detecção apenas post-mortem | Nenhuma | N/A | Insuficiente para autoridade determinística |

### 6.4 Semântica de Falha em Caso de Drift
Qualquer divergência detectada no guard de model drift deve agir de forma estritamente fail-safe:
```
MODEL_DRIFT_DETECTED:
  -> deterministic_bypass = NO
  -> security_escalate_from_unapproved_model = NO
  -> fallback_to_generative_model = YES (se generationId estiver ativo)
  -> metric: voice.turn.guarded.model_drift_detected += 1
  -> call_session = ACTIVE (nunca encerra a chamada, nunca executa handoff desnecessário)
```

**Resultado de Model Drift**:
```
MODEL_DRIFT_RUNTIME_GUARD_DESIGN = DESIGNED (OPTION_M1: Version Pinning)
MODEL_DRIFT_RUNTIME_GUARD_IMPLEMENTATION = NOT IMPLEMENTED
EXPECTED_MODEL_AUTHORITY = PENDING_CONFIG_SCHEMA_ADDITION
MODEL_DRIFT_GUARD_REQUIRED_BEFORE_ACTIVE_GUARDED = YES
```

---

## 7. Production Timeout Strategy & Evidence

### 7.1 Evidência Histórica de Staging (N=12)
Em `docs/research/PHASE_6_TYPESAFE_STAGING_LATENCY_RESULT.md`:
- `STAGING_SHADOW_TIMEOUT_MS = 1500`
- Amostra sintética controlada: $N = 12$
- Taxa de conclusão sob 1500ms: **100.0%** (12/12)
- Mediana: **275ms** | p90: **311ms** | p95: **450ms** | Máximo: **450ms**

### 7.2 Critérios para Produção vs. Staging
```
STAGING_TIMEOUT != PRODUCTION_TIMEOUT
```
1. **Orçamento Acústico de Voz**: A pausa humana natural na conversação telefônica situa-se entre 800ms e 1200ms. Se o Jev consumir 1500ms antes de um timeout, o fallback generativo posterior causará uma latência total perceptível superior a 2.5 segundos, degradando severamente a experiência do usuário.
2. **Cauda de Rede (*Tail Latency*)**: Amostra de $N=12$ em staging não oferece confiança estatística para p99 ou p99.9 em produção sob concorrência variável.
3. **Semântica de Timeout**:
   - `JEV_TIMEOUT` + `generation ativa` -> fallback imediato para o modelo generativo principal (`streamTurn`).
   - `JEV_TIMEOUT` + `generation stale` -> silêncio / supressão total (`streamTurn = 0`).
   - Bypass determinístico ou resposta de segurança são **terminantemente proibidos** em caso de timeout.
   - Retries automáticos: **Zero** (`retries = 0`). Repetir chamadas em voz viola o orçamento de latência.

**Status do Timeout de Produção**:
```
PRODUCTION_JEV_TIMEOUT_MS = CANDIDATE_PENDING_VALIDATION
CANDIDATE_RANGE = 600ms - 800ms
REQUIRED_EVIDENCE = Bateria sintética de latência N >= 100 requisições
```

---

## 8. Concurrency & Backpressure Strategy

### 8.1 Separação Semântica: Shadow vs. Active Guarded
- `SHADOW_MAX_CONCURRENCY`: Controla requisições assíncronas fire-and-forget que não afetam o caminho crítico de áudio.
- `ACTIVE_GUARDED_MAX_CONCURRENCY`: Controla requisições síncronas bloqueantes que precedem o despacho de áudio do turno.

### 8.2 Semântica de Exaustão de Capacidade (Backpressure)
Chamadas de voz em tempo real não toleram filas de espera (*queuing*) para decisões auxiliares:
```
CONCURRENCY_CAPACITY_EXHAUSTED:
  -> DO NOT QUEUE
  -> DROP AUXILIARY EVALUATION
  -> FAIL-OPEN IMMEDIATELY TO MAIN GENERATIVE MODEL (streamTurn)
  -> metric: voice.turn.guarded.concurrency_rejected += 1
```

**Status da Concorrência de Produção**:
```
PRODUCTION_ACTIVE_GUARDED_MAX_CONCURRENCY = NOT SELECTED (Candidato para Canary Inicial: 2 a 5 chamadas simultâneas)
```

---

## 9. Failure Matrix (Comportamento em Falhas de Runtime)

O quadro abaixo formaliza o comportamento determinístico em todos os modos de falha sob `ACTIVE_GUARDED`:

| Modo de Falha | Jev Invocado? | Bypass Determinístico? | Rota de Segurança? | Modelo Principal (OpenAI)? | Estado da Sessão | Telemetria Emitida |
|---|---|---|---|---|---|---|
| **Capability Matcher False** | NÃO | NÃO | NÃO | SIM (`streamTurn`) | `ACTIVE` | `guarded.matcher_skipped` |
| **Jev Timeout** | SIM | **NÃO** | **NÃO** | SIM (se ativa) | `ACTIVE` | `guarded.timeout`, `fail_open` |
| **Jev Erro de Rede / 5xx** | SIM | **NÃO** | **NÃO** | SIM (se ativa) | `ACTIVE` | `guarded.error`, `fail_open` |
| **Payload Inválido / Score fora [0,1]** | SIM | **NÃO** | **NÃO** | SIM (se ativa) | `ACTIVE` | `guarded.invalid_payload`, `fail_open` |
| **Model Drift Detectado** | SIM | **NÃO** | **NÃO** | SIM (se ativa) | `ACTIVE` | `guarded.model_drift`, `fail_open` |
| **Capacidade Esgotada (Concorrência)** | NÃO | **NÃO** | **NÃO** | SIM (se ativa) | `ACTIVE` | `guarded.concurrency_rejected`, `fail_open` |
| **Privacy Gate Fechado** | NÃO | **NÃO** | **NÃO** | SIM (se ativa) | `ACTIVE` | `guarded.privacy_gate_blocked` |
| **Feature Mode = DISABLED** | NÃO | **NÃO** | **NÃO** | SIM (se ativa) | `ACTIVE` | `guarded.disabled` |
| **Interrupção durante Jev (Stale)** | SIM | **NÃO** | **NÃO** | **NÃO** (`streamTurn = 0`) | `ACTIVE` | `guarded.stale_suppressed` |
| **Falha de Despacho pós-Rota** | SIM | Tratada no delivery | Tratada no delivery | **NÃO** (Option B blindada) | `ACTIVE` | `delivery.dispatch_failed` |

---

## 10. Circuit Breaker Decision (YAGNI Analysis)

- **`CURRENT_REQUIREMENT`**: O comportamento atual de fail-open imediato por turno (`try/catch` no coordenador) já protege a chamada individual de falhas catastróficas.
- **`EXISTING_OPTION`**: Fallback individual por turno para o modelo generativo.
- **`MINIMAL_OPTION`**:
  - Para validação sintética controlada (L1/L2): Circuit breaker é `NOT APPLICABLE` (volume conhecido e supervisionado).
  - Para canary e produção com tráfego real: `REQUIRED_BEFORE_PRODUCTION = YES / DESIGNED`.
  - **Critério Mínimo**: Se 5 avaliações consecutivas do Jev falharem (timeout ou 5xx), um circuit breaker simples em memória deve tripolar para `OPEN` por 60 segundos, enviando 100% dos turnos diretamente para o modelo generativo sem incorrer em penalidade de latência de timeout.

---

## 11. Production Composition Boundary & Feature Modes

### 11.1 Fronteira de Injeção
Em `apps/voice/src/composition-root.ts` (ou equivalente de produção):
- A lógica de domínio (`ConversationOrchestrator`) continua recebendo estritamente a porta de domínio `guardedRoutingCoordinator`.
- O composition root é o **único responsável** por instanciar `TypeSafeJevTurnDecisionAdapter` e injetá-lo no `GuardedTurnRoutingCoordinator`.
- **Zero imports de SDKs externos** ou detalhes de HTTP no núcleo do orquestrador.

### 11.2 Semântica dos Modos de Feature
A variável de configuração de runtime `VOICE_GUARDED_ROUTING_FEATURE_MODE` controla os três estados:

```
                              [Incoming Speech Final]
                                         |
               +-------------------------+-------------------------+
               |                         |                         |
               v                         v                         v
          [DISABLED]                  [SHADOW]              [ACTIVE_GUARDED]
               |                         |                         |
      guardedCoordinator = null  guardedCoordinator = null  guardedCoordinator = active
               |                         |                         |
        Jev Route: ZERO           Jev Route: ZERO           Jev Route: SINGLE_OWNER
        Shadow: ZERO              Shadow: ASYNC ADVISORY    Shadow: SUPPRESSED
        Response: GENERATIVE      Response: GENERATIVE      Response: DETERMINISTIC /
                                                                      SECURITY /
                                                                      GENERATIVE
```

### 11.3 Kill Switch / Rollback Design
- **Mecanismo**: Alteração da variável de ambiente `VOICE_GUARDED_ROUTING_FEATURE_MODE=DISABLED`.
- **Propriedades**:
  - Sem necessidade de deploy de código.
  - Sem alteração de schema ou migration de banco.
  - Sem alteração da Frozen Policy.
  - Sem quebra de estado de sessões de chamada ativas (sessões existentes continuam no modo generativo nominal).

---

## 12. Observability & Telemetry Requirements

Todas as métricas geradas devem ser estritamente provider-neutral e sanitizadas:

### 12.1 Métricas Mandatórias
1. `voice.guarded.turn_eligible_total`: Contador de turnos que atenderam ao capability matcher.
2. `voice.guarded.evaluations_total`: Contador de chamadas realizadas ao Jev.
3. `voice.guarded.classification_total`: Contador por classificação (`DETERMINISTIC_CANDIDATE`, `SECURITY_ESCALATE`, `GENERATIVE_REQUIRED`).
4. `voice.guarded.latency_ms`: Histograma de latência do provedor auxiliar (buckets: 100ms, 250ms, 500ms, 750ms, 1000ms, 1500ms).
5. `voice.guarded.timeout_total`: Contador de turnos abortados por timeout do Jev.
6. `voice.guarded.error_total`: Contador de erros (rede, 5xx, JSON inválido).
7. `voice.guarded.model_drift_total`: Contador de rejeições por divergência de modelo.
8. `voice.guarded.concurrency_rejected_total`: Contador de turnos que deram bypass no Jev por teto de concorrência.
9. `voice.guarded.stale_suppressed_total`: Contador de respostas auxiliares suprimidas por interrupção do usuário.

### 12.2 Proibições Estritas de Telemetria
É **expressamente proibido** registrar em logs estruturados ou métricas:
- Transcrição do usuário (`callerTranscript`).
- Texto de resposta determinística ou generativa.
- Chaves de API, Bearer tokens ou credenciais.
- Payloads brutos HTTP enviados ou recebidos do provedor.
- Dados pessoais identificáveis (PII).

---

## 13. Cost Control Model

1. **Preço por Avaliação Jev**: `COST_PER_JEV_EVALUATION = NOT VERIFIED` (depende de tier comercial acordado com a TypeSafe; documentação pública lista System One sob modelo por requisição/token).
2. **Teto Orçamentário Mandatório (*Cost Ceiling*)**:
   - Para validação sintética: teto rígido de requisições (ex.: max 100 chamadas).
   - Para canary em produção: teto diário monetário ou de volume de requisições após o qual a feature comuta automaticamente para `DISABLED`.
3. **Política de Retry**: **Zero retries** (`retries = 0`). O custo de retries em tempo real é duplo: financeiro e de latência acústica.

---

## 14. Controlled Live Validation Ladder

A promoção para produção deve seguir rigorosamente a escada de validação incremental:

```
[L0: Offline Fakes]
  │  Status: COMPLETE (PR #61 merged)
  │  Harness: Test fakes em memória, zero rede externa
  ▼
[L1: Real Jev + Synthetic Transcript]
  │  Status: NEXT CANDIDATE
  │  Harness: Adapter TypeSafe real, prompts sintéticos conhecidos, transporte fake
  │  Requisitos: Model Pinning pronto, timeout candidato, teto de custo, ZERO dados de clientes
  ▼
[L2: Real Jev + Real OpenAI + Synthetic Transcript]
  │  Status: PENDING L1
  │  Harness: Validação de fallback generativo real sob prompts sintéticos, sem Twilio
  ▼
[L3: Real Jev + Real Twilio Audio]
  │  Status: BLOCKED
  │  Harness: Chamada telefônica real de teste controlada (telefones de teste internos)
  │  Requisitos: Conta Twilio configurada, validação acústica de barge-in, autorização de operador
  ▼
[L4: Limited Production Canary / Customer Traffic]
     Status: BLOCKED
     Requisitos: Privacy Gate CLEARED, DPA assinado, Timeout/Concurrency de produção congelados,
                 Kill Switch validado, autorização formal humana/jurídica
```

---

## 15. Twilio Account Decision

- `TWILIO_ACCOUNT_REQUIRED_FOR_CURRENT_SLICE`: **`NO`** (Slice puramente documental).
- `TWILIO_ACCOUNT_REQUIRED_FOR_L1`: **`NO`** (Testes sintéticos de Jev não utilizam telefonia).
- `TWILIO_ACCOUNT_REQUIRED_FOR_L2`: **`NO`** (Testes de integração OpenAI + Jev não utilizam telefonia).
- `TWILIO_ACCOUNT_REQUIRED_FOR_L3`: **`YES`** (Exige conta Twilio provisionada, número telefônico alocado e SIP/WebSocket configurados para chamadas de teste).

**Diretiva**: Não solicitar criação de conta Twilio ao operador humano neste momento.

---

## 16. ACTIVE_GUARDED Go/No-Go Matrix

| Gate / Critério | Estado Atual | Evidência Disponível | Ação Necessária | Responsável | Exigido para L1? | Exigido para L3? | Exigido para ACTIVE_GUARDED Produção? |
|---|---|---|---|---|---|---|---|
| **1. Coordenação Offline** | `READY` | PR #61 merged, 149 testes passing | Nenhuma | Engenharia | SIM | SIM | SIM |
| **2. Privacy / DPA** | `BLOCKED` | Pesquisa de termos TypeSafe concluída | Assinatura formal DPA + base LGPD | Jurídico / DPO | NÃO | NÃO | **SIM (MANDATÓRIO)** |
| **3. Model Pinning (Drift)** | `DESIGNED` | Pesquisa oficial confirma versionamento | Implementar version pinning no adapter | Engenharia | **SIM** | SIM | SIM |
| **4. Timeout Selecionado** | `PENDING` | Mediana 275ms em staging (N=12) | Bateria sintética N>=100 | Engenharia | NÃO (usa default) | SIM | SIM |
| **5. Concorrência Selecionada** | `PENDING` | Semaphore projetado | Definir teto de canary | Engenharia | NÃO (seq=1) | SIM | SIM |
| **6. Circuit Breaker** | `DESIGNED` | Análise YAGNI concluída | Implementar se canary exigir | Engenharia | NÃO | NÃO | SIM |
| **7. Production Composition** | `DESIGNED` | Seam de injeção mapeado | Implementar no composition root | Engenharia | NÃO | NÃO | SIM |
| **8. Kill Switch** | `DESIGNED` | Feature mode `DISABLED` especificado | Conectar flag de ambiente | Engenharia | NÃO | SIM | SIM |
| **9. Observabilidade** | `DESIGNED` | Mapeamento de métricas concluído | Configurar métricas Prometheus/Datadog | Infra / Eng | NÃO | SIM | SIM |
| **10. Conta Twilio** | `BLOCKED` | ConversationRelay adapter existe | Provisionar credenciais e número de teste | Operador Humano | NÃO | **SIM** | SIM |
| **11. Aprovação Humana Formal** | `PENDING` | N/A | Sign-off de segurança, produto e jurídico | Operador Humano | NÃO | NÃO | **SIM (MANDATÓRIO)** |

**Veredito Global**:
- `READY_FOR_L1_SYNTHETIC_LIVE_JEV`: **`NO`** (Pendente implementação mínima de Model Pinning e plano de validação sintética com teto de custo).
- `READY_FOR_L3_REAL_TWILIO`: **`NO`** (Pendente L1, L2 e provisionamento de conta Twilio).
- `PRODUCTION_READY (ACTIVE_GUARDED)`: **`NO / BLOCKED`**.

---

## 17. Remaining Blockers Before Production Activation

1. `CUSTOMER_TRANSCRIPT_PROVIDER_PROCESSING_GATE = NOT CLEARED`
2. `MODEL_DRIFT_RUNTIME_GUARD = NOT IMPLEMENTED`
3. `PRODUCTION_JEV_TIMEOUT_MS = NOT SELECTED`
4. `PRODUCTION_ACTIVE_GUARDED_MAX_CONCURRENCY = NOT SELECTED`
5. `PRODUCTION_RUNTIME_WIRING = NO`
6. `LIVE_PROVIDER_GUARDED_ROUTING_VALIDATION = NOT EXECUTED`
7. `LIVE_TWILIO_GUARDED_ROUTING = NOT EXECUTED`
8. `ACTIVE_GUARDED = BLOCKED`

---

## 18. Next Minimal Slice Recommendation

Com base nos bloqueadores mapeados na Go/No-Go Matrix:

**Opção Recomendada**:
```
NEXT_ALLOWED_STEP: Slice E.1 — Model Identity Guard & L1 Synthetic Validation Plan (DOCS / IMPLEMENTATION)
```
- **Escopo**:
  1. Adicionar parâmetro de version pinning explícito ao `TypeSafeJevTurnDecisionAdapter` (ex.: `pinnedModelVersion: string`);
  2. Implementar a validação em runtime garantindo que `AuxiliaryTurnDecisionOutput.providerModel === pinnedModelVersion`;
  3. Estruturar o plano formal e dataset sintético fechado (N=20) para o teste L1 (TypeSafe real com zero dados de clientes, custo < $0.10).
  4. Manter `CUSTOMER_TRANSCRIPT_PROVIDER_PROCESSING_GATE = NOT CLEARED` e `ACTIVE_GUARDED = BLOCKED`.

---

## 19. Non-Goals Explícitos deste Slice

1. Nenhuma ativação de `ACTIVE_GUARDED` em qualquer ambiente.
2. Nenhuma alteração em código funcional, testes ou contratos.
3. Nenhuma chamada de API real a TypeSafe, OpenAI ou Twilio (TypeSafe = 0, OpenAI = 0, Twilio = 0).
4. Nenhum envio de transcrição de cliente para provedores externos.
5. Nenhum carregamento de variáveis de ambiente (`.env`) ou credenciais.
6. Nenhuma conexão com banco de dados.
7. Nenhuma reabertura ou consumo de holdouts de pesquisa.
8. Nenhuma alteração nos thresholds da Frozen Policy.
9. Nenhuma criação ou provisionamento de conta Twilio.
10. Nenhuma declaração de conformidade jurídica legal por inferência de IA.
