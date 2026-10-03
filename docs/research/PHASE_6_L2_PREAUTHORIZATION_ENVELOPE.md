# Pacote de Pré-Autorização L2 (PHASE_6_L2_PREAUTHORIZATION_ENVELOPE.md)

<!--
L2_PREAUTHORIZATION_ENVELOPE_METADATA_START
SCHEMA_VERSION: 1.1.0
CREATED_AT: 2026-10-03
LAST_RECONCILED_AT: 2026-10-03
PHASE: Phase 6 (Voice Model Routing & Jev Evaluation)
STUDY: L2 Real Jev + Real OpenAI + Synthetic Transcript
PREAUTH_STATUS: PREAUTH_BLOCKED_FOR_RUNNER_HARDENING_AND_TOKEN_CAPS
L2_EXECUTION: NOT EXECUTED
L2_OPERATOR_COST_CEILING: NOT_AUTHORIZABLE
PROPOSED_COST_CEILING_USD: 0.25 (PLANNING_PROPOSAL)
HARD_MAX_PROVIDER_COST_STATUS: NOT_ENFORCEABLE
TYPESAFE_PRICE_STATUS: NOT_VERIFIED
OPENAI_PRICE_STATUS: VERIFIED
RUNTIME_ENFORCED_INPUT_TOKEN_CAP: NONE
TOKEN_CAP_ENFORCEMENT: NOT_ENFORCEABLE_AT_RUNTIME
AGGREGATE_OUTPUT_CAP: DERIVED_ENFORCEABLE_SUBJECT_TO_CAP_ISOLATION_TEST
CURRENT_RUNNER_FREEZE: PRE_HARDENING_REFERENCE
FUTURE_LIVE_RUNNER_FREEZE: MUST_BE_RECOMPUTED_AFTER_HARDENING
LIVE_COMMAND_STATUS: LIVE_COMMAND_NOT_YET_AUTHORIZABLE
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

| Propriedade | Valor de Referência (Pre-Hardening) | Evidência Factual |
| :--- | :--- | :--- |
| **L2_DATASET_PATH** | `scripts/benchmarks/voice/jev-openai-l2-synthetic-integration-v1-cases.json` | Arquivo rastreado no repositório |
| **L2_DATASET_VERSION** | `1.0.1` | Campo `version` no JSON do dataset |
| **L2_DATASET_CASE_COUNT** | `12` | 12 casos sintéticos estritos (7 matcher-positive, 5 matcher-negative) |
| **L2_DATASET_SHA256** | `bd812341a922ded1c7159191849dae284a88f24afd9c7e8d3c64f9b081602f3f` | Hash SHA-256 congelado |
| **L2_RUNNER_PATH** | `scripts/benchmarks/voice/run-jev-openai-l2-synthetic-integration.mjs` | Script rastreado |
| **CURRENT_RUNNER_FREEZE** | `PRE_HARDENING_REFERENCE` | Versão inicial pós-PR68 |
| **L2_RUNNER_SHA256** | `89c42ced37e04aafadb752f9fcc03e28fcb5409dfb2ff878c35eb8a1f98e4755` | Hash SHA-256 do runner atual |
| **L2_RUNNER_COMMIT_SHA** | `4cd15b1b0b6afe5a9f10b371eab387ae85bb8205` | Commit de introdução no PR #68 |
| **FUTURE_LIVE_RUNNER_FREEZE** | `MUST_BE_RECOMPUTED_AFTER_HARDENING` | Qualquer alteração no runner para hardening invalida o SHA atual |

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
- **OPENAI_PRICING_SOURCE_URL**: `https://openai.com/api/pricing/` (documentação oficial pública observada)
- **OPENAI_PRICING_OBSERVED_AT**: `2026-10-03`
- **OPENAI_MODEL_PRICED**: `gpt-4o-mini`
- **INPUT_PRICE**: `$0.15 USD por 1.000.000 tokens` (`$0.00000015 / token`)
- **CACHED_INPUT_PRICE**: `$0.075 USD por 1.000.000 tokens`
- **OUTPUT_PRICE**: `$0.60 USD por 1.000.000 tokens` (`$0.00000060 / token`)
- **PRICING_UNIT**: `USD per 1,000,000 tokens`

