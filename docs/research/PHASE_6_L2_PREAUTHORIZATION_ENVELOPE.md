# Pacote de Pré-Autorização L2 (PHASE_6_L2_PREAUTHORIZATION_ENVELOPE.md)

<!--
L2_PREAUTHORIZATION_ENVELOPE_METADATA_START
SCHEMA_VERSION: 1.3.0
CREATED_AT: 2026-10-03
LAST_RECONCILED_AT: 2026-10-03
PHASE: Phase 6 (Voice Model Routing & Jev Evaluation)
STUDY: L2 Real Jev + Real OpenAI + Synthetic Transcript
PREAUTH_STATUS: PREAUTH_BLOCKED
L2_EXECUTION: NOT EXECUTED
L2_OPERATOR_COST_CEILING: NOT_AUTHORIZABLE
PROPOSED_COST_CEILING_USD: 0.25 (PLANNING_PROPOSAL)
HARD_MAX_PROVIDER_COST_STATUS: NOT_ENFORCEABLE
TYPESAFE_PRICE_STATUS: NOT_VERIFIED
OPENAI_PRICE_STATUS: VERIFIED
CLI_LIVE_INTENT_PLUMBING: PASS
REQUEST_CAP_BOUNDARY_TESTS: PASS
RUNTIME_ENFORCED_INPUT_SIZE_CAP: PASS (1000 chars TypeSafe, 4000 chars OpenAI)
RUNTIME_ENFORCED_INPUT_TOKEN_CAP: NONE
TOKEN_CAP_ENFORCEMENT: NOT_ENFORCEABLE_AT_RUNTIME
AGGREGATE_OUTPUT_CAP: DERIVED_ENFORCEABLE_SUBJECT_TO_CAP_ISOLATION_TEST
CURRENT_RUNNER_FREEZE: POST_HARDENING_CANDIDATE
L2_EXECUTABLE_AGGREGATE_SHA256: 960224fc647981a3d3f5c97f58866da0be454df95f3570c0be0072327dc7bfb4
LIVE_COMMAND_STATUS: LIVE_COMMAND_NOT_YET_AUTHORIZABLE
NEXT_ALLOWED_STEP: HUMAN_REVIEW_OF_HARDENING_PR
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
| **CURRENT_RUNNER_FREEZE** | `POST_HARDENING_CANDIDATE` | Versão modular pós-hardening offline |
| **L2_EXECUTABLE_AGGREGATE_SHA256** | `960224fc647981a3d3f5c97f58866da0be454df95f3570c0be0072327dc7bfb4` | Hash agregado determinístico dos 9 módulos executáveis |

### Módulos Executáveis do Runner (L2_EXECUTABLE_FILE_SET)

| Arquivo Executável | SHA-256 | Linhas |
| :--- | :--- | :--- |
| `scripts/benchmarks/voice/l2-runner-artifact.mjs` | `fcd365e94ad4cae51eca8e535b942f128d78864c05baa61e3ecce255c80e48c6` | 104 |
| `scripts/benchmarks/voice/l2-runner-case-execution.mjs` | `4909155e6e4ad0fcd0dc7168a9e136c4939bdb93716468e67ce25d9c65cf0b74` | 149 |
| `scripts/benchmarks/voice/l2-runner-dependencies.mjs` | `13bf268b6019094d8fd4a0d9e4d208a8bfa7ef85b1c49465428b853ea4ee4ed0` | 63 |
| `scripts/benchmarks/voice/l2-runner-input-budget.mjs` | `3f12299aadc810f0350273d288667f00be35cbec2d96ea73b9f26ba8e7d699d5` | 40 |
| `scripts/benchmarks/voice/l2-runner-preconditions.mjs` | `4b9cef2cc879da7726b817b5a47e38b2e49af87822e8668b981f9626bf97d5cb` | 130 |
| `scripts/benchmarks/voice/l2-runner-provider-dispatch.mjs` | `655d84e086752d4f25ac6b772ad7a317a92da842fe0800fe7b1952feb47c96a5` | 154 |
| `scripts/benchmarks/voice/l2-runner-request-caps.mjs` | `5e3a55e69f676afb16697afdcd0c3349469f392374989c8b945a3c11d8ffc21f` | 19 |
| `scripts/benchmarks/voice/l2-runner-result-classification.mjs` | `b4b8211f6a6784a6084bbb4c652e8e110773de5663348f19a8b30f867eac6648` | 100 |
| `scripts/benchmarks/voice/run-jev-openai-l2-synthetic-integration.mjs` | `c3e9ca4f3a984b72b86c3215ac88410e7d95e7d9a1bc4fb46378dc85d267fb95` | 168 |

---

## 3. Provider Models

