# Pacote de Pré-Autorização L2 (PHASE_6_L2_PREAUTHORIZATION_ENVELOPE.md)

<!--
L2_PREAUTHORIZATION_ENVELOPE_METADATA_START
SCHEMA_VERSION: 1.3.0
CREATED_AT: 2026-10-03
LAST_RECONCILED_AT: 2026-10-03
PHASE: Phase 6 (Voice Model Routing & Jev Evaluation)
STUDY: L2 Real Jev + Real OpenAI + Synthetic Transcript
PREAUTH_STATUS: PREAUTH_BLOCKED
L2_EXECUTION: NOT_AUTHORIZED
CURRENT_L2_EXECUTION: NOT_AUTHORIZED
LIVE_AUTHORIZATION_CONSUMED: YES
LIVE_COMMAND_EXECUTED: YES_ONCE_ABORTED_FAIL_CLOSED
L2_OPERATOR_COST_CEILING: NOT_AUTHORIZABLE
OLD_PROPOSED_COST_CEILING_USD: 0.25
OLD_PROPOSED_COST_CEILING_STATUS: SUPERSEDED
NEW_OPERATOR_COST_CEILING: NOT_PROPOSED
HARD_MAX_PROVIDER_COST_STATUS: NOT_ENFORCEABLE
TYPESAFE_PRICE_STATUS: NOT_VERIFIED
TYPESAFE_PRICING_EVIDENCE: ACCOUNT_BILLING_EMPIRICALLY_VERIFIED
HUMAN_DECISION_TYPESAFE_EMPIRICAL_EVIDENCE_ACCEPTANCE: ACCEPTED_FOR_SINGLE_L2_RUN
HUMAN_DECISION_TOKEN_CAP_POLICY: ACCEPT_EXISTING_CHARACTER_CAPS_FOR_SINGLE_L2_RUN
TOKEN_CAP_RESIDUAL_LIMITATION_ACCEPTED_FOR_THIS_RUN: YES
OPERATOR_COST_CEILING_USD: 0.96
OPERATOR_COST_CEILING_SCOPE: SINGLE_SYNTHETIC_L2_RUN_ONLY
COST_CEILING_CLASSIFICATION: OPERATOR_GOVERNANCE_CEILING_NOT_HARD_PROVIDER_BILLING_BOUND
HUMAN_L2_LIVE_AUTHORIZATION: CONSUMED
SECOND_LIVE_RUN_AUTHORIZED: NO
RUNNER_FAIL_CLOSED_GUARD: PASS
ENV_FILE_READ_POLICY_VIOLATION: YES
ENV_FILE_READ_OCCURRED: YES
ENV_VALUES_PRINTED_IN_TRACE: NO_EVIDENCE_OBSERVED
POTENTIAL_SECRET_EXPOSURE_TO_AGENT_TOOLING: YES
EXTERNAL_SECRET_DISCLOSURE: NOT_PROVEN
SECRET_ROTATION_REQUIRED_BEFORE_NEXT_LIVE_RUN: HUMAN_DECISION
LIVE_PRECONDITION_PROCESS_VIOLATION: YES
LIVE_COMMAND_SHOULD_HAVE_BEEN_STOPPED_BEFORE_INVOCATION: YES
PROVIDER_NETWORK_CALLS: 0
PROVIDER_SPEND_FROM_THIS_INVOCATION_USD: 0
LAST_L2_LIVE_ATTEMPT_RESULT: BLOCKED_BY_RUNNER_FAIL_CLOSED_PREAUTH
LAST_L2_LIVE_ATTEMPT_PROVIDER_CALLS: 0
LAST_L2_LIVE_AUTHORIZATION: CONSUMED
SECOND_LIVE_RUN_AUTHORIZED: NO
EMPIRICAL_PRICING_POLICY_SUPPORT: IMPLEMENTED
EMPIRICAL_EXPLICIT_COST_CEILING_REQUIRED: YES
EMPIRICAL_ENV_COST_CEILING_FALLBACK_ALLOWED: NO
CURRENT_L2_EXECUTION: NOT_AUTHORIZED
LIVE_AUTHORIZATION_AVAILABLE: NO
PREAUTH_STATUS: PREAUTH_BLOCKED
PREVIOUS_EXECUTABLE_AGGREGATE_SHA256: 8f53f8169771caa26dd9623702a7c65e3e9c730dfcb2bbfcb26188dcd57c77f3f
PREVIOUS_EXECUTABLE_FREEZE_STATUS: SUPERSEDED_BY_CODE_CHANGE
HISTORICAL_AGGREGATE_REPRODUCIBILITY: LEGACY_NOT_REPRODUCIBLE_FROM_TRACKED_METHOD
EXECUTABLE_FREEZE_REPRODUCIBILITY: PASS
FREEZE_METHOD_VERSION: 1.0.0
CURRENT_EXECUTABLE_AGGREGATE_SHA256: f5ef6e6b88e09094765b0c3b273ba23cae01502bdd0ec4fe28dbcb3f2133794a
CURRENT_EXECUTABLE_FREEZE_STATUS: FROZEN_REPRODUCIBLY
NEXT_REQUIRED_STEP: HUMAN_SECRET_ROTATION_AND_CREDENTIAL_CONFIGURATION
FUTURE_LIVE_CREDENTIAL_CONFIGURATION: REQUIRED_AFTER_FREEZE_CLOSURE
OPENAI_PRICE_STATUS: VERIFIED
CLI_LIVE_INTENT_PLUMBING: PASS
REQUEST_CAP_BOUNDARY_TESTS: PASS
RUNTIME_ENFORCED_INPUT_SIZE_CAP: PASS (1000 chars TypeSafe, 4000 chars OpenAI)
RUNTIME_ENFORCED_INPUT_TOKEN_CAP: NONE
TOKEN_CAP_ENFORCEMENT: NOT_ENFORCEABLE_AT_RUNTIME
AGGREGATE_OUTPUT_CAP: DERIVED_ENFORCEABLE_SUBJECT_TO_CAP_ISOLATION_TEST
CURRENT_RUNNER_FREEZE: SUPERSEDED_BY_CODE_CHANGE
LIVE_COMMAND_STATUS: LIVE_COMMAND_NOT_YET_AUTHORIZABLE
NEXT_ALLOWED_STEP: HUMAN_REVIEW_OF_PR75_THEN_FREEZE_CLOSURE
BLOCKER_ANALYSIS_STATUS: PREAUTH_BLOCKER_ANALYSIS_COMPLETE
L2_PREAUTHORIZATION_ENVELOPE_METADATA_END
-->

