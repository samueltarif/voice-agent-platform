# Phase 6: TypeSafe Jev Offline Candidate Policy Fitting and Freeze Report

- **Status**: CANDIDATE POLICY FROZEN BEFORE HOLDOUT
- **Data**: 2026-09-30
- **Branch**: `research/006l-jev-candidate-policy-fit`
- **Fonte de Dados Exclusiva**: `docs/research/results/phase-6-jev-calibration-v2-phase-a-run1.json`
- **SHA-256 do Artefato de Entrada**: `5355b3639f011c0812b5e370a3dc7675e89e8f077d82fb3595dafdef2f0a0565`
- **Artefato de Fitting**: `docs/research/results/phase-6-jev-candidate-policy-fit-v1.json`
- **Artefato de Política Congelada**: `docs/research/results/phase-6-jev-candidate-policy-frozen-v1.json`
- **SHA-256 da Política Congelada (`FROZEN_POLICY_SHA256`)**: `1ac0f2919ca73d22a39fb1d964b558ba2f7e395f336b2c3f687ced9ed4d53c93`
- **Política Congelada**: **SIM** (`POLICY_FROZEN = YES`)
- **Política Candidata Selecionada**: **SIM** (`CANDIDATE_POLICY_SELECTED = YES`)
- **Holdout Avaliado**: **NÃO** (`HOLDOUT_EVALUATED = NO`, `HOLDOUT_REQUESTS = 0`)

---

## 1. Governança e Blindagem Epistêmica

1. **Amostra de Calibração Exclusiva**: O fitting utilizou exclusivamente os 80 casos da partição `CALIBRATION` gravados no artefato de resultado da Fase A.
2. **Holdout Intocado**: O split `HOLDOUT` (40 casos) não foi aberto, lido, parseado nem avaliado (`HOLDOUT_PARSED = NO`, `HOLDOUT_REQUESTS = 0`, `HOLDOUT_METRICS = NOT COMPUTED`).
3. **Zero Chamadas a Provedores**: Nenhuma requisição a TypeSafe, OpenAI ou Twilio foi realizada neste slice (`OPENAI_CALLS = 0`, `JEV_CALLS = 0`, `TWILIO_CALLS = 0`).
4. **Zero Carregamento de `.env`**: Nenhum arquivo de ambiente foi carregado (`UNNECESSARY_ENV_RUNTIME_LOAD = NO`).
5. **Apenas Sinais Atômicos Noul**: O classificador Direct Choice foi utilizado apenas como baseline comparativo externo e não participou como feature de fitting.

---

## 2. Família da Política e Operadores

A **família da política** e seus operadores relacionais foram congelados antes da varredura de thresholds, seguindo uma estrutura determinística ordenada mínima (YAGNI):

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

## 5. Região Discreta Pesquisada e Sub-região Invariante Retangular

O processo identificou **66 triplas de thresholds equivalentes** no espaço discreto pesquisado que produzem exatamente a mesma matriz de confusão e assinaturas de classificação idênticas para todos os 80 casos.

### 5.1 Faixas Discretas Pesquisadas (`SEARCHED_EQUIVALENT_THRESHOLD_SET_BOUNDS`)

| Parâmetro | Mínimo Pesquisado | Máximo Pesquisado |
| :--- | :---: | :---: |
| `T_SECURITY` | `0.56` | `0.56` |
| `T_DETERMINISTIC` | `0.00` | `0.35` |
| `T_GENERATIVE` | `0.47` | `0.53` |

### 5.2 Sub-região Invariante Retangular Verificada (`VERIFIED_RECTANGULAR_INVARIANT_SUBREGION`)

A partir dos 80 casos de calibração, os intervalos observados que formam a sub-região invariante retangular verificada são:
- `T_SECURITY` ∈ `(0.31, 0.81]`
- `T_DETERMINISTIC` ∈ `[0.00, 0.36]`
- `T_GENERATIVE` ∈ `[0.44, 0.55)`

Every threshold triple inside this rectangular region preserves the observed 78/80 calibration signature. Não se afirma que este seja o conjunto de soluções contínuo completo sem prova exaustiva; a sub-região retangular acima é factual e formalmente verificada.

### 5.3 Auditoria de Redundância do Sinal Determinístico

- **`REDUNDANT_ON_CALIBRATION = YES`**: Como a região viável inclui `T_DETERMINISTIC = 0` e todos os 42 casos que não devem sofrer bypass possuem `generativeNoul >= 0.55 > T_GENERATIVE`, o sinal generativo sozinho foi suficiente para separar os 26 casos de bypass nos dados de calibração.
- **`NOT PROVEN REDUNDANT OUTSIDE CALIBRATION`**: Essa redundância empírica restringe-se à amostra de calibração e não há prova de que se manterá em dados não vistos.
- **`RETAINED_AS_FAIL_CLOSED_GUARD = YES`**: O guard `deterministicNoul >= T_DETERMINISTIC` é mantido ativado com threshold positivo (`0.35`). Como o falso bypass é o risco prioritário e todos os sinais atômicos chegam na mesma requisição, manter o guard determinístico atua como an additional conservative guard retained before holdout. Its incremental benefit outside the calibration sample is NOT ESTABLISHED.

---

## 6. Desempate Humano Conservador e Congelamento da Política

Entre as 66 triplas de calibração equivalentes, o operador humano aplicou a seguinte regra determinística de desempate pré-holdout:
1. **Maximizar `T_DETERMINISTIC`**: Torna o bypass mais restritivo contra entradas ambíguas (máximo observado: `0.35`, reduzindo candidatos de 66 para 3 triplas).
2. **Minimizar `T_GENERATIVE`**: Torna a condição de bypass mais exigente (mínimo observado: `0.47`, reduzindo candidatos de 3 para exatamente 1 tripla única).
3. **Maximizar Margem de Segurança**: `T_SECURITY = 0.56` possui margem balanceada de 0.25 para os limites observados (0.31 e 0.81).

