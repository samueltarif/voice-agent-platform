# Pacote de Pré-Autorização L2 (PHASE_6_L2_PREAUTHORIZATION_ENVELOPE.md)

<!--
L2_PREAUTHORIZATION_ENVELOPE_METADATA_START
SCHEMA_VERSION: 1.0.0
CREATED_AT: 2026-10-03
PHASE: Phase 6 (Voice Model Routing & Jev Evaluation)
STUDY: L2 Real Jev + Real OpenAI + Synthetic Transcript
PREAUTH_STATUS: PREAUTH_BLOCKED_FOR_RUNNER_LIVE_PRECONDITIONS
L2_EXECUTION: NOT EXECUTED
L2_OPERATOR_COST_CEILING: PROPOSED_NOT_AUTHORIZED
PROPOSED_COST_CEILING_USD: 0.25
TYPESAFE_PRICE_STATUS: VERIFIED
OPENAI_PRICE_STATUS: VERIFIED
TOKEN_CAP_ENFORCEMENT: NOT_ENFORCEABLE_AT_RUNTIME
LIVE_COMMAND_STATUS: LIVE_COMMAND_NOT_YET_AUTHORIZABLE
L2_PREAUTHORIZATION_ENVELOPE_METADATA_END
-->

> **Documento Canônico de Pré-Autorização da Bateria L2**  
> Este documento define formalmente os limites técnicos, modelos, precificação verificada, orçamento de tokens, hard caps e condições de parada para a eventual execução da bateria L2 (*Real TypeSafe/Jev + Real OpenAI + Synthetic Transcript*).  
> **NENHUMA EXECUÇÃO REAL DE PROVEDOR É REALIZADA OU AUTORIZADA POR ESTE DOCUMENTO.**

---

## 1. Purpose

Estabelecer um envelope rigoroso, auditável e imutável para a execução live da bateria experimental L2, garantindo:
1. Limites financeiros invioláveis (caps de requisição e teto de custo operador);
2. Isolamento estrito de dados (zero transcrições de clientes, zero acesso a holdout, zero acesso a banco de dados de produção/staging, zero telefonia/Twilio);
3. Verificação factual de modelos e precificação dos provedores;
4. Condições determinísticas de parada imediata (*fail-fast*);
5. Conformidade integral com `AGENTS.md` e `docs/AI_EXECUTION_RULES.md`.

---

## 2. Frozen Study Identity

| Propriedade | Valor Congelado | Evidência Factual |
| :--- | :--- | :--- |
| **L2_DATASET_PATH** | `scripts/benchmarks/voice/jev-openai-l2-synthetic-integration-v1-cases.json` | Arquivo rastreado no repositório |
| **L2_DATASET_VERSION** | `1.0.1` | Campo `version` no JSON do dataset |
| **L2_DATASET_CASE_COUNT** | `12` | 12 casos sintéticos estritos (7 matcher-positive, 5 matcher-negative) |
| **L2_DATASET_SHA256** | `bd812341a922ded1c7159191849dae284a88f24afd9c7e8d3c64f9b081602f3f` | Hash SHA-256 verificado |
| **L2_RUNNER_PATH** | `scripts/benchmarks/voice/run-jev-openai-l2-synthetic-integration.mjs` | Script rastreado |
| **L2_RUNNER_SHA256** | `89c42ced37e04aafadb752f9fcc03e28fcb5409dfb2ff878c35eb8a1f98e4755` | Hash SHA-256 verificado no HEAD |
| **L2_RUNNER_COMMIT_SHA** | `4cd15b1b0b6afe5a9f10b371eab387ae85bb8205` | Commit de introdução no PR #68, mergeado na `main` (`630ee48d8fdd10077e7374053da176d9072c5b9a`) |

---

## 3. Provider Models

### TypeSafe / Jev
- **TYPESAFE_REQUESTED_MODEL**: `jev-1.13.0`
- **TYPESAFE_REQUIRED_OBSERVED_MODEL**: `jev-1.13.0`
- **MODEL_IDENTITY_GUARD**: `EXACT_MATCH_REQUIRED`
- **Comportamento em divergência**: O adapter `TypeSafeJevTurnDecisionAdapter` lança `TypeSafeModelIdentityMismatchError`. O runner interrompe imediatamente a execução (`state.typeSafeMismatch = true`, `shouldStop = true`), classificando a rodada como `MODEL_IDENTITY_MISMATCH`.

