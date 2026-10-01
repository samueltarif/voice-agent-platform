# Phase 6 — TypeSafe Staging Shadow Latency Measurement Evidence Result

## 1. Sumário Executivo

Este documento consolida a evidência factual observada na execução da bateria controlada de medição de latência do TypeSafe Jev através da composição `staging-synthetic SHADOW`, autorizada formalmente sob `PROMPT-006U-TYPESAFE-STAGING-LATENCY-EXECUTION-001` e desenhada no plano mergeado do PR #47.

A bateria consistiu em exatamente **1 invocação de comando runner** executando sequencialmente **12 casos sintéticos** (4 SHORT, 4 MEDIUM, 4 LONGER), com guardião em camadas (ledger atômico em disco e guardião de despacho em memória).

Todas as 12 requisições obtiveram resposta válida do provedor sob o deadline de medição de 4000ms. A latência observada variou entre **249ms e 450ms**, com **mediana de 275ms**, resultando em **taxa de conclusão de 100% sob 1500ms** e **zero timeouts**.

Com base nos resultados desta amostra exploratória (N=12), formaliza-se a decisão humana de manter o timeout nominal de staging-synthetic em 1500ms (`STAGING_TIMEOUT_DECISION = KEEP_1500MS_FOR_STAGING_SYNTHETIC`).

---

## 2. Invariantes de Governança, Segurança e Limites Operacionais

- **Customer Data**: `NO` (`CUSTOMER_TRANSCRIPT_PROVIDER_PROCESSING_GATE = NOT CLEARED`).
- **Locked Holdout**: `TOUCHED = NO` (`LOCKED_HOLDOUT = CONSUMED` preservado integralmente).
- **Frozen Policy**: `TOUCHED = NO` (política de roteamento congelada mantida intocada).
- **Production Wiring**: `NO` (composição restrita ao ambiente staging-synthetic).
- **ACTIVE_GUARDED**: `BLOCKED` (fail-closed, sem bypass determinístico).
- **Provedores de Produção**:
  - `OpenAI live calls`: `0`
  - `Twilio live calls`: `0`
- **Autorização Orçamentária**:
  - `AUTHORIZED_EXPERIMENT_BUDGET_CAP_USD`: `$0.01 USD`
  - `ACTUAL_BILLED_REQUEST_COUNT`: `NOT VERIFIED` (consulta a API de faturamento desautorizada)
  - `ACTUAL_BILLED_COST_USD`: `NOT VERIFIED`
- **Env / Segredos**:
  - `.env loaded`: `YES` durante a execução única do runner em 006U; `NO` em prompts posteriores.
  - `TYPESAFE_API_KEY_PRESENT`: `true` (validação puramente booleana; nenhuma chave ou header exposto).

---

## 3. Caminho de Execução (Execution Path)

Cada caso foi executado obrigatoriamente através da cadeia de composição completa:
```
createStagingSyntheticShadowComposition (options: timeoutMs=4000, maxConcurrency=1, environment='staging')
  └── AuxiliaryTurnShadowObserver (mode: 'SHADOW')
        └── TimedAuxiliaryTurnDecisionPort (timeoutMs: 4000)
              └── TypeSafeJevTurnDecisionAdapter
                    └── TypeSafe Provider (HTTP POST https://api.typesafe.ai/v1/systemone)
```

Nenhum adapter ou porta foi invocado diretamente como atalho ou substituto da composição.

---

## 4. Parâmetros de Execução & Controles Anti-Ambiguidade

- **Base Main SHA**: `42fed6e8eba88275536b0b3ed8a5d29126c6ced8`
- **Branch de Execução**: `research/006u-typesafe-staging-latency-execution`
- **Runner Invocations**: `1` (`RUNNER_COMMAND_INVOCATIONS_MAX = 1`)
- **Comando Executado**: `node --env-file=.env ./node_modules/vitest/vitest.mjs run apps/voice/src/tmp-006u-staging-latency-runner.test.ts`
- **Measurement Deadline**: `4000ms` (`MEASUREMENT_ONLY_DEADLINE = 4000ms`)
- **Staging Operational Timeout**: `1500ms` (`STAGING_SHADOW_TIMEOUT_MS = 1500` mantido)
- **Stop Condition Disparada**: `NONE` (todos os 12 casos completados sem erro)
- **Modo de Concorrência**: Sequencial estrito (`concurrency = 1`), sem paralelismo ou filas.
- **Retry**: `0` (adapter retry = 0, observer retry = 0, composition retry = 0).
- **Evidência de Output Bruto**:
  - `RAW_RUNNER_OUTPUT_OBSERVED_DURING_006U`: `YES`
  - `STRUCTURED_RESULT_ARTIFACT`: `OBSERVED / VERSIONED`

