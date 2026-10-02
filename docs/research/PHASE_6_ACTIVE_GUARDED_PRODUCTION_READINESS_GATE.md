# Phase 6: ACTIVE_GUARDED Production Readiness Gate Design

> **Documento**: `docs/research/PHASE_6_ACTIVE_GUARDED_PRODUCTION_READINESS_GATE.md`<br />
> **Status**: `DESIGNED / AUDIT ONLY`<br />
> **Data**: 2026-10-02<br />
> **Prompt de Origem**: `PROMPT-006AH-ACTIVE-GUARDED-PRODUCTION-READINESS-GATE-DESIGN-001`<br />
> **Prompt de Hardening**: `PROMPT-006AH-PR62-SOURCE-INTEGRITY-READINESS-HARDENING-AND-MERGE-001`<br />
> **Branch**: `research/006ah-active-guarded-production-readiness-gate`<br />
> **Base Main Commit**: `8f6382c473ae10f9a38b3bb018e89dc51ef40b61` (Merge PR #61)<br />
> **Fronteira Estrita**: AUDIT / DESIGN ONLY. Zero código funcional alterado. Zero testes alterados. Zero contratos alterados. Zero chamadas a provedores externos (TypeSafe = 0, OpenAI = 0, Twilio = 0). Zero carregamento de `.env`. Zero conexões a DB. Zero acesso a holdout. `ACTIVE_GUARDED` permanece categoricamente `BLOCKED`.

---

## 1. Executive Summary

Este documento define formalmente os critérios técnicos, operacionais, de privacidade, de governança de modelo e de evidência empírica necessários **ANTES** de qualquer ativação de `ACTIVE_GUARDED` (roteamento supervisionado pelo modelo auxiliar TypeSafe Jev e pela Frozen Policy) no runtime de produção da plataforma.

A implementação offline do Slice D (PR #61) comprovou com sucesso a coordenação determinística em memória, blindagem de interrupção, supressão de stale generation e fail-open com fakes locais. No entanto, conectar provedores reais e tráfego telefônico em produção introduz riscos críticos de privacidade (transmissão de transcrições de clientes), integridade de modelo (*model drift*), orçamento de latência acústica, contenção de concorrência e custos.

Este gate estabelece que:
1. `CUSTOMER_TRANSCRIPT_PROVIDER_PROCESSING_GATE` permanece **`NOT CLEARED`** até celebração de DPA formal, auditoria de subprocessores e autorização jurídica humana.
2. `MODEL_DRIFT_RUNTIME_GUARD` é **`REQUIRED_BEFORE_ACTIVE_GUARDED`** (estratégia de version pinning desenhada como recomendação arquitetural; autoridade de modelo em runtime `NOT IMPLEMENTED`).
3. A latência de staging (N=12, mediana 275ms) é evidência histórica de staging e **não é** autoritativa para timeout de produção (`PRODUCTION_JEV_TIMEOUT_MS = NOT SELECTED (CANDIDATE_PENDING_VALIDATION)`).
4. A validação deve seguir estritamente uma escada controlada (L0 a L4), separando smoke funcional sintético com validação de modelo (L1A) de estudo empírico de latência (L1B), garantindo isolamento total de dados reais de clientes até aprovação explícita.

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
| **A. Privacy / Data Processing** | `BLOCKED / HUMAN_LEGAL_APPROVAL_REQUIRED` | `CUSTOMER_TRANSCRIPT_PROVIDER_PROCESSING_GATE = NOT CLEARED`. DPA e autorização jurídica humana pendentes |
| **B. Model Identity / Model Drift** | `DESIGNED` | Suporte a modelo versionado verificado no provedor; autoridade e guarda de runtime `NOT IMPLEMENTED`; expectativa `UNRESOLVED` |
| **C. Timeout** | `NOT SELECTED / VALIDATION REQUIRED` | Amostra staging N=12 insuficiente; timeout de produção requer validação controlada L1B; 600-800ms é candidato exploratório |
| **D. Concurrency / Backpressure** | `NOT SELECTED` | Política de non-queuing fail-open desenhada; teto de produção não selecionado; 2-5 canary é proposta exploratória |
| **E. Provider Failure** | `READY` | Fail-closed para bypass determinístico e fail-open para modelo generativo testados offline |
| **F. Production Composition** | `DESIGNED / NOT IMPLEMENTED` | Ponto de injeção desacoplado especificado; `PRODUCTION_RUNTIME_WIRING = NO` |
| **G. Observability** | `DESIGNED / NOT IMPLEMENTED` | Mapeamento de métricas provider-neutral sanitizadas de transcrições e segredos desenhado |
| **H. Cost Control** | `DESIGNED / NEEDS_HUMAN_APPROVAL` | `COST_PER_JEV_EVALUATION = NOT VERIFIED` (depende de tier comercial acordado); teto orçamentário diário exigido |
| **I. Controlled Live Validation** | `DESIGNED` | Escada L0-L4 desenhada; L0 concluído, L1A/L1B a L4 não executados |
| **J. Rollback / Kill Switch** | `DESIGNED / NOT IMPLEMENTED` | Sem reload dinâmico em runtime; alteração de flag exige restart/redeploy; implementação `NOT IMPLEMENTED` |
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

Pesquisa realizada em fontes e documentações oficiais da TypeSafe AI (revalidada em 2026-10-02):

### 5.1 Fontes Oficiais Observadas

1. **`https://docs.typesafe.ai/models.md`**
   - **Título**: `Models`
   - **Seções**: `Data handling`, `Aliases`, `Listing models`
   - **Data de Acesso**: 2026-10-02
   - **Fato**: Jev não é treinado em requests ou responses de clientes ("Jev is not trained on customer requests or responses"). Refere formalmente a `/legal` para DPA, Privacy Policy e Zero Data Retention (ZDR) para enterprise.
2. **`https://docs.typesafe.ai/api.md`**
   - **Título**: `API reference`
   - **Seções**: `Evaluation endpoint`, `Request body`, `Response body`
   - **Data de Acesso**: 2026-10-02
   - **Fato**: Define formato de request (`state`, `model`, `questions`) e response (`model`, `answers`, `usage`). Confirma que o campo `model` da resposta reporta o ID que executou a avaliação.
3. **`https://docs.typesafe.ai/legal.md`**
   - **Título**: `Legal`
   - **Seções**: `Legal documents`
   - **Data de Acesso**: 2026-10-02
   - **Fato**: Lista DPA (`https://typesafe.ai/legal/data-processing`), Master Customer Agreement (`https://typesafe.ai/legal/mca`) e Privacy Policy (`https://typesafe.ai/legal/privacy-policy`). Confirma oferta de Zero Data Retention (ZDR) para enterprise via `sales@typesafe.ai`.
4. **`https://typesafe.ai/legal/terms`** (redirecionado de `https://typesafe.ai/terms`)
   - **Título**: `Terms of use - TypeSafe AI`
   - **Data de Acesso**: 2026-10-02
   - **Fato**: Termos de navegação do site público (`the Site`).
5. **`https://typesafe.ai/legal/mca`**
   - **Título**: `Master customer agreement - TypeSafe AI`
   - **Seções**: `4. Data`, `4.1. Use of Customer Data`
   - **Data de Acesso**: 2026-10-02
   - **Fato**: Cláusula 4.1 estabelece: "The foregoing license does not grant TypeSafe the right to, and TypeSafe will not, include Customer Data in a dataset used to train (i.e., to modify the model weights of) any artificial intelligence or machine learning models without Customer’s prior consent."
6. **`https://typesafe.ai/legal/data-processing`** (redirecionado de `https://typesafe.ai/data-processing`)
   - **Título**: `Data processing addendum - TypeSafe AI`
   - **Seções**: `2. Customer Personal Data`, `3. Subprocessors` (3.1, 3.2), `6. International Data Transfers`, `Schedule I` (8. Duration of Processing)
   - **Data de Acesso**: 2026-10-02
   - **Fato**: Cláusula 2: TypeSafe processa dados pessoais de clientes apenas sob instruções documentadas para prestar o serviço. Cláusula 3: autorização geral para subprocessadores em `https://trust.typesafe.ai/subprocessors`, com aviso prévio razoável e prazo de 15 dias para objeção. Cláusula 6: incorporação de EU SCCs (Module 2 e 3) e UK Addendum. Schedule I, Seção 8: dados retidos pelo tempo necessário para execução e cumprimento legal.
7. **`https://typesafe.ai/legal/privacy-policy`** (redirecionado de `https://typesafe.ai/privacy`)
   - **Título**: `Privacy policy - TypeSafe AI`
   - **Seções**: `International Visitors`, `Retention`
   - **Data de Acesso**: 2026-10-02
   - **Fato**: "International Visitors" declara que os serviços são hospedados nos Estados Unidos ("The Services are hosted in the United States ('U.S.')."). "Retention" declara retenção pelo tempo razoavelmente necessário para prestação de serviços ou exigência legal.
8. **`https://trust.typesafe.ai/subprocessors`**
   - **Título**: `Typesafe.ai Trust Center`
   - **Data de Acesso**: 2026-10-02
   - **Fato**: Shell SPA do Vanta Trust Center para TypeSafe, formalmente referenciado na cláusula 3.1 do DPA.

### 5.2 Matriz de Classificação Factual de Requisitos de Privacidade

| Requisito | Classificação Factual | Fonte / Evidência Observável | Owner | Liberação para Produção |
|---|---|---|---|---|
| **Data Minimization (Wire)** | `PROVIDER_DOCUMENTED / ARCHITECTURAL_PROPERTY` | Adapter omite `organizationId`, `callId`, `turnId` do payload | Engenharia | Verificada em código |
| **Matcher-First Gate** | `ARCHITECTURAL_PROPERTY` | Matcher filtra turnos elegíveis antes de invocar Jev | Engenharia | Verificada em código |
| **No-Training Guarantee** | `PROVIDER_DOCUMENTED` | MCA Cláusula 4.1 e `docs.typesafe.ai/models.md` ("Jev is not trained on customer requests or responses") | Segurança / Jurídico | Confirmação formal no contrato |
| **Data Retention Policy** | `PROVIDER_DOCUMENTED` | DPA Schedule I (8) e Privacy Policy ("Retention"): retenção durante execução do serviço e obrigações legais | Jurídico / DPO | Avaliação de conformidade DPO |
| **Zero Data Retention (ZDR)** | `PROVIDER_DOCUMENTED` | `docs.typesafe.ai/legal.md` e `models.md` listam ZDR como opção enterprise sob contratação | Jurídico / Comercial | Aditivo ZDR enterprise se exigido pelo DPO |
| **Subprocessor Notice Period** | `PROVIDER_DOCUMENTED` | DPA Cláusula 3.2 estipula aviso prévio e prazo de 15 dias para objeção | Segurança / Jurídico | Avaliação de risco de fornecedores |
| **Server / Data Location** | `PROVIDER_DOCUMENTED` | Privacy Policy ("International Visitors"): hospedado nos Estados Unidos (US) | Jurídico / DPO | Avaliação de transferência internacional |
| **SCC / Transferência Internacional** | `PROVIDER_DOCUMENTED` | DPA Cláusula 6 incorpora EU SCCs (Module 2/3) e UK Addendum | Jurídico / DPO | Avaliação de enquadramento LGPD (Art. 33) |
| **DPA Disponibilidade** | `PROVIDER_DOCUMENTED` | `typesafe.ai/legal/data-processing` disponibiliza DPA formal público | Jurídico / Humano | Execução/assinatura formal do DPA se exigido |
| **Aprovação Jurídica / DPO** | `HUMAN / LEGAL APPROVAL REQUIRED` | Decisão de conformidade legal de transferência e tratamento não é automática por IA | Operador Humano / DPO | **MANDATÓRIA** |

**Veredito de Privacidade**:
```
CUSTOMER_TRANSCRIPT_PROVIDER_PROCESSING_GATE = NOT CLEARED
PRIVACY_HUMAN_LEGAL_APPROVAL_REQUIRED = YES
LEGAL_DPO_REVIEW = REQUIRED
```

---

## 6. Model Identity & Model Drift Authority

### 6.1 Fatos Atuais do Código
- `REQUESTED_MODEL_AUTHORITY`: Constante default `DEFAULT_TYPESAFE_MODEL = 'jev-latest'` definida em `typesafe-jev-turn-decision-adapter.ts`.
- `OBSERVED_PROVIDER_MODEL`: Campo `model` retornado no corpo da resposta da TypeSafe e mapeado em `AuxiliaryTurnDecisionOutput.providerModel`.
- `EXPECTED_MODEL_AUTHORITY`: **`UNRESOLVED`**. Nem o snapshot da versão do agente nem a configuração de runtime definem atualmente uma autoridade de modelo esperado para comparação.
- `CURRENT_MODEL_DRIFT_GUARD`: **`NOT IMPLEMENTED`**.

### 6.2 Fatos Documentados do Provedor (TypeSafe)
1. **Existência do alias `jev-latest`**: `PROVIDER_DOCUMENTED` (`docs.typesafe.ai/models.md`).
2. **Resolução do alias**: `PROVIDER_DOCUMENTED` (`jev-latest` aponta para `jev-1.13.0` em 2026-10-02, revalidando evidência histórica do projeto de 2026-09-29).
3. **Comportamento mutável do alias**: `PROVIDER_DOCUMENTED` ("An alias moves when a new release ships, so the answers behind it can change without a change on your side.").
4. **Campo `model` na resposta**: `PROVIDER_DOCUMENTED` ("The response's `model` field reports the versioned ID that answered").
5. **Aceitação de modelo versionado no request**: `PROVIDER_DOCUMENTED` ("Versioned IDs such as `jev-1.13.0` are accepted by the `model` field whether or not they appear in the list.").
6. **Recomendação de pinning pelo provedor**: `PROVIDER_DOCUMENTED` ("If you have tuned confidence thresholds against a specific version, pin that version's ID instead of the alias and move to the new one on your own schedule.").
7. **Garantia de imutabilidade de IDs versionados**: `NOT VERIFIED` (a documentação estabelece que IDs versionados representam versões específicas, mas não oferece garantia criptográfica ou contratual expressa de imutabilidade de pesos).

### 6.3 Avaliação das Opções Arquiteturais de Model Drift

| Opção | Descrição | Classificação | Fragilidade Operacional | Suporte do Provedor | Veredito Arquitetural |
|---|---|---|---|---|---|
| **OPTION_M1** | Strict Equality com versão fixada (ex.: runtime assert `expectedModel === response.providerModel`) | `PROJECT_ARCHITECTURAL_RECOMMENDATION` | Exige atualização de config para novos modelos | Totalmente suportado via payload `model` e request de ID versionado | **RECOMENDADA para Produção**: previne divergência de alias/model-ID detectável na fronteira da aplicação, sujeito a garantias do provedor |
| **OPTION_M2** | Approved-Set (ex.: `['jev-1.13.0', 'jev-1.13.1'].includes(providerModel)`) | `PROJECT_ARCHITECTURAL_RECOMMENDATION` | Moderada: exige gerenciar allowlist | Suportado | Alternativa para transições graduais (canary) |
| **OPTION_M3** | Comparação com o alias solicitado (`providerModel === 'jev-latest'`) | `INADEQUATE` | Nenhuma | N/A | **REJEITADA**: o alias muda de checkpoint sob o capô; falsa proteção |
| **OPTION_M4** | Apenas monitoramento e telemetria | `INSUFFICIENT` | Nenhuma | N/A | Insuficiente para autoridade determinística de produção |

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
MODEL_DRIFT_RUNTIME_GUARD_IMPLEMENTATION = IMPLEMENTED / TESTED LOCALLY (Slice E.1 offline)
EXPECTED_MODEL_AUTHORITY = OPTION_B (TypeSafe adapter integration config: options.expectedProviderModel)
VERSIONED_MODEL_IMMUTABILITY = NOT VERIFIED
MODEL_DRIFT_GUARD_REQUIRED_BEFORE_ACTIVE_GUARDED = YES
```

---

## 7. Production Timeout Strategy & Evidence

### 7.1 Evidência Histórica Observada (Staging Synthetic, N=12)
Em `docs/research/PHASE_6_TYPESAFE_STAGING_LATENCY_RESULT.md`:
- `STAGING_SHADOW_TIMEOUT_MS = 1500` (timeout operacional nominal de staging)
- Amostra sintética observada: $N = 12$
- Conclusão sob 1500ms: **100.0%** (12/12)
- Mediana: **275ms** | p90: **311ms** | p95: **450ms** | Máximo: **450ms**
- Classificação: `PROJECT_HISTORICAL_EVIDENCE`

### 7.2 Critérios para Produção vs. Staging
```
STAGING_TIMEOUT != PRODUCTION_TIMEOUT
```
1. **Orçamento de Latência de Voz**: Em telefonia em tempo real, pausas prolongadas degradam a conversação. Se o Jev consumir um timeout elevado, o fallback generativo posterior soma latência adicional, prejudicando a experiência do usuário.
2. **Heurística de Pausa Humana**: Notações prévias de pausa conversacional de 800-1200ms são classificadas como `UNSOURCED_HEURISTIC / NOT USED AS GATE EVIDENCE`.
3. **Cauda de Rede (*Tail Latency*)**: Amostra de $N=12$ em staging não oferece confiança estatística para p99 ou p99.9 em produção (`TAIL_LATENCY_CONFIDENCE = NOT ESTABLISHED`).
4. **Semântica de Timeout**:
   - `JEV_TIMEOUT` + `generation ativa` -> fallback imediato para o modelo generativo principal (`streamTurn`).
   - `JEV_TIMEOUT` + `generation stale` -> silêncio / supressão total (`streamTurn = 0`).
   - Bypass determinístico ou resposta de segurança são **terminantemente proibidos** em caso de timeout.
   - Retries automáticos: **Zero** (`retries = 0`). Repetir chamadas em tempo real viola o orçamento de latência acústica.

**Status do Timeout de Produção**:
```
PRODUCTION_JEV_TIMEOUT_MS = NOT SELECTED (CANDIDATE_PENDING_VALIDATION)
CANDIDATE_RANGE = 600ms - 800ms (EXPLORATORY_ENGINEERING_CANDIDATE / NOT SELECTED)
REQUIRED_EVIDENCE = Estudo empírico de latência L1B com amostra planejada N >= 100
TAIL_LATENCY_CONFIDENCE = NOT ESTABLISHED
```

---

## 8. Concurrency & Backpressure Strategy

### 8.1 Separação Semântica: Shadow vs. Active Guarded
- `SHADOW_MAX_CONCURRENCY`: Controla requisições assíncronas consultivas que não afetam o caminho crítico de despacho de áudio.
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
PRODUCTION_ACTIVE_GUARDED_MAX_CONCURRENCY = NOT SELECTED
CANARY_CONCURRENCY_2_TO_5 = EXPLORATORY_PROPOSAL / NOT SELECTED
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
  - Para canary e produção com tráfego real: `REQUIRED_BEFORE_PRODUCTION = UNRESOLVED / DESIGN CANDIDATE`.
- **Registro de Desvio e Correção**: A proposição preliminar de limiares numéricos arbitrários ("5 falhas consecutivas -> OPEN por 60s") foi classificada como `DESIGN_EVIDENCE_DEVIATION` sem evidência empírica de tráfego, sendo corrigida:
```
CIRCUIT_BREAKER_IMPLEMENTATION = NOT IMPLEMENTED
CIRCUIT_BREAKER_REQUIRED_FOR_L1 = NO
CIRCUIT_BREAKER_REQUIRED_BEFORE_PRODUCTION = UNRESOLVED / DESIGN CANDIDATE
TRIP_THRESHOLD = NOT SELECTED
OPEN_DURATION = NOT SELECTED
```

---

## 11. Production Composition Boundary & Feature Modes

### 11.1 Fronteira de Injeção
- `PRODUCTION_COMPOSITION_DESIGN = DESIGNED`
- `PRODUCTION_COMPOSITION_IMPLEMENTATION = NO`
- `PRODUCTION_RUNTIME_WIRING = NO`
- A lógica de domínio (`ConversationOrchestrator`) continua recebendo estritamente a porta de domínio `guardedRoutingCoordinator`.
- O composition root de produção será o **único responsável** por instanciar `TypeSafeJevTurnDecisionAdapter` e injetá-lo no `GuardedTurnRoutingCoordinator`.
- **Zero imports de SDKs externos** ou detalhes de HTTP no núcleo do orquestrador.

### 11.2 Semântica dos Modos de Feature
Os três modos conceituais são:

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
Auditoria do código-fonte e runtime atual:
- `CURRENT_KILL_SWITCH_IMPLEMENTATION = NOT IMPLEMENTED`
- `CURRENT_RUNTIME_DYNAMIC_RELOAD = NO`
- `RESTART_OR_REDEPLOY_REQUIRED_FOR_ENV_CHANGE = YES`
- **Design Futuro**:
  - `KILL_SWITCH = DESIGNED / NOT IMPLEMENTED`.
  - O corte de `ACTIVE_GUARDED` para `DISABLED` deve ser realizável sem migration de banco de dados, sem alteração de Frozen Policy e sem corrupção do estado de sessões de chamada ativas (chamadas ativas continuarão no modo generativo nominal).
  - A comutação imediata sem reinício de processo exige mecanismo explícito de reload dinâmico que atualmente não está implementado.

---

## 12. Observability & Telemetry Requirements

Todas as métricas geradas devem ser estritamente provider-neutral e sanitizadas:

### 12.1 Métricas Mandatórias
1. `voice.guarded.turn_eligible_total`: Contador de turnos que atenderam ao capability matcher.
2. `voice.guarded.evaluations_total`: Contador de chamadas realizadas ao Jev.
3. `voice.guarded.classification_total`: Contador por classificação (`DETERMINISTIC_CANDIDATE`, `SECURITY_ESCALATE`, `GENERATIVE_REQUIRED`).
4. `voice.guarded.latency_ms`: Histograma de latência do provedor auxiliar.
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

1. **Preço por Avaliação Jev**: `COST_PER_JEV_EVALUATION = NOT VERIFIED` (depende de tier comercial acordado com a TypeSafe; documentação pública lista System One a $42/Btok, cobrado por input token).
2. **Teto Orçamentário Mandatório (*Cost Ceiling*)**:
   - Para validação sintética: teto rígido de requisições e custo total estritamente limitado (ex.: max 20 a 100 chamadas sintéticas, custo < $0.10).
   - Para canary em produção: teto diário monetário ou de volume de requisições após o qual a feature comuta para `DISABLED`.
3. **Política de Retry**: **Zero retries** (`retries = 0`). O custo de retries em tempo real é duplo: financeiro e de latência acústica.

---

## 14. Controlled Live Validation Ladder

A promoção para produção deve seguir rigorosamente a escada de validação incremental:

```
[L0: Offline Fakes]
  │  Status: COMPLETE (PR #61 merged)
  │  Harness: Test fakes em memória, zero rede externa
  ▼
[L1A: Real Jev + Synthetic Functional Smoke]
  │  Status: PLAN DESIGNED / READY FOR REVIEW (docs/research/PHASE_6_TYPESAFE_L1A_MODEL_IDENTITY_SMOKE_PLAN.md)
  │  Harness: Adapter TypeSafe real, prompts sintéticos conhecidos (N=20 frozen em scripts/benchmarks/voice/jev-l1a-model-identity-smoke-v1-cases.json), transporte fake
  │  Objetivo: Verificar request com modelo versionado, resposta com providerModel, semântica fail-open do guard
  │  Requisitos: Model Pinning implementado offline (Slice E.1), teto de custo, ZERO dados de clientes
  ▼
[L1B: Real Jev + Synthetic Latency Study]
  │  Status: PLANNED
  │  Harness: Bateria sintética de latência (N>=100 PLANNED_SAMPLE_SIZE), transporte fake
  │  Objetivo: Coletar distribuição empírica de latência para subsidiar seleção de timeout de produção
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
     Requisitos: Privacy Gate CLEARED, DPA assinado, Parecer DPO, Timeout/Concurrency de produção congelados,
                 Kill Switch operacional, autorização formal humana/jurídica
```

---

## 15. Twilio Account Decision

- `TWILIO_ACCOUNT_REQUIRED_FOR_CURRENT_SLICE`: **`NO`** (Slice puramente offline).
- `TWILIO_ACCOUNT_REQUIRED_FOR_L1`: **`NO`** (Testes sintéticos de Jev não utilizam telefonia).
- `TWILIO_ACCOUNT_REQUIRED_FOR_L2`: **`NO`** (Testes de integração OpenAI + Jev não utilizam telefonia).
- `TWILIO_ACCOUNT_REQUIRED_FOR_L3`: **`YES`** (Exige conta Twilio provisionada, número telefônico alocado e SIP/WebSocket configurados para chamadas de teste).

**Diretiva**: Não solicitar criação de conta Twilio ao operador humano neste momento.

---

## 16. ACTIVE_GUARDED Go/No-Go Matrix

| Gate / Critério | Estado Atual | Evidência Disponível | Ação Necessária | Responsável | Exigido para L1A? | Exigido para L3? | Exigido para ACTIVE_GUARDED Produção? |
|---|---|---|---|---|---|---|---|
| **1. Coordenação Offline** | `READY` | PR #61 merged; 18 testes em `guarded-turn-routing.test.ts`; 738 passed globalmente | Nenhuma | Engenharia | SIM | SIM | SIM |
| **2. Privacy / DPA** | `BLOCKED` | Pesquisa de fontes oficiais TypeSafe concluída; `CUSTOMER_TRANSCRIPT_GATE = NOT CLEARED` | Assinatura formal DPA + base LGPD / parecer DPO | Jurídico / DPO | NÃO (usa sintético) | NÃO (usa sintético) | **SIM (MANDATÓRIO)** |
| **3. Model Pinning (Drift)** | `IMPLEMENTED / TESTED LOCALLY` | TypeSafeJevTurnDecisionAdapter, TypeSafeModelIdentityMismatchError, 23 testes em `typesafe-jev-turn-decision-adapter.test.ts`, fail-open em `guarded-turn-routing.test.ts` | Nenhuma para offline | Engenharia | **SIM** | SIM | SIM |
| **4. Timeout de Produção** | `NOT SELECTED` | Mediana 275ms em staging (N=12); 600-800ms é candidato exploratório | Estudo empírico de latência L1B | Engenharia | NÃO (usa default) | SIM | SIM |
| **5. Concorrência de Produção** | `NOT SELECTED` | Backpressure fail-open desenhado; canary 2-5 é proposta exploratória | Definir teto formal de canary/produção | Engenharia | NÃO (seq=1) | SIM | SIM |
| **6. Circuit Breaker** | `NOT SELECTED` | Análise YAGNI concluída; limiares preliminares removidos | Definir se necessário com dados empíricos | Engenharia | NÃO | NÃO | UNRESOLVED |
| **7. Production Composition** | `DESIGNED` | Seam de injeção mapeado; `PRODUCTION_RUNTIME_WIRING = NO` | Implementar no composition root de produção | Engenharia | NÃO | NÃO | SIM |
| **8. Kill Switch** | `DESIGNED` | Sem reload dinâmico em runtime; `CURRENT_KILL_SWITCH = NOT IMPLEMENTED` | Implementar mecanismo de corte dinâmico | Engenharia | NÃO | SIM | SIM |
| **9. Observabilidade** | `DESIGNED` | Mapeamento de métricas provider-neutral concluído | Instrumentar métricas no adapter/coordenador | Infra / Eng | NÃO | SIM | SIM |
| **10. Conta Twilio** | `BLOCKED` | ConversationRelay adapter existe offline | Provisionar credenciais e número de teste | Operador Humano | NÃO | **SIM** | SIM |
| **11. Aprovação Humana Formal** | `PENDING` | N/A | Sign-off de segurança, produto e jurídico | Operador Humano | NÃO | NÃO | **SIM (MANDATÓRIO)** |

**Veredito Global**:
- `READY_FOR_L1A_SYNTHETIC_FUNCTIONAL_SMOKE`: `READY_FOR_HUMAN_REVIEW` (Model Identity Guard implementado offline; plano L1A e dataset sintético N=20 congelados).
- `READY_FOR_L1B_LATENCY_STUDY`: `NO` (Pendente execução/aprovação de L1A e desenho formal da bateria de latência).
- `READY_FOR_L3_REAL_TWILIO`: `NO` (Pendente L1, L2 e provisionamento de conta Twilio).
- `PRODUCTION_READY (ACTIVE_GUARDED)`: `NO / BLOCKED`.

---

## 17. Remaining Blockers Before Production Activation

1. `CUSTOMER_TRANSCRIPT_PROVIDER_PROCESSING_GATE = NOT CLEARED`
2. `MODEL_DRIFT_RUNTIME_GUARD = IMPLEMENTED / TESTED LOCALLY (offline)`
3. `EXPECTED_MODEL_AUTHORITY = OPTION_B (resolvido no adapter options)`
4. `PRODUCTION_JEV_TIMEOUT_MS = NOT SELECTED`
5. `PRODUCTION_ACTIVE_GUARDED_MAX_CONCURRENCY = NOT SELECTED`
6. `PRODUCTION_COMPOSITION_IMPLEMENTATION = NO`
7. `PRODUCTION_RUNTIME_WIRING = NO`
8. `LIVE_PROVIDER_GUARDED_ROUTING_VALIDATION = NOT EXECUTED`
9. `LIVE_TWILIO_GUARDED_ROUTING = NOT EXECUTED`
10. `CURRENT_KILL_SWITCH_IMPLEMENTATION = NOT IMPLEMENTED`
11. `ACTIVE_GUARDED = BLOCKED`

---

## 18. Next Minimal Slice Recommendation

Com a conclusão do Slice E.1 (Model Identity Guard implementado offline + Plano/Dataset L1A desenhados):

```
NEXT_ALLOWED_STEP: L1A Controlled Live TypeSafe Model Identity Smoke (após revisão e autorização formal)
```
- **Escopo**:
  1. Execução controlada e pontual contra o endpoint da TypeSafe usando exclusivamente o dataset sintético de 20 casos (`scripts/benchmarks/voice/jev-l1a-model-identity-smoke-v1-cases.json`);
  2. Validação factual em tráfego real de que `response.model` corresponde ao ID versionado solicitado;
  3. Verificação de que o guard aceita o response quando há correspondência e rejeita quando há divergência;
  4. Manter estritamente: zero dados de clientes, zero chamadas à OpenAI/Twilio, sem ativação de `ACTIVE_GUARDED`.

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
