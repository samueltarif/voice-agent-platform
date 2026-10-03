# Phase 6: TypeSafe L1B Controlled Synthetic Latency Study Plan

> **Documento**: `docs/research/PHASE_6_TYPESAFE_L1B_SYNTHETIC_LATENCY_PLAN.md`<br />
> **Status**: `PLAN DESIGNED / NOT EXECUTED`<br />
> **Data**: 2026-10-02<br />
> **Prompt de Origem**: `PROMPT-006AK-L1B-CONTROLLED-SYNTHETIC-LATENCY-PLANNING-001` / Hardening: `PROMPT-006AK-PR65-L1B-PLAN-HARDENING-AND-MERGE-001`<br />
> **Fase**: Phase 6 (Voice Model Routing & Jev Evaluation)<br />
> **Classificação**: `SYNTHETIC_LATENCY_STUDY_PLAN`<br />
> **Invariante Formal**: ZERO chamadas a provedores neste slice (TypeSafe = 0, OpenAI = 0, Twilio = 0). ZERO dados de clientes. ZERO acesso a holdout. Frozen Policy V1 inalterada. `ACTIVE_GUARDED = BLOCKED`.

---

## 1. Executive Summary & Purpose

Este documento estabelece o plano metodológico, as salvaguardas de governança, o desenho do dataset sintético e os limites de interpretação para o futuro estudo de latência controlada **L1B (Controlled Synthetic Latency Study)** com o modelo auxiliar TypeSafe Jev (`jev-1.13.0`).

O propósito do L1B Run 1 é estritamente **empírico, descritivo e observacional em linha de base sequencial**:
1. Medir a distribuição de latência de ponta a ponta do adapter TypeSafe sob estímulos sintéticos controlados em condições de rede externa real;
2. Observar variações de latência em função do tamanho do input textual (faixas SHORT, MEDIUM e LONG);
3. Avaliar o comportamento de latência em linha de base puramente sequencial (`concurrency = 1`, `MAX_PROVIDER_REQUESTS = 100`);
4. Gerar subsídios empíricos descritivos para a futura discussão sobre a seleção do timeout e limites de concorrência do modo `ACTIVE_GUARDED` em produção;
5. Garantir **isolamento absoluto de dados de clientes** (`CUSTOMER_TRANSCRIPT_PROVIDER_PROCESSING_GATE = NOT CLEARED`).

> [!IMPORTANT]
> **Separação de Escopo do Run 1**:
> O L1B Run 1 é estritamente sequencial (`concurrency = 1`, exatamente 100 requisições máximas). Qualquer exploração de concorrência ($C=2$) foi desmembrada deste run e postergada para um estudo subsequente independente (`L1B_CONCURRENCY_2_EXPLORATION = DEFERRED / NOT AUTHORIZED`).

---

## 2. Non-Goals Explícitos (O que o L1B NÃO é)

Para evitar qualquer desvio arquitetural ou violação de governança, os seguintes limites são categóricos:
1. **NÃO recalibra a Frozen Policy**: O L1B não avalia acurácia de classificação, não altera thresholds (`T_SECURITY`, `T_DETERMINISTIC`, `T_GENERATIVE`) e não propõe ajustes de pesos.
2. **NÃO utiliza nem abre o Locked Holdout**: O holdout canônico de 40 casos (`LOCKED_HOLDOUT = CONSUMED`) permanece estritamente intocado e isolado.
3. **NÃO seleciona automaticamente o timeout de produção**: A evidência empírica coletada servirá de insumo para uma decisão arquitetural humana separada e formal. O deadline de medição do teste (4000ms) NÃO é o timeout de produção.
4. **NÃO seleciona automaticamente a concorrência de produção**: A linha de base sequencial não substitui o dimensionamento de capacidade de produção nem os limites de taxa contratuais do provedor.
5. **NÃO ativa o modo ACTIVE_GUARDED**: A plataforma permanece com `ACTIVE_GUARDED = BLOCKED` (fail-closed) e `PRODUCTION_RUNTIME_WIRING = NO`.
6. **NÃO estabelece SLA de cauda (p99/p99.9)**: Uma amostra de N=100 casos possui natureza estatística descritiva, sendo insuficiente para garantias de cauda extrema de produção.