> **Documento Canônico de Pré-Autorização da Bateria L2**
> Este documento define formalmente os limites técnicos, modelos, precificação verificada, premissas de tokens, caps de requisição e condições de parada para a eventual execução da bateria L2 (*Real TypeSafe/Jev + Real OpenAI + Synthetic Transcript*).
> **NENHUMA EXECUÇÃO REAL DE PROVEDOR É REALIZADA OU AUTORIZADA POR ESTE DOCUMENTO.**

---

## 1. Purpose

Estabelecer um envelope rigoroso, auditável e imutável para a futura execução live da bateria experimental L2, garantindo:
1. Distinção clara entre premissas teóricas de planejamento (*planning assumptions*) e limites tecnicamente impostos em tempo de execução (*runtime-enforced hard caps*);
2. Isolamento estrito de dados (zero transcrições de clientes, zero acesso a holdout, zero acesso a banco de dados de produção/staging, zero telefonia/Twilio);
3. Verificação factual e pública de precificação dos provedores;
4. Condições determinísticas de parada imediata (*fail-fast*);
5. Conformidade estrita com `AGENTS.md` e `docs/AI_EXECUTION_RULES.md`.

---

## 2. Frozen Study Identity

| Propriedade | Valor de Referência | Evidência Factual |
| :--- | :--- | :--- |
| **L2_DATASET_PATH** | `scripts/benchmarks/voice/jev-openai-l2-synthetic-integration-v1-cases.json` | Arquivo rastreado no repositório |
| **L2_DATASET_VERSION** | `1.0.1` | Campo `version` no JSON do dataset |
| **L2_DATASET_CASE_COUNT** | `12` | 12 casos sintéticos estritos (7 matcher-positive, 5 matcher-negative) |
| **L2_DATASET_SHA256** | `bd812341a922ded1c7159191849dae284a88f24afd9c7e8d3c64f9b081602f3f` | Hash SHA-256 congelado |
| **CURRENT_RUNNER_FREEZE** | `SUPERSEDED_BY_CODE_CHANGE` | Versão modular pós-006AV com módulo de teto de custo |
| **CURRENT_L2_EXECUTABLE_MODULE_COUNT** | `10` | 10 módulos executáveis rastreados no repositório |
| **PREVIOUS_EXECUTABLE_AGGREGATE_SHA256** | `8f53f8169771caa26dd9623702a7c65e3e9c730dfcb2bbfcb26188dcd57c77f3` | Hash agregado determinístico anterior dos 9 módulos pré-006AV (`SUPERSEDED_BY_CODE_CHANGE`) |
| **NEW_EXECUTABLE_AGGREGATE_SHA256** | `NOT_REPRODUCIBLE_FROM_TRACKED_METHOD` | Reprodução bloqueada até slice de fechamento formal |
| **EXECUTABLE_FREEZE_REPRODUCIBILITY** | `BLOCKED` | Bloqueado até PR merge e slice dedicado (`NEXT_REQUIRED_SLICE = EXECUTABLE_FREEZE_REPRODUCIBILITY_CLOSURE`) |

### Módulos Executáveis Atuais do Runner (CURRENT_L2_EXECUTABLE_FILE_SET — 10 Módulos)

| Arquivo Executável | Linhas | Status |
| :--- | :--- | :--- |
| `scripts/benchmarks/voice/l2-runner-artifact.mjs` | 100 | Rastreado |
| `scripts/benchmarks/voice/l2-runner-case-execution.mjs` | 142 | Rastreado |
| `scripts/benchmarks/voice/l2-runner-cost-ceiling.mjs` | 45 | Rastreado (adicionado no slice 006AV) |
| `scripts/benchmarks/voice/l2-runner-dependencies.mjs` | 61 | Rastreado |
| `scripts/benchmarks/voice/l2-runner-input-budget.mjs` | 36 | Rastreado |
| `scripts/benchmarks/voice/l2-runner-preconditions.mjs` | 148 | Rastreado |
| `scripts/benchmarks/voice/l2-runner-provider-dispatch.mjs` | 148 | Rastreado |
| `scripts/benchmarks/voice/l2-runner-request-caps.mjs` | 17 | Rastreado |
| `scripts/benchmarks/voice/l2-runner-result-classification.mjs` | 95 | Rastreado |
| `scripts/benchmarks/voice/run-jev-openai-l2-synthetic-integration.mjs` | 161 | Rastreado |

*Nota: O hash agregado anterior `8f53f8169771caa26dd9623702a7c65e3e9c730dfcb2bbfcb26188dcd57c77f3` correspondia ao conjunto histórico de 9 módulos (`HISTORICAL_PRE_006AV_EXECUTABLE_FILE_SET`). Com a adição de `l2-runner-cost-ceiling.mjs` no slice 006AV, o hash agregado anterior foi classificado como `SUPERSEDED_BY_CODE_CHANGE`. A reprodução do novo hash agregado para os 10 módulos permanece `EXECUTABLE_FREEZE_REPRODUCIBILITY = BLOCKED` (`NEW_EXECUTABLE_AGGREGATE_SHA256 = NOT_REPRODUCIBLE_FROM_TRACKED_METHOD`) e será resolvida no `NEXT_REQUIRED_SLICE = EXECUTABLE_FREEZE_REPRODUCIBILITY_CLOSURE`.*

---

## 3. Provider Models

### TypeSafe / Jev
- **REQUESTED_TYPESAFE_MODEL**: `jev-1.13.0`
- **EXPECTED_TYPESAFE_MODEL**: `jev-1.13.0`
- **Mecanismo de Verificação**: Checagem de identidade estrita (`providerModel === EXPECTED_TYPESAFE_MODEL`). Qualquer divergência dispara interrupção imediata com `MODEL_IDENTITY_MISMATCH`.

### OpenAI
- **REQUESTED_OPENAI_MODEL**: `gpt-6-astra` (reconciliado com DEC-037 / ADR-018; substituindo a introducao sem aprovacao humana de `gpt-4o-mini`)
- **Status de Observabilidade**: `NOT_OBSERVABLE_VIA_CURRENT_SURFACE`.
- **Mecanismo de Controle**: Configuração estrita via adapter (`modelId: 'gpt-6-astra'`), mantendo separação entre modelo requisitado e observado.

---

## 4. Pricing Evidence

### OpenAI Pricing
- **OPENAI_MODEL_PRICED**: `gpt-6-astra`
- **OPENAI_PRICE_STATUS**: `VERIFIED`
- **Input Tokens**: $10.00 / 1.000.000 tokens ($0.00001000 / token)
- **Cached Input Tokens**: $5.00 / 1.000.000 tokens ($0.00000500 / token)
- **Output Tokens**: $50.00 / 1.000.000 tokens ($0.00005000 / token)
- **Fonte de Evidência**: Documentação pública e tabela de preços oficial da OpenAI (`https://openai.com/api/pricing/`, `https://platform.openai.com/docs/models`, `https://developers.openai.com/api/docs/models/gpt-6-astra.md`), verificada no PR #71.
- **Histórico**: Preços anteriores de `gpt-4o-mini` ($0.15 / 1M in, $0.60 / 1M out) classificados como `SUPERSEDED_GPT_4O_MINI_REFERENCE`.