### TypeSafe / Jev
- **REQUESTED_TYPESAFE_MODEL**: `jev-1.13.0`
- **EXPECTED_TYPESAFE_MODEL**: `jev-1.13.0`
- **Mecanismo de Verificação**: Checagem de identidade estrita (`providerModel === EXPECTED_TYPESAFE_MODEL`). Qualquer divergência dispara interrupção imediata com `MODEL_IDENTITY_MISMATCH`.

### OpenAI
- **REQUESTED_OPENAI_MODEL**: `gpt-4o-mini`
- **Status de Observabilidade**: `NOT_OBSERVABLE_VIA_CURRENT_SURFACE`.
- **Mecanismo de Controle**: Configuração estrita via adapter (`modelId: 'gpt-4o-mini'`), mantendo separação entre modelo requisitado e observado.

---

## 4. Pricing Evidence

### OpenAI Pricing
- **OPENAI_PRICE_STATUS**: `VERIFIED`
- **Input Tokens**: $0.15 / 1.000.000 tokens ($0.00000015 / token)
- **Output Tokens**: $0.60 / 1.000.000 tokens ($0.00000060 / token)
- **Fonte de Evidência**: Documentação pública e tabela de preços oficial da OpenAI (`https://openai.com/api/pricing/`), auditada em PR #64 e PR #70.

### TypeSafe Pricing
- **TYPESAFE_PRICE_STATUS**: `NOT_VERIFIED`
- **Valor Projetado de Planejamento**: $42.00 / 1.000.000.000 tokens ($0.000042 / 1.000 tokens)
- **Status Factual**: Ausência de URL pública oficial confirmando faturamento da TypeSafe a $42/Btok. Permanece como premissa não verificada, bloqueando a pré-autorização live.

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

## 6. Token Budget & Semantics

### Distinção entre Premissas e Limites Fatuais

| Propriedade de Token | Valor | Classificação Normativa | Status em Runtime |
| :--- | :--- | :--- | :--- |
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
- TypeSafe planning cost: (7 * 1.000 / 1.000.000.000) * $42 = **$0.000294 USD**
- OpenAI planning cost:
  - Input: 12 * 1.500 * ($0.15 / 1.000.000) = $0.002700 USD
  - Output: 12 * 500 * ($0.60 / 1.000.000) = $0.003600 USD
  - Total OpenAI: **$0.006300 USD**
- Custo total de planejamento: $0.000294 + $0.006300 = **$0.006594 USD** (~$0.0066 USD).

### Semântica de Autorização
- **PROPOSED_COST_CEILING_USD**: $0.25 USD (margem de segurança ~37x sobre o custo planejado).
- **L2_OPERATOR_COST_CEILING**: `NOT_AUTHORIZABLE` (a autorização formal pelo operador permanece bloqueada até homologação completa de pré-requisitos).
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
- O preflight gate valida todos os pré-requisitos. Como `TYPESAFE_PRICE_STATUS = NOT_VERIFIED`, a execução é barrada com `FATAL_LIVE_PREAUTH_BLOCKED`.

### Status:
`LIVE_COMMAND_STATUS = LIVE_COMMAND_NOT_YET_AUTHORIZABLE`

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
| Runner Hardening & Modularização | `PASS` (9 módulos <= 180 linhas) | Não |
| Runner Re-Freeze Agregado | `PASS` (`960224fc64...`) | Não |
| Runner Function Length DoD | `PASS` (todas as funções <= 50 linhas, max 49) | Não |
| TypeSafe Model Frozen (`jev-1.13.0`) | `PASS` | Não |
| OpenAI Model Frozen (`gpt-4o-mini`) | `PASS` | Não |
| OpenAI Pricing Verified | `PASS` (`$0.15 / 1M in`, `$0.60 / 1M out`) | Não |
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
2. **`BLOCKER_OPERATOR_AUTHORIZATION = YES`**: O teto financeiro de $0.25 USD e o comando live ainda não foram autorizados pelo operador humano (`L2_OPERATOR_COST_CEILING = NOT_AUTHORIZABLE`);
3. **`BLOCKER_INPUT_TOKEN_CAPS = RESIDUAL_LIMITATION`**: Tokens exatos de entrada não são interceptáveis em tempo de execução pela ausência de biblioteca de tokenização local no monorepo (mitigado por `RUNTIME_ENFORCED_INPUT_SIZE_CAP` e pelo dataset sintético congelado com ~40 tokens/caso, mas formalmente `RUNTIME_ENFORCED_INPUT_TOKEN_CAP = NONE`).

---

## 14. Classificação Final do Envelope

**`PREAUTH_STATUS = PREAUTH_BLOCKED`**

*(Proibido classificar como `PREAUTH_READY`, `AUTHORIZED` ou `EXECUTED`).*
