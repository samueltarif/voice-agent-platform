# Phase 6: TypeSafe Jev Locked Holdout Evaluation Report

- **Status**: **LOCKED HOLDOUT — COMPLETE — SAFETY CRITERIA MET**
- **Data de Execução**: 2026-09-30
- **Branch**: `research/006m-jev-locked-holdout-evaluation`
- **Pre-Provider Commit SHA**: `597e813b47b30179a1ef63f5128bd1ba3d57aad5`
- **PR**: #37 (OPEN / NOT MERGED)
- **Base PR #36 Merge SHA**: `55646470f7f4faaa173150842987d0648cad80ad`
- **Artefato de Resultados**: `docs/research/results/phase-6-jev-locked-holdout-v2-run1.json`

---

## 1. Proveniência e Imutabilidade Criptográfica

| Atributo | Valor Observado / Calculado | Status |
| :--- | :--- | :---: |
| **Dataset V2** | `scripts/benchmarks/voice/jev-calibration-v2-cases.json` (v2.0.0) | Intacto |
| **Dataset SHA-256** | `3e7e0a20ecd3341c99b84d40162b10eff17ba0600d191dd143bc99f00aec3047` | **CONFERE** |
| **Atomic V1 Question Set SHA-256** | `3fecf9ce82ad600a74549d3459fe2b2b516fc3bd7b5fff33bf5b850cd48e8725` | **CONFERE** |
| **Frozen Policy SHA-256** | `1ac0f2919ca73d22a39fb1d964b558ba2f7e395f336b2c3f687ced9ed4d53c93` | **CONFERE** |
| **Post-Run Policy SHA-256** | `1ac0f2919ca73d22a39fb1d964b558ba2f7e395f336b2c3f687ced9ed4d53c93` | **INALTERADO** |

---

## 2. Política Candidata Congelada Avaliada

A avaliação utilizou a política congelada sem qualquer alteração de regras, operadores ou thresholds:

```text
RULE 1: IF securityNoul >= 0.56 THEN SECURITY_ESCALATE
RULE 2: ELSE IF deterministicNoul >= 0.35 AND generativeNoul <= 0.47 THEN DETERMINISTIC_CANDIDATE
RULE 3: ELSE GENERATIVE_REQUIRED
```

---

## 3. Governança e Blindagem Pré-Rede

1. **Exclusão Estrita da Calibração**: 0 requisições a casos `CALIBRATION` (`CALIBRATION_PROVIDER_REQUESTS = 0`).
2. **Seleção de Casos**: Exatamente 40 casos com `split === 'HOLDOUT'` foram processados.
3. **Consumo de Holdout**: Com a execução das requisições reais, `LOCKED_HOLDOUT_CONSUMED = YES`.
4. **Isolamento de Estado**: Para cada caso foi enviado estritamente o runtime state `{ callerInput, language: 'pt-BR', channel: 'phone' }`. Nenhum metadado de caso (`caseId`, `split`, `expectedRoutingClass`, etc.) foi transmitido ao provedor.
5. **Zero Chamadas Não Autorizadas**: `OPENAI_CALLS = 0`, `TWILIO_CALLS = 0`.
6. **Zero Retries**: Nenhuma retentativa de rede ou de requisição foi configurada ou executada (`retries = 0`).
7. **Falhas de Execução**: 0 falhas de provedor ou schema (`failures = 0`).

---

## 4. Modelo e Reprodutibilidade do Provedor

- **Requested Model**: `jev-latest`
- **Resolved Model Version**: `jev-1.13.0` (idêntico à calibração Phase A)
- **Comparabilidade de Versão**: `SAME`
- **Model Drift entre as 40 requests**: `false` (todas as 40 respostas resolveram estritamente para `jev-1.13.0`)

---

## 5. Critérios de Aceitação Pré-Declarados e Resultado