---

## 3. Evidência Histórica & Baseline Factual

As medições prévias disponíveis no repositório fornecem o contexto histórico de referência:

| Estudo / Marco | Amostra | Modelo | Concorrência | Latência Mediana | Latência p90 / p95 | Máxima | Taxa Sucesso | Classificação |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| **Historical Staging Shadow** (PR #47 / 006U) | N=12 | `jev-latest` -> `jev-1.13.0` | 1 (seq) | 275ms | p90: 311ms / p95: 450ms | 450ms | 12/12 (< 1500ms) | `HISTORICAL_STAGING_EVIDENCE` (não é evidência de produção) |
| **L1A Model Identity Smoke** (PR #64 / 006AJ) | N=20 | `jev-1.13.0` (pinned) | 1 (seq) | 275ms | p90: 316ms / p95: 317ms | 685ms | 20/20 (exact match) | `DESCRIPTIVE_ONLY` (smoke funcional, não prova de cauda) |

---

## 4. Questão Formal de Pesquisa (Research Question)

> **"Qual é a distribuição observada de latência do Jev versionado sob requests sintéticos controlados e estritamente sequenciais, sem dados de clientes?"**

Esta questão é puramente empírica e descritiva; não constitui compromisso de SLA contratual ou operacional.

---

## 5. Desenho e Auditoria Factual do Dataset Sintético

O dataset foi congelado e validado em:
- **Caminho**: `scripts/benchmarks/voice/jev-l1b-synthetic-latency-v1-cases.json`
- **Total de Casos**: 100 casos sintéticos
- **SHA-256**: `952da0c7a6a10447baa9e24a976543e06b7480eb9bdef98096242d5276188136`
- **Classificação**: `SYNTHETIC_LATENCY_STIMULUS_ONLY`
- **Métricas Factuais Auditadas por Faixa (Bins)**:

| Faixa (Bin) | Casos | Faixa Real de Caracteres | Heuristic Estimated Tokens (Min - Max) | Mediana de Tokens Estimados |
| :--- | :--- | :--- | :--- | :--- |
| **SHORT** | 35 | 24 a 60 caracteres | 6 a 15 tokens | 12 tokens |
| **MEDIUM** | 40 | 110 a 130 caracteres | 28 a 33 tokens | 31 tokens |
| **LONG** | 25 | 284 a 361 caracteres | 71 a 90 tokens | 84 tokens |
| **OVERALL** | 100 | 24 a 361 caracteres | 6 a 90 tokens | 30 tokens |

### 5.1 Terminologia de Estimativa de Tokens
- A contagem de tokens indicada no dataset é uma estimativa heurística aproximada (`HEURISTIC_ESTIMATED_TOKENS = Math.round(length / 4)`).
- `TOKENIZER_VERIFIED = NO` (não foi executado tokenizer proprietário do provedor).
- `PROVIDER_REPORTED_INPUT_TOKENS = NOT AVAILABLE / NOT EXECUTED`.
- O objetivo do L1B é telemetria de latência, não benchmarking de tokenização.

### 5.2 Governança de Dados, PII e Neutralidade de Domínio
- `REAL_CUSTOMER_DATA = 0` (zero transcrições ou logs de clientes reais).
- `REAL_CUSTOMER_PII = 0` (zero identificadores de pessoas reais).
- `SYNTHETIC_PERSON_LIKE_REFERENCES = YES` (referências fictícias como "Doutor Carlos", "minha mãe", "meu filho").
- `SYNTHETIC_HEALTH_CONTEXT = YES` (estímulos baseados em cenários de atendimento clínico/médico).
- `DATASET_DOMAIN_DISTRIBUTION`: 100% de cenários fictícios de recepção clínica/saúde.
- `L1B_LATENCY_GENERALIZATION`: **`LIMITED TO THIS SYNTHETIC STIMULUS DISTRIBUTION`**. O estudo não alega representatividade estatística para todos os setores ou use-cases da plataforma.

---

## 6. Tamanho da Amostra & Limites de Confiança Estatística

- **PLANNED_SAMPLE_SIZE**: **100 casos**
- **Justificativa**: $N=100$ fornece resolução descritiva satisfatória para análise de quartis e dispersão intermediária (mediana, p75, p90, p95).
- **TAIL_LATENCY_CONFIDENCE**: **`NOT ESTABLISHED`**
  - Uma amostra de 100 casos é estatisticamente insuficiente para determinar com confiança o comportamento de cauda extrema ($p99$ e $p99.9$).
  - O percentil 99 empírico em $N=100$ representa apenas a segunda pior observação da amostra e deve ser interpretado estritamente como estatística amostral descritiva, jamais como garantia de cauda para produção.

---

## 7. Arquitetura de Concorrência & Separação de Estudos

- **L1B Run 1 — Concorrência**: **`concurrency = 1`** (sequencial estrito).
- `L1B_RUN1_MAX_PROVIDER_REQUESTS = 100`.
- Elimina qualquer ambiguidade de enfileiramento local, contenção de portas TCP ou interferência entre requisições paralelas.
- **`L1B_CONCURRENCY_2_EXPLORATION = DEFERRED / NOT AUTHORIZED`**: A avaliação de concorrência $C=2$ é uma questão empírica distinta e foi desmembrada para um estudo futuro próprio, evitando o consumo desnecessário de 100 requisições adicionais sem revisão prévia.

---

## 8. Janela de Observação de Timeout vs. Timeout Operacional

- **DEADLINE DE MEDIÇÃO (`MEASUREMENT_ONLY_DEADLINE`)**: **4000ms**
  - Justificativa: Permite que requisições mais lentas terminem e registrem seu tempo real de resposta, evitando o truncamento artificial da cauda da distribuição.
- **DISTINÇÃO ARQUITETURAL MANDATÓRIA**:
  - `MEASUREMENT_ONLY_DEADLINE (4000ms) != PRODUCTION_JEV_TIMEOUT_MS`.
  - `PRODUCTION_JEV_TIMEOUT_MS = NOT SELECTED`.

---

## 9. Política de Tentativas (Retry Policy)

- **RETRIES**: **0** (Zero tentativas adicionais).
- Cada caso é executado exatamente uma vez.
- Em caso de timeout (> 4000ms), erro de rede ou erro HTTP do provedor (5xx, 429):
  - A falha é registrada com sua classificação técnica sanitizada;
  - O runner avança imediatamente para o próximo caso sem retries.

---

## 10. Governança de Identidade do Modelo (Model Pinning)

- **REQUESTED_MODEL**: `jev-1.13.0`
- **EXPECTED_PROVIDER_MODEL**: `jev-1.13.0`
- Todo response bem-sucedido deve comprovar que `response.providerModel === 'jev-1.13.0'`.
- `PRICE_SOURCE_STATUS_FOR_FUTURE_EXECUTION = MUST_REVERIFY_BEFORE_LIVE`.

---

## 11. Modelo de Custo & Correção da Unidade Aritmética

### 11.1 Correção da Unidade de Custo
O documento original continha uma divergência textual que associava `$42 / Btok` a `$0.000042 por token`.
- **Preço Histórico de Referência**: $42 por 1 bilhão de tokens de entrada ($42 / 1.000.000.000 tokens).
- **Valor Correto por Token**: **`$0.000000042 USD por token de entrada`** ($0.042 USD por 1 milhão de tokens).
- **Classificação**: `PR65_COST_UNIT_TEXT_ERROR = YES` (erro aritmético textual de documentação corrigido; zero impacto funcional ou de faturamento).

### 11.2 Limites Orçamentários Derivados para N=100

- Auditoria de Envelope Serializado: payload JSON completo entre 1.497 e 1.838 bytes, mediana 1.594 bytes.
- `TOKENIZER_VERIFIED = NO`
- `MAX_ESTIMATED_INPUT_TOKENS_PER_REQUEST = 1000`
- Classificação: `CONSERVATIVE_PROJECTED_TOKEN_BOUND`
- `MAX_PROJECTED_INPUT_TOKENS = 100000`

Cálculo textual:
100 requests × 1000 tokens/request = 100000 projected input tokens.

Preço histórico verificado:
$42 / Btok equivalente a $0.000000042 / input token

Cálculo:
100000 × $0.000000042 = $0.00420 USD.

Registrar:
- `MAX_PROJECTED_COST_USD = 0.00420`
- `PROPOSED_OPERATOR_PROJECTED_COST_CEILING_USD = 0.10`
- `ACTUAL_BILLED_COST_HARD_CAP = NOT VERIFIED`

---

## 12. Pacote Exato de Pré-Autorização Humana (L1B Run 1)

O pacote a ser submetido ao operador antes de qualquer execução live no próximo slice é rigorosamente exato e sem ambiguidades:

```
==================================================
L1B RUN 1 PREAUTHORIZATION PACKAGE (EXACT)
==================================================
MODEL_ID:
jev-1.13.0

DATASET_PATH:
scripts/benchmarks/voice/jev-l1b-synthetic-latency-v1-cases.json

DATASET_CASES:
100

DATASET_SHA256:
952da0c7a6a10447baa9e24a976543e06b7480eb9bdef98096242d5276188136

SERIAL_REQUESTS_PLANNED:
100

LOW_CONCURRENCY_REQUESTS_PLANNED:
0 (DEFERRED)

TOTAL_MAX_REQUESTS:
100

CONCURRENCY:
1

RETRIES:
0

MAX_ESTIMATED_INPUT_TOKENS:
100000

CONSERVATIVE_PROJECTED_TOKENS_PER_REQUEST:
1000

MAX_PROJECTED_COST_USD:
$0.00420 USD

PROPOSED_HUMAN_COST_CEILING_USD:
$0.10 USD

ACTUAL_BILLED_COST_HARD_CAP:
NOT VERIFIED

CUSTOMER_DATA_EXPOSURE:
0

OPENAI_CALLS:
0

TWILIO_CALLS:
0

Authorization required:

AUTORIZO_L1B_TYPESAFE_N100 = YES
COST_CEILING_USD = 0.10
==================================================
```

> **Significado Normativo de `AUTORIZO_L1B_TYPESAFE_N100 = YES`**:
> Autoriza estritamente até 100 requisições sequenciais contra o endpoint TypeSafe, nunca 101 ou mais.

---

## 13. Esquema do Artefato de Resultado (Result Artifact Schema)

O artefato será persistido em: `docs/research/results/phase-6-typesafe-l1b-synthetic-latency-run1.json`

Campos padronizados:
- **metadata**:
  - `suite`: "phase-6-typesafe-l1b-synthetic-latency"
  - `executedAt`: timestamp ISO
  - `requestedModel`: "jev-1.13.0"
  - `expectedProviderModel`: "jev-1.13.0"
  - `datasetPath`: "scripts/benchmarks/voice/jev-l1b-synthetic-latency-v1-cases.json"
  - `datasetSha256`: "952da0c7a6a10447baa9e24a976543e06b7480eb9bdef98096242d5276188136"
  - `totalCasesPlanned`: 100
  - `maxProviderRequests`: 100
  - `concurrency`: 1
  - `observationDeadlineMs`: 4000
  - `retries`: 0
  - `customerData`: 0
  - `openAiCalls`: 0
  - `twilioCalls`: 0
  - `projectedCostCeilingUsd`: 0.10
  - `actualBilledCostUsd`: "NOT_VERIFIED"
  - `latencyClassification`: "DESCRIPTIVE_ONLY"
  - `productionTimeoutSelected`: false
  - `productionConcurrencySelected`: false
- **aggregates**:
  - `requestsAttempted`, `requestsSucceeded`, `modelMatches`, `modelMismatches`, `technicalFailures`, `timeouts`
  - `latency`:
    - `medianMs`, `p75Ms`, `p90Ms`, `p95Ms`, `p99EmpiricalMs`, `maxMs`, `minMs`
    - `classification`: "DESCRIPTIVE_ONLY"
  - `binBreakdown`:
    - SHORT: { count, medianMs, p90Ms, maxMs }
    - MEDIUM: { count, medianMs, p90Ms, maxMs }
    - LONG: { count, medianMs, p90Ms, maxMs }
  - `completionUnder1500msCount`, `completionUnder1500msRate`
- **cases**: lista sanitizada de cada execução:
  - `caseId`, `inputSizeCategory`, `status`, `providerModel`, `identityMatch`, `latencyMs`, `errorCategory` (se houver)

---

## 14. Condições de Parada Emergencial (Stop Conditions)

Classificadas estritamente por natureza:

### 14.1 Paradas Obrigatórias de Segurança e Governança
1. **Erro HTTP 401 / 403 (Autenticação/Autorização)**: STOP imediato. Não repetir.
2. **Violação do Teto de Custo Projetado**: Se o custo acumulado atingir $0.10 USD, STOP imediato.
3. **Corrupção de Integridade do Dataset**: Se o hash do arquivo local divergir do hash congelado, STOP antes de iniciar.
4. **Model Identity Mismatch**: Se ocorrer divergência de `providerModel`, STOP imediato do experimento para análise humana de drift.

### 14.2 Tratamento de Erros Transitórios de Provedor
- Falhas técnicas individuais (HTTP 5xx, timeouts de rede > 4000ms): registrar a falha no caso correspondente e avançar sem retry.
- **RESEARCH_SAFETY_HEURISTIC**: Caso ocorram 3 erros técnicos ou timeouts consecutivos, o runner interrompe a execução para evitar queima inútil de chamadas sob falha sistêmica do provedor externo. Esta heurística é uma salvaguarda instrumental de pesquisa, **NÃO um circuit-breaker de produto**.

---

## 15. Classificação de Resultados

- **RUN_COMPLETION**: Todos os 100 casos tentados e classificados factualmente.
- **PROVIDER_SUCCESS_RATE**: Taxa observada de respostas HTTP válidas.
- **MODEL_IDENTITY_ACCEPTED_RESPONSES**: 100% de exata correspondência (`jev-1.13.0`).
- **PASS_COMPLETE**: Atribuído somente se 100% dos 100 casos forem completados com sucesso sob o deadline de 4000ms e com exata identidade de modelo confirmada. Caso contrário, reportar `PARTIAL_PROVIDER_FAILURE`, `BLOCKED` ou `NOT VERIFIED` com contagens exatas.

---

## 16. Fronteiras de Decisão de Produção

- **Timeout**: Evidência L1B $\rightarrow$ Revisão Arquitetural $\rightarrow$ Candidato a Timeout $\rightarrow$ Canary $\rightarrow$ Seleção Formal de `PRODUCTION_JEV_TIMEOUT_MS`. O L1B não seleciona timeout de produção.
- **Concorrência**: Evidência sequencial L1B $\ne$ capacidade de concorrência em produção. `PRODUCTION_ACTIVE_GUARDED_MAX_CONCURRENCY = NOT SELECTED` permanece inalterado.

---

## 17. Status de Execução e Próximo Passo

> **Status do Runner**: `L1B_RUNNER = IMPLEMENTED / TESTED OFFLINE` (`scripts/benchmarks/voice/run-jev-l1b-synthetic-latency.mjs`).
> **Procedimento Pré-Live**: `INTEGRATIONS_DIST_REFRESH_REQUIRED_BEFORE_LIVE = YES` (`pnpm --filter @voice-agent/integrations build` executado e verificado).
> **Status de Execução**: `L1B_PROVIDER_EXECUTION = EXECUTED / PASS_COMPLETE`.
> **Classificação de Resultado**: `PASS_COMPLETE` (100/100 sucessos com exact match `jev-1.13.0`, 0 mismatches, 0 falhas técnicas, 0 timeouts, 100% completados sob o deadline de 4000ms).

Após a conclusão bem-sucedida do L1B Run 1:
- **NEXT_ALLOWED_STEP**: Revisão de evidências e fechamento do PR #66.
- Manter `ACTIVE_GUARDED = BLOCKED`.
- `PRODUCTION_JEV_TIMEOUT_MS = NOT SELECTED`.
- `PRODUCTION_ACTIVE_GUARDED_MAX_CONCURRENCY = NOT SELECTED`.

---

## 18. Resultados Fatuais do Run 1 (L1B Live Execution)

- **Data da Execução**: 2026-10-02 (2026-10-03T01:50:07.694Z)
- **Autorização do Operador**: `OBSERVED` (`AUTORIZO_L1B_TYPESAFE_N100 = YES`, `COST_CEILING_USD = 0.10`)
- **Artefato de Resultados**: `docs/research/results/phase-6-typesafe-l1b-synthetic-latency-run1.json`
- **SHA-256 do Artefato**: `f087a6e3ad83fc81b272ffd775d5e66d00c6e7c918d310ca54f45237d59f1cdb`
- **Dataset Utilizado**: `scripts/benchmarks/voice/jev-l1b-synthetic-latency-v1-cases.json` (N=100, SHA-256 `952da0c7a6a10447baa9e24a976543e06b7480eb9bdef98096242d5276188136`)
- **Modelo Solicitado / Esperado / Observado**: `jev-1.13.0` / `jev-1.13.0` / `jev-1.13.0` (100/100 exact matches, 0 mismatches)
- **Contabilidade de Requisições**:
  - `requestsAttempted`: 100
  - `requestsSucceeded`: 100
  - `technicalFailures`: 0
  - `timeouts`: 0
- **Métricas de Latência (DESCRIPTIVE_ONLY — Tail Confidence: NOT ESTABLISHED)**:
  - `minMs`: 229ms
  - `medianMs`: 257ms
  - `p75Ms`: 273ms
  - `p90Ms`: 302ms
  - `p95Ms`: 325ms
  - `p99EmpiricalMs`: 380ms
  - `maxMs`: 385ms
  - `completionUnder1500ms`: 100/100 (100%, taxa 1.0)
- **Detalhamento por Categoria de Entrada**:
  - `SHORT` (N=35): mediana 257ms, p90 313ms, max 385ms
  - `MEDIUM` (N=40): mediana 255ms, p90 284ms, max 336ms
  - `LONG` (N=25): mediana 270ms, p90 325ms, max 340ms
- **Métricas Financeiras**:
  - Preço Verificado: $42 / Btok ($0.000000042 / input token; output gratuito)
  - Teto Aprovado: $0.10 USD
  - Custo Máximo Projetado Pré-Run: $0.00420 USD
  - Custo Estimado Derivado da Execução: $0.00420 USD (Upper Bound)
  - `ACTUAL_BILLED_COST_USD`: `NOT_VERIFIED`
- **Fronteiras Arquiteturais Mantidas**:
  - `PRODUCTION_JEV_TIMEOUT_MS`: `NOT SELECTED`
  - `PRODUCTION_ACTIVE_GUARDED_MAX_CONCURRENCY`: `NOT SELECTED`
  - `CUSTOMER_TRANSCRIPT_PROVIDER_PROCESSING_GATE`: `NOT CLEARED`
  - `PRODUCTION_RUNTIME_WIRING`: `NO`
  - `ACTIVE_GUARDED`: `BLOCKED`
  - `LOCKED_HOLDOUT`: `CONSUMED` (zero acesso ao holdout)
