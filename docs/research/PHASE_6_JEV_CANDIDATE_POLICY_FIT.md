# Phase 6: TypeSafe Jev Offline Candidate Policy Fitting Report

- **Status**: CALIBRATION CANDIDATE REGION FOUND (POLICY NOT FROZEN)
- **Data**: 2026-09-30
- **Branch**: `research/006l-jev-candidate-policy-fit`
- **Fonte de Dados Exclusiva**: `docs/research/results/phase-6-jev-calibration-v2-phase-a-run1.json`
- **SHA-256 do Artefato de Entrada**: `5355b3639f011c0812b5e370a3dc7675e89e8f077d82fb3595dafdef2f0a0565`
- **Resultados de Fitting Salvos em**: `docs/research/results/phase-6-jev-candidate-policy-fit-v1.json`
- **Política Congelada**: **NÃO** (`POLICY_FROZEN = NO`)
- **Política Candidata Selecionada**: **NÃO** (`CANDIDATE_POLICY_SELECTED = NO`)
- **Holdout Avaliado**: **NÃO** (`HOLDOUT_EVALUATED = NO`)

---

## 1. Governança e Blindagem Epistêmica

1. **Amostra de Calibração Exclusiva**: O fitting utilizou exclusivamente os 80 casos da partição `CALIBRATION` gravados no artefato de resultado da Fase A.
2. **Holdout Intocado**: O split `HOLDOUT` (40 casos) não foi aberto, lido, parseado nem avaliado (`HOLDOUT_FILES_PARSED_FOR_POLICY_FIT = NO`, `HOLDOUT_REQUESTS = 0`, `HOLDOUT_METRICS = NOT COMPUTED`).
3. **Zero Chamadas a Provedores**: Nenhuma requisição a TypeSafe, OpenAI ou Twilio foi realizada neste slice (`OPENAI_CALLS = 0`, `JEV_CALLS = 0`, `TWILIO_CALLS = 0`).
4. **Zero Carregamento de `.env`**: Nenhum arquivo de ambiente foi carregado (`UNNECESSARY_ENV_RUNTIME_LOAD = NO`).
5. **Apenas Sinais Atômicos Noul**: O classificador Direct Choice foi utilizado apenas como baseline comparativo externo e não participou como feature de fitting.

---

## 2. Família da Política Candidata

A política candidata foi congelada antes da varredura de thresholds, seguindo uma estrutura determinística ordenada mínima (YAGNI):

```text
RULE 1 (Segurança Prioritária):
IF securityNoul >= T_SECURITY
THEN SECURITY_ESCALATE

RULE 2 (Bypass Determinístico):
ELSE IF deterministicNoul >= T_DETERMINISTIC AND generativeNoul <= T_GENERATIVE
THEN DETERMINISTIC_CANDIDATE

RULE 3 (Fallback Generativo):
ELSE
GENERATIVE_REQUIRED
```

Operadores relacionais estritamente congelados:
- `securityNoul >= T_SECURITY`
- `deterministicNoul >= T_DETERMINISTIC`
- `generativeNoul <= T_GENERATIVE`

Nenhum modelo de Machine Learning, pesos arbitrários, combinações lineares ou regras especiais por `caseId` foram introduzidos.

---

## 3. Espaço de Busca e Geração de Thresholds

Os thresholds candidatos foram gerados deterministicamente a partir dos valores únicos observados nos 80 casos de calibração, evitando grids arbitrários (como passos fixos de 0.05 ou 0.1):

- Valores únicos ordenados por sinal.
- Ponto médio (`midpoint`) exato entre valores adjacentes.
- Fronteiras de domínio `0.0` e `1.0`.

| Sinal | Valores Únicos Observados | Candidatos a Threshold | Total de Combinações |
| :--- | :---: | :---: | :---: |
| `securityNoul` (`T_SECURITY`) | 24 | 25 | - |
| `deterministicNoul` (`T_DETERMINISTIC`) | 55 | 56 | - |
| `generativeNoul` (`T_GENERATIVE`) | 44 | 45 | - |
| **Total de Triplas Avaliadas** | - | - | **63.000** |

---

## 4. Restrições de Viabilidade e Critérios de Otimização

### 4.1 Restrições Primárias de Viabilidade (Feasibility)
Uma tripla de thresholds só é classificada como **FEASIBLE** se satisfizer simultaneamente:
1. `falseBypassCount == 0` (zero falsos bypasses determinísticos na calibração).
2. `securityMissCount == 0` (zero perdas de turnos de segurança na calibração).

- Total de políticas viáveis encontradas: **29.301** (de 63.000 avaliadas).

### 4.2 Ordem de Otimização Estrita
Entre as políticas viáveis:
1. **Primário**: Maximizar `safeBypassCount` (maior economia segura).
2. **Secundário**: Minimizar `unnecessarySecurityEscalationCount` (menor sobre-escalonamento desnecessário).
3. **Terciário**: Maximizar `routingAccuracy` (acurácia global de classificação).

---

## 5. Região de Predição Candidata Encontrada (`REGION-CALIB-FEASIBLE-01`)

O processo identificou **66 triplas de thresholds equivalentes** que produzem exatamente a mesma matriz de confusão e assinaturas de classificação idênticas para todos os 80 casos. Nenhuma tripla individual foi escolhida arbitrariamente; em vez disso, a região foi agrupada formalmente:

### 5.1 Faixas de Thresholds da Região

| Parâmetro | Mínimo | Máximo | Ponto Médio Representativo |
| :--- | :---: | :---: | :---: |
| `T_SECURITY` | `0.56` | `0.56` | `0.56` |
| `T_DETERMINISTIC` | `0.00` | `0.35` | `0.185` |
| `T_GENERATIVE` | `0.47` | `0.53` | `0.47` |

### 5.2 Matriz de Confusão e Métricas (N=80)

| Métrica | Valor Observado | Denominador Explícito |
| :--- | :---: | :---: |
| **Acurácia Global de Roteamento** | **97.50%** | 78 / 80 |
| **Safe Bypasses (True Positives Determinísticos)** | **26** | 26 / 28 (92.86% Recall) |
| **False Bypasses** | **0** | 0 / 52 (0.00% sobre não-determinísticos) |
| **False Bypass entre Predições de Bypass** | **0.00%** | 0 / 26 |
| **Precisão Determinística** | **100.00%** | 26 / 26 |
| **Security True Positives** | **12** | 12 / 12 (100.00% Recall) |
| **Security Misses** | **0** | 0 / 12 (0.00% taxa de perda) |
| **Escalonamentos de Segurança Desnecessários** | **0** | 0 / 68 (0.00%) |
| **Casos Não Convertidos (False Negatives)** | **2** | `v2-013` e `v2-027` |

- **Detalhamento dos Falsos Negativos**:
  - `v2-013`: Esperado determinístico, mas possui `generativeNoul = 0.61` (> 0.53). Roteado com segurança para o modelo conversacional.
  - `v2-027`: Esperado determinístico, mas possui `generativeNoul = 0.78` (> 0.53). Roteado com segurança para o modelo conversacional.
  - Em ambos os casos, a política falhou de forma segura (fail-safe), sem expor a aplicação a respostas incorretas ou bypass indevido.

---

## 6. Análise de Margem e Estabilidade

| Dimensão | Limite da Classe | Limite da Classe Oposta | Margem de Separação | Avaliação |
| :--- | :---: | :---: | :---: | :--- |
| **Segurança** (`T_SECURITY`) | Min Security: `0.81` | Max Non-Security: `0.31` | **0.50** | Margem ampla e extremamente robusta entre 0.31 e 0.81. |
| **Determinístico** (`T_DETERMINISTIC`) | Min Det (26 passed): `0.36` | Max Non-Det: `0.74` | N/A | Filtrado conjuntamente pelo sinal generativo. |
| **Generativo** (`T_GENERATIVE`) | Max Det (26 passed): `0.44` | Min Non-Det in bypass: `0.56` | **0.12** | Separação líquida de 0.12 entre o maior determinístico aprovado (0.44) e não-determinísticos. |

---

## 7. Comparativo: Direct Choice V1 vs. Candidate Atomic Policy

| Métrica | Direct Choice V1 (Fase A) | Candidate Atomic Policy (Região 01) | Delta / Impacto |
| :--- | :---: | :---: | :---: |
| **Acurácia Global** | 76.25% (61/80) | **97.50%** (78/80) | +21.25 p.p. |
| **Precisão Determinística** | 61.54% (24/39) | **100.00%** (26/26) | +38.46 p.p. |
| **Recall Determinístico** | 85.71% (24/28) | **92.86%** (26/28) | +7.15 p.p. |
| **False Bypasses** | 15 / 52 (28.85%) | **0 / 52 (0.00%)** | **Eliminação total na calibração** |
| **False Bypass em Predições de Bypass** | 38.46% (15/39) | **0.00% (0/26)** | Confiabilidade de execução garantida |
| **Security Misses Observados** | 0 / 12 (0.00%) | **0 / 12 (0.00%)** | Preservado em 0 |

---

## 8. Estimativa de Economia Contrafactual (Calibration-Only)

- **Taxa de Bypass Seguro na Calibração**: 26 / 80 = **32.50%**.
- **Requisições Contrafactuais ao Modelo Principal**: 54 / 80 (redução de 32.5% de chamadas ao modelo primário de voz).
- **Ressalva Metodológica Estrita**:
  > **CALIBRATION-ONLY COUNTERFACTUAL — NOT HOLDOUT RESULT — NOT PRODUCTION SAVINGS**
  > Esta economia é contrafactual estritamente para os 80 casos sintéticos de calibração. Ela não constitui garantia de desempenho no conjunto `HOLDOUT` e não deve ser extrapolada como taxa de economia de produção antes da homologação final.

---

## 9. Limitações e Próximos Passos

1. **Autoridade de Roteamento**: O TypeSafe Jev atua estritamente como sinalizador consultivo auxiliar. O runtime determinístico da aplicação mantém controle e autoridade sobre a máquina de estados.
2. **Nenhuma Política Congelada Automaticamente**: A região candidata `REGION-CALIB-FEASIBLE-01` é recomendada para análise e aprovação humana. Nenhuma política será congelada sem confirmação explícita do operador humano.
3. **Holdout Lock**: A avaliação sobre o split de 40 casos `HOLDOUT` só poderá ser executada após o congelamento formal e imutável de uma única política candidata.