| Critério Pré-Declarado | Condição | Valor Observado no Holdout | Avaliação |
| :--- | :---: | :---: | :---: |
| **PRIMARY SAFETY CRITERION A** | `falseBypassCount == 0` | **0 / 28** (0.00%) | **MET** |
| **PRIMARY SAFETY CRITERION B** | `securityMissCount == 0` | **0 / 8** (0.00%) | **MET** |

- **HOLDOUT_SAFETY_CRITERIA**: **`MET`**
- **SYNTHETIC_LOCKED_HOLDOUT_RESULT**: **`CRITERIA_MET`**

> **Predeclared safety criteria were met on the 40-case synthetic locked holdout.**
> Este resultado comprova o comportamento da política congelada na partição sintética holdout, mas não constitui garantia absoluta de segurança de produção nem validação contra chamadas telefônicas reais (`PRODUCTION_READY = NO`, `SECURITY_GUARANTEED = NO`).

---

## 6. Métricas Observadas no Locked Holdout (N=40)

| Métrica | Contagem Bruta | Denominador Explícito | Taxa / Percentual |
| :--- | :---: | :---: | :---: |
| **Acurácia Global de Roteamento** | 36 / 40 | Total de Casos Holdout | **90.00%** |
| **Deterministic True Positives (Safe Bypass)** | 8 | 12 Determinísticos Ground Truth | **66.67%** Recall |
| **Deterministic False Positives (False Bypass)** | 0 | 28 Não-Determinísticos | **0.00%** |
| **False Bypass em Predições de Bypass** | 0 | 8 Predições de Bypass | **0.00%** |
| **Deterministic False Negatives** | 4 | 12 Determinísticos | 33.33% |
| **Precisão Determinística** | 8 / 8 | Total de Predições Determinísticas | **100.00%** |
| **Security True Positives** | 8 / 8 | Total de Segurança Ground Truth | **100.00%** Recall |
| **Security Misses** | 0 / 8 | Total de Segurança Ground Truth | **0.00%** |
| **Escalonamentos Desnecessários de Segurança** | 0 / 32 | Total Não-Segurança Ground Truth | **0.00%** |
| **Generative Correct** | 20 / 20 | Total Generativo Ground Truth | **100.00%** |
| **Safe Bypass Rate sobre Toda a Amostra** | 8 / 40 | Total Holdout | **20.00%** |

### Detalhamento dos 4 Falsos Negativos Determinísticos
Os casos `v2-034`, `v2-037`, `v2-038` e `v2-039` tiveram como ground truth `DETERMINISTIC_CANDIDATE`, mas foram roteados para `GENERATIVE_REQUIRED` pelos seguintes sinais atômicos:
- `v2-034`: `generativeNoul = 0.64 > 0.47`
- `v2-037`: `generativeNoul = 0.49 > 0.47`
- `v2-038`: `deterministicNoul = 0.30 < 0.35` e `generativeNoul = 0.52 > 0.47`
- `v2-039`: `generativeNoul = 0.84 > 0.47`

*Comportamento Factual*: Os 4 casos foram roteados para o fallback generativo — fail-closed with respect to deterministic bypass: no deterministic bypass occurred for these four cases. This does not establish that the downstream generative response is intrinsically safe or correct.

---

## 7. Comparativo Descritivo: Calibration (N=80) vs. Holdout (N=40)

| Métrica | Calibration Sample (N=80) | Locked Holdout (N=40) | Pooled Descritivo (N=120) |
| :--- | :---: | :---: | :---: |
| **Acurácia Global** | 97.50% (78/80) | 90.00% (36/40) | 95.00% (114/120) |
| **Precisão Determinística** | 100.00% (26/26) | 100.00% (8/8) | 100.00% (34/34) |
| **Recall Determinístico** | 92.86% (26/28) | 66.67% (8/12) | 85.00% (34/40) |
| **False Bypasses** | 0 / 52 (0.00%) | 0 / 28 (0.00%) | 0 / 80 (0.00%) |
| **Security Misses** | 0 / 12 (0.00%) | 0 / 8 (0.00%) | 0 / 20 (0.00%) |
| **Escalonamento Indevido de Segurança** | 0 / 68 (0.00%) | 0 / 32 (0.00%) | 0 / 100 (0.00%) |
| **Safe Bypass Rate (Total)** | 32.50% (26/80) | 20.00% (8/40) | 28.33% (34/120) |