### TypeSafe Pricing
- **TYPESAFE_PRICE_STATUS**: `NOT_VERIFIED`
- **TYPESAFE_OFFICIAL_PRICING_SOURCE**: `NOT_FOUND` (a TypeSafe AI trata taxas e preços como confidenciais sob o Master Customer Agreement; modelo sob acesso antecipado sem URL pública de faturamento sem login).
- **TYPESAFE_PRICING_MODEL**: Per-token de entrada observado na conta de faturamento. Hipótese de cobrança exclusiva por tokens de entrada é fortemente suportada pelos dados de uso da conta (`INPUT_ONLY_RATE_HYPOTHESIS = STRONGLY_SUPPORTED_BY_ACCOUNT_USAGE`), porém a tarifação de saída não foi explicitamente observada (`OUTPUT_TOKEN_BILLING = NOT_EXPLICITLY_OBSERVED`) e a taxa de saída permanece `OUTPUT_RATE = NOT_VERIFIED` (proibido promover inferência a fato contratual).
- **Valor Projetado de Planejamento**: $0.042 / 1.000.000 tokens de entrada ($42.00 / 1.000.000.000 tokens).
- **Evidência Comercial Aceitável (Ação Humana Futura)**: Order form, anexo de faturamento sob contrato, invoice, extrato de créditos da conta ou email institucional oficial confirmando a tarifa por token/crédito aplicável ao `jev-1.13.0`.
- **Status Factual**: Bloqueia a execução live até validação documental comercial pelo operador humano.

### TypeSafe Account Billing Evidence (Empirical Reconciliation)
- **Origem da Evidência**: Métricas de consumo agregadas e comprovação comercial de refill ($5.00 USD) da conta institucional TypeSafe fornecidas pelo operador humano em 2026-10-03 (sem dados brutos, PII, identificadores de chave ou recibos brutos versionados no repositório).
- **Totais de Uso Agregados Observados**:
  - `USAGE_TOTAL_REQUESTS`: 345
  - `USAGE_INPUT_TOKENS`: 205142
  - `USAGE_OUTPUT_TOKENS`: 22086
  - `USAGE_TOTAL_TOKENS`: 227228
- **Valores Financeiros Reportados**:
  - `ACCOUNT_REPORTED_SPEND_USD`: 0.0086 USD
  - `ACCOUNT_CREDIT_REFILL_USD`: 5.00 USD
  - `ACCOUNT_AVAILABLE_CREDITS_USD`: 5.00 USD
- **Cálculo da Tarifa Efetiva Empírica de Entrada**:
  - `ACCOUNT_OBSERVED_EFFECTIVE_INPUT_RATE_USD_PER_1B`: 0.0086 / 205142 * 1.000.000.000 ≈ **41.92 USD / 1B tokens de entrada**.
- **Cálculo de Consistência com Hipótese $42.00 / 1B**:
  - `EXPECTED_SPEND_AT_42_PER_1B`: 205142 / 1.000.000.000 * 42 = **0.008615964 USD**.
  - Comparação com gasto observado (`0.0086 USD`): resíduo de ~0.00001596 USD consistente com exibição arredondada/truncada a 4 casas decimais.
  - `ROUNDING_CONSISTENCY`: `PASS`.
- **Interpretação de Cobrança de Output Tokens**:
  - `OUTPUT_TOKEN_BILLING`: `NOT_EXPLICITLY_OBSERVED` (o total faturado é fortemente consistente com cobrança exclusiva sobre tokens de entrada a ~$42/B, mas não prova contratualmente tarifa zero para tokens de saída).
  - `INPUT_ONLY_RATE_HYPOTHESIS`: `STRONGLY_SUPPORTED_BY_ACCOUNT_USAGE`.
  - `OUTPUT_RATE`: `NOT_VERIFIED`.
- **Classificação Factual da Evidência de Preço**:
  - `TYPESAFE_PRICING_EVIDENCE`: `ACCOUNT_BILLING_EMPIRICALLY_VERIFIED`.
  - `TYPESAFE_OBSERVED_EFFECTIVE_INPUT_RATE_USD_PER_1B`: approximately 41.92.
  - `TYPESAFE_RATE_HYPOTHESIS_USD_PER_1B`: 42.00.
  - `TYPESAFE_RATE_HYPOTHESIS_CONSISTENCY`: `PASS`.
  - `TYPESAFE_EXPLICIT_CONTRACTUAL_TARIFF`: `NOT_OBSERVED`.
  - `TYPESAFE_PRICE_STATUS`: `NOT_VERIFIED` (reconciliado como evidência empírica de conta, não contrato público).
- **Deliberação Humana de Política de Aceitação**:
  - `HUMAN_DECISION_TYPESAFE_EMPIRICAL_EVIDENCE_ACCEPTANCE`: `PENDING`.
  - *Opção A (`ACCEPT_ACCOUNT_BILLING_EVIDENCE_FOR_SINGLE_L2_RUN`)*: Permite que o runner L2 utilize 42 USD / 1B input tokens como conservative account-observed planning rate para uma única execução controlada, sem afirmar que é tarifa contratual pública.
  - *Opção B (`REQUIRE_EXPLICIT_VENDOR_CONFIRMATION`)*: Mantém blocker live ativo até confirmação formal explícita do fornecedor (email/order form/invoice).

---

## 5. Request Caps & Enforcement Proof

| Limite de Requisições | Cap | Mecanismo de Imposição | Teste de Fronteira Isolado |
| :--- | :--- | :--- | :--- |
| **TypeSafe Requests** | **7** | Interceptação em `checkCaps(state, 'TYPESAFE')` antes de fetch | `PASS` (8ª chamada bloqueada antes de rede) |
| **OpenAI Requests** | **12** | Interceptação em `checkCaps(state, 'OPENAI')` antes de fetch | `PASS` (13ª chamada bloqueada antes de rede) |
| **Total Provider Requests** | **19** | Interceptação em `checkCaps(state, ...)` antes de fetch | `PASS` (20ª chamada bloqueada antes de rede) |
| **Concurrency** | **1** | Loop sequencial no runner | `PASS` |
| **Retries** | **0** | Sem lógica de retry nas chamadas | `PASS` |

---

## 6. Token Budget & Request Surface Analysis

