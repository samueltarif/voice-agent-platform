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

*Comportamento Factual*: Todos os 4 casos foram roteados para o fallback generativo (comportamento fail-closed seguro). Nenhum sofreu bypass indevido.

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

*Nota Metodológica*: O recall determinístico no holdout (66.67%) foi inferior ao da calibração (92.86%), evidenciando que a conservadorismo da política congelada priorizou com sucesso zero falso bypass em detrimento do volume de bypasses convertidos.

---

## 8. Latência e Telemetria de Custo

- **Distribuição de Latência Atômica (`atomicLatencyMs`)** (N=40, descritivo, não constitui SLA):
  - Mínimo: **225 ms**
  - Mediana: **255 ms**
  - Máximo: **446 ms**
  - P95: **387 ms**
- **Uso de Tokens**:
  - Input Tokens: **25.178**
  - Output Tokens: **2.560**
- **Custo Estimado Baseado no Uso**: **$0.001057 USD** (estritamente abaixo do teto autorizado de $0.01 USD).
- **Reconciliação com Ledger Financeiro**: `NOT PERFORMED` (estimativa puramente algorítmica baseada nos tokens retornados pelo provedor).

---

## 9. Limitações e Próximos Passos

1. **Amostra Sintética**: O locked holdout de 40 casos é uma amostra sintética de validação. A integridade estatística comprovou que a política congelada não cometeu falsos bypasses nem perdas de segurança nessa amostra.
2. **Não Modificação Pós-Holdout**: Em respeito estrito às regras epistêmicas, nenhum threshold foi alterado após a observação destes resultados (`NO_POST_HOLDOUT_TUNING = YES`).
3. **Próximo Passo**: Avaliação por operador humano sobre se os resultados observados justificam avançar da pesquisa offline para um design de integração de runtime protegido por circuit breakers e autoridade determinística.