---

## 5. Tabela de Evidência Observada por Caso

| Case ID | Classe | Caracteres | Despacho Observado | Resposta Observado | Elapsed Total (Observer) | Latência Adapter | Timeout (4000ms) | Teria Timeout sob 1500ms | Modelo Resolvido | Erro / Status |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| `case-lat-001` | SHORT | 30 | YES | YES | 450 ms | 448 ms | NO | NO | `jev-1.13.0` | NONE |
| `case-lat-002` | SHORT | 34 | YES | YES | 285 ms | 285 ms | NO | NO | `jev-1.13.0` | NONE |
| `case-lat-003` | SHORT | 36 | YES | YES | 257 ms | 257 ms | NO | NO | `jev-1.13.0` | NONE |
| `case-lat-004` | SHORT | 32 | YES | YES | 293 ms | 293 ms | NO | NO | `jev-1.13.0` | NONE |
| `case-lat-005` | MEDIUM | 110 | YES | YES | 273 ms | 273 ms | NO | NO | `jev-1.13.0` | NONE |
| `case-lat-006` | MEDIUM | 95 | YES | YES | 263 ms | 263 ms | NO | NO | `jev-1.13.0` | NONE |
| `case-lat-007` | MEDIUM | 107 | YES | YES | 294 ms | 293 ms | NO | NO | `jev-1.13.0` | NONE |
| `case-lat-008` | MEDIUM | 101 | YES | YES | 277 ms | 278 ms | NO | NO | `jev-1.13.0` | NONE |
| `case-lat-009` | LONGER | 259 | YES | YES | 257 ms | 257 ms | NO | NO | `jev-1.13.0` | NONE |
| `case-lat-010` | LONGER | 218 | YES | YES | 249 ms | 248 ms | NO | NO | `jev-1.13.0` | NONE |
| `case-lat-011` | LONGER | 221 | YES | YES | 311 ms | 311 ms | NO | NO | `jev-1.13.0` | NONE |
| `case-lat-012` | LONGER | 221 | YES | YES | 253 ms | 253 ms | NO | NO | `jev-1.13.0` | NONE |

*Nota de Privacidade*: Transcrições completas não são retidas neste documento nem no artefato JSON (`RAW_TRANSCRIPT_LOGGING = PROHIBITED`). Apenas metadados e contagens de caracteres são persistidos.

---

## 6. Métricas Agregadas Consolidadas

| Métrica | Valor Observado | Qualificação / Interpretação |
| :--- | :--- | :--- |
| `plannedCasesMax` | 12 | Teto aprovado no plano |
| `actualCasesStarted` | 12 | 100% dos casos planejados iniciados |
| `actualCasesCompleted` | 12 | 100% com resposta válida |
| `actualFetchDispatches` | 12 | Exatamente 1 despacho de rede por caso |
| `successfulProviderResponses` | 12 | Respostas parseadas com scores de probabilidade |
| `timeoutsUnderMeasurementDeadline (4000ms)` | 0 | Zero timeouts sob o deadline expandido |
| `wouldHaveTimedOutUnder1500Ms` | 0 | Nenhuma requisição excedeu 1500ms |
| `completionRateUnderMeasurementDeadline` | 100.0% | Taxa de sucesso sob 4000ms |
| `completionRateUnder1500Ms` | 100.0% | Taxa de sucesso sob o timeout nominal de 1500ms |
| `minLatencyMs` | 249 ms | Caso mais rápido (`case-lat-010`, LONGER) |
| `medianLatencyMs` | 275 ms | Indicador central da distribuição (amostra exploratória N=12) |
| `p90ExploratoryMs` | 311 ms | Indicador de cauda exploratório (amostra N=12; NÃO é SLA; NÃO é estimativa de cauda populacional) |
| `p95ExploratoryMs` | 450 ms | Indicador de cauda exploratório (amostra N=12; NÃO é SLA; NÃO é estimativa de cauda populacional) |
| `maxLatencyMs` | 450 ms | Primeira requisição (`case-lat-001`, SHORT; causa da maior latência = `NOT VERIFIED`) |
| `errorCount` | 0 | Zero erros HTTP, zero falhas de rede, zero erros de schema |