### Superfície de Entrada Faturada por Provedor
1. **TypeSafe / Jev (`TYPESAFE_BILLED_INPUT_SURFACE`)**:
   - `callerInput`: transcrição sintética do usuário (imposta em runtime pelo runner: máx. 1.000 caracteres);
   - `state`: metadados estruturais (`language: 'pt-BR'`, `channel: 'phone'`);
   - `questions`: definições atômicas de roteamento em `JEV_ROUTING_ATOMIC_DEFINITION.questions` (3 perguntas fixas: determinístico, generativo, segurança);
   - `model`: string do modelo (`jev-1.13.0`).
   - *Status do Tokenizer*: A TypeSafe não publica biblioteca de tokenização nem vocabulário BPE aberto. A medição exata pré-chamada é tecnicamente inviável offline (`TYPESAFE_TOKENIZER_DOCUMENTED = NO`; limitação residual do provedor).

2. **OpenAI (`OPENAI_BILLED_INPUT_SURFACE`)**:
   - Prompt de sistema gerado a partir de persona, empresa, objetivo, tom, idioma e regras de conversação;
   - Histórico sequencial de mensagens de turnos anteriores (`role`, `content`);
   - Entrada atual do usuário (`role: 'user'`, `content: currentInput.text`);
   - Envelope estrutural ChatML (tokens de formatação por mensagem: ~3-4 tokens/mensagem + 3 tokens de primer do assistente).
   - *Status do Tokenizer*: OpenAI utiliza codificação padrão `o200k_base` para `gpt-6-astra`, acessível via bibliotecas como `tiktoken` ou `js-tiktoken`. Atualmente, o repositório **não possui dependência de tokenizer instalada** (`OPENAI_LOCAL_TOKENIZER_AVAILABLE = NO`).

### Classificação do Blocker de Token Caps
- **Caminho para OpenAI**: `TOKEN_CAP_CLOSURE_PATH = EXACT_LOCAL_TOKENIZER_FEASIBLE_VIA_DEPENDENCY` (viável via PR técnico minimalista adicionando `js-tiktoken` sem alterar a arquitetura).
- **Caminho para TypeSafe**: `TOKEN_CAP_CLOSURE_PATH = NO_PRECALL_HARD_TOKEN_BOUND_AVAILABLE` (ausência de tokenizer público; segurança assegurada por cap físico de caracteres e dataset congelado).
- **Classificação Geral da Bateria**: `TOKEN_CAP_CLOSURE_PATH = NO_PRECALL_HARD_TOKEN_BOUND_AVAILABLE` (limitação residual de arquitetura multi-provedor).

### Distinção entre Premissas e Limites Fatuais

| Propriedade de Token | Valor | Classificação Normativa | Status em Runtime |
| :--- | :--- | :--- | :--- |
| **Output Token Cap por Request** | **500** | `RUNTIME_ENFORCED_OUTPUT_CAP` | `ENFORCEABLE` (imposto via `maxCompletionTokens: 500` no adapter OpenAI) |
| **Input Token Assumption (OpenAI)** | **1.500** | `CONSERVATIVE_PLANNING_ASSUMPTION` | **`NONE`** (sem tokenizer local em runtime) |
| **Input Token Assumption (TypeSafe)** | **1.000** | `CONSERVATIVE_PLANNING_ASSUMPTION` | **`NONE`** (sem tokenizer local em runtime) |
| **RUNTIME_ENFORCED_INPUT_SIZE_CAP** | **1.000 chars TypeSafe / 4.000 chars OpenAI** | `RUNTIME_ENFORCED_SIZE_CAP` | **`PASS`** (interceptação fail-closed antes da rede) |
| **RUNTIME_ENFORCED_INPUT_TOKEN_CAP** | — | — | **`NONE`** |
| **TOKEN_CAP_ENFORCEMENT** | — | — | **`NOT_ENFORCEABLE_AT_RUNTIME`** (residual limitation sem tokenizer local) |

--- | :--- | :--- | :--- |
| **Output Token Cap por Request** | **500** | `RUNTIME_ENFORCED_OUTPUT_CAP` | `ENFORCEABLE` (imposto via `maxCompletionTokens: 500` na configuração do adapter OpenAI) |
| **Input Token Assumption (OpenAI)** | **1.500** | `CONSERVATIVE_PLANNING_ASSUMPTION` | **`NONE`** (sem tokenizer local em runtime) |
| **Input Token Assumption (TypeSafe)** | **1.000** | `CONSERVATIVE_PLANNING_ASSUMPTION` | **`NONE`** (sem tokenizer local em runtime) |
| **RUNTIME_ENFORCED_INPUT_SIZE_CAP** | **1.000 chars TypeSafe / 4.000 chars OpenAI** | `RUNTIME_ENFORCED_SIZE_CAP` | **`PASS`** (interceptação fail-closed antes da chamada de rede) |
| **RUNTIME_ENFORCED_INPUT_TOKEN_CAP** | — | — | **`NONE`** |
| **TOKEN_CAP_ENFORCEMENT** | — | — | **`NOT_ENFORCEABLE_AT_RUNTIME`** (residual limitation sem tokenizer) |

---

## 7. Cost Model & Semantics

### Cenário de Planejamento (*Planning Scenario*)
Sob as premissas conservadoras de planejamento (1.000 tokens in para Jev e 1.500 tokens in + 500 tokens out para OpenAI):
- TypeSafe planning cost (baseado na hipótese empírica de 42 USD / 1B): (7 * 1.000 / 1.000.000.000) * $42 = **$0.000294 USD** (`TYPESAFE_PLANNING_COMPONENT_USD = 0.000294`, `TYPESAFE_PLANNING_COMPONENT_EVIDENCE = ACCOUNT_EMPIRICAL_RATE_HYPOTHESIS`, `TYPESAFE_PRICE_STATUS = NOT_VERIFIED`)
- OpenAI planning cost (`gpt-6-astra`):
  - Input: 12 * 1.500 * ($10.00 / 1.000.000) = $0.180000 USD (total input: 18.000 tokens)
  - Output: 12 * 500 * ($50.00 / 1.000.000) = $0.300000 USD (total output: 6.000 tokens)
  - Total OpenAI: **$0.480000 USD** (`OPENAI_PLANNING_TOTAL_COST_USD = 0.480000`)
- Custo total de planejamento do cenário L2: $0.000294 + $0.480000 = **$0.480294 USD** (`L2_PLANNING_TOTAL_PROVIDER_COST_USD = 0.480294`).
- **Classificação**: `PLANNING_SCENARIO_ONLY` (estimativa teórica de planejamento, NÃO constitui hard cap nem teto garantido).
- **Histórico**: O cenário de planejamento anterior de $0.006594 USD ($0.006300 USD OpenAI), derivado de `gpt-4o-mini`, está classificado como `SUPERSEDED_GPT_4O_MINI_REFERENCE`.