### Tripla Exata Selecionada e Congelada

```text
T_SECURITY = 0.56
T_DETERMINISTIC = 0.35
T_GENERATIVE = 0.47
```

A tripla escolhida pertence literalmente ao conjunto das 66 melhores triplas pesquisadas e reproduz rigorosamente a assinatura de 78/80.

---

## 7. Matriz de Confusão e Métricas de Calibração (N=80)

| Métrica | Valor Observado | Denominador Explícito |
| :--- | :---: | :---: |
| **Acurácia Global de Roteamento** | **97.50%** | 78 / 80 |
| **Safe Bypasses (True Positives Determinísticos)** | **26** | 26 / 28 (92.86% Recall) |
| **False Bypasses** | **0** | 0 / 52 (0.00% sobre não-determinísticos) |
| **False Bypass entre Predições de Bypass** | **0.00%** | 0 / 26 (0 false bypasses observed in calibration) |
| **Precisão Determinística** | **100.00%** | 26 / 26 |
| **Security True Positives** | **12** | 12 / 12 (100.00% Recall) |
| **Security Misses** | **0** | 0 / 12 (0.00% taxa de perda) |
| **Escalonamentos de Segurança Desnecessários** | **0** | 0 / 68 (0.00%) |
| **Casos Não Convertidos (False Negatives)** | **2** | `v2-013` e `v2-027` |

- **Detalhamento dos Falsos Negativos (Fallback Generativo)**:
  - `v2-013`: Esperado determinístico, mas possui `generativeNoul = 0.61` (> 0.47).
  - `v2-027`: Esperado determinístico, mas possui `generativeNoul = 0.78` (> 0.47).
  - *Comportamento Factual*: `v2-013` e `v2-027` são calibration deterministic false negatives routed to `GENERATIVE_REQUIRED`. Isso representa comportamento fail-closed na amostra de calibração (não é declarado como guaranteed safe fora da amostra).

---

## 8. Análise de Margem e Estabilidade

| Dimensão | Limite da Classe | Limite da Classe Oposta | Margem de Separação | Observação Factual |
| :--- | :---: | :---: | :---: | :--- |
| **Segurança** (`T_SECURITY = 0.56`) | Min Security: `0.81` | Max Non-Security: `0.31` | **0.50** | Observed calibration separation of 0.50 between 0.31 and 0.81. |
| **Determinístico** (`T_DETERMINISTIC = 0.35`) | Min Det (26 passed): `0.36` | Max Non-Det: `0.74` | **0.01** | Filtrado conjuntamente pelo sinal generativo. |
| **Generativo** (`T_GENERATIVE = 0.47`) | Max Det (26 passed): `0.44` | Min Non-Det in bypass: `0.56` | **0.12** | Separação de 0.12 entre o maior determinístico aprovado (0.44) e não-determinísticos no bypass. |

---

## 9. Comparativo: Direct Choice V1 vs. Frozen Candidate Policy

| Métrica | Direct Choice V1 (Fase A) | Frozen Candidate Policy | Delta / Impacto |
| :--- | :---: | :---: | :---: |
| **Acurácia Global** | 76.25% (61/80) | **97.50%** (78/80) | +21.25 p.p. |
| **Precisão Determinística** | 61.54% (24/39) | **100.00%** (26/26) | +38.46 p.p. |
| **Recall Determinístico** | 85.71% (24/28) | **92.86%** (26/28) | +7.15 p.p. |
| **False Bypasses** | 15 / 52 (28.85%) | **0 / 52 (0.00%)** | 0 false bypasses observed in calibration |
| **False Bypass em Predições de Bypass** | 38.46% (15/39) | **0.00% (0/26)** | 0 false bypasses observed in the calibration sample (0/26 predicted bypasses) |
| **Security Misses Observados** | 0 / 12 (0.00%) | **0 / 12 (0.00%)** | Preservado em 0 |

---

## 10. Estimativa de Economia Contrafactual (Calibration-Only)

- **Taxa de Bypass Seguro na Calibração**: 26 / 80 = **32.50%**.
- **Requisições Contrafactuais ao Modelo Principal**: 54 / 80 (redução de 32.5% de chamadas ao modelo primário de voz).
- **Ressalva Metodológica Estrita**:
  > **CALIBRATION-ONLY COUNTERFACTUAL — NOT HOLDOUT RESULT — NOT PRODUCTION SAVINGS**
  > Esta economia é contrafactual estritamente para os 80 casos sintéticos de calibração. Ela não constitui garantia de desempenho no conjunto `HOLDOUT` e não deve ser extrapolada como taxa de economia de produção antes da homologação final.

---

## 11. Limitações e Regras Pós-Congelamento

1. **Autoridade de Roteamento**: O TypeSafe Jev atua estritamente como sinalizador consultivo auxiliar. O runtime determinístico da aplicação mantém controle e autoridade sobre a máquina de estados.
2. **Imutabilidade Pré-Holdout**: Com `POLICY_FROZEN = YES`, qualquer alteração em regras, operadores, question set ou thresholds **invalida** o split `LOCKED HOLDOUT — NOT USED FOR POLICY FITTING / THRESHOLD SELECTION`.
3. **Execução do Holdout**: A avaliação dos 40 casos `LOCKED HOLDOUT` (com `HOLDOUT_PARSED = NO`, `HOLDOUT_EVALUATED = NO` e `HOLDOUT_REQUESTS = 0` preservados durante o fitting) somente ocorrerá em novo slice dedicado após a revisão e merge formal do PR #36.