### TypeSafe Pricing
- **TYPESAFE_PRICE_STATUS**: `NOT_VERIFIED`
- **Motivo da Reclassificação**: A menção histórica a `$42 / Btok` ($0.042 / Mtok) provém de documentos internos de engenharia (ADR-019, planos L1B) e diretórios agregadores de terceiros, mas **não há uma URL pública oficial direta da TypeSafe acessível sem credenciais comprovando o faturamento**.
- **Regra Aplicada**: Evidência empírica de requisições em L1A/L1B comprova funcionamento técnico, mas NÃO comprova preço de billing. Na ausência de URL oficial pública direta observável, o status é estritamente `NOT_VERIFIED`.
- **MAX_PROJECTED_TYPESAFE_COST_USD**: `NOT_AUTHORIZABLE_AS_HARD_MAX` (mantido em $0.000294 USD exclusivamente como `PLANNING_ASSUMPTION_NOT_OFFICIALLY_VERIFIED`).

---

## 5. Request Caps & Enforcement Proof

| Parâmetro | Limite | Status de Imposição no Código | Prova por Teste Automatizado |
| :--- | :--- | :--- | :--- |
| `MAX_TYPESAFE_REQUESTS` | **7** | `PASS` (guarda pré-chamada em `checkCaps` antes de invocar `evaluateTypeSafeJev`) | `CODE_GUARDED_PRE_CALL_UNIT_TEST_ISOLATION_PENDING` (testado com sucesso em 12 casos, mas teste de exaustão de borda isolada para chamada 8 pendente) |
| `MAX_OPENAI_REQUESTS` | **12** | `PASS` (guarda pré-chamada em `checkCaps` antes de invocar `executeOpenAiTurn`) | `CODE_GUARDED_PRE_CALL_UNIT_TEST_ISOLATION_PENDING` |
| `TOTAL_MAX_PROVIDER_REQUESTS` | **19** | `PASS` (guarda em `checkCaps`) | `CODE_GUARDED_PRE_CALL_UNIT_TEST_ISOLATION_PENDING` |
| `CONCURRENCY` | **1** | `PASS` (execução serial estrita `for` loop) | `PASS` (verificado em suite de testes) |
| `PROVIDER_RETRIES` | **0** | `PASS` (sem mecanismo de retry configurado) | `PASS` (verificado em suite de testes) |

---

## 6. Token Budget & Semantics

### Distinção entre Premissas e Limites Fatuais

| Dimensão | Valor | Classificação Semântica | Status de Imposição |
| :--- | :--- | :--- | :--- |
| **Output Token Cap por Request** | **500** | `RUNTIME_ENFORCED_OUTPUT_CAP` | `ENFORCEABLE` (imposto via `maxCompletionTokens: 500` na configuração do adapter OpenAI) |
| **Aggregate Output Token Cap** | **6.000** | `DERIVED_AGGREGATE_OUTPUT_CAP` | `DERIVED_ENFORCEABLE_SUBJECT_TO_CAP_ISOLATION_TEST` (12 chamadas max * 500 tokens max) |
| **Input Token Assumption (Jev)** | **1.000** | `CONSERVATIVE_PLANNING_ASSUMPTION` | **`NONE`** (sem limitador ou validador ativo no runner) |
| **Input Token Assumption (OpenAI)** | **1.500** | `CONSERVATIVE_PLANNING_ASSUMPTION` | **`NONE`** (as elocuções sintéticas possuem ~40 tokens, mas não há guarda ativa no código) |
| **RUNTIME_ENFORCED_INPUT_TOKEN_CAP** | — | — | **`NONE`** |
| **TOKEN_CAP_ENFORCEMENT** | — | — | **`NOT_ENFORCEABLE_AT_RUNTIME`** (bloqueador obrigatório para execução live) |