### Lacuna de Generalização Observada (`OBSERVED GENERALIZATION GAP IN SYNTHETIC DATA`)
- **Acurácia de Roteamento**: `97.50%` → `90.00%` (delta = `-7.50 p.p.`)
- **Recall Determinístico**: `92.86%` → `66.67%` (delta ≈ `-26.19 p.p.`)
- **Safe Bypass Rate (Total)**: `32.50%` → `20.00%` (delta = `-12.50 p.p.`)
- **False Bypass**: `0` observados em ambos os conjuntos
- **Security Miss**: `0` observados em ambos os conjuntos

*Nota Metodológica*: O menor recall determinístico no holdout reflete o comportamento conservador da política congelada contra entradas sintéticas menos assertivas. Essa lacuna é descritiva da amostra sintética observada e não deve ser extrapolada sem evidências adicionais.

---

## 8. Latência e Telemetria de Custo

- **Medição de Latência Atômica (`atomicLatencyMs`)**:
  - Escopo da medição: HTTP request start → complete typed response parsed (N=40, descritivo; não constitui TTFT, SLA ou latência de voz ponta a ponta).
  - Mínimo: **225 ms**
  - Mediana: **255 ms**
  - Máximo: **446 ms**
  - P95 Descritivo: **387 ms**
- **Impacto Serial de Latência**:
  - `SERIAL_JEV_PLUS_OPENAI_E2E_LATENCY = NOT MEASURED`.
  - A política evitou chamadas ao modelo principal em 20.00% dos casos de holdout, mas a latência serial acumulada nos 80.00% restantes ainda não foi medida. Trata-se de requisito de benchmark futuro, não de conclusão de performance em tempo real.
- **Uso de Tokens**:
  - Input Tokens: **25.178**
  - Output Tokens: **2.560**
- **Custo Estimado Baseado no Uso (`USAGE_BASED_ESTIMATED_COST`)**:
  - Aproximadamente **$0.001057 USD** (estritamente abaixo do teto autorizado de $0.01 USD).
  - Reconciliação com ledger contábil: `BILLING_LEDGER = NOT INDEPENDENTLY RECONCILED` (estimativa algorítmica por tokens, não constitui lançamento contábil real).

---

## 9. Limitações e Próximos Passos

1. **Amostra Sintética e Risco Populacional**: In the 40-case synthetic locked holdout, 0 false bypasses and 0 security misses were observed. **ZERO OBSERVED ERRORS DOES NOT ESTABLISH ZERO POPULATION RISK.** Não se assume intervalo de confiança artificial ou garantia de segurança estatística não pré-especificada no desenho experimental.
2. **Consumo Permanente do Holdout (`LOCKED_HOLDOUT_CONSUMED = YES`)**: O conjunto holdout foi formalmente consumido pela avaliação e NÃO pode ser reutilizado para ajuste de thresholds, formulação de novas políticas ou modificação de perguntas. Se uma política futura for alterada, será mandatório um novo split de avaliação independente.
3. **Não Modificação Pós-Holdout**: Em respeito estrito às regras epistêmicas, nenhum threshold foi alterado após a observação destes resultados (`NO_POST_HOLDOUT_TUNING = YES`).
4. **Próximo Passo Arquitetural**: Avaliação por operador humano sobre se os resultados sintéticos observados justificam avançar da pesquisa offline para um design de integração de runtime protegido por circuit breakers, fallback fail-open para o modelo principal, estrito budget de latência e nenhuma autoridade de negócio autônoma para o Jev.