---

## 7. Análise de Dispersão e Sensibilidade ao Tamanho

- **SHORT (30 a 36 chars)**:
  - Latências: `450ms`, `285ms`, `257ms`, `293ms`.
  - `case-lat-001` foi a primeira e mais lenta requisição observada (450ms); a causa técnica da latência mais alta na primeira chamada permanece `NOT VERIFIED` (nenhuma atribuição causal a cold start ou handshake TLS foi comprovada separadamente).
- **MEDIUM (95 a 110 chars)**:
  - Latências: `273ms`, `263ms`, `294ms`, `277ms`.
  - Distribuição com variação estreita na amostra.
- **LONGER (218 a 259 chars)**:
  - Latências: `257ms`, `249ms`, `311ms`, `253ms`.
  - A requisição mais rápida observada (249ms) ocorreu nesta classe.
- **Qualificação Metodológica de Sensibilidade**:
  - A latência observada de composição end-to-end concentrou-se majoritariamente entre ~250ms e 300ms nesta amostra, com uma única observação de primeira chamada a 450ms.
  - Within this exploratory N=12 sample, no monotonic or obvious latency degradation with input length was observed across the tested 30-259 character range.
  - `NO_POPULATION_LENGTH_EFFECT_CLAIM`: `YES`.
  - `NO_STATISTICAL_CAUSAL_INFERENCE`: `YES`.

---

## 8. Decisão Humana de Timeout para Staging Sintético

Com base na autorização formal do operador humano:

- **Decisão Formal**: `STAGING_TIMEOUT_DECISION = KEEP_1500MS_FOR_STAGING_SYNTHETIC`.
- **Base Factual**:
  - 12 de 12 requisições completadas sob 1500ms (100.0%).
  - Mediana observada de 275ms, muito inferior ao teto de 1500ms.
  - Latência máxima observada de 450ms, bem abaixo do teto de 1500ms.
  - 0 timeouts observados neste experimento N=12.
- **Qualificações Obrigatórias**:
  - `EXPLORATORY_STAGING_DECISION`: Decisão exclusiva para ambiente staging-synthetic.
  - `NOT production SLA`: Não constitui SLA de produção.
  - `NOT customer traffic validation`: Não valida tráfego de clientes.
  - `NOT production timeout selection`: Não seleciona parâmetros operacionais de produção.
- **Status Operacional dos Parâmetros**:
  - `STAGING_SHADOW_TIMEOUT_MS`: `1500` (mantido).
  - `STAGING_TIMEOUT_RECALIBRATION`: `DECIDED_KEEP_1500MS_FOR_STAGING_SYNTHETIC`.
  - `PRODUCTION_JEV_TIMEOUT_MS`: `NOT SELECTED`.
  - `PRODUCTION_SHADOW_MAX_CONCURRENCY`: `NOT SELECTED`.
  - `PRODUCTION_RUNTIME_WIRING`: `NO`.
  - `SHADOW_LIVE_ENABLED`: `NO in nominal runtime`.
  - `ACTIVE_GUARDED`: `BLOCKED`.
  - `KNOWN_DETERMINISTIC_HANDLERS`: `0`.
  - `CUSTOMER_TRANSCRIPT_PROVIDER_PROCESSING_GATE`: `NOT CLEARED`.
  - `CUSTOMER_TRAFFIC`: `PROHIBITED`.

---

## 9. Conclusão & Próximos Passos Permitidos

- **Conclusão Factual**:
  1. 12/12 casos completados com sucesso nesta amostra sintética controlada de staging;
  2. Todos os tempos observados de conclusão ficaram abaixo de 1500ms;
  3. O timeout atual de staging-synthetic permanece em 1500ms (`KEEP_1500MS_FOR_STAGING_SYNTHETIC`);
  4. Nenhum claim de produção é derivado deste experimento.

- **Próximos Passos Permitidos**:
  - Manter `ACTIVE_GUARDED = BLOCKED` e runtime nominal com zero chamadas a provedores externos;
  - Derivar próximos passos a partir dos bloqueios remanescentes da Fase 6 (handlers determinísticos, governança de transcrições e gates de produção).