---

## 7. Cost Model & Semantics

### Cenário de Planejamento (*Planning Scenario*)
Sob as premissas de planejamento (1.000 tokens in para Jev e 1.500 tokens in + 500 tokens out para OpenAI):
- **Custo Planejado TypeSafe**:
  $$rac{7 	imes 1.000}{1.000.000.000} 	imes $42 = $0,000294	ext{ USD}$$
- **Custo Planejado OpenAI**:
  $$left(rac{18.000}{1.000.000} 	imes $0,15ight) + left(rac{6.000}{1.000.000} 	imes $0,60ight) = $0,002700 + $0,003600 = $0,006300	ext{ USD}$$
- **PLANNING_SCENARIO_PROJECTED_COST_USD**:
  $$$0,000294 + $0,006300 = mathbf{$0,006594	ext{ USD}} (approx $0,0066	ext{ USD})$$

### Semântica de Autorização
- **HARD_MAX_PROVIDER_COST_STATUS**: **`NOT_ENFORCEABLE`**
  Como o teto de tokens de entrada não é tecnicamente imposto em runtime pelo runner, e a precificação oficial da TypeSafe está `NOT_VERIFIED`, o valor de $0,006594 **NÃO PODE** ser tratado como teto matemático rígido inviolável.
- **L2_OPERATOR_COST_CEILING**: **`NOT_AUTHORIZABLE`**
  A proposta de $0.25 USD permanece registrada como **`PLANNING_PROPOSAL`**, mas NÃO está apta para autorização formal antes do runner hardening.

---

## 8. Stop Conditions

A execução deve abortar imediatamente (*fail-fast*) sem retries sob:
1. `STOP_ON_TYPESAFE_MODEL_MISMATCH = YES` (modelo retornado pela TypeSafe difere de `jev-1.13.0`);
2. `STOP_ON_PROVIDER_AUTH_FAILURE = YES` (erro HTTP 401 ou 403 em qualquer provedor);
3. `STOP_ON_TIMEOUT_POLICY_BREACH = YES` (requisição excede `RESEARCH_HARNESS_TIMEOUT_MS = 5000ms`);
4. `STOP_ON_CONSECUTIVE_FAILURES = YES` (3 falhas técnicas consecutivas);
5. `STOP_ON_REQUEST_CAP_REACHED = YES` (tentativa de exceder 7 chamadas Jev, 12 chamadas OpenAI ou 19 totais);
6. `STOP_ON_DATASET_HASH_MISMATCH = YES` (hash SHA-256 do dataset difere de `bd812341a9...`);
7. `STOP_ON_RUNNER_HASH_OR_SHA_MISMATCH = YES` (runner divergir do SHA congelado pós-hardening);
8. `STOP_ON_UNEXPECTED_NETWORK_TARGET = YES` (qualquer conexão fora dos endpoints autorizados);
9. `STOP_ON_UNEXPECTED_DB_ACCESS = YES` (qualquer tentativa de conexão a banco de dados local ou nuvem);
10. `STOP_ON_UNEXPECTED_TWILIO_ACCESS = YES` (qualquer tentativa de carregar ou chamar Twilio);
11. `STOP_ON_HOLDOUT_ACCESS = YES` (qualquer tentativa de leitura do dataset de holdout);
12. `STOP_ON_ARTIFACT_WRITE_FAILURE = YES` (falha ao salvar o artefato sanitizado em disco).

---

## 9. Live Command Semantics

### Comando Incompleto Planejado:
```bash
node scripts/benchmarks/voice/run-jev-openai-l2-synthetic-integration.mjs --cost-ceiling 0.25
```