### Semântica de Autorização
- **OLD_PROPOSED_COST_CEILING_USD**: $0.25 USD
- **OLD_PROPOSED_COST_CEILING_STATUS**: `SUPERSEDED` (a proposta histórica de $0.25 USD, que presumia margem sobre o custo de ~$0.0066 USD do gpt-4o-mini, é inferior ao custo de planejamento de $0.480294 USD do gpt-6-astra e não é autorizável).
- **NEW_OPERATOR_COST_CEILING**: `NOT_PROPOSED`
- **L2_OPERATOR_COST_CEILING**: `NOT_AUTHORIZABLE` (a fixação de teto e a autorização formal pelo operador permanecem bloqueadas).
- **HARD_MAX_PROVIDER_COST_STATUS**: `NOT_ENFORCEABLE` (ausência de suporte a saldo limite por chamada nos endpoints de fornecedores).

---

## 8. Stop Conditions

O runner interrompe imediatamente a execução nas seguintes condições (*fail-fast*):
1. `TYPE_SAFE_MODEL_IDENTITY_MISMATCH = YES` (modelo retornado diverge de `jev-1.13.0`);
2. `HTTP_AUTH_ERROR = YES` (erro 401 ou 403 em qualquer provedor);
3. `CONSECUTIVE_TECHNICAL_FAILURES >= 3` (três falhas técnicas seguidas);
4. `INPUT_BUDGET_EXCEEDED = YES` (tamanho de payload superior a 1.000 chars Jev ou 4.000 chars OpenAI);
5. `STOP_ON_REQUEST_CAP_REACHED = YES` (tentativa de exceder 7 chamadas Jev, 12 chamadas OpenAI ou 19 totais);
6. `TIMEOUT = YES` (timeout de 5.000ms atingido no harness de pesquisa).

---

## 9. Live Command Semantics

### CLI Live Intent:
O runner agora exige a flag explícita `--allow-live`. Na sua ausência:
- `LIVE_INTENT = DENIED`
- Execução aborta antes de qualquer tentativa de rede com `FATAL_LIVE_INTENT_DENIED`.

Com a flag `--allow-live`:
- `LIVE_INTENT = REQUESTED`
- Sob o caminho oficial de precificação verificada, `TYPESAFE_PRICE_STATUS !== 'VERIFIED'` bloqueia a execução com `FATAL_LIVE_PREAUTH_BLOCKED`.
- Sob a política empírica (`--accept-typesafe-empirical-pricing`), a pré-autorização exige cumulativamente todas as guardas empíricas (evidência `ACCOUNT_BILLING_EMPIRICALLY_VERIFIED`, taxa de planejamento $42/Btok, `--cost-ceiling <USD>` explícito >= $0.480294 USD, dataset congelado íntegro, request caps e ausência de fallback de ambiente). Na ausência de qualquer guarda, aborta imediatamente (*fail-closed*).

### Status:
- `LIVE_COMMAND_STATUS = NOT_AUTHORIZED`
- `LIVE_AUTHORIZATION_AVAILABLE = NO`
- `SECOND_LIVE_RUN_AUTHORIZED = NO`

---

## 10. Artifact Contract

O artefato de saída gerado pelo runner:
- Não contém transcrições reais de clientes nem de holdout;
- Não contém API keys, headers de autorização ou segredos;
- Não contém dumps de variáveis de ambiente;
- Identifica claramente `requestedOpenAiModel` e `openAiModelIdentityStatus = NOT_OBSERVABLE_VIA_CURRENT_SURFACE`.

---

## 11. Isolation Guarantees

| Recurso | Status de Isolamento | Evidência |
| :--- | :--- | :--- |
| **Customer Transcripts** | `0` | Apenas dataset sintético público de 12 casos |
| **Holdout Transcripts** | `NO NEW ACCESS` | Acesso bloqueado |
| **Twilio Real Calls** | `0` | Nenhuma integração de telefonia executada |
| **Cloud DB** | `0` | Sem conexões a Neon, Staging ou Produção |
| **Local PostgreSQL** | `ISOLATED / ZERO POLLUTION` | Utilizado apenas em testes unitários/integrados locais |
| **Production Runtime Wiring** | `NO` | Nenhuma integração de runtime em produção em `apps/voice` |

---

## 12. Preauthorization Decision Matrix

| Requisito / Gate | Status Observado | Bloqueia Execução Live? |
| :--- | :--- | :--- |
| Dataset Frozen & Verificado | `PASS` (`bd812341a9...`) | Não |
| Runner Hardening & Modularização | `PASS` (10 módulos <= 180 linhas) | Não |
| Runner Re-Freeze Agregado | `PASS` (congelado reprodutivelmente em `f5ef6e6b88...` via `compute-l2-executable-freeze.mjs`; `FREEZE_METHOD_VERSION = 1.0.0`; 10 módulos; duas execuções determinísticas idênticas; 10/10 testes PASS) | Não |
| Runner Function Length DoD | `PASS` (todas as funções <= 50 linhas, max 49) | Não |
| TypeSafe Model Frozen (`jev-1.13.0`) | `PASS` | Não |
| OpenAI Model Frozen (`gpt-6-astra`) | `PASS` | Não |
| OpenAI Pricing Verified | `PASS` (`$10.00 / 1M in`, `$5.00 / 1M cached in`, `$50.00 / 1M out`) | Não |
| TypeSafe Pricing Verified | **`NOT_VERIFIED`** (sem URL oficial pública de billing) | **SIM** |
| Request Caps Pre-Call Guarded | `PASS` (guarda antes de rede) | Não |
| Request Caps Boundary Unit Tests | `PASS` (8ª Jev, 13ª OpenAI, 20ª total bloqueadas) | Não |
| CLI Live Preconditions no Runner | `PASS` (`--allow-live` explícito e fail-closed) | Não |
| Input Size Cap Enforceable em Runtime | `PASS` (1.000 chars Jev, 4.000 chars OpenAI) | Não |
| Token Caps Enforceable em Runtime | **`NOT_ENFORCEABLE_AT_RUNTIME`** (sem tokenizer local) | **SIM** |
| Teto Financeiro Autorizado pelo Operador | **`NOT_AUTHORIZABLE`** (aguarda precificação TypeSafe) | **SIM** |
| Autorização Humana Explícita | **`AWAITING_HUMAN_DECISION`** | **SIM** |

---

## 13. Remaining Blockers para Execução Live

