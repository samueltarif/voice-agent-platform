# Phase 6: TypeSafe L1B Controlled Synthetic Latency Study Plan

> **Documento**: `docs/research/PHASE_6_TYPESAFE_L1B_SYNTHETIC_LATENCY_PLAN.md`<br />
> **Status**: `PLAN DESIGNED / NOT EXECUTED`<br />
> **Data**: 2026-10-02<br />
> **Prompt de Origem**: `PROMPT-006AK-L1B-CONTROLLED-SYNTHETIC-LATENCY-PLANNING-001`<br />
> **Fase**: Phase 6 (Voice Model Routing & Jev Evaluation)<br />
> **Classificação**: `SYNTHETIC_LATENCY_STUDY_PLAN`<br />
> **Invariante Formal**: ZERO chamadas a provedores neste slice (TypeSafe = 0, OpenAI = 0, Twilio = 0). ZERO dados de clientes. ZERO acesso a holdout. Frozen Policy V1 inalterada. `ACTIVE_GUARDED = BLOCKED`.

---

## 1. Executive Summary & Purpose

Este documento estabelece o plano metodológico, as salvaguardas de governança, o desenho do dataset sintético e os limites de interpretação para o futuro estudo de latência controlada **L1B (Controlled Synthetic Latency Study)** com o modelo auxiliar TypeSafe Jev (`jev-1.13.0`).

O propósito do L1B é estritamente **empírico, descritivo e observacional**:
1. Medir a distribuição de latência de ponta a ponta do adapter TypeSafe sob estímulos sintéticos controlados em condições de rede externa real;
2. Observar variações de latência em função do tamanho do input textual (faixas SHORT, MEDIUM e LONG);
3. Avaliar o comportamento de latência em linha de base sequencial (`concurrency = 1`) e exploratória em baixa concorrência (`concurrency = 2`);
4. Gerar subsídios empíricos descritivos para a futura discussão sobre a seleção do timeout e limites de concorrência do modo `ACTIVE_GUARDED` em produção;
5. Garantir **isolamento absoluto de dados de clientes** (`CUSTOMER_TRANSCRIPT_PROVIDER_PROCESSING_GATE = NOT CLEARED`).

---

## 2. Non-Goals Explícitos (O que o L1B NÃO é)

Para evitar qualquer desvio arquitetural ou violação de governança, os seguintes limites são categóricos:
1. **NÃO recalibra a Frozen Policy**: O L1B não avalia acurácia de classificação, não altera thresholds (`T_SECURITY`, `T_DETERMINISTIC`, `T_GENERATIVE`) e não propõe ajustes de pesos.
2. **NÃO utiliza nem abre o Locked Holdout**: O holdout canônico de 40 casos (`LOCKED_HOLDOUT = CONSUMED`) permanece estritamente intocado e isolado.
3. **NÃO seleciona automaticamente o timeout de produção**: A evidência empírica coletada servirá de insumo para uma decisão arquitetural humana separada e formal. O deadline de medição do teste (4000ms) NÃO é o timeout de produção.
4. **NÃO seleciona automaticamente a concorrência de produção**: A exploração de baixa concorrência (C=2) não substitui o dimensionamento de capacidade de produção nem os limites de taxa contratuais do provedor.
5. **NÃO ativa o modo ACTIVE_GUARDED**: A plataforma permanece com `ACTIVE_GUARDED = BLOCKED` (fail-closed) e `PRODUCTION_RUNTIME_WIRING = NO`.
6. **NÃO estabelece SLA de cauda (p99/p99.9)**: Uma amostra de N=100 casos possui natureza estatística descritiva, sendo insuficiente para garantias de cauda extrema de produção.

---

## 3. Evidência Histórica & Baseline Factual

As medições prévias disponíveis no repositório fornecem o contexto histórico de referência:

| Estudo / Marco | Amostra | Modelo | Concorrência | Latência Mediana | Latência p90 / p95 | Máxima | Taxa Sucesso | Classificação |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| **Historical Staging Shadow** (PR #47 / 006U) | N=12 | `jev-latest` -> `jev-1.13.0` | 1 (seq) | 275ms | p90: 311ms / p95: 450ms | 450ms | 12/12 (< 1500ms) | `HISTORICAL_STAGING_EVIDENCE` (não é evidência de produção) |
| **L1A Model Identity Smoke** (PR #64 / 006AJ) | N=20 | `jev-1.13.0` (pinned) | 1 (seq) | 275ms | p90: 316ms / p95: 317ms | 685ms | 20/20 (exact match) | `DESCRIPTIVE_ONLY` (smoke funcional, não prova de cauda) |

> [!NOTE]
> Tanto o staging exploratório quanto o smoke L1A convergiram em uma mediana descritiva de ~275ms. O estudo L1B expande a amostragem para N=100 a fim de observar a dispersão da distribuição e o impacto do tamanho de entrada.

---

## 4. Questão Formal de Pesquisa (Research Question)

> **"Qual é a distribuição observada de latência do Jev versionado sob requests sintéticos controlados e sequenciais/baixa concorrência, sem dados de clientes?"**

Esta questão é puramente empírica e não deve ser confundida ou tratada como um compromisso de SLA contratual ou operacional.

---

## 5. Desenho do Dataset Sintético de Latência

O dataset foi desenhado especificamente para este estudo e congelado em:
- **Caminho**: `scripts/benchmarks/voice/jev-l1b-synthetic-latency-v1-cases.json`
- **Total de Casos**: 100 casos sintéticos
- **SHA-256**: `952da0c7a6a10447baa9e24a976543e06b7480eb9bdef98096242d5276188136`
- **Classificação**: `SYNTHETIC_LATENCY_STIMULUS_ONLY`
- **Invariantes do Dataset**:
  - Zero dados de clientes reais;
  - Zero PII (informações pessoais identificáveis);
  - Sem sobreposição com o Locked Holdout ou Calibration cases;
  - Não utilizável para tuning de modelo ou alegações de acurácia.

---

## 6. Faixas de Tamanho de Entrada (Input Size Bins)

Para observar a correlação empírica entre tamanho de prompt e latência de resposta, o dataset divide-se em 3 categorias:

| Faixa (Bin) | Casos | Faixa de Tokens Estimada | Faixa de Caracteres | Exemplo Típico |
| :--- | :--- | :--- | :--- | :--- |
| **SHORT** | 35 | ~1 a 15 tokens | ~15 a 60 caracteres | "Vocês abrem aos sábados?" |
| **MEDIUM** | 40 | ~16 a 50 tokens | ~60 a 200 caracteres | "Boa tarde, gostaria de saber se vocês atendem no sábado pela manhã e qual é o valor da consulta inicial com ortopedista." |
| **LONG** | 25 | ~51 a 150 tokens | ~200 a 600 caracteres | Declarações complexas com múltiplos questionamentos, histórico prévio e detalhes contextuais. |

---

## 7. Tamanho da Amostra & Limites de Confiança Estatística

- **PLANNED_SAMPLE_SIZE**: **100 casos**
- **Justificativa da Amostragem**: N=100 fornece resolução descritiva satisfatória para análise de quartis e percentis intermediários (mediana, p75, p90, p95).
- **TAIL_LATENCY_CONFIDENCE**: **`NOT ESTABLISHED`**
  - Uma amostra de 100 casos é estatisticamente insuficiente para determinar com confiança o comportamento de cauda extrema (p99 e p99.9).
  - O percentil 99 empírico em N=100 representa apenas a segunda pior observação da amostra e deve ser interpretado estritamente como estatística amostral descritiva, jamais como garantia de cauda para produção.

---

## 8. Arquitetura de Concorrência (Concurrency Design)

O estudo é estruturado em duas etapas controladas:

1. **Etapa 1 — Linha de Base Sequencial (`SERIAL_BASELINE`)**:
   - `concurrency = 1` (execução sequencial estrita dos 100 casos);
   - Isola completamente efeitos de enfileiramento local e saturação no client-side;
   - Fornece a linha de base pura de latência de rede e processamento do modelo.

2. **Etapa 2 — Baixa Concorrência Exploratória (`LOW_CONCURRENCY_EXPLORATORY`)**:
   - `concurrency = 2` (execução em lotes de 2 requisições concorrentes sob subconjunto ou repetição controlada);
   - Objetivo: verificar se há saltos abruptos de latência sob concorrência mínima;
   - **Trava de Segurança**: Concorrência superior a 2 é **estritamente proibida** neste estágio sem nova revisão arquitetural e autorização explícita do operador;
   - Esta etapa NÃO define nem seleciona `PRODUCTION_ACTIVE_GUARDED_MAX_CONCURRENCY`.

---

## 9. Janela de Observação de Timeout vs. Timeout Operacional

- **DEADLINE DE MEDIÇÃO (`MEASUREMENT_ONLY_DEADLINE`)**: **4000ms**
  - Justificativa: Um deadline de 4000ms permite que requisições mais lentas terminem e registrem seu tempo real de resposta, evitando o truncamento artificial da cauda da distribuição.
- **DISTINÇÃO ARQUITETURAL MANDATÓRIA**:
  - `MEASUREMENT_ONLY_DEADLINE (4000ms) != PRODUCTION_JEV_TIMEOUT_MS`.
  - O deadline largo é uma ferramenta instrumental de telemetria científica, não uma tolerância operacional para chamadas de voz de clientes em tempo real.

---

## 10. Política de Tentativas (Retry Policy)

- **RETRIES**: **0** (Zero tentativas adicionais).
- Cada caso é executado exatamente uma vez.
- Em caso de timeout (excedendo 4000ms), erro de rede ou erro HTTP do provedor (5xx, 429):
  - A falha é registrada com sua classificação técnica sanitizada;
  - O runner avança imediatamente para o próximo caso sem retries automáticos.

---

## 11. Governança de Identidade do Modelo (Model Pinning)

- **REQUESTED_MODEL**: `jev-1.13.0`
- **EXPECTED_PROVIDER_MODEL**: `jev-1.13.0`
- Todo response bem-sucedido deve comprovar que `response.providerModel === 'jev-1.13.0'`.
- Em caso de mismatch, o evento deve ser registrado no artefato e contabilizado como `modelMismatches`, sem abortar silenciosamente.

---

## 12. Modelo de Custo & Limites Orçamentários

- **Preço de Referência Histórico**: $42 / Btok input ($0.000042 por token).
- **Projeção de Consumo**:
  - Tokens médios por caso: ~75 tokens.
  - Total para N=100: ~7.500 a 20.000 tokens de entrada.
  - Custo projetado para 100 requisições: ~$0.00031 a $0.00084 USD.
  - Custo projetado com fase concorrente (até 200 reqs): ~$0.00168 USD.
- **Teto Orçamentário Proposto para Autorização Humana**: **$0.10 USD**
  - Oferece margem de segurança de > 50x sobre o consumo projetado.
- **PROJECTED_COST_CEILING_GUARD**: O runner deve conter guarda determinística que interrompe a execução caso o custo acumulado projetado atinja o teto antes do término da bateria.

---

## 13. Portão de Pré-Autorização Humana (Human Preauthorization Gate)

Nenhuma chamada real ao TypeSafe será executada sem que o operador receba e autorize explicitamente o seguinte pacote de dados em um prompt futuro dedicado:

```
==================================================
L1B PREAUTHORIZATION PACKAGE
==================================================
MODEL_ID: jev-1.13.0
DATASET_PATH: scripts/benchmarks/voice/jev-l1b-synthetic-latency-v1-cases.json
DATASET_CASES: 100
DATASET_SHA256: 952da0c7a6a10447baa9e24a976543e06b7480eb9bdef98096242d5276188136
SERIAL_REQUESTS_PLANNED: 100
LOW_CONCURRENCY_REQUESTS_PLANNED: 0 a 100
TOTAL_MAX_REQUESTS: 100 a 200
RETRIES: 0
ESTIMATED_INPUT_TOKENS: ~20.000
ESTIMATED_UPPER_BOUND_COST_USD: $0.0021
PROPOSED_HUMAN_COST_CEILING_USD: $0.10
CUSTOMER_DATA_EXPOSURE: 0
OPENAI_CALLS: 0
TWILIO_CALLS: 0
AUTORIZAÇÃO REQUERIDA: AUTORIZO_L1B_TYPESAFE_N100 = YES
==================================================
```

---

## 14. Procedimento de Execução Planejado (Para Futuro Slice)

Quando autorizado, a execução seguirá o fluxo:
1. Validar que `.env` existe sem inspecionar nem ecoar seu conteúdo;
2. Verificar a consistência e integridade do dataset sintético via hash SHA-256;
3. Executar o runner L1B em processo isolado (`node --env-file=.env scripts/benchmarks/voice/run-jev-l1b-synthetic-latency.mjs`);
4. Gravar os resultados no artefato canônico sanitizado;
5. Executar auditoria de segredos de valor-cego (`SECRET_AUDIT_PASS`).

---

## 15. Esquema do Artefato de Resultado (Result Artifact Schema)

O artefato será gerado em: `docs/research/results/phase-6-typesafe-l1b-synthetic-latency-run1.json`

Campos obrigatórios:
- **metadata**:
  - `suite`: "phase-6-typesafe-l1b-synthetic-latency"
  - `executedAt`: timestamp ISO
  - `requestedModel`: "jev-1.13.0"
  - `expectedProviderModel`: "jev-1.13.0"
  - `datasetPath`: caminho relativo do dataset
  - `datasetSha256`: hash do dataset
  - `totalCasesPlanned`: 100
  - `concurrency`: 1 (ou 2 na etapa correspondente)
  - `observationDeadlineMs`: 4000
  - `retries`: 0
  - `customerData`: 0
  - `openAiCalls`: 0
  - `twilioCalls`: 0
  - `projectedCostCeilingUsd`: 0.10
  - `actualBilledCostUsd`: "NOT_VERIFIED"
- **aggregates**:
  - `requestsAttempted`, `requestsSucceeded`, `modelMatches`, `technicalFailures`, `timeouts`
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

> [!CAUTION]
> **Proibição Absoluta de Segredos e Dados Sensíveis**:
> O artefato JAMAIS conterá chaves de API, cabeçalhos de autorização brutos, prompts de clientes ou dump de variáveis de ambiente.

---

## 16. Métricas de Latência & Terminologia Normativa

As métricas calculadas serão estritamente:
- **medianMs (p50)**: Ponto central da distribuição empírica.
- **p75Ms**: Terceiro quartil descritivo.
- **p90Ms**: Dispersão moderada.
- **p95Ms**: Indicador descritivo de cauda intermediária.
- **p99EmpiricalMs**: Estatística descritiva da amostra (segundo maior valor em N=100); **NÃO É UM SLA**.
- **maxMs / minMs**: Extremos absolutos observados.
- **completionRateUnder1500ms**: Percentual de requisições concluídas sob o limiar histórico de staging.

---

## 17. Critérios de Aceitação do Estudo (Acceptance Criteria)

O estudo L1B será avaliado conforme os seguintes critérios:
- **Critério A (Execução Completa)**: 100% dos 100 casos do dataset executados com resposta observada (sucesso ou erro técnico classificado).
- **Critério B (Identidade do Modelo)**: 100% dos casos aceitos devem retornar `providerModel === 'jev-1.13.0'`.
- **Critério C (Isolamento de Dados)**: Zero dados reais de clientes (100% de casos sintéticos).
- **Critério D (Zero Retries)**: Exatamente zero chamadas repetidas por falha ou timeout.
- **Critério E (Blindagem de Segredos)**: Zero tokens, chaves ou credenciais expostas (`SECRET_AUDIT_PASS`).
- **Critério F (Controle Orçamentário)**: Custo projetado rigorosamente contido dentro do teto aprovado de $0.10 USD.
- **Critério G (Invariante da Frozen Policy)**: Zero alterações nos thresholds da política congelada.

---

## 18. Classificação de Resultados

Ao término da futura execução, o resultado será classificado como:
- **PASS_COMPLETE**: Todos os 100 casos completados sob o deadline de medição com identidade de modelo confirmada e zero violações operacionais.
- **PARTIAL_PROVIDER_FAILURE**: Bateria completada mas com ocorrência de falhas técnicas ou timeouts de rede transitórios registrados.
- **BLOCKED**: Execução inviabilizada por falha de autenticação (401/403), interrupção pelo teto de custo ou erro estrutural de rede.
- **NOT VERIFIED**: Interrupção anormal sem evidência conclusiva gerada.

---

## 19. Fronteira de Decisão de Timeout de Produção (Production Timeout Decision Boundary)

O fluxo de decisão para fixação de timeout em produção é estritamente desacoplado deste teste:

```
[L1B Synthetic Latency Evidence]
               │
               ▼
[Revisão Arquitetural & Humana]
               │
               ▼
[Seleção de Candidato a Timeout de Produção (ex: 600ms, 800ms)]
               │
               ▼
[Validação Controlada em Canary (Sem Dados de Clientes)]
               │
               ▼
[Congelamento Formal de PRODUCTION_JEV_TIMEOUT_MS]
```

O L1B produz a evidência factual inicial; ele **NÃO seleciona nem congela** o timeout de produção.

---

## 20. Fronteira de Decisão de Concorrência de Produção (Production Concurrency Boundary)

- A observação de concorrência C=1 e C=2 no L1B avalia apenas a sensibilidade imediata do endpoint da TypeSafe sob tráfego sintético mínimo.
- A fixação de `PRODUCTION_ACTIVE_GUARDED_MAX_CONCURRENCY` requer análise formal de volume de chamadas simultâneas, capacidade de processamento do orchestrator, semântica de backpressure (fail-open) e limites contratuais do provedor.
- Portanto, `PRODUCTION_ACTIVE_GUARDED_MAX_CONCURRENCY = NOT SELECTED` permanece inalterado após este plano e após a execução do L1B.

---

## 21. Condições de Parada Emergencial (Stop Conditions)

Durante a futura execução do runner L1B, o script deve abortar imediatamente se:
1. O custo projetado acumulado atingir ou ultrapassar o teto aprovado ($0.10 USD);
2. Ocorrerem 3 timeouts consecutivos sob o deadline de 4000ms;
3. O provedor retornar erro HTTP 401 (Unauthorized) ou 403 (Forbidden);
4. Ocorrerem 3 mismatches consecutivos de modelo (indicativo de descontinuação ou alteração remota de rota).

---

## 22. Próximo Passo Permitido

Após a revisão e merge deste plano metodológico:
- **NEXT_ALLOWED_STEP**: Submissão do pacote de pré-autorização formal ao operador humano para autorização da execução L1B.
- **AÇÕES PROIBIDAS**:
  - Não executar chamadas TypeSafe reais neste momento;
  - Não carregar `.env`;
  - Não executar OpenAI ou Twilio;
  - Não conectar ao banco de dados;
  - Não ativar `ACTIVE_GUARDED`.