### Status:
**`LIVE_COMMAND_STATUS = LIVE_COMMAND_NOT_YET_AUTHORIZABLE`**
**`LIVE_COMMAND = NOT_YET_DEFINED`**

**Motivos:**
1. O CLI atual não aceita nem repassa a flag `--allow-live` necessária para contornar a guarda `validatePreconditions`;
2. A constante `OPENAI_PRICE_STATUS` está fixada como `'NOT_VERIFIED'` no runner;
3. O comando exato será formalmente congelado somente após o hardening do runner e cálculo do novo hash SHA-256.

---

## 10. Artifact Contract

- **Caminho de Saída**: `docs/research/results/phase-6-l2-real-jev-openai-synthetic-run1.json`
- **Sanitização Obrigatória**:
  - `transcripts`: Apenas elocuções sintéticas aprovadas do dataset;
  - `secrets`: Proibido conter chaves de API, tokens Bearer, headers Authorization ou variáveis de ambiente;
  - `customer_data`: 0;
  - `holdout_data`: 0.

---

## 11. Isolation Guarantees

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

## 12. Preauthorization Decision Matrix

| Requisito / Gate | Status Observado | Bloqueia Execução Live? |
| :--- | :--- | :--- |
| Dataset Frozen & Verificado | `PASS` (`bd812341a9...`) | Não |
| Runner Hardening & Re-Freeze | **`PENDING_HARDENING`** | **SIM** |
| TypeSafe Model Frozen (`jev-1.13.0`) | `PASS` | Não |
| OpenAI Model Frozen (`gpt-4o-mini`) | `PASS` | Não |
| OpenAI Pricing Verified | `PASS` (`$0.15 / 1M in`, `$0.60 / 1M out`) | Não |
| TypeSafe Pricing Verified | **`NOT_VERIFIED`** (sem URL oficial pública de billing) | **SIM** |
| Request Caps Pre-Call Guarded | `PASS` (guarda presente em código) | Não |
| Request Caps Boundary Unit Tests | **`PENDING_ISOLATED_TESTS`** | **SIM** |
| Token Caps Enforceable em Runtime | **`NOT_ENFORCEABLE_AT_RUNTIME`** | **SIM** |
| CLI Live Preconditions no Runner | **`BLOCKED (hardcoded NOT_VERIFIED / sem --allow-live)`** | **SIM** |
| Teto Financeiro Autorizado pelo Operador | **`NOT_AUTHORIZABLE`** (aguarda caps executáveis) | **SIM** |
| Autorização Humana Explícita | **`AWAITING_HUMAN_DECISION`** | **SIM** |

---

## 13. Remaining Blockers para Execução Live

1. **`BLOCKED_FOR_RUNNER_HARDENING`**: O runner necessita de hardening em slice de código dedicado para:
   - Aceitar e propagar flag `--allow-live` via CLI;
   - Atualizar/injetar `OPENAI_PRICE_STATUS = VERIFIED`;
   - Implementar guarda de limite de tokens de entrada em tempo de execução (`TOKEN_CAP_ENFORCEMENT`);
   - Adicionar testes de borda isolados comprovando o bloqueio de requisições excedentes antes da chamada de rede;
2. **`BLOCKED_FOR_TYPESAFE_OFFICIAL_BILLING_EVIDENCE`**: Ausência de URL pública oficial confirmando faturamento da TypeSafe a $42/Btok;
3. **`BLOCKED_FOR_OPERATOR_AUTHORIZATION`**: Autorização formal do operador humano para o teto de gastos e execução de rede, após conclusão do hardening e novo freeze.

---

## 14. Classificação Final do Envelope

**`PREAUTH_STATUS = PREAUTH_BLOCKED_FOR_RUNNER_HARDENING_AND_TOKEN_CAPS`**

*(Proibido classificar como `PREAUTH_READY`, `AUTHORIZED` ou `EXECUTED`).*