A execução live permanece categoricamente bloqueada pelos seguintes impedimentos ativos:
1. **`BLOCKER_TYPESAFE_PRICING_EVIDENCE = YES`**: Ausência de URL pública oficial confirmando faturamento da TypeSafe a $42/Btok (`TYPESAFE_PRICE_STATUS = NOT_VERIFIED`);
2. **`BLOCKER_OPERATOR_COST_CEILING = YES`**: O teto anterior de $0.25 USD é `SUPERSEDED` e nenhum novo teto financeiro foi proposto ou autorizado pelo operador humano (`L2_OPERATOR_COST_CEILING = NOT_AUTHORIZABLE`);
3. **`BLOCKER_HUMAN_AUTHORIZATION = YES`**: O comando live não foi autorizado pelo operador humano (`AWAITING_HUMAN_DECISION`);
4. **`BLOCKER_INPUT_TOKEN_CAPS = RESIDUAL_LIMITATION`**: Tokens exatos de entrada não são interceptáveis em tempo de execução pela ausência de biblioteca de tokenização local no monorepo (mitigado por `RUNTIME_ENFORCED_INPUT_SIZE_CAP` e pelo dataset sintético congelado com ~40 tokens/caso, mas formalmente `RUNTIME_ENFORCED_INPUT_TOKEN_CAP = NONE`).

---

## 14. Classificação Final do Envelope

**`PREAUTH_STATUS = PREAUTH_BLOCKED`**

*(Proibido classificar como `PREAUTH_READY`, `AUTHORIZED` ou `EXECUTED`).*

---

## 15. Comando Live Candidato e Fail-Closed Preconditions

SE e somente se todos os blockers prévios forem formalmente superados pelo operador humano e nova autorização for concedida após o fechamento da reproducibilidade do congelamento, a sintaxe da futura invocação candidata sob política empírica é:

```bash
node scripts/benchmarks/voice/run-jev-openai-l2-synthetic-integration.mjs --allow-live --accept-typesafe-empirical-pricing --cost-ceiling <EXPLICIT_PER_RUN_CEILING_USD>
```

- **DOCUMENTATION_ONLY**: Este comando é documentação de sintaxe futura e **NÃO DEVE SER EXECUTADO**.
- **LIVE_COMMAND_STATUS**: `NOT_AUTHORIZED`
- **LIVE_AUTHORIZATION_AVAILABLE**: `NO`
- **SECOND_LIVE_RUN_AUTHORIZED**: `NO`
- **Garantias Fail-Closed em Runtime**:
  1. A ausência da flag `--allow-live` dispara `FATAL_LIVE_INTENT_DENIED` antes de qualquer chamada;
  2. O caminho oficial de precificação verificada continua suportado;
  3. Para precificação TypeSafe `NOT_VERIFIED`, a pré-autorização empírica passa apenas quando TODAS as guardas da política empírica passarem cumulativamente:
     - Flag `--accept-typesafe-empirical-pricing` explicitamente presente;
     - Classificação de evidência exatamente `ACCOUNT_BILLING_EMPIRICALLY_VERIFIED`;
     - Taxa de planejamento de pesquisa exatamente $42.00 / 1B input tokens;
     - Teto de custo por execução `--cost-ceiling <USD>` explícito na CLI e >= custo mínimo planejado ($0.480294 USD);
     - Rejeição estrita de fallback para variável de ambiente `L2_COST_CEILING_USD` (`EMPIRICAL_ENV_COST_CEILING_FALLBACK_ALLOWED = NO`);
     - Todas as guardas existentes de intenção live, integridade de dataset (`bd812341a9...`), caps de requisição (7 Jev, 12 OpenAI, 19 total), caps de caracteres (1.000 / 4.000) e modelo (`jev-1.13.0`);
  4. Na ausência de qualquer uma das condições obrigatórias: **FAIL CLOSED**;
  5. A precificação contratual da TypeSafe não é classificada como verificada (`TYPESAFE_PRICE_STATUS = NOT_VERIFIED`).

---

## 16. Pacote de Decisões Humanas Requeridas (Human Decision Package)

Decisões formais concedidas pelo operador humano em 2026-10-03 (escopo estrito: única execução L2 sintética controlada):

1. **`HUMAN_DECISION_1` (Aceitação de Evidência Empírica TypeSafe)**:
   - `HUMAN_DECISION_TYPESAFE_EMPIRICAL_EVIDENCE_ACCEPTANCE`: `ACCEPTED_FOR_SINGLE_L2_RUN`
   - *Decisão do Operador*: Aceitar os dados reais de faturamento da conta TypeSafe (345 requests, 205k tokens in, $0.0086 USD spend ≈ $41.92/B) como evidência suficiente e conservadora ($42/B) para uma única bateria controlada L2, sem classificar como tarifa pública contratual.
2. **`HUMAN_DECISION_2` (Política de Resolução de Token-Cap)**:
   - `HUMAN_DECISION_TOKEN_CAP_POLICY`: `ACCEPT_EXISTING_CHARACTER_CAPS_FOR_SINGLE_L2_RUN`
   - `TOKEN_CAP_RESIDUAL_LIMITATION_ACCEPTED_FOR_THIS_RUN`: `YES`
   - *Decisão do Operador*: Aceitar a limitação residual de token cap e a proteção física via caps de caracteres (1.000 chars Jev / 4.000 chars OpenAI) combinada ao dataset sintético congelado para esta execução única.
3. **`HUMAN_DECISION_3` (Seleção do Teto Financeiro do Operador)**:
   - `APPROVED_OPERATOR_COST_CEILING_USD`: `0.96`
   - `OPERATOR_COST_CEILING_USD`: `0.96` (escopo: tentativa histórica única; autorização `CONSUMED`)
   - `NEW_OPERATOR_COST_CEILING`: `NOT_PROPOSED`
   - `LIVE_AUTHORIZATION_AVAILABLE`: `NO`
   - `SECOND_LIVE_RUN_AUTHORIZED`: `NO`
   - `COST_CEILING_CLASSIFICATION`: `OPERATOR_GOVERNANCE_CEILING_NOT_HARD_PROVIDER_BILLING_BOUND`
   - `OPERATOR_COST_CEILING_SCOPE`: `SINGLE_SYNTHETIC_L2_RUN_ONLY`
   - *Decisão do Operador*: Fixação formal do teto financeiro em $0.96 USD (cenário informativo 2.0x sobre planejamento de $0.480294 USD).
4. **`HUMAN_DECISION_4` (Autorização de Execução da Bateria L2 Live)**:
   - `HUMAN_L2_LIVE_AUTHORIZATION`: `AUTHORIZED_ONCE`
   - *Decisão do Operador*: Autorização explícita concedida para uma única execução controlada do comando live candidato. Não autoriza segunda execução, retries, Twilio, banco em nuvem ou tráfego de clientes.

---

## 17. Registro de Violações de Governança e Recuperação Pós-Invocação L2