### OpenAI
- **OPENAI_REQUESTED_MODEL**: `gpt-4o-mini`
- **OPENAI_OBSERVED_MODEL_STATUS**: `NOT_OBSERVABLE_VIA_CURRENT_SURFACE` (a API SSE de streaming atual não expõe o model string de volta na interface de turnos; o modelo solicitado `gpt-4o-mini` é fixado no request payload).

---

## 4. Pricing Evidence

### OpenAI Pricing
- **OPENAI_PRICE_STATUS**: `VERIFIED`
- **OPENAI_PRICING_SOURCE**: [OpenAI Pricing](https://openai.com/api/pricing/) (documentação oficial pública observada)
- **OPENAI_PRICING_OBSERVED_AT**: `2026-10-03`
- **OPENAI_MODEL_PRICED**: `gpt-4o-mini`
- **INPUT_PRICE**: `$0.15 USD por 1.000.000 tokens` (`$0.00000015 / token`)
- **CACHED_INPUT_PRICE**: `$0.075 USD por 1.000.000 tokens`
- **OUTPUT_PRICE**: `$0.60 USD por 1.000.000 tokens` (`$0.00000060 / token`)
- **PRICING_UNIT**: USD por 1M tokens

### TypeSafe Pricing
- **TYPESAFE_PRICE_STATUS**: `VERIFIED`
- **TYPESAFE_PRICE_SOURCE**: Documentação oficial pública da TypeSafe e evidência empírica das execuções L1A/L1B registradas em `docs/research/PHASE_6_TYPESAFE_L1B_SYNTHETIC_LATENCY_PLAN.md` e `docs/research/PHASE_6_JEV_AUXILIARY_MODEL_GATE.md`
- **TYPESAFE_PRICE_UNIT**: USD por Bilhão de tokens de entrada (Btok); tokens de saída são gratuitos
- **TYPESAFE_UNIT_PRICE**: `$42 USD / Btok` (`$0.042 / Mtok`, equivalente a `$0.000000042 / input token`)

---

## 5. Request Caps

| Parâmetro | Limite Máximo | Justificativa / Derivação |
| :--- | :--- | :--- |
| `MAX_TYPESAFE_REQUESTS` | **7** | O dataset contém exatamente 7 casos matcher-positive. TypeSafe só é acionado se matcher retornar `true`. |
| `MAX_OPENAI_REQUESTS` | **12** | Pior caso teórico: 5 casos matcher-negative (chamam OpenAI diretamente) + 7 casos matcher-positive que eventualmente caiam em rota generativa. |
| `TOTAL_MAX_PROVIDER_REQUESTS` | **19** | Soma estrita de TypeSafe (7) + OpenAI (12). |
| `CONCURRENCY` | **1** | Execução puramente serial, caso a caso. |
| `PROVIDER_RETRIES` | **0** | Nenhum retry automático autorizado. Qualquer falha técnica pontua e é avaliada contra a política de parada. |

---

## 6. Token Caps

| Parâmetro | Limite Teórico | Status de Imposição em Tempo de Execução |
| :--- | :--- | :--- |
| `MAX_OUTPUT_TOKENS_PER_REQUEST` | **500** | `ENFORCEABLE` (imposto via `maxCompletionTokens: 500` na configuração do `OpenAiConversationModelAdapter`) |
| `MAX_TOTAL_OUTPUT_TOKENS` | **6.000** | `ENFORCEABLE` (12 requisições * 500 tokens máximos) |
| `MAX_INPUT_TOKENS_PER_REQUEST` | **1.000** (Jev) / **1.500** (OpenAI) | `BOUNDED_BY_DATASET` (as 12 elocuções do dataset têm entre 15 e 108 caracteres, ~40 tokens; porém **sem validador ativo no runner**) |
| `MAX_TOTAL_INPUT_TOKENS` | **7.000** (Jev) / **18.000** (OpenAI) | `BOUNDED_BY_DATASET` |
| **TOKEN_CAP_ENFORCEMENT** | — | **`NOT_ENFORCEABLE_AT_RUNTIME`** (o runner atual não acumula nem valida tokens de entrada antes do envio HTTP) |

---

## 7. Worst-Case Cost Model

O modelo de custo conservador assume o pior caso em que todos os limites máximos de requisição e tokens de saída são consumidos:

### 1. Custo TypeSafe / Jev (Worst-Case)
$$\text{Custo TypeSafe} = \frac{7 \times 1.000 \text{ tokens}}{1.000.000.000} \times \$42 = \$0,000294\text{ USD}$$

### 2. Custo OpenAI `gpt-4o-mini` (Worst-Case)
- **Input (18.000 tokens a $0.15 / 1M)**:
  $$\text{Custo Input} = \frac{18.000}{1.000.000} \times \$0,15 = \$0,002700\text{ USD}$$
- **Output (6.000 tokens a $0.60 / 1M)**:
  $$\text{Custo Output} = \frac{6.000}{1.000.000} \times \$0,60 = \$0,003600\text{ USD}$$
- **Total OpenAI**:
  $$\$0,002700 + \$0,003600 = \$0,006300\text{ USD}$$

### 3. Custo Total Máximo Projetado de Provedores
$$\text{MAX\_PROJECTED\_TOTAL\_PROVIDER\_COST\_USD} = \$0,000294 + \$0,006300 = \mathbf{\$0,006594\text{ USD}}\ (\approx \$0,0066\text{ USD})$$

*(Mesmo sob hipóteses históricas ultra-conservadoras de 1.500 tokens de entrada médios, o custo total permanece abaixo de $0,11 USD).*

---

## 8. Proposed Operator Cost Ceiling

- **PROPOSED_L2_OPERATOR_COST_CEILING_USD**: **`$0.25 USD`**
- **Margem de Segurança**: >35x sobre o pior caso matemático calculado ($0,0066 USD) e >2.3x sobre estimativas históricas superestimadas.
- **Status do Teto**: **`PROPOSED_NOT_AUTHORIZED`** (aguarda decisão humana explícita em prompt futuro).

---

## 9. Stop Conditions

A execução deve ser abortada imediatamente (*fail-fast*) com saída estruturada sem retries sob qualquer uma das seguintes condições:
1. `STOP_ON_TYPESAFE_MODEL_MISMATCH = YES` (modelo retornado pela TypeSafe difere de `jev-1.13.0`);
2. `STOP_ON_PROVIDER_AUTH_FAILURE = YES` (erro HTTP 401 ou 403 em qualquer provedor);
3. `STOP_ON_TIMEOUT_POLICY_BREACH = YES` (requisição excede `RESEARCH_HARNESS_TIMEOUT_MS = 5000ms`);
4. `STOP_ON_CONSECUTIVE_FAILURES = YES` (3 falhas técnicas consecutivas);
5. `STOP_ON_REQUEST_CAP_REACHED = YES` (tentativa de exceder 7 chamadas Jev, 12 chamadas OpenAI ou 19 totais);
6. `STOP_ON_DATASET_HASH_MISMATCH = YES` (hash SHA-256 do dataset difere de `bd812341a9...`);
7. `STOP_ON_RUNNER_HASH_OR_SHA_MISMATCH = YES` (código do runner alterado em relação à versão aprovada);
8. `STOP_ON_UNEXPECTED_NETWORK_TARGET = YES` (qualquer conexão fora dos endpoints autorizados de TypeSafe e OpenAI);
9. `STOP_ON_UNEXPECTED_DB_ACCESS = YES` (qualquer tentativa de conexão a banco de dados local ou nuvem);
10. `STOP_ON_UNEXPECTED_TWILIO_ACCESS = YES` (qualquer tentativa de carregar ou chamar Twilio);
11. `STOP_ON_HOLDOUT_ACCESS = YES` (qualquer tentativa de leitura do dataset de holdout);
12. `STOP_ON_ARTIFACT_WRITE_FAILURE = YES` (falha ao salvar o artefato sanitizado em disco).

---

## 10. Exact Proposed Live Command

Comando proposto para futura execução:
```bash
node scripts/benchmarks/voice/run-jev-openai-l2-synthetic-integration.mjs --cost-ceiling 0.25
```

### Status de Execução do Comando:
**`LIVE_COMMAND_STATUS = LIVE_COMMAND_NOT_YET_AUTHORIZABLE`**

**Lacunas / Pré-condições ausentes no runner atual:**
1. A constante `OPENAI_PRICE_STATUS` está fixada como `'NOT_VERIFIED'` em código (`run-jev-openai-l2-synthetic-integration.mjs:30`), bloqueando a execução por `FATAL_LIVE_PREAUTH_BLOCKED`;
2. O runner em `process.argv` não repassa a flag `allowLiveExecution: true` ao chamar `runL2Benchmark()`;
3. Falta validação de limite de tokens em runtime (`TOKEN_CAP_ENFORCEMENT`).

*Conforme regras de governança, o runner NÃO é modificado neste slice documental.*

---

## 11. Artifact Contract

- **Caminho de Saída**: `docs/research/results/phase-6-l2-real-jev-openai-synthetic-run1.json`
- **Sanitização Obrigatória**:
  - `transcripts`: Apenas elocuções sintéticas aprovadas do dataset;
  - `secrets`: Proibido conter chaves de API, tokens Bearer, headers Authorization ou variáveis de ambiente;
  - `raw_scores`: Opcional, estruturado conforme schema aprovado;
  - `customer_data`: 0.

---

## 12. Isolation Guarantees

| Invariante | Status | Garantia |
| :--- | :--- | :--- |
| **Twilio Calls** | `0` | Twilio não é importado nem inicializado no runner L2 |
| **Cloud DB Connections** | `0` | Neon staging, prod e Supabase desativados / zero conexões |
| **Local DB Connections** | `0` | Nenhum banco de dados é consultado ou modificado durante o benchmark |
| **Holdout Access** | `NO NEW ACCESS` | `LOCKED_HOLDOUT = CONSUMED` preservado; proibido reutilizar para ajuste |
| **Customer Transcripts** | `0` | Apenas o dataset sintético versionado é consumido |
| **Frozen Policy V1** | `UNCHANGED` | Thresholds congelados (0.56 / 0.35 / 0.47) mantidos sem ajuste |
| **ACTIVE_GUARDED** | `BLOCKED` | Runtime de produção permanece inalterado |
| **Production Runtime Wiring** | `NO` | Nenhuma integração de runtime em produção em `apps/voice` |

---

## 13. Authorization Matrix

| Requisito / Gate | Status Observado | Bloqueia Execução Live? |
| :--- | :--- | :--- |
| Dataset Frozen & Verificado | `PASS` (`bd812341a9...`) | Não |
| Runner Frozen & Rastreado | `PASS` (`89c42ced37...`) | Não |
| TypeSafe Model Frozen (`jev-1.13.0`) | `PASS` | Não |
| OpenAI Model Frozen (`gpt-4o-mini`) | `PASS` | Não |
| TypeSafe Pricing Verified | `PASS` (`$42 / Btok`) | Não |
| OpenAI Pricing Verified | `PASS` (`$0.15 / 1M in`, `$0.60 / 1M out`) | Não |
| Request Caps Enforceable | `PASS` (7 / 12 / 19) | Não |
| Token Caps Enforceable em Runtime | **`NOT_ENFORCEABLE_AT_RUNTIME`** | **SIM** |
| CLI Live Preconditions no Runner | **`BLOCKED (hardcoded NOT_VERIFIED no runner)`** | **SIM** |
| Teto Financeiro Aprovado pelo Operador | **`PROPOSED_NOT_AUTHORIZED`** | **SIM** |
| Autorização Humana Explícita | **`AWAITING_HUMAN_DECISION`** | **SIM** |

---

## 14. Remaining Blockers

1. **`BLOCKED_FOR_RUNNER_LIVE_FLAGS`**: O runner necessita de ajuste pontual para aceitar `--allow-live` via CLI e refletir o `OPENAI_PRICE_STATUS = VERIFIED`;
2. **`BLOCKED_FOR_TOKEN_CAP_ENFORCEMENT`**: O runner deve conter guarda ativa ou verificação explícita de limite de tokens antes da execução de rede;
3. **`BLOCKED_FOR_OPERATOR_AUTHORIZATION`**: O operador humano deve aprovar formalmente o teto de $0.25 USD e autorizar a execução em prompt posterior.

---

## 15. Human Authorization Required

- [ ] Autorização do teto de gastos: `$0.25 USD`
- [ ] Autorização de ajuste pontual das pré-condições do runner L2 (CLI flag `--allow-live` e token cap guard)
- [ ] Autorização explícita de tráfego de rede para os endpoints reais da TypeSafe e OpenAI