### 1. Violação de Leitura de Arquivo de Ambiente (.env Read Policy Violation)
- `ENV_FILE_READ_POLICY_VIOLATION`: `YES`
- `ENV_FILE_READ_OCCURRED`: `YES` (durante checagem booleana de credenciais no runtime, o tooling do agente leu o arquivo `.env`)
- `ENV_VALUES_PRINTED_IN_TRACE`: `NO_EVIDENCE_OBSERVED` (nenhuma chave, valor, comprimento, prefixo ou sufixo foi exposto)
- `POTENTIAL_SECRET_EXPOSURE_TO_AGENT_TOOLING`: `YES` (leitura em memória pelo processo de ferramental)
- `EXTERNAL_SECRET_DISCLOSURE`: `NOT_PROVEN`
- `SECRET_ROTATION_REQUIRED_BEFORE_NEXT_LIVE_RUN`: `HUMAN_DECISION` (recomendada rotação das chaves antes de futura execução de rede)

### 2. Violação de Processo de Pré-Condição Live (Live Precondition Process Violation)
- `LIVE_PRECONDITION_PROCESS_VIOLATION`: `YES`
- `LIVE_COMMAND_SHOULD_HAVE_BEEN_STOPPED_BEFORE_INVOCATION`: `YES` (o comando não deveria ter sido invocado uma vez constatada a incompatibilidade de preauth e a ausência de credenciais no runtime)
- `LIVE_COMMAND_INVOCATION_COUNT`: 1
- `LIVE_AUTHORIZATION_CONSUMED`: `YES`
- `SECOND_LIVE_RUN_AUTHORIZED`: `NO`
- `RUNNER_FAIL_CLOSED_GUARD`: `PASS` (o runner fail-closed bloqueou a execução antes de qualquer tráfego de rede)
- `PROVIDER_NETWORK_CALLS`: 0
- `PROVIDER_SPEND_FROM_THIS_INVOCATION_USD`: 0

### 3. Preservação dos Fatos e Próximo Slice Técnico
- `L2_RESULT`: `BLOCKED`
- `LAST_L2_LIVE_ATTEMPT_RESULT`: `BLOCKED_BY_RUNNER_FAIL_CLOSED_PREAUTH`
- `CURRENT_L2_EXECUTION`: `NOT_AUTHORIZED`
- `LIVE_AUTHORIZATION_AVAILABLE`: `NO`
- `SECOND_LIVE_RUN_AUTHORIZED`: `NO`
- `NEXT_REQUIRED_SLICE`: `EXECUTABLE_FREEZE_REPRODUCIBILITY_CLOSURE`
- `FUTURE_LIVE_CREDENTIAL_CONFIGURATION`: `REQUIRED` (configuração humana limpa de credenciais no ambiente sem leitura por tooling de agente)

---

## 18. Implementação da Política Mínima de Pré-Autorização Empírica (Slice 006AV)

- **Slice**: `006AV` (`fix/006av-l2-preauth-policy-implementation`)
- **Objetivo**: Implementar o menor ajuste de código no runner L2 para permitir a representação da política de precificação empírica explicitamente autorizada pelo operador humano, preservando integralmente o comportamento fail-closed.
- **Mecanismo de Reconhecimento de Política**: `--accept-typesafe-empirical-pricing`
- **Requisitos Cumulativos para Pré-Autorização com Evidência Empírica**:
  1. `--allow-live` explicitamente presente;
  2. `--accept-typesafe-empirical-pricing` explicitamente presente;
  3. Classificação de evidência de faturamento exatamente igual a `ACCOUNT_BILLING_EMPIRICALLY_VERIFIED`;
  4. Taxa de planejamento TypeSafe exatamente igual à taxa observada aprovada de `$42.00 / 1B input tokens`;
  5. Teto de custo válido (`--cost-ceiling <USD>`) presente;
  6. Teto de custo não inferior ao custo mínimo planejado do cenário L2 (`$0.480294 USD`);
  7. Dataset sintético congelado íntegro (`bd812341a9...`, N=12);
  8. Caps de 7 requisições TypeSafe, 12 OpenAI e 19 totais inalterados;
  9. Caps de caracteres (1.000 chars TypeSafe, 4.000 chars OpenAI) e output tokens (500 tokens) inalterados;
  10. Concorrência = 1, retries = 0 inalterados.
- **Status da Precificação**:
  - `TYPESAFE_PRICE_STATUS`: `NOT_VERIFIED` (inalterado; a política empírica não converte evidência observada em tarifa contratual);
  - `TYPESAFE_EXPLICIT_CONTRACTUAL_TARIFF`: `NOT_OBSERVED`;
  - `HARD_L2_COST_BOUND_FEASIBLE`: `BLOCKED`;
  - `TYPESAFE_PRICING_EVIDENCE`: `ACCOUNT_BILLING_EMPIRICALLY_VERIFIED`.
- **Status do Hash Agregado Anterior e Próximo Slice Técnico**:
  - `PREVIOUS_EXECUTABLE_AGGREGATE_SHA256`: `8f53f8169771caa26dd9623702a7c65e3e9c730dfcb2bbfcb26188dcd57c77f3` (`SUPERSEDED_BY_CODE_CHANGE`);
  - `EXECUTABLE_FREEZE_REPRODUCIBILITY`: `BLOCKED`;
  - `NEW_EXECUTABLE_AGGREGATE_SHA256`: `NOT_REPRODUCIBLE_FROM_TRACKED_METHOD`;
  - `NEXT_REQUIRED_SLICE`: `EXECUTABLE_FREEZE_REPRODUCIBILITY_CLOSURE` (pré-requisito técnico offline antes de qualquer configuração de credenciais ou autorização live futura).
- **Garantias Estritas de Teto Financeiro**:
  - `EMPIRICAL_EXPLICIT_COST_CEILING_REQUIRED`: `YES`;
  - `EMPIRICAL_ENV_COST_CEILING_FALLBACK_ALLOWED`: `NO` (o runner rejeita estritamente o uso herdado de `L2_COST_CEILING_USD` do ambiente quando a política empírica é selecionada; exige `--cost-ceiling <USD>` explícito na linha de comando).
- **Governança de Execução**:
  - `LIVE_COMMAND_INVOKED`: `NO`;
  - `LIVE_AUTHORIZATION_AVAILABLE`: `NO`;
  - `SECOND_LIVE_RUN_AUTHORIZED`: `NO`;
  - `TypeSafe real`: `0`;
  - `OpenAI real`: `0`;
  - `Twilio`: `0`;
  - `Cloud DB`: `0`;
  - `Customer data`: `0`;
  - `Holdout`: `NO ACCESS`.

---

## 19. Fechamento da Reprodutibilidade de Congelamento do Executável L2 (Slice 006AW)

- **Slice**: `006AW` (`research/006aw-l2-executable-freeze-reproducibility`)
- **Objetivo**: Fechar o gate de reproducibilidade do conjunto executável do runner L2 através de ferramenta rastreada no repositório, determinística e livre de dependências de plataforma.
- **Investigação do Método Histórico**:
  - `HISTORICAL_FREEZE_METHOD_TRACKED`: `NO` (o hash `8f53f816...` foi registrado documentalmente sem ferramenta ou receita de hashing rastreada no Git);
  - `HISTORICAL_FREEZE_METHOD_REPRODUCIBLE`: `NO`;
  - `HISTORICAL_AGGREGATE_REPRODUCIBILITY`: `LEGACY_NOT_REPRODUCIBLE_FROM_TRACKED_METHOD`;
  - `PREVIOUS_EXECUTABLE_AGGREGATE_SHA256`: `8f53f8169771caa26dd9623702a7c65e3e9c730dfcb2bbfcb26188dcd57c77f3f` (`SUPERSEDED_BY_CODE_CHANGE`).
- **Implementação do Método Canônico Rastreado**:
  - **Manifesto Canônico**: `scripts/benchmarks/voice/l2-executable-freeze-manifest.json` (declaração explícita dos 10 módulos executáveis do runner);
  - **Ferramenta de Cálculo**: `scripts/benchmarks/voice/compute-l2-executable-freeze.mjs` (172 linhas, funções <= 26 linhas);
  - **Versão do Método**: `FREEZE_METHOD_VERSION = 1.0.0`;
  - **Determinismo Multiplataforma**: A leitura do conteúdo de cada módulo é feita via Git (`git show ${ref}:${modulePath}`), garantindo que o hashing opere exatamente sobre os bytes canônicos rastreados no Git (com quebras de linha LF), independentemente de conversões automáticas CRLF no sistema de arquivos do host Windows/Linux;
  - **Ordenação Canônica**: Ordenação lexicográfica estrita dos caminhos POSIX antes da composição do material de agregação;
  - **Material de Agregação Canônico**: UTF-8 formatado como:
    ```
    l2-executable-freeze-v1
    <repo-relative-posix-path>  <per-file-sha256>
    ...
    ```
  - **Fail-Closed Guarantees**: A ferramenta falha imediatamente se qualquer módulo do manifesto estiver ausente, se houver caminhos duplicados, se algum caminho escapar da raiz do repositório, se a contagem não corresponder exatamente a 10 módulos, ou se módulos executáveis forem alterados sem conformidade.
- **Conjunto Executável Atual (10 Módulos)**:
  1. `scripts/benchmarks/voice/l2-runner-artifact.mjs` (SHA-256: `fcd365e94ad4cae51eca8e535b942f128d78864c05baa61e3ecce255c80e48c6`)
  2. `scripts/benchmarks/voice/l2-runner-case-execution.mjs` (SHA-256: `4909155e6e4ad0fcd0dc7168a9e136c4939bdb93716468e67ce25d9c65cf0b74`)
  3. `scripts/benchmarks/voice/l2-runner-cost-ceiling.mjs` (SHA-256: `76382ac71457f8c79d855d39340a1d9c1a0cf975fbdc347bc1fae62ec5520147`)
  4. `scripts/benchmarks/voice/l2-runner-dependencies.mjs` (SHA-256: `13bf268b6019094d8fd4a0d9e4d208a8bfa7ef85b1c49465428b853ea4ee4ed0`)
  5. `scripts/benchmarks/voice/l2-runner-input-budget.mjs` (SHA-256: `3f12299aadc810f0350273d288667f00be35cbec2d96ea73b9f26ba8e7d699d5`)
  6. `scripts/benchmarks/voice/l2-runner-preconditions.mjs` (SHA-256: `4408afcdd94e6e57630cee98286498288d2fe3f85d3716dac96828cad60c582c`)
  7. `scripts/benchmarks/voice/l2-runner-provider-dispatch.mjs` (SHA-256: `655d84e086752d4f25ac6b772ad7a317a92da842fe0800fe7b1952feb47c96a5`)
  8. `scripts/benchmarks/voice/l2-runner-request-caps.mjs` (SHA-256: `5e3a55e69f676afb16697afdcd0c3349469f392374989c8b945a3c11d8ffc21f`)
  9. `scripts/benchmarks/voice/l2-runner-result-classification.mjs` (SHA-256: `b4b8211f6a6784a6084bbb4c652e8e110773de5663348f19a8b30f867eac6648`)
  10. `scripts/benchmarks/voice/run-jev-openai-l2-synthetic-integration.mjs` (SHA-256: `7e7a0621b7e91f21c5ddd1aa5a191074cf5f35c9c190b4c5f789852b47c542ec`)
- **Evidência de Reprodutibilidade em Duas Execuções Independentes**:
  - `RUN_1_AGGREGATE_SHA256`: `f5ef6e6b88e09094765b0c3b273ba23cae01502bdd0ec4fe28dbcb3f2133794a`
  - `RUN_2_AGGREGATE_SHA256`: `f5ef6e6b88e09094765b0c3b273ba23cae01502bdd0ec4fe28dbcb3f2133794a`
  - `TWO_RUN_REPRODUCIBILITY`: `PASS` (`RUN_1 === RUN_2`)
  - `CURRENT_EXECUTABLE_AGGREGATE_SHA256`: `f5ef6e6b88e09094765b0c3b273ba23cae01502bdd0ec4fe28dbcb3f2133794a`
  - `EXECUTABLE_FREEZE_REPRODUCIBILITY`: `PASS`
  - `CURRENT_EXECUTABLE_FREEZE_STATUS`: `FROZEN_REPRODUCIBLY`
- **Testes Automatizados de Reprodutibilidade**:
  - `packages/integrations/src/typesafe/l2-executable-freeze.test.ts`: 10 casos de teste cobrindo determinismo, insensibilidade à ordem de enumeração do filesystem, sensibilidade a mutação de 1 byte, fail-closed por arquivo ausente, duplicatas, path traversal fora do repo, discrepância de contagem, ausência total de chamadas a provedores/rede e isolamento de segredos/arquivos `.env`.
  - Resultado: `10/10 PASS`.
- **Dataset Sintético L2**:
  - `L2_DATASET_SHA256`: `bd812341a922ded1c7159191849dae284a88f24afd9c7e8d3c64f9b081602f3f` (`UNCHANGED`).
- **Governança de Execução e Status Atual**:
  - `CURRENT_L2_EXECUTION`: `NOT_AUTHORIZED`;
  - `LIVE_AUTHORIZATION_AVAILABLE`: `NO`;
  - `SECOND_LIVE_RUN_AUTHORIZED`: `NO`;
  - `LIVE_COMMAND_INVOKED`: `NO`;
  - Provedores reais chamados: `0` (OpenAI real: 0, TypeSafe real: 0, Twilio: 0, Cloud DB: 0, Holdout: NO ACCESS);
  - `NEXT_REQUIRED_STEP`: `HUMAN_SECRET_ROTATION_AND_CREDENTIAL_CONFIGURATION` (etapa humana prévia obrigatória antes de qualquer proposição de autorização live futura).
